"use client";
import { useState, useEffect, useCallback } from "react";
import { MOCK_INDICES, MOCK_STOCKS } from "./mock-data";
import type { Index, Stock } from "@/types";

// ─── 指数行情 ──────────────────────────────────────────────────
export function useMarketIndices() {
  const [indices, setIndices] = useState<Index[]>(MOCK_INDICES);
  const [loading, setLoading] = useState(false);
  const [realData, setRealData] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/market");
      const json = await res.json();
      if (json.ok && Array.isArray(json.data) && json.data[0]?.value > 0) {
        setIndices(json.data as Index[]);
        setRealData(true);
      }
    } catch {
      // 静默失败，保持mock数据
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { indices, loading, realData, refresh };
}

// ─── 单股行情 ──────────────────────────────────────────────────
export function useStockQuote(symbol: string) {
  const mockStock = MOCK_STOCKS.find((s) => s.symbol === symbol);
  const [stock, setStock] = useState<Stock | null>(mockStock ?? null);
  const [loading, setLoading] = useState(false);
  const [realData, setRealData] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetch(`/api/quote?symbol=${symbol}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.price > 0 && mockStock) {
          setStock({
            ...mockStock,
            price: d.price,
            change: d.change,
            changePct: d.changePct,
            high52w: Math.max(mockStock.high52w, d.high ?? d.price),
            low52w:  Math.min(mockStock.low52w,  d.low  ?? d.price),
          });
          setRealData(true);
        }
      })
      .catch(() => {/* 静默 */})
      .finally(() => setLoading(false));
  }, [symbol]);

  return { stock, loading, realData };
}

// ─── 多股行情（自选股列表刷新） ────────────────────────────────
export function useWatchlistQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Partial<Stock>>>({});
  const [realData, setRealData] = useState(false);

  const refresh = useCallback(async () => {
    const results: Record<string, Partial<Stock>> = {};
    await Promise.allSettled(
      symbols.map(async (sym) => {
        try {
          const r = await fetch(`/api/quote?symbol=${sym}`);
          const d = await r.json();
          if (d.ok && d.price > 0) {
            results[sym] = { price: d.price, change: d.change, changePct: d.changePct };
          }
        } catch {/* skip */}
      })
    );
    if (Object.keys(results).length > 0) {
      setQuotes(results);
      setRealData(true);
    }
  }, [symbols.join(",")]);

  useEffect(() => { refresh(); }, [refresh]);
  return { quotes, realData, refresh };
}
