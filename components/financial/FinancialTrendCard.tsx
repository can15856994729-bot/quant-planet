"use client";

/**
 * FinancialTrendCard — A股财报趋势分析模块
 *
 * 数据来源：/api/stocks/[symbol]/financials/trends
 *   → Tushare income + fina_indicator + cashflow + balancesheet
 *
 * 展示内容（近 4 期，升序图表）：
 *  - 营收趋势 / 净利润 & 扣非净利润趋势 / ROE 趋势
 *  - 毛利率趋势 / 经营现金流趋势 / 资产负债率趋势
 *  - 整体趋势综合评价（基本面改善/稳定/恶化/混合/数据不足）
 *  - 趋势驱动的风险提示
 *
 * 颜色约定：正值=红（A股涨=红），负值=绿；改善=绿色标签，恶化=红色标签
 *
 * 安全约束：只调用本应用 API Route，不直接访问 TUSHARE_TOKEN。
 */

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, ReferenceLine,
} from "recharts";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Info,
} from "lucide-react";

// ── 类型 ──────────────────────────────────────────────────────────────

type TrendDir   = "improving" | "worsening" | "stable" | "volatile" | "insufficient_data";
type OverallDir = "improving" | "worsening" | "stable" | "mixed"    | "insufficient_data";
type TabKey     = "revenue" | "profit" | "roe" | "grossMargin" | "cashflow" | "debt";

interface TrendPeriod {
  reportDate:        string;
  period:            string;
  revenue:           number | null;
  netProfit:         number | null;
  deductedNetProfit: number | null;
  roe:               number | null;
  grossMargin:       number | null;
  operatingCashflow: number | null;
  debtToAssets:      number | null;
  missingFields:     string[];
}

interface TrendAnalysis {
  revenueTrend:           TrendDir;
  netProfitTrend:         TrendDir;
  deductedNetProfitTrend: TrendDir;
  roeTrend:               TrendDir;
  grossMarginTrend:       TrendDir;
  operatingCashflowTrend: TrendDir;
  debtToAssetsTrend:      TrendDir;
  overallTrend:           OverallDir;
}

interface ApiResp {
  ok:            boolean;
  symbol?:       string;
  tsCode?:       string;
  periods:       TrendPeriod[];
  trendAnalysis: TrendAnalysis;
  riskWarnings:  string[];
  fromCache?:    boolean;
  error?:        string;
  updatedAt:     string;
  incomeStatus?:   string;
  finaStatus?:     string;
  cashflowStatus?: string;
  balanceStatus?:  string;
}

interface Props {
  symbol:    string;
  stockName: string;
}

// ── 格式化工具 ────────────────────────────────────────────────────────

/** 报告期简写："2024年三季报" → "24Q3" */
function shortPeriod(p: string): string {
  const y = (p.match(/^(\d{4})/) ?? [])[1]?.slice(2) ?? "";
  if (p.includes("年报"))   return `${y}年报`;
  if (p.includes("三季报")) return `${y}Q3`;
  if (p.includes("半年报")) return `${y}H1`;
  if (p.includes("一季报")) return `${y}Q1`;
  return p.slice(0, 6);
}

/** 元 → 亿（用于图表数据点） */
function toYi(v: number | null): number | null {
  if (v == null) return null;
  return +(v / 1e8).toFixed(2);
}

/** 元 → 亿（格式化显示） */
function fmtYi(v: number | null): string {
  if (v == null) return "—";
  return `${(v / 1e8).toFixed(1)}亿`;
}

/** 百分数格式化 */
function fmtPct(v: number | null, d = 2): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(d)}%`;
}

/** 小数资负率 → % 格式 */
function fmtDebt(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

// ── 趋势方向标签 ──────────────────────────────────────────────────────

type TrendCfg = { label: string; color: string; bg: string };

const TREND_CFG: Record<TrendDir, TrendCfg> = {
  improving:         { label: "改善↑", color: "#00E5A8", bg: "rgba(0,229,168,0.1)"   },
  worsening:         { label: "恶化↓", color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  stable:            { label: "稳定",  color: "#FACC15", bg: "rgba(250,204,21,0.1)"  },
  volatile:          { label: "波动",  color: "#F97316", bg: "rgba(249,115,22,0.1)"  },
  insufficient_data: { label: "不足",  color: "#94A3B8", bg: "rgba(148,163,184,0.1)" },
};

function TrendBadge({ trend }: { trend: TrendDir }) {
  const c = TREND_CFG[trend];
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ color: c.color, background: c.bg, flexShrink: 0 }}>
      {c.label}
    </span>
  );
}

// ── 整体趋势大标签 ────────────────────────────────────────────────────

const OVERALL_CFG: Record<OverallDir, { label: string; color: string; bg: string; border: string }> = {
  improving:         { label: "基本面改善", color: "#00E5A8", bg: "rgba(0,229,168,0.1)",   border: "rgba(0,229,168,0.3)"   },
  worsening:         { label: "基本面恶化", color: "#EF4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)"   },
  stable:            { label: "基本面稳定", color: "#FACC15", bg: "rgba(250,204,21,0.1)",  border: "rgba(250,204,21,0.3)"  },
  mixed:             { label: "信号混合",   color: "#F97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.3)"  },
  insufficient_data: { label: "数据不足",   color: "#94A3B8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.2)" },
};

function OverallBadge({ trend }: { trend: OverallDir }) {
  const c = OVERALL_CFG[trend];
  const Icon =
    trend === "improving" ? TrendingUp  :
    trend === "worsening" ? TrendingDown : Minus;
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
      <Icon size={13} />
      {c.label}
    </div>
  );
}

// ── Tab 配置 ──────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; trendKey: keyof TrendAnalysis }[] = [
  { key: "revenue",     label: "营收",  trendKey: "revenueTrend"           },
  { key: "profit",      label: "利润",  trendKey: "netProfitTrend"         },
  { key: "roe",         label: "ROE",   trendKey: "roeTrend"               },
  { key: "grossMargin", label: "毛利率", trendKey: "grossMarginTrend"      },
  { key: "cashflow",    label: "现金流", trendKey: "operatingCashflowTrend" },
  { key: "debt",        label: "负债率", trendKey: "debtToAssetsTrend"     },
];

// ── 图表公共配置 ──────────────────────────────────────────────────────

const CHART_H   = 150;
const CHART_MRG = { top: 8, right: 6, bottom: 0, left: -14 };
const AXIS_ST   = { fill: "#94A3B8", fontSize: 10 };

/** 自定义 Tooltip 内容（避免 Recharts formatter TypeScript 类型问题） */
function ChartTooltip({ active, payload, label }: {
  active?:  boolean;
  payload?: Array<{ value: unknown; name?: unknown; color?: string }>;
  label?:   unknown;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-2 py-1.5 rounded text-[11px] space-y-0.5"
      style={{ background: "#1a2f50", border: "1px solid #2a4080", color: "#F8FAFC" }}>
      <div className="font-medium" style={{ color: "#94A3B8" }}>{String(label ?? "")}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? "#F8FAFC" }}>
          {p.name ? `${String(p.name)}: ` : ""}
          {p.value != null ? Number(p.value).toFixed(2) : "—"}
        </div>
      ))}
    </div>
  );
}

// ── 小数据表 ──────────────────────────────────────────────────────────

function MiniTable({ periods, cols }: {
  periods: TrendPeriod[];
  cols: { label: string; getValue: (p: TrendPeriod) => number | null; fmt: (v: number | null) => string }[];
}) {
  return (
    <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid #1a2f50" }}>
      <table className="w-full text-[10px]">
        <thead>
          <tr style={{ background: "#07111F" }}>
            <th className="py-1.5 px-2 text-left font-medium" style={{ color: "#64748B" }}>期间</th>
            {cols.map(c => (
              <th key={c.label} className="py-1.5 px-2 text-right font-medium"
                style={{ color: "#64748B" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p, i) => (
            <tr key={p.reportDate}
              style={{ borderTop: i > 0 ? "1px solid #1a2f50" : undefined }}>
              <td className="py-1.5 px-2" style={{ color: "#94A3B8" }}>
                {shortPeriod(p.period)}
              </td>
              {cols.map(c => {
                const v = c.getValue(p);
                return (
                  <td key={c.label} className="py-1.5 px-2 text-right font-mono"
                    style={{ color: v != null ? "#F8FAFC" : "#475569" }}>
                    {c.fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 各 Tab 图表 ───────────────────────────────────────────────────────

function RevenueTab({ periods, trend }: { periods: TrendPeriod[]; trend: TrendDir }) {
  const data = periods.map(p => ({ label: shortPeriod(p.period), value: toYi(p.revenue) }));
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px]" style={{ color: "#94A3B8" }}>营业收入（亿元）</span>
        <TrendBadge trend={trend} />
      </div>
      <ResponsiveContainer width="100%" height={CHART_H}>
        <BarChart data={data} margin={CHART_MRG}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
          <XAxis dataKey="label" tick={AXIS_ST} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_ST} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="value" name="营收(亿)" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value != null && d.value >= 0 ? "#EF4444" : "#00E5A8"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <MiniTable periods={periods} cols={[
        { label: "营收(亿)", getValue: p => p.revenue, fmt: fmtYi },
      ]} />
    </div>
  );
}

function ProfitTab({
  periods, profitTrend, deductedTrend,
}: { periods: TrendPeriod[]; profitTrend: TrendDir; deductedTrend: TrendDir }) {
  const data = periods.map(p => ({
    label:    shortPeriod(p.period),
    净利润:   toYi(p.netProfit),
    扣非净利: toYi(p.deductedNetProfit),
  }));
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[11px]" style={{ color: "#94A3B8" }}>净利润</span>
        <TrendBadge trend={profitTrend} />
        <span className="text-[11px]" style={{ color: "#94A3B8" }}>扣非</span>
        <TrendBadge trend={deductedTrend} />
      </div>
      <ResponsiveContainer width="100%" height={CHART_H}>
        <LineChart data={data} margin={CHART_MRG}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
          <XAxis dataKey="label" tick={AXIS_ST} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_ST} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="净利润"   stroke="#EF4444" strokeWidth={2}
            dot={{ r: 3, fill: "#EF4444" }} connectNulls />
          <Line type="monotone" dataKey="扣非净利" stroke="#3B82F6" strokeWidth={2}
            dot={{ r: 3, fill: "#3B82F6" }} connectNulls strokeDasharray="5 3" />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex gap-3 mt-1 mb-1">
        <span className="text-[10px] flex items-center gap-1" style={{ color: "#EF4444" }}>
          <span className="inline-block w-4 h-0.5" style={{ background: "#EF4444" }} /> 净利润
        </span>
        <span className="text-[10px] flex items-center gap-1" style={{ color: "#3B82F6" }}>
          <span className="inline-block w-4 h-0.5" style={{ background: "#3B82F6" }} /> 扣非净利润
        </span>
      </div>
      <MiniTable periods={periods} cols={[
        { label: "净利润(亿)",  getValue: p => p.netProfit,         fmt: fmtYi },
        { label: "扣非(亿)",    getValue: p => p.deductedNetProfit, fmt: fmtYi },
      ]} />
    </div>
  );
}

function RoeTab({ periods, trend }: { periods: TrendPeriod[]; trend: TrendDir }) {
  const data = periods.map(p => ({ label: shortPeriod(p.period), value: p.roe }));
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px]" style={{ color: "#94A3B8" }}>ROE（%）</span>
        <TrendBadge trend={trend} />
      </div>
      <ResponsiveContainer width="100%" height={CHART_H}>
        <LineChart data={data} margin={CHART_MRG}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
          <XAxis dataKey="label" tick={AXIS_ST} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_ST} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="value" name="ROE%" stroke="#FACC15" strokeWidth={2}
            dot={{ r: 3, fill: "#FACC15" }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <MiniTable periods={periods} cols={[
        { label: "ROE%", getValue: p => p.roe, fmt: v => fmtPct(v) },
      ]} />
    </div>
  );
}

function GrossMarginTab({ periods, trend }: { periods: TrendPeriod[]; trend: TrendDir }) {
  const data = periods.map(p => ({ label: shortPeriod(p.period), value: p.grossMargin }));
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px]" style={{ color: "#94A3B8" }}>毛利率（%）</span>
        <TrendBadge trend={trend} />
      </div>
      <ResponsiveContainer width="100%" height={CHART_H}>
        <LineChart data={data} margin={CHART_MRG}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
          <XAxis dataKey="label" tick={AXIS_ST} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_ST} axisLine={false} tickLine={false} width={36}
            domain={["auto", "auto"]} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="value" name="毛利率%" stroke="#00E5A8" strokeWidth={2}
            dot={{ r: 3, fill: "#00E5A8" }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <MiniTable periods={periods} cols={[
        { label: "毛利率%", getValue: p => p.grossMargin, fmt: v => fmtPct(v) },
      ]} />
    </div>
  );
}

function CashflowTab({ periods, trend }: { periods: TrendPeriod[]; trend: TrendDir }) {
  const data = periods.map(p => ({
    label: shortPeriod(p.period),
    value: toYi(p.operatingCashflow),
  }));
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px]" style={{ color: "#94A3B8" }}>经营现金流（亿元）</span>
        <TrendBadge trend={trend} />
      </div>
      <ResponsiveContainer width="100%" height={CHART_H}>
        <BarChart data={data} margin={CHART_MRG}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
          <XAxis dataKey="label" tick={AXIS_ST} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_ST} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
          <Bar dataKey="value" name="经营CF(亿)" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value != null && d.value >= 0 ? "#EF4444" : "#00E5A8"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <MiniTable periods={periods} cols={[
        { label: "经营现金流(亿)", getValue: p => p.operatingCashflow, fmt: fmtYi },
      ]} />
    </div>
  );
}

function DebtTab({ periods, trend }: { periods: TrendPeriod[]; trend: TrendDir }) {
  const data = periods.map(p => ({
    label: shortPeriod(p.period),
    value: p.debtToAssets != null ? +(p.debtToAssets * 100).toFixed(2) : null,
  }));
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px]" style={{ color: "#94A3B8" }}>资产负债率（%）</span>
        <TrendBadge trend={trend} />
      </div>
      <ResponsiveContainer width="100%" height={CHART_H}>
        <LineChart data={data} margin={CHART_MRG}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
          <XAxis dataKey="label" tick={AXIS_ST} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_ST} axisLine={false} tickLine={false} width={36}
            domain={[0, 100]} />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={60} stroke="#EF4444" strokeDasharray="4 2"
            label={{ value: "60%警戒", position: "right", fill: "#EF4444", fontSize: 9 }} />
          <Line type="monotone" dataKey="value" name="负债率%" stroke="#F97316" strokeWidth={2}
            dot={{ r: 3, fill: "#F97316" }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <MiniTable periods={periods} cols={[
        { label: "负债率%", getValue: p => p.debtToAssets, fmt: fmtDebt },
      ]} />
    </div>
  );
}

// ── Tab 内容分发 ──────────────────────────────────────────────────────

function TabContent({ periods, tab, analysis }: {
  periods:  TrendPeriod[];
  tab:      TabKey;
  analysis: TrendAnalysis;
}) {
  switch (tab) {
    case "revenue":     return <RevenueTab     periods={periods} trend={analysis.revenueTrend} />;
    case "profit":      return <ProfitTab      periods={periods}
                                 profitTrend={analysis.netProfitTrend}
                                 deductedTrend={analysis.deductedNetProfitTrend} />;
    case "roe":         return <RoeTab         periods={periods} trend={analysis.roeTrend} />;
    case "grossMargin": return <GrossMarginTab periods={periods} trend={analysis.grossMarginTrend} />;
    case "cashflow":    return <CashflowTab    periods={periods} trend={analysis.operatingCashflowTrend} />;
    case "debt":        return <DebtTab        periods={periods} trend={analysis.debtToAssetsTrend} />;
  }
}

// ── 骨架屏 ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-6 w-28 rounded" style={{ background: "#1a2f50" }} />
      <div className="h-8 w-full rounded" style={{ background: "#1a2f50" }} />
      <div className="h-40 w-full rounded" style={{ background: "#1a2f50" }} />
      <div className="h-20 w-full rounded" style={{ background: "#1a2f50" }} />
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────

export default function FinancialTrendCard({ symbol }: Props) {
  const [data,         setData]         = useState<ApiResp | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [fetchError,   setFetchError]   = useState<string | null>(null);
  const [activeTab,    setActiveTab]    = useState<TabKey>("revenue");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setFetchError(null);
    try {
      const url = `/api/stocks/${symbol}/financials/trends?periods=4${forceRefresh ? "&refresh=1" : ""}`;
      const res  = await fetch(url);
      const json = (await res.json()) as ApiResp;
      setData(json);
      if (!json.ok && json.error) setFetchError(json.error);
    } catch (e) {
      setFetchError(`加载失败：${String(e).slice(0, 60)}`);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    load(true);
  };

  // ── 渲染 ──────────────────────────────────────────────────────────

  return (
    <div style={{
      background: "#0d1f3c",
      border: "1px solid #1a2f50",
      borderRadius: "16px",
      padding: "16px",
    }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>
          📈 财报趋势
          {data?.fromCache && (
            <span className="ml-2 text-[10px] font-normal" style={{ color: "#94A3B8" }}>缓存</span>
          )}
        </h3>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || loading}
          className="p-1.5 rounded-lg"
          style={{ background: "#1a2f50", opacity: (isRefreshing || loading) ? 0.5 : 1 }}
        >
          <RefreshCw size={13} color="#94A3B8"
            className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── Loading ── */}
      {loading && !data && <Skeleton />}

      {/* ── Error ── */}
      {!loading && fetchError && (
        <div className="py-6 text-center space-y-2">
          <AlertTriangle size={20} color="#FACC15" className="mx-auto" />
          <p className="text-[12px]" style={{ color: "#94A3B8" }}>{fetchError}</p>
          {(fetchError.includes("权限") || fetchError.includes("TOKEN")) && (
            <p className="text-[10px]" style={{ color: "#64748B" }}>
              需要 Tushare income / fina_indicator / cashflow 接口权限
            </p>
          )}
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && data?.ok && data.periods.length === 0 && !fetchError && (
        <div className="py-6 text-center">
          <Info size={20} color="#94A3B8" className="mx-auto mb-2" />
          <p className="text-[12px]" style={{ color: "#94A3B8" }}>该股票财报趋势数据暂缺</p>
        </div>
      )}

      {/* ── 数据展示 ── */}
      {data?.ok && data.periods.length > 0 && (
        <>
          {/* 整体趋势 */}
          <div className="flex items-center gap-2 mb-3">
            <OverallBadge trend={data.trendAnalysis.overallTrend} />
            <span className="text-[11px]" style={{ color: "#64748B" }}>
              近 {data.periods.length} 期
            </span>
          </div>

          {/* Tab 栏（横向滚动，防止 6 个 tab 挤爆） */}
          <div
            className="flex gap-1 mb-3 pb-1"
            style={{ overflowX: "auto", scrollbarWidth: "none" }}
          >
            {TABS.map(tab => {
              const trendVal = data.trendAnalysis[tab.trendKey] as TrendDir;
              const isActive = activeTab === tab.key;
              const trendColor =
                trendVal === "improving" ? "#00E5A8" :
                trendVal === "worsening" ? "#EF4444" :
                trendVal === "insufficient_data" ? "#475569" : "#FACC15";

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                             flex items-center gap-1 transition-colors"
                  style={{
                    background: isActive ? "#1a3a6b" : "transparent",
                    border: `1px solid ${isActive ? "#3B82F6" : "#1a2f50"}`,
                    color: isActive ? "#F8FAFC" : "#94A3B8",
                  }}
                >
                  {tab.label}
                  {trendVal !== "insufficient_data" && (
                    <span style={{ color: trendColor, fontSize: 11, lineHeight: 1 }}>
                      {trendVal === "improving" ? "↑" :
                       trendVal === "worsening" ? "↓" : "—"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 图表 + 数据表 */}
          <TabContent
            periods={data.periods}
            tab={activeTab}
            analysis={data.trendAnalysis}
          />

          {/* 风险提示 */}
          {data.riskWarnings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-medium mb-1" style={{ color: "#64748B" }}>
                趋势风险提示
              </p>
              {data.riskWarnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 p-2 rounded-lg"
                  style={{
                    background: "rgba(239,68,68,0.05)",
                    border: "1px solid rgba(239,68,68,0.12)",
                  }}
                >
                  <AlertTriangle size={11} color="#EF4444" className="flex-shrink-0 mt-0.5" />
                  <span className="text-[11px] leading-[1.6]" style={{ color: "#94A3B8" }}>
                    {w}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 缺失字段汇总 */}
          {(() => {
            const allMissing = [...new Set(data.periods.flatMap(p => p.missingFields))];
            return allMissing.length > 0 ? (
              <p className="mt-2 text-[10px]" style={{ color: "#475569" }}>
                部分趋势字段暂缺：{allMissing.join("、")}
              </p>
            ) : null;
          })()}

          {/* 数据来源 */}
          <p className="mt-2 text-[10px]" style={{ color: "#475569" }}>
            数据来源：Tushare · {data.updatedAt.slice(0, 10)}
          </p>
        </>
      )}
    </div>
  );
}
