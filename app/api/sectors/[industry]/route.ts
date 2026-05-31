/**
 * GET /api/sectors/[industry]?quotes=1
 *
 * 返回某申万一级行业下所有 A股股票列表。
 * ?quotes=1  同时批量获取实时行情（价格、涨跌幅、成交额、换手率、市值）
 *
 * 股票列表来源：Tushare stock_basic（缓存 24h）
 * 实时行情来源：东方财富批量行情（缓存 30s）
 * HTTP 缓存：quotes=0 → 24h；quotes=1 → 30s
 */
import { NextRequest, NextResponse } from "next/server";
import { getAStockBasic, hasTushareToken } from "@/lib/tushareService";
import { mapToSWSector, isST, type TushareStockRecord } from "@/lib/sectorService";
import { fetchBatchQuotes, getSecid } from "@/lib/quoteService";

export const dynamic = "force-dynamic";

export interface SectorStock {
  symbol:      string;    // e.g. "600519"
  tsCode:      string;    // e.g. "600519.SH"
  name:        string;
  exchange:    string;    // "SH" | "SZ" | "BJ"
  industry:    string;    // Tushare 原始行业
  swIndustry:  string;    // 申万一级行业
  area:        string;
  listDate:    string;
  isST:        boolean;

  // 实时行情（需要 ?quotes=1）
  price:         number | null;
  changePct:     number | null;
  changeAmt:     number | null;
  volume:        number | null;   // 手
  amount:        number | null;   // 元
  turnoverRate:  number | null;   // %
  marketCap:     number | null;   // 元
  floatMarketCap: number | null;  // 元
  pe:            number | null;   // 使用 daily_basic（暂无，留 null）
  pb:            number | null;
  isRealtime:    boolean;
}

// ── 内存缓存（按行业 + quotes 分别缓存）────────────────────────────
const _stockCache = new Map<string, { records: TushareStockRecord[]; ts: number }>();
const _quoteCache = new Map<string, { quotes: Record<string, SectorStock>; ts: number }>();
const STOCK_TTL = 24 * 3600_000;
const QUOTE_TTL = 30_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ industry: string }> }
) {
  const { industry } = await params;
  const swIndustry   = decodeURIComponent(industry);
  const withQuotes   = req.nextUrl.searchParams.get("quotes") === "1";

  if (!hasTushareToken()) {
    return NextResponse.json({
      ok: false, error: "TUSHARE_TOKEN 未配置", stocks: [], stockCount: 0,
    });
  }

  // ── 1. 获取全市场股票池（内存缓存 24h）──────────────────────────
  let allRecords: TushareStockRecord[];
  const stockCached = _stockCache.get("all");
  if (stockCached && Date.now() - stockCached.ts < STOCK_TTL) {
    allRecords = stockCached.records;
  } else {
    const basicRes = await getAStockBasic("L");
    if (!basicRes.ok) {
      return NextResponse.json({ ok: false, error: basicRes.error, stocks: [], stockCount: 0 });
    }
    allRecords = basicRes.records as unknown as TushareStockRecord[];
    _stockCache.set("all", { records: allRecords, ts: Date.now() });
  }

  // ── 2. 筛选本行业股票 ─────────────────────────────────────────
  const filtered = allRecords.filter(r =>
    mapToSWSector(String(r.industry ?? "")) === swIndustry
  );

  if (filtered.length === 0) {
    return NextResponse.json({
      ok:          true,
      swIndustry,
      stockCount:  0,
      stocks:      [],
      quoteOk:     false,
      updatedAt:   new Date().toISOString(),
    });
  }

  // ── 3. 构建基础股票信息 ───────────────────────────────────────
  const baseStocks: SectorStock[] = filtered.map(r => {
    const tsCodeStr = String(r.ts_code ?? "");
    const symStr    = String(r.symbol ?? tsCodeStr.split(".")[0] ?? "");
    const exchStr   = tsCodeStr.includes(".") ? tsCodeStr.split(".")[1] ?? "" : String(r.exchange ?? "");

    return {
      symbol:        symStr,
      tsCode:        tsCodeStr,
      name:          String(r.name ?? ""),
      exchange:      exchStr,
      industry:      String(r.industry ?? ""),
      swIndustry,
      area:          String(r.area ?? ""),
      listDate:      String(r.list_date ?? ""),
      isST:          isST(String(r.name ?? "")),
      price:         null,
      changePct:     null,
      changeAmt:     null,
      volume:        null,
      amount:        null,
      turnoverRate:  null,
      marketCap:     null,
      floatMarketCap: null,
      pe:            null,
      pb:            null,
      isRealtime:    false,
    };
  });

  // ── 4. 实时行情（可选，?quotes=1）────────────────────────────
  let quoteOk = false;

  if (withQuotes) {
    const cacheKey = swIndustry;
    const qCached  = _quoteCache.get(cacheKey);
    let quoteMap: Record<string, Pick<SectorStock, "price" | "changePct" | "changeAmt" | "volume" | "amount" | "turnoverRate" | "marketCap" | "floatMarketCap" | "isRealtime">> = {};

    if (qCached && Date.now() - qCached.ts < QUOTE_TTL) {
      quoteMap = qCached.quotes as typeof quoteMap;
      quoteOk  = true;
    } else {
      const symbols = baseStocks.map(s => s.symbol);
      try {
        const rawQuotes = await fetchBatchQuotes(symbols);
        for (const [sym, q] of Object.entries(rawQuotes)) {
          if (q.price > 0) {
            quoteMap[sym] = {
              price:         q.price,
              changePct:     q.changePct,
              changeAmt:     q.change,
              volume:        q.volume,
              amount:        q.amount ?? null,
              turnoverRate:  q.turnoverRate ?? null,
              marketCap:     q.marketCap ?? null,
              floatMarketCap: q.floatMarketCap ?? null,
              isRealtime:    q.isRealtime,
            };
            if (q.isRealtime) quoteOk = true;
          }
        }
        _quoteCache.set(cacheKey, { quotes: quoteMap as Record<string, SectorStock>, ts: Date.now() });
      } catch { /* 行情获取失败，返回基础信息 */ }
    }

    // 合并行情到股票列表
    for (const stock of baseStocks) {
      const q = quoteMap[stock.symbol];
      if (q) {
        stock.price         = q.price;
        stock.changePct     = q.changePct;
        stock.changeAmt     = q.changeAmt;
        stock.volume        = q.volume;
        stock.amount        = q.amount;
        stock.turnoverRate  = q.turnoverRate;
        stock.marketCap     = q.marketCap;
        stock.floatMarketCap = q.floatMarketCap;
        stock.isRealtime    = q.isRealtime;
      }
    }
  }

  const cacheSeconds = withQuotes ? 30 : 86400;
  return NextResponse.json(
    {
      ok:          true,
      swIndustry,
      stockCount:  baseStocks.length,
      stocks:      baseStocks,
      quoteOk,
      updatedAt:   new Date().toISOString(),
    },
    { headers: { "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${Math.floor(cacheSeconds / 2)}` } },
  );
}
