/**
 * 统一 K 线图颜色常量 — 中国 A 股惯例：上涨红色，下跌绿色
 * 所有 chart 组件统一引用此文件，避免颜色分散混乱
 */
export const CHART = {
  // ── 蜡烛图颜色（中国惯例）─────────────────────────────────────
  UP:   "#EF4444", // 涨：红色
  DOWN: "#22C55E", // 跌：绿色
  FLAT: "#94A3B8", // 平：灰色

  // ── 图表基础色 ────────────────────────────────────────────────
  GRID:    "#1a2f50",
  BG:      "#0d1f3c",
  AXIS:    "#94A3B8",
  LABEL:   "#64748B",
  TEXT:    "#F8FAFC",

  // ── Tooltip ──────────────────────────────────────────────────
  TT_BG:     "#0a1628",
  TT_BORDER: "#1a2f50",

  // ── 均线颜色 ─────────────────────────────────────────────────
  MA5:  "#FACC15",
  MA10: "#F97316",
  MA20: "#3B82F6",
  MA60: "#A855F7",

  // ── 布林带 ───────────────────────────────────────────────────
  BOLL_UPPER: "#94A3B8",
  BOLL_MID:   "#FACC15",
  BOLL_LOWER: "#94A3B8",

  // ── MACD ─────────────────────────────────────────────────────
  MACD_DIF: "#FACC15",
  MACD_DEA: "#3B82F6",

  // ── RSI / KDJ ────────────────────────────────────────────────
  RSI:   "#3B82F6",
  KDJ_K: "#FACC15",
  KDJ_D: "#3B82F6",
  KDJ_J: "#EF4444",

  // ── 分时走势线 ────────────────────────────────────────────────
  INTRADAY_UP:   "#EF4444", // 分时涨：红色
  INTRADAY_DOWN: "#22C55E", // 分时跌：绿色
  PREV_CLOSE:    "#FACC15", // 昨收参考线：黄色
} as const;

/** Tooltip 通用样式对象 */
export const TT_STYLE = {
  background: CHART.TT_BG,
  border: `1px solid ${CHART.TT_BORDER}`,
  borderRadius: 8,
  fontSize: 11,
} as const;

export const TT_LABEL_STYLE = { color: CHART.AXIS } as const;
