"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Bell, Moon, Globe, Database, Trash2, Info,
  ChevronRight, Shield, RefreshCw,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { toast } from "@/lib/toast";

type SettingItem = {
  icon: React.ElementType;
  label: string;
  desc: string;
  danger?: boolean;
} & (
  | { kind: "toggle"; value: boolean; onToggle: () => void }
  | { kind: "link";   href: string }
  | { kind: "action"; onPress: () => void }
);

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  function clearCache() {
    try {
      const preserve = ["quantplanet_watchlist_v1", "quantplanet_auth"];
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !preserve.includes(key)) toRemove.push(key);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
      toast("缓存已清除", "success");
    } catch {
      toast("清除失败，请稍后重试", "error");
    }
  }

  const groups: { title: string; items: SettingItem[] }[] = [
    {
      title: "通知设置",
      items: [
        {
          icon: Bell, label: "信号实时提醒",
          desc: notifications ? "已开启" : "已关闭",
          kind: "toggle", value: notifications,
          onToggle: () => {
            setNotifications((v) => !v);
            toast(notifications ? "提醒已关闭" : "提醒已开启", "success");
          },
        },
      ],
    },
    {
      title: "显示与语言",
      items: [
        {
          icon: Moon, label: "深色模式",
          desc: "当前：深色（默认）",
          kind: "toggle", value: darkMode,
          onToggle: () => { setDarkMode((v) => !v); toast("主题切换功能即将上线", "info"); },
        },
        {
          icon: Globe, label: "语言 / Language",
          desc: "简体中文",
          kind: "action", onPress: () => toast("目前仅支持简体中文", "info"),
        },
      ],
    },
    {
      title: "数据与存储",
      items: [
        {
          icon: Database, label: "数据源信息",
          desc: "查看当前数据来源",
          kind: "action",
          onPress: () => toast("数据源：Tushare（A股）+ Sina（实时）+ 模拟数据", "info", 4000),
        },
        {
          icon: Trash2, label: "清除缓存",
          desc: "不会删除自选股和账户数据",
          kind: "action", onPress: clearCache, danger: true,
        },
      ],
    },
    {
      title: "关于",
      items: [
        {
          icon: Info, label: "版本号",
          desc: "v1.1.0 (build 20260530)",
          kind: "action", onPress: () => toast("已是最新版本 v1.1.0", "success"),
        },
        {
          icon: RefreshCw, label: "检查更新",
          desc: "当前已是最新版本",
          kind: "action", onPress: () => toast("已是最新版本 v1.1.0", "success"),
        },
        {
          icon: Shield, label: "免责声明",
          desc: "合规与风险说明",
          kind: "link", href: "/disclaimer",
        },
      ],
    },
  ];

  function renderRight(item: SettingItem) {
    if (item.kind === "toggle") {
      return (
        <div
          className="w-12 h-6 rounded-full relative"
          style={{ background: item.value ? "#00E5A8" : "#1a2f50", flexShrink: 0 }}
        >
          <div
            className="w-5 h-5 bg-white rounded-full absolute top-0.5"
            style={{ left: item.value ? "auto" : "2px", right: item.value ? "2px" : "auto" }}
          />
        </div>
      );
    }
    return <ChevronRight size={16} color="#1a2f50" />;
  }

  function renderRow(item: SettingItem, i: number, total: number) {
    const inner = (
      <div
        className="flex items-center justify-between p-4"
        style={{
          background: "#0d1f3c",
          borderBottom: i < total - 1 ? "1px solid #1a2f50" : "none",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "#0a1628", border: "1px solid #1a2f50" }}
          >
            <item.icon size={16} color={item.danger ? "#EF4444" : "#94A3B8"} />
          </div>
          <div>
            <p className="font-semibold text-[13px]" style={{ color: item.danger ? "#EF4444" : "#F8FAFC" }}>
              {item.label}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>{item.desc}</p>
          </div>
        </div>
        {renderRight(item)}
      </div>
    );

    if (item.kind === "link") {
      return <Link key={item.label} href={item.href}>{inner}</Link>;
    }
    if (item.kind === "toggle") {
      return (
        <button key={item.label} className="w-full text-left" onClick={item.onToggle}>
          {inner}
        </button>
      );
    }
    return (
      <button key={item.label} className="w-full text-left" onClick={item.onPress}>
        {inner}
      </button>
    );
  }

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="应用设置" />

      <div className="px-4 mt-4 space-y-4 pb-24">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="text-[11px] font-bold mb-2 px-1" style={{ color: "#94A3B8" }}>
              {group.title}
            </p>
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2f50" }}>
              {group.items.map((item, i) => renderRow(item, i, group.items.length))}
            </div>
          </div>
        ))}

        <div className="text-center py-4 space-y-1">
          <p className="text-[11px]" style={{ color: "#94A3B8" }}>量化星球 QuantPlanet</p>
          <p className="text-[10px]" style={{ color: "#1a2f50" }}>数据仅供学习，不构成投资建议</p>
        </div>
      </div>
    </div>
  );
}
