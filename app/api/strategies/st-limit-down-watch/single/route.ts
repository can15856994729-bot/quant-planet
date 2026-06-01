/**
 * app/api/strategies/st-limit-down-watch/single/route.ts
 *
 * POST — 单只 ST 股连续跌停观察分析
 * Body: { tsCode, name, params? }
 *
 * ⚠️ TUSHARE_TOKEN 只在服务端使用，绝不暴露给前端。
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  analyzeSTLimitDownWatchStock,
  DEFAULT_WATCH_PARAMS,
  type STLimitDownWatchParams,
} from "@/lib/stLimitDownWatchService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      tsCode?: string;
      name?:   string;
      params?: Partial<STLimitDownWatchParams>;
    };

    const { tsCode, name } = body;
    if (!tsCode || !name) {
      return NextResponse.json({ ok: false, error: "缺少 tsCode 或 name" }, { status: 400 });
    }

    const params: STLimitDownWatchParams = {
      ...DEFAULT_WATCH_PARAMS,
      ...(body.params ?? {}),
    };

    const result = await analyzeSTLimitDownWatchStock(tsCode, name, params);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[st-limit-down-watch/single] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
