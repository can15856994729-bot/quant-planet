/**
 * GET /api/tushare/daily
 *
 * 获取 A股个股或指数的日线历史数据，支持前复权。
 *
 * Query params:
 *   tsCode     必填，如 "600519.SH"
 *   startDate  可选，YYYYMMDD，默认 365 天前
 *   endDate    可选，YYYYMMDD，默认今天
 *   adj        可选，"qfq"（前复权，默认）| "none"（不复权）
 *
 * 返回按 trade_date 升序排列的 K 线数组。
 * 若 Tushare Token 缺失或权限不足，返回 ok:false。
 * 不返回假数据。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getDailyKLine,
  getAdjFactor,
  applyAdjFactor,
  hasTushareToken,
  daysAgoStr,
  todayStr,
} from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export interface DailyBar {
  date:      string;   // "20240101"
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;   // 手
  amount:    number;   // 千元
  pctChg:    number;   // 涨跌幅 %
  adjusted:  boolean;
}

export async function GET(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", tokenMissing: true, bars: [] },
      { status: 200 },
    );
  }

  const { searchParams } = new URL(req.url);
  const tsCode    = searchParams.get("tsCode")    ?? "";
  const startDate = searchParams.get("startDate") ?? daysAgoStr(365);
  const endDate   = searchParams.get("endDate")   ?? todayStr();
  const adj       = searchParams.get("adj")       ?? "qfq";  // 前复权

  if (!tsCode) {
    return NextResponse.json({ ok: false, error: "tsCode 参数必填", bars: [] }, { status: 400 });
  }

  // 并行获取日线和复权因子
  const [dailyRes, adjRes] = await Promise.all([
    getDailyKLine(tsCode, startDate, endDate),
    adj === "qfq" ? getAdjFactor(tsCode, startDate, endDate) : Promise.resolve(null),
  ]);

  if (!dailyRes.ok) {
    return NextResponse.json(
      { ok: false, error: dailyRes.error, tokenMissing: dailyRes.tokenMissing, bars: [] },
      { status: 200 },
    );
  }

  // Sort ascending by trade_date
  const sorted = [...dailyRes.records].sort((a, b) =>
    String(a.trade_date).localeCompare(String(b.trade_date))
  );

  // Apply forward adjustment
  let bars = sorted;
  if (adj === "qfq" && adjRes && adjRes.ok) {
    const adjSorted = [...adjRes.records].sort((a, b) =>
      String(a.trade_date).localeCompare(String(b.trade_date))
    );
    bars = applyAdjFactor(sorted, adjSorted);
  }

  const result: DailyBar[] = bars.map(r => ({
    date:     String(r.trade_date ?? ""),
    open:     Number(r.open  ?? 0),
    high:     Number(r.high  ?? 0),
    low:      Number(r.low   ?? 0),
    close:    Number(r.close ?? 0),
    volume:   Number(r.vol   ?? 0),
    amount:   Number(r.amount ?? 0),
    pctChg:   Number(r.pct_chg ?? 0),
    adjusted: adj === "qfq" && adjRes?.ok === true,
  })).filter(b => b.close > 0);

  return NextResponse.json(
    {
      ok:        true,
      tsCode,
      total:     result.length,
      adj:       adj === "qfq" && adjRes?.ok ? "qfq" : "none",
      adjNote:   adj === "qfq"
        ? (adjRes?.ok ? "前复权（Tushare adj_factor）" : "复权因子获取失败，返回原始价格")
        : "未复权原始价格",
      bars:      result,
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
