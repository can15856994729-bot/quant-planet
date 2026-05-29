"use client";
import Link from "next/link";
import { ShieldAlert, TrendingDown, AlertTriangle, Activity, ChevronRight, Info } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { getRiskReport, riskLevelColor, riskScoreColor } from "@/lib/riskService";
import type { RiskItem, RiskPortfolioLevel } from "@/lib/riskService";
import { MOCK_SIM_ACCOUNT } from "@/lib/mock-data";

// ── Item type icon ────────────────────────────────────────────────
function RiskItemIcon({ type, level }: { type: RiskItem["type"]; level: RiskPortfolioLevel }) {
  const color = riskLevelColor(level);
  if (type === "position")      return <ShieldAlert  size={15} color={color} />;
  if (type === "concentration") return <Activity     size={15} color={color} />;
  if (type === "signal")        return <AlertTriangle size={15} color={color} />;
  if (type === "loss")          return <TrendingDown  size={15} color={color} />;
  return <Info size={15} color={color} />;
}

// ── Gauge bar component ──────────────────────────────────────────
function GaugeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// ── Score ring (pure CSS) ─────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color = riskScoreColor(score);
  const circumference = 2 * Math.PI * 36; // r=36
  const dashOffset = circumference * (1 - score / 100);
  return (
    <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
      <svg width="96" height="96" style={{ transform: "rotate(-90deg)", position: "absolute" }}>
        <circle cx="48" cy="48" r="36" fill="none" strokeWidth="6"
          stroke="rgba(255,255,255,0.06)" />
        <circle cx="48" cy="48" r="36" fill="none" strokeWidth="6"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round" />
      </svg>
      <div className="relative flex flex-col items-center">
        <span className="font-black text-[24px] num" style={{ color }}>{score}</span>
        <span className="text-[9px]" style={{ color: "#64748B" }}>综合评分</span>
      </div>
    </div>
  );
}

export default function RiskPage() {
  const report = getRiskReport();
  const levelColor = riskLevelColor(report.level);
  const account = MOCK_SIM_ACCOUNT;

  // Dimension cards
  const dimensions = [
    {
      label: "仓位风险",
      score: report.positionScore,
      max: 30,
      desc: `当前仓位 ${report.positionRatio.toFixed(1)}%`,
      color: report.positionScore > 20 ? "#EF4444" : report.positionScore > 10 ? "#FACC15" : "#00E5A8",
    },
    {
      label: "集中度风险",
      score: report.concentrationScore,
      max: 25,
      desc: report.topHolding ? `最大单仓 ${report.topHolding.pct.toFixed(1)}%` : "无持仓",
      color: report.concentrationScore > 17 ? "#EF4444" : report.concentrationScore > 9 ? "#FACC15" : "#00E5A8",
    },
    {
      label: "信号风险",
      score: report.signalScore,
      max: 25,
      desc: `止损 ${report.stopLossCount} · 高风险 ${report.highRiskCount}`,
      color: report.signalScore > 17 ? "#EF4444" : report.signalScore > 9 ? "#FACC15" : "#00E5A8",
    },
    {
      label: "亏损风险",
      score: report.marketScore,
      max: 20,
      desc: `${account.positions.filter(p => p.pnl < 0).length} 只持仓浮亏`,
      color: report.marketScore > 13 ? "#EF4444" : report.marketScore > 6 ? "#FACC15" : "#00E5A8",
    },
  ];

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="风险分析" showBack />

      {/* ── 总体评分卡 ── */}
      <div className="mx-4 mt-4 p-4 rounded-2xl"
        style={{ background: "#0d1f3c", border: `1px solid ${levelColor}30` }}>
        <div className="flex items-center gap-4">
          <ScoreRing score={report.score} />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-black text-[24px]" style={{ color: levelColor }}>
                {report.level}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: `${levelColor}18`, color: levelColor, border: `1px solid ${levelColor}30` }}>
                {report.level === "低" ? "整体可控" : report.level === "中等" ? "需要关注" : "请及时处理"}
              </span>
            </div>
            <p className="text-[11px] leading-[1.7]" style={{ color: "#94A3B8" }}>
              {report.level === "低" && "当前组合风险在可控范围内，继续保持纪律。"}
              {report.level === "中等" && "组合存在一定风险，建议关注仓位和集中度。"}
              {report.level === "高" && "组合风险较高，建议立即审视持仓并采取降险措施。"}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px]" style={{ color: "#64748B" }}>
                持仓 {report.positionRatio.toFixed(1)}%
              </span>
              <span className="text-[10px]" style={{ color: "#64748B" }}>
                {account.positions.length} 只标的
              </span>
              <span className="text-[10px]" style={{ color: "#64748B" }}>
                {report.items.length} 项风险
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 风险维度 ── */}
      <div className="mx-4 mt-4">
        <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>风险维度拆解</h2>
        <div className="p-4 rounded-2xl space-y-3"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          {dimensions.map((dim) => (
            <div key={dim.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-semibold" style={{ color: "#F8FAFC" }}>{dim.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: "#64748B" }}>{dim.desc}</span>
                  <span className="font-bold text-[12px] num" style={{ color: dim.color }}>
                    {dim.score}<span className="text-[9px] font-normal" style={{ color: "#64748B" }}>/{dim.max}</span>
                  </span>
                </div>
              </div>
              <GaugeBar value={dim.score} max={dim.max} color={dim.color} />
            </div>
          ))}
        </div>
      </div>

      {/* ── 持仓概览 ── */}
      <div className="mx-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-[13px]" style={{ color: "#94A3B8" }}>持仓分布</h2>
          <Link href="/sim-trading" className="flex items-center gap-0.5 text-[11px]" style={{ color: "#3B82F6" }}>
            模拟账户 <ChevronRight size={12} />
          </Link>
        </div>
        <div className="p-3 rounded-2xl space-y-2"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          {account.positions.map((pos) => {
            const pct = (pos.marketValue / account.positions.reduce((s, p) => s + p.marketValue, 0)) * 100;
            const isLoss = pos.pnl < 0;
            return (
              <div key={pos.symbol} className="flex items-center gap-2">
                <div className="w-24 flex-shrink-0">
                  <span className="font-semibold text-[12px]" style={{ color: "#F8FAFC" }}>{pos.name}</span>
                </div>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: isLoss ? "#EF4444" : "#00E5A8",
                    }} />
                </div>
                <span className="w-10 text-right text-[11px] num" style={{ color: "#94A3B8" }}>
                  {pct.toFixed(1)}%
                </span>
                <span className="w-16 text-right text-[11px] num font-semibold"
                  style={{ color: isLoss ? "#EF4444" : "#00E5A8" }}>
                  {isLoss ? "" : "+"}{pos.pnlPct.toFixed(2)}%
                </span>
              </div>
            );
          })}
          <div className="pt-1 border-t" style={{ borderColor: "#1a2f50" }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "#64748B" }}>现金</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full"
                    style={{
                      width: `${(account.cash / account.totalValue * 100).toFixed(1)}%`,
                      background: "#3B82F6",
                    }} />
                </div>
                <span className="text-[11px] num" style={{ color: "#3B82F6" }}>
                  {(account.cash / account.totalValue * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 信号统计 ── */}
      <div className="mx-4 mt-4">
        <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>今日信号分布</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "买入信号", value: report.buySignalCount,  color: "#00E5A8", href: "/signals" },
            { label: "卖出信号", value: report.sellSignalCount, color: "#EF4444", href: "/signals" },
            { label: "止损警告", value: report.stopLossCount,   color: "#F97316", href: "/signals" },
            { label: "高风险预警",value: report.highRiskCount,  color: "#EF4444", href: "/signals" },
          ].map(({ label, value, color, href }) => (
            <Link key={label} href={href}>
              <div className="p-3 rounded-xl text-center active:opacity-70"
                style={{ background: "#0d1f3c", border: `1px solid ${value > 0 ? color + "30" : "#1a2f50"}` }}>
                <p className="font-black text-[20px] num" style={{ color: value > 0 ? color : "#64748B" }}>
                  {value}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>{label}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── 风险项列表 ── */}
      {report.items.length > 0 && (
        <div className="mx-4 mt-4">
          <h2 className="font-bold text-[13px] mb-2" style={{ color: "#94A3B8" }}>
            风险项明细 · {report.items.length} 条
          </h2>
          <div className="space-y-2">
            {report.items.map((item) => {
              const c = riskLevelColor(item.level);
              return (
                <div key={item.id} className="p-3 rounded-2xl"
                  style={{ background: "#0d1f3c", border: `1px solid ${c}25` }}>
                  <div className="flex items-start gap-2 mb-1.5">
                    <div className="mt-0.5 flex-shrink-0"><RiskItemIcon type={item.type} level={item.level} /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{item.title}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: `${c}18`, color: c }}>
                          {item.level}风险
                        </span>
                      </div>
                      <p className="text-[11px] leading-[1.6]" style={{ color: "#94A3B8" }}>{item.reason}</p>
                    </div>
                  </div>
                  <div className="ml-5 px-2 py-1.5 rounded-lg"
                    style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)" }}>
                    <p className="text-[10px] leading-[1.6]" style={{ color: "#3B82F6" }}>
                      💡 {item.suggestion}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 无风险项 ── */}
      {report.items.length === 0 && (
        <div className="mx-4 mt-6 py-10 rounded-2xl text-center"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <ShieldAlert size={36} color="#00E5A8" className="mx-auto mb-2" />
          <p className="font-semibold" style={{ color: "#00E5A8" }}>组合风险良好</p>
          <p className="text-[11px] mt-1" style={{ color: "#64748B" }}>暂无需关注的风险项</p>
        </div>
      )}

      {/* ── 免责 ── */}
      <div className="mx-4 mt-5 mb-8 p-3 rounded-xl"
        style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}>
        <div className="flex items-start gap-2">
          <Info size={11} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-[1.7]" style={{ color: "#94A3B8" }}>
            ⚠️ 风险评分由量化模型基于当前持仓、信号和历史数据估算，仅供参考，不构成投资建议。实际风险受市场波动影响，投资者应结合自身情况作出判断。
          </p>
        </div>
      </div>
    </div>
  );
}
