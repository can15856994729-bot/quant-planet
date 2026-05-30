/**
 * POST /api/tushare/single-backtest
 *
 * 单只股票策略回测。
 *
 * Body (JSON):
 *   tsCode         Tushare 代码，如 "600519.SH"
 *   name           股票名称
 *   startDate      YYYYMMDD
 *   endDate        YYYYMMDD
 *   initialCapital 初始资金（默认 100000）
 *   commissionRate 手续费率（默认 0.0003）
 *   stopLossRate   止损比例（默认 0.08，0 = 不止损）
 *   takeProfitHalf 半仓止盈（默认 0.20）
 *   takeProfitFull 全仓止盈（默认 0.35）
 *   scoreThreshold 买入综合评分阈值（默认 75）
 *   trendThreshold 买入趋势评分阈值（默认 70）
 *   maSet          "5/20/60" | "10/30/120"（默认 "5/20/60"）
 *   checkFreq      "daily" | "weekly"（默认 "daily"）
 */
import { NextRequest, NextResponse } from "next/server";
import { runSingleStockBacktest } from "@/lib/singleStockBacktest";
import { hasTushareToken }        from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "Tushare Token 未配置", tokenMissing: true },
      { status: 200 },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const tsCode = String(body.tsCode ?? "600519.SH").trim();
  const name   = String(body.name   ?? tsCode).trim();
  if (!tsCode.includes(".")) {
    return NextResponse.json({ ok: false, error: "tsCode 格式错误，需含交易所后缀，如 600519.SH" });
  }

  const startDate  = String(body.startDate  ?? "20230101");
  const endDate    = String(body.endDate    ?? "20251231");
  const initialCapital  = Math.max(10000, Number(body.initialCapital  ?? 100000));
  const commissionRate  = Math.min(0.01,  Math.max(0.0001, Number(body.commissionRate ?? 0.0003)));
  const stampDutyRate   = 0.001;
  const slippageRate    = 0.0005;
  const stopLossRate    = Math.min(0.5,  Math.max(0, Number(body.stopLossRate    ?? 0.08)));
  const takeProfitHalf  = Math.min(1,    Math.max(0, Number(body.takeProfitHalf  ?? 0.20)));
  const takeProfitFull  = Math.min(2,    Math.max(0, Number(body.takeProfitFull  ?? 0.35)));
  const scoreThreshold  = Math.min(90,   Math.max(50, Number(body.scoreThreshold ?? 75)));
  const trendThreshold  = Math.min(90,   Math.max(50, Number(body.trendThreshold ?? 70)));
  const maSetRaw        = String(body.maSet ?? "5/20/60");
  const maSet = (maSetRaw === "10/30/120" ? "10/30/120" : "5/20/60") as "5/20/60" | "10/30/120";
  const checkFreq = String(body.checkFreq ?? "daily") === "weekly" ? "weekly" : "daily" as const;

  const result = await runSingleStockBacktest({
    tsCode, name, startDate, endDate,
    initialCapital, commissionRate, stampDutyRate, slippageRate,
    stopLossRate, takeProfitHalf, takeProfitFull,
    scoreThreshold, trendThreshold,
    maSet, checkFreq,
  });

  return NextResponse.json(result);
}
