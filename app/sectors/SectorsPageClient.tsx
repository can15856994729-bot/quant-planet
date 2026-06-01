"use client";

/**
 * SectorsPageClient — 板块列表页客户端组件
 *
 * 四个 Tab：
 *  1. 申万行业 (SW)     — Tushare + 申万分类
 *  2. 东财行业 (Industry)— 东方财富 m:90+t:2
 *  3. 概念板块 (Concept) — 东方财富 m:90+t:3
 *  4. 地域板块 (Region)  — 东方财富 m:90+t:1
 *
 * 切换 tab 时懒加载东财数据；SW 数据由 props 传入（服务端预取）。
 *
 * EM 板块数量修复说明：
 *  EastMoney clist API 的 f104/f105/f106（涨跌平家数）在非交易时段全为 0，
 *  导致 stockCount = null，"只"角标消失。
 *  修复方案：加载板块列表后，对 stockCount===null 的板块，
 *  异步调用 /api/eastmoney/sectors/counts（使用 data.total）补充数量，
 *  并缓存到 localStorage（30 分钟有效）。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ChevronRight, BarChart2, TrendingUp, TrendingDown, RefreshCw, Search, X } from "lucide-react";
import { SECTOR_META } from "@/lib/sectorService";

// ── SW 板块数据（来自 /api/sectors） ─────────────────────────────────────
interface SWSectorEntry {
  name:       string;
  stockCount: number;
}
interface SWSectorStat {
  name:         string;
  stockCount:   number;
  avgChangePct: number | null;
  upCount:      number | null;
  downCount:    number | null;
  flatCount:    number | null;
  totalAmount:  number | null;
  leadingStock: { symbol: string; name: string; changePct: number } | null;
  sampleSize:   number;
  quoteOk:      boolean;
}

// ── 东财板块数据 ──────────────────────────────────────────────────────────
interface EMSectorItem {
  code:          string;
  name:          string;
  type:          string;
  changePct:     number | null;
  amount:        number | null;
  mainFlow:      number | null;
  upCount:       number | null;
  downCount:     number | null;
  stockCount:    number | null;
  leadName:      string | null;
  leadChangePct: number | null;
}

// ── Props ────────────────────────────────────────────────────────────────
interface Props {
  swSectors:    SWSectorEntry[];
  swStats:      SWSectorStat[];
  totalStocks:  number;
  quoteOk:      boolean;
}

// ── localStorage 缓存键和 TTL ─────────────────────────────────────────────
const LS_COUNT_KEY = "quantplanet_sector_stock_count_cache_v1";
const LS_COUNT_TTL = 30 * 60 * 1000; // 30 分钟

interface LSCountCache {
  counts:    Record<string, number>; // code → count
  expiresAt: number;
}

function loadCountCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_COUNT_KEY);
    if (!raw) return {};
    const parsed: LSCountCache = JSON.parse(raw);
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(LS_COUNT_KEY);
      return {};
    }
    return parsed.counts ?? {};
  } catch { return {}; }
}

function saveCountCache(counts: Record<string, number>): void {
  try {
    const payload: LSCountCache = { counts, expiresAt: Date.now() + LS_COUNT_TTL };
    localStorage.setItem(LS_COUNT_KEY, JSON.stringify(payload));
  } catch { /* storage 满或隐私模式，忽略 */ }
}

// ── 格式化 ────────────────────────────────────────────────────────────────
function fmtPct(v: number | null): string {
  if (v == null) return "--";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}
function fmtAmt(v: number | null): string {
  if (v == null) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e8) return (v / 1e8).toFixed(1) + "亿";
  if (abs >= 1e4) return (v / 1e4).toFixed(1) + "万";
  return v.toFixed(0);
}
function fmtFlow(v: number | null): string {
  if (v == null) return "--";
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}万`;
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
  if (v > 0) return "#EF4444";
  if (v < 0) return "#22C55E";
  return "#94A3B8";
}

// ── Tab 定义 ─────────────────────────────────────────────────────────────
type TabKey = "sw" | "industry" | "concept" | "region";
const TABS: { key: TabKey; label: string; emoji: string; color: string }[] = [
  { key: "sw",       label: "申万行业", emoji: "📊", color: "#3B82F6" },
  { key: "industry", label: "东财行业", emoji: "🏭", color: "#6366F1" },
  { key: "concept",  label: "概念板块", emoji: "💡", color: "#8B5CF6" },
  { key: "region",   label: "地域板块", emoji: "🌍", color: "#10B981" },
];

// ── 东财板块卡片 ──────────────────────────────────────────────────────────
function EMSectorCard({
  s,
  color,
  resolvedCount,
  countLoading,
}: {
  s: EMSectorItem;
  color: string;
  resolvedCount: number | null;
  countLoading: boolean;
}) {
  const pc   = pctColor(s.changePct);
  const fc   = flowColor(s.mainFlow);
  const encoded = encodeURIComponent(s.code);
  // 优先使用已解析的真实数量，其次用板块数据自带的，
  // 若都没有且还在加载中，显示"加载中…"
  const displayCount = resolvedCount ?? s.stockCount;

  return (
    <Link href={`/sectors/${encoded}`}>
      <div className="p-3.5 rounded-2xl active:opacity-70 transition-opacity"
        style={{ background: "#0d1f3c", border: `1px solid ${color}22` }}>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 mr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
                {s.name}
              </span>
              {displayCount != null ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: `${color}18`, color }}>
                  {displayCount}只
                </span>
              ) : countLoading ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(148,163,184,0.1)", color: "#64748B" }}>
                  加载中…
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(148,163,184,0.08)", color: "#475569" }}>
                  数量暂缺
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              {s.upCount != null && (
                <span className="text-[10px]">
                  <span style={{ color: "#EF4444" }}>{s.upCount}涨</span>
                  <span style={{ color: "#64748B" }}>/</span>
                  <span style={{ color: "#22C55E" }}>{s.downCount}跌</span>
                </span>
              )}
              {s.amount != null && (
                <span className="text-[10px]" style={{ color: "#64748B" }}>
                  {fmtAmt(s.amount)}
                </span>
              )}
              {s.mainFlow != null && (
                <span className="text-[10px]" style={{ color: fc }}>
                  {fmtFlow(s.mainFlow)}
                </span>
              )}
            </div>
            {s.leadName && (
              <p className="text-[10px] mt-0.5 truncate" style={{ color: "#64748B" }}>
                领涨 <span style={{ color: "#EF4444" }}>{s.leadName}</span>
                {s.leadChangePct != null && (
                  <span style={{ color: "#EF4444" }}> {fmtPct(s.leadChangePct)}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <p className="font-black text-[16px] num" style={{ color: pc }}>
              {fmtPct(s.changePct)}
            </p>
            <ChevronRight size={14} color="#64748B" />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── 申万行业卡片 ──────────────────────────────────────────────────────────
function SWCard({ name, stockCount, stat }: {
  name: string;
  stockCount: number;
  stat?: SWSectorStat;
}) {
  const meta    = SECTOR_META[name] ?? SECTOR_META["未分类"];
  const color   = meta.color;
  const avg     = stat?.avgChangePct ?? null;
  const encoded = encodeURIComponent(name);

  // 股票数量优先级：
  //  1. stockCount（来自 Tushare stock_basic，最准确）
  //  2. stat.stockCount（来自 stats 接口样本）
  //  3. "数量暂缺"（两者都为 0 / 未定义）
  const displayCount =
    stockCount > 0
      ? stockCount
      : (stat?.stockCount && stat.stockCount > 0 ? stat.stockCount : null);

  return (
    <Link href={`/sectors/${encoded}`}>
      <div className="p-3.5 rounded-2xl active:opacity-70 transition-opacity"
        style={{ background: "#0d1f3c", border: `1px solid ${color}22` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
              style={{ background: `${color}18`, border: `1px solid ${color}25` }}>
              {meta.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>{name}</span>
                {displayCount != null ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: `${color}18`, color }}>
                    {displayCount}只
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(148,163,184,0.08)", color: "#475569" }}>
                    数量暂缺
                  </span>
                )}
              </div>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: "#64748B" }}>{meta.desc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {avg !== null ? (
              <div className="text-right">
                <p className="font-black text-[16px] num" style={{ color: pctColor(avg) }}>
                  {fmtPct(avg)}
                </p>
                {stat?.upCount != null && (
                  <p className="text-[10px] mt-0.5">
                    <span style={{ color: "#EF4444" }}>{stat.upCount}涨</span>
                    <span style={{ color: "#64748B" }}>/</span>
                    <span style={{ color: "#22C55E" }}>{stat.downCount}跌</span>
                  </p>
                )}
              </div>
            ) : <div className="w-8" />}
            <ChevronRight size={14} color="#64748B" />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────
export default function SectorsPageClient({ swSectors, swStats, totalStocks, quoteOk }: Props) {
  const [activeTab,  setActiveTab]  = useState<TabKey>("sw");
  const [search,     setSearch]     = useState("");

  // 东财板块数据（按 type 缓存）
  const emData = useRef<Partial<Record<TabKey, EMSectorItem[]>>>({});
  const [emSectors,  setEMSectors]  = useState<EMSectorItem[]>([]);
  const [emLoading,  setEMLoading]  = useState(false);
  const [emError,    setEMError]    = useState<string | null>(null);

  // EM 板块数量补充（data.total，非交易时段准确）
  // resolvedCounts: code → count（来自 API 或 localStorage）
  const [resolvedCounts, setResolvedCounts] = useState<Record<string, number>>({});
  const [countLoading,   setCountLoading]   = useState(false);

  // SW stats map
  const statsMap = new Map<string, SWSectorStat>();
  for (const s of swStats) statsMap.set(s.name, s);

  // ── 加载 EM 板块数量（批量，localStorage 缓存）──────────────────────────
  const loadEMCounts = useCallback(async (sectors: EMSectorItem[]) => {
    // 找出 stockCount 为 null 的板块
    const nullCodes = sectors
      .filter(s => s.stockCount === null || s.stockCount === 0)
      .map(s => s.code);

    if (nullCodes.length === 0) return;

    // 读取 localStorage 缓存
    const cached = loadCountCache();

    // 找出缓存未命中的
    const uncached = nullCodes.filter(c => cached[c.toUpperCase()] == null);

    // 将缓存命中的更新到 state
    const newCounts: Record<string, number> = { ...cached };

    if (uncached.length > 0) {
      setCountLoading(true);
      try {
        // 分批（每批 20）请求
        for (let i = 0; i < uncached.length; i += 20) {
          const batch = uncached.slice(i, i + 20);
          const res   = await fetch("/api/eastmoney/sectors/counts", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ codes: batch }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.ok && data.counts) {
            for (const [code, count] of Object.entries(data.counts)) {
              if (typeof count === "number" && count > 0) {
                newCounts[code.toUpperCase()] = count;
              }
            }
          }
          // 每批之间稍微等一下，避免并发过猛
          if (i + 20 < uncached.length) {
            await new Promise(r => setTimeout(r, 200));
          }
        }
        // 保存到 localStorage
        saveCountCache(newCounts);
      } catch {
        // 静默失败，已有缓存数据仍可展示
      } finally {
        setCountLoading(false);
      }
    }

    setResolvedCounts(newCounts);
  }, []);

  // ── 加载东财板块列表 ─────────────────────────────────────────────────────
  const loadEM = useCallback(async (tab: TabKey) => {
    if (tab === "sw") return;
    if (emData.current[tab]) {
      const cached = emData.current[tab]!;
      setEMSectors(cached);
      // 即使已缓存列表，也需要加载数量（数量可能之前未加载）
      await loadEMCounts(cached);
      return;
    }

    setEMLoading(true);
    setEMError(null);
    setEMSectors([]);
    try {
      const typeMap: Record<TabKey, string> = {
        sw: "industry", industry: "industry", concept: "concept", region: "region",
      };
      const type = typeMap[tab];
      const res  = await fetch(`/api/eastmoney/sectors?type=${type}`);
      const data = await res.json();
      if (data.ok) {
        const sectors: EMSectorItem[] = data.sectors ?? [];
        emData.current[tab] = sectors;
        setEMSectors(sectors);
        // 加载数量补充
        await loadEMCounts(sectors);
      } else {
        setEMError(data.error ?? "加载失败");
      }
    } catch {
      setEMError("网络错误");
    } finally {
      setEMLoading(false);
    }
  }, [loadEMCounts]);

  useEffect(() => {
    if (activeTab !== "sw") loadEM(activeTab);
    setSearch("");
  }, [activeTab, loadEM]);

  // 搜索过滤
  const q = search.trim().toLowerCase();

  const swFiltered = swSectors.filter(s =>
    !q || s.name.toLowerCase().includes(q)
  );
  const emFiltered = emSectors.filter(s =>
    !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
  );

  // 当前 tab 颜色
  const tabColor = TABS.find(t => t.key === activeTab)?.color ?? "#3B82F6";

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* 页头 */}
      <div className="flex items-center justify-between px-4 pb-3 page-top-pt">
        <div>
          <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "#00E5A8" }}>Sectors</p>
          <h1 className="font-black text-[20px]" style={{ color: "#F8FAFC" }}>A股板块</h1>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "sw" && totalStocks > 0 && (
            <span className="text-[11px] px-2 py-1 rounded-lg"
              style={{ background: "#0d1f3c", color: "#94A3B8" }}>
              全市场 {totalStocks.toLocaleString()} 只
            </span>
          )}
          {activeTab !== "sw" && emSectors.length > 0 && (
            <span className="text-[11px] px-2 py-1 rounded-lg"
              style={{ background: "#0d1f3c", color: "#94A3B8" }}>
              {emSectors.length} 个板块
            </span>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 mb-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold flex-shrink-0 transition-all"
                style={{
                  background: active ? `${tab.color}20` : "#0d1f3c",
                  border: active ? `1px solid ${tab.color}50` : "1px solid #1a2f50",
                  color: active ? tab.color : "#64748B",
                }}
              >
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-4 mb-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <Search size={14} color="#64748B" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索板块名称…"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "#F8FAFC" }}
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <X size={13} color="#64748B" />
            </button>
          )}
        </div>
      </div>

      {/* ── 申万行业 Tab ─────────────────────────────────────────────────── */}
      {activeTab === "sw" && (
        <>
          {/* 行情状态条 */}
          {quoteOk ? (
            <div className="mx-4 mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
              style={{ background: "rgba(0,229,168,0.08)", border: "1px solid rgba(0,229,168,0.15)" }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#00E5A8" }} />
              <span className="text-[11px]" style={{ color: "#00E5A8" }}>实时行情（样本估算）</span>
            </div>
          ) : (
            <div className="mx-4 mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
              style={{ background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.12)" }}>
              <BarChart2 size={12} color="#64748B" />
              <span className="text-[11px]" style={{ color: "#64748B" }}>
                实时行情暂不可用
              </span>
            </div>
          )}

          <div className="px-4 space-y-2 pb-28">
            {swFiltered.map(({ name, stockCount }) => (
              <SWCard key={name} name={name} stockCount={stockCount} stat={statsMap.get(name)} />
            ))}
            {swFiltered.length === 0 && (
              <div className="p-8 rounded-2xl text-center"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <p className="text-[13px]" style={{ color: "#64748B" }}>未找到匹配板块</p>
              </div>
            )}
          </div>

          {/* 底部说明 */}
          <div className="mx-4 mb-6 p-3 rounded-xl"
            style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.08)" }}>
            <p className="text-[10px] leading-[1.7]" style={{ color: "#64748B" }}>
              📊 申万一级行业（2021年修订版，共31个板块）。涨跌统计基于样本估算，数据仅供参考。
            </p>
          </div>
        </>
      )}

      {/* ── 东财板块 Tab（行业/概念/地域）──────────────────────────────── */}
      {activeTab !== "sw" && (
        <>
          {/* 加载中 */}
          {emLoading && (
            <div className="px-4 space-y-2">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "#0d1f3c" }} />
              ))}
            </div>
          )}

          {/* 错误 */}
          {!emLoading && emError && (
            <div className="mx-4 p-4 rounded-2xl text-center"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <p className="text-[13px] font-semibold" style={{ color: "#EF4444" }}>⚠️ {emError}</p>
              <button onClick={() => { emData.current[activeTab] = undefined; loadEM(activeTab); }}
                className="mt-2 text-[11px] px-3 py-1 rounded-lg"
                style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}>
                重试
              </button>
            </div>
          )}

          {/* 数据来源提示 */}
          {!emLoading && !emError && emSectors.length > 0 && (
            <div className="mx-4 mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
              style={{ background: "rgba(0,229,168,0.08)", border: "1px solid rgba(0,229,168,0.15)" }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#00E5A8" }} />
              <span className="text-[11px]" style={{ color: "#00E5A8" }}>
                数据来源：东方财富 · 实时更新
                {countLoading && (
                  <span style={{ color: "#64748B" }}> · 数量加载中…</span>
                )}
              </span>
            </div>
          )}

          {/* 板块列表 */}
          {!emLoading && !emError && (
            <div className="px-4 space-y-2 pb-28">
              {emFiltered.map(s => (
                <EMSectorCard
                  key={s.code}
                  s={s}
                  color={tabColor}
                  resolvedCount={resolvedCounts[s.code.toUpperCase()] ?? null}
                  countLoading={countLoading}
                />
              ))}
              {emFiltered.length === 0 && emSectors.length > 0 && (
                <div className="p-8 rounded-2xl text-center"
                  style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                  <p className="text-[13px]" style={{ color: "#64748B" }}>未找到匹配板块</p>
                </div>
              )}
            </div>
          )}

          {/* 底部说明 */}
          {!emLoading && !emError && emSectors.length > 0 && (
            <div className="mx-4 mb-6 p-3 rounded-xl"
              style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.08)" }}>
              <p className="text-[10px] leading-[1.7]" style={{ color: "#64748B" }}>
                {activeTab === "industry" && "🏭 东方财富行业板块，覆盖 A 股全行业分类，点击查看板块成分股与主力资金流向。"}
                {activeTab === "concept"  && "💡 概念板块涵盖热点主题与市场炒作概念，一只股票可能同属多个概念。"}
                {activeTab === "region"   && "🌍 地域板块按企业注册地或主要经营地划分，共覆盖 31 个省市自治区。"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
