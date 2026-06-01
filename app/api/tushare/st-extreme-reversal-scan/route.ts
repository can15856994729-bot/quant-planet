/**
 * GET /api/tushare/st-extreme-reversal-scan
 *
 * 全市场扫描 ST 极限反转候选股票。
 *
 * Query 参数（均可选）：
 *   minStreak          最少连续跌停数（默认 5）
 *   maxStreak          最多连续跌停数（默认 50）
 *   maxDelistingRisk   最大退市风险分（默认 40）
 *   enableStabilization boolean 是否启用稳定信号（默认 true）
 *   enableVShape       boolean 是否启用V型反转信号（默认 true）
 *
 * ⚠️ 服务端专用，TUSHARE_TOKEN 不会暴露给前端。
 */
import { NextRequest, NextResponse } from "next/server";
import { hasTushareToken } from "@/lib/tushareService";
import {
  scanSTExtremeReversalCandidates,
  type STExtremeReversalParams,
} from "@/lib/stExtremeReversalService";

export const dynamic = "force-dynamic";

function parseBool(v: string | null, defaultVal: boolean): boolean {
  if (v === null) return defaultVal;
  return v === "true" || v === "1";
}

function parseNum(v: string | null, defaultVal: number): number {
  if (v === null) return defaultVal;
  const n = Number(v);
  return isFinite(n) ? n : defaultVal;
}

export async function GET(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json({
      ok: false,
      error: "Tushare Token 未配置，无法运行扫描",
      tokenMissing: true,
    });
  }

  const { searchParams } = req.nextUrl;

  const params: Partial<STExtremeReversalParams> = {
    minLimitDownStreak:  parseNum(searchParams.get("minStreak"), 5),
    maxLimitDownStreak:  parseNum(searchParams.get("maxStreak"), 50),
    maxDelistingRiskScore: parseNum(searchParams.get("maxDelistingRisk"), 40),
    enableStabilization: parseBool(searchParams.get("enableStabilization"), true),
    enableVShape:        parseBool(searchParams.get("enableVShape"), true),
  };

  try {
    const result = await scanSTExtremeReversalCandidates(params);
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      error: `扫描异常：${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
