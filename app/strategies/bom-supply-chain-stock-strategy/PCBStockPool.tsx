"use client";

/**
 * PCBStockPool.tsx — PCB / 印制电路板 产业链股票池
 *
 * 展示内置 PCB 产业链股票，按投资逻辑分组，展示财务指标和 BOM 评分。
 * 支持加入自选股、加入模拟盘观察。
 *
 * ⚠️ 产业链映射为规则匹配结果，需人工复核，不代表真实供应商关系。
 */

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Star, Eye, RefreshCw, TrendingUp,
  ChevronDown, ChevronRight, Cpu, Layers, Zap,
} from "lucide-react";
import { PCB_INVESTMENT_GROUPS, type PcbInvestmentGroup } from "@/lib/pcbStockPoolService";
import { addToWatchlist, isInWatchlist, removeFromWatchlist } from "@/lib/watchlistService";

// ── localStorage 模拟盘观察列表 ───────────────────────────────────
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
function isInSimObs(symbol: string): boolean {
  return getSimObs().some(s => s.symbol === symbol);
}
function removeSimObs(symbol: string): void {
  const list = getSimObs().filter(s => s.symbol !== symbol);
  localStorage.setItem(SIM_OBS_KEY, JSON.stringify(list));
}

// ── 评分颜色 ──────────────────────────────────────────────────────
function ratingColor(rating: string) {
  const m: Record<string, string> = { 优秀: "#22c55e", 良好: "#3b82f6", 一般: "#f59e0b", 较差: "#64748b" };
  return m[rating] ?? "#64748b";
}
function segmentColor(seg: string) {
  const m: Record<string, string> = {
    "PCB制造":    "#3b82f6",
    "覆铜板材料":  "#f59e0b",
    "PCB设备耗材": "#00E5A8",
    "柔性PCB/FPC": "#a855f7",
    "AI服务器PCB": "#ef4444",
    "汽车电子PCB": "#22c55e",
  };
  return m[seg] ?? "#64748b";
}
function barrierColor(b: string) {
  const m: Record<string, string> = { 高: "#ef4444", 中高: "#f97316", 中: "#f59e0b", 中低: "#64748b", 低: "#94a3b8" };
  return m[b] ?? "#94a3b8";
}
function localColor(b: string) {
  const m: Record<string, string> = { 大: "#22c55e", 中高: "#3b82f6", 中: "#f59e0b", 中低: "#64748b", 小: "#94a3b8" };
  return m[b] ?? "#94a3b8";
}
function fmtMv(mv: number | null | undefined) {
  if (mv == null) return "-";
  if (mv >= 100000) return `${(mv / 100000).toFixed(0)}亿`;
  if (mv >= 10000)  return `${(mv / 10000).toFixed(1)}亿`;
  return `${mv.toFixed(0)}万`;
}
function fmtNum(v: number | null | undefined, dec = 1): string {
  if (v == null) return "-";
  return v.toFixed(dec);
}

// ── 单只股票卡片 ──────────────────────────────────────────────────
interface StockData {
  tsCode: string; symbol: string; name: string;
  segment: string; investmentGroups: string[];
  techBarrier: string; localizationSpace: string;
  downstreamApplications: string[]; note: string; isCore: boolean;
  pe: number | null; pb: number | null; totalMv: number | null;
  turnoverRate: number | null; close: number | null;
  score: {
    totalScore: number; rating: string;
    valueRatioScore: number; techBarrierScore: number;
    downstreamDemandScore: number; localizationScore: number;
    financialQualityScore: number; valuationScore: number;
  };
}

function StockCard({ stock, onWatchChange, onSimChange }: {
  stock: StockData;
  onWatchChange: (symbol: string, inWatch: boolean) => void;
  onSimChange: (symbol: string, inSim: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [inWatch, setInWatch] = useState(false);
  const [inSim,   setInSim]   = useState(false);
  const [watchFlash, setWatchFlash] = useState<"added" | "removed" | null>(null);
  const [simFlash,   setSimFlash]   = useState<"added" | "removed" | null>(null);

  useEffect(() => {
    setInWatch(isInWatchlist(stock.symbol, "A"));
    setInSim(isInSimObs(stock.symbol));
  }, [stock.symbol]);

  function handleWatch(e: React.MouseEvent) {
    e.stopPropagation();
    if (inWatch) {
      removeFromWatchlist(stock.symbol, "A");
      setInWatch(false);
      setWatchFlash("removed");
      onWatchChange(stock.symbol, false);
    } else {
      const tsCode = stock.tsCode;
      const exchange = tsCode.endsWith(".SH") ? "SH" : "SZ";
      addToWatchlist({
        symbol:   stock.symbol,
        tsCode:   stock.tsCode,
        name:     stock.name,
        market:   "A",
        exchange,
        industry: "PCB / 印制电路板",
        currency: "CNY",
      });
      setInWatch(true);
      setWatchFlash("added");
      onWatchChange(stock.symbol, true);
    }
    setTimeout(() => setWatchFlash(null), 1800);
  }

  function handleSim(e: React.MouseEvent) {
    e.stopPropagation();
    if (inSim) {
      removeSimObs(stock.symbol);
      setInSim(false);
      setSimFlash("removed");
      onSimChange(stock.symbol, false);
    } else {
      addSimObs({ symbol: stock.symbol, name: stock.name, segment: stock.segment });
      setInSim(true);
      setSimFlash("added");
      onSimChange(stock.symbol, true);
    }
    setTimeout(() => setSimFlash(null), 1800);
  }

  const sc = stock.score;
  const scoreColor = ratingColor(sc.rating);

  return (
    <div
      className="mb-2 rounded-2xl overflow-hidden cursor-pointer"
      style={{ background: "#0d1f3c", border: `1px solid ${stock.isCore ? "#1e3a5f" : "#1a2f50"}` }}
      onClick={() => setExpanded(v => !v)}
    >
      {/* 顶部行 */}
      <div className="p-3">
        <div className="flex items-start gap-2 mb-2">
          {/* 名称+代码 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {stock.isCore && (
                <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                  style={{ background: "rgba(0,229,168,0.15)", color: "#00E5A8" }}>核心</span>
              )}
              <span className="text-[13px] font-bold truncate" style={{ color: "#e2e8f0" }}>{stock.name}</span>
              <span className="text-[10px]" style={{ color: "#334155" }}>{stock.symbol}</span>
            </div>
            {/* 细分+下游 */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: segmentColor(stock.segment) + "20", color: segmentColor(stock.segment) }}>
                {stock.segment}
              </span>
              {stock.downstreamApplications.slice(0, 2).map(d => (
                <span key={d} className="text-[9px] px-1 py-0.5 rounded"
                  style={{ background: "rgba(100,116,139,0.15)", color: "#94a3b8" }}>{d}</span>
              ))}
            </div>
          </div>

          {/* 评分 */}
          <div className="flex-shrink-0 text-center">
            <div className="text-[18px] font-bold leading-none" style={{ color: scoreColor }}>{sc.totalScore}</div>
            <div className="text-[9px] mt-0.5" style={{ color: scoreColor }}>{sc.rating}</div>
          </div>

          {/* 展开图标 */}
          {expanded
            ? <ChevronDown size={14} color="#475569" className="flex-shrink-0 mt-1" />
            : <ChevronRight size={14} color="#475569" className="flex-shrink-0 mt-1" />
          }
        </div>

        {/* 估值行 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[10px]" style={{ color: "#475569" }}>PE</span>
            <span className="text-[11px] font-bold" style={{ color: "#e2e8f0" }}>{fmtNum(stock.pe)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px]" style={{ color: "#475569" }}>PB</span>
            <span className="text-[11px] font-bold" style={{ color: "#e2e8f0" }}>{fmtNum(stock.pb)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px]" style={{ color: "#475569" }}>市值</span>
            <span className="text-[11px] font-bold" style={{ color: "#e2e8f0" }}>{fmtMv(stock.totalMv)}</span>
          </div>
          <div className="flex-1" />
          {/* 技术壁垒 + 国产替代 */}
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
        <div className="px-3 pb-3 pt-0" style={{ borderTop: "1px solid #1a2f50" }}>
          <div className="pt-2 space-y-2">
            {/* 说明 */}
            <p className="text-[11px] leading-relaxed" style={{ color: "#94a3b8" }}>💡 {stock.note}</p>

            {/* 评分雷达 */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "价值量",   score: sc.valueRatioScore,       w: "20%" },
                { label: "技术壁垒", score: sc.techBarrierScore,       w: "20%" },
                { label: "下游景气", score: sc.downstreamDemandScore,  w: "20%" },
                { label: "国产替代", score: sc.localizationScore,       w: "15%" },
                { label: "财务质量", score: sc.financialQualityScore,   w: "15%" },
                { label: "估值合理", score: sc.valuationScore,          w: "10%" },
              ].map(item => (
                <div key={item.label} className="p-1.5 rounded-lg text-center"
                  style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="text-[9px] mb-0.5" style={{ color: "#475569" }}>{item.label}</div>
                  <div className="text-[12px] font-bold" style={{ color: item.score >= 80 ? "#22c55e" : item.score >= 60 ? "#3b82f6" : "#f59e0b" }}>
                    {item.score}
                  </div>
                  <div className="text-[8px]" style={{ color: "#334155" }}>权{item.w}</div>
                </div>
              ))}
            </div>

            {/* 所有下游 */}
            {stock.downstreamApplications.length > 0 && (
              <div>
                <p className="text-[10px] mb-1" style={{ color: "#475569" }}>下游应用：</p>
                <div className="flex flex-wrap gap-1">
                  {stock.downstreamApplications.map(d => (
                    <span key={d} className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(59,130,246,0.1)", color: "#94a3b8" }}>{d}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 投资逻辑分组标签 */}
            {stock.investmentGroups.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {stock.investmentGroups.map(g => (
                  <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(0,229,168,0.1)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.15)" }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleWatch}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-semibold"
                style={{
                  background: inWatch ? "rgba(250,204,21,0.15)" : "rgba(255,255,255,0.05)",
                  color:      inWatch ? "#facc15" : "#94a3b8",
                  border:     `1px solid ${inWatch ? "rgba(250,204,21,0.3)" : "#1a2f50"}`,
                }}
              >
                <Star size={11} />
                {watchFlash === "added" ? "已加入✓" : watchFlash === "removed" ? "已移除" : inWatch ? "已自选" : "加入自选"}
              </button>
              <button
                onClick={handleSim}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-semibold"
                style={{
                  background: inSim ? "rgba(0,229,168,0.1)" : "rgba(255,255,255,0.05)",
                  color:      inSim ? "#00E5A8" : "#94a3b8",
                  border:     `1px solid ${inSim ? "rgba(0,229,168,0.25)" : "#1a2f50"}`,
                }}
              >
                <Eye size={11} />
                {simFlash === "added" ? "已加入✓" : simFlash === "removed" ? "已移除" : inSim ? "观察中" : "加入观察"}
              </button>
            </div>

            {/* 免责声明 */}
            <p className="text-[9px] leading-relaxed" style={{ color: "#334155" }}>
              ⚠️ 产业链分类为规则匹配，需人工复核，不代表真实供应关系，不构成投资建议
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 分组描述卡 ────────────────────────────────────────────────────
function GroupInfoCard({ group }: { group: typeof PCB_INVESTMENT_GROUPS[0] }) {
  return (
    <div className="p-3 rounded-2xl mb-3"
      style={{ background: group.color + "10", border: `1px solid ${group.color}30` }}>
      <p className="text-[11px] leading-relaxed" style={{ color: "#94a3b8" }}>{group.desc}</p>
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
    key: PcbInvestmentGroup;
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

type TabKey = "core" | PcbInvestmentGroup;

export default function PCBStockPool() {
  const [data, setData]         = useState<ApiResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("core");
  const [, forceRender]         = useState(0); // 用于触发自选/观察状态刷新

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/strategies/bom-supply-chain-stock-strategy/pcb", { cache: "no-store" });
      const json: ApiResponse = await res.json();
      if (!json.ok) throw new Error("API 返回失败");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function onWatchChange() { forceRender(v => v + 1); }
  function onSimChange()   { forceRender(v => v + 1); }

  // ── 当前 tab 显示的股票 ──────────────────────────────────────────
  function currentStocks(): StockData[] {
    if (!data) return [];
    if (activeTab === "core") return data.corePool;
    const group = data.groups.find(g => g.key === activeTab);
    return group?.stocks ?? [];
  }

  const activeGroup = data?.groups.find(g => g.key === activeTab);

  // ── Loading / Error ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="animate-spin w-7 h-7 rounded-full border-2 border-[#00E5A8] border-t-transparent" />
        <p className="text-[12px]" style={{ color: "#64748b" }}>正在加载 PCB 产业链股票池...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <AlertTriangle size={28} color="#ef4444" />
        <p className="text-[12px]" style={{ color: "#94a3b8" }}>{error}</p>
        <button onClick={fetchData} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px]"
          style={{ background: "#0d1f3c", color: "#00E5A8", border: "1px solid #1a2f50" }}>
          <RefreshCw size={13} /> 重试
        </button>
      </div>
    );
  }
  if (!data) return null;

  const stocks = currentStocks();

  return (
    <div>
      {/* ── 顶部概览 ─────────────────────────────────────────────── */}
      <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-2 mb-2">
          <Cpu size={14} color="#00E5A8" />
          <span className="text-[13px] font-bold" style={{ color: "#e2e8f0" }}>PCB / 印制电路板 核心股票池</span>
          {data.hasFinancial && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full ml-auto"
              style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>实时数据</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="text-center">
            <div className="text-[18px] font-bold" style={{ color: "#00E5A8" }}>{data.totalStocks}</div>
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
        {/* 分段统计 */}
        <div className="flex flex-wrap gap-1">
          {Object.entries(data.stats.bySegment).map(([seg, cnt]) => (
            <span key={seg} className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: segmentColor(seg) + "15", color: segmentColor(seg) }}>
              {seg} {cnt}
            </span>
          ))}
        </div>
      </div>

      {/* ── 免责声明 ───────────────────────────────────────────────── */}
      <div className="p-2.5 rounded-xl mb-3 flex items-start gap-1.5"
        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <AlertTriangle size={11} color="#f59e0b" className="flex-shrink-0 mt-0.5" />
        <p className="text-[10px] leading-relaxed" style={{ color: "#94a3b8" }}>
          {data.disclaimer}
          {!data.hasFinancial && <strong style={{ color: "#f59e0b" }}> · 财务数据加载失败，评分仅含静态因子</strong>}
        </p>
      </div>

      {/* ── 分组 Tab ───────────────────────────────────────────────── */}
      <div className="mb-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            key="core"
            onClick={() => setActiveTab("core")}
            className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold"
            style={{
              background: activeTab === "core" ? "#00E5A8" : "#0d1f3c",
              color:      activeTab === "core" ? "#07111F" : "#64748b",
              border:     `1px solid ${activeTab === "core" ? "#00E5A8" : "#1a2f50"}`,
            }}>
            ⭐ 核心股票池
          </button>
          {data.groups.map(g => (
            <button
              key={g.key}
              onClick={() => setActiveTab(g.key as TabKey)}
              className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold"
              style={{
                background: activeTab === g.key ? g.color : "#0d1f3c",
                color:      activeTab === g.key ? "#07111F" : "#64748b",
                border:     `1px solid ${activeTab === g.key ? g.color : "#1a2f50"}`,
              }}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 分组说明 ────────────────────────────────────────────────── */}
      {activeTab === "core" && (
        <div className="p-3 rounded-2xl mb-3"
          style={{ background: "rgba(0,229,168,0.06)", border: "1px solid rgba(0,229,168,0.15)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Layers size={12} color="#00E5A8" />
            <span className="text-[11px] font-bold" style={{ color: "#00E5A8" }}>核心股票池</span>
          </div>
          <p className="text-[10px] leading-relaxed" style={{ color: "#64748b" }}>
            精选 PCB 产业链各细分环节代表性公司，覆盖 PCB 制造龙头、覆铜板材料、专用设备耗材、FPC 等方向。
            点击股票卡片展开详情，可加入自选股或模拟盘观察。
          </p>
        </div>
      )}
      {activeGroup && (
        <GroupInfoCard group={activeGroup} />
      )}

      {/* ── 股票列表 ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[11px]" style={{ color: "#64748b" }}>
          共 {stocks.length} 只{activeTab !== "core" ? "（按评分排序）" : ""}
        </span>
        <button onClick={fetchData} className="flex items-center gap-1 text-[10px]"
          style={{ color: "#475569" }}>
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
          .map(stock => (
            <StockCard
              key={stock.tsCode}
              stock={stock}
              onWatchChange={onWatchChange}
              onSimChange={onSimChange}
            />
          ))
      )}

      {/* ── 风险提示 ────────────────────────────────────────────────── */}
      <div className="mt-4 p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <AlertTriangle size={12} color="#ef4444" />
          <span className="text-[11px] font-bold" style={{ color: "#ef4444" }}>PCB 投资风险提示</span>
        </div>
        <div className="space-y-1">
          {data.risks.map((r, i) => (
            <p key={i} className="text-[10px] leading-relaxed" style={{ color: "#64748b" }}>· {r}</p>
          ))}
        </div>
      </div>

      {/* ── 标签云 ──────────────────────────────────────────────────── */}
      <div className="mt-3 p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Zap size={12} color="#f59e0b" />
          <span className="text-[11px] font-bold" style={{ color: "#94a3b8" }}>PCB 产业链关键词</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["PCB", "印制电路板", "覆铜板", "HDI", "高速通信", "AI服务器", "汽车电子", "FPC", "半导体封装基板",
            "国产替代", "高频高速", "车规认证", "IATF16949", "激光直接成像LDI"].map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "rgba(59,130,246,0.1)", color: "#94a3b8", border: "1px solid rgba(59,130,246,0.15)" }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[9px] mt-4 text-center" style={{ color: "#334155" }}>
        ⚠️ 本页面信息仅供研究参考，不构成投资建议。数据存在延迟，请以交易所公告和官方数据为准。
      </p>
    </div>
  );
}
