/**
 * GET /api/strategies/bom-supply-chain-stock-strategy/industry?industry=新能源汽车
 *
 * 返回指定行业的 BOM 拆解模板数据。
 * 仅使用内置静态模板，不调用外部 API。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getBomIndustryTemplate,
  getBomIndustryList,
} from "@/lib/bomIndustryTemplateService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const industry = req.nextUrl.searchParams.get("industry") ?? "";

  // 不带参数时返回行业列表
  if (!industry) {
    return NextResponse.json({
      ok:          true,
      industries:  getBomIndustryList(),
      total:       getBomIndustryList().length,
    });
  }

  const template = getBomIndustryTemplate(industry);
  if (!template) {
    return NextResponse.json(
      {
        ok:      false,
        error:   `暂无「${industry}」的 BOM 模板，支持行业：${getBomIndustryList().join("、")}`,
        industries: getBomIndustryList(),
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok:       true,
    industry: template.industry,
    template,
    disclaimer: "BOM 拆解模板基于公开市场研究，典型公司列表仅供参考，非具体供应商关系，需人工复核",
  });
}
