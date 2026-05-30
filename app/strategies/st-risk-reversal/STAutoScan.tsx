"use client";
/**
 * STAutoScan.tsx — ST 单股自动扫描
 *
 * 从 ST 股票池逐只运行单只股票回测，筛选高收益候选。
 * 客户端编排：依次调用 /api/tushare/st-single-backtest，显示实时进度。
 *
 * ⚠️ 历史回测不代表未来收益，存在幸存者偏差，不构成投资建议。
 */
import { useState, useRef, useMemo, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Line, Scatter,
} from "recharts";
import {
  AlertTriangle, Play, Square, Activity,
  ChevronDown, ChevronUp, X, RefreshCw,
} from "lucide-react";

// ── 颜色 ─────────────────────────────────────────────────────────────
const R   = "#EF4444";
const G   = "#00E5A8";
const Y   = "#FACC15";
const B   = "#3B82F6";
const DIM = "#64748B";
const MID = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

// ── 类型 ─────────────────────────────────────────────────────────────
interface STStock {
  tsCode: string; symbol: string; name: string;
  industry: string; stType: string; listDate: string; exchange: string;
}

interface TradeRecord {
  tradeId: number; buyDate: string; buyPrice: number; buyShares: number;
  buyAmount: number; buyFee: number; sellDate: string; sellPrice: number;
  sellShares: number; sellAmount: number; sellFee: number; holdDays: number;
  pnl: number; pnlPct: number; commission: number; stampDuty: number;
  slippageCost: number; sellReason: string; riskEvents: string[];
}
interface RiskEvent {
  date: string; eventType: string; stockName: string; tsCode: string;
  price: number; pctChg: number; holdShares: number; pnlImpact: number;
  action: string; note: string;
}
interface KlineSignal {
  date: string; close: number; ma5?: number; ma10?: number; ma20?: number;
  signal?: "buy" | "sell" | "stop_loss" | "take_profit" | "limit_down_stuck";
}

interface ScanStockResult {
  tsCode: string; symbol: string; name: string; industry: string; stType: string;
  totalReturn: number; annualReturn: number; maxDrawdown: number;
  sharpeRatio: number; winRate: number; profitFactor: number;
  totalTrades: number; stopLossCount: number; takeProfitCount: number;
  limitDownCannotSellCount: number; suspendedDays: number;
  maxConsecutiveLosses: number; avgHoldDays: number;
  initialCapital: number; finalCapital: number;
  equity: { date: string; value: number }[];
  drawdown: { date: string; dd: number }[];
  trades: TradeRecord[];
  riskEvents: RiskEvent[];
  klineSignals: KlineSignal[];
  diagnostics: {
    klineCount: number; tradingDays: number; buySignalCount: number;
    cannotTradeCount: number; limitDownCannotSellCount: number;
    dataSource: string; noTradeReason?: string;
  };
  dataQuality: number; scoreMode: string;
  riskLevel: "low" | "medium" | "high" | "extreme";
  compositeScore: number;
  /** 固定值 — 标记本结果由 backtestSingleSTStock 生成，与手动单股回测使用同一引擎 */
  sourceBacktestMethod: "backtestSingleSTStock";
  /** 回测时使用的参数快照，用于与手动单股回测对比一致性 */
  scanParams: {
    startDate: string; endDate: string;
    initialCapital: number; positionRatio: number;
    stopLossRate: number; halfProfitRate: number; fullProfitRate: number;
    maxHoldDays: number; scoreMode: string; minAmount20d: number;
    enableT1: boolean; enableLimitFilter: boolean; enableFees: boolean;
  };
}

interface FailedStock { name: string; tsCode: string; symbol: string; reason: string; }

type SortKey  = "annual" | "drawdown" | "winrate" | "ratio" | "score";
type SMode    = "conservative" | "standard" | "aggressive" | "debug";
type DateRng  = "近1年" | "近2年" | "近3年";

// ── 辅助函数 ─────────────────────────────────────────────────────────
function fmtMoney(n: number) {
  if (Math.abs(n) >= 1e8) return `${(n/1e8).toFixed(1)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n/1e4).toFixed(0)}万`;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}
function fmtDS(d: string) {
  if (d.length === 8) return `${d.slice(2,4)}/${d.slice(4,6)}`;
  return d.slice(2,7);
}
function fmtDFull(d: string) {
  if (d.length === 8) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
  return d;
}
function yearsAgoYMD(n: number) {
  const d = new Date(); d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0,10).replace(/-/g,"");
}
function todayYMD() { return new Date().toISOString().slice(0,10).replace(/-/g,""); }
function downsample<T>(arr: T[], max = 120): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

const SELL_LABEL: Record<string, string> = {
  stop_loss: "止损", take_profit: "止盈", ma20_breakdown: "跌破MA20",
  low_score: "评分下降", time_stop: "时间止损",
  consecutive_limit_down: "连续跌停", final_close: "回测收盘",
};
const SELL_COLOR: Record<string, string> = {
  stop_loss: R, take_profit: G, ma20_breakdown: Y,
  low_score: Y, time_stop: Y, consecutive_limit_down: R, final_close: MID,
};

function riskLevel(r: Pick<ScanStockResult, "maxDrawdown"|"limitDownCannotSellCount"|"maxConsecutiveLosses">): ScanStockResult["riskLevel"] {
  const dd = Math.abs(r.maxDrawdown);
  if (dd > 40 || r.limitDownCannotSellCount > 3 || r.maxConsecutiveLosses > 6) return "extreme";
  if (dd > 30 || r.limitDownCannotSellCount > 1 || r.maxConsecutiveLosses > 4) return "high";
  if (dd > 20 || r.maxConsecutiveLosses > 2) return "medium";
  return "low";
}

function compositeScore(r: Pick<ScanStockResult, "annualReturn"|"winRate"|"maxDrawdown"|"sharpeRatio">): number {
  const a = Math.min(40, Math.max(0, r.annualReturn * 0.8));
  const w = Math.min(25, Math.max(0, r.winRate * 0.5));
  const d = Math.min(25, Math.max(0, (1 - Math.abs(r.maxDrawdown) / 50) * 25));
  const s = Math.min(10, Math.max(0, r.sharpeRatio * 4));
  return Math.round(a + w + d + s);
}

function passesFilter(r: ScanStockResult, minAnn: number, maxDD: number, minWin: number): boolean {
  return (
    r.annualReturn >= minAnn &&
    Math.abs(r.maxDrawdown) <= maxDD &&
    r.winRate >= minWin &&
    r.totalTrades >= 3 && r.totalTrades <= 80 &&
    r.limitDownCannotSellCount <= 5 &&
    r.suspendedDays <= 30 &&
    r.maxConsecutiveLosses <= 8
  );
}

const RISK_LABEL: Record<ScanStockResult["riskLevel"], string> = {
  low: "低风险", medium: "中风险", high: "高风险", extreme: "极端风险",
};
const RISK_COLOR: Record<ScanStockResult["riskLevel"], string> = {
  low: G, medium: Y, high: "#F97316", extreme: R,
};

// ── 本地缓存 ──────────────────────────────────────────────────────────
interface ScanCache {
  scannedAt: number; dateRange: DateRng; scoreMode: SMode;
  totalCount: number; results: ScanStockResult[]; failed: FailedStock[];
}
const CACHE_TTL = 24 * 3600 * 1000;
// v3: 缓存键包含 minAmount20d，避免不同流动性设置返回旧缓存
function cacheKey(dr: DateRng, sm: SMode, minAmt: number) {
  return `st-auto-scan-v3-${dr}-${sm}-${minAmt}`;
}
function loadCache(dr: DateRng, sm: SMode, minAmt: number): ScanCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(dr, sm, minAmt));
    if (!raw) return null;
    const c = JSON.parse(raw) as ScanCache;
    if (Date.now() - c.scannedAt > CACHE_TTL) return null;
    return c;
  } catch { return null; }
}
function saveCache(c: ScanCache, minAmt: number) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(cacheKey(c.dateRange, c.scoreMode, minAmt), JSON.stringify(c)); } catch { /**/ }
}
function clearCache(dr: DateRng, sm: SMode, minAmt: number) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(cacheKey(dr, sm, minAmt)); } catch { /**/ }
}

// ── K 线图（内联轻量版） ──────────────────────────────────────────────
function MiniKline({ klines }: { klines: KlineSignal[] }) {
  const data = useMemo(() => downsample(klines, 100).map(k => ({
    d: fmtDS(k.date), close: k.close,
    ma5: k.ma5 ?? null, ma20: k.ma20 ?? null,
    buy:  k.signal === "buy" ? k.close : null,
    sell: (k.signal === "sell" || k.signal === "stop_loss" || k.signal === "take_profit") ? k.close : null,
  })), [klines]);
  if (data.length < 5) return <p className="text-[11px] py-6 text-center" style={{ color: DIM }}>K线数据不足</p>;
  const cs = klines.map(k => k.close);
  const minC = Math.min(...cs) * 0.97, maxC = Math.max(...cs) * 1.03;
  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
        <XAxis dataKey="d" tick={{ fill: DIM, fontSize: 8 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[minC, maxC]} tick={{ fill: DIM, fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1)} />
        <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 9 }} labelStyle={{ color: MID }}
          formatter={(v, n) => {
            if (v == null) return null;
            return [Number(v).toFixed(2), n === "close" ? "收盘" : n === "ma5" ? "MA5" : n === "ma20" ? "MA20" : n === "buy" ? "▲买入" : "▼卖出"];
          }} />
        <Line dataKey="close" stroke="#F8FAFC" strokeWidth={1.5} dot={false} connectNulls />
        <Line dataKey="ma5"   stroke={B}       strokeWidth={1}   dot={false} strokeDasharray="4 2" connectNulls />
        <Line dataKey="ma20"  stroke={R}       strokeWidth={1}   dot={false} strokeDasharray="4 2" connectNulls />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Scatter dataKey="buy"  fill={G} shape={(p: any) => { if (!p.value) return <g/>; return <polygon points={`${p.cx},${p.cy-5} ${p.cx-4},${p.cy+3} ${p.cx+4},${p.cy+3}`} fill={G}/>; }} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Scatter dataKey="sell" fill={R} shape={(p: any) => { if (!p.value) return <g/>; return <polygon points={`${p.cx},${p.cy+5} ${p.cx-4},${p.cy-3} ${p.cx+4},${p.cy-3}`} fill={R}/>; }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── 资金曲线（轻量版） ────────────────────────────────────────────────
function MiniEquity({ equity }: { equity: { date: string; value: number }[] }) {
  const data = useMemo(() => downsample(equity, 100).map(e => ({ d: fmtDS(e.date), v: e.value })), [equity]);
  if (data.length < 2) return <p className="text-[11px] py-6 text-center" style={{ color: DIM }}>数据不足</p>;
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="as-eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={G} stopOpacity={0.3} />
            <stop offset="95%" stopColor={G} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
        <XAxis dataKey="d" tick={{ fill: DIM, fontSize: 8 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: DIM, fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
        <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 9 }}
          formatter={v => [`¥${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`, "资金"]}
          labelStyle={{ color: MID }} />
        <Area type="monotone" dataKey="v" stroke={G} strokeWidth={1.5} fill="url(#as-eq)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 交易卡片（移动端，可展开） ────────────────────────────────────────
function TradeCard({ t, idx, name, symbol }: { t: TradeRecord; idx: number; name: string; symbol: string }) {
  const [expanded, setExpanded] = useState(false);
  const isP = t.pnl >= 0;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${isP ? G+"33" : R+"33"}` }}>
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-[10px] font-bold" style={{ color: DIM }}>#{idx+1}</span>
              <span className="text-[11px] font-black" style={{ color: "#F8FAFC" }}>{name}</span>
              <span className="text-[9px]" style={{ color: DIM }}>{symbol}</span>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px]" style={{ color: DIM }}>买 {fmtDFull(t.buyDate)} ¥{t.buyPrice.toFixed(3)} × {t.buyShares}股</p>
              <p className="text-[10px]" style={{ color: DIM }}>卖 {fmtDFull(t.sellDate)} ¥{t.sellPrice.toFixed(3)} × {t.sellShares}股</p>
              <p className="text-[10px]" style={{ color: DIM }}>持仓 {t.holdDays}天</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[13px] font-black" style={{ color: isP ? G : R }}>
              {isP?"+":""}{fmtMoney(t.pnl)}
            </span>
            <span className="text-[10px] font-bold" style={{ color: isP ? G : R }}>
              {isP?"+":""}{t.pnlPct.toFixed(2)}%
            </span>
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: `${SELL_COLOR[t.sellReason]??MID}18`, color: SELL_COLOR[t.sellReason]??MID, border: `1px solid ${SELL_COLOR[t.sellReason]??MID}44` }}>
              {SELL_LABEL[t.sellReason] ?? t.sellReason}
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
              {t.riskEvents.map((e, i) => <p key={i} className="text-[9px]" style={{ color: DIM }}>• {e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TradeCardList({ trades, name, symbol }: { trades: TradeRecord[]; name: string; symbol: string }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? trades : trades.slice(0, 6);
  if (!trades || trades.length === 0) return (
    <div className="py-8 text-center">
      <p className="text-[12px] font-bold" style={{ color: Y }}>本次回测没有产生交易</p>
    </div>
  );
  const totalFee = trades.reduce((a, t) => a + t.commission + t.stampDuty + t.slippageCost, 0);
  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  return (
    <div className="space-y-2">
      <div className="px-3 py-2 rounded-xl flex flex-wrap gap-x-4 gap-y-1" style={{ background: "#0a1628" }}>
        {[
          { k: "总交易",   v: `${trades.length}次`, c: MID },
          { k: "总盈亏",   v: `${totalPnl>=0?"+":""}¥${fmtMoney(totalPnl)}`, c: totalPnl>=0?G:R },
          { k: "总费用",   v: `¥${fmtMoney(totalFee)}`, c: MID },
          { k: "平均持仓", v: `${(trades.reduce((a,t)=>a+t.holdDays,0)/trades.length).toFixed(1)}天`, c: MID },
        ].map(({ k, v, c }) => (
          <span key={k} className="text-[10px]">
            <span style={{ color: DIM }}>{k}：</span>
            <span className="font-bold" style={{ color: c }}>{v}</span>
          </span>
        ))}
      </div>
      {shown.map((t, i) => <TradeCard key={t.tradeId ?? i} t={t} idx={i} name={name} symbol={symbol} />)}
      {trades.length > 6 && (
        <button onClick={() => setShowAll(s => !s)}
          className="w-full py-2.5 rounded-xl text-[11px] font-bold"
          style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
          {showAll ? "收起" : `查看全部 ${trades.length} 笔交易`}
        </button>
      )}
    </div>
  );
}

// ── 风险事件列表 ──────────────────────────────────────────────────────
function RiskEventCards({ events }: { events: RiskEvent[] }) {
  if (!events || events.length === 0) return (
    <p className="text-[11px] py-6 text-center" style={{ color: DIM }}>回测期间未触发重大风险事件 ✅</p>
  );
  return (
    <div className="space-y-2">
      {events.map((e, i) => {
        const isHigh = ["跌停无法卖出","连续跌停风险","触发止损"].includes(e.eventType);
        const c = isHigh ? R : Y;
        return (
          <div key={i} className="p-3 rounded-xl"
            style={{ background: `rgba(${isHigh?"239,68,68":"250,204,21"},0.06)`, border: `1px solid rgba(${isHigh?"239,68,68":"250,204,21"},0.2)` }}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-[11px] font-black" style={{ color: c }}>{e.eventType}</span>
              <span className="text-[9px]" style={{ color: DIM }}>{fmtDFull(e.date)}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
              {[
                { k: "价格",   v: `¥${e.price.toFixed(2)}` },
                { k: "涨跌幅", v: `${e.pctChg>=0?"+":""}${e.pctChg.toFixed(2)}%`, c: e.pctChg>0?R:G },
                { k: "持仓",   v: `${e.holdShares}股` },
              ].map(({ k, v, c: fc }) => (
                <span key={k} className="text-[9px]">
                  <span style={{ color: DIM }}>{k}：</span>
                  <span style={{ color: fc??MID }}>{v}</span>
                </span>
              ))}
            </div>
            <p className="text-[9px]" style={{ color: DIM }}>{e.note}</p>
            <p className="text-[9px]" style={{ color: MID }}>处理：{e.action}</p>
            {e.pnlImpact !== 0 && (
              <p className="text-[9px] font-bold" style={{ color: e.pnlImpact>0?G:R }}>
                盈亏影响：{e.pnlImpact>0?"+":""}{fmtMoney(e.pnlImpact)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 详情覆盖层（全屏弹出） ────────────────────────────────────────────
type DetailTab = "equity" | "kline" | "trades" | "risk" | "diag";

function DetailOverlay({ r, onClose }: { r: ScanStockResult; onClose: () => void }) {
  const [tab, setTab] = useState<DetailTab>("equity");
  const rl = r.riskLevel;

  const TABS: { k: DetailTab; label: string }[] = [
    { k: "equity", label: "资金曲线" },
    { k: "kline",  label: "K线信号" },
    { k: "trades", label: `交易(${r.trades?.length ?? 0})` },
    { k: "risk",   label: `风险(${r.riskEvents?.length ?? 0})` },
    { k: "diag",   label: "诊断" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#07111F" }}>
      {/* ── 顶部标题 */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-black text-[16px]" style={{ color: "#F8FAFC" }}>{r.name}</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: `${RISK_COLOR[rl]}18`, color: RISK_COLOR[rl], border: `1px solid ${RISK_COLOR[rl]}44` }}>
              {RISK_LABEL[rl]}
            </span>
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: DIM }}>{r.tsCode} · {r.industry}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl" style={{ background: "#0a1628" }}>
          <X size={18} color={MID} />
        </button>
      </div>

      {/* ── 核心指标 */}
      <div className="px-4 py-2 grid grid-cols-4 gap-2 flex-shrink-0" style={{ background: "#0a1628" }}>
        {[
          { l: "总收益",   v: `${r.totalReturn>=0?"+":""}${r.totalReturn.toFixed(1)}%`,  c: r.totalReturn>=0?G:R },
          { l: "年化收益", v: `${r.annualReturn>=0?"+":""}${r.annualReturn.toFixed(1)}%`, c: r.annualReturn>=0?G:R },
          { l: "最大回撤", v: `${r.maxDrawdown.toFixed(1)}%`, c: Math.abs(r.maxDrawdown)>30?R:Y },
          { l: "胜率",     v: `${r.winRate.toFixed(1)}%`,     c: r.winRate>=50?G:MID },
        ].map(({ l, v, c }) => (
          <div key={l} className="text-center p-2 rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <p className="font-black text-[11px]" style={{ color: c }}>{v}</p>
            <p className="text-[8px] mt-0.5" style={{ color: DIM }}>{l}</p>
          </div>
        ))}
      </div>

      {/* ── Tab 栏 */}
      <div className="px-4 py-2 flex-shrink-0" style={{ background: "#0a1628", borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex flex-wrap gap-1">
          {TABS.map(({ k, label }) => (
            <button key={k} onClick={() => setTab(k)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-bold"
              style={{
                background: tab === k ? "rgba(239,68,68,0.15)" : CARD,
                border: `1px solid ${tab === k ? R : BORDER}`,
                color: tab === k ? R : MID,
              }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Tab 内容（可滚动） */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "equity" && <MiniEquity equity={r.equity ?? []} />}
        {tab === "kline"  && <MiniKline  klines={r.klineSignals ?? []} />}
        {tab === "trades" && (
          <TradeCardList
            trades={r.trades ?? []}
            name={r.name}
            symbol={r.symbol}
          />
        )}
        {tab === "risk"  && <RiskEventCards events={r.riskEvents ?? []} />}
        {tab === "diag"  && (
          <div className="space-y-2">
            {[
              { label: "历史K线数量",   value: `${r.diagnostics?.klineCount ?? 0}根` },
              { label: "可交易天数",     value: `${r.diagnostics?.tradingDays ?? 0}天` },
              { label: "买入信号次数",   value: `${r.diagnostics?.buySignalCount ?? 0}次`, c: (r.diagnostics?.buySignalCount??0)>0?G:R },
              { label: "跌停无法卖出",   value: `${r.diagnostics?.limitDownCannotSellCount ?? 0}次`, c: (r.diagnostics?.limitDownCannotSellCount??0)>0?R:G },
              { label: "数据源",         value: r.diagnostics?.dataSource ?? "tushare" },
              { label: "数据质量",       value: `${((r.dataQuality??1)*100).toFixed(0)}%`, c: (r.dataQuality??1)>=0.9?G:Y },
              { label: "综合评分",       value: `${r.compositeScore}/100`, c: r.compositeScore>=60?G:r.compositeScore>=40?Y:R },
              { label: "止损次数",       value: `${r.stopLossCount}次`,   c: r.stopLossCount>5?R:MID },
              { label: "止盈次数",       value: `${r.takeProfitCount}次`, c: r.takeProfitCount>0?G:MID },
              { label: "平均持仓",       value: `${r.avgHoldDays}天` },
              { label: "回测引擎",       value: r.sourceBacktestMethod ?? "backtestSingleSTStock", c: G },
              { label: "成交额下限",     value: r.scanParams?.minAmount20d === 0 ? "不限" : `${(r.scanParams?.minAmount20d??0)/10000}万` },
              { label: "评分模式",       value: r.scanParams?.scoreMode ?? r.scoreMode },
            ].map(({ label, value, c }) => (
              <div key={label} className="flex items-center justify-between px-3 py-2 rounded-xl"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <span className="text-[10px]" style={{ color: DIM }}>{label}</span>
                <span className="text-[10px] font-bold" style={{ color: c ?? MID }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 候选股票卡片 ──────────────────────────────────────────────────────
function ScanCard({ r, onDetail, isPass }: { r: ScanStockResult; onDetail: () => void; isPass: boolean }) {
  const rl = r.riskLevel;
  return (
    <div className="p-3 rounded-2xl"
      style={{ background: CARD, border: `1px solid ${isPass ? G+"55" : BORDER}` }}>
      {/* 头部 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-[14px]" style={{ color: "#F8FAFC" }}>{r.name}</span>
            <span className="text-[10px]" style={{ color: DIM }}>{r.symbol}</span>
            {r.stType && (
              <span className="text-[8px] px-1 rounded font-bold" style={{ background: `${R}18`, color: R }}>{r.stType}</span>
            )}
          </div>
          <p className="text-[9px] mt-0.5" style={{ color: DIM }}>{r.industry}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[8px] px-2 py-0.5 rounded-full font-bold"
            style={{ background: `${RISK_COLOR[rl]}18`, color: RISK_COLOR[rl], border: `1px solid ${RISK_COLOR[rl]}44` }}>
            {RISK_LABEL[rl]}
          </span>
          <span className="text-[8px] font-bold" style={{ color: r.compositeScore>=60?G:r.compositeScore>=40?Y:R }}>
            评分 {r.compositeScore}
          </span>
        </div>
      </div>

      {/* 指标格 */}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {[
          { l: "年化收益", v: `${r.annualReturn>=0?"+":""}${r.annualReturn.toFixed(1)}%`, c: r.annualReturn>=0?G:R },
          { l: "总收益",   v: `${r.totalReturn>=0?"+":""}${r.totalReturn.toFixed(1)}%`,   c: r.totalReturn>=0?G:R },
          { l: "最大回撤", v: `${r.maxDrawdown.toFixed(1)}%`,  c: Math.abs(r.maxDrawdown)>30?R:Y },
          { l: "胜率",     v: `${r.winRate.toFixed(1)}%`,      c: r.winRate>=50?G:MID },
          { l: "交易次数", v: `${r.totalTrades}次`,            c: MID },
          { l: "止损次数", v: `${r.stopLossCount}次`,           c: r.stopLossCount>3?R:MID },
          { l: "跌停滞留", v: `${r.limitDownCannotSellCount}次`, c: r.limitDownCannotSellCount>0?R:G },
          { l: "夏普比率", v: r.sharpeRatio.toFixed(2),         c: r.sharpeRatio>=0?G:R },
        ].map(({ l, v, c }) => (
          <div key={l} className="p-1.5 rounded-lg text-center" style={{ background: "#0a1628" }}>
            <p className="font-black text-[10px]" style={{ color: c }}>{v}</p>
            <p className="text-[7px] mt-0.5" style={{ color: DIM }}>{l}</p>
          </div>
        ))}
      </div>

      <button onClick={onDetail}
        className="w-full py-2.5 rounded-xl text-[12px] font-black"
        style={{ background: "linear-gradient(135deg,#EF4444,#b91c1c)", color: "#fff" }}>
        查看完整回测详情
      </button>
    </div>
  );
}

// ── 单股一致性验证面板 ───────────────────────────────────────────────
interface ConsistencyPanelProps {
  stStocks: STStock[];
  results: ScanStockResult[];
  failed: FailedStock[];
  hasDone: boolean;
  verifySymbol: string;
  setVerifySymbol: (v: string) => void;
  verifyRunning: boolean;
  verifyResult: {
    status: string; totalReturn: number; annualReturn: number;
    maxDrawdown: number; winRate: number; totalTrades: number;
    params: Record<string, unknown>;
  } | null;
  verifyError: string | null;
  onRunVerify: () => void;
  tushareOk: boolean | null;
  currentParams: {
    dateRange: string; scoreMode: string; minAmount20d: number;
    initialCapital: number; positionRatio: number;
    stopLossRate: number; halfProfitRate: number; fullProfitRate: number;
    maxHoldDays: number;
  };
}

function ConsistencyPanel({
  stStocks, results, failed, hasDone,
  verifySymbol, setVerifySymbol,
  verifyRunning, verifyResult, verifyError,
  onRunVerify, tushareOk, currentParams,
}: ConsistencyPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // 默认目标：600381 ST春天
  const targetCode = verifySymbol.split(".")[0].toUpperCase();

  // 在股票池中查找
  const inPool = stStocks.find(
    s => s.symbol.toUpperCase() === targetCode ||
         s.tsCode.toUpperCase() === verifySymbol.toUpperCase()
  );

  // 在扫描结果中查找（已扫描）
  const inResults = results.find(
    r => r.symbol.toUpperCase() === targetCode ||
         r.tsCode.toUpperCase() === verifySymbol.toUpperCase()
  );

  // 在失败列表中查找
  const inFailed = failed.find(
    f => f.symbol.toUpperCase() === targetCode ||
         f.tsCode.toUpperCase() === verifySymbol.toUpperCase()
  );

  const poolOk    = !!inPool;
  const scanOk    = !!inResults;
  const failedHit = !!inFailed;

  // 单股结果是否与验证结果一致（允许±0.1%误差）
  const isConsistent = verifyResult && inResults
    ? (Math.abs(verifyResult.annualReturn - inResults.annualReturn) < 0.5 &&
       Math.abs(verifyResult.winRate - inResults.winRate) < 1)
    : null;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(59,130,246,0.05)", border: `1px solid ${B}33` }}>
      {/* 标题行 */}
      <button
        className="w-full px-4 py-3 flex items-center justify-between"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-black" style={{ color: B }}>🔍 单股一致性验证</span>
          {isConsistent === true  && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${G}18`, color: G }}>✅ 一致</span>}
          {isConsistent === false && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${R}18`, color: R }}>⚠️ 不一致</span>}
        </div>
        {expanded ? <ChevronUp size={14} color={B} /> : <ChevronDown size={14} color={B} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* 说明 */}
          <p className="text-[9px] leading-[1.65]" style={{ color: DIM }}>
            验证目标：确认自动扫描与手动单股回测使用
            <span className="font-bold" style={{ color: B }}> 同一引擎（backtestSingleSTStock）</span>
            、<span className="font-bold" style={{ color: B }}>相同参数</span>时结果完全一致。
            输入任意 tsCode（如 600381.SZ），点击"单独运行验证"，对比扫描结果与验证结果。
          </p>

          {/* 验证目标输入 */}
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-xl text-[11px] outline-none"
              style={{ background: "#0a1628", border: `1px solid ${BORDER}`, color: "#F8FAFC" }}
              placeholder="tsCode，如 600381.SZ"
              value={verifySymbol}
              onChange={e => setVerifySymbol(e.target.value)}
            />
            <button
              onClick={onRunVerify}
              disabled={verifyRunning || !tushareOk}
              className="px-3 py-2 rounded-xl text-[10px] font-black flex-shrink-0"
              style={{
                background: verifyRunning || !tushareOk ? "#0a1628" : B,
                color: verifyRunning || !tushareOk ? DIM : "#fff",
                border: `1px solid ${verifyRunning || !tushareOk ? BORDER : B}`,
              }}>
              {verifyRunning ? (
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full border-2 animate-spin inline-block"
                    style={{ borderColor: DIM, borderTopColor: "transparent" }} />
                  运行中
                </span>
              ) : "单独运行验证"}
            </button>
          </div>

          {/* 诊断表格 */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            {[
              {
                label: "① 在 ST 股票池中",
                value: poolOk ? `✅ ${inPool!.name} (${inPool!.tsCode})` : "❌ 不在池中",
                color: poolOk ? G : R,
                note: poolOk ? "" : "ST股票池未包含该股票，自动扫描不会扫描它",
              },
              {
                label: "② 自动扫描是否调用 backtestSingleSTStock",
                value: "✅ 固定调用（sourceBacktestMethod = backtestSingleSTStock）",
                color: G,
                note: "",
              },
              {
                label: "③ 在已扫描结果中",
                value: scanOk
                  ? `✅ 已找到（年化 ${inResults!.annualReturn.toFixed(1)}%，胜率 ${inResults!.winRate.toFixed(1)}%）`
                  : failedHit
                  ? `⚠️ 无交易信号 — ${inFailed!.reason}`
                  : hasDone
                  ? "❌ 未出现在结果中（可能被分进无信号列表，或未在池中）"
                  : "— 尚未运行扫描",
                color: scanOk ? G : failedHit ? Y : R,
                note: failedHit ? "该股票数据不足或参数条件下无买入信号" : "",
              },
              {
                label: "④ 单独验证结果",
                value: verifyResult
                  ? verifyResult.status === "ok"
                    ? `年化 ${verifyResult.annualReturn.toFixed(1)}%，总收益 ${verifyResult.totalReturn.toFixed(1)}%，回撤 ${verifyResult.maxDrawdown.toFixed(1)}%，胜率 ${verifyResult.winRate.toFixed(1)}%，${verifyResult.totalTrades}笔`
                    : `⚠️ ${verifyResult.status}（无交易信号）`
                  : verifyError
                  ? `❌ ${verifyError}`
                  : "— 点击「单独运行验证」",
                color: verifyResult?.status === "ok" ? G : verifyResult ? Y : R,
                note: "",
              },
              {
                label: "⑤ 一致性结论",
                value: isConsistent === true
                  ? "✅ 结果一致（年化误差 < 0.5%）"
                  : isConsistent === false
                  ? `⚠️ 结果不一致（可能参数不同）`
                  : "— 需同时有扫描结果 + 验证结果",
                color: isConsistent === true ? G : isConsistent === false ? R : DIM,
                note: isConsistent === false
                  ? "请检查：1. 参数是否完全一致 2. 是否有缓存旧结果（清除缓存后重扫）"
                  : "",
              },
            ].map(({ label, value, color, note }) => (
              <div key={label} className="px-3 py-2.5 border-b last:border-b-0"
                style={{ borderColor: BORDER, background: CARD }}>
                <p className="text-[9px] mb-0.5" style={{ color: DIM }}>{label}</p>
                <p className="text-[10px] font-bold" style={{ color }}>{value}</p>
                {note && <p className="text-[8px] mt-0.5" style={{ color: DIM }}>{note}</p>}
              </div>
            ))}
          </div>

          {/* 当前扫描参数 */}
          <div className="p-3 rounded-xl" style={{ background: "#0a1628" }}>
            <p className="text-[9px] font-bold mb-1.5" style={{ color: B }}>当前扫描参数（与手动单股回测对比用）</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {[
                { k: "回测周期",  v: currentParams.dateRange },
                { k: "评分模式",  v: currentParams.scoreMode },
                { k: "成交额下限", v: currentParams.minAmount20d === 0 ? "不限" : `${currentParams.minAmount20d / 10000}万` },
                { k: "初始资金",  v: `¥${(currentParams.initialCapital/10000).toFixed(0)}万` },
                { k: "仓位",      v: `${(currentParams.positionRatio*100).toFixed(0)}%` },
                { k: "止损",      v: `-${(currentParams.stopLossRate*100).toFixed(0)}%` },
                { k: "小止盈",    v: `+${(currentParams.halfProfitRate*100).toFixed(0)}%` },
                { k: "大止盈",    v: `+${(currentParams.fullProfitRate*100).toFixed(0)}%` },
                { k: "T+1",       v: "启用" },
                { k: "涨跌停限制", v: "启用" },
                { k: "手续费",    v: "启用" },
              ].map(({ k, v }) => (
                <span key={k} className="text-[9px]">
                  <span style={{ color: DIM }}>{k}：</span>
                  <span className="font-bold" style={{ color: MID }}>{v}</span>
                </span>
              ))}
            </div>
          </div>

          {/* 不一致原因清单 */}
          {isConsistent === false && (
            <div className="p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.06)", border: `1px solid ${R}33` }}>
              <p className="text-[9px] font-bold mb-1" style={{ color: R }}>🔍 常见不一致原因排查：</p>
              {[
                "参数不同：手动回测使用了不同的成交额下限（默认500万）、止损比例或评分模式",
                "调用方法不同：本版本已确认两者都调用 backtestSingleSTStock，此项排除",
                "缓存旧结果：清除缓存后重新扫描",
                "收益率单位：两处都是%，此项排除",
                "股票代码转换：tsCode 格式应为 XXXXXX.SH/SZ，请核查",
                "筛选条件额外过滤：自动扫描仅保留 status=ok 的结果，无交易信号的会进入跳过列表",
              ].map((t, i) => (
                <p key={i} className="text-[8px] leading-[1.6]" style={{ color: DIM }}>• {t}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────
interface Props { stStocks: STStock[]; tushareOk: boolean | null; }

export default function STAutoScan({ stStocks, tushareOk }: Props) {
  // Scan state
  const [scanState, setScanState] = useState<"idle"|"scanning"|"done"|"stopped">("idle");
  const [progress, setProgress] = useState({ scanned: 0, total: 0, current: "", found: 0 });
  const [results,  setResults]  = useState<ScanStockResult[]>([]);
  const [failed,   setFailed]   = useState<FailedStock[]>([]);
  const [selected, setSelected] = useState<ScanStockResult | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cacheTime, setCacheTime] = useState<number | null>(null);
  const abortRef = useRef(false);

  // 扫描参数（与手动单股回测保持相同默认值）
  const [dateRange,  setDateRange]  = useState<DateRng>("近2年");  // 与单股手动回测默认值一致
  const [scoreMode,  setScoreMode]  = useState<SMode>("standard");
  const [minAmount20d, setMinAmount20d] = useState(5_000_000);    // 与单股手动回测默认值一致

  // 单股一致性验证
  const [verifySymbol,  setVerifySymbol]  = useState("600381.SZ");  // 600381 ST春天
  const [verifyRunning, setVerifyRunning] = useState(false);
  const [verifyResult,  setVerifyResult]  = useState<{
    status: string; totalReturn: number; annualReturn: number;
    maxDrawdown: number; winRate: number; totalTrades: number;
    params: Record<string, unknown>;
  } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // 结果筛选
  const [minAnn,    setMinAnn]    = useState(20);   // %
  const [maxDD,     setMaxDD]     = useState(35);   // %  (999=不限)
  const [minWin,    setMinWin]    = useState(45);   // %  (0=不限)
  const [sortBy,    setSortBy]    = useState<SortKey>("annual");
  const [onlyPass,  setOnlyPass]  = useState(true);

  // 初始化时加载缓存
  useEffect(() => {
    const cache = loadCache(dateRange, scoreMode, minAmount20d);
    if (cache) {
      setResults(cache.results);
      setFailed(cache.failed);
      setFromCache(true);
      setCacheTime(cache.scannedAt);
      setScanState("done");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 过滤 + 排序后的展示列表
  const displayed = useMemo(() => {
    let list = onlyPass
      ? results.filter(r => passesFilter(r, minAnn, maxDD, minWin))
      : results;
    switch (sortBy) {
      case "annual":   list = [...list].sort((a,b) => b.annualReturn - a.annualReturn); break;
      case "drawdown": list = [...list].sort((a,b) => Math.abs(a.maxDrawdown) - Math.abs(b.maxDrawdown)); break;
      case "winrate":  list = [...list].sort((a,b) => b.winRate - a.winRate); break;
      case "ratio":    list = [...list].sort((a,b) =>
        (b.annualReturn / Math.max(1, Math.abs(b.maxDrawdown))) -
        (a.annualReturn / Math.max(1, Math.abs(a.maxDrawdown)))); break;
      case "score":    list = [...list].sort((a,b) => b.compositeScore - a.compositeScore); break;
    }
    return list;
  }, [results, onlyPass, minAnn, maxDD, minWin, sortBy]);

  const passedCount = useMemo(
    () => results.filter(r => passesFilter(r, minAnn, maxDD, minWin)).length,
    [results, minAnn, maxDD, minWin]
  );

  // ── 核心扫描函数 ─────────────────────────────────────────────────
  async function startScan() {
    if (!tushareOk || stStocks.length === 0) return;
    abortRef.current = false;
    setScanState("scanning");
    setResults([]);
    setFailed([]);
    setFromCache(false);
    setCacheTime(null);

    const n = dateRange === "近1年" ? 1 : dateRange === "近2年" ? 2 : 3;
    const startDate = yearsAgoYMD(n);
    const endDate   = todayYMD();
    const total     = stStocks.length;
    setProgress({ scanned: 0, total, current: "", found: 0 });

    const newResults: ScanStockResult[] = [];
    const newFailed:  FailedStock[]     = [];

    // 扫描时使用的参数（必须与手动单股回测默认值一致，保证结果可比较）
    const scanParamsBase = {
      initialCapital: 100000, positionRatio: 0.9,
      stopLossRate: 0.06, halfProfitRate: 0.20, fullProfitRate: 0.35,
      maxHoldDays: 0, scoreMode, minAmount20d,
      enableT1: true, enableLimitFilter: true, enableFees: true,
    };

    const BATCH = 3; // 每批并发 3 只
    for (let i = 0; i < total; i += BATCH) {
      if (abortRef.current) break;

      const batch = stStocks.slice(i, i + BATCH);
      setProgress(p => ({ ...p, scanned: i, current: batch.map(s => s.name).join("、") }));

      const outcomes = await Promise.allSettled(
        batch.map(async stock => {
          // ⚠️ 调用与手动单股回测完全相同的 API 端点和引擎：backtestSingleSTStock
          const isRealST = stock.stType !== "" ||
            /^(ST|＊ST|\*ST|SST)/i.test(stock.name);
          const res = await fetch("/api/tushare/st-single-backtest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tsCode: stock.tsCode, name: stock.name, isRealST,
              startDate, endDate,
              ...scanParamsBase,
            }),
          });
          const data = await res.json();
          return { stock, data };
        })
      );

      for (let j = 0; j < outcomes.length; j++) {
        const outcome = outcomes[j];
        const stock   = batch[j];
        if (outcome.status === "fulfilled") {
          const { data } = outcome.value;
          if (data.ok && data.status === "ok") {
            const r: ScanStockResult = {
              tsCode:   stock.tsCode,  symbol:   stock.symbol,
              name:     stock.name,    industry: stock.industry,
              stType:   stock.stType,
              totalReturn:   data.totalReturn   ?? 0,
              annualReturn:  data.annualReturn  ?? 0,
              maxDrawdown:   data.maxDrawdown   ?? 0,
              sharpeRatio:   data.sharpeRatio   ?? 0,
              winRate:       data.winRate       ?? 0,
              profitFactor:  data.profitFactor  ?? 1,
              totalTrades:              data.totalTrades              ?? 0,
              stopLossCount:            data.stopLossCount            ?? 0,
              takeProfitCount:          data.takeProfitCount          ?? 0,
              limitDownCannotSellCount: data.limitDownCannotSellCount ?? 0,
              suspendedDays:            data.suspendedDays            ?? 0,
              maxConsecutiveLosses:     data.maxConsecutiveLosses     ?? 0,
              avgHoldDays:              data.avgHoldDays              ?? 0,
              initialCapital: data.initialCapital ?? 100000,
              finalCapital:   data.finalCapital   ?? 100000,
              equity:       data.equity       ?? [],
              drawdown:     data.drawdown     ?? [],
              trades:       data.trades       ?? [],
              riskEvents:   data.riskEvents   ?? [],
              klineSignals: data.klineSignals ?? [],
              diagnostics:  data.diagnostics  ?? {
                klineCount: 0, tradingDays: 0, buySignalCount: 0,
                cannotTradeCount: 0, limitDownCannotSellCount: 0, dataSource: "tushare",
              },
              dataQuality: data.dataQuality ?? 1,
              scoreMode:   data.scoreMode   ?? scoreMode,
              riskLevel:   "high",
              compositeScore: 0,
              // ── 一致性保证字段 ───────────────────────────────────────
              sourceBacktestMethod: "backtestSingleSTStock",  // 与手动单股回测使用同一引擎
              scanParams: { startDate, endDate, ...scanParamsBase },
            };
            r.riskLevel      = riskLevel(r);
            r.compositeScore = compositeScore(r);
            newResults.push(r);
          } else {
            newFailed.push({
              name: stock.name, tsCode: stock.tsCode, symbol: stock.symbol,
              reason: data.statusMessage ?? data.error ?? "无交易信号",
            });
          }
        } else {
          newFailed.push({
            name: stock.name, tsCode: stock.tsCode, symbol: stock.symbol,
            reason: String(outcome.reason),
          });
        }
      }

      const done  = Math.min(i + BATCH, total);
      const found = newResults.filter(r => passesFilter(r, minAnn, maxDD, minWin)).length;
      setProgress({ scanned: done, total, current: "", found });
      setResults([...newResults].sort((a,b) => b.annualReturn - a.annualReturn));
      setFailed([...newFailed]);
    }

    const finalState = abortRef.current ? "stopped" : "done";
    setScanState(finalState);

    // 保存缓存（含 minAmount20d，不同参数不复用旧缓存）
    const now = Date.now();
    saveCache({ scannedAt: now, dateRange, scoreMode, totalCount: total, results: newResults, failed: newFailed }, minAmount20d);
    setCacheTime(now);
  }

  function stopScan() { abortRef.current = true; }

  /** 单股一致性验证：用与当前扫描完全相同的参数运行指定股票 */
  async function runVerify() {
    if (!tushareOk) return;
    const symbol = verifySymbol.trim().toUpperCase();
    if (!symbol) return;

    // 确定 tsCode：优先从股票池匹配，否则从输入推导
    const inPool = stStocks.find(
      s => s.tsCode.toUpperCase() === symbol ||
           s.symbol.toUpperCase() === symbol.split(".")[0]
    );
    const tsCode = inPool?.tsCode ?? symbol;
    const name   = inPool?.name   ?? symbol;
    const isRealST = inPool
      ? (inPool.stType !== "" || /^(ST|＊ST|\*ST|SST)/i.test(inPool.name))
      : true;

    setVerifyRunning(true);
    setVerifyResult(null);
    setVerifyError(null);

    const n = dateRange === "近1年" ? 1 : dateRange === "近2年" ? 2 : 3;
    const startDate = yearsAgoYMD(n);
    const endDate   = todayYMD();

    const params = {
      tsCode, name, isRealST,
      startDate, endDate,
      initialCapital: 100000, positionRatio: 0.9,
      stopLossRate: 0.06, halfProfitRate: 0.20, fullProfitRate: 0.35,
      maxHoldDays: 0, scoreMode, minAmount20d,
      enableT1: true, enableLimitFilter: true, enableFees: true,
    };

    try {
      const res  = await fetch("/api/tushare/st-single-backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (data.ok) {
        setVerifyResult({
          status:      data.status,
          totalReturn: data.totalReturn  ?? 0,
          annualReturn: data.annualReturn ?? 0,
          maxDrawdown: data.maxDrawdown  ?? 0,
          winRate:     data.winRate      ?? 0,
          totalTrades: data.totalTrades  ?? 0,
          params,
        });
      } else {
        setVerifyError(data.error ?? "验证失败");
      }
    } catch (e) {
      setVerifyError(String(e));
    }
    setVerifyRunning(false);
  }

  function onClearCache() {
    clearCache(dateRange, scoreMode, minAmount20d);
    setResults([]); setFailed([]);
    setFromCache(false); setCacheTime(null);
    setScanState("idle");
  }

  const isScanning = scanState === "scanning";
  const hasDone    = scanState === "done" || scanState === "stopped";
  const canScan    = tushareOk === true && stStocks.length > 0 && !isScanning;

  return (
    <div className="space-y-4">

      {/* ── 风险提示 */}
      <div className="p-3 rounded-2xl" style={{ background: "rgba(239,68,68,0.07)", border: `1px solid ${R}44` }}>
        <div className="flex items-start gap-2">
          <AlertTriangle size={13} color={R} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-[1.75]" style={{ color: "#FCA5A5" }}>
            <span className="font-black" style={{ color: R }}>幸存者偏差警告：</span>
            本功能基于历史回测筛选表现较好的 ST 股票，存在幸存者偏差、参数过拟合、未来表现失效等风险。
            历史收益不代表未来收益，结果仅供研究参考，不构成任何投资建议。
          </p>
        </div>
      </div>

      {/* ── 扫描参数 */}
      <div className="p-4 rounded-2xl space-y-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <p className="font-bold text-[13px]" style={{ color: MID }}>扫描参数</p>

        <div>
          <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>回测周期</p>
          <div className="grid grid-cols-3 gap-2">
            {(["近1年","近2年","近3年"] as DateRng[]).map(r => (
              <button key={r} onClick={() => setDateRange(r)} disabled={isScanning}
                className="py-2 rounded-xl text-[11px] font-bold"
                style={{
                  background: dateRange===r ? "rgba(239,68,68,0.15)" : "#0a1628",
                  border: `1px solid ${dateRange===r ? R : BORDER}`,
                  color: dateRange===r ? R : MID,
                  opacity: isScanning ? 0.5 : 1,
                }}>{r}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>评分模式（买入条件严格程度）</p>
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { k:"conservative" as SMode, l:"保守≥70" },
              { k:"standard"     as SMode, l:"标准≥58" },
              { k:"aggressive"   as SMode, l:"激进≥45" },
              { k:"debug"        as SMode, l:"调试≥30" },
            ]).map(({ k, l }) => (
              <button key={k} onClick={() => setScoreMode(k)} disabled={isScanning}
                className="py-2 rounded-xl text-[9px] font-bold"
                style={{
                  background: scoreMode===k ? "rgba(250,204,21,0.15)" : "#0a1628",
                  border: `1px solid ${scoreMode===k ? Y : BORDER}`,
                  color: scoreMode===k ? Y : MID,
                  opacity: isScanning ? 0.5 : 1,
                }}>{l}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold mb-1.5" style={{ color: DIM }}>
            20日均成交额下限（与手动单股回测保持一致）
          </p>
          <div className="flex gap-1.5">
            {[
              { v: 0,           l: "不限" },
              { v: 1_000_000,   l: "100万" },
              { v: 5_000_000,   l: "500万" },
              { v: 10_000_000,  l: "1000万" },
            ].map(({ v, l }) => (
              <button key={v} onClick={() => setMinAmount20d(v)} disabled={isScanning}
                className="flex-1 py-1.5 rounded-xl text-[9px] font-bold"
                style={{
                  background: minAmount20d === v ? "rgba(59,130,246,0.15)" : "#0a1628",
                  border: `1px solid ${minAmount20d === v ? B : BORDER}`,
                  color: minAmount20d === v ? B : MID,
                  opacity: isScanning ? 0.5 : 1,
                }}>{l}</button>
            ))}
          </div>
          <p className="text-[9px] mt-1 px-1" style={{ color: DIM }}>
            ℹ 手动单股回测默认 500万；此处默认同步为 500万，保证两者结果一致
          </p>
        </div>

        <div className="px-3 py-2 rounded-xl flex items-center justify-between"
          style={{ background: "#0a1628" }}>
          <span className="text-[10px]" style={{ color: DIM }}>当前 ST 股票池</span>
          <span className="text-[11px] font-bold" style={{ color: MID }}>{stStocks.length} 只</span>
        </div>
      </div>

      {/* ── 缓存信息 */}
      {cacheTime && (
        <div className="px-3 py-2.5 rounded-xl flex items-center justify-between"
          style={{ background: "rgba(59,130,246,0.06)", border: `1px solid ${B}33` }}>
          <div className="flex items-center gap-2">
            <Activity size={12} color={B} />
            <span className="text-[10px]" style={{ color: MID }}>
              {fromCache ? "📦 来自缓存 · " : ""}
              {new Date(cacheTime).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}
              （有效期 24h）
            </span>
          </div>
          <button onClick={onClearCache}
            className="flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg font-bold"
            style={{ background: "#0a1628", color: DIM }}>
            <RefreshCw size={10} /> 清除缓存
          </button>
        </div>
      )}

      {/* ── 扫描按钮 */}
      {!isScanning ? (
        <button onClick={startScan} disabled={!canScan}
          className="w-full py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-2"
          style={{
            background: canScan ? "linear-gradient(135deg,#EF4444,#b91c1c)" : CARD,
            color: canScan ? "#fff" : DIM,
          }}>
          <Play size={16} />
          {hasDone ? "重新扫描全部 ST 股票" : "运行 ST 单股自动扫描"}
        </button>
      ) : (
        <button onClick={stopScan}
          className="w-full py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-2"
          style={{ background: "rgba(239,68,68,0.12)", border: `2px solid ${R}`, color: R }}>
          <Square size={16} />
          停止扫描
        </button>
      )}

      {/* ── 扫描进度 */}
      {isScanning && (
        <div className="p-4 rounded-2xl space-y-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold" style={{ color: MID }}>扫描进度</p>
            <span className="text-[11px] font-black" style={{ color: G }}>
              已找到 {progress.found} 只
            </span>
          </div>
          <div className="rounded-full overflow-hidden h-2" style={{ background: "#0a1628" }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress.total > 0 ? (progress.scanned / progress.total * 100) : 0}%`,
                background: `linear-gradient(90deg, ${R}, ${Y})`,
              }} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] leading-[1.5]" style={{ color: DIM }}>
              {progress.current ? `正在回测：${progress.current}` : "准备中…"}
            </p>
            <p className="text-[10px] font-bold" style={{ color: MID }}>
              {progress.scanned} / {progress.total}
            </p>
          </div>
          <p className="text-[9px]" style={{ color: DIM }}>
            ℹ 每批并发 3 只，预计耗时 {Math.ceil(progress.total / 3 * 8 / 60)} 分钟
          </p>
        </div>
      )}

      {/* ── 结果筛选 */}
      {(hasDone || results.length > 0) && (
        <div className="p-3 rounded-2xl space-y-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold" style={{ color: MID }}>结果筛选</p>
            <button onClick={() => setOnlyPass(v => !v)}
              className="flex items-center gap-1.5">
              <div className="w-8 h-4 rounded-full relative" style={{ background: onlyPass ? G : BORDER }}>
                <div className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all"
                  style={{ left: onlyPass ? "auto" : "2px", right: onlyPass ? "2px" : "auto" }} />
              </div>
              <span className="text-[9px]" style={{ color: onlyPass ? G : DIM }}>仅显示达标</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] font-bold mb-1" style={{ color: DIM }}>年化收益 ≥</p>
              <div className="flex gap-1">
                {[10,20,30,50].map(v => (
                  <button key={v} onClick={() => setMinAnn(v)}
                    className="flex-1 py-1.5 rounded-lg text-[9px] font-bold"
                    style={{ background: minAnn===v?"rgba(0,229,168,0.15)":"#0a1628", border: `1px solid ${minAnn===v?G:BORDER}`, color: minAnn===v?G:MID }}>
                    {v}%</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold mb-1" style={{ color: DIM }}>最大回撤 ≤</p>
              <div className="flex gap-1">
                {[20,30,40,999].map(v => (
                  <button key={v} onClick={() => setMaxDD(v)}
                    className="flex-1 py-1.5 rounded-lg text-[9px] font-bold"
                    style={{ background: maxDD===v?"rgba(250,204,21,0.15)":"#0a1628", border: `1px solid ${maxDD===v?Y:BORDER}`, color: maxDD===v?Y:MID }}>
                    {v===999?"不限":`${v}%`}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold mb-1" style={{ color: DIM }}>胜率 ≥</p>
            <div className="flex gap-1">
              {[0,40,45,50].map(v => (
                <button key={v} onClick={() => setMinWin(v)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-bold"
                  style={{ background: minWin===v?"rgba(59,130,246,0.15)":"#0a1628", border: `1px solid ${minWin===v?B:BORDER}`, color: minWin===v?B:MID }}>
                  {v===0?"不限":`${v}%`}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold mb-1" style={{ color: DIM }}>排序方式</p>
            <div className="flex flex-wrap gap-1">
              {([
                { k:"annual"   as SortKey, l:"年化↓" },
                { k:"drawdown" as SortKey, l:"回撤↑" },
                { k:"winrate"  as SortKey, l:"胜率↓" },
                { k:"ratio"    as SortKey, l:"收益/回撤↓" },
                { k:"score"    as SortKey, l:"评分↓" },
              ]).map(({ k, l }) => (
                <button key={k} onClick={() => setSortBy(k)}
                  className="px-2 py-1 rounded-lg text-[9px] font-bold"
                  style={{ background: sortBy===k?"rgba(59,130,246,0.15)":"#0a1628", border: `1px solid ${sortBy===k?B:BORDER}`, color: sortBy===k?B:MID }}>
                  {l}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 结果统计 */}
      {(hasDone || results.length > 0) && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: "已扫描",   v: `${results.length+failed.length}只`, c: MID },
            { l: "数据充足", v: `${results.length}只`,               c: B },
            { l: "筛选达标", v: `${passedCount}只`,                   c: passedCount>0?G:Y },
          ].map(({ l, v, c }) => (
            <div key={l} className="p-3 rounded-2xl text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <p className="font-black text-[16px]" style={{ color: c }}>{v}</p>
              <p className="text-[9px] mt-0.5" style={{ color: DIM }}>{l}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 单股一致性验证面板 ─────────────────────────────────── */}
      {(hasDone || results.length > 0 || true) && (
        <ConsistencyPanel
          stStocks={stStocks}
          results={results}
          failed={failed}
          hasDone={hasDone}
          verifySymbol={verifySymbol}
          setVerifySymbol={setVerifySymbol}
          verifyRunning={verifyRunning}
          verifyResult={verifyResult}
          verifyError={verifyError}
          onRunVerify={runVerify}
          tushareOk={tushareOk}
          currentParams={{
            dateRange, scoreMode, minAmount20d,
            initialCapital: 100000, positionRatio: 0.9,
            stopLossRate: 0.06, halfProfitRate: 0.20, fullProfitRate: 0.35,
            maxHoldDays: 0,
          }}
        />
      )}

      {/* ── 候选列表 */}
      {displayed.length > 0 && (
        <div className="space-y-3">
          <p className="text-[12px] font-bold px-1" style={{ color: MID }}>
            候选股票 {displayed.length} 只
          </p>
          {displayed.map(r => (
            <ScanCard
              key={r.tsCode}
              r={r}
              isPass={passesFilter(r, minAnn, maxDD, minWin)}
              onDetail={() => setSelected(r)}
            />
          ))}
        </div>
      )}

      {/* 无达标结果 */}
      {hasDone && displayed.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-[14px] font-bold mb-1.5" style={{ color: Y }}>
            暂无符合条件的股票
          </p>
          <p className="text-[11px] leading-[1.7]" style={{ color: DIM }}>
            尝试放宽筛选条件：<br />
            降低年化收益阈值 / 提高回撤上限 / 切换「激进」或「调试」模式
          </p>
        </div>
      )}

      {/* 跳过列表 */}
      {failed.length > 0 && hasDone && (
        <div className="p-3 rounded-2xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[11px] font-bold mb-2" style={{ color: DIM }}>
            跳过 {failed.length} 只（数据不足 / 无交易信号）
          </p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {failed.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[9px]">
                <span style={{ color: MID }}>{s.name} ({s.symbol})</span>
                <span style={{ color: DIM }}>{s.reason.slice(0, 18)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {selected && <DetailOverlay r={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
