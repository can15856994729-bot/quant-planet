"use client";

/**
 * CPOChokepointPool.tsx — CPO 咽喉池
 *
 * CPO/光通信产业链中真正卡脖子的核心环节：光芯片/激光器、硅光/光引擎、
 * 高速光模块量产、CPO封装/耦合/自动化设备、数据中心散热/电源配套。
 *
 * ⚠️ 产业链映射为规则匹配，需人工复核，不代表真实供应商关系。
 */

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Star, Eye, RefreshCw,
  ChevronDown, ChevronRight, Radio, Zap, Layers,
} from "lucide-react";
import { CPO_CHOKEPOINT_GROUPS, type CpoChokepointGroupKey } from "@/lib/cpoChokepointPoolService";
import { addToWatchlist, isInWatchlist, removeFromWatchlist } from "@/lib/watchlistService";

// ── localStorage helpers ──────────────────────────────────────────
const SIM_OBS_KEY = "quantplanet_sim_obs_v1";
const BOM_CAND_KEY = "quantplanet_bom_supply_chain_candidates_v1";

interface SimObsItem  { symbol: string; name: string; segment: string; addedAt: string }
interface BomCandItem { symbol: string; name: string; tsCode: string; sourcePool: string; addedAt: string }

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
function isInSimObs(symbol: string)  { return getSimObs().some(s => s.symbol === symbol); }
function removeSimObs(symbol: string){ localStorage.setItem(SIM_OBS_KEY, JSON.stringify(getSimObs().filter(s => s.symbol !== symbol))); }

function getBomCand(): BomCandItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(BOM_CAND_KEY) || "[]"); } catch { return []; }
}
function addBomCand(item: Omit<BomCandItem, "addedAt">): boolean {
  const list = getBomCand();
  if (list.some(s => s.symbol === item.symbol)) return false;
  list.push({ ...item, addedAt: new Date().toISOString() });
  localStorage.setItem(BOM_CAND_KEY, JSON.stringify(list));
  return true;
}
function isInBomCand(symbol: string) { return getBomCand().some(s => s.symbol === symbol); }
function removeBomCand(symbol: string){ localStorage.setItem(BOM_CAND_KEY, JSON.stringify(getBomCand().filter(s => s.symbol !== symbol))); }

// ── 颜色工具 ──────────────────────────────────────────────────────
function ratingColor(r: string) {
  return ({ 优秀: "#22c55e", 良好: "#3b82f6", 一般: "#f59e0b", 较差: "#64748b" } as Record<string,string>)[r] ?? "#64748b";
}
function barrierColor(b: string) {
  return ({ 极高: "#dc2626", 高: "#ef4444", 中高: "#f97316", 中: "#f59e0b", 中低: "#64748b", 低: "#94a3b8" } as Record<string,string>)[b] ?? "#94a3b8";
}
function localColor(b: string) {
  return ({ 极高: "#16a34a", 高: "#22c55e", 中高: "#3b82f6", 中: "#f59e0b", 中低: "#64748b", 低: "#94a3b8" } as Record<string,string>)[b] ?? "#94a3b8";
}
function aiColor(l: string) {
  return ({ 极强: "#a855f7", 强: "#ef4444", 中高: "#f97316", 中: "#f59e0b", 间接: "#64748b" } as Record<string,string>)[l] ?? "#94a3b8";
}
function groupColor(key: string) {
  return CPO_CHOKEPOINT_GROUPS.find(g => g.key === key)?.color ?? "#64748b";
}
function fmtMv(mv: number | null | undefined) {
  if (mv == null) return "–";
  if (mv >= 100000) return `${(mv / 100000).toFixed(0)}亿`;
  if (mv >= 10000)  return `${(mv / 10000).toFixed(1)}亿`;
  return `${mv.toFixed(0)}万`;
}
function fmtNum(v: number | null | undefined, dec = 1) { return v == null ? "–" : v.toFixed(dec); }

// ── 股票数据类型 ──────────────────────────────────────────────────
interface StockData {
  tsCode: string; symbol: string; name: string;
  primarySegment: string; groups: string[];
  role: string; chokePointDesc: string;
  technicalBarrier: string; localizationSpace: string; aiDemandLevel: string;
  isCore: boolean; notes: string; poolType: string;
  pe: number | null; pb: number | null; totalMv: number | null;
  turnoverRate: number | null; close: number | null;
  score: {
    laserChipScore: number; siliconPhotonicsScore: number;
    packagingYieldScore: number; moduleProductionScore: number;
    financialQualityScore: number; valuationScore: number;
    totalScore: number; rating: string;
  };
}

// ── 股票卡片 ──────────────────────────────────────────────────────
function StockCard({ stock, refresh }: { stock: StockData; refresh: () => void }) {
  const [expanded, setExpanded]     = useState(false);
  const [inWatch,  setInWatch]      = useState(false);
  const [inSim,    setInSim]        = useState(false);
  const [inBom,    setInBom]        = useState(false);
  const [watchFlash, setWatchFlash] = useState<string | null>(null);
  const [simFlash,   setSimFlash]   = useState<string | null>(null);
  const [bomFlash,   setBomFlash]   = useState<string | null>(null);

  useEffect(() => {
    setInWatch(isInWatchlist(stock.symbol, "A"));
    setInSim(isInSimObs(stock.symbol));
    setInBom(isInBomCand(stock.symbol));
  }, [stock.symbol]);

  function handleWatch(e: React.MouseEvent) {
    e.stopPropagation();
    if (inWatch) {
      removeFromWatchlist(stock.symbol, "A");
      setInWatch(false); setWatchFlash("removed");
    } else {
      addToWatchlist({
        symbol: stock.symbol, tsCode: stock.tsCode, name: stock.name,
        market: "A", exchange: stock.tsCode.endsWith(".SH") ? "SH" : "SZ",
        industry: "CPO / 共封装光学", currency: "CNY",
      });
      setInWatch(true); setWatchFlash("added");
    }
    setTimeout(() => { setWatchFlash(null); refresh(); }, 1800);
  }

  function handleSim(e: React.MouseEvent) {
    e.stopPropagation();
    if (inSim) {
      removeSimObs(stock.symbol); setInSim(false); setSimFlash("removed");
    } else {
      addSimObs({ symbol: stock.symbol, name: stock.name, segment: stock.primarySegment });
      setInSim(true); setSimFlash("added");
    }
    setTimeout(() => { setSimFlash(null); refresh(); }, 1800);
  }

  function handleBom(e: React.MouseEvent) {
    e.stopPropagation();
    if (inBom) {
      removeBomCand(stock.symbol); setInBom(false); setBomFlash("removed");
    } else {
      addBomCand({ symbol: stock.symbol, name: stock.name, tsCode: stock.tsCode, sourcePool: "CPO 咽喉池" });
      setInBom(true); setBomFlash("added");
    }
    setTimeout(() => { setBomFlash(null); refresh(); }, 1800);
  }

  const sc     = stock.score;
  const sColor = ratingColor(sc.rating);

  return (
    <div
      className="mb-2 rounded-2xl overflow-hidden cursor-pointer"
      style={{ background: "#0d1f3c", border: `1px solid ${stock.isCore ? "#1e3a5f" : "#1a2f50"}` }}
      onClick={() => setExpanded(v => !v)}
    >
      <div className="p-3">
        {/* 顶部：名称 + 评分 */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {stock.isCore && (
                <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                  style={{ background: "rgba(168,85,247,0.15)", color: "#a855f7" }}>核心</span>
              )}
              <span className="text-[13px] font-bold truncate" style={{ color: "#e2e8f0" }}>{stock.name}</span>
              <span className="text-[10px]" style={{ color: "#334155" }}>{stock.symbol}</span>
            </div>
            {/* 分组标签 */}
            <div className="flex flex-wrap gap-1">
              {stock.groups.slice(0, 2).map(gk => (
                <span key={gk} className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: groupColor(gk) + "20", color: groupColor(gk) }}>
                  {CPO_CHOKEPOINT_GROUPS.find(g => g.key === gk)?.groupName ?? gk}
                </span>
              ))}
            </div>
          </div>

          {/* CPO评分 */}
          <div className="flex-shrink-0 text-center min-w-[36px]">
            <div className="text-[20px] font-bold leading-none" style={{ color: sColor }}>{sc.totalScore}</div>
            <div className="text-[9px] mt-0.5 font-semibold" style={{ color: sColor }}>{sc.rating}</div>
          </div>

          {expanded
            ? <ChevronDown size={14} color="#475569" className="flex-shrink-0 mt-1" />
            : <ChevronRight size={14} color="#475569" className="flex-shrink-0 mt-1" />
          }
        </div>

        {/* 角色 */}
        <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "#64748b" }}>🔩 {stock.role}</p>

        {/* 估值行 */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[9px]" style={{ color: "#475569" }}>PE</span>
            <span className="text-[11px] font-bold" style={{ color: "#e2e8f0" }}>{fmtNum(stock.pe)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px]" style={{ color: "#475569" }}>PB</span>
            <span className="text-[11px] font-bold" style={{ color: "#e2e8f0" }}>{fmtNum(stock.pb)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px]" style={{ color: "#475569" }}>市值</span>
            <span className="text-[11px] font-bold" style={{ color: "#e2e8f0" }}>{fmtMv(stock.totalMv)}</span>
          </div>
          <div className="flex-1" />
          <span className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: barrierColor(stock.technicalBarrier) + "15", color: barrierColor(stock.technicalBarrier) }}>
            壁垒{stock.technicalBarrier}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: localColor(stock.localizationSpace) + "15", color: localColor(stock.localizationSpace) }}>
            替代{stock.localizationSpace}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: aiColor(stock.aiDemandLevel) + "15", color: aiColor(stock.aiDemandLevel) }}>
            AI{stock.aiDemandLevel}
          </span>
        </div>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="px-3 pb-3" style={{ borderTop: "1px solid #1a2f50" }}>
          <div className="pt-2 space-y-3">
            {/* 咽喉点 */}
            <div className="p-2 rounded-xl" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
              <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#a855f7" }}>⚡ 咽喉点</p>
              <p className="text-[10px] leading-relaxed" style={{ color: "#94a3b8" }}>{stock.chokePointDesc}</p>
            </div>

            {/* 补充说明 */}
            <p className="text-[10px] leading-relaxed" style={{ color: "#94a3b8" }}>💡 {stock.notes}</p>

            {/* 评分六维 */}
            <div>
              <p className="text-[10px] mb-1.5" style={{ color: "#475569" }}>咽喉点评分（CPO维度）</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: "光芯片/激光", score: sc.laserChipScore,        w: "25%" },
                  { label: "硅光/光引擎", score: sc.siliconPhotonicsScore, w: "20%" },
                  { label: "封装耦合",    score: sc.packagingYieldScore,   w: "20%" },
                  { label: "模块量产",    score: sc.moduleProductionScore, w: "15%" },
                  { label: "财务质量",    score: sc.financialQualityScore, w: "10%" },
                  { label: "估值合理",    score: sc.valuationScore,        w: "10%" },
                ].map(item => (
                  <div key={item.label} className="p-1.5 rounded-lg text-center"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="text-[8px] mb-0.5 leading-tight" style={{ color: "#475569" }}>{item.label}</div>
                    <div className="text-[13px] font-bold"
                      style={{ color: item.score >= 80 ? "#22c55e" : item.score >= 60 ? "#3b82f6" : "#f59e0b" }}>
                      {item.score}
                    </div>
                    <div className="text-[8px]" style={{ color: "#334155" }}>权{item.w}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button onClick={handleWatch}
                className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold"
                style={{
                  background: inWatch ? "rgba(250,204,21,0.15)" : "rgba(255,255,255,0.05)",
                  color: inWatch ? "#facc15" : "#94a3b8",
                  border: `1px solid ${inWatch ? "rgba(250,204,21,0.3)" : "#1a2f50"}`,
                }}>
                <Star size={10} />
                {watchFlash === "added" ? "✓已加入" : watchFlash === "removed" ? "已移除" : inWatch ? "已自选" : "加自选"}
              </button>
              <button onClick={handleSim}
                className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold"
                style={{
                  background: inSim ? "rgba(168,85,247,0.1)" : "rgba(255,255,255,0.05)",
                  color: inSim ? "#a855f7" : "#94a3b8",
                  border: `1px solid ${inSim ? "rgba(168,85,247,0.25)" : "#1a2f50"}`,
                }}>
                <Eye size={10} />
                {simFlash === "added" ? "✓已加入" : simFlash === "removed" ? "已移除" : inSim ? "观察中" : "加观察"}
              </button>
              <button onClick={handleBom}
                className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold"
                style={{
                  background: inBom ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.05)",
                  color: inBom ? "#3b82f6" : "#94a3b8",
                  border: `1px solid ${inBom ? "rgba(59,130,246,0.25)" : "#1a2f50"}`,
                }}>
                <Layers size={10} />
                {bomFlash === "added" ? "✓加入" : bomFlash === "removed" ? "已移除" : inBom ? "BOM候选" : "加候选"}
              </button>
            </div>

            <p className="text-[8px] leading-relaxed" style={{ color: "#334155" }}>
              ⚠️ 产业链分类为规则匹配，需人工复核，不代表真实供应关系，不构成投资建议
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── API Response 类型 ─────────────────────────────────────────────
interface ApiResponse {
  ok: boolean;
  poolName: string;
  totalStocks: number;
  coreCount: number;
  hasFinancial: boolean;
  corePool: StockData[];
  groups: Array<{
    key: CpoChokepointGroupKey; groupName: string; chokePoint: string;
    description: string; color: string; stocks: StockData[];
  }>;
  allStocks: StockData[];
  stats: { avgScore: number; bySegment: Record<string, number> };
  risks: string[];
  disclaimer: string;
}

type ActiveTab = "core" | CpoChokepointGroupKey;

// ── 主组件 ────────────────────────────────────────────────────────
export default function CPOChokepointPool() {
  const [data,      setData]      = useState<ApiResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("core");
  const [,          forceRender]  = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch("/api/strategies/bom-supply-chain-stock-strategy/chokepoint-pools/cpo", { cache: "no-store" });
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

  const refresh = useCallback(() => forceRender(v => v + 1), []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="animate-spin w-7 h-7 rounded-full border-2 border-[#a855f7] border-t-transparent" />
      <p className="text-[12px]" style={{ color: "#64748b" }}>加载 CPO 咽喉池...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-12">
      <AlertTriangle size={28} color="#ef4444" />
      <p className="text-[12px]" style={{ color: "#94a3b8" }}>{error}</p>
      <button onClick={fetchData} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px]"
        style={{ background: "#0d1f3c", color: "#a855f7", border: "1px solid #1a2f50" }}>
        <RefreshCw size={13} /> 重试
      </button>
    </div>
  );

  if (!data) return null;

  const currentStocks = (): StockData[] => {
    if (activeTab === "core") return data.corePool;
    return data.groups.find(g => g.key === activeTab)?.stocks ?? [];
  };

  const activeGroup = data.groups.find(g => g.key === activeTab);
  const stocks = currentStocks();

  return (
    <div>
      {/* ── 概览卡 ─────────────────────────────────────────────── */}
      <div className="p-3 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-2 mb-2">
          <Radio size={14} color="#a855f7" />
          <span className="text-[13px] font-bold" style={{ color: "#e2e8f0" }}>CPO 咽喉池</span>
          {data.hasFinancial && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full ml-auto"
              style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
              实时数据
            </span>
          )}
        </div>
        <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "#64748b" }}>
          CPO 产业链真正的卡脖子环节：高速光芯片/CW激光器、硅光平台、800G/1.6T光模块量产、
          光电共封装精密耦合设备、AI数据中心热管理。
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-[18px] font-bold" style={{ color: "#a855f7" }}>{data.totalStocks}</div>
            <div className="text-[9px]" style={{ color: "#475569" }}>覆盖股票</div>
          </div>
          <div className="text-center">
            <div className="text-[18px] font-bold" style={{ color: "#3b82f6" }}>{data.coreCount}</div>
            <div className="text-[9px]" style={{ color: "#475569" }}>核心标的</div>
          </div>
          <div className="text-center">
            <div className="text-[18px] font-bold"
              style={{ color: ratingColor(data.stats.avgScore >= 80 ? "优秀" : data.stats.avgScore >= 60 ? "良好" : "一般") }}>
              {data.stats.avgScore}
            </div>
            <div className="text-[9px]" style={{ color: "#475569" }}>核心池均分</div>
          </div>
        </div>
      </div>

      {/* ── 免责声明 ────────────────────────────────────────────── */}
      <div className="p-2.5 rounded-xl mb-3 flex items-start gap-1.5"
        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <AlertTriangle size={11} color="#f59e0b" className="flex-shrink-0 mt-0.5" />
        <p className="text-[10px] leading-relaxed" style={{ color: "#94a3b8" }}>
          {data.disclaimer}
          {!data.hasFinancial && <strong style={{ color: "#f59e0b" }}> · 财务数据不可用，估值评分使用默认值</strong>}
        </p>
      </div>

      {/* ── 分组 Tab ────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
        <button onClick={() => setActiveTab("core")}
          className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold"
          style={{
            background: activeTab === "core" ? "#a855f7" : "#0d1f3c",
            color:      activeTab === "core" ? "#fff"    : "#64748b",
            border:     `1px solid ${activeTab === "core" ? "#a855f7" : "#1a2f50"}`,
          }}>
          ⭐ 核心重点池
        </button>
        {data.groups.map(g => (
          <button key={g.key} onClick={() => setActiveTab(g.key as ActiveTab)}
            className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold"
            style={{
              background: activeTab === g.key ? g.color : "#0d1f3c",
              color:      activeTab === g.key ? (g.color === "#f59e0b" || g.color === "#00E5A8" ? "#07111F" : "#fff") : "#64748b",
              border:     `1px solid ${activeTab === g.key ? g.color : "#1a2f50"}`,
            }}>
            {g.groupName}
          </button>
        ))}
      </div>

      {/* ── 分组说明 ─────────────────────────────────────────────── */}
      {activeTab === "core" ? (
        <div className="p-3 rounded-2xl mb-3"
          style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
          <p className="text-[10px] font-semibold mb-1" style={{ color: "#a855f7" }}>⭐ CPO 咽喉核心重点池（{data.coreCount} 只）</p>
          <p className="text-[10px] leading-relaxed" style={{ color: "#64748b" }}>
            精选 CPO 产业链各咽喉环节代表性标的：光芯片龙头、硅光光器件、高速光模块巨头、封装设备。
            点击展开查看咽喉点评分和操作按钮。
          </p>
        </div>
      ) : activeGroup && (
        <div className="p-3 rounded-2xl mb-3"
          style={{ background: activeGroup.color + "10", border: `1px solid ${activeGroup.color}30` }}>
          <p className="text-[10px] font-semibold mb-1" style={{ color: activeGroup.color }}>
            ⚡ 咽喉点：{activeGroup.chokePoint}
          </p>
          <p className="text-[10px] leading-relaxed" style={{ color: "#64748b" }}>{activeGroup.description}</p>
        </div>
      )}

      {/* ── 股票列表 ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px]" style={{ color: "#64748b" }}>共 {stocks.length} 只（咽喉点评分排序）</span>
        <button onClick={fetchData} className="flex items-center gap-1 text-[10px]" style={{ color: "#475569" }}>
          <RefreshCw size={10} /> 刷新
        </button>
      </div>

      {stocks.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[12px]" style={{ color: "#475569" }}>该分组暂无数据</p>
        </div>
      ) : stocks.map(s => <StockCard key={s.tsCode} stock={s} refresh={refresh} />)}

      {/* ── 风险提示 ───────────────────────────────────────────────── */}
      <div className="mt-4 p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <AlertTriangle size={12} color="#ef4444" />
          <span className="text-[11px] font-bold" style={{ color: "#ef4444" }}>CPO 咽喉池风险提示</span>
        </div>
        <div className="space-y-1">
          {data.risks.map((r, i) => (
            <p key={i} className="text-[9px] leading-relaxed" style={{ color: "#64748b" }}>· {r}</p>
          ))}
        </div>
      </div>

      {/* ── CPO关键词 ─────────────────────────────────────────────── */}
      <div className="mt-3 p-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Zap size={12} color="#a855f7" />
          <span className="text-[10px] font-bold" style={{ color: "#94a3b8" }}>CPO 咽喉关键词</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["CPO共封装光学", "硅光平台", "EML光芯片", "CW激光器", "800G/1.6T光模块",
            "光引擎集成", "精密耦合", "光电封装", "液冷散热", "AI算力互联", "国产替代", "光孤子"].map(t => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(168,85,247,0.08)", color: "#94a3b8", border: "1px solid rgba(168,85,247,0.15)" }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[9px] mt-4 text-center" style={{ color: "#334155" }}>
        ⚠️ 本页面信息仅供研究参考，不构成投资建议。财务数据来自 Tushare Pro，存在延迟，以交易所公告为准。
      </p>
    </div>
  );
}
