/**
 * GET /api/tushare/stock-basic?listStatus=L
 *
 * 返回沪深北 A股全量列表（来自 Tushare stock_basic）。
 * 转换为 App 统一股票结构，缓存 24h。
 *
 * Query params:
 *   listStatus  "L"（上市，默认）| "D"（退市）| "P"（暂停）
 *
 * 若 Tushare Token 未配置或权限不足，返回 ok:false 和明确错误信息。
 * 不返回 mock 数据冒充真实。
 */
import { NextRequest, NextResponse } from "next/server";
import { getAStockBasic, hasTushareToken } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export interface TushareStockItem {
  tsCode:    string;   // "600519.SH"
  symbol:    string;   // "600519"
  name:      string;
  area:      string;
  industry:  string;
  market:    string;   // "主板" | "创业板" | "科创板" | "北交所"
  exchange:  string;   // "SSE" | "SZSE" | "BSE"
  listDate:  string;
  listStatus: string;
  source:    "tushare";
}

export async function GET(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", tokenMissing: true, stocks: [] },
      { status: 200 },
    );
  }

  const { searchParams } = new URL(req.url);
  const listStatus = (searchParams.get("listStatus") ?? "L") as "L" | "D" | "P";

  const result = await getAStockBasic(listStatus);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, tokenMissing: result.tokenMissing, stocks: [] },
      { status: 200 },
    );
  }

  // Map to unified app structure
  const stocks: TushareStockItem[] = result.records.map(r => ({
    tsCode:    String(r.ts_code ?? ""),
    symbol:    String(r.symbol   ?? ""),
    name:      String(r.name     ?? ""),
    area:      String(r.area     ?? ""),
    industry:  String(r.industry ?? ""),
    market:    String(r.market   ?? ""),
    exchange:  String(r.exchange ?? ""),
    listDate:  String(r.list_date  ?? ""),
    listStatus: String(r.list_status ?? "L"),
    source:    "tushare" as const,
  })).filter(s => s.symbol && s.name);

  return NextResponse.json(
    {
      ok:        true,
      total:     stocks.length,
      stocks,
      updatedAt: new Date().toISOString(),
      source:    "tushare",
      fromCache: result.fromCache ?? false,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    },
  );
}
