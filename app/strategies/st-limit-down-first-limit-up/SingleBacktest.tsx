"use client";
/**
 * SingleBacktest.tsx — 单只股票回测
 *
 * 用户输入 ST 股票代码，展示：
 * 1. 连续跌停 + 首板涨停检测结果
 * 2. 回测交易详情
 * 3. K 线标注图（跌停区间 + 首板 + 买卖信号）
 * 4. 收益统计
 */

import { useState } from "react";
import { Search, BarChart3, AlertTriangle, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import type {
  STFirstLimitUpBacktestResult,
  STFirstLimitUpSingleResult,
  STFirstLimitUpParams,
  DayBar,
} from "@/lib/stLimitDownFirstLimitUpService";

import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter,
} from "recharts";

// ── 颜色 ───────────────────────────────────────────────────────
const R    = "#EF4444";
const G    = "#00E5A8";
const Y    = "#FACC15";
const B    = "#3B82F6";
const DIM  = "#64748B";
const MID  = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

// ── K 线图 ──────────────────────────────────────────────────────
function BacktestKlineChart({
  bars,
  streakStartDate,
  streakEndDate,
  firstLimitUpDate,
}: {
  bars: STFirstLimitUpBacktestResult["bars"];
  streakStartDate?: string;
  streakEndDate?:   string;
  firstLimitUpDate?: string;
}) {
  const data = [...bars].reverse().slice(-80);
  if (data.length === 0) return null;

  const tickFmt = (v: string) =>
    v?.length === 8 ? `${v.slice(4, 6)}/${v.slice(6, 8)}` : v;

  // 标注买卖散点
  const buyDots  = data.filter(b => b.signal === "buy").map(b => ({ date: b.date, price: b.close }));
  const sellDots = data.filter(b => b.signal && b.signal !== "buy").map(b => ({ date: b.date, price: b.close, signal: b.signal }));

  return (
    <div style={{ background: "#0d1f3c", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 8px", marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8, paddingLeft: 8 }}>
        <span style={{ fontSize: 10, color: R, display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 12, height: 6, background: "rgba(239,68,68,0.25)", display: "inline-block", borderRadius: 2 }} />
          跌停区间
        </span>
        <span style={{ fontSize: 10, color: G, display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 10, height: 10, background: G, borderRadius: 5, display: "inline-block" }} />
          买入信号
        </span>
        <span style={{ fontSize: 10, color: Y, display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 10, height: 10, background: Y, borderRadius: 5, display: "inline-block" }} />
          卖出/止损
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
          <XAxis dataKey="date" tickFormatter={tickFmt}
            tick={{ fontSize: 9, fill: "#64748B" }} tickLine={false} axisLine={false}
            interval="preserveStartEnd" />
          <YAxis domain={["auto", "auto"]}
            tick={{ fontSize: 9, fill: "#64748B" }} tickLine={false} axisLine={false}
            width={44} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip
            contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: "#94A3B8" }}
            formatter={(v: unknown, name: string | number | undefined) => [
              typeof v === "number" ? v.toFixed(2) : String(v),
              name === "close" ? "收盘价" : String(name ?? ""),
            ]}
          />

          {/* 跌停区间 */}
          {streakStartDate && streakEndDate && (
            <ReferenceArea
              x1={streakStartDate} x2={streakEndDate}
              fill="rgba(239,68,68,0.15)" stroke="#EF4444" strokeWidth={1}
            />
          )}

          {/* 首板涨停线 */}
          {firstLimitUpDate && (
            <ReferenceLine
              x={firstLimitUpDate}
              stroke={G} strokeWidth={2} strokeDasharray="4 2"
              label={{ value: "首板", position: "insideTopRight", fill: G, fontSize: 10 }}
            />
          )}

          {/* 收盘价线 */}
          <Line
            type="monotone" dataKey="close" stroke="#60A5FA"
            dot={(props: Record<string, unknown>) => {
              const bar = props.payload as (DayBar & { signal?: string });
              if (bar.signal === "buy") {
                return <circle key={`buy-${bar.date}`} cx={Number(props.cx)} cy={Number(props.cy)} r={5} fill={G} stroke={G} />;
              }
              if (bar.signal === "stop_loss") {
                return <circle key={`sl-${bar.date}`} cx={Number(props.cx)} cy={Number(props.cy)} r={5} fill={R} stroke={R} />;
              }
              if (bar.signal === "take_profit") {
                return <circle key={`tp-${bar.date}`} cx={Number(props.cx)} cy={Number(props.cy)} r={5} fill={G} stroke={G} />;
              }
              if (bar.signal === "time_stop" || bar.signal === "sell") {
                return <circle key={`sell-${bar.date}`} cx={Number(props.cx)} cy={Number(props.cy)} r={5} fill={Y} stroke={Y} />;
              }
              return <g key={`dot-${bar.date}`} />;
            }}
            activeDot={{ r: 4 }}
            strokeWidth={1.5}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 评分卡 ──────────────────────────────────────────────────────
function ScoreCard({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{ background: "#0a1628", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
      <p style={{ fontSize: 18, fontWeight: 800, color }}>{value}</p>
      <p style={{ fontSize: 10, color: MID, marginTop: 2 }}>{label}</p>
      {sub && <p style={{ fontSize: 9, color: DIM, marginTop: 1 }}>{sub}</p>}
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────
export default function SingleBacktest({
  params,
}: {
  params: STFirstLimitUpParams;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [singleResult, setSingleResult] = useState<STFirstLimitUpSingleResult | null>(null);
  const [backtestResult, setBacktestResult] = useState<STFirstLimitUpBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    const code = input.trim().replace(/\s/g, "");
    if (!code) return;
    setLoading(true);
    setError(null);
    setSingleResult(null);
    setBacktestResult(null);
    try {
      // 构造 tsCode
      const ts = code.includes(".") ? code
        : code.startsWith("6") ? `${code}.SH`
        : `${code}.SZ`;
      // 先做单只分析（获取名称）
      const sRes = await fetch("/api/strategies/st-limit-down-first-limit-up/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tsCode: ts, name: `ST${code}`, params }),
      });
      const sData: STFirstLimitUpSingleResult = await sRes.json();
      setSingleResult(sData);

      // 再运行回测
      const bRes = await fetch("/api/strategies/st-limit-down-first-limit-up/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tsCode: ts, name: sData.name ?? `ST${code}`, params }),
      });
      const bData: STFirstLimitUpBacktestResult = await bRes.json();
      setBacktestResult(bData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const single = singleResult;
  const bt     = backtestResult;

  return (
    <div style={{ padding: "0 16px 24px" }}>
      {/* 输入框 */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: MID, marginBottom: 8 }}>输入 ST 股票代码（如：600381 或 000681）</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAnalyze()}
            placeholder="输入股票代码…"
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 8,
              background: "#0a1628", border: `1px solid ${BORDER}`,
              color: "#F1F5F9", fontSize: 14, outline: "none",
            }}
          />
          <button
            onClick={handleAnalyze}
            disabled={loading || !input.trim()}
            style={{
              padding: "8px 16px", borderRadius: 8,
              background: loading ? DIM : `rgba(0,229,168,0.12)`,
              color: loading ? "#07111F" : G,
              border: `1px solid ${loading ? DIM : "rgba(0,229,168,0.3)"}`,
              fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {loading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
            {loading ? "分析中…" : "分析+回测"}
          </button>
        </div>
        {error && <p style={{ fontSize: 11, color: R, marginTop: 6 }}>{error}</p>}
      </div>

      {/* 分析结果 */}
      {single && (
        <div>
          {/* 基本信息 */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>{single.name}</span>
                <span style={{ fontSize: 11, color: DIM, marginLeft: 6 }}>{single.symbol}</span>
                <span style={{
                  fontSize: 10, marginLeft: 6, background: "#1a0a0a",
                  borderRadius: 4, padding: "1px 5px", color: R,
                }}>{single.stType}</span>
              </div>
              <span style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 6,
                color: single.classification === "buy_candidate" ? G
                     : single.classification === "one_word_watch" ? Y : R,
                background: single.classification === "buy_candidate" ? "rgba(0,229,168,0.1)"
                           : single.classification === "one_word_watch" ? "rgba(250,204,21,0.1)"
                           : "rgba(239,68,68,0.1)",
                border: `1px solid currentColor`,
              }}>
                {single.classification === "buy_candidate" ? "🚀 首板买入候选"
                 : single.classification === "one_word_watch" ? "🔒 一字涨停观察"
                 : single.classification === "high_risk" ? "⚠️ 高风险剔除"
                 : single.classification === "not_matching" ? "— 不符合条件"
                 : "📉 数据不足"}
              </span>
            </div>
            <p style={{ fontSize: 11, color: DIM }}>{single.classificationReason}</p>
          </div>

          {/* 连续跌停信息 */}
          {single.streakResult && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: MID, marginBottom: 8 }}>连续跌停区间</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 20, fontWeight: 800, color: R }}>{single.streakResult.streak}</p>
                  <p style={{ fontSize: 10, color: DIM }}>连续跌停板数</p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: MID }}>{single.streakResult.streakStartDate}</p>
                  <p style={{ fontSize: 10, color: DIM }}>开始日期</p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: MID }}>{single.streakResult.streakEndDate}</p>
                  <p style={{ fontSize: 10, color: DIM }}>结束日期</p>
                </div>
              </div>
              {single.streakResult.isStillLimitDown && (
                <div style={{
                  marginTop: 8, padding: "6px 10px", borderRadius: 8,
                  background: "rgba(239,68,68,0.1)", border: `1px solid ${R}33`,
                }}>
                  <p style={{ fontSize: 11, color: R }}>⚠️ 当前仍在跌停中，尚未打开，暂不触发买入</p>
                </div>
              )}
            </div>
          )}

          {/* 首板涨停信息 */}
          {single.firstLimitUp && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: MID, marginBottom: 8 }}>首板涨停检测</p>
              {single.firstLimitUp.hasFirstLimitUp ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: G }}>{single.firstLimitUp.firstLimitUpDate}</p>
                      <p style={{ fontSize: 10, color: DIM }}>首板日期</p>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: single.firstLimitUp.isOneWordLimitUp ? Y : G }}>
                        {single.firstLimitUp.firstLimitUpType}
                      </p>
                      <p style={{ fontSize: 10, color: DIM }}>涨停类型</p>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: MID }}>
                        +{single.firstLimitUp.daysFromLimitDownEndToFirstLimitUp + 1}日
                      </p>
                      <p style={{ fontSize: 10, color: DIM }}>跌停后第N天</p>
                    </div>
                  </div>
                  {single.firstLimitUp.isOneWordLimitUp && (
                    <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(250,204,21,0.08)", border: `1px solid ${Y}33` }}>
                      <p style={{ fontSize: 11, color: Y }}>🔒 首个涨停为一字涨停，全天封板，模拟盘默认不自动买入，等待可成交机会。</p>
                    </div>
                  )}
                  {single.firstLimitUp.reasons.map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: G, paddingLeft: 6, marginTop: 4 }}>✓ {r}</div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(100,116,139,0.1)", border: `1px solid ${BORDER}` }}>
                  <p style={{ fontSize: 12, color: MID }}>
                    连续跌停后尚未出现第一个涨停，暂不触发买入信号。
                  </p>
                  {single.firstLimitUp.failedReasons.map((r, i) => (
                    <p key={i} style={{ fontSize: 11, color: DIM, marginTop: 4 }}>• {r}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 评分卡 */}
          {single.candidate && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
              <ScoreCard label="首板强度" value={single.candidate.firstLimitUpStrengthScore}
                color={single.candidate.firstLimitUpStrengthScore >= 60 ? G : Y} sub="≥60 才达标" />
              <ScoreCard label="退市风险" value={single.candidate.delistingRiskScore}
                color={single.candidate.delistingRiskScore <= 30 ? G : single.candidate.delistingRiskScore <= 60 ? Y : R} sub="≤40 才达标" />
              <ScoreCard label="重组预期" value={single.candidate.restructuringExpectationScore}
                color={single.candidate.restructuringExpectationScore >= 40 ? B : DIM} sub="≥40 才达标" />
              <ScoreCard label="财务修复" value={single.candidate.financialRepairScore}
                color={single.candidate.financialRepairScore >= 40 ? G : DIM} sub="参考值" />
            </div>
          )}

          {/* 降级提示 */}
          {single.candidate?.degraded && (
            <div style={{
              background: "rgba(100,116,139,0.08)", border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: "10px 12px", marginBottom: 10,
            }}>
              {single.candidate.degradedReasons.map((r, i) => (
                <p key={i} style={{ fontSize: 11, color: DIM, fontStyle: "italic" }}>⚠️ {r}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 回测结果 */}
      {bt && bt.ok && (
        <div>
          {/* K 线图 */}
          <BacktestKlineChart
            bars={bt.bars}
            streakStartDate={bt.streakResult?.streakStartDate}
            streakEndDate={bt.streakResult?.streakEndDate}
            firstLimitUpDate={bt.firstLimitUp?.firstLimitUpDate}
          />

          {/* 回测统计 */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: MID, marginBottom: 10 }}>回测统计</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "交易次数", value: `${bt.totalTrades}次`,  color: MID },
                { label: "胜率",     value: `${(bt.winRate * 100).toFixed(0)}%`, color: bt.winRate >= 0.5 ? G : R },
                { label: "平均收益", value: `${bt.avgPnlPercent.toFixed(1)}%`, color: bt.avgPnlPercent >= 0 ? G : R },
                { label: "最大盈利", value: `+${bt.maxPnlPercent.toFixed(1)}%`, color: G },
                { label: "最大亏损", value: `${bt.minPnlPercent.toFixed(1)}%`,  color: R },
                { label: "最大回撤", value: `${bt.maxDrawdown.toFixed(1)}%`,    color: R },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center", background: "#0a1628", borderRadius: 8, padding: "8px 4px" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color }}>{value}</p>
                  <p style={{ fontSize: 10, color: DIM }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 交易明细 */}
          {bt.trades.length > 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: MID, marginBottom: 10 }}>交易明细</p>
              {bt.trades.map(t => (
                <div key={t.tradeId} style={{
                  borderBottom: `1px solid ${BORDER}`, paddingBottom: 10, marginBottom: 10,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: MID }}>
                      买入 {t.buyDate} @ {t.buyPrice.toFixed(2)}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: (t.pnlPercent ?? 0) >= 0 ? G : R,
                    }}>
                      {(t.pnlPercent ?? 0) >= 0 ? "+" : ""}{(t.pnlPercent ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: DIM }}>
                      卖出 {t.sellDate} @ {(t.sellPrice ?? 0).toFixed(2)}  ·  持有 {t.holdDays} 天
                    </span>
                    <span style={{ fontSize: 11, color: DIM }}>{t.exitReason}</span>
                  </div>
                  {/* 买入信号说明 */}
                  <div style={{ marginTop: 6 }}>
                    <p style={{ fontSize: 10, color: DIM, marginBottom: 2 }}>买入依据（buySignalType: "first_limit_up_after_limit_down"）：</p>
                    {t.signalReasons.map((r, i) => (
                      <div key={i} style={{ fontSize: 10, color: G, paddingLeft: 6 }}>• {r}</div>
                    ))}
                    {t.limitDownHeld && (
                      <div style={{ fontSize: 10, color: Y, paddingLeft: 6, marginTop: 2 }}>
                        ⚠️ 持仓期间曾遇跌停，无法止损，被迫持有
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {bt.trades.length === 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "24px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: MID }}>该股票在回测期间未产生符合条件的交易</p>
              <p style={{ fontSize: 11, color: DIM, marginTop: 6 }}>
                可能原因：连续跌停后未出现涨停，或退市风险过高被过滤，或参数要求未满足。
              </p>
            </div>
          )}
        </div>
      )}

      {bt && !bt.ok && (
        <div style={{ background: CARD, border: `1px solid ${R}33`, borderRadius: 12, padding: "12px 14px" }}>
          <p style={{ fontSize: 13, color: R }}>回测失败：{bt.error}</p>
        </div>
      )}

      {/* 空状态 */}
      {!single && !loading && (
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <BarChart3 size={40} color={DIM} style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14, color: MID }}>输入 ST 股票代码开始分析和回测</p>
          <p style={{ fontSize: 11, color: DIM, marginTop: 6, lineHeight: 1.6 }}>
            系统将自动检测连续跌停区间、首板涨停日期，<br />
            并模拟历史回测收益和 K 线标注。
          </p>
        </div>
      )}
    </div>
  );
}
