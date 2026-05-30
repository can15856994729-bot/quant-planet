"use client";
import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Plus, Minus, Clock, Info, ChevronRight, Search, X, Loader2,
  AlertTriangle, TrendingUp, TrendingDown, ShieldCheck, BarChart3, ChevronDown,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { getStockBySymbol } from "@/lib/stockService";
import type { StockInfo } from "@/lib/stockService";
import { formatPrice, formatPct, pnlColor, marketColor, formatMarket, marketToCurrency } from "@/lib/utils";
import { useStockSearch } from "@/lib/useStockSearch";
import { useStockQuotes } from "@/lib/useStockQuote";
import { useSimStore, simTotals, calcTradeFee, calcFeeLabel } from "@/lib/simStore";
import type { SimPos } from "@/lib/simStore";

type Tab = "持仓" | "成交" | "下单";

const DEFAULT_STOCK = getStockBySymbol("600519")!;

function makeStockInfo(symbol: string, name: string, price: number): StockInfo {
  return { symbol, name: name || symbol, market: "A", exchange: "SH", currency: "CNY", industry: "", price, change: 0, changePct: 0 };
}

// ── Sell quantity helper ─────────────────────────────────────────
function sellQtyFromMode(mode: "all" | "half" | "third" | "custom", total: number, custom: number): number {
  if (mode === "all")   return total;
  if (mode === "half")  return Math.max(1, Math.floor(total / 2));
  if (mode === "third") return Math.max(1, Math.floor(total / 3));
  return Math.min(Math.max(1, custom), total);
}

// ── Inner page component ─────────────────────────────────────────
function SimTradingContent() {
  const searchParams    = useSearchParams();
  const stratSymbol     = searchParams.get("symbol") ?? "";
  const stratName       = searchParams.get("name") ?? "";
  const stratPrice      = parseFloat(searchParams.get("price") ?? "0");
  const stratStopLoss   = parseFloat(searchParams.get("stopLoss") ?? "0");
  const stratTakeProfit = parseFloat(searchParams.get("takeProfit") ?? "0");
  const stratPct        = parseInt(searchParams.get("pct") ?? "0", 10);
  const stratFrom       = decodeURIComponent(searchParams.get("from") ?? "");
  const isStrategyOrder = !!(stratSymbol && stratPrice > 0);

  // ── Sim store ────────────────────────────────────────────────
  const { positions, trades, cash, initialCapital, sellPosition, buyPosition, updateCurrentPrices } = useSimStore();
  const { totalValue, totalReturn, totalReturnPct } = useMemo(
    () => simTotals(cash, positions, initialCapital),
    [cash, positions, initialCapital]
  );

  // ── Live quotes ──────────────────────────────────────────────
  const [selectedStock, setSelectedStock] = useState<StockInfo>(() => {
    if (isStrategyOrder) return getStockBySymbol(stratSymbol) ?? makeStockInfo(stratSymbol, stratName, stratPrice);
    return DEFAULT_STOCK;
  });

  const allSymbols = useMemo(
    () => [...new Set([selectedStock.symbol, ...positions.map(p => p.symbol)])],
    [selectedStock.symbol, positions]
  );
  const { quotes: liveQuotes } = useStockQuotes(allSymbols);

  // Sync live prices into store (throttled: only when there's a real change)
  useEffect(() => {
    const priceMap: Record<string, number> = {};
    for (const [sym, q] of Object.entries(liveQuotes)) {
      if (q.price > 0) priceMap[sym] = q.price;
    }
    if (Object.keys(priceMap).length > 0) updateCurrentPrices(priceMap);
  }, [liveQuotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Strategy sell-signal warnings ────────────────────────────
  const [sellWarnSymbols, setSellWarnSymbols] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/strategy/signals")
      .then(r => r.json())
      .then(d => { if (d.ok) setSellWarnSymbols(new Set((d.sellSignals as {symbol:string}[]).map(s => s.symbol))); })
      .catch(() => {});
  }, []);

  // ── Tab state ────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("持仓");

  // ── Buy order sheet ──────────────────────────────────────────
  const [showBuyOrder,  setShowBuyOrder]  = useState(isStrategyOrder);
  const [buyTradeType,  setBuyTradeType]  = useState<"BUY" | "SELL">("BUY");
  const [orderShares,   setOrderShares]   = useState(() => {
    if (isStrategyOrder && stratPct > 0 && stratPrice > 0) {
      const { totalValue: tv } = simTotals(useSimStore.getState().cash, useSimStore.getState().positions, useSimStore.getState().initialCapital);
      return String(Math.max(100, Math.round((stratPct / 100 * tv) / stratPrice / 100) * 100));
    }
    return "100";
  });
  const [orderPrice,    setOrderPrice]    = useState(isStrategyOrder && stratPrice > 0 ? stratPrice.toFixed(2) : DEFAULT_STOCK.price.toFixed(2));
  const [buySuccess,    setBuySuccess]    = useState(false);
  const priceEditedRef = useRef(isStrategyOrder);
  const [showPicker,    setShowPicker]    = useState(false);
  const [pickSearch,    setPickSearch]    = useState("");
  const { results: pickerList, loading: searchLoading } = useStockSearch(pickSearch);

  // Update buy price from live quote (unless manually edited)
  useEffect(() => {
    const lp = liveQuotes[selectedStock.symbol]?.price;
    if (lp && lp > 0 && !priceEditedRef.current) setOrderPrice(lp.toFixed(2));
  }, [liveQuotes, selectedStock.symbol]);

  function selectStock(s: StockInfo) {
    setSelectedStock(s);
    priceEditedRef.current = false;
    const lp = liveQuotes[s.symbol]?.price;
    setOrderPrice((lp && lp > 0 ? lp : s.price).toFixed(2));
    setShowPicker(false);
    setPickSearch("");
  }

  function handleBuyOrder() {
    const price  = parseFloat(orderPrice) || 0;
    const shares = parseInt(orderShares) || 0;
    if (price > 0 && shares > 0) {
      buyPosition({
        symbol: selectedStock.symbol, name: selectedStock.name,
        market: selectedStock.market as "A" | "HK" | "US",
        shares, price,
        strategy: isStrategyOrder ? stratFrom : undefined,
        source:   isStrategyOrder ? "strategy" : "manual",
      });
    }
    setBuySuccess(true);
    setTimeout(() => { setBuySuccess(false); setShowBuyOrder(false); }, 2000);
  }

  // ── Sell sheet ───────────────────────────────────────────────
  const [showSellSheet,  setShowSellSheet]  = useState(false);
  const [sellSymbol,     setSellSymbol]     = useState<string | null>(null);
  const [sellQtyMode,    setSellQtyMode]    = useState<"all" | "half" | "third" | "custom">("all");
  const [sellCustomQty,  setSellCustomQty]  = useState("100");
  const [sellSuccess,    setSellSuccess]    = useState<{ shares: number; proceeds: number } | null>(null);

  const sellPos       = positions.find(p => p.symbol === sellSymbol);
  const sellLivePrice = sellSymbol ? (liveQuotes[sellSymbol]?.price ?? sellPos?.currentPrice ?? 0) : 0;
  const sellMaxShares = sellPos?.shares ?? 0;
  const sellQty       = sellQtyFromMode(sellQtyMode, sellMaxShares, parseInt(sellCustomQty) || 0);
  const validSellQty  = Math.min(Math.max(1, sellQty), sellMaxShares);
  const sellAmount    = +(validSellQty * sellLivePrice).toFixed(2);
  const sellFee       = sellPos ? calcTradeFee(sellPos.market, sellAmount, "SELL") : 0;
  const sellProceeds  = +(sellAmount - sellFee).toFixed(2);
  const sellPnl       = sellPos ? +((sellLivePrice - sellPos.costPrice) * validSellQty - sellFee).toFixed(2) : 0;
  const sellRemaining = sellMaxShares - validSellQty;

  function openSellSheet(symbol: string, mode: "all" | "half" | "third" | "custom" = "all") {
    setSellSymbol(symbol);
    setSellQtyMode(mode);
    const pos = positions.find(p => p.symbol === symbol);
    setSellCustomQty(String(pos?.shares ?? 100));
    setSellSuccess(null);
    setShowSellSheet(true);
  }

  function executeSell() {
    if (!sellPos || !sellSymbol || validSellQty <= 0) return;
    sellPosition({ symbol: sellSymbol, shares: validSellQty, price: sellLivePrice, source: "manual" });
    setSellSuccess({ shares: validSellQty, proceeds: sellProceeds });
    setTimeout(() => { setSellSuccess(null); setShowSellSheet(false); setSellSymbol(null); }, 2200);
  }

  // ── Position detail sheet ────────────────────────────────────
  const [showDetail,  setShowDetail]  = useState(false);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const detailPos = positions.find(p => p.symbol === detailSymbol);
  const detailLivePrice = detailSymbol ? (liveQuotes[detailSymbol]?.price ?? detailPos?.currentPrice ?? 0) : 0;
  const detailLivePnl     = detailPos ? (detailLivePrice - detailPos.costPrice) * detailPos.shares : 0;
  const detailLivePnlPct  = detailPos ? (detailLivePrice - detailPos.costPrice) / detailPos.costPrice * 100 : 0;
  const detailMarketValue = detailPos ? detailPos.shares * detailLivePrice : 0;

  function openDetail(symbol: string) {
    setDetailSymbol(symbol);
    setShowDetail(true);
  }

  // ── Account summary ──────────────────────────────────────────
  const stockRatio = totalValue > 0 ? ((totalValue - cash) / totalValue * 100).toFixed(1) : "0.0";
  const cashRatio  = totalValue > 0 ? (cash / totalValue * 100).toFixed(1) : "100.0";

  // Today's realised PnL (from today's sell trades)
  const todayStr     = new Date().toDateString();
  const todayRealPnl = trades
    .filter(t => t.type === "SELL" && new Date(t.createdAt).toDateString() === todayStr)
    .reduce((s, t) => s + (t.pnl ?? 0), 0);

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="模拟交易" showBack={false} />

      {/* ── 账户总览 ── */}
      <div className="mx-4 mt-4 p-4 rounded-2xl"
        style={{ background: "linear-gradient(135deg, #0d1f3c, #0a1628)", border: "1px solid #1a2f50" }}>
        <p className="text-[11px] mb-1" style={{ color: "#94A3B8" }}>模拟账户总资产（元）</p>
        <p className="font-black text-[32px] num" style={{ color: "#F8FAFC" }}>¥{totalValue.toLocaleString()}</p>
        <div className="flex items-center gap-4 mt-2">
          <div>
            <p className="text-[10px]" style={{ color: "#94A3B8" }}>累计盈亏</p>
            <p className="font-bold text-[15px] num" style={{ color: pnlColor(totalReturn) }}>
              {totalReturn >= 0 ? "+" : ""}¥{Math.abs(totalReturn).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-[12px] ml-1">({formatPct(totalReturnPct)})</span>
            </p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: "#94A3B8" }}>今日实现盈亏</p>
            <p className="font-bold text-[15px] num" style={{ color: pnlColor(todayRealPnl) }}>
              {todayRealPnl >= 0 ? "+" : ""}¥{Math.abs(todayRealPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex rounded-full overflow-hidden h-2 mb-1.5">
            <div style={{ width: `${stockRatio}%`, background: "#00E5A8" }} />
            <div style={{ width: `${cashRatio}%`, background: "#1a2f50" }} />
          </div>
          <div className="flex justify-between text-[10px]">
            <span style={{ color: "#00E5A8" }}>股票 {stockRatio}%</span>
            <span style={{ color: "#94A3B8" }}>可用资金 ¥{cash.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ── 新建下单按钮 ── */}
      <div className="mx-4 mt-3">
        <button onClick={() => { setBuyTradeType("BUY"); setShowBuyOrder(true); }}
          className="w-full py-3 rounded-2xl font-black text-[14px] glow-green"
          style={{ background: "linear-gradient(135deg, #00E5A8, #00b885)", color: "#07111F" }}>
          <Plus size={16} className="inline mr-1.5" />
          模拟下单
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mx-4 mt-4 p-1 rounded-xl" style={{ background: "#0a1628" }}>
        {(["持仓", "成交", "下单"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-[13px] font-bold"
            style={{
              background: tab === t ? "#0d1f3c" : "transparent",
              color: tab === t ? "#00E5A8" : "#64748B",
              border: tab === t ? "1px solid #1a2f50" : "1px solid transparent",
            }}>
            {t}
            {t === "持仓" && <span className="ml-1 text-[10px]">({positions.length})</span>}
            {t === "成交" && <span className="ml-1 text-[10px]">({trades.length})</span>}
          </button>
        ))}
      </div>

      <div className="px-4 mt-3 pb-24">

        {/* ══ 持仓 Tab ══════════════════════════════════════════ */}
        {tab === "持仓" && (
          <div className="space-y-3">
            {positions.length === 0 && (
              <div className="text-center py-16">
                <BarChart3 size={40} color="#1a2f50" className="mx-auto mb-3" />
                <p className="font-semibold" style={{ color: "#94A3B8" }}>暂无持仓</p>
                <p className="text-[12px] mt-1" style={{ color: "#64748B" }}>点击上方「模拟下单」买入第一支股票</p>
              </div>
            )}
            {positions.map(pos => {
              const liveQ       = liveQuotes[pos.symbol];
              const curPrice    = (liveQ?.price && liveQ.price > 0) ? liveQ.price : pos.currentPrice;
              const livePnl     = (curPrice - pos.costPrice) * pos.shares;
              const livePnlPct  = (curPrice - pos.costPrice) / pos.costPrice * 100;
              const hasSellWarn = sellWarnSymbols.has(pos.symbol);

              return (
                <div key={pos.symbol} className="rounded-2xl overflow-hidden"
                  style={{
                    background: "#0d1f3c",
                    border: `1px solid ${hasSellWarn ? "rgba(239,68,68,0.4)" : "#1a2f50"}`,
                  }}>
                  {/* ─ Clickable info area → detail sheet ─ */}
                  <button className="w-full text-left p-4 active:opacity-75"
                    onClick={() => openDetail(pos.symbol)}>
                    <div className="flex items-start justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[13px]"
                          style={{ background: `${marketColor(pos.market)}18`, color: marketColor(pos.market) }}>
                          {pos.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>{pos.name}</span>
                            <span className="text-[10px] px-1 py-0.5 rounded font-bold"
                              style={{ background: `${marketColor(pos.market)}18`, color: marketColor(pos.market) }}>
                              {formatMarket(pos.market)}
                            </span>
                            {liveQ?.isRealtime && (
                              <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                                style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>实时</span>
                            )}
                          </div>
                          <p className="text-[10px]" style={{ color: "#94A3B8" }}>{pos.symbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[16px] num" style={{ color: pnlColor(livePnlPct) }}>
                          {livePnlPct >= 0 ? "+" : ""}{livePnlPct.toFixed(2)}%
                        </p>
                        <p className="text-[12px] num" style={{ color: pnlColor(livePnl) }}>
                          {livePnl >= 0 ? "+" : ""}¥{Math.abs(livePnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "持仓股数", value: `${pos.shares}股` },
                        { label: "成本价",   value: formatPrice(pos.costPrice,  marketToCurrency(pos.market)) },
                        { label: "现价",     value: formatPrice(curPrice,       marketToCurrency(pos.market)) },
                      ].map(({ label, value }) => (
                        <div key={label} className="p-2 rounded-lg text-center" style={{ background: "#0a1628" }}>
                          <p className="font-semibold text-[13px] num" style={{ color: "#F8FAFC" }}>{value}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>{label}</p>
                        </div>
                      ))}
                    </div>

                    {pos.strategy && (
                      <div className="mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(0,229,168,0.08)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.15)" }}>
                          📊 {pos.strategy}
                        </span>
                      </div>
                    )}
                  </button>

                  {/* ─ 策略卖出警告 ─ */}
                  {hasSellWarn && (
                    <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                      <AlertTriangle size={12} color="#EF4444" className="flex-shrink-0" />
                      <span className="text-[11px] flex-1" style={{ color: "#EF4444" }}>多因子策略建议减仓 / 卖出</span>
                      <button onClick={() => openSellSheet(pos.symbol, "all")}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg active:opacity-70"
                        style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                        快速卖出
                      </button>
                    </div>
                  )}

                  {/* ─ 操作按钮行 ─ */}
                  <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                    <button onClick={() => openDetail(pos.symbol)}
                      className="py-2 rounded-xl text-[12px] font-bold active:opacity-70"
                      style={{ background: "#0a1628", color: "#94A3B8", border: "1px solid #1a2f50" }}>
                      详情
                    </button>
                    <button onClick={() => openSellSheet(pos.symbol, "half")}
                      className="py-2 rounded-xl text-[12px] font-bold active:opacity-70"
                      style={{ background: "rgba(250,204,21,0.10)", color: "#FACC15", border: "1px solid rgba(250,204,21,0.25)" }}>
                      减仓
                    </button>
                    <button onClick={() => openSellSheet(pos.symbol, "all")}
                      className="py-2 rounded-xl text-[12px] font-bold active:opacity-70"
                      style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                      卖出
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ 成交 Tab ══════════════════════════════════════════ */}
        {tab === "成交" && (
          <div className="space-y-2">
            {trades.length === 0 && (
              <div className="text-center py-16">
                <Clock size={40} color="#1a2f50" className="mx-auto mb-3" />
                <p style={{ color: "#94A3B8" }}>暂无成交记录</p>
              </div>
            )}
            {trades.map(tr => (
              <div key={tr.id} className="p-3 rounded-xl"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[12px] flex-shrink-0"
                      style={{
                        background: tr.type === "BUY" ? "rgba(0,229,168,0.15)" : "rgba(239,68,68,0.15)",
                        color: tr.type === "BUY" ? "#00E5A8" : "#EF4444",
                      }}>
                      {tr.type === "BUY" ? "买" : "卖"}
                    </div>
                    <div>
                      <p className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{tr.name}</p>
                      <p className="text-[10px]" style={{ color: "#94A3B8" }}>
                        {new Date(tr.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {" · "}{tr.shares}股
                        {tr.source === "strategy" && <span className="ml-1" style={{ color: "#3B82F6" }}>· 策略</span>}
                      </p>
                      {tr.strategy && <p className="text-[9px] mt-0.5" style={{ color: "#64748B" }}>📊 {tr.strategy}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[13px] num" style={{ color: "#F8FAFC" }}>¥{tr.price.toFixed(2)}</p>
                    <p className="text-[11px] num" style={{ color: "#94A3B8" }}>¥{tr.amount.toLocaleString()}</p>
                    {tr.type === "SELL" && tr.pnl !== undefined && (
                      <p className="text-[11px] num font-bold" style={{ color: pnlColor(tr.pnl) }}>
                        {tr.pnl >= 0 ? "+" : ""}¥{Math.abs(tr.pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ 下单 Tab ══════════════════════════════════════════ */}
        {tab === "下单" && (
          <div className="text-center py-16">
            <Clock size={40} color="#1a2f50" className="mx-auto mb-3" />
            <p className="font-semibold" style={{ color: "#94A3B8" }}>暂无委托记录</p>
            <p className="text-[12px] mt-1" style={{ color: "#64748B" }}>模拟盘所有委托即时成交</p>
          </div>
        )}
      </div>

      {/* ══ 持仓详情 Bottom Sheet ══════════════════════════════ */}
      {showDetail && detailPos && (
        <div className="fixed inset-0 z-[100] flex items-end" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowDetail(false); }}>
          <div className="w-full max-w-[480px] mx-auto rounded-t-3xl flex flex-col"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50", maxHeight: "88vh" }}>
            {/* Handle */}
            <div className="flex-shrink-0 px-5 pt-4 pb-2">
              <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: "#1a2f50" }} />
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[14px]"
                  style={{ background: `${marketColor(detailPos.market)}18`, color: marketColor(detailPos.market) }}>
                  {detailPos.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-[17px]" style={{ color: "#F8FAFC" }}>{detailPos.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: `${marketColor(detailPos.market)}18`, color: marketColor(detailPos.market) }}>
                      {formatMarket(detailPos.market)}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: "#64748B" }}>{detailPos.symbol}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="font-black text-[20px] num" style={{ color: pnlColor(detailLivePnlPct) }}>
                    {detailLivePnlPct >= 0 ? "+" : ""}{detailLivePnlPct.toFixed(2)}%
                  </p>
                  <p className="text-[12px] num" style={{ color: pnlColor(detailLivePnl) }}>
                    {detailLivePnl >= 0 ? "+" : ""}¥{Math.abs(detailLivePnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-3">
              {/* Core metrics */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "持仓股数",   value: `${detailPos.shares} 股`,                                  color: "#F8FAFC" },
                  { label: "持仓市值",   value: `¥${detailMarketValue.toLocaleString(undefined,{maximumFractionDigits:0})}`, color: "#F8FAFC" },
                  { label: "成本价",     value: formatPrice(detailPos.costPrice, marketToCurrency(detailPos.market)), color: "#94A3B8" },
                  { label: "当前价",     value: formatPrice(detailLivePrice,      marketToCurrency(detailPos.market)), color: "#F8FAFC" },
                  { label: "浮动盈亏",   value: `${detailLivePnl >= 0 ? "+" : ""}¥${Math.abs(detailLivePnl).toLocaleString(undefined,{maximumFractionDigits:0})}`, color: pnlColor(detailLivePnl) },
                  { label: "盈亏比例",   value: `${detailLivePnlPct >= 0 ? "+" : ""}${detailLivePnlPct.toFixed(2)}%`,          color: pnlColor(detailLivePnlPct) },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 rounded-xl" style={{ background: "#0a1628" }}>
                    <p className="font-bold text-[15px] num" style={{ color }}>{value}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* Strategy info */}
              {detailPos.strategy && (
                <div className="p-3 rounded-xl" style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                  <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>来源策略</p>
                  <p className="font-semibold text-[13px]" style={{ color: "#00E5A8" }}>📊 {detailPos.strategy}</p>
                </div>
              )}

              {/* Strategy recommendation */}
              {sellWarnSymbols.has(detailPos.symbol) && (
                <div className="p-3 rounded-xl flex items-start gap-2"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <AlertTriangle size={14} color="#EF4444" className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[12px]" style={{ color: "#EF4444" }}>多因子策略建议卖出</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>综合评分低于卖出阈值，建议考虑减仓或清仓</p>
                  </div>
                </div>
              )}

              {/* Notice */}
              <div className="flex items-start gap-2 p-2.5 rounded-xl"
                style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.12)" }}>
                <Info size={11} color="#FACC15" className="flex-shrink-0 mt-0.5" />
                <p className="text-[10px] leading-[1.6]" style={{ color: "#94A3B8" }}>
                  模拟盘暂未限制T+1，仅为模拟交易，不产生真实盈亏。
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex-shrink-0 px-5 pt-3"
              style={{ borderTop: "1px solid #1a2f50", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { setShowDetail(false); setShowBuyOrder(true); setBuyTradeType("BUY"); selectStock(getStockBySymbol(detailPos.symbol) ?? makeStockInfo(detailPos.symbol, detailPos.name, detailLivePrice)); }}
                  className="py-3 rounded-2xl font-bold text-[13px] active:opacity-70"
                  style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.25)" }}>
                  加仓
                </button>
                <button onClick={() => { setShowDetail(false); openSellSheet(detailPos.symbol, "half"); }}
                  className="py-3 rounded-2xl font-bold text-[13px] active:opacity-70"
                  style={{ background: "rgba(250,204,21,0.10)", color: "#FACC15", border: "1px solid rgba(250,204,21,0.25)" }}>
                  减仓
                </button>
                <button onClick={() => { setShowDetail(false); openSellSheet(detailPos.symbol, "all"); }}
                  className="py-3 rounded-2xl font-black text-[13px] active:opacity-70"
                  style={{ background: "linear-gradient(135deg, #EF4444, #dc2626)", color: "#F8FAFC" }}>
                  全部卖出
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ 卖出 Bottom Sheet ══════════════════════════════════ */}
      {showSellSheet && sellPos && (
        <div className="fixed inset-0 z-[100] flex items-end" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={e => { if (e.target === e.currentTarget && !sellSuccess) setShowSellSheet(false); }}>
          <div className="w-full max-w-[480px] mx-auto rounded-t-3xl flex flex-col"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50", maxHeight: "88vh" }}>
            <div className="flex-shrink-0 px-5 pt-4 pb-2">
              <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: "#1a2f50" }} />
              {!sellSuccess && (
                <div className="flex items-center justify-between">
                  <p className="font-black text-[16px]" style={{ color: "#F8FAFC" }}>
                    模拟卖出 · <span style={{ color: "#EF4444" }}>{sellPos.name}</span>
                  </p>
                  <button onClick={() => setShowSellSheet(false)}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: "#1a2f50" }}>
                    <X size={13} color="#94A3B8" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-2">
              {sellSuccess ? (
                <div className="text-center py-10">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ background: "rgba(0,229,168,0.12)" }}>
                    <ShieldCheck size={32} color="#00E5A8" />
                  </div>
                  <p className="font-black text-[18px]" style={{ color: "#00E5A8" }}>模拟卖出成功</p>
                  <p className="text-[13px] mt-1 num" style={{ color: "#F8FAFC" }}>
                    成交 {sellSuccess.shares} 股 · 到账 ¥{sellSuccess.proceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: "#64748B" }}>仅为模拟交易，不产生真实盈亏</p>
                </div>
              ) : (
                <>
                  {/* Current price row */}
                  <div className="flex items-center justify-between p-3 rounded-xl mb-3"
                    style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                    <div>
                      <span className="text-[13px]" style={{ color: "#94A3B8" }}>参考价格</span>
                      {liveQuotes[sellPos.symbol]?.isRealtime && (
                        <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded font-bold"
                          style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>实时</span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-black text-[18px] num" style={{ color: "#F8FAFC" }}>
                        {formatPrice(sellLivePrice, marketToCurrency(sellPos.market))}
                      </p>
                      <p className="text-[10px]" style={{ color: "#64748B" }}>
                        可卖 {sellMaxShares} 股 · 成本 {formatPrice(sellPos.costPrice, marketToCurrency(sellPos.market))}
                      </p>
                    </div>
                  </div>

                  {/* Quantity selector */}
                  <p className="text-[12px] font-bold mb-2" style={{ color: "#94A3B8" }}>卖出数量</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {([
                      { mode: "all",   label: "全部卖出", sub: `${sellMaxShares} 股` },
                      { mode: "half",  label: "减仓 1/2", sub: `${Math.max(1, Math.floor(sellMaxShares / 2))} 股` },
                      { mode: "third", label: "减仓 1/3", sub: `${Math.max(1, Math.floor(sellMaxShares / 3))} 股` },
                      { mode: "custom",label: "自定义",   sub: "手动输入" },
                    ] as const).map(({ mode, label, sub }) => (
                      <button key={mode} onClick={() => setSellQtyMode(mode)}
                        className="p-3 rounded-xl text-left active:opacity-70"
                        style={{
                          background: sellQtyMode === mode ? "rgba(239,68,68,0.12)" : "#0a1628",
                          border: `1px solid ${sellQtyMode === mode ? "#EF4444" : "#1a2f50"}`,
                        }}>
                        <p className="font-bold text-[13px]" style={{ color: sellQtyMode === mode ? "#EF4444" : "#F8FAFC" }}>{label}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>{sub}</p>
                      </button>
                    ))}
                  </div>

                  {/* Custom qty input */}
                  {sellQtyMode === "custom" && (
                    <div className="flex items-center justify-between p-3 rounded-xl mb-3"
                      style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                      <span className="text-[13px]" style={{ color: "#94A3B8" }}>卖出数量（股）</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSellCustomQty(v => String(Math.max(1, parseInt(v) - 100)))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                          <Minus size={13} color="#94A3B8" />
                        </button>
                        <input
                          className="bg-transparent text-center font-bold text-[15px] num outline-none w-16"
                          style={{ color: "#F8FAFC" }}
                          value={sellCustomQty}
                          onChange={e => setSellCustomQty(String(Math.min(sellMaxShares, Math.max(1, parseInt(e.target.value) || 1))))}
                          inputMode="numeric"
                        />
                        <button onClick={() => setSellCustomQty(v => String(Math.min(sellMaxShares, parseInt(v) + 100)))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                          <Plus size={13} color="#94A3B8" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Order summary */}
                  <div className="p-3 rounded-xl space-y-2 mb-3"
                    style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                    {[
                      { label: "委托价格",  value: formatPrice(sellLivePrice, marketToCurrency(sellPos.market)), color: "#F8FAFC" },
                      { label: "卖出数量",  value: `${validSellQty} 股`,         color: "#F8FAFC" },
                      { label: "预计成交额", value: `¥${sellAmount.toLocaleString(undefined,{maximumFractionDigits:0})}`, color: "#F8FAFC" },
                      { label: calcFeeLabel(sellPos.market, "SELL"), value: `¥${sellFee.toLocaleString(undefined,{maximumFractionDigits:2})}`, color: "#FACC15" },
                      { label: "预计到账",  value: `¥${sellProceeds.toLocaleString(undefined,{maximumFractionDigits:0})}`, color: "#00E5A8" },
                      { label: "预计盈亏",  value: `${sellPnl >= 0 ? "+" : ""}¥${Math.abs(sellPnl).toLocaleString(undefined,{maximumFractionDigits:0})}`, color: pnlColor(sellPnl) },
                      { label: "卖出后剩余", value: `${sellRemaining} 股`,        color: sellRemaining === 0 ? "#EF4444" : "#94A3B8" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[12px]" style={{ color: "#64748B" }}>{label}</span>
                        <span className="font-bold text-[13px] num" style={{ color }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* A股 T+1 notice */}
                  <div className="flex items-start gap-2 p-2.5 rounded-xl"
                    style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.12)" }}>
                    <Info size={11} color="#FACC15" className="flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] leading-[1.6]" style={{ color: "#94A3B8" }}>
                      {sellPos.market === "A" ? "模拟盘暂未限制T+1，" : ""}此为模拟交易，不产生真实盈亏，不构成投资建议。
                    </p>
                  </div>
                </>
              )}
            </div>

            {!sellSuccess && (
              <div className="flex-shrink-0 px-5 pt-3"
                style={{ borderTop: "1px solid #1a2f50", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}>
                <button onClick={executeSell}
                  disabled={validSellQty <= 0}
                  className="w-full py-4 rounded-2xl font-black text-[15px] active:opacity-85"
                  style={{
                    background: validSellQty > 0 ? "linear-gradient(135deg, #EF4444, #dc2626)" : "#1a2f50",
                    color: validSellQty > 0 ? "#F8FAFC" : "#64748B",
                  }}>
                  确认卖出 {validSellQty} 股 · 到账约 ¥{sellProceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ 买入 Bottom Sheet ══════════════════════════════════ */}
      {showBuyOrder && (
        <div className="fixed inset-0 z-[100] flex items-end" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowBuyOrder(false); }}>
          <div className="w-full max-w-[480px] mx-auto rounded-t-3xl flex flex-col"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50", maxHeight: "90vh" }}>
            <div className="flex-shrink-0 px-5 pt-4 pb-3">
              <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: "#1a2f50" }} />
              {!buySuccess && <p className="font-black text-[16px]" style={{ color: "#F8FAFC" }}>模拟下单</p>}
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-2">
              {buySuccess ? (
                <div className="text-center py-10">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ background: "rgba(0,229,168,0.15)" }}>
                    <ShieldCheck size={30} color="#00E5A8" />
                  </div>
                  <p className="font-black text-[18px]" style={{ color: "#00E5A8" }}>模拟委托成功</p>
                  <p className="text-[12px] mt-1" style={{ color: "#94A3B8" }}>注意：这是模拟交易，不产生真实盈亏</p>
                </div>
              ) : (
                <>
                  {isStrategyOrder && stratFrom && (
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl"
                      style={{ background: "rgba(0,229,168,0.06)", border: "1px solid rgba(0,229,168,0.18)" }}>
                      <span className="text-[11px]" style={{ color: "#00E5A8" }}>📊 策略推荐</span>
                      <span className="text-[10px] truncate flex-1" style={{ color: "#64748B" }}>{stratFrom}</span>
                    </div>
                  )}
                  <div className="flex gap-2 mb-4">
                    {(["BUY", "SELL"] as const).map(t => (
                      <button key={t} onClick={() => setBuyTradeType(t)}
                        className="flex-1 py-2.5 rounded-xl font-black text-[14px]"
                        style={{
                          background: buyTradeType === t ? (t === "BUY" ? "rgba(0,229,168,0.2)" : "rgba(239,68,68,0.2)") : "#0a1628",
                          color: buyTradeType === t ? (t === "BUY" ? "#00E5A8" : "#EF4444") : "#64748B",
                          border: `1px solid ${buyTradeType === t ? (t === "BUY" ? "#00E5A8" : "#EF4444") : "#1a2f50"}`,
                        }}>
                        {t === "BUY" ? "买入" : "卖出"}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <button className="w-full flex items-center justify-between p-3 rounded-xl active:opacity-70"
                      style={{ background: "#0a1628", border: "1px solid #1a2f50" }}
                      onClick={() => setShowPicker(true)}>
                      <span className="text-[13px]" style={{ color: "#94A3B8" }}>股票</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{selectedStock.name}</span>
                        <span className="text-[11px]" style={{ color: "#94A3B8" }}>{selectedStock.symbol}</span>
                        <ChevronRight size={14} color="#00E5A8" />
                      </div>
                    </button>
                    <div className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                      <div>
                        <span className="text-[13px]" style={{ color: "#94A3B8" }}>委托价格</span>
                        {liveQuotes[selectedStock.symbol]?.isRealtime && (
                          <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded font-bold"
                            style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>实时</span>
                        )}
                      </div>
                      <input className="bg-transparent text-right font-bold text-[15px] num outline-none w-28"
                        style={{ color: "#F8FAFC" }}
                        value={orderPrice}
                        onChange={e => { priceEditedRef.current = true; setOrderPrice(e.target.value); }}
                        inputMode="decimal" />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                      <span className="text-[13px]" style={{ color: "#94A3B8" }}>委托数量（股）</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setOrderShares(v => String(Math.max(100, +v - 100)))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                          <Minus size={13} color="#94A3B8" />
                        </button>
                        <span className="font-bold text-[15px] num w-14 text-center" style={{ color: "#F8FAFC" }}>{orderShares}</span>
                        <button onClick={() => setOrderShares(v => String(+v + 100))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                          <Plus size={13} color="#94A3B8" />
                        </button>
                      </div>
                    </div>
                    {isStrategyOrder && stratStopLoss > 0 && buyTradeType === "BUY" && (
                      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                        style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                        <span className="text-[11px] font-semibold" style={{ color: "#64748B" }}>策略建议</span>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <TrendingDown size={11} color="#EF4444" />
                            <span className="text-[11px] num font-bold" style={{ color: "#EF4444" }}>止损 ¥{stratStopLoss.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <TrendingUp size={11} color="#00E5A8" />
                            <span className="text-[11px] num font-bold" style={{ color: "#00E5A8" }}>止盈 ¥{stratTakeProfit.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-[12px]" style={{ color: "#94A3B8" }}>预估金额</span>
                      <span className="font-bold text-[14px] num" style={{ color: "#F8FAFC" }}>
                        ¥{(+orderPrice * +orderShares).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2.5 rounded-xl mt-2"
                    style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.15)" }}>
                    <Info size={12} color="#FACC15" className="flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] leading-[1.6]" style={{ color: "#94A3B8" }}>此为模拟交易，不产生真实盈亏，不构成投资建议。</p>
                  </div>
                </>
              )}
            </div>

            {!buySuccess && (
              <div className="flex-shrink-0 px-5 pt-3"
                style={{ borderTop: "1px solid #1a2f50", paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))" }}>
                <button onClick={handleBuyOrder}
                  className="w-full py-4 rounded-2xl font-black text-[15px] glow-green"
                  style={{
                    background: buyTradeType === "BUY" ? "linear-gradient(135deg, #00E5A8, #00b885)" : "linear-gradient(135deg, #EF4444, #dc2626)",
                    color: "#F8FAFC",
                  }}>
                  {buyTradeType === "BUY" ? "确认模拟买入" : "确认模拟卖出"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ 选股面板 ══════════════════════════════════════════ */}
      {showPicker && (
        <div className="fixed inset-0 z-[110] flex items-end" style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={e => { if (e.target === e.currentTarget) { setShowPicker(false); setPickSearch(""); } }}>
          <div className="w-full max-w-[480px] mx-auto rounded-t-3xl flex flex-col"
            style={{ background: "#0a1628", border: "1px solid #1a2f50", maxHeight: "80vh" }}>
            <div className="flex-shrink-0 px-5 pt-4 pb-3">
              <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: "#1a2f50" }} />
              <div className="flex items-center justify-between mb-3">
                <p className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>
                  选择股票 <span className="ml-1 text-[11px] font-normal" style={{ color: "#94A3B8" }}>280+</span>
                </p>
                <button onClick={() => { setShowPicker(false); setPickSearch(""); }}
                  className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#1a2f50" }}>
                  <X size={14} color="#94A3B8" />
                </button>
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                {searchLoading ? <Loader2 size={14} color="#00E5A8" className="animate-spin" /> : <Search size={14} color="#94A3B8" />}
                <input autoFocus className="flex-1 bg-transparent text-[14px] outline-none" style={{ color: "#F8FAFC" }}
                  placeholder="搜索股票名称或代码…" value={pickSearch}
                  onChange={e => setPickSearch(e.target.value)} />
                {pickSearch && <button onClick={() => setPickSearch("")}><X size={13} color="#64748B" /></button>}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-2">
              {searchLoading && pickSearch
                ? <div className="text-center py-10"><Loader2 size={24} color="#00E5A8" className="animate-spin mx-auto mb-2" /><p className="text-[13px]" style={{ color: "#64748B" }}>搜索中…</p></div>
                : pickerList.length === 0
                  ? <div className="text-center py-10"><p className="text-[13px]" style={{ color: "#64748B" }}>未找到相关股票</p></div>
                  : pickerList.map(s => (
                    <button key={s.symbol} onClick={() => selectStock(s)}
                      className="w-full flex items-center justify-between p-3 rounded-xl active:opacity-70"
                      style={{ background: selectedStock.symbol === s.symbol ? "rgba(0,229,168,0.08)" : "#0d1f3c", border: `1px solid ${selectedStock.symbol === s.symbol ? "rgba(0,229,168,0.3)" : "#1a2f50"}` }}>
                      <div className="flex items-center gap-2.5 text-left">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[13px]"
                          style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>{s.name}</span>
                            <span className="text-[10px] px-1 py-0.5 rounded font-bold"
                              style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
                              {formatMarket(s.market)}
                            </span>
                          </div>
                          <p className="text-[11px]" style={{ color: "#94A3B8" }}>{s.symbol} · {s.industry}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[14px] num" style={{ color: "#F8FAFC" }}>{formatPrice(s.price, s.currency)}</p>
                        <p className="text-[11px] num font-semibold" style={{ color: pnlColor(s.changePct) }}>{formatPct(s.changePct)}</p>
                      </div>
                    </button>
                  ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Default export with Suspense ─────────────────────────────────
export default function SimTradingPage() {
  return (
    <Suspense fallback={
      <div style={{ background: "#07111F", minHeight: "100vh" }} className="flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "#00E5A8", borderTopColor: "transparent" }} />
      </div>
    }>
      <SimTradingContent />
    </Suspense>
  );
}
