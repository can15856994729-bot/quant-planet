"use client";
/**
 * components/ui/HomeWatchlist.tsx
 * 首页"我的自选股"预览模块（最多4只）
 *
 * 数据来源：lib/watchlistService (localStorage)
 * 价格来源：useWatchlistQuotes（实时/fallback 显示"--"）
 * 无默认/mock 股票 — 新用户显示引导提示
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getWatchlist, WATCHLIST_KEY } from "@/lib/watchlistService";
import type { WatchlistItem }          from "@/lib/watchlistService";
import { useWatchlistQuotes }          from "@/lib/useMarketData";
import { formatPct, formatPrice, pnlColor, marketColor } from "@/lib/utils";

export default function HomeWatchlist() {
  const [items,    setItems]    = useState<WatchlistItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // 从 localStorage 加载（客户端）
  useEffect(() => {
    setItems(getWatchlist().slice(0, 4));
    setHydrated(true);
  }, []);

  // 跨标签页同步
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === WATCHLIST_KEY) {
        setItems(getWatchlist().slice(0, 4));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const symbols = items.map((s) => s.symbol);
  const { quotes, realtimeSet } = useWatchlistQuotes(symbols);

  // 加载中 / 空状态
  if (!hydrated) {
    return (
      <div
        style={{ background: "#0d1f3c", borderRadius: 14, border: "1px solid #1a2f50" }}
        className="p-4 animate-pulse"
      >
        <div className="h-4 rounded bg-[#1a2f50] w-1/2 mb-2" />
        <div className="h-4 rounded bg-[#1a2f50] w-3/4" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Link href="/watchlist">
        <div
          className="flex flex-col items-center justify-center py-8 rounded-2xl active:opacity-70"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
            style={{ background: "rgba(0,229,168,0.10)", border: "1px solid rgba(0,229,168,0.2)" }}
          >
            <Plus size={18} color="#00E5A8" />
          </div>
          <p className="text-[13px] font-semibold" style={{ color: "#94A3B8" }}>
            添加自选股
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "#64748B" }}>
            点击搜索并添加股票
          </p>
        </div>
      </Link>
    );
  }

  return (
    <div style={{ background: "#0d1f3c", borderRadius: 14, border: "1px solid #1a2f50" }}>
      {items.map((s, i) => {
        const q         = quotes[s.symbol];
        const price     = q?.price ?? null;
        const changePct = q?.changePct ?? null;

        return (
          <Link key={`${s.symbol}-${s.market}`} href={`/stock/${s.symbol}`}>
            <div
              className="flex items-center justify-between px-4 py-3 active:opacity-80"
              style={{
                borderBottom: i < items.length - 1 ? "1px solid #1a2f50" : "none",
              }}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>
                    {s.name}
                  </span>
                  <span
                    className="text-[10px] font-bold px-1 py-0.5 rounded"
                    style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}
                  >
                    {s.symbol}
                  </span>
                  {realtimeSet.has(s.symbol) && (
                    <span
                      className="text-[9px] px-1 py-0.5 rounded font-bold"
                      style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}
                    >
                      实时
                    </span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: "#94A3B8" }}>
                  {s.industry || "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-[14px] num" style={{ color: "#F8FAFC" }}>
                  {price ? formatPrice(price, s.currency) : "—"}
                </p>
                <p
                  className="font-bold text-[12px] num"
                  style={{ color: changePct !== null ? pnlColor(changePct) : "#64748B" }}
                >
                  {changePct !== null ? formatPct(changePct) : "—"}
                </p>
              </div>
            </div>
          </Link>
        );
      })}

      {/* 更多 */}
      <Link href="/watchlist">
        <div
          className="flex items-center justify-center py-2.5 rounded-b-[14px] active:opacity-70"
          style={{ borderTop: "1px solid #1a2f50" }}
        >
          <p className="text-[11px] font-semibold" style={{ color: "#64748B" }}>
            查看全部自选股 →
          </p>
        </div>
      </Link>
    </div>
  );
}
