/**
 * GET /api/strategies/bom-supply-chain-stock-strategy/chokepoint-pools/pcb
 *
 * PCB 咽喉池 API
 * 流程：
 *   1. 从 pcbChokepointPoolService 获取全部内置 PCB 咽喉池股票
 *   2. 调用 Tushare daily_basic（批量）获取 PE/PB/总市值/换手率/收盘价
 *   3. 合并静态评分 + 动态财务数据，计算咽喉点评分
 *   4. 返回按分组整理的完整结果
 *
 * ⚠️ 产业链映射为规则匹配，需人工复核，不代表真实供应商关系，不构成投资建议。
 */

import { NextResponse } from "next/server";
import { callTushare, hasTushareToken } from "@/lib/tushareService";
import {
  PCB_CHOKEPOINT_STOCKS,
  PCB_CHOKEPOINT_CORE_POOL,
  PCB_CHOKEPOINT_GROUPS,
  PCB_CHOKEPOINT_RISKS,
  calcPcbChokepointScore,
} from "@/lib/pcbChokepointPoolService";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function latestTradeDate(): string {
  const d = new Date();
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0].replace(/-/g, "");
}

type FinEntry = {
  pe:           number | null;
  pb:           number | null;
  totalMv:      number | null;
  turnoverRate: number | null;
  close:        number | null;
};

export async function GET(): Promise<NextResponse> {
  let finMap: Map<string, FinEntry> = new Map();

  if (hasTushareToken()) {
    const tradeDate  = latestTradeDate();
    const allTsCodes = PCB_CHOKEPOINT_STOCKS.map(s => s.tsCode).join(",");

    const res = await callTushare(
      "daily_basic",
      { ts_code: allTsCodes, trade_date: tradeDate },
      "ts_code,pe_ttm,pb,total_mv,turnover_rate,close",
      30 * 60 * 1000,
    ).catch(() => null);

    if (res?.ok && res.records.length > 0) {
      for (const r of res.records) {
        finMap.set(String(r.ts_code), {
          pe:           toNum(r.pe_ttm),
          pb:           toNum(r.pb),
          totalMv:      toNum(r.total_mv),
          turnoverRate: toNum(r.turnover_rate),
          close:        toNum(r.close),
        });
      }
    } else {
      // fallback: 仅核心池
      const fb = await callTushare(
        "daily_basic",
        { ts_code: PCB_CHOKEPOINT_CORE_POOL.map(s => s.tsCode).join(","), trade_date: "" },
        "ts_code,pe_ttm,pb,total_mv,turnover_rate,close",
        30 * 60 * 1000,
      ).catch(() => null);
      if (fb?.ok) {
        for (const r of fb.records) {
          finMap.set(String(r.ts_code), {
            pe: toNum(r.pe_ttm), pb: toNum(r.pb),
            totalMv: toNum(r.total_mv), turnoverRate: toNum(r.turnover_rate), close: toNum(r.close),
          });
        }
      }
    }
  }

  const hasFinancial = finMap.size > 0;

  const stocks = PCB_CHOKEPOINT_STOCKS.map(s => {
    const fin   = finMap.get(s.tsCode);
    const score = calcPcbChokepointScore(s, { pe: fin?.pe ?? null, pb: fin?.pb ?? null });
    return {
      tsCode:              s.tsCode,
      symbol:              s.symbol,
      name:                s.name,
      primarySegment:      s.primarySegment,
      groups:              s.groups,
      role:                s.role,
      chokePointDesc:      s.chokePointDesc,
      technicalBarrier:    s.technicalBarrier,
      localizationSpace:   s.localizationSpace,
      aiDemandLevel:       s.aiDemandLevel,
      isCore:              s.isCore,
      notes:               s.notes,
      poolType:            "PCB" as const,
      pe:                  fin?.pe          ?? null,
      pb:                  fin?.pb          ?? null,
      totalMv:             fin?.totalMv     ?? null,
      turnoverRate:        fin?.turnoverRate ?? null,
      close:               fin?.close       ?? null,
      score,
    };
  });

  const groups = PCB_CHOKEPOINT_GROUPS.map(g => ({
    ...g,
    stocks: stocks
      .filter(s => s.groups.includes(g.key))
      .sort((a, b) => b.score.totalScore - a.score.totalScore),
  }));

  const corePool = stocks.filter(s => s.isCore);
  const avgScore = Math.round(
    corePool.reduce((sum, s) => sum + s.score.totalScore, 0) / (corePool.length || 1),
  );

  const segmentStats: Record<string, number> = {};
  for (const s of stocks) {
    segmentStats[s.primarySegment] = (segmentStats[s.primarySegment] ?? 0) + 1;
  }

  return NextResponse.json({
    ok:           true,
    poolType:     "PCB",
    poolName:     "PCB 咽喉池",
    totalStocks:  stocks.length,
    coreCount:    corePool.length,
    hasFinancial,
    corePool:     corePool.sort((a, b) => b.score.totalScore - a.score.totalScore),
    groups,
    allStocks:    stocks.sort((a, b) => b.score.totalScore - a.score.totalScore),
    stats:        { avgScore, bySegment: segmentStats },
    risks:        PCB_CHOKEPOINT_RISKS,
    disclaimer:   "产业链分类基于公开信息规则匹配，需人工复核，不代表真实供应商关系，不构成投资建议",
    note:         "财务数据来自 Tushare Pro，为最新可用交易日数据",
    fetchedAt:    new Date().toISOString(),
  });
}
