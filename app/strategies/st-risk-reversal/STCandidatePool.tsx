"use client";
/**
 * STCandidatePool.tsx — ST 候选观察池 UI
 *
 * 从 localStorage 读取扫描结果，展示候选池和历史记录。
 * 候选池按 tsCode 去重，最新扫描的结果覆盖旧结果。
 * 历史记录保留最多 MAX_HISTORY（10）次扫描批次。
 *
 * Props:
 *   onViewDetail(candidate) — 点击"查看回测详情"时回调，page.tsx 切换到 single 模式
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  AlertTriangle, Trash2, ChevronDown, ChevronUp,
  Search, X, RefreshCw, BarChart3, Clock, TrendingUp, Shield,
} from "lucide-react";
import {
  loadPool, loadHistory, removeFromPool, clearPool,
  deleteScanRecord, clearHistory,
  type STCandidateEntry, type STScanRecord,
} from "@/lib/stScanStorage";

// ── 颜色 ─────────────────────────────────────────────────────────────
const R   = "#EF4444";
const G   = "#00E5A8";
const Y   = "#FACC15";
const B   = "#3B82F6";
const DIM = "#64748B";
const MID = "#94A3B8";
const CARD   = "#0d1f3c";
const BORDER = "#1a2f50";

// ── 辅助函数 ─────────────────────────────────────────────────────────
function fmtMoney(n: number) {
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(0)}万`;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return iso.slice(0, 16); }
}

function fmtDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return iso.slice(5, 16); }
}

const RISK_LABEL: Record<STCandidateEntry["riskLevel"], string> = {
  low: "低风险", medium: "中风险", high: "高风险", extreme: "极端风险",
};
const RISK_COLOR: Record<STCandidateEntry["riskLevel"], string> = {
  low: G, medium: Y, high: "#F97316", extreme: R,
};

// ── 排序/过滤选项 ─────────────────────────────────────────────────────
type SortKey = "annual" | "drawdown" | "winrate" | "scanned" | "score";
type FilterKey = "all" | "passed" | "high_risk" | "low_dd";

const SORT_OPTIONS: { k: SortKey; label: string }[] = [
  { k: "annual",   label: "年化↓" },
  { k: "drawdown", label: "回撤↑" },
  { k: "winrate",  label: "胜率↓" },
  { k: "score",    label: "评分↓" },
  { k: "scanned",  label: "最新" },
];

const FILTER_OPTIONS: { k: FilterKey; label: string }[] = [
  { k: "all",       label: "全部" },
  { k: "passed",    label: "✅达标" },
  { k: "high_risk", label: "🔴高风险" },
  { k: "low_dd",    label: "📉低回撤" },
];

// ── 候选股票卡片 ──────────────────────────────────────────────────────
function CandidateCard({
  entry, onViewDetail, onRemove,
}: {
  entry: STCandidateEntry;
  onViewDetail: () => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const rl = entry.riskLevel;

  return (
    <div className="p-3 rounded-2xl"
      style={{ background: CARD, border: `1px solid ${entry.passed ? G + "55" : BORDER}` }}>

      {/* 头部 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-black text-[14px]" style={{ color: "#F8FAFC" }}>{entry.name}</span>
            <span className="text-[10px]" style={{ color: DIM }}>{entry.symbol}</span>
            {entry.stType && (
              <span className="text-[8px] px-1 rounded font-bold"
                style={{ background: `${R}18`, color: R }}>{entry.stType}</span>
            )}
            {entry.passed && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: `${G}18`, color: G, border: `1px solid ${G}44` }}>✅ 达标</span>
            )}
          </div>
          <p className="text-[9px]" style={{ color: DIM }}>{entry.industry}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
            style={{ background: `${RISK_COLOR[rl]}18`, color: RISK_COLOR[rl], border: `1px solid ${RISK_COLOR[rl]}44` }}>
            {RISK_LABEL[rl]}
          </span>
          <span className="text-[8px] font-bold"
            style={{ color: entry.compositeScore >= 60 ? G : entry.compositeScore >= 40 ? Y : R }}>
            评分 {entry.compositeScore}
          </span>
        </div>
      </div>

      {/* 核心指标格 */}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {[
          { l: "年化收益", v: `${entry.annualReturn >= 0 ? "+" : ""}${entry.annualReturn.toFixed(1)}%`, c: entry.annualReturn >= 0 ? G : R },
          { l: "总收益",   v: `${entry.totalReturn >= 0 ? "+" : ""}${entry.totalReturn.toFixed(1)}%`,   c: entry.totalReturn >= 0 ? G : R },
          { l: "最大回撤", v: `${entry.maxDrawdown.toFixed(1)}%`, c: Math.abs(entry.maxDrawdown) > 30 ? R : Y },
          { l: "胜率",     v: `${entry.winRate.toFixed(1)}%`,     c: entry.winRate >= 50 ? G : MID },
          { l: "交易次数", v: `${entry.tradeCount}次`,            c: MID },
          { l: "止损次数", v: `${entry.stopLossCount}次`,          c: entry.stopLossCount > 3 ? R : MID },
          { l: "跌停滞留", v: `${entry.limitDownCannotSellCount}次`, c: entry.limitDownCannotSellCount > 0 ? R : G },
          { l: "夏普比率", v: entry.sharpeRatio.toFixed(2),        c: entry.sharpeRatio >= 0 ? G : R },
        ].map(({ l, v, c }) => (
          <div key={l} className="p-1.5 rounded-lg text-center" style={{ background: "#0a1628" }}>
            <p className="font-black text-[10px]" style={{ color: c }}>{v}</p>
            <p className="text-[7px] mt-0.5" style={{ color: DIM }}>{l}</p>
          </div>
        ))}
      </div>

      {/* 不达标原因 */}
      {!entry.passed && entry.failedReasons.length > 0 && (
        <div className="mb-2 px-2 py-1.5 rounded-xl"
          style={{ background: "rgba(239,68,68,0.06)", border: `1px solid ${R}22` }}>
          <p className="text-[8px] font-bold mb-0.5" style={{ color: R }}>未达标原因：</p>
          {entry.failedReasons.map((r, i) => (
            <p key={i} className="text-[8px]" style={{ color: DIM }}>• {r}</p>
          ))}
        </div>
      )}

      {/* 扫描时间 */}
      <p className="text-[8px] mb-2" style={{ color: DIM }}>
        扫描于 {fmtDate(entry.scannedAt)} · {entry.scanParams?.dateRange ?? "—"} · {entry.scanParams?.scoreMode ?? "—"}
      </p>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button onClick={onViewDetail}
          className="flex-1 py-2 rounded-xl text-[11px] font-black"
          style={{ background: "linear-gradient(135deg,#EF4444,#b91c1c)", color: "#fff" }}>
          查看回测详情
        </button>
        {confirmRemove ? (
          <div className="flex gap-1">
            <button onClick={() => { onRemove(); setConfirmRemove(false); }}
              className="px-3 py-2 rounded-xl text-[10px] font-bold"
              style={{ background: "rgba(239,68,68,0.15)", color: R, border: `1px solid ${R}44` }}>
              确认
            </button>
            <button onClick={() => setConfirmRemove(false)}
              className="px-3 py-2 rounded-xl text-[10px] font-bold"
              style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
              取消
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmRemove(true)}
            className="px-3 py-2 rounded-xl"
            style={{ background: "#0a1628", border: `1px solid ${BORDER}` }}>
            <Trash2 size={13} color={DIM} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── 历史记录卡片 ─────────────────────────────────────────────────────
function HistoryCard({
  record, onDelete, onViewStock,
}: {
  record: STScanRecord;
  onDelete: () => void;
  onViewStock: (entry: STCandidateEntry) => void;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const s = record.summary;
  const passRate = s.scannedCount > 0 ? ((s.passedCount / s.scannedCount) * 100).toFixed(0) : "0";

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      {/* 标题行 */}
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-black text-[13px]" style={{ color: "#F8FAFC" }}>
                {fmtDate(record.scannedAt)}
              </span>
              <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: `${G}18`, color: G, border: `1px solid ${G}44` }}>
                {s.passedCount} 只达标
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {[
                { k: "已扫描", v: `${s.scannedCount}/${s.totalSTCount}只` },
                { k: "达标率", v: `${passRate}%`, c: Number(passRate) >= 20 ? G : Y },
                { k: "最高年化", v: `${s.topAnnualReturn.toFixed(1)}%`, c: s.topAnnualReturn >= 20 ? G : MID },
                { k: "周期", v: record.params.dateRange },
                { k: "模式", v: record.params.scoreMode },
              ].map(({ k, v, c }) => (
                <span key={k} className="text-[9px]">
                  <span style={{ color: DIM }}>{k}：</span>
                  <span className="font-bold" style={{ color: (c as string | undefined) ?? MID }}>{v}</span>
                </span>
              ))}
            </div>
            {s.topStockName && (
              <p className="text-[9px] mt-0.5" style={{ color: DIM }}>
                最优: {s.topStockName}（年化 {s.topAnnualReturn.toFixed(1)}%）
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {expanded ? <ChevronUp size={14} color={DIM} /> : <ChevronDown size={14} color={DIM} />}
          </div>
        </div>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-t px-4 pb-4 space-y-3" style={{ borderColor: BORDER }}>
          {/* 参数摘要 */}
          <div className="pt-3 px-3 py-2 rounded-xl flex flex-wrap gap-x-3 gap-y-1"
            style={{ background: "#0a1628" }}>
            {[
              { k: "初始资金", v: `¥${fmtMoney(record.params.initialCapital)}` },
              { k: "仓位",     v: `${(record.params.positionRatio * 100).toFixed(0)}%` },
              { k: "止损",     v: `-${(record.params.stopLossRate * 100).toFixed(0)}%` },
              { k: "小止盈",   v: `+${(record.params.halfProfitRate * 100).toFixed(0)}%` },
              { k: "大止盈",   v: `+${(record.params.fullProfitRate * 100).toFixed(0)}%` },
              { k: "成交额下限", v: record.params.minAmount20d === 0 ? "不限" : `${record.params.minAmount20d / 10000}万` },
            ].map(({ k, v }) => (
              <span key={k} className="text-[9px]">
                <span style={{ color: DIM }}>{k}：</span>
                <span className="font-bold" style={{ color: MID }}>{v}</span>
              </span>
            ))}
          </div>

          {/* 达标股票列表 */}
          {record.results.filter(r => r.passed).length > 0 && (
            <div>
              <p className="text-[10px] font-bold mb-2" style={{ color: G }}>达标股票（{record.results.filter(r => r.passed).length}只）</p>
              <div className="space-y-1.5">
                {record.results
                  .filter(r => r.passed)
                  .sort((a, b) => b.annualReturn - a.annualReturn)
                  .slice(0, 10)
                  .map(entry => (
                    <div key={entry.tsCode}
                      className="flex items-center justify-between px-3 py-2 rounded-xl"
                      style={{ background: "#0a1628", border: `1px solid ${BORDER}` }}>
                      <div>
                        <span className="text-[11px] font-bold" style={{ color: "#F8FAFC" }}>{entry.name}</span>
                        <span className="text-[9px] ml-1.5" style={{ color: DIM }}>{entry.symbol}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold"
                          style={{ color: entry.annualReturn >= 0 ? G : R }}>
                          年化 {entry.annualReturn >= 0 ? "+" : ""}{entry.annualReturn.toFixed(1)}%
                        </span>
                        <button onClick={() => onViewStock(entry)}
                          className="text-[9px] px-2 py-1 rounded-lg font-bold"
                          style={{ background: "rgba(239,68,68,0.15)", color: R }}>
                          详情
                        </button>
                      </div>
                    </div>
                  ))}
                {record.results.filter(r => r.passed).length > 10 && (
                  <p className="text-[9px] text-center" style={{ color: DIM }}>
                    还有 {record.results.filter(r => r.passed).length - 10} 只达标股票…
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 删除按钮 */}
          {confirmDel ? (
            <div className="flex gap-2">
              <button onClick={() => { onDelete(); setConfirmDel(false); }}
                className="flex-1 py-2 rounded-xl text-[11px] font-bold"
                style={{ background: "rgba(239,68,68,0.15)", color: R, border: `1px solid ${R}44` }}>
                确认删除此次记录
              </button>
              <button onClick={() => setConfirmDel(false)}
                className="flex-1 py-2 rounded-xl text-[11px] font-bold"
                style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
                取消
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)}
              className="w-full py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5"
              style={{ background: "#0a1628", color: DIM, border: `1px solid ${BORDER}` }}>
              <Trash2 size={12} />
              删除此次扫描记录
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────
interface Props {
  onViewDetail: (candidate: STCandidateEntry) => void;
}

export default function STCandidatePool({ onViewDetail }: Props) {
  const [tab, setTab]           = useState<"pool" | "history">("pool");
  const [pool, setPool]         = useState<STCandidateEntry[]>([]);
  const [history, setHistory]   = useState<STScanRecord[]>([]);
  const [search, setSearch]     = useState("");
  const [sortBy, setSortBy]     = useState<SortKey>("annual");
  const [filter, setFilter]     = useState<FilterKey>("all");
  const [confirmClear, setConfirmClear] = useState<"pool" | "history" | null>(null);

  // 加载 localStorage 数据
  const reload = useCallback(() => {
    setPool(loadPool());
    setHistory(loadHistory());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // 过滤 + 排序后的候选池
  const displayed = useMemo(() => {
    const q = search.trim().toUpperCase();
    let list = pool.filter(e => {
      if (q.length >= 2) {
        if (!e.symbol.includes(q) && !e.name.toUpperCase().includes(q) && !e.tsCode.toUpperCase().includes(q)) {
          return false;
        }
      }
      switch (filter) {
        case "passed":    return e.passed;
        case "high_risk": return e.riskLevel === "high" || e.riskLevel === "extreme";
        case "low_dd":    return Math.abs(e.maxDrawdown) <= 25;
        default:          return true;
      }
    });
    switch (sortBy) {
      case "annual":   list = [...list].sort((a, b) => b.annualReturn - a.annualReturn); break;
      case "drawdown": list = [...list].sort((a, b) => Math.abs(a.maxDrawdown) - Math.abs(b.maxDrawdown)); break;
      case "winrate":  list = [...list].sort((a, b) => b.winRate - a.winRate); break;
      case "score":    list = [...list].sort((a, b) => b.compositeScore - a.compositeScore); break;
      case "scanned":  list = [...list].sort((a, b) =>
        new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()); break;
    }
    return list;
  }, [pool, search, sortBy, filter]);

  const passedCount   = pool.filter(e => e.passed).length;
  const historyPassed = history.reduce((a, r) => a + r.summary.passedCount, 0);

  return (
    <div className="space-y-4">

      {/* ── Tab 切换 */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { k: "pool"    as const, icon: "📋", label: "候选池", count: pool.length },
          { k: "history" as const, icon: "🕐", label: "历史记录", count: history.length },
        ]).map(({ k, icon, label, count }) => (
          <button key={k} onClick={() => setTab(k)}
            className="py-3 rounded-2xl text-[12px] font-black flex flex-col items-center gap-0.5"
            style={{
              background: tab === k ? "rgba(59,130,246,0.18)" : CARD,
              border: `2px solid ${tab === k ? B : BORDER}`,
              color: tab === k ? B : MID,
            }}>
            <span className="text-[16px]">{icon}</span>
            <span>{label}</span>
            <span className="text-[10px] font-normal" style={{ color: tab === k ? B + "aa" : DIM }}>
              {count} 条
            </span>
          </button>
        ))}
      </div>

      {/* ══════════════════ 候选池 Tab ══════════════════ */}
      {tab === "pool" && (
        <div className="space-y-3">

          {/* 统计摘要 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <BarChart3 size={14} color={B} />, label: "总候选", value: `${pool.length} 只` },
              { icon: <TrendingUp size={14} color={G} />, label: "已达标", value: `${passedCount} 只`, c: G },
              { icon: <Shield size={14} color={Y} />, label: "历史批次", value: `${history.length} 次` },
            ].map(({ icon, label, value, c }) => (
              <div key={label} className="p-2.5 rounded-xl text-center"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="flex justify-center mb-1">{icon}</div>
                <p className="font-black text-[13px]" style={{ color: (c as string | undefined) ?? MID }}>{value}</p>
                <p className="text-[9px]" style={{ color: DIM }}>{label}</p>
              </div>
            ))}
          </div>

          {/* 搜索框 */}
          {pool.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "#0a1628", border: `1px solid ${BORDER}` }}>
              <Search size={13} color={DIM} className="flex-shrink-0" />
              <input
                className="flex-1 text-[12px] outline-none bg-transparent"
                style={{ color: "#F8FAFC" }}
                placeholder="搜索股票名称/代码…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch("")}>
                  <X size={13} color={DIM} />
                </button>
              )}
            </div>
          )}

          {/* 过滤 + 排序 */}
          {pool.length > 0 && (
            <div className="space-y-2">
              <div className="flex gap-1.5 flex-wrap">
                {FILTER_OPTIONS.map(({ k, label }) => (
                  <button key={k} onClick={() => setFilter(k)}
                    className="px-2.5 py-1 rounded-xl text-[9px] font-bold"
                    style={{
                      background: filter === k ? "rgba(59,130,246,0.15)" : "#0a1628",
                      border: `1px solid ${filter === k ? B : BORDER}`,
                      color: filter === k ? B : MID,
                    }}>{label}</button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[9px] py-1" style={{ color: DIM }}>排序：</span>
                {SORT_OPTIONS.map(({ k, label }) => (
                  <button key={k} onClick={() => setSortBy(k)}
                    className="px-2.5 py-1 rounded-xl text-[9px] font-bold"
                    style={{
                      background: sortBy === k ? "rgba(250,204,21,0.12)" : "#0a1628",
                      border: `1px solid ${sortBy === k ? Y : BORDER}`,
                      color: sortBy === k ? Y : MID,
                    }}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* 空状态 */}
          {pool.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="flex justify-center">
                <BarChart3 size={40} color={BORDER} />
              </div>
              <p className="font-bold text-[14px]" style={{ color: MID }}>暂无 ST 候选股票</p>
              <p className="text-[11px]" style={{ color: DIM }}>
                请先切换到「🤖 自动扫描」模式，运行完成后结果将自动保存到此处
              </p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-bold text-[13px]" style={{ color: MID }}>没有匹配的股票</p>
              <p className="text-[10px] mt-1" style={{ color: DIM }}>尝试修改搜索词或过滤条件</p>
            </div>
          ) : (
            <>
              {/* 结果数量 */}
              <p className="text-[10px] px-1" style={{ color: DIM }}>
                显示 {displayed.length} / {pool.length} 只候选股票
              </p>

              {/* 候选股票卡片列表 */}
              <div className="space-y-3">
                {displayed.map(entry => (
                  <CandidateCard
                    key={entry.tsCode}
                    entry={entry}
                    onViewDetail={() => onViewDetail(entry)}
                    onRemove={() => {
                      removeFromPool(entry.tsCode);
                      reload();
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* 操作区 */}
          {pool.length > 0 && (
            <div className="flex gap-2 pt-2">
              <button onClick={reload}
                className="flex-1 py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5"
                style={{ background: CARD, color: MID, border: `1px solid ${BORDER}` }}>
                <RefreshCw size={12} />
                刷新
              </button>
              {confirmClear === "pool" ? (
                <div className="flex gap-1.5 flex-1">
                  <button onClick={() => { clearPool(); reload(); setConfirmClear(null); }}
                    className="flex-1 py-2.5 rounded-xl text-[10px] font-bold"
                    style={{ background: "rgba(239,68,68,0.15)", color: R, border: `1px solid ${R}44` }}>
                    确认清空
                  </button>
                  <button onClick={() => setConfirmClear(null)}
                    className="flex-1 py-2.5 rounded-xl text-[10px] font-bold"
                    style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
                    取消
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmClear("pool")}
                  className="flex-1 py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5"
                  style={{ background: "rgba(239,68,68,0.06)", color: R, border: `1px solid ${R}33` }}>
                  <Trash2 size={12} />
                  清空候选池
                </button>
              )}
            </div>
          )}

          {/* 说明 */}
          <div className="p-3 rounded-xl"
            style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.12)" }}>
            <p className="text-[9px] leading-[1.75]" style={{ color: DIM }}>
              <span className="font-bold" style={{ color: B }}>💡 候选观察池说明：</span>
              每次扫描完成后，达标股票自动保存到此处。同一只股票（tsCode）只保留最新一次扫描结果。
              点击「查看回测详情」可跳转到单只股票回测页，使用缓存结果无需重新运行回测。
              数据保存在设备 localStorage 中，App 重启后仍可访问。
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════ 历史记录 Tab ══════════════════ */}
      {tab === "history" && (
        <div className="space-y-3">

          {/* 统计摘要 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <Clock size={14} color={B} />, label: "扫描批次", value: `${history.length} 次` },
              { icon: <TrendingUp size={14} color={G} />, label: "累计达标", value: `${historyPassed} 只`, c: G },
              { icon: <BarChart3 size={14} color={MID} />, label: "最多保留", value: "10 次" },
            ].map(({ icon, label, value, c }) => (
              <div key={label} className="p-2.5 rounded-xl text-center"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="flex justify-center mb-1">{icon}</div>
                <p className="font-black text-[13px]" style={{ color: (c as string | undefined) ?? MID }}>{value}</p>
                <p className="text-[9px]" style={{ color: DIM }}>{label}</p>
              </div>
            ))}
          </div>

          {/* 空状态 */}
          {history.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="flex justify-center">
                <Clock size={40} color={BORDER} />
              </div>
              <p className="font-bold text-[14px]" style={{ color: MID }}>暂无扫描历史记录</p>
              <p className="text-[11px]" style={{ color: DIM }}>
                每次运行 ST 自动扫描后，结果将自动保存在此处（最多保留 10 次）
              </p>
            </div>
          ) : (
            <>
              {/* 历史记录列表 */}
              <div className="space-y-2">
                {history.map(record => (
                  <HistoryCard
                    key={record.scanId}
                    record={record}
                    onDelete={() => { deleteScanRecord(record.scanId); reload(); }}
                    onViewStock={entry => onViewDetail(entry)}
                  />
                ))}
              </div>

              {/* 清空历史 */}
              <div className="flex gap-2">
                <button onClick={reload}
                  className="flex-1 py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5"
                  style={{ background: CARD, color: MID, border: `1px solid ${BORDER}` }}>
                  <RefreshCw size={12} />
                  刷新
                </button>
                {confirmClear === "history" ? (
                  <div className="flex gap-1.5 flex-1">
                    <button onClick={() => { clearHistory(); reload(); setConfirmClear(null); }}
                      className="flex-1 py-2.5 rounded-xl text-[10px] font-bold"
                      style={{ background: "rgba(239,68,68,0.15)", color: R, border: `1px solid ${R}44` }}>
                      确认清空
                    </button>
                    <button onClick={() => setConfirmClear(null)}
                      className="flex-1 py-2.5 rounded-xl text-[10px] font-bold"
                      style={{ background: "#0a1628", color: MID, border: `1px solid ${BORDER}` }}>
                      取消
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmClear("history")}
                    className="flex-1 py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5"
                    style={{ background: "rgba(239,68,68,0.06)", color: R, border: `1px solid ${R}33` }}>
                    <Trash2 size={12} />
                    清空历史
                  </button>
                )}
              </div>
            </>
          )}

          {/* 说明 */}
          <div className="p-3 rounded-xl"
            style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.12)" }}>
            <p className="text-[9px] leading-[1.75]" style={{ color: DIM }}>
              <span className="font-bold" style={{ color: B }}>💡 历史记录说明：</span>
              每次完整扫描（不论是否中途停止）均保存一条记录，保留最近 10 次。
              达标股票同步合并到候选池，同一只股票取最新一次结果。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
