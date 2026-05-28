"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { MOCK_INDICES, MOCK_STOCKS } from "./mock-data";
import type { Index, Stock } from "@/types";

// ── App 回到前台时自动触发 callback ─────────────────────────────
function useOnForeground(cb: () => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") cbRef.current();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
}

// ─── 指数行情 ──────────────────────────────────────────────────
export function useMarketIndices() {
  const [indices, setIndices] = useState<Index[]>(MOCK_INDICES);
  const [loading, setLoading] = useState(false);
  const [realData, setRealData] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      const json = await res.json();
      if (json.ok && Array.isArray(json.data) && json.data[0]?.value > 0) {
        setIndices(json.data as Index[]);
        setRealData(true);
      }
    } catch {
      // 静默失败，保持现有数据
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次加载
  useEffect(() => { refresh(); }, [refresh]);

  // App 回到前台自动刷新
  useOnForeground(refresh);

  // 页面可见时每 30s 自动刷新
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { indices, loading, realData, refresh };
}

// ─── 单股行情 ──────────────────────────────────────────────────
export function useStockQuote(symbol: string) {
  const mockStock = MOCK_STOCKS.find((s) => s.symbol === symbol);
  const [stock, setStock] = useState<Stock | null>(mockStock ?? null);
  const [loading, setLoading] = useState(false);
  const [realData, setRealData] = useState(false);

  const fetchQuote = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/quote?symbol=${symbol}`, { cache: "no-store" });
      const d = await r.json();
      if (d.ok && d.price > 0 && mockStock) {
        setStock({
          ...mockStock,
          price:    d.price,
          change:   d.change,
          changePct: d.changePct,
          high52w:  Math.max(mockStock.high52w, d.high ?? d.price),
          low52w:   Math.min(mockStock.low52w,  d.low  ?? d.price),
        });
        setRealData(true);
      }
    } catch {/* 静默 */}
    finally { setLoading(false); }
  }, [symbol]);

  // 首次加载
  useEffect(() => { fetchQuote(); }, [fetchQuote]);

  // App 回到前台自动刷新
  useOnForeground(fetchQuote);

  return { stock, loading, realData };
}

// ─── 多股行情（自选股 / 信号列表） ────────────────────────────
export function useWatchlistQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Partial<Stock>>>({});
  const [realData, setRealData] = useState(false);
  const key = symbols.join(",");

  const refresh = useCallback(async () => {
    if (!symbols.length) return;
    const results: Record<string, Partial<Stock>> = {};
    await Promise.allSettled(
      symbols.map(async (sym) => {
        try {
          const r = await fetch(`/api/quote?symbol=${sym}`, { cache: "no-store" });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 首次加载
  useEffect(() => { refresh(); }, [refresh]);

  // App 回到前台自动刷新
  useOnForeground(refresh);

  // 页面可见时每 30s 自动刷新
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { quotes, realData, refresh };
}
