"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, ChevronDown, AlertTriangle, Lock } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_STRATEGIES, MOCK_STOCKS } from "@/lib/mock-data";

const TIME_RANGES = ["近1年", "近3年", "近5年", "自定义"];
const FEE_OPTIONS = [0.03, 0.05, 0.1];

function BacktestForm() {
  const router = useRouter();
  const params = useSearchParams();
  const defaultStrategyId = params.get("strategy") ?? "s1";

  const [symbol, setSymbol] = useState("600519");
  const [strategyId, setStrategyId] = useState(defaultStrategyId);
  const [timeRange, setTimeRange] = useState("近3年");
  const [capital, setCapital] = useState(100000);
  const [stopLoss, setStopLoss] = useState(8);
  const [takeProfit, setTakeProfit] = useState(20);
  const [fee, setFee] = useState(0.05);
  const [running, setRunning] = useState(false);

  const strategy = MOCK_STRATEGIES.find((s) => s.id === strategyId) ?? MOCK_STRATEGIES[0];
  const stock = MOCK_STOCKS.find((s) => s.symbol === symbol) ?? MOCK_STOCKS[0];
  // Multi-factor strategy cannot run real backtest — missing historical financial data
  const isMultiFactor = strategyId === "a-share-multi-factor";

  function handleRun() {
    if (isMultiFactor) return; // guarded by disabled button
    setRunning(true);
    setTimeout(() => {
      router.push(`/backtest/result?strategy=${strategyId}&symbol=${symbol}`);
    }, 1500);
  }

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="策略回测" />

      {/* ── Data status banner (only for multi-factor) ── */}
      {isMultiFactor && (
        <div className="mx-4 mt-4 p-3 rounded-2xl flex items-start gap-2"
          style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.25)" }}>
          <AlertTriangle size={14} color="#FACC15" className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-[12px]" style={{ color: "#FACC15" }}>
              历史数据不足，暂不展示真实回测
            </p>
            <p className="text-[11px] mt-0.5 leading-[1.6]" style={{ color: "#94A3B8" }}>
              A股多因子策略需要多年历史K线 + 财务数据（ROE/利润增长）才能运行合规回测。
              当前接入东方财富近期行情，缺少历史财务数据，无法生成真实回测结果。
              策略详情页可查看今日<span style={{ color: "#00E5A8" }}>实时信号</span>。
            </p>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 space-y-4 pb-8">

        {/* 1. 选择股票 */}
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

        {/* 2. 选择策略 */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>② 选择策略</label>
          <div className="space-y-2">
            {MOCK_STRATEGIES.map((st) => (
              <button key={st.id} onClick={() => setStrategyId(st.id)}
                className="w-full p-3 rounded-xl flex items-center justify-between"
                style={{
                  background: strategyId === st.id ? "rgba(0,229,168,0.1)" : "#0d1f3c",
                  border: `1px solid ${strategyId === st.id ? "#00E5A8" : "#1a2f50"}`,
                }}>
                <div className="text-left">
                  <p className="font-bold text-[13px]" style={{ color: strategyId === st.id ? "#00E5A8" : "#F8FAFC" }}>{st.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>{st.marketCondition} · 胜率{st.winRate}%</p>
                </div>
                <p className="font-black text-[14px]" style={{ color: "#00E5A8" }}>+{st.annualReturn}%</p>
              </button>
            ))}
          </div>
        </div>

        {/* 3. 时间范围 */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>③ 回测时间段</label>
          <div className="grid grid-cols-4 gap-2">
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

        {/* 5. 止盈止损 */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>⑤ 止盈止损设置</label>
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

        {/* 6. 手续费 */}
        <div>
          <label className="text-[12px] font-bold mb-2 block" style={{ color: "#94A3B8" }}>⑥ 手续费率</label>
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
        </div>

        {/* 确认信息 */}
        <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <p className="font-bold text-[13px] mb-3" style={{ color: "#F8FAFC" }}>回测配置确认</p>
          {[
            { label: "股票",   value: `${stock.name} (${stock.symbol})` },
            { label: "策略",   value: strategy.name },
            { label: "时间段", value: timeRange },
            { label: "初始资金", value: `¥${capital.toLocaleString()}` },
            { label: "止损/止盈", value: `-${stopLoss}% / +${takeProfit}%` },
            { label: "手续费", value: `${fee}%` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-1.5" style={{ borderBottom: "1px solid #1a2f50" }}>
              <span className="text-[12px]" style={{ color: "#94A3B8" }}>{label}</span>
              <span className="text-[12px] font-semibold" style={{ color: "#F8FAFC" }}>{value}</span>
            </div>
          ))}
        </div>

        {/* 运行按钮 */}
        {isMultiFactor ? (
          <div className="w-full py-4 rounded-2xl font-black text-[14px] flex items-center justify-center gap-2"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50", color: "#64748B" }}>
            <Lock size={15} />
            历史数据不足，回测暂不可用
          </div>
        ) : (
          <button onClick={handleRun} disabled={running}
            className="w-full py-4 rounded-2xl font-black text-[16px] glow-green active:opacity-85 transition-opacity"
            style={{
              background: running ? "#0d1f3c" : "linear-gradient(135deg, #00E5A8, #00b885)",
              color: running ? "#64748B" : "#07111F",
            }}>
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "#94A3B8", borderTopColor: "transparent" }} />
                回测运行中…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <BarChart3 size={18} />
                开始回测
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "#00E5A8", borderTopColor: "transparent" }} /></div>}>
      <BacktestForm />
    </Suspense>
  );
}
