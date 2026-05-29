"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { pnlColor, formatPct, marketColor, formatMarket } from "@/lib/utils";
import { useStockQuotes } from "@/lib/useStockQuote";

// ─── 排行榜数据类型 ────────────────────────────────────────────
interface RankStock {
  symbol: string; name: string; market: "A" | "HK" | "US"; industry: string;
  price: number; changePct: number;
  changeSpeed: number;   // 涨速 %/min
  turnoverAmt: number;   // 成交额 万元
  bigOrderNet: number;   // 大单净量 万手
  volumeRatio: number;   // 量比
  turnoverRate: number;  // 换手率 %
  mainInflow: number;    // 主力净流入 万元
  amplitude: number;     // 振幅 %
}

// ─── Mock 数据（30只股票，覆盖三市） ─────────────────────────
const RANK_DATA: RankStock[] = [
  { symbol:"600519", name:"贵州茅台",  market:"A",  industry:"白酒",    price:1680.5, changePct:7.98,  changeSpeed:0.42, turnoverAmt:478320, bigOrderNet:12.4, volumeRatio:3.82, turnoverRate:2.14, mainInflow:82340,  amplitude:8.6  },
  { symbol:"300750", name:"宁德时代",  market:"A",  industry:"电池",    price:198.4,  changePct:6.54,  changeSpeed:0.38, turnoverAmt:176980, bigOrderNet:28.6, volumeRatio:5.24, turnoverRate:4.82, mainInflow:61200,  amplitude:7.2  },
  { symbol:"002594", name:"比亚迪",    market:"A",  industry:"新能汽车", price:245.6,  changePct:5.23,  changeSpeed:0.31, turnoverAmt:139670, bigOrderNet:19.2, volumeRatio:4.16, turnoverRate:3.64, mainInflow:45800,  amplitude:5.8  },
  { symbol:"000858", name:"五粮液",    market:"A",  industry:"白酒",    price:135.8,  changePct:4.80,  changeSpeed:0.28, turnoverAmt:46430,  bigOrderNet:8.4,  volumeRatio:2.94, turnoverRate:1.82, mainInflow:28600,  amplitude:5.1  },
  { symbol:"600036", name:"招商银行",  market:"A",  industry:"银行",    price:35.6,   changePct:3.72,  changeSpeed:0.22, turnoverAmt:83480,  bigOrderNet:15.8, volumeRatio:2.48, turnoverRate:1.26, mainInflow:32400,  amplitude:4.2  },
  { symbol:"601166", name:"兴业银行",  market:"A",  industry:"银行",    price:18.42,  changePct:2.86,  changeSpeed:0.18, turnoverAmt:63640,  bigOrderNet:11.2, volumeRatio:2.12, turnoverRate:1.08, mainInflow:18200,  amplitude:3.6  },
  { symbol:"601857", name:"中国石油",  market:"A",  industry:"石化",    price:8.42,   changePct:2.14,  changeSpeed:0.14, turnoverAmt:52490,  bigOrderNet:42.6, volumeRatio:1.86, turnoverRate:0.84, mainInflow:12400,  amplitude:2.8  },
  { symbol:"601318", name:"中国平安",  market:"A",  industry:"保险",    price:42.8,   changePct:1.35,  changeSpeed:0.09, turnoverAmt:53270,  bigOrderNet:9.6,  volumeRatio:1.62, turnoverRate:0.72, mainInflow:8600,   amplitude:2.1  },
  { symbol:"601398", name:"工商银行",  market:"A",  industry:"银行",    price:5.82,   changePct:0.86,  changeSpeed:0.06, turnoverAmt:72490,  bigOrderNet:38.4, volumeRatio:1.24, turnoverRate:0.36, mainInflow:4200,   amplitude:1.4  },
  { symbol:"600276", name:"恒瑞医药",  market:"A",  industry:"医药",    price:42.6,   changePct:-0.62, changeSpeed:-0.04, turnoverAmt:52400, bigOrderNet:-4.2, volumeRatio:1.08, turnoverRate:0.94, mainInflow:-6800,  amplitude:1.8  },
  { symbol:"600000", name:"浦发银行",  market:"A",  industry:"银行",    price:7.82,   changePct:-1.24, changeSpeed:-0.08, turnoverAmt:35670, bigOrderNet:-6.8, volumeRatio:0.92, turnoverRate:0.62, mainInflow:-9200,  amplitude:2.2  },
  // A股新增
  { symbol:"002415", name:"海康威视",  market:"A",  industry:"安防",    price:28.6,   changePct:-2.38, changeSpeed:-0.14, turnoverAmt:41280, bigOrderNet:-9.4, volumeRatio:0.76, turnoverRate:1.42, mainInflow:-14600, amplitude:3.1  },
  { symbol:"000333", name:"美的集团",  market:"A",  industry:"家电",    price:52.4,   changePct:-3.16, changeSpeed:-0.20, turnoverAmt:58460, bigOrderNet:-12.6,volumeRatio:0.68, turnoverRate:1.68, mainInflow:-21800, amplitude:4.2  },
  { symbol:"600887", name:"伊利股份",  market:"A",  industry:"乳制品",  price:24.8,   changePct:-4.25, changeSpeed:-0.26, turnoverAmt:29840, bigOrderNet:-7.8, volumeRatio:0.58, turnoverRate:2.14, mainInflow:-16400, amplitude:5.0  },
  { symbol:"002230", name:"科大讯飞",  market:"A",  industry:"AI",      price:36.4,   changePct:9.86,  changeSpeed:0.64, turnoverAmt:82640,  bigOrderNet:22.4, volumeRatio:8.46, turnoverRate:6.82, mainInflow:48600,  amplitude:10.2 },
  { symbol:"688041", name:"海光信息",  market:"A",  industry:"芯片",    price:68.2,   changePct:8.64,  changeSpeed:0.58, turnoverAmt:94280,  bigOrderNet:18.6, volumeRatio:7.24, turnoverRate:7.46, mainInflow:52400,  amplitude:9.4  },
  { symbol:"300433", name:"蓝思科技",  market:"A",  industry:"消费电子", price:12.4,  changePct:7.23,  changeSpeed:0.48, turnoverAmt:38640,  bigOrderNet:8.2,  volumeRatio:6.18, turnoverRate:5.62, mainInflow:22800,  amplitude:8.1  },
  { symbol:"000725", name:"京东方A",   market:"A",  industry:"面板",    price:4.82,   changePct:-5.12, changeSpeed:-0.34, turnoverAmt:48260, bigOrderNet:-16.4,volumeRatio:0.48, turnoverRate:3.28, mainInflow:-28400, amplitude:6.2  },
  { symbol:"601899", name:"紫金矿业",  market:"A",  industry:"黄金",    price:18.6,   changePct:3.42,  changeSpeed:0.24, turnoverAmt:92460,  bigOrderNet:24.8, volumeRatio:3.64, turnoverRate:2.86, mainInflow:38200,  amplitude:4.6  },
  { symbol:"600690", name:"海尔智家",  market:"A",  industry:"家电",    price:24.2,   changePct:2.18,  changeSpeed:0.16, turnoverAmt:32840,  bigOrderNet:6.4,  volumeRatio:2.28, turnoverRate:1.48, mainInflow:14600,  amplitude:3.2  },
  // 港股
  { symbol:"03690",  name:"美团",      market:"HK", industry:"本地生活", price:145.3, changePct:5.84,  changeSpeed:0.36, turnoverAmt:32150,  bigOrderNet:6.8,  volumeRatio:4.62, turnoverRate:3.24, mainInflow:28400,  amplitude:6.4  },
  { symbol:"09618",  name:"京东集团",  market:"HK", industry:"电商",    price:148.5,  changePct:4.62,  changeSpeed:0.28, turnoverAmt:18330,  bigOrderNet:4.2,  volumeRatio:3.84, turnoverRate:2.68, mainInflow:18600,  amplitude:5.2  },
  { symbol:"09988",  name:"阿里巴巴",  market:"HK", industry:"互联网",  price:78.45,  changePct:2.84,  changeSpeed:0.18, turnoverAmt:25450,  bigOrderNet:8.4,  volumeRatio:2.64, turnoverRate:1.84, mainInflow:14200,  amplitude:3.8  },
  { symbol:"00941",  name:"中国移动",  market:"HK", industry:"电信",    price:68.4,   changePct:1.24,  changeSpeed:0.08, turnoverAmt:19770,  bigOrderNet:5.6,  volumeRatio:1.48, turnoverRate:0.84, mainInflow:6400,   amplitude:1.8  },
  { symbol:"00700",  name:"腾讯控股",  market:"HK", industry:"互联网",  price:320.4,  changePct:-1.86, changeSpeed:-0.12, turnoverAmt:60590, bigOrderNet:-12.4,volumeRatio:0.82, turnoverRate:0.62, mainInflow:-18600, amplitude:2.6  },
  // 美股
  { symbol:"NVDA",   name:"英伟达",    market:"US", industry:"半导体",  price:875.4,  changePct:6.24,  changeSpeed:0.42, turnoverAmt:395940, bigOrderNet:48.6, volumeRatio:5.84, turnoverRate:3.24, mainInflow:124600, amplitude:7.2  },
  { symbol:"TSLA",   name:"特斯拉",    market:"US", industry:"新能汽车", price:248.5, changePct:-4.82, changeSpeed:-0.32, turnoverAmt:309540,bigOrderNet:-38.4,volumeRatio:0.62, turnoverRate:4.86, mainInflow:-86400, amplitude:6.8  },
  { symbol:"AAPL",   name:"苹果",      market:"US", industry:"科技",    price:189.3,  changePct:2.48,  changeSpeed:0.16, turnoverAmt:129450, bigOrderNet:24.2, volumeRatio:2.42, turnoverRate:1.62, mainInflow:48200,  amplitude:3.2  },
  { symbol:"META",   name:"Meta",      market:"US", industry:"社交媒体", price:525.6, changePct:-2.84, changeSpeed:-0.18, turnoverAmt:82410, bigOrderNet:-18.6,volumeRatio:0.74, turnoverRate:1.24, mainInflow:-32400, amplitude:4.2  },
  { symbol:"AMZN",   name:"亚马逊",    market:"US", industry:"电商",    price:196.5,  changePct:3.64,  changeSpeed:0.24, turnoverAmt:75490,  bigOrderNet:16.8, volumeRatio:2.86, turnoverRate:1.86, mainInflow:38600,  amplitude:4.6  },
];

// ─── 榜单配置 ──────────────────────────────────────────────────
type TabKey = "涨幅榜" | "跌幅榜" | "快速涨幅" | "成交额" | "大单净量" | "量比榜" | "换手率" | "主力净流入" | "振幅榜";

interface TabConfig {
  key: TabKey;
  label: string;
  sortKey: keyof RankStock;
  desc: boolean;
  unit: string;
  format: (v: number) => string;
  color: (v: number) => string;
}

const TABS: TabConfig[] = [
  {
    key: "涨幅榜", label: "涨幅", sortKey: "changePct", desc: true,
    unit: "%", format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
    color: (v) => pnlColor(v),
  },
  {
    key: "跌幅榜", label: "跌幅", sortKey: "changePct", desc: false,
    unit: "%", format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
    color: (v) => pnlColor(v),
  },
  {
    key: "快速涨幅", label: "涨速", sortKey: "changeSpeed", desc: true,
    unit: "%/min", format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
    color: (v) => pnlColor(v),
  },
  {
    key: "成交额", label: "成交额", sortKey: "turnoverAmt", desc: true,
    unit: "万", format: (v) => v >= 10000 ? `${(v / 10000).toFixed(2)}亿` : `${v.toFixed(0)}万`,
    color: () => "#F8FAFC",
  },
  {
    key: "大单净量", label: "大单", sortKey: "bigOrderNet", desc: true,
    unit: "万手", format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}万手`,
    color: (v) => pnlColor(v),
  },
  {
    key: "量比榜", label: "量比", sortKey: "volumeRatio", desc: true,
    unit: "倍", format: (v) => `${v.toFixed(2)}倍`,
    color: (v) => v >= 2 ? "#00E5A8" : v <= 0.8 ? "#EF4444" : "#F8FAFC",
  },
  {
    key: "换手率", label: "换手率", sortKey: "turnoverRate", desc: true,
    unit: "%", format: (v) => `${v.toFixed(2)}%`,
    color: (v) => v >= 5 ? "#FACC15" : v >= 3 ? "#F97316" : "#F8FAFC",
  },
  {
    key: "主力净流入", label: "主力", sortKey: "mainInflow", desc: true,
    unit: "万元", format: (v) => {
      const abs = Math.abs(v);
      const str = abs >= 10000 ? `${(abs / 10000).toFixed(2)}亿` : `${abs.toFixed(0)}万`;
      return `${v > 0 ? "+" : "-"}${str}`;
    },
    color: (v) => pnlColor(v),
  },
  {
    key: "振幅榜", label: "振幅", sortKey: "amplitude", desc: true,
    unit: "%", format: (v) => `${v.toFixed(2)}%`,
    color: () => "#FACC15",
  },
];

// ─── 市场筛选 ──────────────────────────────────────────────────
type MarketFilter = "全部" | "A股" | "港股" | "美股";
const MARKET_MAP: Record<MarketFilter, string | null> = {
  "全部": null, "A股": "A", "港股": "HK", "美股": "US",
};

// ─── 排名角标颜色 ──────────────────────────────────────────────
function rankStyle(rank: number) {
  if (rank === 1) return { bg: "#FACC15", color: "#07111F" };
  if (rank === 2) return { bg: "#94A3B8", color: "#07111F" };
  if (rank === 3) return { bg: "#F97316", color: "#07111F" };
  return { bg: "#1a2f50", color: "#64748B" };
}

const ALL_RANK_SYMBOLS = RANK_DATA.map((s) => s.symbol);

export default function RankingPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("涨幅榜");
  const [market, setMarket] = useState<MarketFilter>("全部");
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch live prices for all ranked stocks
  const { quotes: liveQuotes, refresh: refreshQuotes } = useStockQuotes(ALL_RANK_SYMBOLS);

  const tab = TABS.find((t) => t.key === activeTab)!;

  const ranked = useMemo(() => {
    let list = RANK_DATA.filter((s) =>
      market === "全部" || s.market === MARKET_MAP[market]
    );
    list = [...list].sort((a, b) => {
      const va = a[tab.sortKey] as number;
      const vb = b[tab.sortKey] as number;
      return tab.desc ? vb - va : va - vb;
    });
    return list;
  }, [activeTab, market, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader
        title="行情排行榜"
        right={
          <button onClick={() => { setRefreshKey((k) => k + 1); refreshQuotes(); }}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <RefreshCw size={15} color="#64748B" />
          </button>
        }
      />

      {/* ── 榜单 Tab（横向滚动） ── */}
      <div className="flex gap-1.5 px-4 pt-3 pb-2 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold"
            style={{
              background: activeTab === t.key ? "rgba(0,229,168,0.15)" : "#0d1f3c",
              color:      activeTab === t.key ? "#00E5A8" : "#94A3B8",
              border:     `1px solid ${activeTab === t.key ? "#00E5A8" : "#1a2f50"}`,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 市场筛选 ── */}
      <div className="flex gap-2 px-4 pb-3">
        {(["全部", "A股", "港股", "美股"] as MarketFilter[]).map((m) => (
          <button key={m} onClick={() => setMarket(m)}
            className="px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{
              background: market === m ? "#00E5A8" : "transparent",
              color:      market === m ? "#07111F" : "#94A3B8",
              border:     `1px solid ${market === m ? "#00E5A8" : "#1a2f50"}`,
            }}>
            {m}
          </button>
        ))}
      </div>

      {/* ── 列表头 ── */}
      <div className="flex items-center px-4 py-2" style={{ borderBottom: "1px solid #1a2f50" }}>
        <span className="w-8 text-[10px]" style={{ color: "#64748B" }}>排名</span>
        <span className="flex-1 text-[10px]" style={{ color: "#64748B" }}>名称/代码</span>
        <span className="w-20 text-right text-[10px]" style={{ color: "#64748B" }}>最新价</span>
        <span className="w-24 text-right text-[10px]" style={{ color: "#64748B" }}>{tab.label}</span>
      </div>

      {/* ── 排行列表 ── */}
      <div className="pb-28">
        {ranked.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[13px]" style={{ color: "#64748B" }}>暂无数据</p>
          </div>
        ) : (
          ranked.map((s, i) => {
            const rank = i + 1;
            const rs = rankStyle(rank);
            const val = s[tab.sortKey] as number;
            const liveQ = liveQuotes[s.symbol];
            const displayPrice = (liveQ?.price && liveQ.price > 0) ? liveQ.price : s.price;
            const displayChangePct = (liveQ?.isRealtime) ? (liveQ.changePct ?? s.changePct) : s.changePct;
            return (
              <Link key={s.symbol} href={`/stock/${s.symbol}`}>
                <div className="flex items-center px-4 py-3 active:opacity-70"
                  style={{ borderBottom: "1px solid #0d1f3c" }}>
                  {/* 排名 */}
                  <div className="w-8 flex-shrink-0">
                    <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-black inline-flex"
                      style={{ background: rs.bg, color: rs.color }}>
                      {rank}
                    </span>
                  </div>

                  {/* 名称 + 代码 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[14px] truncate" style={{ color: "#F8FAFC" }}>{s.name}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded font-bold flex-shrink-0"
                        style={{ background: `${marketColor(s.market)}18`, color: marketColor(s.market) }}>
                        {formatMarket(s.market)}
                      </span>
                      {liveQ?.isRealtime && (
                        <span className="text-[9px] px-1 py-0.5 rounded font-bold flex-shrink-0"
                          style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>实时</span>
                      )}
                    </div>
                    <p className="text-[11px]" style={{ color: "#64748B" }}>{s.symbol} · {s.industry}</p>
                  </div>

                  {/* 最新价 + 涨跌幅 */}
                  <div className="w-20 text-right flex-shrink-0">
                    <p className="font-bold text-[13px] num" style={{ color: "#F8FAFC" }}>{displayPrice.toLocaleString()}</p>
                    <p className="text-[11px] num font-semibold" style={{ color: pnlColor(displayChangePct) }}>
                      {formatPct(displayChangePct)}
                    </p>
                  </div>

                  {/* 榜单指标 */}
                  <div className="w-24 text-right flex-shrink-0">
                    <p className="font-black text-[14px] num" style={{ color: tab.color(val) }}>
                      {tab.format(val)}
                    </p>
                    {/* 涨速专属：显示小箭头 */}
                    {activeTab === "快速涨幅" && (
                      <p className="text-[10px]" style={{ color: "#64748B" }}>
                        {val > 0 ? "↑加速" : val < 0 ? "↓下行" : "→平稳"}
                      </p>
                    )}
                    {/* 主力净流入专属：方向标签 */}
                    {activeTab === "主力净流入" && (
                      <p className="text-[10px] font-semibold" style={{ color: pnlColor(val) }}>
                        {val > 0 ? "净流入" : "净流出"}
                      </p>
                    )}
                    {/* 量比专属：超级量比标签 */}
                    {activeTab === "量比榜" && val >= 5 && (
                      <p className="text-[9px] font-bold px-1 rounded"
                        style={{ background: "rgba(250,204,21,0.15)", color: "#FACC15" }}>
                        超级量比
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* 数据说明 */}
      <div className="mx-4 mb-4 px-3 py-2 rounded-xl"
        style={{ background: "rgba(148,163,184,0.05)", border: "1px solid #1a2f50" }}>
        <p className="text-[10px]" style={{ color: "#64748B" }}>
          ⚠️ 以上数据均为模拟演示数据，不代表真实行情，不构成投资建议。
        </p>
      </div>
    </div>
  );
}
