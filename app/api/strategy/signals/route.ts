import { NextResponse } from "next/server";
import { runAShareMultiFactorStrategy } from "@/lib/strategyService";

// Cache the strategy computation for 30 minutes via Next.js ISR
export const revalidate = 1800;

export async function GET() {
  try {
    const result = await runAShareMultiFactorStrategy();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "策略计算失败", detail: String(e) },
      { status: 500 }
    );
  }
}
