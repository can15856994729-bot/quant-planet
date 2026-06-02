/**
 * app/api/stocks/[symbol]/announcements/reports/route.ts
 *
 * GET /api/stocks/:symbol/announcements/reports
 * 年报/季报公告（暂未接入）
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAnnualReportAnnouncements,
  getQuarterlyReportAnnouncements,
  AnnouncementItem,
} from "@/lib/announcementService";

function symbolToTsCode(s: string): string {
  if (s.startsWith("6")) return `${s}.SH`;
  if (s.startsWith("0") || s.startsWith("3")) return `${s}.SZ`;
  if (s.startsWith("8") || s.startsWith("4")) return `${s}.BJ`;
  return `${s}.SH`;
}

export const dynamic = "force-dynamic";

export async function GET(
  req:  NextRequest,
  ctx:  { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  const { symbol } = await ctx.params;
  const sym = symbol.toUpperCase();
  if (!/^\d{6}$/.test(sym)) {
    return NextResponse.json({ ok: false, error: "格式错误" }, { status: 400 });
  }
  const tsCode = symbolToTsCode(sym);
  const type   = req.nextUrl.searchParams.get("type") ?? "all";

  if (type === "annual") {
    return NextResponse.json(await getAnnualReportAnnouncements(tsCode));
  }
  if (type === "quarterly") {
    return NextResponse.json(await getQuarterlyReportAnnouncements(tsCode));
  }

  // 合并年报+季报
  const [annual, quarterly] = await Promise.all([
    getAnnualReportAnnouncements(tsCode),
    getQuarterlyReportAnnouncements(tsCode),
  ]);
  const items: AnnouncementItem[] = [...annual.items, ...quarterly.items]
    .sort((a, b) => b.annDate.localeCompare(a.annDate));

  return NextResponse.json({
    ok:        true,
    tsCode,
    items,
    total:     items.length,
    available: annual.available || quarterly.available,
    errorCode: "not_implemented",
    message:   "年报/季报公告暂未接入",
    updatedAt: new Date().toISOString(),
  });
}
