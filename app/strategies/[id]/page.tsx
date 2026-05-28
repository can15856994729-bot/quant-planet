import Link from "next/link";
import { BarChart3, ChevronRight, Info } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_STRATEGIES } from "@/lib/mock-data";
import { riskColor } from "@/lib/utils";

export async function generateStaticParams() {
  return MOCK_STRATEGIES.map((s) => ({ id: s.id }));
}

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const st = MOCK_STRATEGIES.find((s) => s.id === id) ?? MOCK_STRATEGIES[0];

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

        {/* 回测核心数据 */}
        <div>
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#4a6080" }}>回测核心数据</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: "年化回测收益", value: `+${st.annualReturn}%`, color: "#00E5A8", big: true },
              { label: "最大回撤",     value: `-${st.maxDrawdown}%`,  color: "#EF4444", big: true },
              { label: "策略胜率",     value: `${st.winRate}%`,       color: "#F8FAFC" },
              { label: "交易次数",     value: `${st.tradeCount} 次`,  color: "#F8FAFC" },
            ].map(({ label, value, color, big }) => (
              <div key={label} className="p-3 rounded-xl text-center" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <p className={`font-black num ${big ? "text-[22px]" : "text-[18px]"}`} style={{ color }}>{value}</p>
                <p className="text-[11px] mt-1" style={{ color: "#4a6080" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 参数设置 */}
        {st.params.length > 0 && (
          <div>
            <h2 className="font-bold text-[13px] mb-2" style={{ color: "#4a6080" }}>策略参数</h2>
            <div className="p-4 rounded-2xl space-y-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              {st.params.map((p) => (
                <div key={p.key} className="flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: "#94A3B8" }}>{p.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[15px] num" style={{ color: "#00E5A8" }}>
                      {p.defaultValue}{p.unit}
                    </span>
                    <span className="text-[10px]" style={{ color: "#4a6080" }}>
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
            <h2 className="font-bold text-[13px] mb-2" style={{ color: "#4a6080" }}>使用指标</h2>
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
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#4a6080" }}>适用市场</h2>
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
          <p className="text-[11px] leading-[1.7]" style={{ color: "#4a6080" }}>
            以上回测数据基于历史数据模拟，不构成投资建议。历史回测不代表未来收益，实际交易受手续费、滑点等影响。
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
