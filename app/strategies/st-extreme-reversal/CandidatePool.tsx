"use client";
/**
 * CandidatePool.tsx — ST 极限反转候选池（localStorage 持久化）
 *
 * 展示从 localStorage 读取的候选股票，支持删除、清空和模拟交易添加。
 */

import { useState, useEffect } from "react";
import { Trash2, BookmarkX, AlertTriangle } from "lucide-react";
import type { STExtremeCandidate } from "@/lib/stExtremeReversalService";

// ── 常量 ─────────────────────────────────────────────────────────────
const POOL_KEY = "quantplanet_st_extreme_reversal_candidates_v1";

const R    = "#EF4444";
const G    = "#00E5A8";
const Y    = "#FACC15";
const DIM  = "#64748B";
const MID  = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

// ── 工具函数 ──────────────────────────────────────────────────────────
function riskLevelColor(level: string): string {
  if (level === "极高") return R;
  if (level === "高")   return "#F97316";
  if (level === "中")   return Y;
  return G;
}

function signalLabel(sig: STExtremeCandidate["signalType"]): string {
  if (sig === "both")               return "稳定+V型";
  if (sig === "v_shape_reversal")   return "V型反转";
  if (sig === "price_stabilization") return "价格稳定";
  return "无";
}

// ── 组件 ─────────────────────────────────────────────────────────────
interface Props {
  onSelectForBacktest?: (tsCode: string, name: string) => void;
}

export default function CandidatePool({ onSelectForBacktest }: Props) {
  const [pool, setPool] = useState<STExtremeCandidate[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POOL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as STExtremeCandidate[];
        setPool(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setPool([]);
    }
    setLoaded(true);
  }, []);

  function savePool(newPool: STExtremeCandidate[]) {
    setPool(newPool);
    try {
      localStorage.setItem(POOL_KEY, JSON.stringify(newPool));
    } catch {
      // ignore storage errors
    }
  }

  function removeCandidate(tsCode: string) {
    savePool(pool.filter(c => c.tsCode !== tsCode));
  }

  function clearAll() {
    savePool([]);
  }

  if (!loaded) {
    return (
      <div style={{ padding: "12px 0", color: MID, fontSize: 13 }}>加载中…</div>
    );
  }

  if (pool.length === 0) {
    return (
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 10, padding: "20px 16px",
        textAlign: "center", color: DIM, fontSize: 13,
      }}>
        <BookmarkX size={24} style={{ margin: "0 auto 8px", color: DIM }} />
        候选池为空。扫描后点击候选股票旁的「加入候选池」添加。
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: MID }}>
          候选池共 <span style={{ color: G, fontWeight: 700 }}>{pool.length}</span> 只股票
        </p>
        <button
          onClick={clearAll}
          style={{
            fontSize: 12, color: R, background: "transparent",
            border: `1px solid ${R}`, borderRadius: 6,
            padding: "4px 10px", cursor: "pointer",
          }}
        >
          清空全部
        </button>
      </div>

      {/* Candidate list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pool.map(c => (
          <div key={c.tsCode} style={{
            background: CARD, border: `1px solid ${BORDER}`,
            borderRadius: 10, padding: "12px 14px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              {/* Left: name & code */}
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{c.name}</span>
                <span style={{ fontSize: 11, color: DIM, marginLeft: 6 }}>{c.symbol}</span>
                <span style={{
                  fontSize: 10, marginLeft: 6,
                  background: "#1a2f50", borderRadius: 4, padding: "1px 5px",
                  color: R,
                }}>{c.stType}</span>
              </div>

              {/* Right: remove button */}
              <button
                onClick={() => removeCandidate(c.tsCode)}
                style={{
                  background: "transparent", border: "none",
                  color: DIM, cursor: "pointer", padding: 4,
                }}
                title="从候选池移除"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Metrics row */}
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: MID }}>
                跌停 <span style={{ color: R, fontWeight: 600 }}>{c.limitDownStreak}</span> 板
              </span>
              <span style={{ fontSize: 12, color: MID }}>
                反转分 <span style={{ color: G, fontWeight: 600 }}>{c.reversalScore}</span>
              </span>
              <span style={{ fontSize: 12, color: MID }}>
                风险
                <span style={{ color: riskLevelColor(c.delistingRiskLevel), fontWeight: 600, marginLeft: 4 }}>
                  {c.delistingRiskLevel}({c.delistingRiskScore})
                </span>
              </span>
              <span style={{ fontSize: 12, color: MID }}>
                信号 <span style={{ color: Y, fontWeight: 600 }}>{signalLabel(c.signalType)}</span>
              </span>
            </div>

            {/* Dates */}
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: DIM }}>
                跌停区间：{c.streakStartDate} ~ {c.streakEndDate}
              </span>
              {c.openedDate && (
                <span style={{ fontSize: 11, color: DIM }}>
                  打开日：{c.openedDate}
                </span>
              )}
            </div>

            {/* Warning if recent limit down */}
            {c.recentLimitDown && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                <AlertTriangle size={12} color={Y} />
                <span style={{ fontSize: 11, color: Y }}>近3日有跌停，暂不可买入</span>
              </div>
            )}

            {/* Action buttons */}
            {onSelectForBacktest && (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button
                  onClick={() => onSelectForBacktest(c.tsCode, c.name)}
                  style={{
                    fontSize: 12, color: G,
                    background: "transparent",
                    border: `1px solid ${G}`, borderRadius: 6,
                    padding: "4px 10px", cursor: "pointer",
                  }}
                >
                  运行单股回测
                </button>
                <button
                  style={{
                    fontSize: 12, color: DIM,
                    background: "transparent",
                    border: `1px solid ${BORDER}`, borderRadius: 6,
                    padding: "4px 10px", cursor: "not-allowed",
                    opacity: 0.6,
                  }}
                  disabled
                  title="模拟交易功能开发中"
                >
                  加入模拟观察
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
