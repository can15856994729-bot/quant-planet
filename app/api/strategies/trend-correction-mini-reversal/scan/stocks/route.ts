/**
 * app/api/strategies/trend-correction-mini-reversal/scan/stocks/route.ts
 *
 * GET /api/strategies/trend-correction-mini-reversal/scan/stocks
 * 获取 A股全市场上市股票列表（ts_code + name），供前端任务管理器分批扫描使用
 */

import { NextResponse } from "next/server";
import { getAStockBasic, hasTushareToken } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", code: "no_token" },
      { status: 500 }
    );
  }

  try {
    const res = await getAStockBasic("L");
    if (!res.ok) {
      return NextResponse.json(
        {
          ok:    false,
          error: (res as { error?: string }).error ?? "获取股票列表失败",
          code:  "fetch_error",
        },
        { status: 500 }
      );
    }

    const stocks = (res.records as Record<string, string>[]).map(r => ({
      tsCode: r.ts_code ?? "",
      name:   r.name   ?? r.ts_code ?? "",
    })).filter(s => s.tsCode);

    return NextResponse.json({ ok: true, stocks, total: stocks.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, code: "exception" },
      { status: 500 }
    );
  }
}
