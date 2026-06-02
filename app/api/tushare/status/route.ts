/**
 * GET /api/tushare/status[?refresh=1]
 *
 * 检查 Tushare Token 配置状态，并逐一测试各接口访问权限。
 * 支持检测 5000积分 VIP 接口（income_vip / balancesheet_vip / cashflow_vip / fina_indicator_vip）。
 *
 * 响应包含：
 *   - ok, tokenConfigured, connected
 *   - estimatedPoints, level（基于可用接口推断）
 *   - capabilities（所有接口状态）
 *   - vipCapabilities（VIP接口状态）
 *   - frequency（频次限制说明）
 *   - featureSummary, statusSummary, checkedAt
 *
 * ?refresh=1  清除内存缓存，强制重新检测（购买积分后使用）
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
  rowCount?: number;
  sample?:  string;
}

// ── 单接口能力测试 ─────────────────────────────────────────────────────
async function testCap(
  apiName: string,
  params:  Record<string, unknown>,
  fields:  string,
  ttlMs    = 60 * 1000,
): Promise<CapResult> {
  const result = await callTushare(apiName, params, fields, ttlMs);

  if (!result.ok) {
    if (result.permissionDenied) return { status: "permission_denied", error: result.error };
    return { status: "error", error: result.error };
  }

  const rows = result.records.length;
  if (rows === 0) return { status: "empty", rowCount: 0 };

  const first  = result.records[0];
  const sample = Object.entries(first).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(" | ");
  return { status: "ok", rowCount: rows, sample };
}

// ── 推断积分等级 ──────────────────────────────────────────────────────
function estimatePoints(
  caps:    Record<string, CapResult>,
  vipCaps: Record<string, CapResult>,
): { estimatedPoints: number; level: string; confidence: string } {
  const vipOk = Object.values(vipCaps).some(c => c.status === "ok" || c.status === "empty");
  const stdOk = caps.daily_basic?.status === "ok";
  const dailyOk = caps.daily?.status === "ok";
  const incomeOk = caps.income?.status === "ok" || caps.income?.status === "empty";
  const basicOk = caps.stock_basic?.status === "ok";

  if (vipOk)    return { estimatedPoints: 5000, level: "5000积分", confidence: "VIP接口可用，积分≥5000已确认" };
  if (incomeOk) return { estimatedPoints: 2000, level: "2000积分+", confidence: "财报接口可用，积分约2000-5000" };
  if (stdOk)    return { estimatedPoints: 2000, level: "2000积分+", confidence: "daily_basic可用，积分约2000+" };
  if (dailyOk)  return { estimatedPoints: 200,  level: "200积分+", confidence: "daily可用，积分约200+" };
  if (basicOk)  return { estimatedPoints: 120,  level: "120积分+", confidence: "stock_basic可用，积分约120+" };
  return        { estimatedPoints: 0, level: "未知", confidence: "无可用接口" };
}

// ── 并行能力检测 ──────────────────────────────────────────────────────
async function runChecks(): Promise<{
  caps:    Record<string, CapResult>;
  vipCaps: Record<string, CapResult>;
}> {
  const start10  = daysAgoStr(10);
  const start90  = daysAgoStr(90);
  const end      = todayStr();

  // 基础接口（并行）
  const [
    stockBasic, daily, dailyBasic, indexDaily, tradeCal,
    income, balancesheet, cashflow, finaIndicator,
    forecast, finaDiv,
  ] = await Promise.all([
    testCap("stock_basic",   { list_status: "L", exchange: "SSE" }, "ts_code,symbol,name"),
    testCap("daily",         { ts_code: "600519.SH", start_date: start10, end_date: end }, "trade_date,open,high,low,close,vol"),
    testCap("daily_basic",   { ts_code: "600519.SH", start_date: start10, end_date: end }, "trade_date,pe,pe_ttm,pb,ps,ps_ttm,total_mv,circ_mv,turnover_rate,turnover_rate_f,volume_ratio,dv_ratio,dv_ttm"),
    testCap("index_daily",   { ts_code: "000300.SH", start_date: start10, end_date: end }, "trade_date,close,vol"),
    testCap("trade_cal",     { exchange: "SSE", start_date: daysAgoStr(7), end_date: end, is_open: "1" }, "cal_date,is_open"),
    testCap("income",        { ts_code: "600519.SH", start_date: start90, end_date: end, report_type: "1" }, "ann_date,end_date,total_revenue,n_income"),
    testCap("balancesheet",  { ts_code: "600519.SH", start_date: start90, end_date: end, report_type: "1" }, "ann_date,end_date,total_assets,total_liab"),
    testCap("cashflow",      { ts_code: "600519.SH", start_date: start90, end_date: end, report_type: "1" }, "ann_date,end_date,n_cashflow_act"),
    testCap("fina_indicator",{ ts_code: "600519.SH", start_date: start90, end_date: end }, "ann_date,end_date,roe,grossprofit_margin,netprofit_margin"),
    testCap("forecast",      { ts_code: "600519.SH", start_date: start90, end_date: end }, "ann_date,end_date,type,p_change_min,p_change_max"),
    testCap("fina_div",      { ts_code: "600519.SH", start_date: daysAgoStr(365), end_date: end }, "ts_code,ann_date,end_date,cash_div"),
  ]);

  const caps: Record<string, CapResult> = {
    stock_basic: stockBasic, daily, daily_basic: dailyBasic,
    index_daily: indexDaily, trade_cal: tradeCal,
    income, balancesheet, cashflow, fina_indicator: finaIndicator,
    forecast, fina_div: finaDiv,
  };

  // VIP 接口（只在基础接口 OK 时才测，节省时间）
  const shouldTestVip = daily.status === "ok" || income.status === "ok" || income.status === "empty";

  const [incomeVip, balancesheetVip, cashflowVip, finaIndicatorVip] = shouldTestVip
    ? await Promise.all([
        testCap("income_vip",         { ts_code: "600519.SH", start_date: start90, end_date: end, report_type: "1" }, "ann_date,end_date,total_revenue,n_income"),
        testCap("balancesheet_vip",   { ts_code: "600519.SH", start_date: start90, end_date: end, report_type: "1" }, "ann_date,end_date,total_assets,total_liab"),
        testCap("cashflow_vip",       { ts_code: "600519.SH", start_date: start90, end_date: end, report_type: "1" }, "ann_date,end_date,n_cashflow_act"),
        testCap("fina_indicator_vip", { ts_code: "600519.SH", start_date: start90, end_date: end }, "ann_date,end_date,roe,grossprofit_margin"),
      ])
    : [
        { status: "permission_denied" as const, error: "基础接口不可用，跳过VIP检测" },
        { status: "permission_denied" as const, error: "基础接口不可用，跳过VIP检测" },
        { status: "permission_denied" as const, error: "基础接口不可用，跳过VIP检测" },
        { status: "permission_denied" as const, error: "基础接口不可用，跳过VIP检测" },
      ];

  const vipCaps: Record<string, CapResult> = {
    income_vip: incomeVip,
    balancesheet_vip: balancesheetVip,
    cashflow_vip: cashflowVip,
    fina_indicator_vip: finaIndicatorVip,
  };

  return { caps, vipCaps };
}

// ── 能力状态 → 标签文字 ──────────────────────────────────────────────
function capLabel(cap: CapResult, name: string): string {
  switch (cap.status) {
    case "ok":                return `${name} ✅ 可用（${cap.rowCount} 条）`;
    case "empty":             return `${name} ⚠️ API可达但期间无数据`;
    case "permission_denied": return `${name} ❌ 权限不足`;
    case "error":             return `${name} ❌ 错误：${cap.error?.slice(0, 50)}`;
  }
}
function finLabel(cap: CapResult, name: string): string {
  if (cap.status === "ok")                return `${name} ✅ 可用（${cap.rowCount} 条）`;
  if (cap.status === "empty")             return `${name} ⚠️ API可达，近90天无新季报（正常）`;
  if (cap.status === "permission_denied") return `${name} ❌ 权限不足`;
  return `${name} ❌ 错误：${cap.error?.slice(0, 40)}`;
}

// ── GET handler ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const now     = new Date().toISOString();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1"
               || req.nextUrl.searchParams.get("refresh") === "true";

  if (!hasTushareToken()) {
    return NextResponse.json({
      ok: false, tokenConfigured: false, connected: false,
      estimatedPoints: 0, level: "未配置",
      message: "TUSHARE_TOKEN 未配置，请在 Vercel 环境变量中配置",
      checkedAt: now,
    });
  }

  if (refresh) clearTushareCache();

  const { caps, vipCaps } = await runChecks();

  // 整体连通性
  const coreCaps = [caps.stock_basic, caps.daily, caps.index_daily];
  const connected = coreCaps.some(c => c.status === "ok");

  // 推断积分等级
  const pointsInfo = estimatePoints(caps, vipCaps);

  // 功能可用性
  const stockPoolOk      = caps.stock_basic.status === "ok";
  const klineOk          = caps.daily.status === "ok";
  const valuationOk      = caps.daily_basic.status === "ok";
  const indexOk          = caps.index_daily.status === "ok";
  const incomeOk         = caps.income.status === "ok" || caps.income.status === "empty";
  const balancesheetOk   = caps.balancesheet.status === "ok" || caps.balancesheet.status === "empty";
  const cashflowOk       = caps.cashflow.status === "ok" || caps.cashflow.status === "empty";
  const finaIndicatorOk  = caps.fina_indicator.status === "ok" || caps.fina_indicator.status === "empty";
  const financialsOk     = incomeOk && balancesheetOk && cashflowOk;
  const vipIncomeOk      = vipCaps.income_vip.status === "ok" || vipCaps.income_vip.status === "empty";
  const vipBsOk          = vipCaps.balancesheet_vip.status === "ok" || vipCaps.balancesheet_vip.status === "empty";
  const vipCfOk          = vipCaps.cashflow_vip.status === "ok" || vipCaps.cashflow_vip.status === "empty";
  const vipFiOk          = vipCaps.fina_indicator_vip.status === "ok" || vipCaps.fina_indicator_vip.status === "empty";
  const hasVip           = vipIncomeOk || vipBsOk || vipCfOk || vipFiOk;
  const batchScanSupport = stockPoolOk && klineOk && valuationOk;

  // 频次限制（5000积分参考值）
  const frequency = {
    perMinuteLimit:  500,
    dailyLimit:      10000,
    batchSupported:  batchScanSupport,
    note:            hasVip
      ? "5000积分：每分钟约500次，VIP接口无额外限制"
      : "标准接口：每分钟约200-500次，建议批量扫描时 batchDelay >= 800ms",
  };

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
    finLabel(caps.forecast,       "业绩预告(forecast)"),
    finLabel(caps.fina_div,       "分红数据(fina_div)"),
    // VIP
    finLabel(vipCaps.income_vip,         "VIP利润表(income_vip)"),
    finLabel(vipCaps.balancesheet_vip,   "VIP资产负债表(balancesheet_vip)"),
    finLabel(vipCaps.cashflow_vip,       "VIP现金流量表(cashflow_vip)"),
    finLabel(vipCaps.fina_indicator_vip, "VIP财务指标(fina_indicator_vip)"),
  ];

  const featureSummary = {
    stock_pool:         stockPoolOk     ? "✅ A股全量股票池" : "❌ 权限不足",
    historical_kline:   klineOk         ? "✅ 历史K线（全市场扫描可用）" : "❌ K线权限不足",
    daily_basic_bulk:   valuationOk     ? "✅ 按日期批量获取全市场估值/成交（scan预筛关键）" : "❌ daily_basic权限不足",
    full_market_scan:   batchScanSupport ? `✅ 支持全市场扫描（${pointsInfo.level}，每批10只）` : "⚠️ 部分接口缺失，扫描功能受限",
    financial_reports:  financialsOk    ? "✅ 财报三表可用" : incomeOk ? "⚠️ 部分财报可用" : "❌ 财报权限不足",
    vip_financial:      hasVip          ? "✅ VIP财报接口可用（5000积分特权）" : "❌ VIP接口不可用（需5000积分）",
    forecast:           (caps.forecast.status === "ok" || caps.forecast.status === "empty") ? "✅ 业绩预告可用" : "❌ 业绩预告不可用",
    dividend:           (caps.fina_div.status === "ok" || caps.fina_div.status === "empty") ? "✅ 分红数据可用" : "❌ 分红数据不可用",
    backtest:           klineOk         ? "✅ 历史回测可用" : "❌ K线不可用，回测锁定",
    valuation:          valuationOk     ? "✅ PE/PB/市值/换手率可用" : "❌ 估值数据不可用",
    realtime:           "✅ 东方财富实时行情（不依赖Tushare）",
  };

  const message = !connected
    ? "Tushare Token 有效，但核心接口均无权限。请检查积分是否到账（5-30分钟生效）。"
    : hasVip
    ? `Tushare 已连接 · ${pointsInfo.level} · VIP接口可用 · 支持全市场扫描`
    : financialsOk
    ? `Tushare 已连接 · ${pointsInfo.level} · 财报可用 · 支持全市场扫描`
    : `Tushare 已连接 · ${pointsInfo.level}`;

  // capabilities 简化版
  const capabilities: Record<string, { status: CapStatus; rowCount?: number; error?: string }> = {};
  for (const [k, v] of Object.entries(caps)) {
    capabilities[k] = { status: v.status, rowCount: v.rowCount, ...(v.error ? { error: v.error } : {}) };
  }
  const vipCapabilities: Record<string, { status: CapStatus; rowCount?: number; error?: string }> = {};
  for (const [k, v] of Object.entries(vipCaps)) {
    vipCapabilities[k] = { status: v.status, rowCount: v.rowCount, ...(v.error ? { error: v.error } : {}) };
  }

  return NextResponse.json({
    ok:              connected,
    tokenConfigured: true,
    connected,
    refreshed:       refresh,
    // 积分等级
    estimatedPoints: pointsInfo.estimatedPoints,
    points:          pointsInfo.estimatedPoints,
    level:           pointsInfo.level,
    pointsConfidence: pointsInfo.confidence,
    // 功能状态
    message,
    capabilities,
    vipCapabilities,
    featureSummary,
    statusSummary,
    frequency,
    // 扫描相关
    scanSupport: {
      fullMarketScan:    batchScanSupport,
      stockCount:        stockPoolOk ? "5000+" : "未知",
      recommendedBatch:  10,
      recommendedDelay:  800,
      preFilterSupport:  valuationOk,
      preFilterDesc:     valuationOk
        ? "✅ 可用 daily_basic 按日期批量预筛，将全市场5000+只压缩至约2000只高流动性股票"
        : "❌ daily_basic不可用，无法做批量预筛",
    },
    hint: !connected
      ? "购买积分后请访问 /api/tushare/status?refresh=1 清除旧缓存重新检测"
      : refresh
      ? "已强制刷新缓存，当前为最新权限状态"
      : undefined,
    checkedAt: now,
  });
}
