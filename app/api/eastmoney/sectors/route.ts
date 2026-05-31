/**
 * GET /api/eastmoney/sectors?type=industry|concept|region|special
 *
 * 返回东方财富板块列表（行业/概念/地域/特色）。
 * 数据来源：push2.eastmoney.com（公开接口，无需 Token）。
 * 服务端内存缓存 60 秒，客户端 Cache-Control: s-maxage=60。
 *
 * ⚠️ 本路由不使用 TUSHARE_TOKEN。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchEMSectors, type EMSectorType } from "@/lib/eastMoneySectorService";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<string>(["industry", "concept", "region", "special"]);

// 服务端内存缓存（按 type 分开）
const _cache = new Map<EMSectorType, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 60 * 1000; // 60 秒

export async function GET(req: NextRequest) {
  const typeParam = req.nextUrl.searchParams.get("type") ?? "industry";

  if (!VALID_TYPES.has(typeParam)) {
    return NextResponse.json(
      { ok: false, error: `无效 type 参数: ${typeParam}，可选 industry|concept|region|special` },
      { status: 400 }
    );
  }
  const type = typeParam as EMSectorType;

  // 命中缓存
  const hit = _cache.get(type);
  if (hit && Date.now() < hit.expiresAt) {
    return NextResponse.json(hit.data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  }

  const result = await fetchEMSectors(type);

  const body = {
    ok:       result.ok,
    type,
    sectors:  result.sectors,
    count:    result.sectors.length,
    error:    result.error ?? null,
    fetchedAt: new Date().toISOString(),
  };

  if (result.ok) {
    _cache.set(type, { data: body, expiresAt: Date.now() + CACHE_TTL });
  }

  return NextResponse.json(body, {
    status: result.ok ? 200 : 502,
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
