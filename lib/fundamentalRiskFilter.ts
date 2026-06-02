/**
 * lib/fundamentalRiskFilter.ts
 *
 * A股全市场基础风险过滤（适用于非ST策略）
 *
 * 过滤规则：
 *   - 退市风险股（名称含*ST、退市、摘牌）
 *   - 长期停牌股（成交额为 0）
 *   - 净资产为负
 *   - 资产负债率极高（>90%）
 *   - 成交额极低（流动性不足）
 *   - K线数据不足
 *
 * ⚠️ 服务端专用
 */

import type { TushareRecord } from "./tushareService";

// ── 类型 ──────────────────────────────────────────────────────────────────

export type RiskFilterLevel = "low" | "medium" | "high" | "critical";

export interface RiskFilterResult {
  passed:          boolean;
  riskLevel:       RiskFilterLevel;
  reasons:         string[];   // 通过的理由
  failedReasons:   string[];   // 未通过的理由
  details: {
    isDelistingRisk:        boolean;
    isSuspended:            boolean;
    hasNegativeEquity:      boolean;
    hasLowLiquidity:        boolean;
    hasHighDebtRatio:       boolean;
    hasInsufficientData:    boolean;
  };
}

// ── K线简化类型 ───────────────────────────────────────────────────────────

interface Bar {
  date:   string;
  close:  number;
  amount: number;  // 千元
  volume: number;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// ── 主过滤函数 ────────────────────────────────────────────────────────────

/**
 * checkGeneralRisk
 *
 * 基于 K线数据和股票基本信息进行通用风险过滤。
 *
 * @param stockName    股票名称
 * @param bars         K线数组（升序）
 * @param finaRecord   财务数据记录（可选）
 * @param minBars      最少需要的 K线数量（默认 60）
 * @param minAmountK   最低成交额（千元，默认 5000 = 500万）
 */
export function checkGeneralRisk(
  stockName:   string,
  bars:        Bar[],
  finaRecord?: TushareRecord | null,
  minBars    = 60,
  minAmountK = 5000,
): RiskFilterResult {
  const reasons:       string[] = [];
  const failedReasons: string[] = [];
  const details = {
    isDelistingRisk:     false,
    isSuspended:         false,
    hasNegativeEquity:   false,
    hasLowLiquidity:     false,
    hasHighDebtRatio:    false,
    hasInsufficientData: false,
  };

  // 1. 名称风险过滤
  const riskNames = ["*ST", "退市", "摘牌"];
  const hasRiskName = riskNames.some(k => stockName.includes(k));
  if (hasRiskName) {
    details.isDelistingRisk = true;
    failedReasons.push(`名称含退市风险关键词（${stockName}）`);
  } else {
    reasons.push("名称正常");
  }

  // 2. K线数量
  if (bars.length < minBars) {
    details.hasInsufficientData = true;
    failedReasons.push(`K线数据不足（${bars.length} < ${minBars}条）`);
  } else {
    reasons.push(`K线数据充足（${bars.length}条）`);
  }

  // 3. 近期流动性（最近5日平均成交额）
  if (bars.length >= 5) {
    const recent5 = bars.slice(-5);
    const avgAmount = recent5.reduce((s, b) => s + b.amount, 0) / 5;
    if (avgAmount < minAmountK) {
      details.hasLowLiquidity = true;
      failedReasons.push(`成交额极低（近5日均 ${(avgAmount / 100).toFixed(0)} 万元 < ${(minAmountK / 100).toFixed(0)} 万元）`);
    } else {
      reasons.push(`流动性正常（近5日均 ${(avgAmount / 100).toFixed(0)} 万元）`);
    }
  }

  // 4. 最近交易日成交量（停牌检测）
  if (bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    if (lastBar.volume === 0 || lastBar.amount === 0) {
      details.isSuspended = true;
      failedReasons.push("近期停牌（成交量为0）");
    }
  }

  // 5. 财务数据过滤（如果有）
  if (finaRecord) {
    const debtRatio = toNum(finaRecord.debt_to_assets);
    if (debtRatio > 90) {
      details.hasHighDebtRatio = true;
      failedReasons.push(`资产负债率极高（${debtRatio.toFixed(1)}%）`);
    } else if (debtRatio > 0) {
      reasons.push(`资产负债率 ${debtRatio.toFixed(1)}%`);
    }

    const bps = toNum(finaRecord.bps);
    if (bps < 0) {
      details.hasNegativeEquity = true;
      failedReasons.push(`每股净资产为负（${bps.toFixed(2)} 元）`);
    }
  }

  const passed = failedReasons.length === 0;
  let riskLevel: RiskFilterLevel = "low";
  if (details.isDelistingRisk || details.hasNegativeEquity) {
    riskLevel = "critical";
  } else if (details.isSuspended || details.hasHighDebtRatio) {
    riskLevel = "high";
  } else if (details.hasLowLiquidity || details.hasInsufficientData) {
    riskLevel = "medium";
  }

  return { passed, riskLevel, reasons, failedReasons, details };
}

// ── BOM 策略专用：基本面风险过滤 ─────────────────────────────────────────

export interface BomFundamentalData {
  pe?:           number | null;
  pb?:           number | null;
  roe?:          number | null;
  grossMargin?:  number | null;
  netMargin?:    number | null;
  revenueYoy?:   number | null;
  netIncYoy?:    number | null;
  debtRatio?:    number | null;
  ocfRatio?:     number | null;
  arRatio?:      number | null;
  invRatio?:     number | null;
  goodwillRatio?: number | null;
}

export interface BomRiskResult {
  passed:    boolean;
  riskLevel: "低" | "中" | "高" | "极高";
  riskScore: number;
  reasons:   string[];
  warnings:  string[];
}

export function checkBomFundamentalRisk(d: BomFundamentalData): BomRiskResult {
  const reasons:  string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (d.pb != null && d.pb < 0)               { reasons.push("净资产为负"); score += 40; }
  if (d.debtRatio != null && d.debtRatio > 85) { reasons.push(`负债率极高(${d.debtRatio.toFixed(0)}%)`); score += 30; }
  else if (d.debtRatio != null && d.debtRatio > 70) { warnings.push(`负债率偏高(${d.debtRatio.toFixed(0)}%)`); score += 15; }
  if (d.grossMargin != null && d.grossMargin < 0) { reasons.push("毛利率为负"); score += 25; }
  if (d.revenueYoy  != null && d.revenueYoy < -30) { warnings.push(`营收大幅下滑(${d.revenueYoy.toFixed(0)}%)`); score += 15; }
  if (d.netIncYoy   != null && d.netIncYoy  < -50) { warnings.push(`净利润大幅下降(${d.netIncYoy.toFixed(0)}%)`); score += 15; }
  if (d.ocfRatio    != null && d.ocfRatio   < -10) { warnings.push(`经营现金流/收入偏低(${d.ocfRatio.toFixed(0)}%)`); score += 15; }
  if (d.arRatio     != null && d.arRatio    > 80)  { warnings.push(`应收账款/营收过高(${d.arRatio.toFixed(0)}%)`); score += 10; }
  if (d.goodwillRatio != null && d.goodwillRatio > 50) { warnings.push(`商誉/净资产过高(${d.goodwillRatio.toFixed(0)}%)`); score += 15; }
  if (d.pe != null && d.pe > 500) { warnings.push(`PE极端偏高(${d.pe.toFixed(0)}x)`); score += 10; }

  score = Math.min(100, score);
  const hard = reasons.length > 0;
  const riskLevel: BomRiskResult["riskLevel"] =
    score >= 60 ? "极高" : score >= 40 ? "高" : score >= 20 ? "中" : "低";
  return { passed: !hard && score < 60, riskLevel, riskScore: score, reasons, warnings };
}

/**
 * 仅基于 stock_basic 字段的快速过滤（无需财务数据）
 */
export function bomQuickFilter(stock: {
  name: string; listStatus?: string;
}): { passed: boolean; reason?: string } {
  if (stock.listStatus === "D") return { passed: false, reason: "已退市" };
  if (stock.listStatus === "P") return { passed: false, reason: "已停牌" };
  if (stock.name.startsWith("*ST") || stock.name.startsWith("ST")) return { passed: false, reason: "ST/*ST" };
  if (stock.name.includes("退市")) return { passed: false, reason: "退市标的" };
  return { passed: true };
}

/**
 * 快速过滤（仅名称 + 成交额，不需要财务数据）
 */
export function quickRiskFilter(
  stockName: string,
  bars:      Bar[],
  minBars  = 60,
  minAmountK = 5000,
): { passed: boolean; reason: string } {
  const riskNames = ["*ST", "退市", "摘牌"];
  if (riskNames.some(k => stockName.includes(k))) {
    return { passed: false, reason: `退市风险名称` };
  }
  if (bars.length < minBars) {
    return { passed: false, reason: `K线不足（${bars.length}条）` };
  }
  if (bars.length >= 5) {
    const recent5 = bars.slice(-5);
    const avgAmount = recent5.reduce((s, b) => s + b.amount, 0) / 5;
    if (avgAmount < minAmountK) {
      return { passed: false, reason: `流动性不足` };
    }
  }
  if (bars.length > 0) {
    const last = bars[bars.length - 1];
    if (last.volume === 0) {
      return { passed: false, reason: "停牌" };
    }
  }
  return { passed: true, reason: "通过" };
}
