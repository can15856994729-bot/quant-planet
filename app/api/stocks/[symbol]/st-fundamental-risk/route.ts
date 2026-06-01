/**
 * app/api/stocks/[symbol]/st-fundamental-risk/route.ts
 *
 * GET /api/stocks/:symbol/st-fundamental-risk[?refresh=1]
 *
 * 返回 ST 股专项财务风险分析结果。
 * symbol → ts_code 自动转换。
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用，不暴露给前端。
 */

import { NextRequest, NextResponse } from "next/server";
import { getSTFundamentalRisk } from "@/lib/stFundamentalRiskService";

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

  if (!/^\d{6}$/.test(sym)) {
    return NextResponse.json(
      { ok: false, error: "仅支持 A 股 6 位代码", symbol: sym },
      { status: 400 },
    );
  }

  const tsCode = symbolToTsCode(sym);
  const result = await getSTFundamentalRisk(tsCode, refresh);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
