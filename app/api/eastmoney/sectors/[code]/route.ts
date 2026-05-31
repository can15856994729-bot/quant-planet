/**
 * GET /api/eastmoney/sectors/[code]
 *
 * 返回单个东方财富板块详情（从各类型板块列表中查找）。
 * code 示例：BK0477
 *
 * ⚠️ 本路由不使用 TUSHARE_TOKEN。
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchEMSectorDetail, isEMSectorCode } from "@/lib/eastMoneySectorService";

export const dynamic = "force-dynamic";

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

  const result = await fetchEMSectorDetail(sectorCode);

  return NextResponse.json(
    {
      ok:        result.ok,
      sector:    result.sector ?? null,
      error:     result.error ?? null,
      fetchedAt: new Date().toISOString(),
    },
    {
      status: result.ok ? 200 : 404,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    }
  );
}
