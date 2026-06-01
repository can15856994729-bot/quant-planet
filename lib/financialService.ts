/**
 * lib/financialService.ts
 *
 * 财务盈利能力服务 — 聚合 Tushare income + fina_indicator 数据
 *
 * 服务端专用，不可在 Client Component 中直接 import。
 * 前端通过以下 API Route 访问：
 *   GET /api/tushare/profit-summary?tsCode=600519.SH
 *   GET /api/stocks/[symbol]/financials/profit
 *
 * 安全约束：TUSHARE_TOKEN 仅在 tushareService.ts 内使用，本文件不访问 token。
 *
 * 缓存策略：财报数据 24h 内存缓存，用户可手动刷新（清除后重拉）。
 */

import { callTushare, hasTushareToken, daysAgoStr, todayStr, type TushareRecord } from "./tushareService";

// ── 缓存 ─────────────────────────────────────────────────────────────
const PROFIT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

interface ProfitCacheEntry {
  result:    ProfitSummaryResult;
  expiresAt: number;
}

const _profitCache = new Map<string, ProfitCacheEntry>();

/** 清除利润摘要缓存（支持按 tsCode 精确清除） */
export function clearProfitCache(tsCode?: string): void {
  if (tsCode) {
    for (const key of _profitCache.keys()) {
      if (key.startsWith(tsCode + "::")) _profitCache.delete(key);
    }
  } else {
    _profitCache.clear();
  }
}

// ── 类型定义 ─────────────────────────────────────────────────────────

export type ProfitDataStatus = "ok" | "permission_denied" | "error" | "empty" | "no_token";

/**
 * 利润表 + 盈利能力核心字段（单报告期）
 * null 代表数据缺失，绝不用 0 冒充。
 */
export interface ProfitSummaryItem {
  tsCode:    string;
  symbol:    string;
  reportDate: string;  // end_date YYYYMMDD
  annDate:   string;   // ann_date YYYYMMDD（公告日期）
  period:    string;   // "2024年年报" / "2024年三季报" …

  // ── 利润表核心（单位：元）─────────────────────────────────────────
  revenue:          number | null;  // 营业收入
  operatingCost:    number | null;  // 营业成本
  grossProfit:      number | null;  // 毛利润（revenue - oper_cost，或字段直接返回）
  operatingProfit:  number | null;  // 营业利润
  totalProfit:      number | null;  // 利润总额
  netProfit:        number | null;  // 净利润
  deductedNetProfit: number | null; // 扣非净利润（来自 fina_indicator.profit_dedt）
  parentNetProfit:  number | null;  // 归母净利润（n_income_attr_p）
  eps:              number | null;  // 每股收益（元，来自 fina_indicator.eps 或 basic_eps）

  // ── 同比增速（%，正数=增长，负数=下滑）────────────────────────────
  revenueYoY:           number | null;  // 营收同比（or_yoy）
  netProfitYoY:         number | null;  // 净利润同比（netprofit_yoy）
  deductedNetProfitYoY: number | null;  // 扣非净利润同比（计算得出）

  // ── 盈利能力比率（%）──────────────────────────────────────────────
  grossMargin: number | null;  // 毛利率（grossprofit_margin）
  netMargin:   number | null;  // 净利率（netprofit_margin）

  source:    "Tushare";
  updatedAt: string;
}

export interface ProfitSummaryResult {
  ok:                  boolean;
  tsCode:              string;
  symbol:              string;
  items:               ProfitSummaryItem[];
  incomeStatus:        ProfitDataStatus;
  finaIndicatorStatus: ProfitDataStatus;
  fromCache?:          boolean;
  error?:              string;
  updatedAt:           string;
}

// ── 字段列表 ─────────────────────────────────────────────────────────

/** income 接口请求的字段（扩展版，包含所有利润表核心字段） */
export const INCOME_FIELDS =
  "ann_date,end_date,total_revenue,revenue,oper_cost,operate_profit,total_profit,n_income,n_income_attr_p,basic_eps";

/** fina_indicator 接口请求的字段（含盈利率 + YoY + 扣非净利润） */
export const FINA_IND_FIELDS =
  "ann_date,end_date,eps,grossprofit_margin,netprofit_margin,profit_dedt,or_yoy,netprofit_yoy";

// ── 工具函数 ─────────────────────────────────────────────────────────

/** 安全转数值，避免把 null / "" / "-" 显示为 0 */
function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/** YYYYMMDD → "2024年年报" 等 */
function toPeriodLabel(endDate: string): string {
  if (!endDate || endDate.length < 8) return endDate ?? "—";
  const year = endDate.slice(0, 4);
  const mm   = endDate.slice(4, 6);
  if (mm === "03") return `${year}年一季报`;
  if (mm === "06") return `${year}年半年报`;
  if (mm === "09") return `${year}年三季报`;
  if (mm === "12") return `${year}年年报`;
  return endDate;
}

/** ts_code → symbol（去掉 .SH / .SZ / .BJ 后缀） */
function tsCodeToSymbol(tsCode: string): string {
  return tsCode.split(".")[0] ?? tsCode;
}

/** 按 end_date 降序去重（保留同期最新公告版本） */
function dedupeDesc(records: TushareRecord[]): TushareRecord[] {
  const sorted = [...records].sort((a, b) => {
    const annDiff = String(b.ann_date ?? b.end_date ?? "")
      .localeCompare(String(a.ann_date ?? a.end_date ?? ""));
    if (annDiff !== 0) return annDiff;
    return String(b.end_date ?? "").localeCompare(String(a.end_date ?? ""));
  });
  const seen = new Set<string>();
  return sorted.filter(r => {
    const k = String(r.end_date ?? "");
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 同比增速计算：(当期 - 同期) / |同期| × 100 */
function computeYoY(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return (curr - prev) / Math.abs(prev) * 100;
}

// ── 原始数据获取 ──────────────────────────────────────────────────────

/**
 * 获取利润表原始数据（income 接口）
 */
export async function getIncomeStatement(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<{ records: TushareRecord[]; status: ProfitDataStatus; error?: string }> {
  const res = await callTushare(
    "income",
    { ts_code: tsCode, start_date: startDate, end_date: endDate, report_type: "1" },
    INCOME_FIELDS,
    PROFIT_CACHE_TTL,
  );
  if (!res.ok) {
    return {
      records: [],
      status:  res.permissionDenied ? "permission_denied" : "error",
      error:   res.error,
    };
  }
  const deduped = dedupeDesc(res.records);
  return { records: deduped, status: deduped.length > 0 ? "ok" : "empty" };
}

/**
 * 获取财务指标原始数据（fina_indicator 接口）
 */
export async function getProfitabilityMetrics(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<{ records: TushareRecord[]; status: ProfitDataStatus; error?: string }> {
  const res = await callTushare(
    "fina_indicator",
    { ts_code: tsCode, start_date: startDate, end_date: endDate },
    FINA_IND_FIELDS,
    PROFIT_CACHE_TTL,
  );
  if (!res.ok) {
    return {
      records: [],
      status:  res.permissionDenied ? "permission_denied" : "error",
      error:   res.error,
    };
  }
  const deduped = dedupeDesc(res.records);
  return { records: deduped, status: deduped.length > 0 ? "ok" : "empty" };
}

// ── 核心聚合函数 ──────────────────────────────────────────────────────

/**
 * 获取利润摘要（最近 periods 期，聚合 income + fina_indicator）
 *
 * @param tsCode   Tushare 股票代码，如 "600519.SH"
 * @param periods  返回期数（默认 8 期）
 * @param refresh  为 true 时强制绕过缓存
 */
export async function getProfitSummary(
  tsCode:  string,
  periods  = 8,
  refresh  = false,
): Promise<ProfitSummaryResult> {
  const now = new Date().toISOString();

  // Token 检查
  if (!hasTushareToken()) {
    return {
      ok: false, tsCode, symbol: tsCodeToSymbol(tsCode), items: [],
      incomeStatus: "no_token", finaIndicatorStatus: "no_token",
      error: "TUSHARE_TOKEN 未配置，无法获取利润表数据",
      updatedAt: now,
    };
  }

  const cacheKey = `${tsCode}::${periods}`;
  if (!refresh) {
    const hit = _profitCache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) {
      return { ...hit.result, fromCache: true };
    }
  }

  const symbol    = tsCodeToSymbol(tsCode);
  // 财报数据取近 3 年（覆盖 12 期季报，保证有足够期数计算同比）
  const startDate = daysAgoStr(3 * 365 + 90);
  const endDate   = todayStr();

  // 并行拉取 income + fina_indicator
  const [incomeRes, finaRes] = await Promise.all([
    getIncomeStatement(tsCode, startDate, endDate),
    getProfitabilityMetrics(tsCode, startDate, endDate),
  ]);

  // 如果两个接口都权限不足 → 明确返回失败
  if (incomeRes.status === "permission_denied" && finaRes.status === "permission_denied") {
    const result: ProfitSummaryResult = {
      ok: false, tsCode, symbol, items: [],
      incomeStatus: "permission_denied",
      finaIndicatorStatus: "permission_denied",
      error: "当前 Tushare 权限不足，无法获取利润表数据",
      updatedAt: now,
    };
    return result;
  }

  // 如果 income 接口返回空 → 该股票暂无利润表记录
  if (incomeRes.records.length === 0 && incomeRes.status !== "permission_denied") {
    const result: ProfitSummaryResult = {
      ok: false, tsCode, symbol, items: [],
      incomeStatus: incomeRes.status,
      finaIndicatorStatus: finaRes.status,
      error: "该股票利润表数据暂缺",
      updatedAt: now,
    };
    return result;
  }

  // 建立 fina_indicator 按 end_date 快速查找表
  const finaByDate = new Map<string, TushareRecord>();
  for (const r of finaRes.records) {
    finaByDate.set(String(r.end_date ?? ""), r);
  }

  // 取最多 periods 期的 income 记录（已降序）
  const incomeSlice     = incomeRes.records.slice(0, periods);
  const incomeAllDesc   = incomeRes.records; // 完整降序列表，用于计算同比

  const items: ProfitSummaryItem[] = incomeSlice.map((inc) => {
    const ed   = String(inc.end_date ?? "");
    const fina = finaByDate.get(ed);

    // ── 利润表数值 ────────────────────────────────────────────────
    const revenue         = toNum(inc.revenue) ?? toNum(inc.total_revenue);
    const operatingCost   = toNum(inc.oper_cost);
    const operatingProfit = toNum(inc.operate_profit);
    const totalProfit     = toNum(inc.total_profit);
    const netProfit       = toNum(inc.n_income);
    const parentNetProfit = toNum(inc.n_income_attr_p);
    const epsFromIncome   = toNum(inc.basic_eps);

    // 毛利润：revenue - oper_cost（income 通常没有直接的 gross_profit 字段）
    const grossProfit = (revenue != null && operatingCost != null)
      ? revenue - operatingCost
      : null;

    // ── 财务指标 ──────────────────────────────────────────────────
    const eps              = toNum(fina?.eps) ?? epsFromIncome;
    const grossMargin      = toNum(fina?.grossprofit_margin);
    const netMargin        = toNum(fina?.netprofit_margin);
    const deductedNetProfit = toNum(fina?.profit_dedt);

    // ── 同比（优先使用 fina_indicator 已计算的 YoY）─────────────
    let revenueYoY: number | null   = toNum(fina?.or_yoy);
    let netProfitYoY: number | null = toNum(fina?.netprofit_yoy);

    // 若 fina_indicator 未提供 YoY，则从 income 历史自行计算（当期 vs 前4期）
    const selfIdx = incomeAllDesc.findIndex(r => String(r.end_date ?? "") === ed);
    const prevRec = selfIdx >= 0 && (selfIdx + 4) < incomeAllDesc.length
      ? incomeAllDesc[selfIdx + 4]
      : null;

    if (revenueYoY == null && revenue != null && prevRec) {
      const prevRev = toNum(prevRec.revenue) ?? toNum(prevRec.total_revenue);
      revenueYoY = computeYoY(revenue, prevRev);
    }
    if (netProfitYoY == null && prevRec) {
      const prevNp = toNum(prevRec.n_income_attr_p) ?? toNum(prevRec.n_income);
      netProfitYoY = computeYoY(parentNetProfit ?? netProfit, prevNp);
    }

    // 扣非净利润同比：比较 4 期前的 fina_indicator.profit_dedt
    let deductedNetProfitYoY: number | null = null;
    if (deductedNetProfit != null && prevRec) {
      const prevFina = finaByDate.get(String(prevRec.end_date ?? ""));
      const prevDeducted = toNum(prevFina?.profit_dedt);
      deductedNetProfitYoY = computeYoY(deductedNetProfit, prevDeducted);
    }

    return {
      tsCode,
      symbol,
      reportDate: ed,
      annDate:    String(inc.ann_date ?? ""),
      period:     toPeriodLabel(ed),
      revenue,
      operatingCost,
      grossProfit,
      operatingProfit,
      totalProfit,
      netProfit,
      deductedNetProfit,
      parentNetProfit,
      eps,
      revenueYoY,
      netProfitYoY,
      deductedNetProfitYoY,
      grossMargin,
      netMargin,
      source:    "Tushare",
      updatedAt: now,
    } satisfies ProfitSummaryItem;
  });

  const result: ProfitSummaryResult = {
    ok: true, tsCode, symbol, items,
    incomeStatus:        incomeRes.status,
    finaIndicatorStatus: finaRes.status,
    updatedAt: now,
  };

  _profitCache.set(cacheKey, { result, expiresAt: Date.now() + PROFIT_CACHE_TTL });
  return result;
}

// ════════════════════════════════════════════════════════════════════════
//  财务安全 / 资产负债分析  (Task C)
// ════════════════════════════════════════════════════════════════════════

// ── 缓存 ─────────────────────────────────────────────────────────────
const SAFETY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

interface SafetyCacheEntry {
  result:    BalanceSafetySummaryResult;
  expiresAt: number;
}
const _safetyCache = new Map<string, SafetyCacheEntry>();

/** 清除财务安全缓存（支持按 tsCode 精确清除） */
export function clearSafetyCache(tsCode?: string): void {
  if (tsCode) {
    for (const key of _safetyCache.keys()) {
      if (key.startsWith(tsCode + "::")) _safetyCache.delete(key);
    }
  } else {
    _safetyCache.clear();
  }
}

// ── 字段列表 ─────────────────────────────────────────────────────────

/** balancesheet 接口请求字段 */
export const BALANCE_SHEET_FIELDS =
  "ann_date,end_date,total_assets,total_liab,total_hldr_eqy_exc_min_int,total_hldr_eqy_inc_min_int,money_cap,total_cur_assets,total_cur_liab,accounts_receiv,inventories,goodwill,st_borr,lt_borr";

/** fina_indicator 接口请求字段（财务安全维度） */
export const FINA_SAFETY_FIELDS =
  "ann_date,end_date,debt_to_assets,current_ratio,quick_ratio";

// ── 类型定义 ─────────────────────────────────────────────────────────

export type SafetyDataStatus = "ok" | "permission_denied" | "error" | "empty" | "no_token";

/**
 * 资产负债 + 财务安全核心字段（单报告期）
 * null 代表数据缺失，绝不用 0 冒充。
 */
export interface BalanceSafetySummaryItem {
  tsCode:    string;
  symbol:    string;
  reportDate: string;  // end_date YYYYMMDD
  annDate:   string;   // ann_date YYYYMMDD
  period:    string;   // "2024年年报" 等

  // ── 资产负债表核心（单位：元）────────────────────────────────────
  totalAssets:        number | null;  // 总资产
  totalLiabilities:   number | null;  // 总负债
  netAssets:          number | null;  // 净资产（归母，total_hldr_eqy_exc_min_int）
  shareholderEquity:  number | null;  // 全口径股东权益（含少数股东）
  monetaryFunds:      number | null;  // 货币资金
  currentAssets:      number | null;  // 流动资产
  currentLiabilities: number | null;  // 流动负债
  accountsReceivable: number | null;  // 应收账款
  inventory:          number | null;  // 存货
  goodwill:           number | null;  // 商誉
  shortTermBorrowings: number | null; // 短期借款
  longTermBorrowings:  number | null; // 长期借款

  // ── 盈利表辅助（用于比率计算，单位：元）──────────────────────────
  revenue: number | null;  // 营业收入（来自 income）

  // ── 安全比率（内部用小数，如 0.65 = 65%）────────────────────────
  debtToAssets:         number | null;  // 资产负债率（优先 fina_indicator，次计算）
  currentRatio:         number | null;  // 流动比率（优先 fina_indicator）
  quickRatio:           number | null;  // 速动比率（优先 fina_indicator）
  goodwillToNetAssets:  number | null;  // 商誉占净资产比
  receivablesToRevenue: number | null;  // 应收账款占收入比
  inventoryToRevenue:   number | null;  // 存货占收入比

  source:    "Tushare";
  updatedAt: string;
}

export interface BalanceSafetySummaryResult {
  ok:                   boolean;
  tsCode:               string;
  symbol:               string;
  items:                BalanceSafetySummaryItem[];
  balanceSheetStatus:   SafetyDataStatus;
  finaIndicatorStatus:  SafetyDataStatus;
  incomeStatus:         SafetyDataStatus;
  fromCache?:           boolean;
  error?:               string;
  updatedAt:            string;
}

// ── 原始数据获取 ──────────────────────────────────────────────────────

/**
 * 获取资产负债表原始数据
 */
export async function getBalanceSheetStatement(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<{ records: TushareRecord[]; status: SafetyDataStatus; error?: string }> {
  const res = await callTushare(
    "balancesheet",
    { ts_code: tsCode, start_date: startDate, end_date: endDate, report_type: "1" },
    BALANCE_SHEET_FIELDS,
    SAFETY_CACHE_TTL,
  );
  if (!res.ok) {
    return {
      records: [],
      status:  res.permissionDenied ? "permission_denied" : "error",
      error:   res.error,
    };
  }
  const deduped = dedupeDesc(res.records);
  return { records: deduped, status: deduped.length > 0 ? "ok" : "empty" };
}

/**
 * 获取财务安全指标原始数据（fina_indicator 接口，专为安全维度）
 */
export async function getFinancialSafetyMetrics(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<{ records: TushareRecord[]; status: SafetyDataStatus; error?: string }> {
  const res = await callTushare(
    "fina_indicator",
    { ts_code: tsCode, start_date: startDate, end_date: endDate },
    FINA_SAFETY_FIELDS,
    SAFETY_CACHE_TTL,
  );
  if (!res.ok) {
    return {
      records: [],
      status:  res.permissionDenied ? "permission_denied" : "error",
      error:   res.error,
    };
  }
  const deduped = dedupeDesc(res.records);
  return { records: deduped, status: deduped.length > 0 ? "ok" : "empty" };
}

// ── 安全比率计算工具 ──────────────────────────────────────────────────

/** 安全除法：分母为 0 / null → null */
function safeDiv(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

// ── 核心聚合函数 ──────────────────────────────────────────────────────

/**
 * 获取财务安全摘要（最近 periods 期）
 *
 * @param tsCode   Tushare 股票代码，如 "600519.SH"
 * @param periods  返回期数（默认 8 期）
 * @param refresh  为 true 时强制绕过缓存
 */
export async function getFinancialSafetySummary(
  tsCode:  string,
  periods  = 8,
  refresh  = false,
): Promise<BalanceSafetySummaryResult> {
  const now = new Date().toISOString();

  // Token 检查
  if (!hasTushareToken()) {
    return {
      ok: false, tsCode, symbol: tsCodeToSymbol(tsCode), items: [],
      balanceSheetStatus: "no_token",
      finaIndicatorStatus: "no_token",
      incomeStatus: "no_token",
      error: "TUSHARE_TOKEN 未配置，无法获取资产负债表数据",
      updatedAt: now,
    };
  }

  const cacheKey = `safety::${tsCode}::${periods}`;
  if (!refresh) {
    const hit = _safetyCache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) {
      return { ...hit.result, fromCache: true };
    }
  }

  const symbol    = tsCodeToSymbol(tsCode);
  // 财报数据取近 3 年（覆盖 12 期季报）
  const startDate = daysAgoStr(3 * 365 + 90);
  const endDate   = todayStr();

  // 并行拉取三个数据源
  const [bsRes, finaRes, incRes] = await Promise.all([
    getBalanceSheetStatement(tsCode, startDate, endDate),
    getFinancialSafetyMetrics(tsCode, startDate, endDate),
    getIncomeStatement(tsCode, startDate, endDate),
  ]);

  // 如果资产负债表权限不足
  if (bsRes.status === "permission_denied") {
    const result: BalanceSafetySummaryResult = {
      ok: false, tsCode, symbol, items: [],
      balanceSheetStatus: "permission_denied",
      finaIndicatorStatus: finaRes.status,
      incomeStatus: incRes.status,
      error: "当前 Tushare 权限不足，无法获取资产负债表数据",
      updatedAt: now,
    };
    return result;
  }

  // 资产负债表无记录
  if (bsRes.records.length === 0) {
    const result: BalanceSafetySummaryResult = {
      ok: false, tsCode, symbol, items: [],
      balanceSheetStatus: bsRes.status,
      finaIndicatorStatus: finaRes.status,
      incomeStatus: incRes.status,
      error: "该股票资产负债表数据暂缺",
      updatedAt: now,
    };
    return result;
  }

  // 建立快速查找表
  const finaByDate = new Map<string, TushareRecord>();
  for (const r of finaRes.records) finaByDate.set(String(r.end_date ?? ""), r);

  const incByDate = new Map<string, TushareRecord>();
  for (const r of incRes.records) incByDate.set(String(r.end_date ?? ""), r);

  const bsSlice = bsRes.records.slice(0, periods);

  const items: BalanceSafetySummaryItem[] = bsSlice.map((bs) => {
    const ed   = String(bs.end_date ?? "");
    const fina = finaByDate.get(ed);
    const inc  = incByDate.get(ed);

    // ── 资产负债核心字段 ──────────────────────────────────────────
    const totalAssets        = toNum(bs.total_assets);
    const totalLiabilities   = toNum(bs.total_liab);
    const netAssets          = toNum(bs.total_hldr_eqy_exc_min_int);
    const shareholderEquity  = toNum(bs.total_hldr_eqy_inc_min_int) ?? netAssets;
    const monetaryFunds      = toNum(bs.money_cap);
    const currentAssets      = toNum(bs.total_cur_assets);
    const currentLiabilities = toNum(bs.total_cur_liab);
    const accountsReceivable = toNum(bs.accounts_receiv);
    const inventory          = toNum(bs.inventories);
    const goodwill           = toNum(bs.goodwill);
    const shortTermBorrowings = toNum(bs.st_borr);
    const longTermBorrowings  = toNum(bs.lt_borr);

    // ── 营收（来自 income）────────────────────────────────────────
    const revenue = inc ? (toNum(inc.revenue) ?? toNum(inc.total_revenue)) : null;

    // ── 安全比率（优先 fina_indicator，再自行计算）────────────────
    // debt_to_assets: Tushare fina_indicator 返回百分比形式（如 40.5 = 40.5%），
    // 内部统一存储为小数（÷100），与自行计算（totalLiab/totalAssets）保持一致。
    const debtToAssetsRaw = toNum(fina?.debt_to_assets);
    const debtToAssets = debtToAssetsRaw != null
      ? debtToAssetsRaw / 100
      : safeDiv(totalLiabilities, totalAssets);

    // current_ratio: fina 直接给比值
    const currentRatio = toNum(fina?.current_ratio) ??
      safeDiv(currentAssets, currentLiabilities);

    // quick_ratio: fina 直接给比值
    const quickRatio = toNum(fina?.quick_ratio) ??
      safeDiv(
        currentAssets != null && inventory != null ? currentAssets - inventory : null,
        currentLiabilities,
      );

    // 商誉占净资产
    const goodwillToNetAssets = safeDiv(goodwill, netAssets);

    // 应收账款占收入
    const receivablesToRevenue = safeDiv(accountsReceivable, revenue);

    // 存货占收入
    const inventoryToRevenue = safeDiv(inventory, revenue);

    return {
      tsCode,
      symbol,
      reportDate: ed,
      annDate:    String(bs.ann_date ?? ""),
      period:     toPeriodLabel(ed),
      totalAssets,
      totalLiabilities,
      netAssets,
      shareholderEquity,
      monetaryFunds,
      currentAssets,
      currentLiabilities,
      accountsReceivable,
      inventory,
      goodwill,
      shortTermBorrowings,
      longTermBorrowings,
      revenue,
      debtToAssets,
      currentRatio,
      quickRatio,
      goodwillToNetAssets,
      receivablesToRevenue,
      inventoryToRevenue,
      source:    "Tushare",
      updatedAt: now,
    } satisfies BalanceSafetySummaryItem;
  });

  const result: BalanceSafetySummaryResult = {
    ok: true, tsCode, symbol, items,
    balanceSheetStatus:  bsRes.status,
    finaIndicatorStatus: finaRes.status,
    incomeStatus:        incRes.status,
    updatedAt: now,
  };

  _safetyCache.set(cacheKey, { result, expiresAt: Date.now() + SAFETY_CACHE_TTL });
  return result;
}

// ════════════════════════════════════════════════════════════════════════
//  现金流量 + 现金流质量分析  (Task D)
// ════════════════════════════════════════════════════════════════════════

// ── 缓存 ─────────────────────────────────────────────────────────────
const CASHFLOW_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

interface CashflowCacheEntry {
  result:    CashflowSummaryResult;
  expiresAt: number;
}
const _cashflowCache = new Map<string, CashflowCacheEntry>();

/** 清除现金流缓存（支持按 tsCode 精确清除） */
export function clearCashflowCache(tsCode?: string): void {
  if (tsCode) {
    for (const key of _cashflowCache.keys()) {
      if (key.startsWith(`cf::${tsCode}::`)) _cashflowCache.delete(key);
    }
  } else {
    _cashflowCache.clear();
  }
}

// ── 字段常量 ─────────────────────────────────────────────────────────

/** cashflow 接口完整字段列表 */
export const CASHFLOW_FIELDS =
  "ann_date,end_date,n_cashflow_act,n_cashflow_inv_act,n_cash_flows_fnc_act,free_cashflow,n_incr_cash_cash_equ,c_fr_sale_sg,c_paid_goods_s,c_pay_dist_dpcp_int_exp,c_pay_acq_const_fiolta";

// ── 类型定义 ─────────────────────────────────────────────────────────

export type CashflowDataStatus = "ok" | "permission_denied" | "error" | "empty" | "no_token";

/**
 * 现金流量 + 现金流质量核心字段（单报告期）
 * null 代表数据缺失，绝不用 0 冒充。
 */
export interface CashflowSummaryItem {
  tsCode:    string;
  symbol:    string;
  reportDate: string;  // end_date YYYYMMDD
  annDate:   string;   // ann_date YYYYMMDD
  period:    string;   // "2024年年报" 等

  // ── 三大现金流（单位：元）────────────────────────────────────────
  operatingCashflow:   number | null;  // 经营活动现金流净额 (n_cashflow_act)
  investingCashflow:   number | null;  // 投资活动现金流净额 (n_cashflow_inv_act)
  financingCashflow:   number | null;  // 筹资活动现金流净额 (n_cash_flows_fnc_act)

  // ── 自由现金流（单位：元）────────────────────────────────────────
  freeCashflow:        number | null;  // free_cashflow 或 经营现金流 - 资本开支

  // ── 现金流质量指标 ───────────────────────────────────────────────
  operatingCashflowToNetProfit:    number | null;  // 经营现金流 / 净利润（倍数，如 1.2）
  cashAndCashEquivalentsIncrease:  number | null;  // 现金及现金等价物增加额

  // ── 详细现金流分项（单位：元）───────────────────────────────────
  cashReceivedFromSales:       number | null;  // 销售商品收到的现金 (c_fr_sale_sg)
  cashPaidForGoods:            number | null;  // 购买商品支付的现金 (c_paid_goods_s)
  dividendInterestPaymentCash: number | null;  // 分红利息支付现金 (c_pay_dist_dpcp_int_exp)
  capitalExpenditures:         number | null;  // 购建固定资产支付现金 (c_pay_acq_const_fiolta)

  // ── 辅助字段（来自 income）──────────────────────────────────────
  netProfit: number | null;  // 净利润（用于计算 operatingCashflowToNetProfit）
  revenue:   number | null;  // 营业收入（用于销售回款质量预警）

  source:    "Tushare";
  updatedAt: string;
}

export interface CashflowSummaryResult {
  ok:               boolean;
  tsCode:           string;
  symbol:           string;
  items:            CashflowSummaryItem[];
  cashflowStatus:   CashflowDataStatus;
  incomeStatus:     CashflowDataStatus;
  fromCache?:       boolean;
  error?:           string;
  updatedAt:        string;
}

// ── 原始数据获取 ──────────────────────────────────────────────────────

/**
 * 获取现金流量表原始数据
 */
export async function getCashflowStatement(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<{ records: TushareRecord[]; status: CashflowDataStatus; error?: string }> {
  const res = await callTushare(
    "cashflow",
    { ts_code: tsCode, start_date: startDate, end_date: endDate, report_type: "1" },
    CASHFLOW_FIELDS,
    CASHFLOW_CACHE_TTL,
  );
  if (!res.ok) {
    return {
      records: [],
      status:  res.permissionDenied ? "permission_denied" : "error",
      error:   res.error,
    };
  }
  const deduped = dedupeDesc(res.records);
  return { records: deduped, status: deduped.length > 0 ? "ok" : "empty" };
}

/**
 * 获取用于现金流质量计算的 income 数据（净利润 + 营收）
 * 复用 getIncomeStatement，仅取必需字段
 */
export async function getCashflowQualityMetrics(
  tsCode:    string,
  startDate: string,
  endDate:   string,
): Promise<{ records: TushareRecord[]; status: CashflowDataStatus; error?: string }> {
  const res = await callTushare(
    "income",
    { ts_code: tsCode, start_date: startDate, end_date: endDate, report_type: "1" },
    "ann_date,end_date,n_income,n_income_attr_p,revenue,total_revenue",
    CASHFLOW_CACHE_TTL,
  );
  if (!res.ok) {
    return {
      records: [],
      status:  res.permissionDenied ? "permission_denied" : "error",
      error:   res.error,
    };
  }
  const deduped = dedupeDesc(res.records);
  return { records: deduped, status: deduped.length > 0 ? "ok" : "empty" };
}

// ── 核心聚合函数 ──────────────────────────────────────────────────────

/**
 * 获取现金流摘要（最近 periods 期，聚合 cashflow + income）
 *
 * @param tsCode   Tushare 股票代码，如 "600519.SH"
 * @param periods  返回期数（默认 8 期）
 * @param refresh  为 true 时强制绕过缓存
 */
export async function getCashflowSummary(
  tsCode:  string,
  periods  = 8,
  refresh  = false,
): Promise<CashflowSummaryResult> {
  const now = new Date().toISOString();

  // Token 检查
  if (!hasTushareToken()) {
    return {
      ok: false, tsCode, symbol: tsCodeToSymbol(tsCode), items: [],
      cashflowStatus: "no_token",
      incomeStatus:   "no_token",
      error: "TUSHARE_TOKEN 未配置，无法获取现金流量表数据",
      updatedAt: now,
    };
  }

  const cacheKey = `cf::${tsCode}::${periods}`;
  if (!refresh) {
    const hit = _cashflowCache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) {
      return { ...hit.result, fromCache: true };
    }
  }

  const symbol    = tsCodeToSymbol(tsCode);
  const startDate = daysAgoStr(3 * 365 + 90);
  const endDate   = todayStr();

  // 并行拉取 cashflow + income
  const [cfRes, incRes] = await Promise.all([
    getCashflowStatement(tsCode, startDate, endDate),
    getCashflowQualityMetrics(tsCode, startDate, endDate),
  ]);

  // 权限不足
  if (cfRes.status === "permission_denied") {
    const result: CashflowSummaryResult = {
      ok: false, tsCode, symbol, items: [],
      cashflowStatus: "permission_denied",
      incomeStatus:   incRes.status,
      error: "当前 Tushare 权限不足，无法获取现金流量表数据",
      updatedAt: now,
    };
    return result;
  }

  // 无记录
  if (cfRes.records.length === 0) {
    const result: CashflowSummaryResult = {
      ok: false, tsCode, symbol, items: [],
      cashflowStatus: cfRes.status,
      incomeStatus:   incRes.status,
      error: "该股票现金流量表数据暂缺",
      updatedAt: now,
    };
    return result;
  }

  // 建立 income 快速查找
  const incByDate = new Map<string, TushareRecord>();
  for (const r of incRes.records) incByDate.set(String(r.end_date ?? ""), r);

  const cfSlice = cfRes.records.slice(0, periods);

  const items: CashflowSummaryItem[] = cfSlice.map((cf) => {
    const ed  = String(cf.end_date ?? "");
    const inc = incByDate.get(ed);

    // ── 三大现金流 ──────────────────────────────────────────────────
    const operatingCashflow  = toNum(cf.n_cashflow_act);
    const investingCashflow  = toNum(cf.n_cashflow_inv_act);
    const financingCashflow  = toNum(cf.n_cash_flows_fnc_act);

    // ── 自由现金流（优先 free_cashflow，次用 经营-资本开支）──────
    const fcfDirect  = toNum(cf.free_cashflow);
    const capex      = toNum(cf.c_pay_acq_const_fiolta);
    const freeCashflow =
      fcfDirect != null
        ? fcfDirect
        : operatingCashflow != null && capex != null
        ? operatingCashflow - capex
        : null;

    // ── 详细分项 ────────────────────────────────────────────────────
    const cashAndCashEquivalentsIncrease  = toNum(cf.n_incr_cash_cash_equ);
    const cashReceivedFromSales           = toNum(cf.c_fr_sale_sg);
    const cashPaidForGoods               = toNum(cf.c_paid_goods_s);
    const dividendInterestPaymentCash    = toNum(cf.c_pay_dist_dpcp_int_exp);
    const capitalExpenditures            = capex;

    // ── income 辅助字段 ─────────────────────────────────────────────
    const netProfit = inc
      ? (toNum(inc.n_income_attr_p) ?? toNum(inc.n_income))
      : null;
    const revenue = inc
      ? (toNum(inc.revenue) ?? toNum(inc.total_revenue))
      : null;

    // ── 现金流质量比率 ──────────────────────────────────────────────
    // 经营现金流 / 净利润（内部存倍数，如 1.2）
    // 净利润为 0 或负数时不计算（避免除以 0 或无意义的负数）
    const operatingCashflowToNetProfit =
      operatingCashflow != null && netProfit != null && netProfit !== 0
        ? operatingCashflow / netProfit
        : null;

    return {
      tsCode,
      symbol,
      reportDate: ed,
      annDate:    String(cf.ann_date ?? ""),
      period:     toPeriodLabel(ed),
      operatingCashflow,
      investingCashflow,
      financingCashflow,
      freeCashflow,
      operatingCashflowToNetProfit,
      cashAndCashEquivalentsIncrease,
      cashReceivedFromSales,
      cashPaidForGoods,
      dividendInterestPaymentCash,
      capitalExpenditures,
      netProfit,
      revenue,
      source:    "Tushare",
      updatedAt: now,
    } satisfies CashflowSummaryItem;
  });

  const result: CashflowSummaryResult = {
    ok: true, tsCode, symbol, items,
    cashflowStatus: cfRes.status,
    incomeStatus:   incRes.status,
    updatedAt: now,
  };

  _cashflowCache.set(cacheKey, { result, expiresAt: Date.now() + CASHFLOW_CACHE_TTL });
  return result;
}

// ════════════════════════════════════════════════════════════════════════
//  财报趋势分析  (Task F)
//  聚合 income + fina_indicator + cashflow + balancesheet
//  返回最近 4~8 期趋势数据，升序排列，适合前端图表直接使用。
// ════════════════════════════════════════════════════════════════════════

// ── 缓存 ─────────────────────────────────────────────────────────────
const TREND_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天（财报变化慢）

interface TrendCacheEntry {
  result:    FinancialTrendResult;
  expiresAt: number;
}
const _trendCache = new Map<string, TrendCacheEntry>();

/** 清除财报趋势缓存（支持按 tsCode 精确清除） */
export function clearTrendCache(tsCode?: string): void {
  if (tsCode) {
    for (const k of _trendCache.keys()) {
      if (k.startsWith(`trend::${tsCode}::`)) _trendCache.delete(k);
    }
  } else {
    _trendCache.clear();
  }
}

// ── 类型定义 ─────────────────────────────────────────────────────────

export type TrendDirection =
  | "improving"        // 改善
  | "worsening"        // 恶化
  | "stable"           // 稳定
  | "volatile"         // 波动
  | "insufficient_data"; // 数据不足（有效期数 < 3）

export interface FinancialTrendPeriod {
  reportDate:        string;          // YYYYMMDD
  annDate:           string;          // 公告日期 YYYYMMDD
  period:            string;          // "2024年年报"

  revenue:           number | null;   // 营业收入（元）
  netProfit:         number | null;   // 净利润（元，归母优先）
  deductedNetProfit: number | null;   // 扣非净利润（元）
  roe:               number | null;   // ROE（%，如 15.2 = 15.2%）
  grossMargin:       number | null;   // 毛利率（%，如 91.5 = 91.5%）
  operatingCashflow: number | null;   // 经营现金流净额（元）
  debtToAssets:      number | null;   // 资产负债率（小数，0.65 = 65%）

  missingFields:     string[];        // 缺失字段名列表
  source:            "Tushare";
}

export interface FinancialTrendAnalysis {
  revenueTrend:           TrendDirection;
  netProfitTrend:         TrendDirection;
  deductedNetProfitTrend: TrendDirection;
  roeTrend:               TrendDirection;
  grossMarginTrend:       TrendDirection;
  operatingCashflowTrend: TrendDirection;
  debtToAssetsTrend:      TrendDirection;
  overallTrend:           "improving" | "worsening" | "stable" | "mixed" | "insufficient_data";
}

export interface FinancialTrendResult {
  ok:             boolean;
  tsCode:         string;
  symbol:         string;
  periods:        FinancialTrendPeriod[];  // 升序（旧→新），适合图表
  trendAnalysis:  FinancialTrendAnalysis;
  riskWarnings:   string[];
  fromCache?:     boolean;
  error?:         string;
  updatedAt:      string;
  incomeStatus:   string;
  finaStatus:     string;
  cashflowStatus: string;
  balanceStatus:  string;
}

// ── fina_indicator 趋势专用字段集 ────────────────────────────────────

const FINA_TREND_FIELDS =
  "ann_date,end_date,roe,grossprofit_margin,debt_to_assets,profit_dedt";

// ── 趋势计算工具 ──────────────────────────────────────────────────────

/**
 * 计算数值序列趋势（升序时间序列）
 * higherIsBetter=true  → 上升=improving；false → 下降=improving
 */
function calcTrend(values: (number | null)[], higherIsBetter = true): TrendDirection {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 3) return "insufficient_data";

  let upPairs = 0, downPairs = 0;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i] > valid[i - 1])      upPairs++;
    else if (valid[i] < valid[i - 1]) downPairs++;
  }
  const pairs = valid.length - 1;
  const upR = upPairs / pairs;
  const downR = downPairs / pairs;
  const thr = 2 / 3; // 超过 2/3 的相邻对方向一致 → 判断为趋势

  if (higherIsBetter) {
    if (upR   >= thr) return "improving";
    if (downR >= thr) return "worsening";
  } else {
    if (downR >= thr) return "improving";
    if (upR   >= thr) return "worsening";
  }

  // 振幅 > 30% → volatile；否则 stable
  const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
  if (avg !== 0) {
    const range = Math.max(...valid) - Math.min(...valid);
    if (Math.abs(range / avg) > 0.3) return "volatile";
  }
  return "stable";
}

function calcOverallTrend(
  a: Omit<FinancialTrendAnalysis, "overallTrend">,
): FinancialTrendAnalysis["overallTrend"] {
  const ts = [
    a.revenueTrend, a.netProfitTrend, a.deductedNetProfitTrend,
    a.roeTrend, a.grossMarginTrend, a.operatingCashflowTrend, a.debtToAssetsTrend,
  ].filter(t => t !== "insufficient_data");

  if (ts.length < 3) return "insufficient_data";
  const imp = ts.filter(t => t === "improving").length;
  const wor = ts.filter(t => t === "worsening").length;
  if (imp / ts.length >= 0.6) return "improving";
  if (wor / ts.length >= 0.6) return "worsening";
  if (imp > wor)               return "stable";
  return "mixed";
}

function buildTrendRiskWarnings(
  periods: FinancialTrendPeriod[],
  a: FinancialTrendAnalysis,
): string[] {
  const w: string[] = [];
  if (a.revenueTrend === "worsening")
    w.push("营业收入连续下滑，需关注主营业务增长压力。");
  if (a.netProfitTrend === "worsening")
    w.push("净利润连续下滑，盈利能力承压。");
  const latestDnp = periods[periods.length - 1]?.deductedNetProfit;
  if (latestDnp != null && latestDnp < 0)
    w.push("最新期扣非净利润为负，主营盈利质量需关注。");
  if (a.deductedNetProfitTrend === "worsening")
    w.push("扣非净利润持续恶化，需警惕非经常性损益依赖。");
  if (a.roeTrend === "worsening")
    w.push("ROE 连续下滑，股东回报能力下降。");
  if (a.grossMarginTrend === "worsening")
    w.push("毛利率下滑，可能存在成本上升或竞争加剧。");
  const cfNeg = periods.filter(p => p.operatingCashflow != null && p.operatingCashflow < 0).length;
  if (cfNeg >= 2)
    w.push("经营现金流持续为负，利润质量风险较高。");
  if (a.operatingCashflowTrend === "worsening")
    w.push("经营现金流趋势持续恶化，现金回款能力减弱。");
  if (a.debtToAssetsTrend === "worsening")
    w.push("资产负债率持续上升，财务杠杆风险增加。");
  return w;
}

function emptyTrendAnalysis(): FinancialTrendAnalysis {
  const i: TrendDirection = "insufficient_data";
  return {
    revenueTrend: i, netProfitTrend: i, deductedNetProfitTrend: i,
    roeTrend: i, grossMarginTrend: i, operatingCashflowTrend: i,
    debtToAssetsTrend: i, overallTrend: "insufficient_data",
  };
}

// ── 核心聚合函数 ──────────────────────────────────────────────────────

/**
 * 获取财报趋势数据（最近 periods 期，升序返回供图表使用）
 *
 * @param tsCode   Tushare 股票代码，如 "600519.SH"
 * @param periods  返回期数（默认 4，最多 8）
 * @param refresh  为 true 时强制绕过缓存
 */
export async function getFinancialTrendSummary(
  tsCode:  string,
  periods  = 4,
  refresh  = false,
): Promise<FinancialTrendResult> {
  const now    = new Date().toISOString();
  const symbol = tsCodeToSymbol(tsCode);

  if (!hasTushareToken()) {
    return {
      ok: false, tsCode, symbol, periods: [],
      trendAnalysis: emptyTrendAnalysis(), riskWarnings: [],
      error: "TUSHARE_TOKEN 未配置，无法获取财报趋势数据",
      updatedAt: now,
      incomeStatus: "no_token", finaStatus: "no_token",
      cashflowStatus: "no_token", balanceStatus: "no_token",
    };
  }

  const cacheKey = `trend::${tsCode}::${periods}`;
  if (!refresh) {
    const hit = _trendCache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) return { ...hit.result, fromCache: true };
  }

  const startDate = daysAgoStr(3 * 365 + 90);
  const endDate   = todayStr();

  // 并行拉取四个数据源（income 已含 oper_cost，用于毛利率 fallback）
  const [incRes, finaRaw, cfRes, bsRes] = await Promise.all([
    getIncomeStatement(tsCode, startDate, endDate),
    callTushare(
      "fina_indicator",
      { ts_code: tsCode, start_date: startDate, end_date: endDate },
      FINA_TREND_FIELDS,
      TREND_CACHE_TTL,
    ),
    getCashflowStatement(tsCode, startDate, endDate),
    getBalanceSheetStatement(tsCode, startDate, endDate),
  ]);

  // 处理 fina_indicator 响应
  const finaRecords = finaRaw.ok ? dedupeDesc(finaRaw.records) : [];
  const finaStatus  = !finaRaw.ok
    ? (finaRaw.permissionDenied ? "permission_denied" : "error")
    : finaRecords.length > 0 ? "ok" : "empty";

  // income 是核心数据源，权限不足直接返回失败
  if (incRes.status === "permission_denied") {
    return {
      ok: false, tsCode, symbol, periods: [],
      trendAnalysis: emptyTrendAnalysis(), riskWarnings: [],
      error: "当前 Tushare 权限不足，无法获取财报趋势数据",
      updatedAt: now,
      incomeStatus: "permission_denied",
      finaStatus: finaStatus as string,
      cashflowStatus: cfRes.status as string,
      balanceStatus:  bsRes.status as string,
    };
  }

  if (incRes.records.length === 0) {
    return {
      ok: false, tsCode, symbol, periods: [],
      trendAnalysis: emptyTrendAnalysis(), riskWarnings: [],
      error: "该股票财报数据暂缺",
      updatedAt: now,
      incomeStatus: incRes.status,
      finaStatus: finaStatus as string,
      cashflowStatus: cfRes.status as string,
      balanceStatus:  bsRes.status as string,
    };
  }

  // 建立快速查找表（按 end_date）
  const finaByDate = new Map<string, TushareRecord>();
  for (const r of finaRecords) finaByDate.set(String(r.end_date ?? ""), r);

  const cfByDate = new Map<string, TushareRecord>();
  for (const r of cfRes.records) cfByDate.set(String(r.end_date ?? ""), r);

  const bsByDate = new Map<string, TushareRecord>();
  for (const r of bsRes.records) bsByDate.set(String(r.end_date ?? ""), r);

  // 取最近 periods 期 income（已降序），然后升序（旧→新）供图表使用
  const incSlice = incRes.records.slice(0, periods);
  const incAsc   = [...incSlice].reverse();

  const trendPeriods: FinancialTrendPeriod[] = incAsc.map((inc) => {
    const ed   = String(inc.end_date ?? "");
    const fina = finaByDate.get(ed);
    const cf   = cfByDate.get(ed);
    const bs   = bsByDate.get(ed);
    const miss: string[] = [];

    // ── income 字段 ──────────────────────────────────────────────────
    const revenue   = toNum(inc.revenue) ?? toNum(inc.total_revenue);
    const netProfit = toNum(inc.n_income_attr_p) ?? toNum(inc.n_income);
    if (revenue   == null) miss.push("营业收入");
    if (netProfit == null) miss.push("净利润");

    // ── fina_indicator 字段 ──────────────────────────────────────────
    const deductedNetProfit = fina ? toNum(fina.profit_dedt) : null;
    const roe               = fina ? toNum(fina.roe) : null;
    let grossMargin: number | null = fina ? toNum(fina.grossprofit_margin) : null;

    // 毛利率 fallback：(revenue - oper_cost) / revenue × 100
    if (grossMargin == null) {
      const operCost = toNum(inc.oper_cost);
      if (revenue != null && operCost != null && revenue !== 0)
        grossMargin = (revenue - operCost) / revenue * 100;
    }

    if (deductedNetProfit == null) miss.push("扣非净利润");
    if (roe         == null) miss.push("ROE");
    if (grossMargin == null) miss.push("毛利率");

    // ── cashflow 字段 ─────────────────────────────────────────────────
    const operatingCashflow = cf ? toNum(cf.n_cashflow_act) : null;
    if (operatingCashflow == null) miss.push("经营现金流");

    // ── 资产负债率（fina_indicator 优先，balancesheet fallback）──────
    let debtToAssets: number | null = null;
    if (fina) {
      const raw = toNum(fina.debt_to_assets);
      debtToAssets = raw != null ? raw / 100 : null; // Tushare 返回 %（40.5），转小数（0.405）
    }
    if (debtToAssets == null && bs) {
      debtToAssets = safeDiv(toNum(bs.total_liab), toNum(bs.total_assets));
    }
    if (debtToAssets == null) miss.push("资产负债率");

    return {
      reportDate: ed,
      annDate:    String(inc.ann_date ?? ""),
      period:     toPeriodLabel(ed),
      revenue,
      netProfit,
      deductedNetProfit,
      roe,
      grossMargin,
      operatingCashflow,
      debtToAssets,
      missingFields: miss,
      source: "Tushare",
    } satisfies FinancialTrendPeriod;
  });

  // ── 趋势分析 ──────────────────────────────────────────────────────
  const revenueTrend           = calcTrend(trendPeriods.map(p => p.revenue));
  const netProfitTrend         = calcTrend(trendPeriods.map(p => p.netProfit));
  const deductedNetProfitTrend = calcTrend(trendPeriods.map(p => p.deductedNetProfit));
  const roeTrend               = calcTrend(trendPeriods.map(p => p.roe));
  const grossMarginTrend       = calcTrend(trendPeriods.map(p => p.grossMargin));
  const operatingCashflowTrend = calcTrend(trendPeriods.map(p => p.operatingCashflow));
  const debtToAssetsTrend      = calcTrend(trendPeriods.map(p => p.debtToAssets), false);

  const partial = {
    revenueTrend, netProfitTrend, deductedNetProfitTrend,
    roeTrend, grossMarginTrend, operatingCashflowTrend, debtToAssetsTrend,
  };
  const trendAnalysis: FinancialTrendAnalysis = {
    ...partial,
    overallTrend: calcOverallTrend(partial),
  };

  const riskWarnings = buildTrendRiskWarnings(trendPeriods, trendAnalysis);

  const result: FinancialTrendResult = {
    ok: true, tsCode, symbol,
    periods: trendPeriods,
    trendAnalysis,
    riskWarnings,
    updatedAt: now,
    incomeStatus:   incRes.status,
    finaStatus:     finaStatus as string,
    cashflowStatus: cfRes.status as string,
    balanceStatus:  bsRes.status as string,
  };

  _trendCache.set(cacheKey, { result, expiresAt: Date.now() + TREND_CACHE_TTL });
  return result;
}
