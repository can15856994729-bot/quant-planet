"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import type { StrategyResult } from "@/lib/strategyService";

// Fallback counts from MOCK_SIGNALS shape so layout doesn't shift on first render
const FALLBACK = { buy: 2, sell: 2 };

export default function HomeStrategySignalCard() {
  const [buy,     setBuy]     = useState(FALLBACK.buy);
  const [sell,    setSell]    = useState(FALLBACK.sell);
  const [loaded,  setLoaded]  = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    fetch("/api/strategy/signals")
      .then(r => r.json())
      .then((data: Partial<StrategyResult>) => {
        if (data.ok) {
          setBuy( data.buySignals?.length  ?? FALLBACK.buy);
          setSell(data.sellSignals?.length ?? FALLBACK.sell);
          setLoaded(true);
        } else {
          setErrored(true);
        }
      })
      .catch(() => setErrored(true));
  }, []);

  return (
    <Link href="/signals">
      <div className="p-3 rounded-2xl active:opacity-70 transition-opacity"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-semibold" style={{ color: "#94A3B8" }}>今日信号</p>
          {loaded && !errored && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6" }}>
              多因子
            </span>
          )}
        </div>
        <p className="font-black text-[20px] num up">{buy} 买入</p>
        <p className="text-[12px] font-bold down mt-0.5">{sell} 卖出</p>
      </div>
    </Link>
  );
}
