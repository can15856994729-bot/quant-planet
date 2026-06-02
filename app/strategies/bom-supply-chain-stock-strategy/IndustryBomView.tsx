"use client";

/**
 * IndustryBomView.tsx — 行业 BOM 拆解视图
 *
 * 展示选定行业的 BOM 模块：成本占比、技术壁垒、国产替代空间、
 * 相关上市公司（公开市场信息，非具体供应商关系）。
 */

import { useState } from "react";
import type { BomIndustryTemplate, BomModule } from "@/lib/bomIndustryTemplateService";
import { ChevronDown, ChevronRight, AlertTriangle, TrendingUp, Shield, Globe, Zap } from "lucide-react";

// ── 颜色映射 ──────────────────────────────────────────────────────────────

function barrierColor(level: string): string {
  const m: Record<string, string> = { 高: "#ef4444", 中高: "#f97316", 中: "#f59e0b", 中低: "#64748b", 低: "#94a3b8" };
  return m[level] ?? "#94a3b8";
}

function localColor(level: string): string {
  const m: Record<string, string> = { 大: "#22c55e", 中高: "#3b82f6", 中: "#f59e0b", 中低: "#64748b", 小: "#94a3b8" };
  return m[level] ?? "#94a3b8";
}

function costRatioBar(min: number, max: number): number {
  return (min + max) / 2;
}

// ── 模块卡片 ──────────────────────────────────────────────────────────────

function ModuleCard({ mod }: { mod: BomModule }) {
  const [expanded, setExpanded] = useState(false);
  const midCost = costRatioBar(mod.estimatedCostRatioMin, mod.estimatedCostRatioMax);

  return (
    <div
      className="p-3 rounded-2xl mb-2 cursor-pointer"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
      onClick={() => setExpanded(v => !v)}
    >
      {/* 标题行 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[14px] font-bold" style={{ color: "#e2e8f0" }}>{mod.moduleName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
              {mod.estimatedCostRatioMin}%~{mod.estimatedCostRatioMax}%
            </span>
          </div>
          {/* 成本占比条 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: "#64748b" }}>成本占比</span>
            <div className="flex-1 h-1.5 rounded-full" style={{ background: "#1a2f50" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, midCost * 2)}%`, background: "linear-gradient(90deg,#00E5A8,#3b82f6)" }}
              />
            </div>
            <span className="text-[10px] font-bold" style={{ color: "#00E5A8" }}>{midCost.toFixed(0)}%</span>
          </div>
        </div>
        {expanded
          ? <ChevronDown size={14} color="#64748b" className="flex-shrink-0 mt-1" />
          : <ChevronRight size={14} color="#64748b" className="flex-shrink-0 mt-1" />
        }
      </div>

      {/* 标签行 */}
      <div className="flex gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: `${barrierColor(mod.technicalBarrier)}15`, color: barrierColor(mod.technicalBarrier) }}>
          <Shield size={9} />技术壁垒：{mod.technicalBarrier}
        </span>
        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: `${localColor(mod.localizationSpace)}15`, color: localColor(mod.localizationSpace) }}>
          <Globe size={9} />国产替代：{mod.localizationSpace}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: "rgba(100,116,139,0.15)", color: "#94a3b8" }}>
          议价能力：{mod.pricingPower}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1a2f50" }}>
          {/* 投资逻辑 */}
          <p className="text-[11px] mb-2 leading-relaxed" style={{ color: "#94a3b8" }}>
            💡 {mod.investmentLogic}
          </p>

          {/* 关键原材料 */}
          {mod.keyMaterials.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] mb-1" style={{ color: "#64748b" }}>关键原材料：</p>
              <div className="flex flex-wrap gap-1">
                {mod.keyMaterials.map(m => (
                  <span key={m} className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* 典型上市公司 */}
          {mod.representativeStocks.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] mb-1 flex items-center gap-1" style={{ color: "#64748b" }}>
                <TrendingUp size={9} />典型上市公司（公开市场信息，非供应商关系）：
              </p>
              <div className="space-y-1">
                {mod.representativeStocks.map(s => (
                  <div key={s.tsCode} className="flex items-start gap-2 p-1.5 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <span className="text-[11px] font-bold flex-shrink-0" style={{ color: "#e2e8f0" }}>{s.name}</span>
                    <span className="text-[10px]" style={{ color: "#334155" }}>{s.symbol}</span>
                    <span className="text-[10px]" style={{ color: "#64748b" }}>{s.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 风险与机会 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] mb-1" style={{ color: "#ef4444" }}>主要风险</p>
              {mod.risks.map((r, i) => (
                <p key={i} className="text-[10px] leading-relaxed" style={{ color: "#64748b" }}>· {r}</p>
              ))}
            </div>
            <div>
              <p className="text-[10px] mb-1" style={{ color: "#22c55e" }}>投资机会</p>
              {mod.opportunities.map((o, i) => (
                <p key={i} className="text-[10px] leading-relaxed" style={{ color: "#64748b" }}>· {o}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────

interface Props {
  template: BomIndustryTemplate;
}

export default function IndustryBomView({ template }: Props) {
  return (
    <div>
      {/* 行业概述 */}
      <div className="p-3 rounded-2xl mb-4" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-2 mb-1">
          <Zap size={14} color="#f59e0b" />
          <span className="text-[13px] font-bold" style={{ color: "#e2e8f0" }}>{template.industry} BOM 拆解</span>
        </div>
        <p className="text-[11px] mb-1" style={{ color: "#94a3b8" }}>{template.description}</p>
        <p className="text-[10px]" style={{ color: "#475569" }}>参考成本：{template.totalCost}</p>
      </div>

      {/* 免责声明 */}
      <div className="p-2.5 rounded-xl mb-3 flex items-start gap-1.5"
        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <AlertTriangle size={11} color="#f59e0b" className="flex-shrink-0 mt-0.5" />
        <p className="text-[10px] leading-relaxed" style={{ color: "#94a3b8" }}>
          BOM 模板来自公开市场研究。典型公司列表仅为行业分类参考，<strong style={{ color: "#f59e0b" }}>非具体客户/供应商关系</strong>，需人工复核。不构成投资建议。
        </p>
      </div>

      {/* 成本结构总览 */}
      <div className="p-3 rounded-2xl mb-4" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <p className="text-[11px] font-bold mb-3" style={{ color: "#94a3b8" }}>成本结构拆解</p>
        <div className="space-y-2">
          {[...template.modules].sort((a, b) => b.estimatedCostRatioMax - a.estimatedCostRatioMax).map(mod => {
            const mid = (mod.estimatedCostRatioMin + mod.estimatedCostRatioMax) / 2;
            return (
              <div key={mod.id} className="flex items-center gap-2">
                <span className="text-[10px] w-28 flex-shrink-0" style={{ color: "#94a3b8" }}>{mod.moduleName}</span>
                <div className="flex-1 h-2 rounded-full" style={{ background: "#1a2f50" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, mid * 2)}%`, background: barrierColor(mod.technicalBarrier) + "99" }}
                  />
                </div>
                <span className="text-[10px] w-12 text-right font-bold" style={{ color: "#e2e8f0" }}>
                  ~{mid.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[9px] mt-2" style={{ color: "#334155" }}>
          * 颜色代表技术壁垒（红=高，橙=中高，黄=中，灰=低）
        </p>
      </div>

      {/* 模块详情列表 */}
      <p className="text-[12px] font-bold mb-2 px-1" style={{ color: "#94a3b8" }}>
        模块详情（点击展开）
      </p>
      {template.modules.map(mod => (
        <ModuleCard key={mod.id} mod={mod} />
      ))}
    </div>
  );
}
