import { NextRequest, NextResponse } from "next/server";
import { getStockBySymbol } from "@/lib/stockService";
import { fetchAVQuotesBatch, isUSSymbol, hasAVKey } from "@/lib/alphaVantage";

// ── East Money secid helper (A股 / HK) ─────────────────────────
function getSecid(symbol: string): string | null {
  if (isUSSymbol(symbol)) return `105.${symbol}`; // fallback for EM US
  if (/^\d{5}$/.test(symbol)) return `116.${symbol}`; // HK 5-digit
  if (symbol.length !== 6 || !/^\d+$/.test(symbol)) return null;
  if (/^[69]/.test(symbol) || symbol.startsWith("688")) return `1.${symbol}`; // SH / STAR
  return `0.${symbol}`; // SZ / ChiNext
}

type QuoteResult = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
  volume?: number;
  marketCap?: number;
  isRealtime: boolean;
  source: "alphavantage" | "eastmoney" | "static";
  updatedAt: string;
};

// GET /api/stocks/quote?symbols=600519,00700,AAPL,NVDA
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const results: Record<string, QuoteResult> = {};

  // ── 1. Split US vs non-US ─────────────────────────────────────
  const usSymbols  = symbols.filter(isUSSymbol);
  const cnhkSymbols = symbols.filter((s) => !isUSSymbol(s));

  // ── 2. Alpha Vantage for US stocks ───────────────────────────
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
          open: q.open,
          high: q.high,
          low: q.low,
          prevClose: q.prevClose,
          volume: q.volume,
          marketCap: staticStock?.marketCap,
          isRealtime: true,
          source: "alphavantage",
          updatedAt: now,
        };
      }
    } catch {
      // fall through to East Money / static
    }
  }

  // ── 3. East Money for A股 / HK (+ US fallback if AV not set) ─
  const needEM = [
    ...cnhkSymbols,
    ...(hasAVKey() ? [] : usSymbols), // also try EM for US if no AV key
  ].filter((s) => !results[s]);

  if (needEM.length > 0) {
    const secids = needEM.map(getSecid).filter(Boolean).join(",");
    if (secids) {
      try {
        // f13 = mktNum: 0/1/2=A股, 116=HK, 105=US
        // HK prices are ×1000 (港仙/mil), A & US are ×100
        const url =
          `https://push2.eastmoney.com/api/qt/ulist.np/get` +
          `?secids=${secids}&fields=f2,f3,f4,f12,f13,f14,f47,f116`;
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
          const mktNum = Number(d.f13 ?? 0);
          const divisor = mktNum === 116 ? 1000 : 100; // HK=1000, A/US=100
          const price = Number(d.f2) / divisor;
          if (price > 0 && !results[sym]) {
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
      } catch {
        // fall through to static
      }
    }
  }

  // ── 4. Static fallback for any remaining symbols ─────────────
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
    usSymbols,
    cnhkSymbols,
  });
}
