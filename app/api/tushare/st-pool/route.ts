/**
 * GET /api/tushare/st-pool
 *
 * 返回当前 A 股全市场 ST / *ST 候选股票池。
 * 数据来源：Tushare stock_basic（在市股票基础信息）
 *
 * 过滤步骤（逐步输出数量，便于前端诊断）：
 *   原始 A 股（list_status=L） → ST 名称识别 → 排除退市整理 → 排除新上市
 */
import { NextResponse } from "next/server";
import { getAStockBasic, hasTushareToken, tsCodeToSymbol } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

// ST 名称识别：兼容半角/全角字符，匹配 ST/*ST/SST/S*ST 等所有前缀模式
function detectSTName(name: string): boolean {
  if (!name) return false;
  const n = name
    .trim()
    .replace(/ＳＴ/g, "ST")
    .replace(/＊ＳＴ/g, "*ST")
    .replace(/Ｓ/g, "S")
    .replace(/Ｔ/g, "T")
    .replace(/＊/g, "*");
  return /^(\*|S\*|SS)?ST/i.test(n);
}

function getSTType(name: string): string {
  const n = name
    .trim()
    .replace(/ＳＴ/g, "ST")
    .replace(/＊ＳＴ/g, "*ST")
    .replace(/Ｓ/g, "S")
    .replace(/Ｔ/g, "T")
    .replace(/＊/g, "*");
  if (/^\*ST/i.test(n) || /^S\*ST/i.test(n)) return "*ST";
  if (/^SST/i.test(n)) return "SST";
  return "ST";
}

export async function GET() {
  if (!hasTushareToken()) {
    return NextResponse.json({
      ok: false,
      error: "TUSHARE_TOKEN 未配置，无法获取 ST 股票池",
      stocks: [], totalMarket: 0, stNameCount: 0, afterDelistFilter: 0, stCount: 0,
    });
  }

  const result = await getAStockBasic("L");
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: `stock_basic 接口失败：${result.error}`,
      stocks: [], totalMarket: 0, stNameCount: 0, afterDelistFilter: 0, stCount: 0,
    });
  }

  const totalMarket = result.records.length;

  // 90 天前（YYYYMMDD），排除新上市股票
  const d90 = new Date();
  d90.setDate(d90.getDate() - 90);
  const cutoff90 = d90.toISOString().slice(0, 10).replace(/-/g, "");

  const step1 = result.records.filter((s) => detectSTName(String(s.name ?? "")));
  const step2 = step1.filter((s) => !String(s.name ?? "").includes("退"));
  const step3 = step2.filter((s) => String(s.list_date ?? "19000101") <= cutoff90);

  const stocks = step3.map((s) => {
    const name   = String(s.name   ?? "");
    const tsCode = String(s.ts_code ?? "");
    return {
      tsCode,
      symbol:   tsCodeToSymbol(tsCode),
      name,
      industry: String(s.industry ?? ""),
      stType:   getSTType(name),
      listDate: String(s.list_date ?? ""),
      exchange: String(s.exchange  ?? ""),
    };
  });

  return NextResponse.json({
    ok: true,
    stocks,
    totalMarket,
    stNameCount:       step1.length,
    afterDelistFilter: step2.length,
    stCount:           stocks.length,
    note:
      `A股全市场：${totalMarket} → ` +
      `ST识别：${step1.length} → ` +
      `排除退市整理：${step2.length} → ` +
      `排除新上市：${stocks.length} 只（最终候选）`,
  });
}
