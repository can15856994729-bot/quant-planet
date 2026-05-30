/**
 * GET /api/tushare/st-pool
 *
 * 返回当前 A股 ST / *ST 股票池（来自 Tushare stock_basic），
 * 附加 East Money 实时行情快速过滤低流动性股票。
 *
 * 过滤规则：
 *   - 名称含 ST / *ST / S*ST / SST
 *   - 排除名称含"退市整理"
 *   - 排除上市不足 90 天的新 ST
 *   - 排除近期成交额为 0（停牌）
 *
 * ⚠️ ST 股票存在退市、停牌、连续跌停、流动性枯竭风险，
 *    本接口仅供研究和模拟交易使用，不构成投资建议。
 */
import { NextResponse }              from "next/server";
import { getAStockBasic, hasTushareToken, daysAgoStr } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export interface STStockItem {
  tsCode:    string;   // "000999.SZ"
  symbol:    string;   // "000999"
  name:      string;   // "*ST 康美"
  industry:  string;
  market:    string;
  exchange:  string;
  listDate:  string;
  stType:    "ST" | "*ST" | "SST" | "S*ST" | "其他ST";
  // 行情（来自东方财富，可能为空）
  price?:      number;
  changePct?:  number;
  amount?:     number;   // 今日成交额（元）
  turnoverRate?: number;
}

function detectSTType(name: string): STStockItem["stType"] | null {
  if (name.includes("S*ST")) return "S*ST";
  if (name.includes("SST"))  return "SST";
  if (name.includes("*ST"))  return "*ST";
  if (name.includes("ST"))   return "ST";
  return null;
}

async function fetchEMQuotes(
  items: { symbol: string; exchange: string }[],
): Promise<Map<string, { price: number; changePct: number; amount: number; turnoverRate: number }>> {
  const result = new Map<string, { price: number; changePct: number; amount: number; turnoverRate: number }>();
  if (items.length === 0) return result;

  // East Money secid prefix: SSE=1, SZSE=0, BSE=0
  const secids = items.map((s) => {
    const prefix = s.exchange === "SSE" ? "1" : "0";
    return `${prefix}.${s.symbol}`;
  }).join(",");

  try {
    const url =
      `https://push2.eastmoney.com/api/qt/ulist.np/get` +
      `?secids=${secids}&fields=f2,f3,f6,f8,f12,f13`;
    const res  = await fetch(url, {
      headers: { Referer: "https://finance.eastmoney.com/" },
      signal:  AbortSignal.timeout(8000),
      next:    { revalidate: 120 },
    });
    const json = await res.json();
    const diff = (json?.data?.diff ?? []) as Record<string, number | string>[];

    for (const item of diff) {
      const sym    = String(item.f12 ?? "");
      const mktNum = Number(item.f13 ?? 0);
      const div    = mktNum === 116 ? 1000 : 100;
      const price  = Number(item.f2) / div;
      if (price > 0) {
        result.set(sym, {
          price,
          changePct: Number(item.f3) / 100,
          amount:    Number(item.f6),         // 成交额（元）
          turnoverRate: Number(item.f8) / 100,
        });
      }
    }
  } catch {
    // 行情获取失败，继续返回基础列表
  }
  return result;
}

export async function GET() {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置，无法获取 ST 股票池", tokenMissing: true, stocks: [] },
      { status: 200 },
    );
  }

  // 1. 获取全量上市股票
  const basicResult = await getAStockBasic("L");
  if (!basicResult.ok) {
    return NextResponse.json(
      { ok: false, error: basicResult.error, stocks: [] },
      { status: 200 },
    );
  }

  // 2. 过滤出 ST 股票
  const cutoff = daysAgoStr(90); // 排除上市不足 90 天的新 ST
  const stStocks: STStockItem[] = [];

  for (const s of basicResult.records) {
    const name     = String(s.name      ?? "");
    const listDate = String(s.list_date ?? "19000101");
    const tsCode   = String(s.ts_code   ?? "");
    const symbol   = String(s.symbol    ?? "");
    const exchange = String(s.exchange  ?? "");

    const stType = detectSTType(name);
    if (!stType) continue;                      // 不是 ST
    if (name.includes("退市整理")) continue;    // 排除退市整理期
    if (listDate > cutoff) continue;            // 排除新 ST（上市不足 90 天）
    if (!symbol || !tsCode) continue;

    stStocks.push({
      tsCode, symbol, name, stType,
      industry: String(s.industry ?? ""),
      market:   String(s.market   ?? ""),
      exchange,
      listDate,
    });
  }

  // 3. 从东方财富批量获取行情（分批，每批最多 200 只）
  const BATCH = 200;
  const quotes = new Map<string, { price: number; changePct: number; amount: number; turnoverRate: number }>();
  for (let i = 0; i < stStocks.length; i += BATCH) {
    const batch = stStocks.slice(i, i + BATCH);
    const batchQuotes = await fetchEMQuotes(batch.map((s) => ({ symbol: s.symbol, exchange: s.exchange })));
    for (const [k, v] of batchQuotes) quotes.set(k, v);
  }

  // 4. 附加行情数据，过滤停牌股票
  const enriched: STStockItem[] = [];
  const MIN_AMOUNT = 1_000_000; // 至少 100 万成交额才视为非停牌（有交易）

  for (const stock of stStocks) {
    const q = quotes.get(stock.symbol);
    const item: STStockItem = { ...stock };
    if (q) {
      item.price       = q.price;
      item.changePct   = q.changePct;
      item.amount      = q.amount;
      item.turnoverRate = q.turnoverRate;
      // 过滤：明确停牌（成交额=0）
      if (q.amount === 0) continue;
    }
    enriched.push(item);
  }

  // 5. 按成交额降序排列（流动性好的在前）
  enriched.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  return NextResponse.json(
    {
      ok:        true,
      total:     enriched.length,
      stocks:    enriched,
      source:    "tushare+eastmoney",
      updatedAt: new Date().toISOString(),
      note:      "ST股票存在退市、停牌、连续跌停、流动性枯竭风险，本数据仅供研究，不构成投资建议",
    },
    {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    },
  );
}
