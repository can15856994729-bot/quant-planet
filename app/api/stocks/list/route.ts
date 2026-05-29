import { NextRequest, NextResponse } from "next/server";
import { listEMStocks }    from "@/lib/eastMoneySearch";
import { searchStocks }    from "@/lib/stockService";
import type { Market }     from "@/lib/stockService";

/**
 * GET /api/stocks/list?market=A&page=1&limit=50&sort=marketCap
 *
 * A 股：走东方财富 clist API，支持 5500+ 全量分页浏览（含实时价格）
 * HK / US：本地 stockService（共 119 只）
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const market   = (searchParams.get("market") ?? "A") as Market | "";
  const page     = parseInt(searchParams.get("page")   ?? "1",  10);
  const limit    = Math.min(parseInt(searchParams.get("limit")  ?? "50", 10), 100);
  const sortRaw  = searchParams.get("sort") ?? "marketCap";
  const sortDesc = (searchParams.get("order") ?? "desc") !== "asc";

  const sortField = (["marketCap","changePct","price","turnover"].includes(sortRaw)
    ? sortRaw : "marketCap") as "marketCap" | "changePct" | "price" | "turnover";

  // ── A 股 → 东方财富全量列表 ───────────────────────────────────
  if (!market || market === "A") {
    try {
      const result = await listEMStocks(page, limit, sortField, sortDesc);

      if (result.stocks.length > 0) {
        const stocks = result.stocks.map((s) => ({
          symbol:    s.symbol,
          name:      s.name,
          nameEn:    "",
          market:    "A" as Market,
          exchange:  s.exchange,
          industry:  "",
          currency:  "CNY" as const,
          price:     s.price    ?? 0,
          change:    s.change   ?? 0,
          changePct: s.changePct ?? 0,
          volume:    0,
          marketCap: s.marketCap ?? 0,
          turnover:  s.turnover  ?? 0,
        }));

        return NextResponse.json({
          stocks,
          total:      result.total,
          page:       result.page,
          limit:      result.pageSize,
          totalPages: Math.ceil(result.total / result.pageSize),
          source:     "eastmoney",
          ok:         true,
        });
      }
    } catch {
      // fall through to local
    }
  }

  // ── HK / US 或 East Money 失败 → 本地 ─────────────────────────
  const result = searchStocks({
    query:  "",
    market: market || null,
    page,
    limit,
    sort:   (sortField === "turnover" || sortField === "price") ? "volume" : sortField as "marketCap" | "changePct" | "volume" | "name",
  });

  return NextResponse.json({ ...result, source: "local", ok: true });
}
