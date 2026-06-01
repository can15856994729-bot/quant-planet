/**
 * GET /api/tushare/financial-safety?tsCode=600519.SH[&periods=8][&refresh=1]
 *
 * 资产负债 + 财务安全摘要接口
 *
 * 数据来源：Tushare balancesheet + fina_indicator + income（营收用于比率计算）
 * 缓存：24h 内存缓存，?refresh=1 强制重拉
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用，不暴露给客户端。
 */
import { NextRequest, NextResponse } from "next/server";
import { getFinancialSafetySummary, clearSafetyCache } from "@/lib/financialService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tsCode  = searchParams.get("tsCode")?.trim() ?? "";
  const periods = Math.min(Math.max(parseInt(searchParams.get("periods") ?? "8", 10) || 8, 1), 20);
  const refresh = searchParams.get("refresh") === "1" || searchParams.get("refresh") === "true";

  if (!tsCode) {
    return NextResponse.json(
      { ok: false, error: "缺少 tsCode 参数，示例：?tsCode=600519.SH" },
      { status: 400 },
    );
  }

  if (refresh) clearSafetyCache(tsCode);

  const result = await getFinancialSafetySummary(tsCode, periods, refresh);

  return NextResponse.json({
    ok:                  result.ok,
    tsCode:              result.tsCode,
    symbol:              result.symbol,
    items:               result.items,
    total:               result.items.length,
    balanceSheetStatus:  result.balanceSheetStatus,
    finaIndicatorStatus: result.finaIndicatorStatus,
    incomeStatus:        result.incomeStatus,
    fromCache:           result.fromCache ?? false,
    error:               result.error,
    updatedAt:           result.updatedAt,
  });
}
