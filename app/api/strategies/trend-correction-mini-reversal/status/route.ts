/**
 * app/api/strategies/trend-correction-mini-reversal/status/route.ts
 *
 * GET /api/strategies/trend-correction-mini-reversal/status
 * 策略依赖状态检查：Tushare 连通性 / 股票池 / 单只分析测试
 */

import { NextResponse } from "next/server";
import {
  getDailyKLine,
  getAStockBasic,
  hasTushareToken,
  todayStr,
  daysAgoStr,
} from "@/lib/tushareService";
import { analyzeTrendCorrectionStock, DEFAULT_PARAMS } from "@/lib/trendCorrectionMiniReversalService";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const checkedAt = new Date().toISOString();
  const tokenOk   = hasTushareToken();

  // ── 1. 股票池检查 ────────────────────────────────────────────────
  let stockPoolAvailable = false;
  let stockPoolCount     = 0;
  let stockPoolError     = "";

  if (tokenOk) {
    try {
      const res = await getAStockBasic("L");
      if (res.ok) {
        stockPoolAvailable = true;
        stockPoolCount     = res.records.length;
      } else {
        stockPoolError = (res as { error?: string }).error ?? "unknown";
      }
    } catch (e) {
      stockPoolError = String(e);
    }
  }

  // ── 2. K线可用性（单只测试 600519.SH） ───────────────────────────
  let tushareDailyAvailable = false;
  let klineCount            = 0;
  let klineError            = "";

  if (tokenOk) {
    try {
      const res = await getDailyKLine(
        "600519.SH",
        daysAgoStr(30),
        todayStr(),
      );
      if (res.ok) {
        tushareDailyAvailable = true;
        klineCount            = res.records.length;
      } else {
        klineError = (res as { error?: string }).error ?? "unknown";
      }
    } catch (e) {
      klineError = String(e);
    }
  }

  // ── 3. 单只股票完整分析测试（600519.SH） ─────────────────────────
  let sampleStockTest: {
    tsCode:     string;
    klineCount: number;
    canAnalyze: boolean;
    buySignal:  boolean;
    uptrendDetected: boolean;
    retracementMatched: boolean;
    miniReversal: boolean;
    error?: string;
  } = {
    tsCode:  "600519.SH",
    klineCount: 0,
    canAnalyze: false,
    buySignal:  false,
    uptrendDetected: false,
    retracementMatched: false,
    miniReversal: false,
  };

  if (tushareDailyAvailable) {
    try {
      const result = await analyzeTrendCorrectionStock("600519.SH", "贵州茅台", DEFAULT_PARAMS);
      if (result) {
        sampleStockTest = {
          tsCode:  "600519.SH",
          klineCount:         result.bars.length,
          canAnalyze:         true,
          buySignal:          result.buySignal,
          uptrendDetected:    result.uptrend.detected,
          retracementMatched: result.retracement.matched,
          miniReversal:       result.miniReversal.miniReversal,
        };
      }
    } catch (e) {
      sampleStockTest.error = String(e);
    }
  }

  // ── 汇总 ─────────────────────────────────────────────────────────
  const allOk = tokenOk && stockPoolAvailable && tushareDailyAvailable;

  return NextResponse.json({
    ok:                    allOk,
    routeExists:           true,
    tokenConfigured:       tokenOk,
    stockPoolAvailable,
    stockPoolCount,
    stockPoolError:        stockPoolError || undefined,
    tushareDailyAvailable,
    klineCount,
    klineError:            klineError || undefined,
    sampleStockTest,
    scanLimits: {
      defaultMaxStocks: 200,
      maxMaxStocks:     500,
      defaultConcurrency: 5,
    },
    checkedAt,
    message: allOk
      ? "策略依赖正常，可以运行扫描"
      : !tokenOk
        ? "TUSHARE_TOKEN 未配置"
        : !stockPoolAvailable
          ? `股票池不可用：${stockPoolError}`
          : `K线数据不可用：${klineError}`,
  });
}
