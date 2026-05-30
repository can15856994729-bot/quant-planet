/**
 * lib/quoteService.ts
 *
 * 统一服务端行情服务 — 全 App 所有 API Route 统一使用此模块获取实时行情。
 *
 * 数据源优先级：
 *   1. Alpha Vantage（美股，需配置 ALPHA_VANTAGE_KEY）
 *   2. 东方财富（A股、港股、美股兜底）
 *   3. 静态兜底（stockService 本地数据）
 *
 * 安全约束：此文件仅供服务端 API Route 引用，不得在 Client Component 中直接使用。
 * TUSHARE_TOKEN 与本文件无关。
 */

import { getStockBySymbol } from "./stockService";
import { fetchAVQuote, fetchAVQuotesBatch, isUSSymbol, hasAVKey } from "./alphaVantage";

// ── 完整行情数据接口 ──────────────────────────────────────────────
export interface QuoteData {
  symbol: string;
  name: string;

  // 价格
  price: number;
  change: number;       // 涨跌额
  changePct: number;    // 涨跌幅 % (e.g. 3.45 = +3.45%)
  open: number;
  high: number;
  low: number;
  prevClose: number;

  // 量/额
  volume: number;           // 成交量（手）
  amount?: number;          // 成交额（元）

  // A 股专属
  turnoverRate?: number;    // 换手率 % (e.g. 3.45 = 3.45%)
  volumeRatio?: number;     // 量比 (e.g. 1.23)

  // 涨跌停
  limitUpPrice?: number;    // 涨停价
  limitDownPrice?: number;  // 跌停价
  isLimitUp?: boolean;      // 是否涨停
  isLimitDown?: boolean;    // 是否跌停
  isOneLimitUp?: boolean;   // 是否一字涨停板（开盘即打板）
  isOneLimitDown?: boolean; // 是否一字跌停板
  isSuspended?: boolean;    // 是否停牌

  // 市值
  marketCap?: number;       // 总市值（元）
  floatMarketCap?: number;  // 流通市值（元）

  // 元数据
  isRealtime: boolean;
  source: "alphavantage" | "eastmoney" | "static";
  dataError?: boolean;
  errorMessage?: string;
  updatedAt: string;        // ISO 8601
}

// ── 东方财富字段常量 ──────────────────────────────────────────────
// 单股：f6=成交额, f8=换手率×100, f10=量比×100, f51=涨停价, f52=跌停价
const EM_SINGLE_FIELDS =
  "f43,f44,f45,f46,f47,f57,f58,f60,f169,f170,f116,f117,f6,f8,f10,f51,f52";

// 批量：f15=高, f16=低, f17=开, f18=昨收, f21=流通市值
const EM_BATCH_FIELDS =
  "f2,f3,f4,f12,f13,f14,f15,f16,f17,f18,f21,f47,f116,f6,f8,f10,f51,f52";

// ── secid 映射 ────────────────────────────────────────────────────
export function getSecid(symbol: string): string | null {
  if (isUSSymbol(symbol)) return `105.${symbol}`;
  if (/^\d{5}$/.test(symbol)) return `116.${symbol}`; // 港股 5 位
  if (symbol.length !== 6 || !/^\d+$/.test(symbol)) return null;
  if (/^[69]/.test(symbol) || symbol.startsWith("688")) return `1.${symbol}`; // 沪 / 科创
  return `0.${symbol}`; // 深 / 创业
}

function isAShare(symbol: string): boolean {
  return symbol.length === 6 && /^\d+$/.test(symbol);
}

/**
 * 根据昨收价计算涨跌停价。
 * ST/＊ST 股票使用 ±5%，普通 A 股使用 ±10%。
 */
function computeLimitPrices(
  prevClose: number,
  isST: boolean
): { limitUpPrice: number; limitDownPrice: number } {
  const pct = isST ? 0.05 : 0.10;
  return {
    limitUpPrice:   Math.round(prevClose * (1 + pct) * 1000) / 1000,
    limitDownPrice: Math.round(prevClose * (1 - pct) * 1000) / 1000,
  };
}

/** 从东方财富原始数据提取涨跌停相关字段（内部工具函数） */
function extractLimitFlags(
  price: number,
  open: number,
  low: number,
  volume: number,
  prevClose: number,
  nameForST: string,
  symbol: string,
  rawLimitUp: number | undefined,
  rawLimitDown: number | undefined,
  divisor: number
): Pick<
  QuoteData,
  | "limitUpPrice"
  | "limitDownPrice"
  | "isLimitUp"
  | "isLimitDown"
  | "isOneLimitUp"
  | "isOneLimitDown"
  | "isSuspended"
> {
  let limitUpPrice: number | undefined;
  let limitDownPrice: number | undefined;

  if (rawLimitUp != null && rawLimitUp > 0) {
    limitUpPrice = rawLimitUp / divisor;
  }
  if (rawLimitDown != null && rawLimitDown > 0) {
    limitDownPrice = rawLimitDown / divisor;
  }

  // 若东方财富未返回涨跌停价，从昨收价推算
  if (isAShare(symbol) && prevClose > 0) {
    if (!limitUpPrice || !limitDownPrice) {
      const isST = /ST|\*ST|S\*T/i.test(nameForST);
      const { limitUpPrice: lu, limitDownPrice: ld } = computeLimitPrices(prevClose, isST);
      limitUpPrice   = limitUpPrice   ?? lu;
      limitDownPrice = limitDownPrice ?? ld;
    }
  }

  const isSuspended    = volume === 0;
  const isLimitUp      = limitUpPrice   != null && Math.abs(price - limitUpPrice)   < 0.006;
  const isLimitDown    = limitDownPrice != null && Math.abs(price - limitDownPrice) < 0.006;
  // 一字板：全天价格几乎不离涨停价（开盘即封板）
  const isOneLimitUp   = isLimitUp  && Math.abs(open - (limitUpPrice  ?? 0)) < 0.006 && Math.abs(low - (limitUpPrice  ?? 0)) < 0.006;
  const isOneLimitDown = isLimitDown && Math.abs(open - (limitDownPrice ?? 0)) < 0.006;

  return { limitUpPrice, limitDownPrice, isLimitUp, isLimitDown, isOneLimitUp, isOneLimitDown, isSuspended };
}

// ─────────────────────────────────────────────────────────────────
// 单股行情
// ─────────────────────────────────────────────────────────────────

/**
 * 获取单只股票实时行情。
 *
 * @param symbol    股票代码（大写），如 "600519"、"00700"、"AAPL"
 * @param nameHint  可选名称提示，用于推算 ST 股票涨跌停价
 */
export async function fetchSingleQuote(
  symbol: string,
  nameHint?: string,
): Promise<QuoteData | null> {
  const now      = new Date().toISOString();
  const upperSym = symbol.toUpperCase().trim();
  const staticSt = getStockBySymbol(upperSym);
  const nameRef  = nameHint ?? staticSt?.name ?? upperSym;

  // ── 1. 美股 → Alpha Vantage ──────────────────────────────────
  if (isUSSymbol(upperSym) && hasAVKey()) {
    try {
      const q = await fetchAVQuote(upperSym);
      if (q && q.price > 0) {
        return {
          symbol:    upperSym,
          name:      nameRef,
          price:     q.price,
          change:    q.change,
          changePct: q.changePct,
          open:      q.open,
          high:      q.high,
          low:       q.low,
          prevClose: q.prevClose,
          volume:    q.volume,
          marketCap: staticSt?.marketCap,
          isRealtime: true,
          source:    "alphavantage",
          updatedAt: now,
        };
      }
    } catch { /* 降级到东方财富 */ }
  }

  // ── 2. 东方财富（A股 / 港股 / 美股兜底）──────────────────────
  const secid = getSecid(upperSym);
  if (secid) {
    try {
      const url =
        `https://push2.eastmoney.com/api/qt/stock/get` +
        `?secid=${secid}&fields=${EM_SINGLE_FIELDS}`;
      const res = await fetch(url, {
        headers: { Referer: "https://finance.eastmoney.com/" },
        next: { revalidate: 15 },
      });
      const json  = await res.json();
      const d     = json?.data as Record<string, unknown> | null;

      // 价格有效性判断
      if (d && d.f43 != null && d.f43 !== "-" && Number(d.f43) > 0) {
        const isHK    = secid.startsWith("116.");
        const divisor = isHK ? 1000 : 100;

        const price     = Number(d.f43) / divisor;
        const prevClose = Number(d.f60) / divisor;
        const open      = Number(d.f46) / divisor;
        const low       = Number(d.f45) / divisor;
        const volume    = Number(d.f47);

        // 成交额、换手率、量比
        const amount       = d.f6  != null && d.f6  !== "-" && Number(d.f6)  > 0 ? Number(d.f6)        : undefined;
        const turnoverRate = d.f8  != null && d.f8  !== "-" && Number(d.f8)  > 0 ? Number(d.f8) / 100  : undefined;
        const volumeRatio  = d.f10 != null && d.f10 !== "-" && Number(d.f10) > 0 ? Number(d.f10) / 100 : undefined;

        const nameFromAPI = d.f58 ? String(d.f58) : nameRef;

        const limitFlags = extractLimitFlags(
          price, open, low, volume, prevClose,
          nameFromAPI, upperSym,
          d.f51 != null && d.f51 !== "-" ? Number(d.f51) : undefined,
          d.f52 != null && d.f52 !== "-" ? Number(d.f52) : undefined,
          divisor,
        );

        return {
          symbol:    upperSym,
          name:      nameFromAPI,
          price,
          change:    Number(d.f169) / divisor,
          changePct: Number(d.f170) / 100,
          high:      Number(d.f44) / divisor,
          low,
          open,
          prevClose,
          volume,
          amount,
          turnoverRate,
          volumeRatio,
          ...limitFlags,
          marketCap:     d.f116 != null && Number(d.f116) > 0 ? Number(d.f116) : undefined,
          floatMarketCap: d.f117 != null && Number(d.f117) > 0 ? Number(d.f117) : undefined,
          isRealtime: true,
          source:    "eastmoney",
          updatedAt: now,
        };
      }
    } catch { /* 降级到静态数据 */ }
  }

  // ── 3. 静态兜底 ───────────────────────────────────────────────
  if (staticSt) {
    const prevClose = staticSt.price - staticSt.change;
    return {
      symbol:    upperSym,
      name:      staticSt.name,
      price:     staticSt.price,
      change:    staticSt.change,
      changePct: staticSt.changePct,
      high:      staticSt.price * 1.02,
      low:       staticSt.price * 0.98,
      open:      staticSt.price,
      prevClose,
      volume:    staticSt.volume ?? 0,
      marketCap: staticSt.marketCap,
      isRealtime: false,
      source:    "static",
      updatedAt: now,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────
// 批量行情
// ─────────────────────────────────────────────────────────────────

/**
 * 批量获取实时行情，支持 A股、港股、美股混合列表。
 *
 * @param symbols  股票代码数组（自动转大写）
 * @returns        Record<symbol, QuoteData>
 */
export async function fetchBatchQuotes(
  symbols: string[],
): Promise<Record<string, QuoteData>> {
  const now          = new Date().toISOString();
  const upperSymbols = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const results: Record<string, QuoteData> = {};

  // ── 1. Alpha Vantage（美股）──────────────────────────────────
  const usSymbols   = upperSymbols.filter(isUSSymbol);
  const cnhkSymbols = upperSymbols.filter((s) => !isUSSymbol(s));

  if (usSymbols.length > 0 && hasAVKey()) {
    try {
      const avQuotes = await fetchAVQuotesBatch(usSymbols, 350);
      for (const [sym, q] of Object.entries(avQuotes)) {
        const st = getStockBySymbol(sym);
        results[sym] = {
          symbol:    sym,
          name:      st?.name ?? st?.nameEn ?? sym,
          price:     q.price,
          change:    q.change,
          changePct: q.changePct,
          open:      q.open,
          high:      q.high,
          low:       q.low,
          prevClose: q.prevClose,
          volume:    q.volume,
          marketCap: st?.marketCap,
          isRealtime: true,
          source:    "alphavantage",
          updatedAt: now,
        };
      }
    } catch { /* 降级 */ }
  }

  // ── 2. 东方财富（A股 / 港股，+ 无 AV Key 时的美股）──────────
  const needEM = [
    ...cnhkSymbols,
    ...(hasAVKey() ? [] : usSymbols),
  ].filter((s) => !results[s]);

  if (needEM.length > 0) {
    // 东方财富批量接口每次最多 ~200 条，我们按 100 切分
    const CHUNK = 100;
    for (let i = 0; i < needEM.length; i += CHUNK) {
      const chunk  = needEM.slice(i, i + CHUNK);
      const secids = chunk.map(getSecid).filter(Boolean).join(",");
      if (!secids) continue;

      try {
        const url =
          `https://push2.eastmoney.com/api/qt/ulist.np/get` +
          `?secids=${secids}&fields=${EM_BATCH_FIELDS}`;
        const res  = await fetch(url, {
          headers: { Referer: "https://finance.eastmoney.com/" },
          next: { revalidate: 15 },
        });
        const json  = await res.json();
        const items = (json?.data?.diff ?? []) as Record<string, unknown>[];

        for (const item of items) {
          const d = item as Record<string, unknown> | null;
          if (!d || !d.f12) continue;

          const sym     = String(d.f12).toUpperCase();
          if (results[sym]) continue;

          const mktNum  = Number(d.f13 ?? 0);
          const isHK    = mktNum === 116;
          const divisor = isHK ? 1000 : 100;
          const price   = Number(d.f2) / divisor;
          if (!(price > 0)) continue;

          const prevClose = Number(d.f18) / divisor;
          const open      = Number(d.f17) / divisor;
          const low       = Number(d.f16) / divisor;
          const volume    = Number(d.f47);

          const amount       = d.f6  != null && d.f6  !== "-" && Number(d.f6)  > 0 ? Number(d.f6)        : undefined;
          const turnoverRate = d.f8  != null && d.f8  !== "-" && Number(d.f8)  > 0 ? Number(d.f8) / 100  : undefined;
          const volumeRatio  = d.f10 != null && d.f10 !== "-" && Number(d.f10) > 0 ? Number(d.f10) / 100 : undefined;
          const floatMarketCap = d.f21 != null && Number(d.f21) > 0 ? Number(d.f21) : undefined;

          const nameFromAPI = String(d.f14 ?? "");
          const limitFlags  = extractLimitFlags(
            price, open, low, volume, prevClose,
            nameFromAPI, sym,
            d.f51 != null && d.f51 !== "-" ? Number(d.f51) : undefined,
            d.f52 != null && d.f52 !== "-" ? Number(d.f52) : undefined,
            divisor,
          );

          results[sym] = {
            symbol:    sym,
            name:      nameFromAPI,
            price,
            change:    Number(d.f4) / divisor,
            changePct: Number(d.f3) / 100,
            high:      Number(d.f15) / divisor,
            low,
            open,
            prevClose,
            volume,
            amount,
            turnoverRate,
            volumeRatio,
            ...limitFlags,
            marketCap:     d.f116 != null && Number(d.f116) > 0 ? Number(d.f116) : undefined,
            floatMarketCap,
            isRealtime: true,
            source:    "eastmoney",
            updatedAt: now,
          };
        }
      } catch { /* 跳过该批次 */ }
    }
  }

  // ── 3. 静态兜底 ───────────────────────────────────────────────
  for (const sym of upperSymbols) {
    if (!results[sym]) {
      const st = getStockBySymbol(sym);
      if (st) {
        const prevClose = st.price - st.change;
        results[sym] = {
          symbol:    sym,
          name:      st.name,
          price:     st.price,
          change:    st.change,
          changePct: st.changePct,
          high:      st.price * 1.02,
          low:       st.price * 0.98,
          open:      st.price,
          prevClose,
          volume:    st.volume ?? 0,
          marketCap: st.marketCap,
          isRealtime: false,
          source:    "static",
          updatedAt: now,
        };
      }
    }
  }

  return results;
}
