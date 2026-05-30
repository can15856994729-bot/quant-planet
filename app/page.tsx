import Link from "next/link";
import { Search, ChevronRight, ShieldAlert, Activity, BarChart3, Download, Trophy, Flame, ArrowUpDown, Layers } from "lucide-react";
import { MOCK_STRATEGIES } from "@/lib/mock-data";
import HomeStrategySignalCard from "@/components/ui/HomeStrategySignalCard";
import HomeSimAccountCard from "@/components/ui/HomeSimAccountCard";
import { formatPct, formatPrice, pnlColor, signalTypeLabel, signalTypeColor, marketColor, formatMarket, riskColor, marketToCurrency } from "@/lib/utils";
import { getRiskReport, riskLevelColor } from "@/lib/riskService";
import HomeMarket from "@/components/ui/HomeMarket";
import HomeWatchlist from "@/components/ui/HomeWatchlist";
import HomeSignals from "@/components/ui/HomeSignals";
import SignalBellBadge from "@/components/ui/SignalBellBadge";

export default function HomePage() {
  const risk = getRiskReport();
  const riskColor_ = riskLevelColor(risk.level);

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 pb-4 page-top-pt">
        <div>
          <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "#00E5A8" }}>QuantPlanet</p>
          <h1 className="font-black text-[20px]" style={{ color: "#F8FAFC" }}>量化星球</h1>
        </div>
        <div className="flex items-center gap-3">
          <SignalBellBadge />
          <Link href="/watchlist"><Search size={22} color="#94A3B8" /></Link>
          <Link href="/download" className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,229,168,0.10)", border: "1px solid rgba(0,229,168,0.2)" }}>
            <Download size={16} color="#00E5A8" />
          </Link>
        </div>
      </div>

      {/* 驾驶舱4卡 */}
      <div className="px-4 mb-5">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#94A3B8" }}>我的真实账户</p>
            <p className="font-black text-[18px] num" style={{ color: "#F8FAFC" }}>¥100,053,379</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#94A3B8" }}>
              今日 <span className="up font-semibold">+¥0.00</span>
            </p>
          </div>
          <HomeSimAccountCard />
          <HomeStrategySignalCard />
          <Link href="/risk">
            <div className="p-3 rounded-2xl h-full active:opacity-70 transition-opacity"
              style={{ background: "#0d1f3c", border: `1px solid ${riskColor_}25` }}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold" style={{ color: "#94A3B8" }}>当前风险</p>
                <ChevronRight size={11} color="#64748B" />
              </div>
              <p className="font-black text-[20px]" style={{ color: riskColor_ }}>{risk.level}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <ShieldAlert size={11} color={riskColor_} />
                <span className="text-[11px]" style={{ color: "#94A3B8" }}>仓位 {risk.positionRatio.toFixed(1)}%</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="px-4 mb-5">
        <div className="grid grid-cols-4 gap-2">
          {[
            { href: "/ranking",      icon: Trophy,      label: "排行榜",  color: "#FACC15" },
            { href: "/ranking",      icon: Flame,       label: "涨幅榜",  color: "#EF4444" },
            { href: "/ranking",      icon: ArrowUpDown, label: "量比榜",  color: "#00E5A8" },
            { href: "/strategies",   icon: Layers,      label: "策略库",  color: "#3B82F6" },
          ].map(({ href, icon: Icon, label, color }) => (
            <Link key={label} href={href}>
              <div className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl active:opacity-70"
                style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `${color}18`, border: `1px solid ${color}25` }}>
                  <Icon size={17} color={color} />
                </div>
                <span className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 市场概览（实时数据） */}
      <HomeMarket />

      {/* 策略信号 */}
      <section className="px-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
            <span style={{ color: "#FACC15", marginRight: 6 }}>▌</span>策略信号提醒
          </h2>
          <Link href="/signals" className="flex items-center gap-0.5 text-[12px]" style={{ color: "#94A3B8" }}>
            全部 <ChevronRight size={13} />
          </Link>
        </div>
        <HomeSignals />
      </section>

      {/* 自选股 */}
      <section className="px-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
            <span style={{ color: "#3B82F6", marginRight: 6 }}>▌</span>我的自选股
          </h2>
          <Link href="/watchlist" className="flex items-center gap-0.5 text-[12px]" style={{ color: "#94A3B8" }}>
            全部 <ChevronRight size={13} />
          </Link>
        </div>
        <HomeWatchlist />
      </section>

      {/* 热门策略 */}
      <section className="px-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
            <span style={{ color: "#00E5A8", marginRight: 6 }}>▌</span>热门策略
          </h2>
          <Link href="/strategies" className="flex items-center gap-0.5 text-[12px]" style={{ color: "#94A3B8" }}>
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
                  <BarChart3 size={13} color="#94A3B8" />
                </div>
                <p className="font-bold text-[12px] mb-2" style={{ color: "#F8FAFC" }}>{st.name}</p>
                <p className="text-[10px] mb-0.5" style={{ color: "#94A3B8" }}>年化回测</p>
                <p className="font-black text-[20px] up">+{st.annualReturn}%</p>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px]" style={{ color: "#94A3B8" }}>胜率 {st.winRate}%</span>
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
        <p className="text-[10px] leading-[1.7]" style={{ color: "#94A3B8" }}>
          ⚠️ 本产品仅用于量化策略研究、模拟交易和数据分析，不构成任何投资建议。股市有风险，投资需谨慎。历史回测不代表未来收益。
        </p>
      </div>
    </div>
  );
}
