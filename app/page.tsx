import Link from "next/link";
import { Bell, Search, ChevronRight, ShieldAlert, Activity, BarChart3 } from "lucide-react";
import { MOCK_INDICES, MOCK_STOCKS, MOCK_SIGNALS, MOCK_SIM_ACCOUNT, MOCK_STRATEGIES, DEFAULT_WATCHLIST } from "@/lib/mock-data";
import { formatPct, formatPrice, pnlColor, signalTypeLabel, signalTypeColor, marketColor, formatMarket, riskColor } from "@/lib/utils";

export default function HomePage() {
  const watchlistStocks = MOCK_STOCKS.filter((s) => DEFAULT_WATCHLIST.includes(s.symbol)).slice(0, 4);
  const unreadCount = MOCK_SIGNALS.filter((s) => !s.read).length;
  const buyCount  = MOCK_SIGNALS.filter((s) => s.type === "BUY" || s.type === "GOLDEN_CROSS").length;
  const sellCount = MOCK_SIGNALS.filter((s) => s.type === "SELL" || s.type === "STOP_LOSS").length;

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 pt-12 pb-4">
        <div>
          <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "#00E5A8" }}>QuantPlanet</p>
          <h1 className="font-black text-[20px]" style={{ color: "#F8FAFC" }}>量化星球</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/signals" className="relative">
            <Bell size={22} color="#94A3B8" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                style={{ background: "#EF4444", color: "#fff" }}>{unreadCount}</span>
            )}
          </Link>
          <Link href="/watchlist"><Search size={22} color="#94A3B8" /></Link>
        </div>
      </div>

      {/* 驾驶舱4卡 */}
      <div className="px-4 mb-5">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#4a6080" }}>沪深300</p>
            <p className="font-black text-[20px] num" style={{ color: "#F8FAFC" }}>3,245.67</p>
            <p className="text-[12px] font-bold up mt-0.5">▲ +0.86%</p>
          </div>
          <Link href="/sim-trading">
            <div className="p-3 rounded-2xl h-full" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#4a6080" }}>我的模拟账户</p>
              <p className="font-black text-[20px] num up">+{MOCK_SIM_ACCOUNT.totalReturnPct.toFixed(2)}%</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#4a6080" }}>今日 <span className="up font-semibold">+{MOCK_SIM_ACCOUNT.todayPnlPct.toFixed(2)}%</span></p>
            </div>
          </Link>
          <Link href="/signals">
            <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#4a6080" }}>今日信号</p>
              <p className="font-black text-[20px] num up">{buyCount} 买入</p>
              <p className="text-[12px] font-bold down mt-0.5">{sellCount} 卖出</p>
            </div>
          </Link>
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#4a6080" }}>当前风险</p>
            <p className="font-black text-[20px]" style={{ color: "#FACC15" }}>中等</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldAlert size={11} color="#FACC15" />
              <span className="text-[11px]" style={{ color: "#4a6080" }}>仓位 58.8%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 市场概览 */}
      <section className="px-4 mb-5">
        <h2 className="font-bold text-[14px] mb-2" style={{ color: "#F8FAFC" }}>
          <span style={{ color: "#00E5A8", marginRight: 6 }}>▌</span>今日市场
        </h2>
        <div style={{ background: "#0d1f3c", borderRadius: 14, border: "1px solid #1a2f50" }}>
          {MOCK_INDICES.slice(0, 4).map((idx, i) => (
            <div key={idx.code} className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < 3 ? "1px solid #1a2f50" : "none" }}>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${marketColor(idx.market)}18`, color: marketColor(idx.market) }}>
                  {formatMarket(idx.market)}
                </span>
                <span className="font-semibold text-[13px]" style={{ color: "#F8FAFC" }}>{idx.name}</span>
              </div>
              <div className="text-right">
                <p className="font-bold text-[13px] num" style={{ color: "#F8FAFC" }}>{idx.value.toLocaleString()}</p>
                <p className="text-[12px] font-bold num" style={{ color: pnlColor(idx.changePct) }}>{formatPct(idx.changePct)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 策略信号 */}
      <section className="px-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
            <span style={{ color: "#FACC15", marginRight: 6 }}>▌</span>策略信号提醒
          </h2>
          <Link href="/signals" className="flex items-center gap-0.5 text-[12px]" style={{ color: "#4a6080" }}>
            全部 <ChevronRight size={13} />
          </Link>
        </div>
        <div className="space-y-2">
          {MOCK_SIGNALS.slice(0, 3).map((sig) => (
            <Link key={sig.id} href="/signals">
              <div className="p-3 rounded-2xl flex items-start gap-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: signalTypeColor(sig.type) }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{sig.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${signalTypeColor(sig.type)}18`, color: signalTypeColor(sig.type) }}>
                      {signalTypeLabel(sig.type)}
                    </span>
                    {!sig.read && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#EF4444" }} />}
                  </div>
                  <p className="text-[11px] truncate" style={{ color: "#94A3B8" }}>{sig.reason}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-[12px] num" style={{ color: "#F8FAFC" }}>
                    {formatPrice(sig.price, sig.market === "US" ? "USD" : sig.market === "HK" ? "HKD" : "CNY")}
                  </p>
                  <p className="text-[10px]" style={{ color: "#4a6080" }}>{sig.strength}强度</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 自选股 */}
      <section className="px-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
            <span style={{ color: "#3B82F6", marginRight: 6 }}>▌</span>我的自选股
          </h2>
          <Link href="/watchlist" className="flex items-center gap-0.5 text-[12px]" style={{ color: "#4a6080" }}>
            全部 <ChevronRight size={13} />
          </Link>
        </div>
        <div style={{ background: "#0d1f3c", borderRadius: 14, border: "1px solid #1a2f50" }}>
          {watchlistStocks.map((s, i) => (
            <Link key={s.symbol} href={`/stock/${s.symbol}`}>
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: i < watchlistStocks.length - 1 ? "1px solid #1a2f50" : "none" }}>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{s.name}</span>
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                      style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
                      {s.symbol}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: "#4a6080" }}>{s.industry}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[14px] num" style={{ color: "#F8FAFC" }}>
                    {formatPrice(s.price, s.currency)}
                  </p>
                  <p className="font-bold text-[12px] num" style={{ color: pnlColor(s.changePct) }}>
                    {formatPct(s.changePct)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 热门策略 */}
      <section className="px-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
            <span style={{ color: "#00E5A8", marginRight: 6 }}>▌</span>热门策略
          </h2>
          <Link href="/strategies" className="flex items-center gap-0.5 text-[12px]" style={{ color: "#4a6080" }}>
            全部 <ChevronRight size={13} />
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {MOCK_STRATEGIES.slice(0, 4).map((st) => (
            <Link key={st.id} href={`/strategies/${st.id}`} className="flex-shrink-0 w-44">
              <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${riskColor(st.riskLevel)}18`, color: riskColor(st.riskLevel) }}>
                    {st.riskLevel}风险
                  </span>
                  <BarChart3 size={13} color="#4a6080" />
                </div>
                <p className="font-bold text-[12px] mb-2" style={{ color: "#F8FAFC" }}>{st.name}</p>
                <p className="text-[10px] mb-0.5" style={{ color: "#4a6080" }}>年化回测</p>
                <p className="font-black text-[20px] up">+{st.annualReturn}%</p>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px]" style={{ color: "#4a6080" }}>胜率 {st.winRate}%</span>
                  <span className="text-[10px] down">回撤 {st.maxDrawdown}%</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 今日可关注机会 */}
      <section className="px-4 mb-5">
        <h2 className="font-bold text-[14px] mb-2" style={{ color: "#F8FAFC" }}>
          <span style={{ color: "#FACC15", marginRight: 6 }}>▌</span>今日可关注机会
        </h2>
        <div className="space-y-2">
          {[
            { name: "宁德时代", reason: "放量突破20日均线压力位，MACD柱状图扩大", type: "突破", color: "#3B82F6" },
            { name: "阿里巴巴", reason: "RSI回落至42，接近超卖区间，关注企稳信号", type: "反转", color: "#FACC15" },
            { name: "英伟达",   reason: "强势创近期新高，动量延续，可观察回踩确认", type: "趋势", color: "#00E5A8" },
          ].map((item) => (
            <div key={item.name} className="p-3 rounded-2xl flex items-start gap-3"
              style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${item.color}18`, border: `1px solid ${item.color}25` }}>
                <Activity size={14} color={item.color} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{item.name}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `${item.color}18`, color: item.color }}>{item.type}</span>
                </div>
                <p className="text-[11px] leading-[1.6]" style={{ color: "#94A3B8" }}>{item.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 免责声明 */}
      <div className="mx-4 mb-6 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
        <p className="text-[10px] leading-[1.7]" style={{ color: "#4a6080" }}>
          ⚠️ 本产品仅用于量化策略研究、模拟交易和数据分析，不构成任何投资建议。股市有风险，投资需谨慎。历史回测不代表未来收益。
        </p>
      </div>
    </div>
  );
}
