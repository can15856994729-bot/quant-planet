/**
 * Alpha Vantage API client — US stock real-time quotes
 * Free tier: 25 req/day (as of 2024) or 5 req/min / 500/day (legacy free)
 * Premium: 75 req/min, unlimited/day
 * Docs: https://www.alphavantage.co/documentation/
 *
 * Set env var: ALPHA_VANTAGE_KEY=your_key_here
 */

const AV_BASE = "https://www.alphavantage.co/query";

export interface AVQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePct: number;   // decimal e.g. 1.43 means +1.43%
  volume: number;
  latestDay: string;   // "2024-01-26"
}

/** Check if AV key is configured and not the placeholder */
export function hasAVKey(): boolean {
  const k = process.env.ALPHA_VANTAGE_KEY ?? "";
  return k.length > 0 && !k.startsWith("your_");
}

/**
 * Fetch a single US stock quote from Alpha Vantage.
 * Uses Next.js Data Cache with 120s revalidate to avoid hitting rate limits.
 * Returns null if key not set, rate limited, or any error.
 */
export async function fetchAVQuote(symbol: string): Promise<AVQuote | null> {
  if (!hasAVKey()) return null;
  const key = process.env.ALPHA_VANTAGE_KEY!;

  const url =
    `${AV_BASE}?function=GLOBAL_QUOTE` +
    `&symbol=${encodeURIComponent(symbol.toUpperCase())}` +
    `&apikey=${key}`;

  try {
    const res = await fetch(url, {
      // Next.js Data Cache — revalidate every 2 minutes per symbol per server
      next: { revalidate: 120, tags: [`av-${symbol}`] },
      headers: { "User-Agent": "QuantPlanet/1.0" },
    });
    if (!res.ok) return null;

    const json = await res.json();

    // Rate-limit or info messages from Alpha Vantage
    if (json["Note"] || json["Information"]) {
      console.warn("[AV] Rate limit / info for", symbol, json["Note"] ?? json["Information"]);
      return null;
    }

    const q = json["Global Quote"];
    if (!q || !q["05. price"]) return null;

    const rawPct = (String(q["10. change percent"] ?? "")).replace("%", "").trim();

    return {
      symbol: String(q["01. symbol"] ?? symbol).toUpperCase(),
      open:      parseFloat(q["02. open"]      ?? "0"),
      high:      parseFloat(q["03. high"]      ?? "0"),
      low:       parseFloat(q["04. low"]       ?? "0"),
      price:     parseFloat(q["05. price"]     ?? "0"),
      volume:    parseInt(  q["06. volume"]    ?? "0", 10),
      latestDay: String(q["07. latest trading day"] ?? ""),
      prevClose: parseFloat(q["08. previous close"] ?? "0"),
      change:    parseFloat(q["09. change"]    ?? "0"),
      changePct: parseFloat(rawPct            || "0"),
    };
  } catch (e) {
    console.error("[AV] fetch error for", symbol, e);
    return null;
  }
}

/**
 * Fetch multiple US stock quotes sequentially.
 * Adds a small delay between requests to stay within free-tier rate limits.
 * delayMs default = 300ms → max ~200 req/min, well under 5 req/min for the free tier
 * when called per-user; server-side Next.js cache means identical symbol+key
 * combos are served from cache without hitting AV.
 */
export async function fetchAVQuotesBatch(
  symbols: string[],
  delayMs = 300
): Promise<Record<string, AVQuote>> {
  const results: Record<string, AVQuote> = {};
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    try {
      const q = await fetchAVQuote(sym);
      if (q) results[sym.toUpperCase()] = q;
    } catch { /* skip individual failures */ }
    if (i < symbols.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

/** Detect whether a symbol belongs to the US market */
export function isUSSymbol(symbol: string): boolean {
  // US symbols: all letters (and BRK.B style dots), no leading digit
  return /^[A-Z][A-Z.]*$/.test(symbol.toUpperCase());
}

// ── SYMBOL_SEARCH ────────────────────────────────────────────────

export interface AVSearchResult {
  symbol:     string;   // "AAPL"
  name:       string;   // "Apple Inc"
  type:       string;   // "Equity"
  region:     string;   // "United States"
  currency:   string;   // "USD"
  matchScore: number;   // 0-1
}

/**
 * Alpha Vantage SYMBOL_SEARCH — 搜索美股 ticker
 *
 * 免费额度：25 req/day（旧版）或 5 req/min；Next.js Data Cache revalidate:3600
 * 降低实际 API 命中次数。返回空数组时调用方应 fallback 到东方财富。
 *
 * 使用此接口无需额外 API Key，沿用现有 ALPHA_VANTAGE_KEY。
 */
export async function searchAVStocks(
  query: string,
  limit = 10,
): Promise<AVSearchResult[]> {
  if (!hasAVKey() || !query.trim()) return [];

  const key = process.env.ALPHA_VANTAGE_KEY!;
  const url =
    `${AV_BASE}?function=SYMBOL_SEARCH` +
    `&keywords=${encodeURIComponent(query.toUpperCase())}` +
    `&apikey=${key}`;

  try {
    const res = await fetch(url, {
      // 1 小时缓存 — 降低 25 req/day 消耗
      next: { revalidate: 3600, tags: [`av-search-${query.toUpperCase()}`] },
      headers: { "User-Agent": "QuantPlanet/1.0" },
    });
    if (!res.ok) return [];

    const json = await res.json();
    // Rate limit response
    if (json["Note"] || json["Information"]) {
      console.warn("[AV search] rate limit:", json["Note"] ?? json["Information"]);
      return [];
    }

    const matches: Record<string, string>[] = json["bestMatches"] ?? [];

    return matches
      .filter(
        (m) =>
          m["3. type"] === "Equity" &&
          (m["4. region"] === "United States" ||
            m["4. region"] === "United States (ETF)"),
      )
      .slice(0, limit)
      .map((m) => ({
        symbol:     m["1. symbol"]      ?? "",
        name:       m["2. name"]        ?? "",
        type:       m["3. type"]        ?? "",
        region:     m["4. region"]      ?? "",
        currency:   m["8. currency"]    ?? "USD",
        matchScore: parseFloat(m["9. matchScore"] ?? "0"),
      }));
  } catch (e) {
    console.error("[AV search] error:", e);
    return [];
  }
}
