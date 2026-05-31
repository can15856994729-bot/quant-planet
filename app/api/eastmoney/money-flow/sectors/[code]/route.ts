/**
 * GET /api/eastmoney/money-flow/sectors/[code]?type=industry|concept|region
 *
 * 返回单个板块资金流详情（在板块列表中查找）。
 * code 示例：BK0477
 * 缓存 60 秒。
 *
 * ⚠️ 不使用 TUSHARE_TOKEN。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchSectorMoneyFlow } from "@/lib/eastMoneyMoneyFlowService";

export const dynamic = "force-dynamic";

const _cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL = 60_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const sectorCode = decodeURIComponent(code).toUpperCase();
  const typeParam  = req.nextUrl.searchParams.get("type") ?? "industry";

  if (!/^BK\d+$/i.test(sectorCode)) {
    return NextResponse.json(
      { ok: false, error: "invalid_code", message: `无效板块代码: ${sectorCode}` },
      { status: 400 }
    );
  }

  const cacheKey = `${sectorCode}-${typeParam}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) {
    return NextResponse.json(hit.data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  }

  const validTypes = ["industry", "concept", "region", "special"] as const;
  const type = validTypes.includes(typeParam as typeof validTypes[number])
    ? (typeParam as typeof validTypes[number])
    : "industry";

  const result = await fetchSectorMoneyFlow(type);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "money_flow_unavailable", message: result.error ?? "资金流数据暂不可用" },
      { status: 502 }
    );
  }

  const sector = result.sectors?.find(s => s.sectorCode.toUpperCase() === sectorCode);
  if (!sector) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: `板块 ${sectorCode} 资金流数据不存在` },
      { status: 404 }
    );
  }

  const body = { ok: true, sectorCode, sector };
  _cache.set(cacheKey, { data: body, expiresAt: Date.now() + TTL });

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
