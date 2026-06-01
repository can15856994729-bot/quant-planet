// ─── 市场 ─────────────────────────────────────────────────────
export type Market = "A" | "HK" | "US";
export type Currency = "CNY" | "HKD" | "USD";

// ─── 股票 ─────────────────────────────────────────────────────
export interface Stock {
  symbol: string;       // "600519" / "00700" / "AAPL"
  name: string;
  market: Market;
  price: number;
  change: number;       // 涨跌额
  changePct: number;    // 涨跌幅 %
  volume: number;       // 成交量（手）
  turnover: number;     // 成交额（元）
  marketCap: number;    // 市值
  currency: Currency;
  pe: number;           // 市盈率
  high52w: number;      // 52周最高
  low52w: number;       // 52周最低
  industry: string;     // 行业
}

// ─── K线 ──────────────────────────────────────────────────────
export interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── 策略 ─────────────────────────────────────────────────────
export type RiskLevel = "低" | "中" | "高";
export type MarketCondition = "趋势行情" | "震荡行情" | "突破行情" | "全市场";

export interface Strategy {
  id: string;
  name: string;
  description: string;
  marketCondition: MarketCondition;
  annualReturn: number;   // 年化回测收益 %
  maxDrawdown: number;    // 最大回撤 %
  winRate: number;        // 胜率 %
  tradeCount: number;     // 回测期交易次数
  riskLevel: RiskLevel;
  indicators: string[];   // 使用指标
  markets: Market[];      // 适用市场
  params: StrategyParam[];
  tags: string[];
}

export interface StrategyParam {
  key: string;
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit: string;
}

// ─── 回测 ─────────────────────────────────────────────────────
export interface MonthlyReturn {
  month: string;   // "2021-01"
  return: number;  // %
}

export interface BacktestRoundTrip {
  id: string;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  shares: number;
  pnl: number;
  pnlPct: number;
  reason: string;
}

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  symbol: string;
  stockName: string;
  period: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;      // 总收益率 %
  annualReturn: number;     // 年化收益率 %
  maxDrawdown: number;      // 最大回撤 %
  winRate: number;          // 胜率 %
  profitFactor: number;     // 盈亏比
  totalTrades: number;      // 总交易次数
  sharpeRatio: number;      // 夏普比率
  benchmarkReturn: number;  // 基准（沪深300）收益率 %
  avgHoldDays: number;      // 平均持仓天数
  score: number;            // 策略评分 0-100
  equityCurve: { date: string; value: number; benchmark: number }[];
  trades: BacktestRoundTrip[];
  monthlyReturns: MonthlyReturn[];
}

export interface BacktestTrade {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  price: number;
  shares: number;
  amount: number;
  pnl?: number;
  pnlPct?: number;
  reason: string;
}

// ─── 模拟交易 ─────────────────────────────────────────────────
export interface SimAccount {
  id: string;
  initialCapital: number;
  cash: number;
  totalValue: number;
  totalReturn: number;
  totalReturnPct: number;
  todayPnl: number;
  todayPnlPct: number;
  positions: SimPosition[];
  trades: SimTrade[];
}

export interface SimPosition {
  symbol: string;
  name: string;
  market: Market;
  shares: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  strategy?: string;
}

export interface SimTrade {
  id: string;
  symbol: string;
  name: string;
  type: "BUY" | "SELL";
  price: number;
  shares: number;
  amount: number;
  fee: number;
  pnl?: number;
  strategy?: string;
  createdAt: string;
}

// ─── 信号 ─────────────────────────────────────────────────────
export type SignalType = "BUY" | "SELL" | "STOP_LOSS" | "BREAKOUT" | "VOLUME" | "GOLDEN_CROSS" | "HIGH_RISK";
export type SignalStrength = "强" | "中" | "弱";

export interface Signal {
  id: string;
  symbol: string;
  name: string;
  market: Market;
  type: SignalType;
  price: number;
  strategy: string;
  reason: string;
  strength: SignalStrength;
  triggeredAt: string;
  read: boolean;
}

// ─── 盘口（五档委托） ────────────────────────────────────────────
export interface OrderBookLevel {
  level:  number;  // 1–5
  price:  number;  // 元
  volume: number;  // 股 (手 × 100)
  amount: number;  // 元 = price × volume
}

export interface OrderBookData {
  symbol:   string;
  tsCode:   string;
  name:     string;

  // 行情摘要
  price:         number;
  prevClose:     number;
  open:          number;
  high:          number;
  low:           number;
  changePercent: number;   // 涨跌幅 % (e.g. 3.92)
  volume:        number;   // 股
  amount:        number;   // 元

  // 买一 / 卖一
  bid1Price:  number | null;  // 元
  bid1Volume: number | null;  // 股
  ask1Price:  number | null;  // 元
  ask1Volume: number | null;  // 股

  // 五档
  bids: OrderBookLevel[];  // 买一→买五
  asks: OrderBookLevel[];  // 卖一→卖五

  // 委比、量比、内外盘
  commissionRatio: number | null;  // 委比 %
  volumeRatio:     number | null;  // 量比
  innerVolume:     number | null;  // 内盘（手）
  outerVolume:     number | null;  // 外盘（手）

  // 涨跌停
  limitUpPrice:     number | null;
  limitDownPrice:   number | null;
  isLimitUp:        boolean;
  isLimitDown:      boolean;
  isOneWordLimitUp:   boolean;  // 一字涨停
  isOneWordLimitDown: boolean;  // 一字跌停
  isSuspended:      boolean;

  // 封单
  limitUpSealVolume:   number | null;  // 涨停封单量（手）
  limitUpSealAmount:   number | null;  // 涨停封单金额（元）
  limitDownSealVolume: number | null;  // 跌停封单量（手）
  limitDownSealAmount: number | null;  // 跌停封单金额（元）
  sealAmount:          number | null;  // 当前封单金额（元）

  updatedAt: string;
  source:    "EastMoney";
}

// ─── 指数 ─────────────────────────────────────────────────────
export interface Index {
  name: string;
  code: string;
  value: number;
  change: number;
  changePct: number;
  market: Market;
}
