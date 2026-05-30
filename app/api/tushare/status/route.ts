/**
 * GET /api/tushare/status
 * 检查 Tushare Token 配置状态，尝试轻量 ping（trade_cal）。
 * 不暴露 token 内容，只返回状态。
 */
import { NextResponse } from "next/server";
import { hasTushareToken, getTradeCal, todayStr, daysAgoStr } from "@/lib/tushareService";

export const dynamic = "force-dynamic";

export async function GET() {
  const tokenConfigured = hasTushareToken();
  const now = new Date().toISOString();

  if (!tokenConfigured) {
    return NextResponse.json({
      ok:              false,
      tokenConfigured: false,
      connected:       false,
      error:           "TUSHARE_TOKEN 未配置",
      message:         "请在 Vercel 环境变量中配置 TUSHARE_TOKEN",
      checkedAt:       now,
    });
  }

  // 轻量 ping：获取近7天交易日历（成本极低）
  const pingResult = await getTradeCal(daysAgoStr(7), todayStr());

  if (!pingResult.ok) {
    return NextResponse.json({
      ok:              false,
      tokenConfigured: true,
      connected:       false,
      error:           pingResult.error,
      tokenMissing:    pingResult.tokenMissing,
      permissionDenied: "permissionDenied" in pingResult ? pingResult.permissionDenied : false,
      checkedAt:       now,
    });
  }

  const tradeDays = pingResult.records.map(r => r.cal_date);

  return NextResponse.json({
    ok:              true,
    tokenConfigured: true,
    connected:       true,
    message:         "Tushare 连接正常",
    recentTradeDays: tradeDays.slice(-3),
    checkedAt:       now,
  });
}
