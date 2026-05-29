"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useWatchlistQuotes } from "@/lib/useMarketData";
import type { StrategySignal } from "@/lib/strategyService";

export default function HomeSignals() {
  const [signals, setSignals]   = useState<StrategySignal[]>([]);
  const [loading, setLoading]   = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    fetch("/api/strategy/signals")
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          // Show top buy signals first, then watch signals
          const combined: StrategySignal[] = [
            ...(data.buySignals  as StrategySignal[] ?? []),
            ...(data.watchlist   as StrategySignal[] ?? []),
          ].slice(0, 3);
          setSignals(combined);
        } else {
          setApiError(true);
        }
      })
      .catch(() => setApiError(true))
      .finally(() => setLoading(false));
  }, []);

  // Live prices for signal stocks
  const symbols = signals.map(s => s.symbol);
  const { quotes } = useWatchlistQuotes(symbols);

  // ── Loading skeleton ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-3 rounded-2xl h-[62px] animate-pulse"
            style={{ background: "#0d1f3c" }} />
        ))}
      </div>
    );
  }

  // ── Error / empty ────────────────────────────────────────────
  if (apiError || signals.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-[12px]" style={{ color: "#64748B" }}>
          {apiError ? "策略信号加载中，请稍候" : "今日暂无策略信号"}
        </p>
        <p className="text-[10px] mt-1" style={{ color: "#3B82F6" }}>
          A股稳健多因子轮动策略
        </p>
      </div>
    );
  }

  // ── Signal list ──────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {signals.map((sig) => {
        const isBuy   = sig.action === "buy";
        const isSell  = sig.action === "sell";
        const color   = isBuy ? "#00E5A8" : isSell ? "#EF4444" : "#FACC15";
        const label   = isBuy ? "买入" : isSell ? "卖出" : "关注";
        const liveQ   = quotes[sig.symbol];
        const displayPrice = liveQ?.price ?? sig.entryPrice;
        const firstReason  = sig.reasons[0] ?? (sig.industry + " · 多因子策略");

        return (
          <Link key={sig.symbol} href={`/stock/${sig.symbol}`}>
            <div
              className="p-3 rounded-2xl flex items-start gap-3 active:opacity-70"
              style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
            >
              {/* Dot */}
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                style={{ background: color }} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>
                    {sig.name}
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `${color}18`, color }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-[9px] px-1 py-0.5 rounded"
                    style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6" }}
                  >
                    评分{sig.score}
                  </span>
                </div>
                <p className="text-[11px] truncate" style={{ color: "#94A3B8" }}>
                  {firstReason}
                </p>
              </div>

              {/* Price */}
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-[12px] num" style={{ color: "#F8FAFC" }}>
                  {displayPrice > 0 ? `¥${displayPrice.toFixed(2)}` : "--"}
                </p>
                <p className="text-[10px]" style={{ color: liveQ ? "#00E5A8" : "#94A3B8" }}>
                  {liveQ ? "实时" : "多因子"}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
