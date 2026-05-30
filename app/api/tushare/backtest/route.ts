/**
 * POST /api/tushare/backtest
 *
 * 运行 A股多因子策略回测（服务端，Tushare 历史数据）。
 *
 * Body (JSON):
 *   startDate      YYYYMMDD，如 "20220101"
 *   endDate        YYYYMMDD，如 "20241231"
 *   initialCapital 起始资金，默认 100000
 *   commissionRate 手续费率，默认 0.0003
 *   maxPositions   最多持仓股数，默认 5
 *
 * 若 Tushare Token 未配置或权限不足，返回明确错误，不返回假数据。
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

  const startDate      = String(body.startDate       ?? "20220101");
  const endDate        = String(body.endDate         ?? "20241231");
  const initialCapital = Number(body.initialCapital  ?? 100000);
  const commissionRate = Number(body.commissionRate  ?? 0.0003);
  const stampDutyRate  = Number(body.stampDutyRate   ?? 0.001);
  const slippageRate   = Number(body.slippageRate    ?? 0.0005);
  const maxPositions   = Math.min(Number(body.maxPositions ?? 5), 10);

  // Build ts_code list and name map from strategy pool
  const tsCodes = STRATEGY_POOL.map(s => symbolToTsCode(s.symbol));
  const names: Record<string, string> = {};
  for (const s of STRATEGY_POOL) {
    names[symbolToTsCode(s.symbol)] = s.name;
  }

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
  });

  return NextResponse.json(result);
}
