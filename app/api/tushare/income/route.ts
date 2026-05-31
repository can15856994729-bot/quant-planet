/**
 * GET /api/tushare/income?tsCode=xxx&startDate=YYYYMMDD&endDate=YYYYMMDD
 *
 * 获取上市公司利润表（合并报表），按报告期降序返回。
 * 数据来源：Tushare income 接口
 * 缓存：7d（服务端内存缓存） + HTTP Cache-Control 24h
 */
import { NextRequest, NextResponse } from "next/server";
import { getIncome, hasTushareToken, daysAgoStr, todayStr } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

/** 按 end_date 降序去重（保留同期最新公告版本） */
function dedupeByPeriod<T extends Record<string, unknown>>(
  records: T[],
  dateKey: string,
  sortKey: string,
): T[] {
  // Sort by sortKey desc (latest ann_date first), then by end_date desc
  const sorted = [...records].sort((a, b) => {
    const annDiff = String(b[sortKey] ?? "").localeCompare(String(a[sortKey] ?? ""));
    if (annDiff !== 0) return annDiff;
    return String(b[dateKey] ?? "").localeCompare(String(a[dateKey] ?? ""));
  });
  // Deduplicate: keep first occurrence of each end_date
  const seen = new Set<string>();
  return sorted.filter(r => {
    const k = String(r[dateKey] ?? "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function GET(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", records: [] },
      { status: 200 },
    );
  }

  const p = req.nextUrl.searchParams;
  const tsCode    = p.get("tsCode")    ?? "";
  const startDate = p.get("startDate") ?? daysAgoStr(4 * 365);
  const endDate   = p.get("endDate")   ?? todayStr();

  if (!tsCode) {
    return NextResponse.json(
      { ok: false, error: "缺少必填参数：tsCode", records: [] },
      { status: 400 },
    );
  }

  const res = await getIncome(tsCode, startDate, endDate);
  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      error: res.error,
      permissionDenied: res.permissionDenied ?? false,
      records: [],
    });
  }

  const records = dedupeByPeriod(res.records, "end_date", "ann_date");

  return NextResponse.json(
    { ok: true, tsCode, records, total: records.length },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
