/**
 * app/api/strategies/st-limit-down-first-limit-up/scan/route.ts
 *
 * POST — 扫描全市场 ST 股，返回「连续跌停后首板」候选
 * Body: { params?: Partial<STFirstLimitUpParams>, concurrency?: number }
 *
 * ⚠️ TUSHARE_TOKEN 只在服务端使用，绝不暴露给前端。
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  scanSTLimitDownFirstLimitUpCandidates,
  DEFAULT_FIRST_LIMIT_UP_PARAMS,
  type STFirstLimitUpParams,
} from "@/lib/stLimitDownFirstLimitUpService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      params?:      Partial<STFirstLimitUpParams>;
      concurrency?: number;
    };

    const params: STFirstLimitUpParams = {
      ...DEFAULT_FIRST_LIMIT_UP_PARAMS,
      ...(body.params ?? {}),
    };

    const concurrency = Math.min(Number(body.concurrency ?? 4), 6);

    const result = await scanSTLimitDownFirstLimitUpCandidates(params, concurrency);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[st-limit-down-first-limit-up/scan] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
