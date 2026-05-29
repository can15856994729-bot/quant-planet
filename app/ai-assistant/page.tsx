"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Bot, Info, Trash2 } from "lucide-react";
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
  "什么是夏普比率？",
  "网格策略的优缺点？",
  "如何看最大回撤？",
];

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

⚠️ **重要提示：** 本助手仅供学习参考，**不构成投资建议**，不对任何股票发表涨跌意见。`,
  timestamp: getTime(),
};

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: getTime(),
    };

    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setStreaming(true);

    // 先插入空的 assistant 气泡
    const botId = (Date.now() + 1).toString();
    const botMsg: Message = {
      id: botId,
      role: "assistant",
      content: "",
      timestamp: getTime(),
    };
    setMessages([...history, botMsg]);

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("API 请求失败");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const { text } = JSON.parse(data);
            accumulated += text;
            // 实时更新气泡内容
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botId ? { ...m, content: accumulated } : m
              )
            );
          } catch {}
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId
            ? { ...m, content: "⚠️ 网络异常，请稍后重试。" }
            : m
        )
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([WELCOME]);
    setStreaming(false);
    setInput("");
  }

  function renderContent(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i} style={{ color: "#F8FAFC" }}>{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>
    );
  }

  return (
    <div style={{ background: "#07111F", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="策略助手"
        right={
          <button onClick={clearChat}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
            <Trash2 size={15} color="#64748B" />
          </button>
        }
      />

      {/* 预设问题 */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-[11px] mb-2" style={{ color: "#94A3B8" }}>快速提问：</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRESET_QUESTIONS.map((q) => (
            <button key={q} onClick={() => sendMessage(q)} disabled={streaming}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold"
              style={{
                background: "#0d1f3c",
                color: streaming ? "#64748B" : "#94A3B8",
                border: "1px solid #1a2f50",
              }}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 px-4 space-y-4 overflow-y-auto pb-4"
        style={{ maxHeight: "calc(100vh - 260px)", minHeight: 200 }}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "rgba(0,229,168,0.12)", border: "1px solid rgba(0,229,168,0.2)" }}>
                <Bot size={16} color="#00E5A8" />
              </div>
            )}
            <div className="max-w-[82%]">
              <div className="px-3.5 py-3 rounded-2xl text-[13px] leading-[1.75] whitespace-pre-wrap"
                style={{
                  background: msg.role === "user" ? "rgba(0,229,168,0.15)" : "#0d1f3c",
                  border: `1px solid ${msg.role === "user" ? "rgba(0,229,168,0.3)" : "#1a2f50"}`,
                  color: msg.role === "user" ? "#F8FAFC" : "#94A3B8",
                  borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                }}>
                {msg.content
                  ? renderContent(msg.content)
                  : <span className="inline-flex gap-1 items-center pt-1">
                      {[0, 0.2, 0.4].map((d, i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce inline-block"
                          style={{ background: "#00E5A8", animationDelay: `${d}s` }} />
                      ))}
                    </span>
                }
              </div>
              <p className={`text-[10px] mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}
                style={{ color: "#64748B" }}>{msg.timestamp}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 免责声明 */}
      <div className="mx-4 mb-2 px-3 py-2 rounded-xl flex items-center gap-2"
        style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}>
        <Info size={11} color="#EF4444" className="flex-shrink-0" />
        <p className="text-[10px]" style={{ color: "#94A3B8" }}>
          AI 助手仅供学习参考，不构成投资建议，投资决策风险自担。
        </p>
      </div>

      {/* 输入框 */}
      <div className="px-4 pb-6">
        <div className="flex items-center gap-2 p-2 rounded-2xl"
          style={{ background: "#0d1f3c", border: "1px solid #1a2f50" }}>
          <input
            className="flex-1 bg-transparent px-2 py-1.5 text-[14px] outline-none"
            style={{ color: "#F8FAFC" }}
            placeholder={streaming ? "正在生成回答…" : "问我关于量化策略的问题…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            disabled={streaming}
          />
          <button
            onClick={() => streaming ? abortRef.current?.abort() : sendMessage(input)}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: streaming
                ? "rgba(239,68,68,0.15)"
                : input.trim()
                  ? "linear-gradient(135deg, #00E5A8, #00b885)"
                  : "#0a1628",
              border: `1px solid ${streaming ? "rgba(239,68,68,0.3)" : input.trim() ? "#00E5A8" : "#1a2f50"}`,
            }}>
            {streaming
              ? <span className="w-3 h-3 rounded-sm" style={{ background: "#EF4444" }} />
              : <Send size={16} color={input.trim() ? "#07111F" : "#64748B"} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
