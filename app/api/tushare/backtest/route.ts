/**
 * POST /api/tushare/backtest
 *
 * 运行 A股多因子策略回测（服务端，Tushare 历史数据）。
 *
 * Body (JSON):
 *   poolMode         "full_market"（默认）| "large_cap"
 *   onePerIndustry   boolean（默认 true）
 *   startDate        YYYYMMDD
 *   endDate          YYYYMMDD
 *   initialCapital   起始资金（默认 100000）
 *   commissionRate   手续费率（默认 0.0003）
 *   maxPositions     最大持仓只数（默认 10）
 *   rebalanceFreq    "weekly" | "monthly"（默认 "weekly"）
 *   maxSingleWeight  单股最大仓位（默认 0.20）
 *   stopLossRate     止损比例（默认 0.08，0 = 不止损）
 *   takeProfitRate   止盈比例（默认 0.30，0 = 不止盈）
 *   scoreThreshold   最低买入评分（默认 65）
 */
import { NextRequest, NextResponse } from "next/server";
import { runBacktest }               from "@/lib/backtestService";
import type { PoolStats }            from "@/lib/backtestService";
import { LARGE_CAP_POOL }            from "@/lib/strategyService";
import {
  hasTushareToken,
  symbolToTsCode,
  getAStockBasic,
  daysAgoStr,
} from "@/lib/tushareService";
import type { TushareRecord } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

// ── 全市场股票池采样策略 ─────────────────────────────────────────────
// 每行业取最早上市的 1 只股票，上限 100 个行业（最多 100 只）
const MAX_INDUSTRIES = 100;

function buildFullMarketPool(all: TushareRecord[]): {
  tsCodes:    string[];
  names:      Record<string, string>;
  industries: Record<string, string>;
  poolStats:  PoolStats;
} {
  const totalListed = all.length;

  // 过滤：排除 ST/*ST/退市整理，排除上市不足 120 天
  const cutoff = daysAgoStr(120);
  const filtered = all.filter((s) => {
    const name     = String(s.name      ?? "");
    const listDate = String(s.list_date ?? "19000101");
    if (name.includes("ST") || name.includes("退")) return false;
    if (listDate > cutoff)                           return false;
    return true;
  });
  const afterFilter = filtered.length;

  // 按 list_date 升序排序（最早上市在前 → 历史数据最长）
  const sorted = [...filtered].sort((a, b) =>
    String(a.list_date ?? "").localeCompare(String(b.list_date ?? ""))
  );

  // 每行业取最早上市的 1 只
  const byIndustry = new Map<string, TushareRecord>();
  for (const s of sorted) {
    const ind = (String(s.industry ?? "").trim()) || "其他";
    if (!byIndustry.has(ind)) byIndustry.set(ind, s);
    if (byIndustry.size >= MAX_INDUSTRIES) break;
  }

  const pool   = [...byIndustry.values()];
  const tsCodes:    string[]                 = [];
  const names:      Record<string, string>   = {};
  const industries: Record<string, string>   = {};

  for (const s of pool) {
    const tc  = String(s.ts_code ?? "");
    const ind = (String(s.industry ?? "").trim()) || "其他";
    if (!tc) continue;
    tsCodes.push(tc);
    names[tc]      = String(s.name ?? tc);
    industries[tc] = ind;
  }

  const poolStats: PoolStats = {
    poolMode:          "full_market",
    totalListed,
    afterFilter,
    inPool:            tsCodes.length,
    industriesCovered: byIndustry.size,
    onePerIndustry:    true,
  };

  return { tsCodes, names, industries, poolStats };
}

// ── Route handler ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      {
        ok:           false,
        error:        "Tushare Token 未配置，无法运行真实回测",
        tokenMissing: true,
        hint:         "请在 Vercel 环境变量中配置 TUSHARE_TOKEN",
      },
      { status: 200 },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  // ── 解析通用参数 ───────────────────────────────────────────────────
  const poolMode      = String(body.poolMode ?? "full_market") === "large_cap" ? "large_cap" : "full_market";
  const onePerIndustry = body.onePerIndustry === false ? false : true;  // 默认 true

  const startDate  = String(body.startDate      ?? "20230101");
  const endDate    = String(body.endDate        ?? "20251231");

  const initialCapital  = Math.max(10000,  Number(body.initialCapital  ?? 100000));
  const commissionRate  = Math.min(0.01,   Math.max(0.0001, Number(body.commissionRate  ?? 0.0003)));
  const stampDutyRate   = 0.001;    // 固定印花税，不可调
  const slippageRate    = 0.0005;   // 固定滑点

  const maxPositions    = Math.min(20,  Math.max(1,    Number(body.maxPositions    ?? 10)));
  const rebalanceFreq   = String(body.rebalanceFreq ?? "weekly") === "monthly" ? "monthly" : "weekly" as const;
  const maxSingleWeight = Math.min(1,   Math.max(0.05, Number(body.maxSingleWeight ?? 0.20)));
  const stopLossRate    = Math.min(0.5, Math.max(0,    Number(body.stopLossRate    ?? 0.08)));
  const takeProfitRate  = Math.min(1,   Math.max(0,    Number(body.takeProfitRate  ?? 0.30)));
  const scoreThreshold  = Math.min(90,  Math.max(50,   Number(body.scoreThreshold  ?? 65)));

  // ── 构建股票池 ────────────────────────────────────────────────────
  let tsCodes:    string[];
  let names:      Record<string, string>;
  let industries: Record<string, string>;
  let poolStats:  PoolStats;

  if (poolMode === "full_market") {
    // 从 Tushare stock_basic 动态构建全市场代表性样本（缓存 24h）
    const basicResult = await getAStockBasic("L");
    if (!basicResult.ok) {
      return NextResponse.json(
        { ok: false, error: `获取 A 股股票池失败：${basicResult.error}` },
        { status: 200 },
      );
    }
    ({ tsCodes, names, industries, poolStats } = buildFullMarketPool(basicResult.records));

    if (tsCodes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "全市场股票池为空，请检查 Tushare stock_basic 权限" },
        { status: 200 },
      );
    }
  } else {
    // 大盘龙头 20 只（LARGE_CAP_POOL）
    tsCodes    = LARGE_CAP_POOL.map((s) => symbolToTsCode(s.symbol));
    names      = {};
    industries = {};
    for (const s of LARGE_CAP_POOL) {
      const tc = symbolToTsCode(s.symbol);
      names[tc]      = s.name;
      industries[tc] = s.industry;
    }
    poolStats = {
      poolMode:          "large_cap",
      totalListed:       LARGE_CAP_POOL.length,
      afterFilter:       LARGE_CAP_POOL.length,
      inPool:            LARGE_CAP_POOL.length,
      industriesCovered: new Set(LARGE_CAP_POOL.map((s) => s.industry)).size,
      onePerIndustry:    false,
    };
  }

  // ── 运行回测 ──────────────────────────────────────────────────────
  const result = await runBacktest({
    tsCodes,
    names,
    industries,
    startDate,
    endDate,
    initialCapital,
    commissionRate,
    stampDutyRate,
    slippageRate,
    maxPositions,
    rebalanceFreq,
    maxSingleWeight,
    stopLossRate,
    takeProfitRate,
    scoreThreshold,
    onePerIndustry: poolMode === "full_market" ? onePerIndustry : false,
    poolStats,
  });

  return NextResponse.json(result);
}
