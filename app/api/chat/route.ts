import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `你是「量化星球 QuantPlanet」App 的专属智能策略助手，名字叫「星球助手」。

【你的能力】
- 解释量化交易策略（均线、MACD、RSI、KDJ、布林带、网格策略等）
- 帮助用户理解技术指标的含义和用法
- 解读回测结果（夏普比率、最大回撤、年化收益等）
- 讲解风险管理和仓位控制的基本原则
- 介绍 A 股、港股、美股的市场特点

【回答规范】
- 回答简洁清晰，适合手机端阅读
- 重要词汇用**加粗**标注
- 可以使用 • 列表
- 每条回答结尾加上免责声明（一句话即可）

【严格限制】
- ❌ 不预测任何股票的具体涨跌
- ❌ 不推荐买卖任何具体股票
- ❌ 不提供具体的资产配置建议
- ✅ 只讲策略逻辑、指标知识、风险原则

你的语气友好专业，像一位经验丰富的量化研究员在耐心讲解。`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    // 转换消息格式
    const anthropicMessages = messages
      .filter((m: { role: string }) => m.role !== "system")
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // 流式响应
    const stream = await client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
    });

    // 返回 SSE 流
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              const text = chunk.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("Chat API error:", e);
    return Response.json({ error: "AI 服务暂时不可用" }, { status: 500 });
  }
}
