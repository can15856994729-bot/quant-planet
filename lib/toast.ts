/**
 * lib/toast.ts — 全局 Toast 系统（window 自定义事件）
 *
 * 使用：import { toast } from "@/lib/toast";
 *       toast("操作成功");
 *       toast("功能开发中", "info");
 *       toast("数据加载失败", "error");
 *
 * 渲染由 components/ui/ToastContainer 负责（已挂载在 layout.tsx）
 */
export type ToastType = "info" | "success" | "warn" | "error";

export interface ToastPayload {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

let _seq = 0;

/** 显示 Toast。可在任何地方调用，无需 Provider。 */
export function toast(
  message: string,
  type: ToastType = "info",
  duration = 2800,
): void {
  if (typeof window === "undefined") return;
  const payload: ToastPayload = { id: ++_seq, message, type, duration };
  window.dispatchEvent(new CustomEvent("qp:toast", { detail: payload }));
}
