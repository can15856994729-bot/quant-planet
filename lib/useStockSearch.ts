"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getPopularStocks } from "./stockService";
import type { StockInfo, Market } from "./stockService";

export interface UseStockSearchResult {
  results: StockInfo[];
  loading: boolean;
  total: number;
  error: string | null;
}

// Debounced stock search hook using /api/stocks/search
export function useStockSearch(
  query: string,
  market?: Market | null,
  limit = 30
): UseStockSearchResult {
  const [results, setResults] = useState<StockInfo[]>(() =>
    getPopularStocks(market)
  );
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string, mkt: Market | null | undefined) => {
      // For empty query, show popular stocks immediately (no network needed)
      if (!q.trim()) {
        const popular = getPopularStocks(mkt);
        setResults(popular);
        setTotal(popular.length);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q,
          limit: String(limit),
          page: "1",
        });
        if (mkt) params.set("market", mkt);

        const res = await fetch(`/api/stocks/search?${params}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (data.ok) {
          setResults(data.stocks);
          setTotal(data.total);
        } else {
          setError(data.error ?? "Search failed");
        }
      } catch (e) {
        setError(String(e));
        // Fallback: search locally using imported function
        const { searchStocks } = await import("./stockService");
        const fallback = searchStocks({ query: q, market: mkt ?? null, limit });
        setResults(fallback.stocks);
        setTotal(fallback.total);
      } finally {
        setLoading(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query.trim()) {
      // Immediate for empty query
      doSearch("", market);
    } else {
      // 300ms debounce for typing
      timerRef.current = setTimeout(() => {
        doSearch(query, market);
      }, 300);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, market, doSearch]);

  return { results, loading, total, error };
}
