import { NextRequest, NextResponse } from "next/server";
import { searchStocks, getPopularStocks } from "@/lib/stockService";
import type { Market } from "@/lib/stockService";

// GET /api/stocks/search?q=贵州茅台&market=A&page=1&limit=20
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? "";
  const market = (searchParams.get("market") ?? "") as Market | "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const sort = (searchParams.get("sort") ?? "marketCap") as "marketCap" | "changePct" | "volume" | "name";

  // If no query and market=all or no market, return popular stocks
  if (!q.trim() && !market) {
    const popular = getPopularStocks(null);
    return NextResponse.json({
      stocks: popular,
      total: popular.length,
      page: 1,
      limit: popular.length,
      totalPages: 1,
      ok: true,
    });
  }

  const result = searchStocks({
    query: q,
    market: market || null,
    page,
    limit: Math.min(limit, 100),
    sort,
  });

  return NextResponse.json({ ...result, ok: true });
}
