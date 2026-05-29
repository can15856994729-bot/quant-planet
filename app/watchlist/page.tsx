"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Star, TrendingUp, TrendingDown, X, Check, Loader2, Database } from "lucide-react";
import { DEFAULT_WATCHLIST } from "@/lib/mock-data";
import { getStockBySymbol } from "@/lib/stockService";
import type { StockInfo, Market } from "@/lib/stockService";
import PageHeader from "@/components/layout/PageHeader";
import { formatPct, formatPrice, pnlColor, marketColor, formatMarket } from "@/lib/utils";
import { useWatchlistQuotes } from "@/lib/useMarketData";
import { useStockSearch } from "@/lib/useStockSearch";
import { useMarketStats } from "@/lib/useMarketStats";

type MarketTab = "全部" | "A股" | "港股" | "美股";
const MARKET_MAP: Record<MarketTab, Market | null> = {
  "全部": null, "A股": "A", "港股": "HK", "美股": "US",
};

// Build initial watchlist from stockService (falls back to mock-data symbols)
function buildWatchedStocks(symbols: string[]): StockInfo[] {
  return symbols.map((sym) => {
    const s = getStockBySymbol(sym);
    if (s) return s;
    // Fallback: create minimal stub if not in stockService
    return null;
  }).filter((s): s is StockInfo => s !== null);
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [activeTab, setActiveTab] = useState<MarketTab>("全部");

  // 添加面板
  const [showAdd, setShowAdd]   = useState(false);
  const [search, setSearch]     = useState("");
  const [pickerTab, setPickerTab] = useState<MarketTab>("全部");

  // 市场接入统计
  const { stats, loading: statsLoading, error: statsError, getStat } = useMarketStats();

  const allWatched = buildWatchedStocks(watchlist);
  const stocks = activeTab === "全部"
    ? allWatched
    : allWatched.filter((s) => s.market === MARKET_MAP[activeTab]);

  const { quotes, realData, realtimeSet } = useWatchlistQuotes(allWatched.map((s) => s.symbol));

  // Stock search with debounce
  const { results: pickerStocks, loading: searchLoading } = useStockSearch(
    search,
    MARKET_MAP[pickerTab]
  );

  function toggleStock(symbol: string) {
    setWatchlist((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  }

  function closeAdd() {
    setShowAdd(false);
    setSearch("");
    setPickerTab("全部");
  }

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader
        title="我的自选股"
        showBack={false}
        right={
          <button onClick={() => setShowAdd(true)}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,229,168,0.12)", border: "1px solid rgba(0,229,168,0.25)" }}>
            <Plus size={18} color="#00E5A8" />
          </button>
        }
      />

      {/* 市场分类标签 */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto">
        {(["全部", "A股", "港股", "美股"] as const).map((tab) => {
          const count = tab === "全部"
            ? allWatched.length
            : allWatched.filter((s) => s.market === MARKET_MAP[tab]).length;
          const active = activeTab === tab;
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold flex items-center gap-1"
              style={{
                background: active ? "#00E5A8" : "#0d1f3c",
                color:      active ? "#07111F" : "#94A3B8",
                border:     `1px solid ${active ? "#00E5A8" : "#1a2f50"}`,
              }}>
              {tab}
              {count > 0 && (
                <span className="text-[10px] font-black px-1 rounded-full"
                  style={{ background: active ? "rgba(0,0,0,0.15)" : "rgba(148,163,184,0.15)" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 列表头 */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>名称/代码</span>
        <div className="flex gap-8">
          <span className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>最新价</span>
          <span className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>涨跌幅</span>
        </div>
      </div>

      {/* 股票列表 */}
      <div className="px-4 space-y-2 pb-28">
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
                      <span className="text-[10px] font-bold px-1 py-0.5 rounded"
                        style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
                        {formatMarket(s.market)}
                      </span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "#94A3B8" }}>{s.symbol} · {s.industry}</p>
                  </div>
                </div>
                <div className="text-right pr-6">
                  <div className="flex items-center justify-end gap-1 mb-0.5">
                    {realtimeSet.has(s.symbol) && (
                      <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                        style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>实时</span>
                    )}
                    <p className="font-bold text-[15px] num" style={{ color: "#F8FAFC" }}>
                      {formatPrice(quotes[s.symbol]?.price ?? s.price, s.currency)}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {(quotes[s.symbol]?.changePct ?? s.changePct) > 0
                      ? <TrendingUp size={11} color="#00E5A8" />
                      : <TrendingDown size={11} color="#EF4444" />}
                    <span className="font-bold text-[13px] num"
                      style={{ color: pnlColor(quotes[s.symbol]?.changePct ?? s.changePct) }}>
                      {formatPct(quotes[s.symbol]?.changePct ?? s.changePct)}
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
            <p className="font-semibold" style={{ color: "#94A3B8" }}>
              {activeTab === "全部" ? "暂无自选股" : `暂无${activeTab}自选股`}
            </p>
            <p className="text-[12px] mt-1" style={{ color: "#94A3B8" }}>
              点击右上角 + 添加股票
            </p>
          </div>
        )}
      </div>

      {/* ── 添加自选股面板（底部弹出） ── */}
      {showAdd && (
        <div className="fixed inset-0 z-[100] flex items-end"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeAdd(); }}>
          <div className="w-full max-w-[480px] mx-auto rounded-t-3xl flex flex-col"
            style={{ background: "#0a1628", border: "1px solid #1a2f50", maxHeight: "88vh" }}>

            {/* 头部 */}
            <div className="flex-shrink-0 px-5 pt-4 pb-3">
              <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: "#1a2f50" }} />
              <div className="flex items-center justify-between mb-3">
                <p className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>
                  添加自选股
                  <span className="ml-2 text-[12px] font-normal" style={{ color: "#94A3B8" }}>
                    已选 {watchlist.length} 只 ·{" "}
                    {statsLoading
                      ? "统计中…"
                      : statsError
                      ? "全市场"
                      : `共 ${(stats?.total ?? 0).toLocaleString("zh-CN")} 只`
                    }
                  </span>
                </p>
                <button onClick={closeAdd}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "#1a2f50" }}>
                  <X size={14} color="#94A3B8" />
                </button>
              </div>

              {/* 搜索框 */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                {searchLoading
                  ? <Loader2 size={14} color="#00E5A8" className="animate-spin" />
                  : <Search size={14} color="#94A3B8" />
                }
                <input
                  autoFocus
                  className="flex-1 bg-transparent text-[14px] outline-none"
                  style={{ color: "#F8FAFC" }}
                  placeholder="搜索股票名称或代码…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch("")}>
                    <X size={13} color="#64748B" />
                  </button>
                )}
              </div>

              {/* 市场筛选（带数量 badge） */}
              <div className="flex gap-2">
                {(["全部", "A股", "港股", "美股"] as const).map((tab) => {
                  const active = pickerTab === tab;
                  // 从 stats 取真实市场池数量
                  let poolCount: number | null = null;
                  if (stats) {
                    if (tab === "全部") poolCount = stats.total;
                    else if (tab === "A股")  poolCount = getStat("A")?.count  ?? null;
                    else if (tab === "港股") poolCount = getStat("HK")?.count ?? null;
                    else if (tab === "美股") poolCount = getStat("US")?.count ?? null;
                  }
                  const badgeText = statsLoading
                    ? "…"
                    : poolCount !== null
                    ? poolCount >= 1000
                      ? `${(poolCount / 1000).toFixed(1)}k`
                      : String(poolCount)
                    : null;

                  return (
                    <button key={tab} onClick={() => setPickerTab(tab)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1"
                      style={{
                        background: active ? "rgba(0,229,168,0.15)" : "#0d1f3c",
                        color:      active ? "#00E5A8" : "#94A3B8",
                        border:     `1px solid ${active ? "#00E5A8" : "#1a2f50"}`,
                      }}>
                      {tab}
                      {badgeText && (
                        <span className="text-[9px] font-black px-1 py-0.5 rounded-full leading-none"
                          style={{
                            background: active ? "rgba(0,229,168,0.2)" : "rgba(148,163,184,0.12)",
                            color:      active ? "#00E5A8" : "#64748B",
                          }}>
                          {badgeText}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 市场接入状态小卡片（仅无搜索词时展示） */}
              {!search && (
                <div className="mt-3 px-3 py-2 rounded-xl flex items-start gap-2"
                  style={{ background: "rgba(0,229,168,0.05)", border: "1px solid rgba(0,229,168,0.12)" }}>
                  <Database size={13} color="#00E5A8" className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {statsLoading ? (
                      <div className="flex items-center gap-1.5">
                        <Loader2 size={11} color="#00E5A8" className="animate-spin" />
                        <span className="text-[11px]" style={{ color: "#64748B" }}>正在获取市场数据…</span>
                      </div>
                    ) : statsError ? (
                      <span className="text-[11px]" style={{ color: "#64748B" }}>数量获取失败，搜索功能正常可用</span>
                    ) : stats ? (
                      <div className="flex gap-3 flex-wrap">
                        {stats.markets.map((m) => (
                          <span key={m.market} className="text-[11px] flex items-center gap-1">
                            <span style={{ color: "#94A3B8" }}>{m.name}</span>
                            <span className="font-bold num" style={{ color: "#F8FAFC" }}>
                              {m.count >= 1000
                                ? `${m.count.toLocaleString("zh-CN")}只`
                                : `${m.count}只`}
                            </span>
                            <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                              style={{
                                background: m.coverage === "full"
                                  ? "rgba(0,229,168,0.12)" : "rgba(250,204,21,0.12)",
                                color: m.coverage === "full" ? "#00E5A8" : "#FACC15",
                              }}>
                              {m.coverageLabel}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {/* 提示文字 */}
            {!search && (
              <div className="px-5 pb-2">
                <p className="text-[11px]" style={{ color: "#64748B" }}>
                  热门股票 · 输入名称或代码搜索全部 {pickerTab !== "全部" ? pickerTab : "A股/港股/美股"}
                </p>
              </div>
            )}

            {/* 股票列表（可滚动） */}
            <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-2">
              {searchLoading && search ? (
                <div className="text-center py-10">
                  <Loader2 size={24} color="#00E5A8" className="animate-spin mx-auto mb-2" />
                  <p className="text-[13px]" style={{ color: "#64748B" }}>搜索中…</p>
                </div>
              ) : pickerStocks.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-[13px]" style={{ color: "#64748B" }}>未找到相关股票</p>
                </div>
              ) : (
                pickerStocks.map((s) => {
                  const added = watchlist.includes(s.symbol);
                  return (
                    <button key={s.symbol}
                      className="w-full flex items-center justify-between p-3 rounded-xl active:opacity-70"
                      style={{
                        background: added ? "rgba(0,229,168,0.06)" : "#0d1f3c",
                        border: `1px solid ${added ? "rgba(0,229,168,0.25)" : "#1a2f50"}`,
                      }}
                      onClick={() => toggleStock(s.symbol)}>
                      {/* 左：头像 + 名称 */}
                      <div className="flex items-center gap-2.5 text-left">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[13px] flex-shrink-0"
                          style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>{s.name}</span>
                            <span className="text-[10px] px-1 py-0.5 rounded font-bold"
                              style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
                              {formatMarket(s.market)}
                            </span>
                          </div>
                          <p className="text-[11px]" style={{ color: "#94A3B8" }}>{s.symbol} · {s.industry}</p>
                        </div>
                      </div>
                      {/* 右：价格 + 添加/已添加 */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="font-bold text-[13px] num" style={{ color: "#F8FAFC" }}>
                            {formatPrice(s.price, s.currency)}
                          </p>
                          <p className="text-[11px] num font-semibold" style={{ color: pnlColor(s.changePct) }}>
                            {formatPct(s.changePct)}
                          </p>
                        </div>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: added ? "rgba(0,229,168,0.15)" : "rgba(0,229,168,0.1)",
                            border: `1px solid ${added ? "#00E5A8" : "rgba(0,229,168,0.3)"}`,
                          }}>
                          {added
                            ? <Check size={14} color="#00E5A8" />
                            : <Plus size={14} color="#00E5A8" />
                          }
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
