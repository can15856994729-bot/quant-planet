import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/components/layout/BottomNav";

export const metadata: Metadata = {
  title: "量化星球 QuantPlanet",
  description: "量化策略研究 · 模拟交易 · 风险监控 · 信号提醒",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" style={{ background: "#07111F" }}>
      <body className="pb-safe">
        <main>{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
