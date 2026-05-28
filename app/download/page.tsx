import Link from "next/link";
import { Download, Smartphone, Apple, Globe, ArrowLeft, CheckCircle, ExternalLink, BarChart3, Info } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";

const VERCEL_URL = "https://app.quantplanetapp.com";

export default function DownloadPage() {
  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="下载安装" />

      <div className="px-4 pt-4 space-y-5 pb-12">

        {/* App 介绍 */}
        <div className="p-4 rounded-2xl flex items-center gap-4"
          style={{ background: "linear-gradient(135deg, rgba(0,229,168,0.1), rgba(59,130,246,0.08))", border: "1px solid rgba(0,229,168,0.2)" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-[28px] flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #07111F, #0d1f3c)", border: "2px solid rgba(0,229,168,0.3)" }}>
            📊
          </div>
          <div>
            <p className="font-black text-[18px]" style={{ color: "#F8FAFC" }}>量化星球</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#00E5A8" }}>QuantPlanet v1.1.0</p>
            <p className="text-[11px] mt-1" style={{ color: "#4a6080" }}>量化策略 · 模拟交易 · 信号提醒</p>
          </div>
        </div>

        {/* ══════ iOS iPhone ══════ */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(148,163,184,0.12)", border: "1px solid rgba(148,163,184,0.2)" }}>
              <Apple size={16} color="#94A3B8" />
            </div>
            <h2 className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>苹果 iPhone (iOS)</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: "rgba(0,229,168,0.12)", color: "#00E5A8" }}>
              免费安装
            </span>
          </div>

          {/* iPhone 专属提示横幅 */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl mb-3"
            style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)" }}>
            <Apple size={14} color="#3B82F6" className="flex-shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold leading-[1.6]" style={{ color: "#3B82F6" }}>
              iPhone 不支持 APK，无需下载任何文件。用 Safari 打开网页版即可免费安装，体验与原生 App 一致。
            </p>
          </div>

          <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[12px] font-bold mb-3" style={{ color: "#94A3B8" }}>
              📱 使用 Safari 浏览器，无需 App Store，3步完成安装：
            </p>
            <div className="space-y-3">
              {[
                {
                  step: "1",
                  title: "用 Safari 打开网址",
                  desc: VERCEL_URL,
                  note: "⚠️ 必须用 Safari，微信/Chrome 无法添加",
                  color: "#3B82F6",
                },
                {
                  step: "2",
                  title: "点击底部【分享】按钮",
                  desc: "找到底部工具栏中间的 □↑ 分享图标",
                  note: "向上滑动弹出菜单可看到更多选项",
                  color: "#FACC15",
                },
                {
                  step: "3",
                  title: "选择【添加到主屏幕】",
                  desc: "点击后输入名称，点击【添加】",
                  note: "图标会出现在桌面，像原生App一样使用",
                  color: "#00E5A8",
                },
              ].map(({ step, title, desc, note, color }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[13px] flex-shrink-0 mt-0.5"
                    style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
                    {step}
                  </div>
                  <div>
                    <p className="font-bold text-[13px]" style={{ color: "#F8FAFC" }}>{title}</p>
                    <p className="text-[11px] mt-0.5 font-mono" style={{ color }}>{desc}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#4a6080" }}>{note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════ 华为 Android ══════ */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(250,40,40,0.12)", border: "1px solid rgba(250,40,40,0.2)" }}>
              <Smartphone size={16} color="#EF4444" />
            </div>
            <h2 className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>华为手机</h2>
          </div>

          {/* APK 仅限安卓提示 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <span className="text-[14px]">⚠️</span>
            <p className="text-[11px] font-bold" style={{ color: "#EF4444" }}>
              APK 仅支持 Android 手机（华为/小米/OPPO/三星等）。iPhone 用户请勿下载，请使用上方 Safari 方式安装。
            </p>
          </div>

          {/* 方式一：APK */}
          <div className="p-4 rounded-2xl mb-3" style={{ background: "#0d1f3c", border: "1px solid rgba(0,229,168,0.2)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Download size={15} color="#00E5A8" />
              <p className="font-bold text-[13px]" style={{ color: "#00E5A8" }}>方式一：直接下载 APK（推荐）</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}>仅限安卓</span>
            </div>
            <div className="space-y-2.5">
              {[
                { step: "1", text: '点击下方绿色按钮，浏览器直接开始下载' },
                { step: "2", text: '下载完成后点击安装，若提示【来自未知来源】点【仍然安装】' },
                { step: "3", text: '安装完成后，桌面出现【量化星球】图标' },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(0,229,168,0.2)", color: "#00E5A8" }}>{step}</span>
                  <p className="text-[12px]" style={{ color: "#94A3B8" }}>{text}</p>
                </div>
              ))}
            </div>
            <a href="https://app.quantplanetapp.com/downloads/QuantPlanet.apk" download="QuantPlanet.apk"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-black text-[14px] mt-4 glow-green"
              style={{ background: "linear-gradient(135deg, #00E5A8, #00b885)", color: "#07111F" }}>
              <Download size={18} />
              点击下载 APK
            </a>
            <p className="text-center text-[10px] mt-2" style={{ color: "#4a6080" }}>
              最新构建版本 · 约 8MB · 需要 Android 7.0+
            </p>
          </div>

          {/* 方式二：PWA */}
          <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={15} color="#3B82F6" />
              <p className="font-bold text-[13px]" style={{ color: "#3B82F6" }}>方式二：Chrome 浏览器安装</p>
            </div>
            <div className="space-y-2.5">
              {[
                { step: "1", text: "用 Chrome 浏览器打开 app.quantplanetapp.com" },
                { step: "2", text: "点击右上角菜单（三个点）→ 【添加到主屏幕】" },
                { step: "3", text: "或地址栏右侧出现安装提示，点击【安装】" },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(59,130,246,0.2)", color: "#3B82F6" }}>{step}</span>
                  <p className="text-[12px]" style={{ color: "#94A3B8" }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════ 其他 Android ══════ */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)" }}>
              <Globe size={16} color="#3B82F6" />
            </div>
            <h2 className="font-black text-[15px]" style={{ color: "#F8FAFC" }}>小米 / 三星 / OPPO 等</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}>仅限安卓</span>
          </div>
          <div className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <p className="text-[12px] mb-3" style={{ color: "#94A3B8" }}>任选一种方式：</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: "📦", label: "下载 APK", href: "https://app.quantplanetapp.com/downloads/QuantPlanet.apk", color: "#00E5A8" },
                { icon: "🌐", label: "网页版", href: VERCEL_URL, color: "#3B82F6" },
              ].map(({ icon, label, href, color }) => (
                <a key={label} href={href} download={label === "下载 APK" ? "QuantPlanet.apk" : undefined}
                  target={label === "网页版" ? "_blank" : undefined} rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-[13px]"
                  style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                  <span>{icon}</span> {label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* 功能特点 */}
        <div>
          <h2 className="font-bold text-[13px] mb-2 px-1" style={{ color: "#4a6080" }}>App 功能</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: "📈", label: "行情监控",   desc: "A/港/美三市实时数据" },
              { icon: "🔬", label: "策略回测",   desc: "13种量化策略验证" },
              { icon: "🎮", label: "模拟交易",   desc: "虚拟资金实战练习" },
              { icon: "🔔", label: "信号提醒",   desc: "7类技术信号推送" },
              { icon: "🤖", label: "策略助手",   desc: "量化知识问答" },
              { icon: "🛡️", label: "合规设计",   desc: "不稳赚不AI保本" },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="p-3 rounded-xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[16px]">{icon}</span>
                  <span className="font-bold text-[12px]" style={{ color: "#F8FAFC" }}>{label}</span>
                </div>
                <p className="text-[10px]" style={{ color: "#4a6080" }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 风险提示 */}
        <div className="p-3 rounded-xl flex items-start gap-2"
          style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}>
          <Info size={12} color="#EF4444" className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-[1.7]" style={{ color: "#4a6080" }}>
            本App仅供量化策略学习和模拟交易使用，不构成投资建议，不提供真实交易功能，历史数据不代表未来收益。
          </p>
        </div>

        {/* 立即体验 */}
        <Link href="/">
          <div className="w-full py-4 rounded-2xl font-black text-[15px] text-center glow-green"
            style={{ background: "linear-gradient(135deg, #00E5A8, #00b885)", color: "#07111F" }}>
            <BarChart3 size={18} className="inline mr-2" />
            立即开始使用
          </div>
        </Link>
      </div>
    </div>
  );
}
