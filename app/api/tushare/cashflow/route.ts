/**
 * GET /api/tushare/cashflow?tsCode=xxx[&startDate=YYYYMMDD][&endDate=YYYYMMDD]
 *
 * 获取上市公司现金流量表原始数据（合并报表，合并调整后），按报告期降序返回。
 * 数据来源：Tushare cashflow 接口
 *
 * 字段：三大现金流 + 自由现金流 + 增加额 + 销售/购买 + 分红 + 资本开支
 *
 * 安全约束：TUSHARE_TOKEN 仅在服务端使用。
 * 缓存：服务端 7d 内存缓存 + HTTP Cache-Control 24h
 */
import { NextRequest, NextResponse } from "next/server";
import { getCashflowStatement } from "@/lib/financialService";
import { hasTushareToken, daysAgoStr, todayStr } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasTushareToken()) {
    return NextResponse.json(
      { ok: false, error: "TUSHARE_TOKEN 未配置", records: [] },
      { status: 200 },
    );
  }

  const p = req.nextUrl.searchParams;
  const tsCode    = p.get("tsCode")?.trim() ?? "";
  const startDate = p.get("startDate") ?? daysAgoStr(4 * 365);
  const endDate   = p.get("endDate")   ?? todayStr();

  if (!tsCode) {
    return NextResponse.json(
      { ok: false, error: "缺少必填参数：tsCode，示例：?tsCode=600519.SH", records: [] },
      { status: 400 },
    );
  }

  const res = await getCashflowStatement(tsCode, startDate, endDate);

  if (res.status === "permission_denied") {
    return NextResponse.json({
      ok: false,
      error: "当前 Tushare 权限不足，无法获取现金流量表数据",
      permissionDenied: true,
      records: [],
    });
  }

  if (res.status === "error") {
    return NextResponse.json({
      ok: false,
      error: res.error ?? "现金流数据加载失败，请稍后重试",
      records: [],
    });
  }

  return NextResponse.json(
    { ok: true, tsCode, records: res.records, total: res.records.length },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
