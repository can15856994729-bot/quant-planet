"use client";
/**
 * lib/useWatchlist.ts
 * React hook — 响应式自选股列表
 *
 * - 首次 mount 从 localStorage 读取
 * - 每次 add/remove/clear 立即写入 localStorage 并更新 state
 * - 跨标签页/组件同步（storage event）
 * - `hydrated` 为 false 时表示尚未从本地存储加载完成（SSR / 首帧）
 */
import { useState, useEffect, useCallback } from "react";
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlist,
  clearWatchlist,
  isInWatchlist,
  WATCHLIST_KEY,
  type WatchlistItem,
  type WatchlistMarket,
} from "./watchlistService";

export type { WatchlistItem, WatchlistMarket };

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [hydrated,  setHydrated]  = useState(false);

  // 初始化：从 localStorage 读取
  useEffect(() => {
    setWatchlist(getWatchlist());
    setHydrated(true);
  }, []);

  // 跨标签页同步
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === WATCHLIST_KEY) {
        setWatchlist(getWatchlist());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** 添加股票；已存在返回 false，成功返回 true */
  const add = useCallback(
    (item: Omit<WatchlistItem, "addedAt"> & { addedAt?: string }): boolean => {
      const ok = addToWatchlist(item);
      if (ok) setWatchlist(getWatchlist());
      return ok;
    },
    [],
  );

  /** 删除股票（market 可选，有 market 时精确匹配） */
  const remove = useCallback(
    (symbol: string, market?: WatchlistMarket): void => {
      removeFromWatchlist(symbol, market);
      setWatchlist(getWatchlist());
    },
    [],
  );

  /** 清空全部自选股 */
  const clear = useCallback((): void => {
    clearWatchlist();
    setWatchlist([]);
  }, []);

  /** 全量更新（拖拽排序等场景） */
  const update = useCallback((items: WatchlistItem[]): void => {
    updateWatchlist(items);
    setWatchlist([...items]);
  }, []);

  /** 检查是否已在自选股中（不引起重渲染，直接查 localStorage） */
  const isIn = useCallback(
    (symbol: string, market?: WatchlistMarket): boolean =>
      isInWatchlist(symbol, market),
    [],
  );

  return { watchlist, hydrated, add, remove, clear, update, isIn };
}
