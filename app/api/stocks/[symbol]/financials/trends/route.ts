/**
 * GET /api/stocks/[symbol]/financials/trends[?periods=4][&refresh=1]
 *
 * 返回 A 股财报趋势数据（自动将 symbol 6位代码转换为 Tushare ts_code）。
 * 升序返回最近 periods 期（营收 / 净利润 / 扣非 / ROE / 毛利率 / 经营CF / 资负率）。
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { getFinancialTrendSummary, clearTrendCache } from "@/lib/financialService";

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
    return NextResponse.json(
      { ok: false, error: "symbol 必须是 6 位 A 股代码" },
      { status: 400 },
    );
  }

  const periods = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("periods") ?? "4", 10) || 4, 2),
    8,
  );
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const tsCode  = symbolToTsCode(symbol);

  if (refresh) clearTrendCache(tsCode);

  const result = await getFinancialTrendSummary(tsCode, periods, refresh);
  return NextResponse.json({ ...result, symbol, tsCode });
}
