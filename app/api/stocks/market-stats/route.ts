import { NextResponse }                          from "next/server";
import { listEMStocks, listEMHKStocks, listEMUSStocks } from "@/lib/eastMoneySearch";
import { hasAVKey }                              from "@/lib/alphaVantage";
import { LOCAL_STOCK_COUNTS }                    from "@/lib/stockService";
import { getAStockBasic, hasTushareToken }       from "@/lib/tushareService";

/**
 * GET /api/stocks/market-stats
 *
 * 返回三个市场的真实接入数量、数据来源与覆盖状态。
 *
 * ┌────┬──────────────────────────────────┬──────────┐
 * │ A  │ 东方财富 clist total（真实全市场）│ 全量     │
 * │ HK │ 东方财富 HK clist total          │ 全量     │
 * │ US │ 本地 83 只 + AV 可全量搜索      │ 部分接入  │
 * └────┴──────────────────────────────────┴──────────┘
 *
 * 结果缓存 1 小时（股票池数量不会频繁变化）。
 */

export const revalidate = 3600; // Next.js Route Segment Config — 1h cache

export interface MarketStat {
  market:       "A" | "HK" | "US";
  name:         string;
  count:        number;
  countLabel:   string;         // 格式化显示，如 "5,432 只"
  source:       string;         // 英文标识
  sourceLabel:  string;         // 中文显示
  coverage:     "full" | "partial";
  coverageLabel: string;        // "全市场" | "部分接入"
  realtime:     boolean;
  searchable:   boolean;
  note:         string;
}

export interface MarketStatsResponse {
  ok:        boolean;
  total:     number;
  updatedAt: string;
  markets:   MarketStat[];
}

function fmt(n: number): string {
  return n.toLocaleString("zh-CN") + " 只";
}

export async function GET() {
  const now = new Date().toISOString();
  const avKey = hasAVKey();

  // ── 并发拉取各市场数量 ───────────────────────────────────────────
  // A股：优先 Tushare stock_basic（全量精确），降级东方财富
  const [tushareAResult, aResult, hkResult, usResult] = await Promise.allSettled([
    hasTushareToken() ? getAStockBasic("L") : Promise.resolve(null),
    listEMStocks(1, 1, "marketCap", true),
    listEMHKStocks(1, 1, "marketCap", true),
    listEMUSStocks(1, 1, "marketCap", true),
  ]);

  // Tushare A股数量（最权威）
  const tushareACount =
    tushareAResult.status === "fulfilled" &&
    tushareAResult.value  !== null        &&
    tushareAResult.value.ok
      ? tushareAResult.value.records.length
      : 0;

  const aEMCount  = aResult.status  === "fulfilled" ? aResult.value.total  : 0;
  const hkCount   = hkResult.status === "fulfilled" ? hkResult.value.total : 0;
  const usEMCount = usResult.status === "fulfilled" ? usResult.value.total : 0;

  // ── A股：Tushare > 东方财富 > 本地 ─────────────────────────────
  const aFinal  = tushareACount > 0 ? tushareACount
                : aEMCount     > 0 ? aEMCount
                : LOCAL_STOCK_COUNTS.A;
  const hkFinal = hkCount   > 0 ? hkCount   : LOCAL_STOCK_COUNTS.HK;
  const usFinal = usEMCount > 0 ? usEMCount : LOCAL_STOCK_COUNTS.US;

  const aSrc    = tushareACount > 0 || aEMCount > 0;
  const aTushare = tushareACount > 0;
  const hkSrc   = hkCount   > 0;
  const usSrc   = usEMCount > 0;

  const markets: MarketStat[] = [
    {
      market:        "A",
      name:          "A股",
      count:         aFinal,
      countLabel:    aSrc ? fmt(aFinal) : `≈${fmt(aFinal)}（本地估算）`,
      source:        aTushare ? "Tushare" : aSrc ? "EastMoney" : "local",
      sourceLabel:   aTushare ? "Tushare stock_basic" : aSrc ? "东方财富接口" : "本地股票池",
      coverage:      aSrc ? "full"    : "partial",
      coverageLabel: aSrc ? "沪深北全市场" : "部分接入",
      realtime:      aSrc,
      searchable:    true,
      note:          aTushare
        ? `Tushare stock_basic，沪深北 ${aFinal.toLocaleString("zh-CN")} 只上市A股（实时行情仍由东方财富提供）`
        : aSrc
        ? "沪深北全市场，支持名称/拼音/代码实时搜索"
        : `当前使用本地 ${LOCAL_STOCK_COUNTS.A} 只 A 股，接口暂时不可用`,
    },
    {
      market:        "HK",
      name:          "港股",
      count:         hkFinal,
      countLabel:    hkSrc ? fmt(hkFinal) : `≈${fmt(hkFinal)}（本地估算）`,
      source:        hkSrc ? "EastMoney" : "local",
      sourceLabel:   hkSrc ? "东方财富接口" : "本地股票池",
      coverage:      hkSrc ? "full"    : "partial",
      coverageLabel: hkSrc ? "港交所全量" : "部分接入",
      realtime:      hkSrc,
      searchable:    true,
      note:          hkSrc
        ? "港交所主板，支持中文/英文/代码搜索"
        : `当前使用本地 ${LOCAL_STOCK_COUNTS.HK} 只港股，东方财富接口暂时不可用`,
    },
    {
      market:        "US",
      name:          "美股",
      count:         usFinal,
      countLabel:    usSrc
        ? fmt(usFinal)
        : avKey
        ? `${fmt(LOCAL_STOCK_COUNTS.US)}（本地）+ 全量搜索`
        : fmt(LOCAL_STOCK_COUNTS.US),
      source:        usSrc ? "EastMoney" : (avKey ? "AlphaVantage+local" : "local"),
      sourceLabel:   usSrc ? "东方财富接口" : (avKey ? "Alpha Vantage + 本地" : "本地股票池"),
      coverage:      usSrc ? "full"    : "partial",
      coverageLabel: usSrc ? "NYSE/NASDAQ/AMEX" : (avKey ? "搜索全量 / 行情部分" : "部分接入"),
      realtime:      usSrc || avKey,
      searchable:    true,
      note:          usSrc
        ? `东方财富接口，NYSE/NASDAQ/AMEX 全市场，支持名称/ticker 实时搜索`
        : avKey
        ? "已配置 Alpha Vantage Key，支持全量 NYSE/NASDAQ ticker 搜索；行情数据实时"
        : `本地 ${LOCAL_STOCK_COUNTS.US} 只美股；配置 ALPHA_VANTAGE_KEY 后可支持全量 ticker 搜索`,
    },
  ];

  const totalCount = aFinal + hkFinal + usFinal;

  return NextResponse.json(
    {
      ok:        true,
      total:     totalCount,
      updatedAt: now,
      markets,
    } satisfies MarketStatsResponse,
    {
      headers: {
        // 浏览器缓存 5 分钟，CDN 1 小时
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
      },
    },
  );
}
