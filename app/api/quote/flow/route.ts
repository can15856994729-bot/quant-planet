/**
 * GET /api/quote/flow?symbol=600519
 *
 * A 股资金流向（主力 / 超大单 / 大单 / 中小单净流入）。
 *
 * 数据来源：东方财富资金流向 API（免费公开接口，无需 Token）。
 *
 * 返回：
 *   today        当日实时资金流向
 *   history      近 10 交易日每日资金流向（日K级别）
 *
 * 字段说明（东方财富 klines 分段）：
 *   f52 = 主力净流入（超大单+大单）
 *   f53 = 小单净流入
 *   f54 = 中单净流入
 *   f55 = 大单净流入
 *   f56 = 超大单净流入
 */
import { NextRequest, NextResponse } from "next/server";
import { getSecid } from "@/lib/quoteService";
import { isUSSymbol } from "@/lib/alphaVantage";

export const dynamic = "force-dynamic";

export interface FlowPoint {
  date: string;         // "2024-01-26" 或分钟 "09:30"
  mainNet: number;      // 主力净流入（元）
  superLargeNet: number;
  largeNet: number;
  mediumNet: number;
  smallNet: number;
}

export interface FlowData {
  symbol: string;
  today: {
    mainNetInflow: number;        // 主力净流入（元）
    superLargeNetInflow: number;  // 超大单净流入（元）
    largeNetInflow: number;       // 大单净流入（元）
    mediumNetInflow: number;      // 中单净流入
    smallNetInflow: number;       // 小单净流入
    mainInflowRatio: number | null; // 主力净流入占成交额比例 %
    minuteKlines: FlowPoint[];    // 分钟资金流
  };
  history: FlowPoint[];           // 日级别近 10 日
  updatedAt: string;
  ok: true;
}

// 解析东方财富 klines 字符串数组
// 格式："日期/时间,主力净流入,小单净流入,中单净流入,大单净流入,超大单净流入"
function parseKlines(
  klines: string[],
  isMinute: boolean
): FlowPoint[] {
  return klines.map((line) => {
    const parts = line.split(",");
    // 日期或时间
    const rawDate = parts[0] ?? "";
    const date = isMinute
      ? rawDate.slice(11, 16) // "2024-01-26 09:30" → "09:30"
      : rawDate.slice(0, 10); // "2024-01-26 00:00:00" → "2024-01-26"

    const mainNet       = Number(parts[1] ?? 0);  // f52
    const smallNet      = Number(parts[2] ?? 0);  // f53
    const mediumNet     = Number(parts[3] ?? 0);  // f54
    const largeNet      = Number(parts[4] ?? 0);  // f55
    const superLargeNet = Number(parts[5] ?? 0);  // f56

    return { date, mainNet, superLargeNet, largeNet, mediumNet, smallNet };
  });
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase().trim();

  if (!symbol) {
    return NextResponse.json({ error: "symbol required", ok: false }, { status: 400 });
  }

  // 仅支持 A 股（港股/美股不提供该数据）
  if (isUSSymbol(symbol) || /^\d{5}$/.test(symbol)) {
    return NextResponse.json({
      error: "资金流向数据仅支持 A 股",
      ok: false,
    }, { status: 400 });
  }

  const secid = getSecid(symbol);
  if (!secid) {
    return NextResponse.json({ error: "无效的股票代码", ok: false }, { status: 400 });
  }

  const now = new Date().toISOString();

  try {
    // ── 并行拉取：今日分钟流 + 近 10 日日线流 ────────────────
    const [minuteRes, dayRes] = await Promise.allSettled([
      fetch(
        `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get` +
        `?lmt=0&klt=1&fields1=f1,f2&fields2=f51,f52,f53,f54,f55,f56&secid=${secid}`,
        { headers: { Referer: "https://data.eastmoney.com/" }, next: { revalidate: 60 } }
      ),
      fetch(
        `https://push2.eastmoney.com/api/qt/stock/fflow/daykline/get` +
        `?lmt=10&klt=101&fields1=f1,f2&fields2=f51,f52,f53,f54,f55,f56&secid=${secid}`,
        { headers: { Referer: "https://data.eastmoney.com/" }, next: { revalidate: 300 } }
      ),
    ]);

    // 处理分钟流数据
    let minuteKlines: FlowPoint[] = [];
    if (minuteRes.status === "fulfilled") {
      const json = await minuteRes.value.json() as Record<string, unknown>;
      const klines = ((json?.data as Record<string, unknown>)?.klines ?? []) as string[];
      minuteKlines = parseKlines(klines, true);
    }

    // 处理日线流数据
    let historyKlines: FlowPoint[] = [];
    if (dayRes.status === "fulfilled") {
      const json = await dayRes.value.json() as Record<string, unknown>;
      const klines = ((json?.data as Record<string, unknown>)?.klines ?? []) as string[];
      historyKlines = parseKlines(klines, false);
    }

    // 今日汇总：取分钟数据的最后一条（累计值），若无则用历史最后一条
    const todayFromMinute = minuteKlines.length > 0
      ? minuteKlines[minuteKlines.length - 1]
      : null;
    const todayFromHistory = historyKlines.length > 0
      ? historyKlines[historyKlines.length - 1]
      : null;
    const todaySrc = todayFromMinute ?? todayFromHistory;

    // 主力净流入占比（近似值：用历史中的比例或不可用时为 null）
    // 精确比例需另外拉取 /api/qt/stock/fflow/get，暂不实现
    const mainInflowRatio: number | null = null;

    const today = {
      mainNetInflow:       todaySrc?.mainNet       ?? 0,
      superLargeNetInflow: todaySrc?.superLargeNet ?? 0,
      largeNetInflow:      todaySrc?.largeNet      ?? 0,
      mediumNetInflow:     todaySrc?.mediumNet      ?? 0,
      smallNetInflow:      todaySrc?.smallNet       ?? 0,
      mainInflowRatio,
      minuteKlines,
    };

    const result: FlowData = {
      symbol,
      today,
      history: historyKlines,
      updatedAt: now,
      ok: true,
    };

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({
      error: `资金流向获取失败：${e instanceof Error ? e.message : String(e)}`,
      ok: false,
    }, { status: 502 });
  }
}
