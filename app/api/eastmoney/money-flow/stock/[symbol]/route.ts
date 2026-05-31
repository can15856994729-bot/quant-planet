/**
 * GET /api/eastmoney/money-flow/stock/[symbol]
 *
 * 返回单只 A 股今日资金流数据（主力/超大单/大单/中单/小单 + 5日/10日）。
 * 缓存 30 秒。
 *
 * ⚠️ 不使用 TUSHARE_TOKEN。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchStockMoneyFlow } from "@/lib/eastMoneyMoneyFlowService";

export const dynamic = "force-dynamic";

// 服务端内存缓存，30 秒
const _cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL = 30_000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!sym || sym.length < 5) {
    return NextResponse.json(
      { ok: false, error: "invalid_symbol", message: "无效股票代码" },
      { status: 400 }
    );
  }

  const hit = _cache.get(sym);
  if (hit && Date.now() < hit.expiresAt) {
    return NextResponse.json(hit.data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=15" },
    });
  }

  const result = await fetchStockMoneyFlow(sym);
  const body = result.ok
    ? { ok: true, symbol: sym, data: result.data }
    : { ok: false, error: "money_flow_unavailable", message: result.error ?? "东方财富资金流数据暂不可用" };

  if (result.ok) {
    _cache.set(sym, { data: body, expiresAt: Date.now() + TTL });
  }

  return NextResponse.json(body, {
    status: result.ok ? 200 : 502,
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=15" },
  });
}
