"use client";

/**
 * SectorDetailClient — 板块详情客户端组件
 *
 * 功能：
 *  - 实时行情批量获取（轮询 30s）
 *  - 搜索（股票名 / 代码）
 *  - 排序（涨跌幅 / 成交额 / 市值 / 换手率）
 *  - 筛选（上涨/下跌 / ST/非ST / 已关注）
 *  - 自选股联动（addToWatchlist / removeFromWatchlist / isInWatchlist）
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Search, X, ArrowUpDown, TrendingUp, TrendingDown,
  Star, StarOff, RefreshCw, ChevronRight, SlidersHorizontal,
  Filter, CheckCircle2,
} from "lucide-react";
import {
  addToWatchlist, removeFromWatchlist, isInWatchlist,
  type WatchlistItem,
} from "@/lib/watchlistService";
import { SECTOR_META } from "@/lib/sectorService";

// ── 类型定义 ─────────────────────────────────────────────────────────
export interface SectorStock {
  symbol:         string;
  tsCode:         string;
  name:           string;
  exchange:       string;
  industry:       string;
  swIndustry:     string;
  area:           string;
  listDate:       string;
  isST:           boolean;
  price:          number | null;
  changePct:      number | null;
  changeAmt:      number | null;
  volume:         number | null;
  amount:         number | null;
  turnoverRate:   number | null;
  marketCap:      number | null;
  floatMarketCap: number | null;
  pe:             number | null;
  pb:             number | null;
  isRealtime:     boolean;
}

type SortKey = "changePct" | "amount" | "marketCap" | "turnoverRate" | "name";
type SortDir = "asc" | "desc";
type FilterMode = "all" | "up" | "down" | "flat";

interface Props {
  swIndustry: string;
}

// ── 格式化工具 ────────────────────────────────────────────────────────
function fmtPct(v: number | null): string {
  if (v == null) return "--";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}
function fmtPrice(v: number | null): string {
  if (v == null) return "--";
  return v.toFixed(2);
}
function fmtAmt(v: number | null): string {
  if (v == null) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(0);
}
function fmtCap(v: number | null): string {
  if (v == null) return "--";
  if (v >= 1e12) return (v / 1e12).toFixed(1) + "万亿";
  if (v >= 1e8)  return (v / 1e8).toFixed(1) + "亿";
  return (v / 1e4).toFixed(0) + "万";
}
function fmtTurn(v: number | null): string {
  if (v == null) return "--";
  return v.toFixed(2) + "%";
}
function changePctColor(v: number | null): string {
  if (v == null) return "#94A3B8";
  if (v > 0.05) return "#EF4444";
  if (v < -0.05) return "#22C55E";
  return "#94A3B8";
}

// ── 主组件 ────────────────────────────────────────────────────────────
export default function SectorDetailClient({ swIndustry }: Props) {
  const meta  = SECTOR_META[swIndustry] ?? SECTOR_META["未分类"];
  const color = meta.color;

  const [stocks,      setStocks]      = useState<SectorStock[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [quoteOk,     setQuoteOk]     = useState(false);
  const [updatedAt,   setUpdatedAt]   = useState<string>("");
  const [error,       setError]       = useState<string | null>(null);

  // UI 状态
  const [search,      setSearch]      = useState("");
  const [sortKey,     setSortKey]     = useState<SortKey>("changePct");
  const [sortDir,     setSortDir]     = useState<SortDir>("desc");
  const [filterMode,  setFilterMode]  = useState<FilterMode>("all");
  const [hideST,      setHideST]      = useState(false);
  const [watchOnly,   setWatchOnly]   = useState(false);
  const [showFilter,  setShowFilter]  = useState(false);
  const [refreshKey,  setRefreshKey]  = useState(0);

  // 自选股状态（本地缓存，避免多次 localStorage 读取）
  const [watched, setWatched] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 初始化自选股集合
    const list = (typeof window !== "undefined")
      ? JSON.parse(localStorage.getItem("quantplanet_watchlist_v1") ?? "[]")
      : [];
    setWatched(new Set((list as WatchlistItem[]).map(i => i.symbol)));
  }, []);

  // ── 数据获取 ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const encoded = encodeURIComponent(swIndustry);
      const res = await fetch(`/api/sectors/${encoded}?quotes=1`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "加载失败");
        return;
      }
      setStocks(data.stocks ?? []);
      setQuoteOk(data.quoteOk ?? false);
      setUpdatedAt(data.updatedAt ?? "");
    } catch (e: unknown) {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [swIndustry, refreshKey]);

  useEffect(() => { load(); }, [load]);

  // 30s 自动刷新
  useEffect(() => {
    const timer = setInterval(() => setRefreshKey(k => k + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // ── 过滤 & 排序 ─────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let result = [...stocks];

    // 搜索
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.symbol.includes(q) ||
        s.tsCode.toLowerCase().includes(q)
      );
    }

    // 涨跌筛选
    if (filterMode === "up")   result = result.filter(s => (s.changePct ?? 0) > 0.05);
    if (filterMode === "down") result = result.filter(s => (s.changePct ?? 0) < -0.05);
    if (filterMode === "flat") result = result.filter(s => Math.abs(s.changePct ?? 0) <= 0.05);

    // ST 筛选
    if (hideST) result = result.filter(s => !s.isST);

    // 自选股筛选
    if (watchOnly) result = result.filter(s => watched.has(s.symbol));

    // 排序
    result.sort((a, b) => {
      let va: number | string | null = null;
      let vb: number | string | null = null;
      if (sortKey === "name")       { va = a.name; vb = b.name; }
      else if (sortKey === "changePct")   { va = a.changePct; vb = b.changePct; }
      else if (sortKey === "amount")      { va = a.amount; vb = b.amount; }
      else if (sortKey === "marketCap")   { va = a.marketCap; vb = b.marketCap; }
      else if (sortKey === "turnoverRate") { va = a.turnoverRate; vb = b.turnoverRate; }

      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = va as number | null;
      const nb = vb as number | null;
      if (na === null && nb === null) return 0;
      if (na === null) return 1;
      if (nb === null) return -1;
      return sortDir === "asc" ? na - nb : nb - na;
    });

    return result;
  }, [stocks, search, filterMode, hideST, watchOnly, sortKey, sortDir, watched]);

  // ── 统计 ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const withQuote = stocks.filter(s => s.changePct !== null);
    const up   = withQuote.filter(s => (s.changePct ?? 0) > 0.05).length;
    const down = withQuote.filter(s => (s.changePct ?? 0) < -0.05).length;
    const flat = withQuote.length - up - down;
    const avg  = withQuote.length > 0
      ? withQuote.reduce((a, s) => a + (s.changePct ?? 0), 0) / withQuote.length
      : null;
    return { up, down, flat, avg, total: stocks.length };
  }, [stocks]);

  // ── 自选股切换 ──────────────────────────────────────────────────────
  function toggleWatch(stock: SectorStock) {
    const inList = watched.has(stock.symbol);
    if (inList) {
      removeFromWatchlist(stock.symbol, "A");
      setWatched(prev => { const s = new Set(prev); s.delete(stock.symbol); return s; });
    } else {
      addToWatchlist({
        symbol:   stock.symbol,
        tsCode:   stock.tsCode || undefined,
        name:     stock.name,
        market:   "A",
        exchange: (stock.exchange || "SH") as "SH" | "SZ" | "BJ",
        industry: stock.swIndustry,
        currency: "CNY",
      });
      setWatched(prev => new Set(prev).add(stock.symbol));
    }
  }

  // ── 排序切换 ────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // ── 渲染 ─────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* 页头 */}
      <div className="flex items-center justify-between px-4 pb-3 page-top-pt">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: `${color}18`, border: `1px solid ${color}25` }}>
            {meta.emoji}
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-wider uppercase" style={{ color }}>Sector</p>
            <h1 className="font-black text-[18px]" style={{ color: "#F8FAFC" }}>{swIndustry}</h1>
          </div>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="w-9 h-9 rounded-xl flex items-center justify-center active:opacity-60"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
        >
          <RefreshCw size={15} color="#94A3B8" className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 行情状态 + 统计 */}
      {!loading && stocks.length > 0 && (
        <div className="px-4 mb-3">
          <div className="p-3 rounded-2xl"
            style={{ background: "#0d1f3c", border: `1px solid ${color}18` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                {quoteOk ? (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#00E5A8" }} />
                    <span className="text-[11px]" style={{ color: "#00E5A8" }}>实时行情</span>
                  </>
                ) : (
                  <span className="text-[11px]" style={{ color: "#64748B" }}>暂无实时行情</span>
                )}
              </div>
              <span className="text-[10px]" style={{ color: "#64748B" }}>
                {updatedAt ? new Date(updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center">
                <p className="font-black text-[16px] num" style={{ color: changePctColor(stats.avg) }}>
                  {stats.avg != null ? fmtPct(stats.avg) : "--"}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>均涨跌幅</p>
              </div>
              <div className="text-center">
                <p className="font-black text-[16px] num" style={{ color: "#EF4444" }}>{stats.up}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>上涨</p>
              </div>
              <div className="text-center">
                <p className="font-black text-[16px] num" style={{ color: "#22C55E" }}>{stats.down}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>下跌</p>
              </div>
              <div className="text-center">
                <p className="font-black text-[16px] num" style={{ color: "#94A3B8" }}>{stats.total}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>总股票</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 搜索栏 */}
      <div className="px-4 mb-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <Search size={14} color="#64748B" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索股票名称或代码..."
              className="flex-1 bg-transparent text-[13px] outline-none"
              style={{ color: "#F8FAFC" }}
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <X size={13} color="#64748B" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilter(f => !f)}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: showFilter ? `${color}18` : "#0d1f3c",
              border: showFilter ? `1px solid ${color}40` : "1px solid #1a2f50",
            }}
          >
            <SlidersHorizontal size={15} color={showFilter ? color : "#94A3B8"} />
          </button>
        </div>
      </div>

      {/* 筛选面板 */}
      {showFilter && (
        <div className="mx-4 mb-2 p-3 rounded-xl space-y-3"
          style={{ background: "#0d1f3c", border: `1px solid ${color}18` }}>

          {/* 涨跌筛选 */}
          <div>
            <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>涨跌方向</p>
            <div className="flex gap-1.5">
              {(["all", "up", "down", "flat"] as FilterMode[]).map(m => {
                const labels: Record<FilterMode, string> = { all: "全部", up: "上涨", down: "下跌", flat: "平盘" };
                const colors: Record<FilterMode, string> = { all: "#94A3B8", up: "#EF4444", down: "#22C55E", flat: "#64748B" };
                const active = filterMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setFilterMode(m)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                    style={{
                      background: active ? `${colors[m]}20` : "transparent",
                      border: active ? `1px solid ${colors[m]}50` : "1px solid #1a2f50",
                      color: active ? colors[m] : "#64748B",
                    }}
                  >
                    {labels[m]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 其他过滤 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setHideST(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{
                background: hideST ? "rgba(251,191,36,0.15)" : "transparent",
                border: hideST ? "1px solid rgba(251,191,36,0.4)" : "1px solid #1a2f50",
                color: hideST ? "#FBBF24" : "#64748B",
              }}
            >
              {hideST && <CheckCircle2 size={11} color="#FBBF24" />}
              过滤ST
            </button>
            <button
              onClick={() => setWatchOnly(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{
                background: watchOnly ? "rgba(0,229,168,0.15)" : "transparent",
                border: watchOnly ? "1px solid rgba(0,229,168,0.4)" : "1px solid #1a2f50",
                color: watchOnly ? "#00E5A8" : "#64748B",
              }}
            >
              {watchOnly && <CheckCircle2 size={11} color="#00E5A8" />}
              只看自选
            </button>
          </div>
        </div>
      )}

      {/* 排序栏 */}
      <div className="px-4 mb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {([
            { key: "changePct",   label: "涨跌幅" },
            { key: "amount",      label: "成交额" },
            { key: "marketCap",   label: "市值"   },
            { key: "turnoverRate",label: "换手率" },
          ] as { key: SortKey; label: string }[]).map(({ key, label }) => {
            const active = sortKey === key;
            return (
              <button
                key={key}
                onClick={() => toggleSort(key)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold flex-shrink-0"
                style={{
                  background: active ? `${color}18` : "#0d1f3c",
                  border: active ? `1px solid ${color}40` : "1px solid #1a2f50",
                  color: active ? color : "#64748B",
                }}
              >
                {label}
                {active && (
                  <ArrowUpDown size={10} color={color} className={sortDir === "asc" ? "rotate-180" : ""} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 结果数 */}
      <div className="px-4 mb-2">
        <p className="text-[11px]" style={{ color: "#64748B" }}>
          共 {displayed.length} 只{search || filterMode !== "all" || hideST || watchOnly ? "（已筛选）" : ""}
        </p>
      </div>

      {/* 加载中 */}
      {loading && (
        <div className="px-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "#0d1f3c" }} />
          ))}
        </div>
      )}

      {/* 错误 */}
      {!loading && error && (
        <div className="mx-4 p-4 rounded-2xl text-center"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "#EF4444" }}>⚠️ {error}</p>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="mt-2 text-[11px] px-3 py-1 rounded-lg"
            style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}
          >
            重试
          </button>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && displayed.length === 0 && (
        <div className="mx-4 p-8 rounded-2xl text-center"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <p className="text-[13px]" style={{ color: "#64748B" }}>
            {stocks.length === 0 ? "该板块暂无股票数据" : "没有符合条件的股票"}
          </p>
        </div>
      )}

      {/* 股票列表 */}
      {!loading && !error && (
        <div className="px-4 space-y-2 pb-28">
          {displayed.map(stock => {
            const inWatch = watched.has(stock.symbol);
            const pctColor = changePctColor(stock.changePct);

            return (
              <div key={stock.symbol}
                className="p-3 rounded-2xl"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-center gap-2">
                  {/* 自选按钮 */}
                  <button
                    onClick={() => toggleWatch(stock)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 active:opacity-60"
                    style={{
                      background: inWatch ? "rgba(0,229,168,0.12)" : "rgba(148,163,184,0.08)",
                      border: inWatch ? "1px solid rgba(0,229,168,0.25)" : "1px solid #1a2f50",
                    }}
                  >
                    {inWatch
                      ? <Star size={14} color="#00E5A8" fill="#00E5A8" />
                      : <Star size={14} color="#64748B" />}
                  </button>

                  {/* 股票信息 */}
                  <Link href={`/stock/${stock.symbol}`} className="flex-1 min-w-0 active:opacity-70">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>
                            {stock.name}
                          </span>
                          {stock.isST && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                              style={{ background: "rgba(251,191,36,0.15)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.3)" }}>
                              ST
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px]" style={{ color: "#64748B" }}>{stock.symbol}</span>
                          <span className="text-[10px] px-1 rounded"
                            style={{ background: "#1a2f50", color: "#64748B" }}>
                            {stock.exchange}
                          </span>
                          {stock.area && (
                            <span className="text-[10px]" style={{ color: "#4B5563" }}>{stock.area}</span>
                          )}
                        </div>
                      </div>

                      {/* 价格与涨跌幅 */}
                      <div className="text-right flex-shrink-0 min-w-[80px]">
                        <p className="font-black text-[15px] num" style={{ color: pctColor }}>
                          {fmtPct(stock.changePct)}
                        </p>
                        <p className="text-[11px] num mt-0.5" style={{ color: "#94A3B8" }}>
                          ¥{fmtPrice(stock.price)}
                        </p>
                      </div>
                    </div>

                    {/* 底部数据行 */}
                    {(stock.amount !== null || stock.marketCap !== null || stock.turnoverRate !== null) && (
                      <div className="flex items-center gap-3 mt-2 pt-2"
                        style={{ borderTop: "1px solid #1a2f50" }}>
                        {stock.amount !== null && (
                          <span className="text-[10px]" style={{ color: "#64748B" }}>
                            额 <span style={{ color: "#94A3B8" }}>{fmtAmt(stock.amount)}</span>
                          </span>
                        )}
                        {stock.marketCap !== null && (
                          <span className="text-[10px]" style={{ color: "#64748B" }}>
                            总值 <span style={{ color: "#94A3B8" }}>{fmtCap(stock.marketCap)}</span>
                          </span>
                        )}
                        {stock.turnoverRate !== null && (
                          <span className="text-[10px]" style={{ color: "#64748B" }}>
                            换手 <span style={{ color: "#94A3B8" }}>{fmtTurn(stock.turnoverRate)}</span>
                          </span>
                        )}
                        {!stock.isRealtime && stock.price !== null && (
                          <span className="text-[10px]" style={{ color: "#4B5563" }}>非实时</span>
                        )}
                      </div>
                    )}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
