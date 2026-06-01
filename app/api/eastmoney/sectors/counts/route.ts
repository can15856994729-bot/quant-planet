/**
 * POST /api/eastmoney/sectors/counts
 *
 * 批量获取东财板块成分股数量（使用 data.total，非交易时段也准确）。
 *
 * 请求体: { codes: ["BK0477", "BK0698", ...] }  最多 50 个
 * 响应:   { ok: true, counts: { "BK0477": 82, "BK0698": 45, ... } }
 *
 * 服务端内存缓存 30 分钟；适合非交易时段预热。
 *
 * ⚠️ 本路由不使用 TUSHARE_TOKEN。
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchEMSectorCountBatch } from "@/lib/eastMoneySectorService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { codes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "请求体必须是有效 JSON" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body?.codes)) {
    return NextResponse.json(
      { ok: false, error: "missing_codes", message: "缺少 codes 字段（数组）" },
      { status: 400 },
    );
  }

  const valid = (body.codes as unknown[])
    .filter((c): c is string => typeof c === "string" && /^BK\d+$/i.test(c.trim()))
    .map(c => c.trim().toUpperCase())
    .slice(0, 50);

  if (valid.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no_valid_codes", message: "无有效板块代码（格式：BKxxxx）" },
      { status: 400 },
    );
  }

  const counts = await fetchEMSectorCountBatch(valid, 5);

  return NextResponse.json(
    { ok: true, counts, total: valid.length },
    { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" } },
  );
}
