/**
 * GET /api/strategies/trend-correction-mini-reversal/status[?refresh=1]
 *
 * 返回 A股趋势回调微型反转策略的数据源状态：
 *   - Tushare Token 是否配置
 *   - A股股票池是否可用、真实总数
 *   - K线数据是否可用
 *   - 扫描支持说明（全市场 / 快速测试）
 *   - scanLimit: null 表示无限制（全市场）
 *
 * ?refresh=1  清除 stock_basic 内存缓存，强制重新从 Tushare 拉取
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDailyKLine,
  getAStockBasicAll,
  hasTushareToken,
  clearTushareCacheFor,
  todayStr,
  daysAgoStr,
} from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const now     = new Date().toISOString();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const tokenOk = hasTushareToken();

  if (!tokenOk) {
    return NextResponse.json({
      ok:                 false,
      tokenConfigured:    false,
      stockPoolAvailable: false,
      totalAStockCount:   0,
      scanMode:           "full_market",
      scanLimit:          null,
      tushareConnected:   false,
      message:            "TUSHARE_TOKEN 未配置，请在 Vercel 环境变量中配置",
      checkedAt:          now,
    });
  }

  if (refresh) clearTushareCacheFor("stock_basic");

  // ── 1. 并行检测：股票池 + K线 ────────────────────────────────────
  const [basicRes, klineRes] = await Promise.all([
    getAStockBasicAll().catch(e => ({ ok: false as const, error: String(e) })),
    getDailyKLine("600519.SH", daysAgoStr(10), todayStr())
      .catch(e => ({ ok: false as const, error: String(e) })),
  ]);

  // ── 2. 处理股票池结果 ────────────────────────────────────────────
  let totalAStockCount = 0;
  let stockPoolError   = "";

  if (basicRes.ok) {
    const active = basicRes.records.filter(r => {
      const status = String(r.list_status ?? "");
      const name   = String(r.name ?? "");
      if (status === "D" || status === "P") return false;
      if (name.startsWith("*ST") || name.startsWith("ST")) return false;
      if (name.includes("退市")) return false;
      return true;
    });
    totalAStockCount = active.length;
  } else {
    stockPoolError = (basicRes as { error?: string }).error ?? "未知错误";
  }

  const stockPoolAvailable = basicRes.ok && totalAStockCount >= 3000;
  const klineAvailable     = klineRes.ok;

  // ── 3. 汇总 ──────────────────────────────────────────────────────
  const allOk = stockPoolAvailable && klineAvailable;

  const message = !stockPoolAvailable
    ? totalAStockCount > 0 && totalAStockCount < 3000
      ? `股票池数量异常（仅 ${totalAStockCount} 只），Tushare 积分可能不足或缓存问题，请调用 ?refresh=1 重试`
      : `股票池不可用：${stockPoolError}`
    : !klineAvailable
      ? `K线数据不可用：${(klineRes as { error?: string }).error ?? "未知"}`
      : `A股股票池正常：${totalAStockCount.toLocaleString()} 只上市股票可用于全市场扫描`;

  return NextResponse.json({
    ok:                 allOk,
    tokenConfigured:    true,
    stockPoolAvailable,
    totalAStockCount,
    rawTotalCount:      basicRes.ok ? basicRes.records.length : 0,
    scanMode:           "full_market",
    scanLimit:          null,          // null = 无限制，全市场扫描
    tushareConnected:   basicRes.ok || klineAvailable,
    klineAvailable,
    refreshed:          refresh,
    message,
    scanInfo: {
      fullMarketCount:      totalAStockCount,
      quickTestCount:       200,
      recommendedBatchSize: 10,
      recommendedDelayMs:   800,
      estimatedFullScanMin: Math.round(totalAStockCount / 10 * 0.8 / 60),
    },
    hint: !stockPoolAvailable
      ? "如果积分刚升级，请调用 ?refresh=1 清除缓存重新检测"
      : refresh
      ? "已强制刷新缓存，当前为最新股票池数据"
      : undefined,
    checkedAt: now,
  });
}
