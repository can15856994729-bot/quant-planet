import Link from "next/link";
import { TrendingUp, ChevronRight, BarChart3 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_STRATEGIES } from "@/lib/mock-data";
import { riskColor } from "@/lib/utils";

const MARKET_CONDITIONS = ["全部", "趋势行情", "震荡行情", "突破行情", "全市场"];

export default function StrategiesPage() {
  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="策略中心" showBack={false} />

      {/* 筛选 */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto">
        {MARKET_CONDITIONS.map((c, i) => (
          <span key={c} className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold"
            style={{
              background: i === 0 ? "#00E5A8" : "#0d1f3c",
              color: i === 0 ? "#07111F" : "#4a6080",
              border: `1px solid ${i === 0 ? "#00E5A8" : "#1a2f50"}`,
            }}>
            {c}
          </span>
        ))}
      </div>

      {/* 策略数量 */}
      <div className="px-4 py-2">
        <p className="text-[12px]" style={{ color: "#4a6080" }}>共 {MOCK_STRATEGIES.length} 个策略</p>
      </div>

      {/* 策略列表 */}
      <div className="px-4 space-y-3 pb-6">
        {MOCK_STRATEGIES.map((st) => (
          <Link key={st.id} href={`/strategies/${st.id}`}>
            <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              {/* 顶部 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>{st.name}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${riskColor(st.riskLevel)}15`, color: riskColor(st.riskLevel) }}>
                      {st.riskLevel}风险
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: "#94A3B8" }}>{st.description.slice(0, 48)}…</p>
                </div>
                <ChevronRight size={18} color="#4a6080" className="flex-shrink-0 mt-1" />
              </div>

              {/* 数据行 */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: "年化回测",  value: `+${st.annualReturn}%`, color: "#00E5A8" },
                  { label: "最大回撤",  value: `-${st.maxDrawdown}%`,  color: "#EF4444" },
                  { label: "胜率",      value: `${st.winRate}%`,       color: "#F8FAFC" },
                  { label: "交易次数",  value: `${st.tradeCount}次`,   color: "#F8FAFC" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-2 rounded-xl" style={{ background: "#0a1628" }}>
                    <p className="font-black text-[13px] num" style={{ color }}>{value}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "#4a6080" }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* 底部标签 + 行情 */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: "#0a1628", color: "#3B82F6", border: "1px solid #1a2f50" }}>
                    {st.marketCondition}
                  </span>
                  {st.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: "#0a1628", color: "#4a6080", border: "1px solid #1a2f50" }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                  style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.25)" }}>
                  <BarChart3 size={13} />
                  开始回测
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* 免责声明 */}
      <div className="mx-4 mb-6 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}>
        <p className="text-[10px] leading-[1.7]" style={{ color: "#4a6080" }}>
          ⚠️ 以上回测数据均基于历史数据模拟，不构成投资建议。历史回测不代表未来收益，投资需谨慎。
        </p>
      </div>
    </div>
  );
}
