/**
 * lib/trendCorrectionMiniReversalService.ts
 *
 * A股趋势回调微型反转策略 — 核心服务
 *
 * 核心逻辑：
 *   1. 股票经历一轮长期上涨（低点→高点，涨幅≥50%，持续≥60日）
 *   2. 之后开始回调，回调幅度到达上涨幅度的 40%~60%（核心：50% 附近）
 *   3. 在回撤区间内出现微型反转信号（MA5收复 / RSI回升 / MACD金叉 等 ≥3 项）
 *   4. 通过基础风险过滤（排除退市风险/停牌/流动性不足等）
 *   = 买入候选
 *
 * 禁止：
 *   - 只有长期上涨就买入
 *   - 只要回调就买入
 *   - 回调到50%但没有微型反转就买入
 *   - 数据不足时生成买入信号
 *
 * ⚠️ 服务端专用（API Route / Server Component）
 * ⚠️ 本策略属于技术分析策略，不构成投资建议
 */

import {
  getDailyKLine,
  getDailyBasic,
  getAStockBasic,
  daysAgoStr,
  todayStr,
  type TushareRecord,
} from "./tushareService";

import {
  calcMA,
  calcRSI,
  calcMACD,
  calcKDJ,
  volumeRatio,
  isKDJGoldenCross,
  isMACDGoldenCross,
  isMACDHistogramShrinking,
} from "./technicalIndicatorService";

import {
  quickRiskFilter,
  type RiskFilterLevel,
} from "./fundamentalRiskFilter";

// ── 工具 ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function tsCodeToSymbol(c: string): string { return c.split(".")[0] ?? c; }

// ── 数据类型 ──────────────────────────────────────────────────────────────

export interface DayBar {
  date:     string;
  open:     number;
  close:    number;
  high:     number;
  low:      number;
  volume:   number;   // 手
  amount:   number;   // 千元
  pctChg:   number;   // %
  preClose?: number;
}

// ── 策略参数 ──────────────────────────────────────────────────────────────

export interface MiniReversalParams {
  lookbackDays:            number;  // 250
  minTrendDays:            number;  // 60
  minRisePercent:          number;  // 0.5 (50%)
  minCorrectionRatio:      number;  // 0.4 (40%)
  idealCorrectionRatio:    number;  // 0.5 (50%)
  maxCorrectionRatio:      number;  // 0.6 (60%)
  halfRetracementTolerance: number; // 0.05 (5%)
  minMiniReversalScore:    number;  // 60
  buyMode:                 "close" | "nextOpen" | "nextDip" | "watchOnly";
  stopLossPercent:         number;  // 5
  takeProfitPercent:       number;  // 10
  timeStopDays:            number;  // 10
  useMacd:                 boolean;
  useRsi:                  boolean;
  useKdj:                  boolean;
  requireVolumeExpansion:  boolean;
  excludeHighFinancialRisk: boolean;
}

export const DEFAULT_PARAMS: MiniReversalParams = {
  lookbackDays:             250,
  minTrendDays:             60,
  minRisePercent:           0.5,
  minCorrectionRatio:       0.4,
  idealCorrectionRatio:     0.5,
  maxCorrectionRatio:       0.6,
  halfRetracementTolerance: 0.05,
  minMiniReversalScore:     60,
  buyMode:                  "nextOpen",
  stopLossPercent:          5,
  takeProfitPercent:        10,
  timeStopDays:             10,
  useMacd:                  true,
  useRsi:                   true,
  useKdj:                   true,
  requireVolumeExpansion:   true,
  excludeHighFinancialRisk: true,
};

// ── 核心结果类型 ─────────────────────────────────────────────────────────

export interface PricePoint {
  date:  string;
  price: number;
  idx:   number;
}

export interface UptrendResult {
  detected:    boolean;
  lowPoint:    PricePoint | null;
  highPoint:   PricePoint | null;
  riseAmount:  number;
  risePercent: number;
  trendDays:   number;
  reasons:     string[];
  failedReasons: string[];
}

export interface RetracementResult {
  matched:              boolean;
  lowPoint:             PricePoint | null;
  highPoint:            PricePoint | null;
  riseAmount:           number;
  risePercent:          number;
  halfRetracementPrice: number;
  lowerZonePrice:       number;
  upperZonePrice:       number;
  price40Retracement:   number;
  price60Retracement:   number;
  currentPrice:         number;
  correctionRatio:      number;
  correctionPercent:    number;
  reasons:              string[];
  failedReasons:        string[];
}

export interface MiniReversalResult {
  miniReversal:    boolean;
  score:           number;    // 0-100
  conditionsMet:   number;    // 满足条件数量
  conditionsTotal: number;    // 总条件数
  reasons:         string[];
  failedReasons:   string[];
}

export interface StockAnalysisResult {
  tsCode:       string;
  symbol:       string;
  name:         string;
  currentPrice: number;
  uptrend:      UptrendResult;
  retracement:  RetracementResult;
  miniReversal: MiniReversalResult;
  riskFilter:   { passed: boolean; riskLevel: RiskFilterLevel; reason: string };
  buySignal:    boolean;
  buySignalReasons: string[];
  addedAt:      string;
  lastScannedAt: string;
  dataSource:   "tushare";
  bars:         DayBar[];  // 返回 K线用于前端图表
}

// ── 回测类型 ──────────────────────────────────────────────────────────────

export type TradeExitReason = "stopLoss" | "takeProfit" | "timeStop" | "maStop" | "end";

export interface TradeRecord {
  entryDate:   string;
  entryPrice:  number;
  exitDate:    string;
  exitPrice:   number;
  exitReason:  TradeExitReason;
  returnPct:   number;
  holdDays:    number;
  // Signal context
  lowPoint:    PricePoint;
  highPoint:   PricePoint;
  halfRetracementPrice: number;
  correctionRatio: number;
  miniReversalScore: number;
}

export interface BacktestResult {
  tsCode:       string;
  symbol:       string;
  name:         string;
  trades:       TradeRecord[];
  totalTrades:  number;
  winTrades:    number;
  lossTrades:   number;
  winRate:      number;
  avgReturn:    number;
  maxReturn:    number;
  minReturn:    number;
  totalReturn:  number;
  maxDrawdown:  number;
  sharpe:       number;
  uptrend:      UptrendResult;
  retracement:  RetracementResult;
  bars:         DayBar[];
}

// ── Tushare records → DayBar[] ───────────────────────────────────────────

function recordsToBars(records: TushareRecord[]): DayBar[] {
  return records
    .filter(r => r.trade_date)
    .map(r => ({
      date:   String(r.trade_date ?? ""),
      open:   toNum(r.open),
      high:   toNum(r.high),
      low:    toNum(r.low),
      close:  toNum(r.close),
      volume: toNum(r.vol),
      amount: toNum(r.amount),
      pctChg: toNum(r.pct_chg),
    }))
    .sort((a, b) => a.date.localeCompare(b.date)); // ascending
}

// ── 1. 长期上涨趋势识别 ──────────────────────────────────────────────────

/**
 * detectLongTermUptrend
 *
 * 算法：
 *  1. 取最近 lookbackDays 根 K线（升序）
 *  2. 找出"阶段高点"（在最近 5 根之前，股价高于当前价）
 *  3. 从阶段高点往前找"阶段低点"（在高点前至少 minTrendDays 内的最低点）
 *  4. 验证：涨幅 >= minRisePercent，趋势天数 >= minTrendDays
 *  5. 验证：高点明显高于 MA60/MA120（非单日拉升）
 */
export function detectLongTermUptrend(
  bars:   DayBar[],
  params: MiniReversalParams,
): UptrendResult {
  const empty: UptrendResult = {
    detected: false, lowPoint: null, highPoint: null,
    riseAmount: 0, risePercent: 0, trendDays: 0,
    reasons: [], failedReasons: [],
  };

  if (bars.length < params.minTrendDays + 10) {
    return { ...empty, failedReasons: [`K线数据不足（${bars.length}条）`] };
  }

  const lookback = bars.slice(-params.lookbackDays);
  const n = lookback.length;
  const currentPrice = lookback[n - 1].close;

  // 候选高点范围：不包括最近 5 根（要求已经开始回调）
  // 且高点必须 > 当前价（保证已经开始回调）
  let highIdx  = -1;
  let highPrice = 0;

  for (let i = 0; i < n - 5; i++) {
    if (lookback[i].high > highPrice && lookback[i].high > currentPrice * 1.05) {
      highPrice = lookback[i].high;
      highIdx   = i;
    }
  }

  if (highIdx < 0) {
    return { ...empty, failedReasons: ["未找到阶段高点（需高于当前价5%以上）"] };
  }

  // 在高点前 lookbackDays 内找最低点
  const lowSearchStart = Math.max(0, highIdx - params.lookbackDays);
  let lowIdx   = lowSearchStart;
  let lowPrice = lookback[lowSearchStart].low;

  for (let i = lowSearchStart; i < highIdx; i++) {
    if (lookback[i].low < lowPrice) {
      lowPrice = lookback[i].low;
      lowIdx   = i;
    }
  }

  const riseAmount  = highPrice - lowPrice;
  const risePercent = lowPrice > 0 ? riseAmount / lowPrice : 0;
  const trendDays   = highIdx - lowIdx;

  const reasons:       string[] = [];
  const failedReasons: string[] = [];

  // 涨幅检查
  if (risePercent < params.minRisePercent) {
    failedReasons.push(`上涨幅度不足（${(risePercent * 100).toFixed(1)}% < ${(params.minRisePercent * 100).toFixed(0)}%）`);
  } else {
    reasons.push(`上涨幅度 +${(risePercent * 100).toFixed(1)}%`);
  }

  // 趋势天数
  if (trendDays < params.minTrendDays) {
    failedReasons.push(`上涨周期不足（${trendDays}日 < ${params.minTrendDays}日）`);
  } else {
    reasons.push(`上涨持续 ${trendDays} 个交易日`);
  }

  // 高点需高于 MA60（非单日拉升）
  const closes60 = lookback.slice(0, highIdx + 1).map(b => b.close);
  if (closes60.length >= 60) {
    const ma60Array = calcMA(closes60, 60);
    const ma60AtHigh = ma60Array[ma60Array.length - 1];
    if (!isNaN(ma60AtHigh) && highPrice > ma60AtHigh * 1.02) {
      reasons.push(`高点高于 MA60（${ma60AtHigh.toFixed(2)}）`);
    } else {
      failedReasons.push("高点未明显突破 MA60");
    }
  }

  // 排除横盘：涨幅扣除总时间 < 0.3% / 日表示横盘
  if (trendDays > 0 && risePercent / trendDays < 0.003) {
    // 横盘风险，但不直接排除，降低评分
    reasons.push("⚠️ 上涨缓慢（非强趋势）");
  }

  // 成交额放大验证（上涨过程中平均成交额 > 上涨前的 1.2 倍）
  if (lookback.length > lowIdx + 5 && lowIdx > 5) {
    const beforeAmounts  = lookback.slice(Math.max(0, lowIdx - 5), lowIdx).map(b => b.amount);
    const duringAmounts  = lookback.slice(lowIdx, highIdx + 1).map(b => b.amount);
    const avgBefore      = beforeAmounts.length > 0
      ? beforeAmounts.reduce((s, a) => s + a, 0) / beforeAmounts.length : 0;
    const avgDuring      = duringAmounts.length > 0
      ? duringAmounts.reduce((s, a) => s + a, 0) / duringAmounts.length : 0;
    if (avgBefore > 0 && avgDuring >= avgBefore * 1.2) {
      reasons.push(`上涨期间成交额放大（${(avgDuring / avgBefore).toFixed(1)}x）`);
    }
  }

  const detected = failedReasons.length === 0;

  return {
    detected,
    lowPoint:  { date: lookback[lowIdx].date,  price: lowPrice,  idx: lowIdx  },
    highPoint: { date: lookback[highIdx].date, price: highPrice, idx: highIdx },
    riseAmount,
    risePercent,
    trendDays,
    reasons,
    failedReasons,
  };
}

// ── 2. 50% 回撤区间计算 ─────────────────────────────────────────────────

export function calculateHalfRetracementZone(
  bars:        DayBar[],
  uptrend:     UptrendResult,
  params:      MiniReversalParams,
): RetracementResult {
  const empty: RetracementResult = {
    matched: false, lowPoint: null, highPoint: null,
    riseAmount: 0, risePercent: 0,
    halfRetracementPrice: 0, lowerZonePrice: 0, upperZonePrice: 0,
    price40Retracement: 0, price60Retracement: 0,
    currentPrice: 0, correctionRatio: 0, correctionPercent: 0,
    reasons: [], failedReasons: [],
  };

  if (!uptrend.detected || !uptrend.lowPoint || !uptrend.highPoint) {
    return { ...empty, failedReasons: ["长期上涨趋势未识别"] };
  }

  const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
  if (currentPrice <= 0) {
    return { ...empty, failedReasons: ["当前价格无效"] };
  }

  const { lowPoint, highPoint, riseAmount, risePercent } = uptrend;

  // 核心计算
  const half                = riseAmount * 0.5;
  const halfRetracementPrice = highPoint.price - half;
  const lowerZonePrice      = halfRetracementPrice * (1 - params.halfRetracementTolerance);
  const upperZonePrice      = halfRetracementPrice * (1 + params.halfRetracementTolerance);
  const price40Retracement  = highPoint.price - riseAmount * 0.4;
  const price60Retracement  = highPoint.price - riseAmount * 0.6;

  // 当前回撤比例
  const correctionRatio   = riseAmount > 0
    ? (highPoint.price - currentPrice) / riseAmount : 0;
  const correctionPercent = correctionRatio * 100;

  const reasons:       string[] = [];
  const failedReasons: string[] = [];

  // 检查是否在 40%-60% 区间
  if (correctionRatio < params.minCorrectionRatio) {
    failedReasons.push(`回撤幅度不足（${correctionPercent.toFixed(1)}% < ${(params.minCorrectionRatio * 100).toFixed(0)}%）`);
  } else if (correctionRatio > params.maxCorrectionRatio) {
    failedReasons.push(`回撤过深（${correctionPercent.toFixed(1)}% > ${(params.maxCorrectionRatio * 100).toFixed(0)}%），可能趋势已破`);
  } else {
    reasons.push(`回撤比例 ${correctionPercent.toFixed(1)}%（在 ${(params.minCorrectionRatio * 100).toFixed(0)}%-${(params.maxCorrectionRatio * 100).toFixed(0)}% 区间内）`);
    reasons.push(`理论50%回撤价：${halfRetracementPrice.toFixed(2)}，当前价：${currentPrice.toFixed(2)}`);
    // 接近理想50%
    if (Math.abs(correctionRatio - params.idealCorrectionRatio) <= params.halfRetracementTolerance) {
      reasons.push(`接近理想50%回撤位（误差 ${(Math.abs(correctionRatio - 0.5) * 100).toFixed(1)}%）`);
    }
  }

  const matched = failedReasons.length === 0;

  return {
    matched,
    lowPoint, highPoint,
    riseAmount, risePercent,
    halfRetracementPrice, lowerZonePrice, upperZonePrice,
    price40Retracement, price60Retracement,
    currentPrice, correctionRatio, correctionPercent,
    reasons, failedReasons,
  };
}

// ── 3. 微型反转信号检测 ─────────────────────────────────────────────────

/**
 * detectMiniReversal
 *
 * 满足以下 ≥3 项触发微型反转：
 *  1. 最近 3 日不再创新低
 *  2. 收盘价站上 MA3
 *  3. 收盘价重新站上 MA5
 *  4. 出现小阳线（收 > 开）
 *  5. 低位十字星后反弹
 *  6. 成交额较前 5 日均值放大 ≥10%
 *  7. 换手率回升
 *  8. RSI 从超卖区回升（<30 转 >35）
 *  9. MACD 绿柱缩短或金叉
 * 10. KDJ 低位金叉（K < 30 时）
 */
export function detectMiniReversal(
  bars:    DayBar[],
  params:  MiniReversalParams,
): MiniReversalResult {
  const empty: MiniReversalResult = {
    miniReversal: false, score: 0,
    conditionsMet: 0, conditionsTotal: 10,
    reasons: [], failedReasons: [],
  };

  if (bars.length < 20) {
    return { ...empty, failedReasons: ["K线不足20条"] };
  }

  const closes  = bars.map(b => b.close);
  const opens   = bars.map(b => b.open);
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const amounts = bars.map(b => b.amount);
  const n       = bars.length;

  const ma3  = calcMA(closes, 3);
  const ma5  = calcMA(closes, 5);
  const rsi  = params.useRsi  ? calcRSI(closes, 14) : null;
  const macd = params.useMacd ? calcMACD(closes) : null;
  const kdj  = params.useKdj  ? calcKDJ(highs, lows, closes, 9) : null;

  const reasons:       string[] = [];
  const failedReasons: string[] = [];
  let conditionsMet = 0;

  // 条件1：最近3日不再创新低
  const recentLow3 = Math.min(...lows.slice(-3));
  const prevLow3   = Math.min(...lows.slice(-6, -3));
  if (recentLow3 >= prevLow3 * 0.995) {
    conditionsMet++;
    reasons.push("近3日未创新低");
  } else {
    failedReasons.push("仍在创新低");
  }

  // 条件2：收盘价站上 MA3
  const ma3Val = ma3[n - 1];
  if (!isNaN(ma3Val) && closes[n - 1] >= ma3Val) {
    conditionsMet++;
    reasons.push(`收盘站上 MA3（${ma3Val.toFixed(2)}）`);
  } else {
    failedReasons.push(`收盘未站上 MA3（MA3=${isNaN(ma3Val) ? "N/A" : ma3Val.toFixed(2)}）`);
  }

  // 条件3：收盘价站上 MA5
  const ma5Val = ma5[n - 1];
  if (!isNaN(ma5Val) && closes[n - 1] >= ma5Val) {
    conditionsMet++;
    reasons.push(`收盘站上 MA5（${ma5Val.toFixed(2)}）`);
  } else {
    failedReasons.push(`收盘未站上 MA5（MA5=${isNaN(ma5Val) ? "N/A" : ma5Val.toFixed(2)}）`);
  }

  // 条件4：出现小阳线（最近2根中至少1根阳线）
  const hasYang = opens.slice(-2).some((o, i) => closes[n - 2 + i] > o);
  if (hasYang) {
    conditionsMet++;
    reasons.push("出现小阳线");
  } else {
    failedReasons.push("最近无阳线");
  }

  // 条件5：十字星后上涨（前一根实体 < 0.3% 且今日上涨）
  if (n >= 2) {
    const prevBodyRatio = Math.abs(closes[n - 2] - opens[n - 2]) / Math.max(closes[n - 2], 0.01);
    const todayUp = closes[n - 1] > closes[n - 2];
    if (prevBodyRatio < 0.003 && todayUp) {
      conditionsMet++;
      reasons.push("十字星后出现反弹");
    }
  }

  // 条件6：成交额放大（近1日 vs 近5日均值）
  if (params.requireVolumeExpansion && amounts.length >= 6) {
    const avg5   = amounts.slice(-6, -1).reduce((s, a) => s + a, 0) / 5;
    const latest = amounts[n - 1];
    if (avg5 > 0 && latest >= avg5 * 1.1) {
      conditionsMet++;
      reasons.push(`成交额放大（${(latest / avg5).toFixed(1)}x 5日均`);
    } else {
      failedReasons.push(`成交额未放大（${avg5 > 0 ? (latest / avg5).toFixed(2) : "N/A"}x）`);
    }
  }

  // 条件7：换手率回升（近3日均量 > 近5日均量）
  const volumes = bars.map(b => b.volume);
  if (volumes.length >= 8) {
    const avg3 = volumes.slice(-3).reduce((s, v) => s + v, 0) / 3;
    const avg5 = volumes.slice(-8, -3).reduce((s, v) => s + v, 0) / 5;
    if (avg5 > 0 && avg3 > avg5 * 1.05) {
      conditionsMet++;
      reasons.push("成交量回升");
    }
  }

  // 条件8：RSI 从超卖回升
  if (rsi) {
    const rsiNow  = rsi[n - 1];
    const rsiPrev = rsi[n - 2] ?? NaN;
    if (!isNaN(rsiNow) && !isNaN(rsiPrev)) {
      if (rsiPrev < 35 && rsiNow > rsiPrev && rsiNow > 30) {
        conditionsMet++;
        reasons.push(`RSI 从超卖区回升（${rsiPrev.toFixed(0)} → ${rsiNow.toFixed(0)}）`);
      } else if (rsiPrev >= 35) {
        // RSI 不在超卖区，此条件跳过（不计入失败）
      }
    }
  }

  // 条件9：MACD 绿柱缩短 or 金叉
  if (macd) {
    const golden   = isMACDGoldenCross(macd.macd, macd.signal);
    const shrinking = isMACDHistogramShrinking(macd.histogram);
    if (golden) {
      conditionsMet++;
      reasons.push("MACD 金叉");
    } else if (shrinking) {
      conditionsMet++;
      reasons.push("MACD 绿柱缩短（动能减弱）");
    }
  }

  // 条件10：KDJ 低位金叉
  if (kdj) {
    const kNow = kdj.k[n - 1];
    const golden = isKDJGoldenCross(kdj.k, kdj.d);
    if (golden && !isNaN(kNow) && kNow < 40) {
      conditionsMet++;
      reasons.push(`KDJ 低位金叉（K=${kNow.toFixed(0)}）`);
    }
  }

  const conditionsTotal = 10;
  const score = Math.round((conditionsMet / conditionsTotal) * 100);
  const miniReversal = conditionsMet >= 3 && score >= params.minMiniReversalScore;

  if (miniReversal) {
    // pass
  } else {
    failedReasons.push(
      conditionsMet < 3
        ? `微型反转条件不足（满足 ${conditionsMet}/${conditionsTotal} 项）`
        : `微型反转评分不足（${score} < ${params.minMiniReversalScore}）`
    );
  }

  return { miniReversal, score, conditionsMet, conditionsTotal, reasons, failedReasons };
}

// ── 4. 单只股票分析 ──────────────────────────────────────────────────────

export async function analyzeTrendCorrectionStock(
  tsCode: string,
  name:   string,
  params: MiniReversalParams = DEFAULT_PARAMS,
): Promise<StockAnalysisResult | null> {
  const startDate = daysAgoStr(params.lookbackDays + 30); // 多拉一些
  const endDate   = todayStr();

  const kRes = await getDailyKLine(tsCode, startDate, endDate);
  if (!kRes.ok || kRes.records.length === 0) return null;

  const bars  = recordsToBars(kRes.records);
  const symbol = tsCodeToSymbol(tsCode);

  // 快速风险过滤
  const riskCheck = quickRiskFilter(name, bars, 60, 5000);
  const riskResult = {
    passed:    riskCheck.passed,
    riskLevel: (riskCheck.passed ? "low" : "medium") as RiskFilterLevel,
    reason:    riskCheck.reason,
  };

  // 不通过风险过滤仍返回分析结果，只是 buySignal = false
  const uptrend     = detectLongTermUptrend(bars, params);
  const retracement = calculateHalfRetracementZone(bars, uptrend, params);
  const miniRev     = detectMiniReversal(bars, params);

  const buySignal = (
    uptrend.detected &&
    retracement.matched &&
    miniRev.miniReversal &&
    riskCheck.passed
  );

  const buySignalReasons: string[] = [];
  if (buySignal) {
    buySignalReasons.push("✅ 长期上涨趋势识别");
    buySignalReasons.push(`✅ 回调至${(retracement.correctionRatio * 100).toFixed(0)}%附近`);
    buySignalReasons.push(`✅ 微型反转（评分${miniRev.score}）`);
    buySignalReasons.push("✅ 风险过滤通过");
  }

  const now = new Date().toISOString();
  return {
    tsCode, symbol, name,
    currentPrice: bars[bars.length - 1]?.close ?? 0,
    uptrend, retracement, miniReversal: miniRev,
    riskFilter: riskResult,
    buySignal, buySignalReasons,
    addedAt: now, lastScannedAt: now,
    dataSource: "tushare",
    bars: bars.slice(-100), // 最近100根用于图表
  };
}

// ── 5. 全市场扫描 ────────────────────────────────────────────────────────

export interface ScanStats {
  total:            number;
  withTrend:        number;
  inRetracementZone: number;
  withMiniReversal:  number;
  riskPassed:        number;
  candidates:        number;
  highRiskExcluded:  number;
  dataInsufficient:  number;
  errors:            number;
}

export interface ScanResult {
  candidates:  StockAnalysisResult[];
  highRisk:    Array<{ tsCode: string; name: string; reason: string }>;
  dataInsuff:  Array<{ tsCode: string; name: string; reason: string }>;
  stats:       ScanStats;
  scannedAt:   string;
}

export async function scanTrendCorrectionCandidates(
  params:      MiniReversalParams = DEFAULT_PARAMS,
  concurrency  = 3,
): Promise<ScanResult> {
  const candidates:  StockAnalysisResult[]                              = [];
  const highRisk:    Array<{ tsCode: string; name: string; reason: string }> = [];
  const dataInsuff:  Array<{ tsCode: string; name: string; reason: string }> = [];
  const stats: ScanStats = {
    total: 0, withTrend: 0, inRetracementZone: 0,
    withMiniReversal: 0, riskPassed: 0, candidates: 0,
    highRiskExcluded: 0, dataInsufficient: 0, errors: 0,
  };

  // 获取股票列表
  const basicRes = await getAStockBasic("L");
  if (!basicRes.ok) return { candidates, highRisk, dataInsuff, stats, scannedAt: new Date().toISOString() };

  // 过滤：排除 ST / *ST / 科创板（688前缀，可选）
  const stockList = basicRes.records
    .filter(r => {
      const name = String(r.name ?? "");
      const code = String(r.ts_code ?? "");
      // 排除退市风险名称
      if (name.includes("*ST") || name.includes("退市")) return false;
      // 排除已退市
      if (r.list_status === "D") return false;
      // 排除停牌状态
      if (r.list_status === "P") return false;
      return true;
    })
    .map(r => ({ tsCode: String(r.ts_code ?? ""), name: String(r.name ?? "") }));

  stats.total = stockList.length;

  // 分批处理
  const processBatch = async (batch: typeof stockList) => {
    await Promise.all(
      batch.map(async ({ tsCode, name }) => {
        try {
          const res = await analyzeTrendCorrectionStock(tsCode, name, params);
          if (!res) {
            stats.errors++;
            return;
          }

          if (!res.riskFilter.passed) {
            stats.highRiskExcluded++;
            highRisk.push({ tsCode, name, reason: res.riskFilter.reason });
            return;
          }

          if (res.bars.length < 60) {
            stats.dataInsufficient++;
            dataInsuff.push({ tsCode, name, reason: "K线数据不足" });
            return;
          }

          if (!res.uptrend.detected) return;
          stats.withTrend++;

          if (!res.retracement.matched) return;
          stats.inRetracementZone++;

          if (!res.miniReversal.miniReversal) return;
          stats.withMiniReversal++;

          stats.riskPassed++;
          stats.candidates++;
          candidates.push(res);
        } catch {
          stats.errors++;
        }
      })
    );
  };

  for (let i = 0; i < stockList.length; i += concurrency) {
    await processBatch(stockList.slice(i, i + concurrency));
  }

  // 按微型反转评分降序排列
  candidates.sort((a, b) => b.miniReversal.score - a.miniReversal.score);

  return {
    candidates,
    highRisk:   highRisk.slice(0, 100),
    dataInsuff: dataInsuff.slice(0, 100),
    stats,
    scannedAt: new Date().toISOString(),
  };
}

// ── 6. 单只股票回测 ──────────────────────────────────────────────────────

/**
 * backtestTrendCorrectionStock
 *
 * 历史回测：扫描历史 K线，找到所有满足条件的买入点，模拟交易。
 * 买入后：
 *   - 止损 -stopLossPercent%
 *   - 止盈 +takeProfitPercent%
 *   - 时间止损：买入后 timeStopDays 个交易日无明显上涨则卖出
 *   - MA5 止损：跌破 MA5 卖出
 */
export async function backtestTrendCorrectionStock(
  tsCode:  string,
  name:    string,
  params:  MiniReversalParams = DEFAULT_PARAMS,
): Promise<BacktestResult | null> {
  const startDate = daysAgoStr(params.lookbackDays * 3);
  const endDate   = todayStr();
  const symbol    = tsCodeToSymbol(tsCode);

  const kRes = await getDailyKLine(tsCode, startDate, endDate);
  if (!kRes.ok || kRes.records.length === 0) return null;

  const allBars = recordsToBars(kRes.records);
  if (allBars.length < 100) return null;

  const trades:     TradeRecord[]  = [];
  const equityCurve: number[]       = [100];
  let inPosition  = false;
  let entryPrice  = 0;
  let entryDate   = "";
  let entryDays   = 0;
  let signalLow:    PricePoint = { date: "", price: 0, idx: 0 };
  let signalHigh:   PricePoint = { date: "", price: 0, idx: 0 };
  let signalHalf   = 0;
  let signalCR     = 0;
  let signalScore  = 0;

  // 扫描每个 bar（从 lookbackDays+10 开始，确保有足够历史）
  const MIN_START = params.lookbackDays + 10;

  for (let i = MIN_START; i < allBars.length; i++) {
    const window = allBars.slice(0, i + 1);
    const bar    = allBars[i];

    if (inPosition) {
      entryDays++;
      const closes = window.map(b => b.close);
      const ma5Arr = calcMA(closes, 5);
      const ma5Val = ma5Arr[ma5Arr.length - 1];

      // 止损
      if (bar.low <= entryPrice * (1 - params.stopLossPercent / 100)) {
        const exitPrice = Math.max(bar.open, entryPrice * (1 - params.stopLossPercent / 100));
        trades.push({
          entryDate, entryPrice,
          exitDate: bar.date, exitPrice, exitReason: "stopLoss",
          returnPct: (exitPrice - entryPrice) / entryPrice * 100,
          holdDays: entryDays,
          lowPoint: signalLow, highPoint: signalHigh,
          halfRetracementPrice: signalHalf,
          correctionRatio: signalCR, miniReversalScore: signalScore,
        });
        inPosition = false;
        continue;
      }

      // 止盈
      if (bar.high >= entryPrice * (1 + params.takeProfitPercent / 100)) {
        const exitPrice = Math.min(bar.open, entryPrice * (1 + params.takeProfitPercent / 100));
        trades.push({
          entryDate, entryPrice,
          exitDate: bar.date, exitPrice, exitReason: "takeProfit",
          returnPct: (exitPrice - entryPrice) / entryPrice * 100,
          holdDays: entryDays,
          lowPoint: signalLow, highPoint: signalHigh,
          halfRetracementPrice: signalHalf,
          correctionRatio: signalCR, miniReversalScore: signalScore,
        });
        inPosition = false;
        continue;
      }

      // 时间止损
      if (entryDays >= params.timeStopDays) {
        const returnPct = (bar.close - entryPrice) / entryPrice * 100;
        trades.push({
          entryDate, entryPrice,
          exitDate: bar.date, exitPrice: bar.close, exitReason: "timeStop",
          returnPct, holdDays: entryDays,
          lowPoint: signalLow, highPoint: signalHigh,
          halfRetracementPrice: signalHalf,
          correctionRatio: signalCR, miniReversalScore: signalScore,
        });
        inPosition = false;
        continue;
      }

      // MA5 止损（跌破 MA5）
      if (!isNaN(ma5Val) && bar.close < ma5Val * 0.99 && entryDays >= 3) {
        trades.push({
          entryDate, entryPrice,
          exitDate: bar.date, exitPrice: bar.close, exitReason: "maStop",
          returnPct: (bar.close - entryPrice) / entryPrice * 100,
          holdDays: entryDays,
          lowPoint: signalLow, highPoint: signalHigh,
          halfRetracementPrice: signalHalf,
          correctionRatio: signalCR, miniReversalScore: signalScore,
        });
        inPosition = false;
      }
      continue;
    }

    // 不在持仓中，检测买入信号
    const uptrend     = detectLongTermUptrend(window, params);
    if (!uptrend.detected || !uptrend.lowPoint || !uptrend.highPoint) continue;

    const retracement = calculateHalfRetracementZone(window, uptrend, params);
    if (!retracement.matched) continue;

    const miniRev = detectMiniReversal(window, params);
    if (!miniRev.miniReversal) continue;

    const riskCheck = quickRiskFilter(name, window, 60, 5000);
    if (!riskCheck.passed) continue;

    // 买入
    const nextIdx = i + 1;
    if (nextIdx >= allBars.length) break;

    const buyPrice = params.buyMode === "close" ? bar.close : allBars[nextIdx].open;
    if (buyPrice <= 0) continue;

    inPosition  = true;
    entryPrice  = buyPrice;
    entryDate   = params.buyMode === "close" ? bar.date : allBars[nextIdx].date;
    entryDays   = 0;
    signalLow   = uptrend.lowPoint;
    signalHigh  = uptrend.highPoint;
    signalHalf  = retracement.halfRetracementPrice;
    signalCR    = retracement.correctionRatio;
    signalScore = miniRev.score;
  }

  // 强制平仓最后一笔
  if (inPosition && allBars.length > 0) {
    const lastBar = allBars[allBars.length - 1];
    trades.push({
      entryDate, entryPrice,
      exitDate: lastBar.date, exitPrice: lastBar.close, exitReason: "end",
      returnPct: (lastBar.close - entryPrice) / entryPrice * 100,
      holdDays: entryDays,
      lowPoint: signalLow, highPoint: signalHigh,
      halfRetracementPrice: signalHalf,
      correctionRatio: signalCR, miniReversalScore: signalScore,
    });
  }

  // 统计
  const winTrades  = trades.filter(t => t.returnPct > 0).length;
  const lossTrades = trades.filter(t => t.returnPct <= 0).length;
  const returns    = trades.map(t => t.returnPct);
  const totalReturn = returns.reduce((s, r) => s + r, 0);
  const avgReturn  = trades.length > 0 ? totalReturn / trades.length : 0;
  const maxReturn  = returns.length > 0 ? Math.max(...returns) : 0;
  const minReturn  = returns.length > 0 ? Math.min(...returns) : 0;

  // 最大回撤（简化版，基于每笔交易）
  let maxDrawdown = 0;
  let equity = 100;
  let peak   = 100;
  for (const t of trades) {
    equity *= (1 + t.returnPct / 100);
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe（简化版）
  const mean   = avgReturn;
  const std    = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252 / Math.max(params.timeStopDays, 1)) : 0;

  // 当前分析
  const currentUptrend     = detectLongTermUptrend(allBars, params);
  const currentRetracement = calculateHalfRetracementZone(allBars, currentUptrend, params);

  return {
    tsCode, symbol, name,
    trades,
    totalTrades:  trades.length,
    winTrades, lossTrades,
    winRate:      trades.length > 0 ? winTrades / trades.length * 100 : 0,
    avgReturn, maxReturn, minReturn, totalReturn,
    maxDrawdown, sharpe,
    uptrend:     currentUptrend,
    retracement: currentRetracement,
    bars:        allBars,
  };
}

// ── localStorage Keys ─────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  candidates:   "quantplanet_trend_correction_mini_reversal_candidates_v1",
  scanHistory:  "quantplanet_trend_correction_mini_reversal_scan_history_v1",
} as const;
