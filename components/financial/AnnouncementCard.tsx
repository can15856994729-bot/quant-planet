"use client";

/**
 * components/financial/AnnouncementCard.tsx
 *
 * 公告/事件卡片（Stub 版本）
 *
 * 当前版本：公告数据暂未接入，显示占位提示。
 * 后续接入后替换 fetchData 逻辑即可，UI 骨架已就位。
 */

import { Bell, Info } from "lucide-react";

interface Props {
  symbol:    string;
  stockName: string;
}

export default function AnnouncementCard({ symbol, stockName }: Props) {
  return (
    <div
      className="p-4 rounded-2xl"
      style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-3">
        <Bell size={14} color="#94A3B8" />
        <h3 className="font-bold text-[13px]" style={{ color: "#94A3B8" }}>
          重要公告 &amp; 事件
        </h3>
      </div>

      {/* 占位内容 */}
      <div
        className="flex items-center gap-2 p-3 rounded-xl"
        style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.1)" }}
      >
        <Info size={14} color="#475569" className="flex-shrink-0" />
        <div>
          <p className="text-[12px]" style={{ color: "#64748B" }}>
            公告数据暂未接入
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "#334155" }}>
            业绩预告、摘帽公告、重组公告等将在后续版本中提供
          </p>
        </div>
      </div>
    </div>
  );
}
