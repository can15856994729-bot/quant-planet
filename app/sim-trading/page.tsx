"use client";
import { useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Plus, Minus, PieChart, Clock, Info, ChevronRight } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_SIM_ACCOUNT } from "@/lib/mock-data";
import { formatPrice, formatPct, pnlColor, marketColor, formatMarket, marketToCurrency } from "@/lib/utils";

type Tab = "持仓" | "成交" | "下单";

export default function SimTradingPage() {
  const [tab, setTab] = useState<Tab>("持仓");
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [showOrder, setShowOrder] = useState(false);
  const [orderShares, setOrderShares] = useState("100");
  const [orderPrice, setOrderPrice] = useState("1680.50");
  const [orderSuccess, setOrderSuccess] = useState(false);

  const acc = MOCK_SIM_ACCOUNT;
  const stockRatio = ((acc.totalValue - acc.cash) / acc.totalValue * 100).toFixed(1);
  const cashRatio = (acc.cash / acc.totalValue * 100).toFixed(1);

  function handleOrder() {
    setOrderSuccess(true);
    setTimeout(() => { setOrderSuccess(false); setShowOrder(false); }, 2000);
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
        <button onClick={() => setShowOrder(true)}
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
            {acc.positions.map((pos) => (
              <div key={pos.symbol} className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
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
                      </div>
                      <p className="text-[10px]" style={{ color: "#94A3B8" }}>{pos.symbol}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[15px] num" style={{ color: pnlColor(pos.pnlPct) }}>
                      {pos.pnlPct > 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%
                    </p>
                    <p className="text-[11px] num" style={{ color: pnlColor(pos.pnl) }}>
                      {pos.pnl > 0 ? "+" : ""}¥{pos.pnl.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "持仓股数", value: `${pos.shares}股` },
                    { label: "成本价",   value: formatPrice(pos.costPrice,    marketToCurrency(pos.market)) },
                    { label: "现价",     value: formatPrice(pos.currentPrice, marketToCurrency(pos.market)) },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-2 rounded-lg text-center" style={{ background: "#0a1628" }}>
                      <p className="font-semibold text-[13px] num" style={{ color: "#F8FAFC" }}>{value}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>{label}</p>
                    </div>
                  ))}
                </div>
                {pos.strategy && (
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(0,229,168,0.08)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.15)" }}>
                      {pos.strategy}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 成交记录 */}
        {tab === "成交" && (
          <div className="space-y-2">
            {acc.trades.map((tr) => (
              <div key={tr.id} className="p-3 rounded-xl flex items-center justify-between"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[11px]`}
                    style={{
                      background: tr.type === "BUY" ? "rgba(0,229,168,0.15)" : "rgba(239,68,68,0.15)",
                      color: tr.type === "BUY" ? "#00E5A8" : "#EF4444",
                    }}>
                    {tr.type === "BUY" ? "买" : "卖"}
                  </div>
                  <div>
                    <p className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{tr.name}</p>
                    <p className="text-[10px]" style={{ color: "#94A3B8" }}>{tr.createdAt} · {tr.shares}股</p>
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
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowOrder(false); }}>
          <div className="w-full max-w-[480px] mx-auto rounded-t-3xl p-5 pb-8"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "#1a2f50" }} />

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
                <p className="font-black text-[16px] mb-4" style={{ color: "#F8FAFC" }}>模拟下单</p>

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
                  {/* 股票选择 */}
                  <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                    <span className="text-[13px]" style={{ color: "#94A3B8" }}>股票</span>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>贵州茅台 (600519)</span>
                      <ChevronRight size={14} color="#94A3B8" />
                    </div>
                  </div>

                  {/* 价格 */}
                  <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                    <span className="text-[13px]" style={{ color: "#94A3B8" }}>委托价格</span>
                    <input
                      className="bg-transparent text-right font-bold text-[15px] num outline-none w-28"
                      style={{ color: "#F8FAFC" }}
                      value={orderPrice}
                      onChange={(e) => setOrderPrice(e.target.value)}
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
                      <span className="font-bold text-[15px] num w-12 text-center" style={{ color: "#F8FAFC" }}>{orderShares}</span>
                      <button onClick={() => setOrderShares((prev) => String(+prev + 100))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                        <Plus size={13} color="#94A3B8" />
                      </button>
                    </div>
                  </div>

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

                <button onClick={handleOrder}
                  className="w-full py-3.5 rounded-2xl font-black text-[15px] mt-4 glow-green"
                  style={{
                    background: tradeType === "BUY" ? "linear-gradient(135deg, #00E5A8, #00b885)" : "linear-gradient(135deg, #EF4444, #dc2626)",
                    color: "#F8FAFC",
                  }}>
                  {tradeType === "BUY" ? "确认模拟买入" : "确认模拟卖出"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
