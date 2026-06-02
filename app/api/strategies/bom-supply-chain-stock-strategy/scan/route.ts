/**
 * POST /api/strategies/bom-supply-chain-stock-strategy/scan
 *
 * BOM 产业链全市场扫描
 * ────────────────────────────────────────────────────────────────────────────
 * Body: { industry: string, minScore?: number, includeFinancial?: boolean }
 *
 * 流程：
 *   1. 从 Tushare stock_basic 获取全部 A 股
 *   2. 对每只股票做关键词匹配（bomQuickFilter + matchStockToBomModules）
 *   3. 可选：从 daily_basic 拉取最新财务指标（PE/PB/换手率）
 *   4. 计算 BOM 策略评分
 *   5. 返回候选列表（按评分排序）
 *
 * ⚠️ 映射结果为规则匹配，需人工复核，不构成投资建议。
 */

import { NextRequest, NextResponse } from "next/server";
import { getAStockBasicAll, hasTushareToken, todayStr, daysAgoStr } from "@/lib/tushareService";
import { getBomIndustryTemplate } from "@/lib/bomIndustryTemplateService";
import { scanBomCandidates, type FinancialMetrics } from "@/lib/bomStockMappingService";
import { bomQuickFilter } from "@/lib/fundamentalRiskFilter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 0. 鉴权 & 参数 ───────────────────────────────────────────────────────
  if (!hasTushareToken()) {
    return NextResponse.json({ ok: false, error: "TUSHARE_TOKEN 未配置" }, { status: 400 });
  }

  let body: { industry?: string; minScore?: number; includeFinancial?: boolean };
  try { body = await req.json(); }
  catch { body = {}; }

  const industry  = body.industry ?? "新能源汽车";
  const minScore  = body.minScore  ?? 40;

  const template = getBomIndustryTemplate(industry);
  if (!template) {
    return NextResponse.json({
      ok:    false,
      error: `不支持行业「${industry}」，请选择内置支持的行业`,
    }, { status: 400 });
  }

  // ── 1. 获取全部 A 股 ──────────────────────────────────────────────────────
  const basicRes = await getAStockBasicAll().catch(e => ({ ok: false as const, error: String(e), records: [] as never[] }));
  if (!basicRes.ok || !basicRes.records.length) {
    return NextResponse.json({
      ok:    false,
      error: `获取 A 股股票列表失败：${(basicRes as { error?: string }).error ?? "Tushare 连接失败"}`,
    }, { status: 500 });
  }

  const totalAStock = basicRes.records.length;

  // ── 2. 快速过滤（退市/停牌/ST） ──────────────────────────────────────────
  const activeStocks = basicRes.records.filter(r => {
    const qr = bomQuickFilter({
      name:       String(r.name ?? ""),
      listStatus: String(r.list_status ?? "L"),
    });
    return qr.passed;
  });

  // ── 3. 构建股票信息列表 ───────────────────────────────────────────────────
  const stockList = activeStocks.map(r => ({
    tsCode:   String(r.ts_code ?? ""),
    symbol:   String(r.symbol  ?? ""),
    name:     String(r.name    ?? ""),
    industry: String(r.industry ?? ""),
    area:     String(r.area    ?? ""),
    market:   String(r.market  ?? ""),
  }));

  // ── 4. BOM 关键词扫描（无财务数据，纯规则） ───────────────────────────────
  const candidates = scanBomCandidates(stockList, industry, minScore);

  // ── 5. 构造精简返回结构 ───────────────────────────────────────────────────
  const results = candidates.slice(0, 200).map(p => ({
    tsCode:           p.tsCode,
    symbol:           p.symbol,
    name:             p.name,
    industry:         p.industry,
    industryMatch:    p.industryMatch,
    bomModule:        p.primaryModule?.moduleName ?? "",
    roleInSupplyChain: p.primaryModule?.roleInSupplyChain ?? "",
    costRatioRange:   p.primaryModule?.costRatioRange ?? "",
    technicalBarrier: p.primaryModule?.technicalBarrier ?? "",
    localizationSpace: p.primaryModule?.localizationSpace ?? "",
    matchScore:       p.primaryModule?.matchScore ?? 0,
    matchedKeywords:  p.primaryModule?.matchedKeywords ?? [],
    bomScore:         p.bomScore,
    bomRating:        p.bomRating,
    scoreBreakdown:   p.scoreBreakdown,
    strengths:        p.strengths,
    risks:            p.risks,
    opportunities:    p.opportunities,
    dataSource:       p.dataSource,
    disclaimer:       p.disclaimer,
  }));

  return NextResponse.json({
    ok:              true,
    industry,
    totalAStock,
    activeCount:     stockList.length,
    matchedCount:    candidates.length,
    returnCount:     results.length,
    minScore,
    results,
    scannedAt:       new Date().toISOString(),
    disclaimer:      "BOM 策略扫描结果为规则匹配（关键词+行业分类），非具体供应商关系，需人工复核，不构成投资建议",
    dataNote:        "当前版本未获取个股财务数据，BOM评分主要基于模块属性和关键词匹配，建议结合单只分析获取完整财务数据",
  });
}
