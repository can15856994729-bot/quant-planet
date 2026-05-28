"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface Props {
  data: { date: string; value: number; benchmark: number }[];
}

export default function EquityChart({ data }: Props) {
  const sampled = data.filter((_, i) => i % 3 === 0);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={sampled} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
        <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#64748B", fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)}`} />
        <Tooltip
          contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#94A3B8" }}
          formatter={(v: unknown, name: unknown) => [
            typeof v === "number" ? `${(v - 100).toFixed(2)}%` : String(v),
            name === "value" ? "我的策略" : "沪深300"
          ]}
        />
        <Legend formatter={(v) => v === "value" ? "我的策略" : "沪深300"} wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
        <Line type="monotone" dataKey="value"     stroke="#00E5A8" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="benchmark" stroke="#3B82F6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}
