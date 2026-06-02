/**
 * app/api/strategies/trend-correction-mini-reversal/scan/stocks/route.ts
 *
 * GET /api/strategies/trend-correction-mini-reversal/scan/stocks
 * 获取 A股全市场上市股票列表，供前端任务管理器分批扫描使用。
 *
 * ?prefilter=1  启用 daily_basic 预筛模式（5000积分+）：
 *   按最近交易日的成交额/换手率过滤，将全市场 5000+ 只压缩至
 *   约 1500-2500 只高流动性股票，显著减少 K 线扫描次数。
 *
 * 响应：
 *   { ok, stocks: [{tsCode, name}], total, prefiltered?, tradeDate?, filteredFrom? }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAStockBasic,
  hasTushareToken,
  getLatestTradingDayDailyBasic,
} from "@/lib/tushareService";

export const dynamic = "force-dynamic";

// ── 预筛阈值（满足任一条件即保留） ──────────────────────────────────────────
const MIN_AMOUNT_10K   = 5000;   // 成交额 ≥ 5000万元（amount 单位：千元）
const MIN_TURNOVER     = 0.3;    // 换手率 ≥ 0.3%

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", code: "no_token" },
      { status: 500 },
    );
  }

  const usePrefilter = req.nextUrl.searchParams.get("prefilter") === "1";

  try {
    // ── 1. 基础股票池（上市状态 L） ─────────────────────────────────────
    const basicRes = await getAStockBasic("L");
    if (!basicRes.ok) {
      return NextResponse.json(
        {
          ok:    false,
          error: (basicRes as { error?: string }).error ?? "获取股票列表失败",
          code:  "fetch_error",
        },
        { status: 500 },
      );
    }

    const allStocks = (basicRes.records as Record<string, string>[])
      .map(r => ({ tsCode: r.ts_code ?? "", name: r.name ?? r.ts_code ?? "" }))
      .filter(s => s.tsCode);

    // ── 2. 不启用预筛 → 直接返回全量 ───────────────────────────────────
    if (!usePrefilter) {
      return NextResponse.json({ ok: true, stocks: allStocks, total: allStocks.length });
    }

    // ── 3. 预筛：daily_basic 按交易日批量过滤 ──────────────────────────
    const dailyRes = await getLatestTradingDayDailyBasic(7);
    if (!dailyRes.ok) {
      // 预筛失败 → 降级到全量（不报错）
      return NextResponse.json({
        ok:           true,
        stocks:       allStocks,
        total:        allStocks.length,
        prefiltered:  false,
        prefiltWarn:  `daily_basic 不可用，已返回全量：${dailyRes.error}`,
      });
    }

    // 按 ts_code 建立 daily_basic 快速查找表
    const dailyMap = new Map<string, Record<string, unknown>>();
    for (const r of dailyRes.records as Record<string, unknown>[]) {
      const code = String(r.ts_code ?? "");
      if (code) dailyMap.set(code, r);
    }

    // 过滤：只保留成交活跃的股票
    const filteredStocks = allStocks.filter(s => {
      const d = dailyMap.get(s.tsCode);
      if (!d) return false; // 当日无数据（停牌/新股）→ 排除

      const amount   = parseFloat(String(d.amount ?? 0));        // 单位：千元
      const turnover = parseFloat(String(d.turnover_rate ?? 0)); // 单位：%

      // 成交额≥5000万 OR 换手率≥0.3%
      return (amount >= MIN_AMOUNT_10K) || (turnover >= MIN_TURNOVER);
    });

    return NextResponse.json({
      ok:           true,
      stocks:       filteredStocks,
      total:        filteredStocks.length,
      prefiltered:  true,
      filteredFrom: allStocks.length,
      tradeDate:    dailyRes.tradeDate,
      filterCriteria: `成交额≥${MIN_AMOUNT_10K}千元 或 换手率≥${MIN_TURNOVER}%`,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, code: "exception" },
      { status: 500 },
    );
  }
}
