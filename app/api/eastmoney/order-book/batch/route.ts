/**
 * POST /api/eastmoney/order-book/batch
 *
 * 批量盘口接口（东方财富），支持最多 20 只 A 股。
 *
 * 请求体：{ symbols: ["600519", "002594", "300750"] }
 * 返回：  { ok, results: Record<symbol, OrderBookData>, failed: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchBatchOrderBooks } from "@/lib/eastMoneyOrderBookService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { symbols?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "请求体必须是有效 JSON" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body?.symbols)) {
    return NextResponse.json(
      { ok: false, error: "missing_symbols", message: "缺少 symbols 字段" },
      { status: 400 }
    );
  }

  const valid = (body.symbols as unknown[])
    .filter((s): s is string => typeof s === "string")
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

  return NextResponse.json({ ok: true, results, failed, source: "EastMoney" });
}
