/**
 * GET /api/tushare/profit-summary?tsCode=600519.SH[&periods=8][&refresh=1]
 *
 * 获取单只 A 股最近 N 期利润表 + 盈利能力核心数据。
 * 数据来源：Tushare income + fina_indicator（服务端聚合）
 * 缓存：24h 内存缓存 + HTTP Cache-Control 24h
 *       ?refresh=1 清除内存缓存后重新拉取
 *
 * 安全：TUSHARE_TOKEN 仅在服务端 tushareService 使用，不暴露给前端。
 */
import { NextRequest, NextResponse } from "next/server";
import { getProfitSummary, clearProfitCache } from "@/lib/financialService";
import { hasTushareToken } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p       = req.nextUrl.searchParams;
  const tsCode  = p.get("tsCode")  ?? "";
  const periods = Math.min(Math.max(Number(p.get("periods") ?? "8"), 1), 12);
  const refresh = p.get("refresh") === "1" || p.get("refresh") === "true";

  // Token 检查
  if (!hasTushareToken()) {
    return NextResponse.json({
      ok:    false,
      error: "TUSHARE_TOKEN 未配置，无法获取利润表数据",
      items: [],
    });
  }

  if (!tsCode) {
    return NextResponse.json(
      { ok: false, error: "缺少必填参数：tsCode（如 600519.SH）", items: [] },
      { status: 400 },
    );
  }

  // 清除缓存后重拉
  if (refresh) clearProfitCache(tsCode);

  const result = await getProfitSummary(tsCode, periods, refresh);

  if (!result.ok) {
    const status =
      result.incomeStatus === "permission_denied" || result.finaIndicatorStatus === "permission_denied"
        ? 403
        : 200;

    return NextResponse.json(
      {
        ok:                  false,
        tsCode:              result.tsCode,
        symbol:              result.symbol,
        error:               result.error,
        incomeStatus:        result.incomeStatus,
        finaIndicatorStatus: result.finaIndicatorStatus,
        items:               [],
        updatedAt:           result.updatedAt,
      },
      { status },
    );
  }

  return NextResponse.json(
    {
      ok:                  true,
      tsCode:              result.tsCode,
      symbol:              result.symbol,
      items:               result.items,
      total:               result.items.length,
      incomeStatus:        result.incomeStatus,
      finaIndicatorStatus: result.finaIndicatorStatus,
      fromCache:           result.fromCache ?? false,
      updatedAt:           result.updatedAt,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    },
  );
}
