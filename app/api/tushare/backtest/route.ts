/**
 * POST /api/tushare/backtest
 *
 * 运行 A股多因子策略回测（服务端，Tushare 历史数据）。
 *
 * Body (JSON):
 *   startDate        YYYYMMDD
 *   endDate          YYYYMMDD
 *   initialCapital   起始资金（默认 100000）
 *   commissionRate   手续费率（默认 0.0003）
 *   stampDutyRate    印花税率（默认 0.001）
 *   slippageRate     滑点（默认 0.0005）
 *   maxPositions     最大持仓只数（默认 10，上限 20）
 *   rebalanceFreq    "weekly" | "monthly"（默认 "weekly"）
 *   maxSingleWeight  单股最大仓位（默认 0.20）
 *   stopLossRate     止损比例（默认 0.08，0 = 不止损）
 *   takeProfitRate   止盈比例（默认 0.30，0 = 不止盈）
 *   scoreThreshold   最低买入评分（默认 65）
 */
import { NextRequest, NextResponse } from "next/server";
import { runBacktest }               from "@/lib/backtestService";
import { STRATEGY_POOL }             from "@/lib/strategyService";
import { hasTushareToken, symbolToTsCode } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      {
        ok:           false,
        error:        "Tushare Token 未配置，无法运行真实回测",
        tokenMissing: true,
        hint:         "请在 Vercel 环境变量中配置 TUSHARE_TOKEN",
      },
      { status: 200 },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  // ── 解析参数 ─────────────────────────────────────────────────────
  const startDate  = String(body.startDate      ?? "20230101");
  const endDate    = String(body.endDate        ?? "20251231");

  const initialCapital = Math.max(10000, Number(body.initialCapital ?? 100000));
  const commissionRate = Math.min(0.01,  Math.max(0.0001, Number(body.commissionRate ?? 0.0003)));
  const stampDutyRate  = 0.001;     // 固定印花税，不可调
  const slippageRate   = 0.0005;    // 固定滑点

  const maxPositions    = Math.min(20, Math.max(1,   Number(body.maxPositions    ?? 10)));
  const rebalanceFreq   = String(body.rebalanceFreq ?? "weekly") === "monthly" ? "monthly" : "weekly" as const;
  const maxSingleWeight = Math.min(1,   Math.max(0.05, Number(body.maxSingleWeight ?? 0.20)));
  const stopLossRate    = Math.min(0.5, Math.max(0,    Number(body.stopLossRate    ?? 0.08)));
  const takeProfitRate  = Math.min(1,   Math.max(0,    Number(body.takeProfitRate  ?? 0.30)));
  const scoreThreshold  = Math.min(90,  Math.max(50,   Number(body.scoreThreshold  ?? 65)));

  // ── 构建股票池 ────────────────────────────────────────────────────
  const tsCodes: string[] = STRATEGY_POOL.map((s) => symbolToTsCode(s.symbol));
  const names: Record<string, string> = {};
  for (const s of STRATEGY_POOL) names[symbolToTsCode(s.symbol)] = s.name;

  const result = await runBacktest({
    tsCodes,
    names,
    startDate,
    endDate,
    initialCapital,
    commissionRate,
    stampDutyRate,
    slippageRate,
    maxPositions,
    rebalanceFreq,
    maxSingleWeight,
    stopLossRate,
    takeProfitRate,
    scoreThreshold,
  });

  return NextResponse.json(result);
}
