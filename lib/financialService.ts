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
