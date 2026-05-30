/**
 * GET /api/tushare/adj-factor
 *
 * 获取个股复权因子序列，用于前复权/后复权价格计算。
 *
 * Query params:
 *   tsCode     必填，如 "600519.SH"
 *   startDate  可选，YYYYMMDD，默认 365 天前
 *   endDate    可选，YYYYMMDD，默认今天
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdjFactor, hasTushareToken, daysAgoStr, todayStr } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", tokenMissing: true, records: [] },
      { status: 200 },
    );
  }

  const { searchParams } = new URL(req.url);
  const tsCode    = searchParams.get("tsCode")    ?? "";
  const startDate = searchParams.get("startDate") ?? daysAgoStr(365);
  const endDate   = searchParams.get("endDate")   ?? todayStr();

  if (!tsCode) {
    return NextResponse.json({ ok: false, error: "tsCode 参数必填", records: [] }, { status: 400 });
  }

  const result = await getAdjFactor(tsCode, startDate, endDate);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, tokenMissing: result.tokenMissing, records: [] },
      { status: 200 },
    );
  }

  const sorted = [...result.records].sort((a, b) =>
    String(a.trade_date).localeCompare(String(b.trade_date))
  );

  return NextResponse.json(
    {
      ok:        true,
      tsCode,
      total:     sorted.length,
      records:   sorted,
      source:    "tushare",
      note:      "前复权: price * (factor / latestFactor)；后复权: price * factor",
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    },
  );
}
