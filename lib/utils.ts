import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Market, Currency } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, currency: Currency = "CNY"): string {
  const symbols: Record<Currency, string> = { CNY: "¥", HKD: "HK$", USD: "$" };
  return `${symbols[currency]}${price.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(pct: number, showSign = true): string {
  const sign = showSign && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatVolume(vol: number): string {
  if (vol >= 100000000) return `${(vol / 100000000).toFixed(2)}亿`;
  if (vol >= 10000) return `${(vol / 10000).toFixed(2)}万`;
  return vol.toString();
}

export function formatMarket(market: Market): string {
  return { A: "A股", HK: "港股", US: "美股" }[market];
}

export function marketColor(market: Market): string {
  return { A: "#00E5A8", HK: "#3B82F6", US: "#FACC15" }[market];
}

export function marketToCurrency(market: Market): Currency {
  if (market === "HK") return "HKD";
  if (market === "US") return "USD";
  return "CNY";
}

// ── 涨跌颜色常量（A股惯例：涨红跌绿）────────────────────────────
// 全 App 统一引用，禁止在各页面单独硬编码价格涨跌颜色
export const PRICE_UP_COLOR   = "#EF4444"; // 涨：红色
export const PRICE_DOWN_COLOR = "#22C55E"; // 跌：绿色
export const PRICE_FLAT_COLOR = "#94A3B8"; // 平：灰色

/** 根据涨跌值返回 A股标准颜色：上涨红色 / 下跌绿色 / 平盘灰色 */
export function pnlColor(val: number): string {
  if (val > 0) return PRICE_UP_COLOR;   // 涨：红色
  if (val < 0) return PRICE_DOWN_COLOR; // 跌：绿色
  return PRICE_FLAT_COLOR;
}

export function riskColor(risk: string): string {
  if (risk === "低") return "#00E5A8";
  if (risk === "中") return "#FACC15";
  return "#EF4444";
}

export function signalTypeLabel(type: string): string {
  const map: Record<string, string> = {
    BUY: "买入信号",
    SELL: "卖出信号",
    STOP_LOSS: "止损提醒",
    BREAKOUT: "突破提醒",
    VOLUME: "放量提醒",
    GOLDEN_CROSS: "均线金叉",
    HIGH_RISK: "风险过高",
  };
  return map[type] ?? type;
}

export function signalTypeColor(type: string): string {
  const map: Record<string, string> = {
    BUY: "#00E5A8",
    SELL: "#EF4444",
    STOP_LOSS: "#EF4444",
    BREAKOUT: "#3B82F6",
    VOLUME: "#FACC15",
    GOLDEN_CROSS: "#00E5A8",
    HIGH_RISK: "#EF4444",
  };
  return map[type] ?? "#94A3B8";
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#00E5A8";
  if (score >= 60) return "#FACC15";
  return "#EF4444";
}
