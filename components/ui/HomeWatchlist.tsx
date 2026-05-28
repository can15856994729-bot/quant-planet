"use client";
import Link from "next/link";
import { useWatchlistQuotes } from "@/lib/useMarketData";
import { MOCK_STOCKS, DEFAULT_WATCHLIST } from "@/lib/mock-data";
import { formatPct, formatPrice, pnlColor, marketColor } from "@/lib/utils";

const watchlistStocks = MOCK_STOCKS.filter((s) =>
  DEFAULT_WATCHLIST.includes(s.symbol)
).slice(0, 4);

const symbols = watchlistStocks.map((s) => s.symbol);

export default function HomeWatchlist() {
  const { quotes, realData } = useWatchlistQuotes(symbols);

  return (
    <div style={{ background: "#0d1f3c", borderRadius: 14, border: "1px solid #1a2f50" }}>
      {watchlistStocks.map((s, i) => {
        const q = quotes[s.symbol];
        const price     = q?.price     ?? s.price;
        const changePct = q?.changePct ?? s.changePct;
        return (
          <Link key={s.symbol} href={`/stock/${s.symbol}`}>
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < watchlistStocks.length - 1 ? "1px solid #1a2f50" : "none" }}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{s.name}</span>
                  <span
                    className="text-[10px] font-bold px-1 py-0.5 rounded"
                    style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}
                  >
                    {s.symbol}
                  </span>
                  {realData && q && (
                    <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                      style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>实时</span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: "#94A3B8" }}>{s.industry}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-[14px] num" style={{ color: "#F8FAFC" }}>
                  {formatPrice(price, s.currency)}
                </p>
                <p className="font-bold text-[12px] num" style={{ color: pnlColor(changePct) }}>
                  {formatPct(changePct)}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
