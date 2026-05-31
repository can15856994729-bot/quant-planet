/**
 * POST /api/tushare/trade-kline
 *
 * 获取单笔回测交易的 K 线区间数据（买入前30日~卖出后15日）。
 * 服务端计算 MA5/MA10/MA20，不复权（与实际成交价保持一致）。
 *
 * TUSHARE_TOKEN 仅在服务端使用，不暴露给前端。
 *
 * Body: { tsCode: string, buyDate: string, sellDate: string }  // YYYYMMDD
 * Response: { ok, klines: KlineWindowBar[], total: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { getDailyKLine, hasTushareToken } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export interface KlineWindowBar {
  date:   string;   // YYYYMMDD
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  vol:    number;   // 手
  pctChg: number;   // %
  ma5:    number | null;
  ma10:   number | null;
  ma20:   number | null;
}

/** 将 YYYYMMDD 偏移 n 个日历天，返回 YYYYMMDD */
function shiftDate(ymd: string, n: number): string {
  const d = new Date(`${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10).replace(/-/g, "");
}

/** 计算简单移动平均（前 period 个数据不足时返回 null） */
function computeMA(arr: number[], idx: number, period: number): number | null {
  if (idx < period - 1) return null;
  let sum = 0;
  for (let j = idx - period + 1; j <= idx; j++) sum += arr[j];
  return sum / period;
}

export async function POST(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置，无法获取 K 线数据", klines: [] },
      { status: 200 },
    );
  }

  let body: { tsCode?: string; buyDate?: string; sellDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体格式错误", klines: [] }, { status: 400 });
  }

  const { tsCode, buyDate, sellDate } = body;
  if (!tsCode || !buyDate || !sellDate) {
    return NextResponse.json(
      { ok: false, error: "缺少必填参数：tsCode / buyDate / sellDate", klines: [] },
      { status: 400 },
    );
  }

  // 窗口：买入前30个日历天 ~ 卖出后15个日历天
  const windowStart = shiftDate(buyDate, -30);
  const windowEnd   = shiftDate(sellDate, +15);

  const res = await getDailyKLine(tsCode, windowStart, windowEnd);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error ?? "Tushare 请求失败", klines: [] });
  }

  // 升序排列
  const sorted = [...res.records].sort((a, b) =>
    String(a.trade_date).localeCompare(String(b.trade_date))
  );

  const closes = sorted.map(r => Number(r.close ?? 0));

  const klines: KlineWindowBar[] = sorted
    .map((r, i) => ({
      date:   String(r.trade_date ?? ""),
      open:   Number(r.open    ?? 0),
      high:   Number(r.high    ?? 0),
      low:    Number(r.low     ?? 0),
      close:  Number(r.close   ?? 0),
      vol:    Number(r.vol     ?? 0),
      pctChg: Number(r.pct_chg ?? 0),
      ma5:    computeMA(closes, i, 5),
      ma10:   computeMA(closes, i, 10),
      ma20:   computeMA(closes, i, 20),
    }))
    .filter(k => k.close > 0);

  return NextResponse.json(
    { ok: true, tsCode, klines, total: klines.length },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } },
  );
}
