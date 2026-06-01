"use client";

/**
 * ValuationCard — A股估值分析模块
 *
 * 数据来源：/api/stocks/[symbol]/valuation
 *   → Tushare daily_basic + fina_indicator（PEG）
 *
 * 展示内容：
 *  - PE / PB / PS / PEG + 总市值 / 流通市值
 *  - 市盈率分位 / 市净率分位（历史百分位进度条）
 *  - 股息率 / 换手率 / 量比
 *  - 估值风险提示
 *  - 近 3 年趋势（折叠）
 *
 * 单位约定（与 valuationService 保持一致）：
 *   市值：内部存元，此处格式化为亿
 *   PE/PB/PS：纯数值
 *   换手率/股息率：% 形式（如 1.25 = "1.25%"）
 *   量比：纯倍数（如 1.35 = "1.35"）
 *   分位：小数 → "XX%"
 *
 * 安全约束：只调用本应用 API Route，不直接访问 TUSHARE_TOKEN。
 */

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Lock, Info, TrendingUp } from "lucide-react";
import type { ValuationSummaryItem } from "@/lib/valuationService";

// ── 类型 ──────────────────────────────────────────────────────────────

interface ValuationApiResponse {
  ok:                  boolean;
  tsCode:              string;
  symbol:              string;
  item:                ValuationSummaryItem | null;
  riskWarnings:        string[];
  dailyBasicStatus:    string;
  finaIndicatorStatus: string;
  fromCache:           boolean;
  error?:              string;
  updatedAt:           string;
}

interface HistoryRecord {
  trade_date: string;
  pe?:        number | null;
  pe_ttm?:    number | null;
  pb?:        number | null;
  ps_ttm?:    number | null;
  total_mv?:  number | null;
  turnover_rate?: number | null;
}

interface Props {
  symbol:    string;
  stockName: string;
}

// ── 格式化工具 ────────────────────────────────────────────────────────

function fmtNum(v: number | null, decimals = 2): string {
  if (v == null || !isFinite(v)) return "数据暂缺";
  return v.toFixed(decimals);
}

function fmtPct(v: number | null, decimals = 2): string {
  if (v == null || !isFinite(v)) return "数据暂缺";
  return `${v.toFixed(decimals)}%`;
}

/** 小数分位 → "XX.X%" */
function fmtPercentile(v: number | null): string {
  if (v == null) return "数据暂缺";
  return `${(v * 100).toFixed(1)}%`;
}

/** 元 → 亿 */
function fmtMarketCap(v: number | null): string {
  if (v == null) return "数据暂缺";
  const abs  = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(1)}万`;
  return `${sign}${abs.toFixed(0)}元`;
}

/** 分位颜色：低=绿，合理=黄，高=红 */
function percentileColor(v: number | null): string {
  if (v == null) return "#64748B";
  if (v < 0.20) return "#00E5A8";
  if (v < 0.70) return "#FACC15";
  return "#EF4444";
}

// ── 子组件 ────────────────────────────────────────────────────────────

function MetricRow({
  label, value, valueColor, note,
}: { label: string; value: string; valueColor?: string; note?: string }) {
  return (
    <div className="flex flex-col items-center p-2.5 rounded-xl text-center"
         style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <span className="font-bold text-[12px] num leading-tight"
            style={{ color: valueColor ?? "#F8FAFC" }}>{value}</span>
      <span className="text-[9px] mt-0.5" style={{ color: "#94A3B8" }}>{label}</span>
      {note && <span className="text-[8px] mt-0.5" style={{ color: "#64748B" }}>{note}</span>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#64748B" }}>{children}</p>
  );
}

/** 分位进度条 */
function PercentileBar({ label, value, note }: { label: string; value: number | null; note?: string | null }) {
  const color = percentileColor(value);
  const pct   = value != null ? Math.round(value * 100) : null;
  return (
    <div className="rounded-xl p-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[11px]" style={{ color: "#94A3B8" }}>{label}</span>
        <span className="font-bold text-[13px] num" style={{ color }}>
          {pct != null ? `${pct}%` : (note ?? "数据暂缺")}
        </span>
      </div>
      {pct != null && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1a2f50" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, pct)}%`, background: color }}
          />
        </div>
      )}
      {pct == null && note && (
        <p className="text-[9px]" style={{ color: "#64748B" }}>{note}</p>
      )}
    </div>
  );
}

function RiskBadge({ msg }: { msg: string }) {
  const isDanger = ["高位", "偏高", "放大"].some(k => msg.includes(k));
  const isGood   = ["低位", "较低", "分红"].some(k => msg.includes(k));
  const bg    = isDanger ? "rgba(239,68,68,0.08)"  : isGood ? "rgba(0,229,168,0.08)"  : "rgba(250,204,21,0.08)";
  const border = isDanger ? "rgba(239,68,68,0.20)" : isGood ? "rgba(0,229,168,0.20)"  : "rgba(250,204,21,0.20)";
  const color  = isDanger ? "#EF4444"              : isGood ? "#00E5A8"               : "#FACC15";
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
         style={{ background: bg, border: `1px solid ${border}` }}>
      <AlertTriangle size={11} color={color} className="flex-shrink-0 mt-0.5" />
      <span className="text-[11px] leading-[1.6]" style={{ color }}>{msg}</span>
    </div>
  );
}

// ── 历史趋势图 ────────────────────────────────────────────────────────

function ValuationTrendChart({ symbol }: { symbol: string }) {
  const [histData, setHistData] = useState<HistoryRecord[] | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch(`/api/stocks/${symbol}/valuation/history?years=3`)
      .then(r => r.json())
      .then((j: { records?: HistoryRecord[] }) => {
        // Sample every 10 records to reduce chart density
        const recs = j.records ?? [];
        const sampled = recs.filter((_, i) => i % 10 === 0 || i === recs.length - 1);
        setHistData(sampled);
      })
      .catch(() => setHistData([]))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) return <div className="h-20 animate-pulse rounded-xl" style={{ background: "#07111F" }} />;
  if (!histData || histData.length < 10) return (
    <p className="text-[10px]" style={{ color: "#64748B" }}>历史数据不足，无法绘制趋势图</p>
  );

  const data = histData.map(r => ({
    d:    String(r.trade_date ?? "").slice(2),  // YY-MM-DD
    pe:   r.pe_ttm ?? r.pe ?? null,
    pb:   r.pb ?? null,
    mv:   r.total_mv != null ? +(r.total_mv / 10000).toFixed(0) : null, // 万元→亿元
    to:   r.turnover_rate ?? null,
  }));

  return (
    <div className="space-y-4">
      {/* PE 趋势 */}
      {data.some(d => d.pe != null) && (
        <div>
          <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>PE TTM 趋势（近3年）</p>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
              <XAxis dataKey="d" tick={{ fill: "#64748B", fontSize: 8 }} tickLine={false} axisLine={false} interval={Math.floor(data.length / 6)} />
              <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
                       formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(1)}x`, "PE TTM"]} />
              <Line type="monotone" dataKey="pe" stroke="#60A5FA" strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* PB 趋势 */}
      {data.some(d => d.pb != null) && (
        <div>
          <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>PB 趋势（近3年）</p>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
              <XAxis dataKey="d" tick={{ fill: "#64748B", fontSize: 8 }} tickLine={false} axisLine={false} interval={Math.floor(data.length / 6)} />
              <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
                       formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(2)}x`, "PB"]} />
              <Line type="monotone" dataKey="pb" stroke="#A78BFA" strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 市值趋势 */}
      {data.some(d => d.mv != null) && (
        <div>
          <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>总市值趋势（亿元，近3年）</p>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
              <XAxis dataKey="d" tick={{ fill: "#64748B", fontSize: 8 }} tickLine={false} axisLine={false} interval={Math.floor(data.length / 6)} />
              <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
                       formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(0)}亿`, "总市值"]} />
              <Line type="monotone" dataKey="mv" stroke="#F59E0B" strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 换手率趋势 */}
      {data.some(d => d.to != null) && (
        <div>
          <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>换手率趋势（%，近3年）</p>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
              <XAxis dataKey="d" tick={{ fill: "#64748B", fontSize: 8 }} tickLine={false} axisLine={false} interval={Math.floor(data.length / 6)} />
              <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={5} stroke="#FACC15" strokeDasharray="3 2" />
              <Tooltip contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
                       formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(2)}%`, "换手率"]} />
              <Line type="monotone" dataKey="to" stroke="#34D399" strokeWidth={1.5} dot={false} connectNulls />
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
          <div key={i} className="h-10 rounded-xl" style={{ background: "#07111F" }} />
        ))}
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────

export default function ValuationCard({ symbol, stockName }: Props) {
  const [data,       setData]       = useState<ValuationApiResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [showTrend,  setShowTrend]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const url = `/api/stocks/${symbol}/valuation${refresh ? "?refresh=1" : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ValuationApiResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => { fetchData(false); }, [fetchData]);

  // 权限不足
  if (!loading && data && !data.ok && data.dailyBasicStatus === "permission_denied") {
    return (
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>📊 估值分析</h2>
        </div>
        <div className="p-4 rounded-xl flex flex-col items-center gap-2 text-center"
             style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <Lock size={20} color="#EF4444" />
          <p className="text-[12px] font-semibold" style={{ color: "#EF4444" }}>
            当前 Tushare 权限不足，无法获取估值数据
          </p>
          <p className="text-[10px] leading-[1.7]" style={{ color: "#94A3B8" }}>
            请前往 tushare.pro 购买积分后，访问<br />
            <span className="font-mono" style={{ color: "#60A5FA" }}>/api/tushare/status?refresh=1</span> 清除缓存。
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
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>📊 估值分析</h2>
          <button onClick={() => fetchData(false)}
                  className="text-[11px] px-3 py-1.5 rounded-lg"
                  style={{ background: "#1a2f50", color: "#94A3B8" }}>重试</button>
        </div>
        <p className="text-[12px]" style={{ color: "#EF4444" }}>
          {error ?? "估值数据加载失败，请稍后重试"}
        </p>
      </div>
    );
  }

  const item  = data.item;
  const risks = data.riskWarnings ?? [];

  if (!item) {
    return (
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>📊 估值分析</h2>
        </div>
        <p className="text-[12px]" style={{ color: "#94A3B8" }}>
          {data.error ?? "该股票估值数据暂缺"}
        </p>
      </div>
    );
  }

  const lvColor: Record<string, string> = {
    low: "#00E5A8", reasonable: "#FACC15", high: "#EF4444", unknown: "#64748B",
  };
  const lvText: Record<string, string> = {
    low: "估值偏低", reasonable: "估值合理", high: "估值偏高", unknown: "估值未知",
  };

  return (
    <div className="p-4 rounded-2xl space-y-3"
         style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>

      {/* ── 标题栏 ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>📊 估值分析</h2>
          <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>
            {item.tradeDate && `${item.tradeDate.slice(0,4)}-${item.tradeDate.slice(4,6)}-${item.tradeDate.slice(6)} · `}
            {stockName} · 来源 Tushare
            {data.fromCache && <span> · 缓存</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg"
                style={{ background: `${lvColor[item.valuationLevel]}15`, color: lvColor[item.valuationLevel], border: `1px solid ${lvColor[item.valuationLevel]}30` }}>
            {lvText[item.valuationLevel]}
          </span>
          <button onClick={() => fetchData(true)} disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]"
                  style={{ background: "#07111F", color: refreshing ? "#64748B" : "#94A3B8", border: "1px solid #1a2f50" }}>
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>

      {/* ── 估值倍数 ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle>估值倍数</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <MetricRow label="PE TTM"  value={fmtNum(item.peTtm, 1)}  note={item.peTtm == null ? undefined : "滚动市盈率"} />
          <MetricRow label="PE 静态" value={fmtNum(item.pe, 1)} />
          <MetricRow label="PB"      value={fmtNum(item.pb, 2)} />
          <MetricRow label="PS TTM"  value={fmtNum(item.psTtm, 2)} />
          <MetricRow label="PS 静态" value={fmtNum(item.ps, 2)} />
          <MetricRow
            label="PEG"
            value={item.peg != null ? fmtNum(item.peg, 2) : (item.pegNote?.includes("不可计算") ? "不可计算" : "数据暂缺")}
            valueColor={item.peg != null ? (item.peg < 1 ? "#00E5A8" : item.peg < 2 ? "#FACC15" : "#EF4444") : "#64748B"}
            note={item.pegNote ?? undefined}
          />
        </div>
      </div>

      {/* ── 市值 ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>市值</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <MetricRow label="总市值"   value={fmtMarketCap(item.totalMarketValue)} />
          <MetricRow label="流通市值" value={fmtMarketCap(item.circulatingMarketValue)} />
        </div>
      </div>

      {/* ── 估值分位 ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle>历史估值分位（近3年）</SectionTitle>
        <div className="space-y-2">
          <PercentileBar
            label="市盈率分位（PE TTM）"
            value={item.pePercentile}
            note={item.percentileNote}
          />
          <PercentileBar
            label="市净率分位（PB）"
            value={item.pbPercentile}
            note={item.percentileNote}
          />
        </div>
        {item.percentileNote && (
          <p className="text-[9px] mt-1" style={{ color: "#64748B" }}>
            ⚠️ {item.percentileNote}，分位暂不可用
          </p>
        )}
      </div>

      {/* ── 股息率 + 交易活跃度 ──────────────────────────────────── */}
      <div>
        <SectionTitle>股息率 & 交易活跃度</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <MetricRow label="股息率"          value={fmtPct(item.dividendYield)}     note="dv_ratio" />
          <MetricRow label="股息率 TTM"      value={fmtPct(item.dividendYieldTtm)}  note="dv_ttm" />
          <MetricRow label="换手率"          value={fmtPct(item.turnoverRate)}       note="全部股本" />
          <MetricRow label="自由流通换手率"  value={fmtPct(item.freeFloatTurnoverRate)} />
          <MetricRow
            label={`量比${item.volumeRatioSource === "EastMoney" ? "（东财）" : ""}`}
            value={item.volumeRatio != null ? fmtNum(item.volumeRatio, 2) : "数据暂缺"}
            valueColor={item.volumeRatio != null && item.volumeRatio > 2 ? "#EF4444" : undefined}
          />
          <div className="flex flex-col items-center p-2.5 rounded-xl text-center"
               style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <TrendingUp size={16} color="#64748B" />
            <span className="text-[9px] mt-1" style={{ color: "#64748B" }}>活跃度</span>
          </div>
        </div>
        {item.volumeRatioSource === "EastMoney" && (
          <p className="text-[9px] mt-1" style={{ color: "#64748B" }}>量比数据来源：东方财富实时行情</p>
        )}
        {item.volumeRatio == null && (
          <p className="text-[9px] mt-1" style={{ color: "#64748B" }}>
            量比：Tushare daily_basic 当日收盘后提供，实时量比需通过东方财富接口
          </p>
        )}
      </div>

      {/* ── 风险提示 ──────────────────────────────────────────────── */}
      {risks.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>📋 估值风险提示（{risks.length} 条）</SectionTitle>
          {risks.map((r, i) => <RiskBadge key={i} msg={r} />)}
        </div>
      )}

      {risks.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
             style={{ background: "rgba(0,229,168,0.06)", border: "1px solid rgba(0,229,168,0.15)" }}>
          <span style={{ color: "#00E5A8" }} className="text-[13px]">✓</span>
          <span className="text-[11px]" style={{ color: "#00E5A8" }}>暂无估值风险提示</span>
        </div>
      )}

      {/* ── 近3年趋势（折叠） ─────────────────────────────────────── */}
      <div>
        <button onClick={() => setShowTrend(v => !v)}
                className="flex items-center gap-1.5 text-[11px] w-full"
                style={{ color: "#64748B" }}>
          {showTrend ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          近3年估值趋势图
        </button>
        {showTrend && (
          <div className="mt-2">
            <ValuationTrendChart symbol={symbol} />
          </div>
        )}
      </div>

      {/* ── 策略联动提示 ──────────────────────────────────────────── */}
      <div className="px-3 py-2 rounded-xl"
           style={{ background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.1)" }}>
        <p className="text-[9px] leading-[1.6]" style={{ color: "#64748B" }}>
          📊 <span style={{ color: "#60A5FA" }}>策略联动</span>：PE/PB分位低加分，PEG合理加分，股息率&gt;3%加分，估值极高扣分；ST策略读取市值/PB/换手率判断保壳和流动性风险。
        </p>
      </div>

      {/* ── 免责声明 ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl"
           style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.1)" }}>
        <Info size={11} color="#64748B" className="flex-shrink-0 mt-0.5" />
        <p className="text-[9px] leading-[1.6]" style={{ color: "#64748B" }}>
          估值数据来源于 Tushare（daily_basic），PEG 根据 PE TTM 与净利润增长率估算，仅供参考，不构成投资建议。
          市值单位：Tushare 返回万元，已换算为亿元展示。历史分位基于近3年 daily_basic 数据计算。
        </p>
      </div>
    </div>
  );
}
