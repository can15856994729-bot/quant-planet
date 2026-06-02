"use client";

/**
 * components/strategy/STAnnouncementSummary.tsx
 *
 * ST 策略公告摘要组件（展示层）
 *
 * 用于 st-limit-down-watch / st-limit-down-first-limit-up 策略页面，
 * 显示个股的公告维度风险/机会信号。
 *
 * 数据来源：/api/stocks/:symbol/announcements/st-summary
 */

import { useEffect, useState } from "react";
import { Bell, RefreshCw, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

interface STSummary {
  tsCode:                     string;
  hasRestructuringSignal:     boolean;
  restructuringExpectation:   number;
  hasInvestigationSignal:     boolean;
  delistingRisk:              number;
  hasRemoveSTSignal:          boolean;
  removeSTExpectation:        number;
  recentDividend:             boolean;
  recentShareholderReduction: boolean;
  latestAnnDate:              string;
  availableSources:           string[];
  updatedAt:                  string;
}

interface Props {
  symbol:    string;
  stockName: string;
  compact?:  boolean;
}

function fmtDate(d: string): string {
  if (!d || d.length < 8) return "";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export default function STAnnouncementSummary({ symbol, stockName, compact = false }: Props) {
  const [data,    setData]    = useState<STSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stocks/${symbol}/announcements/st-summary`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.ok && json.data) setData(json.data);
      else throw new Error(json.error ?? "获取失败");
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div
        className="p-3 rounded-xl flex items-center gap-2"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
      >
        <RefreshCw size={12} color="#475569" className="animate-spin" />
        <span className="text-[11px]" style={{ color: "#475569" }}>加载公告摘要…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="p-3 rounded-xl flex items-center gap-2"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
      >
        <AlertTriangle size={12} color="#ef4444" />
        <span className="text-[11px]" style={{ color: "#64748b" }}>
          公告摘要暂不可用
        </span>
      </div>
    );
  }

  const hasAnyData = data.availableSources.length > 0;

  if (!hasAnyData) {
    return (
      <div
        className="p-3 rounded-xl flex items-center gap-2"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
      >
        <Bell size={12} color="#475569" />
        <span className="text-[11px]" style={{ color: "#475569" }}>
          公告数据暂未接入
        </span>
      </div>
    );
  }

  const signals: { icon: React.ReactNode; label: string; color: string }[] = [];

  if (data.recentDividend) {
    signals.push({
      icon:  <CheckCircle size={11} color="#22c55e" />,
      label: "近期有分红",
      color: "#22c55e",
    });
  }
  if (data.hasRemoveSTSignal) {
    signals.push({
      icon:  <TrendingUp size={11} color="#3b82f6" />,
      label: `摘帽预期 ${data.removeSTExpectation}`,
      color: "#3b82f6",
    });
  }
  if (data.delistingRisk > 30) {
    signals.push({
      icon:  <AlertTriangle size={11} color="#ef4444" />,
      label: `退市风险 ${data.delistingRisk}`,
      color: "#ef4444",
    });
  }
  if (data.recentShareholderReduction) {
    signals.push({
      icon:  <AlertTriangle size={11} color="#f97316" />,
      label: "大股东减持",
      color: "#f97316",
    });
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {signals.length === 0 ? (
          <span className="text-[10px]" style={{ color: "#475569" }}>无明显公告信号</span>
        ) : (
          signals.map((s, i) => (
            <span
              key={i}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
              style={{ background: "rgba(255,255,255,0.04)", color: s.color }}
            >
              {s.icon}
              {s.label}
            </span>
          ))
        )}
        {data.latestAnnDate && (
          <span className="text-[10px]" style={{ color: "#334155" }}>
            最新：{fmtDate(data.latestAnnDate)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="p-3 rounded-xl"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Bell size={12} color="#94a3b8" />
        <span className="text-[11px] font-medium" style={{ color: "#94a3b8" }}>
          公告信号 — {stockName}
        </span>
        {data.latestAnnDate && (
          <span className="text-[10px]" style={{ color: "#334155" }}>
            最新 {fmtDate(data.latestAnnDate)}
          </span>
        )}
      </div>

      {signals.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px]"
              style={{ background: "rgba(255,255,255,0.04)", color: s.color }}
            >
              {s.icon}
              {s.label}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px]" style={{ color: "#475569" }}>近期无明显公告信号</p>
      )}

      <p className="mt-1.5 text-[10px]" style={{ color: "#1e3a5f" }}>
        已接入：{data.availableSources.join("、")} ｜ 重组/调查/退市公告暂未接入
      </p>
    </div>
  );
}
