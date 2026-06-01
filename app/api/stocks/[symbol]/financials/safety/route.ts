/**
 * GET /api/stocks/[symbol]/financials/safety[?periods=8][&refresh=1]
 *
 * 按 symbol（6位数字）查询财务安全摘要。
 * 自动将 symbol 转换为 Tushare ts_code：
 *   6xx → 600519.SH
 *   0xx / 3xx → 000001.SZ
 *   8xx / 4xx → 831568.BJ
 *
 * 代理自 /api/tushare/financial-safety，屏蔽 Tushare 细节。
 */
import { NextRequest, NextResponse } from "next/server";
import { getFinancialSafetySummary, clearSafetyCache } from "@/lib/financialService";

export const dynamic = "force-dynamic";

function symbolToTsCode(symbol: string): string {
  if (symbol.startsWith("6"))                              return `${symbol}.SH`;
  if (symbol.startsWith("0") || symbol.startsWith("3"))   return `${symbol}.SZ`;
  if (symbol.startsWith("8") || symbol.startsWith("4"))   return `${symbol}.BJ`;
  return `${symbol}.SH`;
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
  if (refresh) clearSafetyCache(tsCode);

  const result = await getFinancialSafetySummary(tsCode, periods, refresh);

  return NextResponse.json({
    ok:                  result.ok,
    tsCode:              result.tsCode,
    symbol:              result.symbol,
    items:               result.items,
    total:               result.items.length,
    balanceSheetStatus:  result.balanceSheetStatus,
    finaIndicatorStatus: result.finaIndicatorStatus,
    incomeStatus:        result.incomeStatus,
    fromCache:           result.fromCache ?? false,
    error:               result.error,
    updatedAt:           result.updatedAt,
  });
}
