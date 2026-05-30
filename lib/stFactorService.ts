/**
 * stFactorService.ts — A股 ST 风险反转策略因子评分引擎
 *
 * 仅基于 K 线数据打分。财务数据（ROE/净资产/负债率）和公告数据
 * （摘帽公告/重整进展）暂未接入，相关因子以"数据不足"显示。
 *
 * 评分维度（0-100）：
 *   趋势修复因子    30%  — MA20/MA5/斜率
 *   流动性因子      25%  — 成交额/换手/是否停牌
 *   动量因子        20%  — 5日/20日收益
 *   基本面占位      10%  — 需财务数据（暂缺，中性50分）
 *   摘帽预期占位    15%  — 需公告数据（暂缺，中性50分）
 *   风险惩罚        -30% — 连续跌停/价格极低/缩量
 *
 * ⚠️ 仅用于研究和模拟交易，不构成投资建议。
 */

export interface STBar {
  date:   string;
  open:   number;
  close:  number;
  high:   number;
  low:    number;
  volume: number;  // 手
  amount: number;  // 元
  pctChg: number;  // 涨跌幅 %
}

export interface STFactorResult {
  // 各维度得分 0-100
  trendScore:        number;   // 趋势修复
  liquidityScore:    number;   // 流动性
  momentumScore:     number;   // 动量
  fundamentalScore:  number;   // 基本面（数据不足时 = 50）
  catalystScore:     number;   // 摘帽预期（数据不足时 = 50）
  riskPenalty:       number;   // 风险惩罚（越高惩罚越重）
  totalScore:        number;   // 0-100 综合

  // 状态标志
  isBuyable:             boolean;
  hasConsecutiveLimitDn: boolean;  // 有连续跌停
  consecutiveLimitDnCount: number; // 连续跌停天数
  isSuspended:           boolean;  // 当日停牌
  avgAmount20d:          number;   // 近 20 日均成交额（元）
  priceVsMA20:           number;   // 价格/MA20 - 1 (%)
  isTrending:            boolean;  // 价格站上 MA20

  // 详情文字
  trendDetail:      string;
  liquidityDetail:  string;
  momentumDetail:   string;
  fundamentalNote:  string;
  catalystNote:     string;
  riskDetail:       string;
  reasons:          string[];
  warnings:         string[];
}

// ── Math helpers ─────────────────────────────────────────────────────
function ma(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  return arr.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function isLimitDown(pctChg: number): boolean { return pctChg <= -9.3; }

// ── Main ST scoring ─────────────────────────────────────────────────
export function calculateSTFactorScores(bars: STBar[]): STFactorResult {
  const closes  = bars.map((b) => b.close);
  const amounts = bars.map((b) => b.amount);
  const vols    = bars.map((b) => b.volume);
  const n       = bars.length;

  const reasons:  string[] = [];
  const warnings: string[] = [];

  // ── 连续跌停检测 ──────────────────────────────────────────────
  let consecutiveLimitDnCount = 0;
  for (let i = n - 1; i >= 0 && i >= n - 5; i--) {
    if (isLimitDown(bars[i].pctChg)) consecutiveLimitDnCount++;
    else break;
  }
  const hasConsecutiveLimitDn = consecutiveLimitDnCount > 0;
  const isSuspended = n > 0 && bars[n - 1].volume === 0;

  // ── 近 20 日均成交额 ──────────────────────────────────────────
  const amt20 = amounts.slice(-20);
  const avgAmount20d = amt20.length > 0 ? amt20.reduce((s, v) => s + v, 0) / amt20.length : 0;

  // ────────────────────────────────────────────────────────────────
  // 1. 趋势修复因子 (0-100)
  // ────────────────────────────────────────────────────────────────
  let trendScore = 50; // baseline
  let trendDetail = "";

  const ma5  = ma(closes, 5);
  const ma20 = ma(closes, 20);
  const ma60 = ma(closes, 60);
  const lastClose = closes[n - 1] ?? 0;

  const isTrending = !!ma20 && lastClose > ma20;
  const priceVsMA20 = ma20 ? ((lastClose - ma20) / ma20) * 100 : 0;

  if (n < 20) {
    trendScore  = 40;
    trendDetail = "K线数据不足 20 日，趋势判断受限";
  } else {
    let ts = 40; // baseline
    // 价格站上 MA20
    if (ma20 && lastClose > ma20) { ts += 20; reasons.push("收盘价站上 MA20"); }
    else { ts -= 10; warnings.push("收盘价位于 MA20 下方"); }

    // MA5 > MA20
    if (ma5 && ma20 && ma5 > ma20) { ts += 15; reasons.push("MA5 上穿 MA20"); }
    else warnings.push("MA5 仍在 MA20 下方");

    // MA20 斜率（过去 10 日）
    if (n >= 30) {
      const ma20_10dAgo = ma(closes.slice(0, n - 10), 20);
      if (ma20 && ma20_10dAgo && ma20 > ma20_10dAgo) {
        ts += 15; reasons.push("MA20 向上倾斜");
      } else {
        ts -= 5; warnings.push("MA20 仍向下");
      }
    }

    // 价格是否在 MA60 上方
    if (ma60 && lastClose > ma60) { ts += 10; reasons.push("价格突破 MA60"); }
    trendScore  = Math.max(0, Math.min(100, ts));
    trendDetail = `MA20=${ma20?.toFixed(2) ?? "—"}, MA5=${ma5?.toFixed(2) ?? "—"}, 偏离${priceVsMA20 > 0 ? "+" : ""}${priceVsMA20.toFixed(1)}%`;
  }

  // ────────────────────────────────────────────────────────────────
  // 2. 流动性因子 (0-100)
  // ────────────────────────────────────────────────────────────────
  let liquidityScore = 0;
  let liquidityDetail = "";

  if (isSuspended) {
    liquidityScore  = 0;
    liquidityDetail = "当日停牌，无法交易";
    warnings.push("股票停牌，流动性为零");
  } else {
    const amt = avgAmount20d;
    if      (amt >= 50_000_000) { liquidityScore = 90; reasons.push(`近20日均成交额 ${(amt/1e7).toFixed(1)} 千万，流动性良好`); }
    else if (amt >= 20_000_000) { liquidityScore = 70; reasons.push(`近20日均成交额 ${(amt/1e7).toFixed(1)} 千万`); }
    else if (amt >= 10_000_000) { liquidityScore = 50; }
    else if (amt >= 5_000_000)  { liquidityScore = 30; warnings.push("成交额偏低，流动性不足"); }
    else                         { liquidityScore = 10; warnings.push("成交额极低，不建议参与"); }

    // 换手率（最近5日相对20日均量）
    const vol5   = vols.slice(-5).reduce((s, v) => s + v, 0) / 5;
    const vol20  = vols.slice(-20).reduce((s, v) => s + v, 0) / 20;
    if (vol5 > vol20 * 1.2) { liquidityScore = Math.min(100, liquidityScore + 10); reasons.push("近期量能温和放大"); }
    else if (vol5 < vol20 * 0.6) { liquidityScore = Math.max(0, liquidityScore - 15); warnings.push("近期成交量萎缩"); }

    liquidityDetail = `近20日均额 ${(avgAmount20d / 1e6).toFixed(0)} 万元`;
  }

  // ────────────────────────────────────────────────────────────────
  // 3. 动量因子 (0-100)
  // ────────────────────────────────────────────────────────────────
  let momentumScore = 50;

  const ret5  = n > 5  ? ((closes[n-1] - closes[n-6])  / closes[n-6])  * 100 : null;
  const ret20 = n > 20 ? ((closes[n-1] - closes[n-21]) / closes[n-21]) * 100 : null;

  let ms = 50;
  if (ret5  !== null) { ms += ret5  > 0 ? 15 : ret5 < -10 ? -15 : -5; }
  if (ret20 !== null) { ms += ret20 > 0 ? 15 : ret20 < -15 ? -15 : -5; }
  // 极低位置视为潜在反转（ST 特有：深度超跌后看反弹）
  const low60 = n >= 60 ? Math.min(...closes.slice(-60)) : null;
  if (low60 && lastClose < low60 * 1.15) {
    ms += 10; reasons.push("处于 60 日低位区间，超跌反弹空间较大");
  }
  momentumScore = Math.max(0, Math.min(100, ms));

  // ────────────────────────────────────────────────────────────────
  // 4. 基本面占位 (数据不足时返回 50 中性)
  // ────────────────────────────────────────────────────────────────
  const fundamentalScore = 50;
  const fundamentalNote  = "财务数据（净利润/净资产/现金流）暂未接入 Tushare income/balancesheet，以中性 50 分处理";

  // ────────────────────────────────────────────────────────────────
  // 5. 摘帽预期占位 (无公告数据时返回 50 中性)
  // ────────────────────────────────────────────────────────────────
  const catalystScore = 50;
  const catalystNote  = "摘帽公告、重整进展、控股股东变更等公告数据暂未接入，以中性 50 分处理";

  // ────────────────────────────────────────────────────────────────
  // 6. 风险惩罚 (惩罚越大分数越低，最高 30 分)
  // ────────────────────────────────────────────────────────────────
  let riskPenalty = 0;
  let riskDetail  = "";

  if (consecutiveLimitDnCount >= 3) {
    riskPenalty += 30; warnings.push(`连续 ${consecutiveLimitDnCount} 日跌停，风险极高`);
  } else if (consecutiveLimitDnCount === 2) {
    riskPenalty += 20; warnings.push("连续 2 日跌停，流动性严重受损");
  } else if (consecutiveLimitDnCount === 1) {
    riskPenalty += 10; warnings.push("昨日跌停，注意流动性");
  }

  if (lastClose < 1.5 && lastClose > 0) {
    riskPenalty += 10; warnings.push("股价低于 1.5 元，退市风险较高");
  } else if (lastClose < 2.5) {
    riskPenalty += 5; warnings.push("股价低于 2.5 元，面值退市风险需关注");
  }

  if (isSuspended) { riskPenalty += 15; }

  riskPenalty = Math.min(30, riskPenalty);
  riskDetail  = consecutiveLimitDnCount > 0
    ? `连续跌停 ${consecutiveLimitDnCount} 日，惩罚 -${riskPenalty}`
    : lastClose < 2.0 ? `股价偏低（${lastClose.toFixed(2)} 元），惩罚 -${riskPenalty}` : "无重大风险惩罚项";

  // ────────────────────────────────────────────────────────────────
  // 综合得分（加权后扣除惩罚）
  // ────────────────────────────────────────────────────────────────
  const raw =
    trendScore        * 0.30 +
    liquidityScore    * 0.25 +
    momentumScore     * 0.20 +
    fundamentalScore  * 0.10 +
    catalystScore     * 0.15;

  const totalScore = Math.max(0, Math.min(100, Math.round(raw - riskPenalty)));

  // ── 买入判断 ──────────────────────────────────────────────────
  // 注：暂缺财务/公告数据，放宽基本面和摘帽预期门槛
  const isBuyable =
    !isSuspended &&
    consecutiveLimitDnCount < 2 &&
    avgAmount20d >= 20_000_000 &&   // 近20日均额 >= 2000万
    liquidityScore >= 50 &&
    trendScore >= 55 &&
    totalScore >= 60;               // 综合 >= 60（数据不足，相比完整数据放宽）

  return {
    trendScore,        liquidityScore,   momentumScore,
    fundamentalScore,  catalystScore,    riskPenalty,
    totalScore,
    isBuyable,
    hasConsecutiveLimitDn,
    consecutiveLimitDnCount,
    isSuspended,
    avgAmount20d,
    priceVsMA20,
    isTrending,
    trendDetail,       liquidityDetail,  momentumDetail: `5日收益${ret5 !== null ? (ret5>0?"+":"")+ret5.toFixed(1)+"%" : "—"} | 20日${ret20 !== null ? (ret20>0?"+":"")+ret20.toFixed(1)+"%" : "—"}`,
    fundamentalNote,   catalystNote,     riskDetail,
    reasons,           warnings,
  };
}
