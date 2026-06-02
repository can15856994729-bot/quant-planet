/**
 * app/api/strategies/trend-correction-mini-reversal/scan/route.ts
 *
 * POST /api/strategies/trend-correction-mini-reversal/scan
 * A股趋势回调微型反转策略 — 全市场扫描（单次调用版）
 *
 * ⚠️ 注意：此路由是旧版单次扫描接口，用于兼容已有调用。
 *    推荐使用新版分批扫描方案：
 *      1. GET  /scan/stocks  → 获取全量股票列表（5000+ 只）
 *      2. POST /scan/batch   → 按批次分析（每批最多 15 只）
 *
 * maxStocks 参数：
 *   - 不再默认限制 200，默认改为 0（不限制，扫描全部）
 *   - 全量扫描会触发 Vercel serverless 超时，建议使用分批方案
 *   - 如需限制，可传 maxStocks=200 做快速测试
 */

import { NextRequest, NextResponse } from "next/server";
import {
  scanTrendCorrectionCandidates,
  DEFAULT_PARAMS,
  type MiniReversalParams,
} from "@/lib/trendCorrectionMiniReversalService";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    message: "请使用 POST 请求扫描，或使用分批方案（推荐）",
    recommended: {
      step1: "GET  /api/strategies/trend-correction-mini-reversal/scan/stocks  → 获取全量 A 股列表",
      step2: "POST /api/strategies/trend-correction-mini-reversal/scan/batch   → 按批次分析（每批 10-15 只）",
      note:  "分批方案支持全市场 5000+ 只扫描，进度实时保存，退出可继续",
    },
    legacyParams: {
      params:       "MiniReversalParams（可选）",
      maxStocks:    "number（可选，0=不限制全量，200=快速测试）",
      concurrency:  "number（可选，默认 5，最大 5）",
    },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ignore empty body */ }

    const params: MiniReversalParams = { ...DEFAULT_PARAMS, ...(body.params ?? {}) };
    // maxStocks=0 表示不限制；不传时也不限制（全市场）
    // 如果传了正整数则作为上限（用于快速测试）
    const rawMax     = Number(body.maxStocks ?? 0);
    const maxStocks  = rawMax > 0 ? rawMax : Number.MAX_SAFE_INTEGER;
    const concurrency = Math.min(Number(body.concurrency ?? 5), 5);

    const result = await scanTrendCorrectionCandidates(params, concurrency, maxStocks);

    return NextResponse.json({
      ok:         true,
      scanMode:   rawMax > 0 ? "limited" : "full_market",
      candidates: result.candidates,
      highRisk:   result.highRisk,
      dataInsuff: result.dataInsuff,
      stats:      result.stats,
      scannedAt:  result.scannedAt,
      note:       rawMax > 0
        ? `本次扫描了 ${result.stats.total} 只股票（限制最多 ${rawMax} 只）`
        : `本次扫描了 ${result.stats.total} 只股票（全市场）`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "scan_error", message: `扫描失败：${msg}` },
      { status: 500 },
    );
  }
}
