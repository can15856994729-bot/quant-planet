"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BarChart3, TrendingUp, TrendingDown, Info, ChevronRight, Award } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import EquityChart from "@/components/ui/EquityChart";
import { MOCK_BACKTEST, MOCK_STRATEGIES, MOCK_STOCKS } from "@/lib/mock-data";
import { formatPct, pnlColor, riskColor } from "@/lib/utils";

function ResultContent() {
  const params = useSearchParams();
  const strategyId = params.get("strategy") ?? "s1";
  const symbol = params.get("symbol") ?? "600519";

  const strategy = MOCK_STRATEGIES.find((s) => s.id === strategyId) ?? MOCK_STRATEGIES[0];
  const stock = MOCK_STOCKS.find((s) => s.symbol === symbol) ?? MOCK_STOCKS[0];
  const bt = MOCK_BACKTEST;

  const metrics = [
    { label: "累计回测收益", value: `+${bt.totalReturn}%`,  color: "#00E5A8", big: true },
    { label: "最大回撤",     value: `-${bt.maxDrawdown}%`,  color: "#EF4444", big: true },
    { label: "年化收益率",   value: `+${bt.annualReturn}%`, color: "#00E5A8" },
    { label: "夏普比率",     value: bt.sharpeRatio.toFixed(2),  color: "#F8FAFC" },
    { label: "策略胜率",     value: `${bt.winRate}%`,        color: "#F8FAFC" },
    { label: "盈亏比",       value: bt.profitFactor.toFixed(2), color: "#F8FAFC" },
    { label: "总交易次数",   value: `${bt.totalTrades}次`,   color: "#F8FAFC" },
    { label: "平均持仓天数", value: `${bt.avgHoldDays}天`,   color: "#F8FAFC" },
  ];

  // Score color
  const scoreColor = bt.score >= 80 ? "#00E5A8" : bt.score >= 60 ? "#FACC15" : "#EF4444";
  const scoreLabel = bt.score >= 80 ? "优秀" : bt.score >= 60 ? "良好" : "较差";

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="回测结果" />
      <div className="px-4 pt-4 space-y-4 pb-24">

        {/* 数据说明横幅 */}
        <div className="p-3 rounded-xl flex items-start gap-2"
          style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.25)" }}>
          <Info size={13} color="#FACC15" className="flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-[1.6]" style={{ color: "#94A3B8" }}>
            <span className="font-bold" style={{ color: "#FACC15" }}>⚠️ 展示数据说明：</span>
            此页面展示的是<span className="font-bold" style={{ color: "#F8FAFC" }}>历史参考示例数据</span>，
            非真实 Tushare 回测结果。策略「{strategy.name}」暂未实现专属真实回测。
            如需真实回测，请使用
            <Link href="/backtest" className="underline" style={{ color: "#00E5A8" }}>多因子轮动回测</Link>（已接入 Tushare）。
          </p>
        </div>

        {/* 标题概要 */}
        <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>{strategy.name}</p>
              <p className="text-[12px] mt-0.5" style={{ color: "#94A3B8" }}>{stock.name} ({stock.symbol}) · {bt.period}
                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold"
                  style={{ background: "rgba(250,204,21,0.12)", color: "#FACC15" }}>参考数据</span>
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex flex-col items-center justify-center"
                style={{ background: `${scoreColor}15`, border: `2px solid ${scoreColor}` }}>
                <span className="font-black text-[18px] num" style={{ color: scoreColor }}>{bt.score}</span>
                <span className="text-[10px]" style={{ color: scoreColor }}>{scoreLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 核心指标 */}
        <div>
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>核心指标</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {metrics.slice(0, 2).map(({ label, value, color }) => (
              <div key={label} className="p-4 rounded-2xl text-center" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <p className="font-black text-[26px] num" style={{ color }}>{value}</p>
                <p className="text-[11px] mt-1" style={{ color: "#94A3B8" }}>{label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {metrics.slice(2).map(({ label, value, color }) => (
              <div key={label} className="p-3 rounded-xl text-center" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <p className="font-black text-[15px] num" style={{ color }}>{value}</p>
                <p className="text-[10px] mt-1" style={{ color: "#94A3B8" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 收益曲线 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-[13px]" style={{ color: "#94A3B8" }}>收益曲线 vs 沪深300</h2>
            <span className="text-[11px]" style={{ color: "#94A3B8" }}>{bt.period}</span>
          </div>
          <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <EquityChart data={bt.equityCurve} />
          </div>
        </div>

        {/* vs 基准对比 */}
        <div>
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>策略 vs 基准</h2>
          <div className="p-4 rounded-2xl space-y-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            {[
              { label: "累计收益", strategy: `+${bt.totalReturn}%`, bench: "+38.5%" },
              { label: "年化收益", strategy: `+${bt.annualReturn}%`, bench: "+11.2%" },
              { label: "最大回撤", strategy: `-${bt.maxDrawdown}%`, bench: "-28.3%" },
              { label: "夏普比率", strategy: bt.sharpeRatio.toFixed(2), bench: "0.62" },
            ].map(({ label, strategy: sv, bench }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[12px] w-20" style={{ color: "#94A3B8" }}>{label}</span>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] mb-0.5" style={{ color: "#00E5A8" }}>我的策略</p>
                    <p className="font-black text-[14px] num" style={{ color: "#00E5A8" }}>{sv}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] mb-0.5" style={{ color: "#3B82F6" }}>沪深300</p>
                    <p className="font-black text-[14px] num" style={{ color: "#3B82F6" }}>{bench}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 交易记录 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-[13px]" style={{ color: "#94A3B8" }}>交易记录</h2>
            <span className="text-[11px]" style={{ color: "#94A3B8" }}>共{bt.trades.length}笔</span>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2f50" }}>
            {/* 表头 */}
            <div className="grid grid-cols-5 gap-1 px-3 py-2" style={{ background: "#0a1628" }}>
              {["买入日", "卖出日", "买入价", "卖出价", "盈亏"].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-center" style={{ color: "#94A3B8" }}>{h}</span>
              ))}
            </div>
            {bt.trades.slice(0, 8).map((tr, i) => (
              <div key={i} className="grid grid-cols-5 gap-1 px-3 py-2.5"
                style={{ background: i % 2 === 0 ? "#0d1f3c" : "#0a1628", borderTop: "1px solid #1a2f50" }}>
                <span className="text-[10px] text-center" style={{ color: "#94A3B8" }}>{tr.buyDate.slice(5)}</span>
                <span className="text-[10px] text-center" style={{ color: "#94A3B8" }}>{tr.sellDate.slice(5)}</span>
                <span className="text-[10px] text-center num" style={{ color: "#F8FAFC" }}>{tr.buyPrice.toFixed(2)}</span>
                <span className="text-[10px] text-center num" style={{ color: "#F8FAFC" }}>{tr.sellPrice.toFixed(2)}</span>
                <span className={`text-[11px] text-center font-bold num`} style={{ color: pnlColor(tr.pnlPct) }}>
                  {tr.pnlPct > 0 ? "+" : ""}{tr.pnlPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          {bt.trades.length > 8 && (
            <p className="text-center text-[11px] mt-2" style={{ color: "#94A3B8" }}>
              还有 {bt.trades.length - 8} 笔交易记录…
            </p>
          )}
        </div>

        {/* 月度收益热力图 (简单版) */}
        <div>
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>月度收益分布</h2>
          <div className="grid grid-cols-6 gap-1.5">
            {bt.monthlyReturns.map((mr) => {
              // 涨红跌绿（A股惯例）：月度正收益=红，月度负收益=绿
              const c = mr.return > 3 ? "#EF4444" : mr.return > 0 ? "#dc2626" : mr.return > -3 ? "#22C55E" : "#16a34a";
              const bg = mr.return > 3 ? "rgba(239,68,68,0.22)" : mr.return > 0 ? "rgba(239,68,68,0.10)"
                : mr.return > -3 ? "rgba(34,197,94,0.15)" : "rgba(34,197,94,0.26)";
              return (
                <div key={mr.month} className="p-2 rounded-lg text-center" style={{ background: bg }}>
                  <p className="text-[10px]" style={{ color: "#94A3B8" }}>{mr.month.slice(5)}</p>
                  <p className="text-[11px] font-bold num" style={{ color: c }}>
                    {mr.return > 0 ? "+" : ""}{mr.return.toFixed(1)}%
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 风险提示 */}
        <div className="p-3 rounded-xl flex items-start gap-2"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
          <Info size={14} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-[1.7]" style={{ color: "#94A3B8" }}>
            以上回测数据基于历史数据模拟，不构成任何投资建议。历史回测不代表未来收益，实际交易受手续费、滑点、流动性等因素影响，盈亏自负。
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/sim-trading">
            <div className="w-full py-3.5 rounded-2xl font-black text-[14px] text-center glow-green"
              style={{ background: "linear-gradient(135deg, #00E5A8, #00b885)", color: "#07111F" }}>
              进入模拟交易
            </div>
          </Link>
          <Link href="/backtest">
            <div className="w-full py-3.5 rounded-2xl font-bold text-[14px] text-center"
              style={{ background: "#0d1f3c", border: "1px solid #1a2f50", color: "#94A3B8" }}>
              重新回测
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BacktestResultPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "#00E5A8", borderTopColor: "transparent" }} />
      </div>
    }>
      <ResultContent />
    </Suspense>
  );
}
