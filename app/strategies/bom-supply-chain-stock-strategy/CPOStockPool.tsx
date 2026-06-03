"use client";

/**
 * CPOStockPool.tsx — CPO / 共封装光学 / 高速光通信 产业链股票池
 *
 * 展示内置 CPO 产业链股票，按投资逻辑分组，展示财务指标和 CPO 评分。
 * 支持加入自选股、加入模拟盘观察。
 *
 * ⚠️ 产业链映射为规则匹配结果，需人工复核，不代表真实供应商关系。
 */

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Star, Eye, RefreshCw,
  ChevronDown, ChevronRight, Zap, Radio, TrendingUp,
} from "lucide-react";
import { CPO_INVESTMENT_GROUPS, type CpoInvestmentGroup } from "@/lib/cpoStockPoolService";
import { addToWatchlist, isInWatchlist, removeFromWatchlist } from "@/lib/watchlistService";

// ── 模拟盘观察 localStorage ───────────────────────────────────────
const SIM_OBS_KEY = "quantplanet_sim_obs_v1";
interface SimObsItem { symbol: string; name: string; segment: string; addedAt: string }
function getSimObs(): SimObsItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SIM_OBS_KEY) || "[]"); } catch { return []; }
}
function addSimObs(item: Omit<SimObsItem, "addedAt">): boolean {
  const list = getSimObs();
  if (list.some(s => s.symbol === item.symbol)) return false;
  list.push({ ...item, addedAt: new Date().toISOString() });
  localStorage.setItem(SIM_OBS_KEY, JSON.stringify(list));
  return true;
}
function isInSimObs(symbol: string): boolean { return getSimObs().some(s => s.symbol === symbol); }
function removeSimObs(symbol: string): void {
  localStorage.setItem(SIM_OBS_KEY, JSON.stringify(getSimObs().filter(s => s.symbol !== symbol)));
}

// ── 颜色工具 ──────────────────────────────────────────────────────
function ratingColor(r: string) {
  return { 优秀: "#22c55e", 良好: "#3b82f6", 一般: "#f59e0b", 较差: "#64748b" }[r] ?? "#64748b";
}
function segColor(seg: string) {
  const m: Record<string, string> = {
    "高速光模块":          "#a855f7",
    "光器件/光引擎":       "#3b82f6",
    "光芯片/激光器":       "#ef4444",
    "光纤连接/通信网络":   "#f59e0b",
    "CPO设备/封装/测试":   "#00E5A8",
    "AI服务器PCB/高速互联": "#22c55e",
    "数据中心散热/电源":   "#64748b",
  };
  return m[seg] ?? "#94a3b8";
}
function barrierColor(b: string) {
  return { 高: "#ef4444", 中高: "#f97316", 中: "#f59e0b", 中低: "#64748b", 低: "#94a3b8" }[b] ?? "#94a3b8";
}
function localColor(b: string) {
  return { 大: "#22c55e", 中高: "#3b82f6", 中: "#f59e0b", 中低: "#64748b", 小: "#94a3b8" }[b] ?? "#94a3b8";
}
function aiLevelColor(l: string) {
  return { 极强: "#a855f7", 强: "#ef4444", 中高: "#f97316", 中: "#f59e0b", 间接: "#64748b" }[l] ?? "#94a3b8";
}
function fmtMv(mv: number | null | undefined) {
  if (mv == null) return "-";
  if (mv >= 100000) return `${(mv / 100000).toFixed(0)}亿`;
  if (mv >= 10000)  return `${(mv / 10000).toFixed(1)}亿`;
  return `${mv.toFixed(0)}万`;
}
function fmtNum(v: number | null | undefined, dec = 1): string {
  return v == null ? "-" : v.toFixed(dec);
}

// ── 股票卡片 ──────────────────────────────────────────────────────
interface StockData {
  tsCode: string; symbol: string; name: string;
  segment: string; investmentGroups: string[];
  techBarrier: string; localizationSpace: string; aiDemandLevel: string;
  downstreamApplications: string[]; note: string; isCore: boolean;
  pe: number | null; pb: number | null; totalMv: number | null;
  turnoverRate: number | null; close: number | null;
  score: {
    totalScore: number; rating: string;
    valueRatioScore: number; techBarrierScore: number;
    aiDemandScore: number; localizationScore: number;
    financialQualityScore: number; valuationScore: number;
  };
}

function StockCard({ stock, onWatchChange, onSimChange }: {
  stock: StockData;
  onWatchChange: () => void;
  onSimChange: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [inWatch, setInWatch] = useState(false);
  const [inSim,   setInSim]   = useState(false);
  const [wFlash,  setWFlash]  = useState<string | null>(null);
  const [sFlash,  setSFlash]  = useState<string | null>(null);

  useEffect(() => {
    setInWatch(isInWatchlist(stock.symbol, "A"));
    setInSim(isInSimObs(stock.symbol));
  }, [stock.symbol]);

  function handleWatch(e: React.MouseEvent) {
    e.stopPropagation();
    if (inWatch) {
      removeFromWatchlist(stock.symbol, "A");
      setInWatch(false); setWFlash("removed");
    } else {
      addToWatchlist({
        symbol: stock.symbol, tsCode: stock.tsCode, name: stock.name,
        market: "A", exchange: stock.tsCode.endsWith(".SH") ? "SH" : "SZ",
        industry: "CPO / 共封装光学", currency: "CNY",
      });
      setInWatch(true); setWFlash("added");
    }
    onWatchChange();
    setTimeout(() => setWFlash(null), 1800);
  }

  function handleSim(e: React.MouseEvent) {
    e.stopPropagation();
    if (inSim) {
      removeSimObs(stock.symbol);
      setInSim(false); setSFlash("removed");
    } else {
      addSimObs({ symbol: stock.symbol, name: stock.name, segment: stock.segment });
      setInSim(true); setSFlash("added");
    }
    onSimChange();
    setTimeout(() => setSFlash(null), 1800);
  }

  const sc = stock.score;
  const sColor = ratingColor(sc.rating);

  return (
    <div
      className="mb-2 rounded-2xl overflow-hidden cursor-pointer"
      style={{ background: "#0d1f3c", border: `1px solid ${stock.isCore ? "#1e3a5f" : "#1a2f50"}` }}
      onClick={() => setExpanded(v => !v)}
    >
      <div className="p-3">
        {/* 头部行 */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              {stock.isCore && (
                <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                  style={{ background: "rgba(0,229,168,0.15)", color: "#00E5A8" }}>核心</span>
              )}
              <span className="text-[13px] font-bold" style={{ color: "#e2e8f0" }}>{stock.name}</span>
              <span className="text-[10px]" style={{ color: "#334155" }}>{stock.symbol}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: segColor(stock.segment) + "20", color: segColor(stock.segment) }}>
                {stock.segment}
              </span>
              <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                style={{ background: aiLevelColor(stock.aiDemandLevel) + "15", color: aiLevelColor(stock.aiDemandLevel) }}>
                AI受益{stock.aiDemandLevel}
              </span>
            </div>
          </div>
          <div className="flex-shrink-0 text-center">
            <div className="text-[18px] font-bold leading-none" style={{ color: sColor }}>{sc.totalScore}</div>
            <div className="text-[9px] mt-0.5" style={{ color: sColor }}>{sc.rating}</div>
          </div>
          {expanded
            ? <ChevronDown size={14} color="#475569" className="flex-shrink-0 mt-1" />
            : <ChevronRight size={14} color="#475569" className="flex-shrink-0 mt-1" />
          }
        </div>

        {/* 估值行 */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px]" style={{ color: "#475569" }}>PE <span className="font-bold" style={{ color: "#e2e8f0" }}>{fmtNum(stock.pe)}</span></span>
          <span className="text-[10px]" style={{ color: "#475569" }}>PB <span className="font-bold" style={{ color: "#e2e8f0" }}>{fmtNum(stock.pb)}</span></span>
          <span className="text-[10px]" style={{ color: "#475569" }}>市值 <span className="font-bold" style={{ color: "#e2e8f0" }}>{fmtMv(stock.totalMv)}</span></span>
          <div className="flex-1" />
          <span className="text-[9px] px-1 py-0.5 rounded"
            style={{ background: barrierColor(stock.techBarrier) + "15", color: barrierColor(stock.techBarrier) }}>
            壁垒{stock.techBarrier}
          </span>
          <span className="text-[9px] px-1 py-0.5 rounded"
            style={{ background: localColor(stock.localizationSpace) + "15", color: localColor(stock.localizationSpace) }}>
            替代{stock.localizationSpace}
          </span>
        </div>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="px-3 pb-3" style={{ borderTop: "1px solid #1a2f50" }}>
          <div className="pt-2 space-y-2">
            <p className="text-[11px] leading-relaxed" style={{ color: "#94a3b8" }}>💡 {stock.note}</p>

            {/* 6维评分 */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "价值量",   score: sc.valueRatioScore,      w: "20%" },
                { label: "技术壁垒", score: sc.techBarrierScore,      w: "20%" },
                { label: "AI受益",   score: sc.aiDemandScore,         w: "20%" },
                { label: "国产替代", score: sc.localizationScore,      w: "15%" },
                { label: "财务质量", score: sc.financialQualityScore,  w: "15%" },
                { label: "估值合理", score: sc.valuationScore,         w: "10%" },
              ].map(item => (
                <div key={item.label} className="p-1.5 rounded-lg text-center"
                  style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="text-[9px] mb-0.5" style={{ color: "#475569" }}>{item.label}</div>
                  <div className="text-[12px] font-bold"
                    style={{ color: item.score >= 80 ? "#22c55e" : item.score >= 60 ? "#3b82f6" : "#f59e0b" }}>
                    {item.score}
                  </div>
                  <div className="text-[8px]" style={{ color: "#334155" }}>权{item.w}</div>
                </div>
              ))}
            </div>

            {/* 下游应用 */}
            <div>
              <p className="text-[10px] mb-1" style={{ color: "#475569" }}>下游应用：</p>
              <div className="flex flex-wrap gap-1">
                {stock.downstreamApplications.map(d => (
                  <span key={d} className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(168,85,247,0.1)", color: "#94a3b8" }}>{d}</span>
                ))}
              </div>
            </div>

            {/* 投资逻辑分组标签 */}
            {stock.investmentGroups.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {stock.investmentGroups.map(g => (
                  <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button onClick={handleWatch}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-semibold"
                style={{
                  background: inWatch ? "rgba(250,204,21,0.15)" : "rgba(255,255,255,0.05)",
                  color:      inWatch ? "#facc15" : "#94a3b8",
                  border:     `1px solid ${inWatch ? "rgba(250,204,21,0.3)" : "#1a2f50"}`,
                }}>
                <Star size={11} />
                {wFlash === "added" ? "已加入✓" : wFlash === "removed" ? "已移除" : inWatch ? "已自选" : "加入自选"}
              </button>
              <button onClick={handleSim}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-semibold"
                style={{
                  background: inSim ? "rgba(0,229,168,0.1)" : "rgba(255,255,255,0.05)",
                  color:      inSim ? "#00E5A8" : "#94a3b8",
                  border:     `1px solid ${inSim ? "rgba(0,229,168,0.25)" : "#1a2f50"}`,
                }}>
                <Eye size={11} />
                {sFlash === "added" ? "已加入✓" : sFlash === "removed" ? "已移除" : inSim ? "观察中" : "加入观察"}
              </button>
            </div>

            <p className="text-[9px] leading-relaxed" style={{ color: "#334155" }}>
              ⚠️ 产业链分类为规则匹配，需人工复核，不代表真实供应关系，不构成投资建议
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────

interface ApiResponse {
  ok: boolean;
  totalStocks: number;
  coreCount: number;
  hasFinancial: boolean;
  corePool: StockData[];
  groups: Array<{
    key: CpoInvestmentGroup;
    label: string;
    desc: string;
    color: string;
    stocks: StockData[];
  }>;
  allStocks: StockData[];
  stats: { avgScore: number; bySegment: Record<string, number> };
  risks: string[];
  disclaimer: string;
}

type TabKey = "core" | CpoInvestmentGroup;

export default function CPOStockPool() {
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("core");
  const [, forceRender]       = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/strategies/bom-supply-chain-stock-strategy/cpo", { cache: "no-store" });
      const json: ApiResponse = await res.json();
      if (!json.ok) throw new Error("API返回失败");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "数据加载失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function currentStocks(): StockData[] {
    if (!data) return [];
    if (activeTab === "core") return data.corePool;
    const group = data.groups.find(g => g.key === activeTab);
    return group?.stocks ?? [];
  }

  const activeGroup = data?.groups.find(g => g.key === activeTab);
  const stocks = currentStocks();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="animate-spin w-7 h-7 rounded-full border-2 border-[#a855f7] border-t-transparent" />
        <p className="text-[12px]" style={{ color: "#64748b" }}>正在加载 CPO 产业链股票池...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <AlertTriangle size={28} color="#ef4444" />
        <p className="text-[12px]" style={{ color: "#94a3b8" }}>{error}</p>
        <button onClick={fetchData} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px]"
          style={{ background: "#0d1f3c", color: "#a855f7", border: "1px solid #1a2f50" }}>
          <RefreshCw size={13} /> 重试
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div>
      {/* ── 顶部概览 ─────────────────────────────────────────────── */}
      <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-2 mb-2">
          <Radio size={14} color="#a855f7" />
          <span className="text-[13px] font-bold" style={{ color: "#e2e8f0" }}>CPO / 共封装光学 核心股票池</span>
          {data.hasFinancial && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full ml-auto"
              style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}>实时数据</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="text-center">
            <div className="text-[18px] font-bold" style={{ color: "#a855f7" }}>{data.totalStocks}</div>
            <div className="text-[10px]" style={{ color: "#475569" }}>覆盖股票</div>
          </div>
          <div className="text-center">
            <div className="text-[18px] font-bold" style={{ color: "#3b82f6" }}>{data.coreCount}</div>
            <div className="text-[10px]" style={{ color: "#475569" }}>核心标的</div>
          </div>
          <div className="text-center">
            <div className="text-[18px] font-bold"
              style={{ color: ratingColor(data.stats.avgScore >= 80 ? "优秀" : data.stats.avgScore >= 60 ? "良好" : "一般") }}>
              {data.stats.avgScore}
            </div>
            <div className="text-[10px]" style={{ color: "#475569" }}>核心池均分</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(data.stats.bySegment).map(([seg, cnt]) => (
            <span key={seg} className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: segColor(seg) + "15", color: segColor(seg) }}>
              {seg.length > 8 ? seg.slice(0, 7) + "…" : seg} {cnt}
            </span>
          ))}
        </div>
      </div>

      {/* ── 免责声明 ────────────────────────────────────────────────── */}
      <div className="p-2.5 rounded-xl mb-3 flex items-start gap-1.5"
        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <AlertTriangle size={11} color="#f59e0b" className="flex-shrink-0 mt-0.5" />
        <p className="text-[10px] leading-relaxed" style={{ color: "#94a3b8" }}>
          {data.disclaimer}
          {!data.hasFinancial && <strong style={{ color: "#f59e0b" }}> · 财务数据加载失败，评分仅含静态因子</strong>}
        </p>
      </div>

      {/* ── 分组 Tab ─────────────────────────────────────────────────── */}
      <div className="mb-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setActiveTab("core")}
            className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold"
            style={{
              background: activeTab === "core" ? "#a855f7" : "#0d1f3c",
              color:      activeTab === "core" ? "#fff" : "#64748b",
              border:     `1px solid ${activeTab === "core" ? "#a855f7" : "#1a2f50"}`,
            }}>
            ⭐ 核心池
          </button>
          {data.groups.map(g => (
            <button key={g.key} onClick={() => setActiveTab(g.key as TabKey)}
              className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold"
              style={{
                background: activeTab === g.key ? g.color : "#0d1f3c",
                color:      activeTab === g.key ? "#fff" : "#64748b",
                border:     `1px solid ${activeTab === g.key ? g.color : "#1a2f50"}`,
              }}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 分组说明 ─────────────────────────────────────────────────── */}
      {activeTab === "core" && (
        <div className="p-3 rounded-2xl mb-3"
          style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} color="#a855f7" />
            <span className="text-[11px] font-bold" style={{ color: "#a855f7" }}>CPO 核心股票池（20只）</span>
          </div>
          <p className="text-[10px] leading-relaxed" style={{ color: "#64748b" }}>
            精选 CPO/高速光通信产业链各环节代表性公司，覆盖高速光模块龙头、光器件/光引擎、
            光芯片/激光器、AI服务器PCB等方向。点击展开详情，可加入自选或观察。
          </p>
        </div>
      )}
      {activeGroup && (
        <div className="p-3 rounded-2xl mb-3"
          style={{ background: activeGroup.color + "10", border: `1px solid ${activeGroup.color}30` }}>
          <p className="text-[11px] leading-relaxed" style={{ color: "#94a3b8" }}>{activeGroup.desc}</p>
        </div>
      )}

      {/* ── 股票列表 ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[11px]" style={{ color: "#64748b" }}>共 {stocks.length} 只（按评分排序）</span>
        <button onClick={fetchData} className="flex items-center gap-1 text-[10px]" style={{ color: "#475569" }}>
          <RefreshCw size={11} /> 刷新
        </button>
      </div>

      {stocks.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[12px]" style={{ color: "#475569" }}>该分组暂无股票</p>
        </div>
      ) : (
        [...stocks]
          .sort((a, b) => b.score.totalScore - a.score.totalScore)
          .map(s => (
            <StockCard
              key={s.tsCode}
              stock={s}
              onWatchChange={() => forceRender(v => v + 1)}
              onSimChange={()   => forceRender(v => v + 1)}
            />
          ))
      )}

      {/* ── 风险提示 ─────────────────────────────────────────────────── */}
      <div className="mt-4 p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <AlertTriangle size={12} color="#ef4444" />
          <span className="text-[11px] font-bold" style={{ color: "#ef4444" }}>CPO / 高速光通信 投资风险</span>
        </div>
        <div className="space-y-1">
          {data.risks.map((r, i) => (
            <p key={i} className="text-[10px] leading-relaxed" style={{ color: "#64748b" }}>· {r}</p>
          ))}
        </div>
      </div>

      {/* ── 关键词标签 ───────────────────────────────────────────────── */}
      <div className="mt-3 p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Zap size={12} color="#a855f7" />
          <span className="text-[11px] font-bold" style={{ color: "#94a3b8" }}>CPO 产业链关键词</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["CPO", "共封装光学", "光模块", "800G", "1.6T", "硅光", "光芯片",
            "光引擎", "光无源器件", "AI算力", "数据中心", "高速互联",
            "EML激光器", "CW光源", "InP", "先进封装", "光纤互联"].map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "rgba(168,85,247,0.1)", color: "#94a3b8", border: "1px solid rgba(168,85,247,0.15)" }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[9px] mt-4 text-center" style={{ color: "#334155" }}>
        ⚠️ 仅供研究参考，不构成投资建议。数据存在延迟，请以交易所公告和官方数据为准。
      </p>
    </div>
  );
}
