"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  BarChart3, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Lock,
  Save, Play, RefreshCw, TrendingUp, TrendingDown, Activity, GitCompare, ArrowRight,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { useStrategyConfigStore } from "@/lib/strategyConfigStore";
import type { SavedStrategyConfig } from "@/lib/strategyConfigStore";

// ── 颜色常量 ────────────────────────────────────────────────────────────
const G = "#00E5A8";
const R = "#EF4444";
const Y = "#FACC15";
const B = "#3B82F6";
const DIM = "#64748B";
const MID = "#94A3B8";
const CARD = "#0d1f3c";
const BORDER = "#1a2f50";

// ── 结果类型（与后端 BacktestResult 对应）──────────────────────────────
interface Diagnostic { type: "warning" | "info"; message: string; }
interface BacktestTrade {
  date: string; tsCode: string; name: string;
  action: "BUY" | "SELL";
  reason: "rebalance" | "stop_loss" | "take_profit" | "final";
  price: number; shares: number; amount: number; fee: number; pnl: number;
}
interface BacktestResult {
  ok: true;
  totalReturn: number; annualReturn: number; maxDrawdown: number;
  sharpeRatio: number; winRate: number; profitFactor: number;
  totalTrades: number; maxConsecutiveLosses: number;
  totalFees: number; feeImpact: number; strategyScore: number;
  equity: { date: string; value: number }[];
  drawdown: { date: string; dd: number }[];
  trades: BacktestTrade[];
  diagnostics: Diagnostic[];
  initialCapital: number; finalCapital: number;
  startDate: string; endDate: string;
  source: "tushare"; note: string;
}

// ── 回测请求 body ──────────────────────────────────────────────────────
interface BacktestBody {
  startDate: string; endDate: string; initialCapital: number;
  commissionRate: number; maxPositions: number;
  rebalanceFreq: "weekly" | "monthly";
  maxSingleWeight: number; stopLossRate: number;
  takeProfitRate: number; scoreThreshold: number;
}

// ── 日期辅助 ─────────────────────────────────────────────────────────
function todayYMD() { return new Date().toISOString().slice(0,10).replace(/-/g,""); }
function yearsAgoYMD(n: number) {
  const d = new Date(); d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0,10).replace(/-/g,"");
}
function ymdToInput(ymd: string) {
  return `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`;
}
function inputToYmd(s: string) { return s.replace(/-/g,""); }
function fmtDate(d: string) {
  return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
}
function fmtDateShort(d: string) {
  return `${d.slice(2,4)}/${d.slice(4,6)}`;
}

// ── 下采样（图表点数限制）────────────────────────────────────────────
function downsample<T>(arr: T[], max = 120): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

// ── 数字格式化 ──────────────────────────────────────────────────────
function fmtMoney(n: number) {
  if (Math.abs(n) >= 10000) return `${(n/10000).toFixed(1)}万`;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

// ══════════════════════════════════════════════════════════════════════
// 子组件
// ══════════════════════════════════════════════════════════════════════

// ── 策略评分徽章 ────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? G : score >= 50 ? Y : R;
  const label = score >= 70 ? "优秀" : score >= 55 ? "一般" : "较差";
  return (
    <div className="flex flex-col items-center justify-center p-4 rounded-2xl"
      style={{ background: "rgba(0,229,168,0.06)", border: `1px solid ${color}33` }}>
      <p className="text-[11px] font-bold mb-1" style={{ color: MID }}>策略综合评分</p>
      <p className="font-black text-[40px] num" style={{ color }}>{score}</p>
      <p className="text-[12px] font-bold mt-0.5" style={{ color }}>{label}</p>
      <p className="text-[10px] mt-1" style={{ color: DIM }}>满分 100 分</p>
    </div>
  );
}

// ── 单个指标卡 ──────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color = "#F8FAFC" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="p-3 rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <p className="text-[10px] mb-0.5" style={{ color: DIM }}>{label}</p>
      <p className="font-black text-[15px] num" style={{ color }}>{value}</p>
      {sub && <p className="text-[9px] mt-0.5" style={{ color: DIM }}>{sub}</p>}
    </div>
  );
}

// ── 诊断面板 ────────────────────────────────────────────────────────
function DiagnosticsPanel({ diags }: { diags: Diagnostic[] }) {
  if (!diags.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold" style={{ color: MID }}>策略诊断</p>
      {diags.map((d, i) => (
        <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl"
          style={{
            background: d.type === "warning" ? "rgba(239,68,68,0.05)" : "rgba(0,229,168,0.05)",
            border: `1px solid ${d.type === "warning" ? "rgba(239,68,68,0.2)" : "rgba(0,229,168,0.15)"}`,
          }}>
          {d.type === "warning"
            ? <AlertTriangle size={12} color={R} className="flex-shrink-0 mt-0.5" />
            : <CheckCircle   size={12} color={G} className="flex-shrink-0 mt-0.5" />}
          <p className="text-[11px] leading-[1.6]" style={{ color: d.type === "warning" ? "#FCA5A5" : "#86EFAC" }}>
            {d.message}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── 资金曲线图 ──────────────────────────────────────────────────────
function EquityChart({ equity }: { equity: { date: string; value: number }[] }) {
  const data = useMemo(() => downsample(equity).map((e) => ({
    d: fmtDateShort(e.date), v: e.value,
  })), [equity]);
  const min = Math.min(...data.map((d) => d.v));
  const max = Math.max(...data.map((d) => d.v));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={G} stopOpacity={0.25} />
            <stop offset="95%" stopColor={G} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
        <XAxis dataKey="d" tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[min * 0.98, max * 1.01]} tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false}
          tickFormatter={(v) => fmtMoney(v)} />
        <Tooltip
          contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
          formatter={(v) => [`¥${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`, "资金"]}
          labelStyle={{ color: MID }} itemStyle={{ color: G }} />
        <Area type="monotone" dataKey="v" stroke={G} strokeWidth={1.5} fill="url(#eq-grad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 回撤曲线图 ──────────────────────────────────────────────────────
function DrawdownChart({ drawdown }: { drawdown: { date: string; dd: number }[] }) {
  const data = useMemo(() => downsample(drawdown).map((e) => ({
    d: fmtDateShort(e.date), dd: e.dd,
  })), [drawdown]);
  const minDD = Math.min(...data.map((d) => d.dd));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={R} stopOpacity={0.3} />
            <stop offset="95%" stopColor={R} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
        <XAxis dataKey="d" tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[minDD * 1.1, 2]} tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`} />
        <ReferenceLine y={0} stroke={BORDER} strokeDasharray="3 3" />
        <Tooltip
          contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
          formatter={(v) => [`${Number(v).toFixed(2)}%`, "回撤"]}
          labelStyle={{ color: MID }} itemStyle={{ color: R }} />
        <Area type="monotone" dataKey="dd" stroke={R} strokeWidth={1.5} fill="url(#dd-grad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 交易记录表 ──────────────────────────────────────────────────────
function TradeTable({ trades }: { trades: BacktestTrade[] }) {
  const [showAll, setShowAll] = useState(false);
  const sells = trades.filter((t) => t.action === "SELL").slice().reverse();
  const shown  = showAll ? sells : sells.slice(0, 30);
  const reasonLabel: Record<string, string> = {
    rebalance: "调仓", stop_loss: "止损", take_profit: "止盈", final: "收盘",
  };
  return (
    <div>
      <p className="text-[11px] font-bold mb-2" style={{ color: MID }}>
        交易记录（仅展示卖出，共 {sells.length} 笔）
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]" style={{ borderCollapse: "separate", borderSpacing: "0 3px" }}>
          <thead>
            <tr>
              {["日期","股票","类型","价格","盈亏"].map((h) => (
                <th key={h} className="text-left px-2 py-1 font-bold" style={{ color: DIM }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((t, i) => {
              const isWin = t.pnl > 0;
              return (
                <tr key={i} style={{ background: CARD }}>
                  <td className="px-2 py-1.5 rounded-l-lg" style={{ color: MID }}>{fmtDate(t.date)}</td>
                  <td className="px-2 py-1.5" style={{ color: "#F8FAFC" }}>{t.name}</td>
                  <td className="px-2 py-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{
                        background: t.reason === "stop_loss" ? "rgba(239,68,68,0.15)"
                          : t.reason === "take_profit" ? "rgba(0,229,168,0.15)"
                          : "rgba(148,163,184,0.1)",
                        color: t.reason === "stop_loss" ? R : t.reason === "take_profit" ? G : MID,
                      }}>
                      {reasonLabel[t.reason] ?? t.reason}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 num" style={{ color: "#F8FAFC" }}>{t.price.toFixed(2)}</td>
                  <td className="px-2 py-1.5 num rounded-r-lg font-bold"
                    style={{ color: isWin ? G : R }}>
                    {isWin ? "+" : ""}{fmtMoney(t.pnl)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sells.length > 30 && (
        <button onClick={() => setShowAll(!showAll)}
          className="w-full py-2 mt-2 rounded-xl text-[11px] font-bold"
          style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
          {showAll ? "收起" : `查看全部 ${sells.length} 笔记录`}
        </button>
      )}
    </div>
  );
}

// ── 参数对比表 ──────────────────────────────────────────────────────
interface CompareItem {
  label:   string;
  result:  BacktestResult | null;
  error:   string | null;
  running: boolean;
}

function ComparisonTable({ items }: { items: CompareItem[] }) {
  const done = items.filter((x) => x.result);
  if (!done.length) return null;

  const bestScore = Math.max(...done.map((x) => x.result!.strategyScore));

  const cols: { key: keyof BacktestResult; label: string; fmt: (v: number) => string; better: "high"|"low" }[] = [
    { key: "totalReturn",    label: "总收益",   fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,   better: "high" },
    { key: "annualReturn",   label: "年化",     fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,   better: "high" },
    { key: "maxDrawdown",    label: "最大回撤", fmt: (v) => `${v.toFixed(1)}%`,                        better: "low"  },
    { key: "sharpeRatio",    label: "夏普",     fmt: (v) => v.toFixed(2),                              better: "high" },
    { key: "winRate",        label: "胜率",     fmt: (v) => `${v.toFixed(0)}%`,                        better: "high" },
    { key: "strategyScore",  label: "评分",     fmt: (v) => String(Math.round(v)),                     better: "high" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]" style={{ borderCollapse: "separate", borderSpacing: "0 3px" }}>
        <thead>
          <tr>
            <th className="text-left px-2 py-1 font-bold" style={{ color: DIM }}>参数</th>
            {cols.map((c) => (
              <th key={c.key} className="text-right px-2 py-1 font-bold" style={{ color: DIM }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{
              background: item.result?.strategyScore === bestScore ? "rgba(0,229,168,0.08)" : CARD,
            }}>
              <td className="px-2 py-2 rounded-l-lg font-bold" style={{ color: "#F8FAFC" }}>
                {item.label}
                {item.result?.strategyScore === bestScore && (
                  <span className="ml-1 text-[8px] px-1 py-0.5 rounded font-bold"
                    style={{ background: "rgba(0,229,168,0.2)", color: G }}>最优</span>
                )}
                {item.running && (
                  <span className="ml-1 inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: MID }} />
                )}
              </td>
              {cols.map((c) => {
                if (!item.result) {
                  return (
                    <td key={c.key} className="px-2 py-2 text-right last:rounded-r-lg" style={{ color: DIM }}>
                      {item.error ? "错误" : "—"}
                    </td>
                  );
                }
                const val   = item.result[c.key] as number;
                const vals  = done.map((x) => x.result![c.key] as number);
                const best  = c.better === "high" ? Math.max(...vals) : Math.min(...vals);
                const isBest = val === best;
                return (
                  <td key={c.key} className="px-2 py-2 num text-right last:rounded-r-lg font-bold"
                    style={{ color: isBest ? G : c.key === "maxDrawdown" && val < -20 ? R : "#F8FAFC" }}>
                    {c.fmt(val)}
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

// ══════════════════════════════════════════════════════════════════════
// 主表单
// ══════════════════════════════════════════════════════════════════════

type DateRange = "近1年" | "近2年" | "近3年" | "自定义";
type CompDim   = "stopLoss" | "positions" | "freq" | "score";
type ResultTab = "equity" | "drawdown" | "trades";

function BacktestForm() {
  const router  = useRouter();
  const params  = useSearchParams();

  // ── Config state ────────────────────────────────────────────────
  const [dateRange,       setDateRange]       = useState<DateRange>("近3年");
  const [customStart,     setCustomStart]     = useState(ymdToInput(yearsAgoYMD(3)));
  const [customEnd,       setCustomEnd]       = useState(ymdToInput(todayYMD()));
  const [capital,         setCapital]         = useState(100000);
  const [maxPositions,    setMaxPositions]    = useState(10);
  const [rebalanceFreq,   setRebalanceFreq]   = useState<"weekly" | "monthly">("weekly");
  const [maxWeight,       setMaxWeight]       = useState(0.20);
  const [stopLoss,        setStopLoss]        = useState(0.08);   // 0 = off
  const [takeProfit,      setTakeProfit]      = useState(0.30);   // 0 = off
  const [scoreThreshold,  setScoreThreshold]  = useState(65);
  const [commissionRate,  setCommissionRate]  = useState(0.0003);
  const [showAdvanced,    setShowAdvanced]    = useState(false);

  // ── Tushare / run state ─────────────────────────────────────────
  const [tushareOk,   setTushareOk]   = useState<boolean | null>(null);
  const [running,     setRunning]     = useState(false);
  const [result,      setResult]      = useState<BacktestResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [activeTab,   setActiveTab]   = useState<ResultTab>("equity");

  // ── Comparison state ────────────────────────────────────────────
  const [compareMode,     setCompareMode]     = useState(false);
  const [compareDim,      setCompareDim]      = useState<CompDim>("stopLoss");
  const [compareItems,    setCompareItems]    = useState<CompareItem[]>([]);
  const [compareRunning,  setCompareRunning]  = useState(false);

  // ── Save state ──────────────────────────────────────────────────
  const [saved,     setSaved]     = useState(false);
  const saveConfig  = useStrategyConfigStore((s) => s.saveConfig);

  // ── Tushare status check ─────────────────────────────────────────
  useEffect(() => {
    fetch("/api/tushare/status")
      .then((r) => r.json())
      .then((d) => setTushareOk(d.capabilities?.daily?.status === "ok"))
      .catch(() => setTushareOk(false));
  }, []);

  // ── Computed dates ───────────────────────────────────────────────
  const { startDate, endDate } = useMemo(() => {
    if (dateRange === "自定义") {
      return { startDate: inputToYmd(customStart), endDate: inputToYmd(customEnd) };
    }
    const n = dateRange === "近1年" ? 1 : dateRange === "近2年" ? 2 : 3;
    return { startDate: yearsAgoYMD(n), endDate: todayYMD() };
  }, [dateRange, customStart, customEnd]);

  // ── Build request body ───────────────────────────────────────────
  function buildBody(overrides?: Partial<BacktestBody>): BacktestBody {
    return {
      startDate, endDate, initialCapital: capital,
      commissionRate, maxPositions, rebalanceFreq,
      maxSingleWeight: maxWeight,
      stopLossRate:    stopLoss,
      takeProfitRate:  takeProfit,
      scoreThreshold,
      ...overrides,
    };
  }

  async function fetchBacktest(body: BacktestBody): Promise<{ result: BacktestResult | null; error: string | null }> {
    try {
      const res  = await fetch("/api/tushare/backtest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) return { result: data as BacktestResult, error: null };
      return { result: null, error: data.error ?? "回测失败" };
    } catch (e) {
      return { result: null, error: String(e) };
    }
  }

  // ── Run single backtest ──────────────────────────────────────────
  async function handleRun() {
    if (!tushareOk) return;
    setRunning(true); setResult(null); setResultError(null);
    const { result: r, error } = await fetchBacktest(buildBody());
    setResult(r); setResultError(error); setRunning(false);
    setSaved(false);
    if (r) setActiveTab("equity");
  }

  // ── Comparison variants ──────────────────────────────────────────
  const compareVariants: { label: string; overrides: Partial<BacktestBody> }[] = useMemo(() => {
    if (compareDim === "stopLoss") return [
      { label: "止损 5%",  overrides: { stopLossRate: 0.05 } },
      { label: "止损 8%",  overrides: { stopLossRate: 0.08 } },
      { label: "止损 10%", overrides: { stopLossRate: 0.10 } },
      { label: "不止损",   overrides: { stopLossRate: 0 } },
    ];
    if (compareDim === "positions") return [
      { label: "5 只",  overrides: { maxPositions: 5  } },
      { label: "10 只", overrides: { maxPositions: 10 } },
      { label: "20 只", overrides: { maxPositions: 20 } },
    ];
    if (compareDim === "freq") return [
      { label: "每周调仓", overrides: { rebalanceFreq: "weekly"  } },
      { label: "每月调仓", overrides: { rebalanceFreq: "monthly" } },
    ];
    // score
    return [
      { label: "评分 60", overrides: { scoreThreshold: 60 } },
      { label: "评分 65", overrides: { scoreThreshold: 65 } },
      { label: "评分 70", overrides: { scoreThreshold: 70 } },
      { label: "评分 75", overrides: { scoreThreshold: 75 } },
    ];
  }, [compareDim]);

  async function handleCompare() {
    if (!tushareOk || compareRunning) return;
    setCompareRunning(true);
    const initial: CompareItem[] = compareVariants.map((v) => ({ label: v.label, result: null, error: null, running: true }));
    setCompareItems(initial);
    // Run sequentially (avoid rate limiting)
    const updated = [...initial];
    for (let i = 0; i < compareVariants.length; i++) {
      const { result: r, error } = await fetchBacktest(buildBody(compareVariants[i].overrides));
      updated[i] = { ...updated[i], result: r, error, running: false };
      setCompareItems([...updated]);
    }
    setCompareRunning(false);
  }

  // ── Save best to strategy config ─────────────────────────────────
  function handleSave() {
    if (!result) return;
    const config: SavedStrategyConfig = {
      id:              Date.now().toString(),
      name:            `A股多因子 · ${new Date().toLocaleDateString("zh-CN")}`,
      savedAt:         new Date().toISOString(),
      maxPositions, rebalanceFreq,
      maxSingleWeight: maxWeight,
      stopLossRate:    stopLoss,
      takeProfitRate:  takeProfit,
      scoreThreshold, commissionRate,
      backtestReturn:  result.totalReturn,
      backtestAnnual:  result.annualReturn,
      backtestSharpe:  result.sharpeRatio,
      backtestMaxDD:   result.maxDrawdown,
      backtestScore:   result.strategyScore,
      startDate, endDate,
    };
    saveConfig(config);
    setSaved(true);
  }

  // ── Connect to sim trading ────────────────────────────────────────
  function handleGoSim() {
    handleSave();
    router.push("/sim-trading");
  }

  const canRun = tushareOk === true && !running;

  // ════════════════════════════════════════════════════════════════
  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="策略回测" />

      {/* ── Tushare 状态横幅 ──────────────────────────────────────────── */}
      <div className="mx-4 mt-4 p-3 rounded-2xl flex items-start gap-2"
        style={{
          background: tushareOk ? "rgba(0,229,168,0.06)" : tushareOk === false ? "rgba(239,68,68,0.06)" : "rgba(148,163,184,0.06)",
          border: `1px solid ${tushareOk ? "rgba(0,229,168,0.2)" : tushareOk === false ? "rgba(239,68,68,0.2)" : BORDER}`,
        }}>
        {tushareOk === null
          ? <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0 mt-0.5" style={{ borderColor: MID, borderTopColor: "transparent" }} />
          : tushareOk
          ? <CheckCircle size={14} color={G} className="flex-shrink-0 mt-0.5" />
          : <Lock size={14} color={R} className="flex-shrink-0 mt-0.5" />
        }
        <div>
          {tushareOk === null && <p className="text-[12px]" style={{ color: MID }}>检查 Tushare 连接…</p>}
          {tushareOk === true && (
            <p className="text-[12px] font-bold" style={{ color: G }}>
              Tushare 已连接 — 使用真实历史日线数据（前复权），含涨跌停/停牌过滤
            </p>
          )}
          {tushareOk === false && (
            <p className="text-[12px] font-bold" style={{ color: R }}>
              Tushare 未连接 — 请配置 TUSHARE_TOKEN 后重新部署
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 pb-10">

        {/* ── ① 回测时间 ─────────────────────────────────────────────── */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: MID }}>① 回测时间范围</label>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {(["近1年","近2年","近3年","自定义"] as DateRange[]).map((t) => (
              <button key={t} onClick={() => setDateRange(t)}
                className="py-2 rounded-xl text-[12px] font-semibold"
                style={{
                  background: dateRange === t ? "rgba(0,229,168,0.15)" : CARD,
                  border: `1px solid ${dateRange === t ? G : BORDER}`,
                  color: dateRange === t ? G : MID,
                }}>{t}
              </button>
            ))}
          </div>
          {dateRange === "自定义" && (
            <div className="flex gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl text-[12px] outline-none"
                style={{ background: CARD, border: `1px solid ${BORDER}`, color: "#F8FAFC" }} />
              <span className="py-2 text-[12px]" style={{ color: DIM }}>至</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl text-[12px] outline-none"
                style={{ background: CARD, border: `1px solid ${BORDER}`, color: "#F8FAFC" }} />
            </div>
          )}
        </div>

        {/* ── ② 初始资金 ─────────────────────────────────────────────── */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: MID }}>② 初始资金</label>
          <div className="grid grid-cols-4 gap-1.5">
            {[50000, 100000, 500000, 1000000].map((v) => (
              <button key={v} onClick={() => setCapital(v)}
                className="py-2.5 rounded-xl text-[12px] font-semibold"
                style={{
                  background: capital === v ? "rgba(0,229,168,0.15)" : CARD,
                  border: `1px solid ${capital === v ? G : BORDER}`,
                  color: capital === v ? G : MID,
                }}>
                ¥{v >= 10000 ? `${v/10000}万` : v}
              </button>
            ))}
          </div>
        </div>

        {/* ── ③ 股票池（固定显示）─────────────────────────────────────── */}
        <div className="p-3 rounded-xl flex items-center gap-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <BarChart3 size={16} color={B} />
          <div>
            <p className="text-[12px] font-bold" style={{ color: "#F8FAFC" }}>A股多因子策略池（20只）</p>
            <p className="text-[10px] mt-0.5" style={{ color: DIM }}>贵州茅台、比亚迪、宁德时代、招商银行等大中盘蓝筹</p>
          </div>
        </div>

        {/* ── ④ 高级参数（可折叠）────────────────────────────────────── */}
        <div>
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-[12px] font-bold mb-2"
            style={{ color: MID }}>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showAdvanced ? "收起高级参数" : "④ 高级参数（持仓/调仓/止损/止盈）"}
          </button>

          {showAdvanced && (
            <div className="p-4 rounded-2xl space-y-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>

              {/* 持仓数量 */}
              <div>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: MID }}>最大持仓只数</p>
                <div className="flex gap-2">
                  {[5, 10, 20].map((v) => (
                    <button key={v} onClick={() => setMaxPositions(v)}
                      className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                      style={{
                        background: maxPositions === v ? "rgba(0,229,168,0.15)" : "#0a1628",
                        border: `1px solid ${maxPositions === v ? G : BORDER}`,
                        color: maxPositions === v ? G : MID,
                      }}>{v} 只
                    </button>
                  ))}
                </div>
              </div>

              {/* 调仓频率 */}
              <div>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: MID }}>调仓频率</p>
                <div className="flex gap-2">
                  {[{ v: "weekly" as const, label: "每周调仓" }, { v: "monthly" as const, label: "每月调仓" }].map(({ v, label }) => (
                    <button key={v} onClick={() => setRebalanceFreq(v)}
                      className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                      style={{
                        background: rebalanceFreq === v ? "rgba(0,229,168,0.15)" : "#0a1628",
                        border: `1px solid ${rebalanceFreq === v ? G : BORDER}`,
                        color: rebalanceFreq === v ? G : MID,
                      }}>{label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 单股最大仓位 */}
              <div>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: MID }}>单股最大仓位</p>
                <div className="flex gap-2">
                  {[0.10, 0.20, 0.30].map((v) => (
                    <button key={v} onClick={() => setMaxWeight(v)}
                      className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                      style={{
                        background: maxWeight === v ? "rgba(0,229,168,0.15)" : "#0a1628",
                        border: `1px solid ${maxWeight === v ? G : BORDER}`,
                        color: maxWeight === v ? G : MID,
                      }}>{(v*100).toFixed(0)}%
                    </button>
                  ))}
                </div>
              </div>

              {/* 止损 */}
              <div>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: MID }}>止损比例</p>
                <div className="flex gap-2">
                  {[{ v: 0.05, l: "-5%" }, { v: 0.08, l: "-8%" }, { v: 0.10, l: "-10%" }, { v: 0, l: "不止损" }].map(({ v, l }) => (
                    <button key={v} onClick={() => setStopLoss(v)}
                      className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                      style={{
                        background: stopLoss === v ? "rgba(239,68,68,0.15)" : "#0a1628",
                        border: `1px solid ${stopLoss === v ? R : BORDER}`,
                        color: stopLoss === v ? R : MID,
                      }}>{l}
                    </button>
                  ))}
                </div>
              </div>

              {/* 止盈 */}
              <div>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: MID }}>止盈规则</p>
                <div className="flex gap-2">
                  {[{ v: 0.20, l: "+20%" }, { v: 0.30, l: "+30%" }, { v: 0.50, l: "+50%" }, { v: 0, l: "不止盈" }].map(({ v, l }) => (
                    <button key={v} onClick={() => setTakeProfit(v)}
                      className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                      style={{
                        background: takeProfit === v ? "rgba(0,229,168,0.15)" : "#0a1628",
                        border: `1px solid ${takeProfit === v ? G : BORDER}`,
                        color: takeProfit === v ? G : MID,
                      }}>{l}
                    </button>
                  ))}
                </div>
              </div>

              {/* 评分阈值 */}
              <div>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: MID }}>买入最低评分</p>
                <div className="flex gap-2">
                  {[60, 65, 70, 75].map((v) => (
                    <button key={v} onClick={() => setScoreThreshold(v)}
                      className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                      style={{
                        background: scoreThreshold === v ? "rgba(250,204,21,0.15)" : "#0a1628",
                        border: `1px solid ${scoreThreshold === v ? Y : BORDER}`,
                        color: scoreThreshold === v ? Y : MID,
                      }}>{v}分
                    </button>
                  ))}
                </div>
              </div>

              {/* 手续费 */}
              <div>
                <p className="text-[11px] font-bold mb-1.5" style={{ color: MID }}>手续费率（卖出额外+印花税0.1%）</p>
                <div className="flex gap-2">
                  {[{ v: 0.0003, l: "0.03%" }, { v: 0.0005, l: "0.05%" }, { v: 0.001, l: "0.1%" }].map(({ v, l }) => (
                    <button key={v} onClick={() => setCommissionRate(v)}
                      className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                      style={{
                        background: commissionRate === v ? "rgba(0,229,168,0.15)" : "#0a1628",
                        border: `1px solid ${commissionRate === v ? G : BORDER}`,
                        color: commissionRate === v ? G : MID,
                      }}>{l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 配置摘要 ────────────────────────────────────────────────── */}
        <div className="px-3 py-2.5 rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {[
              { k: "时间", v: `${fmtDate(startDate)} ~ ${fmtDate(endDate)}` },
              { k: "资金", v: `¥${fmtMoney(capital)}` },
              { k: "持仓", v: `${maxPositions}只` },
              { k: "调仓", v: rebalanceFreq === "weekly" ? "每周" : "每月" },
              { k: "止损", v: stopLoss > 0 ? `-${(stopLoss*100).toFixed(0)}%` : "关闭" },
              { k: "止盈", v: takeProfit > 0 ? `+${(takeProfit*100).toFixed(0)}%` : "关闭" },
              { k: "评分", v: `≥${scoreThreshold}` },
            ].map(({ k, v }) => (
              <span key={k} className="text-[11px]">
                <span style={{ color: DIM }}>{k}：</span>
                <span className="font-bold" style={{ color: "#F8FAFC" }}>{v}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── 运行按钮 ────────────────────────────────────────────────── */}
        <div className="flex gap-2">
          {tushareOk === false ? (
            <div className="flex-1 py-4 rounded-2xl font-black text-[14px] flex items-center justify-center gap-2"
              style={{ background: CARD, border: `1px solid ${BORDER}`, color: DIM }}>
              <Lock size={15} /> Tushare 未配置
            </div>
          ) : (
            <button onClick={handleRun} disabled={!canRun}
              className="flex-1 py-4 rounded-2xl font-black text-[16px] active:opacity-80 transition-opacity"
              style={{
                background: canRun ? `linear-gradient(135deg, ${G}, #00b885)` : CARD,
                color: canRun ? "#07111F" : DIM,
              }}>
              {running ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: DIM, borderTopColor: "transparent" }} />
                  数据加载中（约30-60s）…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Play size={16} /> 运行真实回测
                </span>
              )}
            </button>
          )}

          {/* 对比模式开关 */}
          <button onClick={() => setCompareMode(!compareMode)}
            className="px-4 py-4 rounded-2xl font-bold text-[13px]"
            style={{
              background: compareMode ? "rgba(59,130,246,0.15)" : CARD,
              border: `1px solid ${compareMode ? B : BORDER}`,
              color: compareMode ? B : MID,
            }}>
            <GitCompare size={16} />
          </button>
        </div>

        {/* ── 参数对比面板 ─────────────────────────────────────────────── */}
        {compareMode && (
          <div className="p-4 rounded-2xl space-y-3" style={{ background: CARD, border: `1px solid ${B}33` }}>
            <p className="text-[12px] font-bold" style={{ color: B }}>参数对比模式</p>
            <p className="text-[11px]" style={{ color: DIM }}>选择一个维度，系统将自动运行多个参数变体（顺序执行，约2-4分钟）</p>

            {/* 对比维度 */}
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: "stopLoss"  as CompDim, label: "止损比例" },
                { v: "positions" as CompDim, label: "持仓数量" },
                { v: "freq"      as CompDim, label: "调仓频率" },
                { v: "score"     as CompDim, label: "评分阈值" },
              ]).map(({ v, label }) => (
                <button key={v} onClick={() => { setCompareDim(v); setCompareItems([]); }}
                  className="py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: compareDim === v ? "rgba(59,130,246,0.15)" : "#0a1628",
                    border: `1px solid ${compareDim === v ? B : BORDER}`,
                    color: compareDim === v ? B : MID,
                  }}>{label}
                </button>
              ))}
            </div>

            {/* 变体预览 */}
            <div className="flex flex-wrap gap-1.5">
              {compareVariants.map((v, i) => (
                <span key={i} className="text-[10px] px-2 py-1 rounded-lg font-bold"
                  style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
                  {v.label}
                </span>
              ))}
            </div>

            <button onClick={handleCompare} disabled={compareRunning || !tushareOk}
              className="w-full py-3 rounded-xl font-black text-[13px]"
              style={{
                background: (compareRunning || !tushareOk) ? "#0a1628" : `rgba(59,130,246,0.15)`,
                border: `1px solid ${B}`,
                color: (compareRunning || !tushareOk) ? DIM : B,
              }}>
              {compareRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: B, borderTopColor: "transparent" }} />
                  对比运行中…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw size={14} /> 运行全部对比
                </span>
              )}
            </button>

            {compareItems.length > 0 && (
              <div>
                <p className="text-[11px] font-bold mb-2" style={{ color: MID }}>对比结果</p>
                <ComparisonTable items={compareItems} />
              </div>
            )}
          </div>
        )}

        {/* ── 免责声明 ─────────────────────────────────────────────────── */}
        <div className="p-3 rounded-xl flex items-start gap-2"
          style={{ background: "rgba(250,204,21,0.04)", border: "1px solid rgba(250,204,21,0.2)" }}>
          <AlertTriangle size={12} color={Y} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-[1.7]" style={{ color: DIM }}>
            <span className="font-bold" style={{ color: Y }}>风险提示：</span>
            历史回测结果不代表未来收益，不构成投资建议，不保证盈利。
            市场存在不确定性，实际交易收益可能与回测存在显著差异。
            本平台仅提供量化工具，投资决策由您自行承担。
          </p>
        </div>

        {/* ── 错误提示 ─────────────────────────────────────────────────── */}
        {resultError && (
          <div className="p-3 rounded-2xl flex items-start gap-2"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertTriangle size={13} color={R} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[12px]" style={{ color: R }}>回测失败</p>
              <p className="text-[11px] mt-0.5" style={{ color: MID }}>{resultError}</p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            回测结果面板
        ══════════════════════════════════════════════════════════════ */}
        {result && (
          <div className="space-y-4">

            {/* 总收益 + 评分 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl text-center"
                style={{ background: "rgba(0,229,168,0.06)", border: `1px solid ${G}33` }}>
                <p className="text-[11px] font-bold mb-1" style={{ color: MID }}>总收益</p>
                <p className="font-black text-[32px] num"
                  style={{ color: result.totalReturn >= 0 ? G : R }}>
                  {result.totalReturn >= 0 ? "+" : ""}{result.totalReturn.toFixed(2)}%
                </p>
                <p className="text-[10px] mt-1" style={{ color: DIM }}>
                  ¥{fmtMoney(result.initialCapital)} → ¥{fmtMoney(result.finalCapital)}
                </p>
              </div>
              <ScoreBadge score={result.strategyScore} />
            </div>

            {/* 8 指标格子 */}
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="年化收益"
                value={`${result.annualReturn >= 0 ? "+" : ""}${result.annualReturn.toFixed(2)}%`}
                color={result.annualReturn >= 0 ? G : R} />
              <MetricCard
                label="最大回撤"
                value={`${result.maxDrawdown.toFixed(2)}%`}
                color={result.maxDrawdown < -20 ? R : Y} />
              <MetricCard
                label="夏普比率"
                value={result.sharpeRatio.toFixed(2)}
                color={result.sharpeRatio >= 1.5 ? G : result.sharpeRatio >= 1 ? Y : MID} />
              <MetricCard
                label="胜率"
                value={`${result.winRate.toFixed(1)}%`}
                color={result.winRate >= 55 ? G : result.winRate >= 45 ? Y : R} />
              <MetricCard
                label="盈亏比"
                value={result.profitFactor.toFixed(2)}
                color={result.profitFactor >= 2 ? G : result.profitFactor >= 1.5 ? Y : MID} />
              <MetricCard
                label="最大连续亏损"
                value={`${result.maxConsecutiveLosses}次`}
                color={result.maxConsecutiveLosses > 5 ? R : MID} />
              <MetricCard
                label="总交易次数"
                value={`${result.totalTrades}次`}
                color={MID} />
              <MetricCard
                label="手续费合计"
                value={`¥${fmtMoney(result.totalFees)}`}
                sub={`占初始资金 ${result.feeImpact.toFixed(1)}%`}
                color={result.feeImpact > 5 ? R : MID} />
            </div>

            {/* 诊断 */}
            <DiagnosticsPanel diags={result.diagnostics} />

            {/* 图表 + 交易记录（tabs）*/}
            <div className="p-3 rounded-2xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              {/* Tab 选择 */}
              <div className="flex gap-1 mb-3">
                {([
                  { k: "equity"  as ResultTab, label: "资金曲线" },
                  { k: "drawdown" as ResultTab, label: "回撤曲线" },
                  { k: "trades"  as ResultTab, label: "交易记录" },
                ]).map(({ k, label }) => (
                  <button key={k} onClick={() => setActiveTab(k)}
                    className="flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                    style={{
                      background: activeTab === k ? "rgba(0,229,168,0.15)" : "#0a1628",
                      border: `1px solid ${activeTab === k ? G : BORDER}`,
                      color: activeTab === k ? G : MID,
                    }}>{label}
                  </button>
                ))}
              </div>

              {activeTab === "equity"   && <EquityChart   equity={result.equity}     />}
              {activeTab === "drawdown" && <DrawdownChart drawdown={result.drawdown} />}
              {activeTab === "trades"   && <TradeTable    trades={result.trades}     />}
            </div>

            {/* 数据来源说明 */}
            <div className="p-3 rounded-xl flex items-start gap-2"
              style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
              <Activity size={12} color={B} className="flex-shrink-0 mt-0.5" />
              <p className="text-[10px] leading-[1.7]" style={{ color: DIM }}>
                <span className="font-bold" style={{ color: B }}>数据说明：</span>
                {result.note}
              </p>
            </div>

            {/* 操作按钮：保存 + 接入模拟盘 */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleSave}
                className="py-3.5 rounded-2xl font-black text-[13px] flex items-center justify-center gap-2"
                style={{
                  background: saved ? "rgba(0,229,168,0.1)" : CARD,
                  border: `1px solid ${saved ? G : BORDER}`,
                  color: saved ? G : MID,
                }}>
                <Save size={15} />
                {saved ? "已保存配置" : "保存参数配置"}
              </button>

              <button onClick={handleGoSim}
                className="py-3.5 rounded-2xl font-black text-[13px] flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.1))",
                  border: `1px solid ${B}`,
                  color: B,
                }}>
                接入模拟盘 <ArrowRight size={15} />
              </button>
            </div>

            <p className="text-center text-[10px]" style={{ color: DIM }}>
              接入模拟盘后可在模拟盘页面查看策略信号并手动执行，不会自动实盘交易
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
export default function BacktestPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: G, borderTopColor: "transparent" }} />
      </div>
    }>
      <BacktestForm />
    </Suspense>
  );
}
