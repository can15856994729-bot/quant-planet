/**
 * GET /api/tushare/daily-basic
 *
 * 获取每日基础行情指标（PE/PB/市值/换手率）。
 *
 * Query params:
 *   tsCode     必填，如 "600519.SH"
 *   startDate  可选，YYYYMMDD，默认 90 天前
 *   endDate    可选，YYYYMMDD，默认今天
 *
 * 用途：多因子策略估值因子、质量因子辅助数据。
 * 若 Token 缺失或权限不足，返回 ok:false 明确错误。
 */
import { NextRequest, NextResponse } from "next/server";
import { getDailyBasic, hasTushareToken, daysAgoStr, todayStr } from "@/lib/tushareService";

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
  const startDate = searchParams.get("startDate") ?? daysAgoStr(90);
  const endDate   = searchParams.get("endDate")   ?? todayStr();

  if (!tsCode) {
    return NextResponse.json({ ok: false, error: "tsCode 参数必填", records: [] }, { status: 400 });
  }

  const result = await getDailyBasic(tsCode, startDate, endDate);
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
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=3600",
      },
    },
  );
}
