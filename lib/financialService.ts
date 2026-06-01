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
