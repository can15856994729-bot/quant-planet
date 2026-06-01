/**
 * GET /api/stocks/[symbol]/financials/cashflow[?periods=8][&refresh=1]
 *
 * 按 symbol（6位数字）查询现金流量摘要 + 质量指标。
 * 自动将 symbol 转换为 Tushare ts_code：
 *   6xx → 600519.SH
 *   0xx / 3xx → 000001.SZ
 *   8xx / 4xx → 831568.BJ
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { getCashflowSummary, clearCashflowCache } from "@/lib/financialService";
import type { CashflowSummaryItem } from "@/lib/financialService";

export const dynamic = "force-dynamic";

function symbolToTsCode(symbol: string): string {
  if (symbol.startsWith("6"))                              return `${symbol}.SH`;
  if (symbol.startsWith("0") || symbol.startsWith("3"))   return `${symbol}.SZ`;
  if (symbol.startsWith("8") || symbol.startsWith("4"))   return `${symbol}.BJ`;
  return `${symbol}.SH`;
}

function computeRiskWarnings(items: CashflowSummaryItem[]): string[] {
  if (items.length === 0) return [];
  const latest = items[0];
  const warnings: string[] = [];
  const { operatingCashflow, netProfit, operatingCashflowToNetProfit,
          freeCashflow, financingCashflow, cashReceivedFromSales, revenue } = latest;

  if (operatingCashflow != null && operatingCashflow < 0)
    warnings.push("经营现金流为负，需关注主营业务现金回款能力。");

  if (netProfit != null && netProfit > 0 && operatingCashflow != null && operatingCashflow < 0)
    warnings.push("净利润为正但经营现金流为负，利润质量偏弱。");

  if (operatingCashflowToNetProfit != null && netProfit != null && netProfit > 0
      && operatingCashflowToNetProfit < 0.5)
    warnings.push("经营现金流覆盖净利润不足（<0.5x），利润含金量偏低。");

  const fcfValues = items.slice(0, 4).map(it => it.freeCashflow).filter(v => v != null) as number[];
  if (fcfValues.length >= 2 && fcfValues.slice(0, 2).every(v => v < 0))
    warnings.push("自由现金流持续为负，需关注资本开支压力。");

  const finValues  = items.slice(0, 4).map(it => it.financingCashflow).filter(v => v != null) as number[];
  const operValues = items.slice(0, 4).map(it => it.operatingCashflow).filter(v => v != null) as number[];
  if (financingCashflow != null && financingCashflow > 0
      && finValues.length >= 2 && finValues.slice(0, 2).every(v => v > 0)
      && operValues.length >= 1) {
    const avgOper = operValues.reduce((a, b) => a + b, 0) / operValues.length;
    const avgFin  = finValues.reduce((a, b) => a + b, 0) / finValues.length;
    if (avgFin > Math.abs(avgOper) * 0.5)
      warnings.push("连续多期筹资现金流为正且规模较大，可能依赖外部融资维持现金流。");
  }

  if (cashReceivedFromSales != null && revenue != null && revenue > 0) {
    const ratio = cashReceivedFromSales / revenue;
    if (ratio < 0.8)
      warnings.push(`销售回款率偏低（${(ratio * 100).toFixed(1)}%），销售回款质量偏弱。`);
  }

  return warnings;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const { searchParams } = req.nextUrl;
  const periods = Math.min(Math.max(parseInt(searchParams.get("periods") ?? "8", 10) || 8, 1), 20);
  const refresh = searchParams.get("refresh") === "1" || searchParams.get("refresh") === "true";

  if (!/^\d{6}$/.test(symbol)) {
    return NextResponse.json(
      { ok: false, error: "symbol 必须是 6 位 A 股代码" },
      { status: 400 },
    );
  }

  const tsCode = symbolToTsCode(symbol);
  if (refresh) clearCashflowCache(tsCode);

  const result = await getCashflowSummary(tsCode, periods, refresh);
  const riskWarnings = result.ok ? computeRiskWarnings(result.items) : [];

  return NextResponse.json({
    ok:             result.ok,
    tsCode:         result.tsCode,
    symbol:         result.symbol,
    items:          result.items,
    total:          result.items.length,
    riskWarnings,
    cashflowStatus: result.cashflowStatus,
    incomeStatus:   result.incomeStatus,
    fromCache:      result.fromCache ?? false,
    error:          result.error,
    updatedAt:      result.updatedAt,
  });
}
