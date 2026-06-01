"use client";
/**
 * SingleBacktest.tsx — ST 极限反转策略单股回测组件
 *
 * 输入股票代码，运行单股历史回测，显示净值曲线、交易列表、K线信号。
 */

import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { Play, AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import type { STExtremeBacktestResult, STExtremeTradeRecord } from "@/lib/stExtremeReversalService";

// ── 颜色 ─────────────────────────────────────────────────────────────
const R    = "#EF4444";
const G    = "#00E5A8";
const Y    = "#FACC15";
const B    = "#3B82F6";
const DIM  = "#64748B";
const MID  = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

// ── 工具函数 ─────────────────────────────────────────────────────────
function fmtPct(v: number, decimals = 1): string {
  const s = (v * 100).toFixed(decimals);
  return v >= 0 ? `+${s}%` : `${s}%`;
}

function signalIcon(sig?: string): string {
  if (sig === "buy")   return "🟢";
  if (sig === "sell")  return "⚪";
  if (sig === "stop_loss")    return "🔴";
  if (sig === "take_profit")  return "🔵";
  if (sig === "limit_down")   return "🔻";
  if (sig === "limit_down_stuck") return "⛔";
  if (sig === "streak_open")  return "🟡";
  return "";
}

// ── 组件 ─────────────────────────────────────────────────────────────
interface Props {
  initialTsCode?: string;
  initialName?:  string;
}

export default function SingleBacktest({ initialTsCode = "", initialName = "" }: Props) {
  const [tsCodeInput, setTsCodeInput] = useState(initialTsCode);
  const [nameInput,   setNameInput]   = useState(initialName);
  const [startDate,   setStartDate]   = useState("");
  const [endDate,     setEndDate]     = useState("");
  const [stopLoss,    setStopLoss]    = useState(5);
  const [takeProfit,  setTakeProfit]  = useState(15);
  const [maxHoldDays, setMaxHoldDays] = useState(5);
  const [running,     setRunning]     = useState(false);
  const [result,      setResult]      = useState<STExtremeBacktestResult | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [showKline,   setShowKline]   = useState(false);

  async function runBacktest() {
    const code = tsCodeInput.trim();
    if (!code) { setError("请输入股票代码（如 000001.SZ）"); return; }

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        tsCode: code,
        name:   nameInput.trim() || code,
        params: {
          ...(stopLoss    !== 5  ? { /* stopLoss not in params type, handled internally */ } : {}),
          ...(takeProfit  !== 15 ? {} : {}),
          ...(maxHoldDays !== 5  ? {} : {}),
        },
      };
      if (startDate) body.startDate = startDate.replace(/-/g, "");
      if (endDate)   body.endDate   = endDate.replace(/-/g, "");

      const res = await fetch("/api/tushare/st-extreme-reversal-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as STExtremeBacktestResult;

      if (!data.ok) {
        setError(data.error ?? "回测失败");
      } else {
        setResult(data);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "网络请求失败");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      {/* Input panel */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 10, padding: "16px 14px", marginBottom: 16,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Code + Name */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 4 }}>股票代码</label>
              <input
                value={tsCodeInput}
                onChange={e => setTsCodeInput(e.target.value)}
                placeholder="如 002157.SZ"
                style={{
                  width: "100%", background: "#07111F", border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 4 }}>股票名称（可选）</label>
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder="如 *ST某某"
                style={{
                  width: "100%", background: "#07111F", border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Date range */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 4 }}>开始日期（可选）</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  width: "100%", background: "#07111F", border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 4 }}>结束日期（可选）</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  width: "100%", background: "#07111F", border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Parameters */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 4 }}>止损（%）</label>
              <input
                type="number" value={stopLoss} min={1} max={20}
                onChange={e => setStopLoss(Number(e.target.value))}
                style={{
                  width: 80, background: "#07111F", border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 4 }}>止盈（%）</label>
              <input
                type="number" value={takeProfit} min={5} max={50}
                onChange={e => setTakeProfit(Number(e.target.value))}
                style={{
                  width: 80, background: "#07111F", border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MID, display: "block", marginBottom: 4 }}>最大持仓天</label>
              <input
                type="number" value={maxHoldDays} min={1} max={30}
                onChange={e => setMaxHoldDays(Number(e.target.value))}
                style={{
                  width: 80, background: "#07111F", border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "6px 10px", color: "#F1F5F9", fontSize: 13,
                }}
              />
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={runBacktest}
            disabled={running}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: running ? "#1a2f50" : "#00E5A8",
              color: running ? MID : "#07111F",
              fontWeight: 700, fontSize: 14, cursor: running ? "not-allowed" : "pointer",
            }}
          >
            <Play size={16} />
            {running ? "运行中…" : "运行回测"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "#1a0a0a", border: `1px solid ${R}`, borderRadius: 8,
          padding: "10px 14px", marginBottom: 12, color: R, fontSize: 13,
        }}>
          <AlertTriangle size={14} style={{ display: "inline", marginRight: 6 }} />
          {error}
        </div>
      )}

      {/* Results */}
      {result && result.ok && (
        <div>
          {/* Summary cards */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8, marginBottom: 16,
          }}>
            {[
              { label: "总收益", value: fmtPct(result.totalReturn), color: result.totalReturn >= 0 ? R : G },
              { label: "年化收益", value: fmtPct(result.annualReturn), color: result.annualReturn >= 0 ? R : G },
              { label: "最大回撤", value: fmtPct(result.maxDrawdown), color: G },
              { label: "胜率", value: (result.winRate * 100).toFixed(0) + "%", color: result.winRate >= 0.5 ? R : G },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "10px 12px",
              }}>
                <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Trade stats */}
          <div style={{
            background: CARD, border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: "10px 12px", marginBottom: 16,
            display: "flex", gap: 16, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 12, color: MID }}>总交易 <span style={{ color: "#F1F5F9" }}>{result.totalTrades}</span></span>
            <span style={{ fontSize: 12, color: MID }}>稳定信号 <span style={{ color: Y }}>{result.stabilizationTrades}</span></span>
            <span style={{ fontSize: 12, color: MID }}>V型反转 <span style={{ color: B }}>{result.vShapeTrades}</span></span>
            <span style={{ fontSize: 12, color: MID }}>两者兼具 <span style={{ color: G }}>{result.bothTrades}</span></span>
            <span style={{ fontSize: 12, color: MID }}>
              跌停封板 <span style={{ color: R }}>{result.limitDownStuckCount}</span>
            </span>
          </div>

          {/* Equity curve */}
          {result.equity.length > 0 && (
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: "14px 12px", marginBottom: 16,
            }}>
              <p style={{ fontSize: 12, color: MID, marginBottom: 8 }}>
                <Activity size={12} style={{ display: "inline", marginRight: 4 }} />
                净值曲线
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={result.equity} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={G} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={G} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2f50" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: DIM }} tickLine={false}
                    tickFormatter={d => d?.slice(4)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: DIM }} tickLine={false} axisLine={false}
                    tickFormatter={v => v.toFixed(0)} />
                  <Tooltip
                    contentStyle={{ background: "#07111F", border: `1px solid ${BORDER}`, borderRadius: 6 }}
                    labelStyle={{ color: MID, fontSize: 11 }}
                    formatter={(v) => [typeof v === "number" ? v.toFixed(2) : String(v), "净值"]}
                  />
                  <ReferenceLine y={100} stroke={DIM} strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="value" stroke={G} fill="url(#eqGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Streak events */}
          {result.streakEvents.length > 0 && (
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: "12px 14px", marginBottom: 12,
            }}>
              <p style={{ fontSize: 12, color: MID, marginBottom: 8 }}>跌停事件（共 {result.streakEvents.length} 次）</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {result.streakEvents.map((ev, i) => (
                  <div key={i} style={{ fontSize: 11, color: DIM }}>
                    <span style={{ color: R, fontWeight: 600 }}>{ev.date}</span>
                    {" "} — 连续跌停 <span style={{ color: R }}>{ev.streak}</span> 板，
                    打开日：<span style={{ color: Y }}>{ev.openedDate ?? "未打开"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trade list */}
          {result.trades.length > 0 && (
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: "12px 14px", marginBottom: 12,
            }}>
              <p style={{ fontSize: 12, color: MID, marginBottom: 8 }}>
                交易记录（共 {result.trades.length} 笔）
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.trades.map((t: STExtremeTradeRecord) => (
                  <div key={t.tradeId} style={{
                    borderLeft: `3px solid ${t.pnlPct >= 0 ? R : G}`,
                    paddingLeft: 8,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#F1F5F9" }}>
                        #{t.tradeId} {t.buyDate} → {t.sellDate}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: t.pnlPct >= 0 ? R : G,
                      }}>
                        {fmtPct(t.pnlPct)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
                      买入 {t.buyPrice.toFixed(2)} → 卖出 {t.sellPrice.toFixed(2)} |
                      持仓 {t.holdDays} 天 | {t.sellReason} |
                      信号：{t.buySignalType === "both" ? "稳定+V型" : t.buySignalType === "v_shape_reversal" ? "V型" : "稳定"} |
                      跌停 {t.limitDownStreak} 板
                    </div>
                    {t.cannotSellDates.length > 0 && (
                      <div style={{ fontSize: 10, color: R, marginTop: 2 }}>
                        ⛔ 跌停封板无法卖出：{t.cannotSellDates.join(", ")}
                      </div>
                    )}
                    {t.buySignalReasons.length > 0 && (
                      <div style={{ fontSize: 10, color: Y, marginTop: 2 }}>
                        买入依据：{t.buySignalReasons.slice(0, 2).join(" | ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kline signals (toggle) */}
          {result.klineSignals.length > 0 && (
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: "12px 14px",
            }}>
              <button
                onClick={() => setShowKline(!showKline)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "transparent", border: "none",
                  color: MID, fontSize: 12, cursor: "pointer",
                  width: "100%", padding: 0, justifyContent: "space-between",
                }}
              >
                <span>K线信号明细（共 {result.klineSignals.length} 条）</span>
                <span>{showKline ? "收起 ▲" : "展开 ▼"}</span>
              </button>

              {showKline && (
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                        {["日期", "开盘", "最高", "最低", "收盘", "涨跌%", "信号", "MA3", "MA5"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "4px 6px", color: DIM }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.klineSignals.slice(-50).map((ks, i) => (
                        <tr key={i} style={{
                          background: ks.signal === "buy" ? "rgba(0,229,168,0.08)" :
                            ks.signal === "stop_loss" ? "rgba(239,68,68,0.08)" : "transparent",
                        }}>
                          <td style={{ padding: "3px 6px", color: "#F1F5F9" }}>{ks.date}</td>
                          <td style={{ padding: "3px 6px", color: MID }}>{ks.open.toFixed(2)}</td>
                          <td style={{ padding: "3px 6px", color: MID }}>{ks.high.toFixed(2)}</td>
                          <td style={{ padding: "3px 6px", color: MID }}>{ks.low.toFixed(2)}</td>
                          <td style={{ padding: "3px 6px", color: ks.pctChg >= 0 ? R : G }}>{ks.close.toFixed(2)}</td>
                          <td style={{ padding: "3px 6px", color: ks.pctChg >= 0 ? R : G }}>
                            {ks.pctChg >= 0 ? "+" : ""}{ks.pctChg.toFixed(2)}%
                          </td>
                          <td style={{ padding: "3px 6px" }}>
                            {signalIcon(ks.signal)} {ks.signal ?? ""}
                          </td>
                          <td style={{ padding: "3px 6px", color: DIM }}>{ks.ma3?.toFixed(2) ?? ""}</td>
                          <td style={{ padding: "3px 6px", color: DIM }}>{ks.ma5?.toFixed(2) ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* No trades */}
          {result.trades.length === 0 && (
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: "16px", textAlign: "center",
              color: DIM, fontSize: 13,
            }}>
              <TrendingDown size={20} style={{ margin: "0 auto 8px", color: DIM }} />
              回测期间未发现满足条件的交易信号
            </div>
          )}
        </div>
      )}

      {/* No result with ok=false */}
      {result && !result.ok && !error && (
        <div style={{
          background: "#1a0a0a", border: `1px solid ${R}`,
          borderRadius: 8, padding: "10px 14px", color: R, fontSize: 13,
        }}>
          <AlertTriangle size={14} style={{ display: "inline", marginRight: 6 }} />
          {result.error ?? "回测失败"}
        </div>
      )}
    </div>
  );
}
