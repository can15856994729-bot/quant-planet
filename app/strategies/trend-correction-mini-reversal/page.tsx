"use client";

/**
 * app/strategies/trend-correction-mini-reversal/page.tsx
 *
 * A股趋势回调微型反转策略 — 主页面
 *
 * 标签页：
 *   1. 买入候选池（全市场扫描结果）
 *   2. 单只分析 / 历史回测
 *   3. 参数设置
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, TrendingUp, Search, Settings, Info } from "lucide-react";
import CandidatePool from "./CandidatePool";
import SingleBacktest from "./SingleBacktest";
import type { MiniReversalParams } from "@/lib/trendCorrectionMiniReversalService";

// ── 默认参数 ──────────────────────────────────────────────────────────────

const DEFAULT_PARAMS: MiniReversalParams = {
  lookbackDays:             250,
  minTrendDays:             60,
  minRisePercent:           0.5,
  minCorrectionRatio:       0.4,
  idealCorrectionRatio:     0.5,
  maxCorrectionRatio:       0.6,
  halfRetracementTolerance: 0.05,
  minMiniReversalScore:     60,
  buyMode:                  "nextOpen",
  stopLossPercent:          5,
  takeProfitPercent:        10,
  timeStopDays:             10,
  useMacd:                  true,
  useRsi:                   true,
  useKdj:                   true,
  requireVolumeExpansion:   true,
  excludeHighFinancialRisk: true,
};

// ── 参数面板 ──────────────────────────────────────────────────────────────

interface ParamRowProps {
  label:    string;
  value:    number;
  min:      number;
  max:      number;
  step:     number;
  unit?:    string;
  onChange: (v: number) => void;
}
function ParamRow({ label, value, min, max, step, unit = "", onChange }: ParamRowProps) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #0d2040" }}>
      <span className="text-[12px]" style={{ color: "#94a3b8" }}>{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(4)))}
          className="w-6 h-6 rounded-lg text-[14px] font-bold flex items-center justify-center"
          style={{ background: "#1a2f50", color: "#64748b" }}
        >−</button>
        <span className="text-[13px] font-bold w-16 text-center" style={{ color: "#e2e8f0" }}>
          {value}{unit}
        </span>
        <button
          onClick={() => onChange(Math.min(max, +(value + step).toFixed(4)))}
          className="w-6 h-6 rounded-lg text-[14px] font-bold flex items-center justify-center"
          style={{ background: "#1a2f50", color: "#64748b" }}
        >+</button>
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #0d2040" }}>
      <span className="text-[12px]" style={{ color: "#94a3b8" }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        className="px-3 py-1 rounded-full text-[11px] font-semibold"
        style={{
          background: value ? "rgba(0,229,168,0.15)" : "#1a2f50",
          color: value ? "#00E5A8" : "#64748B",
          border: `1px solid ${value ? "#00E5A8" : "#1a2f50"}`,
        }}
      >
        {value ? "开启" : "关闭"}
      </button>
    </div>
  );
}

function ParamsPanel({
  params,
  onChange,
}: {
  params:   MiniReversalParams;
  onChange: (p: MiniReversalParams) => void;
}) {
  const set = <K extends keyof MiniReversalParams>(key: K, v: MiniReversalParams[K]) =>
    onChange({ ...params, [key]: v });

  return (
    <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <p className="text-[12px] font-bold mb-3" style={{ color: "#94a3b8" }}>策略参数</p>

      <p className="text-[11px] mb-2 mt-1" style={{ color: "#475569" }}>— 趋势识别 —</p>
      <ParamRow label="回看周期" value={params.lookbackDays} min={120} max={500} step={20} unit=" 日"
        onChange={v => set("lookbackDays", v)} />
      <ParamRow label="最小趋势天数" value={params.minTrendDays} min={30} max={180} step={10} unit=" 日"
        onChange={v => set("minTrendDays", v)} />
      <ParamRow label="最小上涨幅度" value={params.minRisePercent * 100} min={20} max={100} step={10} unit="%"
        onChange={v => set("minRisePercent", v / 100)} />

      <p className="text-[11px] mb-2 mt-3" style={{ color: "#475569" }}>— 回撤区间 —</p>
      <ParamRow label="回撤下限" value={params.minCorrectionRatio * 100} min={30} max={45} step={5} unit="%"
        onChange={v => set("minCorrectionRatio", v / 100)} />
      <ParamRow label="理想回撤" value={params.idealCorrectionRatio * 100} min={45} max={55} step={5} unit="%"
        onChange={v => set("idealCorrectionRatio", v / 100)} />
      <ParamRow label="回撤上限" value={params.maxCorrectionRatio * 100} min={55} max={70} step={5} unit="%"
        onChange={v => set("maxCorrectionRatio", v / 100)} />
      <ParamRow label="50%容差" value={params.halfRetracementTolerance * 100} min={2} max={10} step={1} unit="%"
        onChange={v => set("halfRetracementTolerance", v / 100)} />

      <p className="text-[11px] mb-2 mt-3" style={{ color: "#475569" }}>— 微型反转 —</p>
      <ParamRow label="最低反转评分" value={params.minMiniReversalScore} min={40} max={90} step={5} unit=" 分"
        onChange={v => set("minMiniReversalScore", v)} />
      <ToggleRow label="MACD 确认" value={params.useMacd} onChange={v => set("useMacd", v)} />
      <ToggleRow label="RSI 确认"  value={params.useRsi}  onChange={v => set("useRsi",  v)} />
      <ToggleRow label="KDJ 确认"  value={params.useKdj}  onChange={v => set("useKdj",  v)} />
      <ToggleRow label="成交额放大确认" value={params.requireVolumeExpansion} onChange={v => set("requireVolumeExpansion", v)} />

      <p className="text-[11px] mb-2 mt-3" style={{ color: "#475569" }}>— 交易规则 —</p>
      <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #0d2040" }}>
        <span className="text-[12px]" style={{ color: "#94a3b8" }}>买入方式</span>
        <div className="flex gap-1">
          {(["nextOpen", "close", "watchOnly"] as const).map(m => (
            <button
              key={m}
              onClick={() => set("buyMode", m)}
              className="px-2 py-0.5 rounded text-[10px]"
              style={{
                background: params.buyMode === m ? "#1e40af" : "#1a2f50",
                color:      params.buyMode === m ? "#93c5fd" : "#64748b",
              }}
            >
              {m === "nextOpen" ? "次日开" : m === "close" ? "当日收" : "只观察"}
            </button>
          ))}
        </div>
      </div>
      <ParamRow label="止损比例" value={params.stopLossPercent} min={2} max={15} step={1} unit="%"
        onChange={v => set("stopLossPercent", v)} />
      <ParamRow label="止盈比例" value={params.takeProfitPercent} min={5} max={30} step={5} unit="%"
        onChange={v => set("takeProfitPercent", v)} />
      <ParamRow label="时间止损" value={params.timeStopDays} min={5} max={20} step={1} unit=" 日"
        onChange={v => set("timeStopDays", v)} />
      <ToggleRow label="排除财务高风险" value={params.excludeHighFinancialRisk} onChange={v => set("excludeHighFinancialRisk", v)} />
    </div>
  );
}

// ── 策略说明 ──────────────────────────────────────────────────────────────

function StrategyInfo() {
  return (
    <div className="p-4 rounded-2xl mb-4" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <div className="flex items-center gap-2 mb-3">
        <Info size={14} color="#3b82f6" />
        <span className="text-[13px] font-bold" style={{ color: "#3b82f6" }}>策略逻辑</span>
      </div>

      <div className="space-y-2 text-[12px]" style={{ color: "#94a3b8" }}>
        <div className="p-2.5 rounded-xl" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
          <p className="font-medium mb-1" style={{ color: "#93c5fd" }}>买入信号 = 以下 4 个条件同时满足：</p>
          <p>① 长期上涨趋势：低点→高点涨幅≥50%，持续≥60日</p>
          <p>② 回调到上涨幅度 40%~60%（核心：50% 附近）</p>
          <p>③ 出现微型反转信号（满足 ≥3 项技术条件）</p>
          <p>④ 通过风险过滤（排除退市/停牌/流动性不足）</p>
        </div>

        <div className="p-2.5 rounded-xl" style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)" }}>
          <p className="font-medium mb-0.5" style={{ color: "#22c55e" }}>举例：</p>
          <p>低点 100 元 → 高点 200 元（上涨 100%）</p>
          <p>50% 回撤价 = 200 - 100×50% = <span style={{ color: "#3b82f6" }}>150 元</span></p>
          <p>关注区间：142.5～157.5 元（±5%容差）</p>
          <p>在此区间出现微型反转 → 买入候选</p>
        </div>

        <div className="p-2.5 rounded-xl" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)" }}>
          <p className="font-medium mb-0.5" style={{ color: "#ef4444" }}>禁止以下单独触发买入：</p>
          <p>❌ 只有长期上涨，未回调</p>
          <p>❌ 回调幅度不足 40%</p>
          <p>❌ 回调超过 60%（可能趋势已破）</p>
          <p>❌ 进入50%区间但无微型反转确认</p>
        </div>

        <p className="text-[11px]" style={{ color: "#475569" }}>
          ⚠️ 技术分析策略，不构成投资建议。
        </p>
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────

type MainTab = "pool" | "single" | "params";

export default function TrendCorrectionMiniReversalPage() {
  const router = useRouter();
  const [tab,    setTab]    = useState<MainTab>("pool");
  const [params, setParams] = useState<MiniReversalParams>(DEFAULT_PARAMS);

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* 顶栏 */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: "#07111F", borderBottom: "1px solid #0d2040", position: "sticky", top: 0, zIndex: 10 }}
      >
        <button onClick={() => router.back()} className="p-1">
          <ChevronLeft size={20} color="#94a3b8" />
        </button>
        <div className="flex-1">
          <h1 className="text-[15px] font-bold" style={{ color: "#e2e8f0" }}>
            趋势回调微型反转
          </h1>
          <p className="text-[10px]" style={{ color: "#475569" }}>
            A股全市场 · 长期上涨+50%回撤+微型反转
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
          全市场
        </span>
      </div>

      {/* 标签页 */}
      <div className="flex gap-1.5 px-4 py-3">
        {(
          [
            { key: "pool"   as MainTab, label: "候选池",   icon: <TrendingUp size={12} /> },
            { key: "single" as MainTab, label: "单只分析", icon: <Search size={12} /> },
            { key: "params" as MainTab, label: "参数设置", icon: <Settings size={12} /> },
          ] as const
        ).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px]"
            style={{
              background: tab === t.key ? "#00E5A8" : "#0d1f3c",
              color:      tab === t.key ? "#07111F" : "#94a3b8",
              border:     tab === t.key ? "1px solid #00E5A8" : "1px solid #1a2f50",
              fontWeight: tab === t.key ? 700 : 400,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div className="px-4 pb-8">
        {tab === "pool" && (
          <>
            <StrategyInfo />
            <CandidatePool params={params} />
          </>
        )}
        {tab === "single" && <SingleBacktest params={params} />}
        {tab === "params" && (
          <ParamsPanel params={params} onChange={setParams} />
        )}
      </div>
    </div>
  );
}
