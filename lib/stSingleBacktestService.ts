/**
 * stSingleBacktestService.ts — 单只 ST 股票回测引擎
 *
 * 仅在服务端（API Route）使用。⚠️ 不要在客户端 import。
 *
 * 实现：
 *   - 买入/卖出信号（MA20/MA5/量价/评分）
 *   - T+1 限制（信号日次交易日开盘执行）
 *   - 涨跌停/停牌过滤
 *   - 手续费、印花税、滑点
 *   - 止损/止盈/时间止损/MA20跌破止损
 *   - 完整交易明细 + 风险事件 + K线信号
 */

import { getDailyKLine, getAdjFactor, applyAdjFactor } from "./tushareService";

// ── 参数 ──────────────────────────────────────────────────────────────
export interface STSingleParams {
  tsCode:          string;
  name:            string;         // 股票名称（显示用）
  isRealST:        boolean;        // 是否真实 ST/＊ST
  startDate:       string;         // YYYYMMDD
  endDate:         string;
  initialCapital:  number;         // 初始资金（元）
  positionRatio:   number;         // 单次买入仓位比例 0-1（如 0.9）
  stopLossRate:    number;         // 止损比例（如 0.06）
  halfProfitRate:  number;         // 半仓止盈（如 0.20），价格跌破 MA5 时卖出
  fullProfitRate:  number;         // 全仓止盈（如 0.35），价格跌破 MA10 时卖出
  maxHoldDays:     number;         // 最大持仓天数（0=不限）
  scoreMode:       "conservative" | "standard" | "aggressive" | "debug";
  minAmount20d:    number;         // 20日均成交额下限（元）
  commissionRate:  number;         // 手续费率
  stampDutyRate:   number;         // 印花税率
  slippageRate:    number;         // 滑点率
  enableT1:        boolean;
  enableLimitFilter: boolean;
  enableFees:      boolean;
}

// ── 评分阈值 ─────────────────────────────────────────────────────────
const SCORE_THRESHOLD: Record<STSingleParams["scoreMode"], number> = {
  conservative: 70,
  standard:     58,
  aggressive:   45,
  debug:        30,
};

// ── 内部 K 线 ─────────────────────────────────────────────────────────
interface DayBar {
  date: string; open: number; close: number; high: number;
  low: number; volume: number; amount: number; pctChg: number;
}

// ── 结果类型 ──────────────────────────────────────────────────────────
export interface STSingleTradeRecord {
  tradeId:       number;
  buyDate:       string;
  buyPrice:      number;
  buyShares:     number;
  buyAmount:     number;
  buyFee:        number;
  sellDate:      string;
  sellPrice:     number;
  sellShares:    number;
  sellAmount:    number;
  sellFee:       number;
  holdDays:      number;
  pnl:           number;
  pnlPct:        number;
  commission:    number;
  stampDuty:     number;
  slippageCost:  number;
  sellReason:    string;
  riskEvents:    string[];
}

export interface STSingleRiskEvent {
  date:       string;
  eventType:  string;
  stockName:  string;
  tsCode:     string;
  price:      number;
  pctChg:     number;
  holdShares: number;
  pnlImpact:  number;
  action:     string;
  note:       string;
}

export interface STSingleKlineSignal {
  date:    string;
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume:  number;
  pctChg:  number;
  ma5?:    number;
  ma10?:   number;
  ma20?:   number;
  signal?: "buy" | "sell" | "stop_loss" | "take_profit" | "limit_down_stuck";
}

export interface STSingleResult {
  status:        "ok" | "no_trades" | "data_insufficient" | "not_st";
  statusMessage: string;
  statusReason?: string;

  // 核心指标
  totalReturn:    number;
  annualReturn:   number;
  maxDrawdown:    number;
  sharpeRatio:    number;
  winRate:        number;
  profitFactor:   number;
  initialCapital: number;
  finalCapital:   number;

  // 交易统计
  totalTrades:              number;
  buyCount:                 number;
  stopLossCount:            number;
  takeProfitCount:          number;
  limitDownCannotSellCount: number;
  suspendedDays:            number;
  maxConsecutiveLosses:     number;
  avgHoldDays:              number;
  cashDays:                 number;

  equity:       { date: string; value: number }[];
  drawdown:     { date: string; dd:    number }[];
  trades:       STSingleTradeRecord[];
  riskEvents:   STSingleRiskEvent[];
  klineSignals: STSingleKlineSignal[];

  diagnostics: {
    klineCount:               number;
    tradingDays:              number;
    buySignalCount:           number;
    cannotTradeCount:         number;
    limitDownCannotSellCount: number;
    noTradeReason?:           string;
    dataSource:               string;
  };

  source:      "tushare";
  note:        string;
  scoreMode:   string;
  dataQuality: number;
}

// ── 工具函数 ──────────────────────────────────────────────────────────
function calcMA(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  return arr.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function isLU(pctChg: number): boolean { return pctChg >= 9.5; }
function isLD(pctChg: number): boolean { return pctChg <= -9.5; }

function calcFee(amount: number, action: "BUY" | "SELL", p: STSingleParams): number {
  if (!p.enableFees) return 0;
  const commission = Math.max(5, amount * p.commissionRate);
  const stamp = action === "SELL" ? amount * p.stampDutyRate : 0;
  return +(commission + stamp).toFixed(2);
}

function slip(price: number, action: "BUY" | "SELL", p: STSingleParams): number {
  if (!p.enableFees) return price;
  return action === "BUY"
    ? +(price * (1 + p.slippageRate)).toFixed(3)
    : +(price * (1 - p.slippageRate)).toFixed(3);
}

// 简化版因子评分（单只股票模式）
function calcScore(closes: number[], volumes: number[], amounts: number[], minAmt: number): number {
  if (closes.length < 20) return 0;
  const cur  = closes[closes.length - 1];
  const ma5  = calcMA(closes, 5);
  const ma10 = calcMA(closes, 10);
  const ma20 = calcMA(closes, 20);
  const ma60 = calcMA(closes, Math.min(60, closes.length));
  const vol20 = calcMA(volumes, 20);
  const volLast = volumes[volumes.length - 1] ?? 0;
  const amt20 = calcMA(amounts, 20);

  let score = 50;
  // 趋势
  if (ma5 && ma20)  { score += ma5  > ma20  ? 15 : -20; }
  if (ma20 && ma60) { score += ma20 > ma60  ? 10 : -10; }
  if (cur > 0 && ma20) { score += cur > ma20 ? 10 : -25; }
  if (cur > 0 && ma10) { score += cur > ma10 ? 5  : -5; }
  // 动量：10 日涨跌
  if (closes.length >= 11) {
    const r10 = (cur - closes[closes.length - 11]) / closes[closes.length - 11] * 100;
    if (r10 > 15) score += 8;
    else if (r10 > 5) score += 5;
    else if (r10 < -15) score -= 15;
    else if (r10 < -5) score -= 8;
  }
  // 量价
  if (vol20 && vol20 > 0) {
    const vr = volLast / vol20;
    if (vr > 2.0) score += 10;
    else if (vr > 1.3) score += 5;
    else if (vr < 0.4) score -= 8;
  }
  // 流动性
  if (amt20 !== null && amt20 >= minAmt) score += 5;
  else score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── 主回测函数 ────────────────────────────────────────────────────────
export async function backtestSingleSTStock(
  params: STSingleParams,
): Promise<STSingleResult> {

  // ── 空结果模板 ─────────────────────────────────────────────────
  const emptyResult = (
    status: STSingleResult["status"],
    msg: string,
    reason?: string,
  ): STSingleResult => ({
    status, statusMessage: msg, statusReason: reason,
    totalReturn: 0, annualReturn: 0, maxDrawdown: 0,
    sharpeRatio: 0, winRate: 0, profitFactor: 0,
    initialCapital: params.initialCapital, finalCapital: params.initialCapital,
    totalTrades: 0, buyCount: 0, stopLossCount: 0, takeProfitCount: 0,
    limitDownCannotSellCount: 0, suspendedDays: 0,
    maxConsecutiveLosses: 0, avgHoldDays: 0, cashDays: 0,
    equity: [], drawdown: [], trades: [], riskEvents: [], klineSignals: [],
    diagnostics: { klineCount: 0, tradingDays: 0, buySignalCount: 0,
      cannotTradeCount: 0, limitDownCannotSellCount: 0,
      noTradeReason: msg, dataSource: "tushare" },
    source: "tushare", note: "", scoreMode: params.scoreMode, dataQuality: 0,
  });

  // ── 拉取数据 ─────────────────────────────────────────────────
  const [dailyRes, adjRes] = await Promise.all([
    getDailyKLine(params.tsCode, params.startDate, params.endDate),
    getAdjFactor(params.tsCode,  params.startDate, params.endDate),
  ]);

  if (!dailyRes.ok) {
    return emptyResult("data_insufficient", `无法获取 ${params.tsCode} 历史数据：${dailyRes.error}`);
  }

  const sorted = [...dailyRes.records]
    .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  const adjSorted = adjRes.ok
    ? [...adjRes.records].sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)))
    : [];
  const adjusted = applyAdjFactor(sorted, adjSorted);

  const bars: DayBar[] = adjusted.map(r => ({
    date:   String(r.trade_date ?? ""),
    open:   Number(r.open   ?? 0),
    close:  Number(r.close  ?? 0),
    high:   Number(r.high   ?? 0),
    low:    Number(r.low    ?? 0),
    volume: Number(r.vol    ?? 0),
    amount: Number(r.amount ?? 0) * 1000,  // 千元 → 元
    pctChg: Number(r.pct_chg ?? 0),
  })).filter(b => b.close > 0 && b.date);

  if (bars.length < 20) {
    return emptyResult("data_insufficient",
      `历史数据不足（${bars.length} 个交易日，至少需要 20 天）`,
      "历史K线数据不足，无法运行回测");
  }

  // ── 初始化状态 ────────────────────────────────────────────────
  const scoreThr = SCORE_THRESHOLD[params.scoreMode];
  let cash = params.initialCapital;

  interface Holding {
    shares:    number;
    costPrice: number;  // 含滑点的买入价
    buyDate:   string;
    buyFee:    number;
    buyBarIdx: number;  // 买入时的 bar 索引，用于计算持仓天数
    riskNotes: string[];
  }
  let holding: Holding | null = null;

  let pendingBuySignal = false;   // 昨天产生买入信号，今天执行
  let pendingSellReason: string | null = null; // 昨天产生卖出信号，今天执行

  const equity:       { date: string; value: number }[] = [];
  const drawdown:     { date: string; dd:    number }[] = [];
  const trades:       STSingleTradeRecord[] = [];
  const riskEvents:   STSingleRiskEvent[]  = [];
  const klineSignals: STSingleKlineSignal[] = [];

  let tradeId = 0;
  let buySignalCount = 0;
  let cannotTradeCount = 0;
  let limitDownCannotSellCount = 0;
  let suspendedDays = 0;
  let cashDays = 0;

  // ── 主循环 ───────────────────────────────────────────────────
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const prior = bars.slice(0, i);

    const closes  = prior.map(b => b.close);
    const volumes  = prior.map(b => b.volume);
    const amounts  = prior.map(b => b.amount);

    const ma5v  = calcMA(closes, 5);
    const ma10v = calcMA(closes, 10);
    const ma20v = calcMA(closes, 20);
    const avgVol20 = calcMA(volumes, 20);

    const isSusp  = bar.volume === 0;
    const isLimitU = params.enableLimitFilter && isLU(bar.pctChg);
    const isLimitD = params.enableLimitFilter && isLD(bar.pctChg);

    if (isSusp) suspendedDays++;

    let todaySignal: STSingleKlineSignal["signal"] | undefined;

    // ── Step 1: 执行昨日卖出信号 ─────────────────────────────────
    if (pendingSellReason && holding) {
      if (!isSusp && !isLimitD) {
        // 可以卖出
        const execP  = slip(bar.open, "SELL", params);
        const sellAmt = +(holding.shares * execP).toFixed(2);
        const sellFee = calcFee(sellAmt, "SELL", params);
        const pnl    = +((execP - holding.costPrice) * holding.shares - sellFee - holding.buyFee).toFixed(2);
        const pnlPct = +((execP - holding.costPrice) / holding.costPrice * 100).toFixed(2);
        cash += +(sellAmt - sellFee).toFixed(2);

        const commission  = holding.buyFee + Math.max(5, sellAmt * params.commissionRate);
        const stampDuty   = params.enableFees ? +(sellAmt * params.stampDutyRate).toFixed(2) : 0;
        const slippageCost = params.enableFees
          ? +(holding.shares * holding.costPrice * params.slippageRate
             + holding.shares * execP * params.slippageRate).toFixed(2)
          : 0;
        const holdDays = i - holding.buyBarIdx;

        trades.push({
          tradeId: ++tradeId,
          buyDate: holding.buyDate, buyPrice: holding.costPrice,
          buyShares: holding.shares,
          buyAmount: +(holding.shares * holding.costPrice).toFixed(2),
          buyFee: holding.buyFee,
          sellDate: bar.date, sellPrice: execP,
          sellShares: holding.shares, sellAmount: sellAmt, sellFee,
          holdDays, pnl, pnlPct, commission, stampDuty, slippageCost,
          sellReason: pendingSellReason,
          riskEvents: [...holding.riskNotes],
        });

        if (pendingSellReason === "stop_loss") {
          todaySignal = "stop_loss";
          riskEvents.push({
            date: bar.date, eventType: "止损触发",
            stockName: params.name, tsCode: params.tsCode,
            price: execP, pctChg: bar.pctChg, holdShares: holding.shares,
            pnlImpact: pnl, action: `止损卖出 ${holding.shares} 股`,
            note: `亏损超 ${(params.stopLossRate * 100).toFixed(0)}%，次日开盘止损`,
          });
        } else if (pendingSellReason === "take_profit") {
          todaySignal = "take_profit";
          riskEvents.push({
            date: bar.date, eventType: "止盈触发",
            stockName: params.name, tsCode: params.tsCode,
            price: execP, pctChg: bar.pctChg, holdShares: holding.shares,
            pnlImpact: pnl, action: `止盈卖出 ${holding.shares} 股`,
            note: `盈利超阈值，次日开盘止盈`,
          });
        } else {
          todaySignal = "sell";
        }

        holding = null;
        pendingSellReason = null;

      } else if (isLimitD) {
        // 跌停，无法卖出
        limitDownCannotSellCount++;
        holding.riskNotes.push(`${bar.date} 跌停，无法卖出`);
        todaySignal = "limit_down_stuck";
        riskEvents.push({
          date: bar.date, eventType: "跌停无法卖出",
          stockName: params.name, tsCode: params.tsCode,
          price: bar.close, pctChg: bar.pctChg, holdShares: holding.shares,
          pnlImpact: 0, action: "持仓保留，待明日继续卖出",
          note: "当日跌停，无法成交，延续挂单",
        });
        // pendingSellReason 保留到明天继续尝试
      } else if (isSusp) {
        // 停牌
        holding.riskNotes.push(`${bar.date} 停牌，无法卖出`);
        riskEvents.push({
          date: bar.date, eventType: "停牌影响",
          stockName: params.name, tsCode: params.tsCode,
          price: bar.close, pctChg: 0, holdShares: holding.shares,
          pnlImpact: 0, action: "持仓保留，等待复牌",
          note: "股票停牌，无法成交",
        });
        // pendingSellReason 保留到明天继续尝试
      }
    }

    // ── Step 2: 执行昨日买入信号 ─────────────────────────────────
    if (pendingBuySignal && !holding) {
      if (!isSusp && !isLimitU) {
        const investAmt = cash * params.positionRatio;
        const execP    = slip(bar.open, "BUY", params);
        const fee0     = calcFee(investAmt, "BUY", params);
        const shares   = Math.floor((investAmt - fee0) / execP / 100) * 100;
        if (shares >= 100) {
          const buyAmt  = +(shares * execP).toFixed(2);
          const buyFee  = calcFee(buyAmt, "BUY", params);
          const totalCost = +(buyAmt + buyFee).toFixed(2);
          if (cash >= totalCost) {
            cash -= totalCost;
            holding = { shares, costPrice: execP, buyDate: bar.date,
              buyFee, buyBarIdx: i, riskNotes: [] };
            todaySignal = "buy";
          }
        }
      } else {
        cannotTradeCount++;
      }
      pendingBuySignal = false;
    }

    // ── Step 3: 检查卖出条件（今天持仓 → 明天执行）─────────────────
    if (holding && !pendingSellReason) {
      const chg  = (bar.close - holding.costPrice) / holding.costPrice;
      const hDays = i - holding.buyBarIdx;

      // ① 止损
      if (params.stopLossRate > 0 && chg <= -params.stopLossRate) {
        pendingSellReason = "stop_loss";
      }
      // ② 连续两日跌停
      else if (i >= 1 && isLD(bar.pctChg) && isLD(bars[i - 1].pctChg) && hDays >= 1) {
        pendingSellReason = "consecutive_limit_down";
        riskEvents.push({
          date: bar.date, eventType: "连续跌停风险",
          stockName: params.name, tsCode: params.tsCode,
          price: bar.close, pctChg: bar.pctChg, holdShares: holding.shares,
          pnlImpact: 0, action: "下一交易日强制卖出",
          note: "连续两日跌停，触发强制退出",
        });
      }
      // ③ 全仓止盈：涨幅≥fullProfitRate 且跌破 MA10
      else if (params.fullProfitRate > 0 && chg >= params.fullProfitRate
               && ma10v && bar.close < ma10v) {
        pendingSellReason = "take_profit";
      }
      // ④ 半仓止盈（简化为全仓）：涨幅≥halfProfitRate 且跌破 MA5
      else if (params.halfProfitRate > 0 && chg >= params.halfProfitRate
               && ma5v && bar.close < ma5v) {
        pendingSellReason = "take_profit";
      }
      // ⑤ MA20 跌破 + 放量
      else if (ma20v && bar.close < ma20v && avgVol20 && bar.volume > avgVol20 * 1.2 && hDays >= 1) {
        pendingSellReason = "ma20_breakdown";
      }
      // ⑥ 评分大幅下降
      else if (prior.length >= 20) {
        const score = calcScore(
          [...closes.slice(-60), bar.close],
          [...volumes.slice(-20), bar.volume],
          [...amounts.slice(-20), bar.amount],
          params.minAmount20d,
        );
        if (score < 45) pendingSellReason = "low_score";
      }
      // ⑦ 时间止损
      else if (params.maxHoldDays > 0 && hDays >= params.maxHoldDays) {
        pendingSellReason = "time_stop";
      }
    }

    // ── Step 4: 检查买入条件（今天无仓 → 明天执行）──────────────────
    if (!holding && !pendingBuySignal && !pendingSellReason && prior.length >= 20) {
      if (!isSusp && !isLimitU) {
        const score = calcScore(
          [...closes.slice(-60), bar.close],
          [...volumes.slice(-20), bar.volume],
          [...amounts.slice(-20), bar.amount],
          params.minAmount20d,
        );
        const trendOk     = ma20v !== null && bar.close > ma20v
                           && ma5v !== null && ma5v >= ma20v * 0.97;
        const recentLD    = isLD(bar.pctChg) || (i >= 1 && isLD(bars[i - 1].pctChg));

        if (score >= scoreThr && trendOk && !recentLD) {
          buySignalCount++;
          pendingBuySignal = true;
        }
      } else if (!isSusp) {
        cannotTradeCount++;
      }
    }

    if (!holding) cashDays++;

    // ── Step 5: 更新权益曲线 ─────────────────────────────────────
    const posVal = holding ? holding.shares * bar.close : 0;
    equity.push({ date: bar.date, value: +(cash + posVal).toFixed(2) });

    // ── 记录 K 线信号 ────────────────────────────────────────────
    klineSignals.push({
      date: bar.date, open: bar.open, high: bar.high, low: bar.low,
      close: bar.close, volume: bar.volume, pctChg: bar.pctChg,
      ma5:  ma5v  ?? undefined,
      ma10: ma10v ?? undefined,
      ma20: ma20v ?? undefined,
      signal: todaySignal,
    });
  }

  // ── 强制平仓（回测结束）────────────────────────────────────────
  if (holding) {
    const lastBar   = bars[bars.length - 1];
    const execP     = slip(lastBar.close, "SELL", params);
    const sellAmt   = +(holding.shares * execP).toFixed(2);
    const sellFee   = calcFee(sellAmt, "SELL", params);
    const pnl       = +((execP - holding.costPrice) * holding.shares - sellFee - holding.buyFee).toFixed(2);
    const pnlPct    = +((execP - holding.costPrice) / holding.costPrice * 100).toFixed(2);
    cash += +(sellAmt - sellFee).toFixed(2);

    trades.push({
      tradeId: ++tradeId,
      buyDate: holding.buyDate, buyPrice: holding.costPrice,
      buyShares: holding.shares,
      buyAmount: +(holding.shares * holding.costPrice).toFixed(2),
      buyFee: holding.buyFee,
      sellDate: lastBar.date, sellPrice: execP,
      sellShares: holding.shares, sellAmount: sellAmt, sellFee,
      holdDays: bars.length - 1 - holding.buyBarIdx,
      pnl, pnlPct,
      commission:   holding.buyFee + Math.max(5, sellAmt * params.commissionRate),
      stampDuty:    params.enableFees ? +(sellAmt * params.stampDutyRate).toFixed(2) : 0,
      slippageCost: params.enableFees
        ? +(holding.shares * holding.costPrice * params.slippageRate
           + holding.shares * execP * params.slippageRate).toFixed(2) : 0,
      sellReason: "final_close",
      riskEvents: [...holding.riskNotes],
    });
    holding = null;
  }

  // ── 计算回撤曲线 ──────────────────────────────────────────────
  let peak = params.initialCapital, maxDD = 0;
  for (const e of equity) {
    if (e.value > peak) peak = e.value;
    const dd = peak > 0 ? +((e.value - peak) / peak * 100).toFixed(2) : 0;
    if (dd < maxDD) maxDD = dd;
    drawdown.push({ date: e.date, dd });
  }

  // ── 计算夏普比率 ──────────────────────────────────────────────
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    rets.push((equity[i].value - equity[i - 1].value) / equity[i - 1].value);
  }
  const mean  = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const std   = rets.length > 1
    ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) : 0;
  const sharpeRatio = std > 0 ? +((mean / std) * Math.sqrt(252)).toFixed(2) : 0;

  // ── 胜率 & 盈亏比 ─────────────────────────────────────────────
  const finalCapital = +cash.toFixed(2);
  const totalReturn  = +((finalCapital - params.initialCapital) / params.initialCapital * 100).toFixed(2);
  const years        = bars.length / 252;
  const annualReturn = years > 0
    ? +((Math.pow(finalCapital / params.initialCapital, 1 / years) - 1) * 100).toFixed(2) : 0;

  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : 0;
  const avgWin  = wins.length   ? wins.reduce((a, t) => a + t.pnl, 0)   / wins.length   : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, t) => a + t.pnl, 0)) / losses.length : 0;
  const profitFactor = avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : wins.length > 0 ? 99 : 0;

  let maxConsLoss = 0, curLoss = 0;
  for (const t of trades) {
    if (t.pnl <= 0) { curLoss++; if (curLoss > maxConsLoss) maxConsLoss = curLoss; }
    else curLoss = 0;
  }

  const avgHoldDays = trades.length
    ? +(trades.reduce((a, t) => a + t.holdDays, 0) / trades.length).toFixed(1) : 0;
  const stopLossCount   = trades.filter(t => t.sellReason === "stop_loss").length;
  const takeProfitCount = trades.filter(t => t.sellReason === "take_profit").length;

  // ── 构建无交易原因 ────────────────────────────────────────────
  let noTradeReason = "";
  if (trades.length === 0) {
    if (buySignalCount === 0)
      noTradeReason = "买入条件（均线站上 MA20 + 评分达标 + 流动性）在回测期间内始终未触发，可尝试切换【激进】模式";
    else if (cannotTradeCount > buySignalCount * 0.7)
      noTradeReason = "多数信号日遭遇涨停/停牌，无法成交";
    else
      noTradeReason = "评分阈值偏高或流动性不足，可切换【激进/调试】模式查看信号详情";
  }

  return {
    status:        trades.length > 0 ? "ok" : "no_trades",
    statusMessage: trades.length > 0 ? "回测完成" : "本次单只股票回测没有产生交易",
    statusReason:  noTradeReason || undefined,
    totalReturn, annualReturn,
    maxDrawdown: +maxDD.toFixed(2),
    sharpeRatio, winRate, profitFactor,
    initialCapital: params.initialCapital, finalCapital,
    totalTrades:              trades.length,
    buyCount:                 trades.length,
    stopLossCount, takeProfitCount,
    limitDownCannotSellCount,
    suspendedDays,
    maxConsecutiveLosses: maxConsLoss,
    avgHoldDays: Number(avgHoldDays),
    cashDays,
    equity, drawdown, trades, riskEvents, klineSignals,
    diagnostics: {
      klineCount: bars.length, tradingDays: bars.length,
      buySignalCount, cannotTradeCount, limitDownCannotSellCount,
      noTradeReason: noTradeReason || undefined,
      dataSource: "tushare_daily",
    },
    source: "tushare",
    note: [
      "前复权价格（Tushare adj_factor）",
      "T+1 限制（信号日次交易日开盘执行）",
      params.enableFees ? `手续费 ${(params.commissionRate * 100).toFixed(3)}%（买入≥5元）` : "手续费关闭",
      params.enableFees ? "印花税 0.1%（卖出）" : "印花税关闭",
      params.enableFees ? `滑点 ${(params.slippageRate * 100).toFixed(2)}%` : "滑点关闭",
      params.enableLimitFilter ? "涨跌停过滤" : "涨跌停过滤关闭",
    ].join(" | "),
    scoreMode:   params.scoreMode,
    dataQuality: adjRes.ok ? 1.0 : 0.7,
  };
}
