"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, BellOff, Info, TrendingUp, TrendingDown, Zap, Shield, Activity } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_SIGNALS } from "@/lib/mock-data";
import { signalTypeLabel, signalTypeColor, marketColor, formatMarket, formatPrice, marketToCurrency } from "@/lib/utils";
import { useWatchlistQuotes } from "@/lib/useMarketData";
import { getReadSet, persistRead } from "@/lib/readSignals";
import type { SignalType } from "@/types";

// ── 扩展 filter 类型，支持买入类/卖出类/未读 聚合筛选 ──
type FilterKey = SignalType | "全部" | "未读" | "BUY_GROUP" | "SELL_GROUP";

const FILTER_TABS: Array<{ key: FilterKey; label: string; color: string }> = [
  { key: "全部",       label: "全部", color: "#00E5A8" },
  { key: "BUY_GROUP", label: "买入", color: "#00E5A8" },
  { key: "SELL_GROUP",label: "卖出", color: "#EF4444" },
  { key: "BREAKOUT",  label: "突破", color: "#3B82F6" },
  { key: "HIGH_RISK", label: "风险", color: "#EF4444" },
  { key: "未读",      label: "未读", color: "#FACC15" },
];

function getFiltered(signals: typeof MOCK_SIGNALS, filter: FilterKey, readSet: Set<string>) {
  if (filter === "全部")       return signals;
  if (filter === "未读")       return signals.filter((s) => !s.read && !readSet.has(s.id));
  if (filter === "BUY_GROUP")  return signals.filter((s) => s.type === "BUY" || s.type === "GOLDEN_CROSS");
  if (filter === "SELL_GROUP") return signals.filter((s) => s.type === "SELL" || s.type === "STOP_LOSS");
  return signals.filter((s) => s.type === filter);
}

function SignalIcon({ type }: { type: SignalType }) {
  if (type === "BUY" || type === "GOLDEN_CROSS") return <TrendingUp size={14} />;
  if (type === "SELL" || type === "STOP_LOSS")   return <TrendingDown size={14} />;
  if (type === "BREAKOUT")  return <Zap size={14} />;
  if (type === "HIGH_RISK") return <Shield size={14} />;
  return <Activity size={14} />;
}

const SIGNAL_SYMBOLS = [...new Set(MOCK_SIGNALS.map((s) => s.symbol))];

export default function SignalsPage() {
  const [filter, setFilter]     = useState<FilterKey>("全部");
  const [notifyOn, setNotifyOn] = useState(true);
  const [readSet, setReadSet]   = useState<Set<string>>(new Set());

  useEffect(() => { setReadSet(getReadSet()); }, []);

  const { quotes } = useWatchlistQuotes(SIGNAL_SYMBOLS);

  const buyCount    = MOCK_SIGNALS.filter((s) => s.type === "BUY" || s.type === "GOLDEN_CROSS").length;
  const sellCount   = MOCK_SIGNALS.filter((s) => s.type === "SELL" || s.type === "STOP_LOSS").length;
  const unreadCount = MOCK_SIGNALS.filter((s) => !s.read && !readSet.has(s.id)).length;
  const filtered    = getFiltered(MOCK_SIGNALS, filter, readSet);

  function markRead(id: string) {
    setReadSet((prev) => new Set([...prev, id]));
    persistRead(id);
  }

  const strengthBg: Record<string, string> = {
    "强": "rgba(0,229,168,0.15)", "中": "rgba(250,204,21,0.12)", "弱": "rgba(148,163,184,0.1)",
  };
  const strengthColor: Record<string, string> = {
    "强": "#00E5A8", "中": "#FACC15", "弱": "#94A3B8",
  };

  // 统计卡配置：点击直接设置对应筛选
  const statCards = [
    { label: "今日信号", value: MOCK_SIGNALS.length, color: "#F8FAFC", filter: "全部"      as FilterKey },
    { label: "买入信号", value: buyCount,             color: "#00E5A8", filter: "BUY_GROUP" as FilterKey },
    { label: "卖出信号", value: sellCount,            color: "#EF4444", filter: "SELL_GROUP"as FilterKey },
    { label: "未读",     value: unreadCount,          color: "#FACC15", filter: "未读"      as FilterKey },
  ];

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader
        title="信号中心"
        showBack={false}
        right={
          <button onClick={() => setNotifyOn(!notifyOn)}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: notifyOn ? "rgba(0,229,168,0.12)" : "rgba(148,163,184,0.08)",
              border: `1px solid ${notifyOn ? "rgba(0,229,168,0.25)" : "#1a2f50"}`,
            }}>
            {notifyOn ? <Bell size={16} color="#00E5A8" /> : <BellOff size={16} color="#94A3B8" />}
          </button>
        }
      />

      {/* 统计卡 — 点击触发对应筛选 */}
      <div className="grid grid-cols-4 gap-2 px-4 pt-4">
        {statCards.map(({ label, value, color, filter: f }) => {
          const isActive = filter === f;
          return (
            <button key={label}
              onClick={() => setFilter(f)}
              className="p-3 rounded-xl text-center active:opacity-70 transition-opacity"
              style={{
                background: isActive ? `${color}15` : "#0d1f3c",
                border: `1px solid ${isActive ? color : "#1a2f50"}`,
              }}>
              <p className="font-black text-[20px] num" style={{ color }}>{value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: isActive ? color : "#64748B" }}>{label}</p>
            </button>
          );
        })}
      </div>

      {/* 提醒开关 */}
      <div className="mx-4 mt-3 px-3 py-2 rounded-xl flex items-center justify-between"
        style={{ background: notifyOn ? "rgba(0,229,168,0.06)" : "#0a1628", border: `1px solid ${notifyOn ? "rgba(0,229,168,0.12)" : "#1a2f50"}` }}>
        <div className="flex items-center gap-2">
          {notifyOn ? <Bell size={13} color="#00E5A8" /> : <BellOff size={13} color="#94A3B8" />}
          <span className="text-[12px]" style={{ color: notifyOn ? "#00E5A8" : "#64748B" }}>
            {notifyOn ? "实时信号提醒已开启" : "信号提醒已关闭"}
          </span>
        </div>
        <span className="text-[10px]" style={{ color: "#94A3B8" }}>点击铃铛切换</span>
      </div>

      {/* 筛选 tab */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto">
        {FILTER_TABS.map(({ key, label, color }) => {
          const isActive = filter === key;
          return (
            <button key={key} onClick={() => setFilter(key)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold"
              style={{
                background: isActive ? `${color}20` : "#0d1f3c",
                color:      isActive ? color : "#64748B",
                border:     `1px solid ${isActive ? color : "#1a2f50"}`,
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* 当前筛选结果提示 */}
      {filter !== "全部" && (
        <div className="mx-4 mb-2 px-3 py-1.5 rounded-lg flex items-center justify-between"
          style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
          <span className="text-[11px]" style={{ color: "#3B82F6" }}>
            共 {filtered.length} 条{FILTER_TABS.find(t => t.key === filter)?.label}信号
          </span>
          <button onClick={() => setFilter("全部")}
            className="text-[10px] px-2 py-0.5 rounded"
            style={{ color: "#94A3B8", background: "#0d1f3c" }}>
            清除
          </button>
        </div>
      )}

      {/* 信号列表 — 点击跳转股票详情页 */}
      <div className="px-4 space-y-3 pb-24">
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Activity size={40} color="#1a2f50" className="mx-auto mb-3" />
            <p className="font-semibold" style={{ color: "#94A3B8" }}>暂无相关信号</p>
          </div>
        )}
        {filtered.map((sig) => {
          const isRead = sig.read || readSet.has(sig.id);
          const c = signalTypeColor(sig.type);
          return (
            <Link
              key={sig.id}
              href={`/stock/${sig.symbol}`}
              onClick={() => markRead(sig.id)}
            >
              <div
                className="p-4 rounded-2xl active:opacity-80 transition-opacity"
                style={{
                  background: isRead ? "#0a1628" : "#0d1f3c",
                  border: `1px solid ${isRead ? "#1a2f50" : c + "40"}`,
                  opacity: isRead ? 0.75 : 1,
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {!isRead && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ background: c }} />}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                      style={{ background: `${c}15`, border: `1px solid ${c}30` }}>
                      <span style={{ color: c }}><SignalIcon type={sig.type} /></span>
                      <span className="font-bold text-[11px]" style={{ color: c }}>{signalTypeLabel(sig.type)}</span>
                    </div>
                    <div className="px-2 py-1 rounded-lg" style={{ background: strengthBg[sig.strength] }}>
                      <span className="font-bold text-[10px]" style={{ color: strengthColor[sig.strength] }}>
                        {sig.strength}信号
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px]" style={{ color: "#94A3B8" }}>{sig.triggeredAt}</span>
                </div>

                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>{sig.name}</span>
                    <span className="text-[10px] px-1 py-0.5 rounded font-bold"
                      style={{ background: `${marketColor(sig.market)}18`, color: marketColor(sig.market) }}>
                      {formatMarket(sig.market)}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[14px] num" style={{ color: "#F8FAFC" }}>
                      {formatPrice(quotes[sig.symbol]?.price ?? sig.price, marketToCurrency(sig.market))}
                    </p>
                    {quotes[sig.symbol] && (
                      <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                        style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>实时</span>
                    )}
                  </div>
                </div>

                <p className="text-[12px] leading-[1.6]" style={{ color: "#94A3B8" }}>{sig.reason}</p>

                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: "#0a1628", color: "#3B82F6", border: "1px solid #1a2f50" }}>
                    {sig.strategy}
                  </span>
                  <span className="text-[10px]" style={{ color: "#94A3B8" }}>
                    {sig.symbol} · 点击查看详情 →
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 免责声明 */}
      <div className="mx-4 mb-6 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}>
        <div className="flex items-start gap-2">
          <Info size={12} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-[1.7]" style={{ color: "#94A3B8" }}>
            ⚠️ 以上信号均为量化模型基于历史数据计算，不构成投资建议。信号存在滞后性和误判，历史信号不代表未来表现，买卖决策风险自担。
          </p>
        </div>
      </div>
    </div>
  );
}
