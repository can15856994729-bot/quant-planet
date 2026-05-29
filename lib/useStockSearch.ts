"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { StockInfo, Market } from "./stockService";

export interface UseStockSearchResult {
  results: StockInfo[];
  loading: boolean;
  total:   number;
  error:   string | null;
}

/**
 * 防抖股票搜索 Hook
 *
 * - 空查询 → 调用 /api/stocks/search（返回热门股票，本地快速响应）
 * - 有查询 → 300ms 防抖后调用 API
 *   - market=A 或无限制 → 东方财富 suggest（覆盖 5500+ 全市场）
 *   - market=HK/US → 本地 stockService
 */
export function useStockSearch(
  query:  string,
  market?: Market | null,
  limit = 30,
): UseStockSearchResult {
  const [results, setResults] = useState<StockInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [total,   setTotal]   = useState(0);
  const [error,   setError]   = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string, mkt: Market | null | undefined) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: String(limit), page: "1" });
        if (q) params.set("q", q);
        if (mkt) params.set("market", mkt);

        const res  = await fetch(`/api/stocks/search?${params}`, { cache: "no-store" });
        const data = await res.json();
        if (data.ok) {
          setResults(data.stocks ?? []);
          setTotal(data.total ?? 0);
        } else {
          setError(data.error ?? "搜索失败");
        }
      } catch (e) {
        setError(String(e));
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [limit],
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query.trim()) {
      // 空查询：立即请求（API 返回热门股票，本地 <5ms）
      doSearch("", market);
    } else {
      // 有查询：防抖 300ms
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
