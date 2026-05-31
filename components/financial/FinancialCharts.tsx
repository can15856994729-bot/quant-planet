"use client";

/**
 * FinancialCharts — 财报趋势图表集合
 *
 * 导出：
 *   RevenueProfit  — 营收+净利润柱+折线组合图
 *   RoeMarginsLine — ROE/毛利率/净利率折线图
 *   CashFlowBar    — 三大现金流柱状图（正负颜色区分）
 *   DebtRatioLine  — 资产负债率/流动比率折线图
 */

import {
  ComposedChart, Bar, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
  AreaChart, Area,
} from "recharts";
import { CHART, TT_STYLE, TT_LABEL_STYLE } from "@/lib/chartConstants";

// ── 公用样式 ─────────────────────────────────────────────────────────
const CARD_STYLE = {
  background: "#0d1f3c",
  border:     "1px solid #1a2f50",
  borderRadius: 16,
  padding:    "12px",
};

// ── 辅助：格式化金额 ──────────────────────────────────────────────────
function fmtY(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}万亿`;
  if (abs >= 1e8)  return `${(v / 1e8).toFixed(0)}亿`;
  if (abs >= 1e4)  return `${(v / 1e4).toFixed(0)}万`;
  return `${v.toFixed(0)}`;
}

// ── 数据类型 ──────────────────────────────────────────────────────────
export interface RevProfitPoint {
  period:   string;  // "24年", "24Q3", "24半" …
  revenue:  number | null;
  profit:   number | null;
}

export interface MarginPoint {
  period: string;
  roe:   number | null;
  gm:    number | null;
  nm:    number | null;
}

export interface CashFlowPoint {
  period: string;
  ocf:    number | null;  // 经营活动
  icf:    number | null;  // 投资活动
  fcf:    number | null;  // 筹资活动
}

export interface DebtRatioPoint {
  period:       string;
  debtRatio:    number | null;  // %
  currentRatio: number | null;  // x
}

// ── 1. 营收 + 净利润 ─────────────────────────────────────────────────
export function RevenueProfit({ data }: { data: RevProfitPoint[] }) {
  if (!data.length) return <EmptyChart label="暂无营收数据" />;
  return (
    <div style={CARD_STYLE}>
      <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>
        营收 &amp; 净利润趋势
      </p>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <LI color="#3B82F6" label="营收" bar />
        <LI color="#00E5A8" label="净利润" />
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
          <XAxis dataKey="period" tick={{ fill: CHART.AXIS, fontSize: 9 }} />
          <YAxis tick={{ fill: CHART.AXIS, fontSize: 8 }} tickFormatter={fmtY} />
          <Tooltip
            contentStyle={TT_STYLE}
            labelStyle={TT_LABEL_STYLE}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((v: unknown, n: unknown) => {
              const label = String(n) === "revenue" ? "营收" : "净利润";
              return [typeof v === "number" ? fmtY(v) : "—", label];
            }) as any}
          />
          <Bar dataKey="revenue" fill="#3B82F6" opacity={0.7} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Line dataKey="profit" stroke="#00E5A8" strokeWidth={2} dot={{ r: 3, fill: "#00E5A8" }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 2. ROE / 毛利率 / 净利率 ─────────────────────────────────────────
export function RoeMarginsLine({ data }: { data: MarginPoint[] }) {
  if (!data.length) return <EmptyChart label="暂无盈利能力数据" />;
  return (
    <div style={CARD_STYLE}>
      <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>
        盈利能力趋势（%）
      </p>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <LI color="#00E5A8" label="ROE" />
        <LI color="#3B82F6" label="毛利率" />
        <LI color="#A78BFA" label="净利率" />
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
          <XAxis dataKey="period" tick={{ fill: CHART.AXIS, fontSize: 9 }} />
          <YAxis tick={{ fill: CHART.AXIS, fontSize: 8 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
          <Tooltip
            contentStyle={TT_STYLE}
            labelStyle={TT_LABEL_STYLE}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((v: unknown, n: unknown) => {
              const m: Record<string, string> = { roe: "ROE", gm: "毛利率", nm: "净利率" };
              return [`${typeof v === "number" ? v.toFixed(2) : "—"}%`, m[String(n)] ?? String(n)];
            }) as any}
          />
          <Line dataKey="roe" stroke="#00E5A8" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          <Line dataKey="gm"  stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          <Line dataKey="nm"  stroke="#A78BFA" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 3. 三大现金流 ─────────────────────────────────────────────────────
export function CashFlowBar({ data }: { data: CashFlowPoint[] }) {
  if (!data.length) return <EmptyChart label="暂无现金流数据" />;
  return (
    <div style={CARD_STYLE}>
      <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>
        三大现金流趋势
      </p>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <LI color="#00E5A8" label="经营" bar />
        <LI color="#EF4444" label="投资" bar />
        <LI color="#FACC15" label="筹资" bar />
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
          <XAxis dataKey="period" tick={{ fill: CHART.AXIS, fontSize: 9 }} />
          <YAxis tick={{ fill: CHART.AXIS, fontSize: 8 }} tickFormatter={fmtY} />
          <Tooltip
            contentStyle={TT_STYLE}
            labelStyle={TT_LABEL_STYLE}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((v: unknown, n: unknown) => {
              const m: Record<string, string> = { ocf: "经营现金流", icf: "投资现金流", fcf: "筹资现金流" };
              return [typeof v === "number" ? fmtY(v) : "—", m[String(n)] ?? String(n)];
            }) as any}
          />
          <ReferenceLine y={0} stroke={CHART.GRID} />
          <Bar dataKey="ocf" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={(d.ocf ?? 0) >= 0 ? "#00E5A8" : "#EF4444"} opacity={0.85} />)}
          </Bar>
          <Line dataKey="icf" stroke="#EF4444" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="3 2" isAnimationActive={false} />
          <Line dataKey="fcf" stroke="#FACC15" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="3 2" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 4. 资产负债率 / 流动比率 ──────────────────────────────────────────
export function DebtRatioLine({ data }: { data: DebtRatioPoint[] }) {
  if (!data.length) return <EmptyChart label="暂无财务安全数据" />;

  // 双 Y 轴简化：仅用一个 YAxis，把 currentRatio 缩放到相近量级
  // debtRatio (0-100%) vs currentRatio (0-5x) — 分别显示
  return (
    <div style={CARD_STYLE}>
      <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>
        资产负债率趋势（%）
      </p>
      <div className="flex items-center gap-3 mb-2">
        <LI color="#EF4444" label="资负率(%)" />
        <LI color="#3B82F6" label="流动比(x×20)" />
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data.map(d => ({
          ...d,
          currentRatioScaled: d.currentRatio != null ? d.currentRatio * 20 : null,
        }))} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="drGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#EF4444" stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
          <XAxis dataKey="period" tick={{ fill: CHART.AXIS, fontSize: 9 }} />
          <YAxis tick={{ fill: CHART.AXIS, fontSize: 8 }} tickFormatter={(v: number) => `${v.toFixed(0)}`} />
          <Tooltip
            contentStyle={TT_STYLE}
            labelStyle={TT_LABEL_STYLE}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((v: unknown, n: unknown) => {
              if (String(n) === "debtRatio")           return [`${typeof v === "number" ? v.toFixed(1) : "—"}%`, "资负率"];
              if (String(n) === "currentRatioScaled")  return [`${typeof v === "number" ? (v/20).toFixed(2) : "—"}x`, "流动比"];
              return [String(v), String(n)];
            }) as any}
          />
          <Area type="monotone" dataKey="debtRatio" stroke="#EF4444" strokeWidth={2}
            fill="url(#drGrad)" dot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="currentRatioScaled" stroke="#3B82F6" strokeWidth={1.5}
            dot={{ r: 2 }} strokeDasharray="3 2" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 空状态 ────────────────────────────────────────────────────────────
function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-8 rounded-2xl"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <p className="text-[11px]" style={{ color: "#64748B" }}>{label}</p>
    </div>
  );
}

// ── 图例辅助 ──────────────────────────────────────────────────────────
function LI({ color, label, bar }: { color: string; label: string; bar?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {bar
        ? <div className="w-3 h-2.5 rounded-sm" style={{ background: color, opacity: 0.85 }} />
        : <div className="w-4 h-0.5" style={{ background: color }} />
      }
      <span className="text-[10px]" style={{ color: "#94A3B8" }}>{label}</span>
    </div>
  );
}
