"use client";
/**
 * A股 ST 连续跌停后首板策略 — 策略主页
 *
 * ⚠️ 极高风险研究策略，不构成投资建议。
 * 连续跌停后的首个涨停可能是假反弹，后续仍可能继续跌停、停牌、退市或无法卖出。
 */

import { useState } from "react";
import {
  AlertTriangle, TrendingUp, TrendingDown,
  Settings, BarChart3, Info, Eye,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import CandidatePool from "./CandidatePool";
import SingleBacktest from "./SingleBacktest";
import type { STFirstLimitUpParams } from "@/lib/stLimitDownFirstLimitUpService";

// ── 颜色常量 ─────────────────────────────────────────────────────
const R      = "#EF4444";
const Y      = "#FACC15";
const G      = "#00E5A8";
const B      = "#3B82F6";
const DIM    = "#64748B";
const MID    = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

// ── 默认参数 ─────────────────────────────────────────────────────
const DEFAULT_PARAMS: STFirstLimitUpParams = {
  minLimitDownStreak:               5,
  maxLimitDownStreak:               50,
  maxDelistingRiskScore:            40,
  minFirstLimitUpStrengthScore:     60,
  minRestructuringExpectationScore: 40,
  allowOneWordLimitUp:              true,
  autoOneWordLimitUpBuy:            false,
  buyMode:                          "nextOpen",
  stopLossPercent:                  5,
  takeProfitPercent:                15,
  timeStopDays:                     5,
  maxSinglePositionRatio:           2,
  maxTotalPositionRatio:            10,
  requireMoneyFlow:                 false,
  requireAnnouncementData:          false,
};

type MainTab = "pool" | "backtest" | "params";

const TABS: { key: MainTab; label: string; icon: React.ReactNode }[] = [
  { key: "pool",     label: "首板候选池",  icon: <TrendingUp size={12} /> },
  { key: "backtest", label: "单只回测",     icon: <BarChart3 size={12} /> },
  { key: "params",   label: "参数设置",     icon: <Settings size={12} /> },
];

// ── 数字步进行 ───────────────────────────────────────────────────
function ParamRow({
  label, value, unit, min, max, step, onChange, description,
}: {
  label: string; value: number; unit: string;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
  description?: string;
}) {
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, color: MID }}>{label}</p>
          {description && <p style={{ fontSize: 10, color: DIM, marginTop: 1 }}>{description}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => onChange(Math.max(min, +(value - step).toFixed(10)))}
            style={{
              width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`,
              background: "#0a1628", color: MID, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >−</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", minWidth: 42, textAlign: "center" }}>
            {value}{unit}
          </span>
          <button
            onClick={() => onChange(Math.min(max, +(value + step).toFixed(10)))}
            style={{
              width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`,
              background: "#0a1628", color: MID, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >+</button>
        </div>
      </div>
    </div>
  );
}

// ── 开关行 ───────────────────────────────────────────────────────
function ToggleRow({
  label, value, onChange, description,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void; description?: string;
}) {
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, color: MID }}>{label}</p>
          {description && <p style={{ fontSize: 10, color: DIM, marginTop: 2 }}>{description}</p>}
        </div>
        <button
          onClick={() => onChange(!value)}
          style={{
            width: 40, height: 22, borderRadius: 11, cursor: "pointer", flexShrink: 0, marginLeft: 8,
            background: value ? G : BORDER, border: "none", position: "relative",
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: value ? 20 : 4,
            width: 16, height: 16, borderRadius: 8, background: "#fff",
            transition: "left 0.2s",
          }} />
        </button>
      </div>
    </div>
  );
}

// ── 买入方式选择 ─────────────────────────────────────────────────
const BUY_MODES: { key: STFirstLimitUpParams["buyMode"]; label: string; desc: string }[] = [
  { key: "close",    label: "首板当天收盘买入",  desc: "如果不是一字涨停可以成交" },
  { key: "nextOpen", label: "首板次日开盘【默认】", desc: "避免一字涨停无法成交" },
  { key: "nextDip",  label: "首板次日回调买入",   desc: "等待次日低点，需要手动设置目标价" },
  { key: "watchOnly",label: "只观察，不买入",     desc: "进入观察列表不生成买入" },
];

// ── 参数面板 ────────────────────────────────────────────────────
function ParamsPanel({
  params, onChange,
}: {
  params: STFirstLimitUpParams;
  onChange: (p: STFirstLimitUpParams) => void;
}) {
  function set<K extends keyof STFirstLimitUpParams>(key: K, val: STFirstLimitUpParams[K]) {
    onChange({ ...params, [key]: val });
  }

  return (
    <div style={{ padding: "0 16px 24px" }}>
      {/* 策略说明 */}
      <div style={{
        background: "rgba(59,130,246,0.06)", border: `1px solid ${B}33`,
        borderRadius: 12, padding: "12px 14px", marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Info size={14} color={B} />
          <span style={{ fontSize: 13, fontWeight: 700, color: B }}>策略逻辑</span>
        </div>
        <p style={{ fontSize: 12, color: MID, lineHeight: 1.7 }}>
          筛选连续跌停 5–50 板后出现第一个涨停板的 ST 股票，
          过滤高退市风险标的，结合重组/修复预期和首板强度评分判断买入候选。
          <br />
          <span style={{ color: Y }}>⚠️ 买入信号为首板涨停，极高风险，仅供研究和模拟。</span>
        </p>
      </div>

      {/* 跌停板数 */}
      <p style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 2, marginTop: 8 }}>连续跌停板数区间</p>
      <ParamRow label="最少连续跌停" value={params.minLimitDownStreak} unit="板"
        min={3} max={20} step={1} onChange={v => set("minLimitDownStreak", v)} />
      <ParamRow label="最多连续跌停" value={params.maxLimitDownStreak} unit="板"
        min={10} max={100} step={5} onChange={v => set("maxLimitDownStreak", v)} />

      {/* 评分阈值 */}
      <p style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 2, marginTop: 14 }}>评分阈值</p>
      <ParamRow label="最大退市风险评分" value={params.maxDelistingRiskScore} unit="分"
        min={20} max={80} step={5} onChange={v => set("maxDelistingRiskScore", v)}
        description="超过此分数进入高风险剔除" />
      <ParamRow label="最低首板强度评分" value={params.minFirstLimitUpStrengthScore} unit="分"
        min={40} max={90} step={5} onChange={v => set("minFirstLimitUpStrengthScore", v)}
        description="低于此分数不进入买入候选" />
      <ParamRow label="最低重组/修复预期" value={params.minRestructuringExpectationScore} unit="分"
        min={20} max={80} step={5} onChange={v => set("minRestructuringExpectationScore", v)} />

      {/* 一字涨停 */}
      <p style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 2, marginTop: 14 }}>一字涨停处理</p>
      <ToggleRow label="允许一字涨停进入候选"
        value={params.allowOneWordLimitUp}
        description="关闭后一字涨停将被完全过滤"
        onChange={v => set("allowOneWordLimitUp", v)} />
      <ToggleRow label="一字涨停自动买入"
        value={params.autoOneWordLimitUpBuy}
        description="极高风险：全天封板可能无法成交，默认关闭"
        onChange={v => set("autoOneWordLimitUpBuy", v)} />

      {/* 买入方式 */}
      <p style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6, marginTop: 14 }}>买入方式</p>
      {BUY_MODES.map(m => (
        <div
          key={m.key}
          onClick={() => set("buyMode", m.key)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer",
            background: params.buyMode === m.key ? "rgba(0,229,168,0.1)" : "#0a1628",
            border: `1px solid ${params.buyMode === m.key ? "rgba(0,229,168,0.3)" : BORDER}`,
          }}
        >
          <div style={{
            width: 16, height: 16, borderRadius: 8, flexShrink: 0,
            border: `2px solid ${params.buyMode === m.key ? G : BORDER}`,
            background: params.buyMode === m.key ? G : "transparent",
          }} />
          <div>
            <p style={{ fontSize: 13, color: params.buyMode === m.key ? G : MID }}>{m.label}</p>
            <p style={{ fontSize: 10, color: DIM }}>{m.desc}</p>
          </div>
        </div>
      ))}

      {/* 止损止盈 */}
      <p style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 2, marginTop: 14 }}>止损 / 止盈</p>
      <ParamRow label="止损比例" value={params.stopLossPercent} unit="%"
        min={3} max={15} step={1} onChange={v => set("stopLossPercent", v)}
        description="亏损超过此比例触发止损（正数）" />
      <ParamRow label="止盈比例" value={params.takeProfitPercent} unit="%"
        min={5} max={50} step={5} onChange={v => set("takeProfitPercent", v)} />
      <ParamRow label="时间止损" value={params.timeStopDays} unit="天"
        min={2} max={20} step={1} onChange={v => set("timeStopDays", v)}
        description="买入后超过此天数未止损/止盈则强制卖出" />

      {/* 仓位 */}
      <p style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 2, marginTop: 14 }}>仓位管理</p>
      <ParamRow label="单只最大仓位" value={params.maxSinglePositionRatio} unit="%"
        min={1} max={5} step={0.5} onChange={v => set("maxSinglePositionRatio", v)} />
      <ParamRow label="策略总仓位" value={params.maxTotalPositionRatio} unit="%"
        min={5} max={30} step={5} onChange={v => set("maxTotalPositionRatio", v)} />

      {/* 其他开关 */}
      <p style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 2, marginTop: 14 }}>其他条件</p>
      <ToggleRow label="要求资金流转正"
        value={params.requireMoneyFlow}
        description="资金流数据可能不可用，默认关闭"
        onChange={v => set("requireMoneyFlow", v)} />
      <ToggleRow label="要求公告数据"
        value={params.requireAnnouncementData}
        description="公告数据暂未接入，开启将导致所有股票被过滤"
        onChange={v => set("requireAnnouncementData", v)} />

      {/* 重置 */}
      <button
        onClick={() => onChange(DEFAULT_PARAMS)}
        style={{
          width: "100%", marginTop: 20, padding: "10px 0",
          borderRadius: 10, border: `1px solid ${BORDER}`,
          background: "#0a1628", color: DIM, fontSize: 13, cursor: "pointer",
        }}
      >恢复默认参数</button>
    </div>
  );
}

// ── 主页 ─────────────────────────────────────────────────────────
export default function STLimitDownFirstLimitUpPage() {
  const [tab, setTab]       = useState<MainTab>("pool");
  const [params, setParams] = useState<STFirstLimitUpParams>(DEFAULT_PARAMS);

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="ST 首板策略" showBack />

      {/* 高风险警告 */}
      <div style={{
        margin: "12px 16px 0",
        background: "rgba(239,68,68,0.06)", border: `1px solid ${R}33`,
        borderRadius: 12, padding: "10px 12px",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AlertTriangle size={14} color={R} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: MID, lineHeight: 1.7 }}>
            <span style={{ color: R, fontWeight: 700 }}>ST 连续跌停后首板策略属于高风险策略。</span>
            连续跌停后的首个涨停可能是假反弹，后续仍可能继续跌停、停牌、退市或无法卖出。
            本策略仅用于回测、模拟和研究，
            <span style={{ color: Y, fontWeight: 700 }}>不构成投资建议。</span>
          </p>
        </div>
      </div>

      {/* 策略摘要 */}
      <div style={{
        margin: "12px 16px 0",
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: "12px 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Info size={14} color={B} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>策略概况</span>
          <span style={{
            fontSize: 10, marginLeft: "auto",
            background: "rgba(239,68,68,0.12)", borderRadius: 4, padding: "2px 6px",
            color: R, border: `1px solid ${R}33`,
          }}>极高风险 · 含买入信号</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
          {[
            { label: "策略类型",   value: "ST 专题",     color: "#F1F5F9" },
            { label: "市场",       value: "A 股",        color: "#F1F5F9" },
            { label: "跌停区间",   value: `${params.minLimitDownStreak} – ${params.maxLimitDownStreak} 板`, color: R },
            { label: "买入方式",   value: params.buyMode === "nextOpen" ? "次日开盘" : params.buyMode === "close" ? "当天收盘" : params.buyMode === "nextDip" ? "次日回调" : "只观察", color: G },
            { label: "止损",       value: `-${params.stopLossPercent}%`,  color: R },
            { label: "止盈",       value: `+${params.takeProfitPercent}%`, color: G },
            { label: "仓位上限",   value: `${params.maxSinglePositionRatio}% / 只`, color: MID },
            { label: "总仓位",     value: `${params.maxTotalPositionRatio}%`,        color: MID },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p style={{ fontSize: 10, color: DIM }}>{label}</p>
              <p style={{ fontSize: 12, fontWeight: 600, color, marginTop: 1 }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 标签栏 */}
      <div style={{
        display: "flex", gap: 0, margin: "14px 16px 0",
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 10, overflow: "hidden",
      }}>
        {TABS.map(t => {
          const isActive = t.key === tab;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "9px 4px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              fontSize: 12, fontWeight: isActive ? 700 : 500,
              color: isActive ? "#07111F" : DIM,
              background: isActive ? G : "transparent",
              border: "none", cursor: "pointer",
            }}>
              {t.icon}{t.label}
            </button>
          );
        })}
      </div>

      {/* 标签内容 */}
      <div style={{ marginTop: 12 }}>
        {tab === "pool"     && <CandidatePool params={params} />}
        {tab === "backtest" && <SingleBacktest params={params} />}
        {tab === "params"   && <ParamsPanel params={params} onChange={setParams} />}
      </div>

      {/* 免责声明 */}
      <div style={{
        margin: "8px 16px 24px",
        background: "rgba(239,68,68,0.04)", border: `1px solid ${R}22`,
        borderRadius: 10, padding: "10px 12px",
      }}>
        <p style={{ fontSize: 10, color: DIM, lineHeight: 1.7 }}>
          ⚠️ 数据来源：Tushare 历史行情数据。公告数据暂未接入，重组/修复预期判断已降级。
          本策略为极高风险研究工具，ST 连续跌停股票退市风险极高，
          历史回测不代表未来收益，不构成任何投资建议。
        </p>
      </div>
    </div>
  );
}
