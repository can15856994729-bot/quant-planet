/**
 * app/api/strategies/trend-correction-mini-reversal/scan/route.ts
 *
 * POST /api/strategies/trend-correction-mini-reversal/scan
 * A股趋势回调微型反转策略 — 全市场扫描
 */

import { NextRequest, NextResponse } from "next/server";
import {
  scanTrendCorrectionCandidates,
  DEFAULT_PARAMS,
  type MiniReversalParams,
} from "@/lib/trendCorrectionMiniReversalService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const params: MiniReversalParams = { ...DEFAULT_PARAMS, ...(body.params ?? {}) };
    const concurrency: number = Math.min(Number(body.concurrency ?? 3), 5);

    const result = await scanTrendCorrectionCandidates(params, concurrency);

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
