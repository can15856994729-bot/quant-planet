/**
 * app/api/tushare/fundamental-score/route.ts
 *
 * GET /api/tushare/fundamental-score?tsCode=600519.SH[&refresh=1]
 *
 * 直接接受 Tushare ts_code，适合内部调试和后台调用。
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用，不暴露给前端。
 */

import { NextRequest, NextResponse } from "next/server";
import { getFundamentalScore } from "@/lib/fundamentalScoreService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tsCode  = req.nextUrl.searchParams.get("tsCode") ?? "";
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!tsCode || !/^\d{6}\.(SH|SZ|BJ)$/i.test(tsCode)) {
    return NextResponse.json(
      { ok: false, error: "tsCode 格式错误，示例：600519.SH", tsCode },
      { status: 400 },
    );
  }

  const result = await getFundamentalScore(tsCode.toUpperCase(), refresh);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
