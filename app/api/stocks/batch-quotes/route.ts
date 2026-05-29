import { NextRequest, NextResponse } from "next/server";
import { getStockBySymbol } from "@/lib/stockService";

function getSecid(symbol: string): string | null {
  if (/^[A-Z.]+$/.test(symbol) && !symbol.match(/^\d/)) return `105.${symbol}`;
  if (/^\d{5}$/.test(symbol)) return `116.${symbol}`;
  if (/^[69]/.test(symbol) && symbol.length === 6) return `1.${symbol}`;
  if (symbol.startsWith("688") && symbol.length === 6) return `1.${symbol}`;
  if (/^[0-3]/.test(symbol) && symbol.length === 6) return `0.${symbol}`;
  return null;
}

// POST /api/stocks/batch-quotes { symbols: string[] }
export async function POST(req: NextRequest) {
  let body: { symbols?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const symbols = (body.symbols ?? [])
    .map((s: string) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: {}, ok: true });
  }

  const results: Record<string, {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePct: number;
    volume?: number;
    marketCap?: number;
    isRealtime: boolean;
    updatedAt: string;
  }> = {};

  const secids = symbols.map(getSecid).filter(Boolean).join(",");
  if (secids) {
    try {
      const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f2,f3,f4,f12,f14,f47,f116`;
      const res = await fetch(url, {
        headers: { Referer: "https://finance.eastmoney.com/" },
        next: { revalidate: 15 },
      });
      const json = await res.json();
      const items: unknown[] = json?.data?.diff ?? [];
      for (const item of items) {
        const d = item as Record<string, number | string> | null;
        if (!d || !d.f12) continue;
        const sym = String(d.f12).toUpperCase();
        const secid = getSecid(sym);
        const isUS = secid?.startsWith("105.") ?? false;
        const divisor = isUS ? 1000 : 100;
        const price = Number(d.f2) / divisor;
        if (price > 0) {
          results[sym] = {
            symbol: sym,
            name: String(d.f14 ?? ""),
            price,
            change: Number(d.f4) / divisor,
            changePct: Number(d.f3) / 100,
            volume: Number(d.f47) || undefined,
            marketCap: Number(d.f116) || undefined,
            isRealtime: true,
            updatedAt: new Date().toISOString(),
          };
        }
      }
    } catch {
      // fallback below
    }
  }

  // Fill missing from static data
  for (const sym of symbols) {
    if (!results[sym]) {
      const stock = getStockBySymbol(sym);
      if (stock) {
        results[sym] = {
          symbol: sym,
          name: stock.name,
          price: stock.price,
          change: stock.change,
          changePct: stock.changePct,
          volume: stock.volume,
          marketCap: stock.marketCap,
          isRealtime: false,
          updatedAt: new Date().toISOString(),
        };
      }
    }
  }

  return NextResponse.json({ quotes: results, ok: true });
}
