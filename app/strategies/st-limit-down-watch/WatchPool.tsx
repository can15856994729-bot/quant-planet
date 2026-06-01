"use client";
/**
 * WatchPool.tsx — 连续跌停观察池
 *
 * 重要：观察池股票当前状态固定为「观察中，暂不买入」，不产生任何买入信号。
 */

import { useState, useEffect } from "react";
import { RefreshCw, AlertTriangle, Eye, ChevronDown, ChevronUp, Trash2, Clock } from "lucide-react";
import type { STWatchCandidate, STLimitDownWatchParams, STLimitDownWatchScanResult } from "@/lib/stLimitDownWatchService";

const POOL_KEY    = "quantplanet_st_limit_down_watch_pool_v1";
const HISTORY_KEY = "quantplanet_st_limit_down_watch_scan_history_v1";
const MAX_HISTORY = 8;

// ── localStorage 工具 ─────────────────────────────────────────────────────────

function loadPool(): STWatchCandidate[] {
  try {
    const raw = localStorage.getItem(POOL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function savePool(pool: STWatchCandidate[]): void {
  try { localStorage.setItem(POOL_KEY, JSON.stringify(pool)); } catch { /**/ }
}

function loadHistory(): { id: string; date: string; stats: STLimitDownWatchScanResult["stats"] }[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function appendHistory(result: STLimitDownWatchScanResult): void {
  try {
    const hist = loadHistory();
    hist.unshift({ id: `scan_${Date.now()}`, date: result.scannedAt, stats: result.stats });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, MAX_HISTORY)));
  } catch { /**/ }
}

// ── 颜色工具 ─────────────────────────────────────────────────────────────────

function watchLevelColor(level: string): string {
  if (level === "high")   return "#EF4444";
  if (level === "medium") return "#F59E0B";
  return "#64748B";
}

function riskColor(level: string): string {
  if (level === "极高") return "#FF0000";
  if (level === "高")   return "#EF4444";
  if (level === "中")   return "#F59E0B";
  return "#00E5A8";
}

// ── 候选卡片 ─────────────────────────────────────────────────────────────────

function CandidateCard({
  c, onRemove,
}: {
  c: STWatchCandidate;
  onRemove: (tsCode: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 12, marginBottom: 10 }}>
      {/* 摘要行 */}
      <div className="flex items-start gap-3 p-3" onClick={() => setExpanded(v => !v)} style={{ cursor: "pointer" }}>
        <div className="flex-shrink-0 w-1 self-stretch rounded-full"
          style={{ background: watchLevelColor(c.watchLevel) }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-[14px]" style={{ color: "#F8FAFC" }}>{c.name}</span>
            <span className="text-[11px]" style={{ color: "#64748B" }}>{c.symbol}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}>
              {c.stType}
            </span>
            {/* ⚠️ 固定显示观察中，不能显示买入 */}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(100,116,139,0.15)", color: "#94A3B8", border: "1px solid #1a2f50" }}>
              👁 观察中，暂不买入
            </span>
          </div>
          <div className="flex gap-3 flex-wrap">
            <span className="text-[11px]" style={{ color: "#94A3B8" }}>
              连跌 <span style={{ color: "#EF4444", fontWeight: 700 }}>{c.limitDownStreak}</span> 板
            </span>
            <span className="text-[11px]" style={{ color: "#94A3B8" }}>
              最近 <span style={{ color: "#F8FAFC" }}>{c.latestLimitDownDate}</span>
            </span>
            {c.isStillLimitDown && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}>
                ⚠ 仍在跌停
              </span>
            )}
            <span className="text-[11px]" style={{ color: "#94A3B8" }}>
              现价 <span style={{ color: c.latestChangePct >= 0 ? "#EF4444" : "#00E5A8", fontWeight: 700 }}>
                {c.latestClose.toFixed(2)}
              </span>
            </span>
          </div>
        </div>

        {/* 未见底分 */}
        <div className="flex-shrink-0 text-center">
          <p className="font-black text-[18px] num" style={{ color: watchLevelColor(c.watchLevel) }}>
            {c.notBottomedScore}
          </p>
          <p className="text-[10px]" style={{ color: "#64748B" }}>未见底</p>
        </div>

        <div className="flex-shrink-0 self-center" style={{ color: "#64748B" }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3" style={{ borderTop: "1px solid #1a2f50" }}>
          {/* 评分栏 */}
          <div className="grid grid-cols-2 gap-2 pt-3">
            {[
              { label: "退市风险", value: c.delistingRiskScore, suffix: `（${c.delistingRiskLevel}）`, color: riskColor(c.delistingRiskLevel) },
              { label: "重组预期", value: c.restructuringExpectationScore, color: "#3B82F6" },
              { label: "财务修复", value: c.financialRepairScore, color: "#8B5CF6" },
              { label: "现金流改善", value: c.cashflowImprovementScore, color: "#00E5A8" },
            ].map(item => (
              <div key={item.label} className="p-2 rounded-xl" style={{ background: "#0a1628" }}>
                <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>{item.label}</p>
                <p className="font-black text-[16px] num" style={{ color: item.color }}>
                  {item.value}<span className="text-[10px] font-normal">{item.suffix ?? ""}</span>
                </p>
                <div className="w-full h-1 rounded-full mt-1" style={{ background: "#1a2f50" }}>
                  <div className="h-1 rounded-full" style={{ width: `${item.value}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* 公告降级提示 */}
          {c.degraded && (
            <div className="p-2 rounded-xl text-[11px]"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <span style={{ color: "#F59E0B" }}>⚠ </span>
              <span style={{ color: "#94A3B8" }}>公告数据暂缺，重组预期仅基于财报修复迹象降级判断。</span>
            </div>
          )}

          {/* 未见底原因 */}
          {c.reasons.length > 0 && (
            <div className="p-2 rounded-xl" style={{ background: "#0a1628" }}>
              <p className="text-[10px] font-bold mb-1.5" style={{ color: "#94A3B8" }}>未见底原因</p>
              {c.reasons.slice(0, 4).map((r, i) => (
                <p key={i} className="text-[10px]" style={{ color: "#64748B" }}>· {r}</p>
              ))}
            </div>
          )}

          {/* 下一步等待条件 */}
          {c.nextTriggerConditions.length > 0 && (
            <div className="p-2 rounded-xl"
              style={{ background: "rgba(0,229,168,0.05)", border: "1px solid rgba(0,229,168,0.15)" }}>
              <p className="text-[10px] font-bold mb-1.5" style={{ color: "#00E5A8" }}>
                等待触发条件（满足后才可能转入买入候选）
              </p>
              {c.nextTriggerConditions.slice(0, 5).map((t, i) => (
                <p key={i} className="text-[10px]" style={{ color: "#64748B" }}>· {t}</p>
              ))}
            </div>
          )}

          {/* 入池时间 + 操作 */}
          <div className="flex items-center justify-between">
            <p className="text-[10px]" style={{ color: "#475569" }}>
              <Clock size={10} className="inline mr-1" />
              入池 {new Date(c.addedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
            <button
              onClick={e => { e.stopPropagation(); onRemove(c.tsCode); }}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg"
              style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <Trash2 size={11} />
              移除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

interface Props {
  params: STLimitDownWatchParams;
}

type TabId = "pool" | "high_risk" | "insufficient" | "history";

export default function WatchPool({ params }: Props) {
  const [tab, setTab]                   = useState<TabId>("pool");
  const [pool, setPool]                 = useState<STWatchCandidate[]>([]);
  const [highRisk, setHighRisk]         = useState<STLimitDownWatchScanResult["highRiskExcluded"]>([]);
  const [insufficient, setInsufficient] = useState<STLimitDownWatchScanResult["insufficientData"]>([]);
  const [history, setHistory]           = useState<ReturnType<typeof loadHistory>>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [lastScanStats, setLastScanStats] = useState<STLimitDownWatchScanResult["stats"] | null>(null);

  useEffect(() => {
    setPool(loadPool());
    setHistory(loadHistory());
  }, []);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/strategies/st-limit-down-watch/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params, concurrency: 4 }),
      });
      const data: STLimitDownWatchScanResult = await res.json();
      if (!data.ok) throw new Error(data.error ?? "扫描失败");

      // 合并观察池（不重复，保留已有入池时间）
      const existingPool = loadPool();
      const map = new Map<string, STWatchCandidate>();
      for (const c of existingPool) map.set(c.tsCode, c);
      for (const c of data.watchPool) {
        const existing = map.get(c.tsCode);
        map.set(c.tsCode, {
          ...c,
          addedAt: existing?.addedAt ?? c.addedAt,
          lastScannedAt: c.lastScannedAt,
        });
      }
      const newPool = Array.from(map.values()).sort((a, b) => b.notBottomedScore - a.notBottomedScore);

      setPool(newPool);
      savePool(newPool);
      setHighRisk(data.highRiskExcluded);
      setInsufficient(data.insufficientData);
      setLastScanStats(data.stats);
      appendHistory(data);
      setHistory(loadHistory());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (tsCode: string) => {
    const newPool = pool.filter(c => c.tsCode !== tsCode);
    setPool(newPool);
    savePool(newPool);
  };

  const handleClearPool = () => {
    setPool([]);
    savePool([]);
  };

  const TABS: { id: TabId; label: string; count?: number }[] = [
    { id: "pool",        label: "观察池",   count: pool.length },
    { id: "high_risk",   label: "高风险剔除", count: highRisk.length },
    { id: "insufficient",label: "数据不足",  count: insufficient.length },
    { id: "history",     label: "历史扫描",  count: history.length },
  ];

  return (
    <div>
      {/* 扫描按钮 */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={handleScan}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold"
          style={{
            background: loading ? "rgba(0,229,168,0.06)" : "rgba(0,229,168,0.12)",
            color: loading ? "#64748B" : "#00E5A8",
            border: "1px solid rgba(0,229,168,0.25)",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "扫描中…" : "扫描 ST 全市场"}
        </button>
        {pool.length > 0 && (
          <button onClick={handleClearPool}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px]"
            style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
            <Trash2 size={12} />清空
          </button>
        )}
      </div>

      {/* 扫描统计 */}
      {lastScanStats && (
        <div className="mb-3 p-2.5 rounded-xl text-[11px] grid grid-cols-4 gap-2"
          style={{ background: "rgba(0,229,168,0.06)", border: "1px solid rgba(0,229,168,0.15)" }}>
          <div className="text-center">
            <p className="font-bold" style={{ color: "#F8FAFC" }}>{lastScanStats.totalSTScanned}</p>
            <p style={{ color: "#64748B" }}>扫描ST</p>
          </div>
          <div className="text-center">
            <p className="font-bold" style={{ color: "#F59E0B" }}>{lastScanStats.inRange}</p>
            <p style={{ color: "#64748B" }}>5-50板</p>
          </div>
          <div className="text-center">
            <p className="font-bold" style={{ color: "#00E5A8" }}>{lastScanStats.watchPoolCount}</p>
            <p style={{ color: "#64748B" }}>入观察池</p>
          </div>
          <div className="text-center">
            <p className="font-bold" style={{ color: "#EF4444" }}>{lastScanStats.highRiskCount}</p>
            <p style={{ color: "#64748B" }}>高风险剔除</p>
          </div>
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="mb-3 p-3 rounded-xl flex items-start gap-2"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle size={14} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-[12px]" style={{ color: "#EF4444" }}>{error}</p>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {TABS.map(t => {
          const active = t.id === tab;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold"
              style={{
                background: active ? "#00E5A8" : "#0d1f3c",
                color: active ? "#07111F" : "#64748B",
                border: `1px solid ${active ? "#00E5A8" : "#1a2f50"}`,
              }}>
              {t.label}{t.count != null && t.count > 0 ? ` (${t.count})` : ""}
            </button>
          );
        })}
      </div>

      {/* 观察池 */}
      {tab === "pool" && (
        pool.length > 0 ? (
          <>
            <p className="text-[12px] mb-3" style={{ color: "#64748B" }}>
              共 <span style={{ color: "#F8FAFC", fontWeight: 700 }}>{pool.length}</span> 只（按未见底评分排序）
            </p>
            {pool.map(c => <CandidateCard key={c.tsCode} c={c} onRemove={handleRemove} />)}
          </>
        ) : (
          <div className="py-12 text-center">
            <Eye size={32} color="#1a2f50" className="mx-auto mb-3" />
            <p className="text-[13px]" style={{ color: "#64748B" }}>观察池为空</p>
            <p className="text-[11px] mt-1" style={{ color: "#475569" }}>点击「扫描 ST 全市场」开始检测</p>
          </div>
        )
      )}

      {/* 高风险剔除 */}
      {tab === "high_risk" && (
        highRisk.length > 0 ? (
          <div className="space-y-2">
            {highRisk.map((r, i) => (
              <div key={i} className="p-3 rounded-xl"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{r.name}</span>
                  <span className="text-[11px]" style={{ color: "#64748B" }}>{r.symbol}</span>
                  <span className="text-[10px] ml-auto" style={{ color: "#EF4444" }}>
                    退市分 {r.delistingRiskScore}
                  </span>
                </div>
                <p className="text-[11px]" style={{ color: "#94A3B8" }}>{r.reason}</p>
                <p className="text-[10px] mt-1" style={{ color: "#64748B" }}>
                  连续跌停 {r.limitDownStreak} 次
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-8 text-[13px]" style={{ color: "#64748B" }}>暂无高风险剔除记录</p>
        )
      )}

      {/* 数据不足 */}
      {tab === "insufficient" && (
        insufficient.length > 0 ? (
          <div className="space-y-2">
            {insufficient.map((r, i) => (
              <div key={i} className="p-3 rounded-xl"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{r.name}</span>
                  <span className="text-[11px]" style={{ color: "#64748B" }}>{r.symbol}</span>
                </div>
                <p className="text-[11px] mt-1" style={{ color: "#94A3B8" }}>{r.reason}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-8 text-[13px]" style={{ color: "#64748B" }}>暂无数据不足记录</p>
        )
      )}

      {/* 历史扫描 */}
      {tab === "history" && (
        history.length > 0 ? (
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="p-3 rounded-xl"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <p className="text-[11px] font-bold mb-1" style={{ color: "#F8FAFC" }}>
                  {new Date(h.date).toLocaleString("zh-CN")}
                </p>
                <div className="flex gap-3 text-[11px]" style={{ color: "#64748B" }}>
                  <span>扫描 <b style={{ color: "#F8FAFC" }}>{h.stats.totalSTScanned}</b></span>
                  <span>入池 <b style={{ color: "#00E5A8" }}>{h.stats.watchPoolCount}</b></span>
                  <span>剔除 <b style={{ color: "#EF4444" }}>{h.stats.highRiskCount}</b></span>
                  <span>最高 <b style={{ color: "#F59E0B" }}>{h.stats.maxLimitDownStreak}</b> 板</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-8 text-[13px]" style={{ color: "#64748B" }}>暂无历史扫描记录</p>
        )
      )}
    </div>
  );
}
