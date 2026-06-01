/**
 * lib/stFundamentalRiskService.ts
 *
 * ST股专项财务风险分析服务
 *
 * 专门分析ST股（含ST、ST*、星号ST等）的特殊财务风险，包括：
 *   - 退市财务风险标志检测
 *   - 扭亏预期评分（0-100）
 *   - 退市风险评分（0-100，越高风险越大）
 *   - 财务修复能力评分（0-100）
 *   - 现金流改善评分（0-100）
 *
 * 安全约束：不直接访问 TUSHARE_TOKEN，通过已有服务获取数据。
 * 缓存：24h（ST财务状态可能随公告变化）
 */

import {
  getProfitSummary,
  getCashflowSummary,
  getFinancialSafetySummary,
  getFinancialTrendSummary,
  type ProfitSummaryItem,
  type CashflowSummaryItem,
  type BalanceSafetySummaryItem,
  type TrendDirection,
} from "./financialService";

// ── 缓存 ─────────────────────────────────────────────────────────────
const ST_RISK_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

interface STRiskCacheEntry {
  result:    STFundamentalRiskResult;
  expiresAt: number;
}
const _stRiskCache = new Map<string, STRiskCacheEntry>();

export function clearSTRiskCache(tsCode?: string): void {
  if (tsCode) {
    for (const k of _stRiskCache.keys()) if (k.startsWith(`st::${tsCode}`)) _stRiskCache.delete(k);
  } else {
    _stRiskCache.clear();
  }
}

// ── 类型定义 ─────────────────────────────────────────────────────────

/**
 * ST财务风险标志
 * true = 该风险存在
 */
export interface STFinancialFlags {
  // ── 核心退市触发条件 ─────────────────────────────────────
  /** 净利润为正（最近报告期） */
  netProfitPositive: boolean;
  /** 扣非净利润为正（最近报告期） */
  deductedNetProfitPositive: boolean;
  /** 净资产为正（最近报告期，净资产<0 触发退市） */
  netAssetsPositive: boolean;

  // ── 恶化信号 ─────────────────────────────────────────────
  /** 经营现金流改善（连续2期改善或最新转正） */
  operatingCashflowImproving: boolean;
  /** 高负债率（资产负债率>85%，极高退市风险） */
  highDebtToAssets: boolean;
  /** 连续亏损（近2个报告期净利润均为负） */
  consecutiveLosses: boolean;
  /** 可能触发退市财务条件（净资产<0 OR 连续3期扣非净利润<0） */
  possibleDelistingFinancialTrigger: boolean;
  /** 高商誉风险（商誉/净资产>30%） */
  highGoodwillRisk: boolean;
  /** 债务压力大（流动比率<0.5 OR 短期借款>货币资金×2） */
  debtPressure: boolean;
  /** 是否有摘帽公告（来源：AnnouncementService，暂时为 false） */
  hasRemoveSTAnnouncement: boolean;

  /** 数据不可用（Token缺失或API失败） */
  dataUnavailable: boolean;
}

/** 单项评分结果 */
export interface STScoreItem {
  score:       number;    // 0-100
  basis:       string[];  // 评分依据说明
  confidence:  "high" | "medium" | "low";  // 数据置信度
}

/** ST基本面风险分析结果 */
export interface STFundamentalRiskResult {
  ok:      boolean;
  tsCode:  string;
  symbol:  string;

  /** 财务风险标志集合 */
  flags: STFinancialFlags;

  /** 扭亏预期评分（0-100，越高越可能扭亏）*/
  turnaroundExpectationScore: STScoreItem;

  /** 退市风险评分（0-100，越高退市风险越大）*/
  delistingRiskScore: STScoreItem;

  /** 财务修复能力评分（0-100，越高修复能力越强）*/
  financialRepairScore: STScoreItem;

  /** 现金流改善评分（0-100，越高现金流状况越好）*/
  cashflowImprovementScore: STScoreItem;

  /** 综合风险等级 */
  riskLevel: "极高" | "高" | "中" | "低";

  /** 关键结论 */
  summary: string;

  /** 已识别风险 */
  risks: string[];

  /** 积极因素 */
  positives: string[];

  fromCache?: boolean;
  error?:     string;
  source:     "Tushare";
  updatedAt:  string;
}

// ── 标志检测 ─────────────────────────────────────────────────────────

function detectSTFinancialFlags(
  profitItems:  ProfitSummaryItem[],
  cfItems:      CashflowSummaryItem[],
  safetyItem:   BalanceSafetySummaryItem | null,
  profitTrends: TrendDirection[],   // 净利润趋势 最新→最旧
  cfTrends:     TrendDirection[],
): STFinancialFlags {

  const latest  = profitItems[0] ?? null;
  const prev    = profitItems[1] ?? null;
  const cfLatest = cfItems[0]  ?? null;
  const cfPrev   = cfItems[1]  ?? null;

  // 净利润
  const netProfitPositive = (latest?.netProfit ?? null) !== null
    ? (latest!.netProfit! > 0)
    : false;

  // 扣非净利润
  const deductedNetProfitPositive = (latest?.deductedNetProfit ?? null) !== null
    ? (latest!.deductedNetProfit! > 0)
    : false;

  // 净资产
  const netAssetsPositive = (safetyItem?.netAssets ?? null) !== null
    ? (safetyItem!.netAssets! > 0)
    : true; // 数据缺失时默认假设正常

  // 经营现金流改善
  const cfNow  = cfLatest?.operatingCashflow ?? null;
  const cfPrevV = cfPrev?.operatingCashflow ?? null;
  const operatingCashflowImproving =
    (cfNow !== null && cfNow > 0) ||
    (cfNow !== null && cfPrevV !== null && cfNow > cfPrevV);

  // 高负债率
  const debtRatio = safetyItem?.debtToAssets ?? null;
  const highDebtToAssets = debtRatio !== null ? debtRatio > 0.85 : false;

  // 连续亏损
  const consecutiveLosses =
    (latest?.netProfit ?? null) !== null &&
    (prev?.netProfit ?? null) !== null &&
    latest!.netProfit! < 0 &&
    prev!.netProfit! < 0;

  // 可能触发退市财务条件
  const deductedNegCount = profitItems
    .slice(0, 3)
    .filter(p => p.deductedNetProfit !== null && p.deductedNetProfit < 0).length;
  const possibleDelistingFinancialTrigger =
    !netAssetsPositive ||
    deductedNegCount >= 3;

  // 高商誉风险
  const highGoodwillRisk = (safetyItem?.goodwillToNetAssets ?? null) !== null
    ? (safetyItem!.goodwillToNetAssets! > 0.30)
    : false;

  // 债务压力
  const currentRatio   = safetyItem?.currentRatio   ?? null;
  const monetaryFunds  = safetyItem?.monetaryFunds   ?? null;
  const shortTermBorr  = safetyItem?.shortTermBorrowings ?? null;
  const debtPressure =
    (currentRatio !== null && currentRatio < 0.5) ||
    (monetaryFunds !== null && shortTermBorr !== null &&
      shortTermBorr > 0 && monetaryFunds < shortTermBorr * 0.5);

  // 摘帽公告暂不接入
  const hasRemoveSTAnnouncement = false;

  const dataUnavailable = profitItems.length === 0 && cfItems.length === 0 && !safetyItem;

  return {
    netProfitPositive,
    deductedNetProfitPositive,
    netAssetsPositive,
    operatingCashflowImproving,
    highDebtToAssets,
    consecutiveLosses,
    possibleDelistingFinancialTrigger,
    highGoodwillRisk,
    debtPressure,
    hasRemoveSTAnnouncement,
    dataUnavailable,
  };
}

// ── 扭亏预期评分（0-100，越高越可能扭亏）────────────────────────────

function calculateTurnaroundExpectationScore(
  flags:       STFinancialFlags,
  profitItems: ProfitSummaryItem[],
  cfItems:     CashflowSummaryItem[],
  cfTrend:     TrendDirection,
  netProfitTrend: TrendDirection,
): STScoreItem {
  let score = 30; // ST 股基础分偏低
  const basis: string[] = [];

  const latest   = profitItems[0] ?? null;
  const cfLatest = cfItems[0]     ?? null;

  // 净利润已转正
  if (flags.netProfitPositive) {
    score += 25;
    basis.push("净利润已为正，扭亏可能性高");
  } else if ((latest?.netProfit ?? null) !== null && latest!.netProfit! > -1e7) {
    score += 10;
    basis.push("净亏损金额较小（<1000万），接近盈亏平衡");
  } else {
    score -= 10;
    basis.push("净利润仍为负");
  }

  // 扣非净利润
  if (flags.deductedNetProfitPositive) {
    score += 15;
    basis.push("扣非净利润为正，经营质量改善");
  }

  // 经营现金流
  if (flags.operatingCashflowImproving) {
    score += 15;
    basis.push("经营现金流改善或转正");
  } else if ((cfLatest?.operatingCashflow ?? null) !== null && cfLatest!.operatingCashflow! < 0) {
    score -= 8;
    basis.push("经营现金流持续为负");
  }

  // 营收同比
  const revYoY = latest?.revenueYoY ?? null;
  if (revYoY !== null) {
    if (revYoY > 20) { score += 10; basis.push(`营收同比+${revYoY.toFixed(1)}%，收入修复中`); }
    else if (revYoY > 0) { score += 5;  basis.push(`营收同比+${revYoY.toFixed(1)}%`); }
    else if (revYoY < -20) { score -= 8; basis.push(`营收同比${revYoY.toFixed(1)}%，收入大幅下滑`); }
  }

  // 净利润趋势
  if (netProfitTrend === "improving") { score += 10; basis.push("净利润趋势改善"); }
  else if (netProfitTrend === "worsening") { score -= 12; basis.push("净利润趋势持续恶化"); }

  // 退市风险拖拽
  if (flags.possibleDelistingFinancialTrigger) { score -= 15; basis.push("存在退市财务触发条件"); }
  if (!flags.netAssetsPositive) { score -= 20; basis.push("净资产为负，扭亏难度极大"); }

  const confidence: STScoreItem["confidence"] =
    profitItems.length >= 2 ? "high" : profitItems.length === 1 ? "medium" : "low";

  return { score: Math.max(0, Math.min(100, score)), basis, confidence };
}

// ── 退市风险评分（0-100，越高风险越大）──────────────────────────────

function calculateDelistingRiskScore(
  flags:       STFinancialFlags,
  profitItems: ProfitSummaryItem[],
  safetyItem:  BalanceSafetySummaryItem | null,
): STScoreItem {
  let score = 20; // 所有ST股的基础退市风险
  const basis: string[] = [];

  // 净资产为负——最直接退市触发
  if (!flags.netAssetsPositive) {
    score += 40;
    basis.push("净资产为负，直接触发退市财务条件");
  } else {
    const netAssets = safetyItem?.netAssets ?? null;
    if (netAssets !== null && netAssets < 5e8) {
      score += 8;
      basis.push("净资产偏低（<5亿），安全缓冲有限");
    }
  }

  // 连续亏损
  if (flags.consecutiveLosses) {
    score += 20;
    basis.push("连续两期亏损，接近退市财务触发条件");
  }

  // 扣非净利润连续为负
  if (flags.possibleDelistingFinancialTrigger && flags.netAssetsPositive) {
    score += 15;
    basis.push("扣非净利润连续3期为负，可能触发财务类退市");
  }

  // 高负债率
  if (flags.highDebtToAssets) {
    score += 15;
    basis.push("资产负债率>85%，偿债压力极高");
  } else if ((safetyItem?.debtToAssets ?? null) !== null && safetyItem!.debtToAssets! > 0.70) {
    score += 8;
    basis.push("资产负债率>70%，偿债压力较高");
  }

  // 债务压力
  if (flags.debtPressure) {
    score += 10;
    basis.push("短期债务压力大，流动性风险高");
  }

  // 扣非净利润已转正→ 降低风险
  if (flags.deductedNetProfitPositive) {
    score -= 15;
    basis.push("扣非净利润已转正，财务触发风险降低");
  }

  // 净利润转正
  if (flags.netProfitPositive) {
    score -= 10;
    basis.push("净利润已转正，退市压力减轻");
  }

  const confidence: STScoreItem["confidence"] =
    profitItems.length >= 2 && safetyItem ? "high" : "medium";

  return { score: Math.max(0, Math.min(100, score)), basis, confidence };
}

// ── 财务修复能力评分（0-100）─────────────────────────────────────────

function calculateFinancialRepairScore(
  flags:       STFinancialFlags,
  profitItems: ProfitSummaryItem[],
  safetyItem:  BalanceSafetySummaryItem | null,
  trendAnalysis: { revenueTrend: TrendDirection; grossMarginTrend: TrendDirection; operatingCashflowTrend: TrendDirection },
): STScoreItem {
  let score = 40;
  const basis: string[] = [];

  const latest = profitItems[0] ?? null;

  // 毛利率水平
  const gm = latest?.grossMargin ?? null;
  if (gm !== null) {
    if (gm > 30) { score += 15; basis.push(`毛利率${gm.toFixed(1)}%，产品盈利能力尚可`); }
    else if (gm > 10) { score += 5; basis.push(`毛利率${gm.toFixed(1)}%`); }
    else if (gm < 0) { score -= 20; basis.push("毛利率为负，核心业务无盈利能力"); }
    else { score -= 5; basis.push(`毛利率偏低(${gm.toFixed(1)}%)`); }
  }

  // 营收趋势
  if (trendAnalysis.revenueTrend === "improving") {
    score += 12;
    basis.push("营收趋势持续改善，收入修复能力强");
  } else if (trendAnalysis.revenueTrend === "worsening") {
    score -= 12;
    basis.push("营收趋势持续下滑，修复难度大");
  }

  // 毛利率趋势
  if (trendAnalysis.grossMarginTrend === "improving") {
    score += 8;
    basis.push("毛利率趋势改善，盈利质量提升");
  } else if (trendAnalysis.grossMarginTrend === "worsening") {
    score -= 8;
    basis.push("毛利率趋势下滑，盈利质量恶化");
  }

  // 净资产状况
  if (!flags.netAssetsPositive) {
    score -= 25;
    basis.push("净资产为负，需重大资本重组才能修复");
  } else {
    const netAssets = safetyItem?.netAssets ?? null;
    if (netAssets !== null && netAssets > 5e8) {
      score += 8;
      basis.push("净资产为正且有一定规模，修复空间充足");
    }
  }

  // 高商誉风险
  if (flags.highGoodwillRisk) {
    score -= 12;
    basis.push("商誉/净资产>30%，存在减值侵蚀净资产风险");
  }

  const confidence: STScoreItem["confidence"] =
    profitItems.length >= 2 ? "high" : "medium";

  return { score: Math.max(0, Math.min(100, score)), basis, confidence };
}

// ── 现金流改善评分（0-100）───────────────────────────────────────────

function calculateCashflowImprovementScore(
  flags:   STFinancialFlags,
  cfItems: CashflowSummaryItem[],
  cfTrend: TrendDirection,
): STScoreItem {
  let score = 40;
  const basis: string[] = [];

  const cfLatest = cfItems[0] ?? null;
  const cfPrev   = cfItems[1] ?? null;

  // 经营现金流绝对值
  const ocf = cfLatest?.operatingCashflow ?? null;
  if (ocf !== null) {
    if (ocf > 1e8) { score += 25; basis.push(`经营现金流${(ocf/1e8).toFixed(1)}亿，现金造血能力强`); }
    else if (ocf > 0) { score += 12; basis.push("经营现金流为正"); }
    else if (ocf < -1e8) { score -= 20; basis.push(`经营现金流-${(Math.abs(ocf)/1e8).toFixed(1)}亿，持续失血`); }
    else { score -= 10; basis.push("经营现金流为负"); }
  }

  // CF/NP 质量
  const cfToNP = cfLatest?.operatingCashflowToNetProfit ?? null;
  if (cfToNP !== null && cfToNP > 0) {
    if (cfToNP > 1.5) { score += 15; basis.push(`CF/NP=${cfToNP.toFixed(2)}，现金流含金量高`); }
    else if (cfToNP > 1.0) { score += 8; basis.push(`CF/NP=${cfToNP.toFixed(2)}，现金流质量良好`); }
    else if (cfToNP < 0.5) { score -= 5; basis.push(`CF/NP偏低(${cfToNP.toFixed(2)})`); }
  }

  // 趋势
  if (cfTrend === "improving") {
    score += 12;
    basis.push("经营现金流趋势持续改善");
  } else if (cfTrend === "worsening") {
    score -= 15;
    basis.push("经营现金流趋势持续恶化");
  }

  // 环比变化
  if (ocf !== null && cfPrev?.operatingCashflow !== null && cfPrev?.operatingCashflow !== undefined) {
    const change = ocf - cfPrev.operatingCashflow;
    if (change > 0 && cfPrev.operatingCashflow < 0 && ocf > 0) {
      score += 10;
      basis.push("经营现金流由负转正，流动性拐点出现");
    } else if (change > 0) {
      score += 5;
      basis.push("经营现金流环比改善");
    } else if (change < 0) {
      score -= 5;
      basis.push("经营现金流环比下滑");
    }
  }

  const confidence: STScoreItem["confidence"] =
    cfItems.length >= 2 ? "high" : cfItems.length === 1 ? "medium" : "low";

  return { score: Math.max(0, Math.min(100, score)), basis, confidence };
}

// ── 综合风险等级 ─────────────────────────────────────────────────────

function calcRiskLevel(
  delistingRisk: number,
  flags: STFinancialFlags,
): STFundamentalRiskResult["riskLevel"] {
  if (delistingRisk >= 70 || !flags.netAssetsPositive) return "极高";
  if (delistingRisk >= 50 || flags.consecutiveLosses)  return "高";
  if (delistingRisk >= 30) return "中";
  return "低";
}

// ── 主函数 ───────────────────────────────────────────────────────────

export async function getSTFundamentalRisk(
  tsCode:  string,
  refresh  = false,
): Promise<STFundamentalRiskResult> {
  const cacheKey = `st::${tsCode}`;
  const now = Date.now();

  // 缓存命中
  if (!refresh) {
    const cached = _stRiskCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { ...cached.result, fromCache: true };
    }
  }

  const symbol = tsCode.replace(/\.(SH|SZ|BJ)$/i, "");

  // 并行拉取所有依赖数据
  const [profitRes, cfRes, safetyRes, trendRes] = await Promise.allSettled([
    getProfitSummary(tsCode, 4),
    getCashflowSummary(tsCode, 4),
    getFinancialSafetySummary(tsCode, 4),
    getFinancialTrendSummary(tsCode, 4),
  ]);

  const profitItems: ProfitSummaryItem[] =
    profitRes.status === "fulfilled" && profitRes.value.ok
      ? profitRes.value.items
      : [];

  const cfItems: CashflowSummaryItem[] =
    cfRes.status === "fulfilled" && cfRes.value.ok
      ? cfRes.value.items
      : [];

  const safetyItem: BalanceSafetySummaryItem | null =
    safetyRes.status === "fulfilled" && safetyRes.value.ok && safetyRes.value.items.length > 0
      ? safetyRes.value.items[0]
      : null;

  const trendAnalysis =
    trendRes.status === "fulfilled" && trendRes.value.ok
      ? trendRes.value.trendAnalysis
      : null;

  // 数据完全不可用时
  const noData = profitItems.length === 0 && cfItems.length === 0 && !safetyItem;
  if (noData) {
    const result: STFundamentalRiskResult = {
      ok: false,
      tsCode, symbol,
      flags: {
        netProfitPositive: false, deductedNetProfitPositive: false, netAssetsPositive: true,
        operatingCashflowImproving: false, highDebtToAssets: false, consecutiveLosses: false,
        possibleDelistingFinancialTrigger: false, highGoodwillRisk: false, debtPressure: false,
        hasRemoveSTAnnouncement: false, dataUnavailable: true,
      },
      turnaroundExpectationScore:  { score: 50, basis: ["数据不可用"], confidence: "low" },
      delistingRiskScore:          { score: 50, basis: ["数据不可用"], confidence: "low" },
      financialRepairScore:        { score: 50, basis: ["数据不可用"], confidence: "low" },
      cashflowImprovementScore:    { score: 50, basis: ["数据不可用"], confidence: "low" },
      riskLevel: "中",
      summary: "财务数据暂不可用，无法进行ST专项风险分析",
      risks: ["数据不可用，无法评估"],
      positives: [],
      error: "数据不可用",
      source: "Tushare",
      updatedAt: new Date().toISOString(),
    };
    return result;
  }

  // 净利润和现金流趋势（上升排序 old→new；取最新方向）
  const netProfitTrend: TrendDirection = trendAnalysis?.netProfitTrend   ?? "insufficient_data";
  const cfTrend:        TrendDirection = trendAnalysis?.operatingCashflowTrend ?? "insufficient_data";

  // 计算标志
  const flags = detectSTFinancialFlags(
    profitItems, cfItems, safetyItem,
    [netProfitTrend],
    [cfTrend],
  );

  // 各维度评分
  const turnaroundExpectationScore = calculateTurnaroundExpectationScore(
    flags, profitItems, cfItems, cfTrend, netProfitTrend,
  );
  const delistingRiskScore = calculateDelistingRiskScore(
    flags, profitItems, safetyItem,
  );
  const financialRepairScore = calculateFinancialRepairScore(
    flags, profitItems, safetyItem,
    {
      revenueTrend: trendAnalysis?.revenueTrend ?? "insufficient_data",
      grossMarginTrend: trendAnalysis?.grossMarginTrend ?? "insufficient_data",
      operatingCashflowTrend: trendAnalysis?.operatingCashflowTrend ?? "insufficient_data",
    },
  );
  const cashflowImprovementScore = calculateCashflowImprovementScore(
    flags, cfItems, cfTrend,
  );

  // 综合风险等级
  const riskLevel = calcRiskLevel(delistingRiskScore.score, flags);

  // 生成风险和积极因素
  const risks:     string[] = [];
  const positives: string[] = [];

  if (!flags.netAssetsPositive)             risks.push("净资产为负，面临退市财务条件");
  if (flags.consecutiveLosses)              risks.push("连续两期亏损，迫近退市红线");
  if (flags.possibleDelistingFinancialTrigger && flags.netAssetsPositive)
                                            risks.push("扣非净利润连续3期为负");
  if (flags.highDebtToAssets)               risks.push("资产负债率超85%，偿债压力极高");
  if (flags.debtPressure)                   risks.push("短期流动性风险高");
  if (flags.highGoodwillRisk)               risks.push("商誉占比偏高，存在减值风险");
  if (!flags.operatingCashflowImproving)    risks.push("经营现金流未见改善");

  if (flags.netProfitPositive)              positives.push("净利润已转正，扭亏迹象明显");
  if (flags.deductedNetProfitPositive)      positives.push("扣非净利润为正，经营实质性改善");
  if (flags.operatingCashflowImproving)     positives.push("经营现金流改善，流动性有所好转");
  if (flags.netAssetsPositive && !flags.highDebtToAssets) positives.push("净资产健康，财务结构尚可");
  if (netProfitTrend === "improving")       positives.push("净利润趋势改善，基本面向上");

  // 综合摘要
  let summary: string;
  if (riskLevel === "极高") {
    summary = flags.netAssetsPositive
      ? "财务状况极度恶化，连续亏损且债务高压，退市风险极高"
      : "净资产已为负，直接触发退市财务条件，风险极高";
  } else if (riskLevel === "高") {
    summary = flags.consecutiveLosses
      ? "连续亏损，若下期仍亏损将触发退市条件，需密切关注"
      : "债务压力高，财务修复进展缓慢，中高退市风险";
  } else if (riskLevel === "中") {
    summary = flags.netProfitPositive
      ? "净利润已转正但稳定性待观察，财务风险已有所改善"
      : "财务状况中等，存在一定退市风险，需持续跟踪";
  } else {
    summary = "财务状况相对稳定，退市风险较低，但仍需关注持续改善进程";
  }

  const result: STFundamentalRiskResult = {
    ok: true,
    tsCode, symbol,
    flags,
    turnaroundExpectationScore,
    delistingRiskScore,
    financialRepairScore,
    cashflowImprovementScore,
    riskLevel,
    summary,
    risks,
    positives,
    source: "Tushare",
    updatedAt: new Date().toISOString(),
  };

  _stRiskCache.set(cacheKey, { result, expiresAt: now + ST_RISK_CACHE_TTL });
  return result;
}
