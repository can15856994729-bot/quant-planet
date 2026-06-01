/**
 * GET /api/stocks/[symbol]/valuation/history[?years=3][&refresh=1]
 *
 * 返回历史 daily_basic 记录（PE/PB/PS/市值/换手率），用于前端绘图。
 * 默认返回近 3 年数据，最多 5 年。
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { getValuationHistory } from "@/lib/valuationService";
import { daysAgoStr, todayStr } from "@/lib/tushareService";

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

  const years = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("years") ?? "3", 10) || 3, 1), 5);
  const tsCode    = symbolToTsCode(symbol);
  const startDate = daysAgoStr(years * 365 + 30);
  const endDate   = todayStr();

  const res = await getValuationHistory(tsCode, startDate, endDate);

  // Sort ascending for chart rendering
  const records = [...res.records].sort((a, b) =>
    String(a.trade_date ?? "").localeCompare(String(b.trade_date ?? ""))
  );

  return NextResponse.json({
    ok:      res.status !== "error",
    tsCode,
    symbol,
    years,
    records,
    total:   records.length,
    status:  res.status,
    error:   res.error,
  });
}
