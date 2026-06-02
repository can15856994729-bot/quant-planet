/**
 * lib/tushareCacheService.ts
 *
 * 客户端 Tushare 数据本地缓存工具。
 * 用于缓存从 API Route 返回的股票数据，减少重复请求。
 *
 * ⚠️ 本文件可在客户端组件中使用（纯 localStorage 操作，不含 Token）。
 *
 * 缓存键说明：
 *   stock_basic   → quantplanet_tushare_stock_basic_cache_v1    TTL: 24h
 *   trade_cal     → quantplanet_tushare_trade_cal_cache_v1      TTL: 7d
 *   daily         → quantplanet_tushare_daily_cache_v1          TTL: 6h
 *   daily_basic   → quantplanet_tushare_daily_basic_cache_v1    TTL: 6h
 *   financial     → quantplanet_tushare_financial_cache_v1      TTL: 7d
 */

export const CACHE_KEYS = {
  STOCK_BASIC:  "quantplanet_tushare_stock_basic_cache_v1",
  TRADE_CAL:    "quantplanet_tushare_trade_cal_cache_v1",
  DAILY:        "quantplanet_tushare_daily_cache_v1",
  DAILY_BASIC:  "quantplanet_tushare_daily_basic_cache_v1",
  FINANCIAL:    "quantplanet_tushare_financial_cache_v1",
} as const;

export const CACHE_TTL = {
  STOCK_BASIC: 24 * 60 * 60 * 1000,   // 24 小时
  TRADE_CAL:   7  * 24 * 60 * 60 * 1000, // 7 天
  DAILY:       6  * 60 * 60 * 1000,   // 6 小时
  DAILY_BASIC: 6  * 60 * 60 * 1000,   // 6 小时（按日期分 key）
  FINANCIAL:   7  * 24 * 60 * 60 * 1000, // 7 天
} as const;

interface CacheEntry<T> {
  data:      T;
  cachedAt:  number;
  expiresAt: number;
  key:       string;
}

// ── 泛型读写 ──────────────────────────────────────────────────────────────

/** 写入缓存（自动附加时间戳） */
export function setCache<T>(storageKey: string, subKey: string, data: T, ttlMs: number): void {
  try {
    const fullKey = subKey ? `${storageKey}::${subKey}` : storageKey;
    const entry: CacheEntry<T> = {
      data,
      cachedAt:  Date.now(),
      expiresAt: Date.now() + ttlMs,
      key:       fullKey,
    };
    localStorage.setItem(fullKey, JSON.stringify(entry));
  } catch {
    // localStorage 配额超限时静默失败
  }
}

/** 读取缓存（过期或不存在返回 null） */
export function getCache<T>(storageKey: string, subKey = ""): T | null {
  try {
    const fullKey = subKey ? `${storageKey}::${subKey}` : storageKey;
    const raw = localStorage.getItem(fullKey);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(fullKey);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/** 删除指定缓存条目 */
export function deleteCache(storageKey: string, subKey = ""): void {
  try {
    const fullKey = subKey ? `${storageKey}::${subKey}` : storageKey;
    localStorage.removeItem(fullKey);
  } catch { /* ignore */ }
}

/** 删除所有以指定前缀开头的缓存条目 */
export function deleteCacheByPrefix(prefix: string): void {
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keysToDelete.push(key);
    }
    keysToDelete.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ── 具体数据缓存接口 ──────────────────────────────────────────────────────

export interface StockBasicRecord {
  tsCode: string;
  name:   string;
  area?:  string;
  industry?: string;
  market?: string;
}

/** 读取全量股票基础列表缓存 */
export function getCachedStockBasic(): StockBasicRecord[] | null {
  return getCache<StockBasicRecord[]>(CACHE_KEYS.STOCK_BASIC);
}

/** 写入全量股票基础列表缓存 */
export function setCachedStockBasic(stocks: StockBasicRecord[]): void {
  setCache(CACHE_KEYS.STOCK_BASIC, "", stocks, CACHE_TTL.STOCK_BASIC);
}

// ── daily_basic 按交易日缓存 ─────────────────────────────────────────────

export interface DailyBasicRecord {
  ts_code:        string;
  close?:         string | number;
  turnover_rate?: string | number;
  volume_ratio?:  string | number;
  amount?:        string | number;
  total_mv?:      string | number;
  circ_mv?:       string | number;
  pe?:            string | number;
  pb?:            string | number;
  float_share?:   string | number;
}

/** 读取指定交易日的 daily_basic 数据（全市场） */
export function getCachedDailyBasic(tradeDate: string): DailyBasicRecord[] | null {
  return getCache<DailyBasicRecord[]>(CACHE_KEYS.DAILY_BASIC, tradeDate);
}

/** 写入指定交易日的 daily_basic 数据 */
export function setCachedDailyBasic(tradeDate: string, records: DailyBasicRecord[]): void {
  setCache(CACHE_KEYS.DAILY_BASIC, tradeDate, records, CACHE_TTL.DAILY_BASIC);
}

// ── 财务数据按 ts_code 缓存 ──────────────────────────────────────────────

export function getCachedFinancial<T>(tsCode: string, type: string): T | null {
  return getCache<T>(CACHE_KEYS.FINANCIAL, `${type}::${tsCode}`);
}

export function setCachedFinancial<T>(tsCode: string, type: string, data: T): void {
  setCache(CACHE_KEYS.FINANCIAL, `${type}::${tsCode}`, data, CACHE_TTL.FINANCIAL);
}

// ── 缓存统计 ─────────────────────────────────────────────────────────────

export interface CacheStats {
  totalKeys:      number;
  tushareKeys:    number;
  dailyBasicDays: number;
  financialItems: number;
  stockBasicAge:  number | null; // ms，null = 未缓存
}

/** 获取缓存使用统计（供状态页显示） */
export function getCacheStats(): CacheStats {
  const stats: CacheStats = {
    totalKeys:      0,
    tushareKeys:    0,
    dailyBasicDays: 0,
    financialItems: 0,
    stockBasicAge:  null,
  };

  try {
    stats.totalKeys = localStorage.length;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith("quantplanet_tushare")) continue;
      stats.tushareKeys++;

      if (key.startsWith(CACHE_KEYS.DAILY_BASIC)) stats.dailyBasicDays++;
      if (key.startsWith(CACHE_KEYS.FINANCIAL))   stats.financialItems++;

      if (key === CACHE_KEYS.STOCK_BASIC) {
        try {
          const raw  = localStorage.getItem(key);
          const entry = raw ? JSON.parse(raw) : null;
          if (entry?.cachedAt) stats.stockBasicAge = Date.now() - entry.cachedAt;
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  return stats;
}

/** 清除所有 Tushare 相关缓存（保留其他应用数据） */
export function clearAllTushareCache(): void {
  deleteCacheByPrefix("quantplanet_tushare");
}
