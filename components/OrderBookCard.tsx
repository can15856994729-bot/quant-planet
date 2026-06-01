"use client";

/**
 * OrderBookCard — 个股五档盘口展示卡片
 *
 * 功能：
 *  - 卖五→卖一 / 买一→买五 五档委托价量
 *  - 最新价居中，带涨跌幅和委比柱
 *  - 委比、量比、内盘、外盘
 *  - 涨停/跌停/停牌状态徽章
 *  - 涨停封单/跌停封单金额
 *  - 5 s 自动刷新 + 手动刷新
 *  - 错误时显示"盘口数据暂不可用"，不显示假数据
 *
 * Props：
 *  - symbol: A 股六位代码（如 "600519"）
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertCircle, BookOpen } from "lucide-react";
import type { OrderBookData, OrderBookLevel } from "@/types";

// ── 格式化工具 ────────────────────────────────────────────────────
/** 成交量：股→手，并格式化 */
function fmtHands(shares: number | null): string {
  if (shares == null) return "--";
  const hands = shares / 100;
  if (hands >= 10000) return `${(hands / 10000).toFixed(1)}万手`;
  if (hands >= 1000)  return `${Math.round(hands / 100) / 10}千手`;
  return `${Math.round(hands)}手`;
}

/** 金额：元，格式化为万/亿 */
function fmtAmount(yuan: number | null): string {
  if (yuan == null) return "--";
  const abs  = Math.abs(yuan);
  const sign = yuan < 0 ? "-" : "";
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(0)}万`;
  return `${sign}${abs.toFixed(0)}元`;
}

function fmtPct(v: number | null, digits = 2): string {
  if (v == null) return "--";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function fmtPrice(v: number | null): string {
  if (v == null || v <= 0) return "--";
  return v.toFixed(2);
}

function upColor(v: number | null, neutral = "#94A3B8"): string {
  if (v == null) return neutral;
  if (v > 0) return "#EF4444";
  if (v < 0) return "#22C55E";
  return neutral;
}

// ── 封单格式化 ────────────────────────────────────────────────────
function fmtSeal(vol: number | null, amt: number | null): string {
  if (!vol && !amt) return "--";
  const parts: string[] = [];
  if (vol != null) parts.push(`${Math.round(vol)}手`);
  if (amt != null) parts.push(fmtAmount(amt));
  return parts.join(" / ");
}

// ── 单档行 ────────────────────────────────────────────────────────
function BookRow({
  level,
  isBid,
  barPct,
  price,
  volume,
  tag,
}: {
  level: OrderBookLevel | null;
  isBid: boolean;
  barPct: number;   // 0-100
  price?: number;   // 基准价（判断上涨/下跌颜色）
  volume?: number;  // 成交量颜色参考（未用）
  tag?: string;     // 封单标签
}) {
  if (!level) {
    return (
      <div className="flex items-center h-7 px-3 gap-2">
        <span className="w-6 text-[10px] text-right" style={{ color: "#374151" }}>
          {isBid ? `买${[1,2,3,4,5].find((_, i) => i + 1 === (level as unknown as number)) ?? ""}` : ""}
        </span>
        <span className="flex-1 text-[11px] text-center" style={{ color: "#374151" }}>--</span>
        <span className="text-[11px]" style={{ color: "#374151" }}>--</span>
      </div>
    );
  }

  const priceColor = isBid ? "#EF4444" : "#22C55E";
  const barColor   = isBid
    ? "rgba(239,68,68,0.55)"
    : "rgba(34,197,94,0.45)";

  return (
    <div className="flex items-center h-7 px-3 gap-1.5 relative overflow-hidden">
      {/* 进度条背景（buy=右侧扩展，ask=左侧扩展） */}
      <div
        className="absolute inset-y-0 rounded-sm"
        style={{
          width: `${barPct}%`,
          background: barColor,
          right: isBid ? 0 : undefined,
          left:  isBid ? undefined : 0,
          opacity: 0.45,
        }}
      />
      {/* 档位标签 */}
      <span className="relative z-10 w-6 text-[10px] text-right flex-shrink-0"
        style={{ color: "#64748B" }}>
        {isBid ? `买${level.level}` : `卖${level.level}`}
      </span>
      {/* 价格 */}
      <span className="relative z-10 flex-1 text-[12px] font-semibold num"
        style={{ color: priceColor }}>
        {fmtPrice(level.price)}
      </span>
      {/* 量 */}
      <span className="relative z-10 text-[11px] num text-right"
        style={{ color: "#94A3B8", minWidth: "52px" }}>
        {fmtHands(level.volume)}
      </span>
      {/* 封单标签 */}
      {tag && (
        <span className="relative z-10 text-[9px] px-1 py-0.5 rounded ml-1"
          style={{ background: isBid ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.18)", color: isBid ? "#EF4444" : "#22C55E", flexShrink: 0 }}>
          {tag}
        </span>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────
interface Props {
  symbol:      string;
  initialData?: OrderBookData | null;
}

export default function OrderBookCard({ symbol, initialData }: Props) {
  const [data,    setData]    = useState<OrderBookData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/quotes/order-book/${symbol}`);
      const json = await res.json();
      if (!mountedRef.current) return;
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        setError(json.message ?? "盘口数据暂不可用");
      }
    } catch {
      if (mountedRef.current) setError("网络错误，无法获取盘口数据");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [symbol]);

  // 首次 + tick 变化时加载
  useEffect(() => { load(); }, [load, tick]);

  // 5 s 自动刷新
  useEffect(() => {
    const t = setInterval(() => setTick(k => k + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  // ── 计算进度条最大值 ──────────────────────────────────────────
  const maxVol = data
    ? Math.max(
        ...data.bids.map(l => l.volume),
        ...data.asks.map(l => l.volume),
        1,
      )
    : 1;

  function barPct(level: OrderBookLevel | null): number {
    if (!level) return 0;
    return Math.min(100, (level.volume / maxVol) * 100);
  }

  // ── 快捷档位（level 1-5） ────────────────────────────────────
  function bidAt(n: number) { return data?.bids.find(l => l.level === n) ?? null; }
  function askAt(n: number) { return data?.asks.find(l => l.level === n) ?? null; }

  const ACCENT = "#00E5A8";

  // ── 委比颜色 ──────────────────────────────────────────────────
  const commColor = upColor(data?.commissionRatio ?? null);

  // ── 封单标签 ──────────────────────────────────────────────────
  const bid1 = bidAt(1);
  const ask1 = askAt(1);
  const bid1Tag = data?.isLimitUp  && data?.limitUpSealVolume   ? "封单" : undefined;
  const ask1Tag = data?.isLimitDown && data?.limitDownSealVolume ? "封单" : undefined;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>

      {/* ── 标题栏 ── */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5"
        style={{ borderBottom: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-2">
          <BookOpen size={14} color={ACCENT} />
          <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>盘口</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,229,168,0.1)", color: ACCENT }}>
            东方财富
          </span>
          {/* 状态徽章 */}
          {data?.isSuspended && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(148,163,184,0.15)", color: "#94A3B8" }}>停牌</span>
          )}
          {data?.isOneWordLimitUp && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(239,68,68,0.2)", color: "#EF4444" }}>一字涨停</span>
          )}
          {data?.isLimitUp && !data.isOneWordLimitUp && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(239,68,68,0.2)", color: "#EF4444" }}>涨停</span>
          )}
          {data?.isOneWordLimitDown && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(34,197,94,0.2)", color: "#22C55E" }}>一字跌停</span>
          )}
          {data?.isLimitDown && !data.isOneWordLimitDown && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(34,197,94,0.2)", color: "#22C55E" }}>跌停</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data?.updatedAt && (
            <span className="text-[9px]" style={{ color: "#374151" }}>
              {new Date(data.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button onClick={() => setTick(k => k + 1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center active:opacity-60"
            style={{ background: "#162a45" }}>
            <RefreshCw size={12} color="#64748B" className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── 加载态 ── */}
      {loading && !data && (
        <div className="py-6 text-center">
          <RefreshCw size={16} color="#64748B" className="animate-spin mx-auto mb-2" />
          <p className="text-[11px]" style={{ color: "#64748B" }}>加载盘口数据…</p>
        </div>
      )}

      {/* ── 错误态 ── */}
      {!loading && error && !data && (
        <div className="px-4 py-5 flex items-start gap-2">
          <AlertCircle size={14} color="#64748B" className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold" style={{ color: "#64748B" }}>盘口数据暂不可用</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#4B5563" }}>等待数据源恢复，请稍后重试</p>
          </div>
        </div>
      )}

      {/* ── 盘口主体 ── */}
      {data && (
        <div className="py-1">
          {/* 卖盘 ask5→ask1（反序显示，ask5 在顶部） */}
          {[5, 4, 3, 2, 1].map(n => (
            <BookRow key={`a${n}`}
              level={askAt(n)}
              isBid={false}
              barPct={barPct(askAt(n))}
              tag={n === 1 ? ask1Tag : undefined}
            />
          ))}

          {/* 价格中轴 */}
          <div className="flex items-center justify-between px-3 py-2 my-0.5"
            style={{ background: "#0a1628", borderTop: "1px solid #1a2f50", borderBottom: "1px solid #1a2f50" }}>
            <div className="flex items-center gap-2">
              <span className="font-black text-[18px] num"
                style={{ color: upColor(data.changePercent) }}>
                {fmtPrice(data.price)}
              </span>
              <span className="text-[11px] font-semibold num"
                style={{ color: upColor(data.changePercent) }}>
                {fmtPct(data.changePercent)}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[10px] num" style={{ color: "#94A3B8" }}>
                昨收 {fmtPrice(data.prevClose)}
              </p>
              <p className="text-[10px] num" style={{ color: "#64748B" }}>
                今开 {fmtPrice(data.open)}
              </p>
            </div>
          </div>

          {/* 买盘 bid1→bid5 */}
          {[1, 2, 3, 4, 5].map(n => (
            <BookRow key={`b${n}`}
              level={bidAt(n)}
              isBid={true}
              barPct={barPct(bidAt(n))}
              tag={n === 1 ? bid1Tag : undefined}
            />
          ))}
        </div>
      )}

      {/* ── 指标行：委比 | 量比 | 内盘 | 外盘 ── */}
      {data && (
        <div className="grid grid-cols-4 gap-0 px-3 py-3"
          style={{ borderTop: "1px solid #1a2f50" }}>
          {[
            {
              label: "委比",
              value: data.commissionRatio != null ? fmtPct(data.commissionRatio, 1) : "--",
              color: commColor,
            },
            {
              label: "量比",
              value: data.volumeRatio != null ? data.volumeRatio.toFixed(2) : "--",
              color: (data.volumeRatio ?? 0) > 2 ? "#EF4444" : "#F8FAFC",
            },
            {
              label: "外盘",
              value: data.outerVolume != null ? `${Math.round(data.outerVolume)}手` : "--",
              color: "#EF4444",
            },
            {
              label: "内盘",
              value: data.innerVolume != null ? `${Math.round(data.innerVolume)}手` : "--",
              color: "#22C55E",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="font-bold text-[12px] num" style={{ color }}>{value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 涨跌停价 & 封单信息 ── */}
      {data && (data.limitUpPrice || data.limitDownPrice || data.limitUpSealAmount || data.limitDownSealAmount) && (
        <div className="px-3 pb-3 space-y-1.5"
          style={{ borderTop: "1px solid #1a2f50", paddingTop: "10px" }}>
          {data.limitUpPrice != null && (
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "#64748B" }}>涨停价</span>
              <span className="font-semibold text-[11px] num" style={{ color: "#EF4444" }}>
                ¥{fmtPrice(data.limitUpPrice)}
                {data.limitUpSealAmount != null && (
                  <span className="ml-1.5 font-normal" style={{ color: "#EF4444" }}>
                    封 {fmtSeal(data.limitUpSealVolume, data.limitUpSealAmount)}
                  </span>
                )}
              </span>
            </div>
          )}
          {data.limitDownPrice != null && (
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "#64748B" }}>跌停价</span>
              <span className="font-semibold text-[11px] num" style={{ color: "#22C55E" }}>
                ¥{fmtPrice(data.limitDownPrice)}
                {data.limitDownSealAmount != null && (
                  <span className="ml-1.5 font-normal" style={{ color: "#22C55E" }}>
                    封 {fmtSeal(data.limitDownSealVolume, data.limitDownSealAmount)}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── 数据来源 & 说明 ── */}
      {data && (
        <div className="px-3 pb-2.5">
          <p className="text-[9px]" style={{ color: "#374151" }}>
            数据来源：{data.source} · 5s 自动刷新 · 仅供参考，不构成投资建议
          </p>
        </div>
      )}
    </div>
  );
}
