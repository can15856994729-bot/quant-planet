"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrendingUp, ChevronRight, BarChart3 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_STRATEGIES } from "@/lib/mock-data";
import { riskColor } from "@/lib/utils";

const MARKET_CONDITIONS = ["全部", "趋势行情", "震荡行情", "突破行情", "全市场"];

export default function StrategiesPage() {
  const [activeFilter, setActiveFilter] = useState("全部");
  const router = useRouter();

  const filtered =
    activeFilter === "全部"
      ? MOCK_STRATEGIES
      : MOCK_STRATEGIES.filter((st) => st.marketCondition === activeFilter);

  function handleBacktest(e: React.MouseEvent, strategyId: string) {
    // 阻止 Link 点击冒泡，直接跳转回测页
    e.preventDefault();
    e.stopPropagation();
    // ST策略有专属回测页面
    if (strategyId === "st-risk-reversal") {
      router.push("/strategies/st-risk-reversal");
      return;
    }
    // 多因子轮动策略直接到回测页（默认模式）
    if (strategyId === "a-share-multi-factor") {
      router.push("/backtest");
      return;
    }
    // 其他策略跳转到回测页，带上strategyId（显示"暂未实现"提示）
    router.push(`/backtest?strategy=${strategyId}`);
  }

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="策略中心" showBack={false} />

      {/* 筛选 */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto">
        {MARKET_CONDITIONS.map((c) => {
          const isActive = c === activeFilter;
          return (
            <button
              key={c}
              onClick={() => setActiveFilter(c)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold"
              style={{
                background: isActive ? "#00E5A8" : "#0d1f3c",
                color: isActive ? "#07111F" : "#64748B",
                border: `1px solid ${isActive ? "#00E5A8" : "#1a2f50"}`,
                cursor: "pointer",
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* 策略数量 */}
      <div className="px-4 py-2">
        <p className="text-[12px]" style={{ color: "#94A3B8" }}>
          共 {filtered.length} 个策略
          {activeFilter !== "全部" && (
            <span style={{ color: "#00E5A8" }}> · {activeFilter}</span>
          )}
        </p>
      </div>

      {/* 策略列表 */}
      <div className="px-4 space-y-3 pb-6">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[14px]" style={{ color: "#94A3B8" }}>暂无该分类策略</p>
            <button
              onClick={() => setActiveFilter("全部")}
              className="mt-3 px-4 py-2 rounded-xl text-[12px] font-bold"
              style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.25)" }}
            >
              查看全部
            </button>
          </div>
        ) : (
          filtered.map((st) => (
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
                  <ChevronRight size={18} color="#94A3B8" className="flex-shrink-0 mt-1" />
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
                      <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>{label}</p>
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
                        style={{ background: "#0a1628", color: "#94A3B8", border: "1px solid #1a2f50" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={(e) => handleBacktest(e, st.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                    style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.25)" }}
                  >
                    <BarChart3 size={13} />
                    开始回测
                  </button>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* 免责声明 */}
      <div className="mx-4 mb-6 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}>
        <p className="text-[10px] leading-[1.7]" style={{ color: "#94A3B8" }}>
          ⚠️ 以上回测数据均基于历史数据模拟，不构成投资建议。历史回测不代表未来收益，投资需谨慎。
        </p>
      </div>
    </div>
  );
}
