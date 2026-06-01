/**
 * GET /api/tushare/cashflow-quality?tsCode=600519.SH[&periods=4][&refresh=1]
 *
 * 现金流质量专项接口：返回最新期的现金流质量指标及风险预警。
 * 默认返回最近 4 期（适合展示趋势）。
 *
 * 与 cashflow-summary 的区别：
 *   cashflow-summary → 通用摘要，默认 8 期
 *   cashflow-quality → 质量分析视角，默认 4 期，含 riskWarnings
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { getCashflowSummary, clearCashflowCache } from "@/lib/financialService";
import type { CashflowSummaryItem } from "@/lib/financialService";

export const dynamic = "force-dynamic";

/** 计算风险预警（服务端生成，前端也可重算） */
function computeRiskWarnings(items: CashflowSummaryItem[]): string[] {
  if (items.length === 0) return [];
  const latest = items[0];
  const warnings: string[] = [];

  const { operatingCashflow, netProfit, operatingCashflowToNetProfit,
          freeCashflow, financingCashflow, cashReceivedFromSales, revenue } = latest;

  // 1. 经营现金流 < 0
  if (operatingCashflow != null && operatingCashflow < 0) {
    warnings.push("经营现金流为负，需关注主营业务现金回款能力。");
  }

  // 2. 净利润为正但经营现金流为负
  if (netProfit != null && netProfit > 0 && operatingCashflow != null && operatingCashflow < 0) {
    warnings.push("净利润为正但经营现金流为负，利润质量偏弱。");
  }

  // 3. 经营现金流 / 净利润 < 0.5
  if (operatingCashflowToNetProfit != null && netProfit != null && netProfit > 0
      && operatingCashflowToNetProfit < 0.5) {
    warnings.push("经营现金流覆盖净利润不足（<0.5x），利润含金量偏低。");
  }

  // 4. 自由现金流连续为负（近 2 期均 < 0）
  const fcfValues = items.slice(0, 4).map(it => it.freeCashflow).filter(v => v != null) as number[];
  if (fcfValues.length >= 2 && fcfValues.slice(0, 2).every(v => v < 0)) {
    warnings.push("自由现金流持续为负，需关注资本开支压力。");
  }

  // 5. 筹资现金流长期为正且经营现金流较弱
  const finValues  = items.slice(0, 4).map(it => it.financingCashflow).filter(v => v != null) as number[];
  const operValues = items.slice(0, 4).map(it => it.operatingCashflow).filter(v => v != null) as number[];
  if (financingCashflow != null && financingCashflow > 0
      && finValues.length >= 2 && finValues.slice(0, 2).every(v => v > 0)
      && operValues.length >= 1 && operValues[0] != null) {
    const avgOper = operValues.reduce((a, b) => a + b, 0) / operValues.length;
    const avgFin  = finValues.reduce((a, b) => a + b, 0) / finValues.length;
    if (avgFin > Math.abs(avgOper) * 0.5) {
      warnings.push("连续多期筹资现金流为正且规模较大，可能依赖外部融资维持现金流。");
    }
  }

  // 6. 销售商品收到的现金 / 营业收入 < 0.8
  if (cashReceivedFromSales != null && revenue != null && revenue > 0) {
    const ratio = cashReceivedFromSales / revenue;
    if (ratio < 0.8) {
      warnings.push(`销售回款率偏低（${(ratio * 100).toFixed(1)}%），销售回款质量偏弱。`);
    }
  }

  return warnings;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tsCode  = searchParams.get("tsCode")?.trim() ?? "";
  const periods = Math.min(Math.max(parseInt(searchParams.get("periods") ?? "4", 10) || 4, 1), 20);
  const refresh = searchParams.get("refresh") === "1" || searchParams.get("refresh") === "true";

  if (!tsCode) {
    return NextResponse.json(
      { ok: false, error: "缺少 tsCode 参数，示例：?tsCode=600519.SH" },
      { status: 400 },
    );
  }

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
