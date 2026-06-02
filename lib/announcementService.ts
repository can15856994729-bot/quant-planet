/**
 * lib/announcementService.ts
 *
 * 公告与事件服务 — 实时 Tushare 数据版
 *
 * 数据源（真实接入）：
 *   - 业绩预告/快报  → Tushare forecast / express API
 *   - 分红送股      → Tushare fina_div API
 *   - 股东增减持    → Tushare stk_holdertrade API
 *
 * 数据源（暂未接入，无合适公开 Tushare 接口）：
 *   - 退市风险公告、摘帽公告、重整公告、立案调查公告
 *   - 资产重组公告、控股权变更公告、年报、季报
 *
 * ⚠️  仅限服务端（API Route / Server Component）使用
 *     不直接访问 TUSHARE_TOKEN，通过 tushareService 调用
 *
 * 规范：
 *   - 不允许 mock 公告
 *   - 不允许写死公告标题
 *   - 不允许用假公告冒充真实公告
 */

import {
  getPerformanceForecast,
  getPerformanceExpress,
  getFinaDividend,
  getShareholderTrade,
  TushareRecord,
} from "./tushareService";

// ── 类型定义 ──────────────────────────────────────────────────────────────

export type AnnouncementType =
  | "performance_forecast"   // 业绩预告/快报
  | "annual_report"          // 年报
  | "quarterly_report"       // 季报
  | "delisting_risk"         // 退市风险
  | "remove_st"              // 摘帽/撤销ST
  | "reorganization"         // 重整（破产重整）
  | "investigation"          // 立案调查/问询
  | "shareholder_reduction"  // 股东减持
  | "shareholder_increase"   // 股东增持
  | "asset_restructuring"    // 资产重组
  | "control_change"         // 控股权变更
  | "dividend"               // 分红送股
  | "general";               // 其他

/** 兼容旧 API 路由使用的枚举 */
export type AnnouncementCategory =
  | "general"
  | "performance"
  | "delisting_risk"
  | "remove_st"
  | "restructuring"
  | "investigation"
  | "dividend";

export type RiskLevel        = "critical" | "high" | "medium" | "low" | "none";
export type OpportunityLevel = "high" | "medium" | "low" | "none";
export type ErrorCode        = "ok" | "not_implemented" | "permission_denied" | "announcement_unavailable";

export interface AnnouncementItem {
  id:               string;
  tsCode:           string;
  title:            string;
  annDate:          string;          // YYYYMMDD
  type:             AnnouncementType;
  category:         AnnouncementCategory;
  riskLevel:        RiskLevel;
  opportunityLevel: OpportunityLevel;
  summary?:         string;
  url?:             string;
  rawData?:         TushareRecord;
}

export interface AnnouncementResult {
  ok:               boolean;
  tsCode:           string;
  items:            AnnouncementItem[];
  total:            number;
  available:        boolean;
  errorCode:        ErrorCode;
  message:          string;
  updatedAt:        string;
}

export interface STAnnouncementSummary {
  tsCode:                     string;
  hasRestructuringSignal:     boolean;
  restructuringExpectation:   number;  // 0-100
  hasInvestigationSignal:     boolean;
  delistingRisk:              number;  // 0-100
  hasRemoveSTSignal:          boolean;
  removeSTExpectation:        number;  // 0-100
  recentDividend:             boolean;
  recentShareholderReduction: boolean;
  latestAnnDate:              string;
  availableSources:           string[];
  updatedAt:                  string;
}

// ── 辅助 ─────────────────────────────────────────────────────────────────

/** 获取过去 N 年的日期范围 YYYYMMDD */
function getDateRange(yearsBack = 2): { start: string; end: string } {
  const now   = new Date();
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - yearsBack);

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  return { start: fmt(start), end: fmt(now) };
}

function typeToCategory(t: AnnouncementType): AnnouncementCategory {
  switch (t) {
    case "performance_forecast": return "performance";
    case "delisting_risk":       return "delisting_risk";
    case "remove_st":            return "remove_st";
    case "reorganization":       return "restructuring";
    case "investigation":        return "investigation";
    case "dividend":             return "dividend";
    default:                     return "general";
  }
}

/** 从 YYYYMMDD 生成短 ID */
function makeId(tsCode: string, annDate: string, suffix: string): string {
  return `${tsCode}_${annDate}_${suffix}`.replace(/\./g, "_");
}

// ── 空结果工厂 ───────────────────────────────────────────────────────────

function makeResult(
  tsCode:    string,
  items:     AnnouncementItem[],
  available: boolean,
  errorCode: ErrorCode,
  message:   string,
): AnnouncementResult {
  return {
    ok:        true,
    tsCode,
    items,
    total:     items.length,
    available,
    errorCode,
    message,
    updatedAt: new Date().toISOString(),
  };
}

function notImplemented(tsCode: string, label: string): AnnouncementResult {
  return makeResult(tsCode, [], false, "not_implemented", `${label}暂未接入`);
}

function permissionDenied(tsCode: string, label: string): AnnouncementResult {
  return makeResult(tsCode, [], false, "permission_denied", `${label}权限不足`);
}

function unavailable(tsCode: string, label: string): AnnouncementResult {
  return makeResult(tsCode, [], false, "announcement_unavailable", `${label}暂不可用`);
}

// ── 业绩预告类型 → 风险/机会级别 ─────────────────────────────────────────

type ForecastTypeStr =
  | "预增" | "预减" | "扭亏" | "首亏" | "续亏" | "续盈" | "不确定";

interface ForecastTypeInfo {
  riskLevel:        RiskLevel;
  opportunityLevel: OpportunityLevel;
  label:            string;
}

const FORECAST_TYPE_MAP: Record<string, ForecastTypeInfo> = {
  "预增": { riskLevel: "none",   opportunityLevel: "high",   label: "业绩大幅增长" },
  "扭亏": { riskLevel: "none",   opportunityLevel: "high",   label: "扭亏为盈"     },
  "续盈": { riskLevel: "none",   opportunityLevel: "medium", label: "业绩持续盈利" },
  "预减": { riskLevel: "medium", opportunityLevel: "none",   label: "业绩预减"     },
  "不确定": { riskLevel: "low",  opportunityLevel: "none",   label: "业绩不确定"   },
  "首亏": { riskLevel: "high",   opportunityLevel: "none",   label: "首次亏损"     },
  "续亏": { riskLevel: "high",   opportunityLevel: "none",   label: "持续亏损"     },
};

function getForecastTypeInfo(t: string): ForecastTypeInfo {
  return FORECAST_TYPE_MAP[t] ?? { riskLevel: "low", opportunityLevel: "none", label: t };
}

// ── 业绩预告 → AnnouncementItem ──────────────────────────────────────────

function forecastToItem(tsCode: string, r: TushareRecord, idx: number): AnnouncementItem {
  const annDate   = String(r.ann_date   ?? "");
  const endDate   = String(r.end_date   ?? "");
  const type      = String(r.type       ?? "");
  const pMin      = r.p_change_min != null ? Number(r.p_change_min) : null;
  const pMax      = r.p_change_max != null ? Number(r.p_change_max) : null;
  const info      = getForecastTypeInfo(type);

  // 构建标题（不写死）
  let title = `业绩预告 (${info.label})`;
  if (pMin != null && pMax != null) {
    title += ` — 净利润变化 ${pMin > 0 ? "+" : ""}${pMin.toFixed(0)}% 至 ${pMax > 0 ? "+" : ""}${pMax.toFixed(0)}%`;
  } else if (pMin != null) {
    title += ` — 净利润变化 ${pMin > 0 ? "+" : ""}${pMin.toFixed(0)}%`;
  }

  const summary = String(r.summary ?? r.change_reason ?? "").slice(0, 120) || undefined;

  return {
    id:               makeId(tsCode, annDate, `fc${idx}`),
    tsCode,
    title,
    annDate,
    type:             "performance_forecast",
    category:         "performance",
    riskLevel:        info.riskLevel,
    opportunityLevel: info.opportunityLevel,
    summary:          summary || `报告期：${endDate}`,
    rawData:          r,
  };
}

// ── 业绩快报 → AnnouncementItem ──────────────────────────────────────────

function expressToItem(tsCode: string, r: TushareRecord, idx: number): AnnouncementItem {
  const annDate = String(r.ann_date ?? "");
  const endDate = String(r.end_date ?? "");
  const yoyNet  = r.yoy_net != null ? Number(r.yoy_net) : null;

  let riskLevel:        RiskLevel        = "none";
  let opportunityLevel: OpportunityLevel = "none";
  let changeStr = "";

  if (yoyNet != null) {
    changeStr = ` — 净利润同比 ${yoyNet > 0 ? "+" : ""}${yoyNet.toFixed(1)}%`;
    if (yoyNet >= 50)       { opportunityLevel = "high";   }
    else if (yoyNet >= 10)  { opportunityLevel = "medium"; }
    else if (yoyNet < -50)  { riskLevel = "high";   }
    else if (yoyNet < -20)  { riskLevel = "medium"; }
    else if (yoyNet < 0)    { riskLevel = "low";    }
  }

  return {
    id:               makeId(tsCode, annDate, `ex${idx}`),
    tsCode,
    title:            `业绩快报${changeStr}`,
    annDate,
    type:             "performance_forecast",
    category:         "performance",
    riskLevel,
    opportunityLevel,
    summary:          `报告期：${endDate}`,
    rawData:          r,
  };
}

// ── 分红送股 → AnnouncementItem ──────────────────────────────────────────

function dividendToItem(tsCode: string, r: TushareRecord, idx: number): AnnouncementItem {
  const annDate   = String(r.ann_date ?? "");
  const divProc   = String(r.div_proc ?? "预案");
  const cashDiv   = r.cash_div     != null ? Number(r.cash_div)     : null;
  const stkDiv    = r.stk_div      != null ? Number(r.stk_div)      : null;
  const stkBoRate = r.stk_bo_rate  != null ? Number(r.stk_bo_rate)  : null;
  const exDate    = String(r.ex_date ?? "");

  // 构建标题
  const parts: string[] = [];
  if (stkDiv      && stkDiv      > 0) parts.push(`每10股转${(stkDiv * 10).toFixed(0)}股`);
  if (stkBoRate   && stkBoRate   > 0) parts.push(`每10股送${(stkBoRate * 10).toFixed(0)}股`);
  if (cashDiv     && cashDiv     > 0) parts.push(`每10股派${(cashDiv * 10).toFixed(2)}元`);

  const detailStr = parts.length > 0 ? ` — ${parts.join("，")}` : "";
  const title = `分红方案${detailStr} (${divProc})`;

  // 机会级别：高派现 = medium+
  let opportunityLevel: OpportunityLevel = "low";
  if (cashDiv != null && cashDiv >= 1)       opportunityLevel = "high";
  else if (stkDiv != null && stkDiv >= 0.5)  opportunityLevel = "medium";

  return {
    id:               makeId(tsCode, annDate, `dv${idx}`),
    tsCode,
    title,
    annDate,
    type:             "dividend",
    category:         "dividend",
    riskLevel:        "none",
    opportunityLevel,
    summary:          exDate ? `除权除息日：${exDate}` : undefined,
    rawData:          r,
  };
}

// ── 股东减持 → AnnouncementItem ─────────────────────────────────────────

function shareholderTradeToItem(
  tsCode: string,
  r:      TushareRecord,
  idx:    number,
): AnnouncementItem {
  const annDate    = String(r.ann_date     ?? "");
  const holderName = String(r.holder_name  ?? "股东");
  const reportType = String(r.report_type  ?? "");
  const ratio      = r.ratio != null ? Number(r.ratio) : null;
  const vol        = r.vol   != null ? Number(r.vol)   : null;

  const isReduction = reportType.includes("减持") || !reportType.includes("增持");
  const type: AnnouncementType = isReduction ? "shareholder_reduction" : "shareholder_increase";

  // 构建标题
  const ratioStr = ratio != null ? `占比 ${ratio.toFixed(2)}%` : "";
  const volStr   = vol   != null ? `${(vol / 1e4).toFixed(2)}万股` : "";
  const amtParts = [volStr, ratioStr].filter(Boolean).join("，");
  const title = `${holderName} ${isReduction ? "减持" : "增持"} ${amtParts}`.trim();

  // 风险/机会
  let riskLevel:        RiskLevel        = "none";
  let opportunityLevel: OpportunityLevel = "none";
  if (isReduction) {
    if (ratio != null && ratio >= 1)      riskLevel = "medium";
    else                                   riskLevel = "low";
  } else {
    if (ratio != null && ratio >= 1)      opportunityLevel = "medium";
    else                                   opportunityLevel = "low";
  }

  return {
    id:               makeId(tsCode, annDate, `sh${idx}`),
    tsCode,
    title,
    annDate,
    type,
    category:         "general",
    riskLevel,
    opportunityLevel,
    rawData:          r,
  };
}

// ── 公开 API ──────────────────────────────────────────────────────────────

/**
 * 业绩预告 + 业绩快报（合并，按日期降序）
 */
export async function getPerformanceForecasts(
  tsCode: string,
): Promise<AnnouncementResult> {
  const { start, end } = getDateRange(2);

  const [fcRes, exRes] = await Promise.all([
    getPerformanceForecast(tsCode, start, end),
    getPerformanceExpress(tsCode, start, end),
  ]);

  const items: AnnouncementItem[] = [];

  if (fcRes.ok) {
    fcRes.records.forEach((r, i) => items.push(forecastToItem(tsCode, r, i)));
  }
  if (exRes.ok) {
    exRes.records.forEach((r, i) => items.push(expressToItem(tsCode, r, i)));
  }

  // 权限判断：两个都 permissionDenied
  const bothDenied =
    !fcRes.ok && (fcRes as { permissionDenied?: boolean }).permissionDenied &&
    !exRes.ok && (exRes as { permissionDenied?: boolean }).permissionDenied;

  if (bothDenied && items.length === 0) {
    return permissionDenied(tsCode, "业绩预告");
  }

  // 按日期降序
  items.sort((a, b) => b.annDate.localeCompare(a.annDate));

  const available = items.length > 0 ||
    (fcRes.ok && exRes.ok); // 即使空数组也算接入成功

  return makeResult(
    tsCode,
    items,
    available,
    "ok",
    items.length > 0
      ? `已加载 ${items.length} 条业绩预告/快报`
      : "近2年无业绩预告/快报数据",
  );
}

/**
 * 分红公告（fina_div）
 */
export async function getDividendAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  const { start, end } = getDateRange(3);
  const res = await getFinaDividend(tsCode, start, end);

  if (!res.ok) {
    if ((res as { permissionDenied?: boolean }).permissionDenied) {
      return permissionDenied(tsCode, "分红公告");
    }
    return unavailable(tsCode, "分红公告");
  }

  const items = res.records
    .filter(r => r.ann_date)
    .map((r, i) => dividendToItem(tsCode, r, i))
    .sort((a, b) => b.annDate.localeCompare(a.annDate));

  return makeResult(
    tsCode,
    items,
    true,
    "ok",
    items.length > 0
      ? `已加载 ${items.length} 条分红公告`
      : "近3年无分红记录",
  );
}

/**
 * 股东减持公告（stk_holdertrade，只取减持）
 */
export async function getShareholderReductionAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  const { start, end } = getDateRange(1);
  const res = await getShareholderTrade(tsCode, start, end);

  if (!res.ok) {
    if ((res as { permissionDenied?: boolean }).permissionDenied) {
      return permissionDenied(tsCode, "股东减持公告");
    }
    return unavailable(tsCode, "股东减持公告");
  }

  const items = res.records
    .filter(r => {
      const rt = String(r.report_type ?? "");
      return rt.includes("减持") || (!rt.includes("增持") && rt !== "");
    })
    .map((r, i) => shareholderTradeToItem(tsCode, r, i))
    .sort((a, b) => b.annDate.localeCompare(a.annDate));

  return makeResult(
    tsCode,
    items,
    true,
    "ok",
    items.length > 0
      ? `已加载 ${items.length} 条减持公告`
      : "近1年无股东减持记录",
  );
}

/**
 * 股东增持公告（stk_holdertrade，只取增持）
 */
export async function getShareholderIncreaseAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  const { start, end } = getDateRange(1);
  const res = await getShareholderTrade(tsCode, start, end);

  if (!res.ok) {
    if ((res as { permissionDenied?: boolean }).permissionDenied) {
      return permissionDenied(tsCode, "股东增持公告");
    }
    return unavailable(tsCode, "股东增持公告");
  }

  const items = res.records
    .filter(r => String(r.report_type ?? "").includes("增持"))
    .map((r, i) => shareholderTradeToItem(tsCode, r, i))
    .sort((a, b) => b.annDate.localeCompare(a.annDate));

  return makeResult(
    tsCode,
    items,
    true,
    "ok",
    items.length > 0
      ? `已加载 ${items.length} 条增持公告`
      : "近1年无股东增持记录",
  );
}

/**
 * 全部公告汇总（汇总真实数据源）
 */
export async function getStockAnnouncements(
  tsCode: string,
  _limit  = 30,
): Promise<AnnouncementResult> {
  const [perfRes, divRes, reductionRes] = await Promise.all([
    getPerformanceForecasts(tsCode),
    getDividendAnnouncements(tsCode),
    getShareholderReductionAnnouncements(tsCode),
  ]);

  const items: AnnouncementItem[] = [
    ...perfRes.items,
    ...divRes.items,
    ...reductionRes.items,
  ].sort((a, b) => b.annDate.localeCompare(a.annDate));

  const available =
    perfRes.available || divRes.available || reductionRes.available;

  const sources: string[] = [];
  if (perfRes.available)      sources.push("业绩预告");
  if (divRes.available)       sources.push("分红");
  if (reductionRes.available) sources.push("股东减持");

  const msg = available
    ? `已接入：${sources.join("、")}；退市风险/重组/调查等暂未接入`
    : "公告数据暂未接入";

  return makeResult(tsCode, items, available, available ? "ok" : "not_implemented", msg);
}

// ── 暂未接入的公告类型 ────────────────────────────────────────────────────

export async function getSTRiskAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return notImplemented(tsCode, "ST风险公告（退市风险/调查）");
}

export async function getDelistingRiskAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return notImplemented(tsCode, "退市风险提示公告");
}

export async function getRemoveSTAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return notImplemented(tsCode, "摘帽/撤销ST公告");
}

export async function getRestructuringAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return notImplemented(tsCode, "重整公告");
}

export async function getInvestigationAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return notImplemented(tsCode, "立案调查/问询公告");
}

export async function getAssetRestructuringAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return notImplemented(tsCode, "资产重组公告");
}

export async function getControlChangeAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return notImplemented(tsCode, "控股权变更公告");
}

export async function getAnnualReportAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return notImplemented(tsCode, "年报公告");
}

export async function getQuarterlyReportAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return notImplemented(tsCode, "季报公告");
}

// ── ST 策略汇总（供策略评分使用）────────────────────────────────────────

/**
 * getSTAnnouncementSummary
 *
 * 为 ST 策略提供公告维度的辅助评分。
 * 基于真实数据，不修改现有评分逻辑，仅作展示层使用。
 */
export async function getSTAnnouncementSummary(
  tsCode: string,
): Promise<STAnnouncementSummary> {
  const base: STAnnouncementSummary = {
    tsCode,
    hasRestructuringSignal:     false,
    restructuringExpectation:   0,
    hasInvestigationSignal:     false,
    delistingRisk:              0,
    hasRemoveSTSignal:          false,
    removeSTExpectation:        0,
    recentDividend:             false,
    recentShareholderReduction: false,
    latestAnnDate:              "",
    availableSources:           [],
    updatedAt:                  new Date().toISOString(),
  };

  try {
    const [perfRes, divRes, reductionRes] = await Promise.all([
      getPerformanceForecasts(tsCode),
      getDividendAnnouncements(tsCode),
      getShareholderReductionAnnouncements(tsCode),
    ]);

    // 最新公告日期
    const allDates = [
      ...perfRes.items,
      ...divRes.items,
      ...reductionRes.items,
    ].map(i => i.annDate).filter(Boolean);
    if (allDates.length > 0) {
      base.latestAnnDate = allDates.sort().reverse()[0];
    }

    // 可用数据源
    if (perfRes.available)      base.availableSources.push("业绩预告");
    if (divRes.available)       base.availableSources.push("分红");
    if (reductionRes.available) base.availableSources.push("股东减持");

    // 分红信号 → 公司尚有分红能力，间接减持退市风险
    if (divRes.items.length > 0) {
      base.recentDividend = true;
      // 有分红记录则轻微降低退市风险
    }

    // 持续亏损信号 → 增加退市风险评分
    const highRiskPerf = perfRes.items.filter(
      i => i.riskLevel === "high" && i.type === "performance_forecast"
    );
    if (highRiskPerf.length >= 2) {
      base.delistingRisk = Math.min(60, highRiskPerf.length * 20);
    }

    // 大幅减持 → 风险信号
    const bigReduction = reductionRes.items.filter(i => i.riskLevel === "medium");
    if (bigReduction.length > 0) {
      base.recentShareholderReduction = true;
    }

    // 业绩扭亏/预增 → 摘帽期望信号
    const positivePerf = perfRes.items.filter(
      i => i.opportunityLevel === "high" && i.type === "performance_forecast"
    );
    if (positivePerf.length > 0) {
      base.hasRemoveSTSignal    = true;
      base.removeSTExpectation  = Math.min(50, positivePerf.length * 25);
    }

  } catch {
    // 静默失败，返回空 base
  }

  return base;
}
