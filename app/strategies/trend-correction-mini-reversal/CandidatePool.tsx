"use client";

/**
 * app/strategies/trend-correction-mini-reversal/CandidatePool.tsx
 *
 * 候选池 + 全市场扫描任务管理界面
 *
 * 功能：
 * - 扫描模式：全市场扫描（默认）/ 快速测试扫描（200只）
 * - 显示 A股总数、已扫描数量、扫描进度条
 * - 实时显示当前正在扫描的股票
 * - 状态化按钮（扫描中/暂停/完成/失败）
 * - 候选池、高风险、数据不足列表实时更新
 * - 退出页面后扫描继续（模块级任务管理器）
 * - 重新进入后恢复进度显示
 * - 检测并警告旧版 200只 陈旧任务
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Pause, Play, Square, RotateCcw,
  TrendingUp, AlertTriangle, Database, Clock,
  History, Zap, Globe,
} from "lucide-react";
import {
  getScanTaskManager,
  type ScanTaskState,
  type CandidateItem,
  type ExcludedItem,
  type ScanMode,
  CANDIDATES_KEY, HIGH_RISK_KEY, INSUFFICIENT_KEY, HISTORY_KEY,
} from "@/lib/trendCorrectionScanTaskManager";
import type { MiniReversalParams } from "@/lib/trendCorrectionMiniReversalService";

// ── 颜色工具 ──────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#3b82f6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function fmtDate(d?: string | null): string {
  if (!d) return "";
  if (d.includes("T")) return d.slice(0, 10);
  if (d.length >= 8 && !d.includes("-")) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
  return d;
}

function lsGet<T>(key: string, fb: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fb;
  } catch { return fb; }
}

// ── 候选股票卡片 ───────────────────────────────────────────────────────────

function CandidateCard({ item }: { item: CandidateItem }) {
  const [expanded, setExpanded] = useState(false);
  const score = item.miniReversal.score;
  const cr    = item.retracement.correctionPercent ?? (item.retracement.correctionRatio * 100);
  const rise  = item.uptrend.risePercent * 100;

  return (
    <div
      className="p-3 rounded-xl mb-2 cursor-pointer"
      style={{ background: "#0d1f3c", border: `1px solid ${item.buySignal ? "#22c55e44" : "#1a2f50"}` }}
      onClick={() => setExpanded(v => !v)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-[14px]" style={{ color: "#e2e8f0" }}>{item.name}</span>
            <span className="text-[11px]" style={{ color: "#64748b" }}>{item.symbol}</span>
            {item.buySignal && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>买入候选</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span style={{ color: "#94a3b8" }}>
              当前 <span style={{ color: "#e2e8f0" }}>¥{item.currentPrice.toFixed(2)}</span>
            </span>
            <span style={{ color: "#94a3b8" }}>
              上涨 <span style={{ color: "#22c55e" }}>+{rise.toFixed(1)}%</span>
            </span>
            <span style={{ color: "#94a3b8" }}>
              回撤 <span style={{ color: "#f59e0b" }}>{cr.toFixed(1)}%</span>
            </span>
            <span style={{ color: "#94a3b8" }}>
              50%价 <span style={{ color: "#3b82f6" }}>¥{item.retracement.halfRetracementPrice.toFixed(2)}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold"
            style={{ background: `${scoreColor(score)}22`, border: `1px solid ${scoreColor(score)}`, color: scoreColor(score) }}>
            {score}
          </div>
          <span className="text-[9px] mt-0.5" style={{ color: "#475569" }}>反转分</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1a2f50" }}>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "阶段低点", value: item.uptrend.lowPoint?.price.toFixed(2) ?? "-", color: "#22c55e", sub: fmtDate(item.uptrend.lowPoint?.date) },
              { label: "阶段高点", value: item.uptrend.highPoint?.price.toFixed(2) ?? "-", color: "#ef4444", sub: fmtDate(item.uptrend.highPoint?.date) },
              { label: "50%回撤", value: item.retracement.halfRetracementPrice.toFixed(2), color: "#3b82f6", sub: "理论" },
            ].map(d => (
              <div key={d.label} className="p-2 rounded-lg text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="text-[10px] mb-1" style={{ color: "#64748b" }}>{d.label}</div>
                <div className="text-[13px] font-bold" style={{ color: d.color }}>¥{d.value}</div>
                <div className="text-[9px]" style={{ color: "#334155" }}>{d.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "40%回撤", value: item.retracement.price40Retracement?.toFixed(2) ?? "-", color: "#f59e0b" },
              { label: "当前价", value: item.currentPrice.toFixed(2), color: "#e2e8f0" },
              { label: "60%回撤", value: item.retracement.price60Retracement?.toFixed(2) ?? "-", color: "#f97316" },
            ].map(d => (
              <div key={d.label} className="p-2 rounded-lg text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="text-[10px] mb-1" style={{ color: "#64748b" }}>{d.label}</div>
                <div className="text-[12px] font-bold" style={{ color: d.color }}>¥{d.value}</div>
              </div>
            ))}
          </div>

          {item.buySignalReasons.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] mb-1" style={{ color: "#64748b" }}>买入信号：</p>
              {item.buySignalReasons.map((r, i) => (
                <p key={i} className="text-[11px]" style={{ color: "#22c55e" }}>{r}</p>
              ))}
            </div>
          )}

          <div className="mb-2">
            <p className="text-[10px] mb-1" style={{ color: "#64748b" }}>
              微型反转条件（{item.miniReversal.conditionsMet}/{item.miniReversal.conditionsTotal}）：
            </p>
            <div className="flex flex-wrap gap-1">
              {item.miniReversal.reasons.map((r, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>✓ {r}</span>
              ))}
            </div>
          </div>

          <p className="text-[10px]" style={{ color: "#334155" }}>
            上涨天数：{item.uptrend.trendDays} 日 ｜ 加入于：{fmtDate(item.addedAt)}
          </p>
        </div>
      )}
    </div>
  );
}

// ── 进度条 ────────────────────────────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "#1a2f50" }}>
      <div
        className="h-full rounded-full"
        style={{
          width:      `${Math.min(percent, 100)}%`,
          background: "linear-gradient(90deg, #00E5A8, #3b82f6)",
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

// ── 状态徽章 ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ScanTaskState["status"] }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    idle:      { label: "未开始",  bg: "rgba(100,116,139,0.15)", color: "#64748b" },
    running:   { label: "扫描中",  bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
    paused:    { label: "已暂停",  bg: "rgba(234,179,8,0.15)",   color: "#eab308" },
    completed: { label: "已完成",  bg: "rgba(59,130,246,0.15)",  color: "#3b82f6" },
    failed:    { label: "扫描失败", bg: "rgba(239,68,68,0.15)",  color: "#ef4444" },
  };
  const s = map[status] ?? map.idle;
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

// ── 扫描模式徽章 ──────────────────────────────────────────────────────────

function ScanModeBadge({ scanMode }: { scanMode?: ScanMode }) {
  if (scanMode === "quick_test") {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: "rgba(234,179,8,0.15)", color: "#eab308", border: "1px solid #eab30844" }}>
        ⚡ 快速测试扫描（200只）
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8", border: "1px solid #00E5A844" }}>
      🌐 全市场扫描
    </span>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────

type TabKey = "candidates" | "highRisk" | "dataInsuff" | "history";

interface Props { params: MiniReversalParams }

export default function CandidatePool({ params }: Props) {
  const [task,           setTask]           = useState<ScanTaskState | null>(null);
  const [tab,            setTab]            = useState<TabKey>("candidates");
  const [showDebug,      setShowDebug]      = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [showStaleBanner,  setShowStaleBanner]  = useState(false);
  const [selectedMode,   setSelectedMode]   = useState<ScanMode>("full_market");
  const [candidates,     setCandidates]     = useState<CandidateItem[]>([]);
  const [highRisk,       setHighRisk]       = useState<ExcludedItem[]>([]);
  const [insufficient,   setInsufficient]   = useState<ExcludedItem[]>([]);
  const [history,        setHistory]        = useState<Array<{ scannedAt: string; stats: { total: number; scannedCount: number; candidates: number }; scanMode?: ScanMode }>>([]);
  const [elapsed,        setElapsed]        = useState("");
  const [candidatePage,  setCandidatePage]  = useState(0);
  const [insuffPage,     setInsuffPage]     = useState(0);
  const PAGE_SIZE  = 50;
  const isFirstMount = useRef(true);

  // ── 订阅任务管理器 ──────────────────────────────────────────────────
  useEffect(() => {
    const mgr = getScanTaskManager();
    const unsubscribe = mgr.subscribe((newTask) => {
      setTask(newTask);
      if (newTask) {
        setCandidates([...newTask.candidates]);
      }
    });
    setCandidates(mgr.getCandidates());
    setHighRisk(mgr.getHighRisk());
    setInsufficient(mgr.getInsufficient());
    setHistory(mgr.getHistory());

    if (isFirstMount.current) {
      isFirstMount.current = false;
      const s = mgr.getState();
      // 检测陈旧任务（旧版 200 只限制）
      if (s && mgr.isStaleTask()) {
        setShowStaleBanner(true);
      } else if (s && (s.status === "paused" || s.status === "running")) {
        setShowResumeBanner(true);
      }
      // 恢复上次使用的扫描模式
      if (s?.scanMode) setSelectedMode(s.scanMode);
    }

    return unsubscribe;
  }, []);

  // ── 刷新分类列表 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!task) return;
    const mgr = getScanTaskManager();
    setHighRisk(mgr.getHighRisk());
    setInsufficient(mgr.getInsufficient());
    setHistory(mgr.getHistory());
  }, [task?.scannedCount]);

  // ── 已用时间 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!task?.startedAt) { setElapsed(""); return; }
    if (task.status !== "running") return;
    const id = setInterval(() => {
      const ms   = Date.now() - new Date(task.startedAt!).getTime();
      const secs = Math.floor(ms / 1000);
      const mins = Math.floor(secs / 60);
      const hours = Math.floor(mins / 60);
      if (hours > 0)  setElapsed(`${hours}h ${mins % 60}m`);
      else if (mins > 0) setElapsed(`${mins}m ${secs % 60}s`);
      else setElapsed(`${secs}s`);
    }, 1000);
    return () => clearInterval(id);
  }, [task?.startedAt, task?.status]);

  // ── 预计剩余 ─────────────────────────────────────────────────────────
  const estimatedRemaining = (() => {
    if (!task?.startedAt || task.scannedCount < 10) return null;
    const elapsedMs = Date.now() - new Date(task.startedAt).getTime();
    const rate      = task.scannedCount / (elapsedMs / 1000);
    if (rate <= 0) return null;
    const remaining = (task.totalCount - task.scannedCount) / rate;
    if (remaining > 7200) return null;
    if (remaining > 3600) return `约 ${Math.floor(remaining / 3600)}h${Math.floor((remaining % 3600) / 60)}m`;
    if (remaining > 60)   return `约 ${Math.floor(remaining / 60)}m`;
    return `约 ${Math.floor(remaining)}s`;
  })();

  // ── 操作回调 ─────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    setShowResumeBanner(false);
    setShowStaleBanner(false);
    setCandidatePage(0);
    setInsuffPage(0);
    getScanTaskManager().startScan(params, selectedMode);
  }, [params, selectedMode]);

  const handleResume = useCallback(() => {
    setShowResumeBanner(false);
    getScanTaskManager().resumeScan();
  }, []);

  const handlePause = useCallback(() => {
    getScanTaskManager().pauseScan();
  }, []);

  const handleReset = useCallback(() => {
    setShowResumeBanner(false);
    setShowStaleBanner(false);
    setCandidates([]);
    setHighRisk([]);
    setInsufficient([]);
    setCandidatePage(0);
    setInsuffPage(0);
    getScanTaskManager().resetScan();
  }, []);

  // ── 状态化按钮 ───────────────────────────────────────────────────────

  const status = task?.status ?? "idle";

  const renderButtons = () => {
    if (status === "idle") {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          {/* 模式选择 */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <button
              onClick={() => setSelectedMode("full_market")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: selectedMode === "full_market" ? "#00E5A8" : "transparent",
                color:      selectedMode === "full_market" ? "#07111F" : "#94a3b8",
              }}
            >
              <Globe size={11} />全市场
            </button>
            <button
              onClick={() => setSelectedMode("quick_test")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: selectedMode === "quick_test" ? "#eab308" : "transparent",
                color:      selectedMode === "quick_test" ? "#07111F" : "#94a3b8",
              }}
            >
              <Zap size={11} />测试200
            </button>
          </div>

          <button onClick={handleStart}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold"
            style={{
              background: selectedMode === "quick_test" ? "#eab308" : "#00E5A8",
              color: "#07111F",
            }}>
            <RefreshCw size={14} />
            {selectedMode === "quick_test" ? "快速测试扫描" : "全市场扫描"}
          </button>
        </div>
      );
    }
    if (status === "running") {
      return (
        <div className="flex gap-2">
          <button onClick={handlePause}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold"
            style={{ background: "rgba(234,179,8,0.15)", color: "#eab308", border: "1px solid #eab308" }}>
            <Pause size={13} />暂停扫描
          </button>
          <button onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px]"
            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
            <Square size={13} />停止
          </button>
        </div>
      );
    }
    if (status === "paused") {
      return (
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleResume}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold"
            style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid #22c55e" }}>
            <Play size={13} />继续扫描
          </button>
          <button onClick={handleStart}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px]"
            style={{ background: "#1a2f50", color: "#94a3b8", border: "1px solid #1a2f50" }}>
            <RotateCcw size={13} />重新开始
          </button>
          <button onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px]"
            style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
            <Square size={13} />清空
          </button>
        </div>
      );
    }
    if (status === "completed") {
      return (
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleStart}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold"
            style={{ background: "#00E5A8", color: "#07111F" }}>
            <RotateCcw size={13} />重新扫描
          </button>
          <button onClick={() => setTab("history")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px]"
            style={{ background: "#1a2f50", color: "#94a3b8" }}>
            <History size={13} />查看历史
          </button>
        </div>
      );
    }
    if (status === "failed") {
      return (
        <div className="flex gap-2">
          <button onClick={handleResume}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold"
            style={{ background: "rgba(234,179,8,0.15)", color: "#eab308", border: "1px solid #eab308" }}>
            <RefreshCw size={13} />重试
          </button>
          <button onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px]"
            style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
            <Square size={13} />清空
          </button>
        </div>
      );
    }
    return null;
  };

  // ── 渲染 ──────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── 陈旧任务警告横幅（旧版 200 只限制） ── */}
      {showStaleBanner && task && (
        <div className="p-3 rounded-xl mb-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-[12px] font-semibold mb-1" style={{ color: "#f87171" }}>
                ⚠️ 检测到旧版扫描数据（仅 {task.totalCount} 只）
              </p>
              <p className="text-[11px]" style={{ color: "#94a3b8" }}>
                当前 A股全市场应有 5000+ 只。旧版扫描被限制在 {task.totalCount} 只（已修复）。
                建议点击「重新扫描」获取真实全市场结果。
              </p>
            </div>
            <button onClick={() => setShowStaleBanner(false)}
              className="text-[11px] flex-shrink-0" style={{ color: "#64748b" }}>✕</button>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
              style={{ background: "#00E5A8", color: "#07111F" }}>
              <RotateCcw size={11} />清空并重新扫描
            </button>
          </div>
        </div>
      )}

      {/* ── 恢复提示横幅 ── */}
      {showResumeBanner && task && !showStaleBanner && (
        <div className="p-3 rounded-xl mb-3 flex items-start justify-between gap-2"
          style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)" }}>
          <div className="flex-1">
            <p className="text-[12px]" style={{ color: "#93c5fd" }}>
              上次扫描任务仍在进行，已为你恢复进度。
              已扫描 {task.scannedCount} / {task.totalCount} 只，发现买入候选 {task.candidatesCount} 只。
            </p>
          </div>
          <button onClick={() => setShowResumeBanner(false)}
            className="text-[11px]" style={{ color: "#64748b" }}>✕</button>
        </div>
      )}

      {/* ── 操作栏 ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {renderButtons()}
        {status === "running" && (
          <span className="text-[11px]" style={{ color: "#64748b" }}>
            <RefreshCw size={10} className="inline mr-1 animate-spin" />
            扫描中…
          </span>
        )}
      </div>

      {/* ── 扫描状态卡片 ── */}
      {task && task.status !== "idle" && (
        <div className="p-4 rounded-2xl mb-4" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          {/* 标题行 */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={task.status} />
              <ScanModeBadge scanMode={task.scanMode} />
            </div>
            {task.startedAt && (
              <span className="text-[10px]" style={{ color: "#334155" }}>
                {task.startedAt.slice(11, 19)}
                {elapsed && <span className="ml-1">已用 {elapsed}</span>}
              </span>
            )}
          </div>

          {/* A股总数显示 */}
          {task.totalCount > 0 && (
            <div className="flex items-center gap-3 mb-2 text-[12px]" style={{ color: "#64748b" }}>
              <span>
                A股总数：<span style={{ color: "#e2e8f0", fontWeight: 600 }}>
                  {(task.totalAStockCount || task.totalCount).toLocaleString()} 只
                </span>
              </span>
              {task.scanMode === "quick_test" && (
                <span style={{ color: "#eab308" }}>
                  （测试抽取：{task.totalCount} 只）
                </span>
              )}
            </div>
          )}

          {/* 进度条 */}
          {task.totalCount > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px]" style={{ color: "#64748b" }}>
                  已扫描：<span style={{ color: "#e2e8f0" }}>{task.scannedCount.toLocaleString()}</span>
                  <span style={{ color: "#334155" }}> / {task.totalCount.toLocaleString()}</span>
                </span>
                <span className="text-[12px] font-bold" style={{ color: "#00E5A8" }}>
                  {task.progressPercent.toFixed(1)}%
                </span>
              </div>
              <ProgressBar percent={task.progressPercent} />
              {estimatedRemaining && task.status === "running" && (
                <p className="text-[10px] mt-1" style={{ color: "#334155" }}>
                  预计剩余：{estimatedRemaining}
                </p>
              )}
            </div>
          )}

          {/* 当前扫描股票 */}
          {task.status === "running" && task.currentName && (
            <div className="flex items-center gap-2 mb-3 p-2 rounded-lg"
              style={{ background: "rgba(0,229,168,0.05)", border: "1px solid rgba(0,229,168,0.1)" }}>
              <RefreshCw size={11} color="#00E5A8" className="animate-spin flex-shrink-0" />
              <span className="text-[11px]" style={{ color: "#94a3b8" }}>
                正在扫描：
                <span style={{ color: "#00E5A8" }}>{task.currentName}</span>
                {task.currentSymbol && (
                  <span style={{ color: "#334155" }}> {task.currentSymbol}</span>
                )}
              </span>
            </div>
          )}

          {/* 统计数字 */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: "买入候选", value: task.candidatesCount,       color: "#22c55e", icon: <TrendingUp size={11} /> },
              { label: "高风险",   value: task.highRiskCount,         color: "#ef4444", icon: <AlertTriangle size={11} /> },
              { label: "数据不足", value: task.insufficientDataCount, color: "#94a3b8", icon: <Database size={11} /> },
              { label: "剩余",     value: Math.max(0, task.totalCount - task.scannedCount), color: "#64748b", icon: <Clock size={11} /> },
            ].map(s => (
              <div key={s.label} className="p-2 rounded-xl text-center"
                style={{ background: "#07111F", border: "1px solid #0d2040" }}>
                <div className="flex items-center justify-center gap-1 mb-0.5" style={{ color: s.color }}>
                  {s.icon}
                  <span className="text-[14px] font-bold">{s.value.toLocaleString()}</span>
                </div>
                <div className="text-[9px]" style={{ color: "#475569" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 趋势/回撤/反转细分 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "识别趋势", value: task.longTrendCount,       color: "#3b82f6" },
              { label: "50%区间", value: task.halfRetracementCount,   color: "#f59e0b" },
              { label: "微型反转", value: task.miniReversalCount,     color: "#a78bfa" },
            ].map(s => (
              <div key={s.label} className="p-1.5 rounded-lg text-center"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1a2f50" }}>
                <div className="text-[12px] font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[9px]" style={{ color: "#475569" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 失败/暂停原因 */}
          {(task.status === "failed" || task.status === "paused") && task.failedReason && (
            <div className="mt-3 p-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="text-[11px]" style={{ color: "#f87171" }}>
                <AlertTriangle size={11} className="inline mr-1" />
                {task.failedReason}
              </p>
              {task.recentErrors.length > 0 && (
                <div className="mt-1">
                  <button onClick={() => setShowDebug(v => !v)}
                    className="text-[10px]" style={{ color: "#94a3b8" }}>
                    {showDebug ? "▲ 隐藏" : "▼ 查看最近错误"}
                  </button>
                  {showDebug && (
                    <div className="mt-1 space-y-0.5 text-[10px] font-mono" style={{ color: "#64748b" }}>
                      {task.recentErrors.slice(-5).map((e, i) => (
                        <p key={i}>{e.tsCode} {e.name}: {e.error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 无任务时的空状态 ── */}
      {!task && (
        <div className="py-8 text-center mb-4">
          <TrendingUp size={32} color="#1a2f50" className="mx-auto mb-3" />
          <p className="text-[13px]" style={{ color: "#475569" }}>
            选择扫描模式，点击按钮开始
          </p>
          <p className="text-[11px] mt-1" style={{ color: "#334155" }}>
            全市场扫描：获取 A股全部 5000+ 只，分批分析买入信号
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "#334155" }}>
            快速测试扫描：随机抽取 200 只，仅供开发测试
          </p>
        </div>
      )}

      {/* ── 标签页 ── */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {(
          [
            { key: "candidates" as TabKey, label: `买入候选 ${candidates.length}`,                       icon: <TrendingUp size={11} /> },
            { key: "highRisk"   as TabKey, label: `高风险 ${task?.highRiskCount ?? highRisk.length}`,     icon: <AlertTriangle size={11} /> },
            { key: "dataInsuff" as TabKey, label: `数据不足 ${task?.insufficientDataCount ?? insufficient.length}`, icon: <Database size={11} /> },
            { key: "history"    as TabKey, label: `历史扫描 ${history.length}`,                           icon: <History size={11} /> },
          ] as const
        ).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px]"
            style={{
              background: tab === t.key ? "#1e40af" : "rgba(30,64,175,0.1)",
              color:      tab === t.key ? "#93c5fd" : "#475569",
              border:     tab === t.key ? "1px solid #3b82f6" : "1px solid transparent",
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 内容 ── */}

      {/* 买入候选 */}
      {tab === "candidates" && (
        candidates.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[12px]" style={{ color: "#475569" }}>
              {status === "idle" ? "尚未扫描" : status === "running" ? "扫描中，暂无符合条件股票…" : "当前无买入候选"}
            </p>
            <p className="text-[11px] mt-1" style={{ color: "#334155" }}>
              需同时满足：长期上涨 + 50%回撤 + 微型反转 + 风险过滤
            </p>
          </div>
        ) : (
          <div>
            {candidates.slice(candidatePage * PAGE_SIZE, (candidatePage + 1) * PAGE_SIZE).map(item => (
              <CandidateCard key={item.tsCode} item={item} />
            ))}
            {candidates.length > PAGE_SIZE && (
              <div className="flex justify-center gap-3 mt-3">
                <button disabled={candidatePage === 0}
                  onClick={() => setCandidatePage(p => p - 1)}
                  className="px-3 py-1 rounded-lg text-[12px]"
                  style={{ background: candidatePage === 0 ? "#0d2040" : "#1a2f50", color: candidatePage === 0 ? "#334155" : "#94a3b8" }}>
                  上一页
                </button>
                <span className="text-[12px] self-center" style={{ color: "#475569" }}>
                  {candidatePage + 1} / {Math.ceil(candidates.length / PAGE_SIZE)}
                </span>
                <button disabled={(candidatePage + 1) * PAGE_SIZE >= candidates.length}
                  onClick={() => setCandidatePage(p => p + 1)}
                  className="px-3 py-1 rounded-lg text-[12px]"
                  style={{
                    background: (candidatePage + 1) * PAGE_SIZE >= candidates.length ? "#0d2040" : "#1a2f50",
                    color: (candidatePage + 1) * PAGE_SIZE >= candidates.length ? "#334155" : "#94a3b8",
                  }}>
                  下一页
                </button>
              </div>
            )}
          </div>
        )
      )}

      {/* 高风险剔除 */}
      {tab === "highRisk" && (
        highRisk.length === 0 ? (
          <p className="py-4 text-center text-[12px]" style={{ color: "#475569" }}>无高风险剔除记录</p>
        ) : (
          <div>
            {highRisk.slice(0, 100).map((item, i) => (
              <div key={i} className="flex items-start justify-between p-2 rounded-lg mb-1"
                style={{ background: "#0d1f3c" }}>
                <div>
                  <span className="text-[12px]" style={{ color: "#e2e8f0" }}>{item.name}</span>
                  <span className="text-[10px] ml-2" style={{ color: "#334155" }}>{item.tsCode}</span>
                </div>
                <span className="text-[10px] ml-2 flex-shrink-0" style={{ color: "#ef4444" }}>{item.reason}</span>
              </div>
            ))}
            {highRisk.length > 100 && (
              <p className="text-center text-[11px] mt-2" style={{ color: "#334155" }}>
                共 {highRisk.length} 条，显示前 100 条
              </p>
            )}
          </div>
        )
      )}

      {/* 数据不足 */}
      {tab === "dataInsuff" && (
        insufficient.length === 0 ? (
          <p className="py-4 text-center text-[12px]" style={{ color: "#475569" }}>无数据不足记录</p>
        ) : (
          <div>
            {insufficient
              .slice(insuffPage * PAGE_SIZE, (insuffPage + 1) * PAGE_SIZE)
              .map((item, i) => (
                <div key={i} className="flex items-start justify-between p-2 rounded-lg mb-1"
                  style={{ background: "#0d1f3c" }}>
                  <div>
                    <span className="text-[12px]" style={{ color: "#e2e8f0" }}>{item.name}</span>
                    <span className="text-[10px] ml-2" style={{ color: "#334155" }}>{item.tsCode}</span>
                  </div>
                  <span className="text-[10px] ml-2 flex-shrink-0" style={{ color: "#94a3b8" }}>{item.reason}</span>
                </div>
              ))}
            {insufficient.length > PAGE_SIZE && (
              <div className="flex justify-center gap-3 mt-3">
                <button disabled={insuffPage === 0}
                  onClick={() => setInsuffPage(p => p - 1)}
                  className="px-3 py-1 rounded-lg text-[12px]"
                  style={{ background: insuffPage === 0 ? "#0d2040" : "#1a2f50", color: insuffPage === 0 ? "#334155" : "#94a3b8" }}>
                  上一页
                </button>
                <span className="text-[12px] self-center" style={{ color: "#475569" }}>
                  {insuffPage + 1} / {Math.ceil(insufficient.length / PAGE_SIZE)}
                </span>
                <button disabled={(insuffPage + 1) * PAGE_SIZE >= insufficient.length}
                  onClick={() => setInsuffPage(p => p + 1)}
                  className="px-3 py-1 rounded-lg text-[12px]"
                  style={{
                    background: (insuffPage + 1) * PAGE_SIZE >= insufficient.length ? "#0d2040" : "#1a2f50",
                    color: (insuffPage + 1) * PAGE_SIZE >= insufficient.length ? "#334155" : "#94a3b8",
                  }}>
                  下一页
                </button>
              </div>
            )}
          </div>
        )
      )}

      {/* 历史扫描 */}
      {tab === "history" && (
        history.length === 0 ? (
          <p className="py-4 text-center text-[12px]" style={{ color: "#475569" }}>暂无历史扫描记录</p>
        ) : (
          <div>
            {history.map((h, i) => (
              <div key={i} className="p-2.5 rounded-xl mb-2"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium" style={{ color: "#e2e8f0" }}>
                      {fmtDate(h.scannedAt)} {h.scannedAt.slice(11, 16)}
                    </span>
                    {h.scanMode && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{
                          background: h.scanMode === "quick_test" ? "rgba(234,179,8,0.1)" : "rgba(0,229,168,0.1)",
                          color: h.scanMode === "quick_test" ? "#eab308" : "#00E5A8",
                        }}>
                        {h.scanMode === "quick_test" ? "测试" : "全市场"}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px]" style={{ color: "#22c55e" }}>候选 {h.stats.candidates}</span>
                </div>
                <div className="flex gap-3 text-[10px]" style={{ color: "#64748b" }}>
                  <span>总数 {h.stats.total?.toLocaleString()}</span>
                  <span>已扫 {h.stats.scannedCount?.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
