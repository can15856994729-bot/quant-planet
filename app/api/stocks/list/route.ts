import { NextRequest, NextResponse } from "next/server";
import { searchStocks } from "@/lib/stockService";
import type { Market } from "@/lib/stockService";

// GET /api/stocks/list?market=A&page=1&limit=50&sort=marketCap
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const market = (searchParams.get("market") ?? "") as Market | "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const sort = (searchParams.get("sort") ?? "marketCap") as "marketCap" | "changePct" | "volume" | "name";

  const result = searchStocks({
    query: "",
    market: market || null,
    page,
    limit: Math.min(limit, 200),
    sort,
  });

  return NextResponse.json({ ...result, ok: true });
}
