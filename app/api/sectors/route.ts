/**
 * GET /api/sectors
 *
 * 返回 A股 31 个申万一级行业板块列表，包含：
 *  - 行业名称、emoji、颜色、描述
 *  - 该行业 A股股票数量
 *  - 样本股票代码（前 20 只）
 *  - 全市场统计（总股票数 / 已分类 / 未分类）
 *
 * 数据来源：Tushare stock_basic（已上市 A股，缓存 24h）
 * HTTP 缓存：24h
 */
import { NextResponse } from "next/server";
import { getAStockBasic, hasTushareToken } from "@/lib/tushareService";
import { classifyStocks, type ClassifyResult } from "@/lib/sectorService";

export const dynamic = "force-dynamic";

let _cache: { data: ClassifyResult; expiresAt: number } | null = null;

export async function GET() {
  // 内存缓存 24h
  if (_cache && Date.now() < _cache.expiresAt) {
    return NextResponse.json(
      { ok: true, ..._cache.data, fromCache: true, updatedAt: new Date((_cache.expiresAt - 24 * 3600_000)).toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
    );
  }

  if (!hasTushareToken()) {
    return NextResponse.json({
      ok: false,
      error: "TUSHARE_TOKEN 未配置，无法加载 A股股票池",
      sectors: [], totalStocks: 0, classifiedStocks: 0, unclassifiedStocks: 0,
    });
  }

  const res = await getAStockBasic("L");
  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      error: `Tushare 股票池加载失败：${res.error}`,
      sectors: [], totalStocks: 0, classifiedStocks: 0, unclassifiedStocks: 0,
    });
  }

  const result = classifyStocks(res.records as unknown as import("@/lib/sectorService").TushareStockRecord[]);
  _cache = { data: result, expiresAt: Date.now() + 24 * 3600_000 };

  return NextResponse.json(
    { ok: true, ...result, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
