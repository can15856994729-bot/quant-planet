import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/layout/BottomNav";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "量化星球 QuantPlanet",
  description: "量化策略研究 · 模拟交易 · 风险监控 · 信号提醒",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "量化星球",
  },
  formatDetection: { telephone: false },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#00E5A8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" style={{ background: "#07111F" }}>
      <head>
        {/* iOS PWA 图标 */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon.png" />
        {/* iOS 启动画面颜色 */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* 华为/Android */}
        <meta name="msapplication-TileColor" content="#07111F" />
      </head>
      <body className="pb-safe">
        <main>{children}</main>
        <BottomNav />
        <PwaRegister />
      </body>
    </html>
  );
}
