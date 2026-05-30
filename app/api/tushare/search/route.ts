/**
 * GET /api/tushare/search?q=<关键词>
 *
 * 按股票名称 OR 代码模糊搜索 A股股票。
 * 数据来源：Tushare stock_basic（24h 缓存）。
 * 返回最多 15 条结果。
 */
import { NextRequest, NextResponse } from "next/server";
import { callTushare, hasTushareToken } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export interface StockSearchItem {
  tsCode:   string;  // "600519.SH"
  symbol:   string;  // "600519"
  name:     string;  // "贵州茅台"
  industry: string;
  market:   string;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ ok: true, results: [] });
  }

  if (!hasTushareToken()) {
    return NextResponse.json({ ok: false, error: "Tushare Token 未配置", results: [] });
  }

  const res = await callTushare(
    "stock_basic",
    { list_status: "L", exchange: "" },
    "ts_code,symbol,name,industry,market",
    24 * 60 * 60 * 1000,
  );

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error, results: [] });
  }

  const qLower = q.toLowerCase();
  const filtered = res.records
    .filter((r) => {
      const name   = String(r.name   ?? "").toLowerCase();
      const symbol = String(r.symbol ?? "").toLowerCase();
      const tsCode = String(r.ts_code ?? "").toLowerCase();
      return name.includes(qLower) || symbol.includes(qLower) || tsCode.includes(qLower);
    })
    .slice(0, 15)
    .map((r) => ({
      tsCode:   String(r.ts_code  ?? ""),
      symbol:   String(r.symbol   ?? ""),
      name:     String(r.name     ?? ""),
      industry: String(r.industry ?? ""),
      market:   String(r.market   ?? ""),
    } as StockSearchItem));

  return NextResponse.json({ ok: true, results: filtered });
}
