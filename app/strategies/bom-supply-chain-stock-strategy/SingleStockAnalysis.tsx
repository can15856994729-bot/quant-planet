"use client";

/**
 * SingleStockAnalysis.tsx — 单只股票 BOM 分析
 *
 * 用户输入股票代码，获取：
 * - 所属 BOM 行业/模块
 * - 供应链角色
 * - 财务指标（来自 Tushare 真实数据）
 * - BOM 策略评分
 * - 风险评估
 */

import { useState } from "react";
import {
  Search, RefreshCw, AlertTriangle, TrendingUp,
  Shield, Globe, Database,
} from "lucide-react";

// ── 类型 ──────────────────────────────────────────────────────────────────

interface AnalysisResult {
  stock:       { tsCode: string; symbol: string; name: string; industry: string };
  bomAnalysis: {
    industryMatch:    string;
    primaryModule:    { moduleName: string; matchScore: number; matchedKeywords: string[]; roleInSupplyChain: string; costRatioRange: string; technicalBarrier: string; localizationSpace: string } | null;
    allModules:       Array<{ moduleId: string; moduleName: string; matchScore: number }>;
    bomScore:         number;
    bomRating:        string;
    scoreBreakdown:   Record<string, number>;
    strengths:        string[];
    risks:            string[];
    opportunities:    string[];
  };
  financials: {
    latest:        Record<string, number | null>;
    history:       Array<{ endDate: string; roe: number | null; grossMargin: number | null; netMargin: number | null; debtRatio: number | null; revenueYoy: number | null; netIncYoy: number | null }>;
    dataAvailable: boolean;
  };
  riskFilter:     { passed: boolean; riskLevel: string; riskScore: number; reasons: string[]; warnings: string[] };
  investmentLogic: string;
  disclaimer:     string;
}

// ── 颜色工具 ──────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#3b82f6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "--";
  return `${v.toFixed(decimals)}%`;
}

function fmtNum(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "--";
  return v.toFixed(decimals);
}

// ── 财务指标卡 ────────────────────────────────────────────────────────────

function FinCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-2 rounded-xl text-center" style={{ background: "#07111F", border: "1px solid #0d2040" }}>
      <div className="text-[13px] font-bold" style={{ color: color ?? "#e2e8f0" }}>{value}</div>
      <div className="text-[9px] mt-0.5" style={{ color: "#475569" }}>{label}</div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────

export default function SingleStockAnalysis() {
  const [symbol,  setSymbol]  = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<AnalysisResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const analyze = async () => {
    const sym = symbol.trim();
    if (!sym) { setError("请输入股票代码"); return; }
    setLoading(true); setError(null);
    try {
      const res  = await fetch("/api/strategies/bom-supply-chain-stock-strategy/single", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ symbol: sym }),
      });
      const json = await res.json() as { ok: boolean; error?: string } & Partial<AnalysisResult>;
      if (!json.ok) { setError(json.error ?? "分析失败"); return; }
      setResult(json as AnalysisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally { setLoading(false); }
  };

  const bom  = result?.bomAnalysis;
  const fin  = result?.financials?.latest ?? {};
  const hist = result?.financials?.history ?? [];
  const risk = result?.riskFilter;

  return (
    <div>
      {/* 输入区 */}
      <div className="flex gap-2 mb-4">
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="股票代码（如 300750 或 688012）"
          className="flex-1 px-3 py-2 rounded-xl text-[13px]"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50", color: "#e2e8f0" }}
        />
        <button
          onClick={analyze}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-[13px] font-semibold flex items-center gap-2"
          style={{ background: "#00E5A8", color: "#07111F" }}
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          分析
        </button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="p-3 rounded-xl mb-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p className="text-[12px]" style={{ color: "#ef4444" }}>
            <AlertTriangle size={11} className="inline mr-1" />{error}
          </p>
        </div>
      )}

      {/* 结果 */}
      {result && bom && (
        <div>
          {/* 股票头部 */}
          <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-[16px] font-bold mr-2" style={{ color: "#e2e8f0" }}>{result.stock.name}</span>
                <span className="text-[12px]" style={{ color: "#64748b" }}>{result.stock.symbol}</span>
              </div>
              <div className="text-center">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold"
                  style={{ background: `${scoreColor(bom.bomScore)}22`, border: `2px solid ${scoreColor(bom.bomScore)}`, color: scoreColor(bom.bomScore) }}
                >
                  {bom.bomScore}
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: "#475569" }}>BOM分</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>
                {bom.industryMatch}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6" }}>
                {bom.primaryModule?.moduleName ?? ""}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(100,116,139,0.12)", color: "#94a3b8" }}>
                {result.stock.industry}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: `${scoreColor(bom.bomScore)}15`, color: scoreColor(bom.bomScore) }}>
                {bom.bomRating}
              </span>
            </div>
          </div>

          {/* BOM 模块匹配 */}
          {bom.primaryModule && (
            <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[11px] font-bold mb-2" style={{ color: "#94a3b8" }}>产业链定位</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="p-2 rounded-xl" style={{ background: "#07111F" }}>
                  <p className="text-[9px] mb-0.5" style={{ color: "#64748b" }}>BOM 模块</p>
                  <p className="text-[12px] font-bold" style={{ color: "#e2e8f0" }}>{bom.primaryModule.moduleName}</p>
                </div>
                <div className="p-2 rounded-xl" style={{ background: "#07111F" }}>
                  <p className="text-[9px] mb-0.5" style={{ color: "#64748b" }}>供应链角色</p>
                  <p className="text-[12px] font-bold" style={{ color: "#00E5A8" }}>{bom.primaryModule.roleInSupplyChain}</p>
                </div>
                <div className="p-2 rounded-xl" style={{ background: "#07111F" }}>
                  <p className="text-[9px] mb-0.5" style={{ color: "#64748b" }}>整机成本占比</p>
                  <p className="text-[12px] font-bold" style={{ color: "#3b82f6" }}>{bom.primaryModule.costRatioRange}</p>
                </div>
                <div className="p-2 rounded-xl" style={{ background: "#07111F" }}>
                  <p className="text-[9px] mb-0.5" style={{ color: "#64748b" }}>匹配分</p>
                  <p className="text-[12px] font-bold" style={{ color: "#f59e0b" }}>{bom.primaryModule.matchScore}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1 text-[10px]" style={{ color: "#94a3b8" }}>
                  <Shield size={9} />技术壁垒：
                  <span style={{ color: "#e2e8f0" }}>{bom.primaryModule.technicalBarrier}</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]" style={{ color: "#94a3b8" }}>
                  <Globe size={9} />国产替代：
                  <span style={{ color: "#e2e8f0" }}>{bom.primaryModule.localizationSpace}</span>
                </span>
              </div>
              {bom.primaryModule.matchedKeywords.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] mb-1" style={{ color: "#64748b" }}>匹配关键词：</p>
                  <div className="flex flex-wrap gap-1">
                    {bom.primaryModule.matchedKeywords.map(kw => (
                      <span key={kw} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(0,229,168,0.1)", color: "#00E5A8" }}>{kw}</span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[9px] mt-2" style={{ color: "#334155" }}>
                ⚠️ 规则匹配结果，非具体供应商关系，需人工复核
              </p>
            </div>
          )}

          {/* 评分拆解 */}
          <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-bold mb-2" style={{ color: "#94a3b8" }}>BOM 评分拆解</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { key: "costRatioScore",    label: "成本占比", weight: "20%" },
                { key: "techBarrierScore",  label: "技术壁垒", weight: "20%" },
                { key: "localizationScore", label: "国产替代", weight: "20%" },
                { key: "supplyChainScore",  label: "供应链地位", weight: "15%" },
                { key: "financialScore",    label: "财务质量",  weight: "10%" },
                { key: "growthScore",       label: "成长能力",  weight: "10%" },
              ].map(item => {
                const val = bom.scoreBreakdown[item.key] ?? 0;
                return (
                  <div key={item.key} className="p-1.5 rounded-lg text-center" style={{ background: "#07111F" }}>
                    <div className="text-[12px] font-bold" style={{ color: scoreColor(val / 0.2) }}>{val}</div>
                    <div className="text-[9px]" style={{ color: "#64748b" }}>{item.label}</div>
                    <div className="text-[8px]" style={{ color: "#334155" }}>权{item.weight}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 财务指标 */}
          <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold" style={{ color: "#94a3b8" }}>财务指标</p>
              {!result.financials.dataAvailable && (
                <span className="text-[10px]" style={{ color: "#475569" }}>数据获取失败</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <FinCard label="PE(TTM)" value={fmtNum(fin.pe as number)} />
              <FinCard label="PB" value={fmtNum(fin.pb as number)} />
              <FinCard label="ROE" value={fmtPct(fin.roe as number)}
                color={fin.roe && (fin.roe as number) > 15 ? "#22c55e" : undefined} />
              <FinCard label="毛利率" value={fmtPct(fin.grossMargin as number)}
                color={fin.grossMargin && (fin.grossMargin as number) > 30 ? "#22c55e" : undefined} />
              <FinCard label="营收同比" value={fmtPct(fin.revenueYoy as number)}
                color={fin.revenueYoy && (fin.revenueYoy as number) > 0 ? "#22c55e" : "#ef4444"} />
              <FinCard label="净利润同比" value={fmtPct(fin.netIncYoy as number)}
                color={fin.netIncYoy && (fin.netIncYoy as number) > 0 ? "#22c55e" : "#ef4444"} />
              <FinCard label="资产负债率" value={fmtPct(fin.debtRatio as number)}
                color={fin.debtRatio && (fin.debtRatio as number) > 70 ? "#ef4444" : undefined} />
              <FinCard label="净利率" value={fmtPct(fin.netMargin as number)} />
              <FinCard label="换手率" value={fmtPct(fin.turnoverRate as number)} />
            </div>
          </div>

          {/* 历史财务 */}
          {hist.length > 0 && (
            <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[11px] font-bold mb-2" style={{ color: "#94a3b8" }}>历史财务趋势</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1a2f50" }}>
                      {["报告期", "ROE%", "毛利率%", "负债率%", "营收YoY%", "净利YoY%"].map(h => (
                        <th key={h} className="pb-1.5 pr-2 text-left font-normal" style={{ color: "#475569" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hist.map((h, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(26,47,80,0.4)" }}>
                        <td className="py-1 pr-2" style={{ color: "#94a3b8" }}>{h.endDate}</td>
                        <td className="py-1 pr-2" style={{ color: h.roe && h.roe > 10 ? "#22c55e" : "#94a3b8" }}>{fmtNum(h.roe)}</td>
                        <td className="py-1 pr-2" style={{ color: "#94a3b8" }}>{fmtNum(h.grossMargin)}</td>
                        <td className="py-1 pr-2" style={{ color: h.debtRatio && h.debtRatio > 70 ? "#ef4444" : "#94a3b8" }}>{fmtNum(h.debtRatio)}</td>
                        <td className="py-1 pr-2" style={{ color: h.revenueYoy && h.revenueYoy > 0 ? "#22c55e" : "#ef4444" }}>{fmtNum(h.revenueYoy)}</td>
                        <td className="py-1 pr-2" style={{ color: h.netIncYoy && h.netIncYoy > 0 ? "#22c55e" : "#ef4444" }}>{fmtNum(h.netIncYoy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 优势/风险/机会 */}
          <div className="grid grid-cols-1 gap-2 mb-3">
            {bom.strengths.length > 0 && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: "#22c55e" }}>优势</p>
                {bom.strengths.map((s, i) => <p key={i} className="text-[11px]" style={{ color: "#94a3b8" }}>✓ {s}</p>)}
              </div>
            )}
            {bom.risks.length > 0 && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: "#ef4444" }}>风险</p>
                {bom.risks.map((r, i) => <p key={i} className="text-[11px]" style={{ color: "#94a3b8" }}>⚠ {r}</p>)}
              </div>
            )}
            {bom.opportunities.length > 0 && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: "#3b82f6" }}>机会</p>
                {bom.opportunities.map((o, i) => <p key={i} className="text-[11px]" style={{ color: "#94a3b8" }}>→ {o}</p>)}
              </div>
            )}
          </div>

          {/* 风险评估 */}
          {risk && (
            <div className="p-3 rounded-xl mb-3"
              style={{
                background: risk.passed ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                border: `1px solid ${risk.passed ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
              }}>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[11px] font-bold" style={{ color: risk.passed ? "#22c55e" : "#ef4444" }}>
                  基本面风险：{risk.riskLevel}
                </p>
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: risk.passed ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: risk.passed ? "#22c55e" : "#ef4444" }}>
                  {risk.passed ? "通过过滤" : "未通过过滤"}
                </span>
              </div>
              {risk.reasons.length > 0 && (
                <div className="mb-1">
                  {risk.reasons.map((r, i) => <p key={i} className="text-[10px]" style={{ color: "#ef4444" }}>⚠ {r}</p>)}
                </div>
              )}
              {risk.warnings.length > 0 && (
                <div>
                  {risk.warnings.map((w, i) => <p key={i} className="text-[10px]" style={{ color: "#f59e0b" }}>• {w}</p>)}
                </div>
              )}
            </div>
          )}

          {/* 投资逻辑 */}
          {result.investmentLogic && (
            <div className="p-3 rounded-xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[11px] font-bold mb-1" style={{ color: "#94a3b8" }}>BOM 模块投资逻辑</p>
              <p className="text-[11px] leading-relaxed" style={{ color: "#64748b" }}>💡 {result.investmentLogic}</p>
            </div>
          )}

          {/* 底部免责 */}
          <p className="text-[10px] leading-relaxed mt-2 p-2 rounded-xl"
            style={{ color: "#475569", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)" }}>
            ⚠️ {result.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
