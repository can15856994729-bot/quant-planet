/**
 * GET /api/eastmoney/money-flow/sectors/industry
 *
 * 返回行业板块资金流排行（按主力净流入排序）。
 * 缓存 60 秒。
 *
 * ⚠️ 不使用 TUSHARE_TOKEN。
 */
import { NextResponse } from "next/server";
import { fetchSectorMoneyFlow } from "@/lib/eastMoneyMoneyFlowService";

export const dynamic = "force-dynamic";

let _cache: { data: unknown; expiresAt: number } | null = null;
const TTL = 60_000;

export async function GET() {
  if (_cache && Date.now() < _cache.expiresAt) {
    return NextResponse.json(_cache.data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  }

  const result = await fetchSectorMoneyFlow("industry");
  const body = result.ok
    ? { ok: true, type: "industry", sectors: result.sectors, count: result.sectors?.length ?? 0 }
    : { ok: false, error: "money_flow_unavailable", message: result.error ?? "行业资金流数据暂不可用" };

  if (result.ok) _cache = { data: body, expiresAt: Date.now() + TTL };

  return NextResponse.json(body, {
    status: result.ok ? 200 : 502,
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
