/**
 * tushareService.ts — Tushare Pro API 统一服务
 *
 * 用途：A股历史K线、财务数据、估值数据、指数数据、股票池
 * 实时行情仍优先用东方财富；Tushare 补充历史和基本面。
 *
 * ⚠️  本文件只能在服务端（API Route / Server Component）使用。
 *     不要在客户端组件中直接 import，以防泄露 TUSHARE_TOKEN。
 *
 * Tushare HTTP 接口规范：
 *   POST https://api.tushare.pro
 *   Body: { api_name, token, params, fields }
 *   Response: { code: 0, msg: "", data: { fields: [...], items: [[...]] } }
 */

const TUSHARE_API = "https://api.tushare.pro";
const DEFAULT_TIMEOUT_MS = 20_000; // 20s

// ── In-memory cache ──────────────────────────────────────────────────
interface CacheEntry {
  data: TushareRecord[];
  expiresAt: number;
}
const _cache = new Map<string, CacheEntry>();

function _getCached(key: string): TushareRecord[] | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data;
}
function _setCached(key: string, data: TushareRecord[], ttlMs: number): void {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * 清除全部内存缓存（用于权限变更后强制重新检测）。
 * 在同一 Vercel warm 实例内，缓存会保留旧的 permission_denied 结果；
 * 购买积分后调用此函数可立即清除旧缓存。
 */
export function clearTushareCache(): void {
  _cache.clear();
}

/**
 * 清除指定接口的缓存条目（精确清除，不影响其他接口）。
 */
export function clearTushareCacheFor(apiName: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${apiName}::`)) _cache.delete(key);
  }
}

// ── Types ─────────────────────────────────────────────────────────────
export type TushareRecord = Record<string, string | number | null>;

interface TushareRawResponse {
  code: number;
  msg:  string;
  data?: {
    fields: string[];
    items:  (string | number | null)[][];
  };
}

export type TushareResult =
  | { ok: true;  records: TushareRecord[]; fromCache?: boolean }
  | { ok: false; error: string; tokenMissing?: boolean; permissionDenied?: boolean };

// ── Token check ───────────────────────────────────────────────────────
export function hasTushareToken(): boolean {
  return typeof process !== "undefined" && !!process.env.TUSHARE_TOKEN;
}

// ── Convert items array to objects ────────────────────────────────────
function itemsToRecords(fields: string[], items: (string | number | null)[][]): TushareRecord[] {
  return items.map(row =>
    Object.fromEntries(fields.map((f, i) => [f, row[i] ?? null]))
  );
}

// ── Core caller ───────────────────────────────────────────────────────
export async function callTushare(
  apiName: string,
  params:  Record<string, unknown>,
  fields:  string,
  ttlMs:   number = 6 * 60 * 60 * 1000,  // 6h default
): Promise<TushareResult> {

  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    return { ok: false, error: "TUSHARE_TOKEN 未配置，无法调用 Tushare 接口", tokenMissing: true };
  }

  // Cache key (excludes token for security)
  const cacheKey = `${apiName}::${JSON.stringify(params)}::${fields}`;
  const cached   = _getCached(cacheKey);
  if (cached) return { ok: true, records: cached, fromCache: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(TUSHARE_API, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ api_name: apiName, token, params, fields }),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
    }

    let json: TushareRawResponse;
    try {
      json = await res.json();
    } catch {
      return { ok: false, error: "Tushare 返回非 JSON 响应" };
    }

    // code 2002 = token 无效
    if (json.code === 2002) return { ok: false, error: "TUSHARE_TOKEN 无效或已过期", tokenMissing: true };

    if (json.code !== 0) {
      const msg = json.msg ?? "";
      // Tushare 权限错误特征：code 范围 OR 消息含关键词（最可靠）
      const PERM_KEYWORDS = ["权限", "没有接口", "积分不足", "permission", "access denied", "not authorized"];
      const permByMsg  = PERM_KEYWORDS.some(k => msg.toLowerCase().includes(k.toLowerCase()));
      const permByCode = json.code >= 2001 && json.code <= 2030;
      const perm = permByMsg || permByCode;
      return {
        ok: false,
        error: msg || `Tushare error code=${json.code}`,
        permissionDenied: perm,
      };
    }
    if (!json.data) return { ok: false, error: "Tushare 返回空数据" };

    const records = itemsToRecords(json.data.fields, json.data.items);
    _setCached(cacheKey, records, ttlMs);
    return { ok: true, records };

  } catch (e: unknown) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: `Tushare 请求超时（${DEFAULT_TIMEOUT_MS / 1000}s）` };
    }
    return { ok: false, error: String(e) };
  }
}

// ── Date helpers ───────────────────────────────────────────────────────
/** Returns "YYYYMMDD" for today minus N calendar days */
export function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// ─────────────────────────────────────────────────────────────────────
// 1. A股基本信息 — stock_basic
//    缓存：24h
// ─────────────────────────────────────────────────────────────────────
export async function getAStockBasic(listStatus: "L" | "D" | "P" = "L"): Promise<TushareResult> {
  return callTushare(
    "stock_basic",
    { list_status: listStatus, exchange: "" },
    "ts_code,symbol,name,area,industry,market,exchange,list_date,list_status",
    24 * 60 * 60 * 1000,
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2. 日线行情 — daily
//    缓存：当天盘后缓存 6h，历史数据 24h
// ─────────────────────────────────────────────────────────────────────
export async function getDailyKLine(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<TushareResult> {
  return callTushare(
    "daily",
    { ts_code: tsCode, start_date: startDate, end_date: endDate },
    "trade_date,open,high,low,close,vol,amount,pct_chg",
    6 * 60 * 60 * 1000,
  );
}

// ─────────────────────────────────────────────────────────────────────
// 3. 复权因子 — adj_factor
//    缓存：24h
// ─────────────────────────────────────────────────────────────────────
export async function getAdjFactor(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<TushareResult> {
  return callTushare(
    "adj_factor",
    { ts_code: tsCode, start_date: startDate, end_date: endDate },
    "trade_date,adj_factor",
    24 * 60 * 60 * 1000,
  );
}

// ─────────────────────────────────────────────────────────────────────
// 4. 每日基础指标 — daily_basic（PE/PB/市值/换手率）
//    缓存：6h
// ─────────────────────────────────────────────────────────────────────
export async function getDailyBasic(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<TushareResult> {
  return callTushare(
    "daily_basic",
    { ts_code: tsCode, start_date: startDate, end_date: endDate },
    "trade_date,pe,pe_ttm,pb,ps_ttm,total_mv,circ_mv,turnover_rate,volume_ratio",
    6 * 60 * 60 * 1000,
  );
}

// ─────────────────────────────────────────────────────────────────────
// 5. 利润表 — income
//    缓存：7d（财务数据更新频率低）
// ─────────────────────────────────────────────────────────────────────
export async function getIncome(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<TushareResult> {
  return callTushare(
    "income",
    { ts_code: tsCode, start_date: startDate, end_date: endDate, report_type: "1" },
    "end_date,n_income,n_income_attr_p,total_revenue,revenue,operate_profit",
    7 * 24 * 60 * 60 * 1000,
  );
}

// ─────────────────────────────────────────────────────────────────────
// 6. 资产负债表 — balancesheet
//    缓存：7d
// ─────────────────────────────────────────────────────────────────────
export async function getBalanceSheet(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<TushareResult> {
  return callTushare(
    "balancesheet",
    { ts_code: tsCode, start_date: startDate, end_date: endDate, report_type: "1" },
    "end_date,total_assets,total_liab,total_hldr_eqy_exc_min_int",
    7 * 24 * 60 * 60 * 1000,
  );
}

// ─────────────────────────────────────────────────────────────────────
// 7. 现金流量表 — cashflow
//    缓存：7d
// ─────────────────────────────────────────────────────────────────────
export async function getCashflow(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<TushareResult> {
  return callTushare(
    "cashflow",
    { ts_code: tsCode, start_date: startDate, end_date: endDate, report_type: "1" },
    "end_date,n_cashflow_act,n_cashflow_inv_act,n_cash_flows_fnc_act",
    7 * 24 * 60 * 60 * 1000,
  );
}

// ─────────────────────────────────────────────────────────────────────
// 8. 交易日历 — trade_cal
//    缓存：24h
// ─────────────────────────────────────────────────────────────────────
export async function getTradeCal(
  startDate: string,
  endDate:   string,
): Promise<TushareResult> {
  return callTushare(
    "trade_cal",
    { exchange: "SSE", start_date: startDate, end_date: endDate, is_open: "1" },
    "cal_date,is_open",
    24 * 60 * 60 * 1000,
  );
}

// ─────────────────────────────────────────────────────────────────────
// 9. 指数日线 — index_daily
//    缓存：6h
//    常用指数 ts_code: 000300.SH（沪深300）、000905.SH（中证500）、399006.SZ（创业板）
// ─────────────────────────────────────────────────────────────────────
export async function getIndexDaily(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<TushareResult> {
  return callTushare(
    "index_daily",
    { ts_code: tsCode, start_date: startDate, end_date: endDate },
    "trade_date,open,high,low,close,vol,amount",
    6 * 60 * 60 * 1000,
  );
}

// ─────────────────────────────────────────────────────────────────────
// 工具：前复权（qfq）价格数组
//   adj_factor 最新值 / 历史值 * 原始价格 = 前复权价格
// ─────────────────────────────────────────────────────────────────────
export function applyAdjFactor(
  daily:     TushareRecord[],   // sorted ascending by trade_date
  adjFactor: TushareRecord[],   // sorted ascending by trade_date
): TushareRecord[] {
  if (!adjFactor.length) return daily;

  // Build map: date → adj_factor value
  const adjMap = new Map<string, number>();
  for (const row of adjFactor) {
    adjMap.set(String(row.trade_date), Number(row.adj_factor));
  }

  // Latest adj factor (denominator for forward adj)
  const latestAdj = adjFactor[adjFactor.length - 1];
  const latestFactor = latestAdj ? Number(latestAdj.adj_factor) : 1;
  if (!latestFactor || latestFactor === 0) return daily;

  return daily.map(row => {
    const factor = adjMap.get(String(row.trade_date)) ?? latestFactor;
    const ratio  = factor / latestFactor;
    const adjOpen  = row.open  != null ? +(Number(row.open)  * ratio).toFixed(3) : null;
    const adjHigh  = row.high  != null ? +(Number(row.high)  * ratio).toFixed(3) : null;
    const adjLow   = row.low   != null ? +(Number(row.low)   * ratio).toFixed(3) : null;
    const adjClose = row.close != null ? +(Number(row.close) * ratio).toFixed(3) : null;
    return { ...row, open: adjOpen, high: adjHigh, low: adjLow, close: adjClose };
  });
}

// ─────────────────────────────────────────────────────────────────────
// 工具：Tushare ts_code → symbol（去掉后缀）
// ─────────────────────────────────────────────────────────────────────
export function tsCodeToSymbol(tsCode: string): string {
  return tsCode.split(".")[0] ?? tsCode;
}

// ─────────────────────────────────────────────────────────────────────
// 工具：symbol → ts_code
// ─────────────────────────────────────────────────────────────────────
export function symbolToTsCode(symbol: string): string {
  if (symbol.startsWith("6"))  return `${symbol}.SH`;
  if (symbol.startsWith("0") || symbol.startsWith("3")) return `${symbol}.SZ`;
  if (symbol.startsWith("8") || symbol.startsWith("4")) return `${symbol}.BJ`;
  return `${symbol}.SH`;
}
