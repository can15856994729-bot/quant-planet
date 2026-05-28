import { NextResponse } from "next/server";

// 获取主要指数行情
// 沪深300:000300, 上证:000001, 深证成指:399001, 创业板:399006
// 恒生:HSI.HI, 纳指:NDX.US, 标普500:SPX.US

const INDICES = [
  { code: "1.000001",  name: "上证指数",  market: "A"  },
  { code: "0.399001",  name: "深证成指",  market: "A"  },
  { code: "0.399006",  name: "创业板指",  market: "A"  },
  { code: "1.000300",  name: "沪深300",   market: "A"  },
  { code: "116.HSI",   name: "恒生指数",  market: "HK" },
  { code: "100.NDX",   name: "纳斯达克",  market: "US" },
];

export async function GET() {
  try {
    const secids = INDICES.map((i) => i.code).join(",");
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f2,f3,f4,f12,f14`;
    const res = await fetch(url, {
      headers: { "Referer": "https://finance.eastmoney.com/" },
      next: { revalidate: 60 },
    });
    const json = await res.json();
    const items: unknown[] = json?.data?.diff ?? [];

    const result = INDICES.map((idx, i) => {
      const d = items[i] as Record<string, number | string> | undefined;
      if (!d || d.f2 === undefined) return { ...idx, value: 0, change: 0, changePct: 0 };
      return {
        name:      idx.name,
        code:      String(d.f12 ?? idx.code),
        market:    idx.market,
        value:     Number(d.f2)  / 100,
        change:    Number(d.f4)  / 100,
        changePct: Number(d.f3)  / 100,
      };
    });

    return NextResponse.json({ data: result, ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e), ok: false }, { status: 502 });
  }
}
