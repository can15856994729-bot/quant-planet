/**
 * app/api/strategies/trend-correction-mini-reversal/scan/stocks/route.ts
 *
 * GET /api/strategies/trend-correction-mini-reversal/scan/stocks
 * 返回 A股股票列表，供前端任务管理器分批扫描使用。
 *
 * Query 参数：
 *   ?mode=full_market   默认。返回全部 A股上市股票（5000+ 只）
 *   ?mode=quick_test    快速测试模式，随机返回 200 只
 *   ?prefilter=1        联合 mode=full_market，用 daily_basic 按日期预筛（成交活跃）
 *   ?refresh=1          清除服务端内存缓存，强制重新从 Tushare 拉取
 *
 * 响应：
 *   {
 *     ok, scanMode, stocks: [{tsCode, name}], total,
 *     totalAStockCount,   // 原始全量 A 股数量（未经快速测试截断）
 *     prefiltered?,       // 是否做了 daily_basic 预筛
 *     filteredFrom?,      // 预筛前的数量
 *     tradeDate?,         // 预筛使用的交易日
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAStockBasicAll,
  hasTushareToken,
  clearTushareCacheFor,
  getLatestTradingDayDailyBasic,
} from "@/lib/tushareService";

export const dynamic = "force-dynamic";

// ── 预筛阈值（满足任一条件即保留） ──────────────────────────────────────────
const MIN_AMOUNT_10K = 5000;  // 成交额 ≥ 5000万元（amount 单位：千元）
const MIN_TURNOVER   = 0.3;   // 换手率 ≥ 0.3%

// 快速测试模式的股票数量
const QUICK_TEST_COUNT = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", code: "no_token" },
      { status: 500 },
    );
  }

  const { searchParams } = req.nextUrl;
  const mode         = searchParams.get("mode") ?? "full_market";
  const usePrefilter = searchParams.get("prefilter") === "1";
  const forceRefresh = searchParams.get("refresh") === "1";

  // 强制刷新时清除 stock_basic 内存缓存
  if (forceRefresh) {
    clearTushareCacheFor("stock_basic");
    clearTushareCacheFor("daily_basic");
  }

  try {
    // ── 1. 获取全量 A股股票池（使用带分页兜底的版本） ─────────────────────
    const basicRes = await getAStockBasicAll();

    if (!basicRes.ok) {
      return NextResponse.json(
        {
          ok:    false,
          error: (basicRes as { error?: string }).error ?? "获取 A股股票列表失败",
          code:  "fetch_error",
          hint:  "请检查 Tushare Token 配置，或调用 /api/tushare/status?refresh=1 重新检测权限",
        },
        { status: 500 },
      );
    }

    // ── 2. 过滤：排除 *ST / 退市 / 停牌 ─────────────────────────────────
    let allStocks = (basicRes.records as Record<string, string>[])
      .filter(r => {
        const name   = String(r.name ?? "");
        const status = String(r.list_status ?? "");
        if (status === "D" || status === "P") return false;     // 退市/停牌
        if (name.startsWith("*ST") || name.startsWith("ST")) return false;
        if (name.includes("退市")) return false;
        return true;
      })
      .map(r => ({
        tsCode: r.ts_code ?? "",
        name:   r.name    ?? r.ts_code ?? "",
      }))
      .filter(s => s.tsCode);

    const totalAStockCount = allStocks.length;

    // ── 3. quick_test 模式：随机抽取 200 只 ───────────────────────────────
    if (mode === "quick_test") {
      // Fisher-Yates 随机打乱后取前 QUICK_TEST_COUNT 只
      for (let i = allStocks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allStocks[i], allStocks[j]] = [allStocks[j], allStocks[i]];
      }
      const quickStocks = allStocks.slice(0, QUICK_TEST_COUNT);
      return NextResponse.json({
        ok:               true,
        scanMode:         "quick_test",
        stocks:           quickStocks,
        total:            quickStocks.length,
        totalAStockCount,
        note:             `快速测试模式：从 ${totalAStockCount} 只中随机抽取 ${QUICK_TEST_COUNT} 只`,
      });
    }

    // ── 4. full_market + prefilter ─────────────────────────────────────
    if (usePrefilter) {
      const dailyRes = await getLatestTradingDayDailyBasic(7);
      if (dailyRes.ok) {
        const dailyMap = new Map<string, Record<string, unknown>>();
        for (const r of dailyRes.records as Record<string, unknown>[]) {
          const code = String(r.ts_code ?? "");
          if (code) dailyMap.set(code, r);
        }

        const filteredStocks = allStocks.filter(s => {
          const d = dailyMap.get(s.tsCode);
          if (!d) return true; // 无当日数据不排除（可能是新股）
          const amount   = parseFloat(String(d.amount ?? 0));
          const turnover = parseFloat(String(d.turnover_rate ?? 0));
          return (amount >= MIN_AMOUNT_10K) || (turnover >= MIN_TURNOVER);
        });

        return NextResponse.json({
          ok:               true,
          scanMode:         "full_market",
          stocks:           filteredStocks,
          total:            filteredStocks.length,
          totalAStockCount,
          prefiltered:      true,
          filteredFrom:     totalAStockCount,
          tradeDate:        dailyRes.tradeDate,
          filterCriteria:   `成交额≥${MIN_AMOUNT_10K}千元 或 换手率≥${MIN_TURNOVER}%`,
        });
      }
      // 预筛失败 → 降级到全量
    }

    // ── 5. 全市场模式（默认） ─────────────────────────────────────────────
    return NextResponse.json({
      ok:               true,
      scanMode:         "full_market",
      stocks:           allStocks,
      total:            allStocks.length,
      totalAStockCount,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, code: "exception" },
      { status: 500 },
    );
  }
}
