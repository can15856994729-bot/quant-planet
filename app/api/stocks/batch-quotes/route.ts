/**
 * POST /api/stocks/batch-quotes
 * Body: { symbols: string[] }
 *
 * 批量实时行情（POST 形式，供 useStockQuotes / useWatchlistQuotes 使用）。
 * 统一通过 lib/quoteService 获取数据，包含完整 A 股字段。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchBatchQuotes } from "@/lib/quoteService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { symbols?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body", ok: false }, { status: 400 });
  }

  const symbols = (body.symbols ?? [])
    .map((s: string) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: {}, ok: true });
  }

  const quotes = await fetchBatchQuotes(symbols);

  return NextResponse.json({
    quotes,
    ok: true,
  });
}
