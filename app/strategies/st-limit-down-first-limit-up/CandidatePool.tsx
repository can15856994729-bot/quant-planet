"use client";
/**
 * CandidatePool.tsx — 首板买入候选池（含历史扫描 + 一字涨停 + 高风险 + 数据不足）
 *
 * Tab 1: 首板买入候选
 * Tab 2: 一字涨停观察
 * Tab 3: 高风险剔除
 * Tab 4: 数据不足
 * Tab 5: 历史扫描
 */

import { useState, useEffect } from "react";
import {
  Play, RefreshCw, AlertTriangle, ChevronDown, ChevronUp,
  Eye, TrendingUp, BookmarkPlus, Trash2,
} from "lucide-react";
import type {
  STFirstLimitUpCandidate,
  STFirstLimitUpScanResult,
  STFirstLimitUpParams,
} from "@/lib/stLimitDownFirstLimitUpService";

// ── 颜色常量 ────────────────────────────────────────────────────
const R    = "#EF4444";
const G    = "#00E5A8";
const Y    = "#FACC15";
const B    = "#3B82F6";
const DIM  = "#64748B";
const MID  = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

const CANDIDATES_KEY   = "quantplanet_st_first_limit_up_candidates_v1";
const ONE_WORD_KEY     = "quantplanet_st_first_limit_up_watch_v1";
const SCAN_HISTORY_KEY = "quantplanet_st_first_limit_up_scan_history_v1";

type SubTab = "candidates" | "oneword" | "highrisk" | "insufficient" | "history";

interface ScanHistoryEntry {
  scannedAt:     string;
  candidatesCount: number;
  oneWordCount:  number;
  highRiskCount: number;
  totalScanned:  number;
}

// ── 分数条 ───────────────────────────────────────────────────────
function ScoreBar({ score, max = 100, color }: { score: number; max?: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 4, background: "#0a1628", borderRadius: 2 }}>
      <div style={{
        width: `${Math.min(100, (score / max) * 100)}%`,
        height: "100%", borderRadius: 2,
        background: color,
      }} />
    </div>
  );
}

// ── 候选卡片 ──────────────────────────────────────────────────────
function CandidateCard({
  c, onRemove,
}: {
  c: STFirstLimitUpCandidate;
  onRemove: (tsCode: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOneWord = c.isOneWordLimitUp;
  const statusColor = c.currentStatus === "首板买入候选" ? G : Y;

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
      {/* 顶部行 */}
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}
      >
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>{c.name}</span>
          <span style={{ fontSize: 11, color: DIM, marginLeft: 6 }}>{c.symbol}</span>
          <span style={{
            fontSize: 10, marginLeft: 6, background: "#1a0a0a",
            borderRadius: 4, padding: "1px 5px", color: R, border: `1px solid ${R}44`,
          }}>{c.stType}</span>
          <span style={{
            fontSize: 10, marginLeft: 4, background: "rgba(0,0,0,0.3)",
            borderRadius: 4, padding: "1px 5px",
            color: statusColor, border: `1px solid ${statusColor}44`,
          }}>
            {isOneWord ? "🔒 一字涨停" : "🚀 首板"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: c.firstLimitUpStrengthScore >= 60 ? G : Y }}>
            {c.firstLimitUpStrengthScore}分
          </span>
          {expanded ? <ChevronUp size={14} color={DIM} /> : <ChevronDown size={14} color={DIM} />}
        </div>
      </div>

      {/* 关键指标行 */}
      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: MID }}>
          跌停 <span style={{ color: R, fontWeight: 600 }}>{c.limitDownStreak}</span> 板
        </span>
        <span style={{ fontSize: 12, color: MID }}>
          首板 <span style={{ color: G, fontWeight: 600 }}>{c.firstLimitUpDate}</span>
        </span>
        <span style={{ fontSize: 12, color: MID }}>
          类型 <span style={{ color: isOneWord ? Y : G, fontWeight: 600 }}>{c.firstLimitUpType}</span>
        </span>
        <span style={{ fontSize: 12, color: MID }}>
          退市风险 <span style={{
            color: c.delistingRiskScore <= 30 ? G : c.delistingRiskScore <= 60 ? Y : R,
            fontWeight: 600,
          }}>{c.delistingRiskLevel}({c.delistingRiskScore})</span>
        </span>
        {c.currentPrice > 0 && (
          <span style={{ fontSize: 12, color: MID }}>
            现价 <span style={{ color: c.currentChangePct >= 0 ? R : G, fontWeight: 600 }}>
              {c.currentPrice.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      {/* 评分条 */}
      <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: DIM, width: 42, flexShrink: 0 }}>首板强度</span>
        <ScoreBar score={c.firstLimitUpStrengthScore} color={c.firstLimitUpStrengthScore >= 60 ? G : Y} />
        <span style={{ fontSize: 10, color: MID, width: 26, textAlign: "right" }}>{c.firstLimitUpStrengthScore}</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: DIM, width: 42, flexShrink: 0 }}>重组预期</span>
        <ScoreBar score={c.restructuringExpectationScore} color={c.restructuringExpectationScore >= 40 ? B : DIM} />
        <span style={{ fontSize: 10, color: MID, width: 26, textAlign: "right" }}>{c.restructuringExpectationScore}</span>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>

          {/* 时间线 */}
          <div style={{ fontSize: 11, color: MID, marginBottom: 6 }}>
            跌停区间：
            <span style={{ color: R }}>{c.limitDownStartDate}</span>
            {" ~ "}
            <span style={{ color: R }}>{c.limitDownEndDate}</span>
            {"  →  首板："}
            <span style={{ color: G }}>{c.firstLimitUpDate}</span>
          </div>

          {/* 评分明细 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginBottom: 8 }}>
            {[
              { label: "财务修复", value: c.financialRepairScore, color: B },
              { label: "现金流改善", value: c.cashflowImprovementScore, color: B },
              { label: "退市风险", value: c.delistingRiskScore, color: c.delistingRiskScore <= 30 ? G : R },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ fontSize: 11, color: DIM }}>
                {label}：<span style={{ color, fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* 买入依据 */}
          {c.buySignalReasons.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 11, color: MID, marginBottom: 3 }}>买入依据：</p>
              {c.buySignalReasons.slice(0, 5).map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: G, paddingLeft: 8 }}>✓ {r}</div>
              ))}
            </div>
          )}

          {/* 风险提示 */}
          {c.risks.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 11, color: Y, marginBottom: 3 }}>⚠️ 风险提示：</p>
              {c.risks.slice(0, 4).map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: Y, paddingLeft: 8 }}>• {r}</div>
              ))}
            </div>
          )}

          {/* 一字涨停特别提示 */}
          {isOneWord && (
            <div style={{
              background: "rgba(250,204,21,0.08)", border: `1px solid ${Y}33`,
              borderRadius: 8, padding: "8px 10px", marginBottom: 8,
            }}>
              <p style={{ fontSize: 11, color: Y, fontWeight: 600 }}>🔒 一字涨停提示</p>
              <p style={{ fontSize: 11, color: MID, marginTop: 2 }}>
                首个涨停为一字涨停，全天封板无法直接买入。
                模拟盘默认不自动买入，请等待开板或次日观察。
              </p>
            </div>
          )}

          {/* 降级提示 */}
          {c.degraded && c.degradedReasons.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {c.degradedReasons.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: DIM, fontStyle: "italic" }}>⚠️ {r}</div>
              ))}
            </div>
          )}

          {/* 操作按钮 */}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => onRemove(c.tsCode)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 12, color: DIM, background: "transparent",
                border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer",
              }}
            >
              <Trash2 size={12} />
              从候选池移除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────
export default function CandidatePool({
  params,
}: {
  params: STFirstLimitUpParams;
}) {
  const [subTab, setSubTab] = useState<SubTab>("candidates");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<STFirstLimitUpScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [savedCandidates, setSavedCandidates] = useState<STFirstLimitUpCandidate[]>([]);
  const [savedOneWord, setSavedOneWord] = useState<STFirstLimitUpCandidate[]>([]);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 从 localStorage 加载
  useEffect(() => {
    try {
      const rawC = localStorage.getItem(CANDIDATES_KEY);
      if (rawC) {
        const parsed = JSON.parse(rawC);
        setSavedCandidates(Array.isArray(parsed) ? parsed : []);
      }
      const rawW = localStorage.getItem(ONE_WORD_KEY);
      if (rawW) {
        const parsed = JSON.parse(rawW);
        setSavedOneWord(Array.isArray(parsed) ? parsed : []);
      }
      const rawH = localStorage.getItem(SCAN_HISTORY_KEY);
      if (rawH) {
        const parsed = JSON.parse(rawH);
        setScanHistory(Array.isArray(parsed) ? parsed : []);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  // 扫描
  async function runScan() {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/strategies/st-limit-down-first-limit-up/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params, concurrency: 4 }),
      });
      const data: STFirstLimitUpScanResult = await res.json();
      setScanResult(data);

      if (data.ok && params.autoOneWordLimitUpBuy !== undefined) {
        // 保存候选
        try {
          // 合并：新结果优先
          const existingC: STFirstLimitUpCandidate[] = savedCandidates;
          const mergedC = [...data.candidates];
          for (const old of existingC) {
            if (!mergedC.find(n => n.tsCode === old.tsCode)) mergedC.push(old);
          }
          localStorage.setItem(CANDIDATES_KEY, JSON.stringify(mergedC));
          setSavedCandidates(mergedC);

          const existingW: STFirstLimitUpCandidate[] = savedOneWord;
          const mergedW = [...data.oneWordWatch];
          for (const old of existingW) {
            if (!mergedW.find(n => n.tsCode === old.tsCode)) mergedW.push(old);
          }
          localStorage.setItem(ONE_WORD_KEY, JSON.stringify(mergedW));
          setSavedOneWord(mergedW);

          // 保存历史
          const histEntry: ScanHistoryEntry = {
            scannedAt:       data.scannedAt,
            candidatesCount: data.stats.candidatesCount,
            oneWordCount:    data.stats.oneWordWatchCount,
            highRiskCount:   data.stats.highRiskCount,
            totalScanned:    data.stats.totalSTScanned,
          };
          const newHistory = [histEntry, ...scanHistory].slice(0, 20);
          localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(newHistory));
          setScanHistory(newHistory);
        } catch { /* quota exceeded etc */ }
      }
    } catch (err) {
      setScanError(String(err));
    } finally {
      setScanning(false);
    }
  }

  function removeCandidate(tsCode: string) {
    const updated = savedCandidates.filter(c => c.tsCode !== tsCode);
    localStorage.setItem(CANDIDATES_KEY, JSON.stringify(updated));
    setSavedCandidates(updated);
  }

  function removeOneWord(tsCode: string) {
    const updated = savedOneWord.filter(c => c.tsCode !== tsCode);
    localStorage.setItem(ONE_WORD_KEY, JSON.stringify(updated));
    setSavedOneWord(updated);
  }

  const displayCandidates = scanResult?.candidates ?? savedCandidates;
  const displayOneWord    = scanResult?.oneWordWatch ?? savedOneWord;

  const SUB_TABS: { key: SubTab; label: string; count?: number }[] = [
    { key: "candidates",  label: "首板买入候选", count: displayCandidates.length },
    { key: "oneword",     label: "一字涨停观察", count: displayOneWord.length },
    { key: "highrisk",    label: "高风险剔除",   count: scanResult?.highRiskExcluded.length },
    { key: "insufficient",label: "数据不足",     count: scanResult?.insufficientData.length },
    { key: "history",     label: "历史扫描",      count: scanHistory.length },
  ];

  return (
    <div style={{ padding: "0 16px 24px" }}>

      {/* 扫描按钮 */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: "12px 14px", marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>全市场 ST 股扫描</span>
          {scanResult && (
            <span style={{ fontSize: 11, color: DIM }}>
              {new Date(scanResult.scannedAt).toLocaleTimeString("zh-CN")}
            </span>
          )}
        </div>

        {scanResult && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
            {[
              { label: "ST 总数",    value: scanResult.stats.totalSTScanned },
              { label: "有跌停区间", value: scanResult.stats.hadLimitDownStreak },
              { label: "出现首板",   value: scanResult.stats.hadFirstLimitUp, color: G },
              { label: "买入候选",   value: scanResult.stats.candidatesCount, color: G },
              { label: "一字观察",   value: scanResult.stats.oneWordWatchCount, color: Y },
              { label: "高风险",     value: scanResult.stats.highRiskCount, color: R },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: "center", background: "#0a1628", borderRadius: 8, padding: "6px 4px" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: color ?? MID }}>{value}</p>
                <p style={{ fontSize: 10, color: DIM }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={runScan}
          disabled={scanning}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 10,
            background: scanning ? DIM : `rgba(0,229,168,0.12)`,
            color: scanning ? "#07111F" : G,
            border: `1px solid ${scanning ? DIM : "rgba(0,229,168,0.25)"}`,
            fontSize: 14, fontWeight: 700, cursor: scanning ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {scanning ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          {scanning ? "扫描中…" : "开始扫描"}
        </button>
        {scanError && (
          <p style={{ fontSize: 11, color: R, marginTop: 8 }}>扫描出错：{scanError}</p>
        )}
      </div>

      {/* 子标签栏 */}
      <div style={{
        display: "flex", gap: 0, marginBottom: 12,
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 10, overflow: "hidden",
      }}>
        {SUB_TABS.map(t => {
          const active = t.key === subTab;
          return (
            <button key={t.key} onClick={() => setSubTab(t.key)} style={{
              flex: 1, padding: "8px 2px", border: "none", cursor: "pointer",
              background: active ? G : "transparent",
              color: active ? "#07111F" : DIM,
              fontSize: 11, fontWeight: active ? 700 : 500,
            }}>
              {t.label}
              {t.count !== undefined && (
                <span style={{
                  marginLeft: 4, fontSize: 10,
                  background: active ? "rgba(0,0,0,0.2)" : BORDER,
                  padding: "0 4px", borderRadius: 8,
                  color: active ? "#07111F" : MID,
                }}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 首板买入候选 */}
      {subTab === "candidates" && loaded && (
        <div>
          {displayCandidates.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <TrendingUp size={32} color={DIM} style={{ margin: "0 auto 8px" }} />
              <p style={{ fontSize: 13, color: MID }}>暂无首板买入候选</p>
              <p style={{ fontSize: 11, color: DIM, marginTop: 4 }}>点击「开始扫描」获取最新候选</p>
            </div>
          ) : (
            displayCandidates.map(c => (
              <CandidateCard key={c.tsCode} c={c} onRemove={removeCandidate} />
            ))
          )}
        </div>
      )}

      {/* 一字涨停观察 */}
      {subTab === "oneword" && loaded && (
        <div>
          <div style={{
            background: "rgba(250,204,21,0.06)", border: `1px solid ${Y}33`,
            borderRadius: 10, padding: "10px 12px", marginBottom: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Eye size={13} color={Y} />
              <span style={{ fontSize: 12, fontWeight: 700, color: Y }}>一字涨停说明</span>
            </div>
            <p style={{ fontSize: 11, color: MID, lineHeight: 1.7 }}>
              以下股票首板为一字涨停，全天封板无法买入。
              默认不自动买入，等待打开或次日观察机会。
            </p>
          </div>
          {displayOneWord.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <p style={{ fontSize: 13, color: MID }}>暂无一字涨停观察标的</p>
            </div>
          ) : (
            displayOneWord.map(c => (
              <CandidateCard key={c.tsCode} c={c} onRemove={removeOneWord} />
            ))
          )}
        </div>
      )}

      {/* 高风险剔除 */}
      {subTab === "highrisk" && (
        <div>
          {(!scanResult || scanResult.highRiskExcluded.length === 0) ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <p style={{ fontSize: 13, color: MID }}>暂无高风险剔除记录，请先扫描</p>
            </div>
          ) : (
            scanResult.highRiskExcluded.map(s => (
              <div key={s.tsCode} style={{
                background: CARD, border: `1px solid ${R}33`,
                borderRadius: 8, padding: "10px 12px", marginBottom: 6,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: R }}>退市风险 {s.delistingRiskScore}</span>
                </div>
                <p style={{ fontSize: 11, color: DIM, marginTop: 4 }}>{s.reason}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* 数据不足 */}
      {subTab === "insufficient" && (
        <div>
          {(!scanResult || scanResult.insufficientData.length === 0) ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <p style={{ fontSize: 13, color: MID }}>暂无数据不足记录，请先扫描</p>
            </div>
          ) : (
            scanResult.insufficientData.slice(0, 30).map(s => (
              <div key={s.tsCode} style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "8px 12px", marginBottom: 4,
              }}>
                <span style={{ fontSize: 12, color: MID }}>{s.name}</span>
                <span style={{ fontSize: 11, color: DIM, marginLeft: 8 }}>{s.reason}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* 历史扫描 */}
      {subTab === "history" && (
        <div>
          {scanHistory.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <p style={{ fontSize: 13, color: MID }}>暂无历史扫描记录</p>
            </div>
          ) : (
            scanHistory.map((h, i) => (
              <div key={i} style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "10px 12px", marginBottom: 6,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: MID }}>
                    {new Date(h.scannedAt).toLocaleString("zh-CN")}
                  </span>
                  <span style={{ fontSize: 11, color: DIM }}>扫描 {h.totalScanned} 只 ST</span>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ fontSize: 11, color: G }}>候选 {h.candidatesCount}</span>
                  <span style={{ fontSize: 11, color: Y }}>一字 {h.oneWordCount}</span>
                  <span style={{ fontSize: 11, color: R }}>高风险 {h.highRiskCount}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
