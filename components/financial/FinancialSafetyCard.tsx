"use client";

/**
 * FinancialSafetyCard — A股财务安全模块
 *
 * 数据来源：/api/stocks/[symbol]/financials/safety
 *   → balancesheet + fina_indicator + income（营收用于比率计算）
 *
 * 展示内容：
 *  - 最新期：资产负债表 14 项核心字段
 *  - 6 项安全比率（资负率/流动比率/速动比率/商誉占比/应收占比/存货占比）
 *  - 7 条风险预警（阈值驱动，红色/黄色徽章）
 *  - 近 4 期趋势（折叠，含 Recharts 折线图）
 *
 * 安全约束：此组件只调用本应用的 API Route，不直接访问 TUSHARE_TOKEN。
 *
 * 颜色约定（中国 A 股惯例）：
 *   正增长 / 偏高警告 → #EF4444（红）
 *   负增长 / 偏低警告 → #00E5A8（绿）
 *   中性               → #94A3B8（灰）
 */

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Lock, Info } from "lucide-react";
import type { BalanceSafetySummaryItem } from "@/lib/financialService";

// ── 类型 ──────────────────────────────────────────────────────────────

interface SafetyApiResponse {
  ok:                  boolean;
  tsCode:              string;
  symbol:              string;
  items:               BalanceSafetySummaryItem[];
  total:               number;
  balanceSheetStatus:  string;
  finaIndicatorStatus: string;
  incomeStatus:        string;
  fromCache:           boolean;
  error?:              string;
  updatedAt:           string;
}

interface Props {
  symbol:    string;
  stockName: string;
}

// ── 格式化工具 ────────────────────────────────────────────────────────

function fmtMoney(v: number | null): string {
  if (v == null) return "数据暂缺";
  const abs  = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(1)}万`;
  return `${sign}${abs.toFixed(0)}元`;
}

/** 内部 decimal → "XX.X%" */
function fmtPctDecimal(v: number | null, decimals = 1): string {
  if (v == null) return "数据暂缺";
  return `${(v * 100).toFixed(decimals)}%`;
}

/** ratio → "X.XXx" */
function fmtRatio(v: number | null): string {
  if (v == null) return "数据暂缺";
  return `${v.toFixed(2)}x`;
}

/** 取最新期的 BalanceSafetySummaryItem */
function latest(items: BalanceSafetySummaryItem[]): BalanceSafetySummaryItem | null {
  return items.length > 0 ? items[0] : null;
}

// ── 风险预警逻辑 ──────────────────────────────────────────────────────

interface RiskWarning {
  level:   "danger" | "warning";
  message: string;
}

function computeRisks(item: BalanceSafetySummaryItem): RiskWarning[] {
  const risks: RiskWarning[] = [];

  if (item.debtToAssets != null && item.debtToAssets > 0.70) {
    risks.push({ level: "danger", message: `资产负债率偏高（${fmtPctDecimal(item.debtToAssets)}），财务杠杆较大` });
  }
  if (item.currentRatio != null && item.currentRatio < 1) {
    risks.push({ level: "danger", message: `流动比率仅 ${fmtRatio(item.currentRatio)}，短期偿债压力较大` });
  }
  if (item.quickRatio != null && item.quickRatio < 0.8) {
    risks.push({ level: "warning", message: `速动比率仅 ${fmtRatio(item.quickRatio)}，速动资产不足` });
  }
  if (item.goodwillToNetAssets != null && item.goodwillToNetAssets > 0.30) {
    risks.push({ level: "warning", message: `商誉占净资产 ${fmtPctDecimal(item.goodwillToNetAssets)}，存在较高减值风险` });
  }
  if (item.receivablesToRevenue != null && item.receivablesToRevenue > 0.40) {
    risks.push({ level: "warning", message: `应收账款占收入 ${fmtPctDecimal(item.receivablesToRevenue)}，回款风险需关注` });
  }
  if (item.inventoryToRevenue != null && item.inventoryToRevenue > 0.40) {
    risks.push({ level: "warning", message: `存货占收入 ${fmtPctDecimal(item.inventoryToRevenue)}，需关注库存积压压力` });
  }
  if (
    item.monetaryFunds != null &&
    item.shortTermBorrowings != null &&
    item.shortTermBorrowings > 0 &&
    item.monetaryFunds < item.shortTermBorrowings
  ) {
    risks.push({
      level: "danger",
      message: `货币资金（${fmtMoney(item.monetaryFunds)}）不足以覆盖短期借款（${fmtMoney(item.shortTermBorrowings)}）`,
    });
  }

  return risks;
}

// ── 子组件 ────────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  valueColor,
  note,
}: {
  label:      string;
  value:      string;
  valueColor?: string;
  note?:      string;
}) {
  return (
    <div
      className="flex flex-col items-center p-2.5 rounded-xl text-center"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
    >
      <span
        className="font-bold text-[12px] num leading-tight"
        style={{ color: valueColor ?? "#F8FAFC" }}
      >
        {value}
      </span>
      <span className="text-[9px] mt-0.5" style={{ color: "#94A3B8" }}>{label}</span>
      {note && (
        <span className="text-[8px] mt-0.5" style={{ color: "#64748B" }}>{note}</span>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#64748B" }}>
      {children}
    </p>
  );
}

function RiskBadge({ risk }: { risk: RiskWarning }) {
  const bg    = risk.level === "danger" ? "rgba(239,68,68,0.10)" : "rgba(250,204,21,0.10)";
  const border = risk.level === "danger" ? "rgba(239,68,68,0.25)" : "rgba(250,204,21,0.25)";
  const color  = risk.level === "danger" ? "#EF4444" : "#FACC15";
  return (
    <div
      className="flex items-start gap-2 px-3 py-2 rounded-xl"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <AlertTriangle size={12} color={color} className="flex-shrink-0 mt-0.5" />
      <span className="text-[11px] leading-[1.6]" style={{ color }}>
        {risk.message}
      </span>
    </div>
  );
}

/** 趋势卡：横向滚动的小卡片组 */
function TrendScroll({ items }: { items: BalanceSafetySummaryItem[] }) {
  const slice = items.slice(0, 4).reverse(); // 旧 → 新
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {slice.map((it) => (
        <div
          key={it.reportDate}
          className="flex-shrink-0 rounded-xl p-2.5"
          style={{ minWidth: 120, background: "#07111F", border: "1px solid #1a2f50" }}
        >
          <p className="text-[10px] font-bold mb-1.5" style={{ color: "#94A3B8" }}>{it.period}</p>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span style={{ color: "#64748B" }}>总资产</span>
              <span className="num font-bold" style={{ color: "#F8FAFC" }}>{fmtMoney(it.totalAssets)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span style={{ color: "#64748B" }}>资负率</span>
              <span
                className="num font-bold"
                style={{ color: it.debtToAssets != null && it.debtToAssets > 0.65 ? "#EF4444" : "#F8FAFC" }}
              >
                {fmtPctDecimal(it.debtToAssets)}
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span style={{ color: "#64748B" }}>流动比</span>
              <span
                className="num font-bold"
                style={{ color: it.currentRatio != null && it.currentRatio < 1 ? "#EF4444" : "#F8FAFC" }}
              >
                {fmtRatio(it.currentRatio)}
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span style={{ color: "#64748B" }}>速动比</span>
              <span
                className="num font-bold"
                style={{ color: it.quickRatio != null && it.quickRatio < 0.8 ? "#FACC15" : "#F8FAFC" }}
              >
                {fmtRatio(it.quickRatio)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 趋势折线图 */
function SafetyTrendChart({ items }: { items: BalanceSafetySummaryItem[] }) {
  const data = [...items].reverse().slice(0, 8).map((it) => ({
    period:     it.period,
    debtPct:    it.debtToAssets != null ? +(it.debtToAssets * 100).toFixed(1) : null,
    currentR:   it.currentRatio != null ? +it.currentRatio.toFixed(2) : null,
    quickR:     it.quickRatio   != null ? +it.quickRatio.toFixed(2)   : null,
  }));

  const hasData = data.some(d => d.debtPct != null || d.currentR != null);
  if (!hasData) return null;

  return (
    <div className="mt-3 space-y-3">
      {/* 资产负债率趋势 */}
      <div>
        <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>资产负债率趋势（%）</p>
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
            <XAxis dataKey="period" tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
              formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(1)}%`, "资产负债率"]}
            />
            <Line type="monotone" dataKey="debtPct" stroke="#EF4444" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 流动/速动比率趋势 */}
      <div>
        <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>流动比率 / 速动比率趋势</p>
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
            <XAxis dataKey="period" tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
              formatter={(v: unknown, name: unknown) => {
                const label = name === "currentR" ? "流动比率" : "速动比率";
                return [`${Number(v ?? 0).toFixed(2)}x`, label];
              }}
            />
            <Line type="monotone" dataKey="currentR" stroke="#00E5A8" strokeWidth={2} dot={{ r: 2 }} name="currentR" connectNulls />
            <Line type="monotone" dataKey="quickR"   stroke="#FACC15" strokeWidth={2} dot={{ r: 2 }} name="quickR"   connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 骨架屏 ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div
      className="p-4 rounded-2xl space-y-3 animate-pulse"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
    >
      <div className="h-4 rounded w-1/3" style={{ background: "#1a2f50" }} />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl" style={{ background: "#07111F" }} />
        ))}
      </div>
      <div className="h-3 rounded w-1/2" style={{ background: "#1a2f50" }} />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl" style={{ background: "#07111F" }} />
        ))}
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────

export default function FinancialSafetyCard({ symbol, stockName }: Props) {
  const [data,       setData]       = useState<SafetyApiResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [showTrend,  setShowTrend]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);

      const url = `/api/stocks/${symbol}/financials/safety${refresh ? "?refresh=1" : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json: SafetyApiResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => { fetchData(false); }, [fetchData]);

  // ── 权限不足 ──────────────────────────────────────────────────────
  if (!loading && data && !data.ok && data.balanceSheetStatus === "permission_denied") {
    return (
      <div
        className="p-4 rounded-2xl"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>🛡️ 财务安全</h2>
        </div>
        <div
          className="p-4 rounded-xl flex flex-col items-center gap-2 text-center"
          style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}
        >
          <Lock size={20} color="#EF4444" />
          <p className="text-[12px] font-semibold" style={{ color: "#EF4444" }}>
            资产负债表数据权限不足
          </p>
          <p className="text-[10px] leading-[1.7]" style={{ color: "#94A3B8" }}>
            当前 Tushare 积分不足以访问 balancesheet 接口。<br />
            请前往 tushare.pro 购买积分后，访问<br />
            <span className="font-mono" style={{ color: "#60A5FA" }}>
              /api/tushare/status?refresh=1
            </span>{" "}
            清除缓存重新检测。
          </p>
        </div>
      </div>
    );
  }

  // ── 加载中 ────────────────────────────────────────────────────────
  if (loading) return <Skeleton />;

  // ── 网络错误 ──────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div
        className="p-4 rounded-2xl"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>🛡️ 财务安全</h2>
          <button
            onClick={() => fetchData(false)}
            className="text-[11px] px-3 py-1.5 rounded-lg"
            style={{ background: "#1a2f50", color: "#94A3B8" }}
          >
            重试
          </button>
        </div>
        <p className="text-[12px]" style={{ color: "#EF4444" }}>
          {error ?? "获取财务安全数据失败"}
        </p>
      </div>
    );
  }

  const items = data.items ?? [];
  const item  = latest(items);

  // 无数据（token 未配置 / 数据暂缺）
  if (!item) {
    return (
      <div
        className="p-4 rounded-2xl"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>🛡️ 财务安全</h2>
        </div>
        <p className="text-[12px]" style={{ color: "#94A3B8" }}>
          {data.error ?? "暂无资产负债表数据"}
        </p>
      </div>
    );
  }

  const risks = computeRisks(item);

  // 资负率颜色
  const debtColor =
    item.debtToAssets == null ? "#F8FAFC"
    : item.debtToAssets < 0.40 ? "#00E5A8"
    : item.debtToAssets < 0.65 ? "#FACC15"
    : "#EF4444";

  // 流动比率颜色
  const crColor =
    item.currentRatio == null ? "#F8FAFC"
    : item.currentRatio >= 2  ? "#00E5A8"
    : item.currentRatio >= 1  ? "#FACC15"
    : "#EF4444";

  // 速动比率颜色
  const qrColor =
    item.quickRatio == null ? "#F8FAFC"
    : item.quickRatio >= 1   ? "#00E5A8"
    : item.quickRatio >= 0.5 ? "#FACC15"
    : "#EF4444";

  // 商誉颜色
  const gwColor =
    item.goodwillToNetAssets == null ? "#F8FAFC"
    : item.goodwillToNetAssets < 0.10 ? "#00E5A8"
    : item.goodwillToNetAssets < 0.30 ? "#FACC15"
    : "#EF4444";

  // 应收账款颜色
  const arColor =
    item.receivablesToRevenue == null ? "#F8FAFC"
    : item.receivablesToRevenue < 0.20 ? "#00E5A8"
    : item.receivablesToRevenue < 0.40 ? "#FACC15"
    : "#EF4444";

  // 存货颜色
  const invColor =
    item.inventoryToRevenue == null ? "#F8FAFC"
    : item.inventoryToRevenue < 0.20 ? "#00E5A8"
    : item.inventoryToRevenue < 0.40 ? "#FACC15"
    : "#EF4444";

  return (
    <div
      className="p-4 rounded-2xl space-y-3"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
    >
      {/* ── 标题栏 ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
            🛡️ 财务安全
          </h2>
          <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>
            {item.period} · {stockName} · 来源 Tushare
            {data.fromCache && <span style={{ color: "#64748B" }}> · 缓存</span>}
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]"
          style={{ background: "#07111F", color: refreshing ? "#64748B" : "#94A3B8", border: "1px solid #1a2f50" }}
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "刷新中" : "刷新"}
        </button>
      </div>

      {/* ── 资产负债核心字段 ───────────────────────────────────────── */}
      <div>
        <SectionTitle>资产负债（{item.period}）</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <MetricRow label="总资产"   value={fmtMoney(item.totalAssets)} />
          <MetricRow label="总负债"   value={fmtMoney(item.totalLiabilities)} />
          <MetricRow label="归母净资产" value={fmtMoney(item.netAssets)} />

          <MetricRow label="流动资产"   value={fmtMoney(item.currentAssets)} />
          <MetricRow label="流动负债"   value={fmtMoney(item.currentLiabilities)} />
          <MetricRow label="货币资金"   value={fmtMoney(item.monetaryFunds)} />

          <MetricRow label="应收账款"   value={fmtMoney(item.accountsReceivable)} />
          <MetricRow label="存货"       value={fmtMoney(item.inventory)} />
          <MetricRow label="商誉"       value={item.goodwill != null ? fmtMoney(item.goodwill) : "—"} />

          <MetricRow label="短期借款"   value={item.shortTermBorrowings != null ? fmtMoney(item.shortTermBorrowings) : "—"} />
          <MetricRow label="长期借款"   value={item.longTermBorrowings != null ? fmtMoney(item.longTermBorrowings) : "—"} />
          <MetricRow label="股东权益(全)" value={fmtMoney(item.shareholderEquity)} />
        </div>
      </div>

      {/* ── 安全比率 ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle>财务安全比率</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <MetricRow
            label="资产负债率"
            value={fmtPctDecimal(item.debtToAssets)}
            valueColor={debtColor}
            note="警戒 >70%"
          />
          <MetricRow
            label="流动比率"
            value={fmtRatio(item.currentRatio)}
            valueColor={crColor}
            note="健康 ≥2x"
          />
          <MetricRow
            label="速动比率"
            value={fmtRatio(item.quickRatio)}
            valueColor={qrColor}
            note="安全 ≥1x"
          />
          <MetricRow
            label="商誉/净资产"
            value={item.goodwillToNetAssets != null ? fmtPctDecimal(item.goodwillToNetAssets) : "—"}
            valueColor={gwColor}
            note="警戒 >30%"
          />
          <MetricRow
            label="应收/收入"
            value={item.receivablesToRevenue != null ? fmtPctDecimal(item.receivablesToRevenue) : "—"}
            valueColor={arColor}
            note="警戒 >40%"
          />
          <MetricRow
            label="存货/收入"
            value={item.inventoryToRevenue != null ? fmtPctDecimal(item.inventoryToRevenue) : "—"}
            valueColor={invColor}
            note="警戒 >40%"
          />
        </div>
      </div>

      {/* ── 风险预警 ──────────────────────────────────────────────── */}
      {risks.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>⚠️ 风险预警（{risks.length} 项）</SectionTitle>
          {risks.map((r, i) => <RiskBadge key={i} risk={r} />)}
        </div>
      )}

      {risks.length === 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "rgba(0,229,168,0.06)", border: "1px solid rgba(0,229,168,0.15)" }}
        >
          <span style={{ color: "#00E5A8" }} className="text-[13px]">✓</span>
          <span className="text-[11px]" style={{ color: "#00E5A8" }}>
            当前期暂无财务安全风险预警
          </span>
        </div>
      )}

      {/* ── 近 4 期趋势（折叠） ───────────────────────────────────── */}
      {items.length > 1 && (
        <div>
          <button
            onClick={() => setShowTrend(v => !v)}
            className="flex items-center gap-1.5 text-[11px] w-full"
            style={{ color: "#64748B" }}
          >
            {showTrend ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            近 {Math.min(items.length, 4)} 期趋势
          </button>
          {showTrend && (
            <div className="mt-2 space-y-2">
              <TrendScroll items={items} />
              <SafetyTrendChart items={items} />
            </div>
          )}
        </div>
      )}

      {/* ── 免责声明 ──────────────────────────────────────────────── */}
      <div
        className="flex items-start gap-2 p-2.5 rounded-xl"
        style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.1)" }}
      >
        <Info size={11} color="#64748B" className="flex-shrink-0 mt-0.5" />
        <p className="text-[9px] leading-[1.6]" style={{ color: "#64748B" }}>
          财务数据来源于 Tushare（上市公司公告），仅供参考，不构成投资建议。
          财务比率基于历史报告期数据计算，不代表当前实时状态。
        </p>
      </div>
    </div>
  );
}
