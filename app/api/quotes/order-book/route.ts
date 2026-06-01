/**
 * POST /api/quotes/order-book
 * GET  /api/quotes/order-book?symbols=600519,002594
 *
 * 批量盘口接口 — 支持最多 20 只股票。
 * 返回 { ok, results: Record<symbol, OrderBookData>, failed: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchBatchOrderBooks } from "@/lib/eastMoneyOrderBookService";

export const dynamic = "force-dynamic";

async function handleBatch(symbols: string[]) {
  const valid = symbols
    .map(s => s.toUpperCase().trim())
    .filter(s => /^\d{6}$/.test(s))
    .slice(0, 20);

  if (valid.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no_valid_symbols", message: "无有效 A 股代码" },
      { status: 400 }
    );
  }

  const results = await fetchBatchOrderBooks(valid, 5);
  const failed  = valid.filter(s => !results[s]);

  return NextResponse.json({ ok: true, results, failed });
}

// ── GET：?symbols=600519,002594 ───────────────────────────────────
export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols      = symbolsParam.split(",").filter(Boolean);
  return handleBatch(symbols);
}

// ── POST：body { symbols: [...] } ────────────────────────────────
export async function POST(req: NextRequest) {
  let symbols: string[] = [];
  try {
    const body = await req.json();
    symbols    = Array.isArray(body?.symbols) ? body.symbols : [];
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "请求体格式错误" },
      { status: 400 }
    );
  }
  return handleBatch(symbols);
}
