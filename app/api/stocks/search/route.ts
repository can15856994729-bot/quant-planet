import { NextRequest, NextResponse } from "next/server";
import { searchEMStocks }           from "@/lib/eastMoneySearch";
import { getPopularStocks, searchStocks } from "@/lib/stockService";
import type { Market }              from "@/lib/stockService";

/**
 * GET /api/stocks/search?q=茅台&market=A&limit=20
 *
 * A 股搜索：走东方财富 suggest API → 覆盖 5500+ 只全市场股票
 * HK / US 搜索：仍走本地 stockService（213 只基础库）
 * 空查询：返回各市场热门股票（本地，快速）
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q      = (searchParams.get("q") ?? "").trim();
  const market = (searchParams.get("market") ?? "") as Market | "";
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const page   = parseInt(searchParams.get("page") ?? "1", 10);

  // ── 空查询 → 热门股票（本地，不请求外部 API） ──────────────────
  if (!q) {
    const popular = getPopularStocks(market || null);
    return NextResponse.json({
      stocks:     popular,
      total:      popular.length,
      page:       1,
      limit:      popular.length,
      totalPages: 1,
      source:     "local",
      ok:         true,
    });
  }

  // ── A 股（含无市场限定）→ 东方财富 suggest，覆盖全市场 ─────────
  if (!market || market === "A") {
    try {
      const emResults = await searchEMStocks(q, limit);

      if (emResults.length > 0) {
        const stocks = emResults.map((s) => ({
          symbol:    s.symbol,
          name:      s.name,
          nameEn:    "",
          market:    "A" as Market,
          exchange:  s.exchange,
          industry:  "",
          currency:  "CNY" as const,
          price:     s.price ?? 0,
          change:    s.change ?? 0,
          changePct: s.changePct ?? 0,
          volume:    0,
          marketCap: s.marketCap ?? 0,
          secid:     s.secid,
        }));

        return NextResponse.json({
          stocks,
          total:      stocks.length,
          page:       1,
          limit:      stocks.length,
          totalPages: 1,
          source:     "eastmoney",
          ok:         true,
        });
      }
    } catch {
      // fall through to local
    }
  }

  // ── HK / US 或 East Money 失败 → 本地 stockService ────────────
  const result = searchStocks({
    query:  q,
    market: market || null,
    page,
    limit,
    sort:   "marketCap",
  });

  return NextResponse.json({
    ...result,
    source: "local",
    ok: true,
  });
}
