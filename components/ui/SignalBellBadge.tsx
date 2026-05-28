"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { MOCK_SIGNALS } from "@/lib/mock-data";
import { getReadSet } from "@/lib/readSignals";

function calcUnread() {
  const rs = getReadSet();
  return MOCK_SIGNALS.filter((s) => !s.read && !rs.has(s.id)).length;
}

export default function SignalBellBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setUnread(calcUnread());

    // 切换标签/窗口焦点时重算（从信号页返回首页）
    const onFocus = () => setUnread(calcUnread());
    // 其他标签页修改 localStorage 时同步
    const onStorage = (e: StorageEvent) => {
      if (e.key === "qp_read_signals") setUnread(calcUnread());
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <Link href="/signals" className="relative">
      <Bell size={22} color="#94A3B8" />
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
          style={{ background: "#EF4444", color: "#fff" }}
        >
          {unread}
        </span>
      )}
    </Link>
  );
}
