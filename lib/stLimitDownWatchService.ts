/**
 * lib/stLimitDownWatchService.ts
 *
 * A股 ST 连续跌停观察策略 — 核心服务
 *
 * 定位：扫描连续跌停 5-50 个跌停板、尚未见底、无明显退市风险的 ST 股票，
 *       加入「连续跌停观察池」。
 *
 * ⚠️ 观察池股票不产生任何买入信号，不触发自动交易。
 *    当前状态：观察中，暂不买入。
 *
 * ⚠️ 服务端专用 — 请勿在 Client Component 中直接 import。
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

// ─── 工具 ─────────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function tsCodeToSymbol(c: string): string {
  return c.split(".")[0] ?? c;
}

// ─── K线数据类型 ──────────────────────────────────────────────────────────────

export interface DayBar {
  date:   string;
  open:   number;
  close:  number;
  high:   number;
  low:    number;
  volume: number;   // 手
  amount: number;   // 千元
  pctChg: number;   // %
  preClose?: number;
}

function recordToBar(r: TushareRecord): DayBar {
  return {
    date:     String(r.trade_date ?? ""),
    open:     toNum(r.open),
    close:    toNum(r.close),
    high:     toNum(r.high),
    low:      toNum(r.low),
    volume:   toNum(r.vol),
    amount:   toNum(r.amount),
    pctChg:   toNum(r.pct_chg),
    preClose: toNum(r.pre_close) || undefined,
  };
}

// ─── 跌停判断 ─────────────────────────────────────────────────────────────────

/**
 * 获取 ST 股理论跌停幅度（-5%），可根据未来规则扩展。
 * 若有前收价可精确计算跌停价；否则用 pctChg 近似判断。
 */
export function getLimitDownPercent(/* stType?: string */): number {
  return -5.0; // ST 股跌停幅度固定 -5%
}

/**
 * 判断某根 K 线是否触及跌停
 * 优先用 preClose 精确计算，退而用 pctChg 近似。
 */
export function isLimitDownBar(bar: DayBar): boolean {
  if (bar.preClose && bar.preClose > 0) {
    const limitPrice = bar.preClose * 0.95;
    return bar.close <= limitPrice * 1.002; // 0.2% 容差
  }
  return bar.pctChg <= -4.8; // 容差
}

/** 判断是否一字跌停（open≈high≈low≈close≈跌停价） */
export function isOneWordLimitDown(bar: DayBar): boolean {
  if (!isLimitDownBar(bar)) return false;
  const range = bar.high - bar.low;
  return range / Math.max(bar.close, 0.01) < 0.005; // 0.5% 振幅以内视为一字
}

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface STLimitDownWatchParams {
  minLimitDownStreak:      number;   // 默认 5
  maxLimitDownStreak:      number;   // 默认 50
  maxDelistingRiskScore:   number;   // 默认 40
  requireNotBottomed:      boolean;  // 默认 true
  enableRestructuringScore: boolean; // 默认 true
  requireAnnouncementData: boolean;  // 默认 false
  excludeLongSuspended:    boolean;  // 默认 true
  excludeDelistingPeriod:  boolean;  // 默认 true
  excludeNegativeNetAssets: boolean; // 默认 true
  requireCompleteFinancials: boolean;// 默认 false
  autoSavePool:            boolean;  // 默认 true
}

export const DEFAULT_WATCH_PARAMS: STLimitDownWatchParams = {
  minLimitDownStreak:      5,
  maxLimitDownStreak:      50,
  maxDelistingRiskScore:   40,
  requireNotBottomed:      true,
  enableRestructuringScore: true,
  requireAnnouncementData: false,
  excludeLongSuspended:    true,
  excludeDelistingPeriod:  true,
  excludeNegativeNetAssets: true,
  requireCompleteFinancials: false,
  autoSavePool:            true,
};

export interface LimitDownStreakResult {
  streak:             number;        // 连续跌停次数
  streakStartDate:    string;        // 最早跌停日
  streakEndDate:      string;        // 最近跌停日（最新一根跌停）
  isStillLimitDown:   boolean;       // 最新一根 K 线是否仍在跌停
  openedDate:         string | null; // 跌停打开日（如有）
  limitDownDates:     string[];      // 全部跌停日期列表
  oneWordDays:        number;        // 一字跌停天数
  lowestClose:        number;        // 跌停期间最低收盘价
  latestClose:        number;        // 最新收盘价
}

export interface NotBottomedResult {
  notBottomed: boolean;
  score:       number;              // 0-100，越高越未见底
  reasons:     string[];
  watchLevel:  "low" | "medium" | "high";
  nextTriggerConditions: string[];  // 下一步等待触发的条件
}

export interface RestructuringExpectationResult {
  score:         number;   // 0-100
  degraded:      boolean;  // true = 公告数据缺失，降级判断
  basis:         string[];
  degradedReason?: string;
}

export interface STWatchCandidate {
  // 身份
  tsCode:   string;
  symbol:   string;
  name:     string;
  stType:   string;   // "ST" | "*ST" | "SST" | "S*ST"

  // 跌停信息
  limitDownStreak:    number;
  latestLimitDownDate: string;
  isStillLimitDown:   boolean;
  openedDate:         string | null;
  lowestClose:        number;
  latestClose:        number;
  latestChangePct:    number;

  // 评分
  notBottomedScore:              number;   // 0-100，越高越未见底
  delistingRiskScore:            number;   // 0-100
  delistingRiskLevel:            string;
  restructuringExpectationScore: number;   // 0-100
  financialRepairScore:          number;   // 0-100
  cashflowImprovementScore:      number;   // 0-100

  // 状态
  currentStatus:           "观察中，暂不买入";  // 固定值，不能是买入
  watchLevel:              "low" | "medium" | "high";
  reasons:                 string[];
  nextTriggerConditions:   string[];

  // 数据可用性
  announcementDataAvailable: boolean;  // 公告数据是否接入（当前固定 false）
  degraded:                  boolean;  // 数据降级标记
  degradedReasons:           string[];

  // 时间
  addedAt:        string;  // ISO
  lastScannedAt:  string;  // ISO
}

export interface STLimitDownWatchScanResult {
  ok:          boolean;
  scannedAt:   string;
  params:      STLimitDownWatchParams;
  watchPool:   STWatchCandidate[];
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
    totalSTScanned:   number;
    hadLimitDownStreak: number;
    inRange:          number;
    watchPoolCount:   number;
    highRiskCount:    number;
    insufficientDataCount: number;
    avgLimitDownStreak: number;
    maxLimitDownStreak: number;
  };
  scanDurationMs: number;
  error?: string;
}

// ─── 核心函数 1：连续跌停计算 ──────────────────────────────────────────────────

/**
 * 计算最近一段连续跌停序列
 * bars 最新在前（Tushare 默认返回顺序）
 */
export function calculateLimitDownStreak(bars: DayBar[]): LimitDownStreakResult | null {
  if (bars.length === 0) return null;

  // 最新 bar
  const latestBar = bars[0]!;
  const isStillLimitDown = isLimitDownBar(latestBar);

  // 从最新开始，跳过非跌停日（已打开的天数）
  let i = 0;
  const openedDays: DayBar[] = [];
  while (i < bars.length && !isLimitDownBar(bars[i]!)) {
    openedDays.push(bars[i]!);
    i++;
  }

  // 找连续跌停区间
  if (i >= bars.length) return null;

  const streakBars: DayBar[] = [];
  while (i < bars.length && isLimitDownBar(bars[i]!)) {
    streakBars.push(bars[i]!);
    i++;
  }

  if (streakBars.length === 0) return null;

  const limitDownDates = streakBars.map(b => b.date);
  const lowestClose = Math.min(...streakBars.map(b => b.close));
  const oneWordDays = streakBars.filter(isOneWordLimitDown).length;

  // openedDate = 最久的那个非跌停日（紧接在跌停序列之后的第一天）
  const openedDate = openedDays.length > 0
    ? openedDays[openedDays.length - 1]!.date
    : null;

  return {
    streak:          streakBars.length,
    streakStartDate: streakBars[streakBars.length - 1]!.date,
    streakEndDate:   streakBars[0]!.date,
    isStillLimitDown,
    openedDate,
    limitDownDates,
    oneWordDays,
    lowestClose,
    latestClose: latestBar.close,
  };
}

// ─── 核心函数 2：尚未见底判断 ──────────────────────────────────────────────────

/**
 * 判断股票是否尚未见底（notBottomed = true 时可进入观察池，但不能买入）
 */
export function detectNotBottomedYet(
  bars: DayBar[],             // 最新在前
  streakResult: LimitDownStreakResult,
  basicRecords: TushareRecord[],
): NotBottomedResult {
  const reasons: string[] = [];
  let score = 0;
  const conditions: boolean[] = [];

  const latestBar  = bars[0];
  const recent3    = bars.slice(0, 3);
  const recent5    = bars.slice(0, 5);
  const recent10   = bars.slice(0, 10);
  const latestBasic = basicRecords[0];

  // 条件 1：最新仍在跌停
  const c1 = streakResult.isStillLimitDown;
  conditions.push(c1);
  if (c1) { score += 25; reasons.push("当前仍在跌停"); }

  // 条件 2：近 3 日内有跌停
  const c2 = recent3.some(b => isLimitDownBar(b));
  conditions.push(c2);
  if (c2) { score += 15; reasons.push("近3日内存在跌停"); }

  // 条件 3：最近 1-3 日继续创新低
  const lowestInStreak = streakResult.lowestClose;
  const recent3Lows    = recent3.map(b => b.low);
  const c3 = recent3Lows.some(l => l <= lowestInStreak * 1.001);
  conditions.push(c3);
  if (c3) { score += 15; reasons.push("近3日持续创新低"); }

  // 条件 4：成交额持续萎缩（近5日 vs 近10日）
  const amt5  = recent5.length  > 0 ? recent5.reduce((s,b)=>s+b.amount,0)/recent5.length   : 0;
  const amt10 = recent10.length > 0 ? recent10.reduce((s,b)=>s+b.amount,0)/recent10.length : 0;
  const c4 = amt10 > 0 && amt5 < amt10 * 0.8;
  conditions.push(c4);
  if (c4) { score += 10; reasons.push(`成交额萎缩（近5日均${(amt5/1000).toFixed(0)}万 < 近10日均${(amt10/1000).toFixed(0)}万）`); }

  // 条件 5：换手率低迷（< 0.5%）
  const turnover = toNum(latestBasic?.turnover_rate);
  const c5 = turnover > 0 && turnover < 0.5;
  conditions.push(c5);
  if (c5) { score += 8; reasons.push(`换手率低迷（${turnover.toFixed(2)}%）`); }

  // 条件 6：未站上 MA5
  if (latestBar && bars.length >= 5) {
    const ma5 = bars.slice(0, 5).reduce((s,b)=>s+b.close,0) / 5;
    const c6  = latestBar.close < ma5 * 0.995;
    conditions.push(c6);
    if (c6) { score += 10; reasons.push(`收盘 ${latestBar.close.toFixed(2)} 未站上 MA5(${ma5.toFixed(2)})`); }
  } else {
    conditions.push(false);
  }

  // 条件 7：未出现连续上涨（近3日）
  const hasConsecUp = recent3.length >= 2 &&
    recent3[0]!.pctChg > 0 && recent3[1]!.pctChg > 0;
  const c7 = !hasConsecUp;
  conditions.push(c7);
  if (c7) { score += 8; reasons.push("尚未出现连续上涨"); }

  // 条件 8：从最低点反弹不足 5%
  const rebound = lowestInStreak > 0 && latestBar
    ? (latestBar.close - lowestInStreak) / lowestInStreak
    : 0;
  const c8 = rebound < 0.05;
  conditions.push(c8);
  if (c8) { score += 9; reasons.push(`从低点反弹仅 ${(rebound*100).toFixed(1)}%（未达5%）`); }

  score = Math.min(100, score);

  // 判定：满足 ≥4 项视为尚未见底
  const metCount   = conditions.filter(Boolean).length;
  const notBottomed = metCount >= 4 || c1; // 仍在跌停直接视为未见底

  // 观察级别
  let watchLevel: "low" | "medium" | "high" = "low";
  if (score >= 60) watchLevel = "high";
  else if (score >= 35) watchLevel = "medium";

  // 下一步触发条件
  const nextTriggerConditions: string[] = [];
  if (c1 || c2) nextTriggerConditions.push("等待跌停打开（出现非跌停交易日）");
  if (c3)       nextTriggerConditions.push("等待近3日不再创新低");
  if (conditions[5]) nextTriggerConditions.push("等待收盘站上 MA5");
  if (c7)       nextTriggerConditions.push("等待连续≥2日上涨");
  if (c8)       nextTriggerConditions.push(`等待从低点反弹超过5%（当前 ${(rebound*100).toFixed(1)}%）`);
  if (c4)       nextTriggerConditions.push("等待成交额恢复至正常水平");
  nextTriggerConditions.push("等待收盘站上 MA3 / MA5");
  nextTriggerConditions.push("等待换手率恢复（> 1%）");
  nextTriggerConditions.push("等待主力资金转为净流入（如有数据）");

  if (!notBottomed && reasons.length === 0) {
    reasons.push("股价已出现企稳迹象（满足见底条件较多）");
  }

  return { notBottomed, score, reasons, watchLevel, nextTriggerConditions };
}

// ─── 核心函数 3：重组/修复预期评分 ────────────────────────────────────────────

/**
 * 基于财务改善迹象计算重组/修复预期评分。
 * 公告数据未接入时，degraded=true，仅基于财报改善迹象降级判断。
 */
export function calculateRestructuringExpectationScore(
  fundamentalResult: STFundamentalRiskResult | null,
): RestructuringExpectationResult {
  // 公告数据暂未接入
  const announcementAvailable = false;
  const basis: string[] = [];
  let score = 20; // 基础分

  if (!fundamentalResult || !fundamentalResult.ok) {
    return {
      score: 20,
      degraded: true,
      basis: ["财务数据不可用，重组预期评分降级为基础分"],
      degradedReason: "公告数据暂缺，财务数据亦不可用，重组预期仅基于基础分判断。",
    };
  }

  const flags = fundamentalResult.flags;

  // 财务改善加分
  if (flags.netProfitPositive) {
    score += 15;
    basis.push("✓ 最新报告期净利润为正");
  }
  if (flags.deductedNetProfitPositive) {
    score += 12;
    basis.push("✓ 扣非净利润为正");
  }
  if (flags.operatingCashflowImproving) {
    score += 12;
    basis.push("✓ 经营现金流改善");
  }
  if (flags.netAssetsPositive) {
    score += 8;
    basis.push("✓ 净资产为正");
  }
  if (!flags.highDebtToAssets) {
    score += 5;
    basis.push("✓ 资产负债率未极高");
  }
  if (!flags.consecutiveLosses) {
    score += 8;
    basis.push("✓ 未连续亏损");
  }
  if (!flags.possibleDelistingFinancialTrigger) {
    score += 10;
    basis.push("✓ 未触发财务退市条件");
  }

  // 财务修复能力加分
  const repairScore = fundamentalResult.financialRepairScore.score;
  if (repairScore >= 60) {
    score += 10;
    basis.push(`✓ 财务修复能力较强（${repairScore}分）`);
  } else if (repairScore >= 40) {
    score += 5;
    basis.push(`  财务修复能力一般（${repairScore}分）`);
  }

  // 没有公告数据，上限设为 75
  score = Math.min(announcementAvailable ? 100 : 75, Math.max(0, score));

  if (basis.length === 0) {
    basis.push("财务改善迹象不足，重组预期偏低");
  }

  return {
    score,
    degraded: !announcementAvailable,
    basis,
    degradedReason: announcementAvailable
      ? undefined
      : "公告数据暂缺，重组预期仅基于财报修复迹象降级判断。",
  };
}

// ─── 核心函数 4：单股分析 ──────────────────────────────────────────────────────

export interface STLimitDownWatchSingleResult {
  ok:             boolean;
  tsCode:         string;
  symbol:         string;
  name:           string;
  isST:           boolean;
  stType:         string;
  streakResult:   LimitDownStreakResult | null;
  inStreakRange:  boolean;
  notBottomed:    NotBottomedResult | null;
  delistingRisk:  DelistingRiskResult | null;
  fundamentals:   STFundamentalRiskResult | null;
  restructuring:  RestructuringExpectationResult;
  classification: "watch_pool" | "high_risk" | "insufficient_data" | "not_matching";
  classificationReason: string;
  candidate:      STWatchCandidate | null;
  bars:           DayBar[];   // 最近 K 线（最新在前，最多 60 根）
  error?:         string;
}

export async function analyzeSTLimitDownWatchStock(
  tsCode: string,
  name:   string,
  params: STLimitDownWatchParams = DEFAULT_WATCH_PARAMS,
): Promise<STLimitDownWatchSingleResult> {
  const symbol = tsCodeToSymbol(tsCode);
  const isST   = /ST|st/.test(name);
  const stType = name.includes("*ST") || name.includes("S*ST") ? "*ST"
               : name.includes("SST") ? "SST"
               : "ST";

  const notFound: STLimitDownWatchSingleResult = {
    ok: false, tsCode, symbol, name, isST, stType,
    streakResult: null, inStreakRange: false,
    notBottomed: null, delistingRisk: null, fundamentals: null,
    restructuring: { score: 0, degraded: true, basis: [] },
    classification: "insufficient_data",
    classificationReason: "数据获取失败",
    candidate: null, bars: [],
  };

  // 拉取 K 线
  const klineRes = await getDailyKLine(tsCode, daysAgoStr(150), todayStr());
  if (!klineRes.ok || klineRes.records.length < 5) {
    return { ...notFound, error: klineRes.ok ? "K线数据不足" : klineRes.error };
  }
  const bars = klineRes.records.map(recordToBar);

  // 拉取 daily_basic
  const basicRes = await getDailyBasic(tsCode, daysAgoStr(30), todayStr());
  const basicRecs = basicRes.ok ? basicRes.records : [];

  // 计算连续跌停
  const streakResult = calculateLimitDownStreak(bars);
  if (!streakResult) {
    return { ...notFound, bars: bars.slice(0, 60), classification: "not_matching", classificationReason: "未检测到连续跌停", streakResult: null, inStreakRange: false };
  }

  const inRange = streakResult.streak >= params.minLimitDownStreak &&
                  streakResult.streak <= params.maxLimitDownStreak;

  if (!inRange) {
    return {
      ...notFound, bars: bars.slice(0, 60), streakResult, inStreakRange: false,
      classification: "not_matching",
      classificationReason: streakResult.streak < params.minLimitDownStreak
        ? `连续跌停 ${streakResult.streak} 次，不足 ${params.minLimitDownStreak} 次`
        : `连续跌停 ${streakResult.streak} 次，超过 ${params.maxLimitDownStreak} 次上限`,
    };
  }

  // 退市风险
  const delistingRisk = await calculateDelistingRiskScore(tsCode, false, params.maxDelistingRiskScore);
  if (delistingRisk.excluded) {
    return {
      ...notFound, bars: bars.slice(0, 60), streakResult, inStreakRange: true,
      delistingRisk,
      classification: "high_risk",
      classificationReason: `退市风险过高（评分 ${delistingRisk.delistingRiskScore}，阈值 ${params.maxDelistingRiskScore}）`,
    };
  }

  // 基本面风险
  const fundamentals = await getSTFundamentalRisk(tsCode).catch(() => null);

  // 净资产为负排除
  if (params.excludeNegativeNetAssets && fundamentals?.ok && !fundamentals.flags.netAssetsPositive) {
    return {
      ...notFound, bars: bars.slice(0, 60), streakResult, inStreakRange: true,
      delistingRisk, fundamentals,
      classification: "high_risk",
      classificationReason: "净资产为负，存在触发退市财务条件风险",
    };
  }

  // 尚未见底
  const notBottomed = detectNotBottomedYet(bars, streakResult, basicRecs);
  if (params.requireNotBottomed && !notBottomed.notBottomed) {
    return {
      ...notFound, bars: bars.slice(0, 60), streakResult, inStreakRange: true,
      delistingRisk, fundamentals,
      notBottomed,
      classification: "not_matching",
      classificationReason: "股价已出现见底迹象，不符合观察池条件",
    };
  }

  // 重组预期
  const restructuring = calculateRestructuringExpectationScore(fundamentals);

  // 构建候选
  const candidate: STWatchCandidate = {
    tsCode, symbol, name, stType,
    limitDownStreak:    streakResult.streak,
    latestLimitDownDate: streakResult.streakEndDate,
    isStillLimitDown:   streakResult.isStillLimitDown,
    openedDate:         streakResult.openedDate,
    lowestClose:        streakResult.lowestClose,
    latestClose:        streakResult.latestClose,
    latestChangePct:    bars[0]?.pctChg ?? 0,
    notBottomedScore:              notBottomed.score,
    delistingRiskScore:            delistingRisk.delistingRiskScore,
    delistingRiskLevel:            delistingRisk.riskLevel,
    restructuringExpectationScore: restructuring.score,
    financialRepairScore:          fundamentals?.financialRepairScore.score ?? 0,
    cashflowImprovementScore:      fundamentals?.cashflowImprovementScore.score ?? 0,
    currentStatus:     "观察中，暂不买入",
    watchLevel:        notBottomed.watchLevel,
    reasons:           notBottomed.reasons,
    nextTriggerConditions: notBottomed.nextTriggerConditions,
    announcementDataAvailable: false,
    degraded:          restructuring.degraded,
    degradedReasons:   restructuring.degradedReason ? [restructuring.degradedReason] : [],
    addedAt:           new Date().toISOString(),
    lastScannedAt:     new Date().toISOString(),
  };

  return {
    ok: true, tsCode, symbol, name, isST, stType,
    streakResult, inStreakRange: true,
    notBottomed, delistingRisk, fundamentals, restructuring,
    classification: "watch_pool",
    classificationReason: `连续跌停 ${streakResult.streak} 次，退市风险低，尚未见底，进入观察池`,
    candidate,
    bars: bars.slice(0, 60),
  };
}

// ─── 核心函数 5：批量扫描 ──────────────────────────────────────────────────────

export async function scanSTLimitDownWatchCandidates(
  params: STLimitDownWatchParams = DEFAULT_WATCH_PARAMS,
  concurrency = 4,
): Promise<STLimitDownWatchScanResult> {
  const t0 = Date.now();

  // 获取全市场 ST 股
  const basicRes = await getAStockBasic("L");
  if (!basicRes.ok) {
    return {
      ok: false, scannedAt: new Date().toISOString(), params,
      watchPool: [], highRiskExcluded: [], insufficientData: [], notMatchingConditions: [],
      stats: { totalSTScanned:0, hadLimitDownStreak:0, inRange:0, watchPoolCount:0, highRiskCount:0, insufficientDataCount:0, avgLimitDownStreak:0, maxLimitDownStreak:0 },
      scanDurationMs: Date.now() - t0,
      error: `获取股票池失败：${basicRes.error}`,
    };
  }

  const stStocks = basicRes.records.filter(r => {
    const name = String(r.name ?? "");
    return /ST|SST/i.test(name);
  }).map(r => ({
    tsCode:   String(r.ts_code ?? ""),
    symbol:   String(r.symbol  ?? ""),
    name:     String(r.name    ?? ""),
  })).filter(s => s.tsCode !== "");

  const watchPool:            STWatchCandidate[] = [];
  const highRiskExcluded:     STLimitDownWatchScanResult["highRiskExcluded"]     = [];
  const insufficientData:     STLimitDownWatchScanResult["insufficientData"]     = [];
  const notMatchingConditions:STLimitDownWatchScanResult["notMatchingConditions"]= [];
  let hadLimitDownStreak = 0;
  let inRange            = 0;

  // 分批并发
  for (let i = 0; i < stStocks.length; i += concurrency) {
    const batch = stStocks.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(s => analyzeSTLimitDownWatchStock(s.tsCode, s.name, params))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j]!;
      const s = batch[j]!;

      if (r.status === "rejected") {
        insufficientData.push({ tsCode: s.tsCode, name: s.name, symbol: s.symbol, reason: String(r.reason) });
        continue;
      }

      const res = r.value;
      if (res.streakResult) hadLimitDownStreak++;
      if (res.inStreakRange) inRange++;

      switch (res.classification) {
        case "watch_pool":
          if (res.candidate) watchPool.push(res.candidate);
          break;
        case "high_risk":
          highRiskExcluded.push({
            tsCode: s.tsCode, name: s.name, symbol: s.symbol,
            reason: res.classificationReason,
            limitDownStreak: res.streakResult?.streak ?? 0,
            delistingRiskScore: res.delistingRisk?.delistingRiskScore ?? 0,
          });
          break;
        case "insufficient_data":
          insufficientData.push({ tsCode: s.tsCode, name: s.name, symbol: s.symbol, reason: res.classificationReason });
          break;
        case "not_matching":
          notMatchingConditions.push({ tsCode: s.tsCode, name: s.name, symbol: s.symbol, reason: res.classificationReason });
          break;
      }
    }
  }

  // 按未见底评分排序
  watchPool.sort((a, b) => b.notBottomedScore - a.notBottomedScore);

  const streaks = watchPool.map(c => c.limitDownStreak);
  const avgStreak = streaks.length > 0 ? streaks.reduce((s,v)=>s+v,0)/streaks.length : 0;
  const maxStreak = streaks.length > 0 ? Math.max(...streaks) : 0;

  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    params,
    watchPool,
    highRiskExcluded,
    insufficientData,
    notMatchingConditions,
    stats: {
      totalSTScanned:    stStocks.length,
      hadLimitDownStreak,
      inRange,
      watchPoolCount:    watchPool.length,
      highRiskCount:     highRiskExcluded.length,
      insufficientDataCount: insufficientData.length,
      avgLimitDownStreak: Math.round(avgStreak * 10) / 10,
      maxLimitDownStreak: maxStreak,
    },
    scanDurationMs: Date.now() - t0,
  };
}
