/**
 * GET /api/stocks/[symbol]/financials/profit[?periods=8][&refresh=1]
 *
 * 通过 6 位 A 股代码访问利润表数据（自动转换为 Tushare ts_code）。
 *
 * 示例：
 *   GET /api/stocks/600519/financials/profit   → 贵州茅台
 *   GET /api/stocks/000001/financials/profit   → 平安银行
 *
 * 代理说明：此 Route 只做 symbol→tsCode 转换并代理 profit-summary API。
 * 安全：TUSHARE_TOKEN 仅在服务端使用，不暴露给前端。
 */
import { NextRequest, NextResponse } from "next/server";
import { getProfitSummary, clearProfitCache } from "@/lib/financialService";
import { hasTushareToken } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

/** 6 位 A 股代码 → Tushare ts_code */
function symbolToTsCode(symbol: string): string {
  if (symbol.startsWith("6"))  return `${symbol}.SH`;
  if (symbol.startsWith("0") || symbol.startsWith("3")) return `${symbol}.SZ`;
  if (symbol.startsWith("8") || symbol.startsWith("4")) return `${symbol}.BJ`;
  return `${symbol}.SH`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const p          = req.nextUrl.searchParams;
  const periods    = Math.min(Math.max(Number(p.get("periods") ?? "8"), 1), 12);
  const refresh    = p.get("refresh") === "1" || p.get("refresh") === "true";

  // 只支持 A 股 6 位数字代码
  if (!/^\d{6}$/.test(symbol)) {
    return NextResponse.json(
      { ok: false, error: "仅支持 A 股 6 位数字代码", items: [] },
      { status: 400 },
    );
  }

  if (!hasTushareToken()) {
    return NextResponse.json({
      ok:    false,
      error: "TUSHARE_TOKEN 未配置，无法获取利润表数据",
      items: [],
    });
  }

  const tsCode = symbolToTsCode(symbol);
  if (refresh) clearProfitCache(tsCode);

  const result = await getProfitSummary(tsCode, periods, refresh);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok:                  false,
        symbol,
        tsCode:              result.tsCode,
        error:               result.error,
        incomeStatus:        result.incomeStatus,
        finaIndicatorStatus: result.finaIndicatorStatus,
        items:               [],
        updatedAt:           result.updatedAt,
      },
      {
        status: (result.incomeStatus === "permission_denied" ||
                 result.finaIndicatorStatus === "permission_denied") ? 403 : 200,
      },
    );
  }

  return NextResponse.json(
    {
      ok:                  true,
      symbol,
      tsCode:              result.tsCode,
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
