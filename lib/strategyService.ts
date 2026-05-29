/**
 * strategyService.ts
 * A股稳健多因子轮动策略 — server-side strategy runner.
 *
 * Data sources:
 *   - East Money daily K-line  (trend / momentum / volume factors) ✅
 *   - East Money batch quote    (real-time price / PE / PB)          ✅ when market open
 *   - Financial fundamentals    (ROE / profit growth)                ⚠️ unavailable → quality neutral
 *   - Market timing (index MA)  (market status)                      ⚠️ Phase 2 TODO
 */

import { calculateFactorScores } from "./factorService";
import type { KLineBar, QuoteData } from "./factorService";

// ── Strategy stock pool ──────────────────────────────────────────
// 20 representative large/mid-cap A-share stocks.
// Signals are computed from real K-line data — not hardcoded.
export const STRATEGY_POOL = [
  { symbol: "600519", name: "贵州茅台",  industry: "白酒",     secid: "1.600519" },
  { symbol: "601318", name: "中国平安",  industry: "保险",     secid: "1.601318" },
  { symbol: "002594", name: "比亚迪",    industry: "新能源车", secid: "0.002594" },
  { symbol: "300750", name: "宁德时代",  industry: "动力电池", secid: "0.300750" },
  { symbol: "000858", name: "五粮液",    industry: "白酒",     secid: "0.000858" },
  { symbol: "000333", name: "美的集团",  industry: "家电",     secid: "0.000333" },
  { symbol: "600036", name: "招商银行",  industry: "银行",     secid: "1.600036" },
  { symbol: "600276", name: "恒瑞医药",  industry: "医药",     secid: "1.600276" },
  { symbol: "002352", name: "顺丰控股",  industry: "物流",     secid: "0.002352" },
  { symbol: "601012", name: "隆基绿能",  industry: "光伏",     secid: "1.601012" },
  { symbol: "000001", name: "平安银行",  industry: "银行",     secid: "0.000001" },
  { symbol: "002415", name: "海康威视",  industry: "安防",     secid: "0.002415" },
  { symbol: "603288", name: "海天味业",  industry: "食品",     secid: "1.603288" },
  { symbol: "600031", name: "三一重工",  industry: "工程机械", secid: "1.600031" },
  { symbol: "601888", name: "中国中免",  industry: "旅游零售", secid: "1.601888" },
  { symbol: "600900", name: "长江电力",  industry: "电力",     secid: "1.600900" },
  { symbol: "300059", name: "东方财富",  industry: "金融信息", secid: "0.300059" },
  { symbol: "002475", name: "立讯精密",  industry: "消费电子", secid: "0.002475" },
  { symbol: "600438", name: "通威股份",  industry: "光伏",     secid: "1.600438" },
  { symbol: "601166", name: "兴业银行",  industry: "银行",     secid: "1.601166" },
] as const;

// ── Types ────────────────────────────────────────────────────────
export type SignalAction  = "buy" | "sell" | "watch" | "hold";
export type MarketStatus  = "强势" | "震荡" | "弱势";

export interface StrategySignal {
  symbol:              string;
  name:                string;
  market:              "A";
  industry:            string;
  action:              SignalAction;
  score:               number;
  entryPrice:          number;
  stopLossPrice:       number;
  takeProfitPrice:     number;
  suggestedPositionPct: number;
  reasons:             string[];
  warnings:            string[];
  trendScore:          number;
  momentumScore:       number;
  isRealtime:          boolean;
  dataCompleteness:    number; // 0–1
}

export interface StrategyResult {
  ok:                    true;
  strategyId:            "a-share-multi-factor";
  name:                  string;
  market:                "A";
  updatedAt:             string;
  marketStatus:          MarketStatus;
  suggestedTotalPosition: number; // 0–1
  buySignals:            StrategySignal[];
  sellSignals:           StrategySignal[];
  watchlist:             StrategySignal[];
  riskLevel:             "低" | "中等" | "高";
  dataNote:              string;
}

// ── East Money K-line fetch ───────────────────────────────────────
async function fetchKlineEM(secid: string, days = 130): Promise<KLineBar[]> {
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
    `?secid=${secid}` +
    `&fields1=f1,f2,f3,f4,f5,f6` +
    `&fields2=f51,f52,f53,f54,f55,f56,f57` +
    `&klt=101&fqt=1&beg=0&end=20500101&lmt=${days}`;

  const res = await fetch(url, {
    headers: { Referer: "https://finance.eastmoney.com/" },
    next:    { revalidate: 3600 },         // Next.js cache: 1 h
    signal:  AbortSignal.timeout(8000),    // 8-s timeout
  });
  const json = await res.json();
  const klines = (json?.data?.klines ?? []) as string[];

  // Format: "date,open,close,high,low,volume,amount"
  // f52=open, f53=close, f54=high, f55=low, f56=vol, f57=amount
  return klines
    .map((line: string) => {
      const p = line.split(",");
      return {
        date:   p[0],
        open:   parseFloat(p[1]),
        close:  parseFloat(p[2]),
        high:   parseFloat(p[3]),
        low:    parseFloat(p[4]),
        volume: parseFloat(p[5]) || 0,
        amount: parseFloat(p[6]) || 0,
      };
    })
    .filter(b => b.close > 0);
}

// ── East Money batch quote (PE / PB / price) ─────────────────────
type PoolEntry = (typeof STRATEGY_POOL)[number];

async function fetchBatchQuotes(pool: readonly PoolEntry[]): Promise<Record<string, QuoteData>> {
  const secids = pool.map(s => s.secid).join(",");
  const url =
    `https://push2.eastmoney.com/api/qt/ulist.np/get` +
    `?secids=${secids}&fields=f2,f3,f9,f12,f13,f23`;

  const res = await fetch(url, {
    headers: { Referer: "https://finance.eastmoney.com/" },
    next:    { revalidate: 60 },
    signal:  AbortSignal.timeout(6000),
  });
  const json = await res.json();
  const items = (json?.data?.diff ?? []) as Record<string, number | string>[];

  const result: Record<string, QuoteData> = {};
  for (const item of items) {
    const sym    = String(item.f12 ?? "");
    const mktNum = Number(item.f13 ?? 0);
    const div    = mktNum === 116 ? 1000 : 100;
    const price  = Number(item.f2) / div;
    if (price > 0) {
      const peRaw = Number(item.f9);
      const pbRaw = Number(item.f23);
      result[sym] = {
        price,
        changePct: Number(item.f3) / 100,
        pe: peRaw > 0 && peRaw < 30000 ? peRaw / 100 : undefined,
        pb: pbRaw > 0 && pbRaw < 10000 ? pbRaw / 100 : undefined,
      };
    }
  }
  return result;
}

// ── Market status (Phase 2: connect real index MA) ────────────────
function assessMarketStatus(): MarketStatus {
  // TODO Phase 2: fetch CSI300/CSI500/ChiNext K-line, compare price to MA60
  // Conservative default until implemented
  return "震荡";
}

function positionForStatus(s: MarketStatus): number {
  return s === "强势" ? 0.85 : s === "震荡" ? 0.55 : 0.20;
}

// ── Main runner ───────────────────────────────────────────────────
export async function runAShareMultiFactorStrategy(): Promise<StrategyResult> {
  // 1. Batch quotes (fast, ~300 ms)
  let quotes: Record<string, QuoteData> = {};
  try { quotes = await fetchBatchQuotes(STRATEGY_POOL); } catch { /* keep empty */ }

  // 2. K-line in parallel (20 requests, ~2-4 s total)
  const klineResults = await Promise.allSettled(
    STRATEGY_POOL.map(s => fetchKlineEM(s.secid, 130))
  );

  // 3. Score each stock
  const signals: StrategySignal[] = [];
  for (let i = 0; i < STRATEGY_POOL.length; i++) {
    const stock  = STRATEGY_POOL[i];
    const kRes   = klineResults[i];
    if (kRes.status !== "fulfilled" || kRes.value.length < 20) continue;

    const klines = kRes.value;
    const q: QuoteData = quotes[stock.symbol] ?? {
      price:     klines[klines.length - 1].close,
      changePct: 0,
    };
    if (!q.price || q.price <= 0) continue;

    const f = calculateFactorScores(klines, q);

    const action: SignalAction =
      f.totalScore >= 75 ? "buy"  :
      f.totalScore < 55  ? "sell" :
      f.totalScore >= 65 ? "watch": "hold";

    signals.push({
      symbol:   stock.symbol,
      name:     stock.name,
      market:   "A",
      industry: stock.industry,
      action,
      score:               f.totalScore,
      entryPrice:          +(q.price).toFixed(2),
      stopLossPrice:       +(q.price * 0.92).toFixed(2),
      takeProfitPrice:     +(q.price * 1.20).toFixed(2),
      suggestedPositionPct: action === "buy" ? 0.06 : 0,
      reasons:             [...f.reasons],
      warnings:            [...f.warnings],
      trendScore:          f.trendScore,
      momentumScore:       f.momentumScore,
      isRealtime:          !!quotes[stock.symbol],
      dataCompleteness:    f.dataCompleteness,
    });
  }

  signals.sort((a, b) => b.score - a.score);

  // 4. Industry cap: ≤3 per sector in buy signals
  const indCnt: Record<string, number> = {};
  const buySignals = signals
    .filter(s => s.action === "buy")
    .filter(s => {
      const c = indCnt[s.industry] ?? 0;
      if (c < 3) { indCnt[s.industry] = c + 1; return true; }
      return false;
    })
    .slice(0, 15);

  const sellSignals = signals.filter(s => s.action === "sell");
  const watchlist   = signals.filter(s => s.action === "watch").slice(0, 8);

  const marketStatus = assessMarketStatus();
  const avgScore = signals.length
    ? signals.reduce((a, s) => a + s.score, 0) / signals.length : 50;
  const riskLevel: StrategyResult["riskLevel"] =
    avgScore < 50 ? "高" : avgScore < 65 ? "中等" : "低";

  return {
    ok: true,
    strategyId: "a-share-multi-factor",
    name:    "A股稳健多因子轮动策略",
    market:  "A",
    updatedAt: new Date().toISOString(),
    marketStatus,
    suggestedTotalPosition: positionForStatus(marketStatus),
    buySignals,
    sellSignals,
    watchlist,
    riskLevel,
    dataNote: [
      "趋势/动量/量价/风险因子：来自东方财富日K线（前复权）✅",
      "质量因子（ROE/利润增长/现金流）：暂缺财务接口，评分中性化处理 ⚠️",
      "估值因子：仅有PE/PB，历史分位暂缺 ⚠️",
      "市场择时（大盘状态）：Phase 2接入指数MA，当前默认「震荡」⚠️",
    ].join("；"),
  };
}
