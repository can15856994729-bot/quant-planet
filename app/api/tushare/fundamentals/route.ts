/**
 * GET /api/tushare/fundamentals
 *
 * 获取个股财务三表数据（利润表/资产负债表/现金流量表）。
 * 用于多因子策略质量因子：ROE / 净利增长率 / 经营现金流 / 资产负债率。
 *
 * Query params:
 *   tsCode     必填，如 "600519.SH"
 *   startDate  可选，YYYYMMDD，默认 2 年前
 *   endDate    可选，YYYYMMDD，默认今天
 *
 * 缓存：7 天（财务数据按季度更新）。
 * 若权限不足（需要 Tushare 2000积分+），返回明确错误。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getIncome,
  getBalanceSheet,
  getCashflow,
  hasTushareToken,
  daysAgoStr,
  todayStr,
} from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export interface FundamentalsRecord {
  endDate:            string;   // 报告期 "20231231"
  netIncome:          number | null;  // 归母净利润 (万元)
  netIncomeGrowth:    number | null;  // 净利增长率 %（需前期数据计算）
  totalRevenue:       number | null;  // 营业总收入
  totalAssets:        number | null;  // 总资产
  totalLiab:          number | null;  // 总负债
  equity:             number | null;  // 归母所有者权益
  roe:                number | null;  // ROE %（净利/权益）
  debtRatio:          number | null;  // 资产负债率 %
  operatingCashFlow:  number | null;  // 经营活动净现金流
  source:             "tushare";
}

export async function GET(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      {
        ok: false,
        error: "TUSHARE_TOKEN 未配置",
        tokenMissing: true,
        note:  "质量因子数据不足：需要配置 Tushare Token",
        records: [],
      },
      { status: 200 },
    );
  }

  const { searchParams } = new URL(req.url);
  const tsCode    = searchParams.get("tsCode")    ?? "";
  const startDate = searchParams.get("startDate") ?? daysAgoStr(730); // 2年
  const endDate   = searchParams.get("endDate")   ?? todayStr();

  if (!tsCode) {
    return NextResponse.json({ ok: false, error: "tsCode 参数必填", records: [] }, { status: 400 });
  }

  // 并发获取三表
  const [incomeRes, balRes, cfRes] = await Promise.allSettled([
    getIncome(tsCode, startDate, endDate),
    getBalanceSheet(tsCode, startDate, endDate),
    getCashflow(tsCode, startDate, endDate),
  ]);

  // 提取成功结果
  const incomeRecs = incomeRes.status === "fulfilled" && incomeRes.value.ok ? incomeRes.value.records : [];
  const balRecs    = balRes.status   === "fulfilled" && balRes.value.ok   ? balRes.value.records   : [];
  const cfRecs     = cfRes.status    === "fulfilled" && cfRes.value.ok    ? cfRes.value.records    : [];

  // 错误记录
  const errors: string[] = [];
  if (incomeRes.status === "fulfilled" && !incomeRes.value.ok) errors.push(`利润表: ${incomeRes.value.error}`);
  if (balRes.status   === "fulfilled" && !balRes.value.ok)   errors.push(`资产负债表: ${balRes.value.error}`);
  if (cfRes.status    === "fulfilled" && !cfRes.value.ok)    errors.push(`现金流量表: ${cfRes.value.error}`);

  // Merge by end_date
  const dates = new Set<string>([
    ...incomeRecs.map(r => String(r.end_date ?? "")),
    ...balRecs.map(r =>    String(r.end_date ?? "")),
    ...cfRecs.map(r =>     String(r.end_date ?? "")),
  ]);

  const incMap = new Map(incomeRecs.map(r => [String(r.end_date ?? ""), r]));
  const balMap = new Map(balRecs.map(r =>    [String(r.end_date ?? ""), r]));
  const cfMap  = new Map(cfRecs.map(r =>     [String(r.end_date ?? ""), r]));

  const sorted = [...dates].filter(Boolean).sort();

  const records: FundamentalsRecord[] = sorted.map(date => {
    const inc = incMap.get(date);
    const bal = balMap.get(date);
    const cf  = cfMap.get(date);

    const netIncome = inc?.n_income_attr_p != null ? Number(inc.n_income_attr_p) / 10000 : null;  // → 万元
    const equity    = bal?.total_hldr_eqy_exc_min_int != null ? Number(bal.total_hldr_eqy_exc_min_int) / 10000 : null;
    const totalAssets = bal?.total_assets != null ? Number(bal.total_assets) / 10000 : null;
    const totalLiab   = bal?.total_liab   != null ? Number(bal.total_liab)   / 10000 : null;

    const roe = (netIncome != null && equity != null && equity > 0)
      ? +(netIncome / equity * 100).toFixed(2)
      : null;
    const debtRatio = (totalLiab != null && totalAssets != null && totalAssets > 0)
      ? +(totalLiab / totalAssets * 100).toFixed(2)
      : null;
    const operatingCashFlow = cf?.n_cashflow_act != null ? Number(cf.n_cashflow_act) / 10000 : null;

    return {
      endDate:           date,
      netIncome,
      netIncomeGrowth:   null,  // 需要前后期计算，下面补充
      totalRevenue:      inc?.total_revenue != null ? Number(inc.total_revenue) / 10000 : null,
      totalAssets,
      totalLiab,
      equity,
      roe,
      debtRatio,
      operatingCashFlow,
      source:            "tushare" as const,
    };
  });

  // 计算净利增长率（同比）
  for (let i = 1; i < records.length; i++) {
    const cur  = records[i];
    const prev = records[i - 1];
    if (cur.netIncome != null && prev.netIncome != null && prev.netIncome !== 0) {
      cur.netIncomeGrowth = +((cur.netIncome - prev.netIncome) / Math.abs(prev.netIncome) * 100).toFixed(2);
    }
  }

  const hasData = records.length > 0;
  const permissionError = errors.some(e =>
    e.includes("权限") || e.includes("积分") || e.includes("permission")
  );

  return NextResponse.json(
    {
      ok:        hasData,
      tsCode,
      total:     records.length,
      records,
      errors:    errors.length ? errors : undefined,
      note:      hasData
        ? "财务数据来自 Tushare，按报告期排列"
        : permissionError
        ? "Tushare 权限不足，质量因子数据不可用（需要 2000+ 积分）"
        : "暂无财务数据",
      source:    "tushare",
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    },
  );
}
