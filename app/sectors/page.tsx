/**
 * /sectors — A股板块列表页（服务端组件）
 *
 * 展示 31 个申万一级行业板块，包含：
 *  - 行业名称、emoji、颜色、描述
 *  - 行业股票数量
 *  - 实时涨跌统计（异步加载）
 */
import Link from "next/link";
import { ChevronRight, TrendingUp, TrendingDown, Minus, RefreshCw, BarChart2 } from "lucide-react";
import { SECTOR_META, SW_SECTORS } from "@/lib/sectorService";

interface SectorStatEntry {
  name:          string;
  stockCount:    number;
  avgChangePct:  number | null;
  upCount:       number | null;
  downCount:     number | null;
  flatCount:     number | null;
  totalAmount:   number | null;
  leadingStock:  { symbol: string; name: string; changePct: number } | null;
  laggingStock:  { symbol: string; name: string; changePct: number } | null;
  sampleSize:    number;
  quoteOk:       boolean;
}

interface SectorEntry {
  name:        string;
  stockCount:  number;
  sampleCodes: string[];
}

async function fetchSectors(): Promise<{ ok: boolean; sectors: SectorEntry[]; totalStocks: number }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/sectors`, { next: { revalidate: 86400 } });
    if (!res.ok) return { ok: false, sectors: [], totalStocks: 0 };
    return await res.json();
  } catch {
    return { ok: false, sectors: [], totalStocks: 0 };
  }
}

async function fetchStats(): Promise<{ ok: boolean; stats: SectorStatEntry[]; quoteOk?: boolean }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/sectors/stats`, { next: { revalidate: 60 } });
    if (!res.ok) return { ok: false, stats: [] };
    return await res.json();
  } catch {
    return { ok: false, stats: [] };
  }
}

function fmtAmt(v: number | null): string {
  if (v == null) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(1) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(1) + "万";
  return v.toFixed(0);
}

function changePctColor(v: number | null): string {
  if (v == null) return "#94A3B8";
  if (v > 0.05) return "#EF4444";
  if (v < -0.05) return "#22C55E";
  return "#94A3B8";
}

function changePctText(v: number | null): string {
  if (v == null) return "--";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

export default async function SectorsPage() {
  const [sectorData, statsData] = await Promise.all([fetchSectors(), fetchStats()]);

  // Build stats lookup map
  const statsMap = new Map<string, SectorStatEntry>();
  for (const s of (statsData.stats ?? [])) {
    statsMap.set(s.name, s);
  }

  // Merge sectors from both sources; ensure all 31 SW sectors appear
  const allSectors: Array<{ name: string; stockCount: number }> = [];
  const seen = new Set<string>();

  for (const sector of (sectorData.sectors ?? [])) {
    allSectors.push({ name: sector.name, stockCount: sector.stockCount });
    seen.add(sector.name);
  }
  for (const name of SW_SECTORS) {
    if (!seen.has(name)) {
      const stat = statsMap.get(name);
      allSectors.push({ name, stockCount: stat?.stockCount ?? 0 });
    }
  }

  // Sort by avgChangePct desc when available, else by name order
  allSectors.sort((a, b) => {
    const sa = statsMap.get(a.name);
    const sb = statsMap.get(b.name);
    const pa = sa?.avgChangePct ?? null;
    const pb = sb?.avgChangePct ?? null;
    if (pa !== null && pb !== null) return pb - pa;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return 0;
  });

  const quoteOk = statsData.quoteOk ?? false;

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* 页头 */}
      <div className="flex items-center justify-between px-4 pb-4 page-top-pt">
        <div>
          <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "#00E5A8" }}>Sectors</p>
          <h1 className="font-black text-[20px]" style={{ color: "#F8FAFC" }}>A股板块</h1>
        </div>
        <div className="flex items-center gap-2">
          {sectorData.ok && (
            <span className="text-[11px] px-2 py-1 rounded-lg" style={{ background: "#0d1f3c", color: "#94A3B8" }}>
              全市场 {sectorData.totalStocks?.toLocaleString() ?? "--"} 只
            </span>
          )}
        </div>
      </div>

      {/* 行情状态条 */}
      {quoteOk ? (
        <div className="mx-4 mb-4 px-3 py-2 rounded-xl flex items-center gap-2"
          style={{ background: "rgba(0,229,168,0.08)", border: "1px solid rgba(0,229,168,0.15)" }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#00E5A8" }} />
          <span className="text-[11px]" style={{ color: "#00E5A8" }}>实时行情（样本估算，每板块≤40只）</span>
        </div>
      ) : (
        <div className="mx-4 mb-4 px-3 py-2 rounded-xl flex items-center gap-2"
          style={{ background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.12)" }}>
          <BarChart2 size={12} color="#64748B" />
          <span className="text-[11px]" style={{ color: "#64748B" }}>
            实时行情暂不可用，显示基础股票信息
          </span>
        </div>
      )}

      {/* 板块列表 */}
      <div className="px-4 space-y-2 pb-28">
        {allSectors.map(({ name, stockCount }) => {
          const meta  = SECTOR_META[name] ?? SECTOR_META["未分类"];
          const stat  = statsMap.get(name);
          const color = meta.color;
          const avg   = stat?.avgChangePct ?? null;
          const up    = stat?.upCount ?? null;
          const down  = stat?.downCount ?? null;
          const flat  = stat?.flatCount ?? null;
          const amt   = stat?.totalAmount ?? null;
          const leader = stat?.leadingStock ?? null;
          const encoded = encodeURIComponent(name);

          return (
            <Link key={name} href={`/sectors/${encoded}`}>
              <div
                className="p-3.5 rounded-2xl active:opacity-70 transition-opacity"
                style={{ background: "#0d1f3c", border: `1px solid ${color}22` }}
              >
                <div className="flex items-center justify-between">
                  {/* 左侧：emoji + 行业名 + 股票数 */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                      style={{ background: `${color}18`, border: `1px solid ${color}25` }}>
                      {meta.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>{name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>
                          {stockCount > 0 ? stockCount : (stat?.stockCount ?? "--")}只
                        </span>
                      </div>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: "#64748B" }}>{meta.desc}</p>
                    </div>
                  </div>

                  {/* 右侧：涨跌幅 + 箭头 */}
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    {avg !== null ? (
                      <div className="text-right">
                        <p className="font-black text-[16px] num" style={{ color: changePctColor(avg) }}>
                          {changePctText(avg)}
                        </p>
                        {up !== null && (
                          <p className="text-[10px] mt-0.5">
                            <span style={{ color: "#EF4444" }}>{up}涨</span>
                            <span style={{ color: "#64748B" }} className="mx-0.5">/</span>
                            <span style={{ color: "#22C55E" }}>{down}跌</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="w-8" />
                    )}
                    <ChevronRight size={14} color="#64748B" />
                  </div>
                </div>

                {/* 底部：成交额 + 领涨股 */}
                {stat && (amt !== null || leader !== null) && (
                  <div className="flex items-center justify-between mt-2.5 pt-2.5"
                    style={{ borderTop: `1px solid ${color}14` }}>
                    {amt !== null ? (
                      <span className="text-[11px]" style={{ color: "#64748B" }}>
                        成交额 <span style={{ color: "#94A3B8" }}>{fmtAmt(amt)}</span>
                        {stat.sampleSize > 0 && <span style={{ color: "#4B5563" }}>（{stat.sampleSize}只样本）</span>}
                      </span>
                    ) : <span />}
                    {leader && (
                      <span className="text-[11px]" style={{ color: "#64748B" }}>
                        领涨{" "}
                        <span className="font-semibold" style={{ color: "#EF4444" }}>
                          {leader.name}
                        </span>
                        <span style={{ color: "#EF4444" }}> +{leader.changePct}%</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* 底部说明 */}
      <div className="mx-4 mb-6 p-3 rounded-xl" style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.08)" }}>
        <p className="text-[10px] leading-[1.7]" style={{ color: "#64748B" }}>
          📊 行业分类采用申万一级行业（2021年修订版，共31个板块）。涨跌统计基于每板块样本估算，数据仅供参考。
        </p>
      </div>
    </div>
  );
}
