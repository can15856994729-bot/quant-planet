"use client";

/**
 * EMSectorDetailClient — 东方财富板块详情页客户端组件
 *
 * 功能：
 *  - 拉取板块详情（名称/涨跌/成交/主力流入/上涨家数）
 *  - 拉取板块成分股（含实时行情）
 *  - 搜索（名称 / 代码）
 *  - 排序（涨跌幅 / 成交额 / 市值 / 换手率 / 主力净流入）
 *  - 筛选（涨跌方向 / ST过滤 / 只看自选）
 *  - 自选股联动
 *  - 30s 自动刷新
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Search, X, ArrowUpDown, RefreshCw,
  Star, SlidersHorizontal, CheckCircle2, TrendingUp,
} from "lucide-react";
import {
  addToWatchlist, removeFromWatchlist,
  type WatchlistItem,
} from "@/lib/watchlistService";
import type { EMSector, EMSectorStock } from "@/lib/eastMoneySectorService";

// ── 格式化工具 ────────────────────────────────────────────────────────────
function fmtPct(v: number | null): string {
  if (v == null) return "--";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}
function fmtPrice(v: number | null): string {
  if (v == null) return "--";
  return v.toFixed(2);
}
function fmtAmt(v: number | null): string {
  if (v == null) return "--";
  if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(2) + "万亿";
  if (Math.abs(v) >= 1e8)  return (v / 1e8).toFixed(2) + "亿";
  if (Math.abs(v) >= 1e4)  return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(0);
}
function fmtCap(v: number | null): string {
  if (v == null) return "--";
  if (v >= 1e12) return (v / 1e12).toFixed(1) + "万亿";
  if (v >= 1e8)  return (v / 1e8).toFixed(1) + "亿";
  return (v / 1e4).toFixed(0) + "万";
}
function fmtFlow(v: number | null): string {
  if (v == null) return "--";
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(2)}万`;
  return `${sign}${abs.toFixed(0)}`;
}
function pctColor(v: number | null): string {
  if (v == null) return "#94A3B8";
  if (v > 0.05)  return "#EF4444";
  if (v < -0.05) return "#22C55E";
  return "#94A3B8";
}
function flowColor(v: number | null): string {
  if (v == null) return "#94A3B8";
  if (v > 0)     return "#EF4444";
  if (v < 0)     return "#22C55E";
  return "#94A3B8";
}

// ── 类型 ──────────────────────────────────────────────────────────────────
type SortKey = "changePct" | "amount" | "marketCap" | "turnoverRate" | "mainFlow";
type SortDir = "asc" | "desc";
type FilterMode = "all" | "up" | "down" | "flat";

interface Props {
  sectorCode: string;  // e.g. "BK0477"
}

// 东财板块类型标签
const TYPE_LABELS: Record<string, string> = {
  industry: "行业板块",
  concept:  "概念板块",
  region:   "地域板块",
  special:  "特色板块",
};

// 板块颜色
const TYPE_COLORS: Record<string, string> = {
  industry: "#3B82F6",
  concept:  "#8B5CF6",
  region:   "#10B981",
  special:  "#F59E0B",
};

// ── 主组件 ────────────────────────────────────────────────────────────────
export default function EMSectorDetailClient({ sectorCode }: Props) {
  const upper = sectorCode.toUpperCase();

  const [sector,  setSector]  = useState<EMSector | null>(null);
  const [stocks,  setStocks]  = useState<EMSectorStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // UI 状态
  const [search,      setSearch]      = useState("");
  const [sortKey,     setSortKey]     = useState<SortKey>("changePct");
  const [sortDir,     setSortDir]     = useState<SortDir>("desc");
  const [filterMode,  setFilterMode]  = useState<FilterMode>("all");
  const [hideST,      setHideST]      = useState(false);
  const [watchOnly,   setWatchOnly]   = useState(false);
  const [showFilter,  setShowFilter]  = useState(false);

  // 自选股状态
  const [watched, setWatched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const list: WatchlistItem[] = JSON.parse(
      localStorage.getItem("quantplanet_watchlist_v1") ?? "[]"
    );
    setWatched(new Set(list.map(i => i.symbol)));
  }, []);

  // ── 数据拉取 ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sectorRes, stocksRes] = await Promise.all([
        fetch(`/api/eastmoney/sectors/${upper}`),
        fetch(`/api/eastmoney/sectors/${upper}/stocks`),
      ]);
      const [sd, stockD] = await Promise.all([sectorRes.json(), stocksRes.json()]);

      if (sd.ok && sd.sector) setSector(sd.sector);
      if (stockD.ok) setStocks(stockD.stocks ?? []);
      if (!sd.ok && !stockD.ok) {
        setError(sd.error ?? stockD.error ?? "加载失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [upper, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // 30s 自动刷新
  useEffect(() => {
    const t = setInterval(() => setRefreshKey(k => k + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── 过滤 & 排序 ─────────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let r = [...stocks];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(s => s.name.toLowerCase().includes(q) || s.symbol.includes(q));
    }

    if (filterMode === "up")   r = r.filter(s => (s.changePct ?? 0) > 0.05);
    if (filterMode === "down") r = r.filter(s => (s.changePct ?? 0) < -0.05);
    if (filterMode === "flat") r = r.filter(s => Math.abs(s.changePct ?? 0) <= 0.05);

    if (hideST) r = r.filter(s => !s.name.includes("ST") && !s.name.includes("*ST"));
    if (watchOnly) r = r.filter(s => watched.has(s.symbol));

    r.sort((a, b) => {
      let va: number | null = null, vb: number | null = null;
      if (sortKey === "changePct")   { va = a.changePct;   vb = b.changePct; }
      if (sortKey === "amount")      { va = a.amount;      vb = b.amount; }
      if (sortKey === "marketCap")   { va = a.marketCap;   vb = b.marketCap; }
      if (sortKey === "turnoverRate"){ va = a.turnoverRate; vb = b.turnoverRate; }
      if (sortKey === "mainFlow")    { va = a.mainFlow;     vb = b.mainFlow; }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return r;
  }, [stocks, search, filterMode, hideST, watchOnly, sortKey, sortDir, watched]);

  // ── 统计 ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const withQ = stocks.filter(s => s.changePct !== null);
    const up    = withQ.filter(s => (s.changePct ?? 0) > 0.05).length;
    const down  = withQ.filter(s => (s.changePct ?? 0) < -0.05).length;
    const flat  = withQ.length - up - down;
    const avg   = withQ.length > 0
      ? withQ.reduce((acc, s) => acc + (s.changePct ?? 0), 0) / withQ.length
      : null;
    const totalFlow = stocks.reduce((acc, s) => acc + (s.mainFlow ?? 0), 0);
    return { up, down, flat, avg, total: stocks.length, totalFlow };
  }, [stocks]);

  // ── 自选股切换 ──────────────────────────────────────────────────────────
  function toggleWatch(s: EMSectorStock) {
    const inList = watched.has(s.symbol);
    if (inList) {
      removeFromWatchlist(s.symbol, "A");
      setWatched(prev => { const set = new Set(prev); set.delete(s.symbol); return set; });
    } else {
      addToWatchlist({
        symbol:   s.symbol,
        tsCode:   s.tsCode || undefined,
        name:     s.name,
        market:   "A",
        exchange: (s.market === 1 ? "SH" : s.market === 0 ? "SZ" : "BJ") as "SH" | "SZ" | "BJ",
        industry: sector?.name ?? "",
        currency: "CNY",
      });
      setWatched(prev => new Set(prev).add(s.symbol));
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  // ── 颜色 ─────────────────────────────────────────────────────────────────
  const typeColor = sector ? (TYPE_COLORS[sector.type] ?? "#3B82F6") : "#3B82F6";

  // ── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>

      {/* 页头 */}
      <div className="flex items-center justify-between px-4 pb-3 page-top-pt">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: `${typeColor}18`, border: `1px solid ${typeColor}30` }}>
            {sector?.type === "industry" ? "🏭"
              : sector?.type === "concept" ? "💡"
              : sector?.type === "region"  ? "🌍" : "⭐"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold" style={{ color: typeColor }}>
                {sector ? TYPE_LABELS[sector.type] : "东财板块"}
              </p>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ background: `${typeColor}15`, color: typeColor }}>
                {upper}
              </span>
            </div>
            <h1 className="font-black text-[18px]" style={{ color: "#F8FAFC" }}>
              {sector?.name ?? (loading ? "加载中…" : upper)}
            </h1>
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

      {/* 板块统计卡片 */}
      {!loading && (sector || stocks.length > 0) && (
        <div className="px-4 mb-3">
          <div className="p-3 rounded-2xl"
            style={{ background: "#0d1f3c", border: `1px solid ${typeColor}18` }}>
            {/* 第一行：整体涨跌 + 成交额 + 主力净流入 */}
            {sector && (
              <div className="flex items-center justify-between mb-2.5 pb-2.5"
                style={{ borderBottom: "1px solid #1a2f50" }}>
                <div>
                  <p className="font-black text-[22px] num" style={{ color: pctColor(sector.changePct) }}>
                    {fmtPct(sector.changePct)}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>板块涨跌幅</p>
                </div>
                {sector.amount != null && (
                  <div className="text-right">
                    <p className="font-bold text-[13px] num" style={{ color: "#F8FAFC" }}>
                      {fmtAmt(sector.amount)}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>板块成交额</p>
                  </div>
                )}
                {sector.mainFlow != null && (
                  <div className="text-right">
                    <p className="font-bold text-[13px] num" style={{ color: flowColor(sector.mainFlow) }}>
                      {fmtFlow(sector.mainFlow)}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>主力净流入</p>
                  </div>
                )}
              </div>
            )}

            {/* 第二行：上涨/下跌/平/总数 */}
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center">
                <p className="font-black text-[16px] num" style={{ color: pctColor(stats.avg) }}>
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

            {/* 领涨股 */}
            {sector?.leadName && (
              <div className="mt-2.5 pt-2.5 flex items-center gap-1.5"
                style={{ borderTop: "1px solid #1a2f50" }}>
                <TrendingUp size={11} color="#EF4444" />
                <span className="text-[11px]" style={{ color: "#64748B" }}>领涨股：</span>
                <span className="text-[11px] font-semibold" style={{ color: "#EF4444" }}>
                  {sector.leadName}
                </span>
                {sector.leadChangePct != null && (
                  <span className="text-[11px]" style={{ color: "#EF4444" }}>
                    {fmtPct(sector.leadChangePct)}
                  </span>
                )}
                {sector.leadCode && (
                  <Link href={`/stock/${sector.leadCode}`}
                    className="text-[10px] px-1.5 py-0.5 rounded ml-1"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}>
                    详情
                  </Link>
                )}
              </div>
            )}

            {/* 主力净流入（成分股合计） */}
            {stats.totalFlow !== 0 && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[11px]" style={{ color: "#64748B" }}>成分股主力净流入合计：</span>
                <span className="text-[11px] font-semibold num" style={{ color: flowColor(stats.totalFlow) }}>
                  {fmtFlow(stats.totalFlow)}
                </span>
              </div>
            )}
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
              placeholder="搜索股票名称或代码…"
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
              background: showFilter ? `${typeColor}18` : "#0d1f3c",
              border: showFilter ? `1px solid ${typeColor}40` : "1px solid #1a2f50",
            }}
          >
            <SlidersHorizontal size={15} color={showFilter ? typeColor : "#94A3B8"} />
          </button>
        </div>
      </div>

      {/* 筛选面板 */}
      {showFilter && (
        <div className="mx-4 mb-2 p-3 rounded-xl space-y-3"
          style={{ background: "#0d1f3c", border: `1px solid ${typeColor}18` }}>
          <div>
            <p className="text-[11px] font-semibold mb-2" style={{ color: "#94A3B8" }}>涨跌方向</p>
            <div className="flex gap-1.5">
              {(["all", "up", "down", "flat"] as FilterMode[]).map(m => {
                const labels: Record<FilterMode, string>  = { all: "全部", up: "上涨", down: "下跌", flat: "平盘" };
                const colors: Record<FilterMode, string>  = { all: "#94A3B8", up: "#EF4444", down: "#22C55E", flat: "#64748B" };
                const active = filterMode === m;
                return (
                  <button key={m} onClick={() => setFilterMode(m)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                    style={{
                      background: active ? `${colors[m]}20` : "transparent",
                      border: active ? `1px solid ${colors[m]}50` : "1px solid #1a2f50",
                      color: active ? colors[m] : "#64748B",
                    }}>
                    {labels[m]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setHideST(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{
                background: hideST ? "rgba(251,191,36,0.15)" : "transparent",
                border: hideST ? "1px solid rgba(251,191,36,0.4)" : "1px solid #1a2f50",
                color: hideST ? "#FBBF24" : "#64748B",
              }}>
              {hideST && <CheckCircle2 size={11} color="#FBBF24" />}
              过滤ST
            </button>
            <button onClick={() => setWatchOnly(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{
                background: watchOnly ? "rgba(0,229,168,0.15)" : "transparent",
                border: watchOnly ? "1px solid rgba(0,229,168,0.4)" : "1px solid #1a2f50",
                color: watchOnly ? "#00E5A8" : "#64748B",
              }}>
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
            { key: "changePct",    label: "涨跌幅" },
            { key: "amount",       label: "成交额" },
            { key: "marketCap",    label: "市值"   },
            { key: "turnoverRate", label: "换手率" },
            { key: "mainFlow",     label: "主力流入" },
          ] as { key: SortKey; label: string }[]).map(({ key, label }) => {
            const active = sortKey === key;
            return (
              <button key={key} onClick={() => toggleSort(key)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold flex-shrink-0"
                style={{
                  background: active ? `${typeColor}18` : "#0d1f3c",
                  border: active ? `1px solid ${typeColor}40` : "1px solid #1a2f50",
                  color: active ? typeColor : "#64748B",
                }}>
                {label}
                {active && <ArrowUpDown size={10} color={typeColor} className={sortDir === "asc" ? "rotate-180" : ""} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 结果数 */}
      <div className="px-4 mb-2">
        <p className="text-[11px]" style={{ color: "#64748B" }}>
          共 {displayed.length} 只{search || filterMode !== "all" || hideST || watchOnly ? "（已筛选）" : ""}
          {stocks.length > 0 && ` / 共 ${stocks.length} 只成分股`}
        </p>
      </div>

      {/* 加载骨架 */}
      {loading && (
        <div className="px-4 space-y-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "#0d1f3c" }} />
          ))}
        </div>
      )}

      {/* 错误 */}
      {!loading && error && (
        <div className="mx-4 p-4 rounded-2xl text-center"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "#EF4444" }}>⚠️ {error}</p>
          <button onClick={() => setRefreshKey(k => k + 1)}
            className="mt-2 text-[11px] px-3 py-1 rounded-lg"
            style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}>
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
            const pc = pctColor(stock.changePct);
            const isST = stock.name.includes("ST") || stock.name.includes("*ST");

            return (
              <div key={stock.symbol} className="p-3 rounded-2xl"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-center gap-2">
                  {/* 自选 */}
                  <button onClick={() => toggleWatch(stock)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 active:opacity-60"
                    style={{
                      background: inWatch ? "rgba(0,229,168,0.12)" : "rgba(148,163,184,0.08)",
                      border: inWatch ? "1px solid rgba(0,229,168,0.25)" : "1px solid #1a2f50",
                    }}>
                    <Star size={14} color={inWatch ? "#00E5A8" : "#64748B"} fill={inWatch ? "#00E5A8" : "none"} />
                  </button>

                  {/* 股票信息 */}
                  <Link href={`/stock/${stock.symbol}`} className="flex-1 min-w-0 active:opacity-70">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>
                            {stock.name}
                          </span>
                          {isST && (
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
                            {stock.market === 1 ? "SH" : stock.market === 0 ? "SZ" : "BJ"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 min-w-[80px]">
                        <p className="font-black text-[15px] num" style={{ color: pc }}>
                          {fmtPct(stock.changePct)}
                        </p>
                        <p className="text-[11px] num mt-0.5" style={{ color: "#94A3B8" }}>
                          ¥{fmtPrice(stock.price)}
                        </p>
                      </div>
                    </div>

                    {/* 底部数据行 */}
                    {(stock.amount != null || stock.marketCap != null || stock.turnoverRate != null || stock.mainFlow != null) && (
                      <div className="flex items-center gap-3 mt-2 pt-2 flex-wrap"
                        style={{ borderTop: "1px solid #1a2f50" }}>
                        {stock.amount != null && (
                          <span className="text-[10px]" style={{ color: "#64748B" }}>
                            额 <span style={{ color: "#94A3B8" }}>{fmtAmt(stock.amount)}</span>
                          </span>
                        )}
                        {stock.marketCap != null && (
                          <span className="text-[10px]" style={{ color: "#64748B" }}>
                            总值 <span style={{ color: "#94A3B8" }}>{fmtCap(stock.marketCap)}</span>
                          </span>
                        )}
                        {stock.turnoverRate != null && (
                          <span className="text-[10px]" style={{ color: "#64748B" }}>
                            换手 <span style={{ color: "#94A3B8" }}>{stock.turnoverRate.toFixed(2)}%</span>
                          </span>
                        )}
                        {stock.mainFlow != null && (
                          <span className="text-[10px]">
                            主力 <span style={{ color: flowColor(stock.mainFlow) }}>{fmtFlow(stock.mainFlow)}</span>
                          </span>
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
