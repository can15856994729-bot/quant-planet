"use client";
import { useState, useMemo, useEffect } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
  AreaChart, Area,
} from "recharts";
import { generateIntraday } from "@/lib/mock-data";
import { CHART, TT_STYLE, TT_LABEL_STYLE } from "@/lib/chartConstants";
import type { Market } from "@/types";

// ── 周期定义 ────────────────────────────────────────────────────
const PERIODS = ["分时", "1日", "5日", "10日", "1月", "3月", "半年", "1年", "全部"] as const;
type Period = typeof PERIODS[number];

const INTRADAY_PERIODS: Period[] = ["分时"];
const DAY1_PERIOD:  Period  = "1日";
const INDICATORS_LIST = ["MA", "MACD", "RSI", "KDJ", "布林带"];

const PERIOD_TITLE: Record<Period, string> = {
  "分时": "分时走势", "1日": "今日5分K",
  "5日": "5日K线",   "10日": "10日K线",
  "1月": "1月K线",   "3月": "3月K线",
  "半年": "半年K线", "1年": "年K线",
  "全部": "全部K线",
};

// 周期 → 需要向前查询的天数（宽松，确保覆盖足够交易日）
function periodToDaysBack(p: Period): number {
  const map: Partial<Record<Period, number>> = {
    "5日": 10, "10日": 18, "1月": 40,
    "3月": 100, "半年": 200, "1年": 400, "全部": 3650,
  };
  return map[p] ?? 0;
}

// 股票代码 → Tushare ts_code
function symbolToTsCode(sym: string): string {
  if (sym.startsWith("6")) return `${sym}.SH`;
  if (sym.startsWith("0") || sym.startsWith("3")) return `${sym}.SZ`;
  if (sym.startsWith("8") || sym.startsWith("4")) return `${sym}.BJ`;
  return `${sym}.SH`;
}

// ── K线数据类型 ───────────────────────────────────────────────────
interface KLineRaw {
  date:   string;   // "2024-01-15"
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

// Tushare /api/tushare/daily 返回格式
interface TushareBar {
  date:   string;   // "20240115"
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
  amount: number;
  pctChg: number;
  adjusted: boolean;
}

// ── 技术指标计算 ────────────────────────────────────────────────
function ema(data: number[], n: number) {
  const k = 2 / (n + 1);
  return data.reduce<number[]>((acc, v, i) => {
    acc.push(i === 0 ? v : v * k + acc[i - 1] * (1 - k));
    return acc;
  }, []);
}
function rsi(closes: number[], n = 14) {
  return closes.map((_, i) => {
    if (i < n) return 50;
    let g = 0, l = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = closes[j] - closes[j - 1];
      d > 0 ? (g += d) : (l -= d);
    }
    return l === 0 ? 100 : +(100 - 100 / (1 + g / n / (l / n))).toFixed(2);
  });
}
function kdj(klines: { high: number; low: number; close: number }[], n = 9) {
  const K: number[] = [], D: number[] = [], J: number[] = [];
  klines.forEach((b, i) => {
    const sl = klines.slice(Math.max(0, i - n + 1), i + 1);
    const hn = Math.max(...sl.map(s => s.high));
    const ln = Math.min(...sl.map(s => s.low));
    const rsv = hn === ln ? 50 : (b.close - ln) / (hn - ln) * 100;
    const kv = i === 0 ? rsv : rsv / 3 + K[i - 1] * 2 / 3;
    const dv = i === 0 ? kv  : kv  / 3 + D[i - 1] * 2 / 3;
    K.push(+kv.toFixed(2)); D.push(+dv.toFixed(2)); J.push(+(3 * kv - 2 * dv).toFixed(2));
  });
  return { K, D, J };
}

interface CandleEntry {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
  isUp:   boolean;
  ma5?: number; ma10?: number; ma20?: number; ma60?: number;
  dif?: number; dea?: number; macd?: number;
  rsi?: number;
  K?: number; D?: number; J?: number;
  bollUpper?: number; bollMid?: number; bollLower?: number;
}

// ── 自定义蜡烛图 Shape ────────────────────────────────────────────
function makeCandleShape(minP: number) {
  // eslint-disable-next-line react/display-name
  return function CandleShape(props: {
    x?: number; y?: number; width?: number; height?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any;
  }) {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props;
    if (!payload || height <= 0 || width <= 0) return null;
    const { open, high, low, close, isUp } = payload as CandleEntry;
    const color = isUp ? CHART.UP : CHART.DOWN;
    const scale = height / Math.max(high - minP, 0.001);
    const toY   = (p: number) => y + (high - p) * scale;
    const highY  = y;
    const lowY   = toY(low);
    const topY   = toY(Math.max(open, close));
    const botY   = toY(Math.min(open, close));
    const bodyH  = Math.max(botY - topY, 1);
    const cx = x + width / 2;
    const bw = Math.max(width * 0.68, 1.5);
    return (
      <g>
        <line x1={cx} y1={highY} x2={cx} y2={lowY} stroke={color} strokeWidth={1} />
        <rect x={cx - bw / 2} y={topY} width={bw} height={bodyH} fill={color} />
      </g>
    );
  };
}

interface Props { symbol: string; market: Market; initialPrice?: number; }

export default function StockDetailClient({ symbol, market, initialPrice }: Props) {
  const [period,     setPeriod]     = useState<Period>("3月");
  const [indicators, setIndicators] = useState<string[]>(["MA"]);

  // ── Tushare K线数据状态 ───────────────────────────────────────
  const [rawKlines,    setRawKlines]    = useState<KLineRaw[] | null>(null);
  const [klineLoading, setKlineLoading] = useState(false);
  const [klineSource,  setKlineSource]  = useState<"tushare" | "mock" | "loading">("mock");

  const basePrice  = initialPrice ?? (market === "A" ? 1680 : market === "HK" ? 320 : 185);
  const isIntraday = INTRADAY_PERIODS.includes(period);
  const isDay1     = period === DAY1_PERIOD;

  // 每次 symbol/market/period 变化时，为 A股 非分时周期拉取 Tushare 数据
  useEffect(() => {
    const isNonIntraday = !INTRADAY_PERIODS.includes(period) && period !== "1日";
    if (market !== "A" || !isNonIntraday) {
      setRawKlines(null);
      setKlineSource("mock");
      return;
    }

    const daysBack = periodToDaysBack(period);
    if (!daysBack) { setKlineSource("mock"); return; }

    const tsCode   = symbolToTsCode(symbol);
    const endDate  = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const startDate = new Date(Date.now() - daysBack * 86_400_000)
      .toISOString().slice(0, 10).replace(/-/g, "");

    setKlineLoading(true);
    setKlineSource("loading");
    setRawKlines(null);

    fetch(`/api/tushare/daily?tsCode=${tsCode}&startDate=${startDate}&endDate=${endDate}&adj=qfq`)
      .then(r => r.json())
      .then((d: { ok: boolean; bars?: TushareBar[] }) => {
        if (d.ok && d.bars && d.bars.length > 0) {
          setRawKlines(d.bars.map(b => ({
            date:   `${b.date.slice(0, 4)}-${b.date.slice(4, 6)}-${b.date.slice(6, 8)}`,
            open:   b.open,
            high:   b.high,
            low:    b.low,
            close:  b.close,
            volume: b.volume,
          })));
          setKlineSource("tushare");
        } else {
          setKlineSource("mock");
        }
      })
      .catch(() => setKlineSource("mock"))
      .finally(() => setKlineLoading(false));
  }, [symbol, market, period]);

  // ── 分时数据（分时 + 1日） ────────────────────────────────────
  const { points: intradayPoints, prevClose } = useMemo(
    () => generateIntraday(basePrice),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [basePrice, period]
  );
  const KEY_TIMES = new Set(["09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00"]);

  // ── "1日" 今日5分K ─────────────────────────────────────────
  const intraday5min: CandleEntry[] = useMemo(() => {
    if (!isDay1) return [];
    const candles: CandleEntry[] = [];
    for (let i = 0; i < intradayPoints.length; i += 5) {
      const sl = intradayPoints.slice(i, i + 5);
      if (!sl.length) continue;
      const open  = sl[0].price;
      const close = sl[sl.length - 1].price;
      const high  = Math.max(...sl.map(p => p.price));
      const low   = Math.min(...sl.map(p => p.price));
      candles.push({
        date: sl[0].time, open, high, low, close,
        volume: sl.reduce((s, p) => s + p.volume, 0),
        isUp: close >= open,
      });
    }
    return candles;
  }, [isDay1, intradayPoints]);

  // ── 日K：Tushare 或 mock 数据 ────────────────────────────────
  const days = period === "5日" ? 5 : period === "10日" ? 10 :
               period === "1月" ? 30 : period === "3月" ? 90 :
               period === "半年" ? 180 : period === "1年" ? 365 : 730;

  // klines: 优先 Tushare，降级 mock（HK/US/分时 始终使用 mock）
  const klines: KLineRaw[] = useMemo(() => {
    if (rawKlines && rawKlines.length > 0) return rawKlines;
    // 生成参考数据（HK/US/分时 或 Tushare 获取失败时）
    const mockBars: KLineRaw[] = [];
    const seed = basePrice;
    let price = seed;
    const n = days + 10;
    for (let i = 0; i < n; i++) {
      const change = price * (Math.random() * 0.04 - 0.02);
      const open   = price;
      const close  = Math.max(0.01, price + change);
      const high   = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low    = Math.min(open, close) * (1 - Math.random() * 0.01);
      const d = new Date(Date.now() - (n - i) * 86_400_000);
      mockBars.push({
        date:   d.toISOString().slice(0, 10),
        open:   +open.toFixed(2),
        high:   +high.toFixed(2),
        low:    +low.toFixed(2),
        close:  +close.toFixed(2),
        volume: Math.round(100000 + Math.random() * 500000),
      });
      price = close;
    }
    return mockBars.slice(-days);
  }, [rawKlines, basePrice, days]);

  // ── 技术指标 ─────────────────────────────────────────────────
  const closes  = klines.map(k => k.close);
  const e5  = ema(closes, 5),  e10 = ema(closes, 10);
  const e20 = ema(closes, 20), e60 = ema(closes, 60);
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const dif  = e12.map((v, i) => +(v - e26[i]).toFixed(3));
  const dea  = ema(dif, 9).map(v => +v.toFixed(3));
  const macdH = dif.map((v, i) => +(2 * (v - dea[i])).toFixed(3));
  const rsiArr = rsi(closes);
  const { K, D, J } = kdj(klines);
  const bollArr = closes.map((_, i) => {
    const sl  = closes.slice(Math.max(0, i - 19), i + 1);
    const avg = sl.reduce((a, b) => a + b, 0) / sl.length;
    const std = Math.sqrt(sl.reduce((a, b) => a + (b - avg) ** 2, 0) / sl.length);
    return { upper: +(avg + 2 * std).toFixed(2), mid: +avg.toFixed(2), lower: +(avg - 2 * std).toFixed(2) };
  });

  const candleData: CandleEntry[] = useMemo(() =>
    klines.map((k, i) => {
      const open = k.open ?? (i > 0 ? klines[i - 1].close : k.close * 0.998);
      return {
        date: k.date, open, high: k.high, low: k.low, close: k.close, volume: k.volume,
        isUp: k.close >= open,
        ma5: +e5[i].toFixed(2), ma10: +e10[i].toFixed(2),
        ma20: +e20[i].toFixed(2), ma60: +e60[i].toFixed(2),
        dif: dif[i], dea: dea[i], macd: macdH[i],
        rsi: rsiArr[i], K: K[i], D: D[i], J: J[i],
        bollUpper: bollArr[i].upper, bollMid: bollArr[i].mid, bollLower: bollArr[i].lower,
      };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [klines]);

  const allH = candleData.map(k => k.high);
  const allL = candleData.map(k => k.low);
  const minP = (allL.length ? Math.min(...allL) : basePrice * 0.9) * 0.998;
  const maxP = (allH.length ? Math.max(...allH) : basePrice * 1.1) * 1.002;

  const day1H = intraday5min.map(k => k.high);
  const day1L = intraday5min.map(k => k.low);
  const minP1 = (day1L.length ? Math.min(...day1L) : basePrice * 0.97) * 0.998;
  const maxP1 = (day1H.length ? Math.max(...day1H) : basePrice * 1.03) * 1.002;

  const lastIntraday  = intradayPoints[intradayPoints.length - 1]?.price ?? basePrice;
  const intradayUp    = lastIntraday >= prevClose;
  const intradayColor = intradayUp ? CHART.INTRADAY_UP : CHART.INTRADAY_DOWN;
  const intradayMin   = Math.min(...intradayPoints.map(p => p.price), prevClose) * 0.999;
  const intradayMax   = Math.max(...intradayPoints.map(p => p.price), prevClose) * 1.001;

  const CandleShapeK  = useMemo(() => makeCandleShape(minP),  [minP]);
  const CandleShape1d = useMemo(() => makeCandleShape(minP1), [minP1]);

  const barSz  = Math.max(2, Math.min(14, Math.floor(340 / Math.max(candleData.length,  1))));
  const barSz1 = Math.max(3, Math.min(14, Math.floor(340 / Math.max(intraday5min.length, 1))));

  function toggleInd(ind: string) {
    setIndicators(prev => prev.includes(ind) ? prev.filter(x => x !== ind) : [...prev, ind]);
  }

  // 数据来源注释
  const dataSourceNote = (() => {
    if (isIntraday) return "分时数据为示例；实时行情来自东方财富";
    if (isDay1)     return "⚠️ 今日5分钟K线为示例数据（模拟）";
    if (market !== "A") return "K线为参考数据；实时行情来自东方财富";
    if (klineSource === "tushare") return `数据来源：Tushare · 前复权 · ${PERIOD_TITLE[period]}`;
    if (klineSource === "loading") return "K线数据加载中…";
    return `K线数据（参考，Tushare 加载失败）· ${PERIOD_TITLE[period]}`;
  })();

  return (
    <div>
      {/* ── 周期切换 ── */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-0.5">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
            style={{
              background: period === p ? "rgba(0,229,168,0.15)" : "#0d1f3c",
              color:      period === p ? "#00E5A8" : "#94A3B8",
              border:     `1px solid ${period === p ? "#00E5A8" : "#1a2f50"}`,
            }}>
            {p}
          </button>
        ))}
      </div>

      {/* ══ 分时走势（"分时"周期） ══ */}
      {isIntraday && (
        <>
          <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>
                {PERIOD_TITLE[period]}
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-5 h-px" style={{ borderTop: `1px dashed ${CHART.PREV_CLOSE}` }} />
                  <span className="text-[10px]" style={{ color: CHART.PREV_CLOSE }}>
                    昨收 {prevClose.toFixed(2)}
                  </span>
                </div>
                <span className="font-bold text-[13px] num" style={{ color: intradayColor }}>
                  {lastIntraday.toFixed(2)}&nbsp;
                  <span className="text-[11px]">
                    {intradayUp ? "+" : ""}{((lastIntraday - prevClose) / prevClose * 100).toFixed(2)}%
                  </span>
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={intradayPoints} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="intradayG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={intradayColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={intradayColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
                <XAxis dataKey="time" tick={{ fill: CHART.AXIS, fontSize: 9 }}
                  ticks={Array.from(KEY_TIMES)} interval={0} />
                <YAxis domain={[intradayMin, intradayMax]} tick={{ fill: CHART.AXIS, fontSize: 9 }}
                  tickFormatter={(v: number) => v.toFixed(0)} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: unknown) => [typeof v === "number" ? v.toFixed(2) : String(v), "价格"]) as any} />
                <ReferenceLine y={prevClose} stroke={CHART.PREV_CLOSE} strokeDasharray="4 3" strokeWidth={1} />
                <Area type="monotone" dataKey="price" stroke={intradayColor} strokeWidth={2}
                  fill="url(#intradayG)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>成交量</p>
            <ResponsiveContainer width="100%" height={70}>
              <ComposedChart data={intradayPoints} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
                <XAxis dataKey="time" tick={{ fill: CHART.AXIS, fontSize: 8 }}
                  ticks={Array.from(KEY_TIMES)} interval={0} />
                <YAxis tick={{ fill: CHART.AXIS, fontSize: 8 }}
                  tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: unknown) => [`${typeof v === "number" ? (v / 10000).toFixed(0) : v}万手`, "成交量"]) as any} />
                <Bar dataKey="volume" radius={[1, 1, 0, 0]}>
                  {intradayPoints.map((e, i) => (
                    <Cell key={i} fill={e.pct >= 0 ? CHART.UP : CHART.DOWN} opacity={0.7} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ══ 今日5分K（"1日"周期） ══ */}
      {isDay1 && (
        <>
          <KlinePanel
            title={PERIOD_TITLE["1日"]}
            data={intraday5min}
            minP={minP1} maxP={maxP1}
            barSz={barSz1}
            CandleShape={CandleShape1d}
            xKey="date" xFmt={(v: string) => v}
            indicators={[]}
            note="⚠️ 当前为模拟数据·今日5分钟K线（示例）"
          />
          <div className="p-3 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>成交量</p>
            <VolBar data={intraday5min} xKey="date" xFmt={(v: string) => v} />
          </div>
        </>
      )}

      {/* ══ 日K蜡烛图（5日及以上周期） ══ */}
      {!isIntraday && !isDay1 && (
        <>
          {/* 加载中占位 */}
          {klineLoading && (
            <div className="flex flex-col items-center justify-center py-10 rounded-2xl mb-3"
              style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="w-6 h-6 rounded-full border-2 animate-spin mb-2"
                style={{ borderColor: "#00E5A8", borderTopColor: "transparent" }} />
              <p className="text-[11px]" style={{ color: "#64748B" }}>Tushare K线加载中…</p>
            </div>
          )}

          {/* 主蜡烛图 */}
          {!klineLoading && (
            <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>
                  {PERIOD_TITLE[period]}
                </span>
                <div className="flex items-center gap-2">
                  {/* 数据来源徽章 */}
                  {klineSource === "tushare" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.2)" }}>
                      Tushare
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Dot color={CHART.UP} /><span className="text-[10px]" style={{ color: CHART.AXIS }}>涨</span>
                    <Dot color={CHART.DOWN} /><span className="text-[10px]" style={{ color: CHART.AXIS }}>跌</span>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={candleData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
                  <XAxis dataKey="date" tick={{ fill: CHART.AXIS, fontSize: 9 }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={[minP, maxP]} tick={{ fill: CHART.AXIS, fontSize: 9 }}
                    tickFormatter={(v: number) => v.toFixed(0)} />
                  <Tooltip content={<CandleTooltip />} />
                  {/* @ts-expect-error recharts Bar supports baseValue at runtime */}
                  <Bar dataKey="high" baseValue={minP} barSize={barSz}
                    shape={<CandleShapeK />} isAnimationActive={false} />
                  {indicators.includes("MA") && (
                    <>
                      <Line type="monotone" dataKey="ma5"  stroke={CHART.MA5}  strokeWidth={1.2} dot={false} />
                      <Line type="monotone" dataKey="ma10" stroke={CHART.MA10} strokeWidth={1}   dot={false} />
                      <Line type="monotone" dataKey="ma20" stroke={CHART.MA20} strokeWidth={1.2} dot={false} />
                      {days >= 90 && <Line type="monotone" dataKey="ma60" stroke={CHART.MA60} strokeWidth={1} dot={false} />}
                    </>
                  )}
                  {indicators.includes("布林带") && (
                    <>
                      <Line type="monotone" dataKey="bollUpper" stroke={CHART.BOLL_UPPER} strokeWidth={0.8} dot={false} strokeDasharray="2 3" />
                      <Line type="monotone" dataKey="bollMid"   stroke={CHART.BOLL_MID}   strokeWidth={0.8} dot={false} strokeDasharray="2 3" />
                      <Line type="monotone" dataKey="bollLower" stroke={CHART.BOLL_LOWER} strokeWidth={0.8} dot={false} strokeDasharray="2 3" />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex gap-3 mt-2 justify-center flex-wrap">
                {indicators.includes("MA") && (
                  <>
                    <LI color={CHART.MA5}  label="MA5"  dash />
                    <LI color={CHART.MA10} label="MA10" dash />
                    <LI color={CHART.MA20} label="MA20" dash />
                    {days >= 90 && <LI color={CHART.MA60} label="MA60" dash />}
                  </>
                )}
                {indicators.includes("布林带") && <LI color={CHART.BOLL_UPPER} label="BOLL" dash />}
              </div>
            </div>
          )}

          {/* 成交量 */}
          {!klineLoading && (
            <div className="p-3 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>成交量</p>
              <VolBar data={candleData} xKey="date" xFmt={(v: string) => v.slice(5)} />
            </div>
          )}

          {/* MACD */}
          {!klineLoading && indicators.includes("MACD") && (
            <div className="p-3 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>MACD (12,26,9)</p>
                <LI color={CHART.MACD_DIF} label="DIF" dash />
                <LI color={CHART.MACD_DEA} label="DEA" dash />
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <ComposedChart data={candleData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
                  <XAxis dataKey="date" tick={{ fill: CHART.AXIS, fontSize: 8 }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: CHART.AXIS, fontSize: 8 }} tickFormatter={(v: number) => v.toFixed(1)} />
                  <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown, n: unknown) => {
                      const m: Record<string, string> = { macd: "MACD柱", dif: "DIF", dea: "DEA" };
                      return [typeof v === "number" ? v.toFixed(3) : String(v), m[String(n ?? "")] ?? String(n ?? "")];
                    }) as any} />
                  <ReferenceLine y={0} stroke={CHART.GRID} />
                  <Bar dataKey="macd" radius={[1, 1, 0, 0]}>
                    {candleData.map((e, i) => <Cell key={i} fill={(e.macd ?? 0) >= 0 ? CHART.UP : CHART.DOWN} opacity={0.85} />)}
                  </Bar>
                  <Line type="monotone" dataKey="dif" stroke={CHART.MACD_DIF} dot={false} strokeWidth={1.2} />
                  <Line type="monotone" dataKey="dea" stroke={CHART.MACD_DEA} dot={false} strokeWidth={1.2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* RSI */}
          {!klineLoading && indicators.includes("RSI") && (
            <div className="p-3 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>RSI (14)</p>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={candleData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rsiG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART.RSI} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={CHART.RSI} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
                  <XAxis dataKey="date" tick={{ fill: CHART.AXIS, fontSize: 8 }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} ticks={[0, 30, 70, 100]} tick={{ fill: CHART.AXIS, fontSize: 8 }} />
                  <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown) => [typeof v === "number" ? v.toFixed(1) : String(v), "RSI"]) as any} />
                  <ReferenceLine y={70} stroke={CHART.UP}   strokeDasharray="3 2" />
                  <ReferenceLine y={30} stroke={CHART.DOWN} strokeDasharray="3 2" />
                  <Area type="monotone" dataKey="rsi" stroke={CHART.RSI} strokeWidth={1.5} fill="url(#rsiG)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* KDJ */}
          {!klineLoading && indicators.includes("KDJ") && (
            <div className="p-3 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>KDJ (9,3,3)</p>
                <LI color={CHART.KDJ_K} label="K" />
                <LI color={CHART.KDJ_D} label="D" />
                <LI color={CHART.KDJ_J} label="J" />
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={candleData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
                  <XAxis dataKey="date" tick={{ fill: CHART.AXIS, fontSize: 8 }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} ticks={[0, 20, 50, 80, 100]} tick={{ fill: CHART.AXIS, fontSize: 8 }} />
                  <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown, n: unknown) => [typeof v === "number" ? v.toFixed(1) : String(v), String(n ?? "")]) as any} />
                  <ReferenceLine y={80} stroke={CHART.UP}   strokeDasharray="3 2" />
                  <ReferenceLine y={20} stroke={CHART.DOWN} strokeDasharray="3 2" />
                  <Area type="monotone" dataKey="K" stroke={CHART.KDJ_K} strokeWidth={1.5} fill="none" dot={false} />
                  <Area type="monotone" dataKey="D" stroke={CHART.KDJ_D} strokeWidth={1.5} fill="none" dot={false} />
                  <Area type="monotone" dataKey="J" stroke={CHART.KDJ_J} strokeWidth={1}   fill="none" strokeDasharray="3 2" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 数据来源注释 */}
          <p className="text-[10px] mt-2 text-center" style={{ color: "#64748B" }}>
            {dataSourceNote}
          </p>
        </>
      )}

      {/* ── 指标切换 ── */}
      {!isIntraday && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {INDICATORS_LIST.map((ind) => (
            <button key={ind} onClick={() => toggleInd(ind)}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold"
              style={{
                background: indicators.includes(ind) ? "rgba(59,130,246,0.15)" : "#0d1f3c",
                color:      indicators.includes(ind) ? "#3B82F6" : "#94A3B8",
                border:     `1px solid ${indicators.includes(ind) ? "rgba(59,130,246,0.3)" : "#1a2f50"}`,
              }}>
              {ind}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 蜡烛 Tooltip ──────────────────────────────────────────────────
function CandleTooltip({ active, payload, label }: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as CandleEntry | undefined;
  if (!d) return null;
  const col = d.isUp ? CHART.UP : CHART.DOWN;
  return (
    <div style={{ background: CHART.TT_BG, border: `1px solid ${CHART.TT_BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
      <p style={{ color: CHART.AXIS, marginBottom: 4 }}>{label}</p>
      <div style={{ display: "grid", gridTemplateColumns: "2em 1fr", gap: "2px 8px" }}>
        {([
          ["开", d.open?.toFixed(2), col],
          ["高", d.high?.toFixed(2), CHART.UP],
          ["低", d.low?.toFixed(2),  CHART.DOWN],
          ["收", d.close?.toFixed(2), col],
          ["量", d.volume ? `${(d.volume / 10000).toFixed(1)}万` : "-", "#F8FAFC"],
        ] as [string, string, string][]).map(([label, val, c]) => (
          <>
            <span key={`l-${label}`} style={{ color: CHART.AXIS }}>{label}</span>
            <span key={`v-${label}`} style={{ color: c, fontWeight: 700 }}>{val}</span>
          </>
        ))}
      </div>
    </div>
  );
}

// ── 成交量子图 ──────────────────────────────────────────────────
function VolBar({ data, xKey, xFmt }: { data: CandleEntry[]; xKey: string; xFmt: (v: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={70}>
      <ComposedChart data={data} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
        <XAxis dataKey={xKey} tick={{ fill: CHART.AXIS, fontSize: 8 }}
          tickFormatter={xFmt as (v: unknown) => string} interval="preserveStartEnd" />
        <YAxis tick={{ fill: CHART.AXIS, fontSize: 8 }}
          tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
        <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((v: unknown) => [`${typeof v === "number" ? (v / 10000).toFixed(0) : v}万手`, "成交量"]) as any} />
        <Bar dataKey="volume" radius={[2, 2, 0, 0]}>
          {data.map((e, i) => (
            <Cell key={i} fill={e.isUp ? CHART.UP : CHART.DOWN} opacity={0.75} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── 1日5分K 面板 ─────────────────────────────────────────────────
function KlinePanel({ title, data, minP, maxP, barSz, CandleShape, xKey, xFmt, indicators, note }: {
  title: string; data: CandleEntry[];
  minP: number; maxP: number; barSz: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CandleShape: any;
  xKey: string; xFmt: (v: string) => string;
  indicators: string[]; note?: string;
}) {
  void indicators;
  return (
    <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>{title}</span>
        <div className="flex items-center gap-1.5">
          <Dot color={CHART.UP} /><span className="text-[10px]" style={{ color: CHART.AXIS }}>涨</span>
          <Dot color={CHART.DOWN} /><span className="text-[10px]" style={{ color: CHART.AXIS }}>跌</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
          <XAxis dataKey={xKey} tick={{ fill: CHART.AXIS, fontSize: 9 }}
            tickFormatter={xFmt as (v: unknown) => string} interval="preserveStartEnd" />
          <YAxis domain={[minP, maxP]} tick={{ fill: CHART.AXIS, fontSize: 9 }}
            tickFormatter={(v: number) => v.toFixed(0)} />
          <Tooltip content={<CandleTooltip />} />
          {/* @ts-expect-error recharts Bar supports baseValue at runtime */}
          <Bar dataKey="high" baseValue={minP} barSize={barSz}
            shape={<CandleShape />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {note && <p className="text-[10px] mt-1 text-center" style={{ color: "#64748B" }}>{note}</p>}
    </div>
  );
}

function LI({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-5 h-0.5" style={{
        background: dash
          ? `repeating-linear-gradient(90deg,${color} 0,${color} 4px,transparent 4px,transparent 7px)`
          : color,
      }} />
      <span className="text-[10px]" style={{ color: "#94A3B8" }}>{label}</span>
    </div>
  );
}
function Dot({ color }: { color: string }) {
  return <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />;
}
