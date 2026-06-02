/**
 * GET /api/tushare/daily-basic-by-date?date=YYYYMMDD
 *
 * 获取指定交易日全市场的 daily_basic 数据（1次API调用代替5000次）。
 * 支持 ?auto=1 自动寻找最近有效交易日（向前最多查7天）。
 *
 * 用于全市场扫描预筛：先按成交额/换手率过滤，再批量扫描K线，
 * 将 5000+ 只股票压缩到 ~2000 只高流动性目标。
 *
 * 响应：{ ok, tradeDate, records: [{ts_code, close, turnover_rate, ...}], total }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  hasTushareToken,
  getDailyBasicByDate,
  getLatestTradingDayDailyBasic,
} from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", code: "no_token" },
      { status: 500 },
    );
  }

  const { searchParams } = req.nextUrl;
  const dateParam = searchParams.get("date") ?? "";
  const autoMode  = searchParams.get("auto") === "1";

  try {
    // auto=1：自动寻找最近有效交易日
    if (autoMode || !dateParam) {
      const result = await getLatestTradingDayDailyBasic(7);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error, code: "no_data" },
          { status: 200 },
        );
      }
      return NextResponse.json({
        ok:        true,
        tradeDate: result.tradeDate,
        records:   result.records,
        total:     result.records.length,
        mode:      "auto",
      });
    }

    // 指定日期模式
    const res = await getDailyBasicByDate(dateParam);
    if (!res.ok) {
      return NextResponse.json(
        {
          ok:    false,
          error: (res as { error?: string }).error ?? "获取数据失败",
          code:  "fetch_error",
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok:        true,
      tradeDate: dateParam,
      records:   res.records,
      total:     res.records.length,
      mode:      "specific",
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, code: "exception" },
      { status: 500 },
    );
  }
}
