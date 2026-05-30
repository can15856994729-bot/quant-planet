/**
 * GET /api/tushare/index-daily
 *
 * 获取指数日线数据（沪深300、中证500、创业板指等）。
 * 用于市场择时：计算 MA60，判断强势/震荡/弱势。
 *
 * Query params:
 *   tsCode     可选，默认 "000300.SH"（沪深300）
 *   startDate  可选，YYYYMMDD，默认 180 天前
 *   endDate    可选，YYYYMMDD，默认今天
 *
 * 常用指数 ts_code:
 *   000300.SH  沪深300
 *   000905.SH  中证500
 *   399006.SZ  创业板指
 *   000001.SH  上证指数
 */
import { NextRequest, NextResponse } from "next/server";
import { getIndexDaily, hasTushareToken, daysAgoStr, todayStr } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", tokenMissing: true, bars: [] },
      { status: 200 },
    );
  }

  const { searchParams } = new URL(req.url);
  const tsCode    = searchParams.get("tsCode")    ?? "000300.SH";  // 默认沪深300
  const startDate = searchParams.get("startDate") ?? daysAgoStr(180);
  const endDate   = searchParams.get("endDate")   ?? todayStr();

  const result = await getIndexDaily(tsCode, startDate, endDate);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, tokenMissing: result.tokenMissing, bars: [] },
      { status: 200 },
    );
  }

  const sorted = [...result.records]
    .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)))
    .map(r => ({
      date:   String(r.trade_date ?? ""),
      open:   Number(r.open   ?? 0),
      high:   Number(r.high   ?? 0),
      low:    Number(r.low    ?? 0),
      close:  Number(r.close  ?? 0),
      volume: Number(r.vol    ?? 0),
      amount: Number(r.amount ?? 0),
    }));

  // 计算 MA60 并给出市场状态判断
  const closes = sorted.map(b => b.close);
  let marketStatus: "强势" | "震荡" | "弱势" | "数据不足" = "数据不足";
  let ma60: number | null = null;
  let deviation: number | null = null;

  if (closes.length >= 60) {
    const slice = closes.slice(-60);
    ma60 = slice.reduce((s, v) => s + v, 0) / 60;
    const cur = closes[closes.length - 1];
    deviation = ((cur - ma60) / ma60) * 100;
    if      (deviation >  3) marketStatus = "强势";
    else if (deviation < -3) marketStatus = "弱势";
    else                     marketStatus = "震荡";
  }

  return NextResponse.json(
    {
      ok:            true,
      tsCode,
      total:         sorted.length,
      bars:          sorted,
      marketStatus,
      ma60:          ma60 != null ? +ma60.toFixed(2) : null,
      deviation:     deviation != null ? +deviation.toFixed(2) : null,
      deviationNote: deviation != null
        ? `当前偏离MA60 ${deviation > 0 ? "+" : ""}${deviation.toFixed(2)}%`
        : "数据不足，无法计算MA60",
      source:        "tushare",
      updatedAt:     new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=3600",
      },
    },
  );
}
