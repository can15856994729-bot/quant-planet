"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart, Area, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { generateKLines, generateIntraday } from "@/lib/mock-data";
import { formatPct, pnlColor } from "@/lib/utils";
import { CHART, TT_STYLE, TT_LABEL_STYLE } from "@/lib/chartConstants";
import type { Index } from "@/types";

// ── 周期定义 ─────────────────────────────────────────────────────
const PERIODS = ["分时", "1日", "5日", "10日", "1月", "3月", "半年", "1年", "全部"] as const;
type Period = typeof PERIODS[number];

// 只有"分时"是折线分时图；"1日"= 今日5分K蜡烛；其余 = 日K蜡烛
const INTRADAY_PERIODS: Period[] = ["分时"];
const DAY1_PERIOD: Period = "1日";

const PERIOD_TITLE: Record<Period, string> = {
  "分时": "分时走势",
  "1日":  "今日5分K",
  "5日":  "5日K线",
  "10日": "10日K线",
  "1月":  "1月K线",
  "3月":  "3月K线",
  "半年": "半年K线",
  "1年":  "年K线",
  "全部": "全部K线",
};

const INDICATOR_LIST = ["MA", "MACD", "RSI", "KDJ", "BOLL"] as const;

// ─── 指标计算 ────────────────────────────────────────────────────
function calcEma(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  return data.reduce<number[]>((acc, v, i) => {
    acc.push(i === 0 ? v : v * k + acc[i - 1] * (1 - k));
    return acc;
  }, []);
}
function calcRsi(closes: number[], period = 14): number[] {
  return closes.map((_, i) => {
    if (i < period) return 50;
    let gain = 0, loss = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - closes[j - 1];
      if (diff > 0) gain += diff; else loss -= diff;
    }
    return loss === 0 ? 100 : +(100 - 100 / (1 + gain / period / (loss / period))).toFixed(2);
  });
}
function calcKdj(klines: { high: number; low: number; close: number }[], period = 9) {
  const K: number[] = [], D: number[] = [], J: number[] = [];
  klines.forEach((bar, i) => {
    const slice = klines.slice(Math.max(0, i - period + 1), i + 1);
    const highN = Math.max(...slice.map((b) => b.high));
    const lowN  = Math.min(...slice.map((b) => b.low));
    const rsv   = highN === lowN ? 50 : ((bar.close - lowN) / (highN - lowN)) * 100;
    const kv = i === 0 ? rsv : rsv / 3 + K[i - 1] * (2 / 3);
    const dv = i === 0 ? kv  : kv  / 3 + D[i - 1] * (2 / 3);
    K.push(+kv.toFixed(2));
    D.push(+dv.toFixed(2));
    J.push(+(3 * kv - 2 * dv).toFixed(2));
  });
  return { K, D, J };
}

// ─── CandleEntry ────────────────────────────────────────────────
interface CandleEntry {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
  isUp:   boolean;
  ma5?:   number; ma10?: number; ma20?: number; ma60?: number;
  dif?:   number; dea?:  number; macd?: number;
  rsi?:   number;
  K?:     number; D?:    number; J?:    number;
  bollUpper?: number; bollMid?: number; bollLower?: number;
}

// ── 自定义蜡烛图 Shape ────────────────────────────────────────────
// dataKey="high" + baseValue=minP → shape 内用 scale 自算坐标
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

    // y = pixelY(high), y+height = pixelY(minP)
    const scale = height / Math.max(high - minP, 0.001);
    const toY   = (p: number) => y + (high - p) * scale;

    const highY = y;
    const lowY  = toY(low);
    const topY  = toY(Math.max(open, close));
    const botY  = toY(Math.min(open, close));
    const bodyH = Math.max(botY - topY, 1);

    const cx = x + width / 2;
    const bw = Math.max(width * 0.68, 1.5);

    return (
      <g>
        {/* 上下影线 */}
        <line x1={cx} y1={highY} x2={cx} y2={lowY} stroke={color} strokeWidth={1} />
        {/* 开收实体 */}
        <rect x={cx - bw / 2} y={topY} width={bw} height={bodyH} fill={color} />
      </g>
    );
  };
}

// ─── Props ───────────────────────────────────────────────────────
interface Props {
  code: string;
  initialIndex: Index;
}

// ─── 组件 ────────────────────────────────────────────────────────
export default function MarketDetailClient({ code, initialIndex }: Props) {
  const [index, setIndex]       = useState<Index>(initialIndex);
  const [realData, setRealData] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [period, setPeriod]     = useState<Period>("3月");
  const [activeInds, setActiveInds] = useState<string[]>(["MA"]);

  const isIntraday = INTRADAY_PERIODS.includes(period);
  const isDay1     = period === DAY1_PERIOD;

  // 实时行情
  const fetchQuote = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/market", { cache: "no-store" });
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        const found = (json.data as Index[]).find((i) => i.code === code);
        if (found && found.value > 0) { setIndex(found); setRealData(true); }
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [code]);

  useEffect(() => { fetchQuote(); }, [fetchQuote]);
  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible") fetchQuote(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchQuote]);

  const basePrice = index.value || initialIndex.value;

  // ── 分时数据（分时 + 1日 共用） ──────────────────────────────
  const { points: intradayPoints, prevClose } = useMemo(
    () => generateIntraday(basePrice),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [basePrice, period]
  );
  const KEY_TIMES = new Set(["09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00"]);

  const lastIntraday  = intradayPoints[intradayPoints.length - 1]?.price ?? basePrice;
  const intradayUp    = lastIntraday >= prevClose;
  // 中国惯例：涨=红，跌=绿
  const intradayColor = intradayUp ? CHART.INTRADAY_UP : CHART.INTRADAY_DOWN;
  const intradayMin   = Math.min(...intradayPoints.map(p => p.price), prevClose) * 0.999;
  const intradayMax   = Math.max(...intradayPoints.map(p => p.price), prevClose) * 1.001;

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

  // ── 日K数据 ──────────────────────────────────────────────────
  const days = period === "5日" ? 5 : period === "10日" ? 10 :
               period === "1月" ? 30 : period === "3月" ? 90 :
               period === "半年" ? 180 : period === "1年" ? 365 : 730;
  const klines = useMemo(
    () => generateKLines(basePrice, days),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [basePrice, days]
  );
  const closes = klines.map((k) => k.close);

  const ema5  = calcEma(closes, 5),  ema10 = calcEma(closes, 10);
  const ema20 = calcEma(closes, 20), ema60 = calcEma(closes, 60);
  const ema12 = calcEma(closes, 12), ema26 = calcEma(closes, 26);
  const dif   = ema12.map((v, i) => +(v - ema26[i]).toFixed(3));
  const dea   = calcEma(dif, 9).map((v) => +v.toFixed(3));
  const macdH = dif.map((v, i) => +(2 * (v - dea[i])).toFixed(3));
  const rsiArr = calcRsi(closes);
  const { K, D, J } = calcKdj(klines);
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
        ma5: +ema5[i].toFixed(2), ma10: +ema10[i].toFixed(2),
        ma20: +ema20[i].toFixed(2), ma60: +ema60[i].toFixed(2),
        dif: dif[i], dea: dea[i], macd: macdH[i],
        rsi: rsiArr[i], K: K[i], D: D[i], J: J[i],
        bollUpper: bollArr[i].upper, bollMid: bollArr[i].mid, bollLower: bollArr[i].lower,
      };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [klines]);

  // 价格区间
  const allH = candleData.map(k => k.high);
  const allL = candleData.map(k => k.low);
  const minP = (allL.length ? Math.min(...allL) : basePrice * 0.9) * 0.998;
  const maxP = (allH.length ? Math.max(...allH) : basePrice * 1.1) * 1.002;

  // "1日" 5分K 价格区间
  const day1H = intraday5min.map(k => k.high);
  const day1L = intraday5min.map(k => k.low);
  const minP1 = (day1L.length ? Math.min(...day1L) : basePrice * 0.97) * 0.998;
  const maxP1 = (day1H.length ? Math.max(...day1H) : basePrice * 1.03) * 1.002;

  // 自定义蜡烛 Shape
  const CandleShapeK  = useMemo(() => makeCandleShape(minP),  [minP]);
  const CandleShape1d = useMemo(() => makeCandleShape(minP1), [minP1]);

  const barSz  = Math.max(2, Math.min(14, Math.floor(340 / Math.max(candleData.length,  1))));
  const barSz1 = Math.max(3, Math.min(14, Math.floor(340 / Math.max(intraday5min.length, 1))));

  function toggleInd(ind: string) {
    setActiveInds((prev) =>
      prev.includes(ind) ? prev.filter((x) => x !== ind) : [...prev, ind]
    );
  }

  // 指标参考
  const last     = candleData[candleData.length - 1];
  const isUp     = index.changePct >= 0;
  const mainColor = isUp ? CHART.UP : CHART.DOWN;
  const prevCloseK = index.value - index.change;
  const todayBar   = klines[klines.length - 1];
  const todayOpen  = todayBar?.open  ?? index.value;
  const todayHigh  = todayBar?.high  ?? index.value;
  const todayLow   = todayBar?.low   ?? index.value;

  const maSignal  = last ? (last.ma5! > last.ma20! ? { text: "金叉", color: CHART.UP,   note: "短期趋势偏强" }
                                                   : { text: "死叉", color: CHART.DOWN, note: "短期趋势偏弱" }) : null;
  const macdSig   = last ? ((last.dif ?? 0) > (last.dea ?? 0)
                    ? { text: "多头", color: CHART.UP,   note: "DIF在DEA上方" }
                    : { text: "空头", color: CHART.DOWN, note: "DIF在DEA下方" }) : null;
  const rsiVal    = last?.rsi ?? 50;
  const rsiSig    = { text: rsiVal.toFixed(1),
                      color: rsiVal > 70 ? CHART.DOWN : rsiVal < 30 ? CHART.UP : CHART.TEXT,
                      note: rsiVal > 70 ? "超买区间" : rsiVal < 30 ? "超卖区间" : "中性区间" };
  const kdjSig    = last ? ((last.K ?? 0) > (last.D ?? 0)
                    ? { text: "金叉", color: CHART.UP,   note: "K线上穿D线" }
                    : { text: "死叉", color: CHART.DOWN, note: "K线下穿D线" }) : null;
  const bollSig   = last ? (last.close > (last.bollUpper ?? Infinity) ? { text: "超买", color: CHART.DOWN, note: "突破上轨" }
                           : last.close < (last.bollLower ?? 0)       ? { text: "超卖", color: CHART.UP,   note: "跌破下轨" }
                           :                                            { text: "中性", color: CHART.MA5,  note: "在布林带内运行" }) : null;

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">

      {/* ── 实时价格卡 ── */}
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            {realData && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold mb-1 inline-block"
                style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.2)" }}>
                实时
              </span>
            )}
            <p className="font-black text-[34px] num leading-tight" style={{ color: CHART.TEXT }}>
              {index.value > 0
                ? index.value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : "—"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {isUp ? <TrendingUp size={14} color={mainColor} /> : <TrendingDown size={14} color={mainColor} />}
              <span className="font-bold text-[15px] num" style={{ color: mainColor }}>
                {index.change > 0 ? "+" : ""}{index.change.toFixed(2)}
              </span>
              <span className="font-bold text-[15px] num" style={{ color: mainColor }}>
                {formatPct(index.changePct)}
              </span>
            </div>
          </div>
          <button onClick={fetchQuote} disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-xl mt-1"
            style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
            <RefreshCw size={14} color={CHART.AXIS} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* 今日快览 */}
        <div className="grid grid-cols-4 gap-1 pt-3" style={{ borderTop: "1px solid #1a2f50" }}>
          {[
            { label: "今开", value: todayOpen.toFixed(2), color: pnlColor(todayOpen - prevCloseK) },
            { label: "昨收", value: prevCloseK.toFixed(2), color: CHART.TEXT },
            { label: "最高", value: todayHigh.toFixed(2),  color: CHART.UP   },
            { label: "最低", value: todayLow.toFixed(2),   color: CHART.DOWN },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="text-[10px] mb-0.5" style={{ color: CHART.AXIS }}>{label}</p>
              <p className="font-bold text-[12px] num" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 时间段切换 ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
            style={{
              background: period === p ? "rgba(0,229,168,0.15)" : "#0d1f3c",
              color:      period === p ? "#00E5A8" : CHART.AXIS,
              border:     `1px solid ${period === p ? "#00E5A8" : "#1a2f50"}`,
            }}>
            {p}
          </button>
        ))}
      </div>

      {/* ══ 分时走势（仅"分时"周期） ══ */}
      {isIntraday && (
        <>
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold" style={{ color: CHART.AXIS }}>
                {PERIOD_TITLE["分时"]}
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
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={intradayPoints} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`intradayGrad-${code}`} x1="0" y1="0" x2="0" y2="1">
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
                  fill={`url(#intradayGrad-${code})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 分时成交量 */}
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-semibold mb-2" style={{ color: CHART.AXIS }}>成交量</p>
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

      {/* ══ 今日5分K蜡烛图（"1日"周期） ══ */}
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
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-semibold mb-2" style={{ color: CHART.AXIS }}>成交量</p>
            <VolBar data={intraday5min} xKey="date" xFmt={(v: string) => v} />
          </div>
        </>
      )}

      {/* ══ 日K蜡烛图（5日及以上周期） ══ */}
      {!isIntraday && !isDay1 && (
        <>
          {/* 主蜡烛图 */}
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold" style={{ color: CHART.AXIS }}>
                {PERIOD_TITLE[period]}
              </span>
              <div className="flex items-center gap-1.5">
                <Dot color={CHART.UP} /><span className="text-[10px]" style={{ color: CHART.AXIS }}>涨</span>
                <Dot color={CHART.DOWN} /><span className="text-[10px]" style={{ color: CHART.AXIS }}>跌</span>
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
                {/* 蜡烛主体：dataKey=high + baseValue=minP → shape 内用 scale 自算坐标 */}
                {/* @ts-expect-error recharts Bar supports baseValue at runtime, missing from v3 types */}
                <Bar dataKey="high" baseValue={minP} barSize={barSz}
                  shape={<CandleShapeK />} isAnimationActive={false} />
                {/* MA 均线 */}
                {activeInds.includes("MA") && (
                  <>
                    <Line type="monotone" dataKey="ma5"  stroke={CHART.MA5}  strokeWidth={1.2} dot={false} />
                    <Line type="monotone" dataKey="ma10" stroke={CHART.MA10} strokeWidth={1}   dot={false} />
                    <Line type="monotone" dataKey="ma20" stroke={CHART.MA20} strokeWidth={1.2} dot={false} />
                    {days >= 90 && <Line type="monotone" dataKey="ma60" stroke={CHART.MA60} strokeWidth={1} dot={false} />}
                  </>
                )}
                {/* 布林带 */}
                {activeInds.includes("BOLL") && (
                  <>
                    <Line type="monotone" dataKey="bollUpper" stroke={CHART.BOLL_UPPER} strokeWidth={0.8} dot={false} strokeDasharray="2 3" />
                    <Line type="monotone" dataKey="bollMid"   stroke={CHART.BOLL_MID}   strokeWidth={0.8} dot={false} strokeDasharray="2 3" />
                    <Line type="monotone" dataKey="bollLower" stroke={CHART.BOLL_LOWER} strokeWidth={0.8} dot={false} strokeDasharray="2 3" />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
            {/* 图例 */}
            <div className="flex gap-3 mt-2 justify-center flex-wrap">
              {activeInds.includes("MA") && (
                <>
                  <LegendItem color={CHART.MA5}  label="MA5"  dash />
                  <LegendItem color={CHART.MA10} label="MA10" dash />
                  <LegendItem color={CHART.MA20} label="MA20" dash />
                  {days >= 90 && <LegendItem color={CHART.MA60} label="MA60" dash />}
                </>
              )}
              {activeInds.includes("BOLL") && <LegendItem color={CHART.BOLL_UPPER} label="BOLL" dash />}
            </div>
          </div>

          {/* 成交量 */}
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-semibold mb-2" style={{ color: CHART.AXIS }}>成交量</p>
            <VolBar data={candleData} xKey="date" xFmt={(v: string) => v.slice(5)} />
          </div>

          {/* MACD */}
          {activeInds.includes("MACD") && (
            <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[11px] font-semibold" style={{ color: CHART.AXIS }}>MACD (12,26,9)</p>
                <LegendItem color={CHART.MACD_DIF} label="DIF" dash />
                <LegendItem color={CHART.MACD_DEA} label="DEA" dash />
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
                      const m: Record<string,string> = { macd:"MACD柱", dif:"DIF", dea:"DEA" };
                      return [typeof v === "number" ? v.toFixed(3) : String(v), m[String(n??"")] ?? String(n??"")];
                    }) as any} />
                  <ReferenceLine y={0} stroke={CHART.GRID} />
                  <Bar dataKey="macd" radius={[1,1,0,0]}>
                    {candleData.map((e, i) => <Cell key={i} fill={(e.macd ?? 0) >= 0 ? CHART.UP : CHART.DOWN} opacity={0.85} />)}
                  </Bar>
                  <Line type="monotone" dataKey="dif" stroke={CHART.MACD_DIF} dot={false} strokeWidth={1.2} />
                  <Line type="monotone" dataKey="dea" stroke={CHART.MACD_DEA} dot={false} strokeWidth={1.2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* RSI */}
          {activeInds.includes("RSI") && (
            <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: CHART.AXIS }}>RSI (14)</p>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={candleData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rsiGradM" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART.RSI} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={CHART.RSI} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
                  <XAxis dataKey="date" tick={{ fill: CHART.AXIS, fontSize: 8 }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={[0,100]} ticks={[0,30,70,100]} tick={{ fill: CHART.AXIS, fontSize: 8 }} />
                  <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown) => [typeof v === "number" ? v.toFixed(1) : String(v), "RSI"]) as any} />
                  <ReferenceLine y={70} stroke={CHART.DOWN} strokeDasharray="3 2" />
                  <ReferenceLine y={30} stroke={CHART.UP}   strokeDasharray="3 2" />
                  <Area type="monotone" dataKey="rsi" stroke={CHART.RSI} strokeWidth={1.5} fill="url(#rsiGradM)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* KDJ */}
          {activeInds.includes("KDJ") && (
            <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[11px] font-semibold" style={{ color: CHART.AXIS }}>KDJ (9,3,3)</p>
                <LegendItem color={CHART.KDJ_K} label="K" />
                <LegendItem color={CHART.KDJ_D} label="D" />
                <LegendItem color={CHART.KDJ_J} label="J" />
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={candleData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.GRID} />
                  <XAxis dataKey="date" tick={{ fill: CHART.AXIS, fontSize: 8 }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={[0,100]} ticks={[0,20,50,80,100]} tick={{ fill: CHART.AXIS, fontSize: 8 }} />
                  <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown, n: unknown) => [typeof v === "number" ? v.toFixed(1) : String(v), String(n??"")]) as any} />
                  <ReferenceLine y={80} stroke={CHART.DOWN} strokeDasharray="3 2" />
                  <ReferenceLine y={20} stroke={CHART.UP}   strokeDasharray="3 2" />
                  <Area type="monotone" dataKey="K" stroke={CHART.KDJ_K} strokeWidth={1.5} fill="none" dot={false} />
                  <Area type="monotone" dataKey="D" stroke={CHART.KDJ_D} strokeWidth={1.5} fill="none" dot={false} />
                  <Area type="monotone" dataKey="J" stroke={CHART.KDJ_J} strokeWidth={1}   fill="none" dot={false} strokeDasharray="3 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 指标切换按钮 */}
          <div>
            <p className="text-[11px] font-semibold mb-2" style={{ color: CHART.AXIS }}>技术指标</p>
            <div className="flex gap-2 flex-wrap">
              {INDICATOR_LIST.map((ind) => {
                const on = activeInds.includes(ind);
                return (
                  <button key={ind} onClick={() => toggleInd(ind)}
                    className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                    style={{
                      background: on ? "rgba(59,130,246,0.18)" : "#0d1f3c",
                      color:      on ? "#3B82F6" : CHART.AXIS,
                      border:     `1px solid ${on ? "rgba(59,130,246,0.35)" : "#1a2f50"}`,
                    }}>
                    {ind}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 指标参考 */}
          <div>
            <p className="text-[11px] font-semibold mb-2" style={{ color: CHART.AXIS }}>指标参考</p>
            <div className="p-4 rounded-2xl space-y-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              {[
                { label: "MA (均线)",    sig: maSignal },
                { label: "MACD",         sig: macdSig  },
                { label: "RSI (14)",     sig: rsiSig   },
                { label: "KDJ (9,3,3)",  sig: kdjSig   },
                { label: "布林带",       sig: bollSig  },
              ].map(({ label, sig }) => sig && (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[12px]" style={{ color: CHART.AXIS }}>{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[14px] num" style={{ color: sig.color }}>{sig.text}</span>
                    <span className="text-[10px]" style={{ color: CHART.AXIS }}>{sig.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 数据说明 */}
          <p className="text-[10px] mt-2 text-center" style={{ color: CHART.LABEL }}>
            ⚠️ 当前为模拟数据·{PERIOD_TITLE[period]}（示例）
          </p>
        </>
      )}

      {/* ── 免责声明 ── */}
      <div className="p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}>
        <p className="text-[10px] leading-[1.7]" style={{ color: CHART.AXIS }}>
          ⚠️ K线图及所有指标均基于模拟数据生成，仅供学习参考，不构成投资建议。
        </p>
      </div>
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
          ["量", d.volume ? `${(d.volume / 10000).toFixed(1)}万` : "-", CHART.TEXT],
        ] as [string, string, string][]).map(([lbl, val, c]) => (
          <>
            <span key={`l-${lbl}`} style={{ color: CHART.AXIS }}>{lbl}</span>
            <span key={`v-${lbl}`} style={{ color: c, fontWeight: 700 }}>{val}</span>
          </>
        ))}
      </div>
    </div>
  );
}

// ── 成交量子图（共用） ──────────────────────────────────────────
function VolBar({ data, xKey, xFmt }: {
  data: CandleEntry[];
  xKey: string;
  xFmt: (v: string) => string;
}) {
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

// ── K线面板（复用） ──────────────────────────────────────────────
function KlinePanel({ title, data, minP, maxP, barSz, CandleShape, xKey, xFmt, indicators, note }: {
  title: string;
  data: CandleEntry[];
  minP: number; maxP: number;
  barSz: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CandleShape: any;
  xKey: string;
  xFmt: (v: string) => string;
  indicators: string[];
  note?: string;
}) {
  void indicators;
  return (
    <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold" style={{ color: CHART.AXIS }}>{title}</span>
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
          {/* @ts-expect-error recharts Bar supports baseValue at runtime, missing from v3 types */}
          <Bar dataKey="high" baseValue={minP} barSize={barSz}
            shape={<CandleShape />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {note && <p className="text-[10px] mt-1 text-center" style={{ color: CHART.LABEL }}>{note}</p>}
    </div>
  );
}

// ── 图例小组件 ───────────────────────────────────────────────────
function LegendItem({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-5 h-0.5" style={{
        background: dash
          ? `repeating-linear-gradient(90deg,${color} 0,${color} 4px,transparent 4px,transparent 7px)`
          : color,
      }} />
      <span className="text-[10px]" style={{ color: CHART.AXIS }}>{label}</span>
    </div>
  );
}

// ── 颜色圆点 ─────────────────────────────────────────────────────
function Dot({ color }: { color: string }) {
  return <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />;
}
