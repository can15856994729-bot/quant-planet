"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { TrendingUp, TrendingDown, Plus, Minus, Clock, Info, ChevronRight, Search, X, Loader2, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_SIM_ACCOUNT } from "@/lib/mock-data";
import { getStockBySymbol } from "@/lib/stockService";
import type { StockInfo, Market, Exchange, Currency } from "@/lib/stockService";
import { formatPrice, formatPct, pnlColor, marketColor, formatMarket, marketToCurrency } from "@/lib/utils";
import { useStockSearch } from "@/lib/useStockSearch";
import { useStockQuotes } from "@/lib/useStockQuote";

type Tab = "持仓" | "成交" | "下单";

const DEFAULT_STOCK = getStockBySymbol("600519")!;
const POSITION_SYMBOLS = MOCK_SIM_ACCOUNT.positions.map((p) => p.symbol);

// ── Helper: build a minimal StockInfo when symbol not in database ──
function makeStockInfo(symbol: string, name: string, price: number): StockInfo {
  return {
    symbol,
    name: name || symbol,
    market: "A",
    exchange: "SH",
    currency: "CNY",
    industry: "",
    price,
    change: 0,
    changePct: 0,
  };
}

// ── Inner component that uses useSearchParams ─────────────────────
function SimTradingContent() {
  const searchParams = useSearchParams();

  // ── Strategy order params from URL ──────────────────────────────
  const stratSymbol     = searchParams.get("symbol") ?? "";
  const stratName       = searchParams.get("name") ?? "";
  const stratPrice      = parseFloat(searchParams.get("price") ?? "0");
  const stratStopLoss   = parseFloat(searchParams.get("stopLoss") ?? "0");
  const stratTakeProfit = parseFloat(searchParams.get("takeProfit") ?? "0");
  const stratPct        = parseInt(searchParams.get("pct") ?? "0", 10);
  const stratFrom       = decodeURIComponent(searchParams.get("from") ?? "");
  const isStrategyOrder = !!(stratSymbol && stratPrice > 0);

  const acc = MOCK_SIM_ACCOUNT;

  // Compute initial stock (once on mount)
  const initStock: StockInfo = isStrategyOrder
    ? (getStockBySymbol(stratSymbol) ?? makeStockInfo(stratSymbol, stratName, stratPrice))
    : DEFAULT_STOCK;

  // Compute suggested shares from strategy position %
  const initShares = isStrategyOrder && stratPct > 0 && stratPrice > 0
    ? String(Math.max(100, Math.round((stratPct / 100 * acc.totalValue) / stratPrice / 100) * 100))
    : "100";

  // ── State ────────────────────────────────────────────────────────
  const [tab, setTab]               = useState<Tab>("持仓");
  const [tradeType, setTradeType]   = useState<"BUY" | "SELL">("BUY");
  const [showOrder, setShowOrder]   = useState(isStrategyOrder);
  const [orderShares, setOrderShares] = useState(initShares);
  const [orderPrice, setOrderPrice] = useState(
    isStrategyOrder && stratPrice > 0 ? stratPrice.toFixed(2) : DEFAULT_STOCK.price.toFixed(2)
  );
  const [orderSuccess, setOrderSuccess] = useState(false);
  const priceEditedRef = useRef(isStrategyOrder); // treat strategy price as manually set

  const [selectedStock, setSelectedStock] = useState<StockInfo>(initStock);
  const [showPicker, setShowPicker]       = useState(false);
  const [pickSearch, setPickSearch]       = useState("");

  // ── Strategy sell signal warnings for held positions ─────────────
  const [sellWarningSymbols, setSellWarningSymbols] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/strategy/signals")
      .then(r => r.json())
      .then((d) => {
        if (d.ok && d.sellSignals) {
          setSellWarningSymbols(new Set((d.sellSignals as { symbol: string }[]).map(s => s.symbol)));
        }
      })
      .catch(() => {});
  }, []);

  // ── Live quotes ──────────────────────────────────────────────────
  const allSymbols = [...new Set([selectedStock.symbol, ...POSITION_SYMBOLS])];
  const { quotes: liveQuotes } = useStockQuotes(allSymbols);

  // Auto-update order price from live quote (skip if manually edited / from strategy)
  useEffect(() => {
    const livePrice = liveQuotes[selectedStock.symbol]?.price;
    if (livePrice && livePrice > 0 && !priceEditedRef.current) {
      setOrderPrice(livePrice.toFixed(2));
    }
  }, [liveQuotes, selectedStock.symbol]);

  const { results: pickerList, loading: searchLoading } = useStockSearch(pickSearch);

  const stockRatio = ((acc.totalValue - acc.cash) / acc.totalValue * 100).toFixed(1);
  const cashRatio  = (acc.cash / acc.totalValue * 100).toFixed(1);

  function selectStock(s: StockInfo) {
    setSelectedStock(s);
    priceEditedRef.current = false;
    const livePrice = liveQuotes[s.symbol]?.price;
    setOrderPrice((livePrice && livePrice > 0 ? livePrice : s.price).toFixed(2));
    setShowPicker(false);
    setPickSearch("");
  }

  function handleOrder() {
    setOrderSuccess(true);
    setTimeout(() => { setOrderSuccess(false); setShowOrder(false); }, 2000);
  }

  // Quick sell triggered from position sell-alert button
  function handleQuickSell(pos: typeof acc.positions[0]) {
    const s = getStockBySymbol(pos.symbol) ?? makeStockInfo(pos.symbol, pos.name, pos.currentPrice);
    setSelectedStock(s);
    setOrderPrice(pos.currentPrice.toFixed(2));
    priceEditedRef.current = true;
    setTradeType("SELL");
    setShowOrder(true);
  }

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="模拟交易" showBack={false} />

      {/* 账户总览 */}
      <div className="mx-4 mt-4 p-4 rounded-2xl" style={{ background: "linear-gradient(135deg, #0d1f3c, #0a1628)", border: "1px solid #1a2f50" }}>
        <p className="text-[11px] mb-1" style={{ color: "#94A3B8" }}>模拟账户总资产（元）</p>
        <p className="font-black text-[32px] num" style={{ color: "#F8FAFC" }}>
          ¥{acc.totalValue.toLocaleString()}
        </p>
        <div className="flex items-center gap-4 mt-2">
          <div>
            <p className="text-[10px]" style={{ color: "#94A3B8" }}>累计盈亏</p>
            <p className="font-bold text-[15px] num" style={{ color: pnlColor(acc.totalReturn) }}>
              {acc.totalReturn > 0 ? "+" : ""}¥{acc.totalReturn.toLocaleString()}
              <span className="text-[12px] ml-1">({formatPct(acc.totalReturnPct)})</span>
            </p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: "#94A3B8" }}>今日盈亏</p>
            <p className="font-bold text-[15px] num" style={{ color: pnlColor(acc.todayPnl) }}>
              {acc.todayPnl > 0 ? "+" : ""}¥{acc.todayPnl.toLocaleString()}
              <span className="text-[12px] ml-1">({formatPct(acc.todayPnlPct)})</span>
            </p>
          </div>
        </div>

        {/* 资产比例条 */}
        <div className="mt-3">
          <div className="flex rounded-full overflow-hidden h-2 mb-1.5">
            <div style={{ width: `${stockRatio}%`, background: "#00E5A8" }} />
            <div style={{ width: `${cashRatio}%`, background: "#1a2f50" }} />
          </div>
          <div className="flex justify-between text-[10px]">
            <span style={{ color: "#00E5A8" }}>股票 {stockRatio}%</span>
            <span style={{ color: "#94A3B8" }}>可用资金 ¥{acc.cash.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 模拟下单入口 */}
      <div className="mx-4 mt-3">
        <button onClick={() => { setTradeType("BUY"); setShowOrder(true); }}
          className="w-full py-3 rounded-2xl font-black text-[14px] glow-green"
          style={{ background: "linear-gradient(135deg, #00E5A8, #00b885)", color: "#07111F" }}>
          <Plus size={16} className="inline mr-1.5" />
          模拟下单
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mx-4 mt-4 p-1 rounded-xl" style={{ background: "#0a1628" }}>
        {(["持仓", "成交", "下单"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-[13px] font-bold transition-all"
            style={{
              background: tab === t ? "#0d1f3c" : "transparent",
              color: tab === t ? "#00E5A8" : "#64748B",
              border: tab === t ? "1px solid #1a2f50" : "1px solid transparent",
            }}>
            {t}
            {t === "持仓" && <span className="ml-1 text-[10px]">({acc.positions.length})</span>}
          </button>
        ))}
      </div>

      <div className="px-4 mt-3 pb-24">

        {/* 持仓列表 */}
        {tab === "持仓" && (
          <div className="space-y-3">
            {acc.positions.map((pos) => {
              const liveQ = liveQuotes[pos.symbol];
              const currentPrice = (liveQ?.price && liveQ.price > 0) ? liveQ.price : pos.currentPrice;
              const livePnl    = (currentPrice - pos.costPrice) * pos.shares;
              const livePnlPct = ((currentPrice - pos.costPrice) / pos.costPrice) * 100;
              const hasSellAlert = sellWarningSymbols.has(pos.symbol);
              return (
                <div key={pos.symbol} className="p-4 rounded-2xl"
                  style={{
                    background: "#0d1f3c",
                    border: `1px solid ${hasSellAlert ? "rgba(239,68,68,0.35)" : "#1a2f50"}`,
                  }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[12px]"
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
                      <p className="font-bold text-[15px] num" style={{ color: pnlColor(livePnlPct) }}>
                        {livePnlPct > 0 ? "+" : ""}{livePnlPct.toFixed(2)}%
                      </p>
                      <p className="text-[11px] num" style={{ color: pnlColor(livePnl) }}>
                        {livePnl > 0 ? "+" : ""}¥{livePnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "持仓股数", value: `${pos.shares}股` },
                      { label: "成本价",   value: formatPrice(pos.costPrice,  marketToCurrency(pos.market)) },
                      { label: "现价",     value: formatPrice(currentPrice,   marketToCurrency(pos.market)) },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-2 rounded-lg text-center" style={{ background: "#0a1628" }}>
                        <p className="font-semibold text-[13px] num" style={{ color: "#F8FAFC" }}>{value}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* 来源策略 */}
                  {pos.strategy && (
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(0,229,168,0.08)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.15)" }}>
                        📊 {pos.strategy}
                      </span>
                    </div>
                  )}

                  {/* 策略卖出警告 */}
                  {hasSellAlert && (
                    <div className="mt-2 flex items-center gap-2 px-2.5 py-2 rounded-xl"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                      <AlertTriangle size={12} color="#EF4444" className="flex-shrink-0" />
                      <span className="text-[11px] flex-1" style={{ color: "#EF4444" }}>
                        多因子策略建议减仓 / 卖出
                      </span>
                      <button
                        onClick={() => handleQuickSell(pos)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg active:opacity-70"
                        style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                        快速下单
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 成交记录 */}
        {tab === "成交" && (
          <div className="space-y-2">
            {acc.trades.map((tr) => (
              <div key={tr.id} className="p-3 rounded-xl flex items-center justify-between"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-[11px]"
                    style={{
                      background: tr.type === "BUY" ? "rgba(0,229,168,0.15)" : "rgba(239,68,68,0.15)",
                      color: tr.type === "BUY" ? "#00E5A8" : "#EF4444",
                    }}>
                    {tr.type === "BUY" ? "买" : "卖"}
                  </div>
                  <div>
                    <p className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{tr.name}</p>
                    <p className="text-[10px]" style={{ color: "#94A3B8" }}>{tr.createdAt} · {tr.shares}股</p>
                    {tr.strategy && (
                      <p className="text-[9px] mt-0.5" style={{ color: "#64748B" }}>📊 {tr.strategy}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[13px] num" style={{ color: "#F8FAFC" }}>¥{tr.price.toFixed(2)}</p>
                  <p className="text-[10px] num" style={{ color: "#94A3B8" }}>¥{tr.amount.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 下单历史（空状态提示） */}
        {tab === "下单" && (
          <div className="text-center py-16">
            <Clock size={40} color="#1a2f50" className="mx-auto mb-3" />
            <p className="font-semibold" style={{ color: "#94A3B8" }}>暂无委托记录</p>
            <p className="text-[12px] mt-1" style={{ color: "#94A3B8" }}>点击上方「模拟下单」发起交易</p>
          </div>
        )}
      </div>

      {/* 模拟下单弹窗 */}
      {showOrder && (
        <div className="fixed inset-0 z-[100] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowOrder(false); }}>
          <div className="w-full max-w-[480px] mx-auto rounded-t-3xl flex flex-col"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50", maxHeight: "90vh" }}>

            {/* 拖动条 + 标题（固定顶部） */}
            <div className="px-5 pt-4 pb-3 flex-shrink-0">
              <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: "#1a2f50" }} />
              {!orderSuccess && (
                <p className="font-black text-[16px]" style={{ color: "#F8FAFC" }}>模拟下单</p>
              )}
            </div>

            {/* 可滚动内容区 */}
            <div className="flex-1 overflow-y-auto px-5 pb-2">
              {orderSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ background: "rgba(0,229,168,0.15)" }}>
                    <span className="text-[30px]">✓</span>
                  </div>
                  <p className="font-black text-[18px]" style={{ color: "#00E5A8" }}>模拟委托成功</p>
                  <p className="text-[12px] mt-1" style={{ color: "#94A3B8" }}>注意：这是模拟交易，不产生真实盈亏</p>
                </div>
              ) : (
                <>
                  {/* 策略来源徽章 */}
                  {isStrategyOrder && stratFrom && (
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl"
                      style={{ background: "rgba(0,229,168,0.06)", border: "1px solid rgba(0,229,168,0.18)" }}>
                      <span className="text-[11px]" style={{ color: "#00E5A8" }}>📊 策略推荐</span>
                      <span className="text-[10px] truncate flex-1" style={{ color: "#64748B" }}>{stratFrom}</span>
                    </div>
                  )}

                  {/* 买卖切换 */}
                  <div className="flex gap-2 mb-4">
                    {(["BUY", "SELL"] as const).map((t) => (
                      <button key={t} onClick={() => setTradeType(t)}
                        className="flex-1 py-2.5 rounded-xl font-black text-[14px]"
                        style={{
                          background: tradeType === t
                            ? (t === "BUY" ? "rgba(0,229,168,0.2)" : "rgba(239,68,68,0.2)")
                            : "#0a1628",
                          color: tradeType === t ? (t === "BUY" ? "#00E5A8" : "#EF4444") : "#64748B",
                          border: `1px solid ${tradeType === t ? (t === "BUY" ? "#00E5A8" : "#EF4444") : "#1a2f50"}`,
                        }}>
                        {t === "BUY" ? "买入" : "卖出"}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {/* 股票选择（可点击） */}
                    <button className="w-full flex items-center justify-between p-3 rounded-xl active:opacity-70"
                      style={{ background: "#0a1628", border: "1px solid #1a2f50" }}
                      onClick={() => setShowPicker(true)}>
                      <span className="text-[13px]" style={{ color: "#94A3B8" }}>股票</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: `${marketColor(selectedStock.market)}18`, color: marketColor(selectedStock.market) }}>
                          {formatMarket(selectedStock.market)}
                        </span>
                        <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>
                          {selectedStock.name}
                        </span>
                        <span className="text-[11px]" style={{ color: "#94A3B8" }}>
                          {selectedStock.symbol}
                        </span>
                        <ChevronRight size={14} color="#00E5A8" />
                      </div>
                    </button>

                    {/* 价格 */}
                    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                      <div>
                        <span className="text-[13px]" style={{ color: "#94A3B8" }}>委托价格</span>
                        {liveQuotes[selectedStock.symbol]?.isRealtime && (
                          <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded font-bold"
                            style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>实时</span>
                        )}
                        {isStrategyOrder && !priceEditedRef.current && (
                          <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded font-bold"
                            style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>策略建议</span>
                        )}
                      </div>
                      <input
                        className="bg-transparent text-right font-bold text-[15px] num outline-none w-28"
                        style={{ color: "#F8FAFC" }}
                        value={orderPrice}
                        onChange={(e) => { priceEditedRef.current = true; setOrderPrice(e.target.value); }}
                        inputMode="decimal"
                      />
                    </div>

                    {/* 数量 */}
                    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                      <span className="text-[13px]" style={{ color: "#94A3B8" }}>委托数量（股）</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setOrderShares((prev) => String(Math.max(100, +prev - 100)))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                          <Minus size={13} color="#94A3B8" />
                        </button>
                        <span className="font-bold text-[15px] num w-14 text-center" style={{ color: "#F8FAFC" }}>{orderShares}</span>
                        <button onClick={() => setOrderShares((prev) => String(+prev + 100))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                          <Plus size={13} color="#94A3B8" />
                        </button>
                      </div>
                    </div>

                    {/* 策略止损止盈提示 */}
                    {isStrategyOrder && stratStopLoss > 0 && tradeType === "BUY" && (
                      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                        style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                        <span className="text-[11px] font-semibold" style={{ color: "#64748B" }}>策略建议</span>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <TrendingDown size={11} color="#EF4444" />
                            <span className="text-[11px] num font-bold" style={{ color: "#EF4444" }}>
                              止损 ¥{stratStopLoss.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <TrendingUp size={11} color="#00E5A8" />
                            <span className="text-[11px] num font-bold" style={{ color: "#00E5A8" }}>
                              止盈 ¥{stratTakeProfit.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 预估金额 */}
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-[12px]" style={{ color: "#94A3B8" }}>预估金额</span>
                      <span className="font-bold text-[14px] num" style={{ color: "#F8FAFC" }}>
                        ¥{(+orderPrice * +orderShares).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {/* 风险提示 */}
                  <div className="flex items-start gap-2 p-2.5 rounded-xl mt-2"
                    style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.15)" }}>
                    <Info size={12} color="#FACC15" className="flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] leading-[1.6]" style={{ color: "#94A3B8" }}>
                      此为模拟交易，使用虚拟资金，不产生真实盈亏，不构成投资建议。
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* 确认按钮（固定底部） */}
            {!orderSuccess && (
              <div className="flex-shrink-0 px-5 pt-3 pb-safe" style={{ borderTop: "1px solid #1a2f50", paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))" }}>
                <button onClick={handleOrder}
                  className="w-full py-4 rounded-2xl font-black text-[15px] glow-green active:opacity-85 transition-opacity"
                  style={{
                    background: tradeType === "BUY"
                      ? "linear-gradient(135deg, #00E5A8, #00b885)"
                      : "linear-gradient(135deg, #EF4444, #dc2626)",
                    color: "#F8FAFC",
                  }}>
                  {tradeType === "BUY" ? "确认模拟买入" : "确认模拟卖出"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 选股面板 */}
      {showPicker && (
        <div className="fixed inset-0 z-[110] flex items-end" style={{ background: "rgba(0,0,0,0.8)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowPicker(false); setPickSearch(""); } }}>
          <div className="w-full max-w-[480px] mx-auto rounded-t-3xl flex flex-col"
            style={{ background: "#0a1628", border: "1px solid #1a2f50", maxHeight: "80vh" }}>

            {/* 头部 */}
            <div className="flex-shrink-0 px-5 pt-4 pb-3">
              <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: "#1a2f50" }} />
              <div className="flex items-center justify-between mb-3">
                <p className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>
                  选择股票
                  <span className="ml-2 text-[11px] font-normal" style={{ color: "#94A3B8" }}>A股/港股/美股 280+</span>
                </p>
                <button onClick={() => { setShowPicker(false); setPickSearch(""); }}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "#1a2f50" }}>
                  <X size={14} color="#94A3B8" />
                </button>
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                {searchLoading
                  ? <Loader2 size={14} color="#00E5A8" className="animate-spin" />
                  : <Search size={14} color="#94A3B8" />
                }
                <input
                  autoFocus
                  className="flex-1 bg-transparent text-[14px] outline-none"
                  style={{ color: "#F8FAFC" }}
                  placeholder="搜索股票名称或代码…"
                  value={pickSearch}
                  onChange={(e) => setPickSearch(e.target.value)}
                />
                {pickSearch && (
                  <button onClick={() => setPickSearch("")}>
                    <X size={13} color="#64748B" />
                  </button>
                )}
              </div>
            </div>

            {/* 股票列表 */}
            <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-2">
              {searchLoading && pickSearch ? (
                <div className="text-center py-10">
                  <Loader2 size={24} color="#00E5A8" className="animate-spin mx-auto mb-2" />
                  <p className="text-[13px]" style={{ color: "#64748B" }}>搜索中…</p>
                </div>
              ) : pickerList.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-[13px]" style={{ color: "#64748B" }}>未找到相关股票</p>
                </div>
              ) : (
                pickerList.map((s) => (
                  <button key={s.symbol}
                    className="w-full flex items-center justify-between p-3 rounded-xl active:opacity-70"
                    style={{
                      background: selectedStock.symbol === s.symbol ? "rgba(0,229,168,0.08)" : "#0d1f3c",
                      border: `1px solid ${selectedStock.symbol === s.symbol ? "rgba(0,229,168,0.3)" : "#1a2f50"}`,
                    }}
                    onClick={() => selectStock(s)}>
                    <div className="flex items-center gap-2.5 text-left">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[13px] flex-shrink-0"
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
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-[14px] num" style={{ color: "#F8FAFC" }}>
                        {formatPrice(s.price, s.currency)}
                      </p>
                      <p className="text-[11px] num font-semibold" style={{ color: pnlColor(s.changePct) }}>
                        {formatPct(s.changePct)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Default export with Suspense boundary ────────────────────────
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
