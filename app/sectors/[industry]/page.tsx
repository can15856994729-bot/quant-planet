/**
 * /sectors/[industry] — 板块详情页（服务端 Shell）
 *
 * 支持两种板块类型：
 *  - 申万一级行业：URL 为中文行业名（如"银行"）→ SectorDetailClient
 *  - 东方财富板块：URL 为 BK 代码（如"BK0477"）→ EMSectorDetailClient
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SW_SECTORS, SECTOR_META } from "@/lib/sectorService";
import SectorDetailClient from "./SectorDetailClient";
import EMSectorDetailClient from "./EMSectorDetailClient";

// 判断是否为东方财富板块代码
function isEMCode(s: string): boolean {
  return /^BK\d+$/i.test(s);
}

export function generateMetadata({ params }: { params: { industry: string } }) {
  const raw  = decodeURIComponent(params.industry);
  if (isEMCode(raw)) {
    return {
      title:       `${raw.toUpperCase()} - 东财板块 | 量化星球`,
      description: `${raw.toUpperCase()} 板块成分股实时行情`,
    };
  }
  const meta = SECTOR_META[raw];
  return {
    title:       meta ? `${meta.emoji} ${raw} - A股板块 | 量化星球` : `${raw} - A股板块 | 量化星球`,
    description: meta?.desc ?? `${raw}板块股票列表与实时行情`,
  };
}

export default async function SectorDetailPage({
  params,
}: {
  params: Promise<{ industry: string }>;
}) {
  const { industry } = await params;
  const raw = decodeURIComponent(industry);

  // ── 东方财富板块（BK 代码）────────────────────────────────────────────
  if (isEMCode(raw)) {
    const code = raw.toUpperCase();
    return (
      <div style={{ background: "#07111F", minHeight: "100vh" }}>
        {/* page-top-pt = safe-area-inset-top + 12px，防止被状态栏遮挡 */}
        <div className="px-4 pb-2 page-top-pt">
          <Link href="/sectors"
            className="inline-flex items-center gap-1 text-[12px] active:opacity-70"
            style={{ color: "#94A3B8" }}>
            <ChevronLeft size={14} />
            返回板块列表
          </Link>
        </div>
        <EMSectorDetailClient sectorCode={code} />
      </div>
    );
  }

  // ── 申万一级行业（中文名称）──────────────────────────────────────────
  const swIndustry = raw;
  const valid = (SW_SECTORS as readonly string[]).includes(swIndustry) || swIndustry === "未分类";
  if (!valid) notFound();

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* page-top-pt = safe-area-inset-top + 12px，防止被状态栏遮挡 */}
      <div className="px-4 pb-2 page-top-pt">
        <Link href="/sectors"
          className="inline-flex items-center gap-1 text-[12px] active:opacity-70"
          style={{ color: "#94A3B8" }}>
          <ChevronLeft size={14} />
          返回板块列表
        </Link>
      </div>
      <SectorDetailClient swIndustry={swIndustry} />
    </div>
  );
}
