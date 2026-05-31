"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Bot, ChevronLeft, AlertTriangle, Play, Loader2, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Trash2, RefreshCw, Info,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import {
  getAutoTradingConfig,
  saveAutoTradingConfig,
  getAutoTradingLogs,
  getAutoTradingOrders,
  clearAutoTradingLogs,
  getTodayStats,
  runAutoTradingOnce,
} from "@/lib/autoTradingService";
import type {
  AutoTradingConfig,
  AutoTradingLog,
  AutoOrder,
  DayStats,
} from "@/lib/autoTradingService";

// ── Modal ────────────────────────────────────────────────────────────
function Modal({
  open, title, children, onConfirm, onCancel, confirmLabel = "确认", confirmColor = "#00E5A8",
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  confirmColor?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.80)" }}>
      <div className="w-full max-w-sm rounded-3xl p-6"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <p className="font-black text-[17px] mb-3" style={{ color: "#F8FAFC" }}>{title}</p>
        <div className="text-[13px] leading-[1.7] mb-5" style={{ color: "#94A3B8" }}>{children}</div>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-2xl font-bold text-[14px]"
            style={{ background: "#0a1628", color: "#64748B", border: "1px solid #1a2f50" }}>
            取消
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-3 rounded-2xl font-bold text-[14px]"
            style={{ background: confirmColor, color: "#07111F" }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0"
      style={{ background: value ? "#00E5A8" : "#1a2f50" }}>
      <div className="absolute top-1 w-4 h-4 rounded-full transition-all"
        style={{
          background: "#F8FAFC",
          left: value ? "calc(100% - 1.25rem)" : "0.25rem",
        }} />
    </button>
  );
}

// ── Slider row ────────────────────────────────────────────────────────
function SliderRow({
  label, value, min, max, step = 0.01, format, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px]" style={{ color: "#94A3B8" }}>{label}</span>
        <span className="font-bold text-[13px] num" style={{ color: "#00E5A8" }}>{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: "#00E5A8", background: `linear-gradient(to right, #00E5A8 ${((value - min) / (max - min)) * 100}%, #1a2f50 0%)` }}
      />
    </div>
  );
}

// ── Log level badge ───────────────────────────────────────────────────
function LevelBadge({ level }: { level: AutoTradingLog["level"] }) {
  const colors: Record<AutoTradingLog["level"], { bg: string; text: string; label: string }> = {
    info:    { bg: "rgba(0,229,168,0.12)",  text: "#00E5A8",  label: "信息" },
    warning: { bg: "rgba(250,204,21,0.12)", text: "#FACC15",  label: "警告" },
    error:   { bg: "rgba(239,68,68,0.12)",  text: "#EF4444",  label: "错误" },
  };
  const c = colors[level];
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ background: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}

// ── Order status badge ────────────────────────────────────────────────
function StatusBadge({ status }: { status: AutoOrder["status"] }) {
  const colors: Record<AutoOrder["status"], { bg: string; text: string }> = {
    executed:  { bg: "rgba(0,229,168,0.12)",  text: "#00E5A8"  },
    pending:   { bg: "rgba(59,130,246,0.12)",  text: "#3B82F6"  },
    rejected:  { bg: "rgba(250,204,21,0.12)",  text: "#FACC15"  },
    failed:    { bg: "rgba(239,68,68,0.12)",   text: "#EF4444"  },
    skipped:   { bg: "rgba(100,116,139,0.12)", text: "#64748B" },
    cancelled: { bg: "rgba(100,116,139,0.12)", text: "#64748B" },
  };
  const labels: Record<AutoOrder["status"], string> = {
    executed: "已执行", pending: "待执行", rejected: "已拒绝",
    failed: "失败", skipped: "跳过", cancelled: "已取消",
  };
  const c = colors[status];
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: c.bg, color: c.text }}>
      {labels[status]}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function AutoTradingPage() {
  const [config, setConfig]             = useState<AutoTradingConfig>(() => getAutoTradingConfig());
  const [logs, setLogs]                 = useState<AutoTradingLog[]>(() => getAutoTradingLogs());
  const [orders, setOrders]             = useState<AutoOrder[]>(() => getAutoTradingOrders());
  const [stats, setStats]               = useState<DayStats>(() => getTodayStats());
  const [running, setRunning]           = useState(false);
  const [showFirstRunModal, setShowFirstRunModal] = useState(false);
  const [showSTModal, setShowSTModal]   = useState(false);
  const [showRiskSettings, setShowRiskSettings] = useState(false);
  const [runResult, setRunResult]       = useState<{
    ok: boolean; message: string; executedCount: number; rejectedCount: number;
  } | null>(null);

  // Auto-save config with debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveConfig = useCallback((patch: Partial<AutoTradingConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveAutoTradingConfig(next);
    }, 400);
  }, [config]);

  // Keep config in sync (saveConfig has stale closure fix)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveAutoTradingConfig(config);
    }, 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [config]);

  function handleToggle(val: boolean) {
    if (val && !config.hasConfirmedFirstRun) {
      setShowFirstRunModal(true);
      return;
    }
    setConfig(prev => {
      const next = { ...prev, enabled: val };
      saveAutoTradingConfig(next);
      return next;
    });
  }

  function confirmFirstRun() {
    setShowFirstRunModal(false);
    const next = { ...config, enabled: true, hasConfirmedFirstRun: true };
    setConfig(next);
    saveAutoTradingConfig(next);
  }

  function handleAllowSTChange(val: boolean) {
    if (val && !config.hasConfirmedST) {
      setShowSTModal(true);
      return;
    }
    saveConfig({ allowSTTrading: val });
  }

  function confirmST() {
    setShowSTModal(false);
    const next = { ...config, allowSTTrading: true, hasConfirmedST: true };
    setConfig(next);
    saveAutoTradingConfig(next);
  }

  async function handleRunOnce() {
    if (running) return;
    setRunning(true);
    setRunResult(null);
    try {
      const result = await runAutoTradingOnce();
      setRunResult({ ok: result.ok, message: result.message, executedCount: result.executedCount, rejectedCount: result.rejectedCount });
      setLogs(getAutoTradingLogs());
      setOrders(getAutoTradingOrders());
      setStats(getTodayStats());
    } catch (e) {
      setRunResult({ ok: false, message: String(e).slice(0, 80), executedCount: 0, rejectedCount: 0 });
    } finally {
      setRunning(false);
    }
  }

  function handleClearLogs() {
    clearAutoTradingLogs();
    setLogs([]);
  }

  const pctFmt = (v: number) => `${(v * 100).toFixed(0)}%`;
  const intFmt  = (v: number) => `${Math.round(v)}`;

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="模拟盘自动交易"
        right={
          <Link href="/sim-trading">
            <ChevronLeft size={22} color="#94A3B8" />
          </Link>
        }
      />

      {/* ── 免责声明 Banner ── */}
      <div className="mx-4 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
        <AlertTriangle size={14} color="#EF4444" className="flex-shrink-0 mt-0.5" />
        <p className="text-[12px] leading-[1.6]" style={{ color: "#EF4444" }}>
          ⚠️ 当前为模拟交易，不构成投资建议，不会产生真实资金交易。策略可能亏损，历史回测不代表未来收益。
        </p>
      </div>

      <div className="px-4 mt-4 pb-24 space-y-4">

        {/* ── 开关卡片 ── */}
        <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: config.enabled ? "rgba(0,229,168,0.12)" : "rgba(100,116,139,0.12)" }}>
                <Bot size={18} color={config.enabled ? "#00E5A8" : "#64748B"} />
              </div>
              <div>
                <p className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>自动交易</p>
                <p className="text-[11px]" style={{ color: config.enabled ? "#00E5A8" : "#64748B" }}>
                  {config.enabled ? "运行中" : "已关闭"}
                </p>
              </div>
            </div>
            <Toggle value={config.enabled} onChange={handleToggle} />
          </div>

          {/* Strategy selection */}
          <p className="text-[11px] font-bold mb-2" style={{ color: "#64748B" }}>策略选择</p>
          <div className="flex gap-2">
            {([
              { id: "a-share-multi-factor",  label: "多因子轮动",   sub: "稳健型" },
              { id: "a-share-st-reversal",   label: "ST风险反转",  sub: "激进型" },
            ] as const).map(s => (
              <button key={s.id}
                onClick={() => saveConfig({
                  strategyId:   s.id,
                  strategyName: s.label,
                })}
                className="flex-1 py-2.5 px-3 rounded-xl text-left"
                style={{
                  background: config.strategyId === s.id ? "rgba(0,229,168,0.10)" : "#0a1628",
                  border: `1px solid ${config.strategyId === s.id ? "rgba(0,229,168,0.35)" : "#1a2f50"}`,
                }}>
                <p className="font-bold text-[12px]" style={{ color: config.strategyId === s.id ? "#00E5A8" : "#94A3B8" }}>{s.label}</p>
                <p className="text-[10px]" style={{ color: "#64748B" }}>{s.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── 风险设置（可折叠）── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <button
            className="w-full flex items-center justify-between p-4"
            onClick={() => setShowRiskSettings(v => !v)}>
            <p className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>风险控制设置</p>
            {showRiskSettings
              ? <ChevronUp size={16} color="#64748B" />
              : <ChevronDown size={16} color="#64748B" />}
          </button>

          {showRiskSettings && (
            <div className="px-4 pb-4 space-y-4">
              {/* Sliders */}
              <div className="p-3 rounded-xl" style={{ background: "#0a1628" }}>
                <p className="text-[11px] font-bold mb-3" style={{ color: "#64748B" }}>仓位控制</p>
                <SliderRow
                  label="最大总仓位"
                  value={config.maxTotalPosition}
                  min={0.60} max={0.95} step={0.05}
                  format={pctFmt}
                  onChange={v => saveConfig({ maxTotalPosition: v })}
                />
                <SliderRow
                  label="最大单股仓位"
                  value={config.maxSinglePosition}
                  min={0.03} max={0.15} step={0.01}
                  format={pctFmt}
                  onChange={v => saveConfig({ maxSinglePosition: v })}
                />
                <SliderRow
                  label="最低现金保留"
                  value={config.minCashReserve}
                  min={0.05} max={0.30} step={0.05}
                  format={pctFmt}
                  onChange={v => saveConfig({ minCashReserve: v })}
                />
                <SliderRow
                  label="每日最大买入数"
                  value={config.maxDailyBuyCount}
                  min={1} max={5} step={1}
                  format={intFmt}
                  onChange={v => saveConfig({ maxDailyBuyCount: v })}
                />
              </div>

              {/* Stop-loss */}
              <div className="p-3 rounded-xl" style={{ background: "#0a1628" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-bold" style={{ color: "#94A3B8" }}>止损</p>
                  <Toggle value={config.enableStopLoss} onChange={v => saveConfig({ enableStopLoss: v })} />
                </div>
                {config.enableStopLoss && (
                  <SliderRow
                    label="止损百分比"
                    value={config.stopLossPercent}
                    min={0.03} max={0.20} step={0.01}
                    format={pctFmt}
                    onChange={v => saveConfig({ stopLossPercent: v })}
                  />
                )}
              </div>

              {/* Take profit */}
              <div className="p-3 rounded-xl" style={{ background: "#0a1628" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-bold" style={{ color: "#94A3B8" }}>止盈</p>
                  <Toggle value={config.enableTakeProfit} onChange={v => saveConfig({ enableTakeProfit: v })} />
                </div>
                {config.enableTakeProfit && (
                  <SliderRow
                    label="止盈百分比"
                    value={config.takeProfitPercent}
                    min={0.10} max={0.50} step={0.05}
                    format={pctFmt}
                    onChange={v => saveConfig({ takeProfitPercent: v })}
                  />
                )}
              </div>

              {/* Toggles */}
              <div className="p-3 rounded-xl space-y-3" style={{ background: "#0a1628" }}>
                <p className="text-[11px] font-bold" style={{ color: "#64748B" }}>交易限制</p>

                {[
                  { key: "enableTPlusOne" as const,         label: "启用T+1限制",        sub: "今日买入不能当日卖出" },
                  { key: "enableLimitUpDownCheck" as const, label: "涨跌停检查",          sub: "涨停不买，跌停不卖" },
                  { key: "enableSTRestriction" as const,    label: "ST限制",              sub: "启用ST股票交易限制" },
                ].map(({ key, label, sub }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px]" style={{ color: "#F8FAFC" }}>{label}</p>
                      <p className="text-[10px]" style={{ color: "#64748B" }}>{sub}</p>
                    </div>
                    <Toggle value={config[key]} onChange={v => saveConfig({ [key]: v })} />
                  </div>
                ))}

                {/* ST trading - special with modal confirmation */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px]" style={{ color: config.allowSTTrading ? "#FACC15" : "#F8FAFC" }}>
                      允许ST股交易
                    </p>
                    <p className="text-[10px]" style={{ color: "#64748B" }}>高风险，谨慎开启</p>
                  </div>
                  <Toggle value={config.allowSTTrading} onChange={handleAllowSTChange} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 今日状态 ── */}
        <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>今日状态</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: stats.ran ? "rgba(0,229,168,0.12)" : "rgba(100,116,139,0.12)",
                color: stats.ran ? "#00E5A8" : "#64748B",
              }}>
              {stats.ran ? "已运行" : "尚未运行"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "信号数",  value: stats.signalCount,   color: "#3B82F6" },
              { label: "下单数",  value: stats.orderCount,    color: "#F8FAFC" },
              { label: "已执行",  value: stats.executedCount, color: "#00E5A8" },
              { label: "已拒绝",  value: stats.rejectedCount, color: "#FACC15" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-2 rounded-xl" style={{ background: "#0a1628" }}>
                <p className="font-black text-[20px] num" style={{ color }}>{value}</p>
                <p className="text-[10px]" style={{ color: "#64748B" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 立即运行按钮 ── */}
        <div>
          <button onClick={handleRunOnce}
            disabled={running}
            className="w-full py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-2"
            style={{
              background: running ? "#1a2f50" : "linear-gradient(135deg, #00E5A8, #00b885)",
              color: running ? "#64748B" : "#07111F",
            }}>
            {running
              ? <><Loader2 size={18} className="animate-spin" />运行中…</>
              : <><Play size={18} />立即运行一次</>}
          </button>

          {/* Run result */}
          {runResult && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl"
              style={{
                background: runResult.ok ? "rgba(0,229,168,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${runResult.ok ? "rgba(0,229,168,0.25)" : "rgba(239,68,68,0.25)"}`,
              }}>
              {runResult.ok
                ? <CheckCircle2 size={16} color="#00E5A8" className="flex-shrink-0 mt-0.5" />
                : <XCircle      size={16} color="#EF4444" className="flex-shrink-0 mt-0.5" />}
              <div>
                <p className="font-bold text-[13px]" style={{ color: runResult.ok ? "#00E5A8" : "#EF4444" }}>
                  {runResult.ok ? "运行完成" : "运行失败"}
                </p>
                <p className="text-[12px]" style={{ color: "#94A3B8" }}>{runResult.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── 自动交易日志 ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center justify-between p-4 pb-3">
            <p className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
              自动交易日志
              <span className="ml-1.5 text-[11px] font-normal" style={{ color: "#64748B" }}>({logs.length})</span>
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => { setLogs(getAutoTradingLogs()); setOrders(getAutoTradingOrders()); setStats(getTodayStats()); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                <RefreshCw size={13} color="#00E5A8" />
              </button>
              <button onClick={handleClearLogs}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                <Trash2 size={13} color="#EF4444" />
              </button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-10">
              <Info size={28} color="#1a2f50" className="mx-auto mb-2" />
              <p className="text-[12px]" style={{ color: "#64748B" }}>暂无日志</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1a2f50" }}>
                    {["时间", "级别", "股票", "动作", "消息"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold" style={{ color: "#64748B" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 50).map(log => (
                    <tr key={log.id} style={{ borderBottom: "1px solid #0a1628" }}>
                      <td className="px-3 py-2 num whitespace-nowrap" style={{ color: "#64748B" }}>
                        {new Date(log.time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td className="px-3 py-2">
                        <LevelBadge level={log.level} />
                      </td>
                      <td className="px-3 py-2" style={{ color: "#94A3B8" }}>
                        {log.stockName ?? log.symbol ?? "-"}
                      </td>
                      <td className="px-3 py-2" style={{ color: "#64748B" }}>
                        {log.action ?? "-"}
                      </td>
                      <td className="px-3 py-2" style={{ color: "#94A3B8", maxWidth: "200px" }}>
                        <span className="block truncate">{log.message}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── 近期订单 ── */}
        {orders.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="font-bold text-[14px] p-4 pb-2" style={{ color: "#F8FAFC" }}>
              自动交易订单
              <span className="ml-1.5 text-[11px] font-normal" style={{ color: "#64748B" }}>({orders.length})</span>
            </p>
            <div className="space-y-2 px-4 pb-4">
              {orders.slice(0, 20).map(order => (
                <div key={order.orderId} className="p-3 rounded-xl"
                  style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-[11px]"
                        style={{
                          background: order.action === "buy"
                            ? "rgba(0,229,168,0.15)"
                            : "rgba(239,68,68,0.15)",
                          color: order.action === "buy" ? "#00E5A8" : "#EF4444",
                        }}>
                        {order.action === "buy" ? "买" : "卖"}
                      </div>
                      <div>
                        <p className="font-bold text-[12px]" style={{ color: "#F8FAFC" }}>{order.name}</p>
                        <p className="text-[10px]" style={{ color: "#64748B" }}>{order.symbol}</p>
                      </div>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: "#64748B" }}>
                      {order.quantity}股 @¥{order.price.toFixed(2)}
                    </span>
                    <span className="text-[10px] num" style={{ color: "#94A3B8" }}>
                      {new Date(order.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {order.rejectReason && (
                    <p className="text-[10px] mt-1" style={{ color: "#FACC15" }}>拒绝原因：{order.rejectReason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 风险提示 ── */}
        <div className="flex items-start gap-2 p-3 rounded-xl"
          style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.12)" }}>
          <Info size={12} color="#FACC15" className="flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-[1.7]" style={{ color: "#94A3B8" }}>
            本自动交易功能仅作用于模拟账户，不会产生真实资金操作。策略信号基于量化模型，不保证盈利。投资有风险，量化策略亦存在失效风险。
          </p>
        </div>
      </div>

      {/* ── 首次确认弹窗 ── */}
      <Modal
        open={showFirstRunModal}
        title="开启模拟盘自动交易"
        onConfirm={confirmFirstRun}
        onCancel={() => setShowFirstRunModal(false)}
        confirmLabel="我已了解，开启"
        confirmColor="#00E5A8">
        <p>
          模拟盘自动交易会根据策略信号<strong style={{ color: "#F8FAFC" }}>自动买入和卖出</strong>，但仅限模拟账户，不涉及真实资金。
        </p>
        <br />
        <p>策略可能亏损，历史回测不代表未来收益。</p>
        <br />
        <p>确认开启自动交易？</p>
      </Modal>

      {/* ── ST 确认弹窗 ── */}
      <Modal
        open={showSTModal}
        title="ST股票交易风险提示"
        onConfirm={confirmST}
        onCancel={() => { setShowSTModal(false); }}
        confirmLabel="我已了解风险，允许"
        confirmColor="#FACC15">
        <p>
          ST股票存在以下高风险：
        </p>
        <ul className="mt-2 space-y-1 list-disc list-inside" style={{ color: "#FACC15" }}>
          <li>退市风险</li>
          <li>连续跌停风险</li>
          <li>停牌风险</li>
          <li>流动性枯竭风险</li>
        </ul>
        <br />
        <p>是否允许模拟盘自动交易ST股票？</p>
      </Modal>
    </div>
  );
}
