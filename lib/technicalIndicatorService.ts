/**
 * lib/technicalIndicatorService.ts
 *
 * 通用技术指标计算服务（纯数学，无 I/O，可在服务端和客户端使用）
 *
 * 指标：MA, EMA, RSI, MACD, KDJ, 成交量均值
 */

// ── 移动平均线 ────────────────────────────────────────────────────────────

/** 简单移动平均 (SMA)，返回与输入等长的数组，前 period-1 个值为 NaN */
export function calcMA(prices: number[], period: number): number[] {
  const result: number[] = new Array(prices.length).fill(NaN);
  if (period <= 0 || period > prices.length) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  result[period - 1] = sum / period;
  for (let i = period; i < prices.length; i++) {
    sum += prices[i] - prices[i - period];
    result[i] = sum / period;
  }
  return result;
}

/** 指数移动平均 (EMA) */
export function calcEMA(prices: number[], period: number): number[] {
  const result: number[] = new Array(prices.length).fill(NaN);
  if (period <= 0 || prices.length === 0) return result;
  const k = 2 / (period + 1);
  let ema = prices[0];
  result[0] = ema;
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

/** 获取某个 bar 的 MA 值（无需存整个数组） */
export function getMAValue(prices: number[], period: number): number {
  if (prices.length < period) return NaN;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ── RSI ──────────────────────────────────────────────────────────────────

/** 相对强弱指数 (RSI)，返回与输入等长的数组 */
export function calcRSI(prices: number[], period: number = 14): number[] {
  const result: number[] = new Array(prices.length).fill(NaN);
  if (prices.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result[i] = rsi;
  }
  return result;
}

// ── MACD ─────────────────────────────────────────────────────────────────

export interface MACDResult {
  macd:      number[];  // DIF
  signal:    number[];  // DEA
  histogram: number[];  // MACD 柱 = (DIF - DEA) * 2
}

/** MACD（DIF / DEA / MACD柱） */
export function calcMACD(
  prices: number[],
  fast   = 12,
  slow   = 26,
  signal = 9,
): MACDResult {
  const emaFast = calcEMA(prices, fast);
  const emaSlow = calcEMA(prices, slow);
  const dif = emaFast.map((v, i) =>
    isNaN(v) || isNaN(emaSlow[i]) ? NaN : v - emaSlow[i],
  );
  // DEA = EMA of DIF (only on valid DIF values)
  const dea: number[] = new Array(prices.length).fill(NaN);
  const k = 2 / (signal + 1);
  let deaVal = NaN;
  for (let i = 0; i < dif.length; i++) {
    if (!isNaN(dif[i])) {
      if (isNaN(deaVal)) deaVal = dif[i];
      else deaVal = dif[i] * k + deaVal * (1 - k);
      dea[i] = deaVal;
    }
  }
  const histogram = dif.map((v, i) =>
    isNaN(v) || isNaN(dea[i]) ? NaN : (v - dea[i]) * 2,
  );
  return { macd: dif, signal: dea, histogram };
}

// ── KDJ ──────────────────────────────────────────────────────────────────

export interface KDJResult {
  k: number[];
  d: number[];
  j: number[];
}

/** KDJ 随机指标 */
export function calcKDJ(
  highs:  number[],
  lows:   number[],
  closes: number[],
  period = 9,
): KDJResult {
  const n = closes.length;
  const k = new Array(n).fill(NaN);
  const d = new Array(n).fill(NaN);
  const j = new Array(n).fill(NaN);
  if (n < period) return { k, d, j };

  let kVal = 50;
  let dVal = 50;

  for (let i = period - 1; i < n; i++) {
    const slice_highs = highs.slice(i - period + 1, i + 1);
    const slice_lows  = lows.slice(i - period + 1, i + 1);
    const hh = Math.max(...slice_highs);
    const ll = Math.min(...slice_lows);
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;

    kVal = (2 / 3) * kVal + (1 / 3) * rsv;
    dVal = (2 / 3) * dVal + (1 / 3) * kVal;
    k[i] = kVal;
    d[i] = dVal;
    j[i] = 3 * kVal - 2 * dVal;
  }
  return { k, d, j };
}

// ── 成交量 ───────────────────────────────────────────────────────────────

/** 成交量/成交额 N 日均值 */
export function calcVolumeMA(volumes: number[], period: number): number[] {
  return calcMA(volumes, period);
}

/** 最新成交量相对于 N 日均量的倍数 */
export function volumeRatio(volumes: number[], period: number): number {
  if (volumes.length < period + 1) return NaN;
  const avg = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
  return avg === 0 ? 0 : volumes[volumes.length - 1] / avg;
}

// ── 辅助 ────────────────────────────────────────────────────────────────

/** 判断 K 值在最近两根 bar 是否形成金叉（K 上穿 D） */
export function isKDJGoldenCross(k: number[], d: number[]): boolean {
  const n = k.length;
  if (n < 2) return false;
  return k[n - 2] <= d[n - 2] && k[n - 1] > d[n - 1];
}

/** MACD DIF 在最近两根 bar 是否金叉 DEA */
export function isMACDGoldenCross(macd: number[], signal: number[]): boolean {
  const n = macd.length;
  if (n < 2) return false;
  return macd[n - 2] <= signal[n - 2] && macd[n - 1] > signal[n - 1];
}

/** MACD 柱是否在缩短（绿柱变小 or 红柱增大）*/
export function isMACDHistogramShrinking(histogram: number[]): boolean {
  const n = histogram.length;
  if (n < 2) return false;
  const prev = histogram[n - 2];
  const curr = histogram[n - 1];
  if (isNaN(prev) || isNaN(curr)) return false;
  // 绿柱（负值）变小表示动能减弱 → 绿柱绝对值减小
  if (curr < 0 && prev < 0) return Math.abs(curr) < Math.abs(prev);
  // 转正
  return curr > prev;
}
