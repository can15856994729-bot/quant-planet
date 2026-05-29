import { NextRequest, NextResponse } from "next/server";
import { listEMStocks, listEMHKStocks } from "@/lib/eastMoneySearch";
import { searchStocks }                 from "@/lib/stockService";
import type { Market }                  from "@/lib/stockService";

/**
 * GET /api/stocks/list?market=A&page=1&limit=50&sort=marketCap
 *
 * A 股：东方财富 clist — 5500+ 全量，含实时价格
 * 港 股：东方财富 clist — 港股主板，含实时价格
 * 美 股：本地 68 只（AV 无免费的 browse API）
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

  // ── A 股 → 东方财富全量（5500+） ────────────────────────────
  if (!market || market === "A") {
    try {
      const result = await listEMStocks(page, limit, sortField, sortDesc);
      if (result.stocks.length > 0) {
        return NextResponse.json({
          stocks: result.stocks.map((s) => ({
            symbol: s.symbol, name: s.name, nameEn: "",
            market: "A" as Market, exchange: s.exchange,
            industry: "", currency: "CNY" as const,
            price: s.price ?? 0, change: s.change ?? 0,
            changePct: s.changePct ?? 0,
            volume: 0, marketCap: s.marketCap ?? 0, turnover: s.turnover ?? 0,
          })),
          total: result.total, page: result.page,
          limit: result.pageSize,
          totalPages: Math.ceil(result.total / result.pageSize),
          source: "eastmoney", ok: true,
        });
      }
    } catch { /* fall through */ }
  }

  // ── 港股 → 东方财富港股 clist ────────────────────────────────
  if (market === "HK") {
    try {
      const result = await listEMHKStocks(page, limit, sortField, sortDesc);
      if (result.stocks.length > 0) {
        return NextResponse.json({
          stocks: result.stocks.map((s) => ({
            symbol: s.symbol, name: s.name, nameEn: "",
            market: "HK" as Market, exchange: "HKEX",
            industry: "", currency: "HKD" as const,
            price: s.price ?? 0, change: s.change ?? 0,
            changePct: s.changePct ?? 0,
            volume: 0, marketCap: s.marketCap ?? 0, turnover: s.turnover ?? 0,
          })),
          total: result.total, page: result.page,
          limit: result.pageSize,
          totalPages: Math.ceil(result.total / result.pageSize),
          source: "eastmoney", ok: true,
        });
      }
    } catch { /* fall through */ }
  }

  // ── 美股 / fallback → 本地 stockService ─────────────────────
  const sortMapped = (sortField === "turnover" || sortField === "price")
    ? "volume"
    : sortField as "marketCap" | "changePct" | "volume" | "name";

  const result = searchStocks({
    query: "", market: market || null,
    page, limit, sort: sortMapped,
  });

  return NextResponse.json({ ...result, source: "local", ok: true });
}
