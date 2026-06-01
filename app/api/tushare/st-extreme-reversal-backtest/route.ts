/**
 * POST /api/tushare/st-extreme-reversal-backtest
 *
 * 批量回测极限反转策略（多只股票）。
 *
 * Body（JSON）：
 *   tsCodes   string[]  Tushare ts_code 列表（可选，空则使用全部ST股）
 *   startDate string    开始日期 YYYYMMDD（可选）
 *   endDate   string    结束日期 YYYYMMDD（可选）
 *   params    object    策略参数（可选）
 *
 * ⚠️ 服务端专用，TUSHARE_TOKEN 不会暴露给前端。
 */
import { NextRequest, NextResponse } from "next/server";
import { hasTushareToken, getAStockBasic } from "@/lib/tushareService";
import {
  backtestSTExtremeReversalStock,
  type STExtremeReversalParams,
  type STExtremeBacktestResult,
} from "@/lib/stExtremeReversalService";

export const dynamic = "force-dynamic";

function isValidTsCode(s: string): boolean {
  return /^\d{6}\.(SH|SZ|BJ)$/.test(s);
}

export async function POST(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json({
      ok: false,
      error: "Tushare Token 未配置，无法运行批量回测",
      tokenMissing: true,
    });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const startDate = body.startDate ? String(body.startDate) : undefined;
  const endDate   = body.endDate   ? String(body.endDate)   : undefined;
  const params    = (body.params ?? {}) as Partial<STExtremeReversalParams>;

  // Determine stock list
  let stockList: { tsCode: string; name: string }[] = [];

  if (Array.isArray(body.tsCodes) && body.tsCodes.length > 0) {
    stockList = (body.tsCodes as unknown[])
      .filter((c): c is string => typeof c === "string" && isValidTsCode(c))
      .map(c => ({ tsCode: c, name: c }));
  } else {
    // Get all ST stocks
    const basicRes = await getAStockBasic("L");
    if (!basicRes.ok) {
      return NextResponse.json({
        ok: false,
        error: `获取股票池失败：${basicRes.error}`,
      });
    }
    stockList = basicRes.records
      .filter(r => /ST|st/.test(String(r.name ?? "")))
      .map(r => ({
        tsCode: String(r.ts_code ?? ""),
        name:   String(r.name ?? ""),
      }))
      .filter(s => isValidTsCode(s.tsCode));
  }

  if (stockList.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "没有找到可用的股票列表",
    });
  }

  // Run batch backtest (limit to 20 stocks to avoid timeout)
  const MAX_BATCH = 20;
  const limited = stockList.slice(0, MAX_BATCH);

  const results: STExtremeBacktestResult[] = [];

  await Promise.allSettled(
    limited.map(async ({ tsCode, name }) => {
      try {
        const r = await backtestSTExtremeReversalStock(tsCode, name, params, startDate, endDate);
        results.push(r);
      } catch (e: unknown) {
        results.push({
          ok: false, tsCode, name,
          totalReturn: 0, annualReturn: 0, maxDrawdown: 0,
          winRate: 0, totalTrades: 0,
          limitDownStuckCount: 0, suspendedCount: 0,
          stabilizationTrades: 0, vShapeTrades: 0, bothTrades: 0,
          trades: [], klineSignals: [], equity: [], streakEvents: [],
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })
  );

  // Sort by totalReturn descending
  results.sort((a, b) => b.totalReturn - a.totalReturn);

  return NextResponse.json({
    ok: true,
    totalRequested: stockList.length,
    totalProcessed: limited.length,
    results,
  });
}
