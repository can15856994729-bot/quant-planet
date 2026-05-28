"use client";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface Props {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

export default function PageHeader({ title, showBack = true, right }: Props) {
  const router = useRouter();
  return (
    <div
      className="sticky top-0 z-40 flex items-center gap-3 px-4 py-4"
      style={{ background: "rgba(7,17,31,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1a2f50" }}
    >
      {showBack && (
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center active:opacity-60">
          <ChevronLeft size={22} color="#94A3B8" />
        </button>
      )}
      <h1 className="flex-1 font-bold text-[16px]" style={{ color: "#F8FAFC" }}>{title}</h1>
      {right && <div>{right}</div>}
    </div>
  );
}
