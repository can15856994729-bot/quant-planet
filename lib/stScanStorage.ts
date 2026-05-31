/**
 * lib/stScanStorage.ts
 *
 * ST 单股自动扫描结果持久化存储
 *
 * 两个存储层：
 * 1. 候选观察池 (quantplanet_st_auto_scan_results_v1)
 *    — 按 tsCode 去重，每只股票保留最新一次达标结果
 * 2. 扫描历史 (quantplanet_st_scan_history_v1)
 *    — 完整扫描批次记录，最多保留 MAX_HISTORY 次
 *
 * 在 Capacitor WebView 中，localStorage 随 APK 持久保存，无需额外插件。
 * TUSHARE_TOKEN 永远不进入本文件。
 */

export const POOL_KEY    = "quantplanet_st_auto_scan_results_v1";
export const HISTORY_KEY = "quantplanet_st_scan_history_v1";
export const MAX_HISTORY = 10;

// ── 类型定义 ──────────────────────────────────────────────────────────

export interface STScanParams {
  dateRange:       string;   // "近1年"|"近2年"|"近3年"
  startDate:       string;   // YYYYMMDD
  endDate:         string;   // YYYYMMDD
  scoreMode:       string;
  minAmount20d:    number;
  initialCapital:  number;
  positionRatio:   number;
  stopLossRate:    number;
  halfProfitRate:  number;
  fullProfitRate:  number;
  maxHoldDays:     number;
  enableT1:        boolean;
  enableLimitFilter: boolean;
  enableFees:      boolean;
  // 筛选阈值（扫描完成时的 UI 设置，仅供参考）
  filterMinAnn:    number;   // %
  filterMaxDD:     number;   // %
  filterMinWin:    number;   // %
}

export interface STCandidateEntry {
  // 身份
  symbol:   string;
  tsCode:   string;
  name:     string;
  industry: string;
  stType:   string;

  // 核心回测指标（均为数值，% 单位）
  totalReturn:   number;
  annualReturn:  number;
  maxDrawdown:   number;
  winRate:       number;
  sharpeRatio:   number;
  profitFactor:  number;
  tradeCount:    number;
  stopLossCount: number;
  takeProfitCount: number;
  limitDownCannotSellCount: number;
  suspendedDays: number;
  maxConsecutiveLosses: number;
  avgHoldDays:   number;
  initialCapital: number;
  finalCapital:   number;
  compositeScore: number;
  riskLevel: "low" | "medium" | "high" | "extreme";
  riskEventCount: number;

  // 状态
  passed:        boolean;
  failedReasons: string[];

  // 元数据
  scannedAt:  string;           // ISO 8601
  scanId:     string;           // 所属扫描批次 ID
  scanParams: STScanParams;
  sourceBacktestMethod: "backtestSingleSTStock";

  // 完整回测数据（用于详情页，优先复用，避免重新回测）
  cachedResult?: {
    equity:       { date: string; value: number }[];
    drawdown:     { date: string; dd: number }[];
    trades:       unknown[];
    riskEvents:   unknown[];
    klineSignals: unknown[];
    diagnostics:  unknown;
    dataQuality:  number;
    scoreMode:    string;
  };
}

export interface STScanSummary {
  totalSTCount:  number;
  scannedCount:  number;
  passedCount:   number;
  failedCount:   number;
  topAnnualReturn: number;
  topStockName:    string;
}

export interface STScanRecord {
  scanId:      string;
  scannedAt:   string;
  params:      STScanParams;
  summary:     STScanSummary;
  results:     STCandidateEntry[];
  failedStocks: { name: string; tsCode: string; symbol: string; reason: string }[];
}

interface PoolData {
  version:    1;
  updatedAt:  string;
  candidates: STCandidateEntry[];
}

// ── 工具函数 ──────────────────────────────────────────────────────────

function isClient(): boolean {
  return typeof window !== "undefined";
}

function tryParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** 下采样数组到 max 点，保留首尾 */
function downsample<T>(arr: T[], max = 120): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

// ── 候选观察池 ────────────────────────────────────────────────────────

export function loadPool(): STCandidateEntry[] {
  if (!isClient()) return [];
  const data = tryParse<PoolData | null>(localStorage.getItem(POOL_KEY), null);
  return data?.candidates ?? [];
}

function savePoolRaw(candidates: STCandidateEntry[]): void {
  if (!isClient()) return;
  const data: PoolData = { version: 1, updatedAt: new Date().toISOString(), candidates };
  try {
    localStorage.setItem(POOL_KEY, JSON.stringify(data));
  } catch {
    // localStorage 满时，尝试不含 cachedResult 的版本
    try {
      const slim = candidates.map(c => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { cachedResult: _, ...rest } = c;
        return rest;
      });
      localStorage.setItem(POOL_KEY, JSON.stringify({ ...data, candidates: slim }));
    } catch {
      console.warn("[stScanStorage] 候选池保存失败（存储空间不足）");
    }
  }
}

/**
 * 将一批扫描结果合并到候选观察池。
 * 相同 tsCode：以最新 scannedAt 的结果覆盖。
 */
export function mergeIntoPool(entries: STCandidateEntry[]): void {
  const existing = loadPool();
  const map = new Map<string, STCandidateEntry>();
  for (const e of existing) map.set(e.tsCode, e);
  for (const e of entries) {
    const prev = map.get(e.tsCode);
    if (!prev || new Date(e.scannedAt) >= new Date(prev.scannedAt)) {
      map.set(e.tsCode, e);
    }
  }
  savePoolRaw(Array.from(map.values()));
}

/** 从候选池移除指定股票 */
export function removeFromPool(tsCode: string): void {
  savePoolRaw(loadPool().filter(e => e.tsCode !== tsCode));
}

/** 清空候选池 */
export function clearPool(): void {
  if (!isClient()) return;
  try { localStorage.removeItem(POOL_KEY); } catch { /**/ }
}

// ── 扫描历史 ──────────────────────────────────────────────────────────

export function loadHistory(): STScanRecord[] {
  if (!isClient()) return [];
  return tryParse<STScanRecord[]>(localStorage.getItem(HISTORY_KEY), []);
}

/**
 * 保存完整扫描记录，并自动合并达标股票到候选池。
 * 若同一 scanId 已存在则更新（支持扫描中途停止后继续保存）。
 */
export function saveScanRecord(record: STScanRecord): void {
  const history = loadHistory();
  const idx = history.findIndex(r => r.scanId === record.scanId);
  if (idx >= 0) {
    history[idx] = record;
  } else {
    history.unshift(record);
    if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
  }

  if (!isClient()) return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // 存满时：存 slim 版本（不含 cachedResult）
    try {
      const slim = history.map(rec => ({
        ...rec,
        results: rec.results.map(r => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { cachedResult: _, ...rest } = r;
          return rest;
        }),
      }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(slim));
    } catch {
      console.warn("[stScanStorage] 历史记录保存失败（存储空间不足）");
    }
  }

  // 同步合并达标股票到候选池
  const passed = record.results.filter(r => r.passed);
  if (passed.length > 0) {
    mergeIntoPool(passed);
  }
}

/** 删除指定扫描历史记录 */
export function deleteScanRecord(scanId: string): void {
  const history = loadHistory().filter(r => r.scanId !== scanId);
  if (!isClient()) return;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /**/ }
}

/** 清空所有历史记录 */
export function clearHistory(): void {
  if (!isClient()) return;
  try { localStorage.removeItem(HISTORY_KEY); } catch { /**/ }
}

// ── 工具 ──────────────────────────────────────────────────────────────

/** 生成唯一扫描批次 ID */
export function generateScanId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 计算为什么未达标（返回原因数组，通过则为空数组） */
export function computeFailedReasons(
  r: { annualReturn: number; maxDrawdown: number; winRate: number; totalTrades: number;
       limitDownCannotSellCount: number; suspendedDays: number; maxConsecutiveLosses: number },
  minAnn: number, maxDD: number, minWin: number
): string[] {
  const reasons: string[] = [];
  if (r.annualReturn < minAnn)         reasons.push(`年化收益${r.annualReturn.toFixed(1)}% < ${minAnn}%`);
  if (Math.abs(r.maxDrawdown) > maxDD) reasons.push(`最大回撤${Math.abs(r.maxDrawdown).toFixed(1)}% > ${maxDD}%`);
  if (r.winRate < minWin)              reasons.push(`胜率${r.winRate.toFixed(1)}% < ${minWin}%`);
  if (r.totalTrades < 3)              reasons.push("交易次数不足（<3次）");
  if (r.totalTrades > 80)             reasons.push("交易次数过多（>80次）");
  if (r.limitDownCannotSellCount > 5) reasons.push(`跌停滞留${r.limitDownCannotSellCount}次 > 5次`);
  if (r.suspendedDays > 30)           reasons.push(`停牌${r.suspendedDays}天 > 30天`);
  if (r.maxConsecutiveLosses > 8)     reasons.push(`连续亏损${r.maxConsecutiveLosses}次 > 8次`);
  return reasons;
}

/**
 * 将 ScanStockResult 转换为 STCandidateEntry 存储格式。
 * 对 equity/kline 做下采样以节省存储空间。
 */
export function toStorageEntry(
  r: {
    tsCode: string; symbol: string; name: string; industry: string; stType: string;
    totalReturn: number; annualReturn: number; maxDrawdown: number; winRate: number;
    sharpeRatio: number; profitFactor: number; totalTrades: number;
    stopLossCount: number; takeProfitCount: number; limitDownCannotSellCount: number;
    suspendedDays: number; maxConsecutiveLosses: number; avgHoldDays: number;
    initialCapital: number; finalCapital: number; compositeScore: number;
    riskLevel: "low" | "medium" | "high" | "extreme";
    riskEvents: unknown[]; equity: { date: string; value: number }[];
    drawdown: { date: string; dd: number }[];
    trades: unknown[]; klineSignals: unknown[]; diagnostics: unknown;
    dataQuality: number; scoreMode: string;
    sourceBacktestMethod: "backtestSingleSTStock";
    scanParams: STScanParams;
  },
  scanId: string,
  passed: boolean,
  failedReasons: string[]
): STCandidateEntry {
  return {
    symbol:   r.symbol,
    tsCode:   r.tsCode,
    name:     r.name,
    industry: r.industry,
    stType:   r.stType,
    totalReturn:   r.totalReturn,
    annualReturn:  r.annualReturn,
    maxDrawdown:   r.maxDrawdown,
    winRate:       r.winRate,
    sharpeRatio:   r.sharpeRatio,
    profitFactor:  r.profitFactor,
    tradeCount:    r.totalTrades,
    stopLossCount: r.stopLossCount,
    takeProfitCount: r.takeProfitCount,
    limitDownCannotSellCount: r.limitDownCannotSellCount,
    suspendedDays: r.suspendedDays,
    maxConsecutiveLosses: r.maxConsecutiveLosses,
    avgHoldDays:   r.avgHoldDays,
    initialCapital: r.initialCapital,
    finalCapital:   r.finalCapital,
    compositeScore: r.compositeScore,
    riskLevel:      r.riskLevel,
    riskEventCount: r.riskEvents?.length ?? 0,
    passed,
    failedReasons,
    scannedAt: new Date().toISOString(),
    scanId,
    scanParams: r.scanParams,
    sourceBacktestMethod: "backtestSingleSTStock",
    cachedResult: {
      equity:       downsample(r.equity       ?? [], 120),
      drawdown:     downsample(r.drawdown     ?? [], 120),
      trades:       r.trades       ?? [],
      riskEvents:   r.riskEvents   ?? [],
      klineSignals: downsample(r.klineSignals ?? [], 150),
      diagnostics:  r.diagnostics,
      dataQuality:  r.dataQuality,
      scoreMode:    r.scoreMode,
    },
  };
}
