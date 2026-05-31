"use client";
/**
 * TradeKlineModal.tsx — 单笔交易 K 线区间详情弹窗
 *
 * 展示某笔回测交易前后的 K 线图，标注买入/卖出点、持仓区间、风险事件。
 * K 线数据来自 Tushare daily（POST /api/tushare/trade-kline），不使用 mock。
 *
 * Props:
 *   trade      — 交易记录（通用格式，所有策略均可使用）
 *   tsCode     — 股票代码，如 "600381.SH"
 *   stockName  — 股票名称
 *   symbol     — 6位代码
 *   onClose    — 关闭回调
 */
import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceArea,
} from "recharts";
import { X, AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";

// ── 颜色 ─────────────────────────────────────────────────────────────
const R   = "#EF4444";
const G   = "#00E5A8";
const Y   = "#FACC15";
const B   = "#3B82F6";
const DIM = "#64748B";
const MID = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";
const BG     = "#07111F";

// ── 通用交易记录接口（适配所有回测策略） ─────────────────────────────
export interface TradeKlineRecord {
  buyDate:       string;   // YYYYMMDD
  buyPrice:      number;
  buyShares:     number;
  buyAmount:     number;
  sellDate:      string;   // YYYYMMDD
  sellPrice:     number;
  sellShares:    number;
  sellAmount:    number;
  holdDays:      number;
  pnl:           number;
  pnlPct:        number;
  commission?:   number;
  stampDuty?:    number;
  slippageCost?: number;
  sellReason:    string;
  riskEvents?:   string[];
}

interface KlineBar {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  vol:    number;
  pctChg: number;
  ma5?:   number | null;
  ma10?:  number | null;
  ma20?:  number | null;
}

export interface TradeKlineModalProps {
  trade:     TradeKlineRecord;
  tsCode:    string;
  stockName: string;
  symbol:    string;
  onClose:   () => void;
}

// ── 辅助映射 ──────────────────────────────────────────────────────────
const SELL_REASON_LABEL: Record<string, string> = {
  stop_loss:              "止损",
  take_profit:            "止盈",
  ma20_breakdown:         "跌破MA20",
  low_score:              "评分下降",
  time_stop:              "时间止损",
  consecutive_limit_down: "连续跌停",
  final_close:            "回测收盘平仓",
  signal:                 "策略调仓",
};
const SELL_REASON_COLOR: Record<string, string> = {
  stop_loss:              G,
  take_profit:            R,
  ma20_breakdown:         Y,
  low_score:              Y,
  time_stop:              Y,
  consecutive_limit_down: R,
  final_close:            MID,
  signal:                 B,
};
const SELL_REASON_NOTE: Record<string, string> = {
  stop_loss:              "价格触发止损线，策略强制卖出以控制最大亏损。",
  take_profit:            "价格上涨触发止盈线（MA5/MA10跌破），策略锁定收益。",
  ma20_breakdown:         "价格跌破MA20，趋势逆转信号，策略自动卖出。",
  low_score:              "综合评分下降至阈值以下，策略认为持有条件已不满足。",
  time_stop:              "持仓超过最大天数限制，时间止损自动平仓。",
  consecutive_limit_down: "连续跌停后首个可交易日，策略强制卖出以规避流动性风险。",
  final_close:            "回测结束日期到达，强制平仓清算所有持仓，非策略信号。",
  signal:                 "策略调仓信号触发（评分更高的新标的出现），切换持仓。",
};

function fmtDate(ymd: string) {
  if (!ymd || ymd.length < 8) return ymd;
  return `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`;
}
function fmtMoney(n: number) {
  if (Math.abs(n) >= 1e8) return `${(n/1e8).toFixed(2)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n/1e4).toFixed(1)}万`;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

// ── 自定义 Tooltip ────────────────────────────────────────────────────
function KlineTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { name: string; value: number | null }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const items = payload.filter(p => p.value != null && !isNaN(Number(p.value)));
  if (items.length === 0) return null;
  return (
    <div className="px-2.5 py-2 rounded-xl text-[10px] space-y-0.5"
      style={{ background: "#091828", border: `1px solid ${BORDER}`, boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }}>
      <p className="font-bold mb-1" style={{ color: MID }}>
        {typeof label === "string" && label.length === 8
          ? `${label.slice(0,4)}-${label.slice(4,6)}-${label.slice(6,8)}`
          : label}
      </p>
      {items.map((p, i) => {
        const name =
          p.name === "close" ? "收盘价" :
          p.name === "ma5"   ? "MA5"   :
          p.name === "ma10"  ? "MA10"  :
          p.name === "ma20"  ? "MA20"  :
          p.name === "buy"   ? "▲买入" :
          p.name === "sell"  ? "▼卖出" : p.name;
        const color =
          p.name === "close" ? "#F8FAFC" :
          p.name === "ma5"   ? B :
          p.name === "ma10"  ? Y :
          p.name === "ma20"  ? R :
          p.name === "buy"   ? G : R;
        return (
          <div key={i} className="flex items-center justify-between gap-4">
            <span style={{ color: DIM }}>{name}</span>
            <span className="font-bold" style={{ color }}>
              ¥{Number(p.value).toFixed(3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────
export default function TradeKlineModal({
  trade, tsCode, stockName, symbol, onClose,
}: TradeKlineModalProps) {
  const [klines,  setKlines]  = useState<KlineBar[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const isProfit   = trade.pnl >= 0;
  const reasonLabel = SELL_REASON_LABEL[trade.sellReason] ?? trade.sellReason;
  const reasonColor = SELL_REASON_COLOR[trade.sellReason] ?? MID;
  const reasonNote  = SELL_REASON_NOTE[trade.sellReason]  ?? "详细卖出原因数据暂缺。";
  const totalFee = (trade.commission ?? 0) + (trade.stampDuty ?? 0) + (trade.slippageCost ?? 0);

  // ── 获取 K 线数据 ──────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    setKlines(null);

    fetch("/api/tushare/trade-kline", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ tsCode, buyDate: trade.buyDate, sellDate: trade.sellDate }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok && Array.isArray(d.klines) && d.klines.length > 0) {
          setKlines(d.klines as KlineBar[]);
        } else {
          setError(d.error ?? "K线数据为空，该区间可能无交易数据");
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tsCode, trade.buyDate, trade.sellDate]);

  // ── 图表数据 ───────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!klines) return [];
    return klines.map(k => ({
      date:  k.date,
      close: k.close,
      ma5:   k.ma5  ?? null,
      ma10:  k.ma10 ?? null,
      ma20:  k.ma20 ?? null,
      buy:   k.date === trade.buyDate  ? trade.buyPrice  : null,
      sell:  k.date === trade.sellDate ? trade.sellPrice : null,
    }));
  }, [klines, trade.buyDate, trade.sellDate, trade.buyPrice, trade.sellPrice]);

  // ── 价格域（确保买卖点在视图内） ──────────────────────────────────
  const { priceMin, priceMax } = useMemo(() => {
    if (!klines || klines.length === 0) return { priceMin: 0, priceMax: 1 };
    const all = klines.flatMap(k => [k.close, k.high, k.low]).filter(Boolean);
    all.push(trade.buyPrice, trade.sellPrice);
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.08;
    return { priceMin: min - pad, priceMax: max + pad };
  }, [klines, trade.buyPrice, trade.sellPrice]);

  // ── 持仓区间（映射到实际交易日） ──────────────────────────────────
  const { holdStart, holdEnd } = useMemo(() => {
    if (!chartData.length) return { holdStart: "", holdEnd: "" };
    const hs = chartData.find(d => d.date >= trade.buyDate)?.date ?? trade.buyDate;
    const he = [...chartData].reverse().find(d => d.date <= trade.sellDate)?.date ?? trade.sellDate;
    return { holdStart: hs, holdEnd: he };
  }, [chartData, trade.buyDate, trade.sellDate]);

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: BG, zIndex: 300 }}>

      {/* ── 顶部栏 ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 flex-shrink-0"
        style={{
          background: CARD,
          borderBottom: `1px solid ${BORDER}`,
          paddingTop:    "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "12px",
        }}>
        <div className="flex-1 min-w-0 mr-3">
          <p className="font-black text-[15px] truncate" style={{ color: "#F8FAFC" }}>
            {stockName}
          </p>
          <p className="text-[10px]" style={{ color: DIM }}>
            {symbol} · {tsCode} · 交易K线区间详情
          </p>
        </div>
        <button onClick={onClose}
          className="flex-shrink-0 p-2 rounded-xl active:opacity-70"
          style={{ background: "#0a1628" }}>
          <X size={18} color={MID} />
        </button>
      </div>

      {/* ── 可滚动内容 ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto"
        style={{
          minHeight: 0,
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
        }}>

        {/* ── 交易概要卡片 ─────────────────────────────────────────── */}
        <div className="mx-4 mt-4 p-3 rounded-2xl"
          style={{ background: CARD, border: `1px solid ${isProfit ? R+"44" : G+"44"}` }}>

          {/* 盈亏大字 + 持仓概要 */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                {isProfit
                  ? <TrendingUp  size={13} color={R} />
                  : <TrendingDown size={13} color={G} />}
                <span className="text-[11px] font-bold" style={{ color: isProfit ? R : G }}>
                  {isProfit ? "盈利" : "亏损"}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: `${reasonColor}18`,
                    color:  reasonColor,
                    border: `1px solid ${reasonColor}44`,
                  }}>
                  {reasonLabel}
                </span>
              </div>
              <p className="font-black text-[26px] leading-none num"
                style={{ color: isProfit ? R : G }}>
                {isProfit ? "+" : ""}{trade.pnlPct.toFixed(2)}%
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: MID }}>
                {isProfit ? "+" : ""}¥{fmtMoney(Math.abs(trade.pnl))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold" style={{ color: DIM }}>
                持仓 {trade.holdDays} 天
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: DIM }}>
                {fmtDate(trade.buyDate)}
              </p>
              <p className="text-[9px]" style={{ color: DIM }}>
                ~ {fmtDate(trade.sellDate)}
              </p>
            </div>
          </div>

          {/* 买卖详情双列 */}
          <div className="grid grid-cols-2 gap-2">
            {/* 买入 */}
            <div className="p-2 rounded-xl"
              style={{ background: "rgba(0,229,168,0.06)", border: `1px solid ${G}22` }}>
              <p className="text-[9px] font-bold mb-1.5" style={{ color: G }}>▲ 买入</p>
              {[
                { k: "日期", v: fmtDate(trade.buyDate) },
                { k: "价格", v: `¥${trade.buyPrice.toFixed(3)}` },
                { k: "数量", v: `${trade.buyShares.toLocaleString()}股` },
                { k: "金额", v: `¥${fmtMoney(trade.buyAmount)}` },
              ].map(({ k, v }) => (
                <div key={k} className="flex justify-between items-center py-0.5">
                  <span className="text-[9px]" style={{ color: DIM }}>{k}</span>
                  <span className="text-[9px] font-bold" style={{ color: MID }}>{v}</span>
                </div>
              ))}
            </div>
            {/* 卖出 */}
            <div className="p-2 rounded-xl"
              style={{ background: "rgba(239,68,68,0.06)", border: `1px solid ${R}22` }}>
              <p className="text-[9px] font-bold mb-1.5" style={{ color: R }}>▼ 卖出</p>
              {[
                { k: "日期", v: fmtDate(trade.sellDate) },
                { k: "价格", v: `¥${trade.sellPrice.toFixed(3)}` },
                { k: "数量", v: `${trade.sellShares.toLocaleString()}股` },
                { k: "金额", v: `¥${fmtMoney(trade.sellAmount)}` },
              ].map(({ k, v }) => (
                <div key={k} className="flex justify-between items-center py-0.5">
                  <span className="text-[9px]" style={{ color: DIM }}>{k}</span>
                  <span className="text-[9px] font-bold" style={{ color: MID }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 费用行 */}
          {totalFee > 0 && (
            <div className="mt-2 pt-2 border-t flex flex-wrap gap-x-3 gap-y-0.5"
              style={{ borderColor: BORDER }}>
              {(trade.commission  ?? 0) > 0 && <span className="text-[9px]"><span style={{ color: DIM }}>手续费：</span><span style={{ color: MID }}>¥{(trade.commission!).toFixed(2)}</span></span>}
              {(trade.stampDuty   ?? 0) > 0 && <span className="text-[9px]"><span style={{ color: DIM }}>印花税：</span><span style={{ color: MID }}>¥{(trade.stampDuty!).toFixed(2)}</span></span>}
              {(trade.slippageCost?? 0) > 0 && <span className="text-[9px]"><span style={{ color: DIM }}>滑点：</span><span style={{ color: MID }}>¥{(trade.slippageCost!).toFixed(2)}</span></span>}
              <span className="text-[9px]"><span style={{ color: DIM }}>总费用：</span><span className="font-bold" style={{ color: MID }}>¥{totalFee.toFixed(2)}</span></span>
            </div>
          )}
        </div>

        {/* ── K 线图区域 ───────────────────────────────────────────── */}
        <div className="mx-4 mt-3 p-3 rounded-2xl"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>

          {/* 标题行 */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold" style={{ color: MID }}>
              📈 K线区间图
            </p>
            <p className="text-[9px]" style={{ color: DIM }}>
              买入前30日 ~ 卖出后15日
            </p>
          </div>

          {/* 图例 */}
          <div className="flex flex-wrap gap-3 mb-3">
            {[
              { color: "#F8FAFC", label: "收盘价" },
              { color: B,          label: "MA5"  },
              { color: Y,          label: "MA10" },
              { color: R,          label: "MA20" },
              { color: G,          label: "▲买入" },
              { color: isProfit ? R : G, label: "▼卖出" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1 text-[9px]">
                <span className="inline-block w-3 h-0.5 rounded" style={{ background: color }} />
                <span style={{ color: MID }}>{label}</span>
              </span>
            ))}
          </div>

          {/* 加载中 */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: B, borderTopColor: "transparent" }} />
              <p className="text-[11px]" style={{ color: DIM }}>
                正在从 Tushare 获取 K 线数据…
              </p>
            </div>
          )}

          {/* 错误 */}
          {!loading && error && (
            <div className="flex items-start gap-2 p-3 rounded-xl"
              style={{ background: "rgba(239,68,68,0.06)", border: `1px solid ${R}33` }}>
              <AlertTriangle size={13} color={R} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[11px]" style={{ color: R }}>
                  该交易区间 K 线数据加载失败
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: MID }}>{error}</p>
                <p className="text-[9px] mt-1" style={{ color: DIM }}>
                  可能原因：Tushare 未连接 / Token 未配置 / 该股票历史数据不足。
                </p>
              </div>
            </div>
          )}

          {/* 图表 */}
          {!loading && !error && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={248}>
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: DIM, fontSize: 8 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  tickFormatter={d => `${d.slice(4,6)}/${d.slice(6,8)}`}
                />
                <YAxis
                  domain={[priceMin, priceMax]}
                  tick={{ fill: DIM, fontSize: 8 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => v.toFixed(2)}
                  width={44}
                />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip content={<KlineTooltip />} />

                {/* 持仓区间高亮背景 */}
                {holdStart && holdEnd && (
                  <ReferenceArea
                    x1={holdStart}
                    x2={holdEnd}
                    fill={isProfit
                      ? "rgba(239,68,68,0.07)"
                      : "rgba(0,229,168,0.07)"}
                    stroke={isProfit
                      ? "rgba(239,68,68,0.35)"
                      : "rgba(0,229,168,0.35)"}
                    strokeWidth={1}
                    strokeDasharray="5 3"
                  />
                )}

                {/* 收盘价 */}
                <Line
                  dataKey="close"
                  stroke="#F8FAFC"
                  strokeWidth={1.5}
                  dot={false}
                  name="close"
                  connectNulls
                />
                {/* MA5 */}
                <Line dataKey="ma5"  stroke={B} strokeWidth={1} dot={false}
                  strokeDasharray="5 3" name="ma5"  connectNulls />
                {/* MA10 */}
                <Line dataKey="ma10" stroke={Y} strokeWidth={1} dot={false}
                  strokeDasharray="5 3" name="ma10" connectNulls />
                {/* MA20 */}
                <Line dataKey="ma20" stroke={R} strokeWidth={1} dot={false}
                  strokeDasharray="5 3" name="ma20" connectNulls />

                {/* 买入点 ▲ */}
                <Scatter
                  dataKey="buy"
                  name="buy"
                  fill={G}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  shape={(props: any) => {
                    const cx = props.cx as number;
                    const cy = props.cy as number;
                    if (!props.value) return <g />;
                    return (
                      <g>
                        <polygon
                          points={`${cx},${cy-12} ${cx-8},${cy+4} ${cx+8},${cy+4}`}
                          fill={G}
                        />
                        <text
                          x={cx} y={cy-16}
                          textAnchor="middle"
                          fill={G} fontSize={9} fontWeight="bold">
                          买
                        </text>
                      </g>
                    );
                  }}
                />

                {/* 卖出点 ▼ */}
                <Scatter
                  dataKey="sell"
                  name="sell"
                  fill={isProfit ? R : G}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  shape={(props: any) => {
                    const cx = props.cx as number;
                    const cy = props.cy as number;
                    if (!props.value) return <g />;
                    const color = isProfit ? R : G;
                    return (
                      <g>
                        <polygon
                          points={`${cx},${cy+12} ${cx-8},${cy-4} ${cx+8},${cy-4}`}
                          fill={color}
                        />
                        <text
                          x={cx} y={cy+24}
                          textAnchor="middle"
                          fill={color} fontSize={9} fontWeight="bold">
                          卖
                        </text>
                      </g>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {!loading && !error && chartData.length === 0 && (
            <p className="text-[11px] py-10 text-center" style={{ color: DIM }}>
              该日期范围内无 K 线数据
            </p>
          )}

          {/* 持仓区间说明 */}
          {!loading && !error && holdStart && holdEnd && (
            <p className="text-[9px] mt-2 px-1" style={{ color: DIM }}>
              <span style={{ color: isProfit ? R : G }}>█</span>
              {" "}半透明背景区域为持仓区间（{fmtDate(trade.buyDate)} ~ {fmtDate(trade.sellDate)}，共 {trade.holdDays} 天）
            </p>
          )}
        </div>

        {/* ── 信号解释 ─────────────────────────────────────────────── */}
        <div className="mx-4 mt-3 p-3 rounded-2xl"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[11px] font-bold mb-2.5" style={{ color: MID }}>📋 信号解释</p>

          <div className="space-y-3">
            {/* 买入条件 */}
            <div>
              <p className="text-[10px] font-bold mb-1.5" style={{ color: G }}>
                ▲ 买入条件（满足以下条件触发）
              </p>
              <div className="space-y-1">
                {[
                  "价格站上 MA20（中期趋势向好）",
                  "MA5 上穿 MA20（短期金叉信号）",
                  "流动性达标（20日均成交额满足设定阈值）",
                  "综合评分达到策略阈值（评分包含趋势、成交量、风险等维度）",
                ].map(t => (
                  <div key={t} className="flex items-start gap-1.5">
                    <span className="text-[9px] flex-shrink-0 mt-0.5" style={{ color: G }}>✓</span>
                    <p className="text-[9px]" style={{ color: DIM }}>{t}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 卖出原因 */}
            <div>
              <p className="text-[10px] font-bold mb-1.5" style={{ color: reasonColor }}>
                ▼ 卖出原因：{reasonLabel}
              </p>
              <p className="text-[9px] leading-[1.7]" style={{ color: DIM }}>{reasonNote}</p>
            </div>

            {/* 风险事件 */}
            {trade.riskEvents && trade.riskEvents.length > 0 && (
              <div>
                <p className="text-[10px] font-bold mb-1.5" style={{ color: Y }}>
                  ⚠️ 期间风险事件（{trade.riskEvents.length} 条）
                </p>
                <div className="space-y-1">
                  {trade.riskEvents.map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertTriangle size={9} color={Y} className="flex-shrink-0 mt-0.5" />
                      <p className="text-[9px]" style={{ color: DIM }}>{e}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 数据说明 ─────────────────────────────────────────────── */}
        <div className="mx-4 mt-3 mb-2 flex items-start gap-1.5">
          <Activity size={10} color={DIM} className="flex-shrink-0 mt-0.5" />
          <p className="text-[9px] leading-[1.6]" style={{ color: DIM }}>
            K 线数据来自 Tushare daily · 原始价格（不复权）·
            展示区间：买入日前30个日历天 ~ 卖出日后15个日历天
          </p>
        </div>

      </div>
    </div>
  );
}
