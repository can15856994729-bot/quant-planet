/**
 * app/api/strategies/st-limit-down-watch/scan/route.ts
 *
 * POST — 扫描全市场 ST 股，返回「连续跌停观察池」候选
 * Body: { params?: Partial<STLimitDownWatchParams>, concurrency?: number }
 *
 * ⚠️ TUSHARE_TOKEN 只在服务端使用，绝不暴露给前端。
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  scanSTLimitDownWatchCandidates,
  DEFAULT_WATCH_PARAMS,
  type STLimitDownWatchParams,
} from "@/lib/stLimitDownWatchService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      params?:      Partial<STLimitDownWatchParams>;
      concurrency?: number;
    };

    const params: STLimitDownWatchParams = {
      ...DEFAULT_WATCH_PARAMS,
      ...(body.params ?? {}),
    };

    const concurrency = Math.min(Number(body.concurrency ?? 4), 6);

    const result = await scanSTLimitDownWatchCandidates(params, concurrency);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[st-limit-down-watch/scan] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
