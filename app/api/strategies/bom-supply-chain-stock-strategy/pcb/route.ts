/**
 * GET /api/strategies/bom-supply-chain-stock-strategy/pcb
 *
 * PCB 产业链股票池 — 获取全部 PCB 股票的实时财务/估值数据
 * ────────────────────────────────────────────────────────────────────────────
 * 流程：
 *   1. 从 pcbStockPoolService 获取全部内置 PCB 股票列表
 *   2. 调用 Tushare daily_basic（批量，最新交易日）获取 PE/PB/总市值/换手率
 *   3. 合并静态 PCB 元数据 + 动态财务数据，计算 PCB 策略评分
 *   4. 返回按投资逻辑分组的完整结果
 *
 * ⚠️ 产业链映射为规则匹配结果，需人工复核，不代表真实供应商关系，不构成投资建议。
 */

import { NextResponse } from "next/server";
import { callTushare, hasTushareToken, todayStr } from "@/lib/tushareService";
import {
  PCB_STOCKS,
  PCB_CORE_POOL,
  PCB_INVESTMENT_GROUPS,
  calcPcbScore,
  PCB_COMMON_RISKS,
} from "@/lib/pcbStockPoolService";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/** 推算最近可用的交易日（跳过周末，今天或昨天） */
function latestTradeDate(): string {
  const d = new Date();
  // 周日 → 周五
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  // 周六 → 周五
  else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0].replace(/-/g, "");
}

export async function GET(): Promise<NextResponse> {
  if (!hasTushareToken()) {
    // Tushare 未配置时：返回静态数据（无财务指标），不报错
    return buildResponse(null);
  }

  // ── 获取最新 daily_basic（尝试当天，失败则用昨天）──────────────────────
  const tradeDate = latestTradeDate();
  const allTsCodes = PCB_STOCKS.map(s => s.tsCode).join(",");

  const finRes = await callTushare(
    "daily_basic",
    { ts_code: allTsCodes, trade_date: tradeDate },
    "ts_code,pe_ttm,pb,total_mv,turnover_rate,close",
    30 * 60 * 1000, // 30 分钟缓存
  ).catch(() => null);

  // 如果当天没有数据（可能是非交易日），尝试空 trade_date（最新一条）
  let finMap: Map<string, { pe: number | null; pb: number | null; totalMv: number | null; turnoverRate: number | null; close: number | null }> = new Map();

  if (finRes?.ok && finRes.records.length > 0) {
    for (const r of finRes.records) {
      finMap.set(String(r.ts_code), {
        pe:          toNum(r.pe_ttm),
        pb:          toNum(r.pb),
        totalMv:     toNum(r.total_mv),
        turnoverRate: toNum(r.turnover_rate),
        close:       toNum(r.close),
      });
    }
  } else {
    // Fallback: 逐只获取（仅核心股票）
    const fallbackRes = await callTushare(
      "daily_basic",
      { ts_code: PCB_CORE_POOL.map(s => s.tsCode).join(","), trade_date: "" },
      "ts_code,pe_ttm,pb,total_mv,turnover_rate,close",
      30 * 60 * 1000,
    ).catch(() => null);

    if (fallbackRes?.ok) {
      for (const r of fallbackRes.records) {
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

function buildResponse(
  finMap: Map<string, { pe: number | null; pb: number | null; totalMv: number | null; turnoverRate: number | null; close: number | null }> | null,
): NextResponse {
  const hasFinancial = finMap != null && finMap.size > 0;

  // ── 构建带评分的股票列表 ───────────────────────────────────────────────
  const stocks = PCB_STOCKS.map(s => {
    const fin = finMap?.get(s.tsCode);
    const score = calcPcbScore(s, {
      pe:  fin?.pe  ?? null,
      pb:  fin?.pb  ?? null,
    });
    return {
      tsCode:                s.tsCode,
      symbol:                s.symbol,
      name:                  s.name,
      segment:               s.segment,
      investmentGroups:      s.investmentGroups,
      techBarrier:           s.techBarrier,
      localizationSpace:     s.localizationSpace,
      downstreamApplications: s.downstreamApplications,
      note:                  s.note,
      isCore:                s.isCore,
      // 财务数据（来自 Tushare）
      pe:          fin?.pe   ?? null,
      pb:          fin?.pb   ?? null,
      totalMv:     fin?.totalMv   ?? null,    // 万元
      turnoverRate: fin?.turnoverRate ?? null,
      close:       fin?.close  ?? null,
      // PCB 策略评分
      score,
    };
  });

  // ── 按投资逻辑分组 ─────────────────────────────────────────────────────
  const groups = PCB_INVESTMENT_GROUPS.map(g => ({
    ...g,
    stocks: stocks.filter(s => s.investmentGroups.includes(g.key)),
  }));

  // ── 核心股票池 ─────────────────────────────────────────────────────────
  const corePool = stocks.filter(s => s.isCore);

  // ── 汇总统计 ───────────────────────────────────────────────────────────
  const avgScore = Math.round(
    corePool.reduce((sum, s) => sum + s.score.totalScore, 0) / (corePool.length || 1)
  );

  return NextResponse.json({
    ok:           true,
    totalStocks:  stocks.length,
    coreCount:    corePool.length,
    hasFinancial,
    tradeDate:    hasFinancial ? "最新可用交易日" : null,
    corePool,
    groups,
    allStocks:    stocks,
    stats: {
      avgScore,
      bySegment: Object.fromEntries(
        ["PCB制造", "覆铜板材料", "PCB设备耗材", "柔性PCB/FPC", "AI服务器PCB", "汽车电子PCB"].map(seg => [
          seg,
          stocks.filter(s => s.segment === seg).length,
        ])
      ),
    },
    risks:      PCB_COMMON_RISKS,
    disclaimer: "产业链分类基于公开市场信息整理，不代表具体客户/供应商关系，需人工复核，不构成投资建议",
    note:       "财务数据来自 Tushare Pro 接口，PE/PB 为最新一期数据",
    fetchedAt:  new Date().toISOString(),
  });
}
