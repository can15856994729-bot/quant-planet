/**
 * lib/fundamentalScoreService.ts
 *
 * A股基本面综合评分系统（0-100分）
 *
 * 评分维度权重：
 *   盈利能力   25%  — ROE / 毛利率 / 净利率 / EPS
 *   成长能力   25%  — 营收YoY / 净利润YoY / 扣非YoY / 4期趋势
 *   现金流质量 20%  — 经营CF / FCF / CF/NP / 4期趋势
 *   财务安全   20%  — 资负率 / 流动比率 / 速动比率 / 商誉 / 应收
 *   估值合理性 10%  — PE/PB历史分位 / PEG / 股息率
 *
 * 安全约束：不直接访问 TUSHARE_TOKEN，通过已有服务获取数据。
 * 缓存：7天（财报数据变化缓慢）
 */

import {
  getProfitSummary,
  getCashflowSummary,
  getFinancialSafetySummary,
  getFinancialTrendSummary,
  type ProfitSummaryItem,
  type CashflowSummaryItem,
  type BalanceSafetySummaryItem,
  type FinancialTrendAnalysis,
  type FinancialTrendPeriod,
  type TrendDirection,
} from "./financialService";
import { getValuationSummary, type ValuationSummaryItem } from "./valuationService";
import { hasTushareToken } from "./tushareService";

// ── 缓存 ─────────────────────────────────────────────────────────────
const SCORE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

interface ScoreCacheEntry {
  result:    FundamentalScoreResult;
  expiresAt: number;
}
const _scoreCache = new Map<string, ScoreCacheEntry>();

export function clearFundamentalScoreCache(tsCode?: string): void {
  if (tsCode) {
    for (const k of _scoreCache.keys()) if (k.startsWith(`fs::${tsCode}`)) _scoreCache.delete(k);
  } else {
    _scoreCache.clear();
  }
}

// ── 类型定义 ─────────────────────────────────────────────────────────

export type FundamentalRating = "优秀" | "良好" | "一般" | "较差";

export interface DimensionScore {
  score:         number;    // 0-100
  weight:        number;    // 25 / 25 / 20 / 20 / 10
  factors:       string[];  // 人可读的因子描述
  missingFields: string[];  // 缺失字段
  degraded:      boolean;   // 可用字段 < 50% 时为 true
}

export interface FundamentalScores {
  profitability:  DimensionScore;
  growth:         DimensionScore;
  cashflowQuality: DimensionScore;
  financialSafety: DimensionScore;
  valuation:      DimensionScore;
}

export interface FundamentalScoreResult {
  ok:           boolean;
  tsCode:       string;
  symbol:       string;
  reportDate:   string | null;
  totalScore:   number;
  rating:       FundamentalRating;
  scores:       FundamentalScores;
  strengths:    string[];
  risks:        string[];
  missingFields: string[];
  degraded:     boolean;
  fromCache?:   boolean;
  error?:       string;
  source:       "Tushare";
  updatedAt:    string;
}

// ── 工具函数 ─────────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function trendAdj(trend: TrendDirection, bonus: number, penalty: number): number {
  if (trend === "improving") return bonus;
  if (trend === "worsening") return -penalty;
  return 0;
}

function ratingFromScore(score: number): FundamentalRating {
  if (score >= 80) return "优秀";
  if (score >= 60) return "良好";
  if (score >= 40) return "一般";
  return "较差";
}

function tsCodeToSymbol(tsCode: string): string {
  return tsCode.split(".")[0] ?? tsCode;
}

// ── 维度评分函数 ──────────────────────────────────────────────────────

/**
 * 盈利能力评分（25%）
 * 字段：ROE（来自趋势最新期）/ 毛利率 / 净利率 / EPS
 */
function calcProfitabilityScore(
  profitItem:  ProfitSummaryItem | null,
  trendLatest: FinancialTrendPeriod | null,
): DimensionScore {
  let raw = 50;
  const factors: string[] = [];
  const missing: string[] = [];
  let available = 0;
  const total = 4; // ROE, grossMargin, netMargin, EPS

  // ROE（来自 fina_indicator，通过 trendLatest.roe）
  const roe = trendLatest?.roe ?? null;
  if (roe != null) {
    available++;
    if      (roe > 20)  { raw += 25; factors.push(`ROE ${roe.toFixed(1)}%（优秀）`); }
    else if (roe > 15)  { raw += 18; factors.push(`ROE ${roe.toFixed(1)}%（良好）`); }
    else if (roe > 10)  { raw += 10; factors.push(`ROE ${roe.toFixed(1)}%（中等）`); }
    else if (roe > 5)   { raw += 2;  factors.push(`ROE ${roe.toFixed(1)}%（偏低）`); }
    else if (roe > 0)   { raw -= 5;  factors.push(`ROE ${roe.toFixed(1)}%（较低）`); }
    else                { raw -= 22; factors.push(`ROE ${roe.toFixed(1)}%（为负）`); }
  } else {
    missing.push("ROE");
  }

  // 毛利率
  const grossMargin = profitItem?.grossMargin ?? null;
  if (grossMargin != null) {
    available++;
    if      (grossMargin > 60) { raw += 18; factors.push(`毛利率 ${grossMargin.toFixed(1)}%（高）`); }
    else if (grossMargin > 40) { raw += 12; factors.push(`毛利率 ${grossMargin.toFixed(1)}%`); }
    else if (grossMargin > 20) { raw += 6;  factors.push(`毛利率 ${grossMargin.toFixed(1)}%`); }
    else if (grossMargin > 10) { raw += 2;  factors.push(`毛利率 ${grossMargin.toFixed(1)}%（偏低）`); }
    else                       { raw -= 2;  factors.push(`毛利率 ${grossMargin.toFixed(1)}%（较低）`); }
  } else {
    missing.push("毛利率");
  }

  // 净利率
  const netMargin = profitItem?.netMargin ?? null;
  if (netMargin != null) {
    available++;
    if      (netMargin > 20) { raw += 12; factors.push(`净利率 ${netMargin.toFixed(1)}%（高）`); }
    else if (netMargin > 10) { raw += 8;  factors.push(`净利率 ${netMargin.toFixed(1)}%`); }
    else if (netMargin > 5)  { raw += 4;  factors.push(`净利率 ${netMargin.toFixed(1)}%`); }
    else if (netMargin > 0)  { raw += 0;  factors.push(`净利率 ${netMargin.toFixed(1)}%（偏低）`); }
    else                     { raw -= 12; factors.push(`净利率 ${netMargin.toFixed(1)}%（为负）`); }
  } else {
    missing.push("净利率");
  }

  // EPS
  const eps = profitItem?.eps ?? null;
  if (eps != null) {
    available++;
    if (eps > 0) { raw += 5; factors.push(`EPS ${eps.toFixed(2)}元（为正）`); }
    else         { raw -= 8; factors.push(`EPS ${eps.toFixed(2)}元（为负）`); }
  } else {
    missing.push("EPS");
  }

  const degraded = available < total / 2;
  return { score: clamp(raw), weight: 25, factors, missingFields: missing, degraded };
}

/**
 * 成长能力评分（25%）
 * 字段：营收YoY / 净利润YoY / 扣非YoY + 4期趋势
 */
function calcGrowthScore(
  profitItem:  ProfitSummaryItem | null,
  trendAnalysis: FinancialTrendAnalysis | null,
): DimensionScore {
  let raw = 50;
  const factors: string[] = [];
  const missing: string[] = [];
  let available = 0;
  const total = 5; // revenueYoY, netProfitYoY, deductedYoY, revenueTrend, profitTrend

  // 营收同比
  const revYoY = profitItem?.revenueYoY ?? null;
  if (revYoY != null) {
    available++;
    if      (revYoY > 30)  { raw += 18; factors.push(`营收同比 +${revYoY.toFixed(1)}%（高增长）`); }
    else if (revYoY > 20)  { raw += 13; factors.push(`营收同比 +${revYoY.toFixed(1)}%（稳健增长）`); }
    else if (revYoY > 10)  { raw += 7;  factors.push(`营收同比 +${revYoY.toFixed(1)}%`); }
    else if (revYoY > 0)   { raw += 2;  factors.push(`营收同比 +${revYoY.toFixed(1)}%（低增长）`); }
    else if (revYoY > -10) { raw -= 5;  factors.push(`营收同比 ${revYoY.toFixed(1)}%（轻微下滑）`); }
    else                   { raw -= 15; factors.push(`营收同比 ${revYoY.toFixed(1)}%（下滑）`); }
  } else {
    missing.push("营收同比");
  }

  // 净利润同比
  const npYoY = profitItem?.netProfitYoY ?? null;
  if (npYoY != null) {
    available++;
    if      (npYoY > 30)  { raw += 18; factors.push(`净利润同比 +${npYoY.toFixed(1)}%（高增长）`); }
    else if (npYoY > 20)  { raw += 13; factors.push(`净利润同比 +${npYoY.toFixed(1)}%`); }
    else if (npYoY > 10)  { raw += 7;  factors.push(`净利润同比 +${npYoY.toFixed(1)}%`); }
    else if (npYoY > 0)   { raw += 2;  factors.push(`净利润同比 +${npYoY.toFixed(1)}%（低增长）`); }
    else                  { raw -= 12; factors.push(`净利润同比 ${npYoY.toFixed(1)}%（下滑）`); }
  } else {
    missing.push("净利润同比");
  }

  // 扣非净利润同比
  const dtYoY = profitItem?.deductedNetProfitYoY ?? null;
  if (dtYoY != null) {
    available++;
    if (dtYoY > 0) { raw += 5; factors.push(`扣非净利润同比 +${dtYoY.toFixed(1)}%（正增长）`); }
    else           { raw -= 8; factors.push(`扣非净利润同比 ${dtYoY.toFixed(1)}%（下滑）`); }
  } else {
    missing.push("扣非净利润同比");
  }

  // 营收趋势
  const revTrend = trendAnalysis?.revenueTrend ?? "insufficient_data";
  if (revTrend !== "insufficient_data") {
    available++;
    raw += trendAdj(revTrend, 8, 10);
    if (revTrend === "improving") factors.push("营收近4期持续改善");
    if (revTrend === "worsening") factors.push("营收近4期持续下滑");
  } else {
    missing.push("营收趋势");
  }

  // 净利润趋势
  const npTrend = trendAnalysis?.netProfitTrend ?? "insufficient_data";
  if (npTrend !== "insufficient_data") {
    available++;
    raw += trendAdj(npTrend, 8, 10);
    if (npTrend === "improving") factors.push("净利润近4期持续改善");
    if (npTrend === "worsening") factors.push("净利润近4期持续下滑");
  } else {
    missing.push("净利润趋势");
  }

  const degraded = available < total / 2;
  return { score: clamp(raw), weight: 25, factors, missingFields: missing, degraded };
}

/**
 * 现金流质量评分（20%）
 * 字段：经营CF / FCF / CF/NP比率 + 4期趋势
 */
function calcCashflowScore(
  cfItem:      CashflowSummaryItem | null,
  trendAnalysis: FinancialTrendAnalysis | null,
): DimensionScore {
  let raw = 50;
  const factors: string[] = [];
  const missing: string[] = [];
  let available = 0;
  const total = 4; // operatingCF, CF/NP, FCF, trend

  // 经营现金流
  const ocf = cfItem?.operatingCashflow ?? null;
  if (ocf != null) {
    available++;
    if (ocf > 0) { raw += 15; factors.push("经营现金流为正"); }
    else         { raw -= 20; factors.push("经营现金流为负"); }
  } else {
    missing.push("经营现金流");
  }

  // CF/NP 比率（经营现金流/净利润）
  const cfnp = cfItem?.operatingCashflowToNetProfit ?? null;
  if (cfnp != null && isFinite(cfnp)) {
    available++;
    if      (cfnp > 1.5) { raw += 20; factors.push(`CF/净利润 ${cfnp.toFixed(2)}x（利润含金量高）`); }
    else if (cfnp > 1.0) { raw += 14; factors.push(`CF/净利润 ${cfnp.toFixed(2)}x`); }
    else if (cfnp > 0.5) { raw += 6;  factors.push(`CF/净利润 ${cfnp.toFixed(2)}x（中等）`); }
    else if (cfnp > 0)   { raw += 0;  factors.push(`CF/净利润 ${cfnp.toFixed(2)}x（偏低）`); }
    else                 { raw -= 8;  factors.push(`CF/净利润 ${cfnp.toFixed(2)}x（质量差）`); }
  } else {
    missing.push("CF/净利润比率");
  }

  // 自由现金流
  const fcf = cfItem?.freeCashflow ?? null;
  if (fcf != null) {
    available++;
    if (fcf > 0) { raw += 10; factors.push("自由现金流为正"); }
    else         { raw -= 10; factors.push("自由现金流为负"); }
  } else {
    missing.push("自由现金流");
  }

  // 经营现金流趋势
  const cfTrend = trendAnalysis?.operatingCashflowTrend ?? "insufficient_data";
  if (cfTrend !== "insufficient_data") {
    available++;
    raw += trendAdj(cfTrend, 8, 12);
    if (cfTrend === "improving") factors.push("经营现金流近4期持续改善");
    if (cfTrend === "worsening") factors.push("经营现金流近4期持续恶化");
  } else {
    missing.push("现金流趋势");
  }

  const degraded = available < total / 2;
  return { score: clamp(raw), weight: 20, factors, missingFields: missing, degraded };
}

/**
 * 财务安全评分（20%）
 * 字段：资负率 / 流动比率 / 速动比率 / 商誉占比 / 货币资金 vs 短借
 */
function calcSafetyScore(
  safetyItem: BalanceSafetySummaryItem | null,
): DimensionScore {
  if (!safetyItem) {
    return {
      score: 50, weight: 20,
      factors: ["财务安全数据暂缺，使用中性分"],
      missingFields: ["资产负债率", "流动比率", "速动比率", "商誉占比"],
      degraded: true,
    };
  }

  let raw = 50;
  const factors: string[] = [];
  const missing: string[] = [];
  let available = 0;
  const total = 5;

  // 资产负债率（小数，0.65=65%）
  const dta = safetyItem.debtToAssets;
  if (dta != null) {
    available++;
    // 净资产为负时严厉惩罚
    if ((safetyItem.netAssets ?? 0) < 0) {
      raw -= 30; factors.push("净资产为负（高风险）");
    } else if (dta < 0.30) { raw += 20; factors.push(`资产负债率 ${(dta*100).toFixed(1)}%（低）`); }
    else if   (dta < 0.50) { raw += 12; factors.push(`资产负债率 ${(dta*100).toFixed(1)}%`); }
    else if   (dta < 0.70) { raw += 3;  factors.push(`资产负债率 ${(dta*100).toFixed(1)}%（中等）`); }
    else if   (dta < 0.85) { raw -= 12; factors.push(`资产负债率 ${(dta*100).toFixed(1)}%（偏高）`); }
    else                   { raw -= 25; factors.push(`资产负债率 ${(dta*100).toFixed(1)}%（过高）`); }
  } else {
    missing.push("资产负债率");
  }

  // 流动比率
  const cr = safetyItem.currentRatio;
  if (cr != null) {
    available++;
    if      (cr > 2.0) { raw += 15; factors.push(`流动比率 ${cr.toFixed(2)}（良好）`); }
    else if (cr > 1.5) { raw += 10; factors.push(`流动比率 ${cr.toFixed(2)}`); }
    else if (cr > 1.0) { raw += 4;  factors.push(`流动比率 ${cr.toFixed(2)}（偏低）`); }
    else if (cr > 0.5) { raw -= 10; factors.push(`流动比率 ${cr.toFixed(2)}（不足1）`); }
    else               { raw -= 20; factors.push(`流动比率 ${cr.toFixed(2)}（严重不足）`); }
  } else {
    missing.push("流动比率");
  }

  // 速动比率
  const qr = safetyItem.quickRatio;
  if (qr != null) {
    available++;
    if      (qr > 1.0) { raw += 8; factors.push(`速动比率 ${qr.toFixed(2)}（充裕）`); }
    else if (qr > 0.7) { raw += 4; factors.push(`速动比率 ${qr.toFixed(2)}`); }
    else if (qr > 0.4) { raw += 0; factors.push(`速动比率 ${qr.toFixed(2)}（偏低）`); }
    else               { raw -= 6; factors.push(`速动比率 ${qr.toFixed(2)}（不足）`); }
  } else {
    missing.push("速动比率");
  }

  // 商誉占净资产（小数）
  const gna = safetyItem.goodwillToNetAssets;
  if (gna != null) {
    available++;
    if      (gna > 0.50) { raw -= 18; factors.push(`商誉占净资产 ${(gna*100).toFixed(1)}%（过高）`); }
    else if (gna > 0.30) { raw -= 8;  factors.push(`商誉占净资产 ${(gna*100).toFixed(1)}%（偏高）`); }
    else if (gna > 0.10) { raw -= 3;  factors.push(`商誉占净资产 ${(gna*100).toFixed(1)}%`); }
    else                 { factors.push(`商誉占净资产 ${(gna*100).toFixed(1)}%（低）`); }
  } else {
    missing.push("商誉占净资产");
  }

  // 货币资金 vs 短期借款（流动性覆盖）
  const mf = safetyItem.monetaryFunds;
  const stb = safetyItem.shortTermBorrowings;
  if (mf != null && stb != null) {
    available++;
    if      (stb === 0 || mf > stb)        { raw += 5; factors.push("货币资金充足（可覆盖短借）"); }
    else if (mf > stb * 0.5)               { /* neutral */ }
    else                                   { raw -= 5; factors.push("货币资金不足以覆盖短期借款"); }
  } else if (mf != null && stb == null) {
    // 无短借记录视为无压力
    available++;
    factors.push("无短期借款记录");
  } else {
    missing.push("货币资金/短期借款");
  }

  const degraded = available < total / 2;
  return { score: clamp(raw), weight: 20, factors, missingFields: missing, degraded };
}

/**
 * 估值合理性评分（10%）
 * 字段：PE/PB历史分位 / PEG / 股息率
 */
function calcValuationScore(
  valItem: ValuationSummaryItem | null,
): DimensionScore {
  if (!valItem) {
    return {
      score: 50, weight: 10,
      factors: ["估值数据暂缺，使用中性分"],
      missingFields: ["PE历史分位", "PB历史分位", "PEG", "股息率"],
      degraded: true,
    };
  }

  let raw = 50;
  const factors: string[] = [];
  const missing: string[] = [];
  let available = 0;
  const total = 4;

  // PE 历史分位
  const pePct = valItem.pePercentile;
  if (pePct != null) {
    available++;
    if      (pePct < 0.20) { raw += 22; factors.push(`PE分位 ${(pePct*100).toFixed(0)}%（历史低位）`); }
    else if (pePct < 0.40) { raw += 12; factors.push(`PE分位 ${(pePct*100).toFixed(0)}%（偏低）`); }
    else if (pePct < 0.60) { raw += 0;  factors.push(`PE分位 ${(pePct*100).toFixed(0)}%（中性）`); }
    else if (pePct < 0.80) { raw -= 12; factors.push(`PE分位 ${(pePct*100).toFixed(0)}%（偏高）`); }
    else                   { raw -= 22; factors.push(`PE分位 ${(pePct*100).toFixed(0)}%（历史高位）`); }
  } else if (valItem.pe != null && valItem.pe < 0) {
    // PE 为负（亏损）
    available++;
    factors.push("PE为负（当前亏损，估值不可比较）");
  } else {
    missing.push("PE历史分位");
  }

  // PB 历史分位
  const pbPct = valItem.pbPercentile;
  if (pbPct != null) {
    available++;
    if      (pbPct < 0.20) { raw += 16; factors.push(`PB分位 ${(pbPct*100).toFixed(0)}%（历史低位）`); }
    else if (pbPct < 0.40) { raw += 8;  factors.push(`PB分位 ${(pbPct*100).toFixed(0)}%（偏低）`); }
    else if (pbPct < 0.60) { raw += 0;  factors.push(`PB分位 ${(pbPct*100).toFixed(0)}%（中性）`); }
    else if (pbPct < 0.80) { raw -= 8;  factors.push(`PB分位 ${(pbPct*100).toFixed(0)}%（偏高）`); }
    else                   { raw -= 16; factors.push(`PB分位 ${(pbPct*100).toFixed(0)}%（历史高位）`); }
  } else {
    missing.push("PB历史分位");
  }

  // PEG
  const peg = valItem.peg;
  if (peg != null && peg > 0) {
    available++;
    if      (peg < 0.5) { raw += 12; factors.push(`PEG ${peg.toFixed(2)}（低，成长匹配好）`); }
    else if (peg < 1.0) { raw += 8;  factors.push(`PEG ${peg.toFixed(2)}（合理）`); }
    else if (peg < 2.0) { raw += 2;  factors.push(`PEG ${peg.toFixed(2)}（偏高）`); }
    else                { raw -= 10; factors.push(`PEG ${peg.toFixed(2)}（过高）`); }
  } else if (peg == null || peg <= 0) {
    missing.push("PEG");
  }

  // 股息率
  const dy = valItem.dividendYield ?? valItem.dividendYieldTtm;
  if (dy != null) {
    available++;
    if      (dy > 4) { raw += 10; factors.push(`股息率 ${dy.toFixed(2)}%（高，分红吸引力强）`); }
    else if (dy > 2) { raw += 5;  factors.push(`股息率 ${dy.toFixed(2)}%`); }
    else if (dy > 1) { raw += 2;  factors.push(`股息率 ${dy.toFixed(2)}%`); }
    else             { factors.push("股息率较低"); }
  } else {
    missing.push("股息率");
  }

  const degraded = available < total / 2;
  return { score: clamp(raw), weight: 10, factors, missingFields: missing, degraded };
}

// ── 优势 / 风险 生成 ──────────────────────────────────────────────────

function generateStrengths(scores: FundamentalScores): string[] {
  const s: string[] = [];

  // 盈利能力优势
  if (scores.profitability.score >= 70) {
    const f = scores.profitability.factors;
    if (f.some(x => x.includes("ROE") && (x.includes("优秀") || x.includes("良好")))) s.push("ROE 较高，盈利能力强");
    if (f.some(x => x.includes("毛利率") && x.includes("高"))) s.push("毛利率较高，产品竞争力强");
    if (f.some(x => x.includes("净利率") && x.includes("高"))) s.push("净利率稳定");
    if (f.some(x => x.includes("EPS") && x.includes("为正"))) s.push("每股收益为正");
  }

  // 成长能力优势
  if (scores.growth.score >= 70) {
    const f = scores.growth.factors;
    if (f.some(x => x.includes("营收同比") && x.includes("+"))) s.push("营收保持增长");
    if (f.some(x => x.includes("净利润同比") && x.includes("+"))) s.push("净利润同比改善");
    if (f.some(x => x.includes("扣非") && x.includes("+"))) s.push("扣非净利润改善");
    if (f.some(x => x.includes("持续改善"))) s.push("近4期基本面持续向好");
  }

  // 现金流优势
  if (scores.cashflowQuality.score >= 70) {
    const f = scores.cashflowQuality.factors;
    if (f.some(x => x.includes("经营现金流为正"))) s.push("经营现金流稳定");
    if (f.some(x => x.includes("CF/净利润") && (x.includes("1.") || x.includes("2.")))) s.push("现金流覆盖净利润");
    if (f.some(x => x.includes("自由现金流为正"))) s.push("自由现金流充裕");
  }

  // 财务安全优势
  if (scores.financialSafety.score >= 70) {
    const f = scores.financialSafety.factors;
    if (f.some(x => x.includes("资产负债率") && x.includes("低"))) s.push("资产负债率较低，财务稳健");
    if (f.some(x => x.includes("流动比率") && x.includes("良好"))) s.push("流动比率良好，短期偿债能力强");
    if (f.some(x => x.includes("货币资金充足"))) s.push("货币资金充裕");
  }

  // 估值优势
  if (scores.valuation.score >= 70) {
    const f = scores.valuation.factors;
    if (f.some(x => x.includes("PE分位") && x.includes("低位"))) s.push("PE处于历史低位，估值具吸引力");
    if (f.some(x => x.includes("PB分位") && x.includes("低位"))) s.push("PB处于历史低位");
    if (f.some(x => x.includes("股息率") && (x.includes("高") || parseFloat(x.match(/\d+\.\d+%/)?.[0] ?? "0") > 2))) s.push("股息率较高，具备配置价值");
  }

  return s.slice(0, 6); // 最多展示 6 条优势
}

function generateRisks(scores: FundamentalScores, trendAnalysis: FinancialTrendAnalysis | null): string[] {
  const r: string[] = [];

  if (scores.profitability.score < 50) {
    const f = scores.profitability.factors;
    if (f.some(x => x.includes("ROE") && (x.includes("为负") || x.includes("较低")))) r.push("ROE 偏低，盈利能力不足");
    if (f.some(x => x.includes("净利率") && x.includes("为负"))) r.push("净利率为负，主营亏损");
    if (f.some(x => x.includes("EPS") && x.includes("为负"))) r.push("EPS 为负，每股亏损");
  }

  if (scores.growth.score < 50) {
    const f = scores.growth.factors;
    if (f.some(x => x.includes("营收同比") && x.includes("下滑"))) r.push("营收同比下滑");
    if (f.some(x => x.includes("净利润同比") && x.includes("下滑"))) r.push("净利润同比下滑，盈利承压");
    if (f.some(x => x.includes("持续下滑"))) r.push("近4期基本面持续恶化");
  }

  if (scores.cashflowQuality.score < 50) {
    const f = scores.cashflowQuality.factors;
    if (f.some(x => x.includes("经营现金流为负"))) r.push("经营现金流为负，利润质量风险");
    if (f.some(x => x.includes("CF/净利润") && x.includes("质量差"))) r.push("利润现金含量偏低");
    if (f.some(x => x.includes("自由现金流为负"))) r.push("自由现金流持续为负");
  }

  if (scores.financialSafety.score < 50) {
    const f = scores.financialSafety.factors;
    if (f.some(x => x.includes("净资产为负"))) r.push("净资产为负，财务风险极高");
    if (f.some(x => x.includes("资产负债率") && (x.includes("过高") || x.includes("偏高")))) r.push("资产负债率偏高，偿债压力较大");
    if (f.some(x => x.includes("流动比率") && (x.includes("不足") || x.includes("严重")))) r.push("短期偿债压力较大");
    if (f.some(x => x.includes("商誉") && (x.includes("过高") || x.includes("偏高")))) r.push("商誉占比较高，存在减值风险");
  }

  if (scores.valuation.score < 50) {
    const f = scores.valuation.factors;
    if (f.some(x => x.includes("PE分位") && x.includes("高"))) r.push("PE处于历史高位，估值偏贵");
    if (f.some(x => x.includes("PB分位") && x.includes("高"))) r.push("PB处于历史高位");
    if (f.some(x => x.includes("PEG") && x.includes("过高"))) r.push("PEG 过高，成长性难以支撑估值");
  }

  // 来自趋势分析的额外风险
  if (trendAnalysis) {
    if (trendAnalysis.debtToAssetsTrend === "worsening") r.push("资产负债率持续上升");
    if (trendAnalysis.grossMarginTrend === "worsening") r.push("毛利率连续下滑");
    if (trendAnalysis.roeTrend === "worsening") r.push("ROE 持续下降");
  }

  return r.slice(0, 6); // 最多展示 6 条风险
}

// ── 核心聚合函数 ──────────────────────────────────────────────────────

/**
 * 获取股票基本面综合评分
 * @param tsCode  Tushare 代码，如 "600519.SH"
 * @param refresh 是否强制刷新缓存
 */
export async function getFundamentalScore(
  tsCode: string,
  refresh = false,
): Promise<FundamentalScoreResult> {
  const now    = new Date().toISOString();
  const symbol = tsCodeToSymbol(tsCode);

  if (!hasTushareToken()) {
    return {
      ok: false, tsCode, symbol, reportDate: null,
      totalScore: 50, rating: "一般",
      scores: {
        profitability:  { score: 50, weight: 25, factors: [], missingFields: [], degraded: true },
        growth:         { score: 50, weight: 25, factors: [], missingFields: [], degraded: true },
        cashflowQuality:{ score: 50, weight: 20, factors: [], missingFields: [], degraded: true },
        financialSafety:{ score: 50, weight: 20, factors: [], missingFields: [], degraded: true },
        valuation:      { score: 50, weight: 10, factors: [], missingFields: [], degraded: true },
      },
      strengths: [], risks: [],
      missingFields: ["全部数据（TUSHARE_TOKEN 未配置）"],
      degraded: true,
      error: "TUSHARE_TOKEN 未配置，无法计算基本面评分",
      source: "Tushare", updatedAt: now,
    };
  }

  const cacheKey = `fs::${tsCode}`;
  if (!refresh) {
    const hit = _scoreCache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) return { ...hit.result, fromCache: true };
  }

  // 并行拉取五个数据源
  const [profitRes, cfRes, safetyRes, trendRes, valRes] = await Promise.allSettled([
    getProfitSummary(tsCode, 4, refresh),
    getCashflowSummary(tsCode, 4, refresh),
    getFinancialSafetySummary(tsCode, 4, refresh),
    getFinancialTrendSummary(tsCode, 4, refresh),
    getValuationSummary(tsCode, refresh),
  ]);

  const profitData   = profitRes.status   === "fulfilled" && profitRes.value.ok   ? profitRes.value   : null;
  const cfData       = cfRes.status       === "fulfilled" && cfRes.value.ok       ? cfRes.value       : null;
  const safetyData   = safetyRes.status   === "fulfilled" && safetyRes.value.ok   ? safetyRes.value   : null;
  const trendData    = trendRes.status    === "fulfilled" && trendRes.value.ok    ? trendRes.value    : null;
  const valData      = valRes.status      === "fulfilled" && valRes.value.ok      ? valRes.value      : null;

  // 提取最新期数据
  const latestProfit  = profitData?.items[0]  ?? null;
  const latestCF      = cfData?.items[0]      ?? null;
  const latestSafety  = safetyData?.items[0]  ?? null;
  const trendAnalysis = trendData?.trendAnalysis ?? null;
  // trendData.periods 是升序（旧→新），最后一个是最新
  const trendLatest   = trendData?.periods.length
    ? trendData.periods[trendData.periods.length - 1]
    : null;
  const valItem       = valData?.item ?? null;

  // 计算各维度分数
  const profitScore = calcProfitabilityScore(latestProfit, trendLatest);
  const growthScore = calcGrowthScore(latestProfit, trendAnalysis);
  const cfScore     = calcCashflowScore(latestCF, trendAnalysis);
  const safetyScore = calcSafetyScore(latestSafety);
  const valScore    = calcValuationScore(valItem);

  const scores: FundamentalScores = {
    profitability:   profitScore,
    growth:          growthScore,
    cashflowQuality: cfScore,
    financialSafety: safetyScore,
    valuation:       valScore,
  };

  // 加权综合评分
  const totalScore = clamp(
    profitScore.score * 0.25 +
    growthScore.score * 0.25 +
    cfScore.score     * 0.20 +
    safetyScore.score * 0.20 +
    valScore.score    * 0.10
  );

  const allMissing = [
    ...profitScore.missingFields,
    ...growthScore.missingFields,
    ...cfScore.missingFields,
    ...safetyScore.missingFields,
    ...valScore.missingFields,
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

  const degraded = [profitScore, growthScore, cfScore, safetyScore, valScore]
    .some(s => s.degraded);

  const strengths = generateStrengths(scores);
  const risks     = generateRisks(scores, trendAnalysis);

  const result: FundamentalScoreResult = {
    ok: true, tsCode, symbol,
    reportDate: latestProfit?.reportDate ?? latestSafety?.reportDate ?? null,
    totalScore,
    rating: ratingFromScore(totalScore),
    scores,
    strengths,
    risks,
    missingFields: allMissing,
    degraded,
    source: "Tushare",
    updatedAt: now,
  };

  _scoreCache.set(cacheKey, { result, expiresAt: Date.now() + SCORE_CACHE_TTL });
  return result;
}
