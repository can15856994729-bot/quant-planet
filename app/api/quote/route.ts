import { NextRequest, NextResponse } from "next/server";
import { getStockBySymbol } from "@/lib/stockService";
import { fetchAVQuote, isUSSymbol, hasAVKey } from "@/lib/alphaVantage";

// ── East Money secid helper ────────────────────────────────────
function getSecid(symbol: string): string | null {
  if (isUSSymbol(symbol)) return `105.${symbol}`;
  if (/^\d{5}$/.test(symbol)) return `116.${symbol}`;
  if (symbol.length !== 6 || !/^\d+$/.test(symbol)) return null;
  if (/^[69]/.test(symbol) || symbol.startsWith("688")) return `1.${symbol}`;
  return `0.${symbol}`;
}

// GET /api/quote?symbol=AAPL  or  /api/quote?symbol=600519
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const staticStock = getStockBySymbol(symbol);
  const now = new Date().toISOString();

  // ── US stock: try Alpha Vantage first ─────────────────────────
  if (isUSSymbol(symbol) && hasAVKey()) {
    try {
      const q = await fetchAVQuote(symbol);
      if (q && q.price > 0) {
        return NextResponse.json({
          symbol,
          name: staticStock?.name ?? staticStock?.nameEn ?? q.symbol,
          price:     q.price,
          change:    q.change,
          changePct: q.changePct,
          open:      q.open,
          high:      q.high,
          low:       q.low,
          prevClose: q.prevClose,
          volume:    q.volume,
          marketCap: staticStock?.marketCap,
          isRealtime: true,
          source: "alphavantage",
          latestDay: q.latestDay,
          updatedAt: now,
          ok: true,
        });
      }
    } catch { /* fall through */ }
  }

  // ── East Money (A股 / HK, and US fallback) ────────────────────
  const secid = getSecid(symbol);
  if (secid) {
    try {
      const url =
        `https://push2.eastmoney.com/api/qt/stock/get` +
        `?secid=${secid}&fields=f43,f44,f45,f46,f47,f57,f58,f60,f169,f170,f116,f117`;
      const res = await fetch(url, {
        headers: { Referer: "https://finance.eastmoney.com/" },
        next: { revalidate: 15 },
      });
      const json = await res.json();
      const d = json?.data;
      if (d && d.f43 !== undefined && d.f43 !== "-") {
        const isUS = isUSSymbol(symbol);
        const divisor = isUS ? 1000 : 100;
        const price = Number(d.f43) / divisor;
        if (price > 0) {
          return NextResponse.json({
            symbol,
            name: staticStock?.name ?? String(d.f58 ?? symbol),
            price,
            change:    Number(d.f169) / divisor,
            changePct: Number(d.f170) / 100,
            high:      Number(d.f44) / divisor,
            low:       Number(d.f45) / divisor,
            open:      Number(d.f46) / divisor,
            prevClose: Number(d.f60) / divisor,
            volume:    d.f47,
            marketCap: d.f116,
            isRealtime: true,
            source: "eastmoney",
            updatedAt: now,
            ok: true,
          });
        }
      }
    } catch { /* fall through to static */ }
  }

  // ── Static fallback ───────────────────────────────────────────
  if (staticStock) {
    return NextResponse.json({
      symbol,
      name: staticStock.name,
      price:     staticStock.price,
      change:    staticStock.change,
      changePct: staticStock.changePct,
      high:      staticStock.price * 1.02,
      low:       staticStock.price * 0.98,
      open:      staticStock.price,
      prevClose: staticStock.price - staticStock.change,
      volume:    staticStock.volume,
      marketCap: staticStock.marketCap,
      isRealtime: false,
      source: "static",
      updatedAt: now,
      ok: true,
    });
  }

  return NextResponse.json({ error: "unknown symbol", ok: false }, { status: 404 });
}
