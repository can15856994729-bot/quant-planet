"use client";

/**
 * /strategies/bom-supply-chain-stock-strategy/page.tsx
 *
 * A股 BOM 产业链拆解选股策略主页
 * 标签：策略说明 | 行业BOM | 候选池 | 单只分析
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Info, Layout, Users, Search, AlertTriangle, Cpu, Radio } from "lucide-react";
import { getBomIndustryList, getBomIndustryTemplate } from "@/lib/bomIndustryTemplateService";
import type { BomIndustryTemplate } from "@/lib/bomIndustryTemplateService";
import { ErrorBoundary } from "../trend-correction-mini-reversal/ErrorBoundary";

// ── 动态导入（避免 SSR 崩溃） ────────────────────────────────────
const IndustryBomView     = dynamic(() => import("./IndustryBomView"),     { ssr: false, loading: () => <TabLoading /> });
const CandidatePool       = dynamic(() => import("./CandidatePool"),       { ssr: false, loading: () => <TabLoading /> });
const SingleStockAnalysis = dynamic(() => import("./SingleStockAnalysis"), { ssr: false, loading: () => <TabLoading /> });
const PCBStockPool        = dynamic(() => import("./PCBStockPool"),        { ssr: false, loading: () => <TabLoading /> });
const CPOStockPool        = dynamic(() => import("./CPOStockPool"),        { ssr: false, loading: () => <TabLoading /> });

function TabLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin w-6 h-6 rounded-full border-2 border-[#00E5A8] border-t-transparent" />
    </div>
  );
}

type TabKey = "info" | "industry" | "pcb" | "cpo" | "pool" | "single";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "info",     label: "说明",    icon: <Info size={13} /> },
  { key: "industry", label: "行业BOM", icon: <Layout size={13} /> },
  { key: "pcb",      label: "PCB池",   icon: <Cpu size={13} /> },
  { key: "cpo",      label: "CPO池",   icon: <Radio size={13} /> },
  { key: "pool",     label: "候选池",  icon: <Users size={13} /> },
  { key: "single",   label: "单只",    icon: <Search size={13} /> },
];

// ── 策略说明 Tab ──────────────────────────────────────────────────
function StrategyInfo() {
  return (
    <div className="space-y-4">
      {/* 免责声明 */}
      <div className="p-3 rounded-2xl flex items-start gap-2"
        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
        <AlertTriangle size={14} color="#f59e0b" className="flex-shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed" style={{ color: "#94a3b8" }}>
          <strong style={{ color: "#f59e0b" }}>策略声明：</strong>BOM 产业链拆解选股策略属于基本面研究策略，
          分析结果仅供研究和模拟，不构成投资建议。供应链映射为规则匹配结果，需人工复核，
          不代表具体客户/供应商关系。
        </p>
      </div>

      {/* 策略概述 */}
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <h2 className="text-[14px] font-bold mb-2" style={{ color: "#00E5A8" }}>策略概述</h2>
        <p className="text-[12px] leading-relaxed" style={{ color: "#94a3b8" }}>
          BOM（Bill of Materials，物料清单）拆解法通过分析产品成本结构，识别各零部件/子系统在产业链中的
          成本占比、技术壁垒和国产替代空间，筛选具备产业链价值的 A 股公司。
        </p>
        <p className="text-[12px] leading-relaxed mt-2" style={{ color: "#94a3b8" }}>
          适合中长线投资者，结合产业趋势、国产替代逻辑，寻找处于高价值 BOM 环节的上市公司。
        </p>
      </div>

      {/* 核心逻辑 */}
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <h2 className="text-[14px] font-bold mb-3" style={{ color: "#e2e8f0" }}>核心选股逻辑</h2>
        <div className="space-y-2">
          {[
            { n: "01", t: "高成本占比", d: "在整机 BOM 中成本占比高，意味着议价能力强，价格弹性大" },
            { n: "02", t: "高技术壁垒", d: "存在较高的技术门槛，竞争对手难以快速进入，利润空间有保障" },
            { n: "03", t: "国产替代空间", d: "当前由海外供应商主导，国内供应商有望实现进口替代，受益于政策支持" },
            { n: "04", t: "供应链地位", d: "处于核心零部件而非组装环节，附加价值更高，护城河更深" },
            { n: "05", t: "财务健康", d: "结合ROE、毛利率、营收增速等基本面指标验证竞争优势的可持续性" },
          ].map(item => (
            <div key={item.n} className="flex gap-3">
              <span className="text-[11px] font-bold flex-shrink-0 mt-0.5" style={{ color: "#00E5A8" }}>{item.n}</span>
              <div>
                <p className="text-[12px] font-semibold" style={{ color: "#e2e8f0" }}>{item.t}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>{item.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 评分体系 */}
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <h2 className="text-[14px] font-bold mb-3" style={{ color: "#e2e8f0" }}>BOM 评分体系（0-100分）</h2>
        <div className="space-y-2">
          {[
            { label: "成本占比",   weight: 20, color: "#3b82f6" },
            { label: "技术壁垒",   weight: 20, color: "#ef4444" },
            { label: "国产替代",   weight: 20, color: "#22c55e" },
            { label: "供应链地位", weight: 15, color: "#f59e0b" },
            { label: "财务指标",   weight: 10, color: "#00E5A8" },
            { label: "成长性",     weight: 10, color: "#a855f7" },
            { label: "风险扣分",   weight: -5, color: "#64748b" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-[11px] w-20 flex-shrink-0" style={{ color: "#94a3b8" }}>{item.label}</span>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "#1a2f50" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.abs(item.weight) * 5}%`, background: item.color + (item.weight < 0 ? "99" : "") }}
                />
              </div>
              <span className="text-[11px] w-10 text-right font-bold"
                style={{ color: item.weight < 0 ? "#ef444499" : item.color }}>
                {item.weight > 0 ? `+${item.weight}` : item.weight}%
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 grid grid-cols-4 gap-1" style={{ borderTop: "1px solid #1a2f50" }}>
          {[
            { range: "80-100", label: "优秀", color: "#22c55e" },
            { range: "60-79",  label: "良好", color: "#3b82f6" },
            { range: "40-59",  label: "一般", color: "#f59e0b" },
            { range: "0-39",   label: "较差", color: "#64748b" },
          ].map(r => (
            <div key={r.range} className="text-center p-1.5 rounded-lg" style={{ background: r.color + "15" }}>
              <p className="text-[10px] font-bold" style={{ color: r.color }}>{r.label}</p>
              <p className="text-[9px]" style={{ color: "#475569" }}>{r.range}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 支持行业 */}
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <h2 className="text-[14px] font-bold mb-3" style={{ color: "#e2e8f0" }}>支持的行业模板（{getBomIndustryList().length} 个）</h2>
        <div className="flex flex-wrap gap-2">
          {getBomIndustryList().map(ind => (
            <span key={ind} className="text-[11px] px-2 py-1 rounded-full"
              style={{ background: "rgba(0,229,168,0.1)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.2)" }}>
              {ind}
            </span>
          ))}
        </div>
      </div>

      {/* 使用说明 */}
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <h2 className="text-[14px] font-bold mb-3" style={{ color: "#e2e8f0" }}>使用说明</h2>
        <div className="space-y-2">
          {[
            { step: "1", text: "「行业BOM」Tab：选择行业，查看 BOM 拆解结构，了解各模块成本占比和代表性上市公司" },
            { step: "2", text: "「候选池」Tab：选择行业，进行全市场扫描，获取关键词匹配的候选股票列表" },
            { step: "3", text: "「单只分析」Tab：输入股票代码，获取该股票的 BOM 定位分析和实时财务数据" },
            { step: "⚠️", text: "候选列表为规则匹配，典型公司为行业分类参考，需结合年报、券商研报人工复核供应关系" },
          ].map(item => (
            <div key={item.step} className="flex gap-2">
              <span className="text-[11px] font-bold flex-shrink-0 mt-0.5"
                style={{ color: item.step === "⚠️" ? "#f59e0b" : "#00E5A8" }}>{item.step}</span>
              <p className="text-[11px] leading-relaxed" style={{ color: item.step === "⚠️" ? "#94a3b8" : "#64748b" }}>
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 行业 BOM Tab ──────────────────────────────────────────────────
function IndustryBomTab() {
  const industries = getBomIndustryList();
  const [selected, setSelected] = useState(industries[0]);
  const template = getBomIndustryTemplate(selected) as BomIndustryTemplate;

  return (
    <div>
      {/* 行业选择器 */}
      <div className="mb-4">
        <p className="text-[11px] mb-2 px-1" style={{ color: "#64748b" }}>选择行业</p>
        <div className="flex gap-2 flex-wrap">
          {industries.map(ind => {
            const active = ind === selected;
            return (
              <button
                key={ind}
                onClick={() => setSelected(ind)}
                className="text-[11px] px-2.5 py-1.5 rounded-xl flex-shrink-0"
                style={{
                  background: active ? "#00E5A8" : "#0d1f3c",
                  color:      active ? "#07111F" : "#64748b",
                  border:     `1px solid ${active ? "#00E5A8" : "#1a2f50"}`,
                }}
              >
                {ind}
              </button>
            );
          })}
        </div>
      </div>

      {/* BOM 详情 */}
      <ErrorBoundary>
        <IndustryBomView template={template} />
      </ErrorBoundary>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function BomSupplyChainStrategyPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("info");

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 pt-safe-top"
        style={{ background: "#07111F", borderBottom: "1px solid #0d1f3c" }}>
        <div className="flex items-center gap-3 py-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-xl"
            style={{ background: "#0d1f3c" }}>
            <ChevronLeft size={18} color="#94a3b8" />
          </button>
          <div className="flex-1">
            <h1 className="text-[15px] font-bold" style={{ color: "#e2e8f0" }}>BOM 产业链拆解选股</h1>
            <p className="text-[10px]" style={{ color: "#475569" }}>A股 · 基本面 · 中长线选股</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 pb-3">
          {TABS.map(t => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-semibold"
                style={{
                  background: active ? "#00E5A8" : "#0d1f3c",
                  color:      active ? "#07111F" : "#64748b",
                  border:     `1px solid ${active ? "#00E5A8" : "#1a2f50"}`,
                }}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 pb-24">
        {tab === "info" && (
          <ErrorBoundary>
            <StrategyInfo />
          </ErrorBoundary>
        )}

        {tab === "industry" && (
          <ErrorBoundary>
            <IndustryBomTab />
          </ErrorBoundary>
        )}

        {tab === "pool" && (
          <ErrorBoundary>
            <CandidatePool />
          </ErrorBoundary>
        )}

        {tab === "single" && (
          <ErrorBoundary>
            <SingleStockAnalysis />
          </ErrorBoundary>
        )}

        {tab === "pcb" && (
          <ErrorBoundary>
            <PCBStockPool />
          </ErrorBoundary>
        )}

        {tab === "cpo" && (
          <ErrorBoundary>
            <CPOStockPool />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
