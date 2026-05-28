"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Bot, Info, RefreshCw } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const PRESET_QUESTIONS = [
  "双均线策略适合什么行情？",
  "如何设置合理的止损比例？",
  "RSI指标怎么判断超买超卖？",
  "什么是夏普比率，越高越好吗？",
  "网格策略的优缺点是什么？",
  "如何看懂回测结果中的最大回撤？",
];

const PRESET_ANSWERS: Record<string, string> = {
  "双均线策略适合什么行情？": `双均线策略（如MA5/MA20）在**趋势行情**中表现较好。

**适合的行情：**
• 单边上涨或下跌的趋势市
• 波动幅度较大、方向明确的行情
• 板块轮动明显的阶段

**不适合的行情：**
• 震荡行情（频繁触发假信号、来回止损）
• 窄幅横盘的低波动市

**建议：** 在使用前，先观察近期市场是否处于趋势状态，震荡市可考虑改用布林带或网格策略。

⚠️ 以上为策略特征分析，不构成投资建议。`,

  "如何设置合理的止损比例？": `止损比例没有统一答案，需结合**个人风险承受能力**和**策略特点**综合设定。

**常见参考范围：**
• 保守型：3%~5% 止损
• 平衡型：5%~10% 止损  
• 激进型：10%~15% 止损

**设置原则：**
1. 不超过单笔可承受最大亏损
2. 与止盈比例保持1:2以上盈亏比
3. 根据品种波动率调整（高波动品种适当放宽）

**注意：** 止损过紧容易被"洗出"，止损过松则单笔亏损过大。建议通过回测找到适合该策略的最优区间。

⚠️ 本内容为通用知识介绍，不构成个人投资建议。`,

  "RSI指标怎么判断超买超卖？": `RSI（相对强弱指数）范围是 0~100，用于衡量近期涨跌力度。

**传统标准：**
• **RSI > 70**：超买区，价格可能过高，需警惕回调
• **RSI < 30**：超卖区，价格可能过低，可能出现反弹
• **RSI 40~60**：中性区域，趋势不明朗

**实际使用注意：**
• 强趋势中RSI可长时间停留在超买/超卖区
• 建议结合价格走势、成交量一起判断
• 不同周期设置（6日/14日/24日）信号灵敏度不同

**建议：** RSI仅作为辅助参考，不宜单独作为买卖依据。

⚠️ 技术指标存在滞后性，不构成投资建议。`,

  "什么是夏普比率，越高越好吗？": `夏普比率 = （策略年化收益 - 无风险利率）/ 年化波动率

**直白理解：** 每承担1单位风险，获得多少超额收益。

**参考标准：**
• < 1：风险调整后收益较低
• 1~2：尚可，风险收益比合理
• > 2：较优，策略稳定性好
• > 3：优秀，通常难以持续

**注意：** 夏普比率越高越好，但需结合以下因素：
• 样本期长短（短期高可能是运气）
• 最大回撤（高夏普但大回撤也不理想）
• 交易频率（高频策略夏普易虚高）

⚠️ 回测指标仅供参考，历史数据不代表未来表现。`,

  "网格策略的优缺点是什么？": `网格策略是在设定价格区间内，等间距设置多个买卖价位，低买高卖反复套利的策略。

**优点：**
• 震荡行情中表现优异
• 不需要判断涨跌方向
• 操作规则清晰，情绪干扰少
• 可持续积累差价收益

**缺点：**
• 单边趋势行情损失严重（尤其单边下跌）
• 资金占用大，机会成本高
• 若标的长期下跌，持仓亏损难以对冲
• 需频繁交易，手续费成本不可忽视

**适用场景：** 波动率适中、预期价格在区间内震荡的品种。

⚠️ 本内容为策略介绍，不构成投资建议，使用前请充分评估风险。`,

  "如何看懂回测结果中的最大回撤？": `最大回撤 = 资产从最高点到最低点的最大跌幅（%）

**例子：** 账户从10万涨到15万，再跌至12万
最大回撤 = (15-12)/15 = 20%

**为什么重要：**
• 衡量策略的"最坏情况"
• 决定你是否能坚持使用该策略
• 最大回撤越小，策略心理承受压力越低

**参考标准：**
• < 10%：优秀，心理负担轻
• 10%~20%：可接受
• 20%~30%：较大，需谨慎
• > 30%：高风险，需强健心理素质

**重要提示：** 回测的最大回撤往往低于实盘，实际交易中可能更大。

⚠️ 历史回测数据不代表未来表现，投资需谨慎。`,
};

function getTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

const WELCOME: Message = {
  id: "0",
  role: "assistant",
  content: `你好！我是量化星球策略助手 👋

我可以帮你解答：
• 量化策略的基础知识
• 技术指标的含义和用法
• 回测结果的解读
• 风险控制的基本原则

⚠️ **重要提示：** 我的回答基于量化知识库整理，**不构成投资建议**，不对任何具体股票发表涨跌意见，最终决策由您自行判断。`,
  timestamp: getTime(),
};

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  function sendMessage(text: string) {
    if (!text.trim() || thinking) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: getTime(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    setTimeout(() => {
      const answer = PRESET_ANSWERS[text.trim()] ??
        `感谢你的提问！关于「${text.trim()}」，这是一个很好的问题。\n\n量化策略研究是一个需要不断学习和实践的领域。建议你：\n\n1. 先通过**回测功能**测试策略的历史表现\n2. 使用**模拟盘**在真实市场节奏中验证\n3. 关注**风险指标**（最大回撤、夏普比率）而非只看收益\n4. 保持**交易纪律**，避免情绪化操作\n\n⚠️ 以上为通用建议，不构成投资建议，具体决策请结合自身情况判断。`;

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: answer,
        timestamp: getTime(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setThinking(false);
    }, 1200 + Math.random() * 800);
  }

  function renderContent(text: string) {
    // Bold markdown **text**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i} style={{ color: "#F8FAFC" }}>{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>
    );
  }

  return (
    <div style={{ background: "#07111F", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="策略助手" />

      {/* 预设问题 */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-[11px] mb-2" style={{ color: "#4a6080" }}>常见问题快速提问：</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRESET_QUESTIONS.map((q) => (
            <button key={q} onClick={() => sendMessage(q)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold"
              style={{ background: "#0d1f3c", color: "#94A3B8", border: "1px solid #1a2f50" }}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 px-4 space-y-4 overflow-y-auto pb-4"
        style={{ maxHeight: "calc(100vh - 280px)", minHeight: 200 }}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "rgba(0,229,168,0.12)", border: "1px solid rgba(0,229,168,0.2)" }}>
                <Bot size={16} color="#00E5A8" />
              </div>
            )}
            <div className="max-w-[80%]">
              <div className="px-3.5 py-3 rounded-2xl text-[13px] leading-[1.7] whitespace-pre-wrap"
                style={{
                  background: msg.role === "user" ? "rgba(0,229,168,0.15)" : "#0d1f3c",
                  border: `1px solid ${msg.role === "user" ? "rgba(0,229,168,0.3)" : "#1a2f50"}`,
                  color: msg.role === "user" ? "#F8FAFC" : "#94A3B8",
                  borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                }}>
                {renderContent(msg.content)}
              </div>
              <p className={`text-[10px] mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}
                style={{ color: "#4a6080" }}>{msg.timestamp}</p>
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(0,229,168,0.12)", border: "1px solid rgba(0,229,168,0.2)" }}>
              <Bot size={16} color="#00E5A8" />
            </div>
            <div className="px-4 py-3 rounded-2xl" style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
              <div className="flex gap-1 items-center">
                {[0, 0.2, 0.4].map((d, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "#00E5A8", animationDelay: `${d}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 免责声明 */}
      <div className="mx-4 mb-2 px-3 py-2 rounded-xl flex items-center gap-2"
        style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}>
        <Info size={11} color="#EF4444" className="flex-shrink-0" />
        <p className="text-[10px]" style={{ color: "#4a6080" }}>
          策略助手仅供学习参考，不构成投资建议，投资决策风险自担。
        </p>
      </div>

      {/* 输入框 */}
      <div className="px-4 pb-6">
        <div className="flex items-center gap-2 p-2 rounded-2xl"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <input
            className="flex-1 bg-transparent px-2 py-1.5 text-[14px] outline-none"
            style={{ color: "#F8FAFC" }}
            placeholder="问我关于量化策略的问题…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || thinking}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: input.trim() && !thinking ? "linear-gradient(135deg, #00E5A8, #00b885)" : "#0a1628",
              border: `1px solid ${input.trim() && !thinking ? "#00E5A8" : "#1a2f50"}`,
            }}>
            <Send size={16} color={input.trim() && !thinking ? "#07111F" : "#4a6080"} />
          </button>
        </div>
      </div>
    </div>
  );
}
