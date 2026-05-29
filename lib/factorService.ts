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
  quote: QuoteData
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

  // ── 3. Quality Factor (weight 20%) — fundamental data limited ─
  let qualityScore = 50; // neutral when real data unavailable
  let qualityNote  = "质量因子：ROE/利润增长/经营现金流暂缺（需财务数据接口）";
  let qHasData     = false;
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

  // ── 4. Valuation Factor (weight 15%) ─────────────────────────
  let valuationScore = 50;
  let valuationNote  = "估值因子：PE/PB暂缺，历史分位暂缺";
  let vHasData       = false;
  if (quote.pe && quote.pe > 0 && quote.pe < 300) {
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

  // ── 5. Money Flow Factor (weight 15%) — volume proxy ─────────
  let fRaw = 50;
  const fParts: string[] = [];
  const vol20 = ma(volumes, 20);
  const volLast = volumes[volumes.length - 1] ?? 0;

  if (vol20 && vol20 > 0) {
    const vr = volLast / vol20;
    if (vr > 2.0)      { fRaw += 28; fParts.push(`量比${vr.toFixed(1)}x放量`); reasons.push(`成交量放大${vr.toFixed(1)}倍`); }
    else if (vr > 1.3) { fRaw += 12; fParts.push(`量比${vr.toFixed(1)}x`); }
    else if (vr < 0.5) { fRaw -= 15; fParts.push("缩量"); }
  }
  const vol5 = ma(volumes, 5);
  if (vol5 && vol20 && vol5 > vol20 * 1.2) { fRaw += 8; fParts.push("5日量能持续放大"); }

  // Recent high-volume down days
  const recent5 = klines.slice(-5);
  const hvDownDays = recent5.filter(b => b.close < b.open && vol20 && b.volume > vol20 * 1.5).length;
  if (hvDownDays >= 2) { fRaw -= 20; warnings.push("近期放量下跌，资金流出信号"); }

  if (fParts.length === 0) fParts.push("成交量平稳");
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
  const dataCompleteness = [true, true, qHasData, vHasData, true, true].filter(Boolean).length / 6;
  const totalScore = Math.round(
    trendScore     * 0.25 +
    momentumScore  * 0.20 +
    qualityScore   * 0.20 +
    valuationScore * 0.15 +
    moneyFlowScore * 0.15 +
    riskScore      * 0.05
  );

  if (totalScore >= 75) reasons.push(`综合评分 ${totalScore}（候选买入）`);

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
