/**
 * lib/valuationService.ts
 *
 * A股估值、市值和交易活跃度服务
 * 数据来源：Tushare daily_basic + fina_indicator（PEG）
 *
 * 服务端专用，不可在 Client Component 中直接 import。
 * 前端通过以下 API Route 访问：
 *   GET /api/stocks/[symbol]/valuation
 *   GET /api/stocks/[symbol]/valuation/percentile
 *   GET /api/stocks/[symbol]/valuation/history
 *
 * 安全约束：TUSHARE_TOKEN 仅在 tushareService.ts 内使用，本文件不访问 token。
 *
 * 缓存策略：
 *   最新估值数据 —— 1h（盘中实时性）
 *   历史估值（3年）—— 24h（不频繁变化）
 *   分位缓存 ——— 24h（依赖历史数据）
 *
 * 单位约定：
 *   total_mv / circ_mv：Tushare 返回万元（×10000 → 元），内部存元，页面格式化为亿
 *   pe/pb/ps：纯数值
 *   turnover_rate / dv_ratio：百分数（如 1.25 = 1.25%）
 *   pePercentile / pbPercentile：小数（0.2 = 20%）
 */

import {
  callTushare, getDailyBasic, hasTushareToken,
  daysAgoStr, todayStr, type TushareRecord,
} from "./tushareService";

// ── 缓存 ─────────────────────────────────────────────────────────────
const VALUATION_LATEST_TTL  = 60 * 60 * 1000;       // 1h（最新估值）
const VALUATION_HISTORY_TTL = 24 * 60 * 60 * 1000;  // 24h（历史分位）

interface ValuationCacheEntry {
  result:    ValuationSummaryResult;
  expiresAt: number;
}
interface HistoryCacheEntry {
  records:   TushareRecord[];
  expiresAt: number;
}

const _latestCache  = new Map<string, ValuationCacheEntry>();
const _historyCache = new Map<string, HistoryCacheEntry>();

export function clearValuationCache(tsCode?: string): void {
  if (tsCode) {
    for (const key of _latestCache.keys())  if (key.startsWith(tsCode)) _latestCache.delete(key);
    for (const key of _historyCache.keys()) if (key.startsWith(tsCode)) _historyCache.delete(key);
  } else {
    _latestCache.clear();
    _historyCache.clear();
  }
}

// ── 类型 ─────────────────────────────────────────────────────────────

export type ValuationDataStatus = "ok" | "permission_denied" | "error" | "empty" | "no_token";
export type ValuationLevel = "low" | "reasonable" | "high" | "unknown";

export interface ValuationSummaryItem {
  tsCode:    string;
  symbol:    string;
  tradeDate: string;  // YYYYMMDD

  // ── 估值倍数 ──────────────────────────────────────────────────────
  pe:    number | null;   // 市盈率 PE（静态）
  peTtm: number | null;   // 滚动市盈率 PE TTM
  pb:    number | null;   // 市净率 PB
  ps:    number | null;   // 市销率 PS
  psTtm: number | null;   // 滚动市销率 PS TTM
  peg:   number | null;   // PEG（计算值）
  pegNote: string | null; // PEG 计算说明

  // ── 市值（单位：元）─────────────────────────────────────────────
  totalMarketValue:       number | null;  // 总市值（元）
  circulatingMarketValue: number | null;  // 流通市值（元）

  // ── 历史分位（0~1 小数）──────────────────────────────────────────
  pePercentile:  number | null;  // PE 历史分位
  pbPercentile:  number | null;  // PB 历史分位
  percentileNote: string | null; // "历史数据不足" 等说明

  // ── 股息率（%）───────────────────────────────────────────────────
  dividendYield:    number | null;  // dv_ratio（%）
  dividendYieldTtm: number | null;  // dv_ttm（%）

  // ── 交易活跃度 ───────────────────────────────────────────────────
  turnoverRate:          number | null;  // 换手率（%）
  freeFloatTurnoverRate: number | null;  // 自由流通换手率（%）
  volumeRatio:           number | null;  // 量比（Tushare 历史）
  volumeRatioSource:     "Tushare" | "EastMoney" | null;

  // ── 综合判断 ─────────────────────────────────────────────────────
  valuationLevel: ValuationLevel;
  source:         "Tushare";
  updatedAt:      string;
}

export interface ValuationSummaryResult {
  ok:                  boolean;
  tsCode:              string;
  symbol:              string;
  item:                ValuationSummaryItem | null;
  dailyBasicStatus:    ValuationDataStatus;
  finaIndicatorStatus: ValuationDataStatus;
  fromCache?:          boolean;
  error?:              string;
  updatedAt:           string;
}

// ── 工具函数 ─────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function tsCodeToSymbol(tsCode: string): string {
  return tsCode.split(".")[0] ?? tsCode;
}

/**
 * 计算百分位：currentValue 在 history 数组中的位置（0~1）
 * 即历史中有多少比例的值低于 currentValue
 */
export function calculatePercentile(history: number[], currentValue: number): number | null {
  if (history.length < 120) return null; // 历史数据不足
  const below = history.filter(v => v < currentValue).length;
  return below / history.length;
}

export function calculatePEPercentile(history: TushareRecord[], currentPE: number): number | null {
  const pes = history
    .map(r => toNum(r.pe_ttm) ?? toNum(r.pe))
    .filter((v): v is number => v !== null && v > 0 && v < 500);
  return calculatePercentile(pes, currentPE);
}

export function calculatePBPercentile(history: TushareRecord[], currentPB: number): number | null {
  const pbs = history
    .map(r => toNum(r.pb))
    .filter((v): v is number => v !== null && v > 0 && v < 100);
  return calculatePercentile(pbs, currentPB);
}

/**
 * 计算 PEG = PE / 净利润增长率
 * @param pe           市盈率（pe_ttm 优先）
 * @param netProfitYoY 净利润增长率（%，来自 fina_indicator.netprofit_yoy，如 25 = 25%）
 * @returns { value, note }
 */
export function calculatePEG(
  pe: number | null,
  netProfitYoY: number | null,
): { value: number | null; note: string } {
  if (pe == null)           return { value: null, note: "PE 数据暂缺" };
  if (netProfitYoY == null) return { value: null, note: "净利润增长率数据暂缺" };
  if (netProfitYoY <= 0)    return { value: null, note: "净利润增长率 ≤0，PEG 不可计算" };
  const peg = pe / netProfitYoY;
  if (!isFinite(peg) || isNaN(peg)) return { value: null, note: "PEG 计算异常" };
  return { value: +peg.toFixed(3), note: "PEG 根据 PE TTM 和净利润增长率估算" };
}

/**
 * 综合判断估值水平
 */
function calcValuationLevel(
  pePercentile: number | null,
  pbPercentile: number | null,
): ValuationLevel {
  const scores: number[] = [];
  if (pePercentile != null) scores.push(pePercentile);
  if (pbPercentile != null) scores.push(pbPercentile);
  if (scores.length === 0) return "unknown";
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg < 0.25) return "low";
  if (avg < 0.70) return "reasonable";
  return "high";
}

// ── 历史数据获取 ──────────────────────────────────────────────────────

/**
 * 获取近 N 年 daily_basic 历史（用于分位计算）
 * 缓存 24h
 */
export async function getValuationHistory(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<{ records: TushareRecord[]; status: ValuationDataStatus; error?: string }> {
  const cacheKey = `hist::${tsCode}::${startDate}::${endDate}`;
  const hit = _historyCache.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) {
    return { records: hit.records, status: hit.records.length > 0 ? "ok" : "empty" };
  }

  const res = await getDailyBasic(tsCode, startDate, endDate);
  if (!res.ok) {
    return {
      records: [],
      status:  res.permissionDenied ? "permission_denied" : "error",
      error:   res.error,
    };
  }
  _historyCache.set(cacheKey, { records: res.records, expiresAt: Date.now() + VALUATION_HISTORY_TTL });
  return { records: res.records, status: res.records.length > 0 ? "ok" : "empty" };
}

// ── 核心聚合 ─────────────────────────────────────────────────────────

/**
 * 获取估值摘要（最新一期 + 历史分位 + PEG）
 *
 * @param tsCode  Tushare 股票代码
 * @param refresh 为 true 时跳过缓存
 */
export async function getValuationSummary(
  tsCode:  string,
  refresh  = false,
): Promise<ValuationSummaryResult> {
  const now = new Date().toISOString();

  if (!hasTushareToken()) {
    return {
      ok: false, tsCode, symbol: tsCodeToSymbol(tsCode), item: null,
      dailyBasicStatus: "no_token", finaIndicatorStatus: "no_token",
      error: "TUSHARE_TOKEN 未配置，无法获取估值数据",
      updatedAt: now,
    };
  }

  const cacheKey = tsCode;
  if (!refresh) {
    const hit = _latestCache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) {
      return { ...hit.result, fromCache: true };
    }
  }

  const symbol = tsCodeToSymbol(tsCode);

  // 最近 10 天：取最新一条 daily_basic
  const recentStart = daysAgoStr(10);
  const today       = todayStr();
  // 3 年历史：用于分位计算
  const histStart   = daysAgoStr(3 * 365 + 30);

  // 并行：最新估值 + 3年历史 + fina_indicator（PEG）
  const [latestRes, histRes, finaRes] = await Promise.all([
    getDailyBasic(tsCode, recentStart, today),
    getDailyBasic(tsCode, histStart,   today),
    callTushare(
      "fina_indicator",
      { ts_code: tsCode, start_date: daysAgoStr(2 * 365), end_date: today },
      "ann_date,end_date,netprofit_yoy",
      VALUATION_HISTORY_TTL,
    ),
  ]);

  // daily_basic 权限不足
  if (!latestRes.ok && latestRes.permissionDenied) {
    const result: ValuationSummaryResult = {
      ok: false, tsCode, symbol, item: null,
      dailyBasicStatus: "permission_denied",
      finaIndicatorStatus: "unknown" as ValuationDataStatus,
      error: "当前 Tushare 权限不足，无法获取估值数据",
      updatedAt: now,
    };
    return result;
  }

  if (!latestRes.ok || latestRes.records.length === 0) {
    const result: ValuationSummaryResult = {
      ok: false, tsCode, symbol, item: null,
      dailyBasicStatus: !latestRes.ok ? "error" : "empty",
      finaIndicatorStatus: "unknown" as ValuationDataStatus,
      error: "该股票估值数据暂缺",
      updatedAt: now,
    };
    return result;
  }

  // 最新 daily_basic（按日期降序取第一条）
  const sorted = [...latestRes.records].sort((a, b) =>
    String(b.trade_date ?? "").localeCompare(String(a.trade_date ?? ""))
  );
  const latest = sorted[0];

  // ── 估值字段 ────────────────────────────────────────────────────────
  const pe    = toNum(latest.pe);
  const peTtm = toNum(latest.pe_ttm);
  const pb    = toNum(latest.pb);
  const ps    = toNum(latest.ps);
  const psTtm = toNum(latest.ps_ttm);

  // ── 市值：Tushare total_mv / circ_mv 单位为万元 → ×10000 = 元 ────
  const totalMvRaw = toNum(latest.total_mv);
  const circMvRaw  = toNum(latest.circ_mv);
  const totalMarketValue       = totalMvRaw != null ? totalMvRaw * 10000 : null;
  const circulatingMarketValue = circMvRaw  != null ? circMvRaw  * 10000 : null;

  // ── 股息率、换手率、量比 ─────────────────────────────────────────────
  const dividendYield    = toNum(latest.dv_ratio);
  const dividendYieldTtm = toNum(latest.dv_ttm);
  const turnoverRate          = toNum(latest.turnover_rate);
  const freeFloatTurnoverRate = toNum(latest.turnover_rate_f);
  const volumeRatio           = toNum(latest.volume_ratio);

  // ── PEG 计算 ─────────────────────────────────────────────────────────
  let netProfitYoY: number | null = null;
  let finaIndicatorStatus: ValuationDataStatus = "empty";
  if (finaRes.ok && finaRes.records.length > 0) {
    // 取最新一期（按 end_date 降序）
    const finaLatest = [...finaRes.records]
      .sort((a, b) => String(b.end_date ?? "").localeCompare(String(a.end_date ?? "")))
      [0];
    netProfitYoY = toNum(finaLatest?.netprofit_yoy);
    finaIndicatorStatus = "ok";
  } else if (!finaRes.ok) {
    finaIndicatorStatus = finaRes.permissionDenied ? "permission_denied" : "error";
  }

  const peForPeg = peTtm ?? pe;
  const pegResult = calculatePEG(peForPeg, netProfitYoY);

  // ── 分位计算 ─────────────────────────────────────────────────────────
  const histRecords = histRes.ok ? histRes.records : [];
  let pePercentile: number | null  = null;
  let pbPercentile: number | null  = null;
  let percentileNote: string | null = null;

  const peForPerc = peTtm ?? pe;
  const pbForPerc = pb;

  if (histRecords.length < 120) {
    percentileNote = `历史数据不足（${histRecords.length} 条，需 ≥120）`;
  } else {
    if (peForPerc != null && peForPerc > 0) {
      pePercentile = calculatePEPercentile(histRecords, peForPerc);
    }
    if (pbForPerc != null && pbForPerc > 0) {
      pbPercentile = calculatePBPercentile(histRecords, pbForPerc);
    }
  }

  // ── 综合估值水平 ─────────────────────────────────────────────────────
  const valuationLevel = calcValuationLevel(pePercentile, pbPercentile);

  const item: ValuationSummaryItem = {
    tsCode, symbol,
    tradeDate: String(latest.trade_date ?? ""),
    pe, peTtm, pb, ps, psTtm,
    peg: pegResult.value,
    pegNote: pegResult.note,
    totalMarketValue, circulatingMarketValue,
    pePercentile, pbPercentile, percentileNote,
    dividendYield, dividendYieldTtm,
    turnoverRate, freeFloatTurnoverRate,
    volumeRatio, volumeRatioSource: volumeRatio != null ? "Tushare" : null,
    valuationLevel,
    source: "Tushare",
    updatedAt: now,
  };

  const result: ValuationSummaryResult = {
    ok: true, tsCode, symbol, item,
    dailyBasicStatus: "ok",
    finaIndicatorStatus,
    updatedAt: now,
  };

  _latestCache.set(cacheKey, { result, expiresAt: Date.now() + VALUATION_LATEST_TTL });
  return result;
}
