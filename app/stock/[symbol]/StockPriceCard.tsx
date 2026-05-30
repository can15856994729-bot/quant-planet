"use client";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useStockQuote } from "@/lib/useMarketData";
import { formatPrice, formatPct, pnlColor, marketColor, formatMarket } from "@/lib/utils";
import type { Stock } from "@/types";

interface Props {
  initialStock: Stock;
}

export default function StockPriceCard({ initialStock }: Props) {
  const { stock, realData, source } = useStockQuote(initialStock.symbol);
  const s = stock ?? initialStock;

  // Source badge
  const badge =
    source === "alphavantage"
      ? { label: "AV实时", bg: "rgba(59,130,246,0.15)", color: "#3B82F6" }
      : realData
      ? { label: "实时", bg: "rgba(0,229,168,0.12)", color: "#00E5A8" }
      : null;

  return (
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-black text-[16px]" style={{ color: "#F8FAFC" }}>{s.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
            style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
            {formatMarket(s.market)}
          </span>
          {badge && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
          )}
        </div>
        <p className="text-[11px]" style={{ color: "#94A3B8" }}>{s.symbol} · {s.industry}</p>
      </div>
      <div className="text-right">
        <p className="font-black text-[28px] num" style={{ color: "#F8FAFC" }}>
          {formatPrice(s.price, s.currency)}
        </p>
        <div className="flex items-center justify-end gap-1 mt-0.5">
          {s.changePct > 0
            ? <TrendingUp size={12} color="#EF4444" />
            : <TrendingDown size={12} color="#22C55E" />}
          <span className="font-bold text-[14px] num" style={{ color: pnlColor(s.changePct) }}>
            {formatPct(s.changePct)}
          </span>
          <span className="text-[11px] num ml-1" style={{ color: pnlColor(s.change) }}>
            ({s.change > 0 ? "+" : ""}{s.change.toFixed(2)})
          </span>
        </div>
      </div>
    </div>
  );
}
