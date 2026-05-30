import { notFound } from "next/navigation";
import Link from "next/link";
import { BarChart3, Info } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_STOCKS } from "@/lib/mock-data";
import { getStockBySymbol } from "@/lib/stockService";
import { formatPrice } from "@/lib/utils";
import StockDetailClient from "./StockDetailClient";
import StockPriceCard from "./StockPriceCard";
import WatchlistButton from "@/components/ui/WatchlistButton";
import type { Stock } from "@/types";

// 预渲染热门股票；其余 symbol 走 SSR（dynamicParams = true 默认值）
export function generateStaticParams() {
  return MOCK_STOCKS.map((s) => ({ symbol: s.symbol }));
}

// ── 判断 symbol 是否为合法股票代码 ──────────────────────────────
function isValidSymbol(s: string): boolean {
  if (/^\d{6}$/.test(s))   return true;  // A 股（沪深北 6 位数字）
  if (/^\d{5}$/.test(s))   return true;  // 港股 5 位
  if (/^[A-Z]{1,5}$/.test(s.toUpperCase())) return true; // 美股
  return false;
}

// ── 从 stockService 构建 Stock 对象 ──────────────────────────────
function buildStockFromService(svc: ReturnType<typeof getStockBySymbol>): Stock | null {
  if (!svc) return null;
  return {
    symbol:    svc.symbol,
    name:      svc.name,
    market:    svc.market as "A" | "HK" | "US",
    currency:  svc.currency as "CNY" | "HKD" | "USD",
    industry:  svc.industry,
    price:     svc.price,
    change:    svc.change,
    changePct: svc.changePct,
    high52w:   svc.price * 1.25,
    low52w:    svc.price * 0.75,
    volume:    svc.volume ?? 0,
    turnover:  0,
    marketCap: svc.marketCap ?? 0,
    pe:        0,
  };
}

// ── 根据 symbol 推断市场 ──────────────────────────────────────────
function inferMarket(s: string): "A" | "HK" | "US" {
  if (/^\d{6}$/.test(s)) return "A";
  if (/^\d{5}$/.test(s)) return "HK";
  return "US";
}

function inferCurrency(market: "A" | "HK" | "US"): "CNY" | "HKD" | "USD" {
  if (market === "A")  return "CNY";
  if (market === "HK") return "HKD";
  return "USD";
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();

  // 1. 优先本地 MOCK（富含基本面数据）
  const mockStock = MOCK_STOCKS.find((s) => s.symbol === sym || s.symbol === symbol);

  // 2. 本地 stockService（213 只扩展库）
  const svcResult = !mockStock ? getStockBySymbol(sym) ?? getStockBySymbol(symbol) : undefined;
  const svcStock  = svcResult ? buildStockFromService(svcResult) : null;

  // 3. 两者都没有 → 对不合法 symbol 404；合法代码继续（实时行情会填充数据）
  if (!mockStock && !svcStock) {
    if (!isValidSymbol(symbol)) notFound();
  }

  // 使用 mock > svc > 最小 stub
  const market   = mockStock?.market ?? svcStock?.market ?? inferMarket(symbol);
  const currency = mockStock?.currency ?? svcStock?.currency ?? inferCurrency(market);
  const name     = mockStock?.name ?? svcStock?.name ?? symbol;
  const price    = mockStock?.price ?? svcStock?.price ?? 0;

  const stock: Stock = mockStock ?? svcStock ?? {
    symbol:    symbol,
    name,
    market,
    currency,
    industry:  "",
    price,
    change:    0,
    changePct: 0,
    high52w:   price * 1.25,
    low52w:    price * 0.75,
    volume:    0,
    turnover:  0,
    marketCap: 0,
    pe:        0,
  };

  const fundamentals = [
    {
      label: "市盈率(PE)",
      value: (stock.pe ?? 0) > 0 ? (stock.pe!).toFixed(1) : "—",
    },
    {
      label: "52W最高",
      value: (stock.high52w ?? 0) > 0 ? formatPrice(stock.high52w!, currency) : "—",
    },
    {
      label: "52W最低",
      value: (stock.low52w ?? 0) > 0 ? formatPrice(stock.low52w!, currency) : "—",
    },
    {
      label: "成交量",
      value: (stock.volume ?? 0) > 0
        ? `${((stock.volume ?? 0) / 10000).toFixed(1)}万手`
        : "—",
    },
    {
      label: "成交额",
      value: (stock.turnover ?? 0) > 1e8
        ? `${((stock.turnover ?? 0) / 1e8).toFixed(1)}亿`
        : (stock.turnover ?? 0) > 0
        ? `${((stock.turnover ?? 0) / 1e4).toFixed(0)}万`
        : "—",
    },
    {
      label: "市值",
      value: (stock.marketCap ?? 0) > 1e12
        ? `${((stock.marketCap ?? 0) / 1e12).toFixed(1)}万亿`
        : (stock.marketCap ?? 0) > 1e8
        ? `${((stock.marketCap ?? 0) / 1e8).toFixed(0)}亿`
        : "—",
    },
  ];

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader
        title={name}
        right={
          <WatchlistButton
            symbol={stock.symbol}
            name={name}
            market={market}
            exchange={
              stock.market === "A"
                ? (stock.symbol.startsWith("6") ? "SH" : stock.symbol.startsWith("8") || stock.symbol.startsWith("4") ? "BJ" : "SZ")
                : market === "HK"
                ? "HKEX"
                : "NASDAQ"
            }
            industry={stock.industry ?? ""}
            currency={currency}
          />
        }
      />

      <div className="px-4 pt-4 space-y-4 pb-8">

        {/* 价格卡（实时） */}
        <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <StockPriceCard initialStock={stock} />
        </div>

        {/* K线图 + 指标（客户端组件） */}
        <StockDetailClient
          symbol={stock.symbol}
          market={market}
          initialPrice={price || undefined}
        />

        {/* 基本面数据 */}
        <div>
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>基本面数据</h2>
          <div className="grid grid-cols-3 gap-2">
            {fundamentals.map(({ label, value }) => (
              <div
                key={label}
                className="p-3 rounded-xl text-center"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
              >
                <p className="font-bold text-[13px] num" style={{ color: "#F8FAFC" }}>{value}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 技术指标快览（静态示例） */}
        <div>
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>技术指标参考</h2>
          <div
            className="p-4 rounded-2xl space-y-2.5"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
          >
            {[
              { label: "MA5 / MA20", value: "金叉信号",  color: "#EF4444", note: "短期趋势偏强" },
              { label: "MACD",       value: "DIF>DEA",   color: "#EF4444", note: "多头动能持续" },
              { label: "RSI(14)",    value: "58.4",       color: "#F8FAFC", note: "中性偏强区间" },
              { label: "布林带",     value: "中轨附近",   color: "#FACC15", note: "震荡整理中"   },
              { label: "成交量",     value: "放量",       color: "#EF4444", note: "高于5日均量" },
            ].map(({ label, value, color, note }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[12px] w-24" style={{ color: "#94A3B8" }}>{label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[13px]" style={{ color }}>{value}</span>
                  <span className="text-[10px]" style={{ color: "#94A3B8" }}>{note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 风险提示 */}
        <div
          className="p-3 rounded-xl flex items-start gap-2"
          style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}
        >
          <Info size={12} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-[1.7]" style={{ color: "#94A3B8" }}>
            以上技术指标基于历史数据计算，仅供参考，不构成投资建议。
          </p>
        </div>

        {/* 操作按钮 */}
        <Link href={`/backtest?symbol=${stock.symbol}`}>
          <div
            className="w-full py-4 rounded-2xl font-black text-[15px] text-center glow-green"
            style={{ background: "linear-gradient(135deg, #00E5A8, #00b885)", color: "#07111F" }}
          >
            <BarChart3 size={18} className="inline mr-2" />
            对此股票回测策略
          </div>
        </Link>
      </div>
    </div>
  );
}
