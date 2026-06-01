/**
 * lib/eastMoneyOrderBookService.ts
 *
 * 东方财富实时盘口数据服务 — 服务端专用，禁止在 Client Component 中直接导入。
 *
 * 数据源：push2.eastmoney.com (公开接口，无需 token)
 * 缓存：单只 3 s TTL | 批量并发限 5 s TTL
 *
 * 安全约束：
 *   - 不含 TUSHARE_TOKEN，该 token 仅在 tushareService.ts 中使用
 *   - 前端必须通过 /api/quotes/order-book/* 访问，不得直接调用本服务
 */

import type { OrderBookData, OrderBookLevel } from "@/types";
export type { OrderBookData, OrderBookLevel };

// ── 缓存 ─────────────────────────────────────────────────────────
const SINGLE_TTL = 3_000;  // ms
const cacheMap   = new Map<string, { data: OrderBookData; expiresAt: number }>();

function getCached(sym: string): OrderBookData | null {
  const item = cacheMap.get(sym);
  if (item && item.expiresAt > Date.now()) return item.data;
  cacheMap.delete(sym);
  return null;
}
function setCached(sym: string, data: OrderBookData, ttl = SINGLE_TTL) {
  cacheMap.set(sym, { data, expiresAt: Date.now() + ttl });
  if (cacheMap.size > 600) {
    // 淘汰最旧的 100 条
    let n = 0;
    for (const k of cacheMap.keys()) {
      if (n++ >= 100) break;
      cacheMap.delete(k);
    }
  }
}

// ── secid 计算 ────────────────────────────────────────────────────
export function symbolToSecid(symbol: string): string {
  if (symbol.startsWith("6") || symbol.startsWith("9")) return `1.${symbol}`;
  if (symbol.startsWith("8") || symbol.startsWith("4")) return `0.${symbol}`;
  return `0.${symbol}`;
}

export function symbolToTsCode(symbol: string): string {
  if (symbol.startsWith("6") || symbol.startsWith("9")) return `${symbol}.SH`;
  if (symbol.startsWith("8") || symbol.startsWith("4")) return `${symbol}.BJ`;
  return `${symbol}.SZ`;
}

// ── 字段列表 ──────────────────────────────────────────────────────
// f2  = 最新价×100       f3  = 涨跌幅×100     f4  = 涨跌额×100
// f5  = 成交量手          f6  = 成交额元        f8  = 换手率×100
// f10 = 量比×100         f12 = 代码            f14 = 名称
// f15 = 最高×100         f16 = 最低×100        f17 = 今开×100
// f18 = 昨收×100         f43 = 最新价×100      f44 = 最高×100
// f45 = 最低×100         f46 = 今开×100        f47 = 成交量手
// f48 = 成交额元          f49 = 外盘手          f51 = 涨停价×100
// f52 = 跌停价×100        f57 = 代码            f58 = 名称
// f60 = 昨收×100          f105 = 内盘手
// 买一~买五价: f19~f23 (×100)   买一~买五量: f24~f28 (手)
// 卖一~卖五价: f31~f35 (×100)   卖一~卖五量: f36~f40 (手)
const EM_FIELDS = [
  "f2","f3","f4","f5","f6","f8","f10",
  "f12","f14","f15","f16","f17","f18",
  "f19","f20","f21","f22","f23",
  "f24","f25","f26","f27","f28",
  "f31","f32","f33","f34","f35",
  "f36","f37","f38","f39","f40",
  "f43","f44","f45","f46","f47","f48",
  "f49","f51","f52","f57","f58","f60","f105",
].join(",");

// ── 安全数字转换 ──────────────────────────────────────────────────
function safeNum(v: unknown): number | null {
  if (v == null || v === "-" || v === "" || v === "null") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// ── 单档盘口构建 ──────────────────────────────────────────────────
function buildLevel(
  pRaw: unknown,
  vRaw: unknown,
  level: number,
  div: number,
): OrderBookLevel | null {
  const p = safeNum(pRaw);
  const v = safeNum(vRaw);
  if (p == null || p <= 0 || v == null) return null;
  const price  = p / div;
  const shares = v * 100;          // 手 → 股
  return { level, price, volume: shares, amount: +(price * shares).toFixed(2) };
}

// ── 核心抓取 ──────────────────────────────────────────────────────
export async function fetchOrderBook(symbol: string): Promise<OrderBookData | null> {
  const sym    = symbol.toUpperCase().trim();
  const cached = getCached(sym);
  if (cached) return cached;

  const secid  = symbolToSecid(sym);
  const tsCode = symbolToTsCode(sym);
  const now    = new Date().toISOString();

  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/get` +
      `?secid=${secid}&fields=${EM_FIELDS}` +
      `&ut=fa5fd1943c7b386f172d6893dbfba10b`;

    const res = await fetch(url, {
      headers: {
        Referer:    "https://finance.eastmoney.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(8_000),
      // 不使用 Next.js 的 revalidate 缓存，由本模块自行管理
      cache: "no-store",
    });

    if (!res.ok) return null;
    const json = await res.json();
    const d    = json?.data as Record<string, unknown> | null;
    if (!d) return null;

    // ── 价格（A 股除以 100，港股除以 1000）────────────────────────
    const priceRaw = safeNum(d.f43) ?? safeNum(d.f2);
    if (!priceRaw || priceRaw <= 0) return null;

    const div      = 100;  // A-share
    const price    = priceRaw / div;
    const prevClose = (safeNum(d.f60) ?? safeNum(d.f18) ?? 0) / div;
    const open      = (safeNum(d.f46) ?? safeNum(d.f17) ?? 0) / div;
    const high      = (safeNum(d.f44) ?? safeNum(d.f15) ?? 0) / div;
    const low       = (safeNum(d.f45) ?? safeNum(d.f16) ?? 0) / div;
    const changePct = (safeNum(d.f3) ?? 0) / 100;
    const volHand   = safeNum(d.f47) ?? safeNum(d.f5) ?? 0;
    const volume    = volHand * 100;  // 手 → 股
    const amount    = safeNum(d.f6) ?? safeNum(d.f48) ?? 0;
    const name      = String(d.f58 ?? d.f14 ?? sym);

    // ── 量比、换手率 ──────────────────────────────────────────────
    const volumeRatio  = safeNum(d.f10) != null ? safeNum(d.f10)! / 100 : null;

    // ── 内外盘、委比 ──────────────────────────────────────────────
    const outerVol  = safeNum(d.f49);   // 外盘（手）
    const innerVol  = safeNum(d.f105);  // 内盘（手）— 部分行情可能无此字段

    let commissionRatio: number | null = null;
    if (outerVol != null && innerVol != null) {
      const total = outerVol + innerVol;
      commissionRatio = total > 0 ? +((outerVol - innerVol) / total * 100).toFixed(2) : 0;
    } else if (outerVol != null && volHand > 0) {
      const inner = Math.max(0, volHand - outerVol);
      commissionRatio = volHand > 0 ? +((outerVol - inner) / volHand * 100).toFixed(2) : null;
    }

    // ── 涨跌停价 ──────────────────────────────────────────────────
    const luRaw = safeNum(d.f51);
    const ldRaw = safeNum(d.f52);
    const limitUpPrice   = luRaw != null && luRaw > 0 ? +(luRaw / div).toFixed(2) : null;
    const limitDownPrice = ldRaw != null && ldRaw > 0 ? +(ldRaw / div).toFixed(2) : null;

    // 若 EastMoney 未返回，用昨收推算（普通 A 股 ±10%，ST ±5%）
    const computedLimits = (() => {
      if (limitUpPrice && limitDownPrice) return { lu: limitUpPrice, ld: limitDownPrice };
      if (prevClose <= 0) return null;
      const isST  = /ST|\*ST|S\*T/i.test(name);
      const pct   = isST ? 0.05 : 0.10;
      return {
        lu: +(prevClose * (1 + pct)).toFixed(2),
        ld: +(prevClose * (1 - pct)).toFixed(2),
      };
    })();

    const finalLU = limitUpPrice   ?? computedLimits?.lu ?? null;
    const finalLD = limitDownPrice ?? computedLimits?.ld ?? null;

    // ── 状态判断 ──────────────────────────────────────────────────
    const isSuspended      = volume === 0;
    const isLimitUp        = finalLU != null && Math.abs(price - finalLU) < 0.006;
    const isLimitDown      = finalLD != null && Math.abs(price - finalLD) < 0.006;
    const isOneWordLimitUp = isLimitUp  && open > 0 &&
      Math.abs(open - (finalLU ?? 0)) < 0.006 &&
      Math.abs(low  - (finalLU ?? 0)) < 0.006;
    const isOneWordLimitDown = isLimitDown && open > 0 &&
      Math.abs(open - (finalLD ?? 0)) < 0.006;

    // ── 五档盘口 ──────────────────────────────────────────────────
    const bids: OrderBookLevel[] = [
      buildLevel(d.f19, d.f24, 1, div),
      buildLevel(d.f20, d.f25, 2, div),
      buildLevel(d.f21, d.f26, 3, div),
      buildLevel(d.f22, d.f27, 4, div),
      buildLevel(d.f23, d.f28, 5, div),
    ].filter((l): l is OrderBookLevel => l != null);

    const asks: OrderBookLevel[] = [
      buildLevel(d.f31, d.f36, 1, div),
      buildLevel(d.f32, d.f37, 2, div),
      buildLevel(d.f33, d.f38, 3, div),
      buildLevel(d.f34, d.f39, 4, div),
      buildLevel(d.f35, d.f40, 5, div),
    ].filter((l): l is OrderBookLevel => l != null);

    const bid1 = bids.find(l => l.level === 1) ?? null;
    const ask1 = asks.find(l => l.level === 1) ?? null;

    // ── 封单计算 ──────────────────────────────────────────────────
    // 涨停时：买一在涨停价 → 买一量就是涨停封单
    // 跌停时：卖一在跌停价 → 卖一量就是跌停封单
    let limitUpSealVolume:   number | null = null;
    let limitUpSealAmount:   number | null = null;
    let limitDownSealVolume: number | null = null;
    let limitDownSealAmount: number | null = null;
    let sealAmount:          number | null = null;

    if (isLimitUp && bid1 && finalLU != null && Math.abs(bid1.price - finalLU) < 0.006) {
      limitUpSealVolume = bid1.volume / 100;           // 股→手
      limitUpSealAmount = bid1.amount;
      sealAmount        = bid1.amount;
    }
    if (isLimitDown && ask1 && finalLD != null && Math.abs(ask1.price - finalLD) < 0.006) {
      limitDownSealVolume = ask1.volume / 100;
      limitDownSealAmount = ask1.amount;
      sealAmount          = ask1.amount;
    }

    const result: OrderBookData = {
      symbol: sym,
      tsCode,
      name,
      price,
      prevClose,
      open,
      high,
      low,
      changePercent: changePct,
      volume,
      amount,
      bid1Price:  bid1?.price  ?? null,
      bid1Volume: bid1?.volume ?? null,
      ask1Price:  ask1?.price  ?? null,
      ask1Volume: ask1?.volume ?? null,
      bids,
      asks,
      commissionRatio,
      volumeRatio,
      innerVolume: innerVol,
      outerVolume: outerVol,
      limitUpPrice:     finalLU,
      limitDownPrice:   finalLD,
      isLimitUp,
      isLimitDown,
      isOneWordLimitUp,
      isOneWordLimitDown,
      isSuspended,
      limitUpSealVolume,
      limitUpSealAmount,
      limitDownSealVolume,
      limitDownSealAmount,
      sealAmount,
      updatedAt: now,
      source:    "EastMoney",
    };

    setCached(sym, result, SINGLE_TTL);
    return result;
  } catch {
    return null;
  }
}

// ── 批量抓取 ──────────────────────────────────────────────────────
export async function fetchBatchOrderBooks(
  symbols: string[],
  concurrency = 5,
): Promise<Record<string, OrderBookData>> {
  const results: Record<string, OrderBookData> = {};
  const queue = [...symbols];

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    await Promise.allSettled(
      batch.map(async (sym) => {
        const data = await fetchOrderBook(sym);
        if (data) results[sym.toUpperCase()] = data;
      })
    );
  }

  return results;
}
