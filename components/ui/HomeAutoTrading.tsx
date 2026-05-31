"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";
import { getAutoTradingConfig, getTodayStats } from "@/lib/autoTradingService";
import type { AutoTradingConfig, DayStats } from "@/lib/autoTradingService";

export default function HomeAutoTrading() {
  const [config, setConfig] = useState<AutoTradingConfig | null>(null);
  const [stats,  setStats]  = useState<DayStats | null>(null);

  useEffect(() => {
    setConfig(getAutoTradingConfig());
    setStats(getTodayStats());
  }, []);

  if (!config) return null;

  return (
    <section className="px-4 mb-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
          <span style={{ color: "#A78BFA", marginRight: 6 }}>▌</span>模拟自动交易
        </h2>
        <Link href="/simulation/auto-trading"
          className="flex items-center gap-0.5 text-[12px]" style={{ color: "#94A3B8" }}>
          设置 <ChevronRight size={13} />
        </Link>
      </div>

      <Link href="/simulation/auto-trading">
        <div className="p-3 rounded-2xl flex items-center gap-3 active:opacity-70"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: config.enabled ? "rgba(0,229,168,0.12)" : "rgba(100,116,139,0.12)" }}>
            <Bot size={20} color={config.enabled ? "#00E5A8" : "#64748B"} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>
                {config.strategyName || "多因子轮动"}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: config.enabled ? "rgba(0,229,168,0.12)" : "rgba(100,116,139,0.12)",
                  color: config.enabled ? "#00E5A8" : "#64748B",
                }}>
                {config.enabled ? "运行中" : "已暂停"}
              </span>
            </div>
            <p className="text-[11px]" style={{ color: "#64748B" }}>
              {stats
                ? `今日执行 ${stats.executedCount} 单 · 信号 ${stats.signalCount} 个`
                : "点击进入设置"}
            </p>
          </div>
          <ChevronRight size={16} color="#64748B" />
        </div>
      </Link>
    </section>
  );
}
