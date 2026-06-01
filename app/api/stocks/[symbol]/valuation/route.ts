/**
 * GET /api/stocks/[symbol]/valuation[?refresh=1]
 *
 * 返回 A 股股票的完整估值摘要：
 *   PE / PB / PS / PEG / 总市值 / 流通市值
 *   PE分位 / PB分位 / 股息率 / 换手率 / 量比
 *   估值风险提示（riskWarnings）
 *
 * 自动将 symbol 转换为 Tushare ts_code：
 *   6xx → .SH   0xx/3xx → .SZ   8xx/4xx → .BJ
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { getValuationSummary, clearValuationCache } from "@/lib/valuationService";
import type { ValuationSummaryItem } from "@/lib/valuationService";

export const dynamic = "force-dynamic";

function symbolToTsCode(symbol: string): string {
  if (symbol.startsWith("6"))                            return `${symbol}.SH`;
  if (symbol.startsWith("0") || symbol.startsWith("3")) return `${symbol}.SZ`;
  if (symbol.startsWith("8") || symbol.startsWith("4")) return `${symbol}.BJ`;
  return `${symbol}.SH`;
}

function computeRiskWarnings(item: ValuationSummaryItem): string[] {
  const warnings: string[] = [];
  const { pePercentile, pbPercentile, peg, dividendYield, turnoverRate, volumeRatio } = item;

  if (pePercentile != null) {
    if (pePercentile > 0.80) warnings.push("市盈率处于历史高位（分位 >80%），估值偏高。");
    else if (pePercentile < 0.20) warnings.push("市盈率处于历史低位（分位 <20%），估值偏低。");
  }
  if (pbPercentile != null) {
    if (pbPercentile > 0.80) warnings.push("市净率处于历史高位（分位 >80%），估值偏高。");
    else if (pbPercentile < 0.20) warnings.push("市净率处于历史低位（分位 <20%）。");
  }
  if (peg != null) {
    if (peg > 2) warnings.push(`PEG=${peg.toFixed(2)}，偏高，成长性可能难以支撑当前估值。`);
    else if (peg < 1) warnings.push(`PEG=${peg.toFixed(2)}，较低，估值与成长匹配度较好。`);
  }
  if (dividendYield != null && dividendYield > 3) {
    warnings.push(`股息率 ${dividendYield.toFixed(2)}%，较高，具备一定分红吸引力。`);
  }
  if (volumeRatio != null && volumeRatio > 2) {
    warnings.push(`量比 ${volumeRatio.toFixed(2)}，明显放大，短期交易活跃。`);
  }
  if (turnoverRate != null && turnoverRate > 10) {
    warnings.push(`换手率 ${turnoverRate.toFixed(2)}%，偏高，短期波动可能加大。`);
  }

  return warnings;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!/^\d{6}$/.test(symbol)) {
    return NextResponse.json({ ok: false, error: "symbol 必须是 6 位 A 股代码" }, { status: 400 });
  }

  const tsCode = symbolToTsCode(symbol);
  if (refresh) clearValuationCache(tsCode);

  const result = await getValuationSummary(tsCode, refresh);
  const riskWarnings = result.ok && result.item ? computeRiskWarnings(result.item) : [];

  return NextResponse.json({
    ok:                  result.ok,
    tsCode:              result.tsCode,
    symbol:              result.symbol,
    item:                result.item,
    riskWarnings,
    dailyBasicStatus:    result.dailyBasicStatus,
    finaIndicatorStatus: result.finaIndicatorStatus,
    fromCache:           result.fromCache ?? false,
    error:               result.error,
    updatedAt:           result.updatedAt,
  });
}
