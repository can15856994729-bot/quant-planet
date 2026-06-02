/**
 * app/api/strategies/trend-correction-mini-reversal/single/route.ts
 *
 * POST /api/strategies/trend-correction-mini-reversal/single
 * A股趋势回调微型反转策略 — 单只股票分析
 */

import { NextRequest, NextResponse } from "next/server";
import {
  analyzeTrendCorrectionStock,
  DEFAULT_PARAMS,
  type MiniReversalParams,
} from "@/lib/trendCorrectionMiniReversalService";
import { symbolToTsCode } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const symbol: string = String(body.symbol ?? "").trim().replace(/\.(SH|SZ|BJ)$/i, "");

    if (!/^\d{6}$/.test(symbol)) {
      return NextResponse.json(
        { ok: false, error: "请输入6位股票代码（如 600519）" },
        { status: 400 },
      );
    }

    const tsCode = symbolToTsCode(symbol);
    const name: string   = String(body.name ?? symbol);
    const params: MiniReversalParams = { ...DEFAULT_PARAMS, ...(body.params ?? {}) };

    const result = await analyzeTrendCorrectionStock(tsCode, name, params);
    if (!result) {
      return NextResponse.json({ ok: false, error: "未获取到 K线数据，请检查代码" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
