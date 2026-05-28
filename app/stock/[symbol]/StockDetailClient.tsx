"use client";
import { useState, useMemo } from "react";
import {
  AreaChart, Area, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { generateKLines, generateIntraday } from "@/lib/mock-data";
import type { Market } from "@/types";

// ── 周期定义 ────────────────────────────────────────────────────
const PERIODS = ["分时", "1日", "5日", "10日", "1月", "3月", "半年", "1年", "全部"] as const;
type Period = typeof PERIODS[number];
const INTRADAY_PERIODS: Period[] = ["分时", "1日"];

const INDICATORS_LIST = ["MA", "MACD", "RSI", "KDJ", "布林带"];

// ── EMA / RSI / KDJ helpers ────────────────────────────────────
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

interface Props { symbol: string; market: Market; initialPrice?: number; }

const ttStyle = { background: "#0a1628", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 };
const ttLabel = { color: "#94A3B8" };

export default function StockDetailClient({ symbol, market, initialPrice }: Props) {
  const [period, setPeriod]       = useState<Period>("3月");
  const [indicators, setIndicators] = useState<string[]>(["MA"]);

  const basePrice = initialPrice ?? (market === "A" ? 1680 : market === "HK" ? 320 : 185);
  const isIntraday = INTRADAY_PERIODS.includes(period);

  // ── 分时数据 ────────────────────────────────────────────────
  const { points: intradayPoints, prevClose } = useMemo(
    () => generateIntraday(basePrice),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [basePrice, period]          // period 变化时重新生成
  );

  // ── K线数据 ─────────────────────────────────────────────────
  const days = period === "5日" ? 5 : period === "10日" ? 10 :
               period === "1月" ? 30 : period === "3月" ? 90 :
               period === "半年" ? 180 : period === "1年" ? 365 : 730;
  const klines  = useMemo(() => generateKLines(basePrice, days), [basePrice, days]);
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
  const klineData = klines.map((k, i) => ({
    date: k.date, close: k.close, volume: k.volume,
    ma5: +e5[i].toFixed(2), ma10: +e10[i].toFixed(2),
    ma20: +e20[i].toFixed(2), ma60: +e60[i].toFixed(2),
    dif: dif[i], dea: dea[i], macd: macdH[i],
    rsi: rsiArr[i], K: K[i], D: D[i], J: J[i],
    bollUpper: bollArr[i].upper, bollMid: bollArr[i].mid, bollLower: bollArr[i].lower,
  }));

  const minClose  = Math.min(...closes) * 0.995;
  const maxClose  = Math.max(...closes) * 1.005;
  const lastClose = closes[closes.length - 1] ?? basePrice;
  const isUp      = lastClose >= (closes[0] ?? basePrice);
  const mainColor = isUp ? "#00E5A8" : "#EF4444";

  // 分时：最终价格 vs 昨收
  const lastIntraday = intradayPoints[intradayPoints.length - 1]?.price ?? basePrice;
  const intradayUp   = lastIntraday >= prevClose;
  const intradayColor = intradayUp ? "#00E5A8" : "#EF4444";
  const intradayMin  = Math.min(...intradayPoints.map(p => p.price), prevClose) * 0.999;
  const intradayMax  = Math.max(...intradayPoints.map(p => p.price), prevClose) * 1.001;

  // 只在整点/半点显示 X 轴刻度
  const KEY_TIMES = new Set(["09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00"]);

  function toggleInd(ind: string) {
    setIndicators(prev => prev.includes(ind) ? prev.filter(x => x !== ind) : [...prev, ind]);
  }

  return (
    <div>
      {/* ── 时间段切换（可横向滚动） ── */}
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

      {/* ══════════════════════════════════════════════════════
          分时 / 1日：分时走势图
      ══════════════════════════════════════════════════════ */}
      {isIntraday ? (
        <>
          {/* 分时价格图 */}
          <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            {/* 昨收标注 */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>分时走势</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-5 h-px" style={{ background: "#FACC15", borderTop: "1px dashed #FACC15" }} />
                  <span className="text-[10px]" style={{ color: "#FACC15" }}>昨收 {prevClose.toFixed(2)}</span>
                </div>
                <span className="font-bold text-[13px] num" style={{ color: intradayColor }}>
                  {lastIntraday.toFixed(2)}
                  &nbsp;
                  <span className="text-[11px]">
                    {intradayUp ? "+" : ""}{((lastIntraday - prevClose) / prevClose * 100).toFixed(2)}%
                  </span>
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={intradayPoints} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="intradayGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={intradayColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={intradayColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
                <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 9 }}
                  ticks={Array.from(KEY_TIMES)} interval={0}
                />
                <YAxis domain={[intradayMin, intradayMax]} tick={{ fill: "#94A3B8", fontSize: 9 }}
                  tickFormatter={(v: number) => v.toFixed(0)} />
                <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: unknown) => [
                    typeof v === "number" ? v.toFixed(2) : String(v), "价格"
                  ]) as any}
                />
                <ReferenceLine y={prevClose} stroke="#FACC15" strokeDasharray="4 3" strokeWidth={1} />
                <Area type="monotone" dataKey="price" stroke={intradayColor} strokeWidth={2}
                  fill="url(#intradayGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 分时成交量 */}
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>成交量</p>
            <ResponsiveContainer width="100%" height={70}>
              <ComposedChart data={intradayPoints} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
                <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 8 }}
                  ticks={Array.from(KEY_TIMES)} interval={0} />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 8 }}
                  tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: unknown) => [`${typeof v === "number" ? (v / 10000).toFixed(0) : v}万手`, "成交量"]) as any}
                />
                <Bar dataKey="volume" radius={[1, 1, 0, 0]}>
                  {intradayPoints.map((entry, i) => (
                    <Cell key={i} fill={entry.pct >= 0 ? "#00E5A8" : "#EF4444"} opacity={0.7} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
      /* ══════════════════════════════════════════════════════
          其他周期：K线 / 均线图
      ══════════════════════════════════════════════════════ */
        <>
          {/* 主价格图 */}
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={klineData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={mainColor} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={mainColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
                <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 9 }}
                  tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                <YAxis domain={[minClose, maxClose]} tick={{ fill: "#94A3B8", fontSize: 9 }}
                  tickFormatter={(v: number) => v.toFixed(0)} />
                <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: unknown, name: unknown) => {
                    const map: Record<string, string> = {
                      close:"收盘", ma5:"MA5", ma10:"MA10", ma20:"MA20", ma60:"MA60",
                      bollUpper:"BOLL↑", bollMid:"BOLL中", bollLower:"BOLL↓",
                    };
                    const n = String(name ?? "");
                    return [typeof v === "number" ? v.toFixed(2) : String(v), map[n] ?? n];
                  }) as any}
                />
                <Area type="monotone" dataKey="close" stroke={mainColor} strokeWidth={2}
                  fill="url(#priceGrad)" dot={false} />
                {indicators.includes("MA") && (
                  <>
                    <Area type="monotone" dataKey="ma5"  stroke="#FACC15" strokeWidth={1.2} fill="none" dot={false} strokeDasharray="4 2" />
                    <Area type="monotone" dataKey="ma10" stroke="#F97316" strokeWidth={1}   fill="none" dot={false} strokeDasharray="4 2" />
                    <Area type="monotone" dataKey="ma20" stroke="#3B82F6" strokeWidth={1.2} fill="none" dot={false} strokeDasharray="4 2" />
                    {days >= 90 && <Area type="monotone" dataKey="ma60" stroke="#A855F7" strokeWidth={1} fill="none" dot={false} strokeDasharray="4 2" />}
                  </>
                )}
                {indicators.includes("布林带") && (
                  <>
                    <Area type="monotone" dataKey="bollUpper" stroke="#94A3B8" strokeWidth={1} fill="none" dot={false} strokeDasharray="2 3" />
                    <Area type="monotone" dataKey="bollMid"   stroke="#FACC15" strokeWidth={1} fill="none" dot={false} strokeDasharray="2 3" />
                    <Area type="monotone" dataKey="bollLower" stroke="#94A3B8" strokeWidth={1} fill="none" dot={false} strokeDasharray="2 3" />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
            {/* 图例 */}
            <div className="flex gap-3 mt-2 justify-center flex-wrap">
              <LI color={mainColor} label="收盘" />
              {indicators.includes("MA") && (
                <>
                  <LI color="#FACC15" label="MA5"  dash />
                  <LI color="#F97316" label="MA10" dash />
                  <LI color="#3B82F6" label="MA20" dash />
                  {days >= 90 && <LI color="#A855F7" label="MA60" dash />}
                </>
              )}
              {indicators.includes("布林带") && <LI color="#94A3B8" label="BOLL" dash />}
            </div>
          </div>

          {/* 成交量 */}
          <div className="p-3 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>成交量</p>
            <ResponsiveContainer width="100%" height={70}>
              <ComposedChart data={klineData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
                <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 8 }}
                  tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 8 }}
                  tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: unknown) => [`${typeof v === "number" ? (v / 10000).toFixed(0) : v}万手`, "成交量"]) as any}
                />
                <Bar dataKey="volume" radius={[2, 2, 0, 0]}>
                  {klineData.map((entry, i) => (
                    <Cell key={i}
                      fill={entry.close >= (i > 0 ? klineData[i-1].close : entry.close) ? "#00E5A8" : "#EF4444"}
                      opacity={0.75} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* MACD */}
          {indicators.includes("MACD") && (
            <div className="p-3 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>MACD (12,26,9)</p>
                <LI color="#FACC15" label="DIF" dash /><LI color="#3B82F6" label="DEA" dash />
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <ComposedChart data={klineData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
                  <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 8 }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 8 }} tickFormatter={(v: number) => v.toFixed(1)} />
                  <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown, name: unknown) => {
                      const m: Record<string,string> = { macd:"MACD柱", dif:"DIF", dea:"DEA" };
                      return [typeof v === "number" ? v.toFixed(3) : String(v), m[String(name??"")] ?? String(name??"")];
                    }) as any}
                  />
                  <ReferenceLine y={0} stroke="#1a2f50" />
                  <Bar dataKey="macd" radius={[1,1,0,0]}>
                    {klineData.map((e, i) => <Cell key={i} fill={e.macd >= 0 ? "#00E5A8" : "#EF4444"} opacity={0.8} />)}
                  </Bar>
                  <Line type="monotone" dataKey="dif" stroke="#FACC15" dot={false} strokeWidth={1.2} />
                  <Line type="monotone" dataKey="dea" stroke="#3B82F6" dot={false} strokeWidth={1.2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* RSI */}
          {indicators.includes("RSI") && (
            <div className="p-3 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>RSI (14)</p>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={klineData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rsiG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
                  <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 8 }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={[0,100]} ticks={[0,30,70,100]} tick={{ fill: "#94A3B8", fontSize: 8 }} />
                  <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown) => [typeof v === "number" ? v.toFixed(1) : String(v), "RSI"]) as any}
                  />
                  <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="3 2" />
                  <ReferenceLine y={30} stroke="#00E5A8" strokeDasharray="3 2" />
                  <Area type="monotone" dataKey="rsi" stroke="#3B82F6" strokeWidth={1.5} fill="url(#rsiG)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* KDJ */}
          {indicators.includes("KDJ") && (
            <div className="p-3 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>KDJ (9,3,3)</p>
                <LI color="#FACC15" label="K" /><LI color="#3B82F6" label="D" /><LI color="#EF4444" label="J" />
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={klineData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
                  <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 8 }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={[0,100]} ticks={[0,20,50,80,100]} tick={{ fill: "#94A3B8", fontSize: 8 }} />
                  <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown, name: unknown) => [typeof v === "number" ? v.toFixed(1) : String(v), String(name??"")]) as any}
                  />
                  <ReferenceLine y={80} stroke="#EF4444" strokeDasharray="3 2" />
                  <ReferenceLine y={20} stroke="#00E5A8" strokeDasharray="3 2" />
                  <Area type="monotone" dataKey="K" stroke="#FACC15" strokeWidth={1.5} fill="none" dot={false} />
                  <Area type="monotone" dataKey="D" stroke="#3B82F6" strokeWidth={1.5} fill="none" dot={false} />
                  <Area type="monotone" dataKey="J" stroke="#EF4444" strokeWidth={1}   fill="none" dot={false} strokeDasharray="3 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ── 指标切换（分时模式不显示） ── */}
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

// ── 图例小组件 ─────────────────────────────────────────────────
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
