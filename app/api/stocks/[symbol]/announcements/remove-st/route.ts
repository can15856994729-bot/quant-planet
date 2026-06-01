/**
 * app/api/stocks/[symbol]/announcements/remove-st/route.ts
 *
 * GET /api/stocks/:symbol/announcements/remove-st
 * 摘帽公告（stub）
 */

import { NextRequest, NextResponse } from "next/server";
import { getRemoveSTAnnouncements } from "@/lib/announcementService";

function symbolToTsCode(s: string): string {
  if (s.startsWith("6")) return `${s}.SH`;
  if (s.startsWith("0") || s.startsWith("3")) return `${s}.SZ`;
  if (s.startsWith("8") || s.startsWith("4")) return `${s}.BJ`;
  return `${s}.SH`;
}

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx:  { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  const { symbol } = await ctx.params;
  const sym = symbol.toUpperCase();
  if (!/^\d{6}$/.test(sym)) return NextResponse.json({ ok: false, error: "格式错误" }, { status: 400 });
  const result = await getRemoveSTAnnouncements(symbolToTsCode(sym));
  return NextResponse.json(result);
}
