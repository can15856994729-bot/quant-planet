/**
 * GET /api/tushare/status[?refresh=1]
 *
 * 检查 Tushare Token 配置状态，并逐一测试各接口访问权限。
 *
 * 设计原则：
 *   - 任何一个核心接口可用 → connected: true
 *   - trade_cal 没权限 ≠ Tushare 不可用
 *   - empty（返回0条数据）= API 可访问，但当前日期范围无数据，不等同于成功
 *   - 每个接口独立返回 "ok" | "permission_denied" | "error" | "empty"
 *   - 不暴露 Token 内容
 *
 * ?refresh=1  清除内存缓存，强制重新向 Tushare 发起请求
 *             用于购买积分后验证新权限
 */
import { NextRequest, NextResponse } from "next/server";
import {
  hasTushareToken,
  callTushare,
  clearTushareCache,
  daysAgoStr,
  todayStr,
} from "@/lib/tushareService";

export const dynamic = "force-dynamic";

type CapStatus = "ok" | "permission_denied" | "error" | "empty";

interface CapResult {
  status:   CapStatus;
  error?:   string;
  rowCount?: number;   // 实际返回行数
  sample?:  string;   // 首条数据摘要
}

// ── 单接口能力测试 ────────────────────────────────────────────────────
async function testCap(
  apiName: string,
  params:  Record<string, unknown>,
  fields:  string,
  ttlMs:   number = 60 * 1000,  // status 检测只缓存 1 min（积分变更后快速生效）
): Promise<CapResult> {
  const result = await callTushare(apiName, params, fields, ttlMs);

  if (!result.ok) {
    if (result.permissionDenied) return { status: "permission_denied", error: result.error };
    return { status: "error", error: result.error };
  }

  const rows = result.records.length;
  if (rows === 0) {
    return { status: "empty", rowCount: 0 };
  }

  const first  = result.records[0];
  const sample = Object.entries(first)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v}`)
    .join(" | ");

  return { status: "ok", rowCount: rows, sample };
}

// ── 并行能力检测套件 ──────────────────────────────────────────────────
async function runCapabilityChecks(): Promise<Record<string, CapResult>> {
  // 近10天窗口（宽于5天，确保包含至少1个交易日）
  const start10  = daysAgoStr(10);
  const start90  = daysAgoStr(90);   // 财务数据用近90天，确保捕获季报
  const end      = todayStr();

  const [
    stockBasic,
    daily,
    dailyBasic,
    indexDaily,
    tradeCal,
    income,
    balancesheet,
    cashflow,
    finaIndicator,
  ] = await Promise.all([
    // stock_basic：SSE 上市股票，只要几条验证权限即可
    testCap("stock_basic",
      { list_status: "L", exchange: "SSE" },
      "ts_code,symbol,name"),

    // daily：贵州茅台近10天
    testCap("daily",
      { ts_code: "600519.SH", start_date: start10, end_date: end },
      "trade_date,open,high,low,close,vol"),

    // daily_basic：贵州茅台近10天
    testCap("daily_basic",
      { ts_code: "600519.SH", start_date: start10, end_date: end },
      "trade_date,pe_ttm,pb,total_mv,turnover_rate"),

    // index_daily：沪深300近10天
    testCap("index_daily",
      { ts_code: "000300.SH", start_date: start10, end_date: end },
      "trade_date,close,vol"),

    // trade_cal：近7天
    testCap("trade_cal",
      { exchange: "SSE", start_date: daysAgoStr(7), end_date: end, is_open: "1" },
      "cal_date,is_open"),

    // income：贵州茅台近90天（季报周期），测试完整盈利能力字段
    testCap("income",
      { ts_code: "600519.SH", start_date: start90, end_date: end, report_type: "1" },
      "ann_date,end_date,total_revenue,revenue,oper_cost,operate_profit,total_profit,n_income,n_income_attr_p,basic_eps"),

    // balancesheet：贵州茅台近90天，测试完整财务安全字段
    testCap("balancesheet",
      { ts_code: "600519.SH", start_date: start90, end_date: end, report_type: "1" },
      "ann_date,end_date,total_assets,total_liab,total_hldr_eqy_exc_min_int,total_hldr_eqy_inc_min_int,money_cap,total_cur_assets,total_cur_liab,accounts_receiv,inventories,goodwill,st_borr,lt_borr"),

    // cashflow：贵州茅台近90天
    testCap("cashflow",
      { ts_code: "600519.SH", start_date: start90, end_date: end, report_type: "1" },
      "end_date,n_cashflow_act"),

    // fina_indicator：贵州茅台近90天，测试完整盈利能力 + 财务安全字段
    testCap("fina_indicator",
      { ts_code: "600519.SH", start_date: start90, end_date: end },
      "ann_date,end_date,eps,roe,grossprofit_margin,netprofit_margin,debt_to_assets,current_ratio,quick_ratio,profit_dedt,or_yoy,netprofit_yoy"),
  ]);

  return {
    stock_basic: stockBasic, daily, daily_basic: dailyBasic,
    index_daily: indexDaily, trade_cal: tradeCal,
    income, balancesheet, cashflow, fina_indicator: finaIndicator,
  };
}

// ── 能力状态 → UI 文字 ────────────────────────────────────────────────
function capLabel(cap: CapResult, name: string): string {
  switch (cap.status) {
    case "ok":                return `${name} ✅ 可用（${cap.rowCount} 条）`;
    case "empty":             return `${name} ⚠️ API可达但期间无数据`;
    case "permission_denied": return `${name} ❌ 权限不足`;
    case "error":             return `${name} ❌ 接口错误：${cap.error?.slice(0, 50)}`;
  }
}

// ── GET handler ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const now     = new Date().toISOString();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1"
                  || req.nextUrl.searchParams.get("refresh") === "true";

  if (!hasTushareToken()) {
    return NextResponse.json({
      ok:              false,
      tokenConfigured: false,
      connected:       false,
      message:         "TUSHARE_TOKEN 未配置，请在 Vercel 环境变量中配置",
      checkedAt:       now,
    });
  }

  // 购买积分后强制清除旧缓存
  if (refresh) clearTushareCache();

  // 并行检测
  const caps = await runCapabilityChecks();

  // ── 决定整体 connected 状态 ──────────────────────────────────────
  // 核心接口：stock_basic / daily / index_daily 任一 ok → connected
  const coreCaps = [caps.stock_basic, caps.daily, caps.index_daily];
  const connected = coreCaps.some(c => c.status === "ok");

  // ── 推断各功能可用性 ─────────────────────────────────────────────
  const stockPoolOk      = caps.stock_basic.status === "ok";
  const klineOk          = caps.daily.status === "ok";
  const valuationOk      = caps.daily_basic.status === "ok";
  const indexOk          = caps.index_daily.status === "ok";
  const tradeCalOk       = caps.trade_cal.status === "ok";
  const incomeOk         = caps.income.status === "ok" || caps.income.status === "empty";
  const balancesheetOk   = caps.balancesheet.status === "ok" || caps.balancesheet.status === "empty";
  const cashflowOk       = caps.cashflow.status === "ok" || caps.cashflow.status === "empty";
  const finaIndicatorOk  = caps.fina_indicator.status === "ok" || caps.fina_indicator.status === "empty";
  const financialsOk     = incomeOk && balancesheetOk && cashflowOk;
  const backtestOk       = klineOk;

  // ── 状态摘要文字 ──────────────────────────────────────────────────
  function finLabel(cap: CapResult, name: string): string {
    if (cap.status === "ok")                return `${name} ✅ 可用（${cap.rowCount} 条）`;
    if (cap.status === "empty")             return `${name} ⚠️ API可达，近90天无新季报（正常）`;
    if (cap.status === "permission_denied") return `${name} ❌ 权限不足`;
    return `${name} ❌ 错误：${cap.error?.slice(0, 40)}`;
  }

  const statusSummary = [
    capLabel(caps.stock_basic,    "A股股票池(stock_basic)"),
    capLabel(caps.daily,          "历史K线(daily)"),
    capLabel(caps.daily_basic,    "估值数据(daily_basic)"),
    capLabel(caps.index_daily,    "指数日线(index_daily)"),
    capLabel(caps.trade_cal,      "交易日历(trade_cal)"),
    finLabel(caps.income,         "利润表(income)"),
    finLabel(caps.balancesheet,   "资产负债表(balancesheet)"),
    finLabel(caps.cashflow,       "现金流量表(cashflow)"),
    finLabel(caps.fina_indicator, "财务指标(fina_indicator)"),
  ];

  // 盈利能力接口专项说明（供盈利能力模块诊断用）
  const profitabilityDetail = {
    testStock:       "600519.SH（贵州茅台）",
    income: {
      status:     caps.income.status,
      rowCount:   caps.income.rowCount ?? 0,
      testedFields: "revenue,oper_cost,operate_profit,total_profit,n_income,n_income_attr_p,basic_eps",
      available:  incomeOk,
    },
    fina_indicator: {
      status:     caps.fina_indicator.status,
      rowCount:   caps.fina_indicator.rowCount ?? 0,
      testedFields: "eps,roe,grossprofit_margin,netprofit_margin,profit_dedt,or_yoy,netprofit_yoy",
      available:  finaIndicatorOk,
    },
    profitSummaryApi: "/api/tushare/profit-summary?tsCode=600519.SH",
    note: incomeOk && finaIndicatorOk
      ? "利润表 + 财务指标均可用，盈利能力模块正常"
      : incomeOk
      ? "利润表可用，但财务指标不可用（毛利率/净利率/扣非/YoY 数据可能缺失）"
      : "利润表不可用，盈利能力模块将显示权限不足提示",
  };

  // 财务安全接口专项说明（供财务安全模块诊断用）
  const financialSafetyDetail = {
    testStock: "600519.SH（贵州茅台）",
    balancesheet: {
      status:       caps.balancesheet.status,
      rowCount:     caps.balancesheet.rowCount ?? 0,
      testedFields: "total_assets,total_liab,total_hldr_eqy_exc_min_int,total_hldr_eqy_inc_min_int,money_cap,total_cur_assets,total_cur_liab,accounts_receiv,inventories,goodwill,st_borr,lt_borr",
      available:    balancesheetOk,
    },
    fina_indicator: {
      status:       caps.fina_indicator.status,
      rowCount:     caps.fina_indicator.rowCount ?? 0,
      testedFields: "debt_to_assets,current_ratio,quick_ratio",
      available:    finaIndicatorOk,
    },
    income: {
      status:       caps.income.status,
      rowCount:     caps.income.rowCount ?? 0,
      testedFields: "revenue（用于计算应收占比/存货占比）",
      available:    incomeOk,
    },
    financialSafetyApi: "/api/tushare/financial-safety?tsCode=600519.SH",
    note: balancesheetOk
      ? finaIndicatorOk
        ? "资产负债表 + 财务指标均可用，财务安全模块正常"
        : "资产负债表可用，但 fina_indicator 不可用（流动/速动比率将降级为自行计算）"
      : "资产负债表不可用，财务安全模块将显示权限不足提示",
  };

  // ── 功能可用性说明 ────────────────────────────────────────────────
  const featureSummary = {
    stock_pool:       stockPoolOk     ? "✅ 沪深北全量股票池（Tushare）"      : "⚠️ 降级为东方财富+本地股票池",
    historical_kline: klineOk         ? "✅ 历史K线（Tushare前复权）"          : "⚠️ 降级为东方财富K线",
    valuation:        valuationOk     ? "✅ PE/PB/市值/换手率（Tushare）"      : "⚠️ 降级为东方财富实时报价PE/PB",
    market_timing:    indexOk         ? "✅ 指数日线择时（Tushare）"            : "⚠️ 降级为东方财富指数K线",
    trade_cal:        tradeCalOk      ? "✅ 交易日历"                           : "⚠️ 降级为K线日期推导",
    backtest:         backtestOk      ? "✅ 真实历史回测可用"                   : "❌ Tushare daily 权限不足，回测锁定",
    fundamentals:     financialsOk    ? "✅ 财报三表+财务指标可用（股票详情页）" : incomeOk ? "⚠️ 部分财报数据可用" : "❌ 财务数据权限不足",
    fina_indicator:   finaIndicatorOk ? "✅ ROE/毛利率/资负率/流速比可用"        : "❌ 财务指标权限不足（fina_indicator）",
    financial_safety: balancesheetOk  ? "✅ 财务安全模块可用（资负率/流动比/速动比/商誉/应收/存货）" : "❌ 资产负债表权限不足（balancesheet），财务安全模块不可用",
    realtime:         "✅ 始终使用东方财富实时行情（不依赖Tushare）",
    sim_trading:      "✅ 模拟盘不依赖Tushare，始终可用",
  };

  const hasPermIssues = Object.values(caps).some(c => c.status === "permission_denied");
  const message = !connected
    ? "Tushare Token 有效，但核心接口均无权限（daily/stock_basic/index_daily）。请检查积分是否已到账（通常需5-30分钟生效）。"
    : hasPermIssues
    ? "Tushare 已连接，部分接口权限不足"
    : "Tushare 已连接，所有接口正常";

  // capabilities 简化版（不含 sample，供前端消费）
  const capabilities: Record<string, { status: CapStatus; rowCount?: number; error?: string }> = {};
  for (const [k, v] of Object.entries(caps)) {
    capabilities[k] = {
      status:   v.status,
      rowCount: v.rowCount,
      ...(v.error ? { error: v.error } : {}),
    };
  }

  return NextResponse.json({
    ok:              connected,
    tokenConfigured: true,
    connected,
    refreshed:       refresh,
    message,
    capabilities,
    featureSummary,
    statusSummary,
    profitabilityDetail,
    financialSafetyDetail,
    hint: !connected
      ? "购买积分后请访问 /api/tushare/status?refresh=1 清除旧缓存重新检测"
      : undefined,
    checkedAt: now,
  });
}
