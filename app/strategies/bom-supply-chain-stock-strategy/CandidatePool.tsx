"use client";

/**
 * CandidatePool.tsx — BOM 策略候选池
 *
 * 功能：
 * - 选择行业，点击扫描
 * - 展示关键词匹配到的候选股列表
 * - 支持 localStorage 持久化
 * - 支持行业筛选/评分排序
 *
 * ⚠️ 扫描结果为规则匹配，需人工复核，不构成投资建议。
 */

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, TrendingUp, AlertTriangle, Database,
  Shield, Globe, ChevronDown, ChevronRight,
} from "lucide-react";
import { getBomIndustryList } from "@/lib/bomIndustryTemplateService";

// ── 类型 ──────────────────────────────────────────────────────────────────

interface BomCandidate {
  tsCode:            string;
  symbol:            string;
  name:              string;
  industry:          string;
  industryMatch:     string;
  bomModule:         string;
  roleInSupplyChain: string;
  costRatioRange:    string;
  technicalBarrier:  string;
  localizationSpace: string;
  matchScore:        number;
  matchedKeywords:   string[];
  bomScore:          number;
  bomRating:         "优秀" | "良好" | "一般" | "较差";
  strengths:         string[];
  risks:             string[];
  opportunities:     string[];
}

interface ScanResult {
  industry:    string;
  totalAStock: number;
  activeCount: number;
  matchedCount: number;
  results:     BomCandidate[];
  scannedAt:   string;
}

// ── 存储 ──────────────────────────────────────────────────────────────────

const CANDIDATES_KEY  = "quantplanet_bom_supply_chain_candidates_v1";
const SCAN_HISTORY_KEY = "quantplanet_bom_supply_chain_scan_history_v1";

function lsGet<T>(key: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fb;
  } catch { return fb; }
}

function lsSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── 颜色 ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#3b82f6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function ratingBg(rating: string): string {
  const m: Record<string, string> = { 优秀: "rgba(34,197,94,0.15)", 良好: "rgba(59,130,246,0.15)", 一般: "rgba(245,158,11,0.15)", 较差: "rgba(239,68,68,0.12)" };
  return m[rating] ?? "rgba(100,116,139,0.12)";
}

// ── 候选卡片 ──────────────────────────────────────────────────────────────

function CandidateCard({ item }: { item: BomCandidate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="p-3 rounded-2xl mb-2 cursor-pointer"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
      onClick={() => setExpanded(v => !v)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* 名称行 */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-[14px]" style={{ color: "#e2e8f0" }}>{item.name}</span>
            <span className="text-[11px]" style={{ color: "#64748b" }}>{item.symbol}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: ratingBg(item.bomRating), color: scoreColor(item.bomScore) }}>
              {item.bomRating}
            </span>
          </div>
          {/* 标签行 */}
          <div className="flex flex-wrap gap-1 mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(0,229,168,0.1)", color: "#00E5A8" }}>
              {item.industryMatch}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>
              {item.bomModule}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(100,116,139,0.12)", color: "#94a3b8" }}>
              {item.roleInSupplyChain}
            </span>
          </div>
          {/* 指标行 */}
          <div className="flex flex-wrap gap-3 text-[10px]">
            <span style={{ color: "#64748b" }}>成本占比 <span style={{ color: "#e2e8f0" }}>{item.costRatioRange}</span></span>
            <span style={{ color: "#64748b" }}>技术壁垒 <span style={{ color: "#e2e8f0" }}>{item.technicalBarrier}</span></span>
            <span style={{ color: "#64748b" }}>国产替代 <span style={{ color: "#e2e8f0" }}>{item.localizationSpace}</span></span>
          </div>
        </div>
        {/* 评分圆 */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-bold"
            style={{ background: `${scoreColor(item.bomScore)}22`, border: `1.5px solid ${scoreColor(item.bomScore)}`, color: scoreColor(item.bomScore) }}
          >
            {item.bomScore}
          </div>
          <span className="text-[9px] mt-0.5" style={{ color: "#475569" }}>BOM分</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1a2f50" }}>
          {item.matchedKeywords.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] mb-1" style={{ color: "#64748b" }}>匹配关键词：</p>
              <div className="flex flex-wrap gap-1">
                {item.matchedKeywords.map(kw => (
                  <span key={kw} className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(0,229,168,0.1)", color: "#00E5A8" }}>{kw}</span>
                ))}
              </div>
            </div>
          )}
          {item.strengths.length > 0 && (
            <div className="mb-1.5">
              <p className="text-[10px] mb-1" style={{ color: "#22c55e" }}>优势：</p>
              {item.strengths.map((s, i) => (
                <p key={i} className="text-[10px]" style={{ color: "#94a3b8" }}>✓ {s}</p>
              ))}
            </div>
          )}
          {item.risks.length > 0 && (
            <div className="mb-1.5">
              <p className="text-[10px] mb-1" style={{ color: "#ef4444" }}>风险：</p>
              {item.risks.slice(0, 2).map((r, i) => (
                <p key={i} className="text-[10px]" style={{ color: "#94a3b8" }}>⚠ {r}</p>
              ))}
            </div>
          )}
          {item.opportunities.length > 0 && (
            <div>
              <p className="text-[10px] mb-1" style={{ color: "#3b82f6" }}>机会：</p>
              {item.opportunities.slice(0, 2).map((o, i) => (
                <p key={i} className="text-[10px]" style={{ color: "#94a3b8" }}>→ {o}</p>
              ))}
            </div>
          )}
          <p className="text-[9px] mt-2" style={{ color: "#334155" }}>
            ⚠️ 规则匹配，需人工复核。不构成投资建议。
          </p>
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────

export default function CandidatePool() {
  const [selectedIndustry, setSelectedIndustry] = useState("新能源汽车");
  const [scanning,         setScanning]         = useState(false);
  const [scanResult,       setScanResult]       = useState<ScanResult | null>(null);
  const [error,            setError]            = useState<string | null>(null);
  const [minScore,         setMinScore]         = useState(40);
  const [filterIndustry,   setFilterIndustry]   = useState("全部");
  const [showNotice,       setShowNotice]       = useState(true);
  const INDUSTRIES = getBomIndustryList();

  // 从 localStorage 恢复
  useEffect(() => {
    const saved = lsGet<ScanResult | null>(CANDIDATES_KEY, null);
    if (saved) {
      setScanResult(saved);
      setSelectedIndustry(saved.industry);
    }
  }, []);

  // 扫描
  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/strategies/bom-supply-chain-stock-strategy/scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ industry: selectedIndustry, minScore }),
      });
      const json = await res.json() as { ok: boolean; error?: string } & Partial<ScanResult>;
      if (!json.ok) { setError(json.error ?? "扫描失败"); return; }
      const result: ScanResult = {
        industry:     json.industry ?? selectedIndustry,
        totalAStock:  json.totalAStock ?? 0,
        activeCount:  json.activeCount ?? 0,
        matchedCount: json.matchedCount ?? 0,
        results:      (json.results as BomCandidate[]) ?? [],
        scannedAt:    json.scannedAt ?? new Date().toISOString(),
      };
      setScanResult(result);
      lsSet(CANDIDATES_KEY, result);

      // 保存历史
      const hist = lsGet<Array<{ industry: string; count: number; scannedAt: string }>>(SCAN_HISTORY_KEY, []);
      hist.unshift({ industry: result.industry, count: result.matchedCount, scannedAt: result.scannedAt });
      lsSet(SCAN_HISTORY_KEY, hist.slice(0, 20));
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setScanning(false);
    }
  }, [selectedIndustry, minScore]);

  // 过滤候选
  const candidates = (scanResult?.results ?? []).filter(c =>
    filterIndustry === "全部" || c.industryMatch === filterIndustry
  );

  // 行业分布
  const industryDist = (scanResult?.results ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.industryMatch] = (acc[c.industryMatch] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* 免责提示 */}
      {showNotice && (
        <div className="p-3 rounded-xl mb-3"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div className="flex justify-between">
            <p className="text-[11px] leading-relaxed flex-1" style={{ color: "#94a3b8" }}>
              <AlertTriangle size={11} color="#f59e0b" className="inline mr-1" />
              BOM 策略扫描使用<strong style={{ color: "#f59e0b" }}>关键词规则匹配</strong>，不代表具体供应商关系，需人工复核。BOM 逻辑候选，不代表立即买入。建议结合估值、趋势和风险控制。
            </p>
            <button onClick={() => setShowNotice(false)} className="text-[11px] ml-2 flex-shrink-0" style={{ color: "#64748b" }}>✕</button>
          </div>
        </div>
      )}

      {/* 扫描控制 */}
      <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <p className="text-[11px] font-bold mb-2" style={{ color: "#94a3b8" }}>扫描设置</p>

        {/* 行业选择 */}
        <p className="text-[10px] mb-1.5" style={{ color: "#64748b" }}>选择行业</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {INDUSTRIES.map(ind => (
            <button
              key={ind}
              onClick={() => setSelectedIndustry(ind)}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{
                background: selectedIndustry === ind ? "#00E5A8" : "rgba(0,229,168,0.08)",
                color:      selectedIndustry === ind ? "#07111F"  : "#94a3b8",
                border:     selectedIndustry === ind ? "1px solid #00E5A8" : "1px solid #1a2f50",
              }}
            >
              {ind}
            </button>
          ))}
        </div>

        {/* 最低评分 */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px]" style={{ color: "#64748b" }}>最低 BOM 分：</span>
          {[30, 40, 50, 60].map(s => (
            <button
              key={s}
              onClick={() => setMinScore(s)}
              className="px-2 py-0.5 rounded text-[11px]"
              style={{
                background: minScore === s ? "#1e40af" : "#1a2f50",
                color:      minScore === s ? "#93c5fd" : "#64748b",
              }}
            >
              {s}+
            </button>
          ))}
        </div>

        {/* 扫描按钮 */}
        <button
          onClick={handleScan}
          disabled={scanning}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold"
          style={{ background: scanning ? "#1a2f50" : "#00E5A8", color: scanning ? "#64748b" : "#07111F" }}
        >
          {scanning
            ? <><RefreshCw size={14} className="animate-spin" />正在扫描 A 股全市场…</>
            : <><RefreshCw size={14} />开始 BOM 策略扫描（{selectedIndustry}）</>
          }
        </button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="p-3 rounded-xl mb-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p className="text-[12px]" style={{ color: "#ef4444" }}>
            <AlertTriangle size={11} className="inline mr-1" />{error}
          </p>
        </div>
      )}

      {/* 扫描统计 */}
      {scanResult && (
        <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold" style={{ color: "#94a3b8" }}>
              扫描结果 — {scanResult.industry}
            </span>
            <span className="text-[10px]" style={{ color: "#334155" }}>
              {scanResult.scannedAt.slice(0, 16).replace("T", " ")}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "A股总数",   value: scanResult.totalAStock.toLocaleString(), color: "#94a3b8" },
              { label: "有效股票",  value: scanResult.activeCount.toLocaleString(),  color: "#e2e8f0" },
              { label: "BOM匹配",  value: scanResult.matchedCount.toString(),        color: "#00E5A8" },
              { label: "返回数量", value: scanResult.results.length.toString(),       color: "#3b82f6" },
            ].map(s => (
              <div key={s.label} className="p-2 rounded-xl text-center" style={{ background: "#07111F" }}>
                <div className="text-[14px] font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[9px]" style={{ color: "#475569" }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* 行业分布 */}
          {Object.keys(industryDist).length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(industryDist).map(([ind, cnt]) => (
                <button
                  key={ind}
                  onClick={() => setFilterIndustry(filterIndustry === ind ? "全部" : ind)}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: filterIndustry === ind ? "#00E5A8" : "rgba(0,229,168,0.08)",
                    color:      filterIndustry === ind ? "#07111F"  : "#94a3b8",
                  }}
                >
                  {ind} {cnt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 候选列表 */}
      {candidates.length > 0 ? (
        <div>
          <p className="text-[11px] font-bold mb-2" style={{ color: "#94a3b8" }}>
            BOM 候选池（{candidates.length} 只，点击展开详情）
          </p>
          {candidates.map(item => (
            <CandidateCard key={item.tsCode} item={item} />
          ))}
          <p className="text-center text-[10px] mt-3 py-2"
            style={{ color: "#334155", borderTop: "1px solid #1a2f50" }}>
            ⚠️ 以上为规则匹配结果，BOM 逻辑候选不代表立即买入，需结合估值趋势和风险控制，不构成投资建议
          </p>
        </div>
      ) : scanResult ? (
        <div className="py-8 text-center">
          <Database size={28} color="#1a2f50" className="mx-auto mb-3" />
          <p className="text-[12px]" style={{ color: "#475569" }}>
            未找到符合条件的候选（最低BOM分 {minScore}+）
          </p>
          <p className="text-[11px] mt-1" style={{ color: "#334155" }}>可降低最低评分或选择其他行业</p>
        </div>
      ) : (
        <div className="py-8 text-center">
          <TrendingUp size={28} color="#1a2f50" className="mx-auto mb-3" />
          <p className="text-[12px]" style={{ color: "#475569" }}>
            选择行业，点击「开始扫描」
          </p>
          <p className="text-[11px] mt-1" style={{ color: "#334155" }}>
            扫描 A 股全市场（5000+只），匹配 BOM 关键词，计算策略评分
          </p>
        </div>
      )}
    </div>
  );
}
