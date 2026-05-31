"use client";

/**
 * FinancialReport — A股财报分析模块
 *
 * 功能：
 *  - 从 /api/tushare/financial-report 获取财报数据
 *  - 6 个分析维度（Tab）+ 风险提示区
 *  - 综合财务评分（0-100）
 *  - 各接口独立降级：权限不足 / 暂无数据 / 网络错误
 *  - 支持手动刷新
 *
 * 安全：TUSHARE_TOKEN 仅在服务端使用，此组件只调用本应用的 API Route
 *
 * Props:
 *   tsCode    — Tushare 股票代码，如 "600519.SH"
 *   stockName — 股票名称（用于展示）
 */

import { useState, useEffect, useCallback } from "react";
import FinancialScore from "./FinancialScore";
import {
  RevenueProfit, RoeMarginsLine, CashFlowBar, DebtRatioLine,
  type RevProfitPoint, type MarginPoint, type CashFlowPoint, type DebtRatioPoint,
} from "./FinancialCharts";

// ── 响应类型（与 API route 对应）────────────────────────────────────
type SubStatus = "ok" | "permission_denied" | "error" | "empty";

interface RawRecord {
  [key: string]: string | number | null;
}

interface ScoreBreakdown {
  total:         number;
  profitability: number;
  growth:        number;
  cashFlow:      number;
  safety:        number;
  valuation:     number;
  label:         string;
}

interface FinancialData {
  tsCode:          string;
  income:          RawRecord[];
  balanceSheet:    RawRecord[];
  cashFlow:        RawRecord[];
  finaIndicator:   RawRecord[];
  latestValuation: RawRecord | null;
  score:           ScoreBreakdown | null;
  permissions:     Record<string, SubStatus>;
  riskWarnings:    string[];
  updatedAt:       string;
}

// ── 辅助函数 ─────────────────────────────────────────────────────────
function n(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
}

function fmtMoney(v: number | null): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} 万亿`;
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(0)} 万`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtPct(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return `${v.toFixed(decimals)}%`;
}

function fmtRatio(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(2)}x`;
}

function fmtNum(v: number | null, decimals = 2): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

/** YYYYMMDD → 简短期间标签 */
function periodLabel(endDate: string): string {
  if (!endDate || endDate.length < 8) return endDate;
  const yy = endDate.slice(2, 4);
  const mm = endDate.slice(4, 6);
  if (mm === "03") return `${yy}Q1`;
  if (mm === "06") return `${yy}半`;
  if (mm === "09") return `${yy}Q3`;
  if (mm === "12") return `${yy}年`;
  return endDate.slice(2);
}

/** YYYYMMDD → 显示用完整期间标签 */
function periodLabelFull(endDate: string): string {
  if (!endDate || endDate.length < 8) return endDate;
  const year = endDate.slice(0, 4);
  const mm   = endDate.slice(4, 6);
  if (mm === "03") return `${year}年一季报`;
  if (mm === "06") return `${year}年半年报`;
  if (mm === "09") return `${year}年三季报`;
  if (mm === "12") return `${year}年年报`;
  return endDate;
}

// ── Tab 定义 ─────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",      label: "概览"   },
  { id: "profitability", label: "盈利能力" },
  { id: "valuation",     label: "估值数据" },
  { id: "safety",        label: "财务安全" },
  { id: "cashflow",      label: "现金流"  },
  { id: "growth",        label: "成长趋势" },
] as const;

type TabId = typeof TABS[number]["id"];

// ── 主组件 ────────────────────────────────────────────────────────────
export default function FinancialReport({
  tsCode,
  stockName,
}: {
  tsCode:    string;
  stockName: string;
}) {
  const [data,       setData]       = useState<FinancialData | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [permDenied, setPermDenied] = useState(false);
  const [activeTab,  setActiveTab]  = useState<TabId>("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPermDenied(false);
    try {
      const res = await fetch(`/api/tushare/financial-report?tsCode=${encodeURIComponent(tsCode)}`);
      const json = await res.json();
      if (!json.ok) {
        const allPermDenied = json.permissions && Object.values(json.permissions as Record<string, SubStatus>).every(
          v => v === "permission_denied" || v === "empty"
        );
        setPermDenied(allPermDenied || false);
        setError(json.error ?? "获取财报数据失败");
        setData(null);
        return;
      }
      setData(json as FinancialData);
    } catch (e) {
      setError(`网络请求失败：${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [tsCode, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 渲染：加载中 ─────────────────────────────────────────────────
  if (loading) {
    return (
      <section>
        <SectionHeader stockName={stockName} onRefresh={() => setRefreshKey(k => k + 1)} loading />
        <div className="space-y-3 mt-3">
          {[120, 80, 80].map((h, i) => (
            <div key={i} className="rounded-2xl animate-pulse"
              style={{ background: "#0d1f3c", border: "1px solid #1a2f50", height: h }} />
          ))}
        </div>
      </section>
    );
  }

  // ── 渲染：权限不足 ───────────────────────────────────────────────
  if (permDenied) {
    return (
      <section>
        <SectionHeader stockName={stockName} onRefresh={() => setRefreshKey(k => k + 1)} />
        <div className="p-4 rounded-2xl mt-3 text-center"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <p className="text-2xl mb-2">🔒</p>
          <p className="text-[13px] font-bold mb-1" style={{ color: "#F8FAFC" }}>财报数据权限不足</p>
          <p className="text-[11px] leading-relaxed" style={{ color: "#64748B" }}>
            Tushare 财报接口（income / balancesheet / fina_indicator）需要相应积分权限。
            <br />请升级 Tushare 套餐后点击刷新。
          </p>
        </div>
      </section>
    );
  }

  // ── 渲染：其他错误 ───────────────────────────────────────────────
  if (error && !data) {
    return (
      <section>
        <SectionHeader stockName={stockName} onRefresh={() => setRefreshKey(k => k + 1)} />
        <div className="p-4 rounded-2xl mt-3 text-center"
          style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-[12px]" style={{ color: "#EF4444" }}>⚠️ {error}</p>
        </div>
      </section>
    );
  }

  if (!data) return null;

  // ── 数据预处理 ────────────────────────────────────────────────────
  const in0 = data.income[0];
  const fi0 = data.finaIndicator[0];
  const cf0 = data.cashFlow[0];
  const bs0 = data.balanceSheet[0];
  const val = data.latestValuation;
  const perm = data.permissions;

  // Chart data (ascending, last 8 periods)
  const incomeAsc  = [...data.income].reverse().slice(-8);
  const fiAsc      = [...data.finaIndicator].reverse().slice(-8);
  const cfAsc      = [...data.cashFlow].reverse().slice(-8);

  const revProfitData: RevProfitPoint[] = incomeAsc.map(r => ({
    period:  periodLabel(String(r.end_date ?? "")),
    revenue: n(r.total_revenue),
    profit:  n(r.n_income_attr_p),
  }));

  const marginData: MarginPoint[] = fiAsc.map(r => ({
    period: periodLabel(String(r.end_date ?? "")),
    roe:    n(r.roe),
    gm:     n(r.grossprofit_margin),
    nm:     n(r.netprofit_margin),
  }));

  const cashFlowData: CashFlowPoint[] = cfAsc.map(r => ({
    period: periodLabel(String(r.end_date ?? "")),
    ocf:    n(r.n_cashflow_act),
    icf:    n(r.n_cashflow_inv_act),
    fcf:    n(r.n_cash_flows_fnc_act),
  }));

  // For debt/ratio charts, merge balanceSheet + finaIndicator by end_date
  const debtData: DebtRatioPoint[] = (() => {
    const fiMap = new Map<string, RawRecord>();
    for (const r of data.finaIndicator) { fiMap.set(String(r.end_date ?? ""), r); }
    const bsAsc = [...data.balanceSheet].reverse().slice(-8);
    return bsAsc.map(r => {
      const ed = String(r.end_date ?? "");
      const fi = fiMap.get(ed);
      const dr = n(fi?.debt_to_assets) ?? (() => {
        const liab   = n(r.total_liab);
        const assets = n(r.total_assets);
        return (liab != null && assets != null && assets > 0) ? liab / assets * 100 : null;
      })();
      return {
        period:       periodLabel(ed),
        debtRatio:    dr,
        currentRatio: n(fi?.current_ratio),
      };
    });
  })();

  const latestPeriod = in0 ? periodLabelFull(String(in0.end_date ?? "")) : "—";

  // ── Tab 内容渲染 ──────────────────────────────────────────────────
  function renderTab(): React.ReactNode {
    switch (activeTab) {
      // ── 概览 Tab ────────────────────────────────────────────────
      case "overview": {
        const metrics: Array<{ label: string; value: string; color?: string }> = [
          {
            label: "营业总收入",
            value: fmtMoney(n(in0?.total_revenue)),
          },
          {
            label: "归母净利润",
            value: fmtMoney(n(in0?.n_income_attr_p)),
            color: (() => {
              const v = n(in0?.n_income_attr_p);
              return v == null ? undefined : v < 0 ? "#EF4444" : v > 0 ? "#00E5A8" : undefined;
            })(),
          },
          {
            label: "总资产",
            value: fmtMoney(n(bs0?.total_assets)),
          },
          {
            label: "归母净资产",
            value: fmtMoney(n(bs0?.total_hldr_eqy_exc_min_int)),
          },
          {
            label: "货币资金",
            value: fmtMoney(n(bs0?.money_cap)),
          },
          {
            label: "经营现金流",
            value: fmtMoney(n(cf0?.n_cashflow_act)),
            color: (() => {
              const v = n(cf0?.n_cashflow_act);
              return v == null ? undefined : v < 0 ? "#EF4444" : "#00E5A8";
            })(),
          },
        ];
        return (
          <div className="space-y-3">
            {/* Latest period label */}
            {in0 && (
              <p className="text-[10px]" style={{ color: "#64748B" }}>
                最新报告期：{latestPeriod}
              </p>
            )}
            {/* Key metrics grid */}
            <div className="grid grid-cols-3 gap-2">
              {metrics.map(({ label, value, color }) => (
                <div key={label} className="p-3 rounded-xl text-center"
                  style={{ background: "#0a1930", border: "1px solid #1a2f50" }}>
                  <p className="font-bold text-[12px] num" style={{ color: color ?? "#F8FAFC" }}>
                    {value}
                  </p>
                  <p className="text-[9px] mt-0.5" style={{ color: "#64748B" }}>{label}</p>
                </div>
              ))}
            </div>
            {/* EPS + BPS */}
            {fi0 && (
              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="每股收益(EPS)" value={`¥${fmtNum(n(fi0.eps))}`} />
                <MetricCard label="每股净资产(BPS)" value={`¥${fmtNum(n(fi0.bps))}`} />
              </div>
            )}
            {/* Permission notices */}
            <PermNotices perm={perm} />
          </div>
        );
      }

      // ── 盈利能力 Tab ─────────────────────────────────────────────
      case "profitability": {
        const fiPerms = perm.finaIndicator;
        if (fiPerms === "permission_denied") return <PermDeniedCard name="财务指标(fina_indicator)" />;
        return (
          <div className="space-y-3">
            {fi0 && (
              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  label="净资产收益率 ROE"
                  value={fmtPct(n(fi0.roe))}
                  valueColor={(() => { const v = n(fi0.roe); return v == null ? undefined : v >= 15 ? "#00E5A8" : v >= 8 ? "#FACC15" : "#EF4444"; })()}
                  note="行业优质 >15%"
                />
                <MetricCard
                  label="毛利率"
                  value={fmtPct(n(fi0.grossprofit_margin))}
                  valueColor={(() => { const v = n(fi0.grossprofit_margin); return v == null ? undefined : v >= 40 ? "#00E5A8" : v >= 20 ? "#FACC15" : "#94A3B8"; })()}
                  note="高毛利 >40%"
                />
                <MetricCard
                  label="净利率"
                  value={fmtPct(n(fi0.netprofit_margin))}
                  valueColor={(() => { const v = n(fi0.netprofit_margin); return v == null ? undefined : v >= 20 ? "#00E5A8" : v >= 8 ? "#FACC15" : "#94A3B8"; })()}
                  note="优质 >20%"
                />
                <MetricCard
                  label="资产周转率"
                  value={fmtRatio(n(fi0.assets_turn))}
                  note="越高越好"
                />
              </div>
            )}
            {in0 && (
              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="营业利润" value={fmtMoney(n(in0.operate_profit))} />
                <MetricCard label="研发费用" value={in0.rd_exp != null ? fmtMoney(n(in0.rd_exp)) : "暂缺"} />
              </div>
            )}
            <RoeMarginsLine data={marginData} />
          </div>
        );
      }

      // ── 估值数据 Tab ─────────────────────────────────────────────
      case "valuation": {
        const vPerms = perm.valuation;
        if (vPerms === "permission_denied") return <PermDeniedCard name="每日指标(daily_basic)" />;
        if (!val) return <EmptyCard label="暂无最新估值数据（可能非交易日或数据延迟）" />;
        const pe  = n(val.pe_ttm);
        const pb  = n(val.pb);
        const ps  = n(val.ps_ttm);
        const mv  = n(val.total_mv);
        const cmv = n(val.circ_mv);
        const tor = n(val.turnover_rate);
        const metrics = [
          {
            label: "市盈率 PE(TTM)",
            value: pe != null && pe > 0 ? pe.toFixed(1) + "x" : pe != null && pe < 0 ? "亏损" : "—",
            color: pe != null && pe > 0 ? (pe <= 25 ? "#00E5A8" : pe <= 50 ? "#FACC15" : "#EF4444") : undefined,
            note:  "合理区间 10-25x",
          },
          {
            label: "市净率 PB",
            value: pb != null ? pb.toFixed(2) + "x" : "—",
            color: pb != null ? (pb <= 2 ? "#00E5A8" : pb <= 5 ? "#FACC15" : "#EF4444") : undefined,
            note:  "低估 <1x",
          },
          {
            label: "市销率 PS(TTM)",
            value: ps != null ? ps.toFixed(2) + "x" : "—",
            note:  "参考",
          },
          {
            label: "总市值",
            value: fmtMoney(mv != null ? mv * 1e4 : null),
            note:  "人民币",
          },
          {
            label: "流通市值",
            value: fmtMoney(cmv != null ? cmv * 1e4 : null),
            note:  "万元→换算",
          },
          {
            label: "换手率",
            value: tor != null ? `${tor.toFixed(2)}%` : "—",
            note:  "日",
          },
        ];
        return (
          <div className="grid grid-cols-2 gap-2">
            {metrics.map(({ label, value, color, note }) => (
              <MetricCard key={label} label={label} value={value} valueColor={color} note={note} />
            ))}
          </div>
        );
      }

      // ── 财务安全 Tab ─────────────────────────────────────────────
      case "safety": {
        const fiPerms = perm.finaIndicator;
        if (fiPerms === "permission_denied") return <PermDeniedCard name="财务指标(fina_indicator)" />;
        const dr  = n(fi0?.debt_to_assets);
        const cr  = n(fi0?.current_ratio);
        const qr  = n(fi0?.quick_ratio);
        const ta  = n(bs0?.total_assets);
        const tl  = n(bs0?.total_liab);
        const ne  = n(bs0?.total_hldr_eqy_exc_min_int);
        const mc  = n(bs0?.money_cap);
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="资产负债率"
                value={fmtPct(dr)}
                valueColor={dr == null ? undefined : dr < 40 ? "#00E5A8" : dr < 65 ? "#FACC15" : "#EF4444"}
                note="安全 <40%"
              />
              <MetricCard
                label="流动比率"
                value={fmtRatio(cr)}
                valueColor={cr == null ? undefined : cr >= 2 ? "#00E5A8" : cr >= 1 ? "#FACC15" : "#EF4444"}
                note="健康 ≥2x"
              />
              <MetricCard
                label="速动比率"
                value={fmtRatio(qr)}
                valueColor={qr == null ? undefined : qr >= 1 ? "#00E5A8" : qr >= 0.5 ? "#FACC15" : "#EF4444"}
                note="安全 ≥1x"
              />
              <MetricCard label="货币资金" value={fmtMoney(mc)} />
            </div>
            {(ta != null || tl != null || ne != null) && (
              <div className="grid grid-cols-3 gap-2">
                <MetricCard label="总资产" value={fmtMoney(ta)} />
                <MetricCard label="总负债" value={fmtMoney(tl)} />
                <MetricCard label="净资产" value={fmtMoney(ne)} />
              </div>
            )}
            <DebtRatioLine data={debtData} />
          </div>
        );
      }

      // ── 现金流 Tab ───────────────────────────────────────────────
      case "cashflow": {
        if (perm.cashFlow === "permission_denied") return <PermDeniedCard name="现金流量表(cashflow)" />;
        const ocf = n(cf0?.n_cashflow_act);
        const icf = n(cf0?.n_cashflow_inv_act);
        const ffcf = n(cf0?.n_cash_flows_fnc_act);
        const np  = n(in0?.n_income_attr_p);
        const ocfRatio = (ocf != null && np != null && np > 0) ? ocf / np : null;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="经营活动现金流"
                value={fmtMoney(ocf)}
                valueColor={ocf == null ? undefined : ocf >= 0 ? "#00E5A8" : "#EF4444"}
              />
              <MetricCard
                label="投资活动现金流"
                value={fmtMoney(icf)}
                valueColor={icf == null ? undefined : icf >= 0 ? "#00E5A8" : "#EF4444"}
              />
              <MetricCard
                label="筹资活动现金流"
                value={fmtMoney(ffcf)}
                valueColor={ffcf == null ? undefined : ffcf >= 0 ? "#00E5A8" : "#EF4444"}
              />
              <MetricCard
                label="现金流/净利润"
                value={ocfRatio != null ? ocfRatio.toFixed(2) + "x" : "—"}
                valueColor={ocfRatio == null ? undefined : ocfRatio >= 1 ? "#00E5A8" : ocfRatio >= 0.5 ? "#FACC15" : "#EF4444"}
                note="优质 ≥1x"
              />
            </div>
            <CashFlowBar data={cashFlowData} />
            <div className="p-3 rounded-xl text-[10px] leading-relaxed"
              style={{ background: "rgba(0,229,168,0.04)", border: "1px solid rgba(0,229,168,0.1)", color: "#64748B" }}>
              💡 现金流/净利润 ≥1 说明盈利质量高；{"<"}1 可能存在应收账款垫资风险；{"<"}0 需重点关注。
            </div>
          </div>
        );
      }

      // ── 成长趋势 Tab ──────────────────────────────────────────────
      case "growth": {
        // YoY for latest period (compare to ~4 periods ago for annual basis)
        const in4  = data?.income[4] ?? data?.income[data.income.length - 1] ?? null;
        const rev0 = n(in0?.total_revenue);
        const rev4 = n(in4?.total_revenue);
        const pr0  = n(in0?.n_income_attr_p);
        const pr4  = n(in4?.n_income_attr_p);
        const revYoY  = (rev0 != null && rev4 != null && rev4 !== 0) ? (rev0 - rev4) / Math.abs(rev4) * 100 : null;
        const profYoY = (pr0  != null && pr4  != null && pr4  !== 0) ? (pr0  - pr4)  / Math.abs(pr4)  * 100 : null;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="营收同比增速"
                value={revYoY != null ? `${revYoY >= 0 ? "+" : ""}${revYoY.toFixed(1)}%` : "—"}
                valueColor={revYoY == null ? undefined : revYoY >= 10 ? "#00E5A8" : revYoY >= 0 ? "#FACC15" : "#EF4444"}
                note={in4 ? `vs ${periodLabelFull(String(in4.end_date ?? ""))}` : ""}
              />
              <MetricCard
                label="净利润同比增速"
                value={profYoY != null ? `${profYoY >= 0 ? "+" : ""}${profYoY.toFixed(1)}%` : "—"}
                valueColor={profYoY == null ? undefined : profYoY >= 10 ? "#00E5A8" : profYoY >= 0 ? "#FACC15" : "#EF4444"}
                note={in4 ? `vs ${periodLabelFull(String(in4.end_date ?? ""))}` : ""}
              />
            </div>
            <RevenueProfit data={revProfitData} />
            {marginData.length > 0 && <RoeMarginsLine data={marginData} />}
          </div>
        );
      }
    }
  }

  // ── 最终渲染 ─────────────────────────────────────────────────────
  const updatedAt = data.updatedAt
    ? new Date(data.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <section>
      <SectionHeader stockName={stockName} onRefresh={() => setRefreshKey(k => k + 1)} />

      {/* 综合评分 */}
      {data.score && (
        <div className="p-4 rounded-2xl mt-3" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <p className="text-[11px] mb-3 font-semibold" style={{ color: "#94A3B8" }}>综合财务评分</p>
          <FinancialScore
            score={data.score.total}
            label={data.score.label}
            breakdown={{
              profitability: data.score.profitability,
              growth:        data.score.growth,
              cashFlow:      data.score.cashFlow,
              safety:        data.score.safety,
              valuation:     data.score.valuation,
            }}
            size="md"
          />
          <p className="text-[9px] mt-2 text-right" style={{ color: "#475569" }}>
            评分仅供参考 · 更新：{updatedAt}
          </p>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
            style={{
              background: activeTab === tab.id ? "rgba(0,229,168,0.12)" : "#0d1f3c",
              color:      activeTab === tab.id ? "#00E5A8" : "#94A3B8",
              border:     `1px solid ${activeTab === tab.id ? "#00E5A8" : "#1a2f50"}`,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="mt-3">
        {renderTab()}
      </div>

      {/* 风险提示（始终显示在底部） */}
      {data.riskWarnings.length > 0 && (
        <div className="mt-4 p-3 rounded-xl space-y-1.5"
          style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)" }}>
          <p className="text-[11px] font-bold mb-2" style={{ color: "#EF4444" }}>⚠️ 风险提示</p>
          {data.riskWarnings.map((w, i) => (
            <p key={i} className="text-[10px] leading-relaxed" style={{ color: "#94A3B8" }}>{w}</p>
          ))}
          <p className="text-[9px] mt-2" style={{ color: "#475569" }}>
            以上提示基于最新财报数据自动生成，仅供参考，不构成投资建议。
          </p>
        </div>
      )}
    </section>
  );
}

// ── 子组件：Section Header ────────────────────────────────────────────
function SectionHeader({
  stockName,
  onRefresh,
  loading,
}: {
  stockName: string;
  onRefresh: () => void;
  loading?:  boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-bold text-[13px]" style={{ color: "#94A3B8" }}>
        📊 {stockName} 财报分析
      </h2>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold active:opacity-70"
        style={{
          background: "rgba(59,130,246,0.1)",
          color:      "#3B82F6",
          border:     "1px solid rgba(59,130,246,0.2)",
          opacity:    loading ? 0.5 : 1,
        }}
      >
        {loading ? "⏳" : "🔄"} 刷新
      </button>
    </div>
  );
}

// ── 子组件：单指标卡 ─────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  valueColor,
  note,
}: {
  label:       string;
  value:       string;
  valueColor?: string;
  note?:       string;
}) {
  return (
    <div className="p-3 rounded-xl"
      style={{ background: "#0a1930", border: "1px solid #1a2f50" }}>
      <p className="font-bold text-[12px] num" style={{ color: valueColor ?? "#F8FAFC" }}>
        {value}
      </p>
      <p className="text-[9px] mt-0.5" style={{ color: "#64748B" }}>{label}</p>
      {note && <p className="text-[9px]" style={{ color: "#475569" }}>{note}</p>}
    </div>
  );
}

// ── 子组件：权限不足卡 ───────────────────────────────────────────────
function PermDeniedCard({ name }: { name: string }) {
  return (
    <div className="p-4 rounded-xl text-center"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <p className="text-xl mb-1">🔒</p>
      <p className="text-[11px] font-bold" style={{ color: "#94A3B8" }}>{name} 权限不足</p>
      <p className="text-[10px] mt-1" style={{ color: "#64748B" }}>升级 Tushare 积分后可查看</p>
    </div>
  );
}

// ── 子组件：空数据卡 ─────────────────────────────────────────────────
function EmptyCard({ label }: { label: string }) {
  return (
    <div className="p-4 rounded-xl text-center"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
      <p className="text-[11px]" style={{ color: "#64748B" }}>{label}</p>
    </div>
  );
}

// ── 子组件：权限提示组（多接口） ─────────────────────────────────────
function PermNotices({ perm }: { perm: Record<string, SubStatus> }) {
  const denied = Object.entries(perm)
    .filter(([, v]) => v === "permission_denied")
    .map(([k]) => {
      const NAMES: Record<string, string> = {
        income:        "利润表",
        balanceSheet:  "资产负债表",
        cashFlow:      "现金流量表",
        finaIndicator: "财务指标",
        valuation:     "估值数据",
      };
      return NAMES[k] ?? k;
    });

  if (!denied.length) return null;

  return (
    <div className="p-3 rounded-xl"
      style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
      <p className="text-[10px] leading-relaxed" style={{ color: "#FBBF24" }}>
        🔒 以下接口权限不足，对应数据显示为"—"：{denied.join("、")}
      </p>
    </div>
  );
}
