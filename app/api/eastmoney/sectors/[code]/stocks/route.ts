/**
 * GET /api/eastmoney/sectors/[code]/stocks
 *
 * 返回东方财富板块内全量股票列表（含实时行情）。
 * code 示例：BK0477
 *
 * ⚠️ 本路由不使用 TUSHARE_TOKEN。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchEMSectorStocks, isEMSectorCode } from "@/lib/eastMoneySectorService";

export const dynamic = "force-dynamic";

// 服务端内存缓存（按 code 分开），30 秒
const _cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 30 * 1000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const sectorCode = decodeURIComponent(code).toUpperCase();

  if (!isEMSectorCode(sectorCode)) {
    return NextResponse.json(
      { ok: false, error: `无效板块代码: ${sectorCode}（应为 BKxxxx 格式）` },
      { status: 400 }
    );
  }

  // 缓存命中
  const hit = _cache.get(sectorCode);
  if (hit && Date.now() < hit.expiresAt) {
    return NextResponse.json(hit.data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=15" },
    });
  }

  const result = await fetchEMSectorStocks(sectorCode);

  const body = {
    ok:        result.ok,
    sectorCode,
    stocks:    result.stocks,
    count:     result.stocks.length,
    error:     result.error ?? null,
    fetchedAt: new Date().toISOString(),
  };

  if (result.ok && result.stocks.length > 0) {
    _cache.set(sectorCode, { data: body, expiresAt: Date.now() + CACHE_TTL });
  }

  return NextResponse.json(body, {
    status: result.ok ? 200 : 502,
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=15" },
  });
}
