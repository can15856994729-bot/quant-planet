"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getStockBySymbol } from "./stockService";
import type { StockInfo } from "./stockService";

// ── 完整行情数据接口（与 lib/quoteService.ts 保持同步）──────────
export interface QuoteData {
  symbol: string;
  name: string;

  // 价格
  price: number;
  change: number;       // 涨跌额
  changePct: number;    // 涨跌幅 % (e.g. 3.45 = +3.45%)
  open: number;
  high: number;
  low: number;
  prevClose: number;

  // 量/额
  volume: number;           // 成交量（手）
  amount?: number;          // 成交额（元）

  // A 股专属
  turnoverRate?: number;    // 换手率 % (e.g. 3.45 = 3.45%)
  volumeRatio?: number;     // 量比 (e.g. 1.23)

  // 涨跌停
  limitUpPrice?: number;    // 涨停价
  limitDownPrice?: number;  // 跌停价
  isLimitUp?: boolean;      // 是否涨停
  isLimitDown?: boolean;    // 是否跌停
  isOneLimitUp?: boolean;   // 是否一字涨停板
  isOneLimitDown?: boolean; // 是否一字跌停板
  isSuspended?: boolean;    // 是否停牌

  // 市值
  marketCap?: number;       // 总市值（元）
  floatMarketCap?: number;  // 流通市值（元）

  // 元数据
  isRealtime: boolean;
  source?: "alphavantage" | "eastmoney" | "static";
  dataError?: boolean;
  errorMessage?: string;
  updatedAt: string;
}

// ── 前台恢复时自动触发 ────────────────────────────────────────────
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

// ── 单股行情（30s 自动刷新）──────────────────────────────────────
export function useStockQuote(symbol: string) {
  const staticData = symbol ? getStockBySymbol(symbol) : undefined;

  const [quote, setQuote] = useState<QuoteData | null>(
    staticData
      ? {
          symbol:    staticData.symbol,
          name:      staticData.name,
          price:     staticData.price,
          change:    staticData.change,
          changePct: staticData.changePct,
          open:      staticData.price,
          high:      staticData.price * 1.02,
          low:       staticData.price * 0.98,
          prevClose: staticData.price - staticData.change,
          volume:    staticData.volume ?? 0,
          marketCap: staticData.marketCap,
          isRealtime: false,
          source:    "static",
          updatedAt: new Date().toISOString(),
        }
      : null
  );
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/stocks/quote?symbols=${symbol}`, { cache: "no-store" });
      const data = await res.json() as { ok: boolean; quotes?: Record<string, QuoteData> };
      if (data.ok && data.quotes?.[symbol.toUpperCase()]) {
        setQuote(data.quotes[symbol.toUpperCase()]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "行情获取失败");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { refresh(); }, [refresh]);
  useOnForeground(refresh);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return {
    quote,
    loading,
    error,
    isRealtime: quote?.isRealtime ?? false,
    refresh,
  };
}

// ── 批量行情（30s 自动刷新）──────────────────────────────────────
export function useStockQuotes(symbols: string[]) {
  const [quotes,  setQuotes]  = useState<Record<string, QuoteData>>({});
  const [loading, setLoading] = useState(false);
  const key = symbols.join(",");

  const refresh = useCallback(async () => {
    if (!symbols.length) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/stocks/batch-quotes", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ symbols }),
        cache:   "no-store",
      });
      const data = await res.json() as { ok: boolean; quotes?: Record<string, QuoteData> };
      if (data.ok && data.quotes) {
        setQuotes(data.quotes);
      }
    } catch {
      // 保留现有数据，静默失败
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
    }, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { quotes, loading, refresh };
}

// ── 将实时行情合并到 StockInfo 对象 ──────────────────────────────
export function mergeQuoteWithStockInfo(
  stock: StockInfo,
  quote: QuoteData | undefined
): StockInfo {
  if (!quote) return stock;
  return {
    ...stock,
    price:     quote.price,
    change:    quote.change,
    changePct: quote.changePct,
    volume:    quote.volume ?? stock.volume,
    marketCap: quote.marketCap ?? stock.marketCap,
  };
}

// ── 格式化工具（供组件使用）──────────────────────────────────────

/** 将成交额（元）格式化为"X.X亿"或"X.X万" */
export function formatAmount(amount: number | undefined): string {
  if (amount == null) return "--";
  if (amount >= 1e8) return `${(amount / 1e8).toFixed(2)}亿`;
  if (amount >= 1e4) return `${(amount / 1e4).toFixed(0)}万`;
  return String(amount);
}

/** 将总市值（元）格式化为"X.X亿" */
export function formatMarketCap(cap: number | undefined): string {
  if (cap == null) return "--";
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
  if (cap >= 1e8)  return `${(cap / 1e8).toFixed(2)}亿`;
  return `${(cap / 1e4).toFixed(0)}万`;
}
