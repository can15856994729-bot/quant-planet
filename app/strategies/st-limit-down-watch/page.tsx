"use client";
/**
 * A股 ST 连续跌停观察策略 — 策略主页
 *
 * ⚠️ 本策略为纯观察池策略，不产生任何买入信号，不构成投资建议。
 * 所有入池股票均显示「观察中，暂不买入」。
 */

import { useState } from "react";
import { AlertTriangle, Eye, TrendingDown, Settings, BookOpen, Info } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import WatchPool from "./WatchPool";
import SingleAnalysis from "./SingleAnalysis";
import type { STLimitDownWatchParams } from "@/lib/stLimitDownWatchService";

// ── 颜色常量 ─────────────────────────────────────────────────────
const R      = "#EF4444";
const Y      = "#FACC15";
const G      = "#00E5A8";
const B      = "#3B82F6";
const DIM    = "#64748B";
const MID    = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";
const BG     = "#07111F";

// ── 默认参数 ─────────────────────────────────────────────────────
const DEFAULT_PARAMS: STLimitDownWatchParams = {
  minLimitDownStreak:       5,
  maxLimitDownStreak:       50,
  maxDelistingRiskScore:    40,
  requireNotBottomed:       true,
  enableRestructuringScore: true,
  requireAnnouncementData:  false,
  excludeLongSuspended:     true,
  excludeDelistingPeriod:   true,
  excludeNegativeNetAssets: true,
  requireCompleteFinancials: false,
  autoSavePool:             true,
};

type MainTab = "pool" | "single" | "params";

const TABS: { key: MainTab; label: string; icon: React.ReactNode }[] = [
  { key: "pool",   label: "连续跌停观察池", icon: <Eye size={13} /> },
  { key: "single", label: "单只股票分析",   icon: <TrendingDown size={13} /> },
  { key: "params", label: "参数设置",        icon: <Settings size={13} /> },
];

// ── 参数行 ───────────────────────────────────────────────────────
function ParamRow({
  label, value, unit, min, max, step, onChange,
}: {
  label: string; value: number; unit: string;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: `1px solid ${BORDER}`,
    }}>
      <span style={{ fontSize: 13, color: MID }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(10)))}
          style={{
            width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`,
            background: "#0a1628", color: MID, fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >−</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", minWidth: 36, textAlign: "center" }}>
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
  );
}

// ── 开关行 ───────────────────────────────────────────────────────
function ToggleRow({
  label, value, onChange, description,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void; description?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      padding: "10px 0", borderBottom: `1px solid ${BORDER}`,
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, color: MID }}>{label}</p>
        {description && (
          <p style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 11, cursor: "pointer", flexShrink: 0, marginLeft: 8,
          background: value ? G : BORDER, border: "none", position: "relative", transition: "background 0.2s",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: value ? 20 : 4,
          width: 16, height: 16, borderRadius: 8, background: "#fff",
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}

// ── 参数设置面板 ──────────────────────────────────────────────────
function ParamsPanel({
  params, onChange,
}: {
  params: STLimitDownWatchParams;
  onChange: (p: STLimitDownWatchParams) => void;
}) {
  function set<K extends keyof STLimitDownWatchParams>(key: K, val: STLimitDownWatchParams[K]) {
    onChange({ ...params, [key]: val });
  }
  return (
    <div style={{ padding: "0 16px 24px" }}>

      {/* 策略说明卡 */}
      <div style={{
        background: "rgba(59,130,246,0.06)", border: `1px solid ${B}33`,
        borderRadius: 12, padding: "12px 14px", marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <BookOpen size={14} color={B} />
          <span style={{ fontSize: 13, fontWeight: 700, color: B }}>策略说明</span>
        </div>
        <p style={{ fontSize: 12, color: MID, lineHeight: 1.7 }}>
          本策略专注于筛选连续跌停 5–50 板、尚未见底的 ST 股票进入观察池。
          <br />
          <span style={{ color: Y }}>⚠️ 所有入池股票均显示「观察中，暂不买入」，不产生任何买入信号。</span>
        </p>
      </div>

      {/* 跌停区间 */}
      <p style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 4, marginTop: 8 }}>
        连续跌停板数
      </p>
      <ParamRow
        label="最少连续跌停" value={params.minLimitDownStreak} unit="板"
        min={3} max={20} step={1}
        onChange={v => set("minLimitDownStreak", v)}
      />
      <ParamRow
        label="最多连续跌停" value={params.maxLimitDownStreak} unit="板"
        min={10} max={100} step={5}
        onChange={v => set("maxLimitDownStreak", v)}
      />

      {/* 风险过滤 */}
      <p style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 4, marginTop: 16 }}>
        退市风险过滤
      </p>
      <ParamRow
        label="最大退市风险分" value={params.maxDelistingRiskScore} unit="分"
        min={20} max={80} step={5}
        onChange={v => set("maxDelistingRiskScore", v)}
      />

      {/* 观察条件 */}
      <p style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 4, marginTop: 16 }}>
        观察条件
      </p>
      <ToggleRow
        label="要求尚未见底"
        value={params.requireNotBottomed}
        description="过滤已出现底部信号的股票，聚焦跌停尚未结束的标的"
        onChange={v => set("requireNotBottomed", v)}
      />
      <ToggleRow
        label="启用重组预期评分"
        value={params.enableRestructuringScore}
        description="仅基于财务改善计算（无公告数据时为估算值）"
        onChange={v => set("enableRestructuringScore", v)}
      />

      {/* 排除条件 */}
      <p style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 4, marginTop: 16 }}>
        排除条件
      </p>
      <ToggleRow
        label="排除长期停牌"
        value={params.excludeLongSuspended}
        description="排除停牌时间过长、无近期交易数据的股票"
        onChange={v => set("excludeLongSuspended", v)}
      />
      <ToggleRow
        label="排除退市整理期"
        value={params.excludeDelistingPeriod}
        description="排除已进入退市整理期的股票"
        onChange={v => set("excludeDelistingPeriod", v)}
      />
      <ToggleRow
        label="排除净资产为负"
        value={params.excludeNegativeNetAssets}
        description="净资产持续为负的股票退市风险极高"
        onChange={v => set("excludeNegativeNetAssets", v)}
      />
      <ToggleRow
        label="需要完整财务数据"
        value={params.requireCompleteFinancials}
        description="关闭此项将保留财务数据不全的股票（增加候选数量但降低可靠性）"
        onChange={v => set("requireCompleteFinancials", v)}
      />
      <ToggleRow
        label="自动保存扫描结果到观察池"
        value={params.autoSavePool}
        description="扫描完成后自动将候选股票保存到本地观察池"
        onChange={v => set("autoSavePool", v)}
      />

      {/* 重置 */}
      <button
        onClick={() => onChange(DEFAULT_PARAMS)}
        style={{
          width: "100%", marginTop: 20, padding: "10px 0",
          borderRadius: 10, border: `1px solid ${BORDER}`,
          background: "#0a1628", color: DIM, fontSize: 13,
          cursor: "pointer",
        }}
      >
        恢复默认参数
      </button>
    </div>
  );
}

// ── 主页 ─────────────────────────────────────────────────────────
export default function STLimitDownWatchPage() {
  const [tab, setTab]       = useState<MainTab>("pool");
  const [params, setParams] = useState<STLimitDownWatchParams>(DEFAULT_PARAMS);

  return (
    <div style={{ background: BG, minHeight: "100vh" }}>
      <PageHeader title="ST 连续跌停观察策略" showBack />

      {/* ── 高风险警告 ─────────────────────────────────────────── */}
      <div style={{
        margin: "12px 16px 0",
        background: "rgba(239,68,68,0.06)", border: `1px solid ${R}33`,
        borderRadius: 12, padding: "10px 12px",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AlertTriangle size={14} color={R} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: MID, lineHeight: 1.7 }}>
            <span style={{ color: R, fontWeight: 700 }}>极高风险研究策略</span>
            ：ST 连续跌停观察策略属于高风险研究工具，仅供学习研究。
            连续跌停股票可能继续跌停、停牌或退市，流动性极差，不构成投资建议。
            <br />
            <span style={{ color: Y, fontWeight: 700 }}>本策略不产生买入信号，所有标的仅为「观察」状态。</span>
          </p>
        </div>
      </div>

      {/* ── 策略摘要卡 ─────────────────────────────────────────── */}
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
          }}>极高风险 · 纯观察</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
          {[
            { label: "策略类型",   value: "ST 专题",       color: "#F1F5F9" },
            { label: "市场",       value: "A 股",          color: "#F1F5F9" },
            { label: "跌停区间",   value: "5 – 50 板",     color: R },
            { label: "当前状态",   value: "观察中，暂不买入", color: Y },
            { label: "买入信号",   value: "无（永不产生）",  color: DIM },
            { label: "退市风险阈值", value: `≤ ${params.maxDelistingRiskScore} 分`, color: MID },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p style={{ fontSize: 10, color: DIM }}>{label}</p>
              <p style={{ fontSize: 12, fontWeight: 600, color, marginTop: 1 }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 标签栏 ─────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 0, margin: "14px 16px 0",
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 10, overflow: "hidden",
      }}>
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "9px 4px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                color: isActive ? "#07111F" : DIM,
                background: isActive ? G : "transparent",
                border: "none", cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── 标签内容 ────────────────────────────────────────────── */}
      <div style={{ marginTop: 12 }}>
        {tab === "pool"   && <WatchPool params={params} />}
        {tab === "single" && <SingleAnalysis params={params} />}
        {tab === "params" && <ParamsPanel params={params} onChange={setParams} />}
      </div>

      {/* ── 免责声明 ─────────────────────────────────────────────── */}
      <div style={{
        margin: "8px 16px 24px",
        background: "rgba(239,68,68,0.04)", border: `1px solid ${R}22`,
        borderRadius: 10, padding: "10px 12px",
      }}>
        <p style={{ fontSize: 10, color: DIM, lineHeight: 1.7 }}>
          ⚠️ 本页面数据来源于 Tushare 行情数据，仅供研究和学习，不构成投资建议。
          ST 连续跌停股票退市风险极高，历史分析不代表未来走势。
          本策略不产生买入点位，所有「观察池」股票均处于「观察中，暂不买入」状态。
        </p>
      </div>
    </div>
  );
}
