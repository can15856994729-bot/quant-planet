/**
 * lib/stDelistingRiskFilter.ts
 *
 * ST 退市风险过滤器
 *
 * 基于财务数据对 ST 股票进行退市风险评分（0-100，越高风险越大）。
 * 用于在极限反转策略中过滤高退市风险标的。
 *
 * ⚠️ 服务端专用，不可在 Client Component 中直接 import。
 * 安全约束：不直接访问 TUSHARE_TOKEN，通过已有服务获取数据。
 * 缓存：24h Map-based TTL cache
 */

import {
  getProfitSummary,
  getCashflowSummary,
  getFinancialSafetySummary,
} from "./financialService";

// ── 缓存 ─────────────────────────────────────────────────────────────
const DELISTING_RISK_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

interface DelistingRiskCacheEntry {
  result: DelistingRiskResult;
  expiresAt: number;
}
const _delistingRiskCache = new Map<string, DelistingRiskCacheEntry>();

// ── 类型定义 ─────────────────────────────────────────────────────────

export interface DelistingRiskResult {
  ok: boolean;
  tsCode: string;
  symbol: string;
  delistingRiskScore: number;    // 0-100, higher = more risk
  riskLevel: "低" | "中" | "高" | "极高";
  excluded: boolean;             // true if score > threshold
  degraded: boolean;             // true if data unavailable
  riskFlags: string[];           // human-readable risk flags
  positiveFlags: string[];       // positive signs
  announcementRiskDegraded: boolean; // always true (announcement data not available)
  source: "Tushare";
  updatedAt: string;
  fromCache?: boolean;
}

// ── 工具函数 ─────────────────────────────────────────────────────────

function tsCodeToSymbol(tsCode: string): string {
  return tsCode.split(".")[0] ?? tsCode;
}

function getRiskLevel(score: number): "低" | "中" | "高" | "极高" {
  if (score <= 30) return "低";
  if (score <= 60) return "中";
  if (score <= 80) return "高";
  return "极高";
}

// ── 核心评分函数 ─────────────────────────────────────────────────────

/**
 * 计算退市风险评分
 *
 * @param tsCode   Tushare 股票代码，如 "600519.SH"
 * @param refresh  为 true 时强制绕过缓存
 * @param maxScore 排除阈值（默认 40）
 */
export async function calculateDelistingRiskScore(
  tsCode: string,
  refresh = false,
  maxScore = 40,
): Promise<DelistingRiskResult> {
  const now = new Date().toISOString();
  const symbol = tsCodeToSymbol(tsCode);

  // 缓存命中
  if (!refresh) {
    const hit = _delistingRiskCache.get(tsCode);
    if (hit && Date.now() < hit.expiresAt) {
      return { ...hit.result, fromCache: true };
    }
  }

  // 并行获取三类财务数据
  const [profitRes, cashflowRes, safetyRes] = await Promise.all([
    getProfitSummary(tsCode, 4, refresh),
    getCashflowSummary(tsCode, 4, refresh),
    getFinancialSafetySummary(tsCode, 2, refresh),
  ]);

  // 数据不可用时降级处理
  const profitOk  = profitRes.ok  && profitRes.items.length > 0;
  const cashflowOk = cashflowRes.ok && cashflowRes.items.length > 0;
  const safetyOk  = safetyRes.ok  && safetyRes.items.length > 0;

  if (!profitOk && !cashflowOk && !safetyOk) {
    const result: DelistingRiskResult = {
      ok: true,
      tsCode,
      symbol,
      delistingRiskScore: 50,
      riskLevel: "中",
      excluded: 50 > maxScore,
      degraded: true,
      riskFlags: ["财务数据不可用，使用保守估计"],
      positiveFlags: [],
      announcementRiskDegraded: true,
      source: "Tushare",
      updatedAt: now,
    };
    _delistingRiskCache.set(tsCode, { result, expiresAt: Date.now() + DELISTING_RISK_CACHE_TTL });
    return result;
  }

  let score = 0;
  const riskFlags: string[] = [];
  const positiveFlags: string[] = [];
  const degraded = !profitOk || !cashflowOk || !safetyOk;

  // ── 净资产相关 ──────────────────────────────────────────────────────
  if (safetyOk && safetyRes.items.length > 0) {
    const latestSafety = safetyRes.items[0];
    const { netAssets, debtToAssets, currentRatio, monetaryFunds, shortTermBorrowings, goodwillToNetAssets } = latestSafety;

    // 净资产 < 0：直接退市触发
    if (netAssets !== null && netAssets < 0) {
      score += 50;
      riskFlags.push(`净资产为负（${(netAssets / 1e8).toFixed(2)}亿元），已触发退市财务条件`);
    }

    // 资产负债率
    if (debtToAssets !== null) {
      if (debtToAssets > 0.90) {
        score += 30;
        riskFlags.push(`资产负债率过高（${(debtToAssets * 100).toFixed(1)}% > 90%）`);
      } else if (debtToAssets > 0.85) {
        score += 20;
        riskFlags.push(`资产负债率极高（${(debtToAssets * 100).toFixed(1)}% > 85%）`);
      } else if (debtToAssets > 0.75) {
        score += 10;
        riskFlags.push(`资产负债率偏高（${(debtToAssets * 100).toFixed(1)}% > 75%）`);
      }
    }

    // 流动比率
    if (currentRatio !== null) {
      if (currentRatio < 0.5) {
        score += 15;
        riskFlags.push(`流动比率过低（${currentRatio.toFixed(2)} < 0.5），短期偿债能力严重不足`);
      } else if (currentRatio < 1.0) {
        score += 8;
        riskFlags.push(`流动比率偏低（${currentRatio.toFixed(2)} < 1.0），流动负债超过流动资产`);
      }
    }

    // 货币资金 vs 短期借款
    if (monetaryFunds !== null && shortTermBorrowings !== null && shortTermBorrowings > 0) {
      if (monetaryFunds < shortTermBorrowings * 0.5) {
        score += 12;
        riskFlags.push(`货币资金（${(monetaryFunds / 1e8).toFixed(2)}亿）不足短期借款（${(shortTermBorrowings / 1e8).toFixed(2)}亿）的50%`);
      }
    }

    // 商誉占净资产比
    if (goodwillToNetAssets !== null && netAssets !== null && netAssets > 0) {
      if (goodwillToNetAssets > 0.50) {
        score += 15;
        riskFlags.push(`商誉占净资产比过高（${(goodwillToNetAssets * 100).toFixed(1)}% > 50%），存在大额减值风险`);
      } else if (goodwillToNetAssets > 0.30) {
        score += 8;
        riskFlags.push(`商誉占净资产比偏高（${(goodwillToNetAssets * 100).toFixed(1)}% > 30%）`);
      }
    }
  }

  // ── 盈利相关 ──────────────────────────────────────────────────────
  if (profitOk && profitRes.items.length > 0) {
    const latestProfit = profitRes.items[0];
    const prevProfit   = profitRes.items.length > 1 ? profitRes.items[1] : null;

    const latestNetProfit       = latestProfit.netProfit;
    const latestDeductedNetProfit = latestProfit.deductedNetProfit;
    const prevNetProfit         = prevProfit?.netProfit ?? null;

    // 连续亏损（最近2期净利润均为负）
    if (latestNetProfit !== null && latestNetProfit < 0 && prevNetProfit !== null && prevNetProfit < 0) {
      score += 25;
      riskFlags.push(`连续两期净利润亏损（最近：${(latestNetProfit / 1e8).toFixed(2)}亿，上期：${(prevNetProfit / 1e8).toFixed(2)}亿）`);
    }

    // 扣非净利润为负
    if (latestDeductedNetProfit !== null && latestDeductedNetProfit < 0) {
      score += 10;
      riskFlags.push(`扣非净利润为负（${(latestDeductedNetProfit / 1e8).toFixed(2)}亿），主业亏损`);
    }

    // 正向：净利润为正
    if (latestNetProfit !== null && latestNetProfit > 0) {
      score -= 10;
      positiveFlags.push(`最近期净利润为正（${(latestNetProfit / 1e8).toFixed(2)}亿）`);
    }

    // 正向：扣非净利润为正
    if (latestDeductedNetProfit !== null && latestDeductedNetProfit > 0) {
      score -= 5;
      positiveFlags.push(`扣非净利润为正（${(latestDeductedNetProfit / 1e8).toFixed(2)}亿），主业盈利`);
    }
  }

  // ── 现金流相关 ────────────────────────────────────────────────────
  if (cashflowOk && cashflowRes.items.length >= 2) {
    const latestCf = cashflowRes.items[0];
    const prevCf   = cashflowRes.items[1];
    const latestOcf = latestCf.operatingCashflow;
    const prevOcf   = prevCf.operatingCashflow;

    // 连续2期经营现金流为负
    if (latestOcf !== null && latestOcf < 0 && prevOcf !== null && prevOcf < 0) {
      score += 15;
      riskFlags.push(`连续两期经营现金流为负，现金持续流出`);
    }

    // 正向：经营现金流为正
    if (latestOcf !== null && latestOcf > 0) {
      score -= 8;
      positiveFlags.push(`最近期经营现金流为正（${(latestOcf / 1e8).toFixed(2)}亿）`);
    }
  } else if (cashflowOk && cashflowRes.items.length === 1) {
    const latestCf = cashflowRes.items[0];
    const latestOcf = latestCf.operatingCashflow;
    if (latestOcf !== null && latestOcf > 0) {
      score -= 8;
      positiveFlags.push(`最近期经营现金流为正（${(latestOcf / 1e8).toFixed(2)}亿）`);
    }
  }

  // ── 数据降级处理 ──────────────────────────────────────────────────
  if (degraded) {
    // 部分数据不可用时，适当提高保守性
    if (!profitOk) riskFlags.push("利润数据不可用，已降级处理");
    if (!cashflowOk) riskFlags.push("现金流数据不可用，已降级处理");
    if (!safetyOk) riskFlags.push("资产负债数据不可用，已降级处理");
  }

  // ── 钳位到 0-100 ──────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  const result: DelistingRiskResult = {
    ok: true,
    tsCode,
    symbol,
    delistingRiskScore: score,
    riskLevel: getRiskLevel(score),
    excluded: score > maxScore,
    degraded,
    riskFlags,
    positiveFlags,
    announcementRiskDegraded: true,
    source: "Tushare",
    updatedAt: now,
  };

  _delistingRiskCache.set(tsCode, { result, expiresAt: Date.now() + DELISTING_RISK_CACHE_TTL });
  return result;
}

/**
 * 快速检查是否没有主要退市风险（用于扫描过滤）
 *
 * @param tsCode   Tushare 股票代码
 * @param maxScore 排除阈值（默认 40）
 */
export async function checkNoMajorDelistingRisk(
  tsCode: string,
  maxScore = 40,
): Promise<boolean> {
  const result = await calculateDelistingRiskScore(tsCode, false, maxScore);
  return result.ok && !result.excluded;
}

/**
 * 清除退市风险缓存
 *
 * @param tsCode 不传则清除全部
 */
export function clearDelistingRiskCache(tsCode?: string): void {
  if (tsCode) {
    _delistingRiskCache.delete(tsCode);
  } else {
    _delistingRiskCache.clear();
  }
}
