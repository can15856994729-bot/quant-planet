/**
 * app/api/stocks/[symbol]/fundamental-score/route.ts
 *
 * GET /api/stocks/:symbol/fundamental-score[?refresh=1]
 *
 * 返回 A股 基本面综合评分（5 维度，0-100 分）。
 * symbol → ts_code 自动转换（6位数字 → .SH/.SZ/.BJ）
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用，不暴露给前端。
 */

import { NextRequest, NextResponse } from "next/server";
import { getFundamentalScore } from "@/lib/fundamentalScoreService";

function symbolToTsCode(symbol: string): string {
  if (symbol.startsWith("6"))                                  return `${symbol}.SH`;
  if (symbol.startsWith("0") || symbol.startsWith("3"))        return `${symbol}.SZ`;
  if (symbol.startsWith("8") || symbol.startsWith("4"))        return `${symbol}.BJ`;
  return `${symbol}.SH`;
}

export const dynamic = "force-dynamic";

export async function GET(
  req:  NextRequest,
  ctx:  { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  const { symbol } = await ctx.params;
  const sym     = symbol.toUpperCase();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  // 仅支持 A 股 6 位数字代码
  if (!/^\d{6}$/.test(sym)) {
    return NextResponse.json(
      { ok: false, error: "仅支持 A 股 6 位代码", symbol: sym },
      { status: 400 },
    );
  }

  const tsCode = symbolToTsCode(sym);
  const result = await getFundamentalScore(tsCode, refresh);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
    headers: {
      "Cache-Control": result.fromCache
        ? "public, max-age=3600"
        : "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
