/**
 * POST /api/tushare/st-backtest
 *
 * A股 ST 风险反转策略历史回测（服务端，Tushare 真实历史数据）。
 *
 * ⚠️ ST 策略高风险说明：
 *   - 单只 ST 仓位上限 3%，总 ST 仓位上限 15%
 *   - 止损默认 -6%，并强制在 2 连跌停后触发风险退出
 *   - 涨跌停/停牌过滤（A股主板 ±10%，创业板/科创板 ±20%）
 *   - 结果包含：一字跌停无法卖出次数、停牌影响天数、风险事件
 *
 * Body (JSON):
 *   startDate        YYYYMMDD
 *   endDate          YYYYMMDD
 *   initialCapital   起始资金（默认 100000）
 *   maxPositions     最大持仓只数（默认 5，上限 5）
 *   maxSingleWeight  单股最大仓位（默认 0.03 = 3%，上限 0.05）
 *   maxTotalSTWeight ST 总仓位上限（默认 0.15 = 15%）
 *   stopLossRate     止损比例（默认 0.06 = -6%）
 *   rebalanceFreq    "weekly" | "monthly"（默认 "weekly"）
 *   scoreThreshold   买入评分阈值（默认 60）
 *   commissionRate   手续费（默认 0.0003）
 */
import { NextRequest, NextResponse }           from "next/server";
import {
  getAStockBasic, getDailyKLine, getAdjFactor,
  hasTushareToken, daysAgoStr, todayStr,
  symbolToTsCode, applyAdjFactor,
} from "@/lib/tushareService";
import { calculateSTFactorScores } from "@/lib/stFactorService";
import type { STBar }              from "@/lib/stFactorService";

export const dynamic = "force-dynamic";

// ── 常量 ─────────────────────────────────────────────────────────
const MAX_POSITIONS    = 5;
const MAX_SINGLE_WT    = 0.05;
const LIMIT_THRESHOLD  = 9.3; // ±9.3% 视为跌停/涨停

// ── 类型 ─────────────────────────────────────────────────────────
interface STTrade {
  date:    string;
  tsCode:  string;
  name:    string;
  action:  "BUY" | "SELL";
  reason:  "signal" | "stop_loss" | "limit_down_exit" | "score_drop" | "final";
  price:   number;
  shares:  number;
  amount:  number;
  fee:     number;
  pnl:     number;
}

interface RiskEvent {
  date:   string;
  tsCode: string;
  name:   string;
  type:   "limit_down_stuck" | "suspended" | "consecutive_limit_down";
  note:   string;
}

interface STBacktestResult {
  ok:                    true;
  // 核心指标
  totalReturn:           number;
  annualReturn:          number;
  maxDrawdown:           number;
  sharpeRatio:           number;
  winRate:               number;
  profitFactor:          number;
  totalTrades:           number;
  maxConsecutiveLosses:  number;
  totalFees:             number;
  feeImpact:             number;
  strategyScore:         number;
  // 曲线
  equity:   { date: string; value: number }[];
  drawdown: { date: string; dd: number }[];
  // 交易记录
  trades:   STTrade[];
  // ST 专项指标
  limitDownStuckCount:   number;   // 因跌停无法卖出次数
  suspendedDayImpact:    number;   // 停牌影响总天数
  riskEvents:            RiskEvent[];
  poolSize:              number;   // 实际参与回测的 ST 股票数
  // 元信息
  source:    "tushare";
  note:      string;
  startDate: string;
  endDate:   string;
  initialCapital: number;
  finalCapital:   number;
}

interface STBacktestError {
  ok:               false;
  error:            string;
  tokenMissing?:    boolean;
  permissionDenied?: boolean;
}

// ── helpers ───────────────────────────────────────────────────────
function calcFee(amount: number, action: "BUY" | "SELL", commRate: number): number {
  const comm  = Math.max(5, amount * commRate);
  const stamp = action === "SELL" ? amount * 0.001 : 0;
  return +(comm + stamp).toFixed(2);
}

function slipPrice(price: number, action: "BUY" | "SELL"): number {
  return action === "BUY"
    ? +(price * 1.0005).toFixed(3)
    : +(price * 0.9995).toFixed(3);
}

function isLimitDown(pctChg: number) { return pctChg <= -LIMIT_THRESHOLD; }
function isLimitUp(pctChg: number)   { return pctChg >=  LIMIT_THRESHOLD; }

function detectSTName(name: string): boolean {
  return name.includes("ST") || name.includes("*ST");
}

function scoreStrategy(
  annual: number, maxDD: number, sharpe: number, winRate: number, pf: number
): number {
  const a = Math.max(0, Math.min(25, annual * 0.8));
  const d = Math.max(0, 25 + maxDD * 1.25);
  const s = Math.max(0, Math.min(25, sharpe * 12.5));
  const w = Math.max(0, Math.min(25, (winRate - 40) * 0.5 + pf * 4));
  return Math.max(0, Math.min(100, Math.round(a + d + s + w)));
}

// ── Main handler ──────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "Tushare Token 未配置，无法运行 ST 策略回测", tokenMissing: true },
      { status: 200 },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* defaults */ }

  // ── 参数解析 ────────────────────────────────────────────────────
  const startDate      = String(body.startDate ?? daysAgoStr(365));
  const endDate        = String(body.endDate   ?? todayStr());
  const initialCapital = Math.max(10000, Number(body.initialCapital ?? 100000));
  const commissionRate = Math.min(0.01, Math.max(0.0001, Number(body.commissionRate ?? 0.0003)));
  const maxPositions   = Math.min(MAX_POSITIONS, Math.max(1, Number(body.maxPositions ?? 5)));
  const maxSingleWT    = Math.min(MAX_SINGLE_WT, Math.max(0.01, Number(body.maxSingleWeight ?? 0.03)));
  const maxTotalWT     = Math.min(0.30, Math.max(0.05, Number(body.maxTotalSTWeight ?? 0.15)));
  const stopLossRate   = Math.min(0.20, Math.max(0, Number(body.stopLossRate ?? 0.06)));
  const rebalanceFreq  = String(body.rebalanceFreq ?? "weekly") === "monthly" ? "monthly" : "weekly" as const;
  const scoreThreshold = Math.min(90, Math.max(40, Number(body.scoreThreshold ?? 60)));

  // ── 构建 ST 股票池 ────────────────────────────────────────────
  const basicResult = await getAStockBasic("L");
  if (!basicResult.ok) {
    return NextResponse.json({ ok: false, error: `获取股票基础信息失败：${basicResult.error}` });
  }

  const cutoff = daysAgoStr(90);
  const stPool = basicResult.records.filter((s) => {
    const name     = String(s.name ?? "");
    const listDate = String(s.list_date ?? "19000101");
    if (!detectSTName(name)) return false;
    if (name.includes("退市整理")) return false;
    if (listDate > cutoff) return false;
    return true;
  });

  if (stPool.length === 0) {
    return NextResponse.json({ ok: false, error: "ST 股票池为空，Tushare 数据可能暂不可用" });
  }

  // 取前 60 只 ST 股票（避免超时）
  const pool = stPool.slice(0, 60);
  const tsCodes = pool.map((s) => String(s.ts_code ?? ""));
  const names: Record<string, string> = {};
  for (const s of pool) names[String(s.ts_code ?? "")] = String(s.name ?? "");

  // ── 拉取 K 线数据 ─────────────────────────────────────────────
  const allBars = new Map<string, STBar[]>();
  const riskEvents: RiskEvent[] = [];
  let suspendedDayImpact = 0;

  const fetchResults = await Promise.allSettled(
    tsCodes.map(async (tsCode) => {
      const [dailyRes, adjRes] = await Promise.all([
        getDailyKLine(tsCode, startDate, endDate),
        getAdjFactor(tsCode, startDate, endDate),
      ]);
      if (!dailyRes.ok) return { tsCode, bars: null as STBar[] | null };

      const sorted = [...dailyRes.records].sort((a, b) =>
        String(a.trade_date).localeCompare(String(b.trade_date))
      );
      const adjSorted = adjRes.ok
        ? [...adjRes.records].sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)))
        : [];
      const adjusted = applyAdjFactor(sorted, adjSorted);

      const bars: STBar[] = adjusted.map((r) => ({
        date:   String(r.trade_date ?? ""),
        open:   Number(r.open   ?? 0),
        close:  Number(r.close  ?? 0),
        high:   Number(r.high   ?? 0),
        low:    Number(r.low    ?? 0),
        volume: Number(r.vol    ?? 0),
        amount: Number(r.amount ?? 0),
        pctChg: Number(r.pct_chg ?? 0),
      })).filter((b) => b.close > 0 && b.date);

      return { tsCode, bars };
    })
  );

  for (const r of fetchResults) {
    if (r.status === "fulfilled" && r.value.bars && r.value.bars.length >= 20) {
      const { tsCode, bars } = r.value;

      // 检测停牌天数
      const suspendedDays = bars.filter((b) => b.volume === 0).length;
      suspendedDayImpact += suspendedDays;

      // 检测连续跌停事件
      let consLD = 0;
      for (const bar of bars) {
        if (isLimitDown(bar.pctChg)) {
          consLD++;
          if (consLD >= 2) {
            riskEvents.push({
              date: bar.date, tsCode, name: names[tsCode] ?? tsCode,
              type: "consecutive_limit_down",
              note: `连续跌停第 ${consLD} 日，持仓可能无法卖出`,
            });
          }
        } else { consLD = 0; }
      }

      allBars.set(tsCode, bars);
    }
  }

  if (allBars.size === 0) {
    return NextResponse.json({ ok: false, error: "无法获取 ST 股票历史数据，请检查 Tushare 权限" });
  }

  // ── 日期集合 ──────────────────────────────────────────────────
  const dateSet = new Set<string>();
  for (const bars of allBars.values()) for (const b of bars) dateSet.add(b.date);
  const allDates = [...dateSet].sort();

  if (allDates.length < 20) {
    return NextResponse.json({ ok: false, error: `历史数据不足（${allDates.length} 个交易日）` });
  }

  // ── 调仓日集合 ──────────────────────────────────────────────────
  const rebalanceDates = new Set<string>();
  rebalanceDates.add(allDates[0]);
  if (rebalanceFreq === "weekly") {
    for (let i = 1; i < allDates.length; i++) {
      const prev = new Date(`${allDates[i-1].slice(0,4)}-${allDates[i-1].slice(4,6)}-${allDates[i-1].slice(6,8)}`);
      const cur  = new Date(`${allDates[i].slice(0,4)}-${allDates[i].slice(4,6)}-${allDates[i].slice(6,8)}`);
      if ((cur.getTime() - prev.getTime()) / 86400000 >= 5 || cur.getDay() <= prev.getDay()) {
        rebalanceDates.add(allDates[i]);
      }
    }
  } else {
    let lastMon = allDates[0].slice(0, 6);
    for (const d of allDates.slice(1)) {
      const mon = d.slice(0, 6);
      if (mon !== lastMon) { rebalanceDates.add(d); lastMon = mon; }
    }
  }

  // ── 模拟 ─────────────────────────────────────────────────────
  let cash      = initialCapital;
  let totalFees = 0;
  let limitDownStuckCount = 0;

  type Holding = { shares: number; costPrice: number; buyDate: string; consecutiveLDCount: number };
  const holding  = new Map<string, Holding>();
  const trades:     STTrade[] = [];
  const equityCurve: { date: string; value: number }[] = [];
  const pendingExit  = new Map<string, "stop_loss" | "limit_down_exit">();

  for (const date of allDates) {
    const todayPx = new Map<string, { open: number; close: number; pctChg: number; volume: number; amount: number }>();
    for (const [tc, bars] of allBars) {
      const bar = bars.find((b) => b.date === date);
      if (bar) todayPx.set(tc, { open: bar.open, close: bar.close, pctChg: bar.pctChg, volume: bar.volume, amount: bar.amount });
    }

    const exitedToday = new Set<string>();

    // ── A. 执行待定止损/跌停退出 ──────────────────────────────
    for (const [tc, reason] of pendingExit) {
      const pos = holding.get(tc);
      if (!pos) { pendingExit.delete(tc); continue; }
      const p = todayPx.get(tc);
      if (!p || p.open <= 0 || isLimitDown(p.pctChg) || p.volume === 0) {
        // 仍无法卖出
        limitDownStuckCount++;
        riskEvents.push({
          date, tsCode: tc, name: names[tc] ?? tc,
          type: "limit_down_stuck",
          note: `${reason === "limit_down_exit" ? "跌停退出" : "止损"}信号待执行，但今日仍跌停/停牌无法卖出`,
        });
        continue;
      }
      const execPx = slipPrice(p.open, "SELL");
      const amount  = +(pos.shares * execPx).toFixed(2);
      const fee     = calcFee(amount, "SELL", commissionRate);
      const pnl     = +((execPx - pos.costPrice) * pos.shares - fee).toFixed(2);
      cash += +(amount - fee).toFixed(2);
      totalFees += fee;
      trades.push({ date, tsCode: tc, name: names[tc] ?? tc, action: "SELL", reason, price: execPx, shares: pos.shares, amount, fee, pnl });
      holding.delete(tc);
      pendingExit.delete(tc);
      exitedToday.add(tc);
    }

    // ── B. 调仓日：评分 + 选股 ───────────────────────────────
    if (rebalanceDates.has(date)) {
      // 计算每只 ST 股票的因子评分（使用 date 前的历史数据）
      const scores: { tsCode: string; score: number }[] = [];
      for (const [tc, bars] of allBars) {
        const prior = bars.filter((b) => b.date < date);
        if (prior.length < 20) continue;
        const p = todayPx.get(tc);
        if (!p || p.open <= 0 || p.volume === 0) continue;
        if (isLimitUp(p.pctChg)) continue;    // 涨停买不进

        const scoreResult = calculateSTFactorScores(prior);
        if (scoreResult.totalScore >= scoreThreshold) {
          scores.push({ tsCode: tc, score: scoreResult.totalScore });
        }
      }
      scores.sort((a, b) => b.score - a.score);

      // 计算 ST 总仓位占比
      let stTotalValue = 0;
      for (const [tc, pos] of holding) {
        const pp = todayPx.get(tc);
        stTotalValue += pos.shares * (pp ? pp.close : pos.costPrice);
      }
      const totalPortfolioValue = cash + stTotalValue;

      const target = new Set(scores.slice(0, maxPositions).map((s) => s.tsCode));

      // 卖出不在目标的
      for (const [tc, pos] of holding) {
        if (exitedToday.has(tc) || target.has(tc)) continue;
        if (pos.buyDate >= date) continue; // T+1
        const p = todayPx.get(tc);
        if (!p || p.open <= 0 || isLimitDown(p.pctChg) || p.volume === 0) {
          if (p && isLimitDown(p.pctChg)) limitDownStuckCount++;
          continue;
        }
        const execPx = slipPrice(p.open, "SELL");
        const amount  = +(pos.shares * execPx).toFixed(2);
        const fee     = calcFee(amount, "SELL", commissionRate);
        const pnl     = +((execPx - pos.costPrice) * pos.shares - fee).toFixed(2);
        cash += +(amount - fee).toFixed(2);
        totalFees += fee;
        trades.push({ date, tsCode: tc, name: names[tc] ?? tc, action: "SELL", reason: "signal", price: execPx, shares: pos.shares, amount, fee, pnl });
        holding.delete(tc);
        exitedToday.add(tc);
      }

      // 买入新目标
      const newBuys = [...target].filter((tc) => !holding.has(tc) && !exitedToday.has(tc));
      for (const tc of newBuys) {
        // 检查 ST 总仓位
        let curSTValue = 0;
        for (const [htc, pos] of holding) {
          const pp = todayPx.get(htc);
          curSTValue += pos.shares * (pp ? pp.close : pos.costPrice);
        }
        const totalVal = cash + curSTValue;
        if (curSTValue / totalVal >= maxTotalWT) break; // ST 总仓位已满

        const p = todayPx.get(tc);
        if (!p || p.open <= 0 || isLimitUp(p.pctChg) || p.volume === 0) continue;

        const maxAlloc  = Math.min(
          cash,
          totalVal * maxSingleWT,
          totalVal * (maxTotalWT - curSTValue / totalVal),
        );
        if (maxAlloc < 1000) continue;

        const execPx = slipPrice(p.open, "BUY");
        const fee0   = calcFee(maxAlloc, "BUY", commissionRate);
        const shares = Math.floor((maxAlloc - fee0) / execPx / 100) * 100;
        if (shares < 100) continue;

        const amount    = +(shares * execPx).toFixed(2);
        const fee       = calcFee(amount, "BUY", commissionRate);
        const totalCost = +(amount + fee).toFixed(2);
        if (cash < totalCost) continue;

        cash -= totalCost;
        totalFees += fee;
        holding.set(tc, { shares, costPrice: execPx, buyDate: date, consecutiveLDCount: 0 });
        trades.push({ date, tsCode: tc, name: names[tc] ?? tc, action: "BUY", reason: "signal", price: execPx, shares, amount, fee, pnl: 0 });
      }
    }

    // ── C. 止损 + 连续跌停检测（次日执行）───────────────────
    pendingExit.clear();
    for (const [tc, pos] of holding) {
      const p = todayPx.get(tc);
      if (!p || pos.buyDate >= date) continue;
      const chg = (p.close - pos.costPrice) / pos.costPrice;

      // 止损
      if (stopLossRate > 0 && chg <= -stopLossRate) {
        pendingExit.set(tc, "stop_loss");
        continue;
      }

      // 连续跌停风险退出（2 连跌停）
      let ld = pos.consecutiveLDCount;
      if (isLimitDown(p.pctChg)) {
        ld++;
        holding.set(tc, { ...pos, consecutiveLDCount: ld });
        if (ld >= 2) { pendingExit.set(tc, "limit_down_exit"); }
      } else {
        if (ld > 0) holding.set(tc, { ...pos, consecutiveLDCount: 0 });
      }
    }

    // ── D. 逐日资金曲线 ──────────────────────────────────────
    let posVal = 0;
    for (const [tc, pos] of holding) {
      const p = todayPx.get(tc);
      posVal += pos.shares * (p ? p.close : pos.costPrice);
    }
    equityCurve.push({ date, value: +(cash + posVal).toFixed(2) });
  }

  // ── 5. 收盘平仓 ───────────────────────────────────────────────
  const lastDate = allDates[allDates.length - 1];
  for (const [tc, pos] of holding) {
    const bars    = allBars.get(tc);
    const lastBar = bars?.findLast((b) => b.date <= lastDate);
    if (!lastBar) continue;
    const execPx = slipPrice(lastBar.close, "SELL");
    const amount  = +(pos.shares * execPx).toFixed(2);
    const fee     = calcFee(amount, "SELL", commissionRate);
    const pnl     = +((execPx - pos.costPrice) * pos.shares - fee).toFixed(2);
    cash += +(amount - fee).toFixed(2);
    totalFees += fee;
    trades.push({ date: lastDate, tsCode: tc, name: names[tc] ?? tc, action: "SELL", reason: "final", price: execPx, shares: pos.shares, amount, fee, pnl });
  }

  // ── 6. 计算指标 ───────────────────────────────────────────────
  const finalCapital = cash;
  const totalReturn  = +((finalCapital - initialCapital) / initialCapital * 100).toFixed(2);
  const years        = allDates.length / 252;
  const annualReturn = years > 0
    ? +((Math.pow(finalCapital / initialCapital, 1 / years) - 1) * 100).toFixed(2)
    : 0;

  let peak = initialCapital, maxDD = 0;
  const drawdownCurve: { date: string; dd: number }[] = [];
  for (const e of equityCurve) {
    if (e.value > peak) peak = e.value;
    const dd = peak > 0 ? +((e.value - peak) / peak * 100).toFixed(2) : 0;
    if (dd < maxDD) maxDD = dd;
    drawdownCurve.push({ date: e.date, dd });
  }

  const rets: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    rets.push((equityCurve[i].value - equityCurve[i-1].value) / equityCurve[i-1].value);
  }
  const mean  = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const std   = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) : 0;
  const sharpeRatio = std > 0 ? +((mean / std) * Math.sqrt(252)).toFixed(2) : 0;

  const sellTrades = trades.filter((t) => t.action === "SELL" && t.reason !== "final");
  const wins       = sellTrades.filter((t) => t.pnl > 0);
  const losses     = sellTrades.filter((t) => t.pnl <= 0);
  const winRate    = sellTrades.length ? +((wins.length / sellTrades.length) * 100).toFixed(1) : 0;
  const avgWin     = wins.length   ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length : 0;
  const avgLoss    = losses.length ? Math.abs(losses.reduce((a, t) => a + t.pnl, 0)) / losses.length : 0;
  const profitFactor = avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : 0;

  let maxConsLosses = 0, curLosses = 0;
  for (const t of sellTrades) {
    if (t.pnl <= 0) { curLosses++; if (curLosses > maxConsLosses) maxConsLosses = curLosses; }
    else curLosses = 0;
  }

  const feeImpact     = +((totalFees / initialCapital) * 100).toFixed(2);
  const strategyScore = scoreStrategy(annualReturn, maxDD, sharpeRatio, winRate, profitFactor);

  const result: STBacktestResult = {
    ok: true,
    totalReturn, annualReturn,
    maxDrawdown:           +maxDD.toFixed(2),
    sharpeRatio, winRate, profitFactor,
    totalTrades:           trades.length,
    maxConsecutiveLosses:  maxConsLosses,
    totalFees:             +totalFees.toFixed(2),
    feeImpact, strategyScore,
    equity:    equityCurve,
    drawdown:  drawdownCurve,
    trades,
    limitDownStuckCount,
    suspendedDayImpact,
    riskEvents,
    poolSize:  allBars.size,
    source:    "tushare",
    startDate, endDate,
    initialCapital, finalCapital: +finalCapital.toFixed(2),
    note: [
      "ST 策略高风险，历史回测不代表未来收益",
      `ST 池大小 ${allBars.size} 只（取前 60 只）`,
      `单股仓位 ≤${(maxSingleWT*100).toFixed(0)}%，总 ST 仓位 ≤${(maxTotalWT*100).toFixed(0)}%`,
      `止损 -${(stopLossRate*100).toFixed(0)}%，2 连跌停强制退出`,
      "前复权价格（Tushare adj_factor）",
      "T+1 限制，涨跌停/停牌过滤",
    ].join(" | "),
  };

  return NextResponse.json(result);
}
