"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Star, TrendingUp, TrendingDown, X } from "lucide-react";
import { MOCK_STOCKS, DEFAULT_WATCHLIST } from "@/lib/mock-data";
import PageHeader from "@/components/layout/PageHeader";
import { formatPct, formatPrice, pnlColor, marketColor, formatMarket } from "@/lib/utils";

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const stocks = MOCK_STOCKS.filter((s) => watchlist.includes(s.symbol));
  const allStocks = MOCK_STOCKS.filter((s) =>
    !watchlist.includes(s.symbol) &&
    (s.name.includes(search) || s.symbol.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader
        title="我的自选股"
        showBack={false}
        right={
          <button onClick={() => setShowAdd(!showAdd)}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,229,168,0.12)", border: "1px solid rgba(0,229,168,0.25)" }}>
            <Plus size={18} color="#00E5A8" />
          </button>
        }
      />

      {/* 搜索/添加面板 */}
      {showAdd && (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #1a2f50", background: "#0a1628" }}>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <Search size={15} color="#4a6080" />
            <input
              className="flex-1 bg-transparent text-[14px] outline-none"
              style={{ color: "#F8FAFC" }}
              placeholder="搜索股票名称或代码…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {(search ? allStocks : MOCK_STOCKS.filter((s) => !watchlist.includes(s.symbol))).slice(0, 6).map((s) => (
              <div key={s.symbol}
                className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer active:opacity-70"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
                onClick={() => { setWatchlist([...watchlist, s.symbol]); setShowAdd(false); setSearch(""); }}>
                <div>
                  <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{s.name}</span>
                  <span className="ml-2 text-[10px]" style={{ color: marketColor(s.market) }}>{s.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold" style={{ color: pnlColor(s.changePct) }}>{formatPct(s.changePct)}</span>
                  <Plus size={16} color="#00E5A8" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 市场分类标签 */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto">
        {(["全部", "A股", "港股", "美股"] as const).map((tab, i) => (
          <span key={tab} className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold"
            style={{
              background: i === 0 ? "#00E5A8" : "#0d1f3c",
              color: i === 0 ? "#07111F" : "#4a6080",
              border: `1px solid ${i === 0 ? "#00E5A8" : "#1a2f50"}`,
            }}>
            {tab}
          </span>
        ))}
      </div>

      {/* 列表头 */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-[11px] font-semibold" style={{ color: "#4a6080" }}>名称/代码</span>
        <div className="flex gap-8">
          <span className="text-[11px] font-semibold" style={{ color: "#4a6080" }}>最新价</span>
          <span className="text-[11px] font-semibold" style={{ color: "#4a6080" }}>涨跌幅</span>
        </div>
      </div>

      {/* 股票列表 */}
      <div className="px-4 space-y-2 pb-4">
        {stocks.map((s) => (
          <div key={s.symbol} className="relative">
            <Link href={`/stock/${s.symbol}`}>
              <div className="flex items-center justify-between p-4 rounded-2xl"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[13px]"
                    style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>{s.name}</span>
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                        style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
                        {formatMarket(s.market)}
                      </span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "#4a6080" }}>{s.symbol} · {s.industry}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[15px] num" style={{ color: "#F8FAFC" }}>
                    {formatPrice(s.price, s.currency)}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    {s.changePct > 0 ? <TrendingUp size={11} color="#00E5A8" /> : <TrendingDown size={11} color="#EF4444" />}
                    <span className="font-bold text-[13px] num" style={{ color: pnlColor(s.changePct) }}>
                      {formatPct(s.changePct)}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
            {/* 删除按钮 */}
            <button
              onClick={() => setWatchlist(watchlist.filter((sym) => sym !== s.symbol))}
              className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center active:opacity-60"
              style={{ background: "rgba(239,68,68,0.15)" }}>
              <X size={11} color="#EF4444" />
            </button>
          </div>
        ))}

        {stocks.length === 0 && (
          <div className="text-center py-16">
            <Star size={40} color="#1a2f50" className="mx-auto mb-3" />
            <p className="font-semibold" style={{ color: "#4a6080" }}>暂无自选股</p>
            <p className="text-[12px] mt-1" style={{ color: "#4a6080" }}>点击右上角 + 添加</p>
          </div>
        )}
      </div>
    </div>
  );
}
