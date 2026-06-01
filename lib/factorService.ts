/**
 * factorService.ts
 * Multi-factor scoring for A-Share Multi-Factor Rotation Strategy.
 *
 * Data availability:
 *   ✅ Trend / Momentum / Money-flow / Risk  — from East Money daily K-line
 *   ⚠️ Quality (ROE / profit growth / cash flow) — requires financial data API, currently unavailable
 *   ⚠️ Valuation (PE/PB partial) — PE/PB from EM quote; historical percentile unavailable
 */

export interface KLineBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number; // 手
  amount: number; // 元
}

export interface QuoteData {
  price: number;
  changePct: number;
  pe?: number;  // PE TTM, from EM f9/100
  pb?: number;  // PB,     from EM f23/100
}

/**
 * 真实资金流数据（可选，来自东方财富）
 * 若不传则使用成交量代理，若传入则融合真实资金流评分。
 */
export interface RealMoneyFlowData {
  mainNetInflow:       number | null;  // 今日主力净流入（元）
  fiveDayMainNetInflow: number | null; // 5日主力净流入（元）
  tenDayMainNetInflow:  number | null; // 10日主力净流入（元）
  superLargeNetInflow:  number | null; // 超大单净流入（元）
  mainNetInflowPercent: number | null; // 主力净流入占比 (%)
  source: "EastMoney";
  unavailable?: false;
}

/**
 * 现金流质量因子数据（可选，来自 Tushare cashflow + income）
 * 若不传则质量因子仅使用 PE/PB 代理；传入后融合真实现金流评分。
 *
 * 对应 CashflowSummaryItem 的核心字段（服务端提取后传入，避免客户端暴露 token）
 */
export interface CashflowFactors {
  /** 经营活动现金流净额（元）— n_cashflow_act */
  operatingCashflow:   number | null;
  /** 自由现金流（元）— free_cashflow 或 经营CF - 资本开支 */
  freeCashflow:        number | null;
  /** 经营现金流 / 净利润（倍数）— operatingCashflow / netProfit */
  operatingCashflowToNetProfit: number | null;
  /** 销售商品收到的现金（元）— c_fr_sale_sg */
  cashReceivedFromSales: number | null;
  /** 购买商品支付的现金（元）— c_paid_goods_s */
  cashPaidForGoods: number | null;
  /** 数据不可用时为 true（cashflow 权限不足） */
  unavailable?: boolean;
}

/**
 * 财报趋势因子数据（可选，来自 getFinancialTrendSummary）
 * 传入后融入质量评分，提升评分对基本面趋势的敏感度。
 *
 * 对应 FinancialTrendAnalysis 的核心方向字段（服务端提取后传入）
 */
export type TrendDirection =
  | "improving" | "worsening" | "stable" | "volatile" | "insufficient_data";

export interface TrendFactors {
  revenueTrend:           TrendDirection;
  netProfitTrend:         TrendDirection;
  deductedNetProfitTrend: TrendDirection;
  roeTrend:               TrendDirection;
  grossMarginTrend:       TrendDirection;
  operatingCashflowTrend: TrendDirection;
  debtToAssetsTrend:      TrendDirection;
  /** 数据不可用时为 true */
  unavailable?: boolean;
}

/**
 * 估值因子数据（可选，来自 Tushare daily_basic + fina_indicator）
 * 传入后替代 quote.pe/pb 代理，融合 PE/PB 历史分位提升估值精度。
 *
 * 对应 ValuationSummaryItem 的核心字段（服务端提取后传入，避免客户端暴露 token）
 */
export interface ValuationFactors {
  /** PE TTM（优先）或 PE */
  pe:  number | null;
  /** 市净率 PB */
  pb:  number | null;
  /** PEG = PE TTM / 净利润增长率（%）— ≤0 增速时为 null */
  peg: number | null;
  /** PE 历史分位（0~1，基于近3年；<0.2=低估，>0.8=高估；不足120条时为 null）*/
  pePercentile: number | null;
  /** PB 历史分位（0~1，基于近3年）*/
  pbPercentile: number | null;
  /** 股息率（%）— dv_ratio；>3% 加分 */
  dividendYield: number | null;
  /** 换手率（%）— turnover_rate */
  turnoverRate: number | null;
  /** 量比 — volume_ratio */
  volumeRatio: number | null;
  /** 数据不可用时为 true（daily_basic 权限不足）*/
  unavailable?: boolean;
}

/**
 * 基本面综合评分因子数据（可选，来自 fundamentalScoreService）
 * 传入后可在策略评分中融合基本面综合评分维度。
 */
export interface FundamentalScoreFactors {
  /** 总分（0-100） */
  totalScore:        number | null;
  /** 评级 */
  rating:            "优秀" | "良好" | "一般" | "较差" | null;
  /** 盈利能力评分（0-100） */
  profitabilityScore: number | null;
  /** 成长能力评分（0-100） */
  growthScore:        number | null;
  /** 现金流质量评分（0-100） */
  cashflowScore:      number | null;
  /** 财务安全评分（0-100） */
  safetyScore:        number | null;
  /** 估值合理性评分（0-100） */
  valuationScore:     number | null;
  /** 数据不可用时为 true */
  unavailable?: boolean;
}

export interface FactorScores {
  // Raw 0-100 per factor
  trendScore:     number;
  momentumScore:  number;
  qualityScore:   number;  // 50 (neutral) when fundamental data unavailable
  valuationScore: number;  // 50 (neutral) when PE/PB not in quote
  moneyFlowScore: number;
  riskScore:      number;  // higher = lower risk
  // Composite
  totalScore:       number;
  dataCompleteness: number; // 0–1 fraction with real data
  // Labels
  trendDetail:      string;
  momentumDetail:   string;
  qualityNote:      string;
  valuationNote:    string;
  moneyFlowDetail:  string;
  riskDetail:       string;
  // Narrative
  reasons:  string[];
  warnings: string[];
}

// ── Math helpers ──────────────────────────────────────────────────
function ma(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function ret(arr: number[], days: number): number | null {
  if (arr.length <= days) return null;
  const cur  = arr[arr.length - 1];
  const past = arr[arr.length - 1 - days];
  if (!past || past === 0) return null;
  return ((cur - past) / past) * 100;
}

function annualVol(arr: number[], days: number): number | null {
  if (arr.length < days + 1) return null;
  const slice = arr.slice(-(days + 1));
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] > 0) rets.push((slice[i] - slice[i - 1]) / slice[i - 1]);
  }
  if (rets.length < 5) return null;
  const mean     = rets.reduce((s, v) => s + v, 0) / rets.length;
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // annualised %
}

// ── Main scoring ──────────────────────────────────────────────────
export function calculateFactorScores(
  klines: KLineBar[],
  quote: QuoteData,
  /** 可选：来自东方财富的真实资金流数据（权重 15%，不可用时降级为量比代理） */
  realMoneyFlow?: RealMoneyFlowData | null,
  /** 可选：来自 Tushare 的现金流质量因子（融入质量评分） */
  cashflowFactors?: CashflowFactors | null,
  /** 可选：来自 Tushare 的估值因子（替代 quote.pe/pb，融合 PE/PB 历史分位） */
  valuationFactors?: ValuationFactors | null,
  /** 可选：来自 Tushare 的财报趋势因子（融入质量评分） */
  trendFactors?: TrendFactors | null,
): FactorScores {
  const closes  = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  const reasons: string[]  = [];
  const warnings: string[] = [];

  // ── 1. Trend Factor  (weight 25%) ────────────────────────────
  let tRaw = 50;
  const tParts: string[] = [];

  const ma5  = ma(closes, 5);
  const ma20 = ma(closes, 20);
  const ma60 = ma(closes, 60);
  const cur  = closes[closes.length - 1] ?? 0;
  const hi60 = closes.length >= 60 ? Math.max(...closes.slice(-60)) : null;

  if (ma5 && ma20) {
    if (ma5 > ma20)  { tRaw += 20; tParts.push("MA5>MA20"); reasons.push("MA5上穿MA20"); }
    else             { tRaw -= 25; tParts.push("MA5<MA20"); warnings.push("短期均线偏空"); }
  }
  if (ma20 && ma60) {
    if (ma20 > ma60) { tRaw += 18; tParts.push("MA20>MA60"); }
    else             { tRaw -= 18; tParts.push("MA20<MA60"); warnings.push("中期趋势偏弱"); }
  }
  if (cur > 0 && ma60) {
    if (cur > ma60)  { tRaw += 12; tParts.push("站上MA60"); }
    else             { tRaw -= 30; warnings.push("跌破MA60，趋势偏弱"); }
  }
  if (hi60 && cur >= hi60 * 0.93) {
    tRaw += 10; tParts.push("近60日高位区间");
    reasons.push("股价处于近期高位");
  }
  const trendScore = Math.max(0, Math.min(100, tRaw));

  // ── 2. Momentum Factor (weight 20%) ──────────────────────────
  let mRaw = 50;
  const mParts: string[] = [];
  const r20  = ret(closes, 20);
  const r60  = ret(closes, 60);
  const r120 = ret(closes, 120);

  if (r20 !== null) {
    if (r20 > 35)    { mRaw -= 15; warnings.push(`20日涨幅${r20.toFixed(1)}%，注意追高风险`); }
    else if (r20 > 10) { mRaw += 20; mParts.push(`20日+${r20.toFixed(1)}%`); }
    else if (r20 > 0)  { mRaw += 8;  mParts.push(`20日+${r20.toFixed(1)}%`); }
    else if (r20 < -15){ mRaw -= 18; mParts.push(`20日${r20.toFixed(1)}%`); }
    else               { mRaw -= 5; }
  }
  if (r60 !== null) {
    if (r60 > 20)    { mRaw += 15; mParts.push(`60日+${r60.toFixed(1)}%`); reasons.push(`近60日涨幅${r60.toFixed(1)}%`); }
    else if (r60 > 5)  { mRaw += 8; }
    else if (r60 < -20){ mRaw -= 15; }
  }
  if (r120 !== null) {
    if (r120 > 30)   { mRaw += 12; mParts.push(`120日+${r120.toFixed(1)}%`); }
    else if (r120 < -30) { mRaw -= 12; }
  }
  const momentumScore = Math.max(0, Math.min(100, mRaw));

  // ── 3. Quality Factor (weight 20%) — PE/PB + optional cashflow ─
  let qualityScore = 50; // neutral when real data unavailable
  let qualityNote  = "质量因子：ROE/利润增长/经营现金流暂缺（需财务数据接口）";
  let qHasData     = false;

  // 3a. PE/PB 代理
  if (quote.pe && quote.pe > 0 && quote.pe < 300 && quote.pb && quote.pb > 0) {
    let qRaw = 55;
    if (quote.pe < 20)  qRaw += 18;
    else if (quote.pe < 35) qRaw += 8;
    else if (quote.pe > 80) qRaw -= 20;
    if (quote.pb < 3)  qRaw += 10;
    else if (quote.pb > 8) qRaw -= 10;
    qualityScore = Math.max(0, Math.min(100, qRaw));
    qualityNote  = `PE ${quote.pe.toFixed(1)} / PB ${quote.pb.toFixed(2)}（ROE/利润增长暂缺）`;
    qHasData     = true;
  }

  // 3b. 现金流质量因子融合（若可用，在 PE/PB 基础上调整 ±15 分）
  if (cashflowFactors && !cashflowFactors.unavailable) {
    const { operatingCashflow, freeCashflow, operatingCashflowToNetProfit } = cashflowFactors;
    const cfParts: string[] = [];
    let cfAdj = 0;

    // 经营现金流为正 → +5
    if (operatingCashflow != null) {
      if (operatingCashflow > 0) { cfAdj += 5; cfParts.push("经营现金流为正"); reasons.push("经营活动现金流为正，主营回款健康"); }
      else                       { cfAdj -= 8; cfParts.push("经营现金流为负"); warnings.push("经营现金流为负，需关注现金回款能力"); }
    }

    // 经营现金流 / 净利润 > 1 → +8；< 0.5 → -6
    if (operatingCashflowToNetProfit != null && isFinite(operatingCashflowToNetProfit)) {
      if (operatingCashflowToNetProfit >= 1)   { cfAdj += 8; cfParts.push("CF/NP≥1x"); reasons.push(`经营现金流/净利润=${operatingCashflowToNetProfit.toFixed(2)}x，利润含金量高`); }
      else if (operatingCashflowToNetProfit >= 0.5) { cfAdj += 2; cfParts.push("CF/NP≥0.5x"); }
      else                                     { cfAdj -= 6; cfParts.push("CF/NP<0.5x"); warnings.push("经营现金流/净利润偏低，利润含金量不足"); }
    }

    // 自由现金流为正 → +5
    if (freeCashflow != null) {
      if (freeCashflow > 0) { cfAdj += 5; cfParts.push("自由现金流为正"); }
      else                  { cfAdj -= 3; cfParts.push("自由现金流为负"); }
    }

    qualityScore = Math.max(0, Math.min(100, qualityScore + cfAdj));
    if (cfParts.length > 0) {
      const baseNote = qHasData ? qualityNote : "质量因子";
      qualityNote = `${baseNote} | 现金流：${cfParts.join("/")}`;
      qHasData = true;
    }
  } else if (cashflowFactors?.unavailable) {
    // 现金流数据不可用时记录提示
    warnings.push("现金流数据暂缺，现金流因子未启用");
  }

  // 3c. 财报趋势因子融合（若可用，在 PE/PB + 现金流基础上调整 ±20 分）
  if (trendFactors && !trendFactors.unavailable) {
    const tf = trendFactors;
    let trendAdj = 0;
    const trendParts: string[] = [];

    const applyTrendAdj = (
      trend: TrendDirection,
      label: string,
      bonus: number,
      penalty: number,
    ) => {
      if (trend === "improving") {
        trendAdj += bonus;
        trendParts.push(`${label}↑`);
        if (bonus >= 3) reasons.push(`${label}趋势持续改善`);
      } else if (trend === "worsening") {
        trendAdj -= penalty;
        trendParts.push(`${label}↓`);
        warnings.push(`${label}趋势持续恶化`);
      }
    };

    applyTrendAdj(tf.revenueTrend,           "营收",   2, 3);
    applyTrendAdj(tf.netProfitTrend,         "净利润", 3, 4);
    applyTrendAdj(tf.roeTrend,               "ROE",   3, 4);
    applyTrendAdj(tf.grossMarginTrend,       "毛利率", 2, 3);
    applyTrendAdj(tf.operatingCashflowTrend, "经营CF", 3, 4);
    applyTrendAdj(tf.debtToAssetsTrend,      "资负率", 2, 3); // improving=降=好
    applyTrendAdj(tf.deductedNetProfitTrend, "扣非利润", 2, 3);
    // 最大 +17 / -24

    qualityScore = Math.max(0, Math.min(100, qualityScore + trendAdj));
    if (trendParts.length > 0) {
      const baseNote = qHasData ? qualityNote : "质量因子";
      qualityNote = `${baseNote} | 趋势：${trendParts.join("/")}`;
      qHasData = true;
    }
  } else if (trendFactors?.unavailable) {
    // 趋势数据不可用时说明
    warnings.push("财报趋势数据暂缺，趋势因子未启用");
  }

  // ── 4. Valuation Factor (weight 15%) ─────────────────────────
  let valuationScore = 50;
  let valuationNote  = "估值因子：PE/PB暂缺，历史分位暂缺";
  let vHasData       = false;

  // 4a. 优先使用 ValuationFactors（含 PE/PB 历史分位，精度最高）
  if (valuationFactors && !valuationFactors.unavailable) {
    const { pe, pb, peg, pePercentile, pbPercentile, dividendYield } = valuationFactors;
    let vRaw = 50;
    const vParts: string[] = [];

    // PE 历史分位（最重要 — 反映相对历史估值水平）
    if (pePercentile != null) {
      if (pePercentile < 0.20)      { vRaw += 25; vParts.push(`PE分位${(pePercentile*100).toFixed(0)}%（低估）`); reasons.push("PE处于历史低位，估值具吸引力"); }
      else if (pePercentile < 0.40) { vRaw += 15; vParts.push(`PE分位${(pePercentile*100).toFixed(0)}%（偏低）`); }
      else if (pePercentile < 0.60) { vRaw +=  0; vParts.push(`PE分位${(pePercentile*100).toFixed(0)}%（中性）`); }
      else if (pePercentile < 0.80) { vRaw -= 12; vParts.push(`PE分位${(pePercentile*100).toFixed(0)}%（偏高）`); warnings.push("PE估值高于历史均值"); }
      else                          { vRaw -= 25; vParts.push(`PE分位${(pePercentile*100).toFixed(0)}%（高估）`); warnings.push("PE处于历史高位（>80%分位），注意估值风险"); }
      vHasData = true;
    }

    // PB 历史分位（辅助）
    if (pbPercentile != null) {
      if (pbPercentile < 0.20)      { vRaw += 12; vParts.push(`PB分位${(pbPercentile*100).toFixed(0)}%（低）`); }
      else if (pbPercentile > 0.80) { vRaw -= 12; vParts.push(`PB分位${(pbPercentile*100).toFixed(0)}%（高）`); }
      vHasData = true;
    }

    // PEG（成长与估值匹配度）
    if (peg != null && peg > 0) {
      if (peg < 1)      { vRaw += 10; vParts.push(`PEG=${peg.toFixed(2)}（低）`); reasons.push(`PEG=${peg.toFixed(2)}，成长与估值匹配度较好`); }
      else if (peg > 2) { vRaw -= 10; vParts.push(`PEG=${peg.toFixed(2)}（高）`); warnings.push(`PEG=${peg.toFixed(2)}，成长溢价过高`); }
      vHasData = true;
    }

    // 无分位数据时降级为绝对 PE/PB 判断
    if (!vHasData && pe != null && pe > 0 && pe < 300) {
      if (pe < 15)      { vRaw = 82; vParts.push(`低估值PE=${pe.toFixed(1)}`); }
      else if (pe < 25) { vRaw = 68; vParts.push(`合理估值PE=${pe.toFixed(1)}`); }
      else if (pe < 40) { vRaw = 52; vParts.push(`偏高PE=${pe.toFixed(1)}`); }
      else              { vRaw = 35; vParts.push(`高估值PE=${pe.toFixed(1)}`); warnings.push("估值偏高"); }
      if (pb != null) {
        if (pb < 2) vRaw += 8;
        else if (pb > 8) vRaw -= 8;
      }
      vHasData = true;
    }

    // 高股息加分（>3% 具备配置价值）
    if (dividendYield != null && dividendYield > 3) {
      vRaw += 5;
      vParts.push(`股息率${dividendYield.toFixed(1)}%`);
      reasons.push(`股息率${dividendYield.toFixed(1)}%，具备分红吸引力`);
      vHasData = true;
    }

    valuationScore = Math.max(0, Math.min(100, vRaw));
    valuationNote  = vParts.length > 0
      ? `估值因子：${vParts.join(" / ")}`
      : `PE=${pe?.toFixed(1) ?? "—"} / PB=${pb?.toFixed(2) ?? "—"}（历史分位数据不足）`;

  } else if (quote.pe && quote.pe > 0 && quote.pe < 300) {
    // 4b. 降级：仅使用实时报价 PE/PB（无历史分位）
    let vRaw = 50;
    if (quote.pe < 15)      { vRaw = 82; valuationNote = `低估值 PE=${quote.pe.toFixed(1)}`; }
    else if (quote.pe < 25) { vRaw = 68; valuationNote = `合理估值 PE=${quote.pe.toFixed(1)}`; }
    else if (quote.pe < 40) { vRaw = 52; valuationNote = `偏高 PE=${quote.pe.toFixed(1)}`; }
    else                    { vRaw = 35; valuationNote = `高估值 PE=${quote.pe.toFixed(1)}`; warnings.push("估值偏高"); }
    if (quote.pb) {
      if (quote.pb < 2) vRaw += 8;
      else if (quote.pb > 8) vRaw -= 8;
    }
    valuationScore = Math.max(0, Math.min(100, vRaw));
    vHasData = true;
  }

  // ── 5. Money Flow Factor (weight 15%) ────────────────────────
  // 优先使用真实资金流（东方财富），降级时使用成交量代理
  let fRaw = 50;
  const fParts: string[] = [];
  const vol20   = ma(volumes, 20);
  const volLast = volumes[volumes.length - 1] ?? 0;
  let moneyFlowUnavailable = false;

  if (realMoneyFlow && realMoneyFlow.mainNetInflow !== null) {
    // ── 真实资金流路径 ──
    const mni     = realMoneyFlow.mainNetInflow;
    const mni5    = realMoneyFlow.fiveDayMainNetInflow;
    const mni10   = realMoneyFlow.tenDayMainNetInflow;
    const mniPct  = realMoneyFlow.mainNetInflowPercent;
    const superLg = realMoneyFlow.superLargeNetInflow;

    // 今日主力净流入
    if (mni > 0) {
      if (mniPct !== null && mniPct > 3) { fRaw += 30; fParts.push(`主力净流入${mniPct.toFixed(1)}%`); reasons.push("主力大幅净买入"); }
      else if (mniPct !== null && mniPct > 1) { fRaw += 18; fParts.push(`主力净流入${mniPct.toFixed(1)}%`); }
      else { fRaw += 10; fParts.push("主力净流入"); }
    } else if (mni < 0) {
      const outPct = mniPct !== null ? Math.abs(mniPct) : 0;
      if (outPct > 3) { fRaw -= 30; warnings.push(`主力大幅净流出${outPct.toFixed(1)}%`); fParts.push("主力大幅流出"); }
      else if (outPct > 1) { fRaw -= 18; fParts.push("主力净流出"); warnings.push("主力资金流出"); }
      else { fRaw -= 8; fParts.push("主力小幅流出"); }
    } else {
      fParts.push("主力中性");
    }

    // 5日趋势加分
    if (mni5 !== null) {
      if (mni5 > 0) { fRaw += 12; fParts.push("5日净流入"); }
      else if (mni5 < 0) { fRaw -= 12; fParts.push("5日净流出"); warnings.push("5日主力持续流出"); }
    }

    // 10日趋势加分
    if (mni10 !== null) {
      if (mni10 > 0) { fRaw += 8; }
      else if (mni10 < 0) { fRaw -= 8; }
    }

    // 超大单净流入（机构级别）
    if (superLg !== null) {
      if (superLg > 0) { fRaw += 8; fParts.push("超大单买入"); reasons.push("超大单净流入（机构买入信号）"); }
      else if (superLg < 0) { fRaw -= 8; warnings.push("超大单净流出（机构卖出信号）"); }
    }

  } else {
    // ── 量比代理路径（无真实资金流时） ──
    moneyFlowUnavailable = (realMoneyFlow === null); // 明确传 null 代表请求过但不可用
    if (vol20 && vol20 > 0) {
      const vr = volLast / vol20;
      if (vr > 2.0)      { fRaw += 28; fParts.push(`量比${vr.toFixed(1)}x放量`); reasons.push(`成交量放大${vr.toFixed(1)}倍`); }
      else if (vr > 1.3) { fRaw += 12; fParts.push(`量比${vr.toFixed(1)}x`); }
      else if (vr < 0.5) { fRaw -= 15; fParts.push("缩量"); }
    }
    const vol5 = ma(volumes, 5);
    if (vol5 && vol20 && vol5 > vol20 * 1.2) { fRaw += 8; fParts.push("5日量能持续放大"); }

    const recent5 = klines.slice(-5);
    const hvDownDays = recent5.filter(b => b.close < b.open && vol20 && b.volume > vol20 * 1.5).length;
    if (hvDownDays >= 2) { fRaw -= 20; warnings.push("近期放量下跌，资金流出信号"); }

    if (fParts.length === 0) fParts.push("成交量平稳");
    if (moneyFlowUnavailable) fParts.push("（资金流因子暂缺，使用量比代理）");
  }

  const moneyFlowScore = Math.max(0, Math.min(100, fRaw));

  // ── 6. Risk Factor (weight 5%) — volatility ───────────────────
  let rRaw = 65;
  const rParts: string[] = [];
  const vol20d = annualVol(closes, 20);
  if (vol20d !== null) {
    if (vol20d < 20)      { rRaw = 85; rParts.push(`年化波动${vol20d.toFixed(1)}%（低）`); }
    else if (vol20d < 35) { rRaw = 65; rParts.push(`年化波动${vol20d.toFixed(1)}%（中）`); }
    else                  { rRaw = 40; rParts.push(`年化波动${vol20d.toFixed(1)}%（高）`); warnings.push("近期波动较大"); }
  } else {
    rParts.push("波动率数据不足");
  }
  const riskScore = Math.max(0, Math.min(100, rRaw));

  // ── Composite (weights: trend 25%, momentum 20%, quality 20%, valuation 15%, flow 15%, risk 5%) ─
  const flowHasRealData = !!(realMoneyFlow && realMoneyFlow.mainNetInflow !== null);
  const dataCompleteness = [true, true, qHasData, vHasData, flowHasRealData, true].filter(Boolean).length / 6;
  const totalScore = Math.round(
    trendScore     * 0.25 +
    momentumScore  * 0.20 +
    qualityScore   * 0.20 +
    valuationScore * 0.15 +
    moneyFlowScore * 0.15 +
    riskScore      * 0.05
  );

  if (totalScore >= 75) reasons.push(`综合评分 ${totalScore}（候选买入）`);
  if (moneyFlowUnavailable) warnings.push("资金流因子暂缺，使用成交量代理（评分仅供参考）");

  return {
    trendScore, momentumScore, qualityScore, valuationScore, moneyFlowScore, riskScore,
    totalScore, dataCompleteness,
    trendDetail:     tParts.join(" / ") || "均线排列中性",
    momentumDetail:  mParts.join(" / ") || "动量中性",
    qualityNote,
    valuationNote,
    moneyFlowDetail: fParts.join(" / "),
    riskDetail:      rParts.join(" / "),
    reasons,
    warnings,
  };
}
