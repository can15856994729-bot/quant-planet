/**
 * lib/announcementService.ts
 *
 * 公告与事件服务（Stub 版本）
 *
 * 当前版本：公告数据暂未接入，所有方法返回空结构并标记 available=false。
 * 后续可接入 Tushare anns / 东方财富公告 API。
 *
 * 安全约束：不直接访问 TUSHARE_TOKEN。
 */

// ── 类型定义 ─────────────────────────────────────────────────────────

export type AnnouncementCategory =
  | "general"          // 一般公告
  | "performance"      // 业绩预告/快报
  | "delisting_risk"   // 退市风险
  | "remove_st"        // 摘帽/撤销ST
  | "restructuring"    // 重大重组/并购
  | "investigation"    // 立案调查/问询函
  | "dividend";        // 分红/利润分配

export interface AnnouncementItem {
  id:           string;
  tsCode:       string;
  title:        string;
  annDate:      string;       // YYYYMMDD
  category:     AnnouncementCategory;
  url?:         string;
  summary?:     string;
}

export interface AnnouncementResult {
  ok:        boolean;
  tsCode:    string;
  items:     AnnouncementItem[];
  total:     number;
  available: boolean;          // false = 数据源未接入
  message:   string;
  updatedAt: string;
}

// ── 统一空结果工厂 ────────────────────────────────────────────────────

function emptyResult(tsCode: string, message = "公告数据暂未接入"): AnnouncementResult {
  return {
    ok:        true,
    tsCode,
    items:     [],
    total:     0,
    available: false,
    message,
    updatedAt: new Date().toISOString(),
  };
}

// ── 公开 API ──────────────────────────────────────────────────────────

/**
 * 获取股票全部公告列表（按时间降序）
 */
export async function getStockAnnouncements(
  tsCode: string,
  _limit = 20,
): Promise<AnnouncementResult> {
  return emptyResult(tsCode);
}

/**
 * 获取 ST 专项风险公告
 * （含：退市风险、监管问询、立案调查）
 */
export async function getSTRiskAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return emptyResult(tsCode, "ST风险公告数据暂未接入");
}

/**
 * 获取业绩预告 / 业绩快报
 */
export async function getPerformanceForecasts(
  tsCode: string,
): Promise<AnnouncementResult> {
  return emptyResult(tsCode, "业绩预告数据暂未接入");
}

/**
 * 获取退市风险相关公告
 */
export async function getDelistingRiskAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return emptyResult(tsCode, "退市风险公告数据暂未接入");
}

/**
 * 获取摘帽/撤销ST相关公告
 * （摘帽预期是ST反转策略的重要信号）
 */
export async function getRemoveSTAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return emptyResult(tsCode, "摘帽公告数据暂未接入");
}

/**
 * 获取重大重组/并购/资产注入公告
 */
export async function getRestructuringAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return emptyResult(tsCode, "重组公告数据暂未接入");
}

/**
 * 获取监管问询函/立案调查公告
 */
export async function getInvestigationAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return emptyResult(tsCode, "问询/立案公告数据暂未接入");
}

/**
 * 获取分红/利润分配公告
 */
export async function getDividendAnnouncements(
  tsCode: string,
): Promise<AnnouncementResult> {
  return emptyResult(tsCode, "分红公告数据暂未接入");
}
