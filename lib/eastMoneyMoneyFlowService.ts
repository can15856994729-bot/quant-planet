/**
 * lib/eastMoneyMoneyFlowService.ts
 *
 * 东方财富资金流数据服务 — 仅限服务端 API Routes 调用
 * 数据来源：push2.eastmoney.com（公开接口，无需 Token）
 *
 * 提供：
 *  - 个股当日资金流（主力/超大单/大单/中单/小单）
 *  - 个股多日资金流历史（按天）
 *  - 板块资金流（行业/概念）
 *  - 全市场资金流排行
 *
 * ⚠️ 本文件不使用 TUSHARE_TOKEN，不可在客户端组件中 import。
 *    客户端通过 /api/eastmoney/money-flow/* 路由间接使用。
 *
 * 错误处理原则：
 *  - 接口失败 → ok: false + error 字段，绝不返回假数据
 *  - 字段缺失 → null（不用 0 冒充）
 *  - 超时 8s（个股）/ 12s（排行）
 */

// ── 公共头部 ──────────────────────────────────────────────────────────────
const HEADERS: HeadersInit = {
  "Referer":    "https://data.eastmoney.com/zjlx/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept":     "*/*",
};

const UT = "b2884a393a59ad64002292a3e90d46a5";
const BASE = "https://push2.eastmoney.com/api/qt";

// ── JSONP 解析 ────────────────────────────────────────────────────────────
function parseEM(text: string): unknown {
  const s = text
    .replace(/^\s*[^(]+\(/, "")
    .replace(/\);\s*$/, "")
    .trim();
  return JSON.parse(s);
}

// ── 类型安全的字段提取 ────────────────────────────────────────────────────
function toNum(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v) && v !== -2147483648) return v;
  return null;
}
function toStr(v: unknown): string | null {
  if (typeof v === "string" && v !== "-" && v !== "") return v;
  return null;
}

// ── secid 格式转换 ────────────────────────────────────────────────────────
/** 将股票代码转换为东方财富 secid（市场.代码） */
export function symbolToSecid(symbol: string): string {
  if (symbol.startsWith("6")) return `1.${symbol}`;
  if (symbol.startsWith("0") || symbol.startsWith("3")) return `0.${symbol}`;
  if (symbol.startsWith("8") || symbol.startsWith("4")) return `0.${symbol}`;
  return `1.${symbol}`; // 默认 SH
}

// ── 类型定义 ──────────────────────────────────────────────────────────────

export interface StockMoneyFlow {
  symbol:    string;
  tsCode:    string;
  name:      string;
  price:     number | null;
  changePct: number | null;

  // 今日资金流（元）
  mainNetInflow:       number | null;
  superLargeNetInflow: number | null;
  largeNetInflow:      number | null;
  mediumNetInflow:     number | null;
  smallNetInflow:      number | null;

  // 今日净占比（%）
  mainNetInflowPercent:       number | null;
  superLargeNetInflowPercent: number | null;
  largeNetInflowPercent:      number | null;
  mediumNetInflowPercent:     number | null;
  smallNetInflowPercent:      number | null;

  // 5日资金流（元）
  fiveDayMainNetInflow:          number | null;
  fiveDaySuperLargeNetInflow:    number | null;
  fiveDayLargeNetInflow:         number | null;
  fiveDayMediumNetInflow:        number | null;
  fiveDaySmallNetInflow:         number | null;
  fiveDayMainNetInflowPercent:   number | null;

  // 10日资金流（元）
  tenDayMainNetInflow:          number | null;
  tenDaySuperLargeNetInflow:    number | null;
  tenDayLargeNetInflow:         number | null;
  tenDayMediumNetInflow:        number | null;
  tenDaySmallNetInflow:         number | null;
  tenDayMainNetInflowPercent:   number | null;

  updatedAt: string;
  source:    "EastMoney";
}

export interface MoneyFlowDayBar {
  date:                string;
  mainNetInflow:       number | null;
  superLargeNetInflow: number | null;
  largeNetInflow:      number | null;
  mediumNetInflow:     number | null;
  smallNetInflow:      number | null;
}

export interface SectorMoneyFlow {
  sectorCode:  string;
  sectorName:  string;
  sectorType:  "industry" | "concept" | "region" | "special";
  changePct:   number | null;
  amount:      number | null;

  // 今日（元）
  mainNetInflow:       number | null;
  superLargeNetInflow: number | null;
  largeNetInflow:      number | null;
  mediumNetInflow:     number | null;
  smallNetInflow:      number | null;
  mainNetInflowPercent: number | null;

  // 5日（元）
  fiveDayMainNetInflow:        number | null;
  fiveDayMainNetInflowPercent: number | null;

  // 10日（元）
  tenDayMainNetInflow:        number | null;
  tenDayMainNetInflowPercent: number | null;

  // 成分股数量
  upCount:    number | null;
  downCount:  number | null;
  stockCount: number | null;

  // 领涨股
  leadingStock:            string | null;
  leadingStockChangePct:   number | null;

  updatedAt: string;
  source:    "EastMoney";
}

export interface MoneyFlowRankItem {
  symbol:    string;
  tsCode:    string;
  name:      string;
  market:    number;
  price:     number | null;
  changePct: number | null;
  amount:    number | null;

  mainNetInflow:          number | null;
  mainNetInflowPercent:   number | null;
  superLargeNetInflow:    number | null;
  largeNetInflow:         number | null;
  mediumNetInflow:        number | null;
  smallNetInflow:         number | null;

  fiveDayMainNetInflow:   number | null;
  tenDayMainNetInflow:    number | null;
}

// ── 个股当日资金流 ────────────────────────────────────────────────────────

const STOCK_FLOW_FIELDS = [
  "f2",   // 最新价
  "f3",   // 涨跌幅
  "f12",  // 代码
  "f14",  // 名称
  "f62",  // 主力净流入
  "f184", // 主力净流入净占比
  "f66",  // 超大单净流入
  "f69",  // 超大单净流入净占比
  "f72",  // 大单净流入
  "f75",  // 大单净流入净占比
  "f78",  // 中单净流入
  "f81",  // 中单净流入净占比
  "f84",  // 小单净流入
  "f87",  // 小单净流入净占比
  "f164", // 5日主力净流入
  "f174", // 5日主力净流入净占比
  "f165", // 5日超大单净流入
  "f166", // 5日大单净流入
  "f167", // 5日中单净流入
  "f168", // 5日小单净流入
  "f169", // 10日主力净流入
  "f179", // 10日主力净流入净占比
  "f170", // 10日超大单净流入
  "f171", // 10日大单净流入
  "f172", // 10日中单净流入
  "f173", // 10日小单净流入
].join(",");

export async function fetchStockMoneyFlow(
  symbol: string,
  { timeout = 8000 }: { timeout?: number } = {}
): Promise<{ ok: boolean; data?: StockMoneyFlow; error?: string }> {
  const secid  = symbolToSecid(symbol);
  const url = `${BASE}/stock/get?secid=${secid}&fields=${STOCK_FLOW_FIELDS}&ut=${UT}&cb=jQuery&_=${Date.now()}`;

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return { ok: false, error: `EM HTTP ${res.status}` };

    const text = await res.text();
    const json = parseEM(text) as { data?: Record<string, unknown> };
    const d    = json?.data;
    if (!d) return { ok: false, error: "EM 资金流响应为空" };

    const sym  = toStr(d.f12) ?? symbol;
    const mkt  = typeof d.f13 === "number" ? d.f13 : (symbol.startsWith("6") ? 1 : 0);
    const sfx  = mkt === 1 ? ".SH" : mkt === 0 ? ".SZ" : ".BJ";

    const data: StockMoneyFlow = {
      symbol:    sym,
      tsCode:    sym + sfx,
      name:      toStr(d.f14) ?? symbol,
      price:     toNum(d.f2),
      changePct: toNum(d.f3),

      mainNetInflow:       toNum(d.f62),
      superLargeNetInflow: toNum(d.f66),
      largeNetInflow:      toNum(d.f72),
      mediumNetInflow:     toNum(d.f78),
      smallNetInflow:      toNum(d.f84),

      mainNetInflowPercent:       toNum(d.f184),
      superLargeNetInflowPercent: toNum(d.f69),
      largeNetInflowPercent:      toNum(d.f75),
      mediumNetInflowPercent:     toNum(d.f81),
      smallNetInflowPercent:      toNum(d.f87),

      fiveDayMainNetInflow:        toNum(d.f164),
      fiveDaySuperLargeNetInflow:  toNum(d.f165),
      fiveDayLargeNetInflow:       toNum(d.f166),
      fiveDayMediumNetInflow:      toNum(d.f167),
      fiveDaySmallNetInflow:       toNum(d.f168),
      fiveDayMainNetInflowPercent: toNum(d.f174),

      tenDayMainNetInflow:        toNum(d.f169),
      tenDaySuperLargeNetInflow:  toNum(d.f170),
      tenDayLargeNetInflow:       toNum(d.f171),
      tenDayMediumNetInflow:      toNum(d.f172),
      tenDaySmallNetInflow:       toNum(d.f173),
      tenDayMainNetInflowPercent: toNum(d.f179),

      updatedAt: new Date().toISOString(),
      source:    "EastMoney",
    };

    // 验证：至少主力净流入字段存在（接口可能不支持此股票）
    if (data.mainNetInflow === null && data.fiveDayMainNetInflow === null) {
      return { ok: false, error: "该股票暂无资金流数据（可能为新股或北交所股票）" };
    }

    return { ok: true, data };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ── 个股每日资金流历史 ────────────────────────────────────────────────────

export async function fetchStockMoneyFlowHistory(
  symbol: string,
  { days = 10, timeout = 10000 }: { days?: number; timeout?: number } = {}
): Promise<{ ok: boolean; bars?: MoneyFlowDayBar[]; error?: string }> {
  const secid = symbolToSecid(symbol);
  // klt=101 = 日线，lmt 为最近N日
  const url = `${BASE}/stock/fflow/dayk/get?lmt=${days}&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56&ut=${UT}&secid=${secid}&cb=jQuery&_=${Date.now()}`;

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return { ok: false, error: `EM HTTP ${res.status}` };

    const text = await res.text();
    const json = parseEM(text) as {
      data?: { klines?: string[] }
    };
    const klines = json?.data?.klines ?? [];
    if (!Array.isArray(klines) || klines.length === 0) {
      return { ok: false, error: "暂无历史资金流数据" };
    }

    const bars: MoneyFlowDayBar[] = klines.map(line => {
      const parts = line.split(",");
      return {
        date:                parts[0] ?? "",
        mainNetInflow:       parts[1] ? +parts[1] : null,
        superLargeNetInflow: parts[2] ? +parts[2] : null,
        largeNetInflow:      parts[3] ? +parts[3] : null,
        mediumNetInflow:     parts[4] ? +parts[4] : null,
        smallNetInflow:      parts[5] ? +parts[5] : null,
      };
    });

    return { ok: true, bars };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ── 板块资金流 ────────────────────────────────────────────────────────────

const SECTOR_FLOW_FIELDS = [
  "f2",   // 最新价（板块指数）
  "f3",   // 涨跌幅
  "f6",   // 成交额
  "f12",  // 代码
  "f14",  // 名称
  "f62",  // 主力净流入
  "f184", // 主力净流入净占比
  "f66",  // 超大单净流入
  "f72",  // 大单净流入
  "f78",  // 中单净流入
  "f84",  // 小单净流入
  "f164", // 5日主力净流入
  "f174", // 5日主力净流入净占比
  "f169", // 10日主力净流入
  "f179", // 10日主力净流入净占比
  "f104", // 上涨家数
  "f105", // 下跌家数
  "f106", // 平盘家数
  "f128", // 领涨股代码
  "f140", // 领涨股名称
  "f141", // 领涨股涨跌幅
].join(",");

const SECTOR_TYPE_FS: Record<string, string> = {
  industry: "m:90+t:2",
  concept:  "m:90+t:3",
  region:   "m:90+t:1",
  special:  "m:90+t:4",
};

export async function fetchSectorMoneyFlow(
  sectorType: "industry" | "concept" | "region" | "special",
  { timeout = 10000 }: { timeout?: number } = {}
): Promise<{ ok: boolean; sectors?: SectorMoneyFlow[]; error?: string }> {
  const fs  = SECTOR_TYPE_FS[sectorType];
  const url = `${BASE}/clist/get?cb=jQuery&pn=1&pz=200&po=1&np=1&ut=${UT}&fltt=2&invt=2&fid=f62&fs=${encodeURIComponent(fs)}&fields=${SECTOR_FLOW_FIELDS}&_=${Date.now()}`;

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return { ok: false, error: `EM HTTP ${res.status}` };

    const text = await res.text();
    const json = parseEM(text) as { data?: { diff?: Record<string, unknown>[] } };
    const diff = json?.data?.diff ?? [];
    if (!Array.isArray(diff)) return { ok: false, error: "EM 响应格式异常" };

    const now = new Date().toISOString();
    const sectors: SectorMoneyFlow[] = diff
      .map((item): SectorMoneyFlow | null => {
        const code = toStr(item.f12);
        const name = toStr(item.f14);
        if (!code || !name) return null;
        const up    = toNum(item.f104) ?? 0;
        const down  = toNum(item.f105) ?? 0;
        const flat  = toNum(item.f106) ?? 0;
        const total = up + down + flat;
        return {
          sectorCode:  code,
          sectorName:  name,
          sectorType,
          changePct:   toNum(item.f3),
          amount:      toNum(item.f6),
          mainNetInflow:          toNum(item.f62),
          superLargeNetInflow:    toNum(item.f66),
          largeNetInflow:         toNum(item.f72),
          mediumNetInflow:        toNum(item.f78),
          smallNetInflow:         toNum(item.f84),
          mainNetInflowPercent:   toNum(item.f184),
          fiveDayMainNetInflow:        toNum(item.f164),
          fiveDayMainNetInflowPercent: toNum(item.f174),
          tenDayMainNetInflow:        toNum(item.f169),
          tenDayMainNetInflowPercent: toNum(item.f179),
          upCount:     up,
          downCount:   down,
          stockCount:  total > 0 ? total : null,
          leadingStock:          toStr(item.f140),
          leadingStockChangePct: toNum(item.f141),
          updatedAt: now,
          source:    "EastMoney",
        };
      })
      .filter((s): s is SectorMoneyFlow => s !== null);

    return { ok: true, sectors };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ── 全市场个股资金流排行 ──────────────────────────────────────────────────

const A_SHARE_FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";

const RANKING_FIELDS = [
  "f2",   // 最新价
  "f3",   // 涨跌幅
  "f6",   // 成交额
  "f12",  // 代码
  "f13",  // 市场
  "f14",  // 名称
  "f62",  // 主力净流入
  "f184", // 主力净流入净占比
  "f66",  // 超大单净流入
  "f72",  // 大单净流入
  "f78",  // 中单净流入
  "f84",  // 小单净流入
  "f164", // 5日主力净流入
  "f169", // 10日主力净流入
].join(",");

export async function fetchMoneyFlowRanking(
  {
    limit   = 100,
    order   = "desc",  // desc=流入, asc=流出
    timeout = 12000,
  }: {
    limit?:   number;
    order?:   "asc" | "desc";
    timeout?: number;
  } = {}
): Promise<{ ok: boolean; stocks?: MoneyFlowRankItem[]; error?: string }> {
  const po  = order === "desc" ? 1 : 0;
  const url = `${BASE}/clist/get?cb=jQuery&pn=1&pz=${limit}&po=${po}&np=1&ut=${UT}&fltt=2&invt=2&fid=f62&fs=${encodeURIComponent(A_SHARE_FS)}&fields=${RANKING_FIELDS}&_=${Date.now()}`;

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return { ok: false, error: `EM HTTP ${res.status}` };

    const text = await res.text();
    const json = parseEM(text) as { data?: { diff?: Record<string, unknown>[] } };
    const diff = json?.data?.diff ?? [];
    if (!Array.isArray(diff)) return { ok: false, error: "EM 响应格式异常" };

    const stocks: MoneyFlowRankItem[] = diff
      .map((item): MoneyFlowRankItem | null => {
        const sym  = toStr(item.f12);
        const name = toStr(item.f14);
        if (!sym || !name) return null;
        const mkt = typeof item.f13 === "number" ? item.f13 : 0;
        const sfx = mkt === 1 ? ".SH" : mkt === 0 ? ".SZ" : ".BJ";
        return {
          symbol:    sym,
          tsCode:    sym + sfx,
          name,
          market:    mkt,
          price:     toNum(item.f2),
          changePct: toNum(item.f3),
          amount:    toNum(item.f6),
          mainNetInflow:        toNum(item.f62),
          mainNetInflowPercent: toNum(item.f184),
          superLargeNetInflow:  toNum(item.f66),
          largeNetInflow:       toNum(item.f72),
          mediumNetInflow:      toNum(item.f78),
          smallNetInflow:       toNum(item.f84),
          fiveDayMainNetInflow: toNum(item.f164),
          tenDayMainNetInflow:  toNum(item.f169),
        };
      })
      .filter((s): s is MoneyFlowRankItem => s !== null);

    return { ok: true, stocks };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ── 格式化工具（供 API routes 返回时附带，客户端也可用） ─────────────────

/** 将元转换为带单位的字符串（万/亿），保留 2 位小数 */
export function formatMoneyFlowValue(yuan: number | null): string {
  if (yuan === null) return "--";
  const abs  = Math.abs(yuan);
  const sign = yuan >= 0 ? "+" : "-";
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(2)}万`;
  return `${sign}${abs.toFixed(0)}元`;
}
