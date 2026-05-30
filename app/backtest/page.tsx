"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, ChevronDown, AlertTriangle, Lock, CheckCircle, TrendingUp, TrendingDown } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_STRATEGIES, MOCK_STOCKS } from "@/lib/mock-data";

const TIME_RANGES = ["近1年", "近2年", "近3年"] as const;
type TimeRange = typeof TIME_RANGES[number];

const FEE_OPTIONS = [0.03, 0.05, 0.1];

// ── Time range → YYYYMMDD ─────────────────────────────────────────────
function rangeToStartDate(range: TimeRange): string {
  const d = new Date();
  if (range === "近1年") d.setFullYear(d.getFullYear() - 1);
  if (range === "近2年") d.setFullYear(d.getFullYear() - 2);
  if (range === "近3年") d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function todayYMD(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// ── Backtest result types ─────────────────────────────────────────────
interface BacktestResult {
  ok:             true;
  totalReturn:    number;
  annualReturn:   number;
  maxDrawdown:    number;
  sharpeRatio:    number;
  winRate:        number;
  profitFactor:   number;
  totalTrades:    number;
  initialCapital: number;
  finalCapital:   number;
  equity:         { date: string; value: number }[];
  note:           string;
}

// ── Result panel ──────────────────────────────────────────────────────
function BacktestResultPanel({ result }: { result: BacktestResult }) {
  const isUp = result.totalReturn >= 0;
  const c = isUp ? "#00E5A8" : "#EF4444";
  const sign = isUp ? "+" : "";

  const stats = [
    { label: "总收益",     value: `${sign}${result.totalReturn.toFixed(2)}%`,    color: c },
    { label: "年化收益",   value: `${result.annualReturn >= 0 ? "+" : ""}${result.annualReturn.toFixed(2)}%`, color: result.annualReturn >= 0 ? "#00E5A8" : "#EF4444" },
    { label: "最大回撤",   value: `${result.maxDrawdown.toFixed(2)}%`,            color: "#EF4444" },
    { label: "夏普比率",   value: result.sharpeRatio.toFixed(2),                  color: "#F8FAFC" },
    { label: "胜率",       value: `${result.winRate.toFixed(1)}%`,                color: "#FACC15" },
    { label: "盈亏比",     value: result.profitFactor.toFixed(2),                 color: "#F8FAFC" },
    { label: "总交易次数", value: `${result.totalTrades}次`,                      color: "#94A3B8" },
    { label: "最终资金",   value: `¥${result.finalCapital.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`, color: c },
  ];

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(0,229,168,0.06)", border: "1px solid rgba(0,229,168,0.2)" }}>
        <p className="text-[11px] font-bold mb-1" style={{ color: "#94A3B8" }}>A股多因子策略 · 真实回测结果</p>
        <p className="font-black text-[32px] num" style={{ color: c }}>{sign}{result.totalReturn.toFixed(2)}%</p>
        <p className="text-[11px] mt-1" style={{ color: "#64748B" }}>
          ¥{result.initialCapital.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} →
          ¥{result.finalCapital.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[10px] mb-0.5" style={{ color: "#64748B" }}>{label}</p>
            <p className="font-black text-[16px] num" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Data source note */}
      <div className="p-3 rounded-xl flex items-start gap-2"
        style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
        <CheckCircle size={13} color="#3B82F6" className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-[11px] font-bold mb-0.5" style={{ color: "#3B82F6" }}>数据来源：Tushare</p>
          <p className="text-[10px] leading-[1.6]" style={{ color: "#64748B" }}>{result.note}</p>
        </div>
      </div>
    </div>
  );
}

// ── Equity curve mini bar ─────────────────────────────────────────────
// (simple text representation since no chart library required)

// ── Main form ─────────────────────────────────────────────────────────
function BacktestForm() {
  const router = useRouter();
  const params = useSearchParams();
  const defaultStrategyId = params.get("strategy") ?? "s1";

  const [symbol,      setSymbol]      = useState("600519");
  const [strategyId,  setStrategyId]  = useState(defaultStrategyId);
  const [timeRange,   setTimeRange]   = useState<TimeRange>("近3年");
  const [capital,     setCapital]     = useState(100000);
  const [stopLoss,    setStopLoss]    = useState(8);
  const [takeProfit,  setTakeProfit]  = useState(20);
  const [fee,         setFee]         = useState(0.05);
  const [running,     setRunning]     = useState(false);

  // Tushare status
  const [tushareOk,   setTushareOk]   = useState<boolean | null>(null); // null = loading

  // Backtest result
  const [result,      setResult]      = useState<BacktestResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  const strategy    = MOCK_STRATEGIES.find((s) => s.id === strategyId) ?? MOCK_STRATEGIES[0];
  const stock       = MOCK_STOCKS.find((s) => s.symbol === symbol) ?? MOCK_STOCKS[0];
  const isMultiFactor = strategyId === "a-share-multi-factor";

  // Check Tushare status on mount (only for multi-factor)
  useEffect(() => {
    if (!isMultiFactor) return;
    fetch("/api/tushare/status")
      .then(r => r.json())
      .then(d => setTushareOk(d.capabilities?.daily?.status === "ok"))
      .catch(() => setTushareOk(false));
  }, [isMultiFactor]);

  async function handleRun() {
    if (isMultiFactor) {
      if (!tushareOk) return;
      setRunning(true);
      setResult(null);
      setResultError(null);
      try {
        const res = await fetch("/api/tushare/backtest", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            startDate:      rangeToStartDate(timeRange),
            endDate:        todayYMD(),
            initialCapital: capital,
            commissionRate: fee / 100,
            stampDutyRate:  0.001,
            slippageRate:   0.0005,
            maxPositions:   5,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setResult(data as BacktestResult);
        } else {
          setResultError(data.error ?? "回测失败");
        }
      } catch (e) {
        setResultError(String(e));
      } finally {
        setRunning(false);
      }
      return;
    }

    // Non-multi-factor: navigate to mock result page
    setRunning(true);
    setTimeout(() => {
      router.push(`/backtest/result?strategy=${strategyId}&symbol=${symbol}`);
    }, 1500);
  }

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="策略回测" />

      {/* ── Multi-factor Tushare status banner ─────────────────────── */}
      {isMultiFactor && (
        <div className="mx-4 mt-4 p-3 rounded-2xl flex items-start gap-2"
          style={{
            background: tushareOk
              ? "rgba(0,229,168,0.06)"
              : "rgba(250,204,21,0.06)",
            border: `1px solid ${tushareOk ? "rgba(0,229,168,0.2)" : "rgba(250,204,21,0.25)"}`,
          }}>
          {tushareOk === null ? (
            <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin mt-0.5"
              style={{ borderColor: "#94A3B8", borderTopColor: "transparent" }} />
          ) : tushareOk ? (
            <CheckCircle size={14} color="#00E5A8" className="flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={14} color="#FACC15" className="flex-shrink-0 mt-0.5" />
          )}
          <div>
            {tushareOk === null && (
              <p className="text-[12px]" style={{ color: "#94A3B8" }}>检查 Tushare 连接中…</p>
            )}
            {tushareOk === true && (
              <>
                <p className="font-bold text-[12px]" style={{ color: "#00E5A8" }}>
                  Tushare 已连接 — 可运行真实历史回测
                </p>
                <p className="text-[11px] mt-0.5 leading-[1.6]" style={{ color: "#94A3B8" }}>
                  使用 Tushare 日线历史数据（前复权），含 T+1 / 手续费 / 印花税 / 滑点模拟。
                  每周调仓，最多持仓 5 只，不使用未来函数。
                </p>
              </>
            )}
            {tushareOk === false && (
              <>
                <p className="font-bold text-[12px]" style={{ color: "#FACC15" }}>
                  Tushare Token 未配置 — 无法运行真实回测
                </p>
                <p className="text-[11px] mt-0.5 leading-[1.6]" style={{ color: "#94A3B8" }}>
                  请在 Vercel 环境变量中配置 TUSHARE_TOKEN 后重新部署。
                  配置后可获取历史K线 + 财务数据，运行合规多因子回测。
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="px-4 pt-4 space-y-4 pb-8">

        {/* 1. 选择股票（多因子时隐藏，策略覆盖全池）*/}
        {!isMultiFactor && (
          <div>
            <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>① 选择股票</label>
            <div className="grid grid-cols-3 gap-2">
              {MOCK_STOCKS.slice(0, 6).map((s) => (
                <button key={s.symbol} onClick={() => setSymbol(s.symbol)}
                  className="p-2.5 rounded-xl text-center transition-all"
                  style={{
                    background: symbol === s.symbol ? "rgba(0,229,168,0.15)" : "#0d1f3c",
                    border: `1px solid ${symbol === s.symbol ? "#00E5A8" : "#1a2f50"}`,
                  }}>
                  <p className="font-bold text-[12px]" style={{ color: symbol === s.symbol ? "#00E5A8" : "#F8FAFC" }}>{s.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>{s.symbol}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {isMultiFactor && (
          <div>
            <label className="text-[12px] font-bold mb-1 block" style={{ color: "#94A3B8" }}>① 股票池</label>
            <div className="p-3 rounded-xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <p className="text-[12px] font-semibold" style={{ color: "#00E5A8" }}>A股多因子策略池（20只）</p>
              <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>
                贵州茅台、比亚迪、宁德时代、中国平安 等20只大中盘龙头股
              </p>
            </div>
          </div>
        )}

        {/* 2. 选择策略 */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>② 选择策略</label>
          <div className="space-y-2">
            {MOCK_STRATEGIES.map((st) => (
              <button key={st.id} onClick={() => { setStrategyId(st.id); setResult(null); setResultError(null); }}
                className="w-full p-3 rounded-xl flex items-center justify-between"
                style={{
                  background: strategyId === st.id ? "rgba(0,229,168,0.1)" : "#0d1f3c",
                  border: `1px solid ${strategyId === st.id ? "#00E5A8" : "#1a2f50"}`,
                }}>
                <div className="text-left">
                  <p className="font-bold text-[13px]" style={{ color: strategyId === st.id ? "#00E5A8" : "#F8FAFC" }}>{st.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>{st.marketCondition} · 胜率{st.winRate}%</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-[14px]" style={{ color: "#00E5A8" }}>+{st.annualReturn}%</p>
                  {st.id === "a-share-multi-factor" && (
                    <p className="text-[9px] mt-0.5" style={{ color: "#3B82F6" }}>Tushare数据</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 3. 时间范围 */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>③ 回测时间段</label>
          <div className="grid grid-cols-3 gap-2">
            {TIME_RANGES.map((t) => (
              <button key={t} onClick={() => setTimeRange(t)}
                className="py-2.5 rounded-xl text-[13px] font-semibold"
                style={{
                  background: timeRange === t ? "rgba(0,229,168,0.15)" : "#0d1f3c",
                  border: `1px solid ${timeRange === t ? "#00E5A8" : "#1a2f50"}`,
                  color: timeRange === t ? "#00E5A8" : "#94A3B8",
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* 4. 初始资金 */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>④ 初始资金（元）</label>
          <div className="flex gap-2">
            {[50000, 100000, 500000].map((v) => (
              <button key={v} onClick={() => setCapital(v)}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold"
                style={{
                  background: capital === v ? "rgba(0,229,168,0.15)" : "#0d1f3c",
                  border: `1px solid ${capital === v ? "#00E5A8" : "#1a2f50"}`,
                  color: capital === v ? "#00E5A8" : "#94A3B8",
                }}>
                ¥{(v / 10000).toFixed(0)}万
              </button>
            ))}
          </div>
        </div>

        {/* 5. 止盈止损（多因子策略由引擎控制，仅参考）*/}
        {!isMultiFactor && (
          <div>
            <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>⑤ 止盈止损</label>
            <div className="p-4 rounded-2xl space-y-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="flex items-center justify-between">
                <span className="text-[13px]" style={{ color: "#94A3B8" }}>止损比例</span>
                <div className="flex items-center gap-2">
                  {[5, 8, 10, 15].map((v) => (
                    <button key={v} onClick={() => setStopLoss(v)}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-bold"
                      style={{
                        background: stopLoss === v ? "rgba(239,68,68,0.15)" : "#0a1628",
                        color: stopLoss === v ? "#EF4444" : "#64748B",
                        border: `1px solid ${stopLoss === v ? "#EF4444" : "#1a2f50"}`,
                      }}>
                      -{v}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px]" style={{ color: "#94A3B8" }}>止盈比例</span>
                <div className="flex items-center gap-2">
                  {[10, 15, 20, 30].map((v) => (
                    <button key={v} onClick={() => setTakeProfit(v)}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-bold"
                      style={{
                        background: takeProfit === v ? "rgba(0,229,168,0.15)" : "#0a1628",
                        color: takeProfit === v ? "#00E5A8" : "#64748B",
                        border: `1px solid ${takeProfit === v ? "#00E5A8" : "#1a2f50"}`,
                      }}>
                      +{v}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. 手续费 */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>
            {isMultiFactor ? "⑤" : "⑥"} 手续费率
          </label>
          <div className="grid grid-cols-3 gap-2">
            {FEE_OPTIONS.map((f) => (
              <button key={f} onClick={() => setFee(f)}
                className="py-2.5 rounded-xl text-[12px] font-semibold"
                style={{
                  background: fee === f ? "rgba(0,229,168,0.15)" : "#0d1f3c",
                  border: `1px solid ${fee === f ? "#00E5A8" : "#1a2f50"}`,
                  color: fee === f ? "#00E5A8" : "#94A3B8",
                }}>
                {f}%
              </button>
            ))}
          </div>
          {isMultiFactor && (
            <p className="text-[10px] mt-1.5" style={{ color: "#64748B" }}>
              卖出额外收取印花税 0.1%，单边滑点 0.05%（已内置）
            </p>
          )}
        </div>

        {/* 配置确认 */}
        <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <p className="font-bold text-[13px] mb-3" style={{ color: "#F8FAFC" }}>回测配置确认</p>
          {[
            { label: "股票池",  value: isMultiFactor ? "A股多因子池（20只）" : `${stock.name} (${stock.symbol})` },
            { label: "策略",    value: strategy.name },
            { label: "时间段",  value: timeRange },
            { label: "初始资金", value: `¥${capital.toLocaleString()}` },
            { label: "手续费",  value: `${fee}%${isMultiFactor ? " + 印花税0.1%" : ""}` },
            { label: "数据来源", value: isMultiFactor ? "Tushare 历史日线（前复权）" : "策略参考值" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-1.5" style={{ borderBottom: "1px solid #1a2f50" }}>
              <span className="text-[12px]" style={{ color: "#94A3B8" }}>{label}</span>
              <span className="text-[12px] font-semibold" style={{ color: "#F8FAFC" }}>{value}</span>
            </div>
          ))}
        </div>

        {/* 运行按钮 */}
        {isMultiFactor && tushareOk === false ? (
          <div className="w-full py-4 rounded-2xl font-black text-[14px] flex items-center justify-center gap-2"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50", color: "#64748B" }}>
            <Lock size={15} />
            Tushare Token 未配置，回测暂不可用
          </div>
        ) : (
          <button onClick={handleRun}
            disabled={running || (isMultiFactor && tushareOk === null)}
            className="w-full py-4 rounded-2xl font-black text-[16px] active:opacity-85 transition-opacity"
            style={{
              background: running ? "#0d1f3c" : "linear-gradient(135deg, #00E5A8, #00b885)",
              color: running ? "#64748B" : "#07111F",
            }}>
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "#94A3B8", borderTopColor: "transparent" }} />
                {isMultiFactor ? "Tushare 数据加载中（约30-60s）…" : "回测运行中…"}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <BarChart3 size={18} />
                {isMultiFactor ? "运行真实回测（Tushare）" : "开始回测"}
              </span>
            )}
          </button>
        )}

        {/* 回测结果（多因子）*/}
        {isMultiFactor && result && (
          <div className="mt-2">
            <BacktestResultPanel result={result} />
          </div>
        )}

        {/* 错误提示 */}
        {isMultiFactor && resultError && (
          <div className="p-3 rounded-2xl flex items-start gap-2"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertTriangle size={13} color="#EF4444" className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[12px]" style={{ color: "#EF4444" }}>回测失败</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#94A3B8" }}>{resultError}</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "#00E5A8", borderTopColor: "transparent" }} />
      </div>
    }>
      <BacktestForm />
    </Suspense>
  );
}
