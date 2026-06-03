/**
 * GET /api/strategies/bom-supply-chain-stock-strategy/cpo
 *
 * CPO / 共封装光学 / 高速光通信 产业链股票池
 * ────────────────────────────────────────────────────────────────────────────
 * 流程：
 *   1. 从 cpoStockPoolService 获取全部内置 CPO 股票列表
 *   2. 调用 Tushare daily_basic（批量）获取 PE/PB/总市值/换手率
 *   3. 合并静态 CPO 元数据 + 动态财务数据，计算 CPO 策略评分
 *   4. 返回按投资逻辑分组的完整结果
 *
 * ⚠️ 产业链映射为规则匹配结果，需人工复核，不代表真实供应商关系，不构成投资建议。
 */

import { NextResponse } from "next/server";
import { callTushare, hasTushareToken } from "@/lib/tushareService";
import {
  CPO_STOCKS,
  CPO_CORE_POOL,
  CPO_INVESTMENT_GROUPS,
  calcCpoScore,
  CPO_COMMON_RISKS,
} from "@/lib/cpoStockPoolService";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/** 最近可用交易日（跳过周末） */
function latestTradeDate(): string {
  const d = new Date();
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0].replace(/-/g, "");
}

export async function GET(): Promise<NextResponse> {
  if (!hasTushareToken()) {
    return buildResponse(null);
  }

  const tradeDate   = latestTradeDate();
  const allTsCodes  = CPO_STOCKS.map(s => s.tsCode).join(",");

  type FinEntry = { pe: number | null; pb: number | null; totalMv: number | null; turnoverRate: number | null; close: number | null };
  let finMap: Map<string, FinEntry> = new Map();

  const res = await callTushare(
    "daily_basic",
    { ts_code: allTsCodes, trade_date: tradeDate },
    "ts_code,pe_ttm,pb,total_mv,turnover_rate,close",
    30 * 60 * 1000,
  ).catch(() => null);

  if (res?.ok && res.records.length > 0) {
    for (const r of res.records) {
      finMap.set(String(r.ts_code), {
        pe:          toNum(r.pe_ttm),
        pb:          toNum(r.pb),
        totalMv:     toNum(r.total_mv),
        turnoverRate: toNum(r.turnover_rate),
        close:       toNum(r.close),
      });
    }
  } else {
    // Fallback: 仅核心股票
    const fallback = await callTushare(
      "daily_basic",
      { ts_code: CPO_CORE_POOL.map(s => s.tsCode).join(","), trade_date: "" },
      "ts_code,pe_ttm,pb,total_mv,turnover_rate,close",
      30 * 60 * 1000,
    ).catch(() => null);
    if (fallback?.ok) {
      for (const r of fallback.records) {
        finMap.set(String(r.ts_code), {
          pe:          toNum(r.pe_ttm),
          pb:          toNum(r.pb),
          totalMv:     toNum(r.total_mv),
          turnoverRate: toNum(r.turnover_rate),
          close:       toNum(r.close),
        });
      }
    }
  }

  return buildResponse(finMap);
}

type FinMap = Map<string, { pe: number | null; pb: number | null; totalMv: number | null; turnoverRate: number | null; close: number | null }> | null;

function buildResponse(finMap: FinMap): NextResponse {
  const hasFinancial = finMap != null && finMap.size > 0;

  const stocks = CPO_STOCKS.map(s => {
    const fin   = finMap?.get(s.tsCode);
    const score = calcCpoScore(s, { pe: fin?.pe ?? null, pb: fin?.pb ?? null });
    return {
      tsCode:                 s.tsCode,
      symbol:                 s.symbol,
      name:                   s.name,
      segment:                s.segment,
      investmentGroups:       s.investmentGroups,
      techBarrier:            s.techBarrier,
      localizationSpace:      s.localizationSpace,
      aiDemandLevel:          s.aiDemandLevel,
      downstreamApplications: s.downstreamApplications,
      note:                   s.note,
      isCore:                 s.isCore,
      pe:          fin?.pe          ?? null,
      pb:          fin?.pb          ?? null,
      totalMv:     fin?.totalMv     ?? null,
      turnoverRate: fin?.turnoverRate ?? null,
      close:       fin?.close       ?? null,
      score,
    };
  });

  const groups = CPO_INVESTMENT_GROUPS.map(g => ({
    ...g,
    stocks: stocks.filter(s => s.investmentGroups.includes(g.key)),
  }));

  const corePool = stocks.filter(s => s.isCore);
  const avgScore = Math.round(
    corePool.reduce((sum, s) => sum + s.score.totalScore, 0) / (corePool.length || 1)
  );

  // 细分统计
  const segmentStats: Record<string, number> = {};
  for (const s of stocks) {
    segmentStats[s.segment] = (segmentStats[s.segment] ?? 0) + 1;
  }

  return NextResponse.json({
    ok:           true,
    totalStocks:  stocks.length,
    coreCount:    corePool.length,
    hasFinancial,
    corePool,
    groups,
    allStocks:    stocks,
    stats:        { avgScore, bySegment: segmentStats },
    risks:        CPO_COMMON_RISKS,
    disclaimer:   "产业链分类基于公开市场信息整理，不代表具体客户/供应商关系，需人工复核，不构成投资建议",
    note:         "财务数据来自 Tushare Pro，PE/PB 为最新可用交易日数据",
    fetchedAt:    new Date().toISOString(),
  });
}
