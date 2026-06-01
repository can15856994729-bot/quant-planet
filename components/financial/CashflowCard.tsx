"use client";

/**
 * CashflowCard — A股现金流质量模块
 *
 * 数据来源：/api/stocks/[symbol]/financials/cashflow
 *   → Tushare cashflow + income（净利润/营收）
 *
 * 展示内容：
 *  - 最新期：三大现金流 + 自由现金流 + 质量指标 + 详细分项
 *  - 6 条风险预警（阈值驱动）
 *  - 近 4 期趋势（折叠，含 Recharts 折线图）
 *
 * 颜色约定（中国 A 股惯例）：
 *   正数（现金流入）→ #EF4444（红）
 *   负数（现金流出）→ #00E5A8（绿）
 *   中性               → #F8FAFC（白）
 *
 * 安全约束：此组件只调用本应用的 API Route，不直接访问 TUSHARE_TOKEN。
 */

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Lock, Info } from "lucide-react";
import type { CashflowSummaryItem } from "@/lib/financialService";

// ── 类型 ──────────────────────────────────────────────────────────────

interface CashflowApiResponse {
  ok:             boolean;
  tsCode:         string;
  symbol:         string;
  items:          CashflowSummaryItem[];
  total:          number;
  riskWarnings:   string[];
  cashflowStatus: string;
  incomeStatus:   string;
  fromCache:      boolean;
  error?:         string;
  updatedAt:      string;
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

function fmtRatio(v: number | null): string {
  if (v == null) return "数据暂缺";
  // 防止 Infinity / NaN
  if (!isFinite(v)) return "数据暂缺";
  return `${v.toFixed(2)}x`;
}

/** 现金流数值颜色：正=红（流入），负=绿（流出），null=灰 */
function cashColor(v: number | null): string {
  if (v == null) return "#64748B";
  return v >= 0 ? "#EF4444" : "#00E5A8";
}

/** 经营现金流/净利润 颜色：>1=红（优秀），0.5~1=黄，<0.5=绿（警示） */
function ratioColor(v: number | null): string {
  if (v == null || !isFinite(v)) return "#94A3B8";
  if (v >= 1)   return "#EF4444";
  if (v >= 0.5) return "#FACC15";
  return "#00E5A8";
}

// ── 子组件 ────────────────────────────────────────────────────────────

function MetricRow({
  label, value, valueColor, note,
}: { label: string; value: string; valueColor?: string; note?: string }) {
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
      {note && <span className="text-[8px] mt-0.5" style={{ color: "#64748B" }}>{note}</span>}
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

function RiskBadge({ message, level = "warning" }: { message: string; level?: "danger" | "warning" }) {
  const bg     = level === "danger" ? "rgba(239,68,68,0.10)"  : "rgba(250,204,21,0.10)";
  const border = level === "danger" ? "rgba(239,68,68,0.25)"  : "rgba(250,204,21,0.25)";
  const color  = level === "danger" ? "#EF4444"               : "#FACC15";
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-xl" style={{ background: bg, border: `1px solid ${border}` }}>
      <AlertTriangle size={12} color={color} className="flex-shrink-0 mt-0.5" />
      <span className="text-[11px] leading-[1.6]" style={{ color }}>{message}</span>
    </div>
  );
}

function riskLevel(msg: string): "danger" | "warning" {
  // 以下属于严重等级
  const dangerKw = ["为负", "依赖外部融资", "持续为负"];
  return dangerKw.some(k => msg.includes(k)) ? "danger" : "warning";
}

/** 近 4 期趋势横向滚动卡片 */
function TrendScroll({ items }: { items: CashflowSummaryItem[] }) {
  const slice = items.slice(0, 4).reverse();
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {slice.map((it) => (
        <div
          key={it.reportDate}
          className="flex-shrink-0 rounded-xl p-2.5"
          style={{ minWidth: 130, background: "#07111F", border: "1px solid #1a2f50" }}
        >
          <p className="text-[10px] font-bold mb-1.5" style={{ color: "#94A3B8" }}>{it.period}</p>
          <div className="space-y-1">
            {[
              { label: "经营现金流", v: it.operatingCashflow },
              { label: "投资现金流", v: it.investingCashflow },
              { label: "筹资现金流", v: it.financingCashflow },
              { label: "自由现金流", v: it.freeCashflow },
            ].map(({ label, v }) => (
              <div key={label} className="flex justify-between text-[10px]">
                <span style={{ color: "#64748B" }}>{label}</span>
                <span className="num font-bold" style={{ color: cashColor(v) }}>
                  {fmtMoney(v)}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-[10px]">
              <span style={{ color: "#64748B" }}>经营/净利</span>
              <span className="num font-bold" style={{ color: ratioColor(it.operatingCashflowToNetProfit) }}>
                {fmtRatio(it.operatingCashflowToNetProfit)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 现金流趋势折线图 */
function CashflowTrendChart({ items }: { items: CashflowSummaryItem[] }) {
  const data = [...items].reverse().slice(0, 8).map((it) => {
    function toB(v: number | null) {
      return v != null ? +(v / 1e8).toFixed(2) : null;
    }
    return {
      period:   it.period,
      oper:     toB(it.operatingCashflow),
      invest:   toB(it.investingCashflow),
      finance:  toB(it.financingCashflow),
      fcf:      toB(it.freeCashflow),
      cfNp:     it.operatingCashflowToNetProfit != null && isFinite(it.operatingCashflowToNetProfit)
                  ? +it.operatingCashflowToNetProfit.toFixed(2) : null,
      cashIncr: toB(it.cashAndCashEquivalentsIncrease),
    };
  });

  const hasMain = data.some(d => d.oper != null);
  if (!hasMain) return null;

  return (
    <div className="space-y-4 mt-2">
      {/* 三大现金流 + 自由现金流趋势（亿元） */}
      <div>
        <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>现金流趋势（亿元）</p>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
            <XAxis dataKey="period" tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
            <ReferenceLine y={0} stroke="#1a2f50" strokeDasharray="4 2" />
            <Tooltip
              contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
              formatter={(v: unknown, name: unknown) => {
                const labels: Record<string, string> = {
                  oper: "经营现金流", invest: "投资现金流",
                  finance: "筹资现金流", fcf: "自由现金流",
                };
                return [`${Number(v ?? 0).toFixed(2)}亿`, labels[String(name)] ?? String(name)];
              }}
            />
            <Line type="monotone" dataKey="oper"    stroke="#EF4444" strokeWidth={2} dot={{ r: 2 }} name="oper"    connectNulls />
            <Line type="monotone" dataKey="invest"  stroke="#60A5FA" strokeWidth={1.5} dot={{ r: 2 }} name="invest"  connectNulls strokeDasharray="4 2" />
            <Line type="monotone" dataKey="finance" stroke="#FACC15" strokeWidth={1.5} dot={{ r: 2 }} name="finance" connectNulls strokeDasharray="4 2" />
            <Line type="monotone" dataKey="fcf"     stroke="#00E5A8" strokeWidth={2} dot={{ r: 2 }} name="fcf"     connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 经营现金流 / 净利润趋势 */}
      {data.some(d => d.cfNp != null) && (
        <div>
          <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>经营现金流 / 净利润（倍）</p>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
              <XAxis dataKey="period" tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={1} stroke="#EF4444" strokeDasharray="4 2" label={{ value: "1x", fill: "#EF4444", fontSize: 9 }} />
              <Tooltip
                contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
                formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(2)}x`, "经营/净利润"]}
              />
              <Line type="monotone" dataKey="cfNp" stroke="#EF4444" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 现金增加额趋势 */}
      {data.some(d => d.cashIncr != null) && (
        <div>
          <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>现金及等价物增加额（亿元）</p>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
              <XAxis dataKey="period" tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={0} stroke="#1a2f50" strokeDasharray="4 2" />
              <Tooltip
                contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
                formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(2)}亿`, "现金增加额"]}
              />
              <Line type="monotone" dataKey="cashIncr" stroke="#60A5FA" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── 骨架屏 ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="p-4 rounded-2xl space-y-3 animate-pulse"
         style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <div className="h-4 rounded w-1/3" style={{ background: "#1a2f50" }} />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl" style={{ background: "#07111F" }} />
        ))}
      </div>
      <div className="h-3 rounded w-1/2" style={{ background: "#1a2f50" }} />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl" style={{ background: "#07111F" }} />
        ))}
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────

export default function CashflowCard({ symbol, stockName }: Props) {
  const [data,       setData]       = useState<CashflowApiResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [showTrend,  setShowTrend]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const url = `/api/stocks/${symbol}/financials/cashflow?periods=8${refresh ? "&refresh=1" : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: CashflowApiResponse = await res.json();
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
  if (!loading && data && !data.ok && data.cashflowStatus === "permission_denied") {
    return (
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>💧 现金流质量</h2>
        </div>
        <div className="p-4 rounded-xl flex flex-col items-center gap-2 text-center"
             style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <Lock size={20} color="#EF4444" />
          <p className="text-[12px] font-semibold" style={{ color: "#EF4444" }}>
            当前 Tushare 权限不足，无法获取现金流量表数据
          </p>
          <p className="text-[10px] leading-[1.7]" style={{ color: "#94A3B8" }}>
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

  if (loading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>💧 现金流质量</h2>
          <button onClick={() => fetchData(false)}
            className="text-[11px] px-3 py-1.5 rounded-lg"
            style={{ background: "#1a2f50", color: "#94A3B8" }}>
            重试
          </button>
        </div>
        <p className="text-[12px]" style={{ color: "#EF4444" }}>
          {error ?? "现金流数据加载失败，请稍后重试"}
        </p>
      </div>
    );
  }

  const items = data.items ?? [];
  const item  = items.length > 0 ? items[0] : null;
  const risks = data.riskWarnings ?? [];

  if (!item) {
    return (
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>💧 现金流质量</h2>
        </div>
        <p className="text-[12px]" style={{ color: "#94A3B8" }}>
          {data.error ?? "该股票现金流量表数据暂缺"}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl space-y-3"
         style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>

      {/* ── 标题栏 ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>💧 现金流质量</h2>
          <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>
            {item.period} · {stockName} · 来源 Tushare
            {data.fromCache && <span> · 缓存</span>}
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]"
          style={{ background: "#07111F", color: refreshing ? "#64748B" : "#94A3B8", border: "1px solid #1a2f50" }}>
          <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "刷新中" : "刷新"}
        </button>
      </div>

      {/* ── 三大现金流 + 自由现金流 ────────────────────────────────── */}
      <div>
        <SectionTitle>三大现金流（{item.period}）</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <MetricRow
            label="经营活动现金流净额"
            value={fmtMoney(item.operatingCashflow)}
            valueColor={cashColor(item.operatingCashflow)}
            note="正值=流入 负值=流出"
          />
          <MetricRow
            label="投资活动现金流净额"
            value={fmtMoney(item.investingCashflow)}
            valueColor={cashColor(item.investingCashflow)}
          />
          <MetricRow
            label="筹资活动现金流净额"
            value={fmtMoney(item.financingCashflow)}
            valueColor={cashColor(item.financingCashflow)}
          />
          <MetricRow
            label="自由现金流"
            value={fmtMoney(item.freeCashflow)}
            valueColor={cashColor(item.freeCashflow)}
            note={item.freeCashflow == null ? "数据暂缺" : undefined}
          />
        </div>
      </div>

      {/* ── 质量指标 + 现金等价物 ───────────────────────────────────── */}
      <div>
        <SectionTitle>现金流质量</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <MetricRow
            label="经营现金流 / 净利润"
            value={fmtRatio(item.operatingCashflowToNetProfit)}
            valueColor={ratioColor(item.operatingCashflowToNetProfit)}
            note="优秀 ≥1x"
          />
          <MetricRow
            label="现金及等价物增加额"
            value={fmtMoney(item.cashAndCashEquivalentsIncrease)}
            valueColor={cashColor(item.cashAndCashEquivalentsIncrease)}
          />
        </div>
      </div>

      {/* ── 详细分项 ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle>详细现金流分项</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <MetricRow
            label="销售商品收到现金"
            value={fmtMoney(item.cashReceivedFromSales)}
            valueColor={cashColor(item.cashReceivedFromSales)}
          />
          <MetricRow
            label="购买商品支付现金"
            value={fmtMoney(item.cashPaidForGoods)}
            valueColor={cashColor(item.cashPaidForGoods)}
          />
          <MetricRow
            label="分红利息支付现金"
            value={fmtMoney(item.dividendInterestPaymentCash)}
            valueColor={cashColor(item.dividendInterestPaymentCash)}
          />
        </div>
      </div>

      {/* ── 风险预警 ──────────────────────────────────────────────── */}
      {risks.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>⚠️ 现金流风险预警（{risks.length} 项）</SectionTitle>
          {risks.map((r, i) => <RiskBadge key={i} message={r} level={riskLevel(r)} />)}
        </div>
      )}

      {risks.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
             style={{ background: "rgba(0,229,168,0.06)", border: "1px solid rgba(0,229,168,0.15)" }}>
          <span style={{ color: "#00E5A8" }} className="text-[13px]">✓</span>
          <span className="text-[11px]" style={{ color: "#00E5A8" }}>
            当前期暂无现金流风险预警
          </span>
        </div>
      )}

      {/* ── 近 4 期趋势（折叠） ───────────────────────────────────── */}
      {items.length > 1 && (
        <div>
          <button
            onClick={() => setShowTrend(v => !v)}
            className="flex items-center gap-1.5 text-[11px] w-full"
            style={{ color: "#64748B" }}>
            {showTrend ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            近 {Math.min(items.length, 4)} 期趋势
          </button>
          {showTrend && (
            <div className="mt-2 space-y-2">
              <TrendScroll items={items} />
              <CashflowTrendChart items={items} />
            </div>
          )}
        </div>
      )}

      {/* ── 策略联动提示 ──────────────────────────────────────────── */}
      <div className="px-3 py-2 rounded-xl"
           style={{ background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.1)" }}>
        <p className="text-[9px] leading-[1.6]" style={{ color: "#64748B" }}>
          📊 <span style={{ color: "#60A5FA" }}>策略联动</span>：现金流因子已接入稳健多因子策略（经营现金流为正加分/经营现金流÷净利润&gt;1加分/自由现金流为正加分）及 ST 风险反转策略（经营现金流转正/现金改善判断）。
        </p>
      </div>

      {/* ── 免责声明 ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl"
           style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.1)" }}>
        <Info size={11} color="#64748B" className="flex-shrink-0 mt-0.5" />
        <p className="text-[9px] leading-[1.6]" style={{ color: "#64748B" }}>
          现金流数据来源于 Tushare（上市公司季报/半年报/年报公告），仅供参考，不构成投资建议。
          自由现金流如无 Tushare 直接返回，则由经营现金流减购建固定资产支付现金估算。
        </p>
      </div>
    </div>
  );
}
