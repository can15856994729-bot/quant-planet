"use client";
/**
 * components/ui/ToastContainer.tsx — 全局 Toast 渲染容器
 *
 * 监听 window 自定义事件 "qp:toast"，弹出通知条。
 * 已挂载在 app/layout.tsx，无需重复引入。
 */
import { useEffect, useState, useCallback } from "react";
import type { ToastPayload } from "@/lib/toast";

const TYPE_CONFIG = {
  info:    { bg: "rgba(59,130,246,0.92)",  border: "rgba(59,130,246,0.5)",  icon: "ℹ️" },
  success: { bg: "rgba(0,229,168,0.92)",   border: "rgba(0,229,168,0.5)",   icon: "✅" },
  warn:    { bg: "rgba(250,204,21,0.92)",  border: "rgba(250,204,21,0.5)",  icon: "⚠️" },
  error:   { bg: "rgba(239,68,68,0.92)",   border: "rgba(239,68,68,0.5)",   icon: "❌" },
};

interface ActiveToast extends ToastPayload {
  exiting: boolean;
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const dismiss = useCallback((id: number) => {
    // 先标记 exiting 动画，再移除
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 320);
  }, []);

  useEffect(() => {
    function onToast(e: Event) {
      const payload = (e as CustomEvent<ToastPayload>).detail;
      const active: ActiveToast = { ...payload, exiting: false };
      setToasts((prev) => [...prev.slice(-4), active]); // 最多 5 条
      setTimeout(() => dismiss(payload.id), payload.duration);
    }
    window.addEventListener("qp:toast", onToast);
    return () => window.removeEventListener("qp:toast", onToast);
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 16px)",
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "16px 16px 0",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const cfg = TYPE_CONFIG[t.type];
        return (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              pointerEvents: "auto",
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: 14,
              padding: "10px 16px",
              maxWidth: 360,
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 8,
              backdropFilter: "blur(12px)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
              opacity: t.exiting ? 0 : 1,
              transform: t.exiting ? "translateY(-8px) scale(0.96)" : "translateY(0) scale(1)",
              transition: "opacity 0.28s ease, transform 0.28s ease",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{cfg.icon}</span>
            <span style={{ color: "#F8FAFC", fontSize: 13, fontWeight: 600, lineHeight: 1.45, flex: 1 }}>
              {t.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
