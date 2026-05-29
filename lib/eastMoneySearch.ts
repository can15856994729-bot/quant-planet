/**
 * 东方财富全市场 A 股搜索 & 列表
 * Suggest API:  searchapi.eastmoney.com  — 关键词搜索（名称/拼音/代码）
 * CList API:    push2.eastmoney.com      — 分页全量列表，含实时行情
 *
 * A 股全市场约 5500 只（沪主板 + 沪科创板 + 深主板 + 深创业板 + 北交所）
 */

const EM_SUGGEST = "https://searchapi.eastmoney.com/api/suggest/get";
const EM_CLIST   = "https://push2.eastmoney.com/api/qt/clist/get";

/** 全 A 股市场筛选（沪深北全市场） */
const EM_A_FS =
  "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";

/** clist 返回字段：代码/名称/最新价/涨跌幅/涨跌额/总市值/换手率 */
const EM_FIELDS = "f2,f3,f4,f12,f13,f14,f20,f8";

export interface EMStock {
  symbol:    string;           // "600519"
  name:      string;           // "贵州茅台"
  exchange:  "SH" | "SZ" | "BJ";
  secid:     string;           // "1.600519" → 行情接口用
  price:     number | null;
  change:    number | null;
  changePct: number | null;
  marketCap: number | null;    // 元
  turnover:  number | null;    // 换手率 %
}

// ── 内部工具 ────────────────────────────────────────────────────

/** East Money market 编号 → 交易所 */
function toExchange(m: number): "SH" | "SZ" | "BJ" {
  if (m === 1) return "SH";
  if (m === 2) return "BJ";
  return "SZ";
}

/** 代码 + 交易所 → secid */
function toSecid(symbol: string, exchange: "SH" | "SZ" | "BJ"): string {
  if (exchange === "SH") return `1.${symbol}`;
  if (exchange === "BJ") return `0.${symbol}`;  // 北交所用 0 前缀
  return `0.${symbol}`;
}

/** secid 字符串 → 交易所 */
function secidToExchange(secid: string): "SH" | "SZ" | "BJ" {
  if (secid.startsWith("1.")) return "SH";
  const code = secid.split(".")[1] ?? "";
  // 430/83/87/8x 为北交所特征代码
  if (/^(430|83|87|88|83[0-9])/.test(code)) return "BJ";
  return "SZ";
}

// ── 搜索建议（关键词→匹配结果，覆盖全市场） ────────────────────

interface SuggestItem {
  Code:             string;
  Name:             string;
  MktNum:           string;   // "0"=SZ "1"=SH
  SecurityTypeName: string;
  QuoteID:          string;   // "1.600519"
  TypeName:         string;   // "股票"
}

/**
 * 按关键词搜索 A 股（名称 / 拼音首字母 / 代码均可）
 * @param query  搜索词，如 "茅台" "GZMT" "600519"
 * @param limit  返回条数，默认 20，最大 50
 */
export async function searchEMStocks(
  query: string,
  limit = 20,
): Promise<EMStock[]> {
  if (!query.trim()) return [];

  const url =
    `${EM_SUGGEST}?input=${encodeURIComponent(query)}` +
    `&type=14&count=${limit}&markettype=&mktnum=&jys=&classify=` +
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
      .filter((it) => it.TypeName === "股票" || it.SecurityTypeName?.includes("A"))
      .filter((it) => it.Code && it.Name)
      .map((it) => {
        const exchange = secidToExchange(it.QuoteID ?? `${it.MktNum}.${it.Code}`);
        return {
          symbol:    it.Code,
          name:      it.Name,
          exchange,
          secid:     it.QuoteID ?? toSecid(it.Code, exchange),
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

// ── 全量列表（分页，含实时行情） ─────────────────────────────────

export interface EMListResult {
  stocks:   EMStock[];
  total:    number;
  page:     number;
  pageSize: number;
}

/**
 * 分页获取 A 股全市场列表（含实时价格）
 * @param page       页码（从 1 开始）
 * @param pageSize   每页条数（最大 100）
 * @param sortField  排序字段："marketCap"（默认）| "changePct" | "price" | "turnover"
 * @param sortDesc   是否降序（默认 true）
 */
export async function listEMStocks(
  page     = 1,
  pageSize = 50,
  sortField: "marketCap" | "changePct" | "price" | "turnover" = "marketCap",
  sortDesc  = true,
): Promise<EMListResult> {
  const fidMap: Record<string, string> = {
    marketCap: "f20",
    changePct: "f3",
    price:     "f2",
    turnover:  "f8",
  };
  const fid = fidMap[sortField] ?? "f20";
  const po  = sortDesc ? 1 : 0;

  const url =
    `${EM_CLIST}?pn=${page}&pz=${Math.min(pageSize, 100)}&po=${po}` +
    `&np=1&fltt=2&invt=2&fid=${fid}` +
    `&fs=${encodeURIComponent(EM_A_FS)}` +
    `&fields=${EM_FIELDS}&_=${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: { Referer: "https://quote.eastmoney.com/" },
      next: { revalidate: 15 },   // 15 s 行情缓存
    });
    if (!res.ok) return { stocks: [], total: 0, page, pageSize };

    const json = await res.json();
    const total: number = json?.data?.total ?? 0;
    const items: unknown[] = json?.data?.diff ?? [];

    const stocks: EMStock[] = items.map((raw) => {
      const d = raw as Record<string, number | string>;
      const code     = String(d.f12 ?? "");
      const mktNum   = Number(d.f13 ?? 0);
      const exchange = toExchange(mktNum);
      const secid    = toSecid(code, exchange);

      const rawPrice = Number(d.f2 ?? 0);
      const price    = rawPrice > 0 ? rawPrice / 100 : null;
      const changePct = Number(d.f3 ?? 0) !== -268435456
        ? Number(d.f3) / 100
        : null;
      const change   = Number(d.f4 ?? 0) !== -268435456
        ? Number(d.f4) / 100
        : null;
      const marketCap = Number(d.f20 ?? 0) > 0 ? Number(d.f20) : null;
      const turnover  = Number(d.f8 ?? 0) !== -268435456
        ? Number(d.f8) / 100
        : null;

      return {
        symbol: code,
        name:   String(d.f14 ?? ""),
        exchange,
        secid,
        price,
        change,
        changePct,
        marketCap,
        turnover,
      };
    }).filter((s) => s.symbol && s.name);

    return { stocks, total, page, pageSize };
  } catch (e) {
    console.error("[EM clist] error:", e);
    return { stocks: [], total: 0, page, pageSize };
  }
}

/**
 * 在 clist 全量列表中按关键词模糊搜索
 * 注：East Money suggest 搜索更快，优先用 searchEMStocks；
 * 此函数作为备用，一次性拉 500 条后本地过滤。
 */
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
        const code     = String(d.f12 ?? "");
        const mktNum   = Number(d.f13 ?? 0);
        const exchange = toExchange(mktNum);
        return {
          symbol: code, name: String(d.f14 ?? ""),
          exchange, secid: toSecid(code, exchange),
          price:     Number(d.f2) > 0  ? Number(d.f2) / 100  : null,
          change:    Number(d.f4) !== -268435456 ? Number(d.f4) / 100 : null,
          changePct: Number(d.f3) !== -268435456 ? Number(d.f3) / 100 : null,
          marketCap: Number(d.f20) > 0 ? Number(d.f20) : null,
          turnover:  Number(d.f8)  !== -268435456 ? Number(d.f8)  / 100 : null,
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
