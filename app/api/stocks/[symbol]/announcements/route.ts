/**
 * app/api/stocks/[symbol]/announcements/route.ts
 *
 * GET /api/stocks/:symbol/announcements[?limit=20]
 *
 * 返回股票全部公告列表（当前为 stub，available=false）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getStockAnnouncements } from "@/lib/announcementService";

function symbolToTsCode(symbol: string): string {
  if (symbol.startsWith("6"))                                  return `${symbol}.SH`;
  if (symbol.startsWith("0") || symbol.startsWith("3"))        return `${symbol}.SZ`;
  if (symbol.startsWith("8") || symbol.startsWith("4"))        return `${symbol}.BJ`;
  return `${symbol}.SH`;
}

export const dynamic = "force-dynamic";

export async function GET(
  req:  NextRequest,
  ctx:  { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  const { symbol } = await ctx.params;
  const sym   = symbol.toUpperCase();
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  if (!/^\d{6}$/.test(sym)) {
    return NextResponse.json({ ok: false, error: "仅支持 A 股 6 位代码" }, { status: 400 });
  }

  const tsCode = symbolToTsCode(sym);
  const result = await getStockAnnouncements(tsCode, limit);
  return NextResponse.json(result, { status: 200 });
}
