/**
 * GET /api/eastmoney/money-flow/stock/[symbol]/history?days=10
 *
 * 返回单只股票近 N 日每日资金流历史（按天展示主力净流入趋势）。
 * 缓存 5 分钟（数据变化慢）。
 *
 * ⚠️ 不使用 TUSHARE_TOKEN。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchStockMoneyFlowHistory } from "@/lib/eastMoneyMoneyFlowService";

export const dynamic = "force-dynamic";

const _cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL = 5 * 60_000; // 5 分钟

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym  = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const days = Math.min(30, Math.max(5, parseInt(req.nextUrl.searchParams.get("days") ?? "10")));

  if (!sym || sym.length < 5) {
    return NextResponse.json(
      { ok: false, error: "invalid_symbol", message: "无效股票代码" },
      { status: 400 }
    );
  }

  const key = `${sym}-${days}`;
  const hit = _cache.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    return NextResponse.json(hit.data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  }

  const result = await fetchStockMoneyFlowHistory(sym, { days });
  const body = result.ok
    ? { ok: true, symbol: sym, days, bars: result.bars }
    : { ok: false, error: "money_flow_unavailable", message: result.error ?? "东方财富资金流历史暂不可用" };

  if (result.ok) {
    _cache.set(key, { data: body, expiresAt: Date.now() + TTL });
  }

  return NextResponse.json(body, {
    status: result.ok ? 200 : 502,
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
