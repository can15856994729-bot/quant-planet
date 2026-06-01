"use client";
/**
 * A股 ST 极限反转策略 — 策略详情页
 *
 * 专注于连续跌停 5-50 个板的 ST 股票极限反转机会。
 *
 * ⚠️ 极高风险说明：
 *   连续跌停股票可能继续跌停、停牌、退市或无法卖出。
 *   历史回测不代表未来收益，不构成投资建议。
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle, Play, RefreshCw, ChevronDown, ChevronUp,
  BarChart3, Activity, Shield, BookmarkPlus,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import CandidatePool from "./CandidatePool";
import SingleBacktest from "./SingleBacktest";
import type {
  STExtremeCandidate,
  STExtremeScanResult,
  STExtremeReversalParams,
} from "@/lib/stExtremeReversalService";

// ── 颜色常量 ──────────────────────────────────────────────────────────
const R    = "#EF4444";
const G    = "#00E5A8";
const Y    = "#FACC15";
const B    = "#3B82F6";
const DIM  = "#64748B";
const MID  = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

// ── 常量 ─────────────────────────────────────────────────────────────
const POOL_KEY = "quantplanet_st_extreme_reversal_candidates_v1";

const DEFAULT_PARAMS: STExtremeReversalParams = {
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

type TabKey = "qualified" | "stable" | "vshape" | "both" | "high_risk" | "insufficient";

const TAB_LABELS: Record<TabKey, string> = {
  qualified:    "达标候选",
  stable:       "稳定信号",
  vshape:       "V型反转",
  both:         "两者兼具",
  high_risk:    "高风险排除",
  insufficient: "数据不足",
};

// ── 工具函数 ─────────────────────────────────────────────────────────
function riskLevelColor(level: string): string {
  if (level === "极高") return R;
  if (level === "高")   return "#F97316";
  if (level === "中")   return Y;
  return G;
}

function signalTypeLabel(sig: STExtremeCandidate["signalType"]): string {
  if (sig === "both")                return "稳定+V型";
  if (sig === "v_shape_reversal")    return "V型反转";
  if (sig === "price_stabilization") return "价格稳定";
  return "无信号";
}

function signalTypeColor(sig: STExtremeCandidate["signalType"]): string {
  if (sig === "both")                return G;
  if (sig === "v_shape_reversal")    return B;
  if (sig === "price_stabilization") return Y;
  return DIM;
}

// ── 子组件：候选卡片 ─────────────────────────────────────────────────
function CandidateCard({
  c,
  onAddToPool,
  onBacktest,
}: {
  c: STExtremeCandidate;
  onAddToPool: (c: STExtremeCandidate) => void;
  onBacktest:  (tsCode: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: 10, padding: "12px 14px",
    }}>
      {/* Header row */}
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>{c.name}</span>
          <span style={{ fontSize: 11, color: DIM, marginLeft: 6 }}>{c.symbol}</span>
          <span style={{
            fontSize: 10, marginLeft: 6,
            background: "#1a0a0a", borderRadius: 4, padding: "1px 5px",
            color: R, border: `1px solid ${R}44`,
          }}>{c.stType}</span>
          {c.recentLimitDown && (
            <span style={{
              fontSize: 10, marginLeft: 4,
              background: "#1a0a0a", borderRadius: 4, padding: "1px 5px",
              color: Y,
            }}>近期跌停</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: c.reversalScore >= 60 ? G : Y,
          }}>
            {c.reversalScore}分
          </span>
          {expanded ? <ChevronUp size={14} color={DIM} /> : <ChevronDown size={14} color={DIM} />}
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: MID }}>
          跌停 <span style={{ color: R, fontWeight: 600 }}>{c.limitDownStreak}</span> 板
        </span>
        <span style={{ fontSize: 12, color: MID }}>
          信号 <span style={{ color: signalTypeColor(c.signalType), fontWeight: 600 }}>{signalTypeLabel(c.signalType)}</span>
        </span>
        <span style={{ fontSize: 12, color: MID }}>
          退市风险
          <span style={{ color: riskLevelColor(c.delistingRiskLevel), fontWeight: 600, marginLeft: 4 }}>
            {c.delistingRiskLevel}({c.delistingRiskScore})
          </span>
          {c.delistingDegraded && <span style={{ color: Y, fontSize: 10, marginLeft: 3 }}>[估算]</span>}
        </span>
        {c.currentPrice && (
          <span style={{ fontSize: 12, color: MID }}>
            现价 <span style={{ color: c.currentChangePct !== null && c.currentChangePct >= 0 ? R : G, fontWeight: 600 }}>
              {c.currentPrice.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      {/* Scores bar */}
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: DIM }}>
          稳定:{" "}<span style={{ color: c.stabilizationScore >= 60 ? G : MID }}>{c.stabilizationScore}</span>
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          V型:{" "}<span style={{ color: c.vShapeScore >= 60 ? B : MID }}>{c.vShapeScore}</span>
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          流动性:{" "}<span style={{ color: c.liquidityScore >= 50 ? G : MID }}>{c.liquidityScore}</span>
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          跌停区间: <span style={{ color: "#94A3B8" }}>{c.streakStartDate} ~ {c.streakEndDate}</span>
        </span>
        {c.openedDate && (
          <span style={{ fontSize: 11, color: DIM }}>
            打开日: <span style={{ color: Y }}>{c.openedDate}</span>
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          {/* Buy signal reasons */}
          {c.buySignalReasons.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 11, color: MID, marginBottom: 4 }}>买入依据：</p>
              {c.buySignalReasons.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: G, paddingLeft: 8 }}>✓ {r}</div>
              ))}
            </div>
          )}

          {/* Rebound info */}
          {c.reboundPercent !== null && (
            <div style={{ fontSize: 11, color: MID, marginBottom: 6 }}>
              底部 {c.bottomDate && <span style={{ color: Y }}>{c.bottomDate}</span>} 反弹：
              <span style={{ color: R, fontWeight: 600 }}>
                {(c.reboundPercent * 100).toFixed(1)}%
              </span>
            </div>
          )}

          {/* Warnings */}
          {c.recentNewLow && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <AlertTriangle size={12} color={Y} />
              <span style={{ fontSize: 11, color: Y }}>近3日创新低，下行风险未解除</span>
            </div>
          )}
          {c.recentLimitDown && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <AlertTriangle size={12} color={R} />
              <span style={{ fontSize: 11, color: R }}>近3日有跌停，当前暂不可买入</span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={() => onAddToPool(c)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 12, color: G, background: "transparent",
                border: `1px solid ${G}`, borderRadius: 6,
                padding: "5px 10px", cursor: "pointer",
              }}
            >
              <BookmarkPlus size={12} />
              加入候选池
            </button>
            <button
              onClick={() => onBacktest(c.tsCode, c.name)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 12, color: B, background: "transparent",
                border: `1px solid ${B}`, borderRadius: 6,
                padding: "5px 10px", cursor: "pointer",
              }}
            >
              <BarChart3 size={12} />
              运行回测
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────
export default function STExtremeReversalPage() {
  const [scanning,       setScanning]       = useState(false);
  const [scanResult,     setScanResult]     = useState<STExtremeScanResult | null>(null);
  const [activeTab,      setActiveTab]      = useState<TabKey>("qualified");
  const [showRiskConfirm, setShowRiskConfirm] = useState(false);
  const [params,         setParams]         = useState<STExtremeReversalParams>(DEFAULT_PARAMS);
  const [paramsOpen,     setParamsOpen]     = useState(false);
  const [scanError,      setScanError]      = useState<string | null>(null);
  const [backtestCode,   setBacktestCode]   = useState("");
  const [backtestName,   setBacktestName]   = useState("");
  const [showBacktest,   setShowBacktest]   = useState(false);
  const [poolVersion,    setPoolVersion]    = useState(0); // force re-render pool

  function addToPool(c: STExtremeCandidate) {
    try {
      const raw = localStorage.getItem(POOL_KEY);
      // 兼容旧版（纯数组）和新版（{version, cachedAt, candidates:[]}）两种存储格式
      let existing: STExtremeCandidate[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            existing = parsed;
          } else if (parsed && Array.isArray(parsed.candidates)) {
            existing = parsed.candidates;
          }
        } catch { /* 解析失败则清空重建 */ }
      }
      const filtered = existing.filter(e => e.tsCode !== c.tsCode);
      filtered.unshift(c);
      localStorage.setItem(POOL_KEY, JSON.stringify(filtered));
      setPoolVersion(v => v + 1);
      alert(`已将 ${c.name}(${c.symbol}) 加入候选池`);
    } catch (err) {
      alert(`加入候选池失败：${String(err)}`);
    }
  }

  function openBacktest(tsCode: string, name: string) {
    setBacktestCode(tsCode);
    setBacktestName(name);
    setShowBacktest(true);
    setTimeout(() => {
      document.getElementById("single-backtest-section")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  async function doScan() {
    setShowRiskConfirm(false);
    setScanning(true);
    setScanError(null);
    setScanResult(null);

    try {
      const qp = new URLSearchParams({
        minStreak: String(params.minLimitDownStreak),
        maxStreak: String(params.maxLimitDownStreak),
        maxDelistingRisk: String(params.maxDelistingRiskScore),
        enableStabilization: String(params.enableStabilization),
        enableVShape: String(params.enableVShape),
      });
      const res = await fetch(`/api/tushare/st-extreme-reversal-scan?${qp.toString()}`);
      const data = await res.json() as STExtremeScanResult;

      if (!data.ok) {
        setScanError(data.error ?? "扫描失败");
      } else {
        setScanResult(data);
        setActiveTab("qualified");
      }
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : "网络请求失败");
    } finally {
      setScanning(false);
    }
  }

  // Tab data
  function getTabData(tab: TabKey) {
    if (!scanResult) return [];
    switch (tab) {
      case "qualified":    return scanResult.categories.qualified;
      case "stable":       return scanResult.categories.stabilizationOnly;
      case "vshape":       return scanResult.categories.vShapeOnly;
      case "both":         return scanResult.categories.both;
      case "high_risk":    return []; // special handling below
      case "insufficient": return []; // special handling below
    }
  }

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="ST 极限反转策略" />

      {/* ── 风险警告横幅 ─────────────────────────────────────────────── */}
      <div style={{
        background: "#1a0a0a",
        border: `1px solid ${R}`,
        borderRadius: 10,
        margin: "12px 16px 0",
        padding: "12px 14px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}>
        <AlertTriangle size={18} color={R} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: R, marginBottom: 4 }}>
            ⚠️ 极高风险策略 — 请在继续前仔细阅读
          </p>
          <p style={{ fontSize: 12, color: "#FCA5A5", lineHeight: 1.6 }}>
            ST 极限反转策略属于高风险策略，连续跌停股票可能继续跌停、停牌、退市或无法卖出。
            历史回测不代表未来收益，不构成投资建议。
            本策略仅供学习研究和模拟交易使用，任何实际投资损失由投资者自行承担。
          </p>
        </div>
      </div>

      {/* ── 策略描述 ──────────────────────────────────────────────────── */}
      <div style={{ margin: "12px 16px 0", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Activity size={16} color={G} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>策略说明</span>
        </div>
        <p style={{ fontSize: 12, color: MID, lineHeight: 1.7 }}>
          本策略专注于 A股 ST/＊ST 股票在连续跌停（5-50 个跌停板）后的极端困境反转机会。
          通过检测：①跌停板打开后的价格稳定信号；②V型反转形态；③量能恢复情况；
          过滤掉高退市风险标的后，生成潜在的短线反弹候选。
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {["连续跌停检测", "V型反转", "股价稳定", "退市风险过滤", "量能恢复"].map(tag => (
            <span key={tag} style={{
              fontSize: 10, background: "#0d1f3c",
              border: `1px solid ${BORDER}`, borderRadius: 4,
              padding: "2px 7px", color: MID,
            }}>{tag}</span>
          ))}
        </div>
      </div>

      {/* ── 参数面板（可折叠）────────────────────────────────────────── */}
      <div style={{ margin: "12px 16px 0", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
        <button
          onClick={() => setParamsOpen(!paramsOpen)}
          style={{
            width: "100%", background: "transparent", border: "none",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 14px", cursor: "pointer", color: MID,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>
            策略参数
          </span>
          {paramsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {paramsOpen && (
          <div style={{ padding: "0 14px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {/* minLimitDownStreak */}
              <div>
                <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 3 }}>
                  最少连续跌停数
                </label>
                <input
                  type="number" value={params.minLimitDownStreak} min={3} max={20}
                  onChange={e => setParams(p => ({ ...p, minLimitDownStreak: Number(e.target.value) }))}
                  style={{
                    width: "100%", background: "#07111F", border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {/* maxDelistingRiskScore */}
              <div>
                <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 3 }}>
                  最大退市风险分（0-100）
                </label>
                <input
                  type="number" value={params.maxDelistingRiskScore} min={10} max={80}
                  onChange={e => setParams(p => ({ ...p, maxDelistingRiskScore: Number(e.target.value) }))}
                  style={{
                    width: "100%", background: "#07111F", border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {/* enableStabilization */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox" checked={params.enableStabilization}
                  onChange={e => setParams(p => ({ ...p, enableStabilization: e.target.checked }))}
                  style={{ cursor: "pointer" }}
                />
                <label style={{ fontSize: 12, color: MID }}>启用价格稳定信号</label>
              </div>
              {/* enableVShape */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox" checked={params.enableVShape}
                  onChange={e => setParams(p => ({ ...p, enableVShape: e.target.checked }))}
                  style={{ cursor: "pointer" }}
                />
                <label style={{ fontSize: 12, color: MID }}>启用V型反转信号</label>
              </div>
              {/* vShapeMinRebound */}
              <div>
                <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 3 }}>
                  V型最小反弹幅度（%）
                </label>
                <input
                  type="number" value={params.vShapeMinRebound * 100} min={3} max={30} step={0.5}
                  onChange={e => setParams(p => ({ ...p, vShapeMinRebound: Number(e.target.value) / 100 }))}
                  style={{
                    width: "100%", background: "#07111F", border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {/* maxPositionRatio */}
              <div>
                <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 3 }}>
                  单只最大仓位（%）
                </label>
                <input
                  type="number" value={params.maxPositionRatio * 100} min={0.5} max={10} step={0.5}
                  onChange={e => setParams(p => ({ ...p, maxPositionRatio: Number(e.target.value) / 100 }))}
                  style={{
                    width: "100%", background: "#07111F", border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Reset */}
            <button
              onClick={() => setParams(DEFAULT_PARAMS)}
              style={{
                marginTop: 10, fontSize: 11, color: DIM,
                background: "transparent", border: `1px solid ${BORDER}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              }}
            >
              恢复默认参数
            </button>
          </div>
        )}
      </div>

      {/* ── 扫描按钮 ──────────────────────────────────────────────────── */}
      <div style={{ margin: "12px 16px 0" }}>
        <button
          onClick={() => setShowRiskConfirm(true)}
          disabled={scanning}
          style={{
            width: "100%",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "14px", borderRadius: 10, border: "none",
            background: scanning ? "#1a2f50" : R,
            color: scanning ? MID : "#FFFFFF",
            fontWeight: 700, fontSize: 15, cursor: scanning ? "not-allowed" : "pointer",
          }}
        >
          {scanning ? <RefreshCw size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={18} />}
          {scanning ? "扫描中，请耐心等待…" : "开始扫描 ST 极限反转候选"}
        </button>
        {scanning && (
          <p style={{ textAlign: "center", color: Y, fontSize: 12, marginTop: 8 }}>
            ⏳ 正在逐只获取 K 线数据并分析，可能需要 1-3 分钟…
          </p>
        )}
      </div>

      {/* ── 风险确认弹窗 ──────────────────────────────────────────────── */}
      {showRiskConfirm && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 20px",
        }}>
          <div style={{
            background: "#0d1f3c", border: `1px solid ${R}`,
            borderRadius: 12, padding: "20px", maxWidth: 380, width: "100%",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={20} color={R} />
              <span style={{ fontSize: 16, fontWeight: 700, color: R }}>风险确认</span>
            </div>
            <p style={{ fontSize: 13, color: MID, lineHeight: 1.7, marginBottom: 16 }}>
              您即将运行高风险策略扫描。ST 极限反转策略存在：
            </p>
            <ul style={{ fontSize: 12, color: "#FCA5A5", paddingLeft: 16, lineHeight: 1.8, marginBottom: 16 }}>
              <li>连续跌停股票可能继续跌停无法卖出</li>
              <li>公司可能停牌或退市导致本金全损</li>
              <li>历史回测不代表未来表现</li>
              <li>仅适用于研究学习，不构成投资建议</li>
            </ul>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowRiskConfirm(false)}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8,
                  background: "transparent", border: `1px solid ${BORDER}`,
                  color: MID, fontSize: 13, cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                onClick={doScan}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8,
                  background: R, border: "none",
                  color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                我已了解风险，继续扫描
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 扫描错误 ────────────────────────────────────────────────── */}
      {scanError && (
        <div style={{
          margin: "12px 16px 0",
          background: "#1a0a0a", border: `1px solid ${R}`,
          borderRadius: 8, padding: "10px 14px", color: R, fontSize: 13,
        }}>
          <AlertTriangle size={14} style={{ display: "inline", marginRight: 6 }} />
          {scanError}
        </div>
      )}

      {/* ── 扫描结果 ────────────────────────────────────────────────── */}
      {scanResult && (
        <div style={{ margin: "12px 16px 0" }}>
          {/* Stats row */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8, marginBottom: 12,
          }}>
            {[
              { label: "ST 股总数", value: scanResult.totalST },
              { label: "已扫描", value: scanResult.scannedCount },
              { label: "候选数量", value: scanResult.candidateCount, color: G },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "10px 12px", textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: DIM, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: color ?? "#F1F5F9" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12 }}>
            {(Object.keys(TAB_LABELS) as TabKey[]).map(tab => {
              const isActive = tab === activeTab;
              let count = 0;
              if (tab === "qualified")    count = scanResult.categories.qualified.length;
              if (tab === "stable")       count = scanResult.categories.stabilizationOnly.length;
              if (tab === "vshape")       count = scanResult.categories.vShapeOnly.length;
              if (tab === "both")         count = scanResult.categories.both.length;
              if (tab === "high_risk")    count = scanResult.categories.highRisk.length;
              if (tab === "insufficient") count = scanResult.categories.insufficient.length;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flexShrink: 0, padding: "6px 12px",
                    borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: isActive ? (tab === "high_risk" || tab === "insufficient" ? R : G) : CARD,
                    color: isActive ? (tab === "high_risk" || tab === "insufficient" ? "#FFF" : "#07111F") : MID,
                    border: `1px solid ${isActive ? "transparent" : BORDER}`,
                    cursor: "pointer",
                  }}
                >
                  {TAB_LABELS[tab]} ({count})
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div>
            {/* Candidate tabs */}
            {(activeTab === "qualified" || activeTab === "stable" || activeTab === "vshape" || activeTab === "both") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(getTabData(activeTab) as STExtremeCandidate[]).length === 0 ? (
                  <div style={{
                    background: CARD, border: `1px solid ${BORDER}`,
                    borderRadius: 10, padding: "24px", textAlign: "center",
                    color: DIM, fontSize: 13,
                  }}>
                    该分类暂无候选股票
                  </div>
                ) : (
                  (getTabData(activeTab) as STExtremeCandidate[]).map(c => (
                    <CandidateCard
                      key={c.tsCode}
                      c={c}
                      onAddToPool={addToPool}
                      onBacktest={openBacktest}
                    />
                  ))
                )}
              </div>
            )}

            {/* High risk tab */}
            {activeTab === "high_risk" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {scanResult.categories.highRisk.length === 0 ? (
                  <div style={{
                    background: CARD, border: `1px solid ${BORDER}`,
                    borderRadius: 10, padding: "24px", textAlign: "center",
                    color: DIM, fontSize: 13,
                  }}>
                    无高风险排除股票
                  </div>
                ) : (
                  scanResult.categories.highRisk.map((item, i) => (
                    <div key={i} style={{
                      background: CARD, border: `1px solid ${BORDER}`,
                      borderRadius: 8, padding: "10px 14px",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{item.name}</span>
                        <Shield size={14} color={R} />
                      </div>
                      <p style={{ fontSize: 11, color: R, marginTop: 4 }}>排除原因：{item.reason}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Insufficient data tab */}
            {activeTab === "insufficient" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {scanResult.categories.insufficient.length === 0 ? (
                  <div style={{
                    background: CARD, border: `1px solid ${BORDER}`,
                    borderRadius: 10, padding: "24px", textAlign: "center",
                    color: DIM, fontSize: 13,
                  }}>
                    无数据不足排除股票
                  </div>
                ) : (
                  scanResult.categories.insufficient.map((item, i) => (
                    <div key={i} style={{
                      background: CARD, border: `1px solid ${BORDER}`,
                      borderRadius: 8, padding: "10px 14px",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{item.name}</span>
                      <p style={{ fontSize: 11, color: DIM, marginTop: 4 }}>原因：{item.reason}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 候选池 ────────────────────────────────────────────────────── */}
      <div style={{ margin: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <BookmarkPlus size={16} color={G} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>我的候选池</span>
        </div>
        <CandidatePool
          key={poolVersion}
          onSelectForBacktest={openBacktest}
        />
      </div>

      {/* ── 单股回测 ─────────────────────────────────────────────────── */}
      <div id="single-backtest-section" style={{ margin: "16px 16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart3 size={16} color={B} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>单股回测</span>
          </div>
          {!showBacktest && (
            <button
              onClick={() => setShowBacktest(true)}
              style={{
                fontSize: 12, color: B, background: "transparent",
                border: `1px solid ${B}`, borderRadius: 6,
                padding: "4px 10px", cursor: "pointer",
              }}
            >
              展开
            </button>
          )}
          {showBacktest && (
            <button
              onClick={() => setShowBacktest(false)}
              style={{
                fontSize: 12, color: DIM, background: "transparent",
                border: `1px solid ${BORDER}`, borderRadius: 6,
                padding: "4px 10px", cursor: "pointer",
              }}
            >
              收起
            </button>
          )}
        </div>

        {showBacktest && (
          <SingleBacktest
            key={backtestCode}
            initialTsCode={backtestCode}
            initialName={backtestName}
          />
        )}
      </div>
    </div>
  );
}
