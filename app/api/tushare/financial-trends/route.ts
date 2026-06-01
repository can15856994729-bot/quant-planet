/**
 * GET /api/tushare/financial-trends?tsCode=600519.SH[&periods=4][&refresh=1]
 *
 * 返回财报趋势数据（income + fina_indicator + cashflow + balancesheet 聚合）。
 * 升序返回最近 periods 期，适合前端图表直接使用。
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { getFinancialTrendSummary, clearTrendCache } from "@/lib/financialService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tsCode  = req.nextUrl.searchParams.get("tsCode");
  const periods = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("periods") ?? "4", 10) || 4, 2),
    8,
  );
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!tsCode) {
    return NextResponse.json(
      { ok: false, error: "tsCode 参数必填（如 600519.SH）" },
      { status: 400 },
    );
  }

  if (refresh) clearTrendCache(tsCode);

  const result = await getFinancialTrendSummary(tsCode, periods, refresh);
  return NextResponse.json(result);
}
