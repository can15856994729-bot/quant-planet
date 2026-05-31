"use client";

/**
 * MoneyFlowClient — 资金流排行页客户端组件
 *
 * Tab 1: 个股流入榜  (主力净流入 Top 100)
 * Tab 2: 个股流出榜  (主力净流出 Top 100)
 * Tab 3: 行业板块榜  (行业资金流)
 * Tab 4: 概念板块榜  (概念资金流)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  RefreshCw, TrendingUp, TrendingDown, Search, X, AlertCircle,
} from "lucide-react";

// ── 类型 ──────────────────────────────────────────────────────────────────
interface StockItem {
  symbol:   string;
  tsCode:   string;
  name:     string;
  market:   number;
  price:    number | null;
  changePct: number | null;
  amount:   number | null;
  mainNetInflow:        number | null;
  mainNetInflowPercent: number | null;
  superLargeNetInflow:  number | null;
  largeNetInflow:       number | null;
  mediumNetInflow:      number | null;
  smallNetInflow:       number | null;
  fiveDayMainNetInflow: number | null;
  tenDayMainNetInflow:  number | null;
}

interface SectorItem {
  sectorCode:   string;
  sectorName:   string;
  sectorType:   string;
  changePct:    number | null;
  amount:       number | null;
  mainNetInflow:        number | null;
  mainNetInflowPercent: number | null;
  superLargeNetInflow:  number | null;
  largeNetInflow:       number | null;
  fiveDayMainNetInflow: number | null;
  tenDayMainNetInflow:  number | null;
  upCount:    number | null;
  downCount:  number | null;
  stockCount: number | null;
  leadingStock:            string | null;
  leadingStockChangePct:   number | null;
}

// ── 格式化 ────────────────────────────────────────────────────────────────
function fmtFlow(v: number | null): string {
  if (v === null) return "--";
  const abs  = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(2)}万`;
  return `${sign}${abs.toFixed(0)}`;
}
function fmtAmt(v: number | null): string {
  if (v === null) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e8) return (v / 1e8).toFixed(1) + "亿";
  if (abs >= 1e4) return (v / 1e4).toFixed(1) + "万";
  return v.toFixed(0);
}
function fmtPct(v: number | null): string {
  if (v === null) return "--";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}
function flowColor(v: number | null): string {
  if (v === null) return "#94A3B8";
  if (v > 0)     return "#EF4444";
  if (v < 0)     return "#22C55E";
  return "#94A3B8";
}
function pctColor(v: number | null): string {
  if (v === null) return "#94A3B8";
  if (v > 0.05)  return "#EF4444";
  if (v < -0.05) return "#22C55E";
  return "#94A3B8";
}

// ── Tab 定义 ─────────────────────────────────────────────────────────────
type TabKey = "inflow" | "outflow" | "industry" | "concept";
const TABS: { key: TabKey; label: string; emoji: string }[] = [
  { key: "inflow",   label: "个股流入", emoji: "📈" },
  { key: "outflow",  label: "个股流出", emoji: "📉" },
  { key: "industry", label: "行业板块", emoji: "🏭" },
  { key: "concept",  label: "概念板块", emoji: "💡" },
];

// ── 个股行 ────────────────────────────────────────────────────────────────
function StockRow({ stock, rank }: { stock: StockItem; rank: number }) {
  const fc = flowColor(stock.mainNetInflow);
  const pc = pctColor(stock.changePct);
  return (
    <Link href={`/stock/${stock.symbol}`}>
      <div className="flex items-center gap-3 px-4 py-3 active:bg-white/5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {/* 排名 */}
        <div className="w-6 text-center flex-shrink-0">
          <span className="text-[12px] font-bold" style={{
            color: rank <= 3 ? "#EF4444" : "#64748B"
          }}>{rank}</span>
        </div>
        {/* 股票名称/代码 */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[13px] truncate" style={{ color: "#F8FAFC" }}>
            {stock.name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px]" style={{ color: "#64748B" }}>{stock.symbol}</span>
            {stock.amount !== null && (
              <span className="text-[10px]" style={{ color: "#4B5563" }}>额{fmtAmt(stock.amount)}</span>
            )}
          </div>
        </div>
        {/* 涨跌幅 */}
        <div className="text-right w-14 flex-shrink-0">
          <p className="font-bold text-[12px] num" style={{ color: pc }}>{fmtPct(stock.changePct)}</p>
          <p className="text-[10px] num mt-0.5" style={{ color: "#64748B" }}>
            {stock.price !== null ? `¥${stock.price.toFixed(2)}` : "--"}
          </p>
        </div>
        {/* 主力净流入 */}
        <div className="text-right w-20 flex-shrink-0">
          <p className="font-bold text-[13px] num" style={{ color: fc }}>
            {fmtFlow(stock.mainNetInflow)}
          </p>
          {stock.mainNetInflowPercent !== null && (
            <p className="text-[10px] num mt-0.5" style={{ color: fc }}>
              {fmtPct(stock.mainNetInflowPercent)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── 板块行 ────────────────────────────────────────────────────────────────
function SectorRow({ sector, rank }: { sector: SectorItem; rank: number }) {
  const fc = flowColor(sector.mainNetInflow);
  const pc = pctColor(sector.changePct);
  const encoded = encodeURIComponent(sector.sectorCode);
  return (
    <Link href={`/sectors/${encoded}`}>
      <div className="flex items-center gap-3 px-4 py-3 active:bg-white/5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="w-6 text-center flex-shrink-0">
          <span className="text-[12px] font-bold" style={{
            color: rank <= 3 ? "#EF4444" : "#64748B"
          }}>{rank}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[13px] truncate" style={{ color: "#F8FAFC" }}>
            {sector.sectorName}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {sector.stockCount !== null && (
              <span className="text-[10px]" style={{ color: "#64748B" }}>{sector.stockCount}只</span>
            )}
            {sector.upCount !== null && (
              <span className="text-[10px]">
                <span style={{ color: "#EF4444" }}>{sector.upCount}涨</span>
                <span style={{ color: "#64748B" }}>/</span>
                <span style={{ color: "#22C55E" }}>{sector.downCount}跌</span>
              </span>
            )}
            {sector.leadingStock && (
              <span className="text-[10px] truncate" style={{ color: "#64748B" }}>
                领涨 <span style={{ color: "#EF4444" }}>{sector.leadingStock}</span>
              </span>
            )}
          </div>
        </div>
        <div className="text-right w-14 flex-shrink-0">
          <p className="font-bold text-[12px] num" style={{ color: pc }}>{fmtPct(sector.changePct)}</p>
          {sector.amount !== null && (
            <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>{fmtAmt(sector.amount)}</p>
          )}
        </div>
        <div className="text-right w-20 flex-shrink-0">
          <p className="font-bold text-[13px] num" style={{ color: fc }}>
            {fmtFlow(sector.mainNetInflow)}
          </p>
          {sector.mainNetInflowPercent !== null && (
            <p className="text-[10px] num mt-0.5" style={{ color: fc }}>
              {fmtPct(sector.mainNetInflowPercent)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────
export default function MoneyFlowClient() {
  const [activeTab,  setActiveTab]  = useState<TabKey>("inflow");
  const [search,     setSearch]     = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const stocksRef  = useRef<Partial<Record<TabKey, StockItem[]>>>({});
  const sectorsRef = useRef<Partial<Record<TabKey, SectorItem[]>>>({});
  const [stockData,  setStockData]  = useState<StockItem[]>([]);
  const [sectorData, setSectorData] = useState<SectorItem[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [fetchedAt,  setFetchedAt]  = useState<string>("");

  const isStockTab  = activeTab === "inflow"   || activeTab === "outflow";
  const isSectorTab = activeTab === "industry" || activeTab === "concept";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isStockTab) {
        const order = activeTab === "inflow" ? "desc" : "asc";
        if (stocksRef.current[activeTab]) {
          setStockData(stocksRef.current[activeTab]!);
          setLoading(false);
          return;
        }
        const res  = await fetch(`/api/eastmoney/money-flow/ranking?order=${order}&limit=100`);
        const json = await res.json();
        if (json.ok) {
          stocksRef.current[activeTab] = json.stocks ?? [];
          setStockData(json.stocks ?? []);
          setFetchedAt(json.fetchedAt ?? "");
        } else {
          setError(json.message ?? "资金流数据暂不可用");
        }
      } else {
        const type = activeTab === "industry" ? "industry" : "concept";
        if (sectorsRef.current[activeTab]) {
          setSectorData(sectorsRef.current[activeTab]!);
          setLoading(false);
          return;
        }
        const res  = await fetch(`/api/eastmoney/money-flow/sectors/${type}`);
        const json = await res.json();
        if (json.ok) {
          sectorsRef.current[activeTab] = json.sectors ?? [];
          setSectorData(json.sectors ?? []);
          setFetchedAt(new Date().toISOString());
        } else {
          setError(json.message ?? "板块资金流数据暂不可用");
        }
      }
    } catch {
      setError("网络错误，无法获取资金流数据");
    } finally {
      setLoading(false);
    }
  }, [activeTab, isStockTab, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab 切换时重置缓存并重新加载
  function switchTab(tab: TabKey) {
    setActiveTab(tab);
    setSearch("");
  }

  // 手动刷新：清空当前 tab 缓存
  function handleRefresh() {
    if (isStockTab) stocksRef.current[activeTab] = undefined;
    else sectorsRef.current[activeTab] = undefined;
    setRefreshKey(k => k + 1);
  }

  useEffect(() => { load(); }, [load]);

  // 搜索过滤
  const q = search.trim().toLowerCase();
  const filteredStocks  = stockData.filter(s => !q || s.name.toLowerCase().includes(q) || s.symbol.includes(q));
  const filteredSectors = sectorData.filter(s => !q || s.sectorName.toLowerCase().includes(q) || s.sectorCode.toLowerCase().includes(q));

  const ACCENT = "#00E5A8";

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* 页头 */}
      <div className="flex items-center justify-between px-4 pb-3 page-top-pt">
        <div>
          <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: ACCENT }}>
            Money Flow
          </p>
          <h1 className="font-black text-[20px]" style={{ color: "#F8FAFC" }}>资金流向</h1>
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && (
            <span className="text-[10px]" style={{ color: "#4B5563" }}>
              {new Date(fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={handleRefresh}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <RefreshCw size={15} color="#94A3B8" className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 mb-3">
        <div className="flex gap-1.5">
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            const color  = tab.key === "inflow" ? "#EF4444"
              : tab.key === "outflow"  ? "#22C55E"
              : tab.key === "industry" ? "#3B82F6" : "#8B5CF6";
            return (
              <button key={tab.key} onClick={() => switchTab(tab.key)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold"
                style={{
                  background: active ? `${color}20` : "#0d1f3c",
                  border: active ? `1px solid ${color}50` : "1px solid #1a2f50",
                  color: active ? color : "#64748B",
                }}>
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 搜索 */}
      <div className="px-4 mb-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <Search size={14} color="#64748B" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索名称或代码…"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "#F8FAFC" }} />
          {search && <button onClick={() => setSearch("")}><X size={13} color="#64748B" /></button>}
        </div>
      </div>

      {/* 数据来源状态 */}
      {!loading && !error && (isStockTab ? stockData.length : sectorData.length) > 0 && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
          style={{ background: "rgba(0,229,168,0.08)", border: "1px solid rgba(0,229,168,0.15)" }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
          <span className="text-[11px]" style={{ color: ACCENT }}>数据来源：东方财富</span>
          {activeTab === "inflow"   && <span className="text-[11px]" style={{ color: "#64748B" }}>· 主力净流入排行</span>}
          {activeTab === "outflow"  && <span className="text-[11px]" style={{ color: "#64748B" }}>· 主力净流出排行</span>}
          {activeTab === "industry" && <span className="text-[11px]" style={{ color: "#64748B" }}>· 行业资金流</span>}
          {activeTab === "concept"  && <span className="text-[11px]" style={{ color: "#64748B" }}>· 概念资金流</span>}
        </div>
      )}

      {/* 列表头 */}
      {!loading && !error && (
        <div className="flex items-center gap-3 px-4 pb-1.5"
          style={{ borderBottom: "1px solid #1a2f50" }}>
          <div className="w-6" />
          <div className="flex-1 text-[10px]" style={{ color: "#64748B" }}>名称</div>
          <div className="w-14 text-right text-[10px]" style={{ color: "#64748B" }}>涨跌幅</div>
          <div className="w-20 text-right text-[10px]" style={{ color: "#64748B" }}>
            {activeTab === "inflow" || activeTab === "outflow" ? "主力净流入" : "主力净流入"}
          </div>
        </div>
      )}

      {/* 加载 */}
      {loading && (
        <div className="px-4 space-y-2 pt-2">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "#0d1f3c" }} />
          ))}
        </div>
      )}

      {/* 错误 */}
      {!loading && error && (
        <div className="mx-4 mt-4 p-4 rounded-2xl flex items-start gap-3"
          style={{ background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.15)" }}>
          <AlertCircle size={18} color="#64748B" className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: "#94A3B8" }}>资金流数据暂不可用</p>
            <p className="text-[11px] mt-1" style={{ color: "#64748B" }}>{error}</p>
            <button onClick={handleRefresh}
              className="mt-2 text-[11px] px-3 py-1 rounded-lg"
              style={{ background: "rgba(100,116,139,0.15)", color: "#94A3B8" }}>
              重试
            </button>
          </div>
        </div>
      )}

      {/* 个股列表 */}
      {!loading && !error && isStockTab && (
        <div className="pb-28">
          {filteredStocks.map((stock, i) => (
            <StockRow key={stock.symbol} stock={stock} rank={i + 1} />
          ))}
          {filteredStocks.length === 0 && stockData.length > 0 && (
            <div className="p-8 text-center">
              <p className="text-[13px]" style={{ color: "#64748B" }}>未找到匹配股票</p>
            </div>
          )}
        </div>
      )}

      {/* 板块列表 */}
      {!loading && !error && isSectorTab && (
        <div className="pb-28">
          {filteredSectors.map((sector, i) => (
            <SectorRow key={sector.sectorCode} sector={sector} rank={i + 1} />
          ))}
          {filteredSectors.length === 0 && sectorData.length > 0 && (
            <div className="p-8 text-center">
              <p className="text-[13px]" style={{ color: "#64748B" }}>未找到匹配板块</p>
            </div>
          )}
        </div>
      )}

      {/* 底部说明 */}
      {!loading && !error && (
        <div className="mx-4 mb-6 p-3 rounded-xl"
          style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.08)" }}>
          <p className="text-[10px] leading-[1.7]" style={{ color: "#64748B" }}>
            💡 资金流数据来源：东方财富。主力净流入 = 超大单净流入 + 大单净流入。
            净流入为正（红色）代表资金买入，净流出为负（绿色）代表资金卖出。数据仅供参考，不构成投资建议。
          </p>
        </div>
      )}
    </div>
  );
}
