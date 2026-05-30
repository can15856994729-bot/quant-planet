/**
 * GET /api/stocks/quote?symbols=600519,00700,AAPL,NVDA
 *
 * 批量实时行情（GET 形式，供 useStockQuote.ts 使用）。
 * 统一通过 lib/quoteService 获取数据，包含完整 A 股字段。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchBatchQuotes } from "@/lib/quoteService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols required", ok: false }, { status: 400 });
  }

  const quotes = await fetchBatchQuotes(symbols);

  return NextResponse.json({
    quotes,
    ok: true,
  });
}
