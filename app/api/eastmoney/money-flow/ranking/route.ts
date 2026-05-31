/**
 * GET /api/eastmoney/money-flow/ranking?order=desc&limit=100
 *
 * 返回全市场 A 股个股资金流排行。
 *   order=desc（默认）→ 主力净流入 Top N（流入榜）
 *   order=asc          → 主力净流出 Top N（流出榜）
 * 缓存 60 秒。
 *
 * ⚠️ 不使用 TUSHARE_TOKEN。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchMoneyFlowRanking } from "@/lib/eastMoneyMoneyFlowService";

export const dynamic = "force-dynamic";

const _cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL = 60_000;

export async function GET(req: NextRequest) {
  const order  = (req.nextUrl.searchParams.get("order") ?? "desc") as "asc" | "desc";
  const limit  = Math.min(200, Math.max(10, parseInt(req.nextUrl.searchParams.get("limit") ?? "100")));
  const cacheKey = `${order}-${limit}`;

  const hit = _cache.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) {
    return NextResponse.json(hit.data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  }

  const result = await fetchMoneyFlowRanking({ limit, order });
  const body = result.ok
    ? { ok: true, order, limit, stocks: result.stocks, count: result.stocks?.length ?? 0, fetchedAt: new Date().toISOString() }
    : { ok: false, error: "money_flow_unavailable", message: result.error ?? "资金流排行数据暂不可用" };

  if (result.ok) _cache.set(cacheKey, { data: body, expiresAt: Date.now() + TTL });

  return NextResponse.json(body, {
    status: result.ok ? 200 : 502,
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
