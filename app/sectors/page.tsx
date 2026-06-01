/**
 * /sectors — A股板块列表页（服务端组件 + 客户端 Tab 组件）
 *
 * 服务端预取（直接调用 service 层，避免 Vercel 下 localhost fetch 失败）：
 *  - 申万行业列表（Tushare stock_basic，24h 缓存）
 *  - 申万行业实时统计（EastMoney 行情，60s 缓存）
 *
 * 客户端（SectorsPageClient）懒加载：
 *  - 东财行业板块（/api/eastmoney/sectors?type=industry）
 *  - 概念板块（/api/eastmoney/sectors?type=concept）
 *  - 地域板块（/api/eastmoney/sectors?type=region）
 */

import {
  SW_SECTORS,
  classifyStocks,
  mapToSWSector,
  type TushareStockRecord,
  type SectorGroup,
} from "@/lib/sectorService";
import { getAStockBasic, hasTushareToken } from "@/lib/tushareService";
import { fetchBatchQuotes } from "@/lib/quoteService";
import SectorsPageClient from "./SectorsPageClient";

// ── 类型定义 ─────────────────────────────────────────────────────────────
interface SWSectorEntry {
  name:       string;
  stockCount: number;
}

interface SectorStatEntry {
  name:         string;
  stockCount:   number;
  avgChangePct: number | null;
  upCount:      number | null;
  downCount:    number | null;
  flatCount:    number | null;
  totalAmount:  number | null;
  leadingStock: { symbol: string; name: string; changePct: number } | null;
  laggingStock: { symbol: string; name: string; changePct: number } | null;
  sampleSize:   number;
  quoteOk:      boolean;
}

// ── 模块级缓存（Vercel warm 实例复用）────────────────────────────────────
let _sectorCache: { sectors: SWSectorEntry[]; totalStocks: number; expiresAt: number } | null = null;
let _statsCache:  { stats: SectorStatEntry[]; quoteOk: boolean; ts: number } | null = null;

const SECTOR_CACHE_TTL = 24 * 3600_000; // 24h
const STATS_CACHE_TTL  = 60_000;         // 60s

// ── 直接调用 Tushare 获取申万分组（不走 localhost fetch）───────────────
async function fetchSectors(): Promise<{ ok: boolean; sectors: SWSectorEntry[]; totalStocks: number }> {
  // 命中缓存
  if (_sectorCache && Date.now() < _sectorCache.expiresAt) {
    return { ok: true, ..._sectorCache };
  }

  if (!hasTushareToken()) {
    return { ok: false, sectors: [], totalStocks: 0 };
  }

  const res = await getAStockBasic("L");
  if (!res.ok) return { ok: false, sectors: [], totalStocks: 0 };

  const result = classifyStocks(
    res.records as unknown as TushareStockRecord[],
  );

  // 只保留需要的字段
  const sectors: SWSectorEntry[] = result.sectors.map((g: SectorGroup) => ({
    name:       g.name,
    stockCount: g.stockCount,
  }));

  _sectorCache = {
    sectors,
    totalStocks: result.totalStocks,
    expiresAt:   Date.now() + SECTOR_CACHE_TTL,
  };
  return { ok: true, sectors, totalStocks: result.totalStocks };
}

// ── 直接调用 EastMoney 获取行业实时统计（不走 localhost fetch）──────────
const STATS_SAMPLE = 40;

async function fetchStats(): Promise<{ ok: boolean; stats: SectorStatEntry[]; quoteOk: boolean }> {
  // 命中缓存
  if (_statsCache && Date.now() - _statsCache.ts < STATS_CACHE_TTL) {
    return { ok: true, stats: _statsCache.stats, quoteOk: _statsCache.quoteOk };
  }

  if (!hasTushareToken()) {
    return { ok: false, stats: [], quoteOk: false };
  }

  const basicRes = await getAStockBasic("L");
  if (!basicRes.ok) return { ok: false, stats: [], quoteOk: false };

  // 按申万行业分组，每组采样 STATS_SAMPLE 只
  const sectorMap = new Map<string, string[]>();
  for (const r of basicRes.records) {
    const sector = mapToSWSector(String(r.industry ?? ""));
    const sym    = String(r.symbol ?? "").replace(/\.\w+$/, "");
    if (!sym) continue;
    if (!sectorMap.has(sector)) sectorMap.set(sector, []);
    const arr = sectorMap.get(sector)!;
    if (arr.length < STATS_SAMPLE) arr.push(sym);
  }

  // 批量获取行情
  const allSymbols: string[] = [];
  for (const syms of sectorMap.values()) allSymbols.push(...syms);

  let quotes: Record<string, { changePct: number; amount?: number; name: string }> = {};
  let quoteOk = false;
  try {
    const rawQuotes = await fetchBatchQuotes(allSymbols);
    for (const [sym, q] of Object.entries(rawQuotes)) {
      if (q.isRealtime && q.price > 0) {
        quotes[sym] = { changePct: q.changePct, amount: q.amount, name: q.name };
        quoteOk = true;
      }
    }
  } catch { /* 实时行情失败，继续返回静态计数 */ }

  // 聚合统计
  const stats: SectorStatEntry[] = [];
  for (const [sector, syms] of sectorMap.entries()) {
    const sampleQuotes = syms
      .map(s => ({ symbol: s, ...quotes[s] }))
      .filter(q => q.changePct != null);

    if (sampleQuotes.length === 0) {
      stats.push({
        name:          sector,
        stockCount:    syms.length,
        avgChangePct:  null,
        upCount:       null,
        downCount:     null,
        flatCount:     null,
        totalAmount:   null,
        leadingStock:  null,
        laggingStock:  null,
        sampleSize:    0,
        quoteOk:       false,
      });
      continue;
    }

    const changes   = sampleQuotes.map(q => q.changePct ?? 0);
    const avg       = changes.reduce((a, b) => a + b, 0) / changes.length;
    const upCount   = sampleQuotes.filter(q => (q.changePct ?? 0) > 0.05).length;
    const downCount = sampleQuotes.filter(q => (q.changePct ?? 0) < -0.05).length;
    const flatCount = sampleQuotes.length - upCount - downCount;
    const totalAmt  = sampleQuotes.reduce<number>((s, q) => s + (q.amount ?? 0), 0);

    const sorted = [...sampleQuotes].sort(
      (a, b) => (b.changePct ?? 0) - (a.changePct ?? 0),
    );
    const leader = sorted[0];
    const lagger = sorted[sorted.length - 1];

    stats.push({
      name:          sector,
      stockCount:    syms.length,
      avgChangePct:  +avg.toFixed(2),
      upCount,
      downCount,
      flatCount,
      totalAmount:   totalAmt > 0 ? totalAmt : null,
      leadingStock:  leader
        ? { symbol: leader.symbol, name: leader.name ?? leader.symbol, changePct: +(leader.changePct ?? 0).toFixed(2) }
        : null,
      laggingStock:  lagger
        ? { symbol: lagger.symbol, name: lagger.name ?? lagger.symbol, changePct: +(lagger.changePct ?? 0).toFixed(2) }
        : null,
      sampleSize:    sampleQuotes.length,
      quoteOk,
    });
  }

  _statsCache = { stats, quoteOk, ts: Date.now() };
  return { ok: true, stats, quoteOk };
}

export default async function SectorsPage() {
  const [sectorData, statsData] = await Promise.all([fetchSectors(), fetchStats()]);

  // 确保 31 个申万行业都出现
  const seen = new Set<string>();
  const allSectors: SWSectorEntry[] = [];
  for (const sector of (sectorData.sectors ?? [])) {
    allSectors.push({ name: sector.name, stockCount: sector.stockCount });
    seen.add(sector.name);
  }
  for (const name of SW_SECTORS) {
    if (!seen.has(name)) allSectors.push({ name, stockCount: 0 });
  }

  // 按实时涨跌幅排序
  const statsMap = new Map<string, SectorStatEntry>();
  for (const s of (statsData.stats ?? [])) statsMap.set(s.name, s);
  allSectors.sort((a, b) => {
    const pa = statsMap.get(a.name)?.avgChangePct ?? null;
    const pb = statsMap.get(b.name)?.avgChangePct ?? null;
    if (pa !== null && pb !== null) return pb - pa;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return 0;
  });

  return (
    <SectorsPageClient
      swSectors={allSectors}
      swStats={Array.from(statsMap.values())}
      totalStocks={sectorData.totalStocks ?? 0}
      quoteOk={statsData.quoteOk ?? false}
    />
  );
}
