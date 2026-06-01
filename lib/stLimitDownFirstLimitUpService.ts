/**
 * lib/stLimitDownFirstLimitUpService.ts
 *
 * A股 ST 连续跌停后首板策略 — 核心服务
 *
 * 核心逻辑：筛选连续跌停 5-50 个之后出现第一个涨停板的 ST 股票，
 *           结合退市风险过滤和重组/修复预期评分，作为高风险买入候选。
 *
 * ⚠️ 服务端专用 — 请勿在 Client Component 中直接 import。
 * ⚠️ 本策略属于极高风险研究策略，不构成投资建议。
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
  calculateDelistingRiskScore,
  type DelistingRiskResult,
} from "./stDelistingRiskFilter";

import {
  getSTFundamentalRisk,
  type STFundamentalRiskResult,
} from "./stFundamentalRiskService";

import {
  type DayBar,
  isLimitDownBar,
  isOneWordLimitDown,
  calculateLimitDownStreak,
  calculateRestructuringExpectationScore,
  type LimitDownStreakResult,
  type RestructuringExpectationResult,
} from "./stLimitDownWatchService";

// ─── 工具 ─────────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}
function tsCodeToSymbol(c: string): string { return c.split(".")[0] ?? c; }

// Re-export DayBar for frontend
export type { DayBar };

// ─── 涨停判断 ─────────────────────────────────────────────────────────────────

/**
 * 判断是否触及涨停
 * ST 股涨停幅度 +5%，0.2% 容差
 */
export function isLimitUpBar(bar: DayBar): boolean {
  if (bar.preClose && bar.preClose > 0) {
    const limitPrice = bar.preClose * 1.05;
    return bar.close >= limitPrice * 0.998;
  }
  return bar.pctChg >= 4.8;
}

/** 判断是否一字涨停（open≈high≈low≈close≈涨停价） */
export function isOneWordLimitUp(bar: DayBar): boolean {
  if (!isLimitUpBar(bar)) return false;
  const range = bar.high - bar.low;
  return range / Math.max(bar.close, 0.01) < 0.005;
}

/** 判断是否开板回封（开盘低于涨停，最终收盘在涨停） */
export function isOpenAndResealLimitUp(bar: DayBar): boolean {
  if (!isLimitUpBar(bar)) return false;
  if (!bar.preClose) return false;
  const limitPrice = bar.preClose * 1.05;
  return bar.open < limitPrice * 0.998 && bar.close >= limitPrice * 0.998;
}

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface STFirstLimitUpParams {
  minLimitDownStreak:               number;   // 5
  maxLimitDownStreak:               number;   // 50
  maxDelistingRiskScore:            number;   // 40
  minFirstLimitUpStrengthScore:     number;   // 60
  minRestructuringExpectationScore: number;   // 40
  allowOneWordLimitUp:              boolean;  // true（允许一字涨停进候选，但不自动买入）
  autoOneWordLimitUpBuy:            boolean;  // false（一字涨停不自动买入）
  buyMode: "close" | "nextOpen" | "nextDip" | "watchOnly";
  stopLossPercent:       number;   // 5（正数，代表 -5% 止损）
  takeProfitPercent:     number;   // 15（正数，代表 +15% 止盈）
  timeStopDays:          number;   // 5
  maxSinglePositionRatio: number;  // 2（%）
  maxTotalPositionRatio:  number;  // 10（%）
  requireMoneyFlow:       boolean; // false
  requireAnnouncementData: boolean;// false
}

export const DEFAULT_FIRST_LIMIT_UP_PARAMS: STFirstLimitUpParams = {
  minLimitDownStreak:               5,
  maxLimitDownStreak:               50,
  maxDelistingRiskScore:            40,
  minFirstLimitUpStrengthScore:     60,
  minRestructuringExpectationScore: 40,
  allowOneWordLimitUp:              true,
  autoOneWordLimitUpBuy:            false,
  buyMode:                          "nextOpen",
  stopLossPercent:                  5,
  takeProfitPercent:                15,
  timeStopDays:                     5,
  maxSinglePositionRatio:           2,
  maxTotalPositionRatio:            10,
  requireMoneyFlow:                 false,
  requireAnnouncementData:          false,
};

export interface FirstLimitUpResult {
  hasFirstLimitUp:                      boolean;
  firstLimitUpDate:                     string;
  limitDownStartDate:                   string;
  limitDownEndDate:                     string;
  limitDownStreak:                      number;
  daysFromLimitDownEndToFirstLimitUp:   number;
  isOneWordLimitUp:                     boolean;
  isOpenLimitUp:                        boolean;
  isOpenAndReseal:                      boolean;
  closePrice:                           number;
  limitUpPrice:                         number;
  volume:                               number;
  amount:                               number;
  turnoverRate:                         number;
  firstLimitUpType: "一字涨停" | "换手涨停" | "开板回封" | "普通涨停";
  reasons:          string[];
  failedReasons:    string[];
}

export interface FirstLimitUpStrengthResult {
  firstLimitUpStrengthScore: number;  // 0-100
  factors: {
    limitDownStreakScore:   number;
    timingScore:           number;
    volumeRecoveryScore:   number;
    turnoverRecoveryScore: number;
    moneyFlowScore:        number;
    limitUpSealScore:      number;
    continuationScore:     number;
  };
  reasons: string[];
  risks:   string[];
}

export interface STFirstLimitUpCandidate {
  tsCode:  string;
  symbol:  string;
  name:    string;
  stType:  string;

  limitDownStreak:    number;
  limitDownStartDate: string;
  limitDownEndDate:   string;

  firstLimitUpDate:   string;
  firstLimitUpType:   "一字涨停" | "换手涨停" | "开板回封" | "普通涨停";
  isOneWordLimitUp:   boolean;

  currentPrice:     number;
  currentChangePct: number;

  delistingRiskScore:            number;
  delistingRiskLevel:            string;
  firstLimitUpStrengthScore:     number;
  restructuringExpectationScore: number;
  financialRepairScore:          number;
  cashflowImprovementScore:      number;

  currentStatus: "首板买入候选" | "一字涨停观察" | "高风险剔除" | "数据不足";
  buyMode:          string;
  buySignalReasons: string[];
  risks:            string[];

  announcementDataAvailable: boolean;
  degraded:                  boolean;
  degradedReasons:           string[];

  addedAt:       string;
  lastScannedAt: string;
  source:        string;
}

export interface STFirstLimitUpScanResult {
  ok:         boolean;
  scannedAt:  string;
  params:     STFirstLimitUpParams;
  candidates: STFirstLimitUpCandidate[];           // 首板买入候选
  oneWordWatch: STFirstLimitUpCandidate[];         // 一字涨停观察
  highRiskExcluded: {
    tsCode: string; name: string; symbol: string;
    reason: string; limitDownStreak: number; delistingRiskScore: number;
  }[];
  insufficientData: {
    tsCode: string; name: string; symbol: string; reason: string;
  }[];
  notMatchingConditions: {
    tsCode: string; name: string; symbol: string; reason: string;
  }[];
  stats: {
    totalSTScanned:     number;
    hadLimitDownStreak: number;
    inRange:            number;
    hadFirstLimitUp:    number;
    candidatesCount:    number;
    oneWordWatchCount:  number;
    highRiskCount:      number;
    insufficientDataCount: number;
    avgLimitDownStreak: number;
    maxLimitDownStreak: number;
  };
  scanDurationMs: number;
  error?: string;
}

export interface BacktestTrade {
  tradeId:      number;
  buyDate:      string;
  buyPrice:     number;
  buyMode:      string;
  sellDate:     string | null;
  sellPrice:    number | null;
  exitReason:   string | null;
  holdDays:     number;
  pnlPercent:   number | null;
  limitDownHeld: boolean;   // was forced to hold on a limit-down day
  limitDownStartDate: string;
  limitDownEndDate:   string;
  limitDownStreak:    number;
  firstLimitUpDate:   string;
  firstLimitUpType:   string;
  signalReasons:      string[];
}

export interface STFirstLimitUpSingleResult {
  ok:        boolean;
  tsCode:    string;
  symbol:    string;
  name:      string;
  isST:      boolean;
  stType:    string;

  streakResult:    LimitDownStreakResult | null;
  inStreakRange:   boolean;
  firstLimitUp:    FirstLimitUpResult | null;
  strengthResult:  FirstLimitUpStrengthResult | null;
  delistingRisk:   DelistingRiskResult | null;
  fundamentals:    STFundamentalRiskResult | null;
  restructuring:   RestructuringExpectationResult;

  classification:       "buy_candidate" | "one_word_watch" | "high_risk" | "insufficient_data" | "not_matching";
  classificationReason: string;
  candidate:            STFirstLimitUpCandidate | null;
  bars:                 DayBar[];
  error?: string;
}

export interface STFirstLimitUpBacktestResult {
  ok:     boolean;
  tsCode: string;
  symbol: string;
  name:   string;
  params: STFirstLimitUpParams;

  streakResult:   LimitDownStreakResult | null;
  firstLimitUp:   FirstLimitUpResult | null;

  trades:       BacktestTrade[];
  totalTrades:  number;
  winTrades:    number;
  lossTrades:   number;
  winRate:      number;
  avgPnlPercent: number;
  maxPnlPercent: number;
  minPnlPercent: number;
  totalReturn:   number;
  maxDrawdown:   number;

  bars: (DayBar & {
    signal?: "buy" | "sell" | "stop_loss" | "take_profit" | "time_stop";
    signalLabel?: string;
    inPosition?: boolean;
    limitDownInPosition?: boolean;
  })[];

  error?: string;
}

// ─── 核心函数 1：识别连续跌停后的第一个涨停 ──────────────────────────────────────

/**
 * 识别连续跌停后的第一个涨停板
 * bars 最新在前（Tushare 默认顺序）
 */
export function detectFirstLimitUpAfterLimitDown(
  bars: DayBar[],
  params: Pick<STFirstLimitUpParams, "minLimitDownStreak" | "maxLimitDownStreak">,
): FirstLimitUpResult {
  const empty: FirstLimitUpResult = {
    hasFirstLimitUp: false,
    firstLimitUpDate: "", limitDownStartDate: "", limitDownEndDate: "",
    limitDownStreak: 0, daysFromLimitDownEndToFirstLimitUp: 0,
    isOneWordLimitUp: false, isOpenLimitUp: false, isOpenAndReseal: false,
    closePrice: 0, limitUpPrice: 0, volume: 0, amount: 0, turnoverRate: 0,
    firstLimitUpType: "普通涨停",
    reasons: [], failedReasons: [],
  };

  const streakResult = calculateLimitDownStreak(bars);
  if (!streakResult) {
    return { ...empty, failedReasons: ["未检测到连续跌停序列"] };
  }

  if (streakResult.streak < params.minLimitDownStreak) {
    return { ...empty, limitDownStreak: streakResult.streak,
      failedReasons: [`连续跌停 ${streakResult.streak} 次，不足最低要求 ${params.minLimitDownStreak} 次`] };
  }
  if (streakResult.streak > params.maxLimitDownStreak) {
    return { ...empty, limitDownStreak: streakResult.streak,
      failedReasons: [`连续跌停 ${streakResult.streak} 次，超过上限 ${params.maxLimitDownStreak} 次`] };
  }

  if (streakResult.isStillLimitDown) {
    return { ...empty, limitDownStreak: streakResult.streak,
      limitDownStartDate: streakResult.streakStartDate,
      limitDownEndDate: streakResult.streakEndDate,
      failedReasons: ["仍在连续跌停中，尚未出现首板涨停"] };
  }

  // 找跌停区间结束位置（streakEndDate 是最近一根跌停日）
  const streakEndIdx = bars.findIndex(b => b.date === streakResult.streakEndDate);
  if (streakEndIdx < 0) {
    return { ...empty, limitDownStreak: streakResult.streak, failedReasons: ["无法定位跌停结束位置"] };
  }

  // post-streak bars = bars[0..streakEndIdx-1]（最新在前）
  const postStreakBars = bars.slice(0, streakEndIdx);
  if (postStreakBars.length === 0) {
    return { ...empty, limitDownStreak: streakResult.streak,
      limitDownStartDate: streakResult.streakStartDate,
      limitDownEndDate: streakResult.streakEndDate,
      failedReasons: ["跌停刚结束，暂无后续 K 线数据"] };
  }

  // 按时间正序扫描（从 postStreakBars 末尾到头），找第一个涨停
  let firstLimitUpBar: DayBar | null = null;
  let firstLimitUpArrIdx = -1; // index in postStreakBars

  for (let j = postStreakBars.length - 1; j >= 0; j--) {
    if (isLimitUpBar(postStreakBars[j]!)) {
      firstLimitUpBar = postStreakBars[j]!;
      firstLimitUpArrIdx = j;
      break; // 找到时间上最早的涨停
    }
  }

  if (!firstLimitUpBar) {
    return {
      ...empty, limitDownStreak: streakResult.streak,
      limitDownStartDate: streakResult.streakStartDate,
      limitDownEndDate: streakResult.streakEndDate,
      failedReasons: ["连续跌停打开后尚未出现涨停板"],
    };
  }

  // 计算从跌停结束到首板涨停的天数（postStreakBars长度 - 1 - firstLimitUpArrIdx = 距今天数之差）
  const daysToFirstLimitUp = postStreakBars.length - 1 - firstLimitUpArrIdx;

  const oneWord    = isOneWordLimitUp(firstLimitUpBar);
  const openReseal = isOpenAndResealLimitUp(firstLimitUpBar);
  const opened     = !oneWord && firstLimitUpBar.preClose && firstLimitUpBar.open < firstLimitUpBar.preClose * 1.05 * 0.998;

  let limitUpType: FirstLimitUpResult["firstLimitUpType"] = "普通涨停";
  if (oneWord)    limitUpType = "一字涨停";
  else if (openReseal) limitUpType = "开板回封";
  else if (opened)     limitUpType = "换手涨停";

  const limitUpPrice = firstLimitUpBar.preClose
    ? firstLimitUpBar.preClose * 1.05
    : firstLimitUpBar.close;

  const reasons: string[] = [
    `连续跌停 ${streakResult.streak} 板（${streakResult.streakStartDate} ~ ${streakResult.streakEndDate}）`,
    `跌停打开后第 ${daysToFirstLimitUp + 1} 个交易日出现${limitUpType}`,
  ];
  if (oneWord) reasons.push("一字涨停：全天封板，买入难度极高");
  if (openReseal) reasons.push("开板回封：有买入机会");

  return {
    hasFirstLimitUp: true,
    firstLimitUpDate: firstLimitUpBar.date,
    limitDownStartDate: streakResult.streakStartDate,
    limitDownEndDate:   streakResult.streakEndDate,
    limitDownStreak:    streakResult.streak,
    daysFromLimitDownEndToFirstLimitUp: daysToFirstLimitUp,
    isOneWordLimitUp: oneWord,
    isOpenLimitUp:    !!opened,
    isOpenAndReseal:  openReseal,
    closePrice:    firstLimitUpBar.close,
    limitUpPrice,
    volume:        firstLimitUpBar.volume,
    amount:        firstLimitUpBar.amount,
    turnoverRate:  0,
    firstLimitUpType: limitUpType,
    reasons,
    failedReasons: [],
  };
}

// ─── 核心函数 2：首板强度评分 ─────────────────────────────────────────────────

export function calculateFirstLimitUpStrengthScore(
  bars: DayBar[],
  limitUpResult: FirstLimitUpResult,
  basicRecords: TushareRecord[],
): FirstLimitUpStrengthResult {
  const risks: string[] = [];
  const reasons: string[] = [];

  if (!limitUpResult.hasFirstLimitUp) {
    return {
      firstLimitUpStrengthScore: 0,
      factors: { limitDownStreakScore:0, timingScore:0, volumeRecoveryScore:0,
        turnoverRecoveryScore:0, moneyFlowScore:0, limitUpSealScore:0, continuationScore:0 },
      reasons: ["未出现首板涨停，强度评分为 0"],
      risks: [],
    };
  }

  // ── 1. 连续跌停数量分（最多 25 分）
  const streak = limitUpResult.limitDownStreak;
  let limitDownStreakScore = 0;
  if (streak >= 5  && streak <  10) { limitDownStreakScore = 10; }
  else if (streak >= 10 && streak < 20) { limitDownStreakScore = 18; }
  else if (streak >= 20 && streak < 30) { limitDownStreakScore = 22; }
  else if (streak >= 30) { limitDownStreakScore = 25; }
  if (limitDownStreakScore > 0) {
    reasons.push(`连续跌停 ${streak} 板，基础分 ${limitDownStreakScore}`);
  }

  // ── 2. 出现时机分（最多 20 分）：越早出现得分越高
  const daysTiming = limitUpResult.daysFromLimitDownEndToFirstLimitUp;
  let timingScore = 0;
  if (daysTiming === 0)      { timingScore = 20; reasons.push("跌停打开当日即涨停，时机极佳"); }
  else if (daysTiming <= 2)  { timingScore = 17; reasons.push(`跌停打开后 ${daysTiming+1} 日涨停，时机好`); }
  else if (daysTiming <= 5)  { timingScore = 13; }
  else if (daysTiming <= 10) { timingScore = 8;  }
  else                       { timingScore = 4;  risks.push(`涨停出现较晚（${daysTiming+1} 个交易日后）`); }

  // 找首板涨停在 bars 中的位置
  const limitUpIdx = bars.findIndex(b => b.date === limitUpResult.firstLimitUpDate);

  // ── 3. 成交量恢复分（最多 20 分）
  let volumeRecoveryScore = 0;
  if (limitUpIdx >= 0) {
    const limitUpBar = bars[limitUpIdx]!;
    // 跌停区间平均量（取跌停后10根均量作为基准不太对，用近30根均量）
    const recentBars = bars.slice(limitUpIdx + 1, limitUpIdx + 31);
    const avgVol = recentBars.length > 0
      ? recentBars.reduce((s, b) => s + b.volume, 0) / recentBars.length
      : 0;
    if (avgVol > 0) {
      const volRatio = limitUpBar.volume / avgVol;
      if (volRatio >= 5)      { volumeRecoveryScore = 20; reasons.push(`成交量暴增 ${volRatio.toFixed(1)} 倍`); }
      else if (volRatio >= 3) { volumeRecoveryScore = 15; reasons.push(`成交量放大 ${volRatio.toFixed(1)} 倍`); }
      else if (volRatio >= 2) { volumeRecoveryScore = 10; }
      else if (volRatio >= 1) { volumeRecoveryScore = 5;  }
      else                    { risks.push("成交量未明显放大，关注度不足"); }
    }
  }

  // ── 4. 换手率恢复分（最多 15 分）
  let turnoverRecoveryScore = 0;
  const latestBasic = basicRecords[0];
  const turnover = toNum(latestBasic?.turnover_rate);
  if (turnover > 0) {
    if (turnover >= 10)     { turnoverRecoveryScore = 15; reasons.push(`换手率 ${turnover.toFixed(1)}%，充分换手`); }
    else if (turnover >= 5) { turnoverRecoveryScore = 10; }
    else if (turnover >= 2) { turnoverRecoveryScore = 6;  }
    else                    { turnoverRecoveryScore = 2; risks.push(`换手率偏低（${turnover.toFixed(1)}%）`); }
  }

  // ── 5. 资金流分（暂未接入实时资金流，暂时 0 分）
  const moneyFlowScore = 0; // 资金流数据暂未接入

  // ── 6. 一字涨停封板分（最多 10 分）
  let limitUpSealScore = 0;
  if (limitUpResult.isOneWordLimitUp) {
    limitUpSealScore = 10;
    reasons.push("一字涨停，封板强度最高");
    risks.push("一字涨停无法买入，需等待打开或次日");
  } else if (limitUpResult.isOpenAndReseal) {
    limitUpSealScore = 8;
    reasons.push("开板回封，有买入机会");
  } else if (limitUpResult.isOpenLimitUp) {
    limitUpSealScore = 4;
  }

  // ── 7. 次日延续分（最多 10 分）
  let continuationScore = 0;
  if (limitUpIdx > 0) {
    const nextBar = bars[limitUpIdx - 1];
    if (nextBar) {
      if (isLimitUpBar(nextBar)) {
        continuationScore = 10;
        reasons.push("次日继续涨停，走势极强");
      } else if (nextBar.pctChg > 0) {
        continuationScore = 5;
        reasons.push(`次日上涨 ${nextBar.pctChg.toFixed(2)}%`);
      } else if (nextBar.pctChg < -3) {
        risks.push(`次日大幅下跌 ${nextBar.pctChg.toFixed(2)}%，动能不足`);
      } else if (isLimitDownBar(nextBar)) {
        continuationScore = 0;
        risks.push("次日再次跌停，严重警告");
      }
    }
  }

  const total = Math.min(100,
    limitDownStreakScore + timingScore + volumeRecoveryScore +
    turnoverRecoveryScore + moneyFlowScore + limitUpSealScore + continuationScore,
  );

  return {
    firstLimitUpStrengthScore: total,
    factors: {
      limitDownStreakScore,
      timingScore,
      volumeRecoveryScore,
      turnoverRecoveryScore,
      moneyFlowScore,
      limitUpSealScore,
      continuationScore,
    },
    reasons,
    risks,
  };
}

// ─── 核心函数 3：单股分析 ────────────────────────────────────────────────────

export async function analyzeSTLimitDownFirstLimitUpStock(
  tsCode: string,
  name:   string,
  params: STFirstLimitUpParams = DEFAULT_FIRST_LIMIT_UP_PARAMS,
): Promise<STFirstLimitUpSingleResult> {
  const symbol = tsCodeToSymbol(tsCode);
  const stType = name.includes("*ST") || name.includes("S*ST") ? "*ST"
               : name.includes("SST") ? "SST" : "ST";
  const isST = /ST|st/i.test(name);

  const notFound: STFirstLimitUpSingleResult = {
    ok: false, tsCode, symbol, name, isST, stType,
    streakResult: null, inStreakRange: false,
    firstLimitUp: null, strengthResult: null,
    delistingRisk: null, fundamentals: null,
    restructuring: { score: 0, degraded: true, basis: [] },
    classification: "insufficient_data",
    classificationReason: "数据获取失败",
    candidate: null, bars: [],
  };

  // 拉取 K 线（280 天：足够覆盖跌停 + 首板 + 观察期）
  const klineRes = await getDailyKLine(tsCode, daysAgoStr(280), todayStr());
  if (!klineRes.ok || klineRes.records.length < 10) {
    return { ...notFound, error: klineRes.ok ? "K 线数据不足" : klineRes.error };
  }
  const bars: DayBar[] = klineRes.records.map(r => ({
    date:     String(r.trade_date ?? ""),
    open:     toNum(r.open), close: toNum(r.close),
    high:     toNum(r.high), low:   toNum(r.low),
    volume:   toNum(r.vol),  amount: toNum(r.amount),
    pctChg:   toNum(r.pct_chg),
    preClose: toNum(r.pre_close) || undefined,
  }));

  // 拉取 daily_basic
  const basicRes = await getDailyBasic(tsCode, daysAgoStr(30), todayStr());
  const basicRecs = basicRes.ok ? basicRes.records : [];

  // 1. 连续跌停检测
  const streakResult = calculateLimitDownStreak(bars);
  if (!streakResult) {
    return { ...notFound, bars: bars.slice(0, 60), classification: "not_matching",
      classificationReason: "未检测到连续跌停序列" };
  }

  const inRange = streakResult.streak >= params.minLimitDownStreak &&
                  streakResult.streak <= params.maxLimitDownStreak;
  if (!inRange) {
    return {
      ...notFound, bars: bars.slice(0, 60), streakResult, inStreakRange: false,
      classification: "not_matching",
      classificationReason: streakResult.streak < params.minLimitDownStreak
        ? `连续跌停 ${streakResult.streak} 次，不足最低要求 ${params.minLimitDownStreak} 次`
        : `连续跌停 ${streakResult.streak} 次，超过上限 ${params.maxLimitDownStreak} 次`,
    };
  }

  // 2. 首板涨停检测
  const firstLimitUp = detectFirstLimitUpAfterLimitDown(bars, params);
  if (!firstLimitUp.hasFirstLimitUp) {
    return {
      ...notFound, bars: bars.slice(0, 60), streakResult, inStreakRange: true,
      firstLimitUp,
      classification: "not_matching",
      classificationReason: firstLimitUp.failedReasons[0] ?? "未出现首板涨停",
    };
  }

  // 3. 退市风险
  const delistingRisk = await calculateDelistingRiskScore(tsCode, false, params.maxDelistingRiskScore);
  if (delistingRisk.excluded) {
    return {
      ...notFound, bars: bars.slice(0, 60), streakResult, inStreakRange: true,
      firstLimitUp, delistingRisk,
      classification: "high_risk",
      classificationReason: `退市风险过高（评分 ${delistingRisk.delistingRiskScore}，阈值 ${params.maxDelistingRiskScore}）`,
    };
  }

  // 4. 基本面风险
  const fundamentals = await getSTFundamentalRisk(tsCode).catch(() => null);

  // 5. 首板强度评分
  const strengthResult = calculateFirstLimitUpStrengthScore(bars, firstLimitUp, basicRecs);

  // 6. 重组/修复预期
  const restructuring = calculateRestructuringExpectationScore(fundamentals ?? null);

  // 7. 分类判断
  const oneWord = firstLimitUp.isOneWordLimitUp;
  const strengthOK = strengthResult.firstLimitUpStrengthScore >= params.minFirstLimitUpStrengthScore;
  const restructuringOK = restructuring.score >= params.minRestructuringExpectationScore;

  let classification: STFirstLimitUpSingleResult["classification"];
  let classificationReason: string;

  if (oneWord && !params.allowOneWordLimitUp) {
    classification = "one_word_watch";
    classificationReason = "一字涨停，已禁止进入候选（参数配置）";
  } else if (oneWord) {
    classification = "one_word_watch";
    classificationReason = "一字涨停，无法直接买入，进入一字涨停观察";
  } else if (!strengthOK) {
    classification = "not_matching";
    classificationReason = `首板强度不足（${strengthResult.firstLimitUpStrengthScore} < ${params.minFirstLimitUpStrengthScore}）`;
  } else if (!restructuringOK) {
    classification = "not_matching";
    classificationReason = `重组/修复预期不足（${restructuring.score} < ${params.minRestructuringExpectationScore}）`;
  } else {
    classification = "buy_candidate";
    classificationReason = `连续跌停 ${streakResult.streak} 板后出现首板涨停，强度 ${strengthResult.firstLimitUpStrengthScore}，进入买入候选`;
  }

  // 8. 构建候选对象
  const status: STFirstLimitUpCandidate["currentStatus"] =
    classification === "buy_candidate" ? "首板买入候选" :
    classification === "one_word_watch" ? "一字涨停观察" :
    "数据不足";

  const degradedReasons: string[] = [];
  if (restructuring.degraded && restructuring.degradedReason) {
    degradedReasons.push(restructuring.degradedReason);
  }
  if (delistingRisk.announcementRiskDegraded) {
    degradedReasons.push("公告数据暂缺，退市风险判断已降级");
  }

  const candidate: STFirstLimitUpCandidate = {
    tsCode, symbol, name, stType,
    limitDownStreak:    streakResult.streak,
    limitDownStartDate: streakResult.streakStartDate,
    limitDownEndDate:   streakResult.streakEndDate,
    firstLimitUpDate:   firstLimitUp.firstLimitUpDate,
    firstLimitUpType:   firstLimitUp.firstLimitUpType,
    isOneWordLimitUp:   oneWord,
    currentPrice:       bars[0]?.close ?? 0,
    currentChangePct:   bars[0]?.pctChg ?? 0,
    delistingRiskScore:            delistingRisk.delistingRiskScore,
    delistingRiskLevel:            delistingRisk.riskLevel,
    firstLimitUpStrengthScore:     strengthResult.firstLimitUpStrengthScore,
    restructuringExpectationScore: restructuring.score,
    financialRepairScore:          fundamentals?.financialRepairScore.score ?? 0,
    cashflowImprovementScore:      fundamentals?.cashflowImprovementScore.score ?? 0,
    currentStatus:    status,
    buyMode:          params.buyMode,
    buySignalReasons: [...firstLimitUp.reasons, ...strengthResult.reasons],
    risks:            [...strengthResult.risks, ...delistingRisk.riskFlags],
    announcementDataAvailable: false,
    degraded:         degradedReasons.length > 0,
    degradedReasons,
    addedAt:       new Date().toISOString(),
    lastScannedAt: new Date().toISOString(),
    source:        "Tushare",
  };

  return {
    ok: true, tsCode, symbol, name, isST, stType,
    streakResult, inStreakRange: true,
    firstLimitUp, strengthResult, delistingRisk, fundamentals, restructuring,
    classification, classificationReason,
    candidate,
    bars: bars.slice(0, 80),
  };
}

// ─── 核心函数 4：批量扫描 ────────────────────────────────────────────────────

export async function scanSTLimitDownFirstLimitUpCandidates(
  params: STFirstLimitUpParams = DEFAULT_FIRST_LIMIT_UP_PARAMS,
  concurrency = 4,
): Promise<STFirstLimitUpScanResult> {
  const t0 = Date.now();

  const basicRes = await getAStockBasic("L");
  if (!basicRes.ok) {
    return {
      ok: false, scannedAt: new Date().toISOString(), params,
      candidates: [], oneWordWatch: [], highRiskExcluded: [],
      insufficientData: [], notMatchingConditions: [],
      stats: { totalSTScanned:0, hadLimitDownStreak:0, inRange:0, hadFirstLimitUp:0,
        candidatesCount:0, oneWordWatchCount:0, highRiskCount:0, insufficientDataCount:0,
        avgLimitDownStreak:0, maxLimitDownStreak:0 },
      scanDurationMs: Date.now() - t0,
      error: `获取股票池失败：${basicRes.error}`,
    };
  }

  const stStocks = basicRes.records
    .filter(r => /ST|SST/i.test(String(r.name ?? "")))
    .map(r => ({
      tsCode: String(r.ts_code ?? ""),
      symbol: String(r.symbol ?? ""),
      name:   String(r.name ?? ""),
    }))
    .filter(s => s.tsCode !== "");

  const candidates:    STFirstLimitUpCandidate[] = [];
  const oneWordWatch:  STFirstLimitUpCandidate[] = [];
  const highRiskExcluded: STFirstLimitUpScanResult["highRiskExcluded"] = [];
  const insufficientData: STFirstLimitUpScanResult["insufficientData"] = [];
  const notMatchingConditions: STFirstLimitUpScanResult["notMatchingConditions"] = [];

  let hadLimitDownStreak = 0;
  let inRange = 0;
  let hadFirstLimitUp = 0;
  let streakSum = 0;
  let streakMax = 0;

  async function processStock(stock: typeof stStocks[0]) {
    try {
      const result = await analyzeSTLimitDownFirstLimitUpStock(stock.tsCode, stock.name, params);
      if (!result.ok && result.classification === "insufficient_data") {
        insufficientData.push({ tsCode: stock.tsCode, name: stock.name, symbol: stock.symbol, reason: result.error ?? "数据不足" });
        return;
      }
      if (result.streakResult) {
        hadLimitDownStreak++;
        if (result.inStreakRange) {
          inRange++;
          streakSum += result.streakResult.streak;
          streakMax = Math.max(streakMax, result.streakResult.streak);
        }
      }
      if (result.firstLimitUp?.hasFirstLimitUp) hadFirstLimitUp++;

      if (result.classification === "buy_candidate" && result.candidate) {
        candidates.push(result.candidate);
      } else if (result.classification === "one_word_watch" && result.candidate) {
        oneWordWatch.push(result.candidate);
      } else if (result.classification === "high_risk") {
        highRiskExcluded.push({
          tsCode: stock.tsCode, name: stock.name, symbol: stock.symbol,
          reason: result.classificationReason,
          limitDownStreak: result.streakResult?.streak ?? 0,
          delistingRiskScore: result.delistingRisk?.delistingRiskScore ?? 0,
        });
      } else if (result.classification === "not_matching") {
        notMatchingConditions.push({ tsCode: stock.tsCode, name: stock.name, symbol: stock.symbol, reason: result.classificationReason });
      } else if (result.classification === "insufficient_data") {
        insufficientData.push({ tsCode: stock.tsCode, name: stock.name, symbol: stock.symbol, reason: result.classificationReason });
      }
    } catch (err) {
      insufficientData.push({ tsCode: stock.tsCode, name: stock.name, symbol: stock.symbol, reason: `处理出错：${String(err)}` });
    }
  }

  // 并发执行（限速）
  for (let i = 0; i < stStocks.length; i += concurrency) {
    const batch = stStocks.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(processStock));
  }

  // 按首板强度排序
  candidates.sort((a, b) => b.firstLimitUpStrengthScore - a.firstLimitUpStrengthScore);
  oneWordWatch.sort((a, b) => b.firstLimitUpStrengthScore - a.firstLimitUpStrengthScore);

  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    params,
    candidates,
    oneWordWatch,
    highRiskExcluded,
    insufficientData,
    notMatchingConditions,
    stats: {
      totalSTScanned:     stStocks.length,
      hadLimitDownStreak,
      inRange,
      hadFirstLimitUp,
      candidatesCount:    candidates.length,
      oneWordWatchCount:  oneWordWatch.length,
      highRiskCount:      highRiskExcluded.length,
      insufficientDataCount: insufficientData.length,
      avgLimitDownStreak: inRange > 0 ? Math.round(streakSum / inRange) : 0,
      maxLimitDownStreak: streakMax,
    },
    scanDurationMs: Date.now() - t0,
  };
}

// ─── 核心函数 5：单股回测 ────────────────────────────────────────────────────

export async function backtestSTLimitDownFirstLimitUpStock(
  tsCode: string,
  name:   string,
  params: STFirstLimitUpParams = DEFAULT_FIRST_LIMIT_UP_PARAMS,
): Promise<STFirstLimitUpBacktestResult> {
  const symbol = tsCodeToSymbol(tsCode);

  const notFound: STFirstLimitUpBacktestResult = {
    ok: false, tsCode, symbol, name, params,
    streakResult: null, firstLimitUp: null,
    trades: [], totalTrades: 0, winTrades: 0, lossTrades: 0,
    winRate: 0, avgPnlPercent: 0, maxPnlPercent: 0, minPnlPercent: 0,
    totalReturn: 0, maxDrawdown: 0, bars: [],
  };

  // 拉取 400 天历史（足够覆盖多次跌停+首板事件）
  const klineRes = await getDailyKLine(tsCode, daysAgoStr(400), todayStr());
  if (!klineRes.ok || klineRes.records.length < 20) {
    return { ...notFound, error: klineRes.ok ? "K 线数据不足" : klineRes.error };
  }

  const rawBars: DayBar[] = klineRes.records.map(r => ({
    date:     String(r.trade_date ?? ""),
    open:     toNum(r.open), close: toNum(r.close),
    high:     toNum(r.high), low:   toNum(r.low),
    volume:   toNum(r.vol),  amount: toNum(r.amount),
    pctChg:   toNum(r.pct_chg),
    preClose: toNum(r.pre_close) || undefined,
  }));

  // rawBars 最新在前，对回测需要时间正序（最旧在前）
  const chronoBars = [...rawBars].reverse();

  // 模拟回测：状态机扫描
  const trades: BacktestTrade[] = [];
  let tradeId = 0;

  type BacktestState = "SCANNING" | "IN_STREAK" | "POST_STREAK" | "PENDING_BUY" | "IN_POSITION";
  let state: BacktestState = "SCANNING";
  let streakCount = 0;
  let streakStartDate = "";
  let streakEndDate = "";
  let streakLowest = Infinity;
  let firstLimitUpDate = "";
  let firstLimitUpType: STFirstLimitUpCandidate["firstLimitUpType"] = "普通涨停";
  let buyPrice = 0;
  let buyDate = "";
  let buyIdx = 0;
  let limitDownHeldDays = 0;
  let forcedHoldLimitDown = false;
  let signalReasons: string[] = [];

  for (let i = 0; i < chronoBars.length; i++) {
    const bar = chronoBars[i]!;

    if (state === "SCANNING") {
      if (isLimitDownBar(bar)) {
        state = "IN_STREAK";
        streakCount = 1;
        streakStartDate = bar.date;
        streakEndDate   = bar.date;
        streakLowest = bar.close;
      }
    } else if (state === "IN_STREAK") {
      if (isLimitDownBar(bar)) {
        streakCount++;
        streakEndDate = bar.date;
        if (bar.close < streakLowest) streakLowest = bar.close;
      } else {
        // 跌停结束
        if (streakCount >= params.minLimitDownStreak && streakCount <= params.maxLimitDownStreak) {
          state = "POST_STREAK";
          // 当前 bar 是跌停结束后第一天
          if (isLimitUpBar(bar)) {
            firstLimitUpDate = bar.date;
            firstLimitUpType = isOneWordLimitUp(bar) ? "一字涨停"
              : isOpenAndResealLimitUp(bar) ? "开板回封"
              : "换手涨停";
            signalReasons = [
              `连续跌停 ${streakCount} 板（${streakStartDate} ~ ${streakEndDate}）`,
              `首板涨停类型：${firstLimitUpType}`,
            ];
            if (params.buyMode === "close" && !(isOneWordLimitUp(bar) && !params.autoOneWordLimitUpBuy)) {
              buyPrice = bar.close;
              buyDate  = bar.date;
              buyIdx   = i;
              limitDownHeldDays = 0;
              forcedHoldLimitDown = false;
              state    = "IN_POSITION";
            } else if (params.buyMode === "nextOpen") {
              state = "PENDING_BUY";
            } else if (params.buyMode === "watchOnly") {
              state = "SCANNING"; // just skip
            }
          }
          // 否则继续 POST_STREAK 等待涨停
        } else {
          state = "SCANNING";
          streakCount = 0;
        }
      }
    } else if (state === "POST_STREAK") {
      if (isLimitDownBar(bar)) {
        // 重新跌停，视为新的连续跌停起点
        state = "IN_STREAK";
        streakCount = 1;
        streakStartDate = bar.date;
        streakEndDate   = bar.date;
        streakLowest = bar.close;
        firstLimitUpDate = "";
      } else if (!firstLimitUpDate && isLimitUpBar(bar)) {
        firstLimitUpDate = bar.date;
        firstLimitUpType = isOneWordLimitUp(bar) ? "一字涨停"
          : isOpenAndResealLimitUp(bar) ? "开板回封"
          : "换手涨停";
        signalReasons = [
          `连续跌停 ${streakCount} 板（${streakStartDate} ~ ${streakEndDate}）`,
          `首板涨停类型：${firstLimitUpType}`,
        ];
        if (params.buyMode === "close" && !(isOneWordLimitUp(bar) && !params.autoOneWordLimitUpBuy)) {
          buyPrice = bar.close;
          buyDate  = bar.date;
          buyIdx   = i;
          state    = "IN_POSITION";
          limitDownHeldDays = 0;
          forcedHoldLimitDown = false;
        } else if (params.buyMode === "nextOpen") {
          state = "PENDING_BUY";
        } else {
          state = "SCANNING";
        }
      }
    } else if (state === "PENDING_BUY") {
      // 下一个交易日开盘买入
      buyPrice = bar.open > 0 ? bar.open : bar.close;
      buyDate  = bar.date;
      buyIdx   = i;
      state    = "IN_POSITION";
      limitDownHeldDays = 0;
      forcedHoldLimitDown = false;
    } else if (state === "IN_POSITION") {
      const holdDays = i - buyIdx;
      if (holdDays === 0) continue; // T+1

      const pnl = (bar.close - buyPrice) / buyPrice;

      if (isLimitDownBar(bar)) {
        // 跌停无法卖出
        limitDownHeldDays++;
        forcedHoldLimitDown = true;
        continue;
      }

      let exitReason: string | null = null;
      if (pnl <= -(params.stopLossPercent / 100)) {
        exitReason = `止损（${(pnl * 100).toFixed(1)}%）`;
      } else if (pnl >= params.takeProfitPercent / 100) {
        exitReason = `止盈（${(pnl * 100).toFixed(1)}%）`;
      } else if (holdDays >= params.timeStopDays) {
        exitReason = `时间止损（持有 ${holdDays} 天）`;
      }

      if (exitReason) {
        tradeId++;
        trades.push({
          tradeId,
          buyDate, buyPrice, buyMode: params.buyMode,
          sellDate: bar.date, sellPrice: bar.close,
          exitReason, holdDays,
          pnlPercent: pnl * 100,
          limitDownHeld: forcedHoldLimitDown,
          limitDownStartDate: streakStartDate,
          limitDownEndDate:   streakEndDate,
          limitDownStreak:    streakCount,
          firstLimitUpDate, firstLimitUpType,
          signalReasons: [...signalReasons],
        });
        state = "SCANNING";
        streakCount = 0; firstLimitUpDate = ""; signalReasons = [];
      }
    }
  }

  // 若回测结束时仍持仓
  if (state === "IN_POSITION" && chronoBars.length > 0) {
    const bar = chronoBars[chronoBars.length - 1]!;
    const holdDays = chronoBars.length - 1 - buyIdx;
    const pnl = (bar.close - buyPrice) / buyPrice;
    tradeId++;
    trades.push({
      tradeId,
      buyDate, buyPrice, buyMode: params.buyMode,
      sellDate: bar.date, sellPrice: bar.close,
      exitReason: "回测结束仍持仓",
      holdDays, pnlPercent: pnl * 100,
      limitDownHeld: forcedHoldLimitDown,
      limitDownStartDate: streakStartDate,
      limitDownEndDate:   streakEndDate,
      limitDownStreak:    streakCount,
      firstLimitUpDate, firstLimitUpType,
      signalReasons: [...signalReasons],
    });
  }

  // 统计
  const pnls = trades.map(t => t.pnlPercent ?? 0);
  const winTrades  = trades.filter(t => (t.pnlPercent ?? 0) > 0).length;
  const lossTrades = trades.filter(t => (t.pnlPercent ?? 0) <= 0).length;
  const winRate    = trades.length > 0 ? winTrades / trades.length : 0;
  const avgPnl     = pnls.length > 0 ? pnls.reduce((s, v) => s + v, 0) / pnls.length : 0;
  const maxPnl     = pnls.length > 0 ? Math.max(...pnls) : 0;
  const minPnl     = pnls.length > 0 ? Math.min(...pnls) : 0;
  const totalReturn = pnls.reduce((s, v) => s * (1 + v / 100), 1) * 100 - 100;

  // 最大回撤（基于净值序列）
  let equity = 1;
  let peak   = 1;
  let maxDrawdown = 0;
  for (const t of trades) {
    equity = equity * (1 + (t.pnlPercent ?? 0) / 100);
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // 首板 + 买卖标注
  const streakRes   = calculateLimitDownStreak(rawBars);
  const firstLimitUpRes = detectFirstLimitUpAfterLimitDown(rawBars, params);
  const annotatedBars = rawBars.slice(0, 80).map(b => {
    const out: STFirstLimitUpBacktestResult["bars"][0] = { ...b };
    if (streakRes && !streakRes.isStillLimitDown) {
      if (b.date >= streakRes.streakStartDate && b.date <= streakRes.streakEndDate) {
        out.limitDownInPosition = true;
      }
    }
    if (firstLimitUpRes.hasFirstLimitUp && b.date === firstLimitUpRes.firstLimitUpDate) {
      out.signal = "buy";
      out.signalLabel = "首板";
    }
    for (const t of trades) {
      if (t.sellDate === b.date) {
        const label = t.exitReason?.includes("止损") ? "stop_loss" :
                      t.exitReason?.includes("止盈") ? "take_profit" :
                      t.exitReason?.includes("时间") ? "time_stop" : "sell";
        out.signal = label as STFirstLimitUpBacktestResult["bars"][0]["signal"];
        out.signalLabel = t.exitReason ?? "卖出";
      }
      if (t.buyDate === b.date) {
        out.inPosition = true;
      }
    }
    return out;
  });

  return {
    ok: true, tsCode, symbol, name, params,
    streakResult: streakRes,
    firstLimitUp: firstLimitUpRes,
    trades,
    totalTrades: trades.length,
    winTrades, lossTrades,
    winRate: Math.round(winRate * 100) / 100,
    avgPnlPercent: Math.round(avgPnl * 100) / 100,
    maxPnlPercent: Math.round(maxPnl * 100) / 100,
    minPnlPercent: Math.round(minPnl * 100) / 100,
    totalReturn:  Math.round(totalReturn * 100) / 100,
    maxDrawdown:  Math.round(maxDrawdown * 10000) / 100,
    bars: annotatedBars,
  };
}
