"use client";
/**
 * app/watchlist/page.tsx — 我的自选股
 *
 * 数据层：lib/watchlistService (localStorage key: quantplanet_watchlist_v1)
 * 价格层：useWatchlistQuotes（每30s刷新，仅显示实时行情，fallback显示"--"）
 *
 * 修复要点：
 * 1. 不再使用 DEFAULT_WATCHLIST / MOCK_STOCKS 作为初始自选股
 * 2. 添加 → 写 localStorage → 立即显示
 * 3. 删除 → 写 localStorage → 立即消失，重启不恢复
 * 4. 新用户显示空状态，不自动注入任何股票
 */
import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Search, Star, TrendingUp, TrendingDown,
  X, Check, Loader2, Database, AlertCircle,
} from "lucide-react";
import { useWatchlist }            from "@/lib/useWatchlist";
import type { WatchlistItem, WatchlistMarket } from "@/lib/watchlistService";
import { symbolToTsCode }          from "@/lib/watchlistService";
import type { StockInfo, Market }  from "@/lib/stockService";
import PageHeader                  from "@/components/layout/PageHeader";
import { formatPct, formatPrice, pnlColor, marketColor, formatMarket } from "@/lib/utils";
import { useWatchlistQuotes }      from "@/lib/useMarketData";
import { useStockSearch }          from "@/lib/useStockSearch";
import { useMarketStats }          from "@/lib/useMarketStats";

// ── 颜色 ─────────────────────────────────────────────────────────
const BG    = "#07111F";
const CARD  = "#0d1f3c";
const PANEL = "#0a1628";
const BORDER = "#1a2f50";
const G = "#00E5A8";
const R = "#EF4444";
const MID = "#94A3B8";
const DIM = "#64748B";

type MarketTab = "全部" | "A股" | "港股" | "美股";
const MARKET_MAP: Record<MarketTab, WatchlistMarket | null> = {
  "全部": null, "A股": "A", "港股": "HK", "美股": "US",
};

// ── StockInfo → WatchlistItem ────────────────────────────────────
function stockInfoToWatchlistItem(
  s: StockInfo,
): Omit<WatchlistItem, "addedAt"> {
  return {
    symbol:   s.symbol,
    tsCode:   s.market === "A" ? symbolToTsCode(s.symbol) : undefined,
    name:     s.name,
    market:   s.market as WatchlistMarket,
    exchange: s.exchange,
    industry: s.industry,
    currency: s.currency as "CNY" | "HKD" | "USD",
  };
}

// ── 删除确认对话框 ────────────────────────────────────────────────
function ConfirmDialog({
  stock,
  onConfirm,
  onCancel,
}: {
  stock: WatchlistItem;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={18} color={R} />
          <p className="font-bold text-[15px]" style={{ color: "#F8FAFC" }}>
            移出自选股
          </p>
        </div>
        <p className="text-[13px] mb-5" style={{ color: MID }}>
          确定将 <span style={{ color: "#F8FAFC", fontWeight: 700 }}>{stock.name}</span>{" "}
          从自选股中删除吗？删除后重启 App 也不会恢复。
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-semibold text-[13px]"
            style={{ background: "#1a2f50", color: MID }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-bold text-[13px]"
            style={{ background: "rgba(239,68,68,0.15)", color: R, border: `1px solid rgba(239,68,68,0.3)` }}
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 股票卡片 ─────────────────────────────────────────────────────
function StockCard({
  item,
  quotes,
  realtimeSet,
  onDelete,
}: {
  item: WatchlistItem;
  quotes: Record<string, Partial<{ price: number; changePct: number; change: number }>>;
  realtimeSet: Set<string>;
  onDelete: (item: WatchlistItem) => void;
}) {
  const q         = quotes[item.symbol];
  const price     = q?.price ?? null;
  const changePct = q?.changePct ?? null;
  const hasQuote  = price !== null && price > 0;

  return (
    <div className="relative">
      <Link href={`/stock/${item.symbol}`}>
        <div
          className="flex items-center justify-between p-4 rounded-2xl active:opacity-80 transition-opacity"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}
        >
          {/* 左：头像 + 信息 */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[13px] flex-shrink-0"
              style={{ background: `${marketColor(item.market)}18`, color: marketColor(item.market) }}
            >
              {item.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-[14px] truncate" style={{ color: "#F8FAFC" }}>
                  {item.name}
                </span>
                <span
                  className="text-[10px] font-bold px-1 py-0.5 rounded flex-shrink-0"
                  style={{ background: `${marketColor(item.market)}18`, color: marketColor(item.market) }}
                >
                  {formatMarket(item.market)}
                </span>
              </div>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: MID }}>
                {item.symbol} · {item.industry || "—"}
              </p>
            </div>
          </div>

          {/* 右：价格 */}
          <div className="text-right pr-7 flex-shrink-0">
            <div className="flex items-center justify-end gap-1 mb-0.5">
              {realtimeSet.has(item.symbol) && (
                <span
                  className="text-[9px] px-1 py-0.5 rounded font-bold"
                  style={{ background: "rgba(0,229,168,0.12)", color: G }}
                >
                  实时
                </span>
              )}
              <p className="font-bold text-[15px] num" style={{ color: "#F8FAFC" }}>
                {hasQuote ? formatPrice(price!, item.currency) : "—"}
              </p>
            </div>
            {changePct !== null ? (
              <div className="flex items-center justify-end gap-1">
                {changePct > 0
                  ? <TrendingUp  size={11} color="#EF4444" />
                  : changePct < 0
                  ? <TrendingDown size={11} color="#22C55E" />
                  : null
                }
                <span className="font-bold text-[13px] num" style={{ color: pnlColor(changePct) }}>
                  {formatPct(changePct)}
                </span>
              </div>
            ) : (
              <p className="text-[11px]" style={{ color: DIM }}>行情获取中…</p>
            )}
          </div>
        </div>
      </Link>

      {/* 删除按钮 */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(item); }}
        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center active:opacity-60"
        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.2)" }}
        aria-label="删除自选股"
      >
        <X size={12} color={R} />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 主页面
// ════════════════════════════════════════════════════════════════
export default function WatchlistPage() {
  const { watchlist, hydrated, add, remove } = useWatchlist();

  const [activeTab, setActiveTab]     = useState<MarketTab>("全部");
  const [showAdd,   setShowAdd]       = useState(false);
  const [search,    setSearch]        = useState("");
  const [pickerTab, setPickerTab]     = useState<MarketTab>("全部");
  const [confirmItem, setConfirmItem] = useState<WatchlistItem | null>(null);
  const [toast, setToast]             = useState<string | null>(null);

  // 市场接入统计（添加面板用）
  const { stats, loading: statsLoading, error: statsError, getStat } = useMarketStats();

  // 当前 tab 筛选后的列表
  const filtered = activeTab === "全部"
    ? watchlist
    : watchlist.filter((s) => s.market === MARKET_MAP[activeTab]);

  // 行情（对所有自选股批量请求）
  const symbols = watchlist.map((s) => s.symbol);
  const { quotes, realtimeSet } = useWatchlistQuotes(symbols);

  // 搜索
  const { results: pickerStocks, loading: searchLoading } = useStockSearch(
    search,
    MARKET_MAP[pickerTab],
  );

  // ── 删除逻辑 ───────────────────────────────────────────────────
  const handleDeleteConfirm = useCallback(() => {
    if (!confirmItem) return;
    remove(confirmItem.symbol, confirmItem.market);
    setConfirmItem(null);
    showToast("已移出自选股");
  }, [confirmItem, remove]);

  // ── 添加逻辑 ───────────────────────────────────────────────────
  const handleAdd = useCallback(
    (s: StockInfo) => {
      const already = watchlist.some(
        (w) => w.symbol === s.symbol && w.market === s.market,
      );
      if (already) {
        showToast("已在自选股中");
        return;
      }
      const item = stockInfoToWatchlistItem(s);
      add(item);
      showToast(`${s.name} 已加入自选股 ✓`);
    },
    [watchlist, add],
  );

  // ── Toast ──────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function closeAdd() {
    setShowAdd(false);
    setSearch("");
    setPickerTab("全部");
  }

  // ── 加载骨架 ───────────────────────────────────────────────────
  if (!hydrated) {
    return (
      <div style={{ background: BG, minHeight: "100vh" }}>
        <PageHeader title="我的自选股" showBack={false} />
        <div className="px-4 pt-10 flex flex-col items-center gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-full h-16 rounded-2xl animate-pulse"
              style={{ background: CARD }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: "100vh" }}>
      <PageHeader
        title="我的自选股"
        showBack={false}
        right={
          <button
            onClick={() => setShowAdd(true)}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,229,168,0.12)", border: "1px solid rgba(0,229,168,0.25)" }}
          >
            <Plus size={18} color={G} />
          </button>
        }
      />

      {/* ── 市场分类标签 ─────────────────────────────────────── */}
      <div className="flex gap-2 px-4 py-3">
        {(["全部", "A股", "港股", "美股"] as const).map((tab) => {
          const count =
            tab === "全部"
              ? watchlist.length
              : watchlist.filter((s) => s.market === MARKET_MAP[tab]).length;
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold flex items-center gap-1"
              style={{
                background: active ? G : CARD,
                color:      active ? "#07111F" : MID,
                border:     `1px solid ${active ? G : BORDER}`,
              }}
            >
              {tab}
              <span
                className="text-[10px] font-black px-1 rounded-full min-w-[16px] text-center"
                style={{
                  background: active ? "rgba(0,0,0,0.15)" : "rgba(148,163,184,0.15)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 列表头 ──────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-1">
          <span className="text-[11px] font-semibold" style={{ color: MID }}>名称/代码</span>
          <div className="flex gap-8 pr-6">
            <span className="text-[11px] font-semibold" style={{ color: MID }}>最新价</span>
            <span className="text-[11px] font-semibold" style={{ color: MID }}>涨跌幅</span>
          </div>
        </div>
      )}

      {/* ── 股票列表 ─────────────────────────────────────────── */}
      <div className="px-4 space-y-2 pb-28 mt-1">
        {filtered.map((item) => (
          <StockCard
            key={`${item.symbol}-${item.market}`}
            item={item}
            quotes={quotes}
            realtimeSet={realtimeSet}
            onDelete={(it) => setConfirmItem(it)}
          />
        ))}

        {/* 空状态 */}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Star size={44} color={BORDER} className="mx-auto mb-4" />
            <p className="font-bold text-[15px] mb-1" style={{ color: MID }}>
              {activeTab === "全部" ? "暂无自选股" : `暂无${activeTab}自选股`}
            </p>
            <p className="text-[12px] mb-5" style={{ color: DIM }}>
              {activeTab === "全部"
                ? "点击右上角 + 搜索并添加股票"
                : `切换到"全部"后点击 + 添加${activeTab}股票`}
            </p>
            {activeTab === "全部" && (
              <button
                onClick={() => setShowAdd(true)}
                className="px-6 py-2.5 rounded-xl font-bold text-[13px]"
                style={{ background: "rgba(0,229,168,0.12)", color: G, border: `1px solid rgba(0,229,168,0.3)` }}
              >
                <Plus size={14} className="inline mr-1" />
                添加自选股
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 删除确认弹窗 ─────────────────────────────────────── */}
      {confirmItem && (
        <ConfirmDialog
          stock={confirmItem}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmItem(null)}
        />
      )}

      {/* ── Toast 提示 ──────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-[13px] font-semibold z-[300] whitespace-nowrap"
          style={{ background: "rgba(13,31,60,0.95)", color: "#F8FAFC", border: `1px solid ${BORDER}`, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
        >
          {toast}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          添加自选股面板（底部弹出）
          ════════════════════════════════════════════════════════ */}
      {showAdd && (
        <div
          className="fixed inset-0 z-[100] flex items-end"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeAdd(); }}
        >
          <div
            className="w-full max-w-[480px] mx-auto rounded-t-3xl flex flex-col"
            style={{ background: PANEL, border: `1px solid ${BORDER}`, maxHeight: "90vh" }}
          >
            {/* 头部 */}
            <div className="flex-shrink-0 px-5 pt-4 pb-3">
              <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: BORDER }} />

              <div className="flex items-center justify-between mb-3">
                <p className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>
                  添加自选股
                  <span className="ml-2 text-[12px] font-normal" style={{ color: MID }}>
                    已选 {watchlist.length} 只
                    {!statsLoading && !statsError && stats
                      ? ` · 共 ${(stats.total ?? 0).toLocaleString("zh-CN")} 只可选`
                      : ""}
                  </span>
                </p>
                <button
                  onClick={closeAdd}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: BORDER }}
                >
                  <X size={14} color={MID} />
                </button>
              </div>

              {/* 搜索框 */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}
              >
                {searchLoading
                  ? <Loader2 size={14} color={G} className="animate-spin" />
                  : <Search size={14} color={MID} />
                }
                <input
                  autoFocus
                  className="flex-1 bg-transparent text-[14px] outline-none"
                  style={{ color: "#F8FAFC" }}
                  placeholder="搜索股票名称、代码（如 茅台 / 600519 / AAPL）"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch("")}>
                    <X size={13} color={DIM} />
                  </button>
                )}
              </div>

              {/* 市场筛选 */}
              <div className="flex gap-2">
                {(["全部", "A股", "港股", "美股"] as const).map((tab) => {
                  const active = pickerTab === tab;
                  let poolCount: number | null = null;
                  if (stats) {
                    if      (tab === "全部") poolCount = stats.total;
                    else if (tab === "A股")  poolCount = getStat("A")?.count  ?? null;
                    else if (tab === "港股") poolCount = getStat("HK")?.count ?? null;
                    else if (tab === "美股") poolCount = getStat("US")?.count ?? null;
                  }
                  const badge = statsLoading
                    ? "…"
                    : poolCount !== null
                    ? poolCount >= 1000 ? `${(poolCount / 1000).toFixed(1)}k` : String(poolCount)
                    : null;

                  return (
                    <button
                      key={tab}
                      onClick={() => setPickerTab(tab)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1"
                      style={{
                        background: active ? "rgba(0,229,168,0.15)" : CARD,
                        color:      active ? G : MID,
                        border:     `1px solid ${active ? G : BORDER}`,
                      }}
                    >
                      {tab}
                      {badge && (
                        <span
                          className="text-[9px] font-black px-1 py-0.5 rounded-full leading-none"
                          style={{
                            background: active ? "rgba(0,229,168,0.2)" : "rgba(148,163,184,0.12)",
                            color:      active ? G : DIM,
                          }}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 市场接入状态 */}
              {!search && (
                <div
                  className="mt-3 px-3 py-2 rounded-xl flex items-start gap-2"
                  style={{ background: "rgba(0,229,168,0.05)", border: "1px solid rgba(0,229,168,0.12)" }}
                >
                  <Database size={13} color={G} className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {statsLoading ? (
                      <div className="flex items-center gap-1.5">
                        <Loader2 size={11} color={G} className="animate-spin" />
                        <span className="text-[11px]" style={{ color: DIM }}>正在获取市场数据…</span>
                      </div>
                    ) : statsError ? (
                      <span className="text-[11px]" style={{ color: DIM }}>数量获取失败，搜索功能正常可用</span>
                    ) : stats ? (
                      <div className="flex gap-3 flex-wrap">
                        {stats.markets.map((m) => (
                          <span key={m.market} className="text-[11px] flex items-center gap-1">
                            <span style={{ color: MID }}>{m.name}</span>
                            <span className="font-bold num" style={{ color: "#F8FAFC" }}>
                              {m.count >= 1000 ? `${m.count.toLocaleString("zh-CN")}只` : `${m.count}只`}
                            </span>
                            <span
                              className="text-[9px] px-1 py-0.5 rounded font-bold"
                              style={{
                                background: m.coverage === "full" ? "rgba(0,229,168,0.12)" : "rgba(250,204,21,0.12)",
                                color: m.coverage === "full" ? G : "#FACC15",
                              }}
                            >
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

            {/* 提示 */}
            {!search && (
              <div className="px-5 pb-2">
                <p className="text-[11px]" style={{ color: DIM }}>
                  热门股票 · 输入名称或代码搜索全部 {pickerTab !== "全部" ? pickerTab : "A股/港股/美股"}
                </p>
              </div>
            )}

            {/* 搜索结果列表 */}
            <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-2">
              {searchLoading && search ? (
                <div className="text-center py-10">
                  <Loader2 size={24} color={G} className="animate-spin mx-auto mb-2" />
                  <p className="text-[13px]" style={{ color: DIM }}>搜索中…</p>
                </div>
              ) : pickerStocks.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-[13px]" style={{ color: DIM }}>
                    {search ? "未找到相关股票" : "暂无数据"}
                  </p>
                </div>
              ) : (
                pickerStocks.map((s) => {
                  const added = watchlist.some(
                    (w) => w.symbol === s.symbol && w.market === s.market,
                  );
                  return (
                    <button
                      key={`${s.symbol}-${s.market}`}
                      className="w-full flex items-center justify-between p-3 rounded-xl active:opacity-70"
                      style={{
                        background: added ? "rgba(0,229,168,0.06)" : CARD,
                        border: `1px solid ${added ? "rgba(0,229,168,0.25)" : BORDER}`,
                      }}
                      onClick={() => handleAdd(s)}
                    >
                      {/* 左：头像 + 名称 */}
                      <div className="flex items-center gap-2.5 text-left">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[13px] flex-shrink-0"
                          style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}
                        >
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
                              {s.name}
                            </span>
                            <span
                              className="text-[10px] px-1 py-0.5 rounded font-bold"
                              style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}
                            >
                              {formatMarket(s.market)}
                            </span>
                          </div>
                          <p className="text-[11px]" style={{ color: MID }}>
                            {s.symbol} · {s.industry}
                          </p>
                        </div>
                      </div>

                      {/* 右：价格 + 状态 */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="font-bold text-[13px] num" style={{ color: "#F8FAFC" }}>
                            {formatPrice(s.price, s.currency)}
                          </p>
                          <p
                            className="text-[11px] num font-semibold"
                            style={{ color: pnlColor(s.changePct) }}
                          >
                            {formatPct(s.changePct)}
                          </p>
                        </div>
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: added ? "rgba(0,229,168,0.15)" : "rgba(0,229,168,0.10)",
                            border: `1px solid ${added ? G : "rgba(0,229,168,0.3)"}`,
                          }}
                        >
                          {added
                            ? <Check size={14} color={G} />
                            : <Plus  size={14} color={G} />
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
