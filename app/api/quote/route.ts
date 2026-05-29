import { NextRequest, NextResponse } from "next/server";
import { getStockBySymbol } from "@/lib/stockService";

// East Money secid auto-detection
function getSecid(symbol: string): string | null {
  // US stocks (letters/dots, no leading digit)
  if (/^[A-Z][A-Z.]*$/.test(symbol)) return `105.${symbol}`;
  // HK stocks (exactly 5 digits)
  if (/^\d{5}$/.test(symbol)) return `116.${symbol}`;
  // A-share: length must be 6 digits
  if (symbol.length !== 6 || !/^\d+$/.test(symbol)) return null;
  // STAR/SH: 6xxxxx, 5xxxxx, 9xxxxx, 603xxx, 601xxx, 600xxx, 688xxx
  if (/^[1-9]/.test(symbol)) return `1.${symbol}`;
  // SZ: 0xxxxx, 3xxxxx (ChiNext), 002xxx, etc.
  return `0.${symbol}`;
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const secid = getSecid(symbol);

  if (!secid) {
    const stock = getStockBySymbol(symbol);
    if (stock) {
      return NextResponse.json({
        symbol,
        name: stock.name,
        price: stock.price,
        change: stock.change,
        changePct: stock.changePct,
        high: stock.price * 1.02,
        low: stock.price * 0.98,
        open: stock.price,
        prevClose: stock.price - stock.change,
        volume: stock.volume,
        marketCap: stock.marketCap,
        isRealtime: false,
        ok: true,
      });
    }
    return NextResponse.json({ error: "unknown symbol" }, { status: 400 });
  }

  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f57,f58,f60,f169,f170,f116,f117`;
    const res = await fetch(url, {
      headers: { Referer: "https://finance.eastmoney.com/" },
      next: { revalidate: 10 },
    });
    const json = await res.json();
    const d = json?.data;
    if (!d || d.f43 === undefined || d.f43 === "-") throw new Error("no data");

    const isUS = secid.startsWith("105.");
    const divisor = isUS ? 1000 : 100;
    const price = Number(d.f43) / divisor;
    if (!price || price <= 0) throw new Error("invalid price");

    return NextResponse.json({
      symbol,
      name:       d.f58,
      price,
      change:     Number(d.f169) / divisor,
      changePct:  Number(d.f170) / 100,
      high:       Number(d.f44) / divisor,
      low:        Number(d.f45) / divisor,
      open:       Number(d.f46) / divisor,
      prevClose:  Number(d.f60) / divisor,
      volume:     d.f47,
      marketCap:  d.f116,
      isRealtime: true,
      ok: true,
    });
  } catch {
    // Fallback to static data
    const stock = getStockBySymbol(symbol);
    if (stock) {
      return NextResponse.json({
        symbol,
        name: stock.name,
        price: stock.price,
        change: stock.change,
        changePct: stock.changePct,
        high: stock.price * 1.02,
        low: stock.price * 0.98,
        open: stock.price,
        prevClose: stock.price - stock.change,
        volume: stock.volume,
        marketCap: stock.marketCap,
        isRealtime: false,
        ok: true,
      });
    }
    return NextResponse.json({ error: "fetch failed", ok: false }, { status: 502 });
  }
}
