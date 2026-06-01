"use client";

/**
 * ProfitabilityCard — A 股盈利能力模块
 *
 * 功能：
 *  - 从 /api/stocks/[symbol]/financials/profit 获取利润表数据
 *  - 展示最新报告期核心指标（营收/成本/毛利/利润/同比/盈利率）
 *  - 展示近 4 期趋势对比（卡片列表）
 *  - 数据缺失显示"数据暂缺"，绝不用 0 冒充
 *  - 支持手动刷新（?refresh=1）
 *
 * 颜色规范（A股：红涨绿跌）：
 *  - 同比正增长 → 红色 #EF4444
 *  - 同比负增长 → 绿色 #00E5A8
 *  - 中性/缺失  → 灰色 #94A3B8
 *
 * 安全：TUSHARE_TOKEN 仅在服务端使用，此组件只访问本应用 API Route
 *
 * Props:
 *   symbol    — 6 位 A 股代码，如 "600519"
 *   stockName — 股票名称（用于标题显示）
 */

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ── 类型（与 financialService.ts 保持一致）──────────────────────────
interface ProfitSummaryItem {
  tsCode:    string;
  symbol:    string;
  reportDate: string;
  annDate:   string;
  period:    string;

  revenue:          number | null;
  operatingCost:    number | null;
  grossProfit:      number | null;
  operatingProfit:  number | null;
  totalProfit:      number | null;
  netProfit:        number | null;
  deductedNetProfit: number | null;
  parentNetProfit:  number | null;
  eps:              number | null;

  revenueYoY:           number | null;
  netProfitYoY:         number | null;
  deductedNetProfitYoY: number | null;

  grossMargin: number | null;
  netMargin:   number | null;

  source:    "Tushare";
  updatedAt: string;
}

interface ProfitResponse {
  ok:                  boolean;
  symbol:              string;
  tsCode?:             string;
  items:               ProfitSummaryItem[];
  total?:              number;
  incomeStatus?:       string;
  finaIndicatorStatus?: string;
  fromCache?:          boolean;
  error?:              string;
  updatedAt?:          string;
}

// ── 颜色常量 ─────────────────────────────────────────────────────────
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";
const DEEP   = "#0a1628";
const MID    = "#94A3B8";
const DIM    = "#64748B";
const RED    = "#EF4444";   // A股红（正增长）
const GREEN  = "#00E5A8";   // A股绿（负增长）或用于中性正面值
const YELLOW = "#FACC15";

// ── 辅助函数 ─────────────────────────────────────────────────────────

/** 金额 → 万/亿 显示 */
function fmtMoney(v: number | null): string {
  if (v == null) return "数据暂缺";
  const abs  = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(1)}万`;
  return `${sign}${abs.toFixed(0)}元`;
}

/** 金额简化版（用于趋势卡片） */
function fmtMoneyShort(v: number | null): string {
  if (v == null) return "--";
  const abs  = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(0)}万`;
  return `${sign}${abs.toFixed(0)}`;
}

/** 同比百分比（A股红涨绿跌） */
function fmtYoY(v: number | null): { text: string; color: string } {
  if (v == null) return { text: "--", color: MID };
  const text = `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const color = v > 0 ? RED : v < 0 ? GREEN : MID;
  return { text, color };
}

/** 百分比显示（毛利率/净利率） */
function fmtPct(v: number | null): string {
  if (v == null) return "数据暂缺";
  return `${v.toFixed(1)}%`;
}

/** 百分比颜色（高 = 红，低 = 绿，非 A 股涨跌约定，而是好/坏） */
function pctColor(v: number | null, good: number, ok: number): string {
  if (v == null) return MID;
  return v >= good ? RED : v >= ok ? YELLOW : MID;
}

/** EPS 显示 */
function fmtEps(v: number | null): string {
  if (v == null) return "数据暂缺";
  return `¥${v.toFixed(3)}`;
}

/** YYYYMMDD → 简短标签 */
function shortPeriod(endDate: string): string {
  if (!endDate || endDate.length < 8) return endDate ?? "—";
  const yy = endDate.slice(2, 4);
  const mm = endDate.slice(4, 6);
  if (mm === "03") return `${yy}Q1`;
  if (mm === "06") return `${yy}半`;
  if (mm === "09") return `${yy}Q3`;
  if (mm === "12") return `${yy}年`;
  return endDate.slice(2, 8);
}

/** 图表金额格式化 */
function chartMoneyFmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8)  return `${(v / 1e8).toFixed(0)}亿`;
  if (abs >= 1e4)  return `${(v / 1e4).toFixed(0)}万`;
  return `${v.toFixed(0)}`;
}

// ── 子组件：单指标格 ─────────────────────────────────────────────────
function MetricCell({
  label, value, color, sub,
}: {
  label:  string;
  value:  string;
  color?: string;
  sub?:   React.ReactNode;
}) {
  return (
    <div className="p-2.5 rounded-xl text-center"
      style={{ background: DEEP, border: `1px solid ${BORDER}` }}>
      <p className="font-bold text-[12px] leading-tight num"
        style={{ color: color ?? "#F8FAFC" }}>
        {value}
      </p>
      {sub && <div className="mt-0.5">{sub}</div>}
      <p className="text-[8px] mt-0.5" style={{ color: DIM }}>{label}</p>
    </div>
  );
}

// ── 子组件：趋势期卡片 ───────────────────────────────────────────────
function TrendCard({ item, isLatest }: { item: ProfitSummaryItem; isLatest: boolean }) {
  const yoyRev = fmtYoY(item.revenueYoY);
  const yoyNp  = fmtYoY(item.netProfitYoY);

  return (
    <div className="p-3 rounded-2xl flex-shrink-0"
      style={{
        background: isLatest ? "rgba(59,130,246,0.08)" : CARD,
        border: `1px solid ${isLatest ? "#3B82F655" : BORDER}`,
        minWidth: 148,
      }}>
      {/* 报告期标签 */}
      <div className="flex items-center gap-1 mb-2">
        <span className="text-[10px] font-bold" style={{ color: isLatest ? "#3B82F6" : MID }}>
          {item.period}
        </span>
        {isLatest && (
          <span className="text-[8px] px-1 rounded"
            style={{ background: "rgba(59,130,246,0.18)", color: "#3B82F6" }}>最新</span>
        )}
      </div>

      {/* 核心数值 */}
      <div className="space-y-1">
        {[
          { l: "营业收入", v: fmtMoneyShort(item.revenue) },
          { l: "净利润",   v: fmtMoneyShort(item.parentNetProfit ?? item.netProfit) },
          { l: "扣非净利润", v: item.deductedNetProfit != null ? fmtMoneyShort(item.deductedNetProfit) : "--" },
          { l: "毛利率",   v: item.grossMargin != null ? `${item.grossMargin.toFixed(1)}%` : "--" },
          { l: "净利率",   v: item.netMargin   != null ? `${item.netMargin.toFixed(1)}%`   : "--" },
        ].map(({ l, v }) => (
          <div key={l} className="flex items-center justify-between">
            <span className="text-[8px]" style={{ color: DIM }}>{l}</span>
            <span className="text-[9px] font-bold num" style={{ color: "#F8FAFC" }}>{v}</span>
          </div>
        ))}
        {/* 营收同比 */}
        <div className="flex items-center justify-between pt-0.5"
          style={{ borderTop: `1px solid ${BORDER}` }}>
          <span className="text-[8px]" style={{ color: DIM }}>营收同比</span>
          <span className="text-[9px] font-bold" style={{ color: yoyRev.color }}>{yoyRev.text}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[8px]" style={{ color: DIM }}>净利同比</span>
          <span className="text-[9px] font-bold" style={{ color: yoyNp.color }}>{yoyNp.text}</span>
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────
export default function ProfitabilityCard({
  symbol,
  stockName,
}: {
  symbol:    string;
  stockName: string;
}) {
  const [data,    setData]    = useState<ProfitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [permDenied, setPermDenied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showTrend, setShowTrend] = useState(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setPermDenied(false);
    try {
      const url = `/api/stocks/${symbol}/financials/profit?periods=8${forceRefresh ? "&refresh=1" : ""}`;
      const res  = await fetch(url);
      const json = await res.json() as ProfitResponse;

      if (!json.ok) {
        const perm =
          json.incomeStatus === "permission_denied" ||
          json.finaIndicatorStatus === "permission_denied";
        setPermDenied(perm);
        setError(
          perm
            ? "当前 Tushare 权限不足，无法获取利润表数据"
            : (json.error ?? "获取利润表数据失败"),
        );
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(`利润表数据加载失败，请稍后重试（${String(e)}）`);
    } finally {
      setLoading(false);
    }
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData(false);
  }, [fetchData, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
    fetchData(true);
  };

  // ── 加载中 ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        <SectionHeader stockName={stockName} onRefresh={handleRefresh} loading />
        <div className="space-y-2">
          {[90, 60, 60].map((h, i) => (
            <div key={i} className="rounded-2xl animate-pulse"
              style={{ background: CARD, border: `1px solid ${BORDER}`, height: h }} />
          ))}
        </div>
      </div>
    );
  }

  // ── 权限不足 ────────────────────────────────────────────────────────
  if (permDenied) {
    return (
      <div className="space-y-3">
        <SectionHeader stockName={stockName} onRefresh={handleRefresh} />
        <div className="p-4 rounded-2xl text-center"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-2xl mb-2">🔒</p>
          <p className="text-[13px] font-bold mb-1" style={{ color: "#F8FAFC" }}>利润表数据权限不足</p>
          <p className="text-[11px] leading-relaxed" style={{ color: DIM }}>
            当前 Tushare 权限不足，无法获取利润表数据。
            <br />请升级 Tushare 套餐后点击刷新。
          </p>
        </div>
      </div>
    );
  }

  // ── 加载失败 ────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="space-y-3">
        <SectionHeader stockName={stockName} onRefresh={handleRefresh} />
        <div className="p-4 rounded-2xl text-center"
          style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-[12px]" style={{ color: RED }}>⚠️ {error}</p>
          <button onClick={handleRefresh}
            className="mt-2 px-3 py-1.5 rounded-lg text-[10px] font-bold active:opacity-70"
            style={{ background: "rgba(239,68,68,0.12)", color: RED }}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.items.length === 0) return null;

  // ── 数据准备 ────────────────────────────────────────────────────────
  const latest  = data.items[0]!;
  const recent4 = data.items.slice(0, 4);  // 最近4期（含最新）

  // 趋势图数据（升序）
  const chartData = [...recent4].reverse().map(item => ({
    period:    shortPeriod(item.reportDate),
    revenue:   item.revenue    != null ? +(item.revenue / 1e8).toFixed(2)    : null,
    netProfit: item.parentNetProfit != null ? +(item.parentNetProfit / 1e8).toFixed(2) : null,
    deducted:  item.deductedNetProfit != null ? +(item.deductedNetProfit / 1e8).toFixed(2) : null,
    grossMargin: item.grossMargin,
    netMargin:   item.netMargin,
  }));

  const hasChartData = chartData.length >= 2;

  // 更新时间
  const updatedAt = latest.updatedAt
    ? new Date(latest.updatedAt).toLocaleString("zh-CN", {
        month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      })
    : "";

  // 同比颜色
  const yoyRev    = fmtYoY(latest.revenueYoY);
  const yoyNp     = fmtYoY(latest.netProfitYoY);
  const yoyDeduct = fmtYoY(latest.deductedNetProfitYoY);

  return (
    <div className="space-y-3">
      <SectionHeader stockName={stockName} onRefresh={handleRefresh} />

      {/* 报告期标签 */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: DIM }}>
            最新报告期：<span className="font-bold" style={{ color: MID }}>{latest.period}</span>
          </span>
          {latest.annDate && (
            <span className="text-[9px]" style={{ color: DIM }}>
              公告：{latest.annDate.slice(0, 4)}-{latest.annDate.slice(4, 6)}-{latest.annDate.slice(6, 8)}
            </span>
          )}
        </div>
        {data.fromCache && (
          <span className="text-[8px]" style={{ color: DIM }}>缓存 · {updatedAt}</span>
        )}
      </div>

      {/* ── 第一行：营收 / 成本 / 毛利润 */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCell label="营业收入" value={fmtMoney(latest.revenue)} />
        <MetricCell label="营业成本" value={fmtMoney(latest.operatingCost)} />
        <MetricCell
          label="毛利润"
          value={fmtMoney(latest.grossProfit)}
          color={latest.grossProfit != null && latest.grossProfit > 0 ? "#F8FAFC" : MID}
        />
      </div>

      {/* ── 第二行：营业利润 / 利润总额 / 净利润 */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCell label="营业利润" value={fmtMoney(latest.operatingProfit)} />
        <MetricCell label="利润总额" value={fmtMoney(latest.totalProfit)} />
        <MetricCell
          label="净利润"
          value={fmtMoney(latest.netProfit)}
          color={latest.netProfit != null ? (latest.netProfit >= 0 ? "#F8FAFC" : GREEN) : MID}
        />
      </div>

      {/* ── 第三行：扣非净利润 / 归母净利润 / EPS */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCell
          label="扣非净利润"
          value={latest.deductedNetProfit != null ? fmtMoney(latest.deductedNetProfit) : "数据暂缺"}
        />
        <MetricCell
          label="归母净利润"
          value={fmtMoney(latest.parentNetProfit)}
          color={latest.parentNetProfit != null ? (latest.parentNetProfit >= 0 ? "#F8FAFC" : GREEN) : MID}
        />
        <MetricCell
          label="每股收益 EPS"
          value={fmtEps(latest.eps)}
          color={latest.eps != null ? (latest.eps >= 0 ? "#F8FAFC" : GREEN) : MID}
        />
      </div>

      {/* ── 同比 / 盈利率 */}
      <div className="p-3 rounded-2xl"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <p className="text-[9px] font-bold mb-2" style={{ color: DIM }}>同比增速</p>
        <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          {[
            { l: "营收同比",     ...yoyRev },
            { l: "净利润同比",   ...yoyNp },
            { l: "扣非同比",     ...yoyDeduct },
          ].map(({ l, text, color }) => (
            <div key={l} className="text-center">
              <p className="font-black text-[13px] num" style={{ color }}>{text}</p>
              <p className="text-[8px] mt-0.5" style={{ color: DIM }}>{l}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <p className="text-[9px] font-bold mb-2" style={{ color: DIM }}>盈利能力</p>
          <div className="grid grid-cols-2 gap-x-3">
            <div className="text-center">
              <p className="font-black text-[13px] num"
                style={{ color: pctColor(latest.grossMargin, 40, 20) }}>
                {fmtPct(latest.grossMargin)}
              </p>
              <p className="text-[8px] mt-0.5" style={{ color: DIM }}>毛利率</p>
            </div>
            <div className="text-center">
              <p className="font-black text-[13px] num"
                style={{ color: pctColor(latest.netMargin, 20, 8) }}>
                {fmtPct(latest.netMargin)}
              </p>
              <p className="text-[8px] mt-0.5" style={{ color: DIM }}>净利率</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 近 4 期趋势（卡片列表） */}
      {recent4.length > 1 && (
        <div>
          <button
            onClick={() => setShowTrend(t => !t)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <span className="text-[11px] font-bold" style={{ color: MID }}>
              📈 近 {recent4.length} 期利润趋势
            </span>
            <span className="text-[9px]" style={{ color: DIM }}>
              {showTrend ? "收起 ▲" : "展开 ▼"}
            </span>
          </button>

          {showTrend && (
            <div className="mt-2 space-y-3">
              {/* 趋势卡片横滑 */}
              <div className="flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: "none" }}>
                {recent4.map((item, i) => (
                  <TrendCard key={item.reportDate} item={item} isLatest={i === 0} />
                ))}
              </div>

              {/* 趋势图 */}
              {hasChartData && (
                <div className="space-y-3">
                  {/* 营收 + 净利润折线 */}
                  <div className="p-3 rounded-2xl"
                    style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    <p className="text-[9px] font-bold mb-2" style={{ color: DIM }}>
                      营收 / 净利润趋势（亿元）
                    </p>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={chartData}
                        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke="#1a2f50" strokeDasharray="3 3" />
                        <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#64748B" }} />
                        <YAxis
                          tick={{ fontSize: 9, fill: "#64748B" }}
                          tickFormatter={v => `${v}亿`}
                          width={36}
                        />
                        <Tooltip
                          contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 10 }}
                          labelStyle={{ color: "#94A3B8" }}
                          formatter={(v: unknown, name: unknown) => [
                            `${Number(v ?? 0)}亿`,
                            name === "revenue" ? "营业收入" : name === "netProfit" ? "净利润" : "扣非净利润",
                          ]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
                          formatter={(v: string) =>
                            v === "revenue" ? "营业收入" : v === "netProfit" ? "净利润" : "扣非净利润"
                          }
                        />
                        <Line
                          type="monotone" dataKey="revenue"
                          stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone" dataKey="netProfit"
                          stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }}
                          connectNulls
                        />
                        {chartData.some(d => d.deducted != null) && (
                          <Line
                            type="monotone" dataKey="deducted"
                            stroke="#FACC15" strokeWidth={1.5} dot={{ r: 2 }}
                            strokeDasharray="4 2"
                            connectNulls
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 毛利率 + 净利率折线 */}
                  {chartData.some(d => d.grossMargin != null || d.netMargin != null) && (
                    <div className="p-3 rounded-2xl"
                      style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                      <p className="text-[9px] font-bold mb-2" style={{ color: DIM }}>
                        毛利率 / 净利率趋势（%）
                      </p>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={chartData}
                          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid stroke="#1a2f50" strokeDasharray="3 3" />
                          <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#64748B" }} />
                          <YAxis
                            tick={{ fontSize: 9, fill: "#64748B" }}
                            tickFormatter={v => `${v}%`}
                            width={32}
                          />
                          <Tooltip
                            contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 10 }}
                            labelStyle={{ color: "#94A3B8" }}
                            formatter={(v: unknown, name: unknown) => [
                              `${Number(v ?? 0).toFixed(1)}%`,
                              name === "grossMargin" ? "毛利率" : "净利率",
                            ]}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
                            formatter={(v: string) => v === "grossMargin" ? "毛利率" : "净利率"}
                          />
                          <Line
                            type="monotone" dataKey="grossMargin"
                            stroke="#00E5A8" strokeWidth={2} dot={{ r: 3 }}
                            connectNulls
                          />
                          <Line
                            type="monotone" dataKey="netMargin"
                            stroke="#FACC15" strokeWidth={2} dot={{ r: 3 }}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 数据来源 + 免责 */}
      <div className="px-1 flex items-center justify-between">
        <p className="text-[8px]" style={{ color: "#475569" }}>
          数据来源：Tushare · 仅供参考，不构成投资建议
        </p>
        {!data.fromCache && (
          <p className="text-[8px]" style={{ color: "#475569" }}>{updatedAt}</p>
        )}
      </div>
    </div>
  );
}

// ── 子组件：标题栏 ────────────────────────────────────────────────────
function SectionHeader({
  stockName, onRefresh, loading,
}: {
  stockName: string;
  onRefresh: () => void;
  loading?:  boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-bold text-[13px]" style={{ color: "#94A3B8" }}>
        💰 盈利能力
      </h2>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold active:opacity-70"
        style={{
          background: "rgba(59,130,246,0.1)",
          color:      "#3B82F6",
          border:     "1px solid rgba(59,130,246,0.2)",
          opacity:    loading ? 0.5 : 1,
        }}>
        {loading ? "⏳" : "🔄"} 刷新
      </button>
    </div>
  );
}
