/**
 * GET /api/quotes/order-book/[symbol]
 *
 * 单只股票五档盘口 — 统一入口，数据来自东方财富。
 * 缓存：服务端内存 3 s（由 eastMoneyOrderBookService 管理）。
 *
 * 返回：
 *   ok: true  → { ok, symbol, data: OrderBookData }
 *   ok: false → { ok: false, error: "order_book_unavailable", message: "..." }
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

  // 仅支持 A 股六位数字代码
  if (!/^\d{6}$/.test(sym)) {
    return NextResponse.json(
      { ok: false, error: "invalid_symbol", message: "仅支持 A 股六位代码" },
      { status: 400 }
    );
  }

  const data = await fetchOrderBook(sym);

  if (!data) {
    return NextResponse.json(
      {
        ok:      false,
        error:   "order_book_unavailable",
        message: "盘口数据暂不可用，请稍后重试",
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { ok: true, symbol: sym, data },
    {
      headers: {
        // 允许客户端缓存 3 s，与服务端内存缓存对齐
        "Cache-Control": "public, max-age=3, stale-while-revalidate=5",
      },
    }
  );
}
