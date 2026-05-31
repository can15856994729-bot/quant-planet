"use client";

/**
 * FinancialScore — 综合财务评分环形图（0-100 分）
 *
 * Props:
 *   score      — 0-100 分
 *   label      — 等级文字（"优秀" | "良好" | "一般" | "偏弱" | "较差"）
 *   breakdown  — 各维度得分（可选，展示分组条形）
 *   size       — "sm" | "md" | "lg"（圆环大小）
 */

interface ScoreBreakdown {
  profitability: number;  // 0-25
  growth:        number;  // 0-25
  cashFlow:      number;  // 0-20
  safety:        number;  // 0-20
  valuation:     number;  // 0-10
}

interface FinancialScoreProps {
  score:      number;
  label:      string;
  breakdown?: ScoreBreakdown;
  size?:      "sm" | "md" | "lg";
}

const SIZE_MAP = {
  sm: { r: 36, stroke: 6,  fontSize: 18, labelSize: 10 },
  md: { r: 48, stroke: 8,  fontSize: 24, labelSize: 11 },
  lg: { r: 60, stroke: 10, fontSize: 30, labelSize: 12 },
} as const;

const DIMENSIONS: Array<{
  key: keyof ScoreBreakdown;
  label: string;
  max: number;
  color: string;
}> = [
  { key: "profitability", label: "盈利能力", max: 25, color: "#00E5A8" },
  { key: "growth",        label: "成长能力", max: 25, color: "#3B82F6" },
  { key: "cashFlow",      label: "现金流量", max: 20, color: "#A78BFA" },
  { key: "safety",        label: "财务安全", max: 20, color: "#FACC15" },
  { key: "valuation",     label: "估值水平", max: 10, color: "#F97316" },
];

function scoreColor(score: number): string {
  if (score >= 85) return "#00E5A8";
  if (score >= 70) return "#3B82F6";
  if (score >= 52) return "#FACC15";
  if (score >= 35) return "#F97316";
  return "#EF4444";
}

export default function FinancialScore({
  score,
  label,
  breakdown,
  size = "md",
}: FinancialScoreProps) {
  const { r, stroke, fontSize, labelSize } = SIZE_MAP[size];
  const cx = r + stroke;
  const cy = r + stroke;
  const svgSize = (r + stroke) * 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - pct);
  const color = scoreColor(score);

  return (
    <div className="flex items-center gap-4">
      {/* Ring gauge */}
      <div className="flex-shrink-0 relative">
        <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
          {/* Background track */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
          />
          {/* Score arc (starts at top, clockwise) */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
          {/* Score text */}
          <text
            x={cx} y={cy - fontSize * 0.15}
            textAnchor="middle" dominantBaseline="middle"
            fill={color}
            fontSize={fontSize}
            fontWeight="900"
            fontFamily="'DIN Alternate', 'SF Pro Display', monospace"
          >
            {score}
          </text>
          {/* Label text */}
          <text
            x={cx} y={cy + fontSize * 0.85}
            textAnchor="middle" dominantBaseline="middle"
            fill={color}
            fontSize={labelSize}
            fontWeight="600"
          >
            {label}
          </text>
        </svg>
      </div>

      {/* Breakdown bars */}
      {breakdown && (
        <div className="flex-1 space-y-1.5">
          {DIMENSIONS.map(({ key, label: dimLabel, max, color: dimColor }) => {
            const val = breakdown[key];
            const pctBar = (val / max) * 100;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px]" style={{ color: "#94A3B8" }}>{dimLabel}</span>
                  <span className="text-[10px] font-bold num" style={{ color: dimColor }}>
                    {val}/{max}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pctBar}%`,
                      background: dimColor,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
