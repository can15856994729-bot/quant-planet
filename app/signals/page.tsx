"use client";
import { useState } from "react";
import { Bell, BellOff, Info, TrendingUp, TrendingDown, Zap, Shield, Activity } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_SIGNALS } from "@/lib/mock-data";
import { signalTypeLabel, signalTypeColor, marketColor, formatMarket, pnlColor } from "@/lib/utils";
import type { SignalType } from "@/types";

const FILTER_TABS: (SignalType | "全部")[] = ["全部", "BUY", "SELL", "BREAKOUT", "GOLDEN_CROSS", "STOP_LOSS", "HIGH_RISK"];

const FILTER_LABELS: Record<string, string> = {
  "全部": "全部", "BUY": "买入", "SELL": "卖出",
  "BREAKOUT": "突破", "GOLDEN_CROSS": "金叉",
  "STOP_LOSS": "止损", "HIGH_RISK": "风险",
};

function SignalIcon({ type }: { type: SignalType }) {
  if (type === "BUY" || type === "GOLDEN_CROSS") return <TrendingUp size={14} />;
  if (type === "SELL" || type === "STOP_LOSS") return <TrendingDown size={14} />;
  if (type === "BREAKOUT") return <Zap size={14} />;
  if (type === "HIGH_RISK") return <Shield size={14} />;
  return <Activity size={14} />;
}

export default function SignalsPage() {
  const [filter, setFilter] = useState<SignalType | "全部">("全部");
  const [notifyOn, setNotifyOn] = useState(true);
  const [readSet, setReadSet] = useState<Set<string>>(new Set());

  const filtered = filter === "全部" ? MOCK_SIGNALS : MOCK_SIGNALS.filter((s) => s.type === filter);
  const unreadCount = MOCK_SIGNALS.filter((s) => !s.read && !readSet.has(s.id)).length;

  function markRead(id: string) {
    setReadSet((prev) => new Set([...prev, id]));
  }

  const strengthBg: Record<string, string> = {
    "强": "rgba(0,229,168,0.15)", "中": "rgba(250,204,21,0.12)", "弱": "rgba(148,163,184,0.1)"
  };
  const strengthColor: Record<string, string> = {
    "强": "#00E5A8", "中": "#FACC15", "弱": "#94A3B8"
  };

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
            {notifyOn ? <Bell size={16} color="#00E5A8" /> : <BellOff size={16} color="#4a6080" />}
          </button>
        }
      />

      {/* 信号统计 */}
      <div className="grid grid-cols-4 gap-2 px-4 pt-4">
        {[
          { label: "今日信号", value: MOCK_SIGNALS.length, color: "#F8FAFC" },
          { label: "买入信号", value: MOCK_SIGNALS.filter((s) => s.type === "BUY" || s.type === "GOLDEN_CROSS").length, color: "#00E5A8" },
          { label: "卖出信号", value: MOCK_SIGNALS.filter((s) => s.type === "SELL" || s.type === "STOP_LOSS").length, color: "#EF4444" },
          { label: "未读",     value: unreadCount, color: "#FACC15" },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-xl text-center" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="font-black text-[20px] num" style={{ color }}>{value}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#4a6080" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* 提醒开关状态 */}
      <div className="mx-4 mt-3 px-3 py-2 rounded-xl flex items-center justify-between"
        style={{ background: notifyOn ? "rgba(0,229,168,0.06)" : "#0a1628", border: `1px solid ${notifyOn ? "rgba(0,229,168,0.12)" : "#1a2f50"}` }}>
        <div className="flex items-center gap-2">
          {notifyOn ? <Bell size={13} color="#00E5A8" /> : <BellOff size={13} color="#4a6080" />}
          <span className="text-[12px]" style={{ color: notifyOn ? "#00E5A8" : "#4a6080" }}>
            {notifyOn ? "实时信号提醒已开启" : "信号提醒已关闭"}
          </span>
        </div>
        <span className="text-[10px]" style={{ color: "#4a6080" }}>点击铃铛切换</span>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto">
        {FILTER_TABS.map((t) => {
          const isActive = filter === t;
          const c = t === "全部" ? "#00E5A8" : signalTypeColor(t as SignalType);
          return (
            <button key={t} onClick={() => setFilter(t)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold"
              style={{
                background: isActive ? `${c}20` : "#0d1f3c",
                color: isActive ? c : "#4a6080",
                border: `1px solid ${isActive ? c : "#1a2f50"}`,
              }}>
              {FILTER_LABELS[t]}
            </button>
          );
        })}
      </div>

      {/* 信号列表 */}
      <div className="px-4 space-y-3 pb-24">
        {filtered.map((sig) => {
          const isRead = sig.read || readSet.has(sig.id);
          const c = signalTypeColor(sig.type);
          return (
            <div key={sig.id}
              className="p-4 rounded-2xl"
              style={{
                background: isRead ? "#0a1628" : "#0d1f3c",
                border: `1px solid ${isRead ? "#1a2f50" : c + "40"}`,
                opacity: isRead ? 0.75 : 1,
              }}
              onClick={() => markRead(sig.id)}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {/* 未读圆点 */}
                  {!isRead && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ background: c }} />}
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                    style={{ background: `${c}15`, border: `1px solid ${c}30` }}>
                    <span style={{ color: c }}><SignalIcon type={sig.type} /></span>
                    <span className="font-bold text-[11px]" style={{ color: c }}>{signalTypeLabel(sig.type)}</span>
                  </div>
                  <div className="px-2 py-1 rounded-lg"
                    style={{ background: strengthBg[sig.strength] }}>
                    <span className="font-bold text-[10px]" style={{ color: strengthColor[sig.strength] }}>
                      {sig.strength}信号
                    </span>
                  </div>
                </div>
                <span className="text-[10px]" style={{ color: "#4a6080" }}>{sig.triggeredAt}</span>
              </div>

              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>{sig.name}</span>
                  <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                    style={{ background: `${marketColor(sig.market)}18`, color: marketColor(sig.market) }}>
                    {formatMarket(sig.market)}
                  </span>
                </div>
                <span className="font-bold text-[14px] num" style={{ color: "#F8FAFC" }}>¥{sig.price.toFixed(2)}</span>
              </div>

              <p className="text-[12px] leading-[1.6]" style={{ color: "#94A3B8" }}>{sig.reason}</p>

              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: "#0a1628", color: "#3B82F6", border: "1px solid #1a2f50" }}>
                  {sig.strategy}
                </span>
                <span className="text-[10px]" style={{ color: "#4a6080" }}>{sig.symbol}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 免责声明 */}
      <div className="mx-4 mb-6 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}>
        <div className="flex items-start gap-2">
          <Info size={12} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-[1.7]" style={{ color: "#4a6080" }}>
            ⚠️ 以上信号均为量化模型基于历史数据计算，不构成投资建议。信号存在滞后性和误判，历史信号不代表未来表现，买卖决策风险自担。
          </p>
        </div>
      </div>
    </div>
  );
}
