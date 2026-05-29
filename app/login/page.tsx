"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, Lock, Eye, EyeOff, BarChart3, ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleLogin() {
    if (!phone.trim() || phone.length < 11) {
      setError("请输入正确的手机号");
      return;
    }
    if (!password.trim() || password.length < 6) {
      setError("密码至少6位");
      return;
    }
    setError("");
    setLoading(true);
    // 模拟登录（无真实后端）
    setTimeout(() => {
      login({
        id: `u_${Date.now()}`,
        nickname: `星球用户${phone.slice(-4)}`,
        phone,
        avatar: "🌍",
        joinedAt: new Date().toISOString().slice(0, 10),
        riskLevel: "稳健",
      });
      setLoading(false);
      router.push("/");
    }, 1000);
  }

  return (
    <div className="min-h-screen flex flex-col px-6 pb-8 page-top-pt" style={{ background: "#07111F" }}>
      {/* 返回 */}
      <button onClick={() => router.back()} className="w-8 h-8 rounded-xl flex items-center justify-center mb-8"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <ArrowLeft size={18} color="#94A3B8" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, rgba(0,229,168,0.2), rgba(59,130,246,0.15))", border: "1px solid rgba(0,229,168,0.25)" }}>
          <BarChart3 size={24} color="#00E5A8" />
        </div>
        <div>
          <p className="font-black text-[20px]" style={{ color: "#F8FAFC" }}>量化星球</p>
          <p className="text-[11px]" style={{ color: "#94A3B8" }}>数据辅助决策，理性量化交易</p>
        </div>
      </div>

      <h1 className="font-black text-[24px] mb-1" style={{ color: "#F8FAFC" }}>欢迎回来</h1>
      <p className="text-[13px] mb-8" style={{ color: "#94A3B8" }}>登录你的量化星球账户</p>

      <div className="space-y-4">
        {/* 手机号 */}
        <div>
          <label className="text-[12px] font-semibold mb-2 block" style={{ color: "#94A3B8" }}>手机号</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
            style={{ background: "#0d1f3c", border: `1px solid ${phone ? "#00E5A8" : "#1a2f50"}` }}>
            <Phone size={16} color="#94A3B8" />
            <input
              type="tel" maxLength={11}
              className="flex-1 bg-transparent text-[15px] outline-none"
              style={{ color: "#F8FAFC" }}
              placeholder="请输入手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>

        {/* 密码 */}
        <div>
          <label className="text-[12px] font-semibold mb-2 block" style={{ color: "#94A3B8" }}>密码</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
            style={{ background: "#0d1f3c", border: `1px solid ${password ? "#00E5A8" : "#1a2f50"}` }}>
            <Lock size={16} color="#94A3B8" />
            <input
              type={showPwd ? "text" : "password"}
              className="flex-1 bg-transparent text-[15px] outline-none"
              style={{ color: "#F8FAFC" }}
              placeholder="请输入密码（至少6位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={() => setShowPwd(!showPwd)}>
              {showPwd ? <EyeOff size={16} color="#94A3B8" /> : <Eye size={16} color="#94A3B8" />}
            </button>
          </div>
        </div>

        {error && <p className="text-[12px] text-center" style={{ color: "#EF4444" }}>{error}</p>}

        {/* 登录按钮 */}
        <button onClick={handleLogin} disabled={loading}
          className="w-full py-4 rounded-2xl font-black text-[16px] mt-2 glow-green"
          style={{
            background: loading ? "#0d1f3c" : "linear-gradient(135deg, #00E5A8, #00b885)",
            color: loading ? "#64748B" : "#07111F",
            border: loading ? "1px solid #1a2f50" : "none",
          }}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: "#94A3B8", borderTopColor: "transparent" }} />
              登录中…
            </span>
          ) : "登录"}
        </button>
      </div>

      {/* 跳转注册 */}
      <div className="flex items-center justify-center gap-2 mt-6">
        <span className="text-[13px]" style={{ color: "#94A3B8" }}>还没有账户？</span>
        <Link href="/register" className="font-bold text-[13px]" style={{ color: "#00E5A8" }}>
          立即注册
        </Link>
      </div>

      {/* 免责 */}
      <p className="text-center text-[10px] mt-auto pt-8 leading-[1.7]" style={{ color: "#1a2f50" }}>
        登录即表示同意《用户协议》和《隐私政策》{"\n"}
        本平台仅提供模拟交易，不构成投资建议
      </p>
    </div>
  );
}
