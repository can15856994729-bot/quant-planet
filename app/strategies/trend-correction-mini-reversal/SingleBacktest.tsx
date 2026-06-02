"use client";

/**
 * app/strategies/trend-correction-mini-reversal/SingleBacktest.tsx
 *
 * 单只股票分析 + 历史回测
 * K线图上标注：低点、高点、40%/50%/60%回撤线、微型反转点、买入/卖出点
 */

import { useState } from "react";
import { Search, RefreshCw, AlertTriangle, TrendingUp } from "lucide-react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import type { MiniReversalParams } from "@/lib/trendCorrectionMiniReversalService";

// ── 本地类型 ─────────────────────────────────────────────────────────────

interface PricePoint { date: string; price: number; idx: number }

interface SingleResult {
  tsCode: string; symbol: string; name: string; currentPrice: number;
  uptrend: {
    detected: boolean; lowPoint: PricePoint | null; highPoint: PricePoint | null;
    riseAmount: number; risePercent: number; trendDays: number; reasons: string[];
    failedReasons: string[];
  };
  retracement: {
    matched: boolean; halfRetracementPrice: number;
    price40Retracement: number; price60Retracement: number;
    correctionRatio: number; correctionPercent: number;
    currentPrice: number; reasons: string[]; failedReasons: string[];
  };
  miniReversal: {
    miniReversal: boolean; score: number; conditionsMet: number; conditionsTotal: number;
    reasons: string[]; failedReasons: string[];
  };
  riskFilter: { passed: boolean; riskLevel: string; reason: string };
  buySignal: boolean; buySignalReasons: string[];
  bars: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number; amount: number; pctChg: number }>;
}

interface TradeRecord {
  entryDate: string; entryPrice: number; exitDate: string; exitPrice: number;
  exitReason: string; returnPct: number; holdDays: number;
  halfRetracementPrice: number; correctionRatio: number; miniReversalScore: number;
}

interface BacktestResult {
  tsCode: string; symbol: string; name: string;
  trades: TradeRecord[];
  totalTrades: number; winTrades: number; lossTrades: number; winRate: number;
  avgReturn: number; maxReturn: number; minReturn: number; totalReturn: number;
  maxDrawdown: number; sharpe: number;
  uptrend: SingleResult["uptrend"];
  retracement: SingleResult["retracement"];
  bars: SingleResult["bars"];
}

interface Props { params: MiniReversalParams }

// ── 颜色工具 ─────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  if (!d || d.length < 8) return d;
  if (d.includes("-")) return d.slice(0, 10);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

const EXIT_LABELS: Record<string, string> = {
  stopLoss:   "止损",
  takeProfit: "止盈",
  timeStop:   "时间止损",
  maStop:     "MA5止损",
  end:        "持仓中",
};

// ── K线图表 ───────────────────────────────────────────────────────────────

function KLineChart({
  bars,
  lowPoint,
  highPoint,
  price40,
  price50,
  price60,
  trades,
}: {
  bars: SingleResult["bars"];
  lowPoint: PricePoint | null;
  highPoint: PricePoint | null;
  price40: number;
  price50: number;
  price60: number;
  trades?: TradeRecord[];
}) {
  const data = bars.slice(-120).map(b => ({
    date:   fmtDate(b.date),
    close:  b.close,
    volume: +(b.amount / 1000).toFixed(0), // 万元
    pct:    b.pctChg,
  }));

  const entryDates  = new Set(trades?.map(t => fmtDate(t.entryDate)) ?? []);
  const exitDates   = new Set(trades?.map(t => fmtDate(t.exitDate))  ?? []);

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 20, left: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "#475569" }}
            tickFormatter={v => v.slice(5)}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis
            yAxisId="price"
            domain={["auto", "auto"]}
            tick={{ fontSize: 9, fill: "#475569" }}
            tickFormatter={v => v.toFixed(1)}
          />
          <YAxis yAxisId="vol" orientation="right" hide />
          <Tooltip
            contentStyle={{ background: "#0d1f3c", border: "1px solid #1a2f50", fontSize: 11 }}
            formatter={(v: unknown, name: string | number | undefined) => [
              typeof v === "number" ? v.toFixed(2) : String(v),
              name === "close" ? "收盘价" : String(name ?? ""),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />

          {/* 成交额柱 */}
          <Bar yAxisId="vol" dataKey="volume" name="成交额(万)" fill="rgba(100,116,139,0.3)" />

          {/* 收盘价线 */}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="close"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={1.5}
          />

          {/* 回撤参考线 */}
          {price40 > 0 && (
            <ReferenceLine yAxisId="price" y={price40} stroke="#f59e0b" strokeDasharray="4 2"
              label={{ value: "40%", position: "right", fontSize: 9, fill: "#f59e0b" }} />
          )}
          {price50 > 0 && (
            <ReferenceLine yAxisId="price" y={price50} stroke="#3b82f6" strokeWidth={1.5}
              label={{ value: "50%", position: "right", fontSize: 9, fill: "#3b82f6" }} />
          )}
          {price60 > 0 && (
            <ReferenceLine yAxisId="price" y={price60} stroke="#f97316" strokeDasharray="4 2"
              label={{ value: "60%", position: "right", fontSize: 9, fill: "#f97316" }} />
          )}

          {/* 低点 / 高点 */}
          {lowPoint?.price && (
            <ReferenceLine yAxisId="price" y={lowPoint.price} stroke="#22c55e" strokeDasharray="2 4"
              label={{ value: "低点", position: "left", fontSize: 9, fill: "#22c55e" }} />
          )}
          {highPoint?.price && (
            <ReferenceLine yAxisId="price" y={highPoint.price} stroke="#ef4444" strokeDasharray="2 4"
              label={{ value: "高点", position: "left", fontSize: 9, fill: "#ef4444" }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 单只分析 ─────────────────────────────────────────────────────────────

function SingleAnalysis({ params }: Props) {
  const [symbol,  setSymbol]  = useState("");
  const [name,    setName]    = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<SingleResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const analyze = async () => {
    const sym = symbol.trim();
    if (!/^\d{6}$/.test(sym)) { setError("请输入6位股票代码"); return; }
    setLoading(true); setError(null);

    try {
      const res = await fetch("/api/strategies/trend-correction-mini-reversal/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, name: name || sym, params }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error ?? "分析失败"); return; }
      setResult(json.data);
      if (!name && json.data.name) setName(json.data.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally { setLoading(false); }
  };

  return (
    <div>
      {/* 输入 */}
      <div className="flex gap-2 mb-4">
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          placeholder="股票代码（如 600519）"
          className="flex-1 px-3 py-2 rounded-xl text-[13px]"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50", color: "#e2e8f0" }}
          onKeyDown={e => e.key === "Enter" && analyze()}
        />
        <button
          onClick={analyze}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-[13px] font-semibold flex items-center gap-2"
          style={{ background: "#1e40af", color: "#93c5fd" }}
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          分析
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl mb-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-[12px]" style={{ color: "#ef4444" }}><AlertTriangle size={11} className="inline mr-1" />{error}</p>
        </div>
      )}

      {result && (
        <div>
          {/* 股票头部 */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[16px] font-bold" style={{ color: "#e2e8f0" }}>{result.name}</span>
            <span className="text-[12px]" style={{ color: "#64748b" }}>{result.symbol}</span>
            <span className="text-[13px] font-bold" style={{ color: "#3b82f6" }}>¥{result.currentPrice.toFixed(2)}</span>
            {result.buySignal && (
              <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                买入候选
              </span>
            )}
          </div>

          {/* K线图 */}
          <KLineChart
            bars={result.bars}
            lowPoint={result.uptrend.lowPoint}
            highPoint={result.uptrend.highPoint}
            price40={result.retracement.price40Retracement}
            price50={result.retracement.halfRetracementPrice}
            price60={result.retracement.price60Retracement}
          />

          {/* 分析结果 */}
          <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
            {[
              { label: "长期上涨趋势", pass: result.uptrend.detected, value: result.uptrend.detected ? `+${(result.uptrend.risePercent * 100).toFixed(1)}%` : "未识别" },
              { label: "50%回撤区间", pass: result.retracement.matched, value: result.retracement.matched ? `${result.retracement.correctionPercent.toFixed(1)}%` : "未进入" },
              { label: "微型反转",    pass: result.miniReversal.miniReversal, value: `评分 ${result.miniReversal.score}` },
            ].map(s => (
              <div key={s.label} className="p-2.5 rounded-xl" style={{ background: "#0d1f3c", border: `1px solid ${s.pass ? "#22c55e44" : "#1a2f50"}` }}>
                <div className="text-[10px] mb-0.5" style={{ color: "#64748b" }}>{s.label}</div>
                <div className="text-[12px] font-bold" style={{ color: s.pass ? "#22c55e" : "#ef4444" }}>
                  {s.pass ? "✅" : "❌"} {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* 价格关键位 */}
          <div className="p-3 rounded-xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-medium mb-2" style={{ color: "#94a3b8" }}>关键价位</p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <span style={{ color: "#64748b" }}>阶段低点：<span style={{ color: "#22c55e" }}>¥{result.uptrend.lowPoint?.price.toFixed(2) ?? "-"}</span></span>
              <span style={{ color: "#64748b" }}>阶段高点：<span style={{ color: "#ef4444" }}>¥{result.uptrend.highPoint?.price.toFixed(2) ?? "-"}</span></span>
              <span style={{ color: "#64748b" }}>上涨幅度：<span style={{ color: "#22c55e" }}>+{(result.uptrend.risePercent * 100).toFixed(1)}%</span></span>
              <span style={{ color: "#64748b" }}>上涨天数：<span style={{ color: "#e2e8f0" }}>{result.uptrend.trendDays} 日</span></span>
              <span style={{ color: "#64748b" }}>40%回撤：<span style={{ color: "#f59e0b" }}>¥{result.retracement.price40Retracement.toFixed(2)}</span></span>
              <span style={{ color: "#64748b" }}>50%回撤：<span style={{ color: "#3b82f6" }}>¥{result.retracement.halfRetracementPrice.toFixed(2)}</span></span>
              <span style={{ color: "#64748b" }}>60%回撤：<span style={{ color: "#f97316" }}>¥{result.retracement.price60Retracement.toFixed(2)}</span></span>
              <span style={{ color: "#64748b" }}>当前回撤：<span style={{ color: "#f59e0b" }}>{result.retracement.correctionPercent.toFixed(1)}%</span></span>
            </div>
          </div>

          {/* 微型反转条件 */}
          <div className="p-3 rounded-xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[11px] font-medium mb-2" style={{ color: "#94a3b8" }}>
              微型反转（{result.miniReversal.conditionsMet}/{result.miniReversal.conditionsTotal}）
            </p>
            <div className="flex flex-wrap gap-1">
              {result.miniReversal.reasons.map((r, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>✓ {r}</span>
              ))}
              {result.miniReversal.failedReasons.slice(0, 3).map((r, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.06)", color: "#ef444466" }}>✗ {r}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 历史回测 ─────────────────────────────────────────────────────────────

function BacktestPanel({ params }: Props) {
  const [symbol,  setSymbol]  = useState("");
  const [name,    setName]    = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<BacktestResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const runBacktest = async () => {
    const sym = symbol.trim();
    if (!/^\d{6}$/.test(sym)) { setError("请输入6位股票代码"); return; }
    setLoading(true); setError(null);

    try {
      const res = await fetch("/api/strategies/trend-correction-mini-reversal/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, name: name || sym, params }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error ?? "回测失败"); return; }
      setResult(json.data);
      if (!name && json.data.name) setName(json.data.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally { setLoading(false); }
  };

  const r = result;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          placeholder="股票代码（如 600519）"
          className="flex-1 px-3 py-2 rounded-xl text-[13px]"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50", color: "#e2e8f0" }}
          onKeyDown={e => e.key === "Enter" && runBacktest()}
        />
        <button
          onClick={runBacktest}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-[13px] font-semibold flex items-center gap-2"
          style={{ background: "#7c3aed", color: "#ddd6fe" }}
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <TrendingUp size={14} />}
          回测
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl mb-3" style={{ background: "rgba(239,68,68,0.08)" }}>
          <p className="text-[12px]" style={{ color: "#ef4444" }}>{error}</p>
        </div>
      )}

      {r && (
        <div>
          <p className="text-[14px] font-bold mb-3" style={{ color: "#e2e8f0" }}>
            {r.name} ({r.symbol}) 历史回测
          </p>

          {/* K线图 */}
          <KLineChart
            bars={r.bars}
            lowPoint={r.uptrend.lowPoint}
            highPoint={r.uptrend.highPoint}
            price40={r.retracement.price40Retracement}
            price50={r.retracement.halfRetracementPrice}
            price60={r.retracement.price60Retracement}
            trades={r.trades}
          />

          {/* 统计 */}
          <div className="grid grid-cols-4 gap-2 mt-3 mb-4">
            {[
              { label: "总交易",  value: r.totalTrades,                    color: "#94a3b8" },
              { label: "胜率",    value: `${r.winRate.toFixed(1)}%`,        color: "#22c55e" },
              { label: "平均收益",value: `${r.avgReturn.toFixed(2)}%`,     color: r.avgReturn >= 0 ? "#22c55e" : "#ef4444" },
              { label: "最大回撤",value: `-${r.maxDrawdown.toFixed(1)}%`,  color: "#ef4444" },
            ].map(s => (
              <div key={s.label} className="p-2 rounded-xl text-center" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="text-[14px] font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[10px]" style={{ color: "#64748b" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 交易明细 */}
          {r.trades.length > 0 && (
            <div>
              <p className="text-[12px] font-medium mb-2" style={{ color: "#94a3b8" }}>交易明细（共 {r.trades.length} 笔）</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" style={{ color: "#94a3b8" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1a2f50" }}>
                      {["买入日", "买入价", "卖出日", "卖出价", "收益", "持仓天", "退出原因"].map(h => (
                        <th key={h} className="pb-1.5 text-left pr-2" style={{ color: "#475569" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.trades.map((t, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(26,47,80,0.5)" }}>
                        <td className="py-1 pr-2">{fmtDate(t.entryDate)}</td>
                        <td className="py-1 pr-2">{t.entryPrice.toFixed(2)}</td>
                        <td className="py-1 pr-2">{fmtDate(t.exitDate)}</td>
                        <td className="py-1 pr-2">{t.exitPrice.toFixed(2)}</td>
                        <td className="py-1 pr-2" style={{ color: t.returnPct >= 0 ? "#22c55e" : "#ef4444" }}>
                          {t.returnPct >= 0 ? "+" : ""}{t.returnPct.toFixed(2)}%
                        </td>
                        <td className="py-1 pr-2">{t.holdDays}日</td>
                        <td className="py-1 pr-2" style={{ color: t.exitReason === "takeProfit" ? "#22c55e" : t.exitReason === "stopLoss" ? "#ef4444" : "#94a3b8" }}>
                          {EXIT_LABELS[t.exitReason] ?? t.exitReason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {r.trades.length === 0 && (
            <p className="py-4 text-center text-[12px]" style={{ color: "#475569" }}>
              历史数据中未发现满足条件的买入信号
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主导出 ────────────────────────────────────────────────────────────────

export default function SingleBacktest({ params }: Props) {
  const [tab, setTab] = useState<"analysis" | "backtest">("analysis");

  return (
    <div>
      {/* 子标签页 */}
      <div className="flex gap-1.5 mb-4">
        {[
          { key: "analysis" as const, label: "单只分析" },
          { key: "backtest" as const, label: "历史回测" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3 py-1.5 rounded-full text-[11px]"
            style={{
              background: tab === t.key ? "#7c3aed" : "rgba(124,58,237,0.1)",
              color: tab === t.key ? "#ddd6fe" : "#475569",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "analysis" && <SingleAnalysis params={params} />}
      {tab === "backtest" && <BacktestPanel params={params} />}
    </div>
  );
}
