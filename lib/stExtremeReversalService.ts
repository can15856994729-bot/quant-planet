/**
 * lib/stExtremeReversalService.ts
 *
 * A股 ST 极限反转策略核心服务
 *
 * 专注于连续跌停 5-50 个板的 ST 股票极限反转机会。
 * 筛选跌停打开后股价趋于稳定或出现V型反转的标的。
 *
 * ⚠️ 极高风险：连续跌停股票可能继续跌停、停牌、退市或无法卖出。
 *    仅供研究和模拟交易，不构成投资建议。
 *
 * ⚠️ 服务端专用，不可在 Client Component 中直接 import。
 */

import {
  getDailyKLine,
  getAStockBasic,
  daysAgoStr,
  todayStr,
} from "./tushareService";

import {
  calculateDelistingRiskScore,
} from "./stDelistingRiskFilter";

// ── 内部类型 ──────────────────────────────────────────────────────────

interface DayBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  pctChg: number;
}

// ── 公开类型定义 ─────────────────────────────────────────────────────

export interface LimitDownStreakInfo {
  streak: number;               // consecutive limit downs count
  streakStart: string;          // first limit down date (YYYYMMDD)
  streakEnd: string;            // last limit down date (YYYYMMDD)
  openedDate: string | null;    // first day NOT limit down after streak
  isOneWordLimitDown: boolean[]; // per-day flag if open==high==low==close~limitDown
  limitDownDates: string[];
}

export interface PriceStabilizationResult {
  stable: boolean;
  score: number;               // 0-100
  metConditions: string[];
  failedConditions: string[];
  minMetConditions: number;    // required (default 4)
}

export interface VShapeReversalResult {
  vShape: boolean;
  score: number;               // 0-100
  bottomDate: string | null;
  bottomPrice: number | null;
  reboundPercent: number | null;
  metConditions: string[];
  failedConditions: string[];
}

export interface LiquidityRecoveryResult {
  score: number;               // 0-100
  details: string[];
}

export interface STExtremeReversalParams {
  minLimitDownStreak: number;       // default 5
  maxLimitDownStreak: number;       // default 50
  maxDelistingRiskScore: number;    // default 40
  enableStabilization: boolean;     // default true
  enableVShape: boolean;            // default true
  stabilizationDays: number;        // default 3
  vShapeDays: number;               // default 5
  vShapeMinRebound: number;         // default 0.08 (8%)
  stabilizationMinScore: number;    // default 60
  vShapeMinScore: number;           // default 60
  liquidityMinScore: number;        // default 50
  requireVolumeRecovery: boolean;   // default true
  requireMoneyFlowRecovery: boolean; // default false
  maxPositionRatio: number;         // default 0.02
  totalPositionRatio: number;       // default 0.10
}

export const DEFAULT_PARAMS: STExtremeReversalParams = {
  minLimitDownStreak: 5,
  maxLimitDownStreak: 50,
  maxDelistingRiskScore: 40,
  enableStabilization: true,
  enableVShape: true,
  stabilizationDays: 3,
  vShapeDays: 5,
  vShapeMinRebound: 0.08,
  stabilizationMinScore: 60,
  vShapeMinScore: 60,
  liquidityMinScore: 50,
  requireVolumeRecovery: true,
  requireMoneyFlowRecovery: false,
  maxPositionRatio: 0.02,
  totalPositionRatio: 0.10,
};

export interface STExtremeCandidate {
  tsCode: string;
  symbol: string;
  name: string;
  stType: string;
  limitDownStreak: number;
  streakStartDate: string;
  streakEndDate: string;
  openedDate: string | null;
  currentPrice: number | null;
  currentChangePct: number | null;
  delistingRiskScore: number;
  delistingRiskLevel: string;
  delistingDegraded: boolean;
  stabilizationScore: number;
  vShapeScore: number;
  reversalScore: number;          // composite
  liquidityScore: number;
  signalType: "price_stabilization" | "v_shape_reversal" | "both" | "none";
  buySignalDate: string | null;
  buySignalReasons: string[];
  bottomDate: string | null;
  reboundPercent: number | null;
  recentNewLow: boolean;          // last 3 days made new low
  recentLimitDown: boolean;       // last 3 days had limit down
  tradable: boolean;
  excludeReasons: string[];
  entryTime: string;
  source: "Tushare";
}

export interface STExtremeScanResult {
  ok: boolean;
  scannedAt: string;
  params: STExtremeReversalParams;
  candidates: STExtremeCandidate[];
  excluded: { tsCode: string; name: string; symbol: string; reason: string; limitDownStreak?: number }[];
  categories: {
    qualified: STExtremeCandidate[];
    stabilizationOnly: STExtremeCandidate[];
    vShapeOnly: STExtremeCandidate[];
    both: STExtremeCandidate[];
    highRisk: { tsCode: string; name: string; reason: string }[];
    insufficient: { tsCode: string; name: string; reason: string }[];
  };
  totalST: number;
  scannedCount: number;
  candidateCount: number;
  error?: string;
}

export interface STExtremeTradeRecord {
  tradeId: number;
  buyDate: string;
  buyPrice: number;
  buySignalType: "price_stabilization" | "v_shape_reversal" | "both";
  buySignalReasons: string[];
  limitDownStreak: number;
  sellDate: string;
  sellPrice: number;
  pnl: number;
  pnlPct: number;
  sellReason: string;
  holdDays: number;
  cannotSellDates: string[];      // dates when could not sell due to limit down
}

export interface STExtremeKlineSignal {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  pctChg: number;
  signal?: "limit_down" | "streak_open" | "stabilization" | "v_shape" | "buy" | "sell" | "stop_loss" | "take_profit" | "limit_down_stuck";
  ma3?: number;
  ma5?: number;
  isLimitDown?: boolean;
  streakIndex?: number;           // which consecutive limit down (1-based)
}

export interface STExtremeBacktestResult {
  ok: boolean;
  tsCode: string;
  name: string;
  totalReturn: number;
  annualReturn: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  limitDownStuckCount: number;
  suspendedCount: number;
  stabilizationTrades: number;
  vShapeTrades: number;
  bothTrades: number;
  trades: STExtremeTradeRecord[];
  klineSignals: STExtremeKlineSignal[];
  equity: { date: string; value: number }[];
  streakEvents: { date: string; streak: number; openedDate: string | null }[];
  error?: string;
}

// ── 工具函数 ─────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function tsCodeToSymbol(tsCode: string): string {
  return tsCode.split(".")[0] ?? tsCode;
}

/**
 * 判断股票是否为 ST 股（名称含 ST 相关标记）
 */
function isSTStock(name: string): boolean {
  return /ST|st/.test(name);
}

/**
 * 获取该股票的跌停幅度
 * ST 股：-5%，普通股：-10%
 */
export function getLimitDownPercent(name: string, tsCode: string): number {
  void tsCode;
  return isSTStock(name) ? 0.05 : 0.10;
}

/**
 * 从 Tushare 记录转换为 DayBar（Tushare 返回 newest-first）
 */
function recordToDayBar(r: Record<string, string | number | null>): DayBar {
  return {
    date:   String(r.trade_date ?? ""),
    open:   toNum(r.open),
    close:  toNum(r.close),
    high:   toNum(r.high),
    low:    toNum(r.low),
    volume: toNum(r.vol),
    amount: toNum(r.amount),
    pctChg: toNum(r.pct_chg),
  };
}

/**
 * 计算简单移动平均
 * data: oldest-first array, returns MA value at end
 */
function calcMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(data.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ── 核心检测函数 ─────────────────────────────────────────────────────

/**
 * 计算连续跌停信息
 *
 * @param klineData  Tushare 返回的 K 线数据（newest-first）
 * @param limitDownPct  跌停幅度（默认 0.05 = 5%）
 */
export function calculateLimitDownStreak(
  klineData: DayBar[],
  limitDownPct = 0.05,
): LimitDownStreakInfo {
  const threshold = -(limitDownPct * 100 * 0.96); // tolerance: e.g. -4.8 for 5%

  if (klineData.length === 0) {
    return {
      streak: 0,
      streakStart: "",
      streakEnd: "",
      openedDate: null,
      isOneWordLimitDown: [],
      limitDownDates: [],
    };
  }

  // klineData is newest-first
  // Find where the most recent streak ends (going from newest backwards)
  // First: skip any non-limit-down days at the front (these could be after streak opened)
  let streakEndIdx = -1; // index of the last (most recent) limit-down day in streak
  let openedDate: string | null = null;

  // Find the most recent limit-down day
  for (let i = 0; i < klineData.length; i++) {
    if (klineData[i].pctChg <= threshold) {
      streakEndIdx = i;
      // Days before this (index < i) are after the streak
      if (i > 0) {
        openedDate = klineData[i - 1].date; // first non-limit-down after streak
      }
      break;
    }
  }

  // No limit downs found
  if (streakEndIdx === -1) {
    return {
      streak: 0,
      streakStart: "",
      streakEnd: "",
      openedDate: null,
      isOneWordLimitDown: [],
      limitDownDates: [],
    };
  }

  // Count consecutive limit downs going backwards from streakEndIdx
  let streakCount = 0;
  const limitDownDates: string[] = [];
  const isOneWordLimitDown: boolean[] = [];

  for (let i = streakEndIdx; i < klineData.length; i++) {
    const bar = klineData[i];
    if (bar.pctChg <= threshold) {
      streakCount++;
      limitDownDates.push(bar.date);
      // One-word limit down: open == close ~= limit down, high == low == close
      const isOneWord = bar.open <= bar.close * 1.002 && bar.high <= bar.close * 1.002;
      isOneWordLimitDown.push(isOneWord);
    } else {
      break; // consecutive broken
    }
  }

  // streakStart is the oldest limit down date (last in the newst-first array slice)
  const streakEnd   = klineData[streakEndIdx].date;
  const streakStart = limitDownDates.length > 0 ? limitDownDates[limitDownDates.length - 1] : streakEnd;

  // If streak is still ongoing (most recent day is limit down), openedDate is null
  if (streakEndIdx === 0) {
    openedDate = null;
  }

  return {
    streak: streakCount,
    streakStart,
    streakEnd,
    openedDate,
    isOneWordLimitDown,
    limitDownDates,
  };
}

/**
 * 检测股价稳定信号（跌停打开后）
 *
 * @param klineData   Tushare K 线（newest-first）
 * @param streakInfo  连续跌停信息
 * @param params      策略参数
 */
export function detectPriceStabilization(
  klineData: DayBar[],
  streakInfo: LimitDownStreakInfo,
  params: STExtremeReversalParams,
): PriceStabilizationResult {
  const metConditions: string[] = [];
  const failedConditions: string[] = [];
  const minMet = 4;

  if (!streakInfo.openedDate || streakInfo.streak === 0) {
    return {
      stable: false,
      score: 0,
      metConditions,
      failedConditions: ["跌停板尚未打开"],
      minMetConditions: minMet,
    };
  }

  // klineData is newest-first
  // Get bars after openedDate (i.e., index < openedDateIdx)
  const openedDateIdx = klineData.findIndex(b => b.date === streakInfo.openedDate);
  if (openedDateIdx === -1) {
    return {
      stable: false,
      score: 0,
      metConditions,
      failedConditions: ["无法找到跌停打开日"],
      minMetConditions: minMet,
    };
  }

  // Bars after openedDate (more recent, newest-first, index < openedDateIdx)
  const afterOpenBars = klineData.slice(0, openedDateIdx); // newest-first bars after open
  const recentBars    = afterOpenBars.slice(0, params.stabilizationDays); // most recent N days

  // Get the streakEnd bar for reference
  const streakEndIdx = klineData.findIndex(b => b.date === streakInfo.streakEnd);
  const streakEndBar = streakEndIdx >= 0 ? klineData[streakEndIdx] : null;

  // Pre-streak bars (older than streakStart, for baseline amount)
  const streakStartIdx = klineData.findIndex(b => b.date === streakInfo.streakStart);
  const preStreakBars = streakStartIdx >= 0 ? klineData.slice(streakStartIdx + 1, streakStartIdx + 6) : [];

  // Threshold for limit down (use 4.8% for ST)
  const limitDownThreshold = -4.8;

  // Condition 1: No limit down in last 3 days
  const noRecentLimitDown = recentBars.every(b => b.pctChg > limitDownThreshold);
  if (noRecentLimitDown) {
    metConditions.push("近3日无跌停");
  } else {
    failedConditions.push("近3日存在跌停");
  }

  // Condition 2: Low price not making new lows below streakEnd close
  const streakEndClose = streakEndBar?.close ?? 0;
  const noNewLow = recentBars.length > 0 && streakEndClose > 0
    ? recentBars.every(b => b.low >= streakEndClose * 0.99)
    : false;
  if (noNewLow) {
    metConditions.push("近期低点未跌破跌停区间底部");
  } else {
    failedConditions.push("近期低点跌破跌停区间底部");
  }

  // Condition 3: No close < prev close by >3%
  // Compare pairs in recentBars (newest-first, so index i+1 is older)
  let noSuddenDrop = true;
  for (let i = 0; i < recentBars.length - 1; i++) {
    const curr = recentBars[i];
    const prev = recentBars[i + 1]; // older bar
    if (prev.close > 0 && (curr.close - prev.close) / prev.close < -0.03) {
      noSuddenDrop = false;
      break;
    }
  }
  if (noSuddenDrop) {
    metConditions.push("近期无单日跌幅超3%");
  } else {
    failedConditions.push("近期出现单日跌幅超3%");
  }

  // Condition 4: Close > MA3 (3-day moving average of close)
  // Use oldest-first for MA calculation
  const recentClosesOldFirst = [...recentBars].reverse().map(b => b.close);
  const ma3 = calcMA(recentClosesOldFirst, 3);
  const latestClose = recentBars.length > 0 ? recentBars[0].close : 0;
  const closeAboveMA3 = ma3 !== null && latestClose > ma3;
  if (closeAboveMA3) {
    metConditions.push(`收盘价（${latestClose.toFixed(2)}）高于MA3（${ma3?.toFixed(2)}）`);
  } else {
    failedConditions.push(`收盘价低于MA3`);
  }

  // Condition 5: Recent 3-day avg amount > 80% of pre-streak 5-day avg amount
  const recentAvgAmount = recentBars.length > 0
    ? recentBars.reduce((s, b) => s + b.amount, 0) / recentBars.length
    : 0;
  const preStreakAvgAmount = preStreakBars.length > 0
    ? preStreakBars.reduce((s, b) => s + b.amount, 0) / preStreakBars.length
    : 0;
  const amountRecovered = preStreakAvgAmount > 0
    ? recentAvgAmount >= preStreakAvgAmount * 0.8
    : recentAvgAmount > 0;
  if (amountRecovered) {
    metConditions.push("成交额恢复至跌停前的80%以上");
  } else {
    failedConditions.push("成交额未恢复（不足跌停前80%）");
  }

  // Condition 6: No recent new 5-day low
  const allRecentLows = afterOpenBars.slice(0, 5).map(b => b.low);
  const minLow5 = allRecentLows.length > 0 ? Math.min(...allRecentLows) : 0;
  const no5DayLow = recentBars.length > 0 && minLow5 > 0
    ? recentBars[0].low > minLow5 * 1.001
    : true;
  if (no5DayLow) {
    metConditions.push("近3日无5日新低");
  } else {
    failedConditions.push("近3日创5日新低");
  }

  // Condition 7: Close not far below streakEnd close (within 5%)
  const closeNotFarBelow = streakEndClose > 0
    ? latestClose >= streakEndClose * 0.95
    : true;
  if (closeNotFarBelow) {
    metConditions.push(`收盘价（${latestClose.toFixed(2)}）未大幅偏离跌停底部（${streakEndClose.toFixed(2)}）`);
  } else {
    failedConditions.push(`收盘价较跌停底部下跌超5%`);
  }

  const metCount = metConditions.length;
  const stable = metCount >= minMet;
  const score = Math.min(100, Math.round((metCount / 7) * 100));

  return {
    stable,
    score,
    metConditions,
    failedConditions,
    minMetConditions: minMet,
  };
}

/**
 * 检测V型反转信号
 *
 * @param klineData   Tushare K 线（newest-first）
 * @param streakInfo  连续跌停信息
 * @param params      策略参数
 */
export function detectVShapeReversal(
  klineData: DayBar[],
  streakInfo: LimitDownStreakInfo,
  params: STExtremeReversalParams,
): VShapeReversalResult {
  const metConditions: string[] = [];
  const failedConditions: string[] = [];
  const minMet = 5;

  if (!streakInfo.openedDate || streakInfo.streak === 0) {
    return {
      vShape: false,
      score: 0,
      bottomDate: null,
      bottomPrice: null,
      reboundPercent: null,
      metConditions,
      failedConditions: ["跌停板尚未打开"],
    };
  }

  const openedDateIdx = klineData.findIndex(b => b.date === streakInfo.openedDate);
  if (openedDateIdx === -1) {
    return {
      vShape: false,
      score: 0,
      bottomDate: null,
      bottomPrice: null,
      reboundPercent: null,
      metConditions,
      failedConditions: ["无法找到跌停打开日"],
    };
  }

  // Get streakEnd bar
  const streakEndIdx = klineData.findIndex(b => b.date === streakInfo.streakEnd);
  const streakEndBar = streakEndIdx >= 0 ? klineData[streakEndIdx] : null;

  // Bars from openedDate onwards (more recent)
  const afterOpenBars = klineData.slice(0, openedDateIdx); // newest-first
  const recentBars = afterOpenBars.slice(0, params.vShapeDays); // most recent N days

  // Pre-streak bars for volume comparison
  const streakStartIdx = klineData.findIndex(b => b.date === streakInfo.streakStart);
  const preStreakBars = streakStartIdx >= 0 ? klineData.slice(streakStartIdx + 1, streakStartIdx + 6) : [];

  // Bottom price = min low in recentBars (or openedDate bar)
  const openedBar = klineData[openedDateIdx];
  const bottomBar = recentBars.length > 0
    ? recentBars.reduce((min, b) => b.low < min.low ? b : min, recentBars[0])
    : openedBar;
  const bottomPrice = bottomBar?.low ?? openedBar?.low ?? 0;
  const bottomDate  = bottomBar?.date ?? openedBar?.date ?? "";

  // Current close (most recent bar)
  const latestClose = klineData[0]?.close ?? 0;

  // Rebound from bottom
  const reboundPercent = bottomPrice > 0 ? (latestClose - bottomPrice) / bottomPrice : 0;

  // Days since openedDate
  const daysSinceOpened = afterOpenBars.length;

  const limitDownThreshold = -4.8;

  // Condition 1: openedDate exists and is within 5 days of streakEnd
  const openedDateBar = klineData[openedDateIdx];
  // Check date distance between streakEnd and openedDate
  // Use array index: streakEndIdx - openedDateIdx gives approximate trading days
  const daysFromStreakEndToOpened = openedDateIdx > 0 ? openedDateIdx : 1;
  const openedCloseToStreak = daysFromStreakEndToOpened <= 5;
  if (openedCloseToStreak) {
    metConditions.push(`跌停打开日（${streakInfo.openedDate}）距末次跌停较近`);
  } else {
    failedConditions.push(`跌停打开日距末次跌停超过5个交易日`);
  }

  // Condition 2: Rebound from bottom >= vShapeMinRebound
  if (reboundPercent >= params.vShapeMinRebound) {
    metConditions.push(`底部反弹${(reboundPercent * 100).toFixed(1)}% >= ${(params.vShapeMinRebound * 100).toFixed(0)}%`);
  } else {
    failedConditions.push(`底部反弹不足${(params.vShapeMinRebound * 100).toFixed(0)}%（当前${(reboundPercent * 100).toFixed(1)}%）`);
  }

  // Condition 3: Last 2 closes consecutive up
  const consecutiveUp = recentBars.length >= 2
    && recentBars[0].close > recentBars[1].close;
  if (consecutiveUp) {
    metConditions.push("最近2个交易日连续上涨");
  } else {
    failedConditions.push("最近2个交易日未连续上涨");
  }

  // Condition 4: Close > MA5
  const recentClosesOldFirst = [...recentBars].reverse().map(b => b.close);
  const ma5 = calcMA(recentClosesOldFirst, Math.min(5, recentClosesOldFirst.length));
  const closeAboveMA5 = ma5 !== null && latestClose > ma5;
  if (closeAboveMA5) {
    metConditions.push(`收盘价（${latestClose.toFixed(2)}）高于MA5（${ma5?.toFixed(2)}）`);
  } else {
    failedConditions.push("收盘价低于MA5");
  }

  // Condition 5: Recent 3-day avg amount > 1.2x of pre-streak 5-day avg
  const recentAvgAmount = recentBars.slice(0, 3).reduce((s, b) => s + b.amount, 0) / Math.max(1, Math.min(3, recentBars.length));
  const preStreakAvgAmount = preStreakBars.length > 0
    ? preStreakBars.reduce((s, b) => s + b.amount, 0) / preStreakBars.length
    : 0;
  const volumeSurge = preStreakAvgAmount > 0
    ? recentAvgAmount >= preStreakAvgAmount * 1.2
    : recentAvgAmount > 0;
  if (volumeSurge) {
    metConditions.push("成交额超过跌停前120%，量能放大");
  } else {
    failedConditions.push("成交额未超过跌停前120%");
  }

  // Condition 6: No limit down in last 3 days
  const noRecentLimitDown = recentBars.slice(0, 3).every(b => b.pctChg > limitDownThreshold);
  if (noRecentLimitDown) {
    metConditions.push("近3日无跌停");
  } else {
    failedConditions.push("近3日存在跌停");
  }

  // Condition 7: Bottom price >= streakEnd low * 0.99
  const streakEndLow = streakEndBar?.low ?? 0;
  const trueBottom = streakEndLow > 0 ? bottomPrice >= streakEndLow * 0.99 : true;
  if (trueBottom) {
    metConditions.push("已确认底部（底价不低于末次跌停低点）");
  } else {
    failedConditions.push("底部未确认（底价低于末次跌停低点1%以上）");
  }

  // Condition 8: Days since openedDate <= vShapeDays
  const withinDays = daysSinceOpened <= params.vShapeDays;
  if (withinDays) {
    metConditions.push(`打开后${daysSinceOpened}个交易日内，在观察窗口内`);
  } else {
    failedConditions.push(`打开后已超过${params.vShapeDays}个交易日观察窗口`);
  }

  const metCount = metConditions.length;
  const vShape = metCount >= minMet;
  const score = Math.min(100, Math.round((metCount / 8) * 100));

  // Clamp openedBar check
  void openedDateBar;

  return {
    vShape,
    score,
    bottomDate,
    bottomPrice,
    reboundPercent,
    metConditions,
    failedConditions,
  };
}

/**
 * 计算流动性恢复得分
 */
export function calculateLiquidityRecovery(
  klineData: DayBar[],
  streakInfo: LimitDownStreakInfo,
): LiquidityRecoveryResult {
  const details: string[] = [];

  if (!streakInfo.openedDate || klineData.length === 0) {
    return { score: 0, details: ["跌停板尚未打开"] };
  }

  const openedDateIdx = klineData.findIndex(b => b.date === streakInfo.openedDate);
  if (openedDateIdx === -1) {
    return { score: 0, details: ["无法找到跌停打开日"] };
  }

  const afterOpenBars = klineData.slice(0, openedDateIdx);
  const recentBars    = afterOpenBars.slice(0, 5);

  // Pre-streak bars
  const streakStartIdx = klineData.findIndex(b => b.date === streakInfo.streakStart);
  const preStreakBars = streakStartIdx >= 0 ? klineData.slice(streakStartIdx + 1, streakStartIdx + 6) : [];

  let score = 0;

  const recentAvgAmount = recentBars.length > 0
    ? recentBars.reduce((s, b) => s + b.amount, 0) / recentBars.length
    : 0;
  const preStreakAvgAmount = preStreakBars.length > 0
    ? preStreakBars.reduce((s, b) => s + b.amount, 0) / preStreakBars.length
    : 0;

  if (recentAvgAmount > 0) {
    if (preStreakAvgAmount > 0) {
      const ratio = recentAvgAmount / preStreakAvgAmount;
      if (ratio >= 1.5) {
        score += 40;
        details.push(`成交额大幅放量（${(ratio * 100).toFixed(0)}%）`);
      } else if (ratio >= 1.0) {
        score += 25;
        details.push(`成交额恢复（${(ratio * 100).toFixed(0)}%）`);
      } else if (ratio >= 0.8) {
        score += 15;
        details.push(`成交额基本恢复（${(ratio * 100).toFixed(0)}%）`);
      } else {
        details.push(`成交额未完全恢复（${(ratio * 100).toFixed(0)}%）`);
      }
    } else {
      score += 20;
      details.push("有成交量，无法与跌停前对比");
    }
  } else {
    details.push("近期无成交额数据");
  }

  // Check for one-word limit down (extremely illiquid)
  const oneWordCount = streakInfo.isOneWordLimitDown.filter(Boolean).length;
  if (oneWordCount === streakInfo.streak) {
    score -= 20;
    details.push(`全部${oneWordCount}个跌停均为一字板，流动性极差`);
  } else if (oneWordCount > 0) {
    score -= 10;
    details.push(`${oneWordCount}/${streakInfo.streak}个跌停为一字板`);
  }

  // Recent volume trend
  if (recentBars.length >= 2) {
    const trend = recentBars[0].volume > recentBars[1].volume ? "放量" : "缩量";
    if (trend === "放量") {
      score += 20;
      details.push("量能趋势放大");
    } else {
      details.push("量能趋势缩小");
    }
  }

  // Recent price volatility (active trading)
  if (recentBars.length > 0) {
    const avgVolatility = recentBars.reduce((s, b) => s + (b.high - b.low) / Math.max(b.close, 0.01), 0) / recentBars.length;
    if (avgVolatility > 0.03) {
      score += 20;
      details.push(`日内波动幅度大（平均${(avgVolatility * 100).toFixed(1)}%），交投活跃`);
    } else if (avgVolatility > 0.01) {
      score += 10;
      details.push(`日内有一定波动（平均${(avgVolatility * 100).toFixed(1)}%）`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  return { score, details };
}

/**
 * 计算综合反转得分
 *
 * 权重：
 *   limitDownOpened 20%
 *   stabilization   20%
 *   vShape          20%
 *   amountRecovery  15%
 *   turnover        10%
 *   moneyFlow        0% (数据不可用)
 *   MA recovery      5%
 * 总计最高 90（不含 moneyFlow），归一化到 100
 */
export function calculateReversalScore(
  stab: PriceStabilizationResult,
  vshape: VShapeReversalResult,
  liq: LiquidityRecoveryResult,
  streakInfo: LimitDownStreakInfo,
): number {
  let score = 0;

  // limitDownOpened: 20 points
  if (streakInfo.openedDate !== null) {
    score += 20;
  }

  // stabilization: 20 points
  score += stab.score * 0.20;

  // vShape: 20 points
  score += vshape.score * 0.20;

  // amountRecovery: proxy via liquidity score (15 points)
  score += Math.min(15, liq.score * 0.15);

  // turnover: proxy via liquidity (10 points)
  score += Math.min(10, liq.score * 0.10);

  // moneyFlow: 0 (data unavailable)

  // MA recovery: 5 points (embedded in vShapeScore / stabilizationScore)
  // Use a proxy: if vShape or stab score > 60, add 5
  if (vshape.score > 60 || stab.score > 60) {
    score += 5;
  }

  // Max theoretical: 20 + 20 + 20 + 15 + 10 + 5 = 90, normalize to 100
  const normalized = Math.round((score / 90) * 100);
  return Math.max(0, Math.min(100, normalized));
}

// ── 主扫描函数 ────────────────────────────────────────────────────────

/**
 * 全市场扫描 ST 极限反转候选
 *
 * 流程：
 * 1. 获取 ST 股票池
 * 2. 批量获取 K 线数据（每批 10 只）
 * 3. 检测连续跌停
 * 4. 过滤退市风险
 * 5. 检测稳定/V型反转信号
 * 6. 返回汇总结果
 */
export async function scanSTExtremeReversalCandidates(
  params: Partial<STExtremeReversalParams> = {},
): Promise<STExtremeScanResult> {
  const p: STExtremeReversalParams = { ...DEFAULT_PARAMS, ...params };
  const scannedAt = new Date().toISOString();

  // Get ST stock pool
  const basicRes = await getAStockBasic("L");
  if (!basicRes.ok) {
    return {
      ok: false,
      scannedAt,
      params: p,
      candidates: [],
      excluded: [],
      categories: { qualified: [], stabilizationOnly: [], vShapeOnly: [], both: [], highRisk: [], insufficient: [] },
      totalST: 0,
      scannedCount: 0,
      candidateCount: 0,
      error: `获取股票池失败：${basicRes.error}`,
    };
  }

  // Filter ST stocks
  const stStocks = basicRes.records.filter(r => {
    const name = String(r.name ?? "");
    return /ST|st/.test(name);
  });

  const totalST = stStocks.length;
  const excluded: STExtremeScanResult["excluded"] = [];
  const highRisk: { tsCode: string; name: string; reason: string }[] = [];
  const insufficient: { tsCode: string; name: string; reason: string }[] = [];
  const candidates: STExtremeCandidate[] = [];

  // Get kline for each stock in batches of 10
  const startDate = daysAgoStr(150); // ~100 trading days
  const endDate   = todayStr();
  const BATCH_SIZE = 10;

  for (let batchStart = 0; batchStart < stStocks.length; batchStart += BATCH_SIZE) {
    const batch = stStocks.slice(batchStart, batchStart + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (stock) => {
        const tsCode = String(stock.ts_code ?? "");
        const symbol = String(stock.symbol ?? tsCodeToSymbol(tsCode));
        const name   = String(stock.name ?? "");
        const stType = name.includes("*ST") ? "*ST" : "ST";

        if (!tsCode) return;

        // Get kline data
        const klineRes = await getDailyKLine(tsCode, startDate, endDate);
        if (!klineRes.ok || klineRes.records.length < 10) {
          insufficient.push({ tsCode, name, reason: "K线数据不足（少于10条）" });
          return;
        }

        const klineData = klineRes.records.map(recordToDayBar);

        // Detect limit down streak
        const limitDownPct = getLimitDownPercent(name, tsCode);
        const streakInfo   = calculateLimitDownStreak(klineData, limitDownPct);

        // Check streak criteria
        if (streakInfo.streak < p.minLimitDownStreak) {
          excluded.push({ tsCode, name, symbol, reason: `连续跌停数（${streakInfo.streak}）不足${p.minLimitDownStreak}个`, limitDownStreak: streakInfo.streak });
          return;
        }
        if (streakInfo.streak > p.maxLimitDownStreak) {
          excluded.push({ tsCode, name, symbol, reason: `连续跌停数（${streakInfo.streak}）超过上限${p.maxLimitDownStreak}个`, limitDownStreak: streakInfo.streak });
          return;
        }

        // Check delisting risk
        const riskResult = await calculateDelistingRiskScore(tsCode, false, p.maxDelistingRiskScore);
        if (riskResult.excluded) {
          highRisk.push({ tsCode, name, reason: `退市风险评分${riskResult.delistingRiskScore}（阈值${p.maxDelistingRiskScore}）：${riskResult.riskFlags.slice(0, 2).join("；")}` });
          return;
        }

        // Detect signals
        const stabResult = p.enableStabilization
          ? detectPriceStabilization(klineData, streakInfo, p)
          : { stable: false, score: 0, metConditions: [], failedConditions: [], minMetConditions: 4 };

        const vshapeResult = p.enableVShape
          ? detectVShapeReversal(klineData, streakInfo, p)
          : { vShape: false, score: 0, bottomDate: null, bottomPrice: null, reboundPercent: null, metConditions: [], failedConditions: [] };

        const liqResult = calculateLiquidityRecovery(klineData, streakInfo);
        const reversalScore = calculateReversalScore(stabResult, vshapeResult, liqResult, streakInfo);

        // Determine signal type
        const hasStab   = stabResult.stable   && stabResult.score >= p.stabilizationMinScore;
        const hasVShape = vshapeResult.vShape  && vshapeResult.score >= p.vShapeMinScore;
        let signalType: STExtremeCandidate["signalType"] = "none";
        if (hasStab && hasVShape)  signalType = "both";
        else if (hasVShape)        signalType = "v_shape_reversal";
        else if (hasStab)          signalType = "price_stabilization";

        if (signalType === "none") {
          insufficient.push({ tsCode, name, reason: `信号不足（稳定分:${stabResult.score}，V型分:${vshapeResult.score}）` });
          return;
        }

        // Current price info
        const latestBar = klineData[0];
        const currentPrice    = latestBar?.close ?? null;
        const currentChangePct = latestBar?.pctChg ?? null;

        // Recent new low / limit down checks
        const last3Bars = klineData.slice(0, 3);
        const recentLow3 = last3Bars.map(b => b.low);
        const allLows    = klineData.slice(0, 20).map(b => b.low);
        const minLow20   = allLows.length > 0 ? Math.min(...allLows) : 0;
        const recentNewLow = minLow20 > 0 && Math.min(...recentLow3) <= minLow20 * 1.001;
        const recentLimitDown = last3Bars.some(b => b.pctChg <= -4.8);

        // Buy signal date
        const buySignalDate = latestBar?.date ?? null;

        // Buy signal reasons
        const buySignalReasons: string[] = [
          `连续跌停${streakInfo.streak}个（${streakInfo.streakStart} ~ ${streakInfo.streakEnd}）`,
          ...(streakInfo.openedDate ? [`跌停打开日：${streakInfo.openedDate}`] : []),
          ...(hasStab ? stabResult.metConditions.slice(0, 2) : []),
          ...(hasVShape ? vshapeResult.metConditions.slice(0, 2) : []),
        ];

        const candidate: STExtremeCandidate = {
          tsCode, symbol, name, stType,
          limitDownStreak: streakInfo.streak,
          streakStartDate: streakInfo.streakStart,
          streakEndDate:   streakInfo.streakEnd,
          openedDate:      streakInfo.openedDate,
          currentPrice,
          currentChangePct,
          delistingRiskScore: riskResult.delistingRiskScore,
          delistingRiskLevel: riskResult.riskLevel,
          delistingDegraded: riskResult.degraded,
          stabilizationScore: stabResult.score,
          vShapeScore: vshapeResult.score,
          reversalScore,
          liquidityScore: liqResult.score,
          signalType,
          buySignalDate,
          buySignalReasons,
          bottomDate:    vshapeResult.bottomDate,
          reboundPercent: vshapeResult.reboundPercent,
          recentNewLow,
          recentLimitDown,
          tradable: !recentLimitDown,
          excludeReasons: [],
          entryTime: scannedAt,
          source: "Tushare",
        };

        candidates.push(candidate);
      })
    );
  }

  // Sort by reversalScore descending
  candidates.sort((a, b) => b.reversalScore - a.reversalScore);

  const qualified         = candidates.filter(c => c.signalType === "both" || (c.reversalScore >= 60));
  const stabilizationOnly = candidates.filter(c => c.signalType === "price_stabilization");
  const vShapeOnly        = candidates.filter(c => c.signalType === "v_shape_reversal");
  const both              = candidates.filter(c => c.signalType === "both");

  return {
    ok: true,
    scannedAt,
    params: p,
    candidates,
    excluded,
    categories: {
      qualified,
      stabilizationOnly,
      vShapeOnly,
      both,
      highRisk,
      insufficient,
    },
    totalST,
    scannedCount: totalST - excluded.length,
    candidateCount: candidates.length,
  };
}

// ── 单股回测 ─────────────────────────────────────────────────────────

/**
 * 单只 ST 股票极限反转策略历史回测
 *
 * @param tsCode    Tushare 股票代码
 * @param name      股票名称
 * @param params    策略参数
 * @param startDate 开始日期 YYYYMMDD
 * @param endDate   结束日期 YYYYMMDD
 */
export async function backtestSTExtremeReversalStock(
  tsCode: string,
  name: string,
  params: Partial<STExtremeReversalParams> = {},
  startDate?: string,
  endDate?: string,
): Promise<STExtremeBacktestResult> {
  const p: STExtremeReversalParams = { ...DEFAULT_PARAMS, ...params };
  const sd = startDate ?? daysAgoStr(365 * 2);
  const ed = endDate   ?? todayStr();

  const klineRes = await getDailyKLine(tsCode, sd, ed);
  if (!klineRes.ok) {
    return {
      ok: false, tsCode, name,
      totalReturn: 0, annualReturn: 0, maxDrawdown: 0,
      winRate: 0, totalTrades: 0,
      limitDownStuckCount: 0, suspendedCount: 0,
      stabilizationTrades: 0, vShapeTrades: 0, bothTrades: 0,
      trades: [], klineSignals: [], equity: [], streakEvents: [],
      error: `K线获取失败：${klineRes.error}`,
    };
  }

  if (klineRes.records.length < 20) {
    return {
      ok: false, tsCode, name,
      totalReturn: 0, annualReturn: 0, maxDrawdown: 0,
      winRate: 0, totalTrades: 0,
      limitDownStuckCount: 0, suspendedCount: 0,
      stabilizationTrades: 0, vShapeTrades: 0, bothTrades: 0,
      trades: [], klineSignals: [], equity: [], streakEvents: [],
      error: "K线数据不足（少于20条）",
    };
  }

  // klineData is newest-first from Tushare; for backtest we need oldest-first
  const klineNewestFirst = klineRes.records.map(recordToDayBar);
  const klineOldestFirst = [...klineNewestFirst].reverse();

  const limitDownPct  = getLimitDownPercent(name, tsCode);
  const limitDownThr  = -(limitDownPct * 100 * 0.96);
  const stopLossPct   = -0.05;  // -5%
  const takeProfitPct = 0.15;   // +15%
  const maxHoldDays   = 5;

  const trades: STExtremeTradeRecord[] = [];
  const klineSignals: STExtremeKlineSignal[] = [];
  const streakEvents: { date: string; streak: number; openedDate: string | null }[] = [];
  const equity: { date: string; value: number }[] = [];

  let capital = 100; // base 100
  let peakCapital = 100;
  let maxDrawdown = 0;
  let tradeId = 0;

  // Position state
  let inPosition = false;
  let buyPrice = 0;
  let buyDate  = "";
  let holdDays = 0;
  let buySignalType: "price_stabilization" | "v_shape_reversal" | "both" = "price_stabilization";
  let buySignalReasons: string[] = [];
  let buyStreak = 0;
  let cannotSellDates: string[] = [];
  let limitDownStuckCount = 0;

  let stabilizationTrades = 0;
  let vShapeTrades = 0;
  let bothTrades   = 0;

  // Moving averages (oldest-first)
  const ma3Buffer: number[] = [];
  const ma5Buffer: number[] = [];

  // For detecting streaks, maintain a rolling window (newest-first from current position)
  for (let i = 0; i < klineOldestFirst.length; i++) {
    const bar = klineOldestFirst[i];
    const isLimitDown = bar.pctChg <= limitDownThr;

    // Rolling newest-first slice for streak detection (up to 60 bars)
    const windowEnd   = i + 1;
    const windowStart = Math.max(0, windowEnd - 60);
    const windowSlice = klineOldestFirst.slice(windowStart, windowEnd).reverse(); // newest-first

    // MAs
    ma3Buffer.push(bar.close);
    ma5Buffer.push(bar.close);
    if (ma3Buffer.length > 3) ma3Buffer.shift();
    if (ma5Buffer.length > 5) ma5Buffer.shift();
    const ma3 = ma3Buffer.length === 3 ? ma3Buffer.reduce((a, b) => a + b, 0) / 3 : undefined;
    const ma5 = ma5Buffer.length === 5 ? ma5Buffer.reduce((a, b) => a + b, 0) / 5 : undefined;

    // Build kline signal
    const ks: STExtremeKlineSignal = {
      date: bar.date, open: bar.open, high: bar.high, low: bar.low,
      close: bar.close, volume: bar.volume, pctChg: bar.pctChg,
      isLimitDown,
      ma3: ma3 ?? undefined,
      ma5: ma5 ?? undefined,
    };

    if (isLimitDown) ks.signal = "limit_down";

    // If in position
    if (inPosition) {
      holdDays++;

      // Check if can sell (can't sell on limit down day)
      if (isLimitDown) {
        limitDownStuckCount++;
        cannotSellDates.push(bar.date);
        ks.signal = "limit_down_stuck";
        capital *= (1 + bar.pctChg / 100);
      } else {
        // Check sell conditions
        const pnlPct = (bar.close - buyPrice) / buyPrice;
        let sellReason = "";

        if (pnlPct <= stopLossPct) {
          sellReason = "止损";
          ks.signal  = "stop_loss";
        } else if (pnlPct >= takeProfitPct) {
          sellReason = "止盈";
          ks.signal  = "take_profit";
        } else if (holdDays >= maxHoldDays) {
          sellReason = "超时止损";
          ks.signal  = "sell";
        }

        if (sellReason) {
          const sellPrice = bar.open; // sell at open (T+1)
          const actualPnlPct = (sellPrice - buyPrice) / buyPrice;
          capital *= (1 + actualPnlPct);

          tradeId++;
          trades.push({
            tradeId,
            buyDate, buyPrice,
            buySignalType,
            buySignalReasons,
            limitDownStreak: buyStreak,
            sellDate: bar.date,
            sellPrice,
            pnl: actualPnlPct * 100 * buyPrice,
            pnlPct: actualPnlPct,
            sellReason,
            holdDays,
            cannotSellDates: [...cannotSellDates],
          });

          if (buySignalType === "both")                 bothTrades++;
          else if (buySignalType === "v_shape_reversal") vShapeTrades++;
          else                                           stabilizationTrades++;

          inPosition = false;
          holdDays   = 0;
          cannotSellDates = [];
        } else {
          capital *= (1 + bar.pctChg / 100);
        }
      }
    }

    // Detect streak on each bar (not in position)
    if (!inPosition && i >= 10) {
      const streakInfo = calculateLimitDownStreak(windowSlice, limitDownPct);

      if (streakInfo.streak >= p.minLimitDownStreak && streakInfo.streak <= p.maxLimitDownStreak) {
        // Check if streak just opened (openedDate is today)
        if (streakInfo.openedDate === bar.date) {
          // Record streak event
          const lastEvent = streakEvents.length > 0 ? streakEvents[streakEvents.length - 1] : null;
          if (!lastEvent || lastEvent.streak !== streakInfo.streak || lastEvent.date !== streakInfo.streakEnd) {
            streakEvents.push({
              date: bar.date,
              streak: streakInfo.streak,
              openedDate: streakInfo.openedDate,
            });
          }
          ks.signal = "streak_open";

          // Generate signal and buy on next day (T+1)
          const stabResult = detectPriceStabilization(windowSlice, streakInfo, p);
          const vshapeResult = detectVShapeReversal(windowSlice, streakInfo, p);

          const hasStab   = stabResult.stable   && stabResult.score >= p.stabilizationMinScore;
          const hasVShape = vshapeResult.vShape  && vshapeResult.score >= p.vShapeMinScore;

          let signalT: "price_stabilization" | "v_shape_reversal" | "both" | "none" = "none";
          if (hasStab && hasVShape)  signalT = "both";
          else if (hasVShape)        signalT = "v_shape_reversal";
          else if (hasStab)          signalT = "price_stabilization";

          if (signalT !== "none" && i + 1 < klineOldestFirst.length) {
            const nextBar = klineOldestFirst[i + 1];
            if (nextBar.pctChg > limitDownThr) {
              // Buy at next open
              buyPrice = nextBar.open;
              buyDate  = nextBar.date;
              buyStreak = streakInfo.streak;
              buySignalType = signalT;
              buySignalReasons = [
                `连续跌停${streakInfo.streak}个`,
                ...(hasStab ? stabResult.metConditions.slice(0, 2) : []),
                ...(hasVShape ? vshapeResult.metConditions.slice(0, 2) : []),
              ];
              inPosition = true;
              holdDays   = 0;
              cannotSellDates = [];
              ks.signal  = "buy";
            }
          }
        }
      }
    }

    // Update peak and drawdown
    if (capital > peakCapital) peakCapital = capital;
    const dd = (capital - peakCapital) / peakCapital;
    if (dd < maxDrawdown) maxDrawdown = dd;

    equity.push({ date: bar.date, value: Math.round(capital * 100) / 100 });
    klineSignals.push(ks);
  }

  // If still in position at end, force sell at last close
  if (inPosition && klineOldestFirst.length > 0) {
    const lastBar = klineOldestFirst[klineOldestFirst.length - 1];
    if (lastBar.pctChg > limitDownThr) {
      const sellPrice = lastBar.close;
      const actualPnlPct = (sellPrice - buyPrice) / buyPrice;
      capital *= (1 + actualPnlPct);
      tradeId++;
      trades.push({
        tradeId, buyDate, buyPrice,
        buySignalType, buySignalReasons,
        limitDownStreak: buyStreak,
        sellDate: lastBar.date,
        sellPrice,
        pnl: actualPnlPct * 100 * buyPrice,
        pnlPct: actualPnlPct,
        sellReason: "回测结束",
        holdDays,
        cannotSellDates: [...cannotSellDates],
      });
    }
  }

  const totalReturn = (capital - 100) / 100;
  const tradingDays = klineOldestFirst.length;
  const years = tradingDays / 252;
  const annualReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;

  const winTrades = trades.filter(t => t.pnlPct > 0).length;
  const winRate   = trades.length > 0 ? winTrades / trades.length : 0;

  return {
    ok: true, tsCode, name,
    totalReturn,
    annualReturn,
    maxDrawdown,
    winRate,
    totalTrades: trades.length,
    limitDownStuckCount,
    suspendedCount: 0,
    stabilizationTrades,
    vShapeTrades,
    bothTrades,
    trades,
    klineSignals,
    equity,
    streakEvents,
  };
}
