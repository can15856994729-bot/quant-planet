/**
 * GET /api/tushare/financial-report?tsCode=xxx[&years=4]
 *
 * 聚合获取上市公司完整财报数据（利润表 + 资产负债表 + 现金流量表 + 财务指标 + 最新估值），
 * 并服务端计算综合财务评分（0-100 分）和风险提示。
 *
 * 设计原则：
 *  - 各子接口独立容错，权限不足时返回空数组 + 对应 status
 *  - 区分"数据为零"与"数据不可用（null）"
 *  - 评分仅在有足够数据时计算；无数据时返回 null
 *  - 不含任何 mock 数据
 *
 * 缓存：HTTP Cache-Control 24h（服务端内存缓存 7d 由子函数管理）
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getFinancialReport,
  hasTushareToken,
  daysAgoStr,
  todayStr,
  type TushareRecord,
} from "@/lib/tushareService";

export const dynamic = "force-dynamic";

// ── 公共类型 ──────────────────────────────────────────────────────────
type SubStatus = "ok" | "permission_denied" | "error" | "empty";

export interface FinancialScoreBreakdown {
  total:         number;  // 0-100
  profitability: number;  // 0-25
  growth:        number;  // 0-25
  cashFlow:      number;  // 0-20
  safety:        number;  // 0-20
  valuation:     number;  // 0-10
  label:         string;  // "优秀" | "良好" | "一般" | "偏弱" | "较差"
}

export interface FinancialReportResponse {
  ok:              boolean;
  tsCode:          string;
  startDate:       string;
  endDate:         string;
  income:          TushareRecord[];
  balanceSheet:    TushareRecord[];
  cashFlow:        TushareRecord[];
  finaIndicator:   TushareRecord[];
  latestValuation: TushareRecord | null;
  score:           FinancialScoreBreakdown | null;
  permissions:     Record<string, SubStatus>;
  riskWarnings:    string[];
  updatedAt:       string;
}

// ── 辅助：按 end_date 降序去重 ─────────────────────────────────────
function dedupeDesc(records: TushareRecord[]): TushareRecord[] {
  const sorted = [...records].sort((a, b) => {
    const annA = String(a.ann_date ?? a.end_date ?? "");
    const annB = String(b.ann_date ?? b.end_date ?? "");
    const annDiff = annB.localeCompare(annA);
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

// ── 辅助：安全取数值 ─────────────────────────────────────────────────
function n(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── 财务评分计算 ───────────────────────────────────────────────────────
function computeScore(
  income:        TushareRecord[],
  balanceSheet:  TushareRecord[],
  cashFlow:      TushareRecord[],
  finaIndicator: TushareRecord[],
  valuation:     TushareRecord | null,
): FinancialScoreBreakdown | null {
  if (!income.length && !finaIndicator.length) return null;

  const fi0 = finaIndicator[0];  // latest fina_indicator (desc sorted)
  const in0 = income[0];          // latest income
  const in4 = income[4] ?? income[income.length - 1] ?? null; // ~1yr ago
  const cf0 = cashFlow[0];
  const bs0 = balanceSheet[0];
  const val = valuation;

  // ── 1. 盈利能力（满分 25）────────────────────────────────────────
  let profitScore = 12.5; // neutral if no data
  if (fi0) {
    const roe  = n(fi0.roe)  ?? 0; // %
    const gm   = n(fi0.grossprofit_margin) ?? 0; // %
    const nm   = n(fi0.netprofit_margin)   ?? 0; // %
    const roeS = clamp(roe / 20 * 100, 0, 100);
    const gmS  = clamp(gm  / 40 * 100, 0, 100);
    const nmS  = clamp(nm  / 20 * 100, 0, 100);
    profitScore = (roeS * 0.5 + gmS * 0.3 + nmS * 0.2) / 100 * 25;
  }

  // ── 2. 成长性（满分 25）─────────────────────────────────────────
  let growthScore = 12.5; // neutral
  if (in0 && in4 && in4 !== in0) {
    const rev0 = n(in0.total_revenue);
    const rev4 = n(in4.total_revenue);
    const pr0  = n(in0.n_income_attr_p);
    const pr4  = n(in4.n_income_attr_p);

    const revGrowthS = (rev0 != null && rev4 != null && rev4 > 0)
      ? clamp(((rev0 - rev4) / rev4 + 0.3) / 0.5 * 100, 0, 100)
      : 50;
    const profGrowthS = (pr0 != null && pr4 != null && pr4 > 0)
      ? clamp(((pr0 - pr4) / pr4 + 0.3) / 0.5 * 100, 0, 100)
      : 50;
    growthScore = (revGrowthS * 0.5 + profGrowthS * 0.5) / 100 * 25;
  }

  // ── 3. 现金流质量（满分 20）──────────────────────────────────────
  let cashFlowScore = 10; // neutral
  if (cf0 && in0) {
    const ocf        = n(cf0.n_cashflow_act);
    const netProfit  = n(in0.n_income_attr_p);
    if (ocf != null) {
      let ocfS: number;
      if (netProfit == null || netProfit <= 0) {
        ocfS = ocf > 0 ? 70 : (ocf === 0 ? 30 : 0);
      } else {
        const ratio = ocf / netProfit;
        ocfS = ratio >= 2 ? 100 : ratio >= 1.2 ? 85 : ratio >= 0.8 ? 65 : ratio >= 0.5 ? 40 : ratio >= 0 ? 20 : 0;
      }
      cashFlowScore = ocfS / 100 * 20;
    }
  }

  // ── 4. 财务安全（满分 20）───────────────────────────────────────
  let safetyScore = 10; // neutral
  if (fi0 || bs0) {
    const dr = n(fi0?.debt_to_assets) ?? (bs0
      ? (() => {
          const liab   = n(bs0.total_liab);
          const assets = n(bs0.total_assets);
          return (liab != null && assets != null && assets > 0) ? liab / assets * 100 : null;
        })()
      : null);
    const cr = n(fi0?.current_ratio);
    const qr = n(fi0?.quick_ratio);

    const drS = dr != null ? clamp((1 - dr / 80) * 100, 0, 100) : 50;
    const crS = cr != null ? clamp((cr / 3)     * 100, 0, 100) : 50;
    const qrS = qr != null ? clamp((qr / 1.5)   * 100, 0, 100) : 50;
    safetyScore = (drS * 0.5 + crS * 0.3 + qrS * 0.2) / 100 * 20;
  }

  // ── 5. 估值（满分 10）───────────────────────────────────────────
  let valuationScore = 5; // neutral
  if (val) {
    const pe = n(val.pe_ttm);
    if (pe != null && pe > 0) {
      const peS = pe < 8 ? 80 : pe <= 20 ? 95 : pe <= 30 ? 78 : pe <= 50 ? 55 : pe <= 80 ? 30 : 10;
      valuationScore = peS / 100 * 10;
    }
  }

  const total = Math.round(profitScore + growthScore + cashFlowScore + safetyScore + valuationScore);
  const clamped = clamp(total, 0, 100);

  const label = clamped >= 88 ? "优秀" : clamped >= 70 ? "良好" : clamped >= 52 ? "一般" : clamped >= 35 ? "偏弱" : "较差";

  return {
    total:         clamped,
    profitability: Math.round(profitScore),
    growth:        Math.round(growthScore),
    cashFlow:      Math.round(cashFlowScore),
    safety:        Math.round(safetyScore),
    valuation:     Math.round(valuationScore),
    label,
  };
}

// ── 风险提示生成 ──────────────────────────────────────────────────────
function generateRiskWarnings(
  income:        TushareRecord[],
  balanceSheet:  TushareRecord[],
  cashFlow:      TushareRecord[],
  finaIndicator: TushareRecord[],
  valuation:     TushareRecord | null,
): string[] {
  const warnings: string[] = [];
  const in0 = income[0];
  const in1 = income[1];
  const fi0 = finaIndicator[0];
  const fi1 = finaIndicator[1];
  const cf0 = cashFlow[0];
  const val = valuation;

  // 净利润为负（亏损）
  const np = n(in0?.n_income_attr_p);
  if (np != null && np < 0) {
    warnings.push(`⚠️ 最近报告期归母净利润为负（亏损 ${fmtMoney(np)} 元），需关注盈利能力修复进展`);
  }

  // ROE 偏低
  const roe = n(fi0?.roe);
  if (roe != null && roe < 5 && roe >= 0) {
    warnings.push(`⚠️ 净资产收益率（ROE）仅 ${roe.toFixed(1)}%，低于5%，创利能力较弱`);
  }

  // 资产负债率较高
  const dr = n(fi0?.debt_to_assets);
  if (dr != null && dr > 65) {
    warnings.push(`⚠️ 资产负债率 ${dr.toFixed(1)}%，偏高，需关注偿债压力`);
  }

  // 流动比率不足
  const cr = n(fi0?.current_ratio);
  if (cr != null && cr < 1) {
    warnings.push(`⚠️ 流动比率 ${cr.toFixed(2)}x 低于 1，短期偿债能力存在压力`);
  }

  // 经营现金流为负
  const ocf = n(cf0?.n_cashflow_act);
  if (ocf != null && ocf < 0) {
    warnings.push(`⚠️ 最近报告期经营活动净现金流为负（${fmtMoney(ocf)} 元），业务造血能力不足`);
  }

  // 营收同比下滑
  const rev0 = n(in0?.total_revenue);
  const rev1 = n(in1?.total_revenue);
  if (rev0 != null && rev1 != null && rev1 > 0 && (rev0 - rev1) / rev1 < -0.10) {
    const decline = ((rev0 - rev1) / rev1 * 100).toFixed(1);
    warnings.push(`⚠️ 营业总收入同比下滑 ${Math.abs(Number(decline)).toFixed(1)}%，需关注业务缩减风险`);
  }

  // 毛利率下降
  const gm0 = n(fi0?.grossprofit_margin);
  const gm1 = n(fi1?.grossprofit_margin);
  if (gm0 != null && gm1 != null && gm0 < gm1 - 3) {
    warnings.push(`⚠️ 毛利率从 ${gm1.toFixed(1)}% 下降至 ${gm0.toFixed(1)}%，盈利能力承压`);
  }

  // 估值偏高
  const pe = n(val?.pe_ttm);
  if (pe != null && pe > 80) {
    warnings.push(`⚠️ 当前 PE(TTM) ${pe.toFixed(0)}x，估值偏高，注意回调风险`);
  }

  // 数据不足时添加提示
  if (!income.length && !finaIndicator.length) {
    warnings.push("ℹ️ 财报数据暂缺（可能权限不足或该股票尚未有完整财报记录）");
  }

  return warnings;
}

function fmtMoney(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} 万亿`;
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(0)} 万`;
  return `${sign}${abs.toFixed(0)}`;
}

// ── GET handler ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json({
      ok: false,
      error: "TUSHARE_TOKEN 未配置，无法获取财报数据",
      income: [], balanceSheet: [], cashFlow: [], finaIndicator: [],
      latestValuation: null, score: null, permissions: {},
      riskWarnings: [], updatedAt: new Date().toISOString(),
    });
  }

  const tsCode = req.nextUrl.searchParams.get("tsCode") ?? "";
  const years  = Math.min(Math.max(Number(req.nextUrl.searchParams.get("years") ?? "4"), 1), 6);

  if (!tsCode) {
    return NextResponse.json(
      { ok: false, error: "缺少必填参数：tsCode" },
      { status: 400 },
    );
  }

  const startDate = daysAgoStr(years * 365);
  const endDate   = todayStr();

  // 并行拉取所有数据
  const raw = await getFinancialReport(tsCode, startDate, endDate);

  // 去重 & 降序
  const income        = dedupeDesc(raw.income.records);
  const balanceSheet  = dedupeDesc(raw.balanceSheet.records);
  const cashFlow      = dedupeDesc(raw.cashFlow.records);
  const finaIndicator = dedupeDesc(raw.finaIndicator.records);
  const latestValuation = raw.latestValuation;

  // 计算评分
  const score = computeScore(income, balanceSheet, cashFlow, finaIndicator, latestValuation);

  // 生成风险提示
  const riskWarnings = generateRiskWarnings(income, balanceSheet, cashFlow, finaIndicator, latestValuation);

  const permissions: Record<string, SubStatus> = {
    income:        raw.income.status,
    balanceSheet:  raw.balanceSheet.status,
    cashFlow:      raw.cashFlow.status,
    finaIndicator: raw.finaIndicator.status,
    valuation:     raw.valuationStatus,
  };

  const resp: FinancialReportResponse = {
    ok: true,
    tsCode,
    startDate,
    endDate,
    income,
    balanceSheet,
    cashFlow,
    finaIndicator,
    latestValuation,
    score,
    permissions,
    riskWarnings,
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(resp, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  });
}
