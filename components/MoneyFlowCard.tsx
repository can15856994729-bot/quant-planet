"use client";

/**
 * MoneyFlowCard — 个股资金流展示卡片
 *
 * 功能：
 *  - 显示今日/5日/10日主力净流入
 *  - 超大单/大单/中单/小单分类展示
 *  - 资金流柱状占比图
 *  - 自动刷新（30s）
 *  - 数据不可用时显示友好提示，不显示假数据
 *
 * Props:
 *  - symbol: A 股代码（如 "600519"）
 *  - initialData: 可选预加载数据（减少首屏请求）
 */

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

// ── 类型定义 ──────────────────────────────────────────────────────────────
interface StockMoneyFlow {
  symbol:    string;
  name:      string;
  price:     number | null;
  changePct: number | null;
  mainNetInflow:       number | null;
  superLargeNetInflow: number | null;
  largeNetInflow:      number | null;
  mediumNetInflow:     number | null;
  smallNetInflow:      number | null;
  mainNetInflowPercent:       number | null;
  superLargeNetInflowPercent: number | null;
  largeNetInflowPercent:      number | null;
  mediumNetInflowPercent:     number | null;
  smallNetInflowPercent:      number | null;
  fiveDayMainNetInflow:          number | null;
  fiveDaySuperLargeNetInflow:    number | null;
  fiveDayLargeNetInflow:         number | null;
  fiveDayMediumNetInflow:        number | null;
  fiveDaySmallNetInflow:         number | null;
  fiveDayMainNetInflowPercent:   number | null;
  tenDayMainNetInflow:          number | null;
  tenDaySuperLargeNetInflow:    number | null;
  tenDayLargeNetInflow:         number | null;
  tenDayMediumNetInflow:        number | null;
  tenDaySmallNetInflow:         number | null;
  tenDayMainNetInflowPercent:   number | null;
  updatedAt: string;
  source:    string;
}

interface Props {
  symbol:      string;
  initialData?: StockMoneyFlow | null;
}

// ── 格式化 ────────────────────────────────────────────────────────────────
function fmtFlow(yuan: number | null): string {
  if (yuan === null) return "--";
  const abs  = Math.abs(yuan);
  const sign = yuan >= 0 ? "+" : "-";
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(2)}万`;
  return `${sign}${abs.toFixed(0)}元`;
}

function flowColor(v: number | null): string {
  if (v === null) return "#94A3B8";
  if (v > 0)     return "#EF4444";   // 净流入 → 红
  if (v < 0)     return "#22C55E";   // 净流出 → 绿
  return "#94A3B8";
}

function pctStr(v: number | null): string {
  if (v === null) return "";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

// ── 单行资金流指标 ─────────────────────────────────────────────────────────
function FlowRow({
  label, value, pct, color,
}: { label: string; value: number | null; pct?: number | null; color?: string }) {
  const c = color ?? flowColor(value);
  return (
    <div className="flex items-center justify-between py-1.5"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="text-[12px]" style={{ color: "#94A3B8" }}>{label}</span>
      <div className="flex items-center gap-2">
        {pct !== null && pct !== undefined && (
          <span className="text-[10px]" style={{ color: c }}>{pctStr(pct)}</span>
        )}
        <span className="font-bold text-[13px] num" style={{ color: c }}>{fmtFlow(value)}</span>
      </div>
    </div>
  );
}

// ── 资金流方向进度条（占比可视化）────────────────────────────────────────
function FlowBar({ label, value, totalAbs, color }: {
  label: string; value: number | null; totalAbs: number; color: string;
}) {
  if (value === null) return null;
  const pct = totalAbs > 0 ? Math.abs(value) / totalAbs * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px]" style={{ color: "#64748B" }}>{label}</span>
        <span className="text-[10px] num" style={{ color }}>{fmtFlow(value)}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1a2f50" }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────
type PeriodKey = "today" | "5day" | "10day";

export default function MoneyFlowCard({ symbol, initialData }: Props) {
  const [data,       setData]       = useState<StockMoneyFlow | null>(initialData ?? null);
  const [loading,    setLoading]    = useState(!initialData);
  const [error,      setError]      = useState<string | null>(null);
  const [period,     setPeriod]     = useState<PeriodKey>("today");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/eastmoney/money-flow/stock/${symbol}`);
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        setError(json.message ?? "资金流数据暂不可用");
        if (!data) setData(null); // 首次失败才清空
      }
    } catch {
      setError("网络错误，无法获取资金流数据");
    } finally {
      setLoading(false);
    }
  }, [symbol, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // 30s 自动刷新
  useEffect(() => {
    const t = setInterval(() => setRefreshKey(k => k + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // 当前周期的数据
  const flow = (() => {
    if (!data) return null;
    if (period === "today") return {
      main:       data.mainNetInflow,
      superLarge: data.superLargeNetInflow,
      large:      data.largeNetInflow,
      medium:     data.mediumNetInflow,
      small:      data.smallNetInflow,
      mainPct:    data.mainNetInflowPercent,
      superLargePct: data.superLargeNetInflowPercent,
      largePct:   data.largeNetInflowPercent,
      mediumPct:  data.mediumNetInflowPercent,
      smallPct:   data.smallNetInflowPercent,
    };
    if (period === "5day") return {
      main:       data.fiveDayMainNetInflow,
      superLarge: data.fiveDaySuperLargeNetInflow,
      large:      data.fiveDayLargeNetInflow,
      medium:     data.fiveDayMediumNetInflow,
      small:      data.fiveDaySmallNetInflow,
      mainPct:    data.fiveDayMainNetInflowPercent,
      superLargePct: null, largePct: null, mediumPct: null, smallPct: null,
    };
    return {
      main:       data.tenDayMainNetInflow,
      superLarge: data.tenDaySuperLargeNetInflow,
      large:      data.tenDayLargeNetInflow,
      medium:     data.tenDayMediumNetInflow,
      small:      data.tenDaySmallNetInflow,
      mainPct:    data.tenDayMainNetInflowPercent,
      superLargePct: null, largePct: null, mediumPct: null, smallPct: null,
    };
  })();

  const totalAbs: number = flow
    ? [flow.superLarge, flow.large, flow.medium, flow.small]
        .reduce<number>((s, v) => s + (v !== null ? Math.abs(v) : 0), 0)
    : 0;

  const ACCENT = "#00E5A8";

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>

      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5"
        style={{ borderBottom: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-2">
          <TrendingUp size={14} color={ACCENT} />
          <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>资金流向</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,229,168,0.1)", color: ACCENT }}>
            东方财富
          </span>
        </div>
        <button onClick={() => setRefreshKey(k => k + 1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center active:opacity-60"
          style={{ background: "#162a45" }}>
          <RefreshCw size={12} color="#64748B" className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 周期切换 */}
      <div className="flex gap-1.5 px-4 pt-3 pb-0">
        {(["today", "5day", "10day"] as PeriodKey[]).map(p => {
          const labels: Record<PeriodKey, string> = { today: "今日", "5day": "5日", "10day": "10日" };
          const active = period === p;
          return (
            <button key={p} onClick={() => setPeriod(p)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{
                background: active ? `${ACCENT}20` : "transparent",
                border: active ? `1px solid ${ACCENT}50` : "1px solid #1a2f50",
                color: active ? ACCENT : "#64748B",
              }}>
              {labels[p]}
            </button>
          );
        })}
      </div>

      {/* 主力净流入（大字） */}
      {!loading && !error && flow && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px]" style={{ color: "#64748B" }}>主力净流入</span>
            {data?.updatedAt && (
              <span className="text-[9px]" style={{ color: "#4B5563" }}>
                {new Date(data.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {flow.main !== null && flow.main > 0
                ? <TrendingUp size={18} color="#EF4444" />
                : flow.main !== null && flow.main < 0
                ? <TrendingDown size={18} color="#22C55E" />
                : null}
              <span className="font-black text-[22px] num" style={{ color: flowColor(flow.main) }}>
                {fmtFlow(flow.main)}
              </span>
            </div>
            {flow.mainPct !== null && (
              <span className="text-[12px] font-semibold" style={{ color: flowColor(flow.main) }}>
                {pctStr(flow.mainPct)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="px-4 py-6 text-center">
          <RefreshCw size={18} color="#64748B" className="animate-spin mx-auto mb-2" />
          <p className="text-[11px]" style={{ color: "#64748B" }}>加载资金流数据…</p>
        </div>
      )}

      {/* 错误状态 */}
      {!loading && error && !data && (
        <div className="px-4 py-5 flex items-start gap-2">
          <AlertCircle size={14} color="#64748B" className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold" style={{ color: "#64748B" }}>资金流数据暂不可用</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#4B5563" }}>
              等待数据源恢复，请稍后重试
            </p>
          </div>
        </div>
      )}

      {/* 明细列表 */}
      {!loading && flow && flow.main !== null && (
        <div className="px-4 pb-1">
          <FlowRow label="超大单净流入" value={flow.superLarge} pct={flow.superLargePct} />
          <FlowRow label="大单净流入"   value={flow.large}      pct={flow.largePct} />
          <FlowRow label="中单净流入"   value={flow.medium}     pct={flow.mediumPct} />
          <FlowRow label="小单净流入"   value={flow.small}      pct={flow.smallPct} />
        </div>
      )}

      {/* 占比进度条 */}
      {!loading && flow && totalAbs > 0 && (
        <div className="px-4 pt-3 pb-4 space-y-2.5"
          style={{ borderTop: "1px solid #1a2f50", marginTop: "8px" }}>
          <p className="text-[10px] font-semibold" style={{ color: "#64748B" }}>各类资金净流入规模</p>
          <FlowBar label="超大单" value={flow.superLarge} totalAbs={totalAbs} color="#EF4444" />
          <FlowBar label="大单"   value={flow.large}      totalAbs={totalAbs} color="#F97316" />
          <FlowBar label="中单"   value={flow.medium}     totalAbs={totalAbs} color="#FBBF24" />
          <FlowBar label="小单"   value={flow.small}      totalAbs={totalAbs} color="#22C55E" />
        </div>
      )}

      {/* 今日 + 5日 + 10日 对比（仅在今日模式下显示） */}
      {!loading && data && period === "today" && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-2 pt-3"
            style={{ borderTop: "1px solid #1a2f50" }}>
            {[
              { label: "今日",  value: data.mainNetInflow,       pct: data.mainNetInflowPercent },
              { label: "5日",   value: data.fiveDayMainNetInflow, pct: data.fiveDayMainNetInflowPercent },
              { label: "10日",  value: data.tenDayMainNetInflow,  pct: data.tenDayMainNetInflowPercent },
            ].map(({ label, value, pct }) => (
              <div key={label} className="text-center p-2 rounded-xl"
                style={{ background: "#111d35" }}>
                <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>{label}主力</p>
                <p className="font-bold text-[12px] num" style={{ color: flowColor(value) }}>
                  {fmtFlow(value)}
                </p>
                {pct !== null && (
                  <p className="text-[10px] num" style={{ color: flowColor(value) }}>{pctStr(pct)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 数据来源 */}
      {data && (
        <div className="px-4 pb-3 pt-0.5">
          <p className="text-[9px]" style={{ color: "#374151" }}>
            数据来源：{data.source} · 30s自动刷新 · 仅供参考，不构成投资建议
          </p>
        </div>
      )}
    </div>
  );
}
