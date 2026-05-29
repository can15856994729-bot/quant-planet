"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { MOCK_INDICES, MOCK_STOCKS } from "./mock-data";
import { getStockBySymbol } from "./stockService";
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

  useEffect(() => { refresh(); }, [refresh]);
  useOnForeground(refresh);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { indices, loading, realData, refresh };
}

// ─── 单股行情 ─────────────────────────────────────────────────
// 先从 stockService 获取静态基础信息（213只），再用实时 API 覆盖价格
export function useStockQuote(symbol: string) {
  // Prefer mock data (has richer fields like high52w, pe) if available,
  // otherwise fall back to stockService for the wider 213-stock universe
  const mockStock   = MOCK_STOCKS.find((s) => s.symbol === symbol);
  const svcStock    = !mockStock ? getStockBySymbol(symbol) : undefined;

  // Build a baseline Stock object from whichever source we have
  const baseStock: Stock | null = mockStock ?? (
    svcStock
      ? {
          symbol:     svcStock.symbol,
          name:       svcStock.name,
          market:     svcStock.market as "A" | "HK" | "US",
          currency:   svcStock.currency as "CNY" | "HKD" | "USD",
          industry:   svcStock.industry,
          price:      svcStock.price,
          change:     svcStock.change,
          changePct:  svcStock.changePct,
          high52w:    svcStock.price * 1.25,
          low52w:     svcStock.price * 0.75,
          volume:     svcStock.volume ?? 0,
          turnover:   0,
          marketCap:  svcStock.marketCap ?? 0,
          pe:         0,
        }
      : null
  );

  const [stock, setStock]     = useState<Stock | null>(baseStock);
  const [loading, setLoading] = useState(false);
  const [realData, setRealData]   = useState(false);
  const [source, setSource]   = useState<"alphavantage" | "eastmoney" | "static" | null>(null);

  const fetchQuote = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/quote?symbol=${symbol}`, { cache: "no-store" });
      const d = await r.json();
      if (d.ok && d.price > 0) {
        setStock((prev) => {
          const base = prev ?? baseStock;
          if (!base) return prev;
          return {
            ...base,
            price:     d.price,
            change:    d.change,
            changePct: d.changePct,
            high52w:   base.high52w ? Math.max(base.high52w, d.high ?? d.price) : d.price,
            low52w:    base.low52w  ? Math.min(base.low52w,  d.low  ?? d.price) : d.price,
          };
        });
        setRealData(true);
        setSource(d.source ?? "eastmoney");
      }
    } catch {/* 静默 */}
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => { fetchQuote(); }, [fetchQuote]);
  useOnForeground(fetchQuote);

  return { stock, loading, realData, source };
}

// ─── 多股行情（自选股 / 信号列表） ────────────────────────────
export function useWatchlistQuotes(symbols: string[]) {
  const [quotes, setQuotes]       = useState<Record<string, Partial<Stock>>>({});
  const [realData, setRealData]   = useState(false);
  // Per-symbol real-time flag: only true when data came from live API (not static fallback)
  const [realtimeSet, setRealtimeSet] = useState<Set<string>>(new Set());
  const key = symbols.join(",");

  const refresh = useCallback(async () => {
    if (!symbols.length) return;
    const results: Record<string, Partial<Stock>> = {};
    const newRealtimeSet = new Set<string>();

    try {
      const r = await fetch("/api/stocks/batch-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
        cache: "no-store",
      });
      const data = await r.json();
      if (data.ok && data.quotes) {
        for (const [sym, q] of Object.entries(
          data.quotes as Record<string, { price: number; change: number; changePct: number; isRealtime: boolean }>
        )) {
          if (q.price > 0) {
            results[sym] = { price: q.price, change: q.change, changePct: q.changePct };
            if (q.isRealtime) newRealtimeSet.add(sym);
          }
        }
      }
    } catch {/* skip */}

    if (Object.keys(results).length > 0) {
      setQuotes(results);
      setRealData(newRealtimeSet.size > 0);
      setRealtimeSet(newRealtimeSet);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);
  useOnForeground(refresh);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { quotes, realData, realtimeSet, refresh };
}
