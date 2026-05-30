/**
 * lib/watchlistService.ts
 * 自选股持久化服务 — localStorage（key: quantplanet_watchlist_v1）
 *
 * SSR 安全：服务端读取返回空数组，写入静默忽略。
 * 不包含任何默认/mock 股票 — 新用户初始列表为空。
 */

export type WatchlistMarket   = "A" | "HK" | "US";
export type WatchlistCurrency = "CNY" | "HKD" | "USD";
export type WatchlistExchange = "SH" | "SZ" | "BJ" | "HKEX" | "NASDAQ" | "NYSE" | "AMEX" | string;

export interface WatchlistItem {
  symbol:   string;             // "600519" / "00700" / "AAPL"
  tsCode?:  string;             // "600519.SH"（A股 Tushare 代码，可选）
  name:     string;             // "贵州茅台"
  market:   WatchlistMarket;   // "A" | "HK" | "US"
  exchange: WatchlistExchange;  // "SH" | "SZ" | "HKEX" | "NASDAQ" ...
  industry: string;             // "白酒"
  currency: WatchlistCurrency; // "CNY" | "HKD" | "USD"
  addedAt:  string;             // ISO datetime, e.g. "2026-05-30T08:00:00.000Z"
}

// ── 存储 key ─────────────────────────────────────────────────────
export const WATCHLIST_KEY = "quantplanet_watchlist_v1";

// ── SSR 安全的 localStorage 代理 ─────────────────────────────────
const _stub = {
  getItem:    (_k: string) => null as string | null,
  setItem:    (_k: string, _v: string) => { /* noop */ },
  removeItem: (_k: string) => { /* noop */ },
};
function ls() {
  return typeof window !== "undefined" ? window.localStorage : _stub;
}

// ── 读取 ──────────────────────────────────────────────────────────
export function getWatchlist(): WatchlistItem[] {
  try {
    const raw = ls().getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WatchlistItem[];
  } catch {
    return [];
  }
}

// ── 写入（全量覆盖） ──────────────────────────────────────────────
export function saveWatchlist(items: WatchlistItem[]): void {
  try {
    ls().setItem(WATCHLIST_KEY, JSON.stringify(items));
  } catch { /* silently fail — storage full etc. */ }
}

// ── 添加（已存在则返回 false）────────────────────────────────────
export function addToWatchlist(
  item: Omit<WatchlistItem, "addedAt"> & { addedAt?: string },
): boolean {
  const list = getWatchlist();
  const exists = list.some(
    (s) => s.symbol === item.symbol && s.market === item.market,
  );
  if (exists) return false;
  list.push({ ...item, addedAt: item.addedAt ?? new Date().toISOString() });
  saveWatchlist(list);
  return true;
}

// ── 删除 ─────────────────────────────────────────────────────────
export function removeFromWatchlist(
  symbol: string,
  market?: WatchlistMarket,
): void {
  const list = getWatchlist();
  const next = market
    ? list.filter((s) => !(s.symbol === symbol && s.market === market))
    : list.filter((s) => s.symbol !== symbol);
  saveWatchlist(next);
}

// ── 是否已在自选股中 ─────────────────────────────────────────────
export function isInWatchlist(
  symbol: string,
  market?: WatchlistMarket,
): boolean {
  return getWatchlist().some(
    (s) => s.symbol === symbol && (!market || s.market === market),
  );
}

// ── 清空全部 ─────────────────────────────────────────────────────
export function clearWatchlist(): void {
  saveWatchlist([]);
}

// ── 全量更新（用于拖拽排序等） ────────────────────────────────────
export function updateWatchlist(items: WatchlistItem[]): void {
  saveWatchlist(items);
}

// ── 工具：A股 symbol → tsCode ─────────────────────────────────────
export function symbolToTsCode(symbol: string): string | undefined {
  if (!/^\d{6}$/.test(symbol)) return undefined; // 非A股
  if (symbol.startsWith("6"))                       return `${symbol}.SH`;
  if (symbol.startsWith("0") || symbol.startsWith("3")) return `${symbol}.SZ`;
  if (symbol.startsWith("8") || symbol.startsWith("4")) return `${symbol}.BJ`;
  return `${symbol}.SH`;
}
