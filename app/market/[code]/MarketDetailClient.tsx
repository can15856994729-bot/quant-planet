"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart, Area, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { generateKLines } from "@/lib/mock-data";
import { formatPct, pnlColor } from "@/lib/utils";
import type { Index } from "@/types";

const PERIODS = ["5日", "1月", "3月", "1年"] as const;
type Period = typeof PERIODS[number];

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
    const avgGain = gain / period;
    const avgLoss = loss / period;
    return avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2);
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

// ─── Props ───────────────────────────────────────────────────────

interface Props {
  code: string;
  initialIndex: Index;
}

// ─── 组件 ────────────────────────────────────────────────────────

export default function MarketDetailClient({ code, initialIndex }: Props) {
  const [index, setIndex]     = useState<Index>(initialIndex);
  const [realData, setRealData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod]   = useState<Period>("3月");
  const [activeInds, setActiveInds] = useState<string[]>(["MA"]);

  // 实时行情
  const fetchQuote = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/market");
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        const found = (json.data as Index[]).find((i) => i.code === code);
        if (found && found.value > 0) { setIndex(found); setRealData(true); }
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [code]);

  useEffect(() => { fetchQuote(); }, [fetchQuote]);

  // K 线数据
  const days = period === "5日" ? 5 : period === "1月" ? 30 : period === "3月" ? 90 : 365;
  const klines = generateKLines(index.value || initialIndex.value, days);
  const closes = klines.map((k) => k.close);

  // 各指标计算
  const ema5  = calcEma(closes, 5);
  const ema10 = calcEma(closes, 10);
  const ema20 = calcEma(closes, 20);
  const ema60 = calcEma(closes, 60);
  const ema12 = calcEma(closes, 12);
  const ema26 = calcEma(closes, 26);
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

  const chartData = klines.map((k, i) => ({
    date:      k.date,
    close:     k.close,
    volume:    k.volume,
    ma5:       +ema5[i].toFixed(2),
    ma10:      +ema10[i].toFixed(2),
    ma20:      +ema20[i].toFixed(2),
    ma60:      +ema60[i].toFixed(2),
    dif:       dif[i],
    dea:       dea[i],
    macd:      macdH[i],
    rsi:       rsiArr[i],
    K:         K[i],
    D:         D[i],
    J:         J[i],
    bollUpper: bollArr[i].upper,
    bollMid:   bollArr[i].mid,
    bollLower: bollArr[i].lower,
  }));

  const last      = chartData[chartData.length - 1];
  const isUp      = index.changePct >= 0;
  const mainColor = isUp ? "#00E5A8" : "#EF4444";
  const minClose  = Math.min(...closes) * 0.995;
  const maxClose  = Math.max(...closes) * 1.005;
  const prevClose = index.value - index.change;

  const todayBar  = klines[klines.length - 1];
  const todayOpen = todayBar?.open  ?? index.value;
  const todayHigh = todayBar?.high  ?? index.value;
  const todayLow  = todayBar?.low   ?? index.value;

  function toggleInd(ind: string) {
    setActiveInds((prev) =>
      prev.includes(ind) ? prev.filter((x) => x !== ind) : [...prev, ind]
    );
  }

  // 指标参考（动态计算）
  const maSignal  = last ? (last.ma5 > last.ma20 ? { text: "金叉", color: "#00E5A8", note: "短期趋势偏强" }
                                                  : { text: "死叉", color: "#EF4444", note: "短期趋势偏弱" }) : null;
  const macdSig   = last ? (last.dif > last.dea  ? { text: "多头",   color: "#00E5A8", note: "DIF在DEA上方" }
                                                  : { text: "空头",   color: "#EF4444", note: "DIF在DEA下方" }) : null;
  const rsiVal    = last?.rsi ?? 50;
  const rsiSig    = { text: rsiVal.toFixed(1), color: rsiVal > 70 ? "#EF4444" : rsiVal < 30 ? "#00E5A8" : "#F8FAFC",
                      note: rsiVal > 70 ? "超买区间" : rsiVal < 30 ? "超卖区间" : "中性区间" };
  const kdjSig    = last ? (last.K > last.D
                    ? { text: "金叉", color: "#00E5A8", note: "K线上穿D线" }
                    : { text: "死叉", color: "#EF4444", note: "K线下穿D线" }) : null;
  const bollSig   = last ? (last.close > last.bollUpper ? { text: "超买", color: "#EF4444", note: "突破上轨" }
                          : last.close < last.bollLower  ? { text: "超卖", color: "#00E5A8", note: "跌破下轨" }
                          :                               { text: "中性", color: "#FACC15", note: "在布林带内运行" }) : null;

  // 通用 Tooltip 样式
  const ttStyle = { background: "#0a1628", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 };
  const ttLabel = { color: "#94A3B8" };

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">

      {/* ── 实时价格卡 ── */}
      <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            {realData && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold mb-1 inline-block"
                style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.2)" }}>
                实时
              </span>
            )}
            <p className="font-black text-[34px] num leading-tight" style={{ color: "#F8FAFC" }}>
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
            <RefreshCw size={14} color="#4a6080" className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* 今日快览 */}
        <div className="grid grid-cols-4 gap-1 pt-3" style={{ borderTop: "1px solid #1a2f50" }}>
          {[
            { label: "今开", value: todayOpen.toFixed(2),  color: pnlColor(todayOpen - prevClose) },
            { label: "昨收", value: prevClose.toFixed(2),  color: "#F8FAFC" },
            { label: "最高", value: todayHigh.toFixed(2),  color: "#00E5A8" },
            { label: "最低", value: todayLow.toFixed(2),   color: "#EF4444" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="text-[9px] mb-0.5" style={{ color: "#4a6080" }}>{label}</p>
              <p className="font-bold text-[12px] num" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 时间段切换 ── */}
      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold"
            style={{
              background: period === p ? "rgba(0,229,168,0.15)" : "#0d1f3c",
              color:      period === p ? "#00E5A8" : "#4a6080",
              border:     `1px solid ${period === p ? "#00E5A8" : "#1a2f50"}`,
            }}>
            {p}
          </button>
        ))}
      </div>

      {/* ── 主价格图 ── */}
      <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <p className="text-[11px] font-semibold mb-2" style={{ color: "#4a6080" }}>价格走势</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${code}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={mainColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={mainColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
            <XAxis dataKey="date" tick={{ fill: "#4a6080", fontSize: 9 }}
              tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
            <YAxis domain={[minClose, maxClose]} tick={{ fill: "#4a6080", fontSize: 9 }}
              tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((v: unknown, name: unknown) => {
                const map: Record<string, string> = {
                  close:"收盘", ma5:"MA5", ma10:"MA10", ma20:"MA20", ma60:"MA60",
                  bollUpper:"BOLL上轨", bollMid:"BOLL中轨", bollLower:"BOLL下轨",
                };
                const n = String(name ?? "");
                return [typeof v === "number" ? v.toFixed(2) : String(v), map[n] ?? n];
              }) as any}
            />
            <Area type="monotone" dataKey="close" stroke={mainColor} strokeWidth={2}
              fill={`url(#grad-${code})`} dot={false} />
            {activeInds.includes("MA") && (
              <>
                <Area type="monotone" dataKey="ma5"  stroke="#FACC15" strokeWidth={1.2} fill="none" dot={false} strokeDasharray="4 2" />
                <Area type="monotone" dataKey="ma10" stroke="#F97316" strokeWidth={1}   fill="none" dot={false} strokeDasharray="4 2" />
                <Area type="monotone" dataKey="ma20" stroke="#3B82F6" strokeWidth={1.2} fill="none" dot={false} strokeDasharray="4 2" />
                {days >= 90 && <Area type="monotone" dataKey="ma60" stroke="#A855F7" strokeWidth={1} fill="none" dot={false} strokeDasharray="4 2" />}
              </>
            )}
            {activeInds.includes("BOLL") && (
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
          <LegendItem color={mainColor} label="收盘" />
          {activeInds.includes("MA") && (
            <>
              <LegendItem color="#FACC15" label="MA5"  dash />
              <LegendItem color="#F97316" label="MA10" dash />
              <LegendItem color="#3B82F6" label="MA20" dash />
              {days >= 90 && <LegendItem color="#A855F7" label="MA60" dash />}
            </>
          )}
          {activeInds.includes("BOLL") && <LegendItem color="#94A3B8" label="BOLL" dash />}
        </div>
      </div>

      {/* ── 成交量图 ── */}
      <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <p className="text-[11px] font-semibold mb-2" style={{ color: "#4a6080" }}>成交量</p>
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart data={chartData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
            <XAxis dataKey="date" tick={{ fill: "#4a6080", fontSize: 8 }}
              tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#4a6080", fontSize: 8 }}
              tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
            <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
              formatter={(v: unknown) => [`${typeof v === "number" ? (v / 10000).toFixed(0) : v}万手`, "成交量"] as [string, string]}
            />
            <Bar dataKey="volume" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.close >= (i > 0 ? chartData[i - 1].close : entry.close) ? "#00E5A8" : "#EF4444"} opacity={0.75} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── MACD 子图 ── */}
      {activeInds.includes("MACD") && (
        <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-[11px] font-semibold" style={{ color: "#4a6080" }}>MACD (12,26,9)</p>
            <LegendItem color="#FACC15" label="DIF" dash />
            <LegendItem color="#3B82F6" label="DEA" dash />
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
              <XAxis dataKey="date" tick={{ fill: "#4a6080", fontSize: 8 }}
                tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#4a6080", fontSize: 8 }} tickFormatter={(v: number) => v.toFixed(1)} />
              <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((v: unknown, name: unknown) => {
                const map: Record<string, string> = { macd:"MACD柱", dif:"DIF", dea:"DEA" };
                const n = String(name ?? "");
                return [typeof v === "number" ? v.toFixed(3) : String(v), map[n] ?? n];
              }) as any}
              />
              <ReferenceLine y={0} stroke="#1a2f50" />
              <Bar dataKey="macd" radius={[1, 1, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.macd >= 0 ? "#00E5A8" : "#EF4444"} opacity={0.8} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="dif" stroke="#FACC15" dot={false} strokeWidth={1.2} />
              <Line type="monotone" dataKey="dea" stroke="#3B82F6" dot={false} strokeWidth={1.2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── RSI 子图 ── */}
      {activeInds.includes("RSI") && (
        <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <p className="text-[11px] font-semibold mb-2" style={{ color: "#4a6080" }}>RSI (14)</p>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
              <XAxis dataKey="date" tick={{ fill: "#4a6080", fontSize: 8 }}
                tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={{ fill: "#4a6080", fontSize: 8 }} />
              <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                formatter={(v: unknown) => [`${typeof v === "number" ? v.toFixed(1) : v}`, "RSI"] as [string, string]}
              />
              <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="3 2" label={{ value: "超买 70", fill: "#EF4444", fontSize: 9, position: "insideTopRight" }} />
              <ReferenceLine y={30} stroke="#00E5A8" strokeDasharray="3 2" label={{ value: "超卖 30", fill: "#00E5A8", fontSize: 9, position: "insideBottomRight" }} />
              <Area type="monotone" dataKey="rsi" stroke="#3B82F6" strokeWidth={1.5} fill="url(#rsiGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── KDJ 子图 ── */}
      {activeInds.includes("KDJ") && (
        <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-[11px] font-semibold" style={{ color: "#4a6080" }}>KDJ (9,3,3)</p>
            <LegendItem color="#FACC15" label="K" />
            <LegendItem color="#3B82F6" label="D" />
            <LegendItem color="#EF4444" label="J" />
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
              <XAxis dataKey="date" tick={{ fill: "#4a6080", fontSize: 8 }}
                tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} ticks={[0, 20, 50, 80, 100]} tick={{ fill: "#4a6080", fontSize: 8 }} />
              <Tooltip contentStyle={ttStyle} labelStyle={ttLabel}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((v: unknown, name: unknown) => [
                typeof v === "number" ? v.toFixed(1) : String(v),
                String(name ?? ""),
              ]) as any}
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

      {/* ── 指标切换按钮 ── */}
      <div>
        <p className="text-[11px] font-semibold mb-2" style={{ color: "#4a6080" }}>技术指标</p>
        <div className="flex gap-2 flex-wrap">
          {INDICATOR_LIST.map((ind) => {
            const on = activeInds.includes(ind);
            return (
              <button key={ind} onClick={() => toggleInd(ind)}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                style={{
                  background: on ? "rgba(59,130,246,0.18)" : "#0d1f3c",
                  color:      on ? "#3B82F6" : "#4a6080",
                  border:     `1px solid ${on ? "rgba(59,130,246,0.35)" : "#1a2f50"}`,
                }}>
                {ind}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 指标参考 ── */}
      <div>
        <p className="text-[11px] font-semibold mb-2" style={{ color: "#4a6080" }}>指标参考</p>
        <div className="p-4 rounded-2xl space-y-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          {[
            { label: "MA (均线)",   sig: maSignal  },
            { label: "MACD",        sig: macdSig   },
            { label: "RSI (14)",    sig: rsiSig    },
            { label: "KDJ (9,3,3)", sig: kdjSig    },
            { label: "布林带",      sig: bollSig   },
          ].map(({ label, sig }) => sig && (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[12px]" style={{ color: "#94A3B8" }}>{label}</span>
              <div className="flex items-center gap-2">
                <span className="font-black text-[14px] num" style={{ color: sig.color }}>{sig.text}</span>
                <span className="text-[10px]" style={{ color: "#4a6080" }}>{sig.note}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 免责声明 ── */}
      <div className="p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}>
        <p className="text-[10px] leading-[1.7]" style={{ color: "#4a6080" }}>
          ⚠️ K线图及所有指标均基于模拟数据生成，仅供学习参考，不构成投资建议。
        </p>
      </div>
    </div>
  );
}

// ── 图例小组件 ──────────────────────────────────────────────────
function LegendItem({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-5 h-0.5" style={{
        background: dash ? `repeating-linear-gradient(90deg,${color} 0,${color} 4px,transparent 4px,transparent 7px)` : color,
      }} />
      <span className="text-[10px]" style={{ color: "#4a6080" }}>{label}</span>
    </div>
  );
}
