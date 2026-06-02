"use client";

/**
 * components/layout/AppPage.tsx
 *
 * 全局页面容器 — 统一处理安全区适配
 *
 * 解决问题：
 *   在 Capacitor Android/iOS App 中，viewportFit=cover 使 WebView 延伸到
 *   状态栏下方。所有页面必须自己处理 safe-area-inset-top，否则顶部内容被遮挡。
 *
 * 使用方式：
 *
 *   import AppPage from "@/components/layout/AppPage";
 *
 *   // 有自定义顶栏（返回按钮 + 标题）
 *   <AppPage header={<MyHeader />}>
 *     {children}
 *   </AppPage>
 *
 *   // 有 PageHeader 组件（PageHeader 内部已处理 safe-area，无需本组件）
 *   <PageHeader title="..." />
 *   <div>...</div>
 *
 *   // 全屏页面（无顶栏）
 *   <AppPage>
 *     {children}
 *   </AppPage>
 *
 * CSS 类说明（定义在 globals.css）：
 *   .page-top-pt   → padding-top: calc(env(safe-area-inset-top, 0px) + 12px)
 *   .header-safe-pt → padding-top: calc(env(safe-area-inset-top, 0px) + 16px) !important
 *   .safe-page      → 顶部 + 底部安全区
 *   .pb-safe        → 底部 BottomNav 预留空间（body 已全局应用）
 */

interface AppPageProps {
  children:   React.ReactNode;
  /** 顶部自定义 header（通常包含返回按钮 + 标题） */
  header?:    React.ReactNode;
  /** 额外 CSS 类 */
  className?: string;
  /** 背景色，默认 #07111F */
  bg?:        string;
}

/**
 * AppPageHeader — 自定义顶栏容器
 *
 * 自动应用 page-top-pt (safe-area + 12px)。
 * 用于所有不使用 PageHeader 组件的自定义顶栏。
 *
 * 使用：
 *   <AppPageHeader>
 *     <button>返回</button>
 *     <h1>标题</h1>
 *   </AppPageHeader>
 */
export function AppPageHeader({
  children,
  className = "",
  sticky    = true,
  border    = true,
}: {
  children:   React.ReactNode;
  className?: string;
  sticky?:    boolean;
  border?:    boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 page-top-pt pb-3 ${className}`}
      style={{
        background:    "rgba(7,17,31,0.97)",
        backdropFilter:"blur(12px)",
        borderBottom:  border ? "1px solid #1a2f50" : undefined,
        position:      sticky ? "sticky" : undefined,
        top:           sticky ? 0 : undefined,
        zIndex:        sticky ? 40 : undefined,
      }}
    >
      {children}
    </div>
  );
}

/**
 * AppPage — 主页面容器
 *
 * 自动处理背景色。
 * 底部安全区已由 body.pb-safe 统一处理，无需重复。
 */
export default function AppPage({ children, header, className = "", bg = "#07111F" }: AppPageProps) {
  return (
    <div style={{ background: bg, minHeight: "100vh" }} className={className}>
      {header}
      {children}
    </div>
  );
}
