"use client";

/**
 * app/strategies/trend-correction-mini-reversal/ErrorBoundary.tsx
 *
 * 局部错误兜底 — 捕获子组件的 React 渲染错误，避免整页崩溃。
 * 类组件是 React Error Boundary 唯一合法实现方式。
 */

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children:  ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error:    string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      error:    err instanceof Error ? err.message : String(err),
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: "" });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="p-5 rounded-2xl my-4 text-center"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          <AlertTriangle size={28} color="#ef4444" className="mx-auto mb-3" />
          <p className="text-[14px] font-bold mb-1" style={{ color: "#f87171" }}>
            内容加载出错
          </p>
          <p className="text-[12px] mb-3" style={{ color: "#94a3b8" }}>
            页面内容渲染失败，请点击重试或返回重进
          </p>
          {this.state.error && (
            <p
              className="text-[10px] font-mono mb-3 px-3 py-1.5 rounded-lg"
              style={{ color: "#475569", background: "rgba(0,0,0,0.2)" }}
            >
              {this.state.error.slice(0, 200)}
            </p>
          )}
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold mx-auto"
            style={{ background: "#00E5A8", color: "#07111F" }}
          >
            <RotateCcw size={13} />
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
