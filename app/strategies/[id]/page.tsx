"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BarChart3, ChevronRight, Info, AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_STRATEGIES } from "@/lib/mock-data";
import { riskColor } from "@/lib/utils";
import type { StrategyResult, StrategySignal, MarketStatus } from "@/lib/strategyService";

// ── helpers ──────────────────────────────────────────────────────
function mktColor(s: MarketStatus) {
  return s === "强势" ? "#00E5A8" : s === "弱势" ? "#EF4444" : s === "数据不足" ? "#64748B" : "#FACC15";
}
function actColor(a: StrategySignal["action"]) {
  return a === "buy" ? "#00E5A8" : a === "sell" ? "#EF4444" : a === "watch" ? "#FACC15" : "#64748B";
}
function actLabel(a: StrategySignal["action"]) {
  return a === "buy" ? "买入" : a === "sell" ? "卖出" : a === "watch" ? "关注" : "持有";
}

// Small factor score bar
function FBar({ label, score }: { label: string; score: number }) {
  const c = score >= 60 ? "#00E5A8" : score >= 45 ? "#FACC15" : "#EF4444";
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-[9px]" style={{ color: "#64748B" }}>{label}</span>
      <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: c }} />
      </div>
      <span className="w-6 text-right text-[9px] num font-bold" style={{ color: c }}>{score}</span>
    </div>
  );
}

// Signal card (buy/watch/sell)
function SigCard({ sig }: { sig: StrategySignal }) {
  const c = actColor(sig.action);
  const orderQuery = sig.action === "buy"
    ? `symbol=${sig.symbol}&name=${encodeURIComponent(sig.name)}&price=${sig.entryPrice.toFixed(2)}&stopLoss=${sig.stopLossPrice.toFixed(2)}&takeProfit=${sig.takeProfitPrice.toFixed(2)}&pct=${Math.round(sig.suggestedPositionPct * 100)}&from=${encodeURIComponent("A股稳健多因子轮动策略")}`
    : null;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#0d1f3c", border: `1px solid ${c}30` }}>
      <Link href={`/stock/${sig.symbol}`}>
        <div className="p-3 active:opacity-75">
          <div className="flex items-start justify-between mb-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{sig.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                style={{ background: `${c}18`, color: c }}>{actLabel(sig.action)}</span>
              <span className="text-[9px] px-1 py-0.5 rounded"
                style={{ background: "rgba(59,130,246,0.10)", color: "#3B82F6" }}>
                评分{sig.score}
              </span>
            </div>
            <p className="font-bold text-[13px] num flex-shrink-0 ml-2" style={{ color: "#F8FAFC" }}>
              ¥{sig.entryPrice.toFixed(2)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-2">
            <FBar label="趋势" score={sig.trendScore} />
            <FBar label="动量" score={sig.momentumScore} />
          </div>
          {sig.reasons[0] && (
            <p className="text-[10px] truncate" style={{ color: "#94A3B8" }}>{sig.reasons[0]}</p>
          )}
          {sig.warnings[0] && (
            <p className="text-[10px] mt-0.5" style={{ color: "#FACC15" }}>⚠️ {sig.warnings[0]}</p>
          )}
          <div className="flex gap-3 mt-1.5">
            <span className="text-[9px]" style={{ color: "#EF4444" }}>止损¥{sig.stopLossPrice.toFixed(2)}</span>
            <span className="text-[9px]" style={{ color: "#00E5A8" }}>止盈¥{sig.takeProfitPrice.toFixed(2)}</span>
            <span className="text-[9px]" style={{ color: "#64748B" }}>建仓{(sig.suggestedPositionPct * 100).toFixed(0)}%</span>
          </div>
        </div>
      </Link>
      {/* 策略模拟下单入口（仅买入信号显示） */}
      {orderQuery && (
        <div className="px-3 pb-3">
          <Link href={`/sim-trading?${orderQuery}`}>
            <div className="w-full py-2 rounded-xl text-center text-[12px] font-bold active:opacity-70"
              style={{ background: "rgba(0,229,168,0.10)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.2)" }}>
              策略模拟下单 →
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function StrategyDetailPage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const isMultiFactor = id === "a-share-multi-factor";
  const st = MOCK_STRATEGIES.find((s) => s.id === id) ?? MOCK_STRATEGIES[0];

  // Live strategy data (only for multi-factor)
  const [liveResult, setLiveResult] = useState<StrategyResult | null>(null);
  const [liveLoading, setLiveLoading] = useState(isMultiFactor);
  const [liveError,   setLiveError]   = useState(false);

  useEffect(() => {
    if (!isMultiFactor) return;
    fetch("/api/strategy/signals")
      .then(r => r.json())
      .then((d: StrategyResult) => { if (d.ok) setLiveResult(d); else setLiveError(true); })
      .catch(() => setLiveError(true))
      .finally(() => setLiveLoading(false));
  }, [isMultiFactor]);

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title={st.name} />

      <div className="px-4 pt-4 space-y-4 pb-8">

        {/* 基本信息 */}
        <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ background: `${riskColor(st.riskLevel)}15`, color: riskColor(st.riskLevel) }}>
              {st.riskLevel}风险
            </span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6" }}>
              {st.marketCondition}
            </span>
          </div>
          <p className="text-[13px] leading-[1.7]" style={{ color: "#94A3B8" }}>{st.description}</p>
        </div>

        {/* ── 多因子策略实时数据区 ─────────────────────────────────── */}
        {isMultiFactor && (
          <>
            {/* Loading */}
            {liveLoading && (
              <div className="flex items-center justify-center py-10">
                <div className="w-8 h-8 rounded-full border-2 animate-spin"
                  style={{ borderColor: "#00E5A8", borderTopColor: "transparent" }} />
              </div>
            )}

            {/* Error */}
            {liveError && !liveLoading && (
              <div className="p-3 rounded-xl flex items-center gap-2"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertTriangle size={14} color="#EF4444" className="flex-shrink-0" />
                <p className="text-[12px]" style={{ color: "#EF4444" }}>策略信号加载失败，请稍后重试</p>
              </div>
            )}

            {/* Live result */}
            {liveResult && !liveLoading && (
              <>
                {/* 市场状态 */}
                <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-[13px]" style={{ color: "#94A3B8" }}>市场择时</h2>
                    <span className="text-[9px]" style={{ color: "#64748B" }}>
                      {new Date(liveResult.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 更新
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mb-2">
                    <div>
                      <p className="text-[10px] mb-0.5" style={{ color: "#64748B" }}>沪深300状态</p>
                      <span className="font-black text-[22px]" style={{ color: mktColor(liveResult.marketStatus) }}>
                        {liveResult.marketStatus}
                      </span>
                    </div>
                    <div className="h-10 w-px" style={{ background: "#1a2f50" }} />
                    <div>
                      <p className="text-[10px] mb-0.5" style={{ color: "#64748B" }}>建议总仓位</p>
                      <p className="font-black text-[22px] num" style={{ color: "#00E5A8" }}>
                        {(liveResult.suggestedTotalPosition * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="h-10 w-px" style={{ background: "#1a2f50" }} />
                    <div>
                      <p className="text-[10px] mb-0.5" style={{ color: "#64748B" }}>组合风险</p>
                      <p className="font-black text-[18px]" style={{
                        color: liveResult.riskLevel === "低" ? "#00E5A8" : liveResult.riskLevel === "高" ? "#EF4444" : "#FACC15"
                      }}>
                        {liveResult.riskLevel}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] leading-[1.6]" style={{ color: "#64748B" }}>{liveResult.marketStatusNote}</p>
                </div>

                {/* 买入信号 */}
                {liveResult.buySignals.length > 0 && (
                  <div>
                    <h2 className="font-bold text-[13px] mb-2 flex items-center gap-2" style={{ color: "#94A3B8" }}>
                      <TrendingUp size={13} color="#00E5A8" />
                      今日买入信号
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>
                        {liveResult.buySignals.length} 只
                      </span>
                    </h2>
                    <div className="space-y-2">
                      {liveResult.buySignals.map(sig => <SigCard key={sig.symbol} sig={sig} />)}
                    </div>
                  </div>
                )}

                {/* 卖出信号 */}
                {liveResult.sellSignals.length > 0 && (
                  <div>
                    <h2 className="font-bold text-[13px] mb-2 flex items-center gap-2" style={{ color: "#94A3B8" }}>
                      <TrendingDown size={13} color="#EF4444" />
                      卖出 / 减仓信号
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}>
                        {liveResult.sellSignals.length} 只
                      </span>
                    </h2>
                    <div className="space-y-2">
                      {liveResult.sellSignals.map(sig => <SigCard key={sig.symbol} sig={sig} />)}
                    </div>
                  </div>
                )}

                {/* 关注候选 */}
                {liveResult.watchlist.length > 0 && (
                  <div>
                    <h2 className="font-bold text-[13px] mb-2 flex items-center gap-2" style={{ color: "#94A3B8" }}>
                      <Activity size={13} color="#FACC15" />
                      关注候选
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: "rgba(250,204,21,0.12)", color: "#FACC15" }}>
                        {liveResult.watchlist.length} 只
                      </span>
                    </h2>
                    <div className="space-y-2">
                      {liveResult.watchlist.map(sig => <SigCard key={sig.symbol} sig={sig} />)}
                    </div>
                  </div>
                )}

                {/* 数据透明度 */}
                <div className="p-3 rounded-xl" style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}>
                  <p className="font-bold text-[11px] mb-1.5" style={{ color: "#3B82F6" }}>📊 数据透明度说明</p>
                  {liveResult.dataNote.split("；").map((note, i) => (
                    <p key={i} className="text-[10px] mt-0.5 leading-[1.6]" style={{ color: "#94A3B8" }}>{note}</p>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* 回测核心数据 */}
        <div>
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>
            回测核心数据{isMultiFactor && <span className="ml-1 text-[10px] font-normal" style={{ color: "#64748B" }}>（参考值，非真实回测）</span>}
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: "年化回测收益", value: `+${st.annualReturn}%`, color: "#00E5A8", big: true },
              { label: "最大回撤",     value: `-${st.maxDrawdown}%`,  color: "#EF4444", big: true },
              { label: "策略胜率",     value: `${st.winRate}%`,       color: "#F8FAFC" },
              { label: "交易次数",     value: `${st.tradeCount} 次`,  color: "#F8FAFC" },
            ].map(({ label, value, color, big }) => (
              <div key={label} className="p-3 rounded-xl text-center" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <p className={`font-black num ${big ? "text-[22px]" : "text-[18px]"}`} style={{ color }}>{value}</p>
                <p className="text-[11px] mt-1" style={{ color: "#94A3B8" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 参数设置 */}
        {st.params.length > 0 && (
          <div>
            <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>策略参数</h2>
            <div className="p-4 rounded-2xl space-y-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              {st.params.map((p) => (
                <div key={p.key} className="flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: "#94A3B8" }}>{p.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[15px] num" style={{ color: "#00E5A8" }}>
                      {p.defaultValue}{p.unit}
                    </span>
                    <span className="text-[10px]" style={{ color: "#94A3B8" }}>
                      ({p.min}~{p.max})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 使用指标 */}
        {st.indicators.length > 0 && (
          <div>
            <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>使用指标</h2>
            <div className="flex flex-wrap gap-2">
              {st.indicators.map((ind) => (
                <span key={ind} className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                  style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.2)" }}>
                  {ind}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 适用市场 */}
        <div>
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>适用市场</h2>
          <div className="flex gap-2">
            {st.markets.map((m) => (
              <span key={m} className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                style={{ background: "rgba(0,229,168,0.1)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.2)" }}>
                {m === "A" ? "A股" : m === "HK" ? "港股" : "美股"}
              </span>
            ))}
          </div>
        </div>

        {/* 风险提示 */}
        <div className="p-3 rounded-xl flex items-start gap-2"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
          <Info size={14} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-[1.7]" style={{ color: "#94A3B8" }}>
            {isMultiFactor
              ? "以上信号基于东方财富实时行情和历史K线计算，不构成投资建议。因子模型可能存在过拟合风险，信号仅供参考，请结合自身风险承受能力决策。"
              : "以上回测数据基于历史数据模拟，不构成投资建议。历史回测不代表未来收益，实际交易受手续费、滑点等影响。"
            }
          </p>
        </div>

        {/* 开始回测按钮 */}
        <Link href={`/backtest?strategy=${st.id}`}>
          <div className="w-full py-4 rounded-2xl font-black text-[16px] text-center glow-green"
            style={{ background: "linear-gradient(135deg, #00E5A8, #00b885)", color: "#07111F" }}>
            <BarChart3 size={18} className="inline mr-2" />
            开始回测此策略
          </div>
        </Link>
      </div>
    </div>
  );
}
