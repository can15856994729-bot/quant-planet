"use client";
import { useState } from "react";
import Link from "next/link";
import {
  User, Settings, Bell, Shield, BarChart3, BookOpen,
  ChevronRight, LogOut, Info, Star, TrendingUp, Award
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { MOCK_SIM_ACCOUNT } from "@/lib/mock-data";
import { formatPct, pnlColor } from "@/lib/utils";

export default function ProfilePage() {
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const acc = MOCK_SIM_ACCOUNT;

  const statsItems = [
    { label: "模拟账户收益", value: formatPct(acc.totalReturnPct), color: pnlColor(acc.totalReturnPct) },
    { label: "持仓数量",     value: `${acc.positions.length}只`,    color: "#F8FAFC" },
    { label: "成交笔数",     value: `${acc.trades.length}笔`,        color: "#F8FAFC" },
  ];

  const menuGroups = [
    {
      title: "交易功能",
      items: [
        { icon: BarChart3, label: "我的回测记录",    href: "/backtest",     desc: "查看历史回测报告" },
        { icon: TrendingUp, label: "模拟交易账户",   href: "/sim-trading",  desc: `总资产 ¥${acc.totalValue.toLocaleString()}` },
        { icon: Bell,       label: "信号提醒设置",   href: "/signals",      desc: notifyEnabled ? "已开启实时提醒" : "提醒已关闭" },
      ],
    },
    {
      title: "学习中心",
      items: [
        { icon: BookOpen, label: "量化策略教程",    href: "/ai-assistant", desc: "入门到进阶" },
        { icon: Star,     label: "收藏的策略",       href: "/strategies",   desc: `${3}个策略已收藏` },
        { icon: Award,    label: "我的策略评分",     href: "/strategies",   desc: "综合评分 B+" },
      ],
    },
    {
      title: "设置与帮助",
      items: [
        { icon: Shield,   label: "风险偏好设置",    href: "/disclaimer",   desc: "当前：中等风险" },
        { icon: Info,     label: "风险免责声明",     href: "/disclaimer",   desc: "重要合规说明" },
        { icon: Settings, label: "应用设置",         href: "#",             desc: "通知/主题/语言" },
      ],
    },
  ];

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="我的" showBack={false} />

      {/* 用户信息卡 */}
      <div className="mx-4 mt-4 p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-[22px]"
            style={{ background: "linear-gradient(135deg, rgba(0,229,168,0.2), rgba(59,130,246,0.15))", border: "1px solid rgba(0,229,168,0.25)" }}>
            🌍
          </div>
          <div>
            <p className="font-black text-[17px]" style={{ color: "#F8FAFC" }}>量化星球用户</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.2)" }}>
                模拟账户
              </span>
              <span className="text-[10px]" style={{ color: "#4a6080" }}>免费版</span>
            </div>
          </div>
        </div>

        {/* 统计数据 */}
        <div className="grid grid-cols-3 gap-2">
          {statsItems.map(({ label, value, color }) => (
            <div key={label} className="p-2.5 rounded-xl text-center" style={{ background: "#0a1628" }}>
              <p className="font-black text-[16px] num" style={{ color }}>{value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "#4a6080" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 模拟账户快速入口 */}
      <div className="mx-4 mt-3 p-3 rounded-2xl flex items-center justify-between"
        style={{ background: "rgba(0,229,168,0.06)", border: "1px solid rgba(0,229,168,0.15)" }}>
        <div>
          <p className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>模拟账户总资产</p>
          <p className="font-black text-[20px] num mt-0.5" style={{ color: "#F8FAFC" }}>
            ¥{acc.totalValue.toLocaleString()}
            <span className="text-[12px] ml-2 font-bold" style={{ color: pnlColor(acc.totalReturnPct) }}>
              {formatPct(acc.totalReturnPct)}
            </span>
          </p>
        </div>
        <Link href="/sim-trading">
          <div className="px-3 py-2 rounded-xl font-bold text-[12px]"
            style={{ background: "rgba(0,229,168,0.15)", color: "#00E5A8", border: "1px solid rgba(0,229,168,0.25)" }}>
            查看详情
          </div>
        </Link>
      </div>

      {/* 菜单组 */}
      <div className="px-4 mt-4 space-y-4 pb-24">
        {menuGroups.map((group) => (
          <div key={group.title}>
            <p className="text-[11px] font-bold mb-2 px-1" style={{ color: "#4a6080" }}>{group.title}</p>
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2f50" }}>
              {group.items.map((item, i) => (
                <Link key={item.label} href={item.href}>
                  <div className="flex items-center justify-between p-4"
                    style={{
                      background: "#0d1f3c",
                      borderBottom: i < group.items.length - 1 ? "1px solid #1a2f50" : "none",
                    }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
                        <item.icon size={16} color="#4a6080" />
                      </div>
                      <div>
                        <p className="font-semibold text-[13px]" style={{ color: "#F8FAFC" }}>{item.label}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "#4a6080" }}>{item.desc}</p>
                      </div>
                    </div>
                    <ChevronRight size={16} color="#1a2f50" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* 提醒开关 */}
        <div className="p-4 rounded-2xl flex items-center justify-between"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
              <Bell size={16} color={notifyEnabled ? "#00E5A8" : "#4a6080"} />
            </div>
            <div>
              <p className="font-semibold text-[13px]" style={{ color: "#F8FAFC" }}>实时信号提醒</p>
              <p className="text-[10px] mt-0.5" style={{ color: "#4a6080" }}>
                {notifyEnabled ? "已开启，有信号时第一时间通知" : "已关闭"}
              </p>
            </div>
          </div>
          <button onClick={() => setNotifyEnabled(!notifyEnabled)}
            className="w-12 h-6 rounded-full relative transition-all"
            style={{ background: notifyEnabled ? "#00E5A8" : "#1a2f50" }}>
            <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all"
              style={{ left: notifyEnabled ? "auto" : "2px", right: notifyEnabled ? "2px" : "auto" }} />
          </button>
        </div>

        {/* 版本信息 */}
        <div className="text-center py-4">
          <p className="text-[11px]" style={{ color: "#4a6080" }}>量化星球 QuantPlanet v1.0.0</p>
          <p className="text-[10px] mt-1" style={{ color: "#1a2f50" }}>数据仅供学习，不构成投资建议</p>
        </div>
      </div>
    </div>
  );
}
