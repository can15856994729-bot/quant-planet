"use client";
import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ComposedChart, Line, Scatter,
} from "recharts";
import {
  Search, X, CheckCircle, AlertTriangle, TrendingUp, TrendingDown,
  BarChart3, Play, Activity, GitCompare, RefreshCw, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";

// ── 颜色 ─────────────────────────────────────────────────────────────
const G = "#00E5A8", R = "#EF4444", Y = "#FACC15", B = "#3B82F6";
const DIM = "#64748B", MID = "#94A3B8", CARD = "#0d1f3c", BORDER = "#1a2f50";

// ── 类型 ─────────────────────────────────────────────────────────────
interface StockItem { tsCode: string; symbol: string; name: string; industry: string; }

interface BarSignal {
  date: string; open: number; high: number; low: number; close: number; volume: number;
  maShort: number | null; maMid: number | null; maLong: number | null;
  totalScore: number; trendScore: number;
  marketStatus: "strong" | "neutral" | "weak" | "unknown";
  tradeAction: "BUY" | "SELL" | "PARTIAL_SELL" | null;
  tradePrice: number | null; tradeReason: string | null;
}
interface SingleTrade {
  date: string; action: "BUY" | "SELL" | "PARTIAL_SELL"; reason: string;
  price: number; shares: number; amount: number; fee: number; pnl: number; holdDays: number;
}
interface Diagnostic { type: "warning" | "info"; message: string; }
interface SingleResult {
  ok: true; tsCode: string; name: string; startDate: string; endDate: string;
  initialCapital: number; finalCapital: number;
  totalReturn: number; annualReturn: number; maxDrawdown: number;
  sharpeRatio: number; winRate: number; profitFactor: number;
  totalTrades: number; maxConsecutiveLosses: number;
  totalFees: number; feeImpact: number; strategyScore: number;
  holdingDays: number; cashDays: number;
  bars: BarSignal[]; trades: SingleTrade[];
  equity: { date: string; value: number }[];
  drawdown: { date: string; dd: number }[];
  diagnostics: Diagnostic[];
  hasValuation: boolean; marketTimingOk: boolean;
  source: "tushare"; note: string;
}

// ── 日期辅助 ──────────────────────────────────────────────────────────
function todayYMD()     { return new Date().toISOString().slice(0,10).replace(/-/g,""); }
function yearsAgoYMD(n: number) {
  const d = new Date(); d.setFullYear(d.getFullYear()-n);
  return d.toISOString().slice(0,10).replace(/-/g,"");
}
function ymdToInput(s: string) { return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; }
function inputToYmd(s: string) { return s.replace(/-/g,""); }
function fmtDate(d: string)    { return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`; }
function fmtDateShort(d: string) { return `${d.slice(2,4)}/${d.slice(4,6)}`; }
function fmtMoney(n: number) {
  return Math.abs(n) >= 10000 ? `${(n/10000).toFixed(1)}万` : n.toLocaleString("zh-CN",{maximumFractionDigits:0});
}

function downsample<T>(arr: T[], max = 150): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_,i) => i % step === 0 || i === arr.length-1);
}

// ══════════════════════════════════════════════════════════════════════
// 子组件
// ══════════════════════════════════════════════════════════════════════

// ── K线 + 买卖点图（用自定义 dot 标记）─────────────────────────────
function PriceChart({ bars }: { bars: BarSignal[] }) {
  const raw = useMemo(() => {
    // 下采样但保留所有交易日
    const tradeDates = new Set(bars.filter(b => b.tradeAction).map(b => b.date));
    const sampled = new Set<number>();
    const step = Math.max(1, Math.ceil(bars.length / 120));
    bars.forEach((_, i) => { if (i % step === 0 || i === bars.length-1) sampled.add(i); });
    // Force-include trade dates
    bars.forEach((b, i) => { if (tradeDates.has(b.date)) sampled.add(i); });
    return [...sampled].sort((a,b) => a-b).map(i => bars[i]);
  }, [bars]);

  const data = raw.map(b => ({
    d: fmtDateShort(b.date),
    close: b.close,
    maS: b.maShort,
    maM: b.maMid,
    maL: b.maLong,
    action: b.tradeAction,
    price: b.tradePrice,
  }));

  const prices = data.map(d => d.close);
  const mn = Math.min(...prices) * 0.97;
  const mx = Math.max(...prices) * 1.03;

  // Custom dot to show buy/sell arrows
  const renderDot = (props: Record<string, unknown>) => {
    const cx = props.cx as number;
    const cy = props.cy as number;
    const payload = props.payload as typeof data[0];
    if (!payload.action) return <g key={`dot-${payload.d}`} />;
    const k = `dot-${payload.d}`;
    if (payload.action === "BUY") {
      return (
        <g key={k}>
          <polygon points={`${cx},${cy+14} ${cx-7},${cy+2} ${cx+7},${cy+2}`} fill={G} opacity={0.9}/>
          <circle cx={cx} cy={cy+16} r={3} fill={G} opacity={0.6}/>
        </g>
      );
    }
    if (payload.action === "PARTIAL_SELL") {
      const s = 6;
      return (
        <g key={k}>
          <polygon points={`${cx},${cy-s} ${cx+s},${cy} ${cx},${cy+s} ${cx-s},${cy}`} fill={Y} opacity={0.9}/>
        </g>
      );
    }
    // SELL
    return (
      <g key={k}>
        <polygon points={`${cx},${cy-14} ${cx-7},${cy-2} ${cx+7},${cy-2}`} fill={R} opacity={0.9}/>
        <circle cx={cx} cy={cy-16} r={3} fill={R} opacity={0.6}/>
      </g>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-[10px]">
        <span style={{color:MID}}>K线 + 均线 + 买卖点</span>
        <span className="flex items-center gap-1"><span style={{color:G}}>▲</span> 买入</span>
        <span className="flex items-center gap-1"><span style={{color:R}}>▼</span> 卖出</span>
        <span className="flex items-center gap-1"><span style={{color:Y}}>◆</span> 减仓</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="sg-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={B} stopOpacity={0.15}/>
              <stop offset="95%" stopColor={B} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50"/>
          <XAxis dataKey="d" tick={{fill:DIM,fontSize:9}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
          <YAxis domain={[mn,mx]} tick={{fill:DIM,fontSize:9}} tickLine={false} axisLine={false}
            tickFormatter={v => v.toFixed(0)}/>
          <Tooltip
            contentStyle={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,fontSize:10}}
            formatter={(v, name) => {
              if (name === "close") return [Number(v).toFixed(2), "收盘价"];
              if (name === "maS")   return [Number(v).toFixed(2), `MA短`];
              if (name === "maM")   return [Number(v).toFixed(2), `MA中`];
              if (name === "maL")   return [Number(v).toFixed(2), `MA长`];
              return [v, name];
            }}
            labelStyle={{color:MID}} />
          <Area type="monotone" dataKey="close" stroke={B} strokeWidth={1.5}
            fill="url(#sg-grad)" dot={renderDot as never} activeDot={{r:3}}/>
          <Line type="monotone" dataKey="maS" stroke={G}    strokeWidth={1} dot={false} strokeDasharray="3 2"/>
          <Line type="monotone" dataKey="maM" stroke={Y}    strokeWidth={1} dot={false} strokeDasharray="3 2"/>
          <Line type="monotone" dataKey="maL" stroke="#A78BFA" strokeWidth={1} dot={false} strokeDasharray="4 2"/>
        </ComposedChart>
      </ResponsiveContainer>
      {/* MA legend */}
      <div className="flex gap-3 mt-1 text-[9px]" style={{color:DIM}}>
        <span><span style={{color:G}}>—</span> MA短</span>
        <span><span style={{color:Y}}>—</span> MA中</span>
        <span><span style={{color:"#A78BFA"}}>—</span> MA长</span>
      </div>
    </div>
  );
}

// ── 资金曲线 ──────────────────────────────────────────────────────────
function EquityChart({ equity }: { equity: {date:string;value:number}[] }) {
  const data = useMemo(() => downsample(equity).map(e => ({d: fmtDateShort(e.date), v: e.value})), [equity]);
  const mn = Math.min(...data.map(d=>d.v));
  const mx = Math.max(...data.map(d=>d.v));
  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={data} margin={{top:4,right:4,left:-20,bottom:0}}>
        <defs>
          <linearGradient id="eq2-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={G} stopOpacity={0.25}/>
            <stop offset="95%" stopColor={G} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50"/>
        <XAxis dataKey="d" tick={{fill:DIM,fontSize:9}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
        <YAxis domain={[mn*0.98,mx*1.01]} tick={{fill:DIM,fontSize:9}} tickLine={false} axisLine={false}
          tickFormatter={v => fmtMoney(v)}/>
        <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,fontSize:10}}
          formatter={v => [`¥${Number(v).toLocaleString("zh-CN",{maximumFractionDigits:0})}`, "资金"]}
          labelStyle={{color:MID}} itemStyle={{color:G}}/>
        <Area type="monotone" dataKey="v" stroke={G} strokeWidth={1.5} fill="url(#eq2-grad)" dot={false}/>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 回撤曲线 ──────────────────────────────────────────────────────────
function DrawdownChart({ drawdown }: { drawdown: {date:string;dd:number}[] }) {
  const data = useMemo(() => downsample(drawdown).map(e => ({d: fmtDateShort(e.date), dd: e.dd})), [drawdown]);
  const minDD = Math.min(...data.map(d=>d.dd));
  return (
    <ResponsiveContainer width="100%" height={130}>
      <AreaChart data={data} margin={{top:4,right:4,left:-20,bottom:0}}>
        <defs>
          <linearGradient id="dd2-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={R} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={R} stopOpacity={0.05}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50"/>
        <XAxis dataKey="d" tick={{fill:DIM,fontSize:9}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
        <YAxis domain={[minDD*1.1,2]} tick={{fill:DIM,fontSize:9}} tickLine={false} axisLine={false}
          tickFormatter={v=>`${v.toFixed(0)}%`}/>
        <ReferenceLine y={0} stroke={BORDER} strokeDasharray="3 3"/>
        <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,fontSize:10}}
          formatter={v=>[`${Number(v).toFixed(2)}%`, "回撤"]}
          labelStyle={{color:MID}} itemStyle={{color:R}}/>
        <Area type="monotone" dataKey="dd" stroke={R} strokeWidth={1.5} fill="url(#dd2-grad)" dot={false}/>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 交易记录 ─────────────────────────────────────────────────────────
function TradeTable({ trades }: { trades: SingleTrade[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? trades : trades.slice(0, 30);
  const actionLabel: Record<string, string> = { BUY:"买入", SELL:"卖出", PARTIAL_SELL:"减仓" };
  return (
    <div>
      <p className="text-[11px] font-bold mb-2" style={{color:MID}}>每笔交易记录（共 {trades.length} 笔）</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]" style={{borderCollapse:"separate",borderSpacing:"0 3px"}}>
          <thead>
            <tr>{["日期","操作","原因","价格","股数","盈亏","持股天"].map(h => (
              <th key={h} className="text-left px-2 py-1 font-bold" style={{color:DIM}}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {shown.map((t,i) => {
              const isWin = t.pnl > 0;
              const isStop = t.reason.includes("止损");
              return (
                <tr key={i} style={{background:CARD}}>
                  <td className="px-2 py-1.5 rounded-l-lg" style={{color:MID}}>{fmtDate(t.date)}</td>
                  <td className="px-2 py-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{
                        background: t.action==="BUY" ? "rgba(0,229,168,0.15)" : t.action==="PARTIAL_SELL" ? "rgba(250,204,21,0.15)" : "rgba(239,68,68,0.15)",
                        color: t.action==="BUY" ? G : t.action==="PARTIAL_SELL" ? Y : R,
                      }}>{actionLabel[t.action]}</span>
                  </td>
                  <td className="px-2 py-1.5 text-[9px]" style={{color:isStop ? R : MID}}>{t.reason.slice(0,12)}</td>
                  <td className="px-2 py-1.5 num" style={{color:"#F8FAFC"}}>{t.price.toFixed(2)}</td>
                  <td className="px-2 py-1.5 num" style={{color:MID}}>{t.shares}</td>
                  <td className="px-2 py-1.5 num font-bold" style={{color: t.action==="BUY" ? MID : isWin ? G : R}}>
                    {t.action==="BUY" ? "—" : `${isWin?"+":""}${fmtMoney(t.pnl)}`}
                  </td>
                  <td className="px-2 py-1.5 rounded-r-lg" style={{color:DIM}}>{t.holdDays > 0 ? `${t.holdDays}天` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {trades.length > 30 && (
        <button onClick={() => setShowAll(!showAll)}
          className="w-full py-2 mt-2 rounded-xl text-[11px] font-bold"
          style={{background:"#0a1628",color:MID,border:`1px solid ${BORDER}`}}>
          {showAll ? "收起" : `查看全部 ${trades.length} 笔`}
        </button>
      )}
    </div>
  );
}

// ── 指标卡 ───────────────────────────────────────────────────────────
function MC({ label, value, color="#F8FAFC", sub }: { label:string; value:string; color?:string; sub?:string }) {
  return (
    <div className="p-3 rounded-xl" style={{background:CARD,border:`1px solid ${BORDER}`}}>
      <p className="text-[10px] mb-0.5" style={{color:DIM}}>{label}</p>
      <p className="font-black text-[14px] num" style={{color}}>{value}</p>
      {sub && <p className="text-[9px] mt-0.5" style={{color:DIM}}>{sub}</p>}
    </div>
  );
}

// ── 对比表 ───────────────────────────────────────────────────────────
interface CmpItem { label:string; result:SingleResult|null; error:string|null; running:boolean }
function CompareTable({ items }: { items: CmpItem[] }) {
  const done = items.filter(x => x.result);
  if (!done.length) return null;
  const bestScore = Math.max(...done.map(x => x.result!.strategyScore));
  const cols: { key: keyof SingleResult; label:string; fmt:(v:number)=>string; better:"high"|"low" }[] = [
    {key:"totalReturn",  label:"总收益",  fmt:v=>`${v>=0?"+":""}${v.toFixed(1)}%`,  better:"high"},
    {key:"annualReturn", label:"年化",    fmt:v=>`${v>=0?"+":""}${v.toFixed(1)}%`,  better:"high"},
    {key:"maxDrawdown",  label:"最大回撤",fmt:v=>`${v.toFixed(1)}%`,                better:"low"},
    {key:"winRate",      label:"胜率",    fmt:v=>`${v.toFixed(0)}%`,                better:"high"},
    {key:"strategyScore",label:"评分",    fmt:v=>String(Math.round(v)),             better:"high"},
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]" style={{borderCollapse:"separate",borderSpacing:"0 3px"}}>
        <thead>
          <tr>
            <th className="text-left px-2 py-1 font-bold" style={{color:DIM}}>参数</th>
            {cols.map(c => <th key={c.key} className="text-right px-2 py-1 font-bold" style={{color:DIM}}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((item,i) => (
            <tr key={i} style={{background: item.result?.strategyScore === bestScore ? "rgba(0,229,168,0.08)" : CARD}}>
              <td className="px-2 py-2 rounded-l-lg font-bold" style={{color:"#F8FAFC"}}>
                {item.label}
                {item.result?.strategyScore === bestScore && (
                  <span className="ml-1 text-[8px] px-1 py-0.5 rounded" style={{background:"rgba(0,229,168,0.2)",color:G}}>最优</span>
                )}
                {item.running && <span className="ml-1 w-3 h-3 border border-t-transparent rounded-full animate-spin inline-block" style={{borderColor:MID}}/>}
              </td>
              {cols.map(c => {
                if (!item.result) return <td key={c.key} className="px-2 py-2 text-right last:rounded-r-lg" style={{color:DIM}}>{item.error?"错误":"—"}</td>;
                const val  = item.result[c.key] as number;
                const vals = done.map(x => x.result![c.key] as number);
                const best = c.better==="high" ? Math.max(...vals) : Math.min(...vals);
                return (
                  <td key={c.key} className="px-2 py-2 num text-right last:rounded-r-lg font-bold"
                    style={{color: val===best ? G : c.key==="maxDrawdown"&&val<-20 ? R : "#F8FAFC"}}>
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
// 主页
// ══════════════════════════════════════════════════════════════════════
type DateRange = "近1年"|"近2年"|"近3年"|"自定义";
type CompDim   = "score"|"stopLoss"|"maSet"|"freq";
type ResultTab = "price"|"equity"|"drawdown"|"trades";

function SingleBacktestForm() {
  // ── 股票搜索 ────────────────────────────────────────────────────
  const [query,          setQuery]          = useState("");
  const [searchResults,  setSearchResults]  = useState<StockItem[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [selectedStock,  setSelectedStock]  = useState<StockItem | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 参数 ────────────────────────────────────────────────────────
  const [dateRange,   setDateRange]   = useState<DateRange>("近3年");
  const [customStart, setCustomStart] = useState(ymdToInput(yearsAgoYMD(3)));
  const [customEnd,   setCustomEnd]   = useState(ymdToInput(todayYMD()));
  const [capital,     setCapital]     = useState(100000);
  const [stopLoss,    setStopLoss]    = useState(0.08);
  const [tpHalf,      setTpHalf]      = useState(0.20);
  const [tpFull,      setTpFull]      = useState(0.35);
  const [scoreThresh, setScoreThresh] = useState(75);
  const [trendThresh, setTrendThresh] = useState(70);
  const [maSet,       setMaSet]       = useState<"5/20/60"|"10/30/120">("5/20/60");
  const [checkFreq,   setCheckFreq]   = useState<"daily"|"weekly">("daily");

  // ── 运行状态 ────────────────────────────────────────────────────
  const [tushareOk, setTushareOk] = useState<boolean|null>(null);
  const [running,   setRunning]   = useState(false);
  const [result,    setResult]    = useState<SingleResult|null>(null);
  const [error,     setError]     = useState<string|null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("price");

  // ── 对比 ────────────────────────────────────────────────────────
  const [compareMode,    setCompareMode]    = useState(false);
  const [compareDim,     setCompareDim]     = useState<CompDim>("score");
  const [compareItems,   setCompareItems]   = useState<CmpItem[]>([]);
  const [compareRunning, setCompareRunning] = useState(false);

  // ── Tushare 状态 ─────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/tushare/status")
      .then(r => r.json())
      .then(d => setTushareOk(d.capabilities?.daily?.status === "ok"))
      .catch(() => setTushareOk(false));
  }, []);

  // ── 搜索防抖 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!query.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    searchRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/tushare/search?q=${encodeURIComponent(query.trim())}`);
        const d = await r.json();
        setSearchResults(d.results ?? []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
  }, [query]);

  // ── 日期 ─────────────────────────────────────────────────────────
  const { startDate, endDate } = useMemo(() => {
    if (dateRange === "自定义") return { startDate: inputToYmd(customStart), endDate: inputToYmd(customEnd) };
    const n = dateRange==="近1年"?1:dateRange==="近2年"?2:3;
    return { startDate: yearsAgoYMD(n), endDate: todayYMD() };
  }, [dateRange, customStart, customEnd]);

  // ── 构建请求体 ────────────────────────────────────────────────────
  function buildBody(overrides: Record<string,unknown> = {}) {
    return {
      tsCode: selectedStock?.tsCode, name: selectedStock?.name,
      startDate, endDate, initialCapital: capital,
      commissionRate: 0.0003,
      stopLossRate: stopLoss, takeProfitHalf: tpHalf, takeProfitFull: tpFull,
      scoreThreshold: scoreThresh, trendThreshold: trendThresh,
      maSet, checkFreq,
      ...overrides,
    };
  }

  async function fetchSingle(body: Record<string,unknown>): Promise<{result:SingleResult|null;error:string|null}> {
    try {
      const res = await fetch("/api/tushare/single-backtest", {
        method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.ok) return {result: d as SingleResult, error: null};
      return {result:null, error: d.error ?? "回测失败"};
    } catch(e) { return {result:null, error: String(e)}; }
  }

  // ── 运行 ─────────────────────────────────────────────────────────
  async function handleRun() {
    if (!selectedStock || !tushareOk || running) return;
    setRunning(true); setResult(null); setError(null);
    const {result:r, error:e} = await fetchSingle(buildBody());
    setResult(r); setError(e); setRunning(false);
    if (r) setActiveTab("price");
  }

  // ── 对比变体 ─────────────────────────────────────────────────────
  const compareVariants: {label:string;overrides:Record<string,unknown>}[] = useMemo(() => {
    if (compareDim==="score")   return [{label:"评分70",overrides:{scoreThreshold:70}},{label:"评分75",overrides:{scoreThreshold:75}},{label:"评分80",overrides:{scoreThreshold:80}}];
    if (compareDim==="stopLoss") return [{label:"止损6%",overrides:{stopLossRate:0.06}},{label:"止损8%",overrides:{stopLossRate:0.08}},{label:"止损10%",overrides:{stopLossRate:0.10}},{label:"不止损",overrides:{stopLossRate:0}}];
    if (compareDim==="maSet")   return [{label:"MA5/20/60",overrides:{maSet:"5/20/60"}},{label:"MA10/30/120",overrides:{maSet:"10/30/120"}}];
    return [{label:"每日检查",overrides:{checkFreq:"daily"}},{label:"每周检查",overrides:{checkFreq:"weekly"}}];
  }, [compareDim]);

  async function handleCompare() {
    if (!selectedStock || !tushareOk || compareRunning) return;
    setCompareRunning(true);
    const init: CmpItem[] = compareVariants.map(v => ({label:v.label,result:null,error:null,running:true}));
    setCompareItems(init);
    const upd = [...init];
    for (let i=0; i<compareVariants.length; i++) {
      const {result:r,error:e} = await fetchSingle(buildBody(compareVariants[i].overrides));
      upd[i] = {...upd[i],result:r,error:e,running:false};
      setCompareItems([...upd]);
    }
    setCompareRunning(false);
  }

  const canRun = !!selectedStock && tushareOk === true && !running;

  // ════════════════════════════════════════════════════════════════
  return (
    <div style={{background:"#07111F",minHeight:"100vh"}}>
      <PageHeader title="单只股票回测" />

      {/* 返回 + 模式切换 */}
      <div className="mx-4 mt-3 flex items-center gap-3">
        <Link href="/backtest" className="flex items-center gap-1 text-[11px] font-bold" style={{color:MID}}>
          <ArrowLeft size={13}/> 全市场回测
        </Link>
        <span style={{color:BORDER}}>|</span>
        <span className="text-[11px] font-bold" style={{color:G}}>单只股票回测</span>
      </div>

      {/* Tushare 状态 */}
      <div className="mx-4 mt-3 p-2.5 rounded-xl flex items-center gap-2"
        style={{
          background: tushareOk ? "rgba(0,229,168,0.05)" : "rgba(239,68,68,0.05)",
          border: `1px solid ${tushareOk ? "rgba(0,229,168,0.2)" : "rgba(239,68,68,0.2)"}`,
        }}>
        {tushareOk === null
          ? <div className="w-3 h-3 rounded-full border-2 animate-spin" style={{borderColor:MID,borderTopColor:"transparent"}}/>
          : tushareOk ? <CheckCircle size={12} color={G}/> : <AlertTriangle size={12} color={R}/>}
        <p className="text-[11px] font-bold" style={{color: tushareOk ? G : tushareOk===false ? R : MID}}>
          {tushareOk===null?"检测 Tushare 连接…":tushareOk?"Tushare 已连接，使用真实历史日线数据":"Tushare 未连接，无法运行真实回测"}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-4 pb-10">

        {/* ── ① 股票搜索 ──────────────────────────────────────────── */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{color:MID}}>① 选择股票</label>

          {selectedStock ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl"
              style={{background:"rgba(0,229,168,0.08)",border:`1px solid ${G}33`}}>
              <div className="flex-1">
                <p className="font-bold text-[14px]" style={{color:"#F8FAFC"}}>{selectedStock.name}</p>
                <p className="text-[11px] mt-0.5" style={{color:MID}}>{selectedStock.tsCode} · {selectedStock.industry}</p>
              </div>
              <button onClick={() => { setSelectedStock(null); setQuery(""); setResult(null); setError(null); }}
                className="p-2 rounded-lg" style={{background:"rgba(255,255,255,0.05)"}}>
                <X size={14} color={MID}/>
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl"
                style={{background:CARD,border:`1px solid ${BORDER}`}}>
                <Search size={14} color={MID}/>
                <input
                  className="flex-1 bg-transparent outline-none text-[13px]"
                  style={{color:"#F8FAFC"}}
                  placeholder="搜索股票名称或代码（如：贵州茅台 / 600519）"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                {(searchLoading) && (
                  <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0"
                    style={{borderColor:MID,borderTopColor:"transparent"}}/>
                )}
                {query && !searchLoading && <button onClick={() => { setQuery(""); setSearchResults([]); }}><X size={13} color={DIM}/></button>}
              </div>

              {/* 搜索结果 */}
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-2xl overflow-hidden"
                  style={{background:"#0a1628",border:`1px solid ${BORDER}`,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
                  {searchResults.map(s => (
                    <button key={s.tsCode} onClick={() => { setSelectedStock(s); setQuery(""); setSearchResults([]); }}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
                      style={{borderBottom:`1px solid ${BORDER}`}}>
                      <div>
                        <p className="text-[13px] font-bold" style={{color:"#F8FAFC"}}>{s.name}</p>
                        <p className="text-[10px] mt-0.5" style={{color:MID}}>{s.tsCode} · {s.industry}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded" style={{background:"rgba(0,229,168,0.1)",color:G}}>选择</span>
                    </button>
                  ))}
                </div>
              )}
              {query && !searchLoading && searchResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 p-3 rounded-xl text-center text-[12px]"
                  style={{background:"#0a1628",border:`1px solid ${BORDER}`,color:DIM}}>
                  未找到匹配股票，请尝试其他关键词
                </div>
              )}
            </div>
          )}

          {/* 常用股票快捷选择 */}
          {!selectedStock && (
            <div className="mt-2">
              <p className="text-[10px] mb-1.5" style={{color:DIM}}>常用：</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {tsCode:"600519.SH",symbol:"600519",name:"贵州茅台",industry:"白酒"},
                  {tsCode:"002594.SZ",symbol:"002594",name:"比亚迪",  industry:"汽车"},
                  {tsCode:"300750.SZ",symbol:"300750",name:"宁德时代",industry:"电池"},
                  {tsCode:"000858.SZ",symbol:"000858",name:"五粮液",  industry:"白酒"},
                  {tsCode:"600036.SH",symbol:"600036",name:"招商银行",industry:"银行"},
                  {tsCode:"000333.SZ",symbol:"000333",name:"美的集团",industry:"家电"},
                ].map(s => (
                  <button key={s.tsCode} onClick={() => setSelectedStock(s)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
                    style={{background:CARD,border:`1px solid ${BORDER}`,color:MID}}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── ② 回测时间 ──────────────────────────────────────────── */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{color:MID}}>② 回测时间</label>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {(["近1年","近2年","近3年","自定义"] as DateRange[]).map(t => (
              <button key={t} onClick={() => setDateRange(t)}
                className="py-2 rounded-xl text-[12px] font-semibold"
                style={{
                  background: dateRange===t ? "rgba(0,229,168,0.15)" : CARD,
                  border:`1px solid ${dateRange===t?G:BORDER}`,
                  color: dateRange===t ? G : MID,
                }}>{t}</button>
            ))}
          </div>
          {dateRange==="自定义" && (
            <div className="flex gap-2">
              <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl text-[12px] outline-none"
                style={{background:CARD,border:`1px solid ${BORDER}`,color:"#F8FAFC"}}/>
              <span className="py-2 text-[12px]" style={{color:DIM}}>至</span>
              <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl text-[12px] outline-none"
                style={{background:CARD,border:`1px solid ${BORDER}`,color:"#F8FAFC"}}/>
            </div>
          )}
        </div>

        {/* ── ③ 初始资金 ──────────────────────────────────────────── */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{color:MID}}>③ 初始资金</label>
          <div className="grid grid-cols-4 gap-1.5">
            {[50000,100000,500000,1000000].map(v => (
              <button key={v} onClick={() => setCapital(v)}
                className="py-2.5 rounded-xl text-[12px] font-semibold"
                style={{
                  background: capital===v?"rgba(0,229,168,0.15)":CARD,
                  border:`1px solid ${capital===v?G:BORDER}`,
                  color: capital===v?G:MID,
                }}>¥{v>=10000?`${v/10000}万`:v}</button>
            ))}
          </div>
        </div>

        {/* ── ④ 策略参数 ──────────────────────────────────────────── */}
        <div className="p-4 rounded-2xl space-y-4" style={{background:CARD,border:`1px solid ${BORDER}`}}>
          <p className="text-[12px] font-bold" style={{color:MID}}>④ 策略参数</p>

          {/* 均线组合 */}
          <div>
            <p className="text-[11px] mb-1.5" style={{color:DIM}}>均线组合</p>
            <div className="flex gap-2">
              {(["5/20/60","10/30/120"] as const).map(v => (
                <button key={v} onClick={() => setMaSet(v)}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: maSet===v?"rgba(250,204,21,0.15)":"#0a1628",
                    border:`1px solid ${maSet===v?Y:BORDER}`,
                    color: maSet===v?Y:MID,
                  }}>MA {v}</button>
              ))}
            </div>
          </div>

          {/* 检查频率 */}
          <div>
            <p className="text-[11px] mb-1.5" style={{color:DIM}}>信号检查频率</p>
            <div className="flex gap-2">
              {([{v:"daily",l:"每日"},{v:"weekly",l:"每周"}] as const).map(({v,l}) => (
                <button key={v} onClick={() => setCheckFreq(v)}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: checkFreq===v?"rgba(0,229,168,0.15)":"#0a1628",
                    border:`1px solid ${checkFreq===v?G:BORDER}`,
                    color: checkFreq===v?G:MID,
                  }}>{l}检查</button>
              ))}
            </div>
          </div>

          {/* 买入阈值 */}
          <div>
            <p className="text-[11px] mb-1.5" style={{color:DIM}}>买入综合评分阈值（趋势阈值自动取 -5）</p>
            <div className="flex gap-2">
              {[70,72,75,78,80].map(v => (
                <button key={v} onClick={() => { setScoreThresh(v); setTrendThresh(v-5); }}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: scoreThresh===v?"rgba(250,204,21,0.15)":"#0a1628",
                    border:`1px solid ${scoreThresh===v?Y:BORDER}`,
                    color: scoreThresh===v?Y:MID,
                  }}>{v}</button>
              ))}
            </div>
          </div>

          {/* 止损 */}
          <div>
            <p className="text-[11px] mb-1.5" style={{color:DIM}}>止损比例</p>
            <div className="flex gap-2">
              {[{v:0.06,l:"-6%"},{v:0.08,l:"-8%"},{v:0.10,l:"-10%"},{v:0,l:"不止损"}].map(({v,l}) => (
                <button key={v} onClick={() => setStopLoss(v)}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: stopLoss===v?"rgba(239,68,68,0.15)":"#0a1628",
                    border:`1px solid ${stopLoss===v?R:BORDER}`,
                    color: stopLoss===v?R:MID,
                  }}>{l}</button>
              ))}
            </div>
          </div>

          {/* 部分止盈 */}
          <div>
            <p className="text-[11px] mb-1.5" style={{color:DIM}}>部分止盈（盈利此比例后跌破短均线卖半）</p>
            <div className="flex gap-2">
              {[{v:0.15,l:"+15%"},{v:0.20,l:"+20%"},{v:0.25,l:"+25%"},{v:0,l:"关闭"}].map(({v,l}) => (
                <button key={v} onClick={() => setTpHalf(v)}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: tpHalf===v?"rgba(0,229,168,0.15)":"#0a1628",
                    border:`1px solid ${tpHalf===v?G:BORDER}`,
                    color: tpHalf===v?G:MID,
                  }}>{l}</button>
              ))}
            </div>
          </div>

          {/* 全仓止盈 */}
          <div>
            <p className="text-[11px] mb-1.5" style={{color:DIM}}>全仓止盈（部分止盈后再盈利此比例跌破长均线全卖）</p>
            <div className="flex gap-2">
              {[{v:0.30,l:"+30%"},{v:0.35,l:"+35%"},{v:0.50,l:"+50%"},{v:0,l:"关闭"}].map(({v,l}) => (
                <button key={v} onClick={() => setTpFull(v)}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: tpFull===v?"rgba(0,229,168,0.15)":"#0a1628",
                    border:`1px solid ${tpFull===v?G:BORDER}`,
                    color: tpFull===v?G:MID,
                  }}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 运行按钮 + 对比 ─────────────────────────────────────── */}
        <div className="flex gap-2">
          <button onClick={handleRun} disabled={!canRun}
            className="flex-1 py-4 rounded-2xl font-black text-[16px]"
            style={{
              background: canRun ? `linear-gradient(135deg,${G},#00b885)` : CARD,
              color: canRun ? "#07111F" : DIM,
            }}>
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:DIM}}/>
                加载 Tushare 数据中…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2"><Play size={16}/> 运行单股回测</span>
            )}
          </button>
          <button onClick={() => setCompareMode(!compareMode)}
            className="px-4 rounded-2xl font-bold"
            style={{
              background: compareMode?"rgba(59,130,246,0.15)":CARD,
              border:`1px solid ${compareMode?B:BORDER}`,
              color: compareMode?B:MID,
            }}>
            <GitCompare size={16}/>
          </button>
        </div>

        {/* ── 对比面板 ───────────────────────────────────────────── */}
        {compareMode && (
          <div className="p-4 rounded-2xl space-y-3" style={{background:CARD,border:`1px solid ${B}33`}}>
            <p className="text-[12px] font-bold" style={{color:B}}>参数对比（同一股票，不同参数）</p>
            <div className="grid grid-cols-2 gap-2">
              {([{v:"score",l:"评分阈值"},{v:"stopLoss",l:"止损比例"},{v:"maSet",l:"均线组合"},{v:"freq",l:"检查频率"}] as {v:CompDim;l:string}[]).map(({v,l}) => (
                <button key={v} onClick={() => { setCompareDim(v); setCompareItems([]); }}
                  className="py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: compareDim===v?"rgba(59,130,246,0.15)":"#0a1628",
                    border:`1px solid ${compareDim===v?B:BORDER}`,
                    color: compareDim===v?B:MID,
                  }}>{l}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {compareVariants.map((v,i) => (
                <span key={i} className="text-[10px] px-2 py-1 rounded-lg font-bold"
                  style={{background:"#0a1628",color:MID,border:`1px solid ${BORDER}`}}>{v.label}</span>
              ))}
            </div>
            <button onClick={handleCompare} disabled={compareRunning || !canRun}
              className="w-full py-3 rounded-xl font-black text-[13px]"
              style={{
                background: (compareRunning||!canRun)?"#0a1628":"rgba(59,130,246,0.15)",
                border:`1px solid ${B}`, color:(compareRunning||!canRun)?DIM:B,
              }}>
              {compareRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:B}}/>
                  对比运行中…
                </span>
              ) : <span className="flex items-center justify-center gap-2"><RefreshCw size={14}/> 运行全部对比</span>}
            </button>
            {compareItems.length > 0 && (
              <div>
                <p className="text-[11px] font-bold mb-2" style={{color:MID}}>对比结果</p>
                <CompareTable items={compareItems}/>
              </div>
            )}
          </div>
        )}

        {/* ── 免责声明 ─────────────────────────────────────────────── */}
        <div className="p-3 rounded-xl flex items-start gap-2"
          style={{background:"rgba(250,204,21,0.04)",border:"1px solid rgba(250,204,21,0.2)"}}>
          <AlertTriangle size={12} color={Y} className="flex-shrink-0 mt-0.5"/>
          <p className="text-[10px] leading-[1.7]" style={{color:DIM}}>
            <span className="font-bold" style={{color:Y}}>风险提示：</span>
            历史回测结果不代表未来收益，不构成投资建议，不保证盈利。
            单只股票回测集中度高，风险高于分散组合。投资决策由您自行承担。
          </p>
        </div>

        {/* ── 错误 ─────────────────────────────────────────────────── */}
        {error && (
          <div className="p-3 rounded-2xl flex items-start gap-2"
            style={{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)"}}>
            <AlertTriangle size={13} color={R} className="flex-shrink-0 mt-0.5"/>
            <div>
              <p className="font-bold text-[12px]" style={{color:R}}>回测失败</p>
              <p className="text-[11px] mt-0.5" style={{color:MID}}>{error}</p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            回测结果
        ══════════════════════════════════════════════════════════ */}
        {result && (
          <div className="space-y-4">

            {/* 股票标题 */}
            <div className="p-4 rounded-2xl flex items-center gap-3"
              style={{background:"rgba(0,229,168,0.05)",border:`1px solid ${G}22`}}>
              <BarChart3 size={20} color={G}/>
              <div>
                <p className="font-black text-[16px]" style={{color:"#F8FAFC"}}>{result.name}</p>
                <p className="text-[11px]" style={{color:MID}}>{result.tsCode} · {fmtDate(result.startDate)} ~ {fmtDate(result.endDate)}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="font-black text-[22px] num" style={{color: result.totalReturn>=0?G:R}}>
                  {result.totalReturn>=0?"+":""}{result.totalReturn.toFixed(2)}%
                </p>
                <p className="text-[10px]" style={{color:DIM}}>总收益</p>
              </div>
            </div>

            {/* 指标格子（2列，8格）*/}
            <div className="grid grid-cols-2 gap-2">
              <MC label="年化收益" value={`${result.annualReturn>=0?"+":""}${result.annualReturn.toFixed(2)}%`} color={result.annualReturn>=0?G:R}/>
              <MC label="最大回撤" value={`${result.maxDrawdown.toFixed(2)}%`} color={result.maxDrawdown<-20?R:Y}/>
              <MC label="夏普比率" value={result.sharpeRatio.toFixed(2)} color={result.sharpeRatio>=1.5?G:result.sharpeRatio>=1?Y:MID}/>
              <MC label="胜率" value={`${result.winRate.toFixed(1)}%`} color={result.winRate>=55?G:result.winRate>=45?Y:R}/>
              <MC label="盈亏比" value={result.profitFactor.toFixed(2)} color={result.profitFactor>=2?G:MID}/>
              <MC label="最大连续亏损" value={`${result.maxConsecutiveLosses}次`} color={result.maxConsecutiveLosses>4?R:MID}/>
              <MC label="持仓天数" value={`${result.holdingDays}天`} sub={`共${result.holdingDays+result.cashDays}天`}/>
              <MC label="空仓天数" value={`${result.cashDays}天`} sub={`${result.holdingDays+result.cashDays>0?((result.holdingDays/(result.holdingDays+result.cashDays))*100).toFixed(0):0}%时间持仓`}/>
            </div>

            {/* 交易次数 + 手续费 */}
            <div className="grid grid-cols-2 gap-2">
              <MC label="总交易次数" value={`${result.totalTrades}次`}/>
              <MC label="手续费合计" value={`¥${fmtMoney(result.totalFees)}`} sub={`占本金${result.feeImpact.toFixed(1)}%`} color={result.feeImpact>5?R:MID}/>
            </div>

            {/* 估值/择时数据说明 */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-[10px] px-2 py-1 rounded-lg"
                style={{background: result.hasValuation?"rgba(0,229,168,0.1)":"rgba(148,163,184,0.1)", color: result.hasValuation?G:MID}}>
                {result.hasValuation?"估值数据 ✅ 已启用":"估值数据 ⚠️ 不可用（中性处理）"}
              </span>
              <span className="text-[10px] px-2 py-1 rounded-lg"
                style={{background: result.marketTimingOk?"rgba(0,229,168,0.1)":"rgba(148,163,184,0.1)", color: result.marketTimingOk?G:MID}}>
                {result.marketTimingOk?"市场择时 ✅ 沪深300":"市场择时 ⚠️ 不可用"}
              </span>
              <span className="text-[10px] px-2 py-1 rounded-lg"
                style={{background:"rgba(59,130,246,0.1)",color:B}}>
                策略评分 {result.strategyScore}/100
              </span>
            </div>

            {/* 诊断 */}
            <div className="space-y-1.5">
              {result.diagnostics.map((d,i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl"
                  style={{
                    background: d.type==="warning"?"rgba(239,68,68,0.05)":"rgba(0,229,168,0.05)",
                    border:`1px solid ${d.type==="warning"?"rgba(239,68,68,0.2)":"rgba(0,229,168,0.15)"}`,
                  }}>
                  {d.type==="warning"
                    ? <AlertTriangle size={12} color={R} className="flex-shrink-0 mt-0.5"/>
                    : <CheckCircle   size={12} color={G} className="flex-shrink-0 mt-0.5"/>}
                  <p className="text-[11px] leading-[1.6]" style={{color: d.type==="warning"?"#FCA5A5":"#86EFAC"}}>{d.message}</p>
                </div>
              ))}
            </div>

            {/* 图表区（含买卖点）*/}
            <div className="p-3 rounded-2xl" style={{background:CARD,border:`1px solid ${BORDER}`}}>
              <div className="flex gap-1 mb-3">
                {([
                  {k:"price"   as ResultTab,label:"K线+买卖点"},
                  {k:"equity"  as ResultTab,label:"资金曲线"},
                  {k:"drawdown"as ResultTab,label:"回撤曲线"},
                  {k:"trades"  as ResultTab,label:"交易记录"},
                ]).map(({k,label}) => (
                  <button key={k} onClick={() => setActiveTab(k)}
                    className="flex-1 py-1.5 rounded-xl text-[10px] font-bold"
                    style={{
                      background: activeTab===k?"rgba(0,229,168,0.15)":"#0a1628",
                      border:`1px solid ${activeTab===k?G:BORDER}`,
                      color: activeTab===k?G:MID,
                    }}>{label}</button>
                ))}
              </div>

              {activeTab==="price"    && <PriceChart    bars={result.bars}/>}
              {activeTab==="equity"   && <EquityChart   equity={result.equity}/>}
              {activeTab==="drawdown" && <DrawdownChart drawdown={result.drawdown}/>}
              {activeTab==="trades"   && <TradeTable    trades={result.trades}/>}
            </div>

            {/* 数据说明 */}
            <div className="p-3 rounded-xl flex items-start gap-2"
              style={{background:"rgba(59,130,246,0.06)",border:"1px solid rgba(59,130,246,0.15)"}}>
              <Activity size={12} color={B} className="flex-shrink-0 mt-0.5"/>
              <p className="text-[10px] leading-[1.7]" style={{color:DIM}}>
                <span className="font-bold" style={{color:B}}>数据说明：</span>{result.note}
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default function SingleBacktestPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{borderColor:G,borderTopColor:"transparent"}}/>
      </div>
    }>
      <SingleBacktestForm/>
    </Suspense>
  );
}
