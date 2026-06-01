"use client";

/**
 * components/financial/FundamentalScoreCard.tsx
 *
 * A股基本面综合评分卡片
 *
 * 展示：
 *   - 总分（0-100）+ 评级（优秀/良好/一般/较差）
 *   - 5个维度横向进度条
 *   - 亮点（绿色）和风险（红色）列表
 *   - 数据降级警告
 */

import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, RefreshCw, Info } from "lucide-react";

// ── 类型（从 API 返回 JSON 反推，不直接 import 服务端类型）────────────

interface DimensionScore {
  score:         number;
  weight:        number;
  factors:       string[];
  missingFields: string[];
  degraded:      boolean;
}

interface FundamentalScores {
  profitability:    DimensionScore;
  growth:           DimensionScore;
  cashflowQuality:  DimensionScore;
  financialSafety:  DimensionScore;
  valuation:        DimensionScore;
}

interface FundamentalScoreData {
  ok:          boolean;
  totalScore:  number;
  rating:      "优秀" | "良好" | "一般" | "较差";
  scores:      FundamentalScores;
  strengths:   string[];
  risks:       string[];
  degraded:    boolean;
  fromCache?:  boolean;
  error?:      string;
  updatedAt:   string;
}

// ── 维度元数据 ────────────────────────────────────────────────────────

const DIMENSION_META: {
  key:    keyof FundamentalScores;
  label:  string;
  weight: number;
  icon:   string;
}[] = [
  { key: "profitability",   label: "盈利能力", weight: 25, icon: "💰" },
  { key: "growth",          label: "成长能力", weight: 25, icon: "📈" },
  { key: "cashflowQuality", label: "现金流质量", weight: 20, icon: "💧" },
  { key: "financialSafety", label: "财务安全", weight: 20, icon: "🛡️" },
  { key: "valuation",       label: "估值合理性", weight: 10, icon: "⚖️" },
];

// ── 评级颜色配置 ──────────────────────────────────────────────────────

function getRatingStyle(rating: string): { color: string; bg: string; border: string } {
  switch (rating) {
    case "优秀": return { color: "#EF4444", bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.3)"  };
    case "良好": return { color: "#F97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.3)" };
    case "一般": return { color: "#FACC15", bg: "rgba(250,204,21,0.1)", border: "rgba(250,204,21,0.3)" };
    case "较差": return { color: "#00E5A8", bg: "rgba(0,229,168,0.1)",  border: "rgba(0,229,168,0.3)"  };
    default:     return { color: "#94A3B8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.2)" };
  }
}

function getScoreColor(score: number): string {
  if (score >= 75) return "#EF4444";
  if (score >= 60) return "#F97316";
  if (score >= 45) return "#FACC15";
  return "#00E5A8";
}

// ── 分数环形仪表 ─────────────────────────────────────────────────────

function ScoreGauge({ score, rating }: { score: number; rating: string }) {
  const style = getRatingStyle(rating);
  const r = 40;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 100, height: 100 }}>
        <svg width={100} height={100} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={50} cy={50} r={r} fill="none" stroke="#1a2f50" strokeWidth={8} />
          <circle
            cx={50} cy={50} r={r} fill="none"
            stroke={style.color} strokeWidth={8}
            strokeDasharray={`${fill} ${circ}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ transform: "none" }}
        >
          <span className="font-black text-[24px] num" style={{ color: style.color, lineHeight: 1 }}>
            {score}
          </span>
          <span className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>/ 100</span>
        </div>
      </div>
      <div
        className="px-3 py-0.5 rounded-full text-[12px] font-bold"
        style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}
      >
        {rating}
      </div>
    </div>
  );
}

// ── 维度进度条 ────────────────────────────────────────────────────────

function DimensionBar({
  icon, label, score, weight, degraded,
}: {
  icon: string; label: string; score: number; weight: number; degraded: boolean;
}) {
  const color = getScoreColor(score);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px]">{icon}</span>
          <span className="text-[12px]" style={{ color: "#CBD5E1" }}>{label}</span>
          <span className="text-[10px]" style={{ color: "#475569" }}>({weight}%)</span>
          {degraded && (
            <span className="text-[9px] px-1 rounded" style={{ background: "rgba(250,204,21,0.1)", color: "#FACC15" }}>
              数据不全
            </span>
          )}
        </div>
        <span className="font-bold text-[13px] num" style={{ color }}>{score}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1a2f50" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────

interface Props {
  symbol:    string;
  stockName: string;
}

export default function FundamentalScoreCard({ symbol, stockName }: Props) {
  const [data,     setData]     = useState<FundamentalScoreData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchData = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/stocks/${symbol}/fundamental-score${refresh ? "?refresh=1" : ""}`;
      const res = await fetch(url);
      const json = await res.json() as FundamentalScoreData & { error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "获取基本面评分失败");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchData(); }, [symbol]);

  // ── Loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 rounded-2xl space-y-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="h-4 rounded w-32 animate-pulse" style={{ background: "#1a2f50" }} />
        <div className="h-24 rounded animate-pulse" style={{ background: "#1a2f50" }} />
        <div className="h-40 rounded animate-pulse" style={{ background: "#1a2f50" }} />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div
        className="p-4 rounded-2xl flex items-center gap-2"
        style={{ background: "#0d1f3c", border: "1px solid rgba(239,68,68,0.2)" }}
      >
        <AlertTriangle size={16} color="#EF4444" />
        <p className="text-[12px]" style={{ color: "#94A3B8" }}>
          {error ?? "基本面评分数据不可用（需要 Tushare 财报数据）"}
        </p>
      </div>
    );
  }

  const { totalScore, rating, scores, strengths, risks, degraded, fromCache } = data;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>

      {/* 头部 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="font-bold text-[13px]" style={{ color: "#94A3B8" }}>基本面综合评分</h3>
        <button onClick={() => fetchData(true)} title="刷新数据">
          <RefreshCw size={14} color="#475569" />
        </button>
      </div>

      {/* 数据降级提示 */}
      {degraded && (
        <div className="mx-4 mb-2 px-2 py-1 rounded-lg flex items-center gap-1.5"
          style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.15)" }}>
          <AlertTriangle size={11} color="#FACC15" />
          <span className="text-[10px]" style={{ color: "#FACC15" }}>部分维度数据缺失，评分仅供参考</span>
        </div>
      )}

      {/* 仪表盘 + 维度条 */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-4 mb-4">
          <ScoreGauge score={totalScore} rating={rating} />
          <div className="flex-1 space-y-2.5 min-w-0">
            {DIMENSION_META.map(({ key, label, weight, icon }) => {
              const dim = scores[key];
              return (
                <DimensionBar
                  key={key}
                  icon={icon} label={label} score={dim.score}
                  weight={weight} degraded={dim.degraded}
                />
              );
            })}
          </div>
        </div>

        {/* 展开/折叠亮点和风险 */}
        {(strengths.length > 0 || risks.length > 0) && (
          <>
            <button
              className="w-full text-[11px] py-1.5 rounded-lg mb-2"
              style={{ background: "#0a1628", color: "#475569", border: "1px solid #1a2f50" }}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? "收起" : `展开详情（${strengths.length} 亮点 · ${risks.length} 风险）`}
            </button>

            {expanded && (
              <div className="space-y-2">
                {/* 亮点 */}
                {strengths.length > 0 && (
                  <div className="p-3 rounded-xl space-y-1.5"
                    style={{ background: "rgba(0,229,168,0.05)", border: "1px solid rgba(0,229,168,0.12)" }}>
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingUp size={12} color="#00E5A8" />
                      <span className="text-[11px] font-bold" style={{ color: "#00E5A8" }}>基本面亮点</span>
                    </div>
                    {strengths.map((s, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-[10px] mt-0.5" style={{ color: "#00E5A8" }}>✓</span>
                        <p className="text-[11px] leading-[1.6]" style={{ color: "#CBD5E1" }}>{s}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* 风险 */}
                {risks.length > 0 && (
                  <div className="p-3 rounded-xl space-y-1.5"
                    style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}>
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingDown size={12} color="#EF4444" />
                      <span className="text-[11px] font-bold" style={{ color: "#EF4444" }}>风险提示</span>
                    </div>
                    {risks.map((r, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-[10px] mt-0.5" style={{ color: "#EF4444" }}>!</span>
                        <p className="text-[11px] leading-[1.6]" style={{ color: "#CBD5E1" }}>{r}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 底部声明 */}
        <div className="flex items-center gap-1 mt-2">
          <Info size={10} color="#475569" />
          <p className="text-[10px]" style={{ color: "#475569" }}>
            评分基于 Tushare 财报数据计算，仅供参考{fromCache ? "（缓存数据）" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
