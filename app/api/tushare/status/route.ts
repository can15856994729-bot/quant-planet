/**
 * GET /api/tushare/status
 *
 * 检查 Tushare Token 配置状态，并逐一测试各接口的访问权限。
 *
 * 设计原则：
 *   - 任何一个接口可用 → connected: true（而非整体失败）
 *   - trade_cal 没权限 ≠ Tushare 不可用
 *   - 每个接口单独返回 "ok" | "permission_denied" | "error" | "empty"
 *   - 不暴露 Token 内容
 */
import { NextResponse } from "next/server";
import {
  hasTushareToken,
  callTushare,
  daysAgoStr,
  todayStr,
} from "@/lib/tushareService";

export const dynamic = "force-dynamic";

type CapStatus = "ok" | "permission_denied" | "error" | "empty";

interface CapResult {
  status:  CapStatus;
  error?:  string;
  sample?: string;   // 返回的第一条数据摘要，方便验证
}

// 轻量单次测试：用很短的时间窗口 / 单只股票，减少数据量
async function testCap(
  apiName: string,
  params:  Record<string, unknown>,
  fields:  string,
): Promise<CapResult> {
  // 状态检测用 5 min 缓存，避免频繁打 Tushare
  const result = await callTushare(apiName, params, fields, 5 * 60 * 1000);
  if (result.ok) {
    const first = result.records[0];
    const sample = first
      ? Object.values(first).slice(0, 3).map(String).join(" | ")
      : undefined;
    return result.records.length === 0
      ? { status: "empty", sample: "返回0条（可能日期区间无交易日）" }
      : { status: "ok", sample };
  }
  if (result.permissionDenied) {
    return { status: "permission_denied", error: result.error };
  }
  return { status: "error", error: result.error };
}

// ── 测试套件 ──────────────────────────────────────────────────────────
async function runCapabilityChecks(): Promise<Record<string, CapResult>> {
  // 用最近 5 天窗口，数据量极小
  const start5  = daysAgoStr(5);
  const end     = todayStr();
  const start30 = daysAgoStr(30);   // 财务数据用近30天

  const [
    stockBasic,
    daily,
    dailyBasic,
    indexDaily,
    tradeCal,
    income,
  ] = await Promise.all([
    // stock_basic：获取少量样本即可（只要能调通）
    testCap("stock_basic", { list_status: "L", exchange: "SSE" }, "ts_code,symbol,name"),

    // daily：贵州茅台 最近5天
    testCap("daily", { ts_code: "600519.SH", start_date: start5, end_date: end }, "trade_date,open,close,vol"),

    // daily_basic：贵州茅台 最近5天
    testCap("daily_basic", { ts_code: "600519.SH", start_date: start5, end_date: end }, "trade_date,pe_ttm,pb,total_mv"),

    // index_daily：沪深300 最近5天
    testCap("index_daily", { ts_code: "000300.SH", start_date: start5, end_date: end }, "trade_date,close"),

    // trade_cal：近7天，成本极低（但可能没权限）
    testCap("trade_cal", { exchange: "SSE", start_date: daysAgoStr(7), end_date: end, is_open: "1" }, "cal_date,is_open"),

    // income（财务）：贵州茅台 近一年，权限需要较高积分
    testCap("income", { ts_code: "600519.SH", start_date: start30, end_date: end, report_type: "1" }, "end_date,n_income_attr_p"),
  ]);

  return { stock_basic: stockBasic, daily, daily_basic: dailyBasic, index_daily: indexDaily, trade_cal: tradeCal, fundamentals: income };
}

// ── GET handler ──────────────────────────────────────────────────────
export async function GET() {
  const now = new Date().toISOString();

  if (!hasTushareToken()) {
    return NextResponse.json({
      ok:              false,
      tokenConfigured: false,
      connected:       false,
      message:         "TUSHARE_TOKEN 未配置，请在 Vercel 环境变量中配置",
      checkedAt:       now,
    });
  }

  // 并行检测所有接口
  const caps = await runCapabilityChecks();

  // connected = 至少有一个核心接口可用（stock_basic / daily / index_daily 任一）
  const coreCaps = [caps.stock_basic, caps.daily, caps.index_daily];
  const connected = coreCaps.some(c => c.status === "ok" || c.status === "empty");

  // 汇总文字说明
  const statusLines: string[] = [];
  if (caps.stock_basic.status === "ok")           statusLines.push("A股股票池 ✅");
  else if (caps.stock_basic.status === "permission_denied") statusLines.push("A股股票池 ⚠️ 权限不足");
  else                                             statusLines.push("A股股票池 ❌ 不可用");

  if (caps.daily.status === "ok" || caps.daily.status === "empty") statusLines.push("历史K线 ✅");
  else if (caps.daily.status === "permission_denied")               statusLines.push("历史K线 ⚠️ 权限不足");
  else                                                               statusLines.push("历史K线 ❌ 不可用");

  if (caps.daily_basic.status === "ok" || caps.daily_basic.status === "empty") statusLines.push("估值数据(PE/PB) ✅");
  else if (caps.daily_basic.status === "permission_denied")                     statusLines.push("估值数据(PE/PB) ⚠️ 权限不足");
  else                                                                           statusLines.push("估值数据(PE/PB) ❌ 不可用");

  if (caps.index_daily.status === "ok" || caps.index_daily.status === "empty") statusLines.push("指数日线/市场择时 ✅");
  else if (caps.index_daily.status === "permission_denied")                     statusLines.push("指数日线/市场择时 ⚠️ 权限不足");
  else                                                                           statusLines.push("指数日线/市场择时 ❌ 不可用");

  if (caps.trade_cal.status === "ok" || caps.trade_cal.status === "empty") statusLines.push("交易日历 ✅");
  else if (caps.trade_cal.status === "permission_denied")                   statusLines.push("交易日历 ⚠️ 权限不足（回测降级为K线推导）");
  else                                                                       statusLines.push("交易日历 ❌ 不可用");

  if (caps.fundamentals.status === "ok" || caps.fundamentals.status === "empty") statusLines.push("财务数据(ROE/利润) ✅");
  else if (caps.fundamentals.status === "permission_denied")                      statusLines.push("财务数据(ROE/利润) ⚠️ 权限不足");
  else                                                                             statusLines.push("财务数据(ROE/利润) ❌ 不可用");

  const hasPermissionIssues = Object.values(caps).some(c => c.status === "permission_denied");
  const message = !connected
    ? "Tushare Token 有效，但核心接口（stock_basic/daily/index_daily）均无权限，请检查积分"
    : hasPermissionIssues
    ? "Tushare 已连接，部分接口权限不足（不影响主要功能）"
    : "Tushare 已连接，所有接口正常";

  // 汇总各接口的 status（简化字段，不含 sample）
  const capabilities: Record<string, { status: CapStatus; error?: string }> = {};
  for (const [k, v] of Object.entries(caps)) {
    capabilities[k] = { status: v.status, ...(v.error ? { error: v.error } : {}) };
  }

  return NextResponse.json({
    ok:              connected,
    tokenConfigured: true,
    connected,
    message,
    capabilities,
    statusSummary:   statusLines,
    checkedAt:       now,
  });
}
