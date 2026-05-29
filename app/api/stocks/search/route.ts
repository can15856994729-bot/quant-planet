import { NextRequest, NextResponse }           from "next/server";
import { searchEMByMarket }                    from "@/lib/eastMoneySearch";
import type { EMStock, EMMarket }              from "@/lib/eastMoneySearch";
import { searchAVStocks, hasAVKey }            from "@/lib/alphaVantage";
import { getPopularStocks, searchStocks }      from "@/lib/stockService";
import type { StockInfo, Market, Exchange }    from "@/lib/stockService";

/**
 * GET /api/stocks/search?q=茅台&market=A&limit=20
 *
 * ┌──────────────┬─────────────────────────────────────────────────┐
 * │ market=A     │ 东方财富 suggest → 沪深北全市场 5500+ 只           │
 * │ market=HK    │ 东方财富 suggest → 港股主板/创业板（代码/中英文名） │
 * │ market=US    │ Alpha Vantage SYMBOL_SEARCH + 东方财富 US fallback│
 * │ 无 market    │ 东方财富 suggest 全市场（A+HK+US 合并返回）        │
 * │ 空查询       │ 本地热门股票（快速，无外部请求）                    │
 * └──────────────┴─────────────────────────────────────────────────┘
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q      = (searchParams.get("q") ?? "").trim();
  const market = (searchParams.get("market") ?? "") as Market | "";
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);

  // ── 空查询 → 本地热门（各市场各约 10 只，快速） ─────────────────
  if (!q) {
    const popular = getPopularStocks(market || null);
    return NextResponse.json({
      stocks: popular, total: popular.length,
      page: 1, limit: popular.length, totalPages: 1,
      source: "local", ok: true,
    });
  }

  // ── 美股搜索：AV SYMBOL_SEARCH + 东方财富 US fallback ──────────
  if (market === "US") {
    const stocks = await searchUS(q, limit);
    if (stocks.length > 0) {
      return NextResponse.json({
        stocks, total: stocks.length,
        page: 1, limit: stocks.length, totalPages: 1,
        source: hasAVKey() ? "alphavantage+eastmoney" : "eastmoney",
        ok: true,
      });
    }
    // 最终 fallback → 本地 stockService 68 只美股
    const local = searchStocks({ query: q, market: "US", limit });
    return NextResponse.json({ ...local, source: "local", ok: true });
  }

  // ── 港股搜索：东方财富 suggest 过滤港股 ────────────────────────
  if (market === "HK") {
    const emHK = await searchEMByMarket(q, "HK", limit);
    if (emHK.length > 0) {
      return NextResponse.json({
        stocks: emHK.map(emToStockInfo),
        total: emHK.length, page: 1, limit: emHK.length, totalPages: 1,
        source: "eastmoney", ok: true,
      });
    }
    // fallback → 本地 51 只港股
    const local = searchStocks({ query: q, market: "HK", limit });
    return NextResponse.json({ ...local, source: "local", ok: true });
  }

  // ── A股搜索：东方财富 suggest → 5500+ 只 ──────────────────────
  if (market === "A") {
    const emA = await searchEMByMarket(q, "A", limit);
    if (emA.length > 0) {
      return NextResponse.json({
        stocks: emA.map(emToStockInfo),
        total: emA.length, page: 1, limit: emA.length, totalPages: 1,
        source: "eastmoney", ok: true,
      });
    }
    // fallback → 本地 94 只 A 股
    const local = searchStocks({ query: q, market: "A", limit });
    return NextResponse.json({ ...local, source: "local", ok: true });
  }

  // ── 无市场限制 → 全市场（A+HK+US 合并） ──────────────────────
  const [emAll, avUS] = await Promise.allSettled([
    searchEMByMarket(q, null, limit),
    searchUS(q, Math.ceil(limit / 3)),
  ]);

  const emResults = emAll.status === "fulfilled" ? emAll.value : [];
  const usResults = avUS.status === "fulfilled"  ? avUS.value  : [];

  // 合并去重（US 优先用 AV 结果；如果 EM 已有对应 US 股，去重）
  const emUSSymbols = new Set(
    emResults.filter((s) => s.market === "US").map((s) => s.symbol.toUpperCase()),
  );
  const extraUS = usResults.filter(
    (s) => !emUSSymbols.has(s.symbol.toUpperCase()),
  );

  const combined: StockInfo[] = [
    ...emResults.map(emToStockInfo),
    ...extraUS,
  ].slice(0, limit);

  if (combined.length > 0) {
    return NextResponse.json({
      stocks: combined, total: combined.length,
      page: 1, limit: combined.length, totalPages: 1,
      source: "eastmoney", ok: true,
    });
  }

  // 兜底 → 本地 213 只
  const local = searchStocks({ query: q, market: null, limit });
  return NextResponse.json({ ...local, source: "local", ok: true });
}

// ── 美股搜索（AV 优先 + EM fallback） ─────────────────────────

async function searchUS(query: string, limit: number): Promise<StockInfo[]> {
  const results: StockInfo[] = [];

  // 1. Alpha Vantage SYMBOL_SEARCH（如有 Key）
  if (hasAVKey()) {
    try {
      const avResults = await searchAVStocks(query, limit);
      for (const av of avResults) {
        results.push({
          symbol:    av.symbol,
          name:      av.name,
          nameEn:    av.name,
          market:    "US",
          exchange:  "NYSE",
          industry:  "",
          currency:  "USD",
          price:     0,
          change:    0,
          changePct: 0,
          volume:    0,
          marketCap: 0,
        });
      }
    } catch { /* skip */ }
  }

  // 2. 东方财富 suggest（包含在其数据库的美股，major tickers）
  if (results.length < limit) {
    try {
      const emUS = await searchEMByMarket(query, "US", limit - results.length);
      const existing = new Set(results.map((r) => r.symbol.toUpperCase()));
      for (const s of emUS) {
        if (!existing.has(s.symbol.toUpperCase())) {
          results.push(emToStockInfo(s));
        }
      }
    } catch { /* skip */ }
  }

  return results.slice(0, limit);
}

// ── 类型转换 ────────────────────────────────────────────────────

function normaliseExchange(ex: EMStock["exchange"], market: EMMarket): Exchange {
  if (ex === "SH") return "SH";
  if (ex === "SZ") return "SZ";
  if (ex === "BJ") return "BJ";
  if (ex === "HKEX") return "HKEX";
  if (ex === "NASDAQ") return "NASDAQ";
  if (ex === "NYSE") return "NYSE";
  // fallback for "US" or unknown
  if (market === "HK") return "HKEX";
  if (market === "US") return "NYSE";
  return "SH";
}

function emToStockInfo(s: EMStock): StockInfo {
  const currencyMap: Record<string, "CNY" | "HKD" | "USD"> = {
    A: "CNY", HK: "HKD", US: "USD",
  };
  return {
    symbol:    s.symbol,
    name:      s.name,
    nameEn:    "",
    market:    s.market as Market,
    exchange:  normaliseExchange(s.exchange, s.market),
    industry:  "",
    currency:  currencyMap[s.market] ?? "CNY",
    price:     s.price    ?? 0,
    change:    s.change   ?? 0,
    changePct: s.changePct ?? 0,
    volume:    0,
    marketCap: s.marketCap ?? 0,
  };
}
