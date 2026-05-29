import { MOCK_SIM_ACCOUNT, MOCK_SIGNALS } from "./mock-data";
import type { SimAccount, Signal } from "@/types";

// ── Types ────────────────────────────────────────────────────────
export type RiskPortfolioLevel = "低" | "中等" | "高";
export type RiskItemType = "position" | "concentration" | "signal" | "market" | "loss";

export interface RiskItem {
  id: string;
  type: RiskItemType;
  level: RiskPortfolioLevel;
  title: string;
  reason: string;
  suggestion: string;
}

export interface RiskReport {
  score: number;            // 0–100
  level: RiskPortfolioLevel;
  positionRatio: number;    // % e.g. 67.6
  positionScore: number;    // contribution to total score (0–30)
  concentrationScore: number; // 0–25
  signalScore: number;        // 0–25
  marketScore: number;        // 0–20
  topHolding: { name: string; symbol: string; pct: number } | null;
  top3Pct: number;            // top-3 as % of total position value
  items: RiskItem[];
  buySignalCount: number;
  sellSignalCount: number;
  stopLossCount: number;
  highRiskCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────
export function riskLevelColor(level: RiskPortfolioLevel): string {
  if (level === "高") return "#EF4444";
  if (level === "中等") return "#FACC15";
  return "#00E5A8";
}

export function riskScoreColor(score: number): string {
  if (score >= 66) return "#EF4444";
  if (score >= 36) return "#FACC15";
  return "#00E5A8";
}

// ── Core calculation ─────────────────────────────────────────────
export function calculatePortfolioRisk(
  account: SimAccount = MOCK_SIM_ACCOUNT,
  signals: Signal[]   = MOCK_SIGNALS
): RiskReport {

  // ── 1. Position ratio (0–30 pts) ────────────────────────────
  const investedValue = account.totalValue - account.cash;
  const positionRatio =
    account.totalValue > 0 ? (investedValue / account.totalValue) * 100 : 0;

  let positionScore = 3;
  if      (positionRatio > 80) positionScore = 30;
  else if (positionRatio > 65) positionScore = 22;
  else if (positionRatio > 50) positionScore = 15;
  else if (positionRatio > 30) positionScore = 8;

  // ── 2. Concentration risk (0–25 pts) ────────────────────────
  const totalPosValue = account.positions.reduce((s, p) => s + p.marketValue, 0);
  const sorted = [...account.positions].sort((a, b) => b.marketValue - a.marketValue);

  const topHolding = sorted[0]
    ? {
        name:   sorted[0].name,
        symbol: sorted[0].symbol,
        pct:    totalPosValue > 0 ? (sorted[0].marketValue / totalPosValue) * 100 : 0,
      }
    : null;

  const top3Value = sorted.slice(0, 3).reduce((s, p) => s + p.marketValue, 0);
  const top3Pct   = totalPosValue > 0 ? (top3Value / totalPosValue) * 100 : 0;

  let concentrationScore = 2;
  if      (topHolding && topHolding.pct > 60) concentrationScore = 20;
  else if (topHolding && topHolding.pct > 40) concentrationScore = 12;
  else if (topHolding && topHolding.pct > 25) concentrationScore = 6;

  if (top3Pct > 90) concentrationScore += 5;
  else if (top3Pct > 75) concentrationScore += 2;

  // ── 3. Signal risk (0–25 pts) ────────────────────────────────
  const buySignalCount  = signals.filter(s => s.type === "BUY" || s.type === "GOLDEN_CROSS").length;
  const sellSignalCount = signals.filter(s => s.type === "SELL" || s.type === "STOP_LOSS").length;
  const stopLossCount   = signals.filter(s => s.type === "STOP_LOSS").length;
  const highRiskCount   = signals.filter(s => s.type === "HIGH_RISK").length;

  let signalScore = stopLossCount * 8 + highRiskCount * 6;
  if (sellSignalCount > buySignalCount) signalScore += 5;
  signalScore = Math.min(signalScore, 25);

  // ── 4. Market / loss risk (0–20 pts) ────────────────────────
  const losingPositions = account.positions.filter(p => p.pnl < 0);
  let marketScore = 0;
  if (losingPositions.length > 0) {
    marketScore = Math.round((losingPositions.length / Math.max(account.positions.length, 1)) * 15);
    const worstLoss = Math.min(...losingPositions.map(p => p.pnlPct));
    if (worstLoss < -5) marketScore += 5;
  }
  marketScore = Math.min(marketScore, 20);

  // ── Final score ──────────────────────────────────────────────
  const score = Math.min(100, positionScore + concentrationScore + signalScore + marketScore);
  let level: RiskPortfolioLevel = "低";
  if (score >= 66) level = "高";
  else if (score >= 36) level = "中等";

  // ── Risk items ───────────────────────────────────────────────
  const items: RiskItem[] = [];

  if (positionRatio > 65) {
    items.push({
      id: "pos-overweight",
      type: "position",
      level: positionRatio > 80 ? "高" : "中等",
      title: "仓位偏重",
      reason: `当前仓位 ${positionRatio.toFixed(1)}%，超过建议上限 65%`,
      suggestion: "建议适当降低仓位，保留更多现金应对回调",
    });
  }

  if (topHolding && topHolding.pct > 40) {
    items.push({
      id: "conc-top1",
      type: "concentration",
      level: topHolding.pct > 60 ? "高" : "中等",
      title: `${topHolding.name} 集中度偏高`,
      reason: `${topHolding.name} 占总持仓 ${topHolding.pct.toFixed(1)}%，单股风险显著`,
      suggestion: "可考虑适当减持或分散至其他低相关标的",
    });
  }

  if (top3Pct > 90 && account.positions.length >= 3) {
    items.push({
      id: "conc-top3",
      type: "concentration",
      level: "中等",
      title: "前三持仓集中",
      reason: `前三大持仓合计占比 ${top3Pct.toFixed(1)}%，组合分散度不足`,
      suggestion: "增加持仓标的数量或跨市场分散投资",
    });
  }

  for (const sig of signals.filter(s => s.type === "STOP_LOSS")) {
    items.push({
      id: `signal-sl-${sig.id}`,
      type: "signal",
      level: "高",
      title: `${sig.name} 触发止损信号`,
      reason: sig.reason,
      suggestion: "建议严格执行止损纪律，控制下行风险",
    });
  }

  for (const sig of signals.filter(s => s.type === "HIGH_RISK")) {
    items.push({
      id: `signal-hr-${sig.id}`,
      type: "signal",
      level: "高",
      title: `${sig.name} 高风险预警`,
      reason: sig.reason,
      suggestion: "建议谨慎操作，考虑减仓或暂时观望",
    });
  }

  for (const pos of losingPositions) {
    const isSevere = pos.pnlPct < -5;
    items.push({
      id: `loss-${pos.symbol}`,
      type: "loss",
      level: isSevere ? "高" : "中等",
      title: `${pos.name} 持仓浮亏`,
      reason: `当前浮亏 ${Math.abs(pos.pnlPct).toFixed(2)}%，亏损 ¥${Math.abs(pos.pnl).toLocaleString("zh-CN")}`,
      suggestion: isSevere
        ? "亏损已超 5% 警戒线，请评估是否执行止损"
        : "关注关键支撑位，若跌破则执行止损计划",
    });
  }

  return {
    score,
    level,
    positionRatio,
    positionScore,
    concentrationScore,
    signalScore,
    marketScore,
    topHolding,
    top3Pct,
    items,
    buySignalCount,
    sellSignalCount,
    stopLossCount,
    highRiskCount,
  };
}

// Convenience export – uses default mock data
export function getRiskReport(): RiskReport {
  return calculatePortfolioRisk(MOCK_SIM_ACCOUNT, MOCK_SIGNALS);
}
