/**
 * backtestService.ts — A股多因子策略回测引擎
 *
 * 数据来源：Tushare daily（日线）+ adj_factor（前复权）
 * 规则：
 *   - 不使用未来函数（决策只看截止到调仓日的数据）
 *   - 使用前复权价格（避免除权影响因子信号）
 *   - A股 T+1（买入当日不可卖出）
 *   - 每周调仓（每周一开盘价买入/卖出）
 *   - 手续费：A股买入 0.03%（≥5元），卖出 0.03%+印花税0.1%
 *   - 滑点：单边 0.05%
 *   - 满仓时平均分配
 *
 * ⚠️  本文件只在服务端（API Route）使用，不要在客户端 import。
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
  /** 股票池 ts_code 列表，如 ["600519.SH", "000858.SZ"] */
  tsCodes:       string[];
  names:         Record<string, string>;   // tsCode → 名称
  startDate:     string;                   // YYYYMMDD
  endDate:       string;                   // YYYYMMDD
  initialCapital: number;                  // 起始资金（元）
  commissionRate: number;                  // 手续费率，如 0.0003
  stampDutyRate:  number;                  // 印花税，如 0.001
  slippageRate:   number;                  // 单边滑点，如 0.0005
  maxPositions:   number;                  // 最多持仓股数
}

export interface BacktestTrade {
  date:      string;
  tsCode:    string;
  name:      string;
  action:    "BUY" | "SELL";
  price:     number;
  shares:    number;
  amount:    number;
  fee:       number;
  pnl:       number;   // 已实现盈亏（卖出时）
}

export interface BacktestResult {
  ok:              true;
  totalReturn:     number;   // %
  annualReturn:    number;   // %
  maxDrawdown:     number;   // %（负值）
  sharpeRatio:     number;
  winRate:         number;   // %（盈利交易/总卖出）
  profitFactor:    number;   // 盈亏比（平均盈利/平均亏损）
  totalTrades:     number;
  equity:          { date: string; value: number }[];  // 资金曲线
  trades:          BacktestTrade[];
  startDate:       string;
  endDate:         string;
  initialCapital:  number;
  finalCapital:    number;
  source:          "tushare";
  note:            string;
}

export type BacktestError = {
  ok:              false;
  error:           string;
  tokenMissing?:   boolean;
  permissionDenied?: boolean;
};

// ── Fee calc ──────────────────────────────────────────────────────────
function calcFee(amount: number, action: "BUY" | "SELL", params: BacktestParams): number {
  const commission = Math.max(5, amount * params.commissionRate);
  const stamp      = action === "SELL" ? amount * params.stampDutyRate : 0;
  return +(commission + stamp).toFixed(2);
}

// ── Price with slippage ────────────────────────────────────────────────
function slipPrice(price: number, action: "BUY" | "SELL", slippage: number): number {
  return action === "BUY"
    ? +(price * (1 + slippage)).toFixed(3)
    : +(price * (1 - slippage)).toFixed(3);
}

// ── MA helper ─────────────────────────────────────────────────────────
function ma(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const s = arr.slice(-period);
  return s.reduce((a, b) => a + b, 0) / period;
}

// ── Main runner ───────────────────────────────────────────────────────
export async function runBacktest(
  params: BacktestParams
): Promise<BacktestResult | BacktestError> {

  if (!hasTushareToken()) {
    return { ok: false, error: "Tushare Token 未配置，无法运行真实回测", tokenMissing: true };
  }

  // ── 1. Fetch daily bars for all stocks (parallel) ─────────────────
  const fetchResults = await Promise.allSettled(
    params.tsCodes.map(async tsCode => {
      const [dailyRes, adjRes] = await Promise.all([
        getDailyKLine(tsCode, params.startDate, params.endDate),
        getAdjFactor(tsCode, params.startDate, params.endDate),
      ]);
      if (!dailyRes.ok) return { tsCode, bars: null as KLineBar[] | null, error: dailyRes.error };

      const sorted = [...dailyRes.records]
        .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));

      const adjSorted = adjRes.ok
        ? [...adjRes.records].sort((a, b) =>
            String(a.trade_date).localeCompare(String(b.trade_date)))
        : [];

      const adjusted = applyAdjFactor(sorted, adjSorted);

      const bars: KLineBar[] = adjusted.map(r => ({
        date:   String(r.trade_date ?? ""),
        open:   Number(r.open  ?? 0),
        close:  Number(r.close ?? 0),
        high:   Number(r.high  ?? 0),
        low:    Number(r.low   ?? 0),
        volume: Number(r.vol   ?? 0),
        amount: Number(r.amount ?? 0),
      })).filter(b => b.close > 0 && b.date);

      return { tsCode, bars, error: null };
    })
  );

  // Build map: tsCode → bars[]
  const allBars = new Map<string, KLineBar[]>();
  for (const r of fetchResults) {
    if (r.status === "fulfilled" && r.value.bars && r.value.bars.length >= 20) {
      allBars.set(r.value.tsCode, r.value.bars);
    }
  }

  if (allBars.size === 0) {
    return {
      ok: false,
      error: "无法获取任何股票历史数据，请检查 Tushare 权限或股票代码",
      permissionDenied: true,
    };
  }

  // ── 2. Collect all trade dates (union of dates across stocks) ───────
  const dateSet = new Set<string>();
  for (const bars of allBars.values()) {
    for (const b of bars) dateSet.add(b.date);
  }
  const allDates = [...dateSet].sort();

  if (allDates.length < 20) {
    return { ok: false, error: `历史数据不足（仅 ${allDates.length} 个交易日），无法运行回测` };
  }

  // ── 3. Simulate weekly rebalancing ─────────────────────────────────
  let cash    = params.initialCapital;
  const holding = new Map<string, { shares: number; costPrice: number; buyDate: string }>();
  const trades:  BacktestTrade[] = [];
  const equityCurve: { date: string; value: number }[] = [];

  // Find weekly rebalance dates (every Monday-equivalent = first date of each week)
  const rebalanceDates = new Set<string>();
  for (let i = 0; i < allDates.length; i++) {
    if (i === 0) { rebalanceDates.add(allDates[i]); continue; }
    const prev = new Date(
      parseInt(allDates[i - 1].slice(0, 4)),
      parseInt(allDates[i - 1].slice(4, 6)) - 1,
      parseInt(allDates[i - 1].slice(6, 8))
    );
    const cur = new Date(
      parseInt(allDates[i].slice(0, 4)),
      parseInt(allDates[i].slice(4, 6)) - 1,
      parseInt(allDates[i].slice(6, 8))
    );
    // New ISO week or gap > 4 calendar days → rebalance day
    const diffDays = (cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays >= 5 || cur.getDay() <= prev.getDay()) {
      rebalanceDates.add(allDates[i]);
    }
  }

  for (const date of allDates) {
    // Price map for today
    const priceMap = new Map<string, { open: number; close: number }>();
    for (const [tsCode, bars] of allBars) {
      const bar = bars.find(b => b.date === date);
      if (bar) priceMap.set(tsCode, { open: bar.open, close: bar.close });
    }

    // Rebalance on weekly signal dates
    if (rebalanceDates.has(date)) {
      // Score each stock using data up-to-but-not-including this date (no look-ahead)
      const scores: { tsCode: string; score: number }[] = [];
      for (const [tsCode, bars] of allBars) {
        const barsUpToDate = bars.filter(b => b.date < date);
        if (barsUpToDate.length < 20) continue;
        const price = priceMap.get(tsCode);
        if (!price || price.open <= 0) continue;
        const f = calculateFactorScores(barsUpToDate, {
          price:     barsUpToDate[barsUpToDate.length - 1].close,
          changePct: 0,
        });
        if (f.totalScore >= 65) {  // buy/watch threshold
          scores.push({ tsCode, score: f.totalScore });
        }
      }
      scores.sort((a, b) => b.score - a.score);
      const targetCodes = new Set(scores.slice(0, params.maxPositions).map(s => s.tsCode));

      // Sell positions no longer in target (T+1: only if bought before today)
      for (const [tsCode, pos] of holding) {
        if (!targetCodes.has(tsCode) && pos.buyDate < date) {
          const price = priceMap.get(tsCode);
          if (!price || price.open <= 0) continue;
          const execPrice = slipPrice(price.open, "SELL", params.slippageRate);
          const amount    = +(pos.shares * execPrice).toFixed(2);
          const fee       = calcFee(amount, "SELL", params);
          const proceeds  = +(amount - fee).toFixed(2);
          const pnl       = +((execPrice - pos.costPrice) * pos.shares - fee).toFixed(2);
          cash += proceeds;
          trades.push({
            date, tsCode,
            name:   params.names[tsCode] ?? tsCode,
            action: "SELL",
            price:  execPrice,
            shares: pos.shares,
            amount, fee, pnl,
          });
          holding.delete(tsCode);
        }
      }

      // Buy new targets
      const newBuys = [...targetCodes].filter(c => !holding.has(c));
      if (newBuys.length > 0) {
        const cashPerPosition = cash / newBuys.length;
        for (const tsCode of newBuys) {
          const price = priceMap.get(tsCode);
          if (!price || price.open <= 0) continue;
          const execPrice = slipPrice(price.open, "BUY", params.slippageRate);
          const fee0      = calcFee(cashPerPosition, "BUY", params);
          const maxCost   = cashPerPosition - fee0;
          const shares    = Math.floor(maxCost / execPrice / 100) * 100; // A股最小100股
          if (shares < 100) continue;
          const amount    = +(shares * execPrice).toFixed(2);
          const fee       = calcFee(amount, "BUY", params);
          const totalCost = +(amount + fee).toFixed(2);
          if (cash < totalCost) continue;
          cash -= totalCost;
          holding.set(tsCode, { shares, costPrice: execPrice, buyDate: date });
          trades.push({
            date, tsCode,
            name:   params.names[tsCode] ?? tsCode,
            action: "BUY",
            price:  execPrice,
            shares, amount, fee, pnl: 0,
          });
        }
      }
    }

    // Daily equity curve: cash + mark-to-market
    let posValue = 0;
    for (const [tsCode, pos] of holding) {
      const p = priceMap.get(tsCode);
      posValue += pos.shares * (p ? p.close : pos.costPrice);
    }
    equityCurve.push({ date, value: +(cash + posValue).toFixed(2) });
  }

  // ── 4. Close remaining positions at last price ─────────────────────
  const lastDate = allDates[allDates.length - 1];
  for (const [tsCode, pos] of holding) {
    const bars  = allBars.get(tsCode);
    const lastBar = bars?.findLast(b => b.date <= lastDate);
    if (!lastBar) continue;
    const execPrice = slipPrice(lastBar.close, "SELL", params.slippageRate);
    const amount    = +(pos.shares * execPrice).toFixed(2);
    const fee       = calcFee(amount, "SELL", params);
    const proceeds  = +(amount - fee).toFixed(2);
    const pnl       = +((execPrice - pos.costPrice) * pos.shares - fee).toFixed(2);
    cash += proceeds;
    trades.push({
      date: lastDate, tsCode,
      name:   params.names[tsCode] ?? tsCode,
      action: "SELL",
      price:  execPrice,
      shares: pos.shares,
      amount, fee, pnl,
    });
  }
  holding.clear();

  // ── 5. Metrics ─────────────────────────────────────────────────────
  const finalCapital  = cash;
  const totalReturn   = +((finalCapital - params.initialCapital) / params.initialCapital * 100).toFixed(2);
  const years         = allDates.length / 252;
  const annualReturn  = years > 0
    ? +((Math.pow(finalCapital / params.initialCapital, 1 / years) - 1) * 100).toFixed(2)
    : 0;

  // Max drawdown
  let peak = params.initialCapital;
  let maxDD = 0;
  for (const e of equityCurve) {
    if (e.value > peak) peak = e.value;
    const dd = (e.value - peak) / peak * 100;
    if (dd < maxDD) maxDD = dd;
  }

  // Sharpe (daily, risk-free = 0)
  const rets = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const r = (equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value;
    rets.push(r);
  }
  const meanRet = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const stdRet  = rets.length > 1
    ? Math.sqrt(rets.reduce((a, b) => a + (b - meanRet) ** 2, 0) / rets.length)
    : 0;
  const sharpeRatio = stdRet > 0 ? +((meanRet / stdRet) * Math.sqrt(252)).toFixed(2) : 0;

  // Win rate + profit factor
  const sellTrades = trades.filter(t => t.action === "SELL");
  const wins       = sellTrades.filter(t => t.pnl > 0);
  const losses     = sellTrades.filter(t => t.pnl <= 0);
  const winRate    = sellTrades.length ? +((wins.length / sellTrades.length) * 100).toFixed(1) : 0;
  const avgWin     = wins.length   ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length     : 0;
  const avgLoss    = losses.length ? Math.abs(losses.reduce((a, t) => a + t.pnl, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : 0;

  return {
    ok:            true,
    totalReturn,
    annualReturn,
    maxDrawdown:   +maxDD.toFixed(2),
    sharpeRatio,
    winRate,
    profitFactor,
    totalTrades:   trades.length,
    equity:        equityCurve,
    trades,
    startDate:     params.startDate,
    endDate:       params.endDate,
    initialCapital: params.initialCapital,
    finalCapital,
    source:        "tushare",
    note:          "前复权价格（Tushare adj_factor）+ T+1 + 手续费0.03%（买入≥5元） + 印花税0.1%（卖出） + 滑点0.05%",
  };
}

// ── Convenience: default params for multi-factor pool ─────────────────
export { daysAgoStr, todayStr };
