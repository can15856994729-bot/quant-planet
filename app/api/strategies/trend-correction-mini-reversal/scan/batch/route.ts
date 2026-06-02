/**
 * app/api/strategies/trend-correction-mini-reversal/scan/batch/route.ts
 *
 * POST /api/strategies/trend-correction-mini-reversal/scan/batch
 * 批量分析指定股票列表（最多 15 只/批），返回每只的分析结果摘要。
 *
 * Body: {
 *   stocks: Array<{ tsCode: string; name: string }>,
 *   params?: MiniReversalParams   // 可选，不传用默认
 * }
 *
 * 设计要点：
 * - 每批最多 15 只，concurrency=5 并发，约 3-5s 完成
 * - 只返回摘要字段（不含完整 K 线数组），控制响应体积
 * - 单只失败不影响其他（Promise.allSettled）
 */

import { NextRequest, NextResponse } from "next/server";
import {
  analyzeTrendCorrectionStock,
  DEFAULT_PARAMS,
  type MiniReversalParams,
} from "@/lib/trendCorrectionMiniReversalService";

export const dynamic = "force-dynamic";

interface StockInput { tsCode: string; name: string }

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body → use defaults */ }

  const stocks: StockInput[] = Array.isArray(body.stocks)
    ? (body.stocks as StockInput[]).slice(0, 15)
    : [];
  const params: MiniReversalParams = { ...DEFAULT_PARAMS, ...(body.params ?? {}) };

  if (stocks.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const CONCURRENCY = 5;
  const results: unknown[] = [];

  for (let i = 0; i < stocks.length; i += CONCURRENCY) {
    const chunk = stocks.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(async ({ tsCode, name }) => {
        try {
          const a = await analyzeTrendCorrectionStock(tsCode, name, params);

          if (!a) {
            return { tsCode, name, status: "insufficient", reason: "数据不足" };
          }

          // 风险过滤未通过
          if (!a.riskFilter.passed) {
            return { tsCode, name, status: "high_risk", reason: a.riskFilter.reason };
          }

          const uptrendDetected    = a.uptrend.detected;
          const retracementMatched = a.retracement.matched;
          const miniReversalOk     = a.miniReversal.miniReversal;

          if (a.buySignal) {
            // 候选股票：返回完整摘要（不含 bars 数组）
            return {
              tsCode,
              name,
              status: "candidate" as const,
              analysis: {
                currentPrice:     a.currentPrice,
                uptrend: {
                  detected:    a.uptrend.detected,
                  lowPoint:    a.uptrend.lowPoint,
                  highPoint:   a.uptrend.highPoint,
                  riseAmount:  a.uptrend.riseAmount,
                  risePercent: a.uptrend.risePercent,
                  trendDays:   a.uptrend.trendDays,
                  reasons:     a.uptrend.reasons,
                },
                retracement: {
                  matched:              a.retracement.matched,
                  halfRetracementPrice: a.retracement.halfRetracementPrice,
                  price40Retracement:   a.retracement.price40Retracement,
                  price60Retracement:   a.retracement.price60Retracement,
                  correctionRatio:      a.retracement.correctionRatio,
                  correctionPercent:    a.retracement.correctionPercent,
                  lowerZonePrice:       a.retracement.lowerZonePrice,
                  upperZonePrice:       a.retracement.upperZonePrice,
                },
                miniReversal: {
                  miniReversal:    a.miniReversal.miniReversal,
                  score:           a.miniReversal.score,
                  conditionsMet:   a.miniReversal.conditionsMet,
                  conditionsTotal: a.miniReversal.conditionsTotal,
                  reasons:         a.miniReversal.reasons,
                },
                riskFilter: {
                  passed:    a.riskFilter.passed,
                  riskLevel: a.riskFilter.riskLevel,
                  reason:    a.riskFilter.reason,
                },
                buySignal:        a.buySignal,
                buySignalReasons: a.buySignalReasons,
                barsCount:        a.bars.length,
              },
            };
          }

          // 未达到买入条件
          return {
            tsCode,
            name,
            status:             "no_signal" as const,
            uptrendDetected,
            retracementMatched,
            miniReversalOk,
          };
        } catch (e) {
          return {
            tsCode,
            name,
            status: "error" as const,
            reason: e instanceof Error ? e.message : String(e),
          };
        }
      })
    );

    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
      else results.push({ tsCode: "?", name: "?", status: "error", reason: String(r.reason) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
