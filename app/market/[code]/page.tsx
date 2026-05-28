import { notFound } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_INDICES } from "@/lib/mock-data";
import MarketDetailClient from "./MarketDetailClient";

export function generateStaticParams() {
  return MOCK_INDICES.map((idx) => ({ code: idx.code }));
}

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const index = MOCK_INDICES.find((i) => i.code === code);
  if (!index) notFound();

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title={index.name} />
      <MarketDetailClient code={code} initialIndex={index} />
    </div>
  );
}
