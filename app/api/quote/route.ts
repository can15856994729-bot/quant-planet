import { NextRequest, NextResponse } from "next/server";

// 东方财富 secid 映射
// A股上海: 1.{code}  A股深圳: 0.{code}  港股: 116.{code}  美股: 105.{symbol}
const SECID_MAP: Record<string, string> = {
  "600519": "1.600519",
  "601318": "1.601318",
  "601398": "1.601398",
  "601857": "1.601857",
  "600036": "1.600036",
  "600000": "1.600000",
  "002594": "0.002594",
  "300750": "0.300750",
  "000858": "0.000858",
  "001289": "0.001289",
  "00700":  "116.00700",
  "09988":  "116.09988",
  "03690":  "116.03690",
  "09618":  "116.09618",
  "AAPL":   "105.AAPL",
  "TSLA":   "105.TSLA",
  "NVDA":   "105.NVDA",
  "MSFT":   "105.MSFT",
  "AMZN":   "105.AMZN",
  "GOOGL":  "105.GOOGL",
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "";
  const secid = SECID_MAP[symbol];

  if (!secid) {
    return NextResponse.json({ error: "unknown symbol" }, { status: 400 });
  }

  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f57,f58,f60,f169,f170,f116,f117`;
    const res = await fetch(url, {
      headers: { "Referer": "https://finance.eastmoney.com/" },
      next: { revalidate: 60 }, // cache 60s
    });
    const json = await res.json();
    const d = json?.data;
    if (!d) throw new Error("no data");

    // f43=最新价, f169=涨跌, f170=涨跌幅(×100)
    // f44=最高, f45=最低, f46=今开, f60=昨收
    // f47=成交量(手), f116=市值, f117=流通市值, f57=代码, f58=名称
    // 东方财富精度规则：A股/港股 ×100 存储（除以100），美股 ×1000 存储（除以1000）
    const isUS = secid.startsWith("105.");
    const divisor = isUS ? 1000 : 100;
    return NextResponse.json({
      symbol,
      name:       d.f58,
      price:      d.f43  / divisor,
      change:     d.f169 / divisor,
      changePct:  d.f170 / 100,
      high:       d.f44  / divisor,
      low:        d.f45  / divisor,
      open:       d.f46  / divisor,
      prevClose:  d.f60  / divisor,
      volume:     d.f47,
      marketCap:  d.f116,
      ok: true,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e), ok: false }, { status: 502 });
  }
}
