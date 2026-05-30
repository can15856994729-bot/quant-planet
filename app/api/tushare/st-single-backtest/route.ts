/**
 * POST /api/tushare/st-single-backtest
 *
 * 单只 ST 股票回测接口。
 *
 * Body:
 *   tsCode         string   Tushare ts_code（如 002157.SZ）
 *   name           string   股票名称（展示用）
 *   isRealST       boolean  是否真实 ST/＊ST
 *   startDate      YYYYMMDD
 *   endDate        YYYYMMDD
 *   initialCapital number   初始资金（默认 100000）
 *   positionRatio  number   单次买入仓位比例（默认 0.9）
 *   stopLossRate   number   止损比例（默认 0.06）
 *   halfProfitRate number   半仓止盈触发（默认 0.20）
 *   fullProfitRate number   全仓止盈触发（默认 0.35）
 *   maxHoldDays    number   最大持仓天数（默认 0=不限）
 *   scoreMode      string   评分模式（conservative/standard/aggressive/debug）
 *   minAmount20d   number   20日均成交额下限（元，默认 5000000）
 *   commissionRate number   手续费率（默认 0.0003）
 *   enableT1       boolean  是否启用 T+1（默认 true）
 *   enableLimitFilter boolean  是否启用涨跌停过滤（默认 true）
 *   enableFees     boolean  是否启用手续费（默认 true）
 */
import { NextRequest, NextResponse } from "next/server";
import { hasTushareToken } from "@/lib/tushareService";
import { backtestSingleSTStock } from "@/lib/stSingleBacktestService";
import type { STSingleParams } from "@/lib/stSingleBacktestService";

export const dynamic = "force-dynamic";

// ts_code 格式验证
function isValidTsCode(s: string): boolean {
  return /^\d{6}\.(SH|SZ|BJ)$/.test(s);
}

export async function POST(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json({
      ok: false,
      error: "Tushare Token 未配置，无法运行真实回测",
      tokenMissing: true,
    });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const tsCode = String(body.tsCode ?? "");
  if (!tsCode || !isValidTsCode(tsCode)) {
    return NextResponse.json({
      ok: false,
      error: `无效的 ts_code（${tsCode || "空"}），格式应为 XXXXXX.SH / XXXXXX.SZ / XXXXXX.BJ`,
    });
  }

  const params: STSingleParams = {
    tsCode,
    name:            String(body.name             ?? tsCode),
    isRealST:        body.isRealST === true || body.isRealST === "true",
    startDate:       String(body.startDate        ?? "20230101"),
    endDate:         String(body.endDate          ?? "20251231"),
    initialCapital:  Math.max(10000,  Number(body.initialCapital  ?? 100000)),
    positionRatio:   Math.min(1.0, Math.max(0.1, Number(body.positionRatio ?? 0.9))),
    stopLossRate:    Math.min(0.20, Math.max(0,   Number(body.stopLossRate  ?? 0.06))),
    halfProfitRate:  Math.min(1.0,  Math.max(0,   Number(body.halfProfitRate ?? 0.20))),
    fullProfitRate:  Math.min(1.0,  Math.max(0,   Number(body.fullProfitRate ?? 0.35))),
    maxHoldDays:     Math.max(0,                  Number(body.maxHoldDays   ?? 0)),
    scoreMode:       (["conservative","standard","aggressive","debug"] as const)
                       .includes(body.scoreMode as never)
                       ? (body.scoreMode as STSingleParams["scoreMode"])
                       : "standard",
    minAmount20d:    Math.max(0, Number(body.minAmount20d ?? 5_000_000)),
    commissionRate:  Math.min(0.01, Math.max(0.0001, Number(body.commissionRate ?? 0.0003))),
    stampDutyRate:   0.001,   // 固定印花税
    slippageRate:    0.002,   // ST 股票滑点适当放大
    enableT1:        body.enableT1          !== false,
    enableLimitFilter: body.enableLimitFilter !== false,
    enableFees:      body.enableFees        !== false,
  };

  try {
    const result = await backtestSingleSTStock(params);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      error: `回测执行异常：${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
