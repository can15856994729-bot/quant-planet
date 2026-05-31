/**
 * /sectors/[industry] — 板块详情页（服务端 Shell）
 *
 * 通过 params.industry（URL 编码）确定申万一级行业名称，
 * 渲染客户端组件 SectorDetailClient 完成实时行情展示。
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SW_SECTORS, SECTOR_META } from "@/lib/sectorService";
import SectorDetailClient from "./SectorDetailClient";

export function generateMetadata({ params }: { params: { industry: string } }) {
  const name = decodeURIComponent(params.industry);
  const meta = SECTOR_META[name];
  return {
    title: meta ? `${meta.emoji} ${name} - A股板块 | 量化星球` : `${name} - A股板块 | 量化星球`,
    description: meta?.desc ?? `${name}板块股票列表与实时行情`,
  };
}

export default async function SectorDetailPage({
  params,
}: {
  params: Promise<{ industry: string }>;
}) {
  const { industry } = await params;
  const swIndustry = decodeURIComponent(industry);

  // 验证是否为合法的申万一级行业（包含"未分类"）
  const valid = (SW_SECTORS as readonly string[]).includes(swIndustry) || swIndustry === "未分类";
  if (!valid) notFound();

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      {/* 返回导航 */}
      <div className="px-4 pt-4 pb-0">
        <Link href="/sectors"
          className="inline-flex items-center gap-1 text-[12px] active:opacity-70"
          style={{ color: "#94A3B8" }}>
          <ChevronLeft size={14} />
          返回板块列表
        </Link>
      </div>

      {/* 客户端主体 */}
      <SectorDetailClient swIndustry={swIndustry} />
    </div>
  );
}
