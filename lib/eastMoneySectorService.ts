/**
 * lib/eastMoneySectorService.ts
 *
 * 东方财富板块服务 — 仅限服务端 API Routes 调用
 * 数据来源：push2.eastmoney.com（公开接口，无需 Token）
 *
 * ⚠️ 本文件不涉及 TUSHARE_TOKEN，不可在客户端组件中 import。
 *    客户端通过 /api/eastmoney/sectors/* 路由间接使用。
 */

export type EMSectorType = "industry" | "concept" | "region" | "special";

export interface EMSector {
  code:          string;         // BK0477
  name:          string;         // 板块名称
  type:          EMSectorType;
  price:         number | null;  // 最新价（板块指数）
  changePct:     number | null;  // 涨跌幅 (%)
  amount:        number | null;  // 成交额（元）
  turnoverRate:  number | null;  // 换手率 (%)
  mainFlow:      number | null;  // 主力净流入（元）
  upCount:       number | null;  // 上涨家数
  downCount:     number | null;  // 下跌家数
  flatCount:     number | null;  // 平盘家数
  stockCount:    number | null;  // 合计家数
  leadCode:      string | null;  // 领涨股代码
  leadName:      string | null;  // 领涨股名称
  leadChangePct: number | null;  // 领涨股涨跌幅 (%)
}

export interface EMSectorStock {
  symbol:       string;          // 000001
  tsCode:       string;          // 000001.SZ
  name:         string;
  market:       number;          // 1=SH, 0=SZ, 2=BJ
  price:        number | null;
  changePct:    number | null;   // (%)
  changeAmt:    number | null;
  volume:       number | null;   // 手
  amount:       number | null;   // 元
  turnoverRate: number | null;   // (%)
  marketCap:    number | null;   // 总市值（元）
  floatMktCap:  number | null;   // 流通市值（元）
  pe:           number | null;   // 市盈率（动）
  mainFlow:     number | null;   // 主力净流入（元）
  high52:       number | null;   // 52周最高
  low52:        number | null;   // 52周最低
}

// ── EM board-type → fs 参数 ──────────────────────────────────────────────
const FS_MAP: Record<EMSectorType, string> = {
  industry: "m:90+t:2",
  concept:  "m:90+t:3",
  region:   "m:90+t:1",
  special:  "m:90+t:4",
};

// ── 请求头（模拟浏览器，避免 403）───────────────────────────────────────
const HEADERS: HeadersInit = {
  "Referer":    "https://finance.eastmoney.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept":     "*/*",
};

const BASE_CLIST = "https://push2.eastmoney.com/api/qt/clist/get";
const UT         = "bd1d9ddb04089700cf9c27f6f7426281";

// ── JSONP → JSON 解析 ────────────────────────────────────────────────────
function parseEM(text: string): unknown {
  // 东方财富返回 JSONP 格式：jQuery123({...});\n
  const stripped = text
    .replace(/^\s*[^(]+\(/, "")   // 去掉 "jQuery123456(" 前缀
    .replace(/\);\s*$/, "")        // 去掉 ");" 后缀
    .trim();
  return JSON.parse(stripped);
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  return null;
}
function toStr(v: unknown): string | null {
  if (typeof v === "string" && v !== "-" && v !== "") return v;
  return null;
}

// ── 板块列表 ──────────────────────────────────────────────────────────────
const SECTOR_FIELDS = [
  "f2",   // 最新价
  "f3",   // 涨跌幅
  "f6",   // 成交额
  "f8",   // 换手率
  "f12",  // 代码
  "f14",  // 名称
  "f62",  // 主力净流入
  "f104", // 上涨家数
  "f105", // 下跌家数
  "f106", // 平盘家数
  "f128", // 领涨股代码
  "f140", // 领涨股名称
  "f141", // 领涨股涨跌幅
  "f152",
].join(",");

export async function fetchEMSectors(
  type: EMSectorType,
  { timeout = 8000 }: { timeout?: number } = {}
): Promise<{ ok: boolean; sectors: EMSector[]; error?: string }> {
  const fs  = FS_MAP[type];
  const url = `${BASE_CLIST}?cb=jQuery&pn=1&pz=300&po=1&np=1&ut=${UT}&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(fs)}&fields=${SECTOR_FIELDS}&_=${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return { ok: false, sectors: [], error: `EM HTTP ${res.status}` };

    const text  = await res.text();
    const json  = parseEM(text) as { data?: { diff?: Record<string, unknown>[] } };
    const diff  = json?.data?.diff ?? [];
    if (!Array.isArray(diff)) return { ok: false, sectors: [], error: "EM 响应格式异常" };

    const sectors: EMSector[] = diff
      .map((item): EMSector | null => {
        const code = toStr(item.f12);
        const name = toStr(item.f14);
        if (!code || !name) return null;
        const up   = toNum(item.f104) ?? 0;
        const down = toNum(item.f105) ?? 0;
        const flat = toNum(item.f106) ?? 0;
        const total = up + down + flat;
        return {
          code,
          name,
          type,
          price:         toNum(item.f2),
          changePct:     toNum(item.f3),
          amount:        toNum(item.f6),
          turnoverRate:  toNum(item.f8),
          mainFlow:      toNum(item.f62),
          upCount:       up,
          downCount:     down,
          flatCount:     flat,
          stockCount:    total > 0 ? total : null,
          leadCode:      toStr(item.f128),
          leadName:      toStr(item.f140),
          leadChangePct: toNum(item.f141),
        };
      })
      .filter((s): s is EMSector => s !== null);

    return { ok: true, sectors };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, sectors: [], error: msg };
  }
}

// ── 板块内股票列表 ────────────────────────────────────────────────────────
const STOCK_FIELDS = [
  "f2",  // 最新价
  "f3",  // 涨跌幅
  "f4",  // 涨跌额
  "f5",  // 成交量（手）
  "f6",  // 成交额
  "f8",  // 换手率
  "f10", // 量比
  "f12", // 代码
  "f13", // 市场 (1=SH, 0=SZ, 2=BJ)
  "f14", // 名称
  "f20", // 总市值
  "f21", // 流通市值
  "f23", // 市盈率(动)
  "f62", // 主力净流入
  "f152",
].join(",");

export async function fetchEMSectorStocks(
  sectorCode: string,
  { timeout = 12000 }: { timeout?: number } = {}
): Promise<{ ok: boolean; stocks: EMSectorStock[]; error?: string }> {
  // f:!50 排除停牌（0=停牌，!50=非停牌），若需全量可去掉
  const fs  = `b:${sectorCode.toUpperCase()}`;
  const url = `${BASE_CLIST}?cb=jQuery&pn=1&pz=1000&po=1&np=1&ut=${UT}&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(fs)}&fields=${STOCK_FIELDS}&_=${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return { ok: false, stocks: [], error: `EM HTTP ${res.status}` };

    const text  = await res.text();
    const json  = parseEM(text) as { data?: { diff?: Record<string, unknown>[] } };
    const diff  = json?.data?.diff ?? [];
    if (!Array.isArray(diff)) return { ok: false, stocks: [], error: "EM 响应格式异常" };

    const stocks: EMSectorStock[] = diff
      .map((item): EMSectorStock | null => {
        const sym  = toStr(item.f12);
        const name = toStr(item.f14);
        if (!sym || !name) return null;
        const mkt = typeof item.f13 === "number" ? item.f13 : 0;
        const suffix = mkt === 1 ? ".SH" : mkt === 0 ? ".SZ" : ".BJ";
        return {
          symbol:       sym,
          tsCode:       sym + suffix,
          name,
          market:       mkt,
          price:        toNum(item.f2),
          changePct:    toNum(item.f3),
          changeAmt:    toNum(item.f4),
          volume:       toNum(item.f5),
          amount:       toNum(item.f6),
          turnoverRate: toNum(item.f8),
          marketCap:    toNum(item.f20),
          floatMktCap:  toNum(item.f21),
          pe:           toNum(item.f23),
          mainFlow:     toNum(item.f62),
          high52:       null,
          low52:        null,
        };
      })
      .filter((s): s is EMSectorStock => s !== null);

    return { ok: true, stocks };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, stocks: [], error: msg };
  }
}

// ── 单板块详情（从全量列表中查找）────────────────────────────────────────
const _sectorCache = new Map<EMSectorType, { data: EMSector[]; expiresAt: number }>();
const CACHE_TTL = 60 * 1000; // 60 秒

export async function fetchEMSectorDetail(
  sectorCode: string
): Promise<{ ok: boolean; sector?: EMSector; error?: string }> {
  const upper = sectorCode.toUpperCase();

  // 依次搜索各类型缓存或拉取
  for (const type of ["industry", "concept", "region", "special"] as EMSectorType[]) {
    const cached = _sectorCache.get(type);
    let sectors: EMSector[];

    if (cached && Date.now() < cached.expiresAt) {
      sectors = cached.data;
    } else {
      const r = await fetchEMSectors(type);
      if (!r.ok) continue;
      _sectorCache.set(type, { data: r.sectors, expiresAt: Date.now() + CACHE_TTL });
      sectors = r.sectors;
    }

    const found = sectors.find(s => s.code.toUpperCase() === upper);
    if (found) return { ok: true, sector: found };
  }
  return { ok: false, error: "板块不存在或暂无数据" };
}

// ── 工具：判断是否为东财板块代码 ─────────────────────────────────────────
export function isEMSectorCode(code: string): boolean {
  return /^BK\d+$/i.test(code);
}

// ── 批量获取板块总股票数（data.total，非交易时段也准确）────────────────
// EastMoney clist API 的 data.total 字段永远返回该板块真实成分股数量，
// 与 f104/f105/f106（涨跌平家数，非交易时段为 0）完全不同。
//
// 策略：pz=1（仅拉 1 条股票），读取 data.total
//   URL: BASE_CLIST?pn=1&pz=1&fs=b:<code>&fields=f12
//
const _countCache = new Map<string, { count: number; expiresAt: number }>();
const COUNT_CACHE_TTL = 30 * 60 * 1000; // 30 分钟

export async function fetchEMSectorCount(code: string): Promise<number | null> {
  const key = code.toUpperCase();

  // 内存缓存命中
  const hit = _countCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.count;

  const fs  = `b:${key}`;
  const url = `${BASE_CLIST}?cb=jQuery&pn=1&pz=1&ut=${UT}&fltt=2&invt=2&fs=${encodeURIComponent(fs)}&fields=f12&_=${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const text  = await res.text();
    const json  = parseEM(text) as { data?: { total?: unknown } };
    const raw   = json?.data?.total;
    const total = typeof raw === "number" && raw > 0 ? raw : null;

    if (total !== null) {
      _countCache.set(key, { count: total, expiresAt: Date.now() + COUNT_CACHE_TTL });
    }
    return total;
  } catch {
    return null;
  }
}

/**
 * 批量获取多个板块的 stockCount（并发 5）
 * @returns Record<upperCode, count | null>
 */
export async function fetchEMSectorCountBatch(
  codes: string[],
  concurrency = 5,
): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};
  const upper = codes.map(c => c.toUpperCase());

  // 先从内存缓存填充
  const pending: string[] = [];
  for (const code of upper) {
    const hit = _countCache.get(code);
    if (hit && Date.now() < hit.expiresAt) {
      result[code] = hit.count;
    } else {
      pending.push(code);
    }
  }

  // 并发请求未命中的
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(code => fetchEMSectorCount(code)),
    );
    settled.forEach((r, idx) => {
      result[batch[idx]] = r.status === "fulfilled" ? r.value : null;
    });
  }

  return result;
}
