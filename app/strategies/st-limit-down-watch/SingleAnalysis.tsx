"use client";
/**
 * SingleAnalysis.tsx — 单只 ST 股连续跌停观察分析
 *
 * ⚠️ 分析结果仅显示观察信息，不产生买入信号。
 */

import { useState } from "react";
import { Search, AlertTriangle, Eye, TrendingDown, Shield, RefreshCw } from "lucide-react";
import type { STLimitDownWatchSingleResult, STLimitDownWatchParams } from "@/lib/stLimitDownWatchService";

// ── K 线图（仅标注跌停区间，无买卖信号）─────────────────────────────────────

import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceArea, ResponsiveContainer,
} from "recharts";
import type { DayBar } from "@/lib/stLimitDownWatchService";

function LimitDownKlineChart({ bars, streakStartDate, streakEndDate }: {
  bars: DayBar[];
  streakStartDate: string;
  streakEndDate:   string;
}) {
  // bars 最新在前，需要翻转为时间正序展示
  const data = [...bars].reverse().slice(-60);
  if (data.length === 0) return null;

  const tickFmt = (v: string) =>
    v?.length === 8 ? `${v.slice(4,6)}/${v.slice(6,8)}` : v;

  return (
    <div style={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 12, padding: "12px 8px" }}>
      <p className="text-[11px] font-bold mb-2 px-2" style={{ color: "#94A3B8" }}>
        K 线图（红色区间 = 连续跌停区间，无买卖信号）
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
          <XAxis dataKey="date" tickFormatter={tickFmt}
            tick={{ fontSize: 9, fill: "#64748B" }} tickLine={false} axisLine={false}
            interval="preserveStartEnd" />
          <YAxis domain={["auto","auto"]}
            tick={{ fontSize: 9, fill: "#64748B" }} tickLine={false} axisLine={false}
            width={44} tickFormatter={(v:number) => v.toFixed(2)} />
          <Tooltip
            contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: "#94A3B8" }}
            formatter={(v: unknown, name: string | number | undefined) => [
              typeof v === "number" ? v.toFixed(2) : String(v),
              name === "close" ? "收盘价" : String(name ?? ""),
            ]}
          />
          {/* 跌停区间标注 */}
          <ReferenceArea
            x1={streakStartDate} x2={streakEndDate}
            fill="rgba(239,68,68,0.15)" stroke="#EF4444" strokeWidth={1}
            label={{ value: "跌停区间", position: "insideTop", fill: "#EF4444", fontSize: 10 }}
          />
          <Line type="monotone" dataKey="close" name="close"
            stroke="#F8FAFC" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {/* 无买卖信号说明 */}
      <p className="text-[10px] text-center mt-1" style={{ color: "#475569" }}>
        ⚠ 该策略不产生买入点和卖出点，当前无买卖信号
      </p>
    </div>
  );
}

// ── 评分卡片 ─────────────────────────────────────────────────────────────────

function ScoreCard({ label, score, color = "#F8FAFC", note }: {
  label: string; score: number; color?: string; note?: string;
}) {
  return (
    <div className="p-2.5 rounded-xl" style={{ background: "#0a1628" }}>
      <p className="text-[10px] mb-1" style={{ color: "#64748B" }}>{label}</p>
      <p className="font-black text-[18px] num" style={{ color }}>{score}</p>
      <div className="w-full h-1 rounded-full mt-1" style={{ background: "#1a2f50" }}>
        <div className="h-1 rounded-full" style={{ width: `${Math.min(100,score)}%`, background: color }} />
      </div>
      {note && <p className="text-[10px] mt-1" style={{ color: "#64748B" }}>{note}</p>}
    </div>
  );
}

// ── 分类标签 ─────────────────────────────────────────────────────────────────

function ClassBadge({ cls }: { cls: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    watch_pool:        { label: "✓ 进入观察池", color: "#00E5A8", bg: "rgba(0,229,168,0.12)" },
    high_risk:         { label: "✗ 高风险剔除", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
    insufficient_data: { label: "⚠ 数据不足",   color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
    not_matching:      { label: "— 不符合条件", color: "#64748B", bg: "rgba(100,116,139,0.12)" },
  };
  const cfg = map[cls] ?? map.not_matching!;
  return (
    <span className="text-[12px] font-bold px-3 py-1 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

interface Props {
  params: STLimitDownWatchParams;
}

export default function SingleAnalysis({ params }: Props) {
  const [tsCode, setTsCode]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<STLimitDownWatchSingleResult | null>(null);

  const handleAnalyze = async () => {
    const code = tsCode.trim();
    if (!code) { setError("请输入股票代码（如 600745.SH）"); return; }

    // 自动补全后缀
    let fullCode = code.toUpperCase();
    if (!/\.(SH|SZ|BJ)$/.test(fullCode)) {
      const n = parseInt(fullCode);
      if (n >= 600000) fullCode += ".SH";
      else if (n >= 300000) fullCode += ".SZ";
      else fullCode += ".SZ";
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/strategies/st-limit-down-watch/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tsCode: fullCode, name: "ST股票", params }),
      });
      const data: STLimitDownWatchSingleResult = await res.json();
      if (!data.ok && data.classification === "insufficient_data") throw new Error(data.error ?? "分析失败");
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* 输入 */}
      <div className="mb-4 p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <p className="text-[12px] font-bold mb-3" style={{ color: "#94A3B8" }}>单只股票分析</p>
        <div className="flex gap-2">
          <input
            value={tsCode}
            onChange={e => setTsCode(e.target.value)}
            placeholder="输入代码，如 600745 或 600745.SH"
            onKeyDown={e => e.key === "Enter" && handleAnalyze()}
            className="flex-1 px-3 py-2.5 rounded-xl text-[13px] font-mono"
            style={{ background: "#0a1628", border: "1px solid #1a2f50", color: "#F8FAFC", outline: "none" }}
          />
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-bold"
            style={{
              background: loading ? "rgba(0,229,168,0.06)" : "#00E5A8",
              color: loading ? "#64748B" : "#07111F",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            分析
          </button>
        </div>
      </div>

      {/* 错误 */}
      {error && (
        <div className="mb-4 p-3 rounded-xl flex items-start gap-2"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle size={14} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-[12px]" style={{ color: "#EF4444" }}>{error}</p>
        </div>
      )}

      {/* 结果 */}
      {result && (
        <div className="space-y-4">
          {/* 标题 + 分类 */}
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>{result.name}</h3>
            <span className="text-[12px]" style={{ color: "#64748B" }}>{result.symbol}</span>
            <ClassBadge cls={result.classification} />
          </div>

          <p className="text-[12px]" style={{ color: "#94A3B8" }}>{result.classificationReason}</p>

          {/* 进入观察池时的提示 */}
          {result.classification === "watch_pool" && (
            <div className="p-3 rounded-xl flex items-start gap-2"
              style={{ background: "rgba(0,229,168,0.08)", border: "1px solid rgba(0,229,168,0.2)" }}>
              <Eye size={14} color="#00E5A8" className="flex-shrink-0 mt-0.5" />
              <p className="text-[12px]" style={{ color: "#00E5A8" }}>
                该股票符合连续跌停观察条件，当前仅观察，<strong>暂不买入</strong>。
              </p>
            </div>
          )}

          {/* 基本信息 */}
          {result.streakResult && (
            <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[12px] font-bold mb-2" style={{ color: "#94A3B8" }}>跌停信息</p>
              <div className="grid grid-cols-2 gap-y-1.5 text-[12px]">
                <span style={{ color: "#64748B" }}>连续跌停次数</span>
                <span style={{ color: "#EF4444", fontWeight: 700 }}>{result.streakResult.streak} 次</span>
                <span style={{ color: "#64748B" }}>跌停区间</span>
                <span style={{ color: "#F8FAFC" }}>{result.streakResult.streakStartDate} ~ {result.streakResult.streakEndDate}</span>
                <span style={{ color: "#64748B" }}>当前是否跌停</span>
                <span style={{ color: result.streakResult.isStillLimitDown ? "#EF4444" : "#00E5A8", fontWeight: 700 }}>
                  {result.streakResult.isStillLimitDown ? "⚠ 仍在跌停" : "已打开"}
                </span>
                <span style={{ color: "#64748B" }}>跌停打开日</span>
                <span style={{ color: "#F8FAFC" }}>{result.streakResult.openedDate ?? "未打开"}</span>
                <span style={{ color: "#64748B" }}>一字跌停天数</span>
                <span style={{ color: "#F8FAFC" }}>{result.streakResult.oneWordDays} 天</span>
                <span style={{ color: "#64748B" }}>最低收盘价</span>
                <span style={{ color: "#F8FAFC" }}>{result.streakResult.lowestClose.toFixed(2)}</span>
                <span style={{ color: "#64748B" }}>最新收盘价</span>
                <span style={{ color: "#F8FAFC" }}>{result.streakResult.latestClose.toFixed(2)}</span>
                <span style={{ color: "#64748B" }}>范围是否符合</span>
                <span style={{ color: result.inStreakRange ? "#00E5A8" : "#EF4444", fontWeight: 700 }}>
                  {result.inStreakRange ? `✓ 符合（${params.minLimitDownStreak}-${params.maxLimitDownStreak}次范围）` : "✗ 不符合"}
                </span>
              </div>
            </div>
          )}

          {/* 评分概览 */}
          {result.candidate && (
            <div className="grid grid-cols-2 gap-2">
              <ScoreCard label="未见底评分" score={result.candidate.notBottomedScore}
                color="#F59E0B" note={`观察级别：${result.candidate.watchLevel}`} />
              <ScoreCard label="退市风险" score={result.candidate.delistingRiskScore}
                color={result.candidate.delistingRiskScore > 40 ? "#EF4444" : "#00E5A8"}
                note={result.candidate.delistingRiskLevel} />
              <ScoreCard label="重组预期" score={result.candidate.restructuringExpectationScore}
                color="#3B82F6"
                note={result.candidate.degraded ? "降级（无公告数据）" : undefined} />
              <ScoreCard label="财务修复" score={result.candidate.financialRepairScore} color="#8B5CF6" />
            </div>
          )}

          {/* 公告降级提示 */}
          {result.candidate?.degraded && (
            <div className="p-2.5 rounded-xl text-[11px]"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <span style={{ color: "#F59E0B" }}>⚠ </span>
              <span style={{ color: "#94A3B8" }}>
                公告数据暂缺，重组预期仅基于财报修复迹象降级判断。重组/摘帽/控制权变更类公告无法核实。
              </span>
            </div>
          )}

          {/* 尚未见底原因 */}
          {result.notBottomed && result.notBottomed.reasons.length > 0 && (
            <div className="p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[12px] font-bold mb-2" style={{ color: "#94A3B8" }}>未见底原因</p>
              {result.notBottomed.reasons.map((r, i) => (
                <p key={i} className="text-[12px] mb-1" style={{ color: "#64748B" }}>· {r}</p>
              ))}
            </div>
          )}

          {/* 下一步等待条件 */}
          {result.notBottomed && result.notBottomed.nextTriggerConditions.length > 0 && (
            <div className="p-3 rounded-2xl"
              style={{ background: "rgba(0,229,168,0.05)", border: "1px solid rgba(0,229,168,0.15)" }}>
              <p className="text-[12px] font-bold mb-2" style={{ color: "#00E5A8" }}>
                等待触发条件（满足后才可能转入买入候选）
              </p>
              {result.notBottomed.nextTriggerConditions.slice(0, 6).map((t, i) => (
                <p key={i} className="text-[11px] mb-1" style={{ color: "#64748B" }}>· {t}</p>
              ))}
            </div>
          )}

          {/* 退市风险标志 */}
          {result.delistingRisk && result.delistingRisk.riskFlags.length > 0 && (
            <div className="p-3 rounded-2xl"
              style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Shield size={13} color="#EF4444" />
                <p className="text-[12px] font-bold" style={{ color: "#EF4444" }}>退市风险提示</p>
              </div>
              {result.delistingRisk.riskFlags.map((f, i) => (
                <p key={i} className="text-[11px] mb-1" style={{ color: "#94A3B8" }}>· {f}</p>
              ))}
            </div>
          )}

          {/* K 线图 */}
          {result.bars.length > 0 && result.streakResult && (
            <LimitDownKlineChart
              bars={result.bars}
              streakStartDate={result.streakResult.streakStartDate}
              streakEndDate={result.streakResult.streakEndDate}
            />
          )}
        </div>
      )}
    </div>
  );
}
