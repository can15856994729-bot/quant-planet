"use client";

/**
 * useMarketStats — 拉取 /api/stocks/market-stats 的 React Hook
 *
 * 返回三个市场的真实接入数量、数据来源与覆盖状态。
 * 仅在客户端调用，不需要 SWR/React Query。
 */

import { useState, useEffect } from "react";
import type {
  MarketStatsResponse,
  MarketStat,
} from "@/app/api/stocks/market-stats/route";

export type { MarketStatsResponse, MarketStat };

export interface UseMarketStatsResult {
  /** 完整响应体，未获取前为 null */
  stats:   MarketStatsResponse | null;
  /** 正在加载中 */
  loading: boolean;
  /** 网络或解析错误描述，无错时为 null */
  error:   string | null;
  /** 便捷方法：按市场代码取 MarketStat */
  getStat: (market: "A" | "HK" | "US") => MarketStat | null;
}

export function useMarketStats(): UseMarketStatsResult {
  const [stats,   setStats]   = useState<MarketStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/stocks/market-stats")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MarketStatsResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "数量获取失败";
          setError(msg);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  const getStat = (market: "A" | "HK" | "US"): MarketStat | null =>
    stats?.markets.find((m) => m.market === market) ?? null;

  return { stats, loading, error, getStat };
}
