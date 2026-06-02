"use client";
/**
 * app/tushare/page.tsx
 *
 * Tushare 数据中心 — 权限检测与 API 状态查看页
 * 路由：/tushare
 *
 * 功能：
 *  - 显示 Token 是否配置、积分级别（5000分标识）
 *  - 显示所有接口可用状态（基础 + VIP）
 *  - 缓存统计、扫描支持说明
 *  - 一键刷新（调用 ?refresh=1 清除服务端缓存）
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Database, RefreshCw, CheckCircle, XCircle, AlertCircle,
  ChevronLeft, Zap, TrendingUp, Shield, BarChart2,
} from "lucide-react";
import {
  getTusharePermissionStatus,
  clearPermissionCache,
  capBadge,
  type TusharePermissionStatus,
} from "@/lib/tusharePermissionService";
import { getCacheStats, clearAllTushareCache } from "@/lib/tushareCacheService";
import { toast } from "@/lib/toast";

// ── 颜色常量 ─────────────────────────────────────────────────────────────
const C = {
  bg:       "#07111F",
  card:     "#0d1f3c",
  border:   "#1a2f50",
  primary:  "#00E5A8",
  text:     "#F8FAFC",
  muted:    "#94A3B8",
  green:    "#22C55E",
  yellow:   "#EAB308",
  red:      "#EF4444",
  blue:     "#3B82F6",
  vip:      "#A855F7",
};

// ── 状态图标 ──────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status?: string }) {
  if (status === "ok")                return <CheckCircle size={14} color={C.green} />;
  if (status === "empty")             return <AlertCircle size={14} color={C.yellow} />;
  if (status === "permission_denied") return <XCircle    size={14} color={C.red} />;
  return                                     <XCircle    size={14} color={C.red} />;
}

// ── 积分徽章 ──────────────────────────────────────────────────────────────
function PointsBadge({ points }: { points: number }) {
  const color = points >= 5000 ? C.vip : points >= 2000 ? C.primary : points >= 200 ? C.blue : C.muted;
  const label = points >= 5000 ? "5000积分 VIP" : points >= 2000 ? `${points}积分+` : points >= 200 ? `${points}积分+` : "未知积分";
  return (
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {label}
    </span>
  );
}

// ── 接口行 ────────────────────────────────────────────────────────────────
function CapRow({ name, displayName, status, rowCount, isVip }: {
  name: string; displayName: string;
  status?: string; rowCount?: number; isVip?: boolean;
}) {
  const badgeColor = isVip ? C.vip : C.muted;
  return (
    <div
      className="flex items-center justify-between py-2 px-3"
      style={{ borderBottom: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={status} />
        <span className="text-[12px]" style={{ color: C.text }}>{displayName}</span>
        {isVip && (
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${C.vip}22`, color: C.vip }}>
            VIP
          </span>
        )}
      </div>
      <span className="text-[10px]" style={{ color: badgeColor }}>
        {capBadge({ status: status as never, rowCount })}
      </span>
    </div>
  );
}

export default function TusharePage() {
  const router = useRouter();
  const [status, setStatus]   = useState<TusharePermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cacheStats, setCacheStats] = useState<ReturnType<typeof getCacheStats> | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      if (forceRefresh) clearPermissionCache();
      const data = await getTusharePermissionStatus(forceRefresh);
      setStatus(data);
      setCacheStats(getCacheStats());
    } catch (e) {
      toast(`加载失败：${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleClearCache() {
    clearAllTushareCache();
    clearPermissionCache();
    setCacheStats(getCacheStats());
    toast("Tushare 缓存已全部清除", "success");
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh" }}>
        <Header onBack={() => router.back()} onRefresh={() => {}} refreshing={false} />
        <div className="flex flex-col items-center justify-center pt-32 gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
               style={{ borderColor: C.primary, borderTopColor: "transparent" }} />
          <p className="text-[13px]" style={{ color: C.muted }}>正在检测 Tushare 权限…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 80 }}>
      <Header
        onBack={() => router.back()}
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      <div className="px-4 pt-4 space-y-4">
        {/* ── 连接状态卡片 ───────────────────────────────────────── */}
        <div className="rounded-2xl p-4 space-y-3"
             style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={18} color={C.primary} />
              <span className="font-bold text-[14px]" style={{ color: C.text }}>Tushare 数据中心</span>
            </div>
            {status && <PointsBadge points={status.estimatedPoints} />}
          </div>

          <div className="flex items-center gap-2">
            {status?.connected
              ? <CheckCircle size={14} color={C.green} />
              : <XCircle    size={14} color={C.red} />
            }
            <span className="text-[12px]" style={{ color: C.muted }}>
              {status?.message ?? "检测中…"}
            </span>
          </div>

          {status?.pointsConfidence && (
            <div className="text-[11px] px-2 py-1 rounded" style={{ background: "#0a1628", color: C.muted }}>
              积分推断依据：{status.pointsConfidence}
            </div>
          )}

          {status?.checkedAt && (
            <div className="text-[10px]" style={{ color: "#1a2f50" }}>
              检测时间：{new Date(status.checkedAt).toLocaleString("zh-CN")}
            </div>
          )}
        </div>

        {/* ── 功能概览 ──────────────────────────────────────────── */}
        {status?.featureSummary && (
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <div className="px-4 py-2" style={{ background: "#0a1628" }}>
              <p className="text-[11px] font-bold" style={{ color: C.muted }}>功能概览</p>
            </div>
            {Object.entries(status.featureSummary).map(([key, value]) => (
              <div
                key={key}
                className="flex items-start gap-2 px-4 py-2.5"
                style={{ background: C.card, borderBottom: `1px solid ${C.border}` }}
              >
                <span className="text-[12px]" style={{ color: C.text }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── 基础接口状态 ──────────────────────────────────────── */}
        {status?.capabilities && (
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <div className="px-4 py-2 flex items-center gap-2" style={{ background: "#0a1628" }}>
              <BarChart2 size={12} color={C.muted} />
              <p className="text-[11px] font-bold" style={{ color: C.muted }}>基础接口状态</p>
            </div>
            {Object.entries(status.capabilities).map(([name, cap]) => (
              <CapRow
                key={name}
                name={name}
                displayName={API_DISPLAY_NAMES[name] ?? name}
                status={cap.status}
                rowCount={cap.rowCount}
              />
            ))}
          </div>
        )}

        {/* ── VIP 接口状态 ──────────────────────────────────────── */}
        {status?.vipCapabilities && (
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.vip}44` }}>
            <div className="px-4 py-2 flex items-center gap-2" style={{ background: "#1a0a2f" }}>
              <Zap size={12} color={C.vip} />
              <p className="text-[11px] font-bold" style={{ color: C.vip }}>VIP 接口（5000积分特权）</p>
            </div>
            {Object.entries(status.vipCapabilities).map(([name, cap]) => (
              <CapRow
                key={name}
                name={name}
                displayName={API_DISPLAY_NAMES[name] ?? name}
                status={cap.status}
                rowCount={cap.rowCount}
                isVip
              />
            ))}
          </div>
        )}

        {/* ── 扫描支持 ──────────────────────────────────────────── */}
        {status?.scanSupport && (
          <div className="rounded-2xl p-4 space-y-2"
               style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2">
              <TrendingUp size={14} color={C.primary} />
              <span className="text-[12px] font-bold" style={{ color: C.text }}>全市场扫描支持</span>
            </div>
            <InfoRow label="支持状态"   value={status.scanSupport.fullMarketScan ? "✅ 可用" : "❌ 不可用"} />
            <InfoRow label="股票总量"   value={status.scanSupport.stockCount} />
            <InfoRow label="推荐批次"   value={`${status.scanSupport.recommendedBatch} 只/批`} />
            <InfoRow label="批次间隔"   value={`${status.scanSupport.recommendedDelay}ms`} />
            <InfoRow label="预筛支持"   value={status.scanSupport.preFilterSupport ? "✅ 已开启" : "❌ 不可用"} />
            {status.scanSupport.preFilterDesc && (
              <div className="text-[11px] px-2 py-1.5 rounded" style={{ background: "#0a1628", color: C.muted }}>
                {status.scanSupport.preFilterDesc}
              </div>
            )}
          </div>
        )}

        {/* ── 频次限制 ──────────────────────────────────────────── */}
        {status?.frequency && (
          <div className="rounded-2xl p-4 space-y-2"
               style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2">
              <Shield size={14} color={C.muted} />
              <span className="text-[12px] font-bold" style={{ color: C.text }}>频次限制</span>
            </div>
            <InfoRow label="每分钟上限" value={`${status.frequency.perMinuteLimit} 次`} />
            <InfoRow label="每日上限"   value={`${status.frequency.dailyLimit} 次`} />
            <div className="text-[11px]" style={{ color: C.muted }}>{status.frequency.note}</div>
          </div>
        )}

        {/* ── 本地缓存统计 ──────────────────────────────────────── */}
        {cacheStats && (
          <div className="rounded-2xl p-4 space-y-2"
               style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={14} color={C.muted} />
                <span className="text-[12px] font-bold" style={{ color: C.text }}>本地缓存统计</span>
              </div>
              <button
                onClick={handleClearCache}
                className="text-[11px] px-2 py-1 rounded-lg"
                style={{ background: "#1a0a0a", color: C.red, border: `1px solid ${C.red}44` }}
              >
                清除缓存
              </button>
            </div>
            <InfoRow label="Tushare 缓存条目" value={`${cacheStats.tushareKeys} 项`} />
            <InfoRow label="daily_basic 缓存天数" value={`${cacheStats.dailyBasicDays} 天`} />
            <InfoRow label="财务数据缓存条目"  value={`${cacheStats.financialItems} 项`} />
            {cacheStats.stockBasicAge !== null && (
              <InfoRow
                label="股票基础列表缓存"
                value={`${Math.round(cacheStats.stockBasicAge / 60000)} 分钟前`}
              />
            )}
          </div>
        )}

        {/* ── 提示 ─────────────────────────────────────────────── */}
        {status?.hint && (
          <div className="text-[11px] px-3 py-2 rounded-xl" style={{ background: "#0a1a0a", color: C.green, border: `1px solid ${C.green}44` }}>
            💡 {status.hint}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 子组件 ────────────────────────────────────────────────────────────────
function Header({ onBack, onRefresh, refreshing }: {
  onBack: () => void; onRefresh: () => void; refreshing: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-4"
      style={{ background: C.card, borderBottom: `1px solid ${C.border}` }}
    >
      <button onClick={onBack} className="flex items-center gap-1">
        <ChevronLeft size={20} color={C.primary} />
        <span className="text-[13px] font-semibold" style={{ color: C.primary }}>返回</span>
      </button>
      <span className="font-bold text-[14px]" style={{ color: C.text }}>Tushare 数据中心</span>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-1 px-2 py-1 rounded-lg"
        style={{ background: "#0a1628", border: `1px solid ${C.border}`, opacity: refreshing ? 0.5 : 1 }}
      >
        <RefreshCw size={13} color={C.primary} className={refreshing ? "animate-spin" : ""} />
        <span className="text-[11px]" style={{ color: C.primary }}>
          {refreshing ? "检测中…" : "刷新"}
        </span>
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px]" style={{ color: "#94A3B8" }}>{label}</span>
      <span className="text-[11px]" style={{ color: "#F8FAFC" }}>{value}</span>
    </div>
  );
}

// ── 接口中文名映射 ────────────────────────────────────────────────────────
const API_DISPLAY_NAMES: Record<string, string> = {
  stock_basic:          "股票基础信息 (stock_basic)",
  daily:                "历史K线 (daily)",
  daily_basic:          "估值/成交 (daily_basic)",
  index_daily:          "指数日线 (index_daily)",
  trade_cal:            "交易日历 (trade_cal)",
  income:               "利润表 (income)",
  balancesheet:         "资产负债表 (balancesheet)",
  cashflow:             "现金流量表 (cashflow)",
  fina_indicator:       "财务指标 (fina_indicator)",
  forecast:             "业绩预告 (forecast)",
  fina_div:             "分红数据 (fina_div)",
  income_vip:           "利润表VIP (income_vip)",
  balancesheet_vip:     "资产负债表VIP (balancesheet_vip)",
  cashflow_vip:         "现金流量表VIP (cashflow_vip)",
  fina_indicator_vip:   "财务指标VIP (fina_indicator_vip)",
};
