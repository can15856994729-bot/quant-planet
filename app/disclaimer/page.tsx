import { Shield, AlertTriangle, Info, CheckCircle } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Link from "next/link";

export default function DisclaimerPage() {
  const sections = [
    {
      icon: AlertTriangle,
      color: "#EF4444",
      title: "重要风险提示",
      items: [
        "本平台所有内容（包括策略、信号、回测数据）均基于历史数据模拟，不代表未来实际收益。",
        "历史回测结果受数据质量、参数优化偏差影响，实际收益可能与回测存在重大差异。",
        "股票、基金等证券投资存在市场风险，投资者可能损失全部本金。",
        "请在充分了解产品特性和投资风险后，根据自身风险承受能力理性决策。",
      ],
    },
    {
      icon: Info,
      color: "#3B82F6",
      title: "服务性质声明",
      items: [
        "本平台为量化策略学习和研究工具，不提供证券投资顾问服务。",
        "平台内容不构成买卖证券的推荐或投资建议，所有投资决策由用户自行判断。",
        "模拟交易功能使用虚拟资金，不产生真实盈亏，与真实市场存在差异。",
        "AI策略助手回答仅供学习参考，不能替代专业投资顾问意见。",
      ],
    },
    {
      icon: Shield,
      color: "#FACC15",
      title: "合规使用规范",
      items: [
        "用户应遵守所在地区证券相关法律法规，合法合规使用本平台。",
        "不得将本平台数据用于任何违法违规的证券交易活动。",
        "本平台数据来源包含第三方数据，可能存在延迟、错误或中断，平台不对此承担责任。",
        "平台保留对功能、数据及服务条款进行调整的权利。",
      ],
    },
    {
      icon: CheckCircle,
      color: "#00E5A8",
      title: "推荐使用方式",
      items: [
        "将平台作为量化学习工具，系统学习策略逻辑和风险管理知识。",
        "通过回测功能验证策略逻辑，而非直接复制回测参数进行实盘操作。",
        "使用模拟盘进行长期练习，建立稳定的交易心理和纪律。",
        "结合信号提醒辅助决策，但不应完全依赖系统信号，需结合基本面分析。",
      ],
    },
  ];

  return (
    <div style={{ background: "#07111F", minHeight: "100vh" }}>
      <PageHeader title="风险免责声明" />

      <div className="px-4 pt-4 space-y-4 pb-8">

        {/* 顶部警示卡 */}
        <div className="p-4 rounded-2xl"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} color="#EF4444" />
            <p className="font-black text-[15px]" style={{ color: "#EF4444" }}>请在使用前认真阅读</p>
          </div>
          <p className="text-[12px] leading-[1.8]" style={{ color: "#94A3B8" }}>
            量化星球是面向个人投资者学习和研究使用的量化工具平台。使用本平台即表示您已充分了解并接受以下所有风险提示和使用条款。
          </p>
        </div>

        {/* 各条款 */}
        {sections.map(({ icon: Icon, color, title, items }) => (
          <div key={title} className="p-4 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: `${color}15` }}>
                <Icon size={15} color={color} />
              </div>
              <p className="font-black text-[14px]" style={{ color: "#F8FAFC" }}>{title}</p>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: color }} />
                  <p className="text-[12px] leading-[1.7]" style={{ color: "#94A3B8" }}>{item}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* 核心禁语声明 */}
        <div className="p-4 rounded-2xl" style={{ background: "#0a1628", border: "1px solid #1a2f50" }}>
          <p className="font-bold text-[12px] mb-3" style={{ color: "#94A3B8" }}>本平台承诺不使用以下误导性表述：</p>
          <div className="grid grid-cols-2 gap-2">
            {["稳赚不赔", "保本保收益", "AI自动赚钱", "无风险套利", "内部推荐股", "必涨信号"].map((term) => (
              <div key={term} className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.1)" }}>
                <span className="text-[13px]">🚫</span>
                <span className="text-[12px] line-through" style={{ color: "#94A3B8" }}>{term}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 更新日期 */}
        <p className="text-center text-[11px]" style={{ color: "#94A3B8" }}>
          本声明最后更新：2025年01月01日
        </p>

        {/* 确认按钮 */}
        <Link href="/">
          <div className="w-full py-4 rounded-2xl font-black text-[15px] text-center"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50", color: "#94A3B8" }}>
            已阅读，返回首页
          </div>
        </Link>
      </div>
    </div>
  );
}
