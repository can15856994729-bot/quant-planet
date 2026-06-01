/**
 * GET /api/tushare/cashflow-summary?tsCode=600519.SH[&periods=8][&refresh=1]
 *
 * 现金流量摘要接口：聚合 cashflow + income（净利润/营收），计算现金流质量指标。
 *
 * 字段：三大现金流 / 自由现金流 / 经营现金流÷净利润 / 销售回款 / 购买支付 / 分红 / 增加额
 * 缓存：24h 内存缓存，?refresh=1 强制重拉
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用，不暴露给客户端。
 */
import { NextRequest, NextResponse } from "next/server";
import { getCashflowSummary, clearCashflowCache } from "@/lib/financialService";

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

  if (refresh) clearCashflowCache(tsCode);

  const result = await getCashflowSummary(tsCode, periods, refresh);

  return NextResponse.json({
    ok:             result.ok,
    tsCode:         result.tsCode,
    symbol:         result.symbol,
    items:          result.items,
    total:          result.items.length,
    cashflowStatus: result.cashflowStatus,
    incomeStatus:   result.incomeStatus,
    fromCache:      result.fromCache ?? false,
    error:          result.error,
    updatedAt:      result.updatedAt,
  });
}
