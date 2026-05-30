"use client";
/**
 * SingleSTBacktest.tsx — 单只 ST 股票回测 UI 组件
 * 嵌入 st-risk-reversal/page.tsx，提供单只股票回测功能。
 */
import { useState, useMemo, useEffect } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  AreaChart, Area,
} from "recharts";
import { AlertTriangle, Play, Activity, Info, Search, X, ChevronDown, ChevronUp } from "lucide-react";

// ── 颜色 ─────────────────────────────────────────────────────────────
const R   = "#EF4444";
const G   = "#00E5A8";
const Y   = "#FACC15";
const B   = "#3B82F6";
const DIM = "#64748B";
const MID = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

// ── 类型（对应 stSingleBacktestService.ts 返回值）──────────────────
interface STSingleTradeRecord {
  tradeId: number; buyDate: string; buyPrice: number; buyShares: number;
  buyAmount: number; buyFee: number; sellDate: string; sellPrice: number;
  sellShares: number; sellAmount: number; sellFee: number; holdDays: number;
  pnl: number; pnlPct: number; commission: number; stampDuty: number;
  slippageCost: number; sellReason: string; riskEvents: string[];
}
interface STSingleRiskEvent {
  date: string; eventType: string; stockName: string; tsCode: string;
  price: number; pctChg: number; holdShares: number; pnlImpact: number;
  action: string; note: string;
}
interface STSingleKlineSignal {
  date: string; open: number; high: number; low: number; close: number;
  volume: number; pctChg: number;
  ma5?: number; ma10?: number; ma20?: number;
  signal?: "buy" | "sell" | "stop_loss" | "take_profit" | "limit_down_stuck";
}
interface STSingleResult {
  status: "ok" | "no_trades" | "data_insufficient" | "not_st";
  statusMessage: string; statusReason?: string;
  totalReturn: number; annualReturn: number; maxDrawdown: number;
  sharpeRatio: number; winRate: number; profitFactor: number;
  initialCapital: number; finalCapital: number;
  totalTrades: number; buyCount: number; stopLossCount: number; takeProfitCount: number;
  limitDownCannotSellCount: number; suspendedDays: number;
  maxConsecutiveLosses: number; avgHoldDays: number; cashDays: number;
  equity: { date: string; value: number }[];
  drawdown: { date: string; dd: number }[];
  trades: STSingleTradeRecord[];
  riskEvents: STSingleRiskEvent[];
  klineSignals: STSingleKlineSignal[];
  diagnostics: {
    klineCount: number; tradingDays: number; buySignalCount: number;
    cannotTradeCount: number; limitDownCannotSellCount: number;
    noTradeReason?: string; dataSource: string;
  };
  source: "tushare"; note: string; scoreMode: string; dataQuality: number;
}
interface STStock {
  tsCode: string; symbol: string; name: string; industry: string;
  stType: string; listDate: string; exchange: string;
}

// ── 辅助函数 ─────────────────────────────────────────────────────────
function fmtMoney(n: number) {
  if (Math.abs(n) >= 1e8) return `${(n/1e8).toFixed(1)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n/1e4).toFixed(0)}万`;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}
function fmtDateShort(d: string) { return `${d.slice(2,4)}/${d.slice(4,6)}`; }
function yearsAgoYMD(n: number) {
  const d = new Date(); d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0,10).replace(/-/g,"");
}
function todayYMD() { return new Date().toISOString().slice(0,10).replace(/-/g,""); }
function downsample<T>(arr: T[], max = 150): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}
const SELL_REASON_LABEL: Record<string, string> = {
  stop_loss: "止损", take_profit: "止盈", ma20_breakdown: "均线跌破",
  low_score: "评分下降", time_stop: "时间止损",
  consecutive_limit_down: "连续跌停", final_close: "回测收盘",
};
const SELL_REASON_COLOR: Record<string, string> = {
  stop_loss: R, take_profit: G, ma20_breakdown: Y,
  low_score: Y, time_stop: Y,
  consecutive_limit_down: R, final_close: MID,
};

// ── K 线信号图 ────────────────────────────────────────────────────────
function KlineSignalChart({ klines }: { klines: STSingleKlineSignal[] }) {
  const data = useMemo(() => downsample(klines).map(k => ({
    d: fmtDateShort(k.date),
    close: k.close,
    ma5:   k.ma5,
    ma10:  k.ma10,
    ma20:  k.ma20,
    buy:   k.signal === "buy"        ? k.close : null,
    sell:  (k.signal === "sell" || k.signal === "stop_loss" || k.signal === "take_profit") ? k.close : null,
    stuck: k.signal === "limit_down_stuck" ? k.close : null,
  })), [klines]);

  if (data.length < 5) return (
    <div className="flex items-center justify-center h-40" style={{ color: DIM }}>
      <p className="text-[11px]">K线数据不足</p>
    </div>
  );

  const minC = Math.min(...data.map(d => d.close)) * 0.97;
  const maxC = Math.max(...data.map(d => d.close)) * 1.03;

  return (
    <div>
      {/* 图例 */}
      <div className="flex flex-wrap gap-3 mb-2">
        {[
          { color: "#F8FAFC", label: "收盘价" },
          { color: B, label: "MA5" },
          { color: Y, label: "MA10" },
          { color: R, label: "MA20" },
          { color: G, label: "▲买入" },
          { color: R, label: "▼卖出/止损" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1 text-[9px]">
            <span className="w-3 h-0.5 rounded" style={{ background: color, display: "inline-block" }} />
            <span style={{ color: MID }}>{label}</span>
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
          <XAxis dataKey="d" tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis domain={[minC, maxC]} tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false}
            tickFormatter={(v) => v.toFixed(2)} />
          <Tooltip
            contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 10 }}
            labelStyle={{ color: MID }}
            formatter={(v, name) => {
              if (v == null) return null;
              const label = name === "close" ? "收盘" : name === "ma5" ? "MA5"
                : name === "ma10" ? "MA10" : name === "ma20" ? "MA20"
                : name === "buy" ? "▲买入" : name === "sell" ? "▼卖出" : "跌停滞留";
              return [Number(v).toFixed(3), label];
            }} />
          <Line dataKey="close" stroke="#F8FAFC" strokeWidth={1.5} dot={false} name="close" connectNulls />
          <Line dataKey="ma5"   stroke={B} strokeWidth={1} dot={false} strokeDasharray="4 2" name="ma5"  connectNulls />
          <Line dataKey="ma10"  stroke={Y} strokeWidth={1} dot={false} strokeDasharray="4 2" name="ma10" connectNulls />
          <Line dataKey="ma20"  stroke={R} strokeWidth={1} dot={false} strokeDasharray="4 2" name="ma20" connectNulls />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Scatter dataKey="buy"   fill={G} name="buy"   shape={(props: any) => {
            const cx = props.cx as number, cy = props.cy as number;
            if (!props.value) return <g />;
            return <polygon points={`${cx},${cy-6} ${cx-5},${cy+3} ${cx+5},${cy+3}`} fill={G} />;
          }} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Scatter dataKey="sell"  fill={R} name="sell"  shape={(props: any) => {
            const cx = props.cx as number, cy = props.cy as number;
            if (!props.value) return <g />;
            return <polygon points={`${cx},${cy+6} ${cx-5},${cy-3} ${cx+5},${cy-3}`} fill={R} />;
          }} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Scatter dataKey="stuck" fill={Y} name="stuck" shape={(props: any) => {
            const cx = props.cx as number, cy = props.cy as number;
            if (!props.value) return <g />;
            return <text x={cx} y={cy} textAnchor="middle" fill={Y} fontSize={10}>⚠</text>;
          }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 资金曲线图 ────────────────────────────────────────────────────────
function EquityChartSingle({ equity }: { equity: { date: string; value: number }[] }) {
  const data = useMemo(() => downsample(equity).map(e => ({ d: fmtDateShort(e.date), v: e.value })), [equity]);
  if (data.length < 2) return <div className="h-36 flex items-center justify-center" style={{ color: DIM }}><p className="text-[11px]">数据不足</p></div>;
  const min = Math.min(...data.map(d => d.v)); const max = Math.max(...data.map(d => d.v));
  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="ss-eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={G} stopOpacity={0.25} />
            <stop offset="95%" stopColor={G} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
        <XAxis dataKey="d" tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[min * 0.98, max * 1.01]} tick={{ fill: DIM, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtMoney} />
        <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 10 }}
          formatter={(v) => [`¥${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`, "资金"]}
          labelStyle={{ color: MID }} itemStyle={{ color: G }} />
        <Area type="monotone" dataKey="v" stroke={G} strokeWidth={1.5} fill="url(#ss-eq)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 交易卡片（移动端友好，可展开） ────────────────────────────────────
function SingleTradeCard({ t, idx }: { t: STSingleTradeRecord; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const isP = t.pnl >= 0;
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: CARD, border: `1px solid ${isP ? G+"33" : R+"33"}` }}>
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold mb-1" style={{ color: DIM }}>交易 #{idx+1}</p>
            <p className="text-[10px]" style={{ color: DIM }}>
              买 {t.buyDate.slice(0,4)}-{t.buyDate.slice(4,6)}-{t.buyDate.slice(6,8)} &nbsp;
              ¥{t.buyPrice.toFixed(3)} × {t.buyShares}股
            </p>
            <p className="text-[10px]" style={{ color: DIM }}>
              卖 {t.sellDate.slice(0,4)}-{t.sellDate.slice(4,6)}-{t.sellDate.slice(6,8)} &nbsp;
              ¥{t.sellPrice.toFixed(3)} × {t.sellShares}股
            </p>
            <p className="text-[10px]" style={{ color: DIM }}>持仓 {t.holdDays}天</p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[13px] font-black" style={{ color: isP ? G : R }}>
              {isP?"+":""}{fmtMoney(t.pnl)}
            </span>
            <span className="text-[10px] font-bold" style={{ color: isP ? G : R }}>
              {isP?"+":""}{t.pnlPct.toFixed(2)}%
            </span>
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
              style={{
                background: `${SELL_REASON_COLOR[t.sellReason]??MID}18`,
                color: SELL_REASON_COLOR[t.sellReason] ?? MID,
                border: `1px solid ${SELL_REASON_COLOR[t.sellReason]??MID}44`,
              }}>
              {SELL_REASON_LABEL[t.sellReason] ?? t.sellReason}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end mt-1 gap-1">
          <span className="text-[9px]" style={{ color: DIM }}>{expanded ? "收起" : "展开详情"}</span>
          {expanded ? <ChevronUp size={11} color={DIM} /> : <ChevronDown size={11} color={DIM} />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: BORDER }}>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mt-2">
            {[
              { k: "买入金额", v: `¥${fmtMoney(t.buyAmount)}` },
              { k: "卖出金额", v: `¥${fmtMoney(t.sellAmount)}` },
              { k: "手续费",   v: `¥${t.commission.toFixed(2)}` },
              { k: "印花税",   v: `¥${t.stampDuty.toFixed(2)}` },
              { k: "滑点成本", v: `¥${t.slippageCost.toFixed(2)}` },
              { k: "总费用",   v: `¥${(t.commission+t.stampDuty+t.slippageCost).toFixed(2)}` },
            ].map(({ k, v }) => (
              <div key={k} className="flex flex-col">
                <span className="text-[8px]" style={{ color: DIM }}>{k}</span>
                <span className="text-[9px] font-bold" style={{ color: MID }}>{v}</span>
              </div>
            ))}
          </div>
          {t.riskEvents && t.riskEvents.length > 0 && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: BORDER }}>
              <p className="text-[9px] font-bold mb-1" style={{ color: Y }}>期间风险事件：</p>
              {t.riskEvents.map((e, i) => (
                <p key={i} className="text-[9px]" style={{ color: DIM }}>• {e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TradeDetailCards({ trades, stockName, symbol }: { trades: STSingleTradeRecord[]; stockName: string; symbol: string }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? trades : trades.slice(0, 8);

  if (!trades || trades.length === 0) return (
    <div className="py-8 text-center">
      <p className="text-[12px] font-bold" style={{ color: Y }}>本次单只股票回测没有产生交易</p>
      <p className="text-[10px] mt-1" style={{ color: DIM }}>可尝试切换为激进/调试模式，或延长回测时间</p>
    </div>
  );

  const totalFee = trades.reduce((a,t) => a+t.commission+t.stampDuty+t.slippageCost, 0);
  const totalPnl = trades.reduce((a,t) => a+t.pnl, 0);

  return (
    <div className="space-y-2">
      {/* 摘要行 */}
      <div className="px-3 py-2 rounded-xl flex flex-wrap gap-x-4 gap-y-1"
        style={{ background: "#0a1628", border: `1px solid ${BORDER}` }}>
        {[
          { k: "共交易",   v: `${trades.length}次`,            c: MID },
          { k: "总盈亏",   v: `${totalPnl>=0?"+":""}¥${fmtMoney(totalPnl)}`, c: totalPnl>=0?G:R },
          { k: "总费用",   v: `¥${fmtMoney(totalFee)}`,        c: MID },
          { k: "平均持仓", v: `${(trades.reduce((a,t)=>a+t.holdDays,0)/trades.length).toFixed(1)}天`, c: MID },
        ].map(({ k, v, c }) => (
          <span key={k} className="text-[10px]">
            <span style={{ color: DIM }}>{k}：</span>
            <span className="font-bold" style={{ color: c }}>{v}</span>
          </span>
        ))}
      </div>
      {/* 卡片列表 */}
      {shown.map((t, i) => <SingleTradeCard key={t.tradeId ?? i} t={t} idx={i} />)}
      {trades.length > 8 && (
        <button onClick={() => setShowAll(s => !s)}
          className="w-full py-2.5 rounded-xl text-[11px] font-bold"
          style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
          {showAll ? "收起" : `查看全部 ${trades.length} 笔交易`}
        </button>
      )}
      <p className="text-[9px] px-1" style={{ color: DIM }}>
        股票：{stockName}（{symbol}）· 点击每笔交易可展开手续费/印花税/滑点明细
      </p>
    </div>
  );
}

// ── 风险事件列表 ─────────────────────────────────────────────────────
function RiskEventList({ events }: { events: STSingleRiskEvent[] }) {
  if (events.length === 0) return (
    <p className="text-[11px] py-4 text-center" style={{ color: DIM }}>回测期间未触发重大风险事件</p>
  );
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? events : events.slice(0, 15);
  return (
    <div>
      <div className="space-y-1.5">
        {shown.map((e, i) => {
          const isWarn = ["跌停无法卖出","连续跌停风险","停牌影响"].includes(e.eventType);
          return (
            <div key={i} className="p-2.5 rounded-xl flex items-start gap-2"
              style={{ background: `rgba(${isWarn?"239,68,68":"250,204,21"},0.06)`,
                       border: `1px solid rgba(${isWarn?"239,68,68":"250,204,21"},0.2)` }}>
              <AlertTriangle size={11} color={isWarn ? R : Y} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold" style={{ color: isWarn ? R : Y }}>
                    {e.eventType}
                  </span>
                  <span className="text-[9px]" style={{ color: DIM }}>
                    {e.date.slice(0,4)}/{e.date.slice(4,6)}/{e.date.slice(6,8)}
                  </span>
                  <span className="text-[9px]" style={{ color: DIM }}>¥{e.price.toFixed(2)}</span>
                  {e.pctChg !== 0 && (
                    <span className="text-[9px] font-bold" style={{ color: e.pctChg > 0 ? R : G }}>
                      {e.pctChg > 0 ? "+" : ""}{e.pctChg.toFixed(2)}%
                    </span>
                  )}
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: DIM }}>{e.note}</p>
                <p className="text-[9px]" style={{ color: MID }}>处理：{e.action}</p>
                {e.pnlImpact !== 0 && (
                  <p className="text-[9px]" style={{ color: e.pnlImpact > 0 ? G : R }}>
                    盈亏影响：{e.pnlImpact > 0 ? "+" : ""}{fmtMoney(e.pnlImpact)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {events.length > 15 && (
        <button onClick={() => setShowAll(!showAll)}
          className="w-full mt-2 py-2 rounded-xl text-[10px] font-bold"
          style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
          {showAll ? "收起" : `查看全部 ${events.length} 条风险事件`}
        </button>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────
interface Props {
  stStocks:   STStock[];
  tushareOk:  boolean | null;
}

type SMode = "conservative" | "standard" | "aggressive" | "debug";
const SCORE_LABELS: Record<SMode, string> = {
  conservative: "保守 ≥70", standard: "标准 ≥58", aggressive: "激进 ≥45", debug: "调试 ≥30",
};

export default function SingleSTBacktest({ stStocks, tushareOk }: Props) {
  const [search,       setSearch]       = useState("");
  const [selected,     setSelected]     = useState<STStock | null>(null);
  const [showSearch,   setShowSearch]   = useState(false);
  const [nonSTConfirm, setNonSTConfirm] = useState(false);

  // 参数
  const [dateRange,       setDateRange]       = useState<"近1年"|"近2年"|"近3年">("近2年");
  const [capital,         setCapital]         = useState(100000);
  const [positionRatio,   setPositionRatio]   = useState(0.9);
  const [stopLoss,        setStopLoss]        = useState(0.06);
  const [halfProfit,      setHalfProfit]      = useState(0.20);
  const [fullProfit,      setFullProfit]      = useState(0.35);
  const [maxHoldDays,     setMaxHoldDays]     = useState(0);
  const [scoreMode,       setScoreMode]       = useState<SMode>("standard");
  const [minAmount,       setMinAmount]       = useState(5_000_000);
  const [enableFees,      setEnableFees]      = useState(true);
  const [enableLimit,     setEnableLimit]     = useState(true);
  const [showAdvanced,    setShowAdvanced]    = useState(false);
  const [activeTab,       setActiveTab]       = useState<"kline"|"equity"|"trades"|"risk"|"diag">("kline");

  // 状态
  const [running,     setRunning]     = useState(false);
  const [result,      setResult]      = useState<STSingleResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  const startDate = useMemo(() => {
    const n = dateRange === "近1年" ? 1 : dateRange === "近2年" ? 2 : 3;
    return yearsAgoYMD(n);
  }, [dateRange]);

  // 搜索过滤
  const searchResults = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q || q.length < 2) return [];
    return stStocks.filter(s =>
      s.symbol.includes(q) ||
      s.name.toUpperCase().includes(q) ||
      s.tsCode.toUpperCase().includes(q)
    ).slice(0, 8);
  }, [search, stStocks]);

  // 检查所选股票是否为 ST
  const isRealST = selected
    ? ["ST", "*ST", "SST"].some(prefix => selected.name.toUpperCase().startsWith(prefix)) || selected.stType !== ""
    : false;

  function handleSelect(s: STStock) {
    setSelected(s); setSearch(""); setShowSearch(false); setNonSTConfirm(false); setResult(null); setResultError(null);
  }

  function handleClear() {
    setSelected(null); setResult(null); setResultError(null); setSearch(""); setNonSTConfirm(false);
  }

  async function handleRun() {
    if (!selected || !tushareOk) return;
    if (!isRealST && !nonSTConfirm) return;
    setRunning(true); setResult(null); setResultError(null);
    try {
      const res = await fetch("/api/tushare/st-single-backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tsCode: selected.tsCode, name: selected.name, isRealST,
          startDate, endDate: todayYMD(),
          initialCapital: capital, positionRatio,
          stopLossRate: stopLoss, halfProfitRate: halfProfit, fullProfitRate: fullProfit,
          maxHoldDays, scoreMode, minAmount20d: minAmount,
          enableT1: true, enableLimitFilter: enableLimit, enableFees,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data as STSingleResult);
        setActiveTab(data.status === "ok" ? "kline" : "diag");
      } else {
        setResultError(data.error ?? "回测失败");
      }
    } catch (e) { setResultError(String(e)); }
    setRunning(false);
  }

  return (
    <div className="space-y-4">
      {/* ── 股票搜索 ─────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-bold mb-2" style={{ color: MID }}>选择回测股票</p>

        {selected ? (
          <div className="p-3 rounded-2xl" style={{ background: CARD, border: `2px solid ${R}66` }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-black text-[14px]" style={{ color: "#F8FAFC" }}>{selected.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                    style={{ background: "rgba(239,68,68,0.15)", color: R }}>{selected.stType || "ST"}</span>
                  {!isRealST && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: "rgba(250,204,21,0.15)", color: Y }}>非ST</span>
                  )}
                </div>
                <p className="text-[10px]" style={{ color: DIM }}>
                  {selected.symbol} ({selected.tsCode}) · {selected.industry || "—"} · 上市 {selected.listDate}
                </p>
              </div>
              <button onClick={handleClear}
                className="p-1.5 rounded-lg" style={{ background: "#0a1628" }}>
                <X size={14} color={MID} />
              </button>
            </div>
            {!isRealST && !nonSTConfirm && (
              <div className="mt-3 p-2.5 rounded-xl" style={{ background: "rgba(250,204,21,0.08)", border: `1px solid ${Y}44` }}>
                <p className="text-[10px] font-bold mb-2" style={{ color: Y }}>
                  ⚠️ 当前股票不是 ST/＊ST，不适用于 ST 风险反转策略
                </p>
                <p className="text-[10px] mb-2" style={{ color: DIM }}>可作为调试模式运行（买卖规则相同，结果仅供参考）</p>
                <button onClick={() => setNonSTConfirm(true)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold"
                  style={{ background: "rgba(250,204,21,0.15)", color: Y, border: `1px solid ${Y}44` }}>
                  确认以调试模式运行
                </button>
              </div>
            )}
            {!isRealST && nonSTConfirm && (
              <div className="mt-2 px-2 py-1 rounded-lg flex items-center gap-1.5"
                style={{ background: "rgba(250,204,21,0.08)" }}>
                <Info size={10} color={Y} />
                <p className="text-[9px]" style={{ color: Y }}>调试模式 — 结果仅供参考</p>
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center gap-2 p-3 rounded-2xl"
              style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <Search size={14} color={DIM} className="flex-shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-[12px] placeholder-opacity-50"
                style={{ color: "#F8FAFC" }}
                placeholder="输入股票名称或代码（如：002157 或 ST 易购）"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
                onFocus={() => setShowSearch(true)}
              />
              {search && (
                <button onClick={() => { setSearch(""); setShowSearch(false); }}>
                  <X size={14} color={DIM} />
                </button>
              )}
            </div>
            {showSearch && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-2xl overflow-hidden"
                style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                {searchResults.map(s => (
                  <button key={s.tsCode} onClick={() => handleSelect(s)}
                    className="w-full px-3 py-2.5 flex items-center justify-between active:opacity-70"
                    style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold" style={{ color: "#F8FAFC" }}>{s.name}</span>
                        <span className="text-[8px] px-1 py-0.5 rounded font-bold"
                          style={{ background: "rgba(239,68,68,0.15)", color: R }}>{s.stType || "ST"}</span>
                      </div>
                      <p className="text-[10px]" style={{ color: DIM }}>{s.symbol} · {s.industry || "—"}</p>
                    </div>
                    <p className="text-[10px]" style={{ color: DIM }}>{s.tsCode}</p>
                  </button>
                ))}
              </div>
            )}
            {showSearch && search.length >= 2 && searchResults.length === 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 p-3 rounded-2xl"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-[11px]" style={{ color: DIM }}>
                  未在 ST 股票池中找到"{search}"。请检查代码/名称，或加载 Tushare ST 池后重试。
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 参数设置 ─────────────────────────────────────── */}
      {selected && (isRealST || nonSTConfirm) && (
        <div className="space-y-3">
          {/* 回测时间 */}
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: DIM }}>回测时间</p>
            <div className="grid grid-cols-3 gap-2">
              {(["近1年","近2年","近3年"] as const).map(t => (
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
              {[50000, 100000, 200000, 500000].map(v => (
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

          {/* 策略模式 */}
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: DIM }}>策略模式（评分阈值）</p>
            <div className="grid grid-cols-2 gap-2">
              {(["conservative","standard","aggressive","debug"] as SMode[]).map(m => (
                <button key={m} onClick={() => setScoreMode(m)}
                  className="py-2 rounded-xl text-[11px] font-bold"
                  style={{
                    background: scoreMode === m ? "rgba(250,204,21,0.15)" : CARD,
                    border: `1px solid ${scoreMode === m ? Y : BORDER}`,
                    color: scoreMode === m ? Y : MID,
                  }}>{SCORE_LABELS[m]}</button>
              ))}
            </div>
          </div>

          {/* 高级参数 */}
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-[11px] font-bold"
            style={{ color: DIM }}>
            {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showAdvanced ? "收起高级参数" : "高级参数（仓位/止损/止盈/成交额）"}
          </button>

          {showAdvanced && (
            <div className="p-3 rounded-2xl space-y-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              {/* 仓位比例 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>单次买入仓位</p>
                <div className="flex gap-2">
                  {[0.5, 0.7, 0.9, 1.0].map(v => (
                    <button key={v} onClick={() => setPositionRatio(v)}
                      className="flex-1 py-2 rounded-xl text-[11px] font-bold"
                      style={{
                        background: positionRatio === v ? "rgba(239,68,68,0.12)" : "#0a1628",
                        border: `1px solid ${positionRatio === v ? R : BORDER}`,
                        color: positionRatio === v ? R : MID,
                      }}>{(v*100).toFixed(0)}%</button>
                  ))}
                </div>
              </div>
              {/* 止损 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>止损比例</p>
                <div className="flex gap-2">
                  {[{v:0.04,l:"-4%"},{v:0.06,l:"-6%"},{v:0.08,l:"-8%"},{v:0,l:"不止损"}].map(({v,l}) => (
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
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>止盈（MA跌破时触发）</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[9px] mb-1" style={{ color: DIM }}>MA5跌破止盈（小止盈）</p>
                    <div className="flex gap-1">
                      {[{v:0.15,l:"+15%"},{v:0.20,l:"+20%"},{v:0,l:"关"}].map(({v,l}) => (
                        <button key={v} onClick={() => setHalfProfit(v)}
                          className="flex-1 py-1.5 rounded-lg text-[10px] font-bold"
                          style={{
                            background: halfProfit === v ? "rgba(0,229,168,0.12)" : "#0a1628",
                            border: `1px solid ${halfProfit === v ? G : BORDER}`,
                            color: halfProfit === v ? G : MID,
                          }}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] mb-1" style={{ color: DIM }}>MA10跌破止盈（大止盈）</p>
                    <div className="flex gap-1">
                      {[{v:0.30,l:"+30%"},{v:0.35,l:"+35%"},{v:0,l:"关"}].map(({v,l}) => (
                        <button key={v} onClick={() => setFullProfit(v)}
                          className="flex-1 py-1.5 rounded-lg text-[10px] font-bold"
                          style={{
                            background: fullProfit === v ? "rgba(0,229,168,0.12)" : "#0a1628",
                            border: `1px solid ${fullProfit === v ? G : BORDER}`,
                            color: fullProfit === v ? G : MID,
                          }}>{l}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* 时间止损 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>时间止损（超期自动退出）</p>
                <div className="flex gap-2">
                  {[{v:15,l:"15天"},{v:20,l:"20天"},{v:30,l:"30天"},{v:0,l:"不限"}].map(({v,l}) => (
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
              {/* 成交额阈值 */}
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>20日均成交额下限（流动性要求）</p>
                <div className="flex gap-2">
                  {[{v:1_000_000,l:"100万"},{v:5_000_000,l:"500万"},{v:10_000_000,l:"1000万"},{v:0,l:"不限"}].map(({v,l}) => (
                    <button key={v} onClick={() => setMinAmount(v)}
                      className="flex-1 py-2 rounded-xl text-[10px] font-bold"
                      style={{
                        background: minAmount === v ? "rgba(59,130,246,0.12)" : "#0a1628",
                        border: `1px solid ${minAmount === v ? B : BORDER}`,
                        color: minAmount === v ? B : MID,
                      }}>{l}</button>
                  ))}
                </div>
              </div>
              {/* 开关 */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "启用手续费/印花税/滑点", val: enableFees, set: setEnableFees },
                  { label: "启用涨跌停限制", val: enableLimit, set: setEnableLimit },
                ].map(({ label, val, set }) => (
                  <button key={label} onClick={() => set(!val)}
                    className="flex items-center gap-2 p-2 rounded-xl"
                    style={{ background: val ? "rgba(0,229,168,0.08)" : "#0a1628",
                             border: `1px solid ${val ? G : BORDER}` }}>
                    <div className="w-8 h-4 rounded-full relative flex-shrink-0"
                      style={{ background: val ? G : BORDER }}>
                      <div className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5"
                        style={{ left: val ? "auto" : "2px", right: val ? "2px" : "auto" }} />
                    </div>
                    <span className="text-[9px]" style={{ color: val ? G : DIM }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 配置摘要 */}
          <div className="px-3 py-2 rounded-xl flex flex-wrap gap-x-3 gap-y-1"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            {[
              { k: "股票",   v: `${selected.name}(${selected.symbol})` },
              { k: "时间",   v: dateRange },
              { k: "资金",   v: `¥${fmtMoney(capital)}` },
              { k: "仓位",   v: `${(positionRatio*100).toFixed(0)}%` },
              { k: "模式",   v: SCORE_LABELS[scoreMode] },
              { k: "止损",   v: stopLoss > 0 ? `-${(stopLoss*100).toFixed(0)}%` : "关闭" },
              { k: "小止盈", v: halfProfit > 0 ? `+${(halfProfit*100).toFixed(0)}%` : "关闭" },
              { k: "大止盈", v: fullProfit > 0 ? `+${(fullProfit*100).toFixed(0)}%` : "关闭" },
            ].map(({ k, v }) => (
              <span key={k} className="text-[10px]">
                <span style={{ color: DIM }}>{k}：</span>
                <span className="font-bold" style={{ color: "#F8FAFC" }}>{v}</span>
              </span>
            ))}
          </div>

          {/* 运行按钮 */}
          <button onClick={handleRun} disabled={!tushareOk || running}
            className="w-full py-4 rounded-2xl font-black text-[15px]"
            style={{
              background: (!tushareOk || running) ? CARD : "linear-gradient(135deg, #EF4444, #b91c1c)",
              color: (!tushareOk || running) ? DIM : "#fff",
            }}>
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "#fff", borderTopColor: "transparent" }} />
                单只 ST 股票回测运行中（约 20-40s）…
              </span>
            ) : !tushareOk ? (
              "Tushare 未连接，无法回测"
            ) : (
              `▶ 运行「${selected.name}」单只 ST 股票回测`
            )}
          </button>
        </div>
      )}

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

      {/* ══════════════════════════════════════════════
          单只股票回测结果
      ══════════════════════════════════════════════ */}
      {result && (
        <div className="space-y-3">

          {/* 无交易信号 */}
          {result.status !== "ok" && (
            <div className="p-4 rounded-2xl" style={{ background: "rgba(250,204,21,0.07)", border: `2px solid ${Y}` }}>
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle size={16} color={Y} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-[13px]" style={{ color: Y }}>{result.statusMessage}</p>
                  {result.statusReason && (
                    <p className="text-[11px] mt-1 leading-[1.6]" style={{ color: MID }}>{result.statusReason}</p>
                  )}
                </div>
              </div>
              <div className="mt-2 p-2.5 rounded-xl" style={{ background: "#0a1628" }}>
                <p className="text-[10px] font-bold mb-1" style={{ color: Y }}>建议：</p>
                <ul className="space-y-0.5">
                  {["切换到【激进 ≥45】或【调试 ≥30】模式", "关闭成交额限制（设置为「不限」）",
                    "延长回测时间范围（近2年/近3年）",
                    "确认 Tushare 已连接且有 daily 接口权限"].map(t => (
                    <li key={t} className="text-[10px] list-disc ml-3" style={{ color: DIM }}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 正常结果 */}
          {result.status === "ok" && (
            <>
              {/* 核心指标 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl text-center"
                  style={{ background: "rgba(0,229,168,0.06)", border: `1px solid ${G}33` }}>
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
                    { label: "年化收益", value: `${result.annualReturn >= 0?"+":""}${result.annualReturn.toFixed(1)}%`, color: result.annualReturn >= 0 ? G : R },
                    { label: "最大回撤", value: `${result.maxDrawdown.toFixed(1)}%`,  color: result.maxDrawdown < -20 ? R : Y },
                    { label: "夏普比率", value: result.sharpeRatio.toFixed(2),        color: MID },
                    { label: "胜率",     value: `${result.winRate.toFixed(1)}%`,       color: result.winRate >= 50 ? G : R },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="p-2 rounded-xl text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                      <p className="font-black text-[12px] num" style={{ color }}>{value}</p>
                      <p className="text-[9px] mt-0.5" style={{ color: DIM }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ST 专项指标 */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "交易次数",   value: `${result.totalTrades}次`,             color: MID },
                  { label: "止损次数",   value: `${result.stopLossCount}次`,            color: result.stopLossCount > 3 ? R : MID },
                  { label: "跌停滞留",   value: `${result.limitDownCannotSellCount}次`, color: result.limitDownCannotSellCount > 0 ? R : G },
                  { label: "停牌天数",   value: `${result.suspendedDays}天`,            color: result.suspendedDays > 5 ? Y : MID },
                  { label: "止盈次数",   value: `${result.takeProfitCount}次`,          color: result.takeProfitCount > 0 ? G : MID },
                  { label: "平均持仓",   value: `${result.avgHoldDays}天`,              color: MID },
                  { label: "连续亏损",   value: `${result.maxConsecutiveLosses}次`,     color: result.maxConsecutiveLosses > 3 ? R : MID },
                  { label: "盈亏比",     value: result.profitFactor.toFixed(2),         color: result.profitFactor >= 1.5 ? G : MID },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-2 rounded-xl text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    <p className="font-black text-[11px] num" style={{ color }}>{value}</p>
                    <p className="text-[8px] mt-0.5" style={{ color: DIM }}>{label}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Tab 切换 */}
          <div className="p-3 rounded-2xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            {/* flex-wrap 避免 overflow-x-auto 拦截移动端触摸事件 */}
            <div className="flex flex-wrap gap-1 mb-3">
              {([
                { k: "kline"  as const, label: "K线信号" },
                { k: "equity" as const, label: "资金曲线" },
                { k: "trades" as const, label: `交易(${result.trades?.length ?? 0})` },
                { k: "risk"   as const, label: `风险(${result.riskEvents?.length ?? 0})` },
                { k: "diag"   as const, label: "诊断" },
              ]).map(({ k, label }) => (
                <button
                  key={k}
                  onClick={() => setActiveTab(k)}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-bold"
                  style={{
                    background: activeTab === k ? "rgba(239,68,68,0.15)" : "#0a1628",
                    border: `1px solid ${activeTab === k ? R : BORDER}`,
                    color: activeTab === k ? R : MID,
                  }}>{label}</button>
              ))}
            </div>

            {activeTab === "kline" && (
              (result.klineSignals?.length ?? 0) > 5
                ? <KlineSignalChart klines={result.klineSignals} />
                : <p className="text-[11px] py-6 text-center" style={{ color: DIM }}>K线数据不足</p>
            )}

            {activeTab === "equity" && <EquityChartSingle equity={result.equity ?? []} />}

            {activeTab === "trades" && (
              <TradeDetailCards
                trades={result.trades ?? []}
                stockName={selected?.name ?? ""}
                symbol={selected?.symbol ?? ""}
              />
            )}

            {activeTab === "risk" && <RiskEventList events={result.riskEvents ?? []} />}

            {activeTab === "diag" && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold" style={{ color: B }}>📊 回测诊断信息</p>
                {[
                  { label: "历史K线数量",     value: `${result.diagnostics.klineCount} 根` },
                  { label: "可交易天数",       value: `${result.diagnostics.tradingDays} 天` },
                  { label: "买入信号触发次数", value: `${result.diagnostics.buySignalCount} 次`, color: result.diagnostics.buySignalCount > 0 ? G : R },
                  { label: "无法成交次数",     value: `${result.diagnostics.cannotTradeCount} 次` },
                  { label: "跌停无法卖出",     value: `${result.diagnostics.limitDownCannotSellCount} 次`, color: result.diagnostics.limitDownCannotSellCount > 0 ? R : G },
                  { label: "数据源",           value: result.diagnostics.dataSource },
                  { label: "数据质量",         value: `${(result.dataQuality * 100).toFixed(0)}%`, color: result.dataQuality >= 0.9 ? G : Y },
                  { label: "评分模式",         value: SCORE_LABELS[result.scoreMode as SMode] ?? result.scoreMode },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between px-2 py-1.5 rounded-lg"
                    style={{ background: "#0a1628" }}>
                    <span className="text-[10px]" style={{ color: DIM }}>{label}</span>
                    <span className="text-[10px] font-bold" style={{ color: color ?? MID }}>{value}</span>
                  </div>
                ))}
                {result.diagnostics.noTradeReason && (
                  <div className="p-2.5 rounded-xl mt-1"
                    style={{ background: "rgba(250,204,21,0.08)", border: `1px solid ${Y}33` }}>
                    <p className="text-[10px] font-bold mb-1" style={{ color: Y }}>无交易原因：</p>
                    <p className="text-[10px]" style={{ color: MID }}>{result.diagnostics.noTradeReason}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 数据来源说明 */}
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
    </div>
  );
}
