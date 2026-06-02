/**
 * lib/bomStockMappingService.ts
 *
 * BOM 产业链股票映射与评分服务
 * ────────────────────────────────────────────────────────────────────────────
 * 核心功能：
 *   1. matchStockToBomModules()  — 关键词匹配，将股票映射到 BOM 模块
 *   2. calculateBomScore()       — 基于映射质量 + BOM 模块属性计算评分
 *   3. scoreBomCandidate()       — 综合 BOM 评分（含财务数据加分）
 *
 * ⚠️ 重要说明：
 *   映射结果为规则匹配，基于公司名称、行业分类和主营业务关键词。
 *   不代表具体供应商/客户关系，需人工复核，不构成投资建议。
 */

import { getBomIndustryTemplate, type BomModule, type BomIndustryTemplate } from "./bomIndustryTemplateService";

// ── 类型定义 ──────────────────────────────────────────────────────────────

export interface StockBasicInfo {
  tsCode:   string;
  symbol:   string;
  name:     string;
  industry: string;   // Tushare industry 字段
  area?:    string;
  market?:  string;
}

export interface FinancialMetrics {
  pe?:          number | null;  // 市盈率
  pb?:          number | null;  // 市净率
  ps?:          number | null;  // 市销率
  roe?:         number | null;  // ROE %
  grossMargin?: number | null;  // 毛利率 %
  netMargin?:   number | null;  // 净利润率 %
  revenueYoy?:  number | null;  // 营收同比 %
  netIncYoy?:   number | null;  // 净利润同比 %
  debtRatio?:   number | null;  // 资产负债率 %
  turnoverRate?: number | null; // 换手率
  totalMv?:     number | null;  // 总市值（万元）
}

export interface BomModuleMatch {
  moduleId:         string;
  moduleName:       string;
  matchScore:       number;     // 0-100：关键词匹配质量
  matchedKeywords:  string[];
  roleInSupplyChain: string;    // "核心供应商" | "配套供应商" | "关联企业"
  technicalBarrier: string;
  localizationSpace: string;
  costRatioRange:   string;
}

export interface BomStockProfile {
  tsCode:             string;
  symbol:             string;
  name:               string;
  industry:           string;
  industryMatch:      string;    // 所属 BOM 行业
  primaryModule:      BomModuleMatch | null;
  allModules:         BomModuleMatch[];
  bomScore:           number;    // 0-100
  bomRating:          "优秀" | "良好" | "一般" | "较差";
  scoreBreakdown: {
    costRatioScore:       number;  // 成本占比 (20%)
    techBarrierScore:     number;  // 技术壁垒 (20%)
    localizationScore:    number;  // 国产替代 (20%)
    supplyChainScore:     number;  // 供应链地位 (15%)
    financialScore:       number;  // 财务质量 (10%)
    growthScore:          number;  // 成长能力 (10%)
    riskDeduction:        number;  // 风险扣分 (5%)
  };
  strengths:          string[];
  risks:              string[];
  opportunities:      string[];
  dataSource:         "rule-match";
  disclaimer:         string;
}

// ── 评分辅助 ──────────────────────────────────────────────────────────────

function techBarrierToScore(level: string): number {
  const map: Record<string, number> = { "高": 100, "中高": 80, "中": 60, "中低": 40, "低": 20 };
  return map[level] ?? 60;
}

function localizationToScore(level: string): number {
  const map: Record<string, number> = { "大": 100, "中高": 80, "中": 60, "中低": 40, "小": 20 };
  return map[level] ?? 60;
}

function costRatioToScore(min: number, max: number): number {
  const mid = (min + max) / 2;
  if (mid >= 35) return 100;
  if (mid >= 25) return 85;
  if (mid >= 15) return 70;
  if (mid >= 8)  return 55;
  return 40;
}

// ── 关键词匹配 ────────────────────────────────────────────────────────────

function matchKeywords(
  stock: StockBasicInfo,
  mod: BomModule,
): { score: number; keywords: string[] } {
  const text = `${stock.name} ${stock.industry}`.toLowerCase();
  const matched: string[] = [];
  let score = 0;

  // 公司名称关键词 — 权重最高（3分/词）
  for (const kw of mod.nameKeywords) {
    if (text.includes(kw.toLowerCase())) {
      matched.push(kw);
      score += 3;
    }
  }
  // 行业关键词 — 中权重（2分/词）
  for (const kw of mod.industryKeywords) {
    if (text.includes(kw.toLowerCase())) {
      if (!matched.includes(kw)) matched.push(kw);
      score += 2;
    }
  }
  // 业务关键词 — 低权重（1分/词）
  for (const kw of mod.businessKeywords) {
    if (text.includes(kw.toLowerCase())) {
      if (!matched.includes(kw)) matched.push(kw);
      score += 1;
    }
  }

  // 归一化到 0-100
  const maxPossible = mod.nameKeywords.length * 3 + mod.industryKeywords.length * 2 + mod.businessKeywords.length;
  const normalized = maxPossible > 0 ? Math.min(100, Math.round((score / maxPossible) * 100 * 3)) : 0;

  return { score: normalized, keywords: matched.slice(0, 5) };
}

function getRoleInSupplyChain(matchScore: number): string {
  if (matchScore >= 80) return "核心供应商";
  if (matchScore >= 50) return "配套供应商";
  return "关联企业";
}

// ── 主函数：股票 → BOM 模块映射 ──────────────────────────────────────────

export function matchStockToBomModules(
  stock: StockBasicInfo,
  industryName: string,
): BomModuleMatch[] {
  const template = getBomIndustryTemplate(industryName);
  if (!template) return [];

  const results: BomModuleMatch[] = [];

  for (const mod of template.modules) {
    const { score, keywords } = matchKeywords(stock, mod);
    if (score < 10) continue;  // 过滤低质量匹配

    results.push({
      moduleId:          mod.id,
      moduleName:        mod.moduleName,
      matchScore:        score,
      matchedKeywords:   keywords,
      roleInSupplyChain: getRoleInSupplyChain(score),
      technicalBarrier:  mod.technicalBarrier,
      localizationSpace: mod.localizationSpace,
      costRatioRange:    `${mod.estimatedCostRatioMin}%-${mod.estimatedCostRatioMax}%`,
    });
  }

  // 按匹配分排序
  return results.sort((a, b) => b.matchScore - a.matchScore);
}

// ── 综合 BOM 评分计算 ────────────────────────────────────────────────────

export function calculateBomScore(
  modules: BomModuleMatch[],
  template: BomIndustryTemplate,
  fin?: FinancialMetrics,
): {
  total: number;
  breakdown: BomStockProfile["scoreBreakdown"];
} {
  if (modules.length === 0) {
    return {
      total: 0,
      breakdown: { costRatioScore: 0, techBarrierScore: 0, localizationScore: 0, supplyChainScore: 0, financialScore: 0, growthScore: 0, riskDeduction: 0 },
    };
  }

  const best = modules[0];
  const mod  = template.modules.find(m => m.id === best.moduleId);
  if (!mod) return { total: 0, breakdown: { costRatioScore: 0, techBarrierScore: 0, localizationScore: 0, supplyChainScore: 0, financialScore: 0, growthScore: 0, riskDeduction: 0 } };

  // 1. 成本占比得分 (权重 20%)
  const costRatioScore   = costRatioToScore(mod.estimatedCostRatioMin, mod.estimatedCostRatioMax) * 0.20;

  // 2. 技术壁垒得分 (权重 20%)
  const techBarrierScore = techBarrierToScore(mod.technicalBarrier) * 0.20;

  // 3. 国产替代得分 (权重 20%)
  const localizationScore = localizationToScore(mod.localizationSpace) * 0.20;

  // 4. 供应链地位 (权重 15%) — 基于匹配分
  const supplyChainScore = best.matchScore * 0.15;

  // 5. 财务质量 (权重 10%) — 基于可用财务数据
  let finScore = 50; // 无数据时中等
  if (fin) {
    let s = 50;
    if (fin.roe    != null) s += fin.roe > 15 ? 15 : fin.roe > 8 ? 8 : fin.roe > 0 ? 3 : -10;
    if (fin.grossMargin != null) s += fin.grossMargin > 40 ? 15 : fin.grossMargin > 25 ? 8 : fin.grossMargin > 10 ? 3 : -5;
    if (fin.debtRatio != null) s += fin.debtRatio < 50 ? 5 : fin.debtRatio < 70 ? 0 : -10;
    if (fin.pb != null && fin.pb > 0) s += fin.pb < 3 ? 5 : fin.pb < 6 ? 2 : -3;
    finScore = Math.max(0, Math.min(100, s));
  }
  const financialScore = finScore * 0.10;

  // 6. 成长能力 (权重 10%)
  let growthBase = 50;
  if (fin) {
    if (fin.revenueYoy != null) growthBase += fin.revenueYoy > 30 ? 20 : fin.revenueYoy > 10 ? 10 : fin.revenueYoy > 0 ? 5 : -10;
    if (fin.netIncYoy  != null) growthBase += fin.netIncYoy  > 30 ? 10 : fin.netIncYoy  > 0  ? 5  : -5;
  }
  const growthScore = Math.max(0, Math.min(100, growthBase)) * 0.10;

  // 7. 风险扣分 (权重 5%)
  let riskDed = 0;
  if (fin) {
    if (fin.debtRatio != null && fin.debtRatio > 80) riskDed += 30;
    if (fin.pe != null && fin.pe > 200)              riskDed += 20;
  }
  const riskDeduction = Math.min(50, riskDed) * 0.05;

  const total = Math.round(
    costRatioScore + techBarrierScore + localizationScore +
    supplyChainScore + financialScore + growthScore - riskDeduction
  );

  return {
    total: Math.max(0, Math.min(100, total)),
    breakdown: {
      costRatioScore:    Math.round(costRatioScore),
      techBarrierScore:  Math.round(techBarrierScore),
      localizationScore: Math.round(localizationScore),
      supplyChainScore:  Math.round(supplyChainScore),
      financialScore:    Math.round(financialScore),
      growthScore:       Math.round(growthScore),
      riskDeduction:     Math.round(riskDeduction),
    },
  };
}

function scoreToRating(score: number): BomStockProfile["bomRating"] {
  if (score >= 80) return "优秀";
  if (score >= 60) return "良好";
  if (score >= 40) return "一般";
  return "较差";
}

// ── 构建完整 BOM 股票画像 ─────────────────────────────────────────────────

export function buildBomStockProfile(
  stock: StockBasicInfo,
  industryName: string,
  fin?: FinancialMetrics,
): BomStockProfile | null {
  const template = getBomIndustryTemplate(industryName);
  if (!template) return null;

  const modules = matchStockToBomModules(stock, industryName);
  if (modules.length === 0) return null;

  const { total, breakdown } = calculateBomScore(modules, template, fin);
  const best = modules[0];

  // 构建优势/风险/机会
  const mod = template.modules.find(m => m.id === best.moduleId);
  const strengths: string[]     = [];
  const risks: string[]         = [];
  const opportunities: string[] = [];

  if (mod) {
    if (techBarrierToScore(mod.technicalBarrier) >= 80) strengths.push(`技术壁垒${mod.technicalBarrier}`);
    if (localizationToScore(mod.localizationSpace) >= 80) opportunities.push(`国产替代空间${mod.localizationSpace}`);
    if (costRatioToScore(mod.estimatedCostRatioMin, mod.estimatedCostRatioMax) >= 70) strengths.push(`成本占比高（${best.costRatioRange}）`);
    risks.push(...(mod.risks.slice(0, 2)));
    opportunities.push(...(mod.opportunities.slice(0, 2)));
  }

  if (best.matchScore >= 70) strengths.push(`关键词高度匹配（${best.matchedKeywords.join("/")}）`);
  if (fin?.roe && fin.roe > 15) strengths.push(`ROE 较高（${fin.roe.toFixed(1)}%）`);
  if (fin?.grossMargin && fin.grossMargin > 30) strengths.push(`毛利率较高（${fin.grossMargin.toFixed(1)}%）`);
  if (fin?.debtRatio && fin.debtRatio > 70) risks.push(`资产负债率较高（${fin.debtRatio.toFixed(1)}%）`);

  return {
    tsCode:        stock.tsCode,
    symbol:        stock.symbol,
    name:          stock.name,
    industry:      stock.industry,
    industryMatch: industryName,
    primaryModule: best,
    allModules:    modules,
    bomScore:      total,
    bomRating:     scoreToRating(total),
    scoreBreakdown: breakdown,
    strengths:     [...new Set(strengths)].slice(0, 4),
    risks:         [...new Set(risks)].slice(0, 4),
    opportunities: [...new Set(opportunities)].slice(0, 4),
    dataSource:    "rule-match",
    disclaimer:    "股票映射为规则匹配结果（关键词+行业分类），非具体供应商关系，需人工复核",
  };
}

// ── 批量扫描 ──────────────────────────────────────────────────────────────

export function scanBomCandidates(
  stocks: StockBasicInfo[],
  industryName: string,
  minScore = 40,
  finMap?: Map<string, FinancialMetrics>,
): BomStockProfile[] {
  const results: BomStockProfile[] = [];

  for (const stock of stocks) {
    const profile = buildBomStockProfile(stock, industryName, finMap?.get(stock.tsCode));
    if (profile && profile.bomScore >= minScore) {
      results.push(profile);
    }
  }

  return results.sort((a, b) => b.bomScore - a.bomScore);
}
