"use client";
/**
 * HomeSimAccountCard — reads live Zustand sim store for the homepage card.
 * Uses mounted pattern to avoid SSR hydration mismatch.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSimStore } from "@/lib/simStore";
import { simTotals } from "@/lib/simStore";

export default function HomeSimAccountCard() {
  const [mounted, setMounted] = useState(false);
  const cash      = useSimStore(s => s.cash);
  const positions = useSimStore(s => s.positions);
  const initial   = useSimStore(s => s.initialCapital);

  useEffect(() => { setMounted(true); }, []);

  // SSR / first-render fallback: show placeholder to avoid mismatch
  if (!mounted) {
    return (
      <Link href="/sim-trading">
        <div className="p-3 rounded-2xl h-full" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#94A3B8" }}>我的模拟账户</p>
          <p className="font-black text-[18px] num" style={{ color: "#F8FAFC" }}>——</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#94A3B8" }}>加载中…</p>
        </div>
      </Link>
    );
  }

  const { totalValue, totalReturn, totalReturnPct } = simTotals(cash, positions, initial);
  const isUp = totalReturn >= 0;
  const color = isUp ? "#00E5A8" : "#EF4444";
  const sign  = isUp ? "+" : "";

  return (
    <Link href="/sim-trading">
      <div className="p-3 rounded-2xl h-full active:opacity-70 transition-opacity"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#94A3B8" }}>我的模拟账户</p>
        <p className="font-black text-[18px] num" style={{ color: "#F8FAFC" }}>
          ¥{totalValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: "#94A3B8" }}>
          总收益{" "}
          <span className="font-semibold" style={{ color }}>
            {sign}{totalReturnPct.toFixed(2)}%
          </span>
        </p>
      </div>
    </Link>
  );
}
