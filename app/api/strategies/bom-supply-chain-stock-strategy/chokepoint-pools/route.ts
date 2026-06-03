/**
 * GET /api/strategies/bom-supply-chain-stock-strategy/chokepoint-pools
 *
 * PCB + CPO 咽喉池总览 — 返回两个池的摘要信息
 */

import { NextResponse } from "next/server";
import { PCB_CHOKEPOINT_STOCKS, PCB_CHOKEPOINT_CORE_POOL, PCB_CHOKEPOINT_GROUPS } from "@/lib/pcbChokepointPoolService";
import { CPO_CHOKEPOINT_STOCKS, CPO_CHOKEPOINT_CORE_POOL, CPO_CHOKEPOINT_GROUPS } from "@/lib/cpoChokepointPoolService";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    pools: [
      {
        id:          "pcb-chokepoint",
        name:        "PCB 咽喉池",
        poolType:    "PCB",
        description: "高速覆铜板、高多层PCB、光模块PCB配套、PCB关键设备耗材",
        totalStocks: PCB_CHOKEPOINT_STOCKS.length,
        coreCount:   PCB_CHOKEPOINT_CORE_POOL.length,
        groups:      PCB_CHOKEPOINT_GROUPS.map(g => ({ key: g.key, name: g.groupName, chokePoint: g.chokePoint })),
        apiPath:     "/api/strategies/bom-supply-chain-stock-strategy/chokepoint-pools/pcb",
      },
      {
        id:          "cpo-chokepoint",
        name:        "CPO 咽喉池",
        poolType:    "CPO",
        description: "光芯片/激光器、硅光/光器件、高速光模块、CPO封装设备、数据中心散热电源",
        totalStocks: CPO_CHOKEPOINT_STOCKS.length,
        coreCount:   CPO_CHOKEPOINT_CORE_POOL.length,
        groups:      CPO_CHOKEPOINT_GROUPS.map(g => ({ key: g.key, name: g.groupName, chokePoint: g.chokePoint })),
        apiPath:     "/api/strategies/bom-supply-chain-stock-strategy/chokepoint-pools/cpo",
      },
    ],
    disclaimer: "产业链分类基于公开信息规则匹配，需人工复核，不代表真实供应商关系，不构成投资建议",
    fetchedAt:  new Date().toISOString(),
  });
}
