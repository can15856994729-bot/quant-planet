"use client";
import Link from "next/link";
import { MOCK_SIGNALS } from "@/lib/mock-data";
import { formatPrice, signalTypeLabel, signalTypeColor, marketToCurrency } from "@/lib/utils";
import { useWatchlistQuotes } from "@/lib/useMarketData";

const SIGNAL_SYMBOLS = [...new Set(MOCK_SIGNALS.map((s) => s.symbol))];

export default function HomeSignals() {
  const { quotes } = useWatchlistQuotes(SIGNAL_SYMBOLS);

  return (
    <div className="space-y-2">
      {MOCK_SIGNALS.slice(0, 3).map((sig) => (
        // 直接跳到对应股票详情页，不再跳到信号列表
        <Link key={sig.id} href={`/stock/${sig.symbol}`}>
          <div className="p-3 rounded-2xl flex items-start gap-3 active:opacity-70"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
              style={{ background: signalTypeColor(sig.type) }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{sig.name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${signalTypeColor(sig.type)}18`, color: signalTypeColor(sig.type) }}>
                  {signalTypeLabel(sig.type)}
                </span>
                {!sig.read && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#EF4444" }} />}
              </div>
              <p className="text-[11px] truncate" style={{ color: "#94A3B8" }}>{sig.reason}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-[12px] num" style={{ color: "#F8FAFC" }}>
                {formatPrice(quotes[sig.symbol]?.price ?? sig.price, marketToCurrency(sig.market))}
              </p>
              <p className="text-[10px]" style={{ color: quotes[sig.symbol] ? "#00E5A8" : "#4a6080" }}>
                {quotes[sig.symbol] ? "实时" : sig.strength + "强度"}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
