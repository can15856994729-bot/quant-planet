/**
 * GET /api/sectors/stats
 *
 * 返回各板块实时涨跌统计。
 * 策略：每个板块采样最多 40 只股票，并行批量从东方财富获取实时行情。
 * 服务端聚合计算，客户端无需大量请求。
 *
 * 缓存：60s（服务端内存 + HTTP Cache-Control）
 */
import { NextResponse } from "next/server";
import { getAStockBasic, hasTushareToken } from "@/lib/tushareService";
import { classifyStocks, mapToSWSector, isST } from "@/lib/sectorService";
import { fetchBatchQuotes } from "@/lib/quoteService";

export const dynamic = "force-dynamic";

export interface SectorStatEntry {
  name:          string;
  stockCount:    number;
  avgChangePct:  number | null;  // % 平均涨跌幅（样本）
  upCount:       number | null;  // 上涨家数（样本内）
  downCount:     number | null;  // 下跌家数（样本内）
  flatCount:     number | null;  // 平盘家数（样本内）
  totalAmount:   number | null;  // 样本成交额合计（元）
  leadingStock:  { symbol: string; name: string; changePct: number } | null;
  laggingStock:  { symbol: string; name: string; changePct: number } | null;
  sampleSize:    number;         // 实际参与统计的样本数
  quoteOk:       boolean;        // 是否成功获取实时行情
}

// 内存缓存 60s
let _cache: { data: SectorStatEntry[]; ts: number } | null = null;
const CACHE_TTL = 60_000;

export async function GET() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json(
      { ok: true, stats: _cache.data, fromCache: true, updatedAt: new Date(_cache.ts).toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" } },
    );
  }

  if (!hasTushareToken()) {
    return NextResponse.json({ ok: false, error: "TUSHARE_TOKEN 未配置", stats: [] });
  }

  // 1. 获取股票池
  const basicRes = await getAStockBasic("L");
  if (!basicRes.ok) {
    return NextResponse.json({ ok: false, error: basicRes.error, stats: [] });
  }

  // 2. 按申万行业分组，每组采样 40 只
  const SAMPLE = 40;
  const sectorMap = new Map<string, string[]>(); // sector → symbol[]
  for (const r of basicRes.records) {
    const sector = mapToSWSector(String(r.industry ?? ""));
    const sym    = String(r.symbol ?? "").replace(/\.\w+$/, ""); // strip exchange suffix
    if (!sym) continue;
    if (!sectorMap.has(sector)) sectorMap.set(sector, []);
    const arr = sectorMap.get(sector)!;
    if (arr.length < SAMPLE) arr.push(sym);
  }

  // 3. 收集所有需要查询的 symbols
  const allSymbols: string[] = [];
  for (const syms of sectorMap.values()) {
    allSymbols.push(...syms);
  }

  // 4. 批量获取行情（quoteService 每 100 只切片）
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

  // 5. 聚合统计
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
    const totalAmt  = sampleQuotes.reduce((s, q) => s + (q.amount ?? 0), 0);

    const sorted    = [...sampleQuotes].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    const leader    = sorted[0];
    const lagger    = sorted[sorted.length - 1];

    stats.push({
      name:          sector,
      stockCount:    syms.length,
      avgChangePct:  +avg.toFixed(2),
      upCount,
      downCount,
      flatCount,
      totalAmount:   totalAmt > 0 ? totalAmt : null,
      leadingStock:  leader ? { symbol: leader.symbol, name: leader.name ?? leader.symbol, changePct: +(leader.changePct ?? 0).toFixed(2) } : null,
      laggingStock:  lagger ? { symbol: lagger.symbol, name: lagger.name ?? lagger.symbol, changePct: +(lagger.changePct ?? 0).toFixed(2) } : null,
      sampleSize:    sampleQuotes.length,
      quoteOk,
    });
  }

  _cache = { data: stats, ts: Date.now() };

  return NextResponse.json(
    { ok: true, stats, quoteOk, sampleNote: `每板块采样≤${SAMPLE}只，统计为样本估算`, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" } },
  );
}
