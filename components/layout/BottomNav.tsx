"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Star, TrendingUp, PlayCircle, User } from "lucide-react";

const navItems = [
  { href: "/",            label: "首页",  icon: LayoutDashboard },
  { href: "/watchlist",   label: "自选",  icon: Star },
  { href: "/strategies",  label: "策略",  icon: TrendingUp },
  { href: "/sim-trading", label: "模拟盘",icon: PlayCircle },
  { href: "/profile",     label: "我的",  icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50"
      style={{
        background: "rgba(7,17,31,0.97)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid #1a2f50",
      }}
    >
      <div className="flex">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="relative flex-1 flex flex-col items-center justify-center gap-[3px] py-3 transition-opacity active:opacity-60"
            >
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full"
                  style={{ background: "linear-gradient(90deg,#00E5A8,#3B82F6)" }}
                />
              )}
              <Icon size={20} strokeWidth={active ? 2.2 : 1.6} color={active ? "#00E5A8" : "#4a6080"} />
              <span className="text-[10px] font-semibold" style={{ color: active ? "#00E5A8" : "#4a6080" }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
      <div style={{ height: "env(safe-area-inset-bottom,0px)" }} />
    </nav>
  );
}
