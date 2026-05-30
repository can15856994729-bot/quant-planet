"use client";
/**
 * components/ui/WatchlistButton.tsx
 * 加入/移出自选股按钮（用于股票详情页）
 *
 * Props: 股票基础信息（服务端传入）
 * 状态：从 localStorage 读取，立即响应
 */
import { useState, useEffect } from "react";
import { Star }               from "lucide-react";
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isInWatchlist,
  symbolToTsCode,
  WATCHLIST_KEY,
} from "@/lib/watchlistService";
import type { WatchlistMarket, WatchlistCurrency, WatchlistExchange } from "@/lib/watchlistService";

interface WatchlistButtonProps {
  symbol:   string;
  name:     string;
  market:   WatchlistMarket;
  exchange: WatchlistExchange;
  industry: string;
  currency: WatchlistCurrency;
}

export default function WatchlistButton({
  symbol, name, market, exchange, industry, currency,
}: WatchlistButtonProps) {
  const [inWatchlist, setInWatchlist] = useState(false);
  const [hydrated,    setHydrated]    = useState(false);
  const [toast,       setToast]       = useState<string | null>(null);

  // 初始化
  useEffect(() => {
    setInWatchlist(isInWatchlist(symbol, market));
    setHydrated(true);
  }, [symbol, market]);

  // 跨标签页同步
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === WATCHLIST_KEY) {
        setInWatchlist(isInWatchlist(symbol, market));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [symbol, market]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  function handleToggle() {
    if (!hydrated) return;
    if (inWatchlist) {
      removeFromWatchlist(symbol, market);
      setInWatchlist(false);
      showToast("已移出自选股");
    } else {
      addToWatchlist({
        symbol,
        tsCode:   market === "A" ? symbolToTsCode(symbol) : undefined,
        name,
        market,
        exchange,
        industry,
        currency,
      });
      setInWatchlist(true);
      showToast(`${name} 已加入自选股 ✓`);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-[13px] active:opacity-70 transition-all"
        style={{
          background: inWatchlist ? "rgba(0,229,168,0.12)" : "rgba(148,163,184,0.08)",
          border:     `1px solid ${inWatchlist ? "rgba(0,229,168,0.4)" : "#1a2f50"}`,
          color:      inWatchlist ? "#00E5A8" : "#94A3B8",
        }}
      >
        <Star
          size={15}
          color={inWatchlist ? "#00E5A8" : "#64748B"}
          fill={inWatchlist ? "#00E5A8" : "none"}
        />
        {hydrated ? (inWatchlist ? "已自选" : "加自选") : "…"}
      </button>

      {toast && (
        <div
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap z-50"
          style={{
            background: "rgba(13,31,60,0.96)",
            color:      "#F8FAFC",
            border:     "1px solid #1a2f50",
            boxShadow:  "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
