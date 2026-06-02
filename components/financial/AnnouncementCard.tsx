"use client";

/**
 * components/financial/AnnouncementCard.tsx
 *
 * 重要公告 & 事件卡片
 * 数据来源：/api/stocks/:symbol/announcements
 *
 * 已接入：业绩预告/快报、分红送股、股东减持
 * 暂未接入：退市风险、摘帽公告、重整/重组、立案调查、
 *           资产重组、控股权变更、年报、季报
 */

import { useEffect, useState } from "react";
import { Bell, AlertTriangle, TrendingUp, TrendingDown, Info, RefreshCw } from "lucide-react";
import type { AnnouncementItem, AnnouncementType, RiskLevel, OpportunityLevel } from "@/lib/announcementService";

// ── 类型（本地 mirror，避免服务端模块泄漏到客户端包） ─────────────────────

interface AnnItem {
  id:               string;
  title:            string;
  annDate:          string;
  type:             AnnouncementType;
  riskLevel:        RiskLevel;
  opportunityLevel: OpportunityLevel;
  summary?:         string;
}

interface AnnResponse {
  ok:        boolean;
  tsCode:    string;
  items:     AnnItem[];
  total:     number;
  available: boolean;
  errorCode: string;
  message:   string;
  updatedAt: string;
}

interface Props {
  symbol:    string;
  stockName: string;
}

// ── 标签页配置 ────────────────────────────────────────────────────────────

type TabKey = "all" | "performance" | "dividend" | "reduction" | "risk";

interface Tab {
  key:   TabKey;
  label: string;
  types: AnnouncementType[];
}

const TABS: Tab[] = [
  { key: "all",         label: "全部",   types: [] },
  { key: "performance", label: "业绩预告", types: ["performance_forecast"] },
  { key: "dividend",    label: "分红",   types: ["dividend"] },
  { key: "reduction",   label: "减持",   types: ["shareholder_reduction"] },
  { key: "risk",        label: "风险",   types: ["delisting_risk", "investigation", "reorganization"] },
];

// ── 颜色工具 ──────────────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  critical: { bg: "rgba(239,68,68,0.15)",   text: "#ef4444", label: "极高风险" },
  high:     { bg: "rgba(249,115,22,0.15)",  text: "#f97316", label: "高风险"   },
  medium:   { bg: "rgba(234,179,8,0.15)",   text: "#eab308", label: "中风险"   },
  low:      { bg: "rgba(148,163,184,0.1)",  text: "#94a3b8", label: "低风险"   },
  none:     { bg: "transparent",            text: "transparent", label: "" },
};

const OPP_COLORS: Record<OpportunityLevel, { bg: string; text: string; label: string }> = {
  high:   { bg: "rgba(34,197,94,0.15)",  text: "#22c55e", label: "高机会" },
  medium: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6", label: "中机会" },
  low:    { bg: "rgba(148,163,184,0.1)", text: "#94a3b8", label: "低机会" },
  none:   { bg: "transparent",           text: "transparent", label: "" },
};

const TYPE_LABELS: Record<AnnouncementType, string> = {
  performance_forecast:  "业绩预告",
  annual_report:         "年报",
  quarterly_report:      "季报",
  delisting_risk:        "退市风险",
  remove_st:             "摘帽",
  reorganization:        "重整",
  investigation:         "立案调查",
  shareholder_reduction: "股东减持",
  shareholder_increase:  "股东增持",
  asset_restructuring:   "资产重组",
  control_change:        "控股权变更",
  dividend:              "分红送股",
  general:               "公告",
};

// ── 日期格式化 ────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  if (!d || d.length < 8) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// ── 单条公告 ──────────────────────────────────────────────────────────────

function AnnRow({ item }: { item: AnnItem }) {
  const risk = RISK_COLORS[item.riskLevel];
  const opp  = OPP_COLORS[item.opportunityLevel];
  const showRisk = item.riskLevel !== "none";
  const showOpp  = item.opportunityLevel !== "none";

  return (
    <div
      className="p-2.5 rounded-lg mb-1.5"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1 mb-1">
            {/* 类型标签 */}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}
            >
              {TYPE_LABELS[item.type] ?? item.type}
            </span>
            {/* 风险标签 */}
            {showRisk && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: risk.bg, color: risk.text }}
              >
                {risk.label}
              </span>
            )}
            {/* 机会标签 */}
            {showOpp && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: opp.bg, color: opp.text }}
              >
                {opp.label}
              </span>
            )}
          </div>
          <p className="text-[12px] leading-snug" style={{ color: "#e2e8f0" }}>
            {item.title}
          </p>
          {item.summary && (
            <p className="text-[10px] mt-0.5" style={{ color: "#64748b" }}>
              {item.summary}
            </p>
          )}
        </div>
        <span className="text-[10px] whitespace-nowrap mt-0.5" style={{ color: "#475569" }}>
          {fmtDate(item.annDate)}
        </span>
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────

export default function AnnouncementCard({ symbol, stockName }: Props) {
  const [data,    setData]    = useState<AnnResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tab,     setTab]     = useState<TabKey>("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stocks/${symbol}/announcements`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AnnResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // 过滤当前标签项
  const currentTab = TABS.find(t => t.key === tab) ?? TABS[0];
  const items: AnnItem[] = data?.items ?? [];
  const filtered = currentTab.key === "all"
    ? items
    : items.filter(i => currentTab.types.includes(i.type));

  // 各 tab 计数
  const countFor = (t: Tab) =>
    t.key === "all"
      ? items.length
      : items.filter(i => t.types.includes(i.type)).length;

  return (
    <div
      className="p-4 rounded-2xl"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell size={14} color="#94A3B8" />
          <h3 className="font-bold text-[13px]" style={{ color: "#94A3B8" }}>
            重要公告 &amp; 事件
          </h3>
          {stockName && (
            <span className="text-[11px]" style={{ color: "#475569" }}>
              {stockName}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
          style={{ color: "#64748b", background: "transparent" }}
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <RefreshCw size={16} color="#475569" className="animate-spin" />
          <span className="ml-2 text-[12px]" style={{ color: "#475569" }}>
            加载公告数据…
          </span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div
          className="flex items-center gap-2 p-3 rounded-xl"
          style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}
        >
          <AlertTriangle size={13} color="#ef4444" />
          <p className="text-[12px]" style={{ color: "#ef4444" }}>
            加载失败：{error}
          </p>
        </div>
      )}

      {/* 数据 */}
      {!loading && !error && data && (
        <>
          {/* 接入状态提示 */}
          {!data.available && (
            <div
              className="flex items-start gap-2 p-2.5 rounded-xl mb-3"
              style={{
                background: "rgba(148,163,184,0.05)",
                border: "1px solid rgba(148,163,184,0.1)",
              }}
            >
              <Info size={13} color="#475569" className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[11px]" style={{ color: "#64748b" }}>
                  {data.message}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "#334155" }}>
                  退市风险 · 摘帽 · 重组 · 立案调查等暂未接入
                </p>
              </div>
            </div>
          )}

          {/* 已有数据的标签页 */}
          {items.length > 0 && (
            <>
              {/* 标签栏 */}
              <div className="flex gap-1 mb-3 overflow-x-auto no-scrollbar">
                {TABS.map(t => {
                  const cnt = countFor(t);
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] transition-all"
                      style={{
                        background: active ? "#1e40af" : "rgba(30,64,175,0.1)",
                        color:      active ? "#93c5fd" : "#475569",
                        border:     active ? "1px solid #3b82f6" : "1px solid transparent",
                      }}
                    >
                      {t.label}
                      {cnt > 0 && (
                        <span
                          className="ml-1 px-1 rounded-full text-[9px]"
                          style={{
                            background: active ? "rgba(147,197,253,0.2)" : "rgba(148,163,184,0.1)",
                          }}
                        >
                          {cnt}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 公告列表 */}
              <div className="max-h-72 overflow-y-auto no-scrollbar">
                {filtered.length > 0 ? (
                  filtered.map(item => <AnnRow key={item.id} item={item} />)
                ) : (
                  <div className="py-4 text-center">
                    <p className="text-[12px]" style={{ color: "#475569" }}>
                      该分类暂无公告
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 完全没数据时的空状态 */}
          {items.length === 0 && data.available && (
            <div className="py-4 text-center">
              <p className="text-[12px]" style={{ color: "#475569" }}>
                近期无相关公告
              </p>
            </div>
          )}

          {/* 底部说明 */}
          {data.available && (
            <div className="mt-2 flex items-center gap-1.5">
              <TrendingUp  size={10} color="#22c55e" />
              <TrendingDown size={10} color="#ef4444" />
              <span className="text-[10px]" style={{ color: "#334155" }}>
                已接入：业绩预告 · 分红送股 · 股东减持 ｜ 其余类型暂未接入
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
