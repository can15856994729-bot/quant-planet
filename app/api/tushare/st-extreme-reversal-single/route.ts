/**
 * POST /api/tushare/st-extreme-reversal-single
 *
 * 单只股票极限反转策略回测接口。
 *
 * Body（JSON）：
 *   tsCode    string   Tushare ts_code（如 002157.SZ）
 *   name      string   股票名称（展示用）
 *   startDate string   开始日期 YYYYMMDD（可选）
 *   endDate   string   结束日期 YYYYMMDD（可选）
 *   params    object   策略参数（可选，覆盖默认值）
 *
 * ⚠️ 服务端专用，TUSHARE_TOKEN 不会暴露给前端。
 */
import { NextRequest, NextResponse } from "next/server";
import { hasTushareToken } from "@/lib/tushareService";
import {
  backtestSTExtremeReversalStock,
  type STExtremeReversalParams,
} from "@/lib/stExtremeReversalService";

export const dynamic = "force-dynamic";

function isValidTsCode(s: string): boolean {
  return /^\d{6}\.(SH|SZ|BJ)$/.test(s);
}

export async function POST(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json({
      ok: false,
      error: "Tushare Token 未配置，无法运行回测",
      tokenMissing: true,
    });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const tsCode = String(body.tsCode ?? "");
  if (!tsCode || !isValidTsCode(tsCode)) {
    return NextResponse.json({
      ok: false,
      error: `无效的 ts_code（${tsCode || "空"}），格式应为 XXXXXX.SH / XXXXXX.SZ / XXXXXX.BJ`,
    });
  }

  const name      = String(body.name      ?? tsCode);
  const startDate = body.startDate ? String(body.startDate) : undefined;
  const endDate   = body.endDate   ? String(body.endDate)   : undefined;
  const params    = (body.params ?? {}) as Partial<STExtremeReversalParams>;

  try {
    const result = await backtestSTExtremeReversalStock(tsCode, name, params, startDate, endDate);
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      tsCode,
      name,
      error: `回测异常：${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
