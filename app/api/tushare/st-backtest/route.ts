/**
 * POST /api/tushare/st-backtest  v3
 *
 * A股 ST 风险反转策略历史回测（服务端，Tushare 真实历史数据）。
 *
 * ════════════════════════════════════════════════════════════════════
 * v3 修复项（针对"回测结果全部为 0"的根因）：
 *
 * 【关键 Bug #1】Tushare daily.amount 单位是「千元」不是「元」
 *   → 原代码直接存 amount，导致成交额检查阈值高出 1000 倍
 *   → 一只日均成交 3000万元的股票，存为 30000（千元），
 *     但检查 >= 30_000_000（元），永远失败 → 0 只可买股票
 *   → 修复：存储时 * 1000，统一换算为元（与 stFactorService 阈值一致）
 *
 * 【关键 Bug #2】ST 股票池 API 端点 /api/tushare/st-pool 缺失
 *   → 前端 useEffect 里的 fetch 直接返回 404
 *   → 修复：新建 app/api/tushare/st-pool/route.ts
 *
 * 【关键 Bug #3】isBuyable 在 stFactorService 里硬编码严格条件
 *   → 在 amount Bug 导致流动性得分为 0 的情况下，isBuyable 永远 false
 *   → 修复：route.ts 不再依赖 service.isBuyable，改用 mode 控制的条件
 *
 * 【新增】mode 参数：strict / standard / relaxed
 *   默认 standard（原来默认 strict 但没有声明），允许更多股票产生买入信号
 *
 * 【新增】diagnostics：返回每个过滤步骤的股票数量，便于前端诊断
 *
 * 【新增】status 字段：ok / no_trades / empty_pool / data_insufficient
 *   不再全部返回 0，明确告知用户是"无交易信号"还是"策略正常运行"
 *
 * ════════════════════════════════════════════════════════════════════
 *
 * Body (JSON):
 *   startDate        YYYYMMDD
 *   endDate          YYYYMMDD
 *   initialCapital   起始资金（默认 100000）
 *   mode             "strict" | "standard" | "relaxed"（默认 "standard"）
 *   maxPositions     最大持仓只数（默认 3）
 *   maxSingleWeight  单股最大仓位（默认 0.03 = 3%）
 *   maxTotalSTWeight ST 总仓位上限（默认 0.10 = 10%）
 *   stopLossRate     止损比例（默认 0.05）
 *   takeProfitRate   止盈比例（默认 0.20，0=不止盈）
 *   maxHoldDays      时间止损（默认 20日，0=不限）
 *   rebalanceFreq    "weekly" | "monthly"（默认 "weekly"）
 *   scoreThreshold   买入评分阈值（默认 60，standard 模式下）
 *   commissionRate   手续费（默认 0.0003）
 */
import { NextRequest, NextResponse }           from "next/server";
import {
  getAStockBasic, getDailyKLine, getAdjFactor,
  hasTushareToken, daysAgoStr, todayStr,
  applyAdjFactor,
} from "@/lib/tushareService";
import { calculateSTFactorScores } from "@/lib/stFactorService";
import type { STBar }              from "@/lib/stFactorService";

export const dynamic = "force-dynamic";

// ── 常量 ─────────────────────────────────────────────────────────
const MAX_POSITIONS   = 5;
const MAX_SINGLE_WT   = 0.05;
const LIMIT_THRESHOLD = 9.3;
const ST_POOL_SIZE    = 80;   // 候选池（v3：从 60 扩大到 80）

// ── 模式配置（v3 新增） ───────────────────────────────────────────
const MODE_CONFIG = {
  strict: {
    label:        "严格",
    minTotal:     70,
    minTrend:     65,
    minVolSurge:  55,
    minAmount:    30_000_000,   // 3000 万元/日
    noLimitDn:    true,         // 连续跌停 = 0
    noPriceLow:   true,         // 价格 >= 2 元
    defaultScore: 70,
  },
  standard: {
    label:        "标准",
    minTotal:     58,
    minTrend:     48,
    minVolSurge:  30,
    minAmount:    8_000_000,    // 800 万元/日
    noLimitDn:    true,
    noPriceLow:   true,
    defaultScore: 58,
  },
  relaxed: {
    label:        "宽松",
    minTotal:     45,
    minTrend:     30,
    minVolSurge:  0,            // 不强制量能突破
    minAmount:    2_000_000,    // 200 万元/日
    noLimitDn:    false,        // 允许有跌停记录
    noPriceLow:   false,        // 允许价格 < 2 元（极高风险）
    defaultScore: 45,
  },
} as const;
type BtMode = keyof typeof MODE_CONFIG;

// ── 类型 ─────────────────────────────────────────────────────────
type ExitReason =
  | "signal"
  | "stop_loss"
  | "take_profit"
  | "time_stop"
  | "limit_down_exit"
  | "score_drop"
  | "final";

interface STTrade {
  date:    string;
  tsCode:  string;
  name:    string;
  action:  "BUY" | "SELL";
  reason:  ExitReason;
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

interface STDiagnostics {
  totalMarket:      number;   // 全市场 A 股数量
  stNameCount:      number;   // ST 名称识别数量
  afterFilters:     number;   // 排除退市整理 + 新上市后
  poolCandidates:   number;   // 参与 K 线拉取的候选数
  withDataCount:    number;   // K 线数据充足（>= 20 日）的股票数
  mode:             string;
  scoreThreshold:   number;
  rebalanceDays:    number;
  buySignalCount:   number;   // 满足模式条件的买入信号累计次数（跨所有调仓日）
  actualBuyCount:   number;   // 实际成交的买入次数
  filterStats: {
    insufficientBars: number; // K线不足 20 日
    limitUp:          number; // 涨停（无法买入）
    suspended:        number; // 停牌
    lowScore:         number; // 评分或模式条件不满足
    capitalLimited:   number; // 资金不足或仓位限制
  };
}

type BacktestStatus = "ok" | "no_trades" | "empty_pool" | "data_insufficient";

interface STBacktestResult {
  ok:                    true;
  status:                BacktestStatus;
  statusMessage?:        string;
  statusReason?:         string;
  diagnostics:           STDiagnostics;
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
  // ST 专项
  limitDownStuckCount:   number;
  suspendedDayImpact:    number;
  riskEvents:            RiskEvent[];
  poolSize:              number;
  takeProfitCount:       number;
  timeStopCount:         number;
  stopLossCount:         number;
  // 元信息
  source:         "tushare";
  note:           string;
  startDate:      string;
  endDate:        string;
  initialCapital: number;
  finalCapital:   number;
}

interface STBacktestError {
  ok:                false;
  error:             string;
  tokenMissing?:     boolean;
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

// ST 名称识别（兼容全角字符，与 st-pool/route.ts 保持一致）
function detectSTName(name: string): boolean {
  if (!name) return false;
  const n = name
    .trim()
    .replace(/ＳＴ/g, "ST").replace(/＊ＳＴ/g, "*ST")
    .replace(/Ｓ/g, "S").replace(/Ｔ/g, "T").replace(/＊/g, "*");
  return /^(\*|S\*|SS)?ST/i.test(n);
}

// 模式条件判断（v3：不再使用 stFactorService.isBuyable，改用 mode 独立判断）
function isModeQualified(
  score: ReturnType<typeof calculateSTFactorScores>,
  mc:    typeof MODE_CONFIG[BtMode],
): boolean {
  if (score.isSuspended) return false;
  if (mc.noLimitDn  && score.consecutiveLimitDnCount > 0) return false;
  if (mc.noPriceLow && score.priceTooLow)                return false;
  if (score.totalScore     < mc.minTotal)    return false;
  if (score.trendScore     < mc.minTrend)    return false;
  if (mc.minVolSurge > 0 && score.volumeSurgeScore < mc.minVolSurge) return false;
  if (score.avgAmount20d   < mc.minAmount)   return false;
  return true;
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
export async function POST(req: NextRequest): Promise<NextResponse<STBacktestResult | STBacktestError>> {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "Tushare Token 未配置，无法运行 ST 策略回测", tokenMissing: true },
      { status: 200 },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* defaults */ }

  // ── 参数解析 ─────────────────────────────────────────────────
  const startDate      = String(body.startDate  ?? daysAgoStr(365));
  const endDate        = String(body.endDate    ?? todayStr());
  const initialCapital = Math.max(10000, Number(body.initialCapital  ?? 100_000));
  const commissionRate = Math.min(0.01,  Math.max(0.0001, Number(body.commissionRate ?? 0.0003)));
  const maxPositions   = Math.min(MAX_POSITIONS, Math.max(1, Number(body.maxPositions   ?? 3)));
  const maxSingleWT    = Math.min(MAX_SINGLE_WT, Math.max(0.01, Number(body.maxSingleWeight ?? 0.03)));
  const maxTotalWT     = Math.min(0.30, Math.max(0.05, Number(body.maxTotalSTWeight ?? 0.10)));
  const stopLossRate   = Math.min(0.20, Math.max(0, Number(body.stopLossRate    ?? 0.05)));
  const takeProfitRate = Math.min(0.50, Math.max(0, Number(body.takeProfitRate  ?? 0.20)));
  const maxHoldDays    = Math.min(60,   Math.max(0, Number(body.maxHoldDays     ?? 20)));
  const rebalanceFreq  = String(body.rebalanceFreq ?? "weekly") === "monthly" ? "monthly" : "weekly" as const;

  // v3 新增：mode 参数（默认 standard）
  const rawMode = String(body.mode ?? "standard");
  const mode: BtMode = (["strict", "standard", "relaxed"].includes(rawMode)
    ? rawMode : "standard") as BtMode;
  const mc = MODE_CONFIG[mode];

  // scoreThreshold：优先使用请求传来的值，否则用 mode 的默认值
  const scoreThreshold = Math.min(90, Math.max(40,
    Number(body.scoreThreshold ?? mc.defaultScore)
  ));

  // ── 构建 ST 股票池 ─────────────────────────────────────────────
  const basicResult = await getAStockBasic("L");
  if (!basicResult.ok) {
    return NextResponse.json({ ok: false, error: `获取股票基础信息失败：${basicResult.error}` });
  }

  const totalMarket = basicResult.records.length;

  const d90 = new Date(); d90.setDate(d90.getDate() - 90);
  const cutoff90 = d90.toISOString().slice(0, 10).replace(/-/g, "");

  // Step 1: ST 名称过滤
  const stByName = basicResult.records.filter((s) =>
    detectSTName(String(s.name ?? ""))
  );
  // Step 2: 排除退市整理
  const stNoDelisting = stByName.filter((s) => !String(s.name ?? "").includes("退"));
  // Step 3: 排除新上市
  const stFiltered = stNoDelisting.filter((s) =>
    String(s.list_date ?? "19000101") <= cutoff90
  );

  const diagAfterFilters = stFiltered.length;

  if (stFiltered.length === 0) {
    // 返回 ok: true + status empty_pool，让前端显示友好提示
    const emptyDiag: STDiagnostics = {
      totalMarket, stNameCount: stByName.length,
      afterFilters: 0, poolCandidates: 0, withDataCount: 0,
      mode, scoreThreshold, rebalanceDays: 0,
      buySignalCount: 0, actualBuyCount: 0,
      filterStats: { insufficientBars: 0, limitUp: 0, suspended: 0, lowScore: 0, capitalLimited: 0 },
    };
    return NextResponse.json({
      ok: true, status: "empty_pool",
      statusMessage: "ST 股票池为空，无法运行回测",
      statusReason: `从 ${totalMarket} 只 A 股中未识别到有效 ST 股票（识别到 ${stByName.length} 只，但全部被过滤）`,
      diagnostics: emptyDiag,
      totalReturn: 0, annualReturn: 0, maxDrawdown: 0, sharpeRatio: 0,
      winRate: 0, profitFactor: 0, totalTrades: 0, maxConsecutiveLosses: 0,
      totalFees: 0, feeImpact: 0, strategyScore: 0,
      equity: [], drawdown: [], trades: [],
      limitDownStuckCount: 0, suspendedDayImpact: 0, riskEvents: [], poolSize: 0,
      takeProfitCount: 0, timeStopCount: 0, stopLossCount: 0,
      source: "tushare", note: "ST 股票池为空", startDate, endDate,
      initialCapital, finalCapital: initialCapital,
    });
  }

  // 取候选池（ST_POOL_SIZE 只），超出部分回测时被评分自然淘汰
  const pool     = stFiltered.slice(0, ST_POOL_SIZE);
  const tsCodes  = pool.map((s) => String(s.ts_code ?? ""));
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
        ? [...adjRes.records].sort((a, b) =>
            String(a.trade_date).localeCompare(String(b.trade_date))
          )
        : [];
      const adjusted = applyAdjFactor(sorted, adjSorted);

      const bars: STBar[] = adjusted.map((r) => ({
        date:   String(r.trade_date ?? ""),
        open:   Number(r.open    ?? 0),
        close:  Number(r.close   ?? 0),
        high:   Number(r.high    ?? 0),
        low:    Number(r.low     ?? 0),
        volume: Number(r.vol     ?? 0),
        // ⚠️ v3 关键修复：Tushare daily.amount 单位是「千元」，统一转换为「元」
        // 原代码直接存 amount（千元），导致成交额阈值高出 1000 倍，永远不可买入
        amount: Number(r.amount  ?? 0) * 1000,
        pctChg: Number(r.pct_chg ?? 0),
      })).filter((b) => b.close > 0 && b.date);

      return { tsCode, bars };
    })
  );

  let diagInsufficientBarsTotal = 0;
  for (const r of fetchResults) {
    if (r.status === "fulfilled" && r.value.bars) {
      const { tsCode, bars } = r.value;
      if (bars.length < 20) { diagInsufficientBarsTotal++; continue; }

      const suspendedDays = bars.filter((b) => b.volume === 0).length;
      suspendedDayImpact += suspendedDays;

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

  const withDataCount = allBars.size;

  if (allBars.size === 0) {
    return NextResponse.json({ ok: false, error: "无法获取 ST 股票历史 K 线数据，请检查 Tushare 权限" });
  }

  // ── 日期集合 ──────────────────────────────────────────────────
  const dateSet = new Set<string>();
  for (const bars of allBars.values()) for (const b of bars) dateSet.add(b.date);
  const allDates = [...dateSet].sort();
  const dateToIdx = new Map<string, number>(allDates.map((d, i) => [d, i]));

  if (allDates.length < 20) {
    return NextResponse.json({
      ok: false,
      error: `历史数据不足（仅 ${allDates.length} 个交易日，需至少 20 日）`,
    });
  }

  // ── 调仓日集合 ────────────────────────────────────────────────
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

  const totalRebalanceDays = rebalanceDates.size;

  // ── 诊断计数器 ────────────────────────────────────────────────
  let diagBuySignalCount = 0;
  let diagActualBuyCount = 0;
  let diagLimitUpCount   = 0;
  let diagSuspendedCount = 0;
  let diagLowScoreCount  = 0;
  let diagCapLimited     = 0;

  // ── 模拟主循环 ────────────────────────────────────────────────
  let cash      = initialCapital;
  let totalFees = 0;
  let limitDownStuckCount = 0;
  let takeProfitCount     = 0;
  let timeStopCount       = 0;
  let stopLossCount       = 0;

  type Holding = {
    shares:             number;
    costPrice:          number;
    buyDate:            string;
    buyDateIdx:         number;
    consecutiveLDCount: number;
  };

  const holding    = new Map<string, Holding>();
  const trades:    STTrade[] = [];
  const equityCurve: { date: string; value: number }[] = [];
  const pendingExit = new Map<string, ExitReason>();

  for (const date of allDates) {
    const curIdx = dateToIdx.get(date)!;

    // 今日行情快照
    const todayPx = new Map<string, {
      open: number; close: number; pctChg: number; volume: number; amount: number;
    }>();
    for (const [tc, bars] of allBars) {
      const bar = bars.find((b) => b.date === date);
      if (bar) todayPx.set(tc, { open: bar.open, close: bar.close, pctChg: bar.pctChg, volume: bar.volume, amount: bar.amount });
    }

    const exitedToday = new Set<string>();

    // ── A. 执行待定止损/止盈/跌停退出 ─────────────────────────
    for (const [tc, reason] of pendingExit) {
      const pos = holding.get(tc);
      if (!pos) { pendingExit.delete(tc); continue; }
      const p = todayPx.get(tc);

      if (!p || p.open <= 0 || isLimitDown(p.pctChg) || p.volume === 0) {
        limitDownStuckCount++;
        riskEvents.push({
          date, tsCode: tc, name: names[tc] ?? tc,
          type: "limit_down_stuck",
          note: `${reason} 待执行，但今日仍跌停/停牌无法卖出`,
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

    // ── B. 调仓日：评分 + 选股 ──────────────────────────────
    if (rebalanceDates.has(date)) {
      const scores: { tsCode: string; score: number }[] = [];

      for (const [tc, bars] of allBars) {
        const prior = bars.filter((b) => b.date < date);
        if (prior.length < 20) { diagInsufficientBarsTotal++; continue; }

        const p = todayPx.get(tc);
        if (!p) continue;
        if (p.volume === 0) { diagSuspendedCount++; continue; }
        if (p.open <= 0)    continue;
        if (isLimitUp(p.pctChg)) { diagLimitUpCount++; continue; }

        const scoreResult = calculateSTFactorScores(prior);

        // v3 核心修复：用 mode 条件代替 stFactorService.isBuyable 的硬编码严格条件
        if (isModeQualified(scoreResult, mc) && scoreResult.totalScore >= scoreThreshold) {
          scores.push({ tsCode: tc, score: scoreResult.totalScore });
          diagBuySignalCount++;
        } else {
          diagLowScoreCount++;
        }
      }
      scores.sort((a, b) => b.score - a.score);

      const target = new Set(scores.slice(0, maxPositions).map((s) => s.tsCode));

      // 卖出不在目标的持仓（T+1：buyDate 必须 < date）
      for (const [tc, pos] of holding) {
        if (exitedToday.has(tc) || target.has(tc)) continue;
        if (pos.buyDate >= date) continue;
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
        let curSTValue = 0;
        for (const [htc, pos] of holding) {
          const pp = todayPx.get(htc);
          curSTValue += pos.shares * (pp ? pp.close : pos.costPrice);
        }
        const totalVal = cash + curSTValue;
        if (curSTValue / totalVal >= maxTotalWT) { diagCapLimited++; break; }

        const p = todayPx.get(tc);
        if (!p || p.open <= 0 || isLimitUp(p.pctChg) || p.volume === 0) continue;

        const maxAlloc = Math.min(
          cash,
          totalVal * maxSingleWT,
          totalVal * (maxTotalWT - curSTValue / totalVal),
        );
        if (maxAlloc < 1000) { diagCapLimited++; continue; }

        const execPx = slipPrice(p.open, "BUY");
        const fee0   = calcFee(maxAlloc, "BUY", commissionRate);
        const shares = Math.floor((maxAlloc - fee0) / execPx / 100) * 100;
        if (shares < 100) { diagCapLimited++; continue; }

        const amount    = +(shares * execPx).toFixed(2);
        const fee       = calcFee(amount, "BUY", commissionRate);
        const totalCost = +(amount + fee).toFixed(2);
        if (cash < totalCost) { diagCapLimited++; continue; }

        cash -= totalCost;
        totalFees += fee;
        diagActualBuyCount++;
        holding.set(tc, {
          shares, costPrice: execPx, buyDate: date,
          buyDateIdx: curIdx,
          consecutiveLDCount: 0,
        });
        trades.push({ date, tsCode: tc, name: names[tc] ?? tc, action: "BUY", reason: "signal", price: execPx, shares, amount, fee, pnl: 0 });
      }
    }

    // ── C. 止盈 / 止损 / 时间止损 / 连续跌停 ─────────────────
    for (const [tc, pos] of holding) {
      const p = todayPx.get(tc);
      if (!p || pos.buyDate >= date) continue;
      if (pendingExit.has(tc)) continue;

      const chg = (p.close - pos.costPrice) / pos.costPrice;

      if (takeProfitRate > 0 && chg >= takeProfitRate) {
        pendingExit.set(tc, "take_profit"); takeProfitCount++; continue;
      }
      if (stopLossRate > 0 && chg <= -stopLossRate) {
        pendingExit.set(tc, "stop_loss"); stopLossCount++; continue;
      }
      if (maxHoldDays > 0 && (curIdx - pos.buyDateIdx) >= maxHoldDays) {
        pendingExit.set(tc, "time_stop"); timeStopCount++; continue;
      }

      let ld = pos.consecutiveLDCount;
      if (isLimitDown(p.pctChg)) {
        ld++;
        holding.set(tc, { ...pos, consecutiveLDCount: ld });
        if (ld >= 2) { pendingExit.set(tc, "limit_down_exit"); }
      } else {
        if (ld > 0) holding.set(tc, { ...pos, consecutiveLDCount: 0 });
      }
    }

    // ── D. 逐日资金曲线 ───────────────────────────────────────
    let posVal = 0;
    for (const [tc, pos] of holding) {
      const p = todayPx.get(tc);
      posVal += pos.shares * (p ? p.close : pos.costPrice);
    }
    equityCurve.push({ date, value: +(cash + posVal).toFixed(2) });
  }

  // ── 收盘强制平仓 ──────────────────────────────────────────────
  const lastDate = allDates[allDates.length - 1];
  for (const [tc, pos] of holding) {
    const bars    = allBars.get(tc);
    const lastBar = bars?.findLast?.((b: STBar) => b.date <= lastDate)
                  ?? bars?.slice().reverse().find((b: STBar) => b.date <= lastDate);
    if (!lastBar) continue;
    const execPx = slipPrice(lastBar.close, "SELL");
    const amount  = +(pos.shares * execPx).toFixed(2);
    const fee     = calcFee(amount, "SELL", commissionRate);
    const pnl     = +((execPx - pos.costPrice) * pos.shares - fee).toFixed(2);
    cash += +(amount - fee).toFixed(2);
    totalFees += fee;
    trades.push({ date: lastDate, tsCode: tc, name: names[tc] ?? tc, action: "SELL", reason: "final", price: execPx, shares: pos.shares, amount, fee, pnl });
  }

  // ── 计算指标 ──────────────────────────────────────────────────
  const finalCapital = cash;
  const totalReturn  = +((finalCapital - initialCapital) / initialCapital * 100).toFixed(2);
  const years        = allDates.length / 252;
  const annualReturn = years > 0
    ? +((Math.pow(Math.max(0.001, finalCapital / initialCapital), 1 / years) - 1) * 100).toFixed(2)
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
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const std  = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) : 0;
  const sharpeRatio = std > 0 ? +((mean / std) * Math.sqrt(252)).toFixed(2) : 0;

  const sellTrades = trades.filter((t) => t.action === "SELL" && t.reason !== "final");
  const wins       = sellTrades.filter((t) => t.pnl > 0);
  const losses     = sellTrades.filter((t) => t.pnl <= 0);
  const winRate    = sellTrades.length ? +((wins.length / sellTrades.length) * 100).toFixed(1) : 0;
  const avgWin     = wins.length   ? wins.reduce((a, t) => a + t.pnl, 0)        / wins.length   : 0;
  const avgLoss    = losses.length ? Math.abs(losses.reduce((a, t) => a + t.pnl, 0)) / losses.length : 0;
  const profitFactor = avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : 0;

  let maxConsLosses = 0, curLosses = 0;
  for (const t of sellTrades) {
    if (t.pnl <= 0) { curLosses++; if (curLosses > maxConsLosses) maxConsLosses = curLosses; }
    else curLosses = 0;
  }

  const feeImpact     = +((totalFees / initialCapital) * 100).toFixed(2);
  const strategyScore = scoreStrategy(annualReturn, maxDD, sharpeRatio, winRate, profitFactor);

  // ── 诊断汇总 ──────────────────────────────────────────────────
  const hasBuyTrades = trades.some((t) => t.action === "BUY");
  const status: BacktestStatus = hasBuyTrades ? "ok" : "no_trades";

  let statusMessage: string | undefined;
  let statusReason: string | undefined;
  if (status === "no_trades") {
    statusMessage = `本次回测无交易信号（${mc.label}模式，评分阈值 ${scoreThreshold}）`;
    if (diagBuySignalCount === 0) {
      statusReason =
        `在 ${withDataCount} 只有K线数据的ST股票中，没有任何一只同时满足：` +
        `综合评分≥${scoreThreshold}、趋势评分≥${mc.minTrend}、` +
        `成交额≥${(mc.minAmount/1e4).toFixed(0)}万元/日。` +
        `建议尝试"宽松"模式或降低评分阈值。`;
    } else {
      statusReason =
        `共产生 ${diagBuySignalCount} 个买入信号，但因资金限制（仓位≤${(maxTotalWT*100).toFixed(0)}%）或 T+1 规则未能成交。` +
        `可适当提高初始资金或放宽仓位限制。`;
    }
  }

  const diagnostics: STDiagnostics = {
    totalMarket,
    stNameCount:    stByName.length,
    afterFilters:   diagAfterFilters,
    poolCandidates: pool.length,
    withDataCount,
    mode,
    scoreThreshold,
    rebalanceDays:  totalRebalanceDays,
    buySignalCount: diagBuySignalCount,
    actualBuyCount: diagActualBuyCount,
    filterStats: {
      insufficientBars: diagInsufficientBarsTotal,
      limitUp:          diagLimitUpCount,
      suspended:        diagSuspendedCount,
      lowScore:         diagLowScoreCount,
      capitalLimited:   diagCapLimited,
    },
  };

  const result: STBacktestResult = {
    ok: true,
    status,
    statusMessage,
    statusReason,
    diagnostics,
    totalReturn, annualReturn,
    maxDrawdown:           +maxDD.toFixed(2),
    sharpeRatio, winRate, profitFactor,
    totalTrades:           trades.length,
    maxConsecutiveLosses:  maxConsLosses,
    totalFees:             +totalFees.toFixed(2),
    feeImpact, strategyScore,
    equity:   equityCurve,
    drawdown: drawdownCurve,
    trades,
    limitDownStuckCount,
    suspendedDayImpact,
    riskEvents,
    poolSize: allBars.size,
    takeProfitCount,
    timeStopCount,
    stopLossCount,
    source:    "tushare",
    startDate, endDate,
    initialCapital, finalCapital: +finalCapital.toFixed(2),
    note: [
      `v3 | ${mc.label}模式 | 评分≥${scoreThreshold} | 趋势≥${mc.minTrend} | 成交额≥${(mc.minAmount/1e4).toFixed(0)}万/日`,
      `ST池 ${withDataCount}只（从 ${totalMarket} 只A股中识别 ${stByName.length} 只，过滤后 ${diagAfterFilters} 只，拉取K线 ${pool.length} 只）`,
      `单股≤${(maxSingleWT*100).toFixed(0)}% | ST总仓≤${(maxTotalWT*100).toFixed(0)}%`,
      `止损-${(stopLossRate*100).toFixed(0)}% | 止盈+${(takeProfitRate*100).toFixed(0)}% | 时间止损${maxHoldDays}日`,
      "前复权价格（Tushare adj_factor）| T+1 限制 | amount 已修正单位：千元→元",
    ].join(" | "),
  };

  return NextResponse.json(result);
}
