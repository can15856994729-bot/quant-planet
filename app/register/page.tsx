"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, Lock, Eye, EyeOff, User, BarChart3, ArrowLeft, ChevronDown } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import type { QpUser } from "@/store/authStore";

const RISK_OPTIONS: QpUser["riskLevel"][] = ["保守", "稳健", "积极"];
const RISK_DESC: Record<QpUser["riskLevel"], string> = {
  "保守": "风险承受能力低，偏好稳定收益",
  "稳健": "平衡风险与收益，适合多数投资者",
  "积极": "追求高收益，能承受较大回撤",
};

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [phone, setPhone] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [riskLevel, setRiskLevel] = useState<QpUser["riskLevel"]>("稳健");
  const [showPwd, setShowPwd] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleRegister() {
    if (!phone.trim() || phone.length < 11) { setError("请输入11位手机号"); return; }
    if (!nickname.trim()) { setError("请输入昵称"); return; }
    if (password.length < 6) { setError("密码至少6位"); return; }
    if (password !== confirm) { setError("两次密码不一致"); return; }
    setError("");
    setLoading(true);
    setTimeout(() => {
      login({
        id: `u_${Date.now()}`,
        nickname: nickname.trim(),
        phone,
        avatar: "🌍",
        joinedAt: new Date().toISOString().slice(0, 10),
        riskLevel,
      });
      setLoading(false);
      router.push("/");
    }, 1000);
  }

  const inputStyle = (active: boolean) => ({
    background: "#0d1f3c",
    border: `1px solid ${active ? "#00E5A8" : "#1a2f50"}`,
  });

  return (
    <div className="min-h-screen flex flex-col px-6 pt-12 pb-8" style={{ background: "#07111F" }}>
      <button onClick={() => router.back()} className="w-8 h-8 rounded-xl flex items-center justify-center mb-8"
        style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
        <ArrowLeft size={18} color="#94A3B8" />
      </button>

      <h1 className="font-black text-[24px] mb-1" style={{ color: "#F8FAFC" }}>创建账户</h1>
      <p className="text-[13px] mb-8" style={{ color: "#94A3B8" }}>加入量化星球，开始你的量化之旅</p>

      <div className="space-y-4">
        {/* 手机号 */}
        <div>
          <label className="text-[12px] font-semibold mb-2 block" style={{ color: "#94A3B8" }}>手机号</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl" style={inputStyle(!!phone)}>
            <Phone size={16} color="#94A3B8" />
            <input type="tel" maxLength={11}
              className="flex-1 bg-transparent text-[15px] outline-none" style={{ color: "#F8FAFC" }}
              placeholder="请输入手机号"
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>

        {/* 昵称 */}
        <div>
          <label className="text-[12px] font-semibold mb-2 block" style={{ color: "#94A3B8" }}>昵称</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl" style={inputStyle(!!nickname)}>
            <User size={16} color="#94A3B8" />
            <input type="text" maxLength={16}
              className="flex-1 bg-transparent text-[15px] outline-none" style={{ color: "#F8FAFC" }}
              placeholder="给自己取个名字"
              value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
        </div>

        {/* 密码 */}
        <div>
          <label className="text-[12px] font-semibold mb-2 block" style={{ color: "#94A3B8" }}>密码</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl" style={inputStyle(!!password)}>
            <Lock size={16} color="#94A3B8" />
            <input type={showPwd ? "text" : "password"}
              className="flex-1 bg-transparent text-[15px] outline-none" style={{ color: "#F8FAFC" }}
              placeholder="至少6位"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={() => setShowPwd(!showPwd)}>
              {showPwd ? <EyeOff size={16} color="#94A3B8" /> : <Eye size={16} color="#94A3B8" />}
            </button>
          </div>
        </div>

        {/* 确认密码 */}
        <div>
          <label className="text-[12px] font-semibold mb-2 block" style={{ color: "#94A3B8" }}>确认密码</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
            style={inputStyle(!!confirm && confirm === password)}>
            <Lock size={16} color="#94A3B8" />
            <input type={showPwd ? "text" : "password"}
              className="flex-1 bg-transparent text-[15px] outline-none" style={{ color: "#F8FAFC" }}
              placeholder="再输入一次密码"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {confirm && (
              <span className="text-[13px]" style={{ color: confirm === password ? "#00E5A8" : "#EF4444" }}>
                {confirm === password ? "✓" : "✗"}
              </span>
            )}
          </div>
        </div>

        {/* 风险偏好 */}
        <div>
          <label className="text-[12px] font-semibold mb-2 block" style={{ color: "#94A3B8" }}>风险偏好</label>
          <button onClick={() => setShowRisk(!showRisk)}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="text-left">
              <span className="font-bold text-[14px]" style={{ color: "#F8FAFC" }}>{riskLevel}型</span>
              <span className="text-[11px] ml-2" style={{ color: "#94A3B8" }}>{RISK_DESC[riskLevel]}</span>
            </div>
            <ChevronDown size={16} color="#94A3B8" className={`transition-transform ${showRisk ? "rotate-180" : ""}`} />
          </button>
          {showRisk && (
            <div className="mt-2 rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2f50" }}>
              {RISK_OPTIONS.map((opt) => (
                <button key={opt} onClick={() => { setRiskLevel(opt); setShowRisk(false); }}
                  className="w-full flex items-center justify-between px-4 py-3"
                  style={{
                    background: riskLevel === opt ? "rgba(0,229,168,0.08)" : "#0d1f3c",
                    borderBottom: "1px solid #1a2f50",
                  }}>
                  <div className="text-left">
                    <p className="font-bold text-[13px]" style={{ color: riskLevel === opt ? "#00E5A8" : "#F8FAFC" }}>{opt}型</p>
                    <p className="text-[11px]" style={{ color: "#94A3B8" }}>{RISK_DESC[opt]}</p>
                  </div>
                  {riskLevel === opt && <span style={{ color: "#00E5A8" }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-[12px] text-center" style={{ color: "#EF4444" }}>{error}</p>}

        <button onClick={handleRegister} disabled={loading}
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
              注册中…
            </span>
          ) : "立即注册"}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 mt-6">
        <span className="text-[13px]" style={{ color: "#94A3B8" }}>已有账户？</span>
        <Link href="/login" className="font-bold text-[13px]" style={{ color: "#00E5A8" }}>去登录</Link>
      </div>

      <p className="text-center text-[10px] mt-auto pt-8" style={{ color: "#1a2f50" }}>
        本平台仅提供模拟交易，不构成投资建议
      </p>
    </div>
  );
}
