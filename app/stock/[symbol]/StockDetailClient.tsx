"use client";
import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { generateKLines } from "@/lib/mock-data";
import type { Market } from "@/types";

const PERIODS = ["5日", "1月", "3月", "1年", "全部"];
const INDICATORS_LIST = ["MA", "MACD", "RSI", "KDJ", "布林带"];

interface Props {
  symbol: string;
  market: Market;
  initialPrice?: number;
}

export default function StockDetailClient({ symbol, market, initialPrice }: Props) {
  const [period, setPeriod] = useState("3月");
  const [indicators, setIndicators] = useState<string[]>(["MA"]);

  const days = period === "5日" ? 5 : period === "1月" ? 30 : period === "3月" ? 90 : period === "1年" ? 365 : 730;
  // 优先用传入的真实价格，fallback 到按市场估算的默认值
  const basePrice = initialPrice ?? (market === "A" ? 1680 : market === "HK" ? 320 : 185);
  const klines = generateKLines(basePrice, days);

  // Compute simple moving averages for display
  const chartData = klines.map((k, i) => {
    const slice5  = klines.slice(Math.max(0, i - 4),  i + 1);
    const slice20 = klines.slice(Math.max(0, i - 19), i + 1);
    return {
      date: k.date,
      close: k.close,
      ma5:  slice5.reduce((a, b) => a + b.close, 0)  / slice5.length,
      ma20: slice20.reduce((a, b) => a + b.close, 0) / slice20.length,
    };
  });

  const minClose = Math.min(...chartData.map((d) => d.close)) * 0.995;
  const maxClose = Math.max(...chartData.map((d) => d.close)) * 1.005;

  const firstClose = chartData[0]?.close ?? 0;
  const lastClose  = chartData[chartData.length - 1]?.close ?? 0;
  const isUp = lastClose >= firstClose;

  function toggleIndicator(ind: string) {
    setIndicators((prev) =>
      prev.includes(ind) ? prev.filter((x) => x !== ind) : [...prev, ind]
    );
  }

  return (
    <div>
      {/* 时间段切换 */}
      <div className="flex gap-1.5 mb-3">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold"
            style={{
              background: period === p ? "rgba(0,229,168,0.15)" : "#0d1f3c",
              color: period === p ? "#00E5A8" : "#4a6080",
              border: `1px solid ${period === p ? "#00E5A8" : "#1a2f50"}`,
            }}>
            {p}
          </button>
        ))}
      </div>

      {/* 折线图 */}
      <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={isUp ? "#00E5A8" : "#EF4444"} stopOpacity={0.2} />
                <stop offset="95%" stopColor={isUp ? "#00E5A8" : "#EF4444"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
            <XAxis dataKey="date" tick={{ fill: "#4a6080", fontSize: 9 }}
              tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
            <YAxis domain={[minClose, maxClose]} tick={{ fill: "#4a6080", fontSize: 9 }}
              tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip
              contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "#94A3B8" }}
              formatter={(v: unknown) => [`${typeof v === "number" ? v.toFixed(2) : v}`, "收盘价"] as [string, string]}
            />
            <Area type="monotone" dataKey="close" stroke={isUp ? "#00E5A8" : "#EF4444"}
              strokeWidth={2} fill="url(#priceGrad)" dot={false} />
            {indicators.includes("MA") && (
              <>
                <Area type="monotone" dataKey="ma5"  stroke="#FACC15" strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" />
                <Area type="monotone" dataKey="ma20" stroke="#3B82F6" strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>

        {/* 图例 */}
        <div className="flex gap-3 mt-2 justify-center">
          <div className="flex items-center gap-1">
            <div className="w-6 h-0.5" style={{ background: isUp ? "#00E5A8" : "#EF4444" }} />
            <span className="text-[10px]" style={{ color: "#4a6080" }}>收盘价</span>
          </div>
          {indicators.includes("MA") && (
            <>
              <div className="flex items-center gap-1">
                <div className="w-6 h-0.5" style={{ background: "#FACC15" }} />
                <span className="text-[10px]" style={{ color: "#4a6080" }}>MA5</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-6 h-0.5" style={{ background: "#3B82F6" }} />
                <span className="text-[10px]" style={{ color: "#4a6080" }}>MA20</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 指标切换 */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {INDICATORS_LIST.map((ind) => (
          <button key={ind} onClick={() => toggleIndicator(ind)}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold"
            style={{
              background: indicators.includes(ind) ? "rgba(59,130,246,0.15)" : "#0d1f3c",
              color: indicators.includes(ind) ? "#3B82F6" : "#4a6080",
              border: `1px solid ${indicators.includes(ind) ? "rgba(59,130,246,0.3)" : "#1a2f50"}`,
            }}>
            {ind}
          </button>
        ))}
      </div>
    </div>
  );
}