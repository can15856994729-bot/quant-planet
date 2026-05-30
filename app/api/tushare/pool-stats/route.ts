/**
 * GET /api/tushare/pool-stats
 *
 * 返回 Tushare A股股票池统计，供前端页面实时展示：
 *   totalListed   — stock_basic 上市股票总数
 *   afterFilter   — 排除 ST / 新股（<120天）后的候选数量
 *   industries    — 行业数
 *   sampleSize    — 全市场回测实际参与评分只数（每行业抽 1 只）
 *
 * 若 Tushare Token 未配置，返回 ok:false，不伪造数据。
 */
import { NextResponse } from "next/server";
import { getAStockBasic, hasTushareToken, daysAgoStr } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", tokenMissing: true },
      { status: 200 },
    );
  }

  const result = await getAStockBasic("L");
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }

  const all         = result.records;
  const totalListed = all.length;

  // ── 过滤：排除 ST/*ST/退市整理，排除上市不足 120 天 ────────────────
  const cutoff = daysAgoStr(120); // YYYYMMDD — 120天前
  const filtered = all.filter((s) => {
    const name     = String(s.name      ?? "");
    const listDate = String(s.list_date ?? "19000101");
    if (name.includes("ST") || name.includes("退")) return false;
    if (listDate > cutoff)                           return false;  // 新股
    return true;
  });

  const afterFilter = filtered.length;

  // ── 行业统计 ───────────────────────────────────────────────────────
  const industryMap = new Map<string, number>();
  for (const s of filtered) {
    const ind = (String(s.industry ?? "").trim()) || "其他";
    industryMap.set(ind, (industryMap.get(ind) ?? 0) + 1);
  }
  const industries = industryMap.size;

  // ── 回测样本估算：每行业取 1 只最早上市股票 ───────────────────────
  const poolByIndustry = new Map<string, true>();
  const sorted = [...filtered].sort((a, b) =>
    String(a.list_date ?? "").localeCompare(String(b.list_date ?? ""))
  );
  for (const s of sorted) {
    const ind = (String(s.industry ?? "").trim()) || "其他";
    if (!poolByIndustry.has(ind)) poolByIndustry.set(ind, true);
    if (poolByIndustry.size >= 100) break;
  }
  const sampleSize = poolByIndustry.size;

  // 返回按行业股票数量排序的前 30 行业（供前端展示）
  const topIndustries = [...industryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json(
    {
      ok: true,
      totalListed,
      afterFilter,
      industries,
      sampleSize,
      topIndustries,
      fromCache:  result.fromCache ?? false,
      updatedAt:  new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
      },
    },
  );
}
