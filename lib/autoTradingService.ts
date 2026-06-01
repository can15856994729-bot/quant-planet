/**
 * autoTradingService.ts — Client-side auto-trading service for simulated account.
 *
 * All localStorage access is SSR-safe.
 * No real money, no real broker API calls — simulation only.
 */

import { useSimStore } from "./simStore";

// ── Storage keys ────────────────────────────────────────────────────
const KEY_CONFIG    = "quantplanet_auto_trading_config_v1";
const KEY_ORDERS    = "quantplanet_auto_trading_orders_v1";
const KEY_LOGS      = "quantplanet_auto_trading_logs_v1";
const KEY_BUY_DATES = "quantplanet_auto_trading_buy_dates_v1";

// ── Types ────────────────────────────────────────────────────────────
export interface AutoTradingConfig {
  enabled:                 boolean;
  strategyId:              "a-share-multi-factor" | "a-share-st-reversal";
  strategyName:            string;
  accountId:               string;
  maxTotalPosition:        number;   // 0-1, default 0.8
  maxSinglePosition:       number;   // 0-1, default 0.08
  maxDailyBuyCount:        number;   // default 3
  maxDailySellCount:       number;   // default 10
  minCashReserve:          number;   // 0-1, default 0.1
  enableStopLoss:          boolean;
  stopLossPercent:         number;   // 0-1, default 0.08
  enableTakeProfit:        boolean;
  takeProfitPercent:       number;   // 0-1, default 0.20
  enableTPlusOne:          boolean;
  enableLimitUpDownCheck:  boolean;
  enableSTRestriction:     boolean;
  allowSTTrading:          boolean;  // default false
  autoExecute:             boolean;
  requireConfirmForHighRisk: boolean;
  hasConfirmedFirstRun:    boolean;
  hasConfirmedST:          boolean;
  createdAt:               string;
  updatedAt:               string;
}

export interface AutoOrder {
  orderId:        string;
  source:         "auto_trading";
  strategyId:     string;
  strategyName:   string;
  symbol:         string;
  tsCode:         string;
  name:           string;
  action:         "buy" | "sell" | "reduce";
  price:          number;
  quantity:       number;
  amount:         number;
  fee:            number;
  stampTax:       number;
  slippage:       number;
  status:         "pending" | "executed" | "rejected" | "failed" | "skipped" | "cancelled";
  reason:         string;
  rejectReason?:  string;
  signalScore?:   number;
  signalStrength?: string;
  createdAt:      string;
  executedAt?:    string;
}

export interface AutoTradingLog {
  id:          string;
  time:        string;      // ISO
  level:       "info" | "warning" | "error";
  strategyId:  string;
  symbol?:     string;
  stockName?:  string;
  action?:     string;
  message:     string;
  detail?:     string;
}

export interface DayStats {
  date:           string;
  ran:            boolean;
  signalCount:    number;
  orderCount:     number;
  executedCount:  number;
  rejectedCount:  number;
}

// ── Defaults ─────────────────────────────────────────────────────────
function defaultConfig(): AutoTradingConfig {
  const now = new Date().toISOString();
  return {
    enabled:                 false,
    strategyId:              "a-share-multi-factor",
    strategyName:            "A股稳健多因子轮动",
    accountId:               "sim-default",
    maxTotalPosition:        0.80,
    maxSinglePosition:       0.08,
    maxDailyBuyCount:        3,
    maxDailySellCount:       10,
    minCashReserve:          0.10,
    enableStopLoss:          true,
    stopLossPercent:         0.08,
    enableTakeProfit:        true,
    takeProfitPercent:       0.20,
    enableTPlusOne:          true,
    enableLimitUpDownCheck:  true,
    enableSTRestriction:     true,
    allowSTTrading:          false,
    autoExecute:             true,
    requireConfirmForHighRisk: true,
    hasConfirmedFirstRun:    false,
    hasConfirmedST:          false,
    createdAt:               now,
    updatedAt:               now,
  };
}

// ── SSR guard ─────────────────────────────────────────────────────────
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

// ── Config CRUD ───────────────────────────────────────────────────────
export function getAutoTradingConfig(): AutoTradingConfig {
  if (!isBrowser()) return defaultConfig();
  try {
    const raw = localStorage.getItem(KEY_CONFIG);
    if (!raw) return defaultConfig();
    return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {
    return defaultConfig();
  }
}

export function saveAutoTradingConfig(patch: Partial<AutoTradingConfig>): AutoTradingConfig {
  const current = getAutoTradingConfig();
  const next: AutoTradingConfig = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (isBrowser()) {
    try { localStorage.setItem(KEY_CONFIG, JSON.stringify(next)); } catch { /* quota */ }
  }
  return next;
}

// ── Orders CRUD ───────────────────────────────────────────────────────
export function getAutoTradingOrders(): AutoOrder[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY_ORDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAutoTradingOrders(orders: AutoOrder[]): void {
  if (!isBrowser()) return;
  try {
    // Keep at most 200 orders
    const trimmed = orders.slice(0, 200);
    localStorage.setItem(KEY_ORDERS, JSON.stringify(trimmed));
  } catch { /* quota */ }
}

// ── Logs CRUD ─────────────────────────────────────────────────────────
export function getAutoTradingLogs(): AutoTradingLog[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY_LOGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addAutoTradingLog(log: Omit<AutoTradingLog, "id" | "time">): void {
  if (!isBrowser()) return;
  const newLog: AutoTradingLog = {
    ...log,
    id:   `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toISOString(),
  };
  const existing = getAutoTradingLogs();
  const next = [newLog, ...existing].slice(0, 500); // keep 500 max
  try { localStorage.setItem(KEY_LOGS, JSON.stringify(next)); } catch { /* quota */ }
}

export function clearAutoTradingLogs(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY_LOGS);
}

// ── Day Stats ─────────────────────────────────────────────────────────
const DAY_STATS_KEY = "quantplanet_auto_trading_day_stats_v1";

export function getTodayStats(): DayStats {
  const today = new Date().toDateString();
  if (!isBrowser()) return { date: today, ran: false, signalCount: 0, orderCount: 0, executedCount: 0, rejectedCount: 0 };
  try {
    const raw = localStorage.getItem(DAY_STATS_KEY);
    if (!raw) return { date: today, ran: false, signalCount: 0, orderCount: 0, executedCount: 0, rejectedCount: 0 };
    const parsed: DayStats = JSON.parse(raw);
    if (parsed.date !== today) {
      // New day - reset
      return { date: today, ran: false, signalCount: 0, orderCount: 0, executedCount: 0, rejectedCount: 0 };
    }
    return parsed;
  } catch {
    return { date: today, ran: false, signalCount: 0, orderCount: 0, executedCount: 0, rejectedCount: 0 };
  }
}

function saveDayStats(stats: DayStats): void {
  if (!isBrowser()) return;
  try { localStorage.setItem(DAY_STATS_KEY, JSON.stringify(stats)); } catch { /* quota */ }
}

// ── Buy Dates (T+1 tracking) ──────────────────────────────────────────
export function getBuyDates(): Record<string, string> {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(KEY_BUY_DATES);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordBuyDate(symbol: string): void {
  if (!isBrowser()) return;
  const dates = getBuyDates();
  dates[symbol] = new Date().toISOString();
  try { localStorage.setItem(KEY_BUY_DATES, JSON.stringify(dates)); } catch { /* quota */ }
}

export function clearOldBuyDates(): void {
  if (!isBrowser()) return;
  const dates = getBuyDates();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const filtered: Record<string, string> = {};
  for (const [sym, iso] of Object.entries(dates)) {
    if (new Date(iso) > yesterday) {
      filtered[sym] = iso;
    }
  }
  try { localStorage.setItem(KEY_BUY_DATES, JSON.stringify(filtered)); } catch { /* quota */ }
}

// ── 盘口数据结构（精简版，与 OrderBookData 兼容）──────────────────
interface OrderBookSnapshot {
  price:              number;
  bid1Price:          number | null;
  ask1Price:          number | null;
  bid1Volume:         number | null;
  ask1Volume:         number | null;
  isLimitUp:          boolean;
  isLimitDown:        boolean;
  isOneWordLimitUp:   boolean;
  isOneWordLimitDown: boolean;
  isSuspended:        boolean;
  limitUpSealAmount:  number | null;
  limitDownSealAmount:number | null;
  commissionRatio:    number | null;
  volumeRatio:        number | null;
}

/**
 * 通过 App 自己的 API Route 获取盘口数据，避免前端直接请求东方财富。
 * 已接入 /api/quotes/order-book/[symbol]（由 eastMoneyOrderBookService 提供）。
 */
async function getClientSideQuote(
  symbol: string
): Promise<OrderBookSnapshot | null> {
  try {
    const res  = await fetch(`/api/quotes/order-book/${symbol}`, {
      signal: AbortSignal.timeout(6_000),
    });
    const json = await res.json();
    if (!json.ok || !json.data) return null;
    const d = json.data;
    return {
      price:               d.price ?? 0,
      bid1Price:           d.bid1Price ?? null,
      ask1Price:           d.ask1Price ?? null,
      bid1Volume:          d.bid1Volume ?? null,
      ask1Volume:          d.ask1Volume ?? null,
      isLimitUp:           d.isLimitUp ?? false,
      isLimitDown:         d.isLimitDown ?? false,
      isOneWordLimitUp:    d.isOneWordLimitUp ?? false,
      isOneWordLimitDown:  d.isOneWordLimitDown ?? false,
      isSuspended:         d.isSuspended ?? false,
      limitUpSealAmount:   d.limitUpSealAmount ?? null,
      limitDownSealAmount: d.limitDownSealAmount ?? null,
      commissionRatio:     d.commissionRatio ?? null,
      volumeRatio:         d.volumeRatio ?? null,
    };
  } catch {
    return null;
  }
}

// ── Risk validation ───────────────────────────────────────────────────
export function validateAutoOrder(
  order: Partial<AutoOrder>,
  portfolio: {
    cash: number;
    totalValue: number;
    positions: Array<{ symbol: string; shares: number; costPrice: number; marketValue: number }>;
  },
  config: AutoTradingConfig,
  todayBuyCount: number,
  quote?: OrderBookSnapshot | { price: number; isLimitUp?: boolean; isLimitDown?: boolean; isSuspended?: boolean } | null
): { valid: boolean; reason: string } {
  const { cash, totalValue, positions } = portfolio;
  const isBuy = order.action === "buy";
  const isSell = order.action === "sell" || order.action === "reduce";

  if (isBuy) {
    // 1. ST restriction check
    const name = order.name ?? "";
    const isSTStock = name.startsWith("ST") || name.startsWith("*ST") || name.includes("ST ");
    if (config.enableSTRestriction && !config.allowSTTrading && isSTStock) {
      return { valid: false, reason: "ST股票自动买入已禁用" };
    }

    // 2. Price availability
    if (!quote || quote.price <= 0) {
      return { valid: false, reason: "实时行情不可用，无法自动买入" };
    }

    // 3. Suspended
    if (quote.isSuspended) {
      return { valid: false, reason: "股票停牌" };
    }

    // 4. Limit up / one-word limit up
    const ob = quote as OrderBookSnapshot;
    if (config.enableLimitUpDownCheck) {
      if (ob.isOneWordLimitUp) return { valid: false, reason: "一字涨停，无法买入" };
      if (quote.isLimitUp)     return { valid: false, reason: "涨停，无法买入" };
    }
    // 封单过大警告（不阻止，仅记录）
    if (ob.limitUpSealAmount != null && ob.limitUpSealAmount > 1e9) {
      // 超过10亿封单，追高风险极大 → 阻止
      if (config.enableLimitUpDownCheck) {
        return { valid: false, reason: `涨停封单超过${(ob.limitUpSealAmount/1e8).toFixed(0)}亿，追高风险极大` };
      }
    }
    // 卖一量过少（流动性差）
    if (ob.ask1Volume != null && ob.ask1Volume < 10000 && ob.ask1Price != null) {
      // 买入侧：卖一量极少（不足100手）→ 降低可买数量提示（不阻止）
      // 只在非涨停时才有意义
    }

    // 5. Daily buy count limit
    if (todayBuyCount >= config.maxDailyBuyCount) {
      return { valid: false, reason: "今日买入数量已达上限" };
    }

    // 6. Total position ratio
    const stockValue = totalValue - cash;
    const totalPositionRatio = totalValue > 0 ? stockValue / totalValue : 0;
    if (totalPositionRatio >= config.maxTotalPosition) {
      return { valid: false, reason: "总仓位超过上限" };
    }

    // 7. Single position ratio
    const symbolPos = positions.find(p => p.symbol === order.symbol);
    const existingMV = symbolPos?.marketValue ?? 0;
    const buyAmount = order.amount ?? (quote.price * (order.quantity ?? 100));
    const newSingleRatio = totalValue > 0 ? (existingMV + buyAmount) / totalValue : 0;
    if (newSingleRatio >= config.maxSinglePosition) {
      return { valid: false, reason: "单股仓位超过上限" };
    }

    // 8. Cash check
    const fee = Math.max(5, buyAmount * 0.0003);
    const totalCost = buyAmount + fee;
    const minCashNeeded = config.minCashReserve * totalValue;
    if (cash - totalCost < minCashNeeded) {
      return { valid: false, reason: "可用资金不足" };
    }

    // 9. Account drawdown check (initialCapital = 100000)
    const initialCapital = 100000;
    const drawdown = (initialCapital - totalValue) / initialCapital;
    if (drawdown >= 0.20) {
      return { valid: false, reason: "账户回撤超过20%，已停止自动交易" };
    }
  }

  if (isSell) {
    // 1. Position exists
    const pos = positions.find(p => p.symbol === order.symbol);
    if (!pos || pos.shares <= 0) {
      return { valid: false, reason: "无持仓可卖出" };
    }

    // 2. Suspended
    if (quote?.isSuspended) {
      return { valid: false, reason: "股票停牌" };
    }

    // 3. Limit down / one-word limit down
    const obSell = quote as OrderBookSnapshot;
    if (config.enableLimitUpDownCheck) {
      if (obSell.isOneWordLimitDown) return { valid: false, reason: "一字跌停，流动性枯竭，无法卖出" };
      if (quote?.isLimitDown)        return { valid: false, reason: "跌停，无法卖出" };
    }
    // 跌停封单过大（流动性极差）
    if (obSell.limitDownSealAmount != null && obSell.limitDownSealAmount > 5e8) {
      // 仅记录日志，不阻止（跌停本身已阻止）
    }
  }

  return { valid: true, reason: "" };
}

// ── Main runner ───────────────────────────────────────────────────────
export async function runAutoTradingOnce(): Promise<{
  ok: boolean;
  signalCount: number;
  orderCount: number;
  executedCount: number;
  rejectedCount: number;
  message: string;
  logs: AutoTradingLog[];
}> {
  const sessionLogs: AutoTradingLog[] = [];

  function log(
    level: AutoTradingLog["level"],
    message: string,
    extras?: Partial<Omit<AutoTradingLog, "id" | "time" | "level" | "message">>
  ) {
    const config = getAutoTradingConfig();
    addAutoTradingLog({ level, message, strategyId: config.strategyId, ...extras });
    const logs = getAutoTradingLogs();
    if (logs.length > 0) sessionLogs.push(logs[0]);
  }

  const config = getAutoTradingConfig();

  // 1. Check enabled
  if (!config.enabled) {
    return { ok: false, signalCount: 0, orderCount: 0, executedCount: 0, rejectedCount: 0, message: "自动交易未开启", logs: [] };
  }

  // 2. Clean old buy dates
  clearOldBuyDates();

  log("info", "自动交易开始运行", { action: "start" });

  let signalCount = 0;
  let orderCount  = 0;
  let executedCount = 0;
  let rejectedCount = 0;

  try {
    // 3. Fetch signals
    const endpoint = "/api/strategy/signals";
    let buySignals:  Array<{ symbol: string; name: string; score: number; entryPrice: number; suggestedPositionPct: number; warnings: string[] }> = [];
    let sellSignals: Array<{ symbol: string; name: string; score: number }> = [];

    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(30000) });
      const data = await res.json();
      if (data.ok) {
        const minScore = config.strategyId === "a-share-st-reversal" ? 55 : 60;
        buySignals  = (data.buySignals  ?? []).filter((s: { score: number }) => s.score >= minScore);
        sellSignals = data.sellSignals  ?? [];
        signalCount = buySignals.length + sellSignals.length;
        log("info", `获取策略信号成功：买入信号 ${buySignals.length} 个，卖出信号 ${sellSignals.length} 个`);
      } else {
        log("warning", "策略信号接口返回异常");
      }
    } catch (e) {
      log("error", `获取策略信号失败：${String(e).slice(0, 80)}`);
    }

    // 4. Get portfolio state
    const state = useSimStore.getState();
    const { cash, positions, initialCapital } = state;
    const totalValue = positions.reduce((s, p) => s + p.marketValue, 0) + cash;

    // 5. Get today's buy dates and count
    const buyDates = getBuyDates();
    const todayStr = new Date().toDateString();
    const todayBuyCount = Object.values(buyDates).filter(
      iso => new Date(iso).toDateString() === todayStr
    ).length;

    const existingOrders = getAutoTradingOrders();
    const newOrders: AutoOrder[] = [];

    // 6. Process buy signals
    for (const signal of buySignals) {
      const quote = await getClientSideQuote(signal.symbol);

      // 买入：使用卖一价（ask1Price），若盘口不可用则用信号价+滑点
      const basePrice = (quote as OrderBookSnapshot | null)?.ask1Price ?? quote?.price;
      const execPrice = basePrice
        ? +(basePrice * 1.001).toFixed(3)    // 在卖一价基础上加 0.1% 滑点
        : +(signal.entryPrice * 1.002).toFixed(3); // 盘口不可用，信号价+0.2%
      const buyAmount = Math.min(
        totalValue * config.maxSinglePosition,
        totalValue * signal.suggestedPositionPct
      );
      const rawQty = Math.floor(buyAmount / execPrice / 100) * 100;
      const quantity = Math.max(100, rawQty);
      const amount  = +(quantity * execPrice).toFixed(2);
      const fee     = +Math.max(5, amount * 0.0003).toFixed(2);
      const slippage = +(quantity * execPrice * 0.001).toFixed(2);

      const portfolio = {
        cash,
        totalValue,
        positions: positions.map(p => ({ symbol: p.symbol, shares: p.shares, costPrice: p.costPrice, marketValue: p.marketValue })),
      };

      const validation = validateAutoOrder(
        { action: "buy", symbol: signal.symbol, name: signal.name, amount, quantity },
        portfolio,
        config,
        todayBuyCount + newOrders.filter(o => o.action === "buy" && o.status === "executed").length,
        quote ?? undefined
      );

      const orderId = `auto-buy-${signal.symbol}-${Date.now()}`;
      const tsCode  = signal.symbol.startsWith("6") || signal.symbol.startsWith("9")
        ? `${signal.symbol}.SH`
        : `${signal.symbol}.SZ`;

      if (!validation.valid) {
        const order: AutoOrder = {
          orderId, source: "auto_trading",
          strategyId: config.strategyId, strategyName: config.strategyName,
          symbol: signal.symbol, tsCode, name: signal.name,
          action: "buy", price: execPrice, quantity, amount, fee, stampTax: 0, slippage,
          status: "rejected", reason: `买入信号 score=${signal.score}`, rejectReason: validation.reason,
          signalScore: signal.score,
          createdAt: new Date().toISOString(),
        };
        newOrders.push(order);
        orderCount++;
        rejectedCount++;
        log("warning", `买入拒绝 ${signal.name}(${signal.symbol})：${validation.reason}`, {
          symbol: signal.symbol, stockName: signal.name, action: "buy",
        });
        continue;
      }

      // Execute buy
      try {
        useSimStore.getState().buyPosition({
          symbol:   signal.symbol,
          name:     signal.name,
          market:   "A",
          shares:   quantity,
          price:    execPrice,
          strategy: config.strategyName,
          source:   "auto_trading",
          isAutoTrading: true,
          autoOrderId:   orderId,
          buyReason:     `自动交易：score=${signal.score}`,
        });

        recordBuyDate(signal.symbol);

        const order: AutoOrder = {
          orderId, source: "auto_trading",
          strategyId: config.strategyId, strategyName: config.strategyName,
          symbol: signal.symbol, tsCode, name: signal.name,
          action: "buy", price: execPrice, quantity, amount, fee, stampTax: 0, slippage,
          status: "executed", reason: `买入信号 score=${signal.score}`,
          signalScore: signal.score,
          createdAt: new Date().toISOString(),
          executedAt: new Date().toISOString(),
        };
        newOrders.push(order);
        orderCount++;
        executedCount++;
        log("info", `买入成功 ${signal.name}(${signal.symbol}) ${quantity}股 @¥${execPrice}`, {
          symbol: signal.symbol, stockName: signal.name, action: "buy",
        });
      } catch (e) {
        const order: AutoOrder = {
          orderId, source: "auto_trading",
          strategyId: config.strategyId, strategyName: config.strategyName,
          symbol: signal.symbol, tsCode, name: signal.name,
          action: "buy", price: execPrice, quantity, amount, fee, stampTax: 0, slippage,
          status: "failed", reason: `执行失败：${String(e).slice(0, 60)}`,
          signalScore: signal.score,
          createdAt: new Date().toISOString(),
        };
        newOrders.push(order);
        orderCount++;
        rejectedCount++;
        log("error", `买入失败 ${signal.name}(${signal.symbol})：${String(e).slice(0, 60)}`, {
          symbol: signal.symbol, stockName: signal.name, action: "buy",
        });
      }
    }

    // 7. Process sell signals — check positions
    const sellSymbols = new Set(sellSignals.map((s: { symbol: string }) => s.symbol));
    const currentPositions = useSimStore.getState().positions;

    for (const pos of currentPositions) {
      if (!sellSymbols.has(pos.symbol)) continue;

      const quote = await getClientSideQuote(pos.symbol);
      // 卖出：使用买一价（bid1Price），若盘口不可用则用当前价-滑点
      const baseSellPrice = (quote as OrderBookSnapshot | null)?.bid1Price ?? quote?.price;
      const execPrice = baseSellPrice
        ? +(baseSellPrice * 0.999).toFixed(3)   // 在买一价基础上减 0.1% 滑点
        : +(pos.currentPrice * 0.998).toFixed(3); // 盘口不可用，用持仓现价

      // T+1 check
      if (config.enableTPlusOne) {
        const buyDate = buyDates[pos.symbol];
        if (buyDate && new Date(buyDate).toDateString() === todayStr) {
          const orderId = `auto-sell-${pos.symbol}-${Date.now()}`;
          const tsCode  = pos.symbol.startsWith("6") || pos.symbol.startsWith("9")
            ? `${pos.symbol}.SH`
            : `${pos.symbol}.SZ`;
          const amount  = +(pos.shares * execPrice).toFixed(2);
          const fee     = +Math.max(5, amount * 0.0003).toFixed(2);
          const stampTax = +(amount * 0.001).toFixed(2);
          const order: AutoOrder = {
            orderId, source: "auto_trading",
            strategyId: config.strategyId, strategyName: config.strategyName,
            symbol: pos.symbol, tsCode, name: pos.name,
            action: "sell", price: execPrice, quantity: pos.shares, amount, fee, stampTax, slippage: +(amount * 0.001).toFixed(2),
            status: "rejected", reason: "卖出信号", rejectReason: "T+1限制，今日买入不能卖出",
            createdAt: new Date().toISOString(),
          };
          newOrders.push(order);
          orderCount++;
          rejectedCount++;
          log("warning", `卖出拒绝 ${pos.name}(${pos.symbol})：T+1限制，今日买入不能卖出`, {
            symbol: pos.symbol, stockName: pos.name, action: "sell",
          });
          continue;
        }
      }

      const portfolio = {
        cash: useSimStore.getState().cash,
        totalValue,
        positions: useSimStore.getState().positions.map(p => ({
          symbol: p.symbol, shares: p.shares, costPrice: p.costPrice, marketValue: p.marketValue,
        })),
      };

      const validation = validateAutoOrder(
        { action: "sell", symbol: pos.symbol, name: pos.name },
        portfolio,
        config,
        todayBuyCount,
        quote ?? undefined
      );

      const sellShares = pos.shares; // 100% sell for signal sell
      const amount     = +(sellShares * execPrice).toFixed(2);
      const fee        = +Math.max(5, amount * 0.0003).toFixed(2);
      const stampTax   = +(amount * 0.001).toFixed(2);
      const slippage   = +(amount * 0.001).toFixed(2);
      const orderId    = `auto-sell-${pos.symbol}-${Date.now()}`;
      const tsCode     = pos.symbol.startsWith("6") || pos.symbol.startsWith("9")
        ? `${pos.symbol}.SH`
        : `${pos.symbol}.SZ`;

      if (!validation.valid) {
        const order: AutoOrder = {
          orderId, source: "auto_trading",
          strategyId: config.strategyId, strategyName: config.strategyName,
          symbol: pos.symbol, tsCode, name: pos.name,
          action: "sell", price: execPrice, quantity: sellShares, amount, fee, stampTax, slippage,
          status: "rejected", reason: "卖出信号", rejectReason: validation.reason,
          createdAt: new Date().toISOString(),
        };
        newOrders.push(order);
        orderCount++;
        rejectedCount++;
        log("warning", `卖出拒绝 ${pos.name}(${pos.symbol})：${validation.reason}`, {
          symbol: pos.symbol, stockName: pos.name, action: "sell",
        });
        continue;
      }

      try {
        useSimStore.getState().sellPosition({
          symbol: pos.symbol,
          shares: sellShares,
          price:  execPrice,
          source: "auto_trading",
          autoOrderId: orderId,
          triggerReason: "策略卖出信号",
        });

        const order: AutoOrder = {
          orderId, source: "auto_trading",
          strategyId: config.strategyId, strategyName: config.strategyName,
          symbol: pos.symbol, tsCode, name: pos.name,
          action: "sell", price: execPrice, quantity: sellShares, amount, fee, stampTax, slippage,
          status: "executed", reason: "卖出信号",
          createdAt: new Date().toISOString(),
          executedAt: new Date().toISOString(),
        };
        newOrders.push(order);
        orderCount++;
        executedCount++;
        log("info", `卖出成功 ${pos.name}(${pos.symbol}) ${sellShares}股 @¥${execPrice}`, {
          symbol: pos.symbol, stockName: pos.name, action: "sell",
        });
      } catch (e) {
        const order: AutoOrder = {
          orderId, source: "auto_trading",
          strategyId: config.strategyId, strategyName: config.strategyName,
          symbol: pos.symbol, tsCode, name: pos.name,
          action: "sell", price: execPrice, quantity: sellShares, amount, fee, stampTax, slippage,
          status: "failed", reason: `执行失败：${String(e).slice(0, 60)}`,
          createdAt: new Date().toISOString(),
        };
        newOrders.push(order);
        orderCount++;
        rejectedCount++;
        log("error", `卖出失败 ${pos.name}(${pos.symbol})：${String(e).slice(0, 60)}`, {
          symbol: pos.symbol, stockName: pos.name, action: "sell",
        });
      }
    }

    // 8. Stop-loss check for all positions
    if (config.enableStopLoss) {
      const latestPositions = useSimStore.getState().positions;
      for (const pos of latestPositions) {
        const pnlPct = (pos.currentPrice - pos.costPrice) / pos.costPrice;
        if (pnlPct <= -config.stopLossPercent) {
          const quote = await getClientSideQuote(pos.symbol);
          const execPrice = quote ? +(quote.price * 0.999).toFixed(3) : pos.currentPrice;

          // T+1 check
          if (config.enableTPlusOne) {
            const buyDate = buyDates[pos.symbol];
            if (buyDate && new Date(buyDate).toDateString() === todayStr) {
              log("warning", `止损跳过 ${pos.name}(${pos.symbol})：T+1限制`, {
                symbol: pos.symbol, stockName: pos.name, action: "stop_loss",
              });
              continue;
            }
          }

          if (quote?.isSuspended || (quote?.isLimitDown && config.enableLimitUpDownCheck)) {
            log("warning", `止损跳过 ${pos.name}(${pos.symbol})：停牌或跌停`, {
              symbol: pos.symbol, stockName: pos.name, action: "stop_loss",
            });
            continue;
          }

          const orderId  = `auto-stoploss-${pos.symbol}-${Date.now()}`;
          const tsCode   = pos.symbol.startsWith("6") || pos.symbol.startsWith("9")
            ? `${pos.symbol}.SH`
            : `${pos.symbol}.SZ`;
          const amount   = +(pos.shares * execPrice).toFixed(2);
          const fee      = +Math.max(5, amount * 0.0003).toFixed(2);
          const stampTax = +(amount * 0.001).toFixed(2);

          try {
            useSimStore.getState().sellPosition({
              symbol: pos.symbol,
              shares: pos.shares,
              price:  execPrice,
              source: "auto_trading",
              autoOrderId: orderId,
              triggerReason: `止损触发：亏损 ${(pnlPct * 100).toFixed(1)}%`,
            });

            const order: AutoOrder = {
              orderId, source: "auto_trading",
              strategyId: config.strategyId, strategyName: config.strategyName,
              symbol: pos.symbol, tsCode, name: pos.name,
              action: "sell", price: execPrice, quantity: pos.shares, amount, fee, stampTax, slippage: +(amount * 0.001).toFixed(2),
              status: "executed", reason: `止损触发：亏损 ${(pnlPct * 100).toFixed(1)}%`,
              createdAt: new Date().toISOString(),
              executedAt: new Date().toISOString(),
            };
            newOrders.push(order);
            orderCount++;
            executedCount++;
            log("warning", `止损执行 ${pos.name}(${pos.symbol}) 亏损${(pnlPct * 100).toFixed(1)}%`, {
              symbol: pos.symbol, stockName: pos.name, action: "stop_loss",
            });
          } catch (e) {
            log("error", `止损失败 ${pos.name}(${pos.symbol})：${String(e).slice(0, 60)}`, {
              symbol: pos.symbol, stockName: pos.name, action: "stop_loss",
            });
          }
        }

        // Take profit check
        if (config.enableTakeProfit) {
          const pnlPctTP = (pos.currentPrice - pos.costPrice) / pos.costPrice;
          if (pnlPctTP >= config.takeProfitPercent) {
            const quote = await getClientSideQuote(pos.symbol);
            const execPrice = quote ? +(quote.price * 0.999).toFixed(3) : pos.currentPrice;

            if (config.enableTPlusOne) {
              const buyDate = buyDates[pos.symbol];
              if (buyDate && new Date(buyDate).toDateString() === todayStr) {
                log("warning", `止盈跳过 ${pos.name}(${pos.symbol})：T+1限制`, {
                  symbol: pos.symbol, stockName: pos.name, action: "take_profit",
                });
                continue;
              }
            }

            if (quote?.isSuspended) continue;

            const orderId  = `auto-takeprofit-${pos.symbol}-${Date.now()}`;
            const tsCode   = pos.symbol.startsWith("6") || pos.symbol.startsWith("9")
              ? `${pos.symbol}.SH`
              : `${pos.symbol}.SZ`;
            const amount   = +(pos.shares * execPrice).toFixed(2);
            const fee      = +Math.max(5, amount * 0.0003).toFixed(2);
            const stampTax = +(amount * 0.001).toFixed(2);

            try {
              useSimStore.getState().sellPosition({
                symbol: pos.symbol,
                shares: pos.shares,
                price:  execPrice,
                source: "auto_trading",
                autoOrderId: orderId,
                triggerReason: `止盈触发：盈利 ${(pnlPctTP * 100).toFixed(1)}%`,
              });

              const order: AutoOrder = {
                orderId, source: "auto_trading",
                strategyId: config.strategyId, strategyName: config.strategyName,
                symbol: pos.symbol, tsCode, name: pos.name,
                action: "sell", price: execPrice, quantity: pos.shares, amount, fee, stampTax, slippage: +(amount * 0.001).toFixed(2),
                status: "executed", reason: `止盈触发：盈利 ${(pnlPctTP * 100).toFixed(1)}%`,
                createdAt: new Date().toISOString(),
                executedAt: new Date().toISOString(),
              };
              newOrders.push(order);
              orderCount++;
              executedCount++;
              log("info", `止盈执行 ${pos.name}(${pos.symbol}) 盈利${(pnlPctTP * 100).toFixed(1)}%`, {
                symbol: pos.symbol, stockName: pos.name, action: "take_profit",
              });
            } catch (e) {
              log("error", `止盈失败 ${pos.name}(${pos.symbol})：${String(e).slice(0, 60)}`, {
                symbol: pos.symbol, stockName: pos.name, action: "take_profit",
              });
            }
          }
        }
      }
    }

    // 9. Save orders
    saveAutoTradingOrders([...newOrders, ...existingOrders]);

    // 10. Update day stats
    const stats = getTodayStats();
    saveDayStats({
      ...stats,
      ran:           true,
      signalCount:   stats.signalCount + signalCount,
      orderCount:    stats.orderCount  + orderCount,
      executedCount: stats.executedCount + executedCount,
      rejectedCount: stats.rejectedCount + rejectedCount,
    });

    log("info", `自动交易完成：执行 ${executedCount} 单，拒绝 ${rejectedCount} 单`, { action: "done" });

    return {
      ok: true,
      signalCount,
      orderCount,
      executedCount,
      rejectedCount,
      message: `完成：信号 ${signalCount} 个，执行 ${executedCount} 单，拒绝 ${rejectedCount} 单`,
      logs: getAutoTradingLogs().slice(0, 50),
    };
  } catch (e) {
    log("error", `自动交易运行异常：${String(e).slice(0, 120)}`);
    return {
      ok: false,
      signalCount,
      orderCount,
      executedCount,
      rejectedCount,
      message: `运行异常：${String(e).slice(0, 80)}`,
      logs: getAutoTradingLogs().slice(0, 50),
    };
  }
}
