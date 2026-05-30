/**
 * singleStockBacktest.ts — 单只股票策略回测引擎
 *
 * 数据来源：Tushare daily + adj_factor + daily_basic（可选）+ index_daily（沪深300市场状态）
 *
 * 特性：
 *   - 多因子买卖信号：趋势 / 动量 / 估值 / 风险（质量因子数据不足时中性处理）
 *   - 分批止盈（盈利>20%跌破短均线卖半）
 *   - 止损 / 全部止盈
 *   - 市场弱势减仓
 *   - 涨跌停 / 停牌过滤
 *   - T+1 限制
 *   - 返回每根 K线的信号状态（供前端绘制买卖点标记）
 *
 * ⚠️  仅在服务端（API Route）使用
 */

import {
  getDailyKLine,
  getAdjFactor,
  getDailyBasic,
  getIndexDaily,
  applyAdjFactor,
  hasTushareToken,
  daysAgoStr,
  todayStr,
  type TushareRecord,
} from "./tushareService";
import type { KLineBar } from "./factorService";

// ── Types ─────────────────────────────────────────────────────────────

export type MASet = "5/20/60" | "10/30/120";
export type CheckFreq = "daily" | "weekly";

export interface SingleStockParams {
  tsCode:         string;     // e.g. "600519.SH"
  name:           string;
  startDate:      string;     // YYYYMMDD
  endDate:        string;
  initialCapital: number;
  commissionRate: number;
  stampDutyRate:  number;
  slippageRate:   number;
  stopLossRate:   number;     // 0 = 不止损
  takeProfitHalf: number;     // 半仓止盈阈值，如 0.20
  takeProfitFull: number;     // 全仓止盈阈值，如 0.35
  scoreThreshold: number;     // 买入综合评分阈值
  trendThreshold: number;     // 买入趋势评分阈值
  maSet:          MASet;
  checkFreq:      CheckFreq;
}

export interface SingleStockTrade {
  date:     string;
  action:   "BUY" | "SELL" | "PARTIAL_SELL";
  reason:   string;
  price:    number;
  shares:   number;
  amount:   number;
  fee:      number;
  pnl:      number;
  holdDays: number;
}

/** 每根K线的信号状态（前端图表用）*/
export interface BarSignal {
  date:    string;
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume:  number;
  maShort: number | null;
  maMid:   number | null;
  maLong:  number | null;
  totalScore:    number;
  trendScore:    number;
  marketStatus:  "strong" | "neutral" | "weak" | "unknown";
  // 当日执行的交易（在开盘时执行）
  tradeAction:  "BUY" | "SELL" | "PARTIAL_SELL" | null;
  tradePrice:   number | null;
  tradeReason:  string | null;
}

export interface Diagnostic { type: "warning" | "info"; message: string; }

export interface SingleStockResult {
  ok:              true;
  tsCode:          string;
  name:            string;
  startDate:       string;
  endDate:         string;
  initialCapital:  number;
  finalCapital:    number;
  totalReturn:     number;
  annualReturn:    number;
  maxDrawdown:     number;
  sharpeRatio:     number;
  winRate:         number;
  profitFactor:    number;
  totalTrades:     number;
  maxConsecutiveLosses: number;
  totalFees:       number;
  feeImpact:       number;
  strategyScore:   number;
  holdingDays:     number;
  cashDays:        number;
  bars:            BarSignal[];
  trades:          SingleStockTrade[];
  equity:          { date: string; value: number }[];
  drawdown:        { date: string; dd: number }[];
  diagnostics:     Diagnostic[];
  hasValuation:    boolean;
  marketTimingOk:  boolean;
  source:          "tushare";
  note:            string;
}

export type SingleStockError = {
  ok:               false;
  error:            string;
  tokenMissing?:    boolean;
  permissionDenied?: boolean;
};

// ── MA set config ─────────────────────────────────────────────────────
const MA_CONFIG: Record<MASet, { short: number; mid: number; long: number }> = {
  "5/20/60":   { short: 5,  mid: 20, long: 60  },
  "10/30/120": { short: 10, mid: 30, long: 120 },
};

// ── Helpers ───────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function maCalc(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  return closes.slice(-n).reduce((a, b) => a + b, 0) / n;
}

function slipPrice(price: number, action: "BUY" | "SELL", slip: number): number {
  return action === "BUY" ? +(price * (1 + slip)).toFixed(3) : +(price * (1 - slip)).toFixed(3);
}

function calcFee(amount: number, action: "BUY" | "SELL", p: SingleStockParams): number {
  return +(Math.max(5, amount * p.commissionRate) + (action === "SELL" ? amount * p.stampDutyRate : 0)).toFixed(2);
}

function isLimitUp(pctChg: number)   { return pctChg >=  9.5; }
function isLimitDown(pctChg: number) { return pctChg <= -9.5; }

// ── Signal computation ────────────────────────────────────────────────
interface SignalResult {
  totalScore:    number;
  trendScore:    number;
  momentumScore: number;
  riskScore:     number;
  valuationScore: number;
  maShort:  number | null;
  maMid:    number | null;
  maLong:   number | null;
  volumeSpike: boolean;   // volume > avg5 * 1.5 AND today down
}

function calcSignal(
  bars:   KLineBar[],          // includes current bar (for end-of-day sell check)
  maCfg:  { short: number; mid: number; long: number },
  dbRec?: TushareRecord | null,
): SignalResult {
  const MIN_BARS = maCfg.long;
  if (bars.length < MIN_BARS) {
    return {
      totalScore: 50, trendScore: 50, momentumScore: 50,
      riskScore: 65, valuationScore: 50,
      maShort: null, maMid: null, maLong: null, volumeSpike: false,
    };
  }

  const closes  = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const cur     = closes[closes.length - 1];

  const maS = maCalc(closes, maCfg.short);
  const maM = maCalc(closes, maCfg.mid);
  const maL = maCalc(closes, maCfg.long);

  // ── Trend score ─────────────────────────────────────────────────
  let trend = 45;
  if (maS && cur > maS) trend += 5;
  if (maM && cur > maM) trend += 15;
  if (maL && cur > maL) trend += 15;
  if (maS && maM && maS > maM) trend += 10;
  if (maM && maL && maM > maL) trend += 15;
  // 60-day high breakout
  const high60 = bars.slice(-60).reduce((m, b) => Math.max(m, b.high), 0);
  if (bars[bars.length - 1].high >= high60 * 0.99) trend += 5;
  // Penalize below key MAs
  if (maM && cur < maM * 0.97) trend -= 20;
  if (maL && cur < maL * 0.95) trend -= 20;
  trend = clamp(Math.round(trend), 0, 100);

  // ── Momentum score ──────────────────────────────────────────────
  let mom = 45;
  const ret = (n: number) =>
    closes.length > n ? (cur - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n] : null;
  const r20  = ret(20);
  const r60  = ret(60);
  const r120 = ret(120);
  if (r20  !== null) { mom += clamp(Math.round(r20  * 200), -20, 20); if (r20  > 0.25) mom -= 10; }
  if (r60  !== null)   mom += clamp(Math.round(r60  * 100), -15, 10);
  if (r120 !== null)   mom += clamp(Math.round(r120 * 80),  -10, 8);
  mom = clamp(Math.round(mom), 0, 100);

  // ── Risk score (higher = less risky) ───────────────────────────
  let risk = 65;
  const dr: number[] = [];
  for (let j = Math.max(1, closes.length - 20); j < closes.length; j++) {
    dr.push((closes[j] - closes[j - 1]) / closes[j - 1]);
  }
  const stdDev = dr.length > 1
    ? Math.sqrt(dr.reduce((a, r) => a + r * r, 0) / dr.length) * Math.sqrt(252) : 0;
  if      (stdDev > 0.5)  risk -= 20;
  else if (stdDev > 0.35) risk -= 10;
  else if (stdDev < 0.2)  risk += 10;
  risk = clamp(Math.round(risk), 0, 100);

  // ── Volume spike downward ──────────────────────────────────────
  let volumeSpike = false;
  if (bars.length >= 6) {
    const avg5 = volumes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
    volumeSpike = volumes[volumes.length - 1] > avg5 * 1.5
      && bars[bars.length - 1].close < bars[bars.length - 2].close;
  }
  if (volumeSpike) risk -= 15;
  risk = clamp(risk, 0, 100);

  // ── Valuation score ─────────────────────────────────────────────
  let val = 50;
  if (dbRec) {
    const pe = Number(dbRec.pe_ttm ?? 0);
    const pb = Number(dbRec.pb     ?? 0);
    const tr = Number(dbRec.turnover_rate ?? 0);
    if (pe > 0 && pe < 20)       val += 15;
    else if (pe > 0 && pe < 35)  val += 8;
    else if (pe > 60)            val -= 12;
    if (pb > 0 && pb < 2)        val += 10;
    else if (pb > 8)             val -= 10;
    if (tr > 0.5 && tr < 5)      val += 5;
    else if (tr > 10)            val -= 8;
    else if (tr < 0.3 && tr > 0) val -= 10;  // 流动性不足
    val = clamp(Math.round(val), 0, 100);
  }

  // ── Total (weighted) ────────────────────────────────────────────
  const total = clamp(Math.round(
    trend * 0.35 + mom * 0.25 + risk * 0.20 + val * 0.15 + 50 * 0.05
  ), 0, 100);

  return {
    totalScore: total, trendScore: trend, momentumScore: mom,
    riskScore: risk, valuationScore: val,
    maShort: maS, maMid: maM, maLong: maL, volumeSpike,
  };
}

// ── Weekly rebalance dates ────────────────────────────────────────────
function buildWeeklyDates(dates: string[]): Set<string> {
  const s = new Set<string>();
  if (!dates.length) return s;
  s.add(dates[0]);
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(+dates[i-1].slice(0,4), +dates[i-1].slice(4,6)-1, +dates[i-1].slice(6,8));
    const cur  = new Date(+dates[i].slice(0,4),   +dates[i].slice(4,6)-1,   +dates[i].slice(6,8));
    const diff = (cur.getTime() - prev.getTime()) / 86400000;
    if (diff >= 5 || cur.getDay() <= prev.getDay()) s.add(dates[i]);
  }
  return s;
}

// ── Strategy score ────────────────────────────────────────────────────
function composeScore(ann: number, dd: number, sharpe: number, wr: number, pf: number) {
  return clamp(Math.round(
    Math.min(25, ann * 0.8) +
    Math.max(0, 25 + dd * 1.25) +
    Math.min(25, sharpe * 12.5) +
    clamp((wr - 40) * 0.5 + pf * 4, 0, 25)
  ), 0, 100);
}

// ── Diagnostics ───────────────────────────────────────────────────────
function buildDiag(
  ann: number, dd: number, wr: number, sharpe: number, pf: number,
  consLoss: number, feeImpact: number, holdDays: number, totalDays: number,
): Diagnostic[] {
  const d: Diagnostic[] = [];
  if (dd < -20) d.push({ type: "warning", message: `最大回撤 ${dd.toFixed(1)}% 风险偏高` });
  if (wr < 45)  d.push({ type: "warning", message: `胜率 ${wr.toFixed(1)}% 偏低，建议提高买入评分阈值` });
  if (feeImpact > 5) d.push({ type: "warning", message: `手续费累计 ${feeImpact.toFixed(1)}%，交易成本偏高` });
  if (consLoss > 4)  d.push({ type: "warning", message: `最大连续亏损 ${consLoss} 次，需关注策略稳定性` });
  const holdPct = totalDays > 0 ? (holdDays / totalDays * 100) : 0;
  if (holdPct < 30)  d.push({ type: "info", message: `持仓天数比例 ${holdPct.toFixed(0)}%，多数时间空仓` });
  if (sharpe > 1.5)  d.push({ type: "info", message: `夏普 ${sharpe.toFixed(2)} 优秀，风险调整收益良好` });
  if (pf > 2.0)      d.push({ type: "info", message: `盈亏比 ${pf.toFixed(2)}，策略盈利能力强` });
  if (!d.length)     d.push({ type: "info", message: "各项指标正常，可进入模拟盘观察" });
  return d;
}

// ── Main engine ───────────────────────────────────────────────────────
export async function runSingleStockBacktest(
  params: SingleStockParams,
): Promise<SingleStockResult | SingleStockError> {

  if (!hasTushareToken()) {
    return { ok: false, error: "Tushare Token 未配置", tokenMissing: true };
  }

  const maCfg = MA_CONFIG[params.maSet];

  // ── 1. 获取价格数据（并行）──────────────────────────────────────
  const [dailyRes, adjRes, dbRes, csi300Res] = await Promise.all([
    getDailyKLine(params.tsCode, params.startDate, params.endDate),
    getAdjFactor(params.tsCode, params.startDate, params.endDate),
    getDailyBasic(params.tsCode, params.startDate, params.endDate).catch(() => ({ ok: false } as const)),
    getIndexDaily("000300.SH", daysAgoStr(150), todayStr()).catch(() => ({ ok: false } as const)),
  ]);

  if (!dailyRes.ok) {
    if (dailyRes.permissionDenied) return { ok: false, error: dailyRes.error, permissionDenied: true };
    return { ok: false, error: dailyRes.error };
  }

  const sorted = [...dailyRes.records]
    .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));

  const adjSorted = adjRes.ok
    ? [...adjRes.records].sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)))
    : [];

  const adjusted = applyAdjFactor(sorted, adjSorted);

  interface EnhancedBar extends KLineBar { pctChg: number; }
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

  if (bars.length < maCfg.long + 5) {
    return {
      ok: false,
      error: `历史数据不足（仅 ${bars.length} 个交易日，需至少 ${maCfg.long + 5} 个），无法完成真实回测`,
    };
  }

  // ── 2. 日线估值数据 map ───────────────────────────────────────────
  const dbMap = new Map<string, TushareRecord>();
  if (dbRes.ok && dbRes.records) {
    for (const r of dbRes.records) dbMap.set(String(r.trade_date), r);
  }
  const hasValuation = dbMap.size > 0;

  // ── 3. 沪深300市场状态 map ────────────────────────────────────────
  const marketMap = new Map<string, "strong" | "neutral" | "weak">();
  let marketTimingOk = false;
  if (csi300Res.ok && csi300Res.records && csi300Res.records.length >= 62) {
    const idxBars = [...csi300Res.records]
      .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
    const idxCloses = idxBars.map((r) => Number(r.close));
    for (let i = 60; i < idxBars.length; i++) {
      const ma60 = idxCloses.slice(i - 59, i + 1).reduce((a, b) => a + b, 0) / 60;
      const dev  = (idxCloses[i] - ma60) / ma60 * 100;
      marketMap.set(String(idxBars[i].trade_date), dev > 3 ? "strong" : dev < -3 ? "weak" : "neutral");
    }
    marketTimingOk = true;
  }

  const getMarket = (date: string): "strong" | "neutral" | "weak" | "unknown" =>
    marketMap.get(date) ?? "unknown";

  // ── 4. 确定检查日期集合 ───────────────────────────────────────────
  const allDates    = bars.map((b) => b.date);
  const checkDates  = params.checkFreq === "weekly"
    ? buildWeeklyDates(allDates)
    : new Set(allDates);

  // ── 5. 模拟 ──────────────────────────────────────────────────────
  let cash      = params.initialCapital;
  let totalFees = 0;

  type Holding = { shares: number; costPrice: number; buyDate: string; partialSold: boolean };
  let holding: Holding | null = null;

  const trades:      SingleStockTrade[] = [];
  const equityCurve: { date: string; value: number }[] = [];
  const barSignals:  BarSignal[] = [];

  // Pending action to execute at NEXT bar's open (no lookahead)
  type PendingAction =
    | { type: "BUY" }
    | { type: "SELL";         reason: string }
    | { type: "PARTIAL_SELL"; reason: string };
  let pendingAction: PendingAction | null = null;

  for (let i = 0; i < bars.length; i++) {
    const bar  = bars[i];
    const date = bar.date;

    let tradeAction: BarSignal["tradeAction"] = null;
    let tradePrice:  number | null = null;
    let tradeReason: string | null = null;

    // ── A. Execute pending action at today's open ─────────────────
    if (pendingAction) {
      const execOk = bar.open > 0 && bar.volume > 0;

      if (pendingAction.type === "BUY" && !holding && execOk && !isLimitUp(bar.pctChg)) {
        const execPrice = slipPrice(bar.open, "BUY", params.slippageRate);
        const fee0      = calcFee(cash, "BUY", params);
        const shares    = Math.floor((cash - fee0) / execPrice / 100) * 100;
        if (shares >= 100) {
          const amount = +(shares * execPrice).toFixed(2);
          const fee    = calcFee(amount, "BUY", params);
          const total  = +(amount + fee).toFixed(2);
          if (cash >= total) {
            cash      -= total;
            totalFees += fee;
            holding    = { shares, costPrice: execPrice, buyDate: date, partialSold: false };
            trades.push({ date, action: "BUY", reason: "买入信号", price: execPrice, shares, amount, fee, pnl: 0, holdDays: 0 });
            tradeAction = "BUY"; tradePrice = execPrice; tradeReason = "买入信号";
          }
        }
      } else if (pendingAction.type === "SELL" && holding && execOk && !isLimitDown(bar.pctChg)) {
        if (holding.buyDate < date) {  // T+1
          const execPrice = slipPrice(bar.open, "SELL", params.slippageRate);
          const amount    = +(holding.shares * execPrice).toFixed(2);
          const fee       = calcFee(amount, "SELL", params);
          const pnl       = +((execPrice - holding.costPrice) * holding.shares - fee).toFixed(2);
          const holdDays  = allDates.indexOf(date) - allDates.indexOf(holding.buyDate);
          cash      += +(amount - fee).toFixed(2);
          totalFees += fee;
          trades.push({ date, action: "SELL", reason: pendingAction.reason, price: execPrice, shares: holding.shares, amount, fee, pnl, holdDays });
          tradeAction = "SELL"; tradePrice = execPrice; tradeReason = pendingAction.reason;
          holding = null;
        }
      } else if (pendingAction.type === "PARTIAL_SELL" && holding && execOk && !isLimitDown(bar.pctChg)) {
        if (holding.buyDate < date) {  // T+1
          const h = holding as Holding;
          const sellShares: number = Math.floor(h.shares / 2 / 100) * 100;
          if (sellShares >= 100) {
            const execPrice = slipPrice(bar.open, "SELL", params.slippageRate);
            const amount    = +(sellShares * execPrice).toFixed(2);
            const fee       = calcFee(amount, "SELL", params);
            const pnl       = +((execPrice - h.costPrice) * sellShares - fee).toFixed(2);
            const holdDays  = allDates.indexOf(date) - allDates.indexOf(h.buyDate);
            cash      += +(amount - fee).toFixed(2);
            totalFees += fee;
            trades.push({ date, action: "PARTIAL_SELL", reason: pendingAction.reason, price: execPrice, shares: sellShares, amount, fee, pnl, holdDays });
            tradeAction = "PARTIAL_SELL"; tradePrice = execPrice; tradeReason = pendingAction.reason;
            holding = { ...h, shares: h.shares - sellShares, partialSold: true };
          }
        }
      }
      pendingAction = null;
    }

    // ── B. Compute end-of-day signal ──────────────────────────────
    // Bars up to and including today (for end-of-day sell check)
    const barsEOD  = bars.slice(0, i + 1) as KLineBar[];
    // Bars strictly before today (for buy check — no lookahead)
    const barsPrior = bars.slice(0, i) as KLineBar[];

    const sig      = calcSignal(barsEOD, maCfg, dbMap.get(date) ?? null);
    const sigPrior = i >= maCfg.long
      ? calcSignal(barsPrior, maCfg, dbMap.get(allDates[i - 1] ?? "") ?? null)
      : sig;

    const mktStatus = getMarket(date);

    // ── C. Determine next pending action ──────────────────────────
    const isCheckDay = checkDates.has(date);
    const curHolding = holding;

    if (curHolding) {
      const costPct = (bar.close - curHolding.costPrice) / curHolding.costPrice;

      // Stop loss — always check daily
      if (params.stopLossRate > 0 && costPct <= -params.stopLossRate) {
        pendingAction = { type: "SELL", reason: `止损（亏损${(costPct*100).toFixed(1)}%）` };
      }
      // Other sell conditions — only on check days
      else if (isCheckDay) {
        // Full take-profit after partial sell: profit > takeProfitFull and below maLong
        if (curHolding.partialSold && params.takeProfitFull > 0
          && costPct >= params.takeProfitFull && sig.maLong && bar.close < sig.maLong) {
          pendingAction = { type: "SELL", reason: `全额止盈（盈利${(costPct*100).toFixed(1)}%跌破长均线）` };
        }
        // Partial take-profit: profit > half threshold and below maShort
        else if (!curHolding.partialSold && params.takeProfitHalf > 0
          && costPct >= params.takeProfitHalf && sig.maShort && bar.close < sig.maShort) {
          pendingAction = { type: "PARTIAL_SELL", reason: `部分止盈（盈利${(costPct*100).toFixed(1)}%跌破短均线）` };
        }
        // Score drops below exit line
        else if (sig.totalScore < 60) {
          pendingAction = { type: "SELL", reason: `评分跌破60（当前${sig.totalScore}分）` };
        }
        // Volume breakdown below medium MA
        else if (sig.maMid && bar.close < sig.maMid && sig.volumeSpike) {
          pendingAction = { type: "SELL", reason: "跌破均线且放量" };
        }
        // Market turns weak
        else if (mktStatus === "weak" && costPct > 0) {
          pendingAction = { type: "SELL", reason: "市场转弱清仓" };
        }
      }
    }

    // Buy check — only on check days, only when no position and no pending
    if (!curHolding && !pendingAction && isCheckDay && i >= maCfg.long) {
      if (sigPrior.totalScore >= params.scoreThreshold
        && sigPrior.trendScore >= params.trendThreshold
        && !isLimitUp(bar.pctChg)
        && bar.volume > 0
        && mktStatus !== "weak") {
        pendingAction = { type: "BUY" };
      }
    }

    // ── D. Daily equity + bar record ──────────────────────────────
    const holdVal = curHolding ? curHolding.shares * bar.close : 0;
    equityCurve.push({ date, value: +(cash + holdVal).toFixed(2) });

    barSignals.push({
      date, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      volume: bar.volume,
      maShort: sig.maShort, maMid: sig.maMid, maLong: sig.maLong,
      totalScore: sig.totalScore, trendScore: sig.trendScore,
      marketStatus: mktStatus,
      tradeAction, tradePrice, tradeReason,
    });
  }

  // ── 6. Close remaining position at last bar ───────────────────────
  if (holding) {
    const last = bars[bars.length - 1];
    const execPrice = slipPrice(last.close, "SELL", params.slippageRate);
    const amount    = +(holding.shares * execPrice).toFixed(2);
    const fee       = calcFee(amount, "SELL", params);
    const pnl       = +((execPrice - holding.costPrice) * holding.shares - fee).toFixed(2);
    cash      += +(amount - fee).toFixed(2);
    totalFees += fee;
    trades.push({ date: last.date, action: "SELL", reason: "回测结束平仓", price: execPrice, shares: holding.shares, amount, fee, pnl, holdDays: allDates.length - allDates.indexOf(holding.buyDate) });
  }

  // ── 7. Metrics ────────────────────────────────────────────────────
  const finalCapital = cash;
  const totalReturn  = +((finalCapital - params.initialCapital) / params.initialCapital * 100).toFixed(2);
  const years        = bars.length / 252;
  const annualReturn = years > 0
    ? +((Math.pow(finalCapital / params.initialCapital, 1 / years) - 1) * 100).toFixed(2) : 0;

  // Max drawdown + drawdown curve
  let peak  = params.initialCapital, maxDD = 0;
  const ddCurve: { date: string; dd: number }[] = [];
  for (const e of equityCurve) {
    if (e.value > peak) peak = e.value;
    const dd = peak > 0 ? +((e.value - peak) / peak * 100).toFixed(2) : 0;
    if (dd < maxDD) maxDD = dd;
    ddCurve.push({ date: e.date, dd });
  }

  // Sharpe
  const rets: number[] = [];
  for (let i = 1; i < equityCurve.length; i++)
    rets.push((equityCurve[i].value - equityCurve[i-1].value) / equityCurve[i-1].value);
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const std  = rets.length > 1 ? Math.sqrt(rets.reduce((a,r) => a+(r-mean)**2, 0)/rets.length) : 0;
  const sharpeRatio = std > 0 ? +((mean / std) * Math.sqrt(252)).toFixed(2) : 0;

  // Win rate + profit factor
  const sellT = trades.filter((t) => t.action !== "BUY" && t.reason !== "回测结束平仓");
  const wins  = sellT.filter((t) => t.pnl > 0);
  const loss  = sellT.filter((t) => t.pnl <= 0);
  const winRate     = sellT.length ? +((wins.length / sellT.length) * 100).toFixed(1) : 0;
  const avgWin      = wins.length ? wins.reduce((a,t) => a + t.pnl, 0) / wins.length : 0;
  const avgLoss     = loss.length ? Math.abs(loss.reduce((a,t) => a + t.pnl, 0)) / loss.length : 0;
  const profitFactor = avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : 0;

  // Max consecutive losses
  let maxCL = 0, curCL = 0;
  for (const t of sellT) {
    if (t.pnl <= 0) { curCL++; if (curCL > maxCL) maxCL = curCL; } else curCL = 0;
  }

  // Holding vs cash days
  let holdingDays = 0, cashDays = 0;
  {
    let inPos = false;
    for (const sig of barSignals) {
      if (sig.tradeAction === "BUY")  inPos = true;
      if (sig.tradeAction === "SELL" && inPos) inPos = false;
      if (inPos) holdingDays++; else cashDays++;
    }
  }

  const feeImpact     = +((totalFees / params.initialCapital) * 100).toFixed(2);
  const strategyScore = composeScore(annualReturn, maxDD, sharpeRatio, winRate, profitFactor);
  const diagnostics   = buildDiag(annualReturn, maxDD, winRate, sharpeRatio, profitFactor, maxCL, feeImpact, holdingDays, bars.length);

  return {
    ok: true, tsCode: params.tsCode, name: params.name,
    startDate: params.startDate, endDate: params.endDate,
    initialCapital: params.initialCapital, finalCapital: +finalCapital.toFixed(2),
    totalReturn, annualReturn, maxDrawdown: +maxDD.toFixed(2), sharpeRatio,
    winRate, profitFactor, totalTrades: trades.length, maxConsecutiveLosses: maxCL,
    totalFees: +totalFees.toFixed(2), feeImpact, strategyScore,
    holdingDays, cashDays,
    bars: barSignals, trades, equity: equityCurve, drawdown: ddCurve,
    diagnostics, hasValuation, marketTimingOk,
    source: "tushare",
    note: [
      "前复权价格（Tushare adj_factor）",
      "T+1 限制",
      `止损 ${params.stopLossRate > 0 ? `-${(params.stopLossRate*100).toFixed(0)}%` : "关闭"}`,
      `分批止盈 ${params.takeProfitHalf > 0 ? `+${(params.takeProfitHalf*100).toFixed(0)}%` : "关闭"}`,
      `均线组合 MA${params.maSet}`,
      `${params.checkFreq === "daily" ? "每日" : "每周"}检查信号`,
      hasValuation ? "估值数据 Tushare daily_basic ✅" : "估值数据不可用（中性处理）",
      marketTimingOk ? "市场择时 沪深300 MA60 ✅" : "市场择时不可用",
    ].join(" | "),
  };
}

export { daysAgoStr, todayStr };
