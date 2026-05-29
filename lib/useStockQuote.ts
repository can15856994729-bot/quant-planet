"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getStockBySymbol } from "./stockService";
import type { StockInfo } from "./stockService";

interface QuoteData {
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
  source?: "alphavantage" | "eastmoney" | "static";
  updatedAt: string;
}

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

// Single stock quote with 30s auto-refresh
export function useStockQuote(symbol: string) {
  const staticData = symbol ? getStockBySymbol(symbol) : undefined;
  const [quote, setQuote] = useState<QuoteData | null>(
    staticData
      ? {
          symbol: staticData.symbol,
          name: staticData.name,
          price: staticData.price,
          change: staticData.change,
          changePct: staticData.changePct,
          volume: staticData.volume,
          marketCap: staticData.marketCap,
          isRealtime: false,
          updatedAt: new Date().toISOString(),
        }
      : null
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/stocks/quote?symbols=${symbol}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok && data.quotes[symbol.toUpperCase()]) {
        setQuote(data.quotes[symbol.toUpperCase()]);
      }
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { refresh(); }, [refresh]);
  useOnForeground(refresh);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { quote, loading, isRealtime: quote?.isRealtime ?? false, refresh };
}

// Multiple stock quotes with 30s auto-refresh
export function useStockQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [loading, setLoading] = useState(false);
  const key = symbols.join(",");

  const refresh = useCallback(async () => {
    if (!symbols.length) return;
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/batch-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok && data.quotes) {
        setQuotes(data.quotes);
      }
    } catch {
      // keep existing
    } finally {
      setLoading(false);
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

  return { quotes, loading, refresh };
}

// Helper to get a StockInfo object enriched with live quote data
export function mergeQuoteWithStockInfo(
  stock: StockInfo,
  quote: QuoteData | undefined
): StockInfo {
  if (!quote) return stock;
  return {
    ...stock,
    price: quote.price,
    change: quote.change,
    changePct: quote.changePct,
    volume: quote.volume ?? stock.volume,
    marketCap: quote.marketCap ?? stock.marketCap,
  };
}
