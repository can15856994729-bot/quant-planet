/**
 * lib/tusharePermissionService.ts
 *
 * 客户端 Tushare 权限缓存服务。
 * 所有组件通过此服务获取权限信息，避免重复调用 /api/tushare/status。
 *
 * ⚠️ 此文件可在客户端组件中安全 import（不包含 Token，只做 fetch 代理）。
 */

"use client";

export type CapStatus = "ok" | "permission_denied" | "error" | "empty";

export interface CapInfo {
  status:    CapStatus;
  rowCount?: number;
  error?:    string;
}

export interface TusharePermissionStatus {
  ok:               boolean;
  tokenConfigured:  boolean;
  connected:        boolean;
  estimatedPoints:  number;
  points:           number;
  level:            string;
  pointsConfidence: string;
  message:          string;
  capabilities:     Record<string, CapInfo>;
  vipCapabilities:  Record<string, CapInfo>;
  featureSummary:   Record<string, string>;
  statusSummary:    string[];
  frequency: {
    perMinuteLimit:  number;
    dailyLimit:      number;
    batchSupported:  boolean;
    note:            string;
  };
  scanSupport: {
    fullMarketScan:   boolean;
    stockCount:       string;
    recommendedBatch: number;
    recommendedDelay: number;
    preFilterSupport: boolean;
    preFilterDesc:    string;
  };
  hint?:      string;
  checkedAt:  string;
  /** 本地缓存加载时间（非服务端时间） */
  cachedAt?:  number;
}

// ── localStorage 缓存配置 ────────────────────────────────────────────────
const STORAGE_KEY = "quantplanet_tushare_permission_status_v1";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟本地缓存

// ── 内存二级缓存（同一页面内不重复请求） ──────────────────────────────────
let _memCache: TusharePermissionStatus | null = null;
let _memCacheAt = 0;
const MEM_TTL_MS = 60 * 1000; // 1 分钟内存缓存

/** 从 localStorage 读取缓存（已过期则返回 null） */
function loadFromStorage(): TusharePermissionStatus | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as TusharePermissionStatus;
    const age = Date.now() - (data.cachedAt ?? 0);
    if (age > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

/** 写入 localStorage */
function saveToStorage(data: TusharePermissionStatus): void {
  try {
    data.cachedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 存储满了，忽略
  }
}

/** 清除本地缓存（购买积分后调用） */
export function clearPermissionCache(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  _memCache = null;
  _memCacheAt = 0;
}

/**
 * 获取 Tushare 权限状态。
 * 优先读内存缓存 → localStorage 缓存 → 发起 API 请求。
 *
 * @param forceRefresh  强制刷新（跳过缓存，同时通知服务端清除内存缓存）
 */
export async function getTusharePermissionStatus(
  forceRefresh = false,
): Promise<TusharePermissionStatus> {
  // 内存缓存
  if (!forceRefresh && _memCache && Date.now() - _memCacheAt < MEM_TTL_MS) {
    return _memCache;
  }

  // localStorage 缓存
  if (!forceRefresh) {
    const stored = loadFromStorage();
    if (stored) {
      _memCache  = stored;
      _memCacheAt = Date.now();
      return stored;
    }
  }

  // 发起 API 请求
  const url = forceRefresh ? "/api/tushare/status?refresh=1" : "/api/tushare/status";

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as TusharePermissionStatus;

    // 更新缓存
    saveToStorage(data);
    _memCache   = data;
    _memCacheAt = Date.now();

    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "未知错误");
    // 降级：返回错误状态对象
    return {
      ok:               false,
      tokenConfigured:  false,
      connected:        false,
      estimatedPoints:  0,
      points:           0,
      level:            "检测失败",
      pointsConfidence: "",
      message:          `无法获取 Tushare 权限信息：${msg}`,
      capabilities:     {},
      vipCapabilities:  {},
      featureSummary:   {},
      statusSummary:    [],
      frequency:        { perMinuteLimit: 0, dailyLimit: 0, batchSupported: false, note: "" },
      scanSupport:      { fullMarketScan: false, stockCount: "未知", recommendedBatch: 10, recommendedDelay: 800, preFilterSupport: false, preFilterDesc: "" },
      checkedAt:        new Date().toISOString(),
      cachedAt:         Date.now(),
    };
  }
}

/**
 * 检查某个接口是否可用（ok 或 empty 均视为可用）
 */
export function isCapAvailable(cap?: CapInfo): boolean {
  return cap?.status === "ok" || cap?.status === "empty";
}

/** 简短状态标签 */
export function capBadge(cap?: CapInfo): string {
  if (!cap) return "未检测";
  switch (cap.status) {
    case "ok":                return `✅ 可用 (${cap.rowCount} 条)`;
    case "empty":             return "⚠️ API可达·无数据";
    case "permission_denied": return "❌ 权限不足";
    case "error":             return `❌ 错误`;
  }
}
