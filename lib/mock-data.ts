import type { Stock, KLine, Strategy, BacktestResult, SimAccount, Signal, Index } from "@/types";

// ─── 指数 ─────────────────────────────────────────────────────
export const MOCK_INDICES: Index[] = [
  { name: "上证指数", code: "000001", value: 3245.67, change: 27.54, changePct: 0.86, market: "A" },
  { name: "深证成指", code: "399001", value: 10234.5, change: 124.3, changePct: 1.23, market: "A" },
  { name: "创业板指", code: "399006", value: 2108.3,  change: 30.2,  changePct: 1.45, market: "A" },
  { name: "恒生指数", code: "HSI",    value: 18654.2, change: -89.4,  changePct: -0.48, market: "HK" },
  { name: "纳斯达克", code: "IXIC",   value: 16342.8, change: 98.6,  changePct: 0.61, market: "US" },
  { name: "标普500",  code: "SPX",    value: 5218.4,  change: 15.2,  changePct: 0.29, market: "US" },
];

// ─── 股票 ─────────────────────────────────────────────────────
export const MOCK_STOCKS: Stock[] = [
  {
    symbol: "600519", name: "贵州茅台", market: "A", currency: "CNY",
    price: 1680.5, change: 22.3, changePct: 1.35,
    volume: 28460, turnover: 4783200000, marketCap: 2113200000000,
    pe: 28.4, high52w: 1890.0, low52w: 1400.2, industry: "白酒",
  },
  {
    symbol: "601318", name: "中国平安", market: "A", currency: "CNY",
    price: 42.8, change: -0.6, changePct: -1.38,
    volume: 1245600, turnover: 5327000000, marketCap: 781600000000,
    pe: 7.2, high52w: 52.3, low52w: 38.1, industry: "保险",
  },
  {
    symbol: "002594", name: "比亚迪", market: "A", currency: "CNY",
    price: 245.6, change: 5.8, changePct: 2.42,
    volume: 568900, turnover: 13967000000, marketCap: 714300000000,
    pe: 21.6, high52w: 302.5, low52w: 198.7, industry: "新能源汽车",
  },
  {
    symbol: "300750", name: "宁德时代", market: "A", currency: "CNY",
    price: 198.4, change: 3.2, changePct: 1.64,
    volume: 892300, turnover: 17698000000, marketCap: 869200000000,
    pe: 18.3, high52w: 248.6, low52w: 164.3, industry: "动力电池",
  },
  {
    symbol: "601398", name: "工商银行", market: "A", currency: "CNY",
    price: 5.82, change: 0.04, changePct: 0.69,
    volume: 12456000, turnover: 7249000000, marketCap: 2070000000000,
    pe: 4.8, high52w: 6.35, low52w: 4.72, industry: "银行",
  },
  {
    symbol: "00700", name: "腾讯控股", market: "HK", currency: "HKD",
    price: 320.4, change: -2.6, changePct: -0.80,
    volume: 18920000, turnover: 6059000000, marketCap: 3082000000000,
    pe: 16.8, high52w: 402.0, low52w: 265.4, industry: "互联网",
  },
  {
    symbol: "09988", name: "阿里巴巴", market: "HK", currency: "HKD",
    price: 78.45, change: 1.25, changePct: 1.62,
    volume: 32450000, turnover: 2545000000, marketCap: 1689000000000,
    pe: 11.2, high52w: 102.4, low52w: 61.8, industry: "互联网",
  },
  {
    symbol: "03690", name: "美团", market: "HK", currency: "HKD",
    price: 145.3, change: 3.8, changePct: 2.69,
    volume: 22130000, turnover: 3215000000, marketCap: 892000000000,
    pe: 32.4, high52w: 178.6, low52w: 96.4, industry: "本地生活",
  },
  {
    symbol: "AAPL", name: "苹果", market: "US", currency: "USD",
    price: 189.3, change: 2.1, changePct: 1.12,
    volume: 68420000, turnover: 12945000000, marketCap: 2920000000000,
    pe: 28.6, high52w: 199.6, low52w: 164.1, industry: "科技",
  },
  {
    symbol: "TSLA", name: "特斯拉", market: "US", currency: "USD",
    price: 248.5, change: -6.4, changePct: -2.51,
    volume: 124560000, turnover: 30954000000, marketCap: 791000000000,
    pe: 52.3, high52w: 314.7, low52w: 138.8, industry: "新能源汽车",
  },
  {
    symbol: "NVDA", name: "英伟达", market: "US", currency: "USD",
    price: 875.4, change: 18.6, changePct: 2.17,
    volume: 45230000, turnover: 39594000000, marketCap: 2158000000000,
    pe: 64.8, high52w: 974.0, low52w: 402.6, industry: "半导体",
  },
  {
    symbol: "MSFT", name: "微软", market: "US", currency: "USD",
    price: 415.2, change: 3.8, changePct: 0.92,
    volume: 21340000, turnover: 8855000000, marketCap: 3087000000000,
    pe: 36.2, high52w: 468.3, low52w: 362.9, industry: "科技",
  },
  // ── 更多 A股 ──
  {
    symbol: "601857", name: "中国石油", market: "A", currency: "CNY",
    price: 8.42, change: 0.12, changePct: 1.45,
    volume: 6234000, turnover: 5249000000, marketCap: 1548000000000,
    pe: 9.6, high52w: 9.88, low52w: 6.92, industry: "石油化工",
  },
  {
    symbol: "600036", name: "招商银行", market: "A", currency: "CNY",
    price: 35.6, change: 0.48, changePct: 1.37,
    volume: 2345000, turnover: 8348000000, marketCap: 898000000000,
    pe: 6.4, high52w: 42.8, low52w: 30.2, industry: "银行",
  },
  {
    symbol: "600000", name: "浦发银行", market: "A", currency: "CNY",
    price: 7.82, change: -0.06, changePct: -0.76,
    volume: 4562000, turnover: 3567000000, marketCap: 226000000000,
    pe: 5.1, high52w: 9.24, low52w: 7.14, industry: "银行",
  },
  {
    symbol: "000858", name: "五粮液", market: "A", currency: "CNY",
    price: 135.8, change: 2.4, changePct: 1.80,
    volume: 342000, turnover: 4643000000, marketCap: 526000000000,
    pe: 19.2, high52w: 168.4, low52w: 112.6, industry: "白酒",
  },
  {
    symbol: "601166", name: "兴业银行", market: "A", currency: "CNY",
    price: 18.42, change: 0.22, changePct: 1.21,
    volume: 3456000, turnover: 6364000000, marketCap: 381000000000,
    pe: 4.2, high52w: 22.6, low52w: 15.8, industry: "银行",
  },
  {
    symbol: "600276", name: "恒瑞医药", market: "A", currency: "CNY",
    price: 42.6, change: -0.8, changePct: -1.84,
    volume: 1230000, turnover: 5240000000, marketCap: 271000000000,
    pe: 48.3, high52w: 52.4, low52w: 34.2, industry: "医药",
  },
  // ── 更多港股 ──
  {
    symbol: "09618", name: "京东集团", market: "HK", currency: "HKD",
    price: 148.5, change: 3.2, changePct: 2.20,
    volume: 12340000, turnover: 1833000000, marketCap: 468000000000,
    pe: 14.8, high52w: 198.6, low52w: 98.4, industry: "电商",
  },
  {
    symbol: "00941", name: "中国移动", market: "HK", currency: "HKD",
    price: 68.4, change: 0.6, changePct: 0.89,
    volume: 28900000, turnover: 1977000000, marketCap: 1412000000000,
    pe: 11.2, high52w: 82.4, low52w: 58.6, industry: "电信",
  },
  // ── 更多美股 ──
  {
    symbol: "AMZN", name: "亚马逊", market: "US", currency: "USD",
    price: 196.5, change: 2.8, changePct: 1.45,
    volume: 38420000, turnover: 7549000000, marketCap: 2048000000000,
    pe: 42.6, high52w: 242.5, low52w: 151.3, industry: "电商/云计算",
  },
  {
    symbol: "GOOGL", name: "谷歌", market: "US", currency: "USD",
    price: 175.8, change: 1.6, changePct: 0.92,
    volume: 22140000, turnover: 3892000000, marketCap: 2178000000000,
    pe: 24.8, high52w: 208.7, low52w: 130.7, industry: "互联网/广告",
  },
  {
    symbol: "META", name: "Meta", market: "US", currency: "USD",
    price: 525.6, change: -8.4, changePct: -1.57,
    volume: 15680000, turnover: 8241000000, marketCap: 1342000000000,
    pe: 26.4, high52w: 589.2, low52w: 352.4, industry: "社交媒体",
  },
];

// ─── K线生成 ──────────────────────────────────────────────────
export function generateKLines(basePrice: number, days = 120): KLine[] {
  const lines: KLine[] = [];
  let price = basePrice * 0.75;
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    // 跳过周末
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const change = (Math.random() - 0.48) * price * 0.025;
    const open = price;
    const close = Math.max(open + change, open * 0.92);
    const high = Math.max(open, close) * (1 + Math.random() * 0.012);
    const low  = Math.min(open, close) * (1 - Math.random() * 0.012);
    const volume = Math.floor(Math.random() * 1000000 + 200000);
    lines.push({
      date: d.toISOString().split("T")[0],
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low:  +low.toFixed(2),
      close: +close.toFixed(2),
      volume,
    });
    price = close;
  }
  return lines;
}

// ─── 策略 ─────────────────────────────────────────────────────
export const MOCK_STRATEGIES: Strategy[] = [
  {
    id: "s1",
    name: "双均线趋势策略",
    description: "利用短期均线与长期均线的交叉信号判断趋势方向，金叉买入死叉卖出。适合趋势行情，震荡市慎用。",
    marketCondition: "趋势行情",
    annualReturn: 18.6,
    maxDrawdown: 7.2,
    winRate: 56,
    tradeCount: 48,
    riskLevel: "中",
    indicators: ["MA5", "MA20"],
    markets: ["A", "HK", "US"],
    params: [
      { key: "shortPeriod", label: "短期均线", defaultValue: 5,  min: 3,  max: 20,  step: 1, unit: "日" },
      { key: "longPeriod",  label: "长期均线", defaultValue: 20, min: 10, max: 60,  step: 1, unit: "日" },
    ],
    tags: ["均线", "趋势", "经典"],
  },
  {
    id: "s2",
    name: "MACD 金叉死叉",
    description: "通过 MACD 指标的 DIF 线与 DEA 线金叉死叉判断买卖时机，结合柱状图辅助确认。",
    marketCondition: "趋势行情",
    annualReturn: 16.4,
    maxDrawdown: 9.8,
    winRate: 53,
    tradeCount: 36,
    riskLevel: "中",
    indicators: ["MACD", "DIF", "DEA"],
    markets: ["A", "HK", "US"],
    params: [
      { key: "fast",   label: "快线周期", defaultValue: 12, min: 5,  max: 20, step: 1, unit: "日" },
      { key: "slow",   label: "慢线周期", defaultValue: 26, min: 15, max: 40, step: 1, unit: "日" },
      { key: "signal", label: "信号周期", defaultValue: 9,  min: 5,  max: 15, step: 1, unit: "日" },
    ],
    tags: ["MACD", "动量", "经典"],
  },
  {
    id: "s3",
    name: "RSI 超买超卖",
    description: "RSI 低于30视为超卖买入，高于70视为超买卖出。适合震荡行情，趋势行情中可能频繁止损。",
    marketCondition: "震荡行情",
    annualReturn: 14.8,
    maxDrawdown: 6.4,
    winRate: 61,
    tradeCount: 64,
    riskLevel: "低",
    indicators: ["RSI"],
    markets: ["A", "HK", "US"],
    params: [
      { key: "period",    label: "RSI周期",  defaultValue: 14, min: 6,  max: 28, step: 1,  unit: "日" },
      { key: "oversold",  label: "超卖线",   defaultValue: 30, min: 20, max: 40, step: 1,  unit: "" },
      { key: "overbought",label: "超买线",   defaultValue: 70, min: 60, max: 80, step: 1,  unit: "" },
    ],
    tags: ["RSI", "反转", "震荡"],
  },
  {
    id: "s4",
    name: "布林带突破策略",
    description: "价格突破布林带上轨视为强势信号，跌破下轨视为弱势。结合带宽收窄后的突破效果更佳。",
    marketCondition: "突破行情",
    annualReturn: 21.3,
    maxDrawdown: 13.6,
    winRate: 49,
    tradeCount: 42,
    riskLevel: "高",
    indicators: ["BOLL", "布林上轨", "布林下轨"],
    markets: ["A", "HK", "US"],
    params: [
      { key: "period", label: "周期",   defaultValue: 20, min: 10, max: 30, step: 1,   unit: "日" },
      { key: "stdDev", label: "标准差", defaultValue: 2,  min: 1,  max: 3,  step: 0.5, unit: "倍" },
    ],
    tags: ["布林带", "突破", "波动率"],
  },
  {
    id: "s5",
    name: "网格交易策略",
    description: "在设定价格区间内均匀设置买卖网格，低买高卖反复操作。适合震荡区间行情，趋势市效果较差。",
    marketCondition: "震荡行情",
    annualReturn: 12.5,
    maxDrawdown: 4.8,
    winRate: 72,
    tradeCount: 128,
    riskLevel: "低",
    indicators: [],
    markets: ["A", "HK", "US"],
    params: [
      { key: "gridCount", label: "网格数量", defaultValue: 10, min: 5,  max: 20,  step: 1,  unit: "格" },
      { key: "gridPct",   label: "每格间距", defaultValue: 2,  min: 0.5, max: 5,  step: 0.5, unit: "%" },
    ],
    tags: ["网格", "震荡", "稳健"],
  },
  {
    id: "s6",
    name: "趋势突破策略",
    description: "价格突破近N日最高点时买入，跌破近N日最低点时卖出。捕捉强趋势行情，止损明确。",
    marketCondition: "突破行情",
    annualReturn: 23.8,
    maxDrawdown: 16.2,
    winRate: 44,
    tradeCount: 28,
    riskLevel: "高",
    indicators: ["N日高点", "N日低点"],
    markets: ["A", "HK", "US"],
    params: [
      { key: "entryPeriod", label: "突破周期", defaultValue: 20, min: 10, max: 60, step: 5, unit: "日" },
      { key: "exitPeriod",  label: "退出周期", defaultValue: 10, min: 5,  max: 30, step: 5, unit: "日" },
    ],
    tags: ["突破", "趋势", "海龟"],
  },
  {
    id: "s7",
    name: "回调买入策略",
    description: "在上升趋势中等待价格回调至均线支撑位再买入，降低追高风险，提高胜率。",
    marketCondition: "趋势行情",
    annualReturn: 17.2,
    maxDrawdown: 8.4,
    winRate: 62,
    tradeCount: 38,
    riskLevel: "中",
    indicators: ["MA20", "MA60"],
    markets: ["A", "HK", "US"],
    params: [
      { key: "maPeriod",   label: "均线周期", defaultValue: 20, min: 10, max: 60, step: 5, unit: "日" },
      { key: "pullbackPct",label: "回调幅度", defaultValue: 5,  min: 2,  max: 10, step: 1, unit: "%" },
    ],
    tags: ["回调", "趋势", "低风险"],
  },
  {
    id: "s8",
    name: "止盈止损策略",
    description: "设定固定止盈止损比例，严格执行交易纪律。配合其他策略使用，控制单次亏损，保护利润。",
    marketCondition: "全市场",
    annualReturn: 11.4,
    maxDrawdown: 5.2,
    winRate: 58,
    tradeCount: 82,
    riskLevel: "低",
    indicators: [],
    markets: ["A", "HK", "US"],
    params: [
      { key: "stopLoss",   label: "止损比例", defaultValue: 8,  min: 3,  max: 15, step: 1, unit: "%" },
      { key: "takeProfit", label: "止盈比例", defaultValue: 15, min: 5,  max: 30, step: 1, unit: "%" },
    ],
    tags: ["止损", "止盈", "纪律"],
  },
  {
    id: "s9",
    name: "KDJ 金叉策略",
    description: "K线上穿D线为金叉买入信号，K线下穿D线为死叉卖出信号，结合J值极值辅助过滤假信号。",
    marketCondition: "震荡行情",
    annualReturn: 15.6,
    maxDrawdown: 8.2,
    winRate: 58,
    tradeCount: 72,
    riskLevel: "中",
    indicators: ["KDJ", "K线", "D线", "J线"],
    markets: ["A", "HK"],
    params: [
      { key: "period",  label: "KDJ周期", defaultValue: 9,  min: 5,  max: 20, step: 1, unit: "日" },
      { key: "overbought", label: "超买值", defaultValue: 80, min: 70, max: 90, step: 5, unit: "" },
      { key: "oversold",   label: "超卖值", defaultValue: 20, min: 10, max: 30, step: 5, unit: "" },
    ],
    tags: ["KDJ", "震荡", "短线"],
  },
  {
    id: "s10",
    name: "成交量异动策略",
    description: "当成交量突然放大至5日均量3倍以上时，判断为主力进场信号。结合价格方向决定买卖方向。",
    marketCondition: "突破行情",
    annualReturn: 19.4,
    maxDrawdown: 14.8,
    winRate: 47,
    tradeCount: 22,
    riskLevel: "高",
    indicators: ["成交量", "均量线", "量比"],
    markets: ["A"],
    params: [
      { key: "volMultiple", label: "放量倍数", defaultValue: 3,  min: 2,   max: 5,   step: 0.5, unit: "倍" },
      { key: "maPeriod",    label: "均量周期", defaultValue: 5,  min: 3,   max: 10,  step: 1,   unit: "日" },
    ],
    tags: ["量价", "突破", "主力"],
  },
  {
    id: "s11",
    name: "高低点突破策略",
    description: "价格突破近期阻力位（前高）时买入，跌破支撑位（前低）时卖出。简单有效的支撑阻力策略。",
    marketCondition: "突破行情",
    annualReturn: 20.8,
    maxDrawdown: 11.4,
    winRate: 51,
    tradeCount: 34,
    riskLevel: "中",
    indicators: ["前高", "前低", "阻力位", "支撑位"],
    markets: ["A", "HK", "US"],
    params: [
      { key: "lookback", label: "回溯周期", defaultValue: 20, min: 10, max: 60, step: 5, unit: "日" },
    ],
    tags: ["支撑阻力", "突破", "价格形态"],
  },
  {
    id: "s12",
    name: "均值回归策略",
    description: "当价格大幅偏离长期均线时，预期价格回归均值。低于均线20%买入，高于均线20%卖出。",
    marketCondition: "震荡行情",
    annualReturn: 13.2,
    maxDrawdown: 6.8,
    winRate: 65,
    tradeCount: 56,
    riskLevel: "低",
    indicators: ["MA120", "偏离度"],
    markets: ["A", "US"],
    params: [
      { key: "maPeriod",    label: "均线周期", defaultValue: 120, min: 60,  max: 250, step: 10, unit: "日" },
      { key: "deviationPct",label: "偏离阈值", defaultValue: 20,  min: 10,  max: 30,  step: 5,  unit: "%" },
    ],
    tags: ["均值回归", "长线", "价值"],
  },
  {
    id: "s13",
    name: "多因子综合策略",
    description: "综合动量、价值、质量三大因子打分，选取综合评分高的股票。分散化持仓，降低单股风险。",
    marketCondition: "全市场",
    annualReturn: 16.8,
    maxDrawdown: 9.6,
    winRate: 60,
    tradeCount: 45,
    riskLevel: "中",
    indicators: ["动量因子", "价值因子", "质量因子", "综合评分"],
    markets: ["A", "US"],
    params: [
      { key: "momentumWeight", label: "动量权重", defaultValue: 40, min: 10, max: 60, step: 10, unit: "%" },
      { key: "valueWeight",    label: "价值权重", defaultValue: 30, min: 10, max: 60, step: 10, unit: "%" },
      { key: "qualityWeight",  label: "质量权重", defaultValue: 30, min: 10, max: 60, step: 10, unit: "%" },
    ],
    tags: ["多因子", "量化选股", "分散化"],
  },
];

// ─── 回测结果 ─────────────────────────────────────────────────
function generateEquityCurve(days: number, totalReturn: number, benchmarkReturn: number) {
  const curve = [];
  let val = 100;
  let bench = 100;
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dailyTarget = totalReturn / (days * 0.7);
    const dailyBench  = benchmarkReturn / (days * 0.7);
    val   += val   * (dailyTarget / 100 + (Math.random() - 0.48) * 0.012);
    bench += bench * (dailyBench  / 100 + (Math.random() - 0.48) * 0.008);
    curve.push({
      date: d.toISOString().split("T")[0],
      value:     +val.toFixed(2),
      benchmark: +bench.toFixed(2),
    });
  }
  return curve;
}

export const MOCK_BACKTEST: BacktestResult = {
  strategyId: "s1",
  strategyName: "双均线趋势策略",
  symbol: "600519",
  stockName: "贵州茅台",
  period: "2021-01-01 ~ 2024-12-31",
  initialCapital: 100000,
  finalCapital: 186320,
  totalReturn: 86.32,
  annualReturn: 18.6,
  maxDrawdown: 7.2,
  winRate: 56.3,
  profitFactor: 2.14,
  totalTrades: 48,
  sharpeRatio: 1.42,
  benchmarkReturn: 6.8,
  avgHoldDays: 28,
  score: 82,
  equityCurve: generateEquityCurve(365 * 3, 86.32, 20.4),
  trades: [
    { id: "r1", buyDate: "2021-03-15", sellDate: "2021-06-22", buyPrice: 2050.0, sellPrice: 2380.0, shares: 10, pnl: 3300,  pnlPct: 16.1, reason: "金叉买入→死叉卖出" },
    { id: "r2", buyDate: "2021-09-08", sellDate: "2021-11-30", buyPrice: 1920.0, sellPrice: 2100.0, shares: 12, pnl: 2160,  pnlPct: 9.4,  reason: "金叉买入→死叉卖出" },
    { id: "r3", buyDate: "2022-02-14", sellDate: "2022-04-28", buyPrice: 1850.0, sellPrice: 1730.0, shares: 14, pnl: -1680, pnlPct: -6.5, reason: "金叉买入→止损触发" },
    { id: "r4", buyDate: "2022-08-10", sellDate: "2022-12-05", buyPrice: 1680.0, sellPrice: 1920.0, shares: 15, pnl: 3600,  pnlPct: 14.3, reason: "金叉买入→死叉卖出" },
    { id: "r5", buyDate: "2023-01-18", sellDate: "2023-04-12", buyPrice: 1750.0, sellPrice: 1990.0, shares: 14, pnl: 3360,  pnlPct: 13.7, reason: "金叉买入→止盈触发" },
    { id: "r6", buyDate: "2023-06-05", sellDate: "2023-08-22", buyPrice: 1880.0, sellPrice: 1810.0, shares: 13, pnl: -910,  pnlPct: -3.7, reason: "金叉买入→止损触发" },
    { id: "r7", buyDate: "2023-10-09", sellDate: "2024-01-15", buyPrice: 1720.0, sellPrice: 2050.0, shares: 15, pnl: 4950,  pnlPct: 19.2, reason: "金叉买入→止盈触发" },
    { id: "r8", buyDate: "2024-03-20", sellDate: "2024-07-08", buyPrice: 1650.0, sellPrice: 1780.0, shares: 16, pnl: 2080,  pnlPct: 7.9,  reason: "金叉买入→死叉卖出" },
  ],
  monthlyReturns: [
    { month: "2021-01", return: 2.1 },
    { month: "2021-02", return: -1.2 },
    { month: "2021-03", return: 4.8 },
    { month: "2021-04", return: 3.2 },
    { month: "2021-05", return: 1.5 },
    { month: "2021-06", return: -0.8 },
    { month: "2021-07", return: 5.2 },
    { month: "2021-08", return: 2.9 },
    { month: "2021-09", return: -2.1 },
    { month: "2021-10", return: 3.8 },
    { month: "2021-11", return: 1.1 },
    { month: "2021-12", return: -0.5 },
    { month: "2022-01", return: -3.2 },
    { month: "2022-02", return: 1.8 },
    { month: "2022-03", return: -4.5 },
    { month: "2022-04", return: -1.9 },
    { month: "2022-05", return: 2.4 },
    { month: "2022-06", return: 3.1 },
    { month: "2022-07", return: 4.2 },
    { month: "2022-08", return: 2.7 },
    { month: "2022-09", return: -1.3 },
    { month: "2022-10", return: 0.8 },
    { month: "2022-11", return: 5.6 },
    { month: "2022-12", return: 3.3 },
  ],
};

// ─── 模拟账户 ─────────────────────────────────────────────────
export const MOCK_SIM_ACCOUNT: SimAccount = {
  id: "sim001",
  initialCapital: 1000000,
  cash: 412350,
  totalValue: 1023100,
  totalReturn: 23100,
  totalReturnPct: 2.31,
  todayPnl: 4280,
  todayPnlPct: 0.42,
  positions: [
    {
      symbol: "600519", name: "贵州茅台", market: "A",
      shares: 100, costPrice: 1620.0, currentPrice: 1680.5,
      marketValue: 168050, pnl: 6050, pnlPct: 3.73,
      strategy: "双均线趋势策略",
    },
    {
      symbol: "002594", name: "比亚迪", market: "A",
      shares: 500, costPrice: 238.0, currentPrice: 245.6,
      marketValue: 122800, pnl: 3800, pnlPct: 3.19,
      strategy: "MACD金叉死叉",
    },
    {
      symbol: "NVDA", name: "英伟达", market: "US",
      shares: 20, costPrice: 820.0, currentPrice: 875.4,
      marketValue: 17508, pnl: 1108, pnlPct: 6.76,
      strategy: "趋势突破策略",
    },
    {
      symbol: "00700", name: "腾讯控股", market: "HK",
      shares: 200, costPrice: 330.0, currentPrice: 320.4,
      marketValue: 64080, pnl: -1920, pnlPct: -2.91,
    },
  ],
  trades: [
    { id: "st1", symbol: "600519", name: "贵州茅台", type: "BUY",  price: 1620.0, shares: 100, amount: 162000, fee: 81,  strategy: "双均线趋势策略", createdAt: "2024-03-10T09:35:00Z" },
    { id: "st2", symbol: "002594", name: "比亚迪",   type: "BUY",  price: 238.0,  shares: 500, amount: 119000, fee: 59.5, strategy: "MACD金叉死叉",   createdAt: "2024-03-12T10:20:00Z" },
    { id: "st3", symbol: "601318", name: "中国平安", type: "BUY",  price: 45.2,   shares: 1000,amount: 45200,  fee: 22.6, createdAt: "2024-02-20T09:40:00Z" },
    { id: "st4", symbol: "601318", name: "中国平安", type: "SELL", price: 43.8,   shares: 1000,amount: 43800,  fee: 21.9, pnl: -1400, createdAt: "2024-03-05T14:30:00Z" },
    { id: "st5", symbol: "NVDA",   name: "英伟达",   type: "BUY",  price: 820.0,  shares: 20,  amount: 16400,  fee: 0,   strategy: "趋势突破策略",   createdAt: "2024-03-18T22:15:00Z" },
    { id: "st6", symbol: "00700",  name: "腾讯控股", type: "BUY",  price: 330.0,  shares: 200, amount: 66000,  fee: 66,  createdAt: "2024-03-20T10:05:00Z" },
  ],
};

// ─── 信号 ─────────────────────────────────────────────────────
export const MOCK_SIGNALS: Signal[] = [
  {
    id: "sig1", symbol: "600519", name: "贵州茅台", market: "A",
    type: "GOLDEN_CROSS", price: 1680.5, strength: "强",
    strategy: "双均线趋势策略",
    reason: "MA5上穿MA20形成金叉，成交量同步放大1.8倍",
    triggeredAt: new Date(Date.now() - 30 * 60000).toISOString(), read: false,
  },
  {
    id: "sig2", symbol: "002594", name: "比亚迪", market: "A",
    type: "BUY", price: 245.6, strength: "中",
    strategy: "MACD金叉死叉",
    reason: "MACD DIF线上穿DEA线，柱状图由负转正",
    triggeredAt: new Date(Date.now() - 90 * 60000).toISOString(), read: false,
  },
  {
    id: "sig3", symbol: "NVDA", name: "英伟达", market: "US",
    type: "BREAKOUT", price: 875.4, strength: "强",
    strategy: "趋势突破策略",
    reason: "突破近20日最高点$868.4，成交量为均值2.3倍",
    triggeredAt: new Date(Date.now() - 2 * 3600000).toISOString(), read: false,
  },
  {
    id: "sig4", symbol: "601318", name: "中国平安", market: "A",
    type: "SELL", price: 42.8, strength: "中",
    strategy: "RSI超买超卖",
    reason: "RSI(14)跌破50，短期动能减弱",
    triggeredAt: new Date(Date.now() - 4 * 3600000).toISOString(), read: true,
  },
  {
    id: "sig5", symbol: "00700", name: "腾讯控股", market: "HK",
    type: "STOP_LOSS", price: 320.4, strength: "强",
    strategy: "止盈止损策略",
    reason: "持仓浮亏已达-2.9%，接近止损线-3%，请关注",
    triggeredAt: new Date(Date.now() - 5 * 3600000).toISOString(), read: false,
  },
  {
    id: "sig6", symbol: "300750", name: "宁德时代", market: "A",
    type: "VOLUME", price: 198.4, strength: "弱",
    strategy: "成交量异动",
    reason: "今日成交量为20日均量的2.1倍，量价配合关注",
    triggeredAt: new Date(Date.now() - 6 * 3600000).toISOString(), read: true,
  },
  {
    id: "sig7", symbol: "TSLA", name: "特斯拉", market: "US",
    type: "HIGH_RISK", price: 248.5, strength: "强",
    strategy: "风险监控",
    reason: "价格跌破60日均线，趋势转弱，建议控制仓位",
    triggeredAt: new Date(Date.now() - 8 * 3600000).toISOString(), read: true,
  },
];

// ─── 默认自选股 ───────────────────────────────────────────────
export const DEFAULT_WATCHLIST = ["600519", "002594", "300750", "601318", "00700", "09988", "NVDA", "AAPL", "TSLA"];
