/**
 * /money-flow — 资金流排行页
 *
 * 四个 Tab（客户端懒加载）：
 *  - 个股主力净流入 Top 100
 *  - 个股主力净流出 Top 100
 *  - 行业板块资金流排行
 *  - 概念板块资金流排行
 *
 * 数据来源：东方财富（/api/eastmoney/money-flow/*）
 */
import MoneyFlowClient from "./MoneyFlowClient";

export const metadata = {
  title:       "资金流向 - 量化星球",
  description: "A股主力资金流排行，包含个股主力净流入/流出、行业板块、概念板块资金流动情况。",
};

export default function MoneyFlowPage() {
  return <MoneyFlowClient />;
}
