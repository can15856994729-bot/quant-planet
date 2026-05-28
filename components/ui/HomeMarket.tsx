"use client";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useMarketIndices } from "@/lib/useMarketData";
import { formatPct, pnlColor, marketColor, formatMarket } from "@/lib/utils";

export default function HomeMarket() {
  const { indices, loading, realData, refresh } = useMarketIndices();

  return (
    <section className="px-4 mb-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>
          <span style={{ color: "#00E5A8", marginRight: 6 }}>▌</span>今日市场
        </h2>
        <div className="flex items-center gap-2">
          {realData && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.2)" }}>
              实时
            </span>
          )}
          <button onClick={refresh} disabled={loading}
            className="w-6 h-6 flex items-center justify-center rounded-lg"
            style={{ background: "#0a1628" }}>
            <RefreshCw size={12} color="#4a6080" className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      <div style={{ background: "#0d1f3c", borderRadius: 14, border: "1px solid #1a2f50" }}>
        {indices.slice(0, 4).map((idx, i) => (
          <div key={idx.code} className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: i < 3 ? "1px solid #1a2f50" : "none" }}>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: `${marketColor(idx.market)}18`, color: marketColor(idx.market) }}>
                {formatMarket(idx.market)}
              </span>
              <span className="font-semibold text-[13px]" style={{ color: "#F8FAFC" }}>{idx.name}</span>
            </div>
            <div className="text-right">
              <p className="font-black text-[14px] num" style={{ color: "#F8FAFC" }}>
                {idx.value > 0 ? idx.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) : "—"}
              </p>
              <p className="font-bold text-[12px] num" style={{ color: pnlColor(idx.changePct) }}>
                {formatPct(idx.changePct)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
