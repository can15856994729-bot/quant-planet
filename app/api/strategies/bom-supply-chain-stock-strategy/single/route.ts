/**
 * POST /api/strategies/bom-supply-chain-stock-strategy/single
 *
 * 单只股票 BOM 策略分析
 * ────────────────────────────────────────────────────────────────────────────
 * Body: { symbol: string, industry?: string }
 *
 * 流程：
 *   1. 通过 symbol 查询 stock_basic（获取名称/行业）
 *   2. 遍历所有行业 BOM 模板，找最优匹配行业
 *   3. 拉取 daily_basic（PE/PB/换手）和 fina_indicator（ROE/毛利率/负债率等）
 *   4. 综合计算 BOM 评分
 *   5. 返回完整分析结果
 *
 * ⚠️ 映射结果为规则匹配，不代表真实供应关系，不构成投资建议。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAStockBasic,
  getDailyKLine,
  callTushare,
  hasTushareToken,
  todayStr,
  daysAgoStr,
} from "@/lib/tushareService";
import {
  getBomIndustryList,
  getBomIndustryTemplate,
} from "@/lib/bomIndustryTemplateService";
import {
  matchStockToBomModules,
  calculateBomScore,
  buildBomStockProfile,
  type FinancialMetrics,
  type StockBasicInfo,
} from "@/lib/bomStockMappingService";
import { checkBomFundamentalRisk } from "@/lib/fundamentalRiskFilter";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!hasTushareToken()) {
    return NextResponse.json({ ok: false, error: "TUSHARE_TOKEN 未配置" }, { status: 400 });
  }

  let body: { symbol?: string; industry?: string };
  try { body = await req.json(); }
  catch { body = {}; }

  const rawSymbol = (body.symbol ?? "").trim();
  if (!rawSymbol) {
    return NextResponse.json({ ok: false, error: "请提供股票代码（如 300750）" }, { status: 400 });
  }

  // ── 1. 构建 ts_code（兼容带后缀的写法） ───────────────────────────────────
  let tsCode = rawSymbol;
  if (!/\.(SH|SZ)$/i.test(rawSymbol)) {
    const num = rawSymbol.replace(/\D/g, "");
    tsCode = num.startsWith("6") ? `${num}.SH` : `${num}.SZ`;
  }

  // ── 2. 获取 stock_basic ───────────────────────────────────────────────────
  const [basicL, basicD, basicP] = await Promise.all([
    getAStockBasic("L").catch(() => ({ ok: false as const, records: [] as never[] })),
    getAStockBasic("D").catch(() => ({ ok: false as const, records: [] as never[] })),
    getAStockBasic("P").catch(() => ({ ok: false as const, records: [] as never[] })),
  ]);

  const allBasic = [
    ...(basicL.ok ? basicL.records : []),
    ...(basicD.ok ? basicD.records : []),
    ...(basicP.ok ? basicP.records : []),
  ];

  const found = allBasic.find(r =>
    String(r.ts_code) === tsCode ||
    String(r.symbol) === rawSymbol.replace(/\.(SH|SZ)$/i, "")
  );

  if (!found) {
    return NextResponse.json({
      ok:    false,
      error: `找不到股票代码 ${rawSymbol}，请确认代码正确（如 300750 或 300750.SZ）`,
    }, { status: 404 });
  }

  const stock: StockBasicInfo = {
    tsCode:   String(found.ts_code),
    symbol:   String(found.symbol),
    name:     String(found.name),
    industry: String(found.industry ?? ""),
    area:     String(found.area ?? ""),
  };

  // ── 3. 确定最优 BOM 行业匹配 ─────────────────────────────────────────────
  const targetIndustry = body.industry ?? "";
  let bestIndustry     = targetIndustry;
  let bestModules:      ReturnType<typeof matchStockToBomModules> = [];

  const industriesToCheck = targetIndustry ? [targetIndustry] : getBomIndustryList();

  for (const ind of industriesToCheck) {
    const modules = matchStockToBomModules(stock, ind);
    if (modules.length > 0 && (modules[0].matchScore > (bestModules[0]?.matchScore ?? 0))) {
      bestIndustry = ind;
      bestModules  = modules;
    }
  }

  if (bestModules.length === 0) {
    return NextResponse.json({
      ok:    false,
      error: `${stock.name}（${stock.industry}）未能匹配到任何 BOM 模块，可能不属于当前支持的 10 个行业`,
      stock,
      supportedIndustries: getBomIndustryList(),
    });
  }

  const template = getBomIndustryTemplate(bestIndustry)!;

  // ── 4. 拉取财务数据 ───────────────────────────────────────────────────────
  const [dailyBasicRes, finaIndicatorRes] = await Promise.all([
    // daily_basic：PE/PB/换手率
    callTushare(
      "daily_basic",
      { ts_code: stock.tsCode, trade_date: "" },
      "ts_code,trade_date,pe,pe_ttm,pb,ps_ttm,turnover_rate,total_mv",
      6 * 60 * 60 * 1000,
    ).catch(() => null),
    // fina_indicator：ROE/毛利率/负债率/同比
    callTushare(
      "fina_indicator",
      { ts_code: stock.tsCode },
      "ts_code,ann_date,end_date,roe,grossprofit_margin,netprofit_margin,debt_to_assets,revenue_yoy,netprofit_yoy,ocf_to_revenue,ar_to_sale,inv_to_sale,goodwill_net",
      24 * 60 * 60 * 1000,
      { limit: 8 },
    ).catch(() => null),
  ]);

  // 提取最新 daily_basic
  let fin: FinancialMetrics = {};
  if (dailyBasicRes?.ok && dailyBasicRes.records.length > 0) {
    const r = dailyBasicRes.records[0];
    fin.pe      = toNum(r.pe_ttm) ?? toNum(r.pe);
    fin.pb      = toNum(r.pb);
    fin.ps      = toNum(r.ps_ttm);
    fin.totalMv = toNum(r.total_mv);
    fin.turnoverRate = toNum(r.turnover_rate);
  }

  // 提取最新 fina_indicator（取最新一期）
  if (finaIndicatorRes?.ok && finaIndicatorRes.records.length > 0) {
    const r = finaIndicatorRes.records[0];
    fin.roe         = toNum(r.roe);
    fin.grossMargin = toNum(r.grossprofit_margin);
    fin.netMargin   = toNum(r.netprofit_margin);
    fin.debtRatio   = toNum(r.debt_to_assets);
    fin.revenueYoy  = toNum(r.revenue_yoy);
    fin.netIncYoy   = toNum(r.netprofit_yoy);
  }

  // ── 5. 计算 BOM 评分 ──────────────────────────────────────────────────────
  const { total: bomScore, breakdown } = calculateBomScore(bestModules, template, fin);
  const bomRating = bomScore >= 80 ? "优秀" : bomScore >= 60 ? "良好" : bomScore >= 40 ? "一般" : "较差";

  // ── 6. 财务风险过滤 ───────────────────────────────────────────────────────
  const riskResult = checkBomFundamentalRisk({
    pe: fin.pe, pb: fin.pb, roe: fin.roe, grossMargin: fin.grossMargin,
    netMargin: fin.netMargin, revenueYoy: fin.revenueYoy, netIncYoy: fin.netIncYoy,
    debtRatio: fin.debtRatio,
  });

  // ── 7. 汇总返回 ───────────────────────────────────────────────────────────
  const bestModule = bestModules[0];
  const modDef = template.modules.find(m => m.id === bestModule.moduleId);

  const strengths:    string[] = [];
  const risks:        string[] = [];
  const opportunities: string[] = [];

  if (modDef) {
    if (["高", "中高"].includes(modDef.technicalBarrier))  strengths.push(`技术壁垒${modDef.technicalBarrier}`);
    if (["大", "中高"].includes(modDef.localizationSpace)) opportunities.push(`国产替代空间${modDef.localizationSpace}`);
    risks.push(...modDef.risks.slice(0, 3));
    opportunities.push(...modDef.opportunities.slice(0, 2));
  }
  if (fin.roe && fin.roe > 15) strengths.push(`ROE 较高（${fin.roe.toFixed(1)}%）`);
  if (fin.grossMargin && fin.grossMargin > 30) strengths.push(`毛利率较高（${fin.grossMargin.toFixed(1)}%）`);
  risks.push(...riskResult.warnings.slice(0, 2));

  // 历史财务数据摘要
  const finaHistory = (finaIndicatorRes?.ok ? finaIndicatorRes.records : []).slice(0, 4).map(r => ({
    endDate:      String(r.end_date ?? ""),
    roe:          toNum(r.roe),
    grossMargin:  toNum(r.grossprofit_margin),
    netMargin:    toNum(r.netprofit_margin),
    debtRatio:    toNum(r.debt_to_assets),
    revenueYoy:   toNum(r.revenue_yoy),
    netIncYoy:    toNum(r.netprofit_yoy),
  }));

  return NextResponse.json({
    ok: true,
    stock: {
      tsCode:   stock.tsCode,
      symbol:   stock.symbol,
      name:     stock.name,
      industry: stock.industry,
    },
    bomAnalysis: {
      industryMatch:   bestIndustry,
      primaryModule:   bestModule,
      allModules:      bestModules,
      bomScore,
      bomRating,
      scoreBreakdown:  breakdown,
      strengths:       [...new Set(strengths)].slice(0, 5),
      risks:           [...new Set(risks)].slice(0, 5),
      opportunities:   [...new Set(opportunities)].slice(0, 4),
    },
    financials: {
      latest: fin,
      history: finaHistory,
      dataAvailable: !!dailyBasicRes?.ok || !!finaIndicatorRes?.ok,
    },
    riskFilter: {
      passed:    riskResult.passed,
      riskLevel: riskResult.riskLevel,
      riskScore: riskResult.riskScore,
      reasons:   riskResult.reasons,
      warnings:  riskResult.warnings,
    },
    investmentLogic: modDef?.investmentLogic ?? "",
    disclaimer:      "BOM 策略分析为规则匹配结果，不代表具体供应商关系，仅供研究参考，不构成投资建议",
    analyzedAt:      new Date().toISOString(),
  });
}
