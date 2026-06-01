/**
 * GET /api/stocks/[symbol]/valuation/percentile[?refresh=1]
 *
 * 返回 PE / PB 历史分位（3 年历史数据计算）。
 * 分位值 0~1，如 0.25 = 25%（低估），0.8 = 80%（高估）。
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { getValuationSummary, clearValuationCache } from "@/lib/valuationService";

export const dynamic = "force-dynamic";

function symbolToTsCode(symbol: string): string {
  if (symbol.startsWith("6"))                            return `${symbol}.SH`;
  if (symbol.startsWith("0") || symbol.startsWith("3")) return `${symbol}.SZ`;
  if (symbol.startsWith("8") || symbol.startsWith("4")) return `${symbol}.BJ`;
  return `${symbol}.SH`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  if (!/^\d{6}$/.test(symbol)) {
    return NextResponse.json({ ok: false, error: "symbol 必须是 6 位 A 股代码" }, { status: 400 });
  }

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const tsCode  = symbolToTsCode(symbol);
  if (refresh) clearValuationCache(tsCode);

  const result = await getValuationSummary(tsCode, refresh);

  return NextResponse.json({
    ok:             result.ok,
    tsCode,
    symbol,
    pePercentile:   result.item?.pePercentile ?? null,
    pbPercentile:   result.item?.pbPercentile ?? null,
    percentileNote: result.item?.percentileNote ?? null,
    tradeDate:      result.item?.tradeDate ?? null,
    fromCache:      result.fromCache ?? false,
    error:          result.error,
    updatedAt:      result.updatedAt,
  });
}
