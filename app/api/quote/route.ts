/**
 * GET /api/quote?symbol=AAPL
 * GET /api/quote?symbol=600519
 *
 * 单股实时行情（供 useMarketData.ts / 股票详情页使用）。
 * 统一通过 lib/quoteService 获取数据，包含完整 A 股字段。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchSingleQuote } from "@/lib/quoteService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required", ok: false }, { status: 400 });
  }

  const quote = await fetchSingleQuote(symbol);

  if (!quote) {
    return NextResponse.json({ error: "unknown symbol", ok: false }, { status: 404 });
  }

  return NextResponse.json({ ...quote, ok: true });
}
