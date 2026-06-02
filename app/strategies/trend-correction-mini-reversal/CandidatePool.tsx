"use client";

/**
 * app/strategies/trend-correction-mini-reversal/CandidatePool.tsx
 *
 * 候选池组件：显示趋势回调微型反转策略的买入候选
 */

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Clock, Database } from "lucide-react";
import type { MiniReversalParams } from "@/lib/trendCorrectionMiniReversalService";

// ── 本地类型（镜像服务端，避免 server module 泄漏） ────────────────────────

interface PricePoint { date: string; price: number; idx: number }

interface StockItem {
  tsCode:       string;
  symbol:       string;
  name:         string;
  currentPrice: number;
  uptrend: {
    detected:    boolean;
    lowPoint:    PricePoint | null;
    highPoint:   PricePoint | null;
    riseAmount:  number;
    risePercent: number;
    trendDays:   number;
    reasons:     string[];
  };
  retracement: {
    matched:              boolean;
    halfRetracementPrice: number;
    price40Retracement:   number;
    price60Retracement:   number;
    correctionRatio:      number;
    correctionPercent:    number;
    lowerZonePrice:       number;
    upperZonePrice:       number;
  };
  miniReversal: { score: number; conditionsMet: number; conditionsTotal: number; reasons: string[] };
  riskFilter:  { passed: boolean; riskLevel: string; reason: string };
  buySignal:    boolean;
  buySignalReasons: string[];
  addedAt:      string;
  lastScannedAt: string;
}

interface ScanStats {
  total:             number;
  withTrend:         number;
  inRetracementZone: number;
  withMiniReversal:  number;
  riskPassed:        number;
  candidates:        number;
  highRiskExcluded:  number;
  dataInsufficient:  number;
  errors:            number;
}

interface ScanResponse {
  ok:         boolean;
  candidates: StockItem[];
  highRisk:   Array<{ tsCode: string; name: string; reason: string }>;
  dataInsuff: Array<{ tsCode: string; name: string; reason: string }>;
  stats:      ScanStats;
  scannedAt:  string;
  error?:     string;
  message?:   string;
}

interface SavedData {
  candidates: StockItem[];
  highRisk:   Array<{ tsCode: string; name: string; reason: string }>;
  dataInsuff: Array<{ tsCode: string; name: string; reason: string }>;
  stats:      ScanStats;
  scannedAt:  string;
}

interface Props {
  params: MiniReversalParams;
}

const STORAGE_KEY = "quantplanet_trend_correction_mini_reversal_candidates_v1";
const HISTORY_KEY = "quantplanet_trend_correction_mini_reversal_scan_history_v1";

type TabKey = "candidates" | "highRisk" | "dataInsuff" | "history";

// ── 颜色工具 ─────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#3b82f6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function fmtDate(d: string): string {
  if (!d || d.length < 8) return d;
  if (d.includes("T")) return d.slice(0, 10);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// ── 候选卡片 ──────────────────────────────────────────────────────────────

function CandidateCard({ item }: { item: StockItem }) {
  const [expanded, setExpanded] = useState(false);
  const score = item.miniReversal.score;
  const cr    = item.retracement.correctionPercent;
  const rise  = item.uptrend.risePercent * 100;

  return (
    <div
      className="p-3 rounded-xl mb-2 cursor-pointer"
      style={{ background: "#0d1f3c", border: `1px solid ${item.buySignal ? "#22c55e44" : "#1a2f50"}` }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* 头部 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-[14px]" style={{ color: "#e2e8f0" }}>{item.name}</span>
            <span className="text-[11px]" style={{ color: "#64748b" }}>{item.symbol}</span>
            {item.buySignal && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                买入候选
              </span>
            )}
          </div>
          {/* 核心数据行 */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span style={{ color: "#94a3b8" }}>
              当前 <span style={{ color: "#e2e8f0" }}>¥{item.currentPrice.toFixed(2)}</span>
            </span>
            <span style={{ color: "#94a3b8" }}>
              上涨 <span style={{ color: "#22c55e" }}>+{rise.toFixed(1)}%</span>
            </span>
            <span style={{ color: "#94a3b8" }}>
              回撤 <span style={{ color: "#f59e0b" }}>{cr.toFixed(1)}%</span>
            </span>
            <span style={{ color: "#94a3b8" }}>
              50%回撤价 <span style={{ color: "#3b82f6" }}>¥{item.retracement.halfRetracementPrice.toFixed(2)}</span>
            </span>
          </div>
        </div>
        {/* 评分 */}
        <div className="flex flex-col items-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold"
            style={{ background: `${scoreColor(score)}22`, border: `1px solid ${scoreColor(score)}`, color: scoreColor(score) }}
          >
            {score}
          </div>
          <span className="text-[9px] mt-0.5" style={{ color: "#475569" }}>反转分</span>
        </div>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1a2f50" }}>
          {/* 价格区间 */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "阶段低点", value: item.uptrend.lowPoint?.price.toFixed(2) ?? "-", color: "#22c55e", sub: fmtDate(item.uptrend.lowPoint?.date ?? "") },
              { label: "阶段高点", value: item.uptrend.highPoint?.price.toFixed(2) ?? "-", color: "#ef4444", sub: fmtDate(item.uptrend.highPoint?.date ?? "") },
              { label: "50%回撤", value: item.retracement.halfRetracementPrice.toFixed(2), color: "#3b82f6", sub: "理论" },
            ].map(d => (
              <div key={d.label} className="p-2 rounded-lg text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="text-[10px] mb-1" style={{ color: "#64748b" }}>{d.label}</div>
                <div className="text-[13px] font-bold" style={{ color: d.color }}>¥{d.value}</div>
                <div className="text-[9px]" style={{ color: "#334155" }}>{d.sub}</div>
              </div>
            ))}
          </div>

          {/* 回撤区间 */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "40%回撤", value: item.retracement.price40Retracement.toFixed(2), color: "#f59e0b" },
              { label: "当前价", value: item.currentPrice.toFixed(2), color: "#e2e8f0" },
              { label: "60%回撤", value: item.retracement.price60Retracement.toFixed(2), color: "#f97316" },
            ].map(d => (
              <div key={d.label} className="p-2 rounded-lg text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="text-[10px] mb-1" style={{ color: "#64748b" }}>{d.label}</div>
                <div className="text-[12px] font-bold" style={{ color: d.color }}>¥{d.value}</div>
              </div>
            ))}
          </div>

          {/* 买入信号原因 */}
          {item.buySignalReasons.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] mb-1" style={{ color: "#64748b" }}>买入信号原因：</p>
              {item.buySignalReasons.map((r, i) => (
                <p key={i} className="text-[11px]" style={{ color: "#22c55e" }}>{r}</p>
              ))}
            </div>
          )}

          {/* 微型反转条件 */}
          <div className="mb-2">
            <p className="text-[10px] mb-1" style={{ color: "#64748b" }}>
              微型反转条件（{item.miniReversal.conditionsMet}/{item.miniReversal.conditionsTotal}）：
            </p>
            <div className="flex flex-wrap gap-1">
              {item.miniReversal.reasons.map((r, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
                  ✓ {r}
                </span>
              ))}
            </div>
          </div>

          <p className="text-[10px]" style={{ color: "#334155" }}>
            上涨天数：{item.uptrend.trendDays} 日 ｜ 最近扫描：{fmtDate(item.lastScannedAt)}
          </p>
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────

// ── 错误诊断 ──────────────────────────────────────────────────────────────

interface ErrorDetail {
  title:   string;   // 一句话中文描述
  tips:    string;   // 建议操作
  apiPath: string;
  method:  string;
  status?: number;
  raw?:    string;
}

function classifyError(e: unknown, status?: number, rawBody?: string): ErrorDetail {
  const API_PATH = "/api/strategies/trend-correction-mini-reversal/scan";
  const METHOD   = "POST";

  const msg = e instanceof Error ? e.message : String(e ?? "");

  // 网络层错误（fetch 本身 reject）
  if (e instanceof TypeError && (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("fetch") ||
    msg.includes("network")
  )) {
    return {
      title:   "网络请求失败，请检查部署状态",
      tips:    "可能原因：Vercel 接口未部署、服务器宕机、CORS 拦截。请确认生产环境已重新部署。",
      apiPath: API_PATH, method: METHOD, raw: msg,
    };
  }

  // HTTP 状态码错误
  if (status !== undefined) {
    if (status === 404) {
      return {
        title:   "扫描接口不可用（404）",
        tips:    "接口路由不存在，请检查部署是否包含最新代码。",
        apiPath: API_PATH, method: METHOD, status,
        raw:     rawBody ?? "404 Not Found",
      };
    }
    if (status === 500) {
      return {
        title:   "接口服务异常（500）",
        tips:    "服务端抛出异常，可能是 Tushare Token 未配置或数据不可用。",
        apiPath: API_PATH, method: METHOD, status,
        raw:     rawBody ?? "Internal Server Error",
      };
    }
    if (status === 504 || status === 524) {
      return {
        title:   "扫描超时，请减少 maxStocks 后重试",
        tips:    "Vercel Serverless 函数超时（最长 60 秒）。当前扫描股票数量过多。",
        apiPath: API_PATH, method: METHOD, status,
        raw:     rawBody ?? "Gateway Timeout",
      };
    }
    if (status >= 400) {
      return {
        title:   `接口返回异常（HTTP ${status}）`,
        tips:    "请检查请求参数或服务端日志。",
        apiPath: API_PATH, method: METHOD, status,
        raw:     rawBody ?? `HTTP ${status}`,
      };
    }
  }

  // Tushare 相关
  if (msg.includes("permission") || msg.includes("权限") || (rawBody && rawBody.includes("permission"))) {
    return {
      title:   "Tushare 数据不可用（权限不足）",
      tips:    "TUSHARE_TOKEN 未配置或无对应接口权限。请检查环境变量。",
      apiPath: API_PATH, method: METHOD, raw: msg || rawBody,
    };
  }
  if (msg.includes("token") || msg.includes("TUSHARE")) {
    return {
      title:   "Tushare 数据不可用（Token 未配置）",
      tips:    "请在 Vercel 环境变量中设置 TUSHARE_TOKEN。",
      apiPath: API_PATH, method: METHOD, raw: msg,
    };
  }

  // 通用
  return {
    title:   "当前策略扫描失败，请稍后重试",
    tips:    "扫描过程中发生未知错误，可尝试重新点击扫描。",
    apiPath: API_PATH, method: METHOD, raw: msg || rawBody,
  };
}

export default function CandidatePool({ params }: Props) {
  const [tab,         setTab]         = useState<TabKey>("candidates");
  const [loading,     setLoading]     = useState(false);
  const [data,        setData]        = useState<SavedData | null>(null);
  const [error,       setError]       = useState<ErrorDetail | null>(null);
  const [progress,    setProgress]    = useState("");
  const [showDebug,   setShowDebug]   = useState(false);

  // 加载持久化数据
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setData(JSON.parse(saved));
    } catch {}
  }, []);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress("正在请求全市场扫描（最多 200 只）…");

    const API_PATH = "/api/strategies/trend-correction-mini-reversal/scan";
    let status: number | undefined;
    let rawBody: string | undefined;

    try {
      const res = await fetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params, concurrency: 5 }),
      });
      status = res.status;

      // 尝试解析 JSON
      let json: ScanResponse;
      try {
        rawBody = await res.text();
        json    = JSON.parse(rawBody) as ScanResponse;
      } catch {
        // 无法解析 JSON（可能是 HTML 错误页）
        setError(classifyError(new Error("接口返回非 JSON 内容"), status, rawBody?.slice(0, 200)));
        return;
      }

      if (!res.ok || !json.ok) {
        const msg   = json.error ?? json.message ?? "扫描失败";
        const detail = classifyError(new Error(msg), status, msg);
        setError(detail);
        return;
      }

      const saved: SavedData = {
        candidates: json.candidates,
        highRisk:   json.highRisk,
        dataInsuff: json.dataInsuff,
        stats:      json.stats,
        scannedAt:  json.scannedAt,
      };
      setData(saved);

      // 持久化
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        // 保存历史
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
        history.unshift({ scannedAt: json.scannedAt, stats: json.stats });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
      } catch {}
    } catch (e) {
      setError(classifyError(e, status, rawBody?.slice(0, 200)));
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, [params]);

  const stats = data?.stats;

  return (
    <div>
      {/* 操作栏 */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={runScan}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold"
          style={{ background: loading ? "#1a2f50" : "#00E5A8", color: loading ? "#64748b" : "#07111F" }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "扫描中…" : "全市场扫描"}
        </button>
        {progress && <span className="text-[11px]" style={{ color: "#64748b" }}>{progress}</span>}
        {data?.scannedAt && !loading && (
          <span className="text-[11px]" style={{ color: "#334155" }}>
            <Clock size={10} className="inline mr-1" />
            {fmtDate(data.scannedAt)}
          </span>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          {/* 主错误标题 */}
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle size={13} color="#ef4444" className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "#ef4444" }}>{error.title}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#f87171" }}>{error.tips}</p>
            </div>
          </div>
          {/* 调试信息（可折叠） */}
          <button
            onClick={() => setShowDebug(v => !v)}
            className="text-[10px] px-2 py-0.5 rounded"
            style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}
          >
            {showDebug ? "▲ 隐藏调试信息" : "▼ 显示调试信息"}
          </button>
          {showDebug && (
            <div className="mt-2 p-2 rounded-lg font-mono text-[10px] space-y-0.5"
              style={{ background: "rgba(0,0,0,0.3)", color: "#94a3b8" }}>
              <p><span style={{ color: "#64748b" }}>API 路径：</span>{error.apiPath}</p>
              <p><span style={{ color: "#64748b" }}>请求方法：</span>{error.method}</p>
              {error.status !== undefined && (
                <p><span style={{ color: "#64748b" }}>HTTP 状态：</span>
                  <span style={{ color: error.status >= 500 ? "#f87171" : error.status >= 400 ? "#fbbf24" : "#94a3b8" }}>
                    {error.status}
                  </span>
                </p>
              )}
              {error.raw && (
                <p className="break-all"><span style={{ color: "#64748b" }}>错误详情：</span>{error.raw}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 扫描统计 */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: "扫描总数", value: stats.total,            color: "#94a3b8" },
            { label: "识别趋势", value: stats.withTrend,        color: "#3b82f6" },
            { label: "50%区间", value: stats.inRetracementZone, color: "#f59e0b" },
            { label: "买入候选", value: stats.candidates,       color: "#22c55e" },
          ].map(s => (
            <div key={s.label} className="p-2 rounded-xl text-center" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="text-[16px] font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px]" style={{ color: "#64748b" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 标签页 */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {(
          [
            { key: "candidates", label: `买入候选 ${data?.candidates.length ?? 0}`, icon: <TrendingUp size={11} /> },
            { key: "highRisk",   label: `高风险剔除 ${data?.highRisk.length ?? 0}`,   icon: <AlertTriangle size={11} /> },
            { key: "dataInsuff", label: `数据不足 ${data?.dataInsuff.length ?? 0}`,   icon: <Database size={11} /> },
            { key: "history",    label: "历史扫描",                                    icon: <Clock size={11} /> },
          ] as const
        ).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px]"
            style={{
              background: tab === t.key ? "#1e40af" : "rgba(30,64,175,0.1)",
              color:      tab === t.key ? "#93c5fd" : "#475569",
              border:     tab === t.key ? "1px solid #3b82f6" : "1px solid transparent",
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* 内容 */}
      {!data && !loading && (
        <div className="py-10 text-center">
          <TrendingUp size={32} color="#1a2f50" className="mx-auto mb-3" />
          <p className="text-[13px]" style={{ color: "#475569" }}>点击「全市场扫描」开始扫描</p>
          <p className="text-[11px] mt-1" style={{ color: "#334155" }}>
            随机采样 200 只 A股，识别长期上涨 + 50%回撤 + 微型反转信号
          </p>
        </div>
      )}

      {tab === "candidates" && data && (
        data.candidates.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[12px]" style={{ color: "#475569" }}>当前无买入候选</p>
            <p className="text-[11px] mt-1" style={{ color: "#334155" }}>可调整参数后重新扫描</p>
          </div>
        ) : (
          <div>
            {data.candidates.map(item => <CandidateCard key={item.tsCode} item={item} />)}
          </div>
        )
      )}

      {tab === "highRisk" && data && (
        <div>
          {data.highRisk.length === 0 ? (
            <p className="py-4 text-center text-[12px]" style={{ color: "#475569" }}>无高风险剔除记录</p>
          ) : (
            data.highRisk.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg mb-1" style={{ background: "#0d1f3c" }}>
                <span className="text-[12px]" style={{ color: "#e2e8f0" }}>{item.name}</span>
                <span className="text-[11px]" style={{ color: "#ef4444" }}>{item.reason}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "dataInsuff" && data && (
        <div>
          {data.dataInsuff.length === 0 ? (
            <p className="py-4 text-center text-[12px]" style={{ color: "#475569" }}>无数据不足记录</p>
          ) : (
            data.dataInsuff.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg mb-1" style={{ background: "#0d1f3c" }}>
                <span className="text-[12px]" style={{ color: "#e2e8f0" }}>{item.name}</span>
                <span className="text-[11px]" style={{ color: "#94a3b8" }}>{item.reason}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "history" && (
        <ScanHistory />
      )}
    </div>
  );
}

function ScanHistory() {
  const [history, setHistory] = useState<Array<{ scannedAt: string; stats: ScanStats }>>([]);

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      setHistory(h);
    } catch {}
  }, []);

  if (history.length === 0) {
    return <p className="py-4 text-center text-[12px]" style={{ color: "#475569" }}>暂无历史扫描记录</p>;
  }

  return (
    <div>
      {history.map((h, i) => (
        <div key={i} className="p-2.5 rounded-xl mb-2" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-medium" style={{ color: "#e2e8f0" }}>
              {fmtDate(h.scannedAt)}
            </span>
            <span className="text-[11px]" style={{ color: "#22c55e" }}>候选 {h.stats.candidates}</span>
          </div>
          <div className="flex gap-3 text-[10px]" style={{ color: "#64748b" }}>
            <span>扫描 {h.stats.total}</span>
            <span>趋势 {h.stats.withTrend}</span>
            <span>50%区间 {h.stats.inRetracementZone}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
