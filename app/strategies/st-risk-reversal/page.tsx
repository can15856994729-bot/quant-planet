"use client";
/**
 * A股 ST 风险反转策略 — 策略详情页  v3
 *
 * v3 改动：
 * 1. 新增模式选择器（严格/标准/宽松），默认标准
 * 2. 新增诊断卡片（股票池过滤步骤、买入信号统计、被排除原因）
 * 3. 无交易信号时显示明确提示，不再显示一堆 0
 * 4. ST 股票池加载失败时更友好的提示
 * 5. 同步前端传 mode 参数给后端 API
 *
 * ⚠️ 极高风险说明：
 *   ST 股票存在退市、停牌、连续跌停、流动性枯竭、信息披露风险。
 *   本页面仅用于研究和模拟交易，不构成任何投资建议，不保证盈利。
 */
import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  AlertTriangle, ShieldAlert, TrendingUp, TrendingDown, BarChart3,
  Play, RefreshCw, ChevronDown, ChevronUp, Activity, Info,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import SingleSTBacktest from "./SingleSTBacktest";

// ── 颜色常量 ──────────────────────────────────────────────────────
const R   = "#EF4444";
const G   = "#00E5A8";
const Y   = "#FACC15";
const B   = "#3B82F6";
const DIM = "#64748B";
const MID = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

// ── 类型 ──────────────────────────────────────────────────────────
interface STStock {
  tsCode: string; symbol: string; name: string; industry: string;
  stType: string; listDate: string; exchange: string;
  price?: number; changePct?: number; amount?: number;
}

interface STTrade {
  date: string; tsCode: string; name: string; action: "BUY" | "SELL";
  reason: string; price: number; shares: number; amount: number; fee: number; pnl: number;
}

interface RiskEvent {
  date: string; tsCode: string; name: string;
  type: string; note: string;
}

interface STDiagnostics {
  totalMarket:    number;
  stNameCount:    number;
  afterFilters:   number;
  poolCandidates: number;
  withDataCount:  number;
  mode:           string;
  scoreThreshold: number;
  rebalanceDays:  number;
  buySignalCount: number;
  actualBuyCount: number;
  filterStats: {
    insufficientBars: number;
    limitUp:          number;
    suspended:        number;
    lowScore:         number;
    capitalLimited:   number;
  };
}

interface STResult {
  ok: true;
  status: "ok" | "no_trades" | "empty_pool" | "data_insufficient";
  statusMessage?: string;
  statusReason?:  string;
  diagnostics: STDiagnostics;
  totalReturn: number; annualReturn: number; maxDrawdown: number;
  sharpeRatio: number; winRate: number; profitFactor: number;
  totalTrades: number; maxConsecutiveLosses: number;
  totalFees: number; feeImpact: number; strategyScore: number;
  equity: { date: string; value: number }[];
  drawdown: { date: string; dd: number }[];
  trades: STTrade[];
  limitDownStuckCount: number; suspendedDayImpact: number;
  riskEvents: RiskEvent[]; poolSize: number;
  takeProfitCount: number; timeStopCount: number; stopLossCount: number;
  source: string; note: string;
  initialCapital: number; finalCapital: number;
}

type BtMode = "strict" | "standard" | "relaxed";

const MODE_LABELS: Record<BtMode, string> = {
  strict:   "严格",
  standard: "标准",
  relaxed:  "宽松",
};
const MODE_DESC: Record<BtMode, string> = {
  strict:   "综合≥70 趋势≥65 日均额≥3000万（原版，条件严格）",
  standard: "综合≥58 趋势≥48 日均额≥800万（默认，适合大多数ST股）",
  relaxed:  "综合≥45 趋势≥30 日均额≥200万（宽松，验证策略可行性）",
};
const MODE_DEFAULT_SCORE: Record<BtMode, number> = {
  strict: 70, standard: 58, relaxed: 45,
};

// ── 辅助函数 ──────────────────────────────────────────────────────
function fmtMoney(n: number) {
  if (Math.abs(n) >= 1e8) return `${(n/1e8).toFixed(1)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n/1e4).toFixed(0)}万`;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function yearsAgoYMD(n: number) {
  const d = new Date(); d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0,10).replace(/-/g,"");
}
function todayYMD() { return new Date().toISOString().slice(0,10).replace(/-/g,""); }
function fmtDateShort(d: string) { return `${d.slice(2,4)}/${d.slice(4,6)}`; }

function downsample<T>(arr: T[], max = 120): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

// ── 风险警告横幅 ──────────────────────────────────────────────────
function RiskBanner() {
  return (
    <div className="p-3 rounded-2xl"
      style={{ background: "rgba(127,29,29,0.5)", border: `2px solid ${R}` }}>
      <div className="flex items-start gap-2 mb-2">
        <ShieldAlert size={16} color={R} className="flex-shrink-0 mt-0.5" />
        <p className="font-black text-[13px]" style={{ color: R }}>⚠️ 极高风险策略 — 务必阅读</p>
      </div>
      <ul className="space-y-1 ml-4">
        {[
          "ST 股票存在终止上市（退市）风险，可能血本无归",
          "连续跌停时可能无法卖出，被迫持仓承受极端亏损",
          "长期停牌可能导致资金被锁定数月甚至更长",
          "信息披露风险：财务造假、立案调查可能引发暴跌",
          "本策略仅用于研究和模拟交易，不构成投资建议",
        ].map((t) => (
          <li key={t} className="text-[10px] leading-[1.6] list-disc" style={{ color: "#FCA5A5" }}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

// ── ST 股票卡片 ──────────────────────────────────────────────────
function STCard({ s }: { s: STStock }) {
  const isUp   = (s.changePct ?? 0) > 0;
  const isDown = (s.changePct ?? 0) < 0;
  return (
    <Link href={`/stock/${s.symbol}`}>
      <div className="p-3 rounded-xl active:opacity-75"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-bold text-[12px]" style={{ color: "#F8FAFC" }}>{s.name}</span>
              <span className="text-[8px] px-1 py-0.5 rounded font-bold"
                style={{ background: "rgba(239,68,68,0.15)", color: R }}>
                {s.stType}
              </span>
            </div>
            <p className="text-[10px]" style={{ color: DIM }}>
              {s.symbol} · {s.industry || "—"}
            </p>
          </div>
          <div className="text-right">
            {s.price !== undefined ? (
              <>
                <p className="font-black text-[15px] num" style={{ color: "#F8FAFC" }}>
                  ¥{s.price.toFixed(2)}
                </p>
                <div className="flex items-center justify-end gap-0.5 mt-0.5">
                  {isUp   ? <TrendingUp  size={10} color={R} /> : null}
                  {isDown ? <TrendingDown size={10} color={G} /> : null}
                  <span className="text-[11px] font-bold num"
                    style={{ color: isUp ? R : isDown ? G : MID }}>
                    {(s.changePct ?? 0) >= 0 ? "+" : ""}{(s.changePct ?? 0).toFixed(2)}%
                  </span>
                </div>
              </>
            ) : (
              <p className="text-[11px]" style={{ color: DIM }}>价格加载中…</p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── 资金曲线图 ────────────────────────────────────────────────────
function EquityChart({ equity }: { equity: { date: string; value: number }[] }) {
  const data = useMemo(() => downsample(equity).map((e) => ({
    d: fmtDateShort(e.date), v: e.value,
  })), [equity]);
  if (data.length < 2) return (
    <div className="flex items-center justify-center h-40" style={{ color: DIM }}>
      <p className="text-[11px]">数据不足，无法绘制曲线</p>
    </div>
  );
  const min = Math.min(...data.map((d) => d.v));
  const max = Math.max(...data.map((d) => d.v));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="st-eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={R} stopOpacity={0.25} />
            <stop offset="95%" stopColor={R} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
        <XAxis dataKey="d" tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[min * 0.98, max * 1.01]} tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false}
          tickFormatter={(v) => fmtMoney(v)} />
        <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
          formatter={(v) => [`¥${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`, "资金"]}
          labelStyle={{ color: MID }} itemStyle={{ color: R }} />
        <Area type="monotone" dataKey="v" stroke={R} strokeWidth={1.5} fill="url(#st-eq)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 回撤曲线图 ────────────────────────────────────────────────────
function DrawdownChart({ drawdown }: { drawdown: { date: string; dd: number }[] }) {
  const data = useMemo(() => downsample(drawdown).map((e) => ({ d: fmtDateShort(e.date), dd: e.dd })), [drawdown]);
  if (data.length < 2) return (
    <div className="flex items-center justify-center h-32" style={{ color: DIM }}>
      <p className="text-[11px]">无回撤数据</p>
    </div>
  );
  const minDD = Math.min(...data.map((d) => d.dd));
  return (
    <ResponsiveContainer width="100%" height={130}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="st-dd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={R} stopOpacity={0.35} />
            <stop offset="95%" stopColor={R} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
        <XAxis dataKey="d" tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[minDD * 1.1, 2]} tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`} />
        <ReferenceLine y={0} stroke={BORDER} strokeDasharray="3 3" />
        <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
          formatter={(v) => [`${Number(v).toFixed(2)}%`, "回撤"]}
          labelStyle={{ color: MID }} itemStyle={{ color: R }} />
        <Area type="monotone" dataKey="dd" stroke={R} strokeWidth={1.5} fill="url(#st-dd)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 诊断卡片 ─────────────────────────────────────────────────────
function DiagnosticsCard({ d }: { d: STDiagnostics }) {
  const modeLabel = d.mode === "strict" ? "严格" : d.mode === "standard" ? "标准" : "宽松";
  return (
    <div className="p-3 rounded-2xl space-y-2.5"
      style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.18)" }}>
      <div className="flex items-center gap-1.5">
        <Info size={12} color={B} />
        <p className="text-[11px] font-bold" style={{ color: B }}>回测诊断（{modeLabel}模式，评分≥{d.scoreThreshold}）</p>
      </div>

      {/* 股票池过滤 */}
      <div>
        <p className="text-[10px] font-semibold mb-1" style={{ color: MID }}>▶ 股票池过滤</p>
        <div className="grid grid-cols-2 gap-1">
          {[
            { label: "A股全市场",    value: `${d.totalMarket} 只` },
            { label: "ST名称识别",   value: `${d.stNameCount} 只`, color: d.stNameCount > 0 ? G : R },
            { label: "过滤后候选",   value: `${d.afterFilters} 只`, color: d.afterFilters > 0 ? G : R },
            { label: "拉取K线",      value: `${d.poolCandidates} 只` },
            { label: "K线充足(≥20日)", value: `${d.withDataCount} 只`, color: d.withDataCount > 0 ? G : R },
            { label: "调仓日数量",   value: `${d.rebalanceDays} 天` },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between px-2 py-1 rounded-lg"
              style={{ background: "#0a1628" }}>
              <span className="text-[9px]" style={{ color: DIM }}>{label}</span>
              <span className="text-[10px] font-bold num" style={{ color: color ?? MID }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 买入信号 */}
      <div>
        <p className="text-[10px] font-semibold mb-1" style={{ color: MID }}>▶ 买入信号</p>
        <div className="grid grid-cols-2 gap-1">
          {[
            { label: "产生信号（累计）", value: `${d.buySignalCount} 次`, color: d.buySignalCount > 0 ? G : R },
            { label: "实际成交",         value: `${d.actualBuyCount} 次`, color: d.actualBuyCount > 0 ? G : R },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between px-2 py-1 rounded-lg"
              style={{ background: "#0a1628" }}>
              <span className="text-[9px]" style={{ color: DIM }}>{label}</span>
              <span className="text-[10px] font-bold num" style={{ color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 被排除原因 */}
      {(d.filterStats.insufficientBars + d.filterStats.limitUp + d.filterStats.suspended + d.filterStats.lowScore) > 0 && (
        <div>
          <p className="text-[10px] font-semibold mb-1" style={{ color: MID }}>▶ 被排除原因（调仓日累计）</p>
          <div className="space-y-0.5">
            {[
              { label: "K线数据不足",     count: d.filterStats.insufficientBars },
              { label: "涨停（无法买入）", count: d.filterStats.limitUp },
              { label: "停牌",             count: d.filterStats.suspended },
              { label: "评分/条件不达标",  count: d.filterStats.lowScore },
              { label: "资金/仓位限制",    count: d.filterStats.capitalLimited },
            ].filter((x) => x.count > 0).map(({ label, count }) => (
              <div key={label} className="flex items-center justify-between px-2 py-1 rounded-lg"
                style={{ background: "#0a1628" }}>
                <span className="text-[9px]" style={{ color: DIM }}>{label}</span>
                <span className="text-[10px] font-bold num" style={{ color: R }}>{count} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 无交易信号提示卡片 ────────────────────────────────────────────
function NoTradesCard({ result }: { result: STResult }) {
  return (
    <div className="space-y-3">
      <div className="p-4 rounded-2xl"
        style={{ background: "rgba(250,204,21,0.06)", border: `2px solid ${Y}` }}>
        <div className="flex items-start gap-2 mb-2">
          <AlertTriangle size={16} color={Y} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-[13px]" style={{ color: Y }}>
              {result.statusMessage ?? "本次回测无交易信号"}
            </p>
            {result.statusReason && (
              <p className="text-[11px] mt-1 leading-[1.6]" style={{ color: MID }}>
                {result.statusReason}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 p-2.5 rounded-xl" style={{ background: "#0a1628" }}>
          <p className="text-[10px] font-bold mb-1" style={{ color: Y }}>建议操作：</p>
          <ul className="space-y-0.5">
            {[
              '切换到【宽松】模式，降低买入门槛',
              "降低评分阈值（如从 58 降到 50）",
              "延长回测时间范围（使用近2年或近3年）",
              "确认 Tushare Token 有效且有 daily 接口权限",
            ].map((t) => (
              <li key={t} className="text-[10px] list-disc ml-3" style={{ color: DIM }}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
      {/* 仍然显示诊断 */}
      <DiagnosticsCard d={result.diagnostics} />
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
function STStrategyContent() {
  // ── ST 股票池 state ─────────────────────────────────────────
  const [stStocks,    setSTStocks]    = useState<STStock[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolError,   setPoolError]   = useState<string | null>(null);
  const [poolDiag,    setPoolDiag]    = useState<{
    totalMarket: number; stNameCount: number; afterDelistFilter: number;
  } | null>(null);
  const [showAllPool, setShowAllPool] = useState(false);

  // ── 回测 state ──────────────────────────────────────────────
  const [tushareOk,      setTushareOk]      = useState<boolean | null>(null);
  const [dateRange,      setDateRange]      = useState<"近1年"|"近2年"|"近3年">("近1年");
  const [capital,        setCapital]        = useState(100000);
  const [mode,           setMode]           = useState<BtMode>("standard");
  const [scoreThreshold, setScoreThreshold] = useState(58);
  const [maxPositions,   setMaxPositions]   = useState(3);
  const [maxSingleWT,    setMaxSingleWT]    = useState(0.03);
  const [maxTotalWT,     setMaxTotalWT]     = useState(0.10);
  const [stopLoss,       setStopLoss]       = useState(0.05);
  const [takeProfit,     setTakeProfit]     = useState(0.20);
  const [maxHoldDays,    setMaxHoldDays]    = useState(20);
  const [rebalanceFreq,  setRebalanceFreq]  = useState<"weekly"|"monthly">("weekly");
  const [showAdvanced,   setShowAdvanced]   = useState(false);
  const [activeTab,      setActiveTab]      = useState<"equity"|"drawdown"|"trades"|"risk">("equity");
  const [showDiag,       setShowDiag]       = useState(false);
  const [pageMode,       setPageMode]       = useState<"pool" | "single">("pool");

  const [running,     setRunning]     = useState(false);
  const [result,      setResult]      = useState<STResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  // mode 变化时自动同步默认评分阈值
  useEffect(() => {
    setScoreThreshold(MODE_DEFAULT_SCORE[mode]);
  }, [mode]);

  // ── 初始化 ───────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/tushare/status")
      .then((r) => r.json())
      .then((d) => setTushareOk(d.capabilities?.daily?.status === "ok"))
      .catch(() => setTushareOk(false));
  }, []);

  useEffect(() => {
    setPoolLoading(true);
    fetch("/api/tushare/st-pool")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setSTStocks(d.stocks ?? []);
          setPoolDiag({
            totalMarket: d.totalMarket ?? 0,
            stNameCount: d.stNameCount ?? 0,
            afterDelistFilter: d.afterDelistFilter ?? 0,
          });
          setPoolError(null);
        } else {
          setPoolError(d.error ?? "加载失败");
        }
        setPoolLoading(false);
      })
      .catch((e) => { setPoolError(String(e)); setPoolLoading(false); });
  }, []);

  // ── 计算回测起始日期 ─────────────────────────────────────────
  const startDate = useMemo(() => {
    const n = dateRange === "近1年" ? 1 : dateRange === "近2年" ? 2 : 3;
    return yearsAgoYMD(n);
  }, [dateRange]);

  // ── 运行回测 ─────────────────────────────────────────────────
  async function handleRun() {
    if (!tushareOk) return;
    setRunning(true); setResult(null); setResultError(null);
    try {
      const res = await fetch("/api/tushare/st-backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate, endDate: todayYMD(),
          initialCapital: capital,
          mode,                          // v3 新增
          scoreThreshold,
          maxPositions, maxSingleWeight: maxSingleWT,
          maxTotalSTWeight: maxTotalWT,
          stopLossRate:   stopLoss,
          takeProfitRate: takeProfit,
          maxHoldDays,
          rebalanceFreq,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data as STResult);
        setShowDiag(data.status !== "ok"); // 无交易时自动展开诊断
      } else {
        setResultError(data.error ?? "回测失败");
      }
    } catch (e) { setResultError(String(e)); }
    setRunning(false);
  }

  const displayedPool = showAllPool ? stStocks : stStocks.slice(0, 10);
  const canRun = tushareOk === true && !running;

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="ST 风险反转策略" />

      <div className="px-4 pt-4 space-y-4 pb-24">

        {/* ── 风险警告 ──────────────────────────────────────── */}
        <RiskBanner />

        {/* ── 策略概要 ──────────────────────────────────────── */}
        <div className="p-4 rounded-2xl space-y-3" style={{ background: CARD, border: `1px solid ${R}33` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>A股 ST 风险反转策略</p>
              <p className="text-[10px] mt-0.5" style={{ color: DIM }}>仅 A股 ST / *ST · 事件驱动 · 困境反转</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: "rgba(239,68,68,0.15)", color: R, border: "1px solid rgba(239,68,68,0.3)" }}>
                🔴 ST 高风险
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "单股最大仓位",  value: "3%",      note: "严格限制" },
              { label: "ST总仓位上限",  value: "10%",     note: "v2收紧" },
              { label: "最大同时持仓",  value: "3 只",    note: "集中精选" },
              { label: "止损/止盈",    value: "-5%/+20%", note: "新增止盈" },
            ].map(({ label, value, note }) => (
              <div key={label} className="p-2.5 rounded-xl" style={{ background: "#0a1628" }}>
                <p className="font-black text-[13px]" style={{ color: R }}>{value}</p>
                <p className="text-[10px] mt-0.5" style={{ color: DIM }}>{label}</p>
                <p className="text-[9px]" style={{ color: G }}>{note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 当前 ST 候选股票池 ────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="font-bold text-[13px]" style={{ color: MID }}>当前 ST 候选股票池</p>
              {!poolLoading && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                  style={{ background: "rgba(239,68,68,0.1)", color: R }}>
                  {stStocks.length} 只
                </span>
              )}
            </div>
          </div>

          {/* 股票池诊断信息 */}
          {poolDiag && !poolLoading && (
            <div className="mb-2 px-3 py-1.5 rounded-xl flex flex-wrap gap-x-3 gap-y-0.5"
              style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              {[
                { k: "A股全市场",  v: `${poolDiag.totalMarket}只` },
                { k: "ST识别",     v: `${poolDiag.stNameCount}只` },
                { k: "排除退市整理", v: `${poolDiag.afterDelistFilter}只` },
                { k: "最终候选",   v: `${stStocks.length}只`, color: stStocks.length > 0 ? G : R },
              ].map(({ k, v, color }) => (
                <span key={k} className="text-[9px]">
                  <span style={{ color: DIM }}>{k}：</span>
                  <span className="font-bold" style={{ color: color ?? MID }}>{v}</span>
                </span>
              ))}
            </div>
          )}

          {poolLoading && (
            <div className="flex items-center gap-2 p-4 rounded-2xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: MID, borderTopColor: "transparent" }} />
              <p className="text-[12px]" style={{ color: MID }}>正在从 Tushare 加载 ST 股票池…</p>
            </div>
          )}

          {!poolLoading && poolError && (
            <div className="p-3 rounded-2xl flex items-start gap-2"
              style={{ background: "rgba(239,68,68,0.06)", border: `1px solid ${R}33` }}>
              <AlertTriangle size={13} color={R} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[12px]" style={{ color: R }}>
                  {poolError.includes("TOKEN") || poolError.includes("配置")
                    ? "Tushare Token 未配置，无法获取真实 ST 股票池"
                    : `ST 股票池加载失败：${poolError}`}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: DIM }}>
                  本策略不使用 mock 数据替代。请配置 TUSHARE_TOKEN 后重新部署。
                </p>
              </div>
            </div>
          )}

          {!poolLoading && !poolError && stStocks.length === 0 && (
            <div className="p-3 rounded-2xl flex items-start gap-2"
              style={{ background: "rgba(250,204,21,0.06)", border: `1px solid ${Y}33` }}>
              <AlertTriangle size={13} color={Y} className="flex-shrink-0 mt-0.5" />
              <p className="text-[11px]" style={{ color: MID }}>
                未筛选到 ST 股票。请检查 Tushare Token 是否有效，或 stock_basic 接口是否可用。
              </p>
            </div>
          )}

          {!poolLoading && !poolError && stStocks.length > 0 && (
            <>
              <div className="space-y-1.5">
                {displayedPool.map((s) => <STCard key={s.tsCode} s={s} />)}
              </div>
              {stStocks.length > 10 && (
                <button onClick={() => setShowAllPool(!showAllPool)}
                  className="w-full mt-2 py-2.5 rounded-xl text-[11px] font-bold"
                  style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
                  {showAllPool ? "收起" : `查看全部 ${stStocks.length} 只 ST 股票`}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Tushare 状态 ─────────────────────────────────── */}
        <div className="p-3 rounded-xl flex items-center gap-2"
          style={{
            background: tushareOk ? "rgba(0,229,168,0.06)" : tushareOk === false ? "rgba(239,68,68,0.06)" : "rgba(148,163,184,0.06)",
            border: `1px solid ${tushareOk ? "rgba(0,229,168,0.2)" : tushareOk === false ? "rgba(239,68,68,0.2)" : BORDER}`,
          }}>
          {tushareOk === null
            ? <div className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: MID, borderTopColor: "transparent" }} />
            : tushareOk ? <Activity size={13} color={G} /> : <AlertTriangle size={13} color={R} />
          }
          <p className="text-[11px] font-bold"
            style={{ color: tushareOk ? G : tushareOk === false ? R : MID }}>
            {tushareOk === null ? "检查 Tushare 连接…" : tushareOk ? "Tushare 已连接 — 使用真实历史 K 线数据" : "Tushare 未连接 — 无法运行真实回测"}
          </p>
        </div>

        {/* ── 回测模式切换 ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          {(["pool", "single"] as const).map((m) => {
            const isActive = pageMode === m;
            return (
              <button key={m} onClick={() => setPageMode(m)}
                className="py-3 rounded-2xl text-[13px] font-black"
                style={{
                  background: isActive ? "rgba(239,68,68,0.18)" : CARD,
                  border: `2px solid ${isActive ? R : BORDER}`,
                  color: isActive ? R : MID,
                }}>
                {m === "pool" ? "🏦 股票池回测" : "🔍 单只股票回测"}
              </button>
            );
          })}
        </div>

        {/* ── 股票池回测模式 ────────────────────────────────── */}
        {pageMode === "pool" && (<>

        {/* ── 回测参数 ─────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="font-bold text-[13px]" style={{ color: MID }}>ST 策略历史回测</p>

          {/* ▶ 策略模式选择（v3 新增） */}
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: DIM }}>策略模式（影响买入条件严格程度）</p>
            <div className="grid grid-cols-3 gap-2">
              {(["strict", "standard", "relaxed"] as BtMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className="py-2 px-2 rounded-xl text-center"
                  style={{
                    background: mode === m ? "rgba(250,204,21,0.15)" : CARD,
                    border: `1px solid ${mode === m ? Y : BORDER}`,
                    color: mode === m ? Y : MID,
                  }}>
                  <p className="text-[12px] font-black">{MODE_LABELS[m]}</p>
                  <p className="text-[8px] mt-0.5 leading-[1.4]" style={{ color: mode === m ? "#D4B72C" : DIM }}>
                    {m === "strict" ? "≥70分" : m === "standard" ? "≥58分" : "≥45分"}
                  </p>
                </button>
              ))}
            </div>
            <p className="text-[9px] mt-1.5 px-1" style={{ color: DIM }}>
              ℹ {MODE_DESC[mode]}
            </p>
          </div>

          {/* 时间范围 */}
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: DIM }}>回测时间</p>
            <div className="grid grid-cols-3 gap-2">
              {(["近1年","近2年","近3年"] as const).map((t) => (
                <button key={t} onClick={() => setDateRange(t)}
                  className="py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: dateRange === t ? "rgba(239,68,68,0.15)" : CARD,
                    border: `1px solid ${dateRange === t ? R : BORDER}`,
                    color: dateRange === t ? R : MID,
                  }}>{t}</button>
              ))}
            </div>
          </div>

          {/* 初始资金 */}
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: DIM }}>初始资金</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[50000, 100000, 200000, 500000].map((v) => (
                <button key={v} onClick={() => setCapital(v)}
                  className="py-2 rounded-xl text-[11px] font-bold"
                  style={{
                    background: capital === v ? "rgba(239,68,68,0.15)" : CARD,
                    border: `1px solid ${capital === v ? R : BORDER}`,
                    color: capital === v ? R : MID,
                  }}>¥{v >= 10000 ? `${v/10000}万` : v}</button>
              ))}
            </div>
          </div>

          {/* 高级参数 */}
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-[11px] font-bold"
            style={{ color: DIM }}>
            {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showAdvanced ? "收起高级参数" : "高级参数（仓位/止损/评分）"}
          </button>

          {showAdvanced && (
            <div className="p-3 rounded-2xl space-y-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              {/* 评分阈值 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>买入综合评分阈值（由模式自动设置，可手动调整）</p>
                <div className="flex gap-2">
                  {[45, 50, 58, 65, 70].map((v) => (
                    <button key={v} onClick={() => setScoreThreshold(v)}
                      className="flex-1 py-2 rounded-xl text-[10px] font-bold"
                      style={{
                        background: scoreThreshold === v ? "rgba(250,204,21,0.15)" : "#0a1628",
                        border: `1px solid ${scoreThreshold === v ? Y : BORDER}`,
                        color: scoreThreshold === v ? Y : MID,
                      }}>{v}分</button>
                  ))}
                </div>
              </div>

              {/* 最大持仓 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>最大持仓只数</p>
                <div className="flex gap-2">
                  {[3, 4, 5].map((v) => (
                    <button key={v} onClick={() => setMaxPositions(v)}
                      className="flex-1 py-2 rounded-xl text-[11px] font-bold"
                      style={{
                        background: maxPositions === v ? "rgba(239,68,68,0.12)" : "#0a1628",
                        border: `1px solid ${maxPositions === v ? R : BORDER}`,
                        color: maxPositions === v ? R : MID,
                      }}>{v} 只</button>
                  ))}
                </div>
              </div>

              {/* 单股仓位 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>单股最大仓位（ST策略上限5%）</p>
                <div className="flex gap-2">
                  {[{ v: 0.02, l: "2%" }, { v: 0.03, l: "3%" }, { v: 0.04, l: "4%" }, { v: 0.05, l: "5%" }].map(({ v, l }) => (
                    <button key={v} onClick={() => setMaxSingleWT(v)}
                      className="flex-1 py-2 rounded-xl text-[11px] font-bold"
                      style={{
                        background: maxSingleWT === v ? "rgba(239,68,68,0.12)" : "#0a1628",
                        border: `1px solid ${maxSingleWT === v ? R : BORDER}`,
                        color: maxSingleWT === v ? R : MID,
                      }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* 止损 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>止损比例</p>
                <div className="flex gap-2">
                  {[{ v: 0.04, l: "-4%" }, { v: 0.05, l: "-5%" }, { v: 0.06, l: "-6%" }, { v: 0, l: "不止损" }].map(({ v, l }) => (
                    <button key={v} onClick={() => setStopLoss(v)}
                      className="flex-1 py-2 rounded-xl text-[11px] font-bold"
                      style={{
                        background: stopLoss === v ? "rgba(239,68,68,0.12)" : "#0a1628",
                        border: `1px solid ${stopLoss === v ? R : BORDER}`,
                        color: stopLoss === v ? R : MID,
                      }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* 止盈 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>止盈比例</p>
                <div className="flex gap-2">
                  {[{ v: 0.15, l: "+15%" }, { v: 0.20, l: "+20%" }, { v: 0.30, l: "+30%" }, { v: 0, l: "不止盈" }].map(({ v, l }) => (
                    <button key={v} onClick={() => setTakeProfit(v)}
                      className="flex-1 py-2 rounded-xl text-[11px] font-bold"
                      style={{
                        background: takeProfit === v ? "rgba(0,229,168,0.12)" : "#0a1628",
                        border: `1px solid ${takeProfit === v ? G : BORDER}`,
                        color: takeProfit === v ? G : MID,
                      }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* 时间止损 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>时间止损（持仓超期不涨则退出）</p>
                <div className="flex gap-2">
                  {[{ v: 15, l: "15日" }, { v: 20, l: "20日" }, { v: 30, l: "30日" }, { v: 0, l: "不限" }].map(({ v, l }) => (
                    <button key={v} onClick={() => setMaxHoldDays(v)}
                      className="flex-1 py-2 rounded-xl text-[11px] font-bold"
                      style={{
                        background: maxHoldDays === v ? "rgba(250,204,21,0.12)" : "#0a1628",
                        border: `1px solid ${maxHoldDays === v ? Y : BORDER}`,
                        color: maxHoldDays === v ? Y : MID,
                      }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* 调仓频率 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>调仓频率</p>
                <div className="flex gap-2">
                  {[{ v: "weekly" as const, l: "每周调仓" }, { v: "monthly" as const, l: "每月调仓" }].map(({ v, l }) => (
                    <button key={v} onClick={() => setRebalanceFreq(v)}
                      className="flex-1 py-2 rounded-xl text-[11px] font-bold"
                      style={{
                        background: rebalanceFreq === v ? "rgba(239,68,68,0.12)" : "#0a1628",
                        border: `1px solid ${rebalanceFreq === v ? R : BORDER}`,
                        color: rebalanceFreq === v ? R : MID,
                      }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 运行按钮 */}
          <button onClick={handleRun} disabled={!canRun}
            className="w-full py-4 rounded-2xl font-black text-[15px]"
            style={{
              background: canRun ? "linear-gradient(135deg, #EF4444, #b91c1c)" : CARD,
              color: canRun ? "#fff" : DIM,
            }}>
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "#fff", borderTopColor: "transparent" }} />
                ST 回测运行中（约 30–90s）…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Play size={16} />
                运行 ST 策略真实回测（{MODE_LABELS[mode]}模式）
              </span>
            )}
          </button>

          {/* 回测配置摘要 */}
          <div className="px-3 py-2 rounded-xl flex flex-wrap gap-x-3 gap-y-1"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            {[
              { k: "模式",   v: MODE_LABELS[mode] },
              { k: "评分≥",  v: `${scoreThreshold}分` },
              { k: "时间",   v: dateRange },
              { k: "资金",   v: `¥${fmtMoney(capital)}` },
              { k: "持仓≤",  v: `${maxPositions}只` },
              { k: "单股≤",  v: `${(maxSingleWT*100).toFixed(0)}%` },
              { k: "ST总≤",  v: `${(maxTotalWT*100).toFixed(0)}%` },
              { k: "止损",   v: stopLoss > 0 ? `-${(stopLoss*100).toFixed(0)}%` : "关闭" },
              { k: "止盈",   v: takeProfit > 0 ? `+${(takeProfit*100).toFixed(0)}%` : "关闭" },
              { k: "时间止损", v: maxHoldDays > 0 ? `${maxHoldDays}日` : "关闭" },
            ].map(({ k, v }) => (
              <span key={k} className="text-[10px]">
                <span style={{ color: DIM }}>{k}：</span>
                <span className="font-bold" style={{ color: "#F8FAFC" }}>{v}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── 错误提示 ─────────────────────────────────────── */}
        {resultError && (
          <div className="p-3 rounded-xl flex items-start gap-2"
            style={{ background: "rgba(239,68,68,0.06)", border: `1px solid ${R}33` }}>
            <AlertTriangle size={13} color={R} className="flex-shrink-0" />
            <div>
              <p className="font-bold text-[12px]" style={{ color: R }}>回测失败</p>
              <p className="text-[11px] mt-0.5" style={{ color: MID }}>{resultError}</p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            回测结果面板
        ══════════════════════════════════════════════════ */}
        {result && (
          <div className="space-y-4">

            {/* ── 无交易信号提示（v3 新增） ─────────────────── */}
            {result.status !== "ok" && (
              <NoTradesCard result={result} />
            )}

            {/* ── 正常结果 ───────────────────────────────────── */}
            {result.status === "ok" && (
              <>
                {/* ST 专项统计 */}
                <div className="p-3 rounded-xl space-y-2"
                  style={{ background: "rgba(239,68,68,0.05)", border: `1px solid ${R}33` }}>
                  <p className="text-[11px] font-bold" style={{ color: R }}>⚠️ ST 专项风险 & 收益指标</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "跌停无法卖出", value: `${result.limitDownStuckCount}次`,  color: result.limitDownStuckCount > 0 ? R : G },
                      { label: "停牌影响天数", value: `${result.suspendedDayImpact}天`,   color: result.suspendedDayImpact > 10 ? R : Y },
                      { label: "参与ST池",     value: `${result.poolSize}只`,             color: MID },
                      { label: "触发止盈",     value: `${result.takeProfitCount ?? 0}次`, color: G },
                      { label: "时间止损",     value: `${result.timeStopCount ?? 0}次`,   color: Y },
                      { label: "触发止损",     value: `${result.stopLossCount ?? 0}次`,   color: result.stopLossCount > 5 ? R : MID },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="p-2 rounded-lg text-center" style={{ background: "#0a1628" }}>
                        <p className="font-black text-[13px] num" style={{ color }}>{value}</p>
                        <p className="text-[9px] mt-0.5" style={{ color: DIM }}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 总收益 + 评分 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl text-center"
                    style={{ background: "rgba(239,68,68,0.06)", border: `1px solid ${R}33` }}>
                    <p className="text-[11px] font-bold mb-1" style={{ color: MID }}>总收益</p>
                    <p className="font-black text-[28px] num" style={{ color: result.totalReturn >= 0 ? G : R }}>
                      {result.totalReturn >= 0 ? "+" : ""}{result.totalReturn.toFixed(2)}%
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: DIM }}>
                      ¥{fmtMoney(result.initialCapital)} → ¥{fmtMoney(result.finalCapital)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "年化收益", value: `${result.annualReturn >= 0 ? "+" : ""}${result.annualReturn.toFixed(1)}%`, color: result.annualReturn >= 0 ? G : R },
                      { label: "最大回撤", value: `${result.maxDrawdown.toFixed(1)}%`,  color: result.maxDrawdown < -20 ? R : Y },
                      { label: "夏普比率", value: result.sharpeRatio.toFixed(2),        color: MID },
                      { label: "胜率",     value: `${result.winRate.toFixed(0)}%`,       color: result.winRate >= 50 ? G : R },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="p-2 rounded-xl text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                        <p className="font-black text-[12px] num" style={{ color }}>{value}</p>
                        <p className="text-[9px] mt-0.5" style={{ color: DIM }}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 更多指标 */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "盈亏比",   value: result.profitFactor.toFixed(2),       color: MID },
                    { label: "总交易",   value: `${result.totalTrades}次`,             color: MID },
                    { label: "连续亏损", value: `${result.maxConsecutiveLosses}次`,    color: result.maxConsecutiveLosses > 5 ? R : MID },
                    { label: "手续费",   value: `${result.feeImpact.toFixed(1)}%`,     color: result.feeImpact > 5 ? R : MID },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="p-2.5 rounded-xl text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                      <p className="font-black text-[12px] num" style={{ color }}>{value}</p>
                      <p className="text-[9px] mt-0.5" style={{ color: DIM }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* 图表 Tab */}
                <div className="p-3 rounded-2xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <div className="flex gap-1 mb-3">
                    {([
                      { k: "equity"   as const, label: "资金曲线" },
                      { k: "drawdown" as const, label: "回撤曲线" },
                      { k: "trades"   as const, label: "交易记录" },
                      { k: "risk"     as const, label: `风险事件(${result.riskEvents.length})` },
                    ] as const).map(({ k, label }) => (
                      <button key={k} onClick={() => setActiveTab(k as typeof activeTab)}
                        className="flex-1 py-1.5 rounded-xl text-[10px] font-bold"
                        style={{
                          background: activeTab === k ? "rgba(239,68,68,0.15)" : "#0a1628",
                          border: `1px solid ${activeTab === k ? R : BORDER}`,
                          color: activeTab === k ? R : MID,
                        }}>{label}</button>
                    ))}
                  </div>

                  {activeTab === "equity"   && <EquityChart   equity={result.equity}     />}
                  {activeTab === "drawdown" && <DrawdownChart drawdown={result.drawdown} />}

                  {activeTab === "trades" && (
                    <div>
                      <p className="text-[10px] font-bold mb-2" style={{ color: MID }}>
                        卖出记录（共 {result.trades.filter((t) => t.action === "SELL").length} 笔）
                      </p>
                      {result.trades.filter((t) => t.action === "SELL").length === 0 ? (
                        <p className="text-[11px] py-4 text-center" style={{ color: DIM }}>暂无卖出记录</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[9px]" style={{ borderCollapse: "separate", borderSpacing: "0 2px" }}>
                            <thead>
                              <tr>
                                {["日期","股票","原因","价格","盈亏"].map((h) => (
                                  <th key={h} className="px-2 py-1 text-left font-bold" style={{ color: DIM }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {result.trades.filter((t) => t.action === "SELL").slice().reverse().slice(0, 30).map((t, i) => (
                                <tr key={i} style={{ background: CARD }}>
                                  <td className="px-2 py-1.5 rounded-l-lg" style={{ color: MID }}>{t.date.slice(0,4)+"/"+t.date.slice(4,6)}</td>
                                  <td className="px-2 py-1.5 font-bold" style={{ color: "#F8FAFC" }}>{t.name}</td>
                                  <td className="px-2 py-1.5">
                                    <span className="px-1 py-0.5 rounded text-[8px] font-bold"
                                      style={{
                                        background:
                                          t.reason === "stop_loss"       ? "rgba(239,68,68,0.15)" :
                                          t.reason === "limit_down_exit" ? "rgba(239,68,68,0.20)" :
                                          t.reason === "take_profit"     ? "rgba(0,229,168,0.15)" :
                                          t.reason === "time_stop"       ? "rgba(250,204,21,0.12)" :
                                          "rgba(148,163,184,0.1)",
                                        color:
                                          t.reason === "stop_loss"       ? R :
                                          t.reason === "limit_down_exit" ? R :
                                          t.reason === "take_profit"     ? G :
                                          t.reason === "time_stop"       ? Y :
                                          MID,
                                      }}>
                                      {t.reason === "stop_loss"       ? "止损"   :
                                       t.reason === "limit_down_exit" ? "跌停退" :
                                       t.reason === "take_profit"     ? "止盈✓"  :
                                       t.reason === "time_stop"       ? "超期"   :
                                       t.reason === "signal"          ? "调仓"   : "收盘"}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5 num" style={{ color: "#F8FAFC" }}>{t.price.toFixed(2)}</td>
                                  <td className="px-2 py-1.5 num rounded-r-lg font-bold"
                                    style={{ color: t.pnl > 0 ? G : R }}>
                                    {t.pnl > 0 ? "+" : ""}{fmtMoney(t.pnl)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "risk" && (
                    <div>
                      <p className="text-[10px] font-bold mb-2" style={{ color: R }}>
                        风险事件记录（共 {result.riskEvents.length} 条）
                      </p>
                      {result.riskEvents.length === 0 ? (
                        <p className="text-[11px] py-4 text-center" style={{ color: DIM }}>回测期间未触发重大风险事件</p>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {result.riskEvents.slice(0, 50).map((e, i) => (
                            <div key={i} className="p-2 rounded-lg flex items-start gap-2"
                              style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                              <AlertTriangle size={10} color={R} className="flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] font-bold" style={{ color: R }}>
                                  {e.date.slice(0,4)}/{e.date.slice(4,6)} · {e.name}
                                </p>
                                <p className="text-[9px]" style={{ color: DIM }}>{e.note}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── 诊断折叠卡片（status=ok 时可展开） ─────────── */}
            {result.status === "ok" && result.diagnostics && (
              <div>
                <button onClick={() => setShowDiag(!showDiag)}
                  className="flex items-center gap-1.5 text-[10px] font-bold mb-2"
                  style={{ color: DIM }}>
                  {showDiag ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {showDiag ? "收起回测诊断" : "查看回测诊断（股票池 & 信号统计）"}
                </button>
                {showDiag && <DiagnosticsCard d={result.diagnostics} />}
              </div>
            )}

            {/* 数据来源 */}
            {result.status === "ok" && (
              <div className="p-3 rounded-xl flex items-start gap-2"
                style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.12)" }}>
                <Activity size={12} color={B} className="flex-shrink-0 mt-0.5" />
                <p className="text-[9px] leading-[1.7]" style={{ color: DIM }}>
                  <span className="font-bold" style={{ color: B }}>数据说明：</span>{result.note}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 关闭股票池回测模式 */}
        </>)}

        {/* ── 单只股票回测模式 ─────────────────────────────── */}
        {pageMode === "single" && (
          <SingleSTBacktest stStocks={stStocks} tushareOk={tushareOk} />
        )}

        {/* ── 底部风险提示 ─────────────────────────────────── */}
        <div className="p-3 rounded-xl"
          style={{ background: "rgba(127,29,29,0.2)", border: `1px solid ${R}33` }}>
          <p className="text-[10px] leading-[1.7]" style={{ color: "#FCA5A5" }}>
            ⚠️ <span className="font-bold">风险提示：</span>
            ST 股票存在终止上市风险，股票价值可能归零。连续跌停时无法卖出，资金可能被锁定。
            本策略历史回测不代表未来收益，不构成投资建议，不保证盈利。盈亏自负。
          </p>
        </div>
      </div>
    </div>
  );
}

export default function STStrategyPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "#EF4444", borderTopColor: "transparent" }} />
      </div>
    }>
      <STStrategyContent />
    </Suspense>
  );
}
