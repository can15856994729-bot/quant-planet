/**
 * lib/orderBookUtils.ts
 *
 * 盘口数据格式化工具函数 — 可在客户端和服务端中使用。
 * 与 OrderBookCard.tsx 中的内联 format 函数保持一致，作为独立导出版本。
 */

/**
 * 格式化盘口成交量（手）→ 显示字符串
 * @example formatOrderBookVolume(3456) → "3456手"
 * @example formatOrderBookVolume(12345) → "1.2万手"
 */
export function formatOrderBookVolume(shares: number): string {
  if (!isFinite(shares) || shares < 0) return "--";
  if (shares >= 10_000) return `${(shares / 10_000).toFixed(1)}万手`;
  return `${Math.round(shares)}手`;
}

/**
 * 格式化金额（元）→ 亿 / 万 / 元
 * @example formatAmount(1234567890) → "12.3亿"
 * @example formatAmount(12345678)   → "1234.6万"
 * @example formatAmount(12345)      → "1.2万"
 */
export function formatAmount(yuan: number): string {
  if (!isFinite(yuan) || yuan < 0) return "--";
  const abs = Math.abs(yuan);
  if (abs >= 1e8) return `${(yuan / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4) return `${(yuan / 1e4).toFixed(1)}万`;
  return `${Math.round(yuan)}元`;
}

/**
 * 格式化封单（量 + 金额合并显示）
 * @example formatSealAmount(500, 2e7) → "500手 / 2000.0万"
 */
export function formatSealAmount(vol: number, amt: number): string {
  const volStr = formatOrderBookVolume(vol);
  const amtStr = formatAmount(amt);
  if (volStr === "--" && amtStr === "--") return "--";
  return `${volStr} / ${amtStr}`;
}

/**
 * 格式化委比（范围 -100~+100，值已是百分比）
 * @example formatCommissionRatio(23.45) → "+23.45%"
 * @example formatCommissionRatio(-5.1)  → "-5.10%"
 */
export function formatCommissionRatio(ratio: number): string {
  if (!isFinite(ratio)) return "--";
  return `${ratio >= 0 ? "+" : ""}${ratio.toFixed(2)}%`;
}

/**
 * 格式化量比
 * @example formatVolumeRatio(1.234) → "1.23"
 * @example formatVolumeRatio(0.5)   → "0.50"
 */
export function formatVolumeRatio(ratio: number): string {
  if (!isFinite(ratio) || ratio < 0) return "--";
  return ratio.toFixed(2);
}
