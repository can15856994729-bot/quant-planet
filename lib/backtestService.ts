/**
 * backtestService.ts — A股多因子策略回测引擎（增强版）
 *
 * 数据来源：Tushare daily + adj_factor + trade_cal
 * 新增特性：
 *   - 止损/止盈（下一交易日开盘执行）
 *   - 月度调仓选项
 *   - 涨跌停/停牌过滤（无法成交则跳过）
 *   - 单股最大仓位限制
 *   - 评分阈值参数化
 *   - 最大连续亏损次数
 *   - 回撤曲线
 *   - 手续费影响分析
 *   - 策略综合评分（0–100）
 *   - 诊断建议
 *
 * ⚠️  仅在服务端（API Route）使用
 */

import {
  getDailyKLine,
  getAdjFactor,
  applyAdjFactor,
  hasTushareToken,
  daysAgoStr,
  todayStr,
} from "./tushareService";
import { calculateFactorScores } from "./factorService";
import type { KLineBar } from "./factorService";

// ── Types ─────────────────────────────────────────────────────────────

export interface BacktestParams {
  tsCodes:         string[];
  names:           Record<string, string>;
  startDate:       string;
  endDate:         string;
  initialCapital:  number;
  commissionRate:  number;       // 如 0.0003
  stampDutyRate:   number;       // 如 0.001
  slippageRate:    number;       // 如 0.0005
  maxPositions:    number;       // 最多持仓只数
  rebalanceFreq:   "weekly" | "monthly";
  maxSingleWeight: number;       // 单股最大仓位 0–1，如 0.2 = 20%
  stopLossRate:    number;       // 止损比例 0–1，0 = 不止损
  takeProfitRate:  number;       // 止盈比例 0–1，0 = 不止盈
  scoreThreshold:  number;       // 最低买入评分
}

export interface Diagnostic {
  type:    "warning" | "info";
  message: string;
}

export interface BacktestTrade {
  date:    string;
  tsCode:  string;
  name:    string;
  action:  "BUY" | "SELL";
  reason:  "rebalance" | "stop_loss" | "take_profit" | "final";
  price:   number;
  shares:  number;
  amount:  number;
  fee:     number;
  pnl:     number;   // 已实现盈亏（卖出）
}

export interface BacktestResult {
  ok:                   true;
  totalReturn:          number;
  annualReturn:         number;
  maxDrawdown:          number;
  sharpeRatio:          number;
  winRate:              number;
  profitFactor:         number;
  totalTrades:          number;
  maxConsecutiveLosses: number;
  totalFees:            number;
  feeImpact:            number;   // 手续费占初始资金 %
  strategyScore:        number;   // 0–100
  equity:               { date: string; value: number }[];
  drawdown:             { date: string; dd: number }[];
  trades:               BacktestTrade[];
  diagnostics:          Diagnostic[];
  startDate:            string;
  endDate:              string;
  initialCapital:       number;
  finalCapital:         number;
  source:               "tushare";
  note:                 string;
}

export type BacktestError = {
  ok:               false;
  error:            string;
  tokenMissing?:    boolean;
  permissionDenied?: boolean;
};

// Internal bar with pctChg for limit detection
interface EnhancedBar extends KLineBar {
  pctChg: number;
}

// ── Fee calc ──────────────────────────────────────────────────────────
function calcFee(amount: number, action: "BUY" | "SELL", p: BacktestParams): number {
  const commission = Math.max(5, amount * p.commissionRate);
  const stamp      = action === "SELL" ? amount * p.stampDutyRate : 0;
  return +(commission + stamp).toFixed(2);
}

// ── Price with slippage ────────────────────────────────────────────────
function slipPrice(price: number, action: "BUY" | "SELL", slip: number): number {
  return action === "BUY"
    ? +(price * (1 + slip)).toFixed(3)
    : +(price * (1 - slip)).toFixed(3);
}

// ── Limit-up / Limit-down detection ───────────────────────────────────
// A股主板 ±10%，科创板/创业板 ±20%，北交所 ±30%
// 用保守阈值 ±9.5% 覆盖主板涨跌停
function isLimitUp(pctChg: number):   boolean { return pctChg >=  9.5; }
function isLimitDown(pctChg: number): boolean { return pctChg <= -9.5; }

// ── Rebalance date set ─────────────────────────────────────────────────
function buildRebalanceDates(dates: string[], freq: "weekly" | "monthly"): Set<string> {
  const s = new Set<string>();
  if (!dates.length) return s;
  s.add(dates[0]);

  if (freq === "weekly") {
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(
        +dates[i-1].slice(0,4), +dates[i-1].slice(4,6)-1, +dates[i-1].slice(6,8)
      );
      const cur = new Date(
        +dates[i].slice(0,4), +dates[i].slice(4,6)-1, +dates[i].slice(6,8)
      );
      const diffDays = (cur.getTime() - prev.getTime()) / 86400000;
      if (diffDays >= 5 || cur.getDay() <= prev.getDay()) s.add(dates[i]);
    }
  } else {
    // Monthly: first trading day of each calendar month
    let lastMon = dates[0].slice(0, 6);
    for (let i = 1; i < dates.length; i++) {
      const curMon = dates[i].slice(0, 6);
      if (curMon !== lastMon) { s.add(dates[i]); lastMon = curMon; }
    }
  }
  return s;
}

// ── Strategy score (0–100) ────────────────────────────────────────────
function computeStrategyScore(
  annualReturn: number,  // %
  maxDrawdown:  number,  // % (负值)
  sharpeRatio:  number,
  winRate:      number,  // %
  profitFactor: number,
): number {
  const retScore    = Math.max(0, Math.min(25, annualReturn * 0.8));     // 0-25
  const ddScore     = Math.max(0, 25 + maxDrawdown * 1.25);              // 0-25
  const sharpeScore = Math.max(0, Math.min(25, sharpeRatio * 12.5));     // 0-25
  const wpScore     = Math.max(0, Math.min(25,
    (winRate - 40) * 0.5 + profitFactor * 4));                           // 0-25
  return Math.max(0, Math.min(100, Math.round(retScore + ddScore + sharpeScore + wpScore)));
}

// ── Diagnostics ───────────────────────────────────────────────────────
function buildDiagnostics(
  annualReturn:         number,
  maxDrawdown:          number,
  winRate:              number,
  sharpeRatio:          number,
  profitFactor:         number,
  totalTrades:          number,
  feeImpact:            number,
  maxConsecutiveLosses: number,
  tradingDays:          number,
): Diagnostic[] {
  const diag: Diagnostic[] = [];
  const years = tradingDays / 252;
  const tpy   = years > 0 ? totalTrades / years : 0;

  if (maxDrawdown < -20)
    diag.push({ type: "warning", message: `最大回撤 ${maxDrawdown.toFixed(1)}% 风险偏高 — 建议降低持仓数量或提高止损比例` });
  if (winRate < 45)
    diag.push({ type: "warning", message: `胜率 ${winRate.toFixed(1)}% 偏低 — 建议提高评分阈值（如 65→70）` });
  if (tpy > 200)
    diag.push({ type: "warning", message: `年均换仓 ${Math.round(tpy)} 次偏高 — 建议改为月度调仓减少摩擦成本` });
  if (feeImpact > 5)
    diag.push({ type: "warning", message: `累计手续费占初始资金 ${feeImpact.toFixed(1)}%，交易成本较高` });
  if (maxConsecutiveLosses > 5)
    diag.push({ type: "warning", message: `最大连续亏损 ${maxConsecutiveLosses} 次 — 策略存在较长回撤期，需注意持仓心理` });

  if (sharpeRatio > 1.5)
    diag.push({ type: "info", message: `夏普比率 ${sharpeRatio.toFixed(2)} 优秀，风险调整收益良好` });
  if (profitFactor > 2.0)
    diag.push({ type: "info", message: `盈亏比 ${profitFactor.toFixed(2)}，策略盈利能力强` });
  if (annualReturn > 15 && maxDrawdown > -20)
    diag.push({ type: "info", message: `年化 ${annualReturn.toFixed(1)}%、回撤 ${maxDrawdown.toFixed(1)}%，综合表现较好` });
  if (diag.length === 0)
    diag.push({ type: "info", message: "各项指标正常，可进入模拟盘进一步观察" });

  return diag;
}

// ── Main runner ───────────────────────────────────────────────────────
export async function runBacktest(
  params: BacktestParams,
): Promise<BacktestResult | BacktestError> {

  if (!hasTushareToken()) {
    return { ok: false, error: "Tushare Token 未配置，无法运行真实回测", tokenMissing: true };
  }

  // ── 1. Fetch daily + adj_factor (parallel per stock) ─────────────
  const fetchResults = await Promise.allSettled(
    params.tsCodes.map(async (tsCode) => {
      const [dailyRes, adjRes] = await Promise.all([
        getDailyKLine(tsCode, params.startDate, params.endDate),
        getAdjFactor(tsCode,  params.startDate, params.endDate),
      ]);
      if (!dailyRes.ok) return { tsCode, bars: null as EnhancedBar[] | null, error: dailyRes.error };

      const sorted = [...dailyRes.records]
        .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
      const adjSorted = adjRes.ok
        ? [...adjRes.records].sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)))
        : [];
      const adjusted = applyAdjFactor(sorted, adjSorted);

      const bars: EnhancedBar[] = adjusted.map((r) => ({
        date:   String(r.trade_date ?? ""),
        open:   Number(r.open   ?? 0),
        close:  Number(r.close  ?? 0),
        high:   Number(r.high   ?? 0),
        low:    Number(r.low    ?? 0),
        volume: Number(r.vol    ?? 0),
        amount: Number(r.amount ?? 0),
        pctChg: Number(r.pct_chg ?? 0),
      })).filter((b) => b.close > 0 && b.date);

      return { tsCode, bars, error: null };
    }),
  );

  const allBars = new Map<string, EnhancedBar[]>();
  for (const r of fetchResults) {
    if (r.status === "fulfilled" && r.value.bars && r.value.bars.length >= 20) {
      allBars.set(r.value.tsCode, r.value.bars);
    }
  }

  if (allBars.size === 0) {
    return { ok: false, error: "无法获取任何股票历史数据，请检查 Tushare 权限", permissionDenied: true };
  }

  // ── 2. Union trading dates ────────────────────────────────────────
  const dateSet = new Set<string>();
  for (const bars of allBars.values()) for (const b of bars) dateSet.add(b.date);
  const allDates = [...dateSet].sort();

  if (allDates.length < 20) {
    return { ok: false, error: `历史数据不足（${allDates.length} 个交易日），无法回测` };
  }

  // ── 3. Rebalance dates ────────────────────────────────────────────
  const rebalanceDates = buildRebalanceDates(allDates, params.rebalanceFreq);

  // ── 4. Simulate ───────────────────────────────────────────────────
  let cash      = params.initialCapital;
  let totalFees = 0;

  type HoldingEntry = { shares: number; costPrice: number; buyDate: string };
  const holding    = new Map<string, HoldingEntry>();
  const trades:      BacktestTrade[] = [];
  const equityCurve: { date: string; value: number }[] = [];

  // Pending stop/take-profit executions (to be executed next trading day at open)
  const pendingExit = new Map<string, "stop_loss" | "take_profit">();

  for (const date of allDates) {
    // Price snapshot for today
    const todayPrice = new Map<string, { open: number; close: number; pctChg: number; volume: number }>();
    for (const [tsCode, bars] of allBars) {
      const bar = bars.find((b) => b.date === date);
      if (bar) todayPrice.set(tsCode, { open: bar.open, close: bar.close, pctChg: bar.pctChg, volume: bar.volume });
    }

    const exitedToday = new Set<string>();

    // ── A. Execute pending stop/take-profit at open ───────────────
    for (const [tsCode, reason] of pendingExit) {
      const pos = holding.get(tsCode);
      if (!pos) { pendingExit.delete(tsCode); continue; }
      const p = todayPrice.get(tsCode);
      // Can't sell if: price unavailable, limit-down, suspended
      if (!p || p.open <= 0 || isLimitDown(p.pctChg) || p.volume === 0) continue;

      const execPrice = slipPrice(p.open, "SELL", params.slippageRate);
      const amount    = +(pos.shares * execPrice).toFixed(2);
      const fee       = calcFee(amount, "SELL", params);
      const pnl       = +((execPrice - pos.costPrice) * pos.shares - fee).toFixed(2);
      cash      += +(amount - fee).toFixed(2);
      totalFees += fee;
      trades.push({ date, tsCode, name: params.names[tsCode] ?? tsCode, action: "SELL", reason, price: execPrice, shares: pos.shares, amount, fee, pnl });
      holding.delete(tsCode);
      pendingExit.delete(tsCode);
      exitedToday.add(tsCode);
    }

    // ── B. Weekly/monthly rebalance ───────────────────────────────
    if (rebalanceDates.has(date)) {
      // Score each stock using only data BEFORE today (no look-ahead)
      const scores: { tsCode: string; score: number }[] = [];
      for (const [tsCode, bars] of allBars) {
        const prior = bars.filter((b) => b.date < date);
        if (prior.length < 20) continue;
        const p = todayPrice.get(tsCode);
        if (!p || p.open <= 0 || p.volume === 0) continue;  // skip suspended
        if (isLimitUp(p.pctChg)) continue;                  // can't buy limit-up today
        const f = calculateFactorScores(prior, { price: prior[prior.length - 1].close, changePct: 0 });
        if (f.totalScore >= params.scoreThreshold) scores.push({ tsCode, score: f.totalScore });
      }
      scores.sort((a, b) => b.score - a.score);
      const target = new Set(scores.slice(0, params.maxPositions).map((s) => s.tsCode));

      // Sell positions not in target (T+1: buyDate < date)
      for (const [tsCode, pos] of holding) {
        if (exitedToday.has(tsCode) || target.has(tsCode)) continue;
        if (pos.buyDate >= date) continue;  // T+1 restriction
        const p = todayPrice.get(tsCode);
        if (!p || p.open <= 0 || isLimitDown(p.pctChg) || p.volume === 0) continue;
        const execPrice = slipPrice(p.open, "SELL", params.slippageRate);
        const amount    = +(pos.shares * execPrice).toFixed(2);
        const fee       = calcFee(amount, "SELL", params);
        const pnl       = +((execPrice - pos.costPrice) * pos.shares - fee).toFixed(2);
        cash      += +(amount - fee).toFixed(2);
        totalFees += fee;
        trades.push({ date, tsCode, name: params.names[tsCode] ?? tsCode, action: "SELL", reason: "rebalance", price: execPrice, shares: pos.shares, amount, fee, pnl });
        holding.delete(tsCode);
        exitedToday.add(tsCode);
      }

      // Buy new targets
      const newBuys = [...target].filter((c) => !holding.has(c) && !exitedToday.has(c));
      if (newBuys.length > 0) {
        // Total portfolio value for single-stock weight cap
        let posVal = 0;
        for (const [tc, pos] of holding) {
          const pp = todayPrice.get(tc);
          posVal += pos.shares * (pp ? pp.close : pos.costPrice);
        }
        const totalVal = cash + posVal;

        const cashPerPos = cash / newBuys.length;
        for (const tsCode of newBuys) {
          const p = todayPrice.get(tsCode);
          if (!p || p.open <= 0 || isLimitUp(p.pctChg) || p.volume === 0) continue;
          // Apply max single weight
          const maxAlloc  = Math.min(cashPerPos, totalVal * params.maxSingleWeight);
          const execPrice = slipPrice(p.open, "BUY", params.slippageRate);
          const fee0      = calcFee(maxAlloc, "BUY", params);
          const shares    = Math.floor((maxAlloc - fee0) / execPrice / 100) * 100;
          if (shares < 100) continue;
          const amount    = +(shares * execPrice).toFixed(2);
          const fee       = calcFee(amount, "BUY", params);
          const totalCost = +(amount + fee).toFixed(2);
          if (cash < totalCost) continue;
          cash      -= totalCost;
          totalFees += fee;
          holding.set(tsCode, { shares, costPrice: execPrice, buyDate: date });
          trades.push({ date, tsCode, name: params.names[tsCode] ?? tsCode, action: "BUY", reason: "rebalance", price: execPrice, shares, amount, fee, pnl: 0 });
        }
      }
    }

    // ── C. Check stop/take-profit triggers (next-day execution) ──
    pendingExit.clear();
    for (const [tsCode, pos] of holding) {
      const p = todayPrice.get(tsCode);
      if (!p || pos.buyDate >= date) continue;  // T+1
      const chg = (p.close - pos.costPrice) / pos.costPrice;
      if (params.stopLossRate   > 0 && chg <= -params.stopLossRate)   pendingExit.set(tsCode, "stop_loss");
      else if (params.takeProfitRate > 0 && chg >= params.takeProfitRate) pendingExit.set(tsCode, "take_profit");
    }

    // ── D. Mark-to-market equity curve ───────────────────────────
    let posVal = 0;
    for (const [tsCode, pos] of holding) {
      const p = todayPrice.get(tsCode);
      posVal += pos.shares * (p ? p.close : pos.costPrice);
    }
    equityCurve.push({ date, value: +(cash + posVal).toFixed(2) });
  }

  // ── 5. Close all remaining positions at last available price ─────
  const lastDate = allDates[allDates.length - 1];
  for (const [tsCode, pos] of holding) {
    const bars    = allBars.get(tsCode);
    const lastBar = bars?.findLast((b) => b.date <= lastDate);
    if (!lastBar) continue;
    const execPrice = slipPrice(lastBar.close, "SELL", params.slippageRate);
    const amount    = +(pos.shares * execPrice).toFixed(2);
    const fee       = calcFee(amount, "SELL", params);
    const pnl       = +((execPrice - pos.costPrice) * pos.shares - fee).toFixed(2);
    cash      += +(amount - fee).toFixed(2);
    totalFees += fee;
    trades.push({ date: lastDate, tsCode, name: params.names[tsCode] ?? tsCode, action: "SELL", reason: "final", price: execPrice, shares: pos.shares, amount, fee, pnl });
  }
  holding.clear();

  // ── 6. Compute metrics ────────────────────────────────────────────
  const finalCapital = cash;
  const totalReturn  = +((finalCapital - params.initialCapital) / params.initialCapital * 100).toFixed(2);
  const years        = allDates.length / 252;
  const annualReturn = years > 0
    ? +((Math.pow(finalCapital / params.initialCapital, 1 / years) - 1) * 100).toFixed(2)
    : 0;

  // Drawdown curve + max DD
  let peak  = params.initialCapital;
  let maxDD = 0;
  const drawdownCurve: { date: string; dd: number }[] = [];
  for (const e of equityCurve) {
    if (e.value > peak) peak = e.value;
    const dd = peak > 0 ? +((e.value - peak) / peak * 100).toFixed(2) : 0;
    if (dd < maxDD) maxDD = dd;
    drawdownCurve.push({ date: e.date, dd });
  }

  // Sharpe (daily, risk-free = 0)
  const rets: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    rets.push((equityCurve[i].value - equityCurve[i-1].value) / equityCurve[i-1].value);
  }
  const mean  = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const std   = rets.length > 1
    ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) : 0;
  const sharpeRatio = std > 0 ? +((mean / std) * Math.sqrt(252)).toFixed(2) : 0;

  // Win rate + profit factor (exclude final close-out)
  const sellTrades = trades.filter((t) => t.action === "SELL" && t.reason !== "final");
  const wins       = sellTrades.filter((t) => t.pnl > 0);
  const losses     = sellTrades.filter((t) => t.pnl <= 0);
  const winRate    = sellTrades.length ? +((wins.length / sellTrades.length) * 100).toFixed(1) : 0;
  const avgWin     = wins.length   ? wins.reduce((a, t) => a + t.pnl, 0)   / wins.length   : 0;
  const avgLoss    = losses.length ? Math.abs(losses.reduce((a, t) => a + t.pnl, 0)) / losses.length : 0;
  const profitFactor = avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : 0;

  // Max consecutive losses
  let maxConsLosses = 0, curLosses = 0;
  for (const t of sellTrades) {
    if (t.pnl <= 0) { curLosses++; if (curLosses > maxConsLosses) maxConsLosses = curLosses; }
    else curLosses = 0;
  }

  const feeImpact     = +((totalFees / params.initialCapital) * 100).toFixed(2);
  const strategyScore = computeStrategyScore(annualReturn, maxDD, sharpeRatio, winRate, profitFactor);
  const diagnostics   = buildDiagnostics(
    annualReturn, maxDD, winRate, sharpeRatio, profitFactor,
    trades.length, feeImpact, maxConsLosses, allDates.length,
  );

  return {
    ok:                   true,
    totalReturn,
    annualReturn,
    maxDrawdown:          +maxDD.toFixed(2),
    sharpeRatio,
    winRate,
    profitFactor,
    totalTrades:          trades.length,
    maxConsecutiveLosses: maxConsLosses,
    totalFees:            +totalFees.toFixed(2),
    feeImpact,
    strategyScore,
    equity:               equityCurve,
    drawdown:             drawdownCurve,
    trades,
    diagnostics,
    startDate:            params.startDate,
    endDate:              params.endDate,
    initialCapital:       params.initialCapital,
    finalCapital:         +finalCapital.toFixed(2),
    source:               "tushare",
    note: [
      "前复权价格（Tushare adj_factor）",
      "T+1 限制",
      `手续费 ${(params.commissionRate * 100).toFixed(3)}%（买入≥5元）`,
      "印花税 0.1%（卖出）",
      "滑点 0.05%",
      "涨跌停/停牌过滤",
      `止损 ${params.stopLossRate > 0 ? `-${(params.stopLossRate*100).toFixed(0)}%` : "关闭"}`,
      `止盈 ${params.takeProfitRate > 0 ? `+${(params.takeProfitRate*100).toFixed(0)}%` : "关闭"}`,
    ].join(" | "),
  };
}

// Convenience re-exports
export { daysAgoStr, todayStr };
