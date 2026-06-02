/**
 * lib/trendCorrectionScanTaskManager.ts
 *
 * A股趋势回调微型反转策略 — 全市场扫描任务管理器
 *
 * 架构说明：
 * ─────────────────────────────────────────────────────────────────
 * 1. 模块级单例（window.__trendCorrectionScanManager）
 *    React 组件卸载（用户切换页面）后扫描继续运行，因为
 *    模块级变量不被 React 生命周期管理。
 *
 * 2. 分批扫描
 *    每批通过 POST /scan/batch 发送 batchSize 只股票给后端分析，
 *    避免一次性扫描 5000 只导致 Vercel 超时或 Tushare 限流。
 *
 * 3. localStorage 持久化
 *    每批扫描后保存任务状态。App 被系统杀掉重启后，仍可恢复进度。
 *
 * 4. 事件订阅
 *    UI 组件通过 subscribe() 订阅状态变化，卸载时退订。
 *    任务管理器独立运行，不依赖 React 组件生命周期。
 *
 * 5. 扫描模式
 *    full_market  : 默认，扫描全部 A股（5000+ 只）
 *    quick_test   : 测试用，随机抽取 200 只
 *
 * 降级说明（Capacitor WebView 限制）：
 * ─────────────────────────────────────────────────────────────────
 * - App 在前台时：扫描持续进行
 * - 用户切换页面但 App 未关闭：扫描继续（模块级 async loop 不中断）
 * - App 被系统杀掉：localStorage 保留已扫描进度和候选结果
 * - 重启后：读取 localStorage，用户可选择继续 / 重新开始
 */

import type { MiniReversalParams } from "./trendCorrectionMiniReversalService";

// ── 存储键 ────────────────────────────────────────────────────────────────

export const SCAN_TASK_KEY    = "quantplanet_trend_correction_mini_reversal_scan_task_v1";
export const CANDIDATES_KEY   = "quantplanet_trend_correction_mini_reversal_candidates_v1";
export const HIGH_RISK_KEY    = "quantplanet_trend_correction_mini_reversal_high_risk_v1";
export const INSUFFICIENT_KEY = "quantplanet_trend_correction_mini_reversal_insufficient_v1";
export const HISTORY_KEY      = "quantplanet_trend_correction_mini_reversal_scan_history_v1";

// ── 公共类型 ──────────────────────────────────────────────────────────────

export type ScanStatus = "idle" | "running" | "paused" | "completed" | "failed";
export type ScanMode   = "full_market" | "quick_test";

export interface StockRef { tsCode: string; name: string }

export interface CandidateItem {
  tsCode:       string;
  symbol:       string;
  name:         string;
  currentPrice: number;
  uptrend: {
    detected:    boolean;
    lowPoint:    { date: string; price: number; idx: number } | null;
    highPoint:   { date: string; price: number; idx: number } | null;
    riseAmount:  number;
    risePercent: number;
    trendDays:   number;
    reasons:     string[];
  };
  retracement: {
    matched:              boolean;
    halfRetracementPrice: number;
    price40Retracement:   number;
    price60Retracement:   number;
    correctionRatio:      number;
    correctionPercent:    number;
    lowerZonePrice:       number;
    upperZonePrice:       number;
  };
  miniReversal: {
    miniReversal:    boolean;
    score:           number;
    conditionsMet:   number;
    conditionsTotal: number;
    reasons:         string[];
  };
  riskFilter:  { passed: boolean; riskLevel: string; reason: string };
  buySignal:    boolean;
  buySignalReasons: string[];
  addedAt:      string;
  scannedAt:    string;
  source:       "scan";
}

export interface ExcludedItem {
  tsCode:    string;
  name:      string;
  reason:    string;
  scannedAt: string;
}

export interface ErrorItem {
  tsCode:    string;
  name:      string;
  error:     string;
  scannedAt: string;
}

export interface ScanTaskState {
  taskId:                string;
  strategyId:            "trend-correction-mini-reversal";
  status:                ScanStatus;
  scanMode:              ScanMode;
  totalCount:            number;
  totalAStockCount:      number;    // 原始 A股总数（未经 quickTest 截断）
  scannedCount:          number;
  progressPercent:       number;
  currentSymbol:         string;
  currentName:           string;
  // 分类统计
  candidatesCount:       number;
  highRiskCount:         number;
  insufficientDataCount: number;
  errorCount:            number;
  // 趋势/回撤/反转计数
  longTrendCount:        number;
  halfRetracementCount:  number;
  miniReversalCount:     number;
  // 数据（candidates 保留完整；highRisk/insuff 仅保留计数，详情存 localStorage）
  stockList:             StockRef[];   // 完整股票列表（用于继续扫描）
  scannedSymbols:        string[];     // 已扫描的 tsCode 列表
  candidates:            CandidateItem[];
  recentErrors:          ErrorItem[];  // 最多保留 50 条
  // 时间
  startedAt:             string | null;
  updatedAt:             string | null;
  completedAt:           string | null;
  failedReason:          string | null;
  // 配置
  params:                MiniReversalParams;
  batchSize:             number;
  batchDelayMs:          number;
}

// ── 批次响应类型（匹配 /scan/batch route 的返回结构） ─────────────────────

interface BatchAnalysis {
  currentPrice:     number;
  uptrend:          CandidateItem["uptrend"];
  retracement:      CandidateItem["retracement"];
  miniReversal:     CandidateItem["miniReversal"];
  riskFilter:       CandidateItem["riskFilter"];
  buySignal:        boolean;
  buySignalReasons: string[];
  barsCount:        number;
}

interface BatchResult {
  tsCode:              string;
  name:                string;
  status:              "candidate" | "high_risk" | "insufficient" | "no_signal" | "error";
  reason?:             string;
  analysis?:           BatchAnalysis;
  uptrendDetected?:    boolean;
  retracementMatched?: boolean;
  miniReversalOk?:     boolean;
}

type TaskListener = (state: ScanTaskState | null) => void;

// ── 工具函数 ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function lsGet<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

function lsSet(key: string, value: unknown): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function lsDel(key: string): void {
  try { if (typeof window !== "undefined") localStorage.removeItem(key); } catch {}
}

// ── 任务管理器类 ──────────────────────────────────────────────────────────

class TrendCorrectionScanTaskManager {
  private state:          ScanTaskState | null = null;
  private listeners       = new Set<TaskListener>();
  private running         = false;
  private stopRequested   = false;
  private consecutiveErrs = 0;
  private readonly MAX_CONSECUTIVE_ERRS = 5;

  constructor() {
    if (typeof window !== "undefined") this._loadState();
  }

  // ── 订阅 ─────────────────────────────────────────────────────────────

  subscribe(cb: TaskListener): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => { this.listeners.delete(cb); };
  }

  private _notify(): void {
    this.listeners.forEach(cb => cb(this.state));
  }

  // ── 持久化 ────────────────────────────────────────────────────────────

  private _loadState(): void {
    const saved = lsGet<ScanTaskState | null>(SCAN_TASK_KEY, null);
    if (saved) {
      // App 被杀掉时 status 可能仍是 "running" → 改为 "paused"
      if (saved.status === "running") saved.status = "paused";
      // 兼容旧版数据：确保新字段有默认值
      if (!saved.scanMode) saved.scanMode = "full_market";
      if (saved.totalAStockCount === undefined) saved.totalAStockCount = saved.totalCount;
      this.state = saved;
    }
  }

  private _saveState(): void {
    if (this.state) lsSet(SCAN_TASK_KEY, this.state);
    else lsDel(SCAN_TASK_KEY);
  }

  // ── 读取方法 ──────────────────────────────────────────────────────────

  getState(): ScanTaskState | null { return this.state; }
  getCandidates(): CandidateItem[] { return lsGet<CandidateItem[]>(CANDIDATES_KEY, []); }
  getHighRisk(): ExcludedItem[] { return lsGet<ExcludedItem[]>(HIGH_RISK_KEY, []); }
  getInsufficient(): ExcludedItem[] { return lsGet<ExcludedItem[]>(INSUFFICIENT_KEY, []); }
  getHistory(): Array<{ scannedAt: string; stats: { total: number; scannedCount: number; candidates: number }; scanMode?: ScanMode }> {
    return lsGet(HISTORY_KEY, []);
  }

  /**
   * 检测旧任务是否"陈旧"：任务已完成但 totalCount 很小（可能是旧版 200 只限制）。
   * 返回 true 时建议 UI 提示用户重新扫描。
   */
  isStaleTask(): boolean {
    if (!this.state) return false;
    const s = this.state;
    if (s.status !== "completed" && s.status !== "paused") return false;
    // 全市场扫描但 totalCount < 1000 → 认为是旧版被限制到 200 只的结果
    if (s.scanMode === "full_market" && s.totalCount < 1000) return true;
    // 没有 scanMode 字段（旧版数据）且 totalCount < 1000
    if (!s.scanMode && s.totalCount < 1000) return true;
    return false;
  }

  // ── 控制：开始全新扫描 ─────────────────────────────────────────────────

  async startScan(
    params:       MiniReversalParams,
    scanMode:     ScanMode = "full_market",
    batchSize     = 10,
    batchDelayMs  = 800,
  ): Promise<void> {
    if (this.running) return;

    // 1. 先获取股票列表
    this._patchState({
      status:      "running",
      scanMode,
      totalCount:  0,
      totalAStockCount: 0,
      scannedCount: 0,
      progressPercent: 0,
      currentSymbol: "",
      currentName:  `正在获取 A股股票列表（${scanMode === "quick_test" ? "快速测试" : "全市场"}）…`,
      stockList:    [],
      scannedSymbols: [],
      candidates:   [],
      recentErrors: [],
      candidatesCount: 0, highRiskCount: 0, insufficientDataCount: 0, errorCount: 0,
      longTrendCount: 0, halfRetracementCount: 0, miniReversalCount: 0,
      startedAt:    new Date().toISOString(),
      updatedAt:    null,
      completedAt:  null,
      failedReason: null,
      params, batchSize, batchDelayMs,
    });

    let stocks:          StockRef[];
    let totalAStockCount = 0;

    // 根据 scanMode 选择对应的 API 参数
    const stocksUrl = scanMode === "quick_test"
      ? "/api/strategies/trend-correction-mini-reversal/scan/stocks?mode=quick_test&refresh=1"
      : "/api/strategies/trend-correction-mini-reversal/scan/stocks?mode=full_market&refresh=1";

    try {
      const res  = await fetch(stocksUrl);
      const json = await res.json() as {
        ok: boolean;
        stocks?: StockRef[];
        totalAStockCount?: number;
        scanMode?: string;
        error?: string;
      };
      if (!json.ok || !json.stocks?.length) {
        this._fail(json.error ?? "无法获取 A股股票列表，请检查 Tushare Token 配置");
        return;
      }
      stocks           = json.stocks;
      totalAStockCount = json.totalAStockCount ?? stocks.length;
    } catch (e) {
      this._fail(`获取股票列表网络失败：${String(e)}`);
      return;
    }

    // 清空之前的分类结果
    lsSet(CANDIDATES_KEY, []);
    lsSet(HIGH_RISK_KEY, []);
    lsSet(INSUFFICIENT_KEY, []);

    this._patchState({
      taskId:           `scan_${Date.now()}`,
      totalCount:       stocks.length,
      totalAStockCount,
      currentName:      "",
      stockList:        stocks,
    });

    await this._runLoop();
  }

  // ── 控制：继续（从暂停处恢复） ────────────────────────────────────────

  async resumeScan(): Promise<void> {
    if (this.running || !this.state) return;
    if (this.state.status !== "paused" && this.state.status !== "failed") return;
    this._patchState({ status: "running", failedReason: null });
    await this._runLoop();
  }

  // ── 控制：暂停 ─────────────────────────────────────────────────────────

  pauseScan(): void {
    if (!this.running) return;
    this.stopRequested = true;
  }

  // ── 控制：重置清空 ──────────────────────────────────────────────────────

  resetScan(): void {
    this.stopRequested = true;
    this.state         = null;
    this._saveState();
    lsDel(CANDIDATES_KEY);
    lsDel(HIGH_RISK_KEY);
    lsDel(INSUFFICIENT_KEY);
    this._notify();
  }

  // ── 内部：修改并持久化状态 ─────────────────────────────────────────────

  private _patchState(partial: Partial<ScanTaskState>): void {
    if (!this.state) {
      this.state = {
        taskId:      `scan_${Date.now()}`,
        strategyId:  "trend-correction-mini-reversal",
        status:      "idle",
        scanMode:    "full_market",
        totalCount:       0, totalAStockCount: 0, scannedCount:  0, progressPercent: 0,
        currentSymbol:    "",  currentName:   "",
        candidatesCount:  0, highRiskCount:  0, insufficientDataCount: 0, errorCount: 0,
        longTrendCount:   0, halfRetracementCount: 0, miniReversalCount: 0,
        stockList:        [], scannedSymbols: [],
        candidates:       [], recentErrors:   [],
        startedAt:    null, updatedAt: null, completedAt: null, failedReason: null,
        params:       {} as MiniReversalParams,
        batchSize:    10,   batchDelayMs: 800,
        ...partial,
      };
    } else {
      Object.assign(this.state, partial);
    }
    this.state.updatedAt = new Date().toISOString();
    this._saveState();
    this._notify();
  }

  private _fail(reason: string): void {
    this._patchState({ status: "failed", failedReason: reason, currentName: reason });
    this.running = false;
  }

  // ── 内部：主扫描循环 ──────────────────────────────────────────────────

  private async _runLoop(): Promise<void> {
    if (this.running) return;
    this.running       = true;
    this.stopRequested = false;
    this.consecutiveErrs = 0;

    const task = this.state!;
    const scannedSet = new Set(task.scannedSymbols);
    const remaining  = task.stockList.filter(s => !scannedSet.has(s.tsCode));

    let idx = 0;
    while (idx < remaining.length && !this.stopRequested) {
      const batch = remaining.slice(idx, idx + task.batchSize);
      idx += task.batchSize;

      // 显示当前批次首只股票
      const first = batch[0];
      if (first) {
        this.state!.currentSymbol = first.tsCode;
        this.state!.currentName   = first.name;
        this._notify();
      }

      // ── 调用批量分析 API ──────────────────────────────────────────
      let batchResults: BatchResult[] = [];
      let batchOk = false;

      try {
        const res = await fetch(
          "/api/strategies/trend-correction-mini-reversal/scan/batch",
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ stocks: batch, params: task.params }),
          }
        );
        const json = await res.json() as { ok: boolean; results?: BatchResult[] };
        if (json.ok && json.results) {
          batchResults = json.results;
          batchOk = true;
          this.consecutiveErrs = 0;
        } else {
          this.consecutiveErrs++;
        }
      } catch {
        this.consecutiveErrs++;
        const now = new Date().toISOString();
        for (const s of batch) {
          batchResults.push({ tsCode: s.tsCode, name: s.name, status: "error", reason: "网络请求失败" });
          scannedSet.add(s.tsCode);
          this.state!.scannedSymbols.push(s.tsCode);
        }
      }

      // 连续失败过多 → 自动暂停
      if (this.consecutiveErrs >= this.MAX_CONSECUTIVE_ERRS) {
        this.running = false;
        this.stopRequested = false;
        this._patchState({ status: "paused", failedReason: `连续 ${this.consecutiveErrs} 批请求失败，已自动暂停。请稍后继续扫描。` });
        return;
      }

      if (!batchOk && batchResults.length === 0) {
        const now = new Date().toISOString();
        for (const s of batch) {
          if (!scannedSet.has(s.tsCode)) {
            batchResults.push({ tsCode: s.tsCode, name: s.name, status: "error", reason: "接口返回异常" });
          }
        }
      }

      // ── 处理批次结果 ──────────────────────────────────────────────
      const now = new Date().toISOString();

      const savedCandidates   = this.getCandidates();
      const savedHighRisk     = this.getHighRisk();
      const savedInsufficient = this.getInsufficient();

      for (const r of batchResults) {
        if (!scannedSet.has(r.tsCode)) {
          scannedSet.add(r.tsCode);
          this.state!.scannedSymbols.push(r.tsCode);
        }

        if (r.status === "candidate" && r.analysis) {
          const a = r.analysis;
          const item: CandidateItem = {
            tsCode:       r.tsCode,
            symbol:       r.tsCode.split(".")[0] ?? r.tsCode,
            name:         r.name,
            currentPrice: a.currentPrice,
            uptrend:      a.uptrend,
            retracement:  a.retracement,
            miniReversal: a.miniReversal,
            riskFilter:   a.riskFilter,
            buySignal:    a.buySignal,
            buySignalReasons: a.buySignalReasons,
            addedAt:      now,
            scannedAt:    now,
            source:       "scan",
          };

          const si = this.state!.candidates.findIndex(c => c.tsCode === r.tsCode);
          if (si >= 0) this.state!.candidates[si] = item;
          else this.state!.candidates.push(item);
          this.state!.candidatesCount = this.state!.candidates.length;

          const ci = savedCandidates.findIndex(c => c.tsCode === r.tsCode);
          if (ci >= 0) savedCandidates[ci] = item; else savedCandidates.push(item);

          if (a.uptrend?.detected)          this.state!.longTrendCount++;
          if (a.retracement?.matched)       this.state!.halfRetracementCount++;
          if (a.miniReversal?.miniReversal) this.state!.miniReversalCount++;

        } else if (r.status === "high_risk") {
          const item: ExcludedItem = { tsCode: r.tsCode, name: r.name, reason: r.reason ?? "", scannedAt: now };
          this.state!.highRiskCount++;
          const hi = savedHighRisk.findIndex(x => x.tsCode === r.tsCode);
          if (hi >= 0) savedHighRisk[hi] = item; else savedHighRisk.push(item);

        } else if (r.status === "insufficient") {
          const item: ExcludedItem = { tsCode: r.tsCode, name: r.name, reason: r.reason ?? "数据不足", scannedAt: now };
          this.state!.insufficientDataCount++;
          const ii = savedInsufficient.findIndex(x => x.tsCode === r.tsCode);
          if (ii >= 0) savedInsufficient[ii] = item; else savedInsufficient.push(item);

        } else if (r.status === "no_signal") {
          if (r.uptrendDetected)    this.state!.longTrendCount++;
          if (r.retracementMatched) this.state!.halfRetracementCount++;

        } else if (r.status === "error") {
          this.state!.errorCount++;
          this.state!.insufficientDataCount++;
          const item: ExcludedItem = { tsCode: r.tsCode, name: r.name, reason: r.reason ?? "分析出错", scannedAt: now };
          const ii = savedInsufficient.findIndex(x => x.tsCode === r.tsCode);
          if (ii >= 0) savedInsufficient[ii] = item; else savedInsufficient.push(item);

          const errItem: ErrorItem = { tsCode: r.tsCode, name: r.name, error: r.reason ?? "", scannedAt: now };
          this.state!.recentErrors = [...this.state!.recentErrors.slice(-49), errItem];
        }
      }

      lsSet(CANDIDATES_KEY, savedCandidates);
      lsSet(HIGH_RISK_KEY, savedHighRisk);
      lsSet(INSUFFICIENT_KEY, savedInsufficient);

      // 更新进度
      this.state!.scannedCount    = this.state!.scannedSymbols.length;
      this.state!.progressPercent = this.state!.totalCount > 0
        ? Math.round(this.state!.scannedCount / this.state!.totalCount * 1000) / 10
        : 0;

      this._saveState();
      this._notify();

      if (idx < remaining.length && !this.stopRequested) {
        await sleep(task.batchDelayMs);
      }
    }

    this.running = false;

    if (this.stopRequested) {
      this.stopRequested = false;
      this._patchState({ status: "paused", currentSymbol: "", currentName: "" });
    } else {
      const completedAt = new Date().toISOString();
      this._patchState({
        status:         "completed",
        completedAt,
        currentSymbol:  "",
        currentName:    "扫描完成",
      });

      const history = this.getHistory();
      history.unshift({
        scannedAt:  completedAt,
        scanMode:   this.state!.scanMode,
        stats: {
          total:        this.state!.totalCount,
          scannedCount: this.state!.scannedCount,
          candidates:   this.state!.candidatesCount,
        },
      });
      lsSet(HISTORY_KEY, history.slice(0, 20));
    }
  }
}

// ── 模块级单例（window 属性，热更新不会丢失） ──────────────────────────────

declare global {
  interface Window {
    __trendCorrectionScanManager?: TrendCorrectionScanTaskManager;
  }
}

export function getScanTaskManager(): TrendCorrectionScanTaskManager {
  if (typeof window === "undefined") {
    throw new Error("getScanTaskManager() can only be used client-side");
  }
  if (!window.__trendCorrectionScanManager) {
    window.__trendCorrectionScanManager = new TrendCorrectionScanTaskManager();
  }
  return window.__trendCorrectionScanManager;
}
