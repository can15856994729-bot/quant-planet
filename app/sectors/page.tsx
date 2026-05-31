/**
 * /sectors — A股板块列表页（服务端组件 + 客户端 Tab 组件）
 *
 * 服务端预取：
 *  - 申万行业列表（/api/sectors, 24h 缓存）
 *  - 申万行业实时统计（/api/sectors/stats, 60s 缓存）
 *
 * 客户端（SectorsPageClient）懒加载：
 *  - 东财行业板块（/api/eastmoney/sectors?type=industry）
 *  - 概念板块（/api/eastmoney/sectors?type=concept）
 *  - 地域板块（/api/eastmoney/sectors?type=region）
 */
import { SW_SECTORS } from "@/lib/sectorService";
import SectorsPageClient from "./SectorsPageClient";

interface SectorEntry {
  name:       string;
  stockCount: number;
  sampleCodes: string[];
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

export default async function SectorsPage() {
  const [sectorData, statsData] = await Promise.all([fetchSectors(), fetchStats()]);

  // 确保 31 个申万行业都出现
  const seen = new Set<string>();
  const allSectors: { name: string; stockCount: number }[] = [];
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
