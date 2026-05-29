import { NextRequest, NextResponse } from "next/server";
import { getStockBySymbol } from "@/lib/stockService";
import { fetchAVQuotesBatch, isUSSymbol, hasAVKey } from "@/lib/alphaVantage";

function getSecid(symbol: string): string | null {
  if (isUSSymbol(symbol)) return `105.${symbol}`;
  if (/^\d{5}$/.test(symbol)) return `116.${symbol}`;
  if (symbol.length !== 6 || !/^\d+$/.test(symbol)) return null;
  if (/^[69]/.test(symbol) || symbol.startsWith("688")) return `1.${symbol}`;
  return `0.${symbol}`;
}

type QuoteResult = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume?: number;
  marketCap?: number;
  isRealtime: boolean;
  source: "alphavantage" | "eastmoney" | "static";
  updatedAt: string;
};

// POST /api/stocks/batch-quotes  body: { symbols: string[] }
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

  const now = new Date().toISOString();
  const results: Record<string, QuoteResult> = {};

  // ── 1. US stocks via Alpha Vantage ────────────────────────────
  const usSymbols   = symbols.filter(isUSSymbol);
  const cnhkSymbols = symbols.filter((s) => !isUSSymbol(s));

  if (usSymbols.length > 0 && hasAVKey()) {
    try {
      const avQuotes = await fetchAVQuotesBatch(usSymbols, 350);
      for (const [sym, q] of Object.entries(avQuotes)) {
        const staticStock = getStockBySymbol(sym);
        results[sym] = {
          symbol: sym,
          name: staticStock?.name ?? staticStock?.nameEn ?? sym,
          price: q.price,
          change: q.change,
          changePct: q.changePct,
          volume: q.volume,
          marketCap: staticStock?.marketCap,
          isRealtime: true,
          source: "alphavantage",
          updatedAt: now,
        };
      }
    } catch { /* fall through */ }
  }

  // ── 2. East Money for A股 / HK (+ US fallback without AV) ────
  const needEM = [
    ...cnhkSymbols,
    ...(hasAVKey() ? [] : usSymbols),
  ].filter((s) => !results[s]);

  if (needEM.length > 0) {
    const secids = needEM.map(getSecid).filter(Boolean).join(",");
    if (secids) {
      try {
        const url =
          `https://push2.eastmoney.com/api/qt/ulist.np/get` +
          `?secids=${secids}&fields=f2,f3,f4,f12,f14,f47,f116`;
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
          if (results[sym]) continue;
          const isUS = isUSSymbol(sym);
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
              source: "eastmoney",
              updatedAt: now,
            };
          }
        }
      } catch { /* fall through to static */ }
    }
  }

  // ── 3. Static fallback ────────────────────────────────────────
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
          source: "static",
          updatedAt: now,
        };
      }
    }
  }

  return NextResponse.json({
    quotes: results,
    ok: true,
    avEnabled: hasAVKey(),
  });
}
