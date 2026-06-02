/**
 * app/api/strategies/trend-correction-mini-reversal/scan/route.ts
 *
 * POST /api/strategies/trend-correction-mini-reversal/scan
 * A股趋势回调微型反转策略 — 全市场扫描
 *
 * 注意：单次扫描限制 maxStocks（默认200），避免 Vercel serverless 超时。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  scanTrendCorrectionCandidates,
  DEFAULT_PARAMS,
  type MiniReversalParams,
} from "@/lib/trendCorrectionMiniReversalService";

export const dynamic = "force-dynamic";

// 支持 GET（方便测试）和 POST（正式调用）
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    message: "请使用 POST 请求扫描。GET 仅用于确认接口存在。",
    endpoint: "POST /api/strategies/trend-correction-mini-reversal/scan",
    body: {
      params:       "MiniReversalParams（可选，不传则使用默认参数）",
      maxStocks:    "number（可选，默认 200，最大 500）",
      concurrency:  "number（可选，默认 5，最大 5）",
    },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // body 为空时使用默认值
    }

    const params: MiniReversalParams = { ...DEFAULT_PARAMS, ...(body.params ?? {}) };
    const maxStocks: number   = Math.min(Number(body.maxStocks ?? 200), 500);
    const concurrency: number = Math.min(Number(body.concurrency ?? 5), 5);

    const result = await scanTrendCorrectionCandidates(params, concurrency, maxStocks);

    return NextResponse.json({
      ok:         true,
      candidates: result.candidates,
      highRisk:   result.highRisk,
      dataInsuff: result.dataInsuff,
      stats:      result.stats,
      scannedAt:  result.scannedAt,
      note:       `本次扫描了 ${result.stats.total} 只股票（随机采样，最大 ${maxStocks}）`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[trend-correction scan] error:", msg);
    return NextResponse.json(
      {
        ok:      false,
        error:   "scan_error",
        message: `扫描失败：${msg}`,
      },
      { status: 500 },
    );
  }
}
