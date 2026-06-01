/**
 * GET /api/eastmoney/order-book/[symbol]
 *
 * 东方财富盘口直通接口（与 /api/quotes/order-book/[symbol] 等效）。
 * 提供明确的数据源标识，便于调试与监控。
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchOrderBook } from "@/lib/eastMoneyOrderBookService";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym        = symbol.toUpperCase().trim();

  if (!/^\d{6}$/.test(sym)) {
    return NextResponse.json(
      { ok: false, error: "invalid_symbol", message: "仅支持 A 股六位代码" },
      { status: 400 }
    );
  }

  const data = await fetchOrderBook(sym);

  if (!data) {
    return NextResponse.json(
      { ok: false, error: "order_book_unavailable", message: "盘口数据暂不可用" },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { ok: true, symbol: sym, source: "EastMoney", data },
    { headers: { "Cache-Control": "public, max-age=3" } }
  );
}
