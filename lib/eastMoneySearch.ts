/**
 * 东方财富全市场搜索 & 列表
 * Suggest API:  searchapi.eastmoney.com  — 关键词（中文/拼音/代码）
 * CList API:    push2.eastmoney.com      — 分页全量列表（A股 + 港股 + 美股），含实时行情
 *
 * MktNum 映射：
 *   0   = SZ 深圳（A股）
 *   1   = SH 上海（A股）
 *   2   = BJ 北京（A股）
 *   116 = 港交所（港股主板）
 *   105 = 美股 NYSE/NASDAQ/AMEX（东方财富美股数据库，约 7000+ 只）
 *
 * 美股 type 值（m:105 子类型）：
 *   t:1 = NYSE   t:2 = NASDAQ   t:3 = AMEX/OTC
 *
 * SecurityTypeName 关键字：
 *   "沪A"|"深A"|"北A" → A股
 *   "港股"            → 港股
 *   "美股"            → 美股
 */

const EM_SUGGEST = "https://searchapi.eastmoney.com/api/suggest/get";
const EM_CLIST   = "https://push2.eastmoney.com/api/qt/clist/get";

/** A股全市场（沪深北） */
const EM_A_FS  = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";
/** 港股主板 + 创业板 */
const EM_HK_FS = "m:116+t:3,m:116+t:4";
/** 美股全市场（NYSE + NASDAQ + AMEX） */
const EM_US_FS = "m:105+t:1,m:105+t:2,m:105+t:3";

const EM_FIELDS = "f2,f3,f4,f12,f13,f14,f20,f8";

// ── 类型 ────────────────────────────────────────────────────────

export type EMMarket = "A" | "HK" | "US";

export interface EMStock {
  symbol:    string;
  name:      string;
  market:    EMMarket;
  exchange:  "SH" | "SZ" | "BJ" | "HKEX" | "NYSE" | "NASDAQ" | "US";
  secid:     string;
  price:     number | null;
  change:    number | null;
  changePct: number | null;
  marketCap: number | null;
  turnover:  number | null;
}

export interface EMListResult {
  stocks:   EMStock[];
  total:    number;
  page:     number;
  pageSize: number;
}

// ── 内部工具 ────────────────────────────────────────────────────

function toExchange(
  mktNum: number,
  code: string,
): EMStock["exchange"] {
  if (mktNum === 1) return "SH";
  if (mktNum === 116) return "HKEX";
  if (mktNum === 105) return "US";
  if (mktNum === 2) return "BJ";
  // Fallback by code pattern
  if (/^(430|83|87|88)/.test(code)) return "BJ";
  return "SZ";
}

function toSecid(symbol: string, exchange: EMStock["exchange"]): string {
  if (exchange === "SH") return `1.${symbol}`;
  if (exchange === "HKEX") return `116.${symbol}`;
  if (exchange === "US") return `105.${symbol}`;
  return `0.${symbol}`;   // SZ / BJ
}

/** 从 SecurityTypeName / MktNum 识别市场 */
function detectMarket(mktNum: string, secTypeName: string): EMMarket | null {
  const m = parseInt(mktNum ?? "999");
  if (m === 0 || m === 1 || m === 2) return "A";
  if (m === 116 || secTypeName?.includes("港")) return "HK";
  if (m === 105 || secTypeName?.includes("美")) return "US";
  // Also match via TypeName strings
  if (secTypeName?.includes("沪A") || secTypeName?.includes("深A") || secTypeName?.includes("北A")) return "A";
  return null;
}

// ── Suggest 搜索（A + HK + US 全市场） ─────────────────────────

interface SuggestItem {
  Code:             string;
  Name:             string;
  MktNum:           string;
  SecurityTypeName: string;
  QuoteID:          string;
  TypeName:         string;
  Spelling:         string;
}

/**
 * 东方财富全市场关键词搜索
 *
 * @param query   关键词（中文/拼音首字母/代码）
 * @param market  null = 全市场；"A"/"HK"/"US" = 只搜对应市场
 * @param limit   返回条数（API 端限制，需稍大于 limit 以弥补过滤损耗）
 */
export async function searchEMByMarket(
  query:  string,
  market: EMMarket | null = null,
  limit = 20,
): Promise<EMStock[]> {
  if (!query.trim()) return [];

  // 请求多一些，避免过滤后不足
  const fetchCount = Math.min(limit * 3, 60);

  const url =
    `${EM_SUGGEST}?input=${encodeURIComponent(query)}` +
    `&type=14&count=${fetchCount}&markettype=&mktnum=&jys=&classify=` +
    `&securitytype=&status=&letter=&_=${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: { Referer: "https://www.eastmoney.com/" },
      next: { revalidate: 10 },
    });
    if (!res.ok) return [];

    const json = await res.json();
    const items: SuggestItem[] = json?.QuotationCodeTable?.Data ?? [];

    return items
      .filter((it) => {
        if (!it.Code || !it.Name) return false;
        // 只保留股票类型（排除基金/债券/期货等）
        if (it.TypeName && it.TypeName !== "股票") return false;
        const mkt = detectMarket(it.MktNum, it.SecurityTypeName);
        if (!mkt) return false;                 // 未知市场，跳过
        if (market && mkt !== market) return false; // 市场过滤
        return true;
      })
      .slice(0, limit)
      .map((it) => {
        const mkt      = detectMarket(it.MktNum, it.SecurityTypeName)!;
        const mktNumN  = parseInt(it.MktNum ?? "0");
        const exchange = toExchange(mktNumN, it.Code);
        const secid    = it.QuoteID ?? toSecid(it.Code, exchange);
        return {
          symbol:    it.Code,
          name:      it.Name,
          market:    mkt,
          exchange,
          secid,
          price:     null,
          change:    null,
          changePct: null,
          marketCap: null,
          turnover:  null,
        };
      });
  } catch (e) {
    console.error("[EM suggest] error:", e);
    return [];
  }
}

/** 向后兼容：A股搜索（仅搜 A 市场） */
export async function searchEMStocks(
  query: string,
  limit = 20,
): Promise<EMStock[]> {
  return searchEMByMarket(query, "A", limit);
}

// ── A股全量列表（含实时行情） ────────────────────────────────────

/**
 * 分页获取 A 股全市场列表
 */
export async function listEMStocks(
  page     = 1,
  pageSize = 50,
  sortField: "marketCap" | "changePct" | "price" | "turnover" = "marketCap",
  sortDesc = true,
): Promise<EMListResult> {
  const fidMap: Record<string, string> = {
    marketCap: "f20",
    changePct: "f3",
    price:     "f2",
    turnover:  "f8",
  };
  const fid = fidMap[sortField] ?? "f20";

  const url =
    `${EM_CLIST}?pn=${page}&pz=${Math.min(pageSize, 100)}&po=${sortDesc ? 1 : 0}` +
    `&np=1&fltt=2&invt=2&fid=${fid}` +
    `&fs=${encodeURIComponent(EM_A_FS)}` +
    `&fields=${EM_FIELDS}&_=${Date.now()}`;

  return _parseClist(url, "A", page, pageSize, 100);
}

// ── 港股全量列表（含实时行情） ────────────────────────────────────

/**
 * 分页获取港股列表（主板 + 创业板）
 */
export async function listEMHKStocks(
  page     = 1,
  pageSize = 50,
  sortField: "marketCap" | "changePct" | "price" | "turnover" = "marketCap",
  sortDesc = true,
): Promise<EMListResult> {
  const fidMap: Record<string, string> = {
    marketCap: "f20",
    changePct: "f3",
    price:     "f2",
    turnover:  "f8",
  };
  const fid = fidMap[sortField] ?? "f20";

  const url =
    `${EM_CLIST}?pn=${page}&pz=${Math.min(pageSize, 100)}&po=${sortDesc ? 1 : 0}` +
    `&np=1&fltt=2&invt=2&fid=${fid}` +
    `&fs=${encodeURIComponent(EM_HK_FS)}` +
    `&fields=${EM_FIELDS}&_=${Date.now()}`;

  return _parseClist(url, "HK", page, pageSize, 1000);
}

// ── 美股全量列表（含实时行情） ────────────────────────────────────

/**
 * 分页获取美股全市场列表（NYSE / NASDAQ / AMEX）
 *
 * 价格单位：美分（USD×100） → ÷100 = USD
 * 总量：东方财富数据库约 7 000+ 只美股
 */
export async function listEMUSStocks(
  page     = 1,
  pageSize = 50,
  sortField: "marketCap" | "changePct" | "price" | "turnover" = "marketCap",
  sortDesc = true,
): Promise<EMListResult> {
  const fidMap: Record<string, string> = {
    marketCap: "f20",
    changePct: "f3",
    price:     "f2",
    turnover:  "f8",
  };
  const fid = fidMap[sortField] ?? "f20";

  const url =
    `${EM_CLIST}?pn=${page}&pz=${Math.min(pageSize, 100)}&po=${sortDesc ? 1 : 0}` +
    `&np=1&fltt=2&invt=2&fid=${fid}` +
    `&fs=${encodeURIComponent(EM_US_FS)}` +
    `&fields=${EM_FIELDS}&_=${Date.now()}`;

  return _parseClist(url, "US", page, pageSize, 100);
}

/** 共用 clist 解析逻辑 */
async function _parseClist(
  url: string,
  market: EMMarket,
  page: number,
  pageSize: number,
  priceDivisor: number, // A股 100，港股 1000（HKD 分）
): Promise<EMListResult> {
  // 港股实际价格单位：港仙（HKD×1000）→ divisor=1000
  // A股价格单位：分（CNY×100）→ divisor=100
  // 用 market 自动判断
  const div = market === "HK" ? 1000 : 100;
  void priceDivisor; // use div instead

  try {
    const res = await fetch(url, {
      headers: { Referer: "https://quote.eastmoney.com/" },
      next: { revalidate: 15 },
    });
    if (!res.ok) return empty(page, pageSize);

    const json = await res.json();
    const total: number = json?.data?.total ?? 0;
    const items: unknown[] = json?.data?.diff ?? [];

    const INVALID = -268435456; // East Money sentinel for missing value

    const stocks: EMStock[] = items
      .map((raw) => {
        const d        = raw as Record<string, number | string>;
        const code     = String(d.f12 ?? "");
        const mktNum   = Number(d.f13 ?? 0);
        const exchange = toExchange(mktNum, code);
        const secid    = toSecid(code, exchange);

        const rawPrice  = Number(d.f2 ?? 0);
        const price     = rawPrice > 0 ? rawPrice / div : null;
        const changePct = Number(d.f3) !== INVALID ? Number(d.f3) / 100  : null;
        const change    = Number(d.f4) !== INVALID ? Number(d.f4) / div  : null;
        const marketCap = Number(d.f20) > 0         ? Number(d.f20)      : null;
        const turnover  = Number(d.f8)  !== INVALID ? Number(d.f8) / 100 : null;

        return {
          symbol: code,
          name:   String(d.f14 ?? ""),
          market,
          exchange,
          secid,
          price,
          change,
          changePct,
          marketCap,
          turnover,
        };
      })
      .filter((s) => s.symbol && s.name);

    return { stocks, total, page, pageSize };
  } catch (e) {
    console.error("[EM clist] error:", e);
    return empty(page, pageSize);
  }
}

function empty(page: number, pageSize: number): EMListResult {
  return { stocks: [], total: 0, page, pageSize };
}

/** 本地过滤备用搜索（clist 500条 → 本地 fuzzy match） */
export async function searchEMStocksFallback(
  query: string,
  limit = 30,
): Promise<EMStock[]> {
  const url =
    `${EM_CLIST}?pn=1&pz=500&po=1&np=1&fltt=2&invt=2&fid=f20` +
    `&fs=${encodeURIComponent(EM_A_FS)}` +
    `&fields=${EM_FIELDS}&_=${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: { Referer: "https://quote.eastmoney.com/" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const items: unknown[] = json?.data?.diff ?? [];
    const q = query.toUpperCase();

    return items
      .map((raw) => {
        const d  = raw as Record<string, number | string>;
        const code = String(d.f12 ?? "");
        const mktNum = Number(d.f13 ?? 0);
        const exchange = toExchange(mktNum, code);
        return {
          symbol: code, name: String(d.f14 ?? ""),
          market: "A" as EMMarket,
          exchange, secid: toSecid(code, exchange),
          price:     Number(d.f2) > 0  ? Number(d.f2) / 100  : null,
          change:    Number(d.f4) !== -268435456 ? Number(d.f4) / 100 : null,
          changePct: Number(d.f3) !== -268435456 ? Number(d.f3) / 100 : null,
          marketCap: Number(d.f20) > 0 ? Number(d.f20) : null,
          turnover:  Number(d.f8)  !== -268435456 ? Number(d.f8) / 100 : null,
        };
      })
      .filter((s) =>
        s.symbol.includes(q) ||
        s.name.toUpperCase().includes(q) ||
        s.symbol.startsWith(query)
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}
