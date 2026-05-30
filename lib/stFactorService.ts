/**
 * stFactorService.ts v2 — A股 ST 风险反转策略因子评分引擎（优化版）
 *
 * ════════════════════════════════════════════════════════════════════
 * v2 优化说明（针对回测亏损 -20.3% 的五大根因修复）
 * ════════════════════════════════════════════════════════════════════
 *
 * 问题1：基本面+摘帽预期均固定50分，占权重25%却没有任何选股能力
 *   → 解决：删除两个占位因子，替换为【量能突破因子 30%】
 *           量能突破是"聪明钱"进驻的最可靠代理信号
 *
 * 问题2：动量因子中"60日低位加分"是反向信号
 *   → 解决：删除低位加分逻辑（ST越跌越加分 = 买入下跌趋势）
 *           改为奖励从低位"已回升"的股票（有反转证据才加分）
 *
 * 问题3：跌停容忍度过高（consecutiveLimitDn < 2 才拦截）
 *   → 解决：零容忍（任何1次跌停 = 不可买入，惩罚加重）
 *
 * 问题4：趋势要求过低（仅需站上MA20）
 *   → 解决：要求 MA60 也向上（大趋势确认），趋势权重 35%
 *
 * 问题5：价格底线缺失（ST面值退市风险 < 2元）
 *   → 解决：新增硬性 lastClose >= 2.0元 买入条件
 *
 * ════════════════════════════════════════════════════════════════════
 * 评分维度（0-100）：
 *   趋势修复因子    35%  — MA5/MA20/MA60 三线共振
 *   量能突破因子    30%  — 5日均量/20日均量倍数 + 单日主力大量
 *   流动性因子      20%  — 绝对成交额（能否安全退出）
 *   动量因子        15%  — 5日/20日价格动量（去掉低位加分）
 *   风险惩罚        -30  — 任何跌停/价格<2元/停牌
 *
 * 买入条件（严格版）：
 *   综合 >= 70 | 趋势 >= 65 | 量能突破 >= 55 | 流动性 >= 60
 *   近20日均额 >= 3000万 | 连续跌停 = 0 | 价格 >= 2.0元
 *
 * ⚠️ 仅用于研究和模拟交易，不构成投资建议。
 */

export interface STBar {
  date:   string;
  open:   number;
  close:  number;
  high:   number;
  low:    number;
  volume: number;  // 手
  amount: number;  // 元
  pctChg: number;  // 涨跌幅 %
}

export interface STFactorResult {
  // 各维度得分 0-100
  trendScore:       number;   // 趋势修复（MA三线共振）
  volumeSurgeScore: number;   // 量能突破（聪明钱代理指标，v2新增）
  liquidityScore:   number;   // 流动性（绝对成交额）
  momentumScore:    number;   // 动量（5日/20日）
  riskPenalty:      number;   // 风险惩罚（越高惩罚越重）
  totalScore:       number;   // 0-100 综合

  // 向后兼容（原有字段保留）
  fundamentalScore: number;   // 固定0（v2已去除占位）
  catalystScore:    number;   // 固定0（v2已去除占位）

  // 状态标志
  isBuyable:              boolean;
  hasConsecutiveLimitDn:  boolean;
  consecutiveLimitDnCount: number;
  isSuspended:            boolean;
  priceTooLow:            boolean;  // 价格 < 2元（面值退市风险）
  lastClose:              number;
  avgAmount20d:           number;
  priceVsMA20:            number;
  isTrending:             boolean;

  // 详情文字
  trendDetail:       string;
  volumeSurgeDetail: string;
  liquidityDetail:   string;
  momentumDetail:    string;
  fundamentalNote:   string;  // 保留字段
  catalystNote:      string;  // 保留字段
  riskDetail:        string;
  reasons:           string[];
  warnings:          string[];
}

// ── Math helpers ──────────────────────────────────────────────────────
function ma(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  return arr.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function isLimitDown(pctChg: number): boolean { return pctChg <= -9.3; }

// ── Main ST scoring v2 ───────────────────────────────────────────────
export function calculateSTFactorScores(bars: STBar[]): STFactorResult {
  const closes  = bars.map((b) => b.close);
  const amounts = bars.map((b) => b.amount);
  const vols    = bars.map((b) => b.volume);
  const n       = bars.length;

  const reasons:  string[] = [];
  const warnings: string[] = [];

  const lastClose = closes[n - 1] ?? 0;

  // ── 连续跌停检测（v2：零容忍，任何1次跌停严重惩罚）──────────
  let consecutiveLimitDnCount = 0;
  for (let i = n - 1; i >= 0 && i >= n - 5; i--) {
    if (isLimitDown(bars[i].pctChg)) consecutiveLimitDnCount++;
    else break;
  }
  const hasConsecutiveLimitDn = consecutiveLimitDnCount > 0;
  const isSuspended           = n > 0 && bars[n - 1].volume === 0;
  const priceTooLow           = lastClose > 0 && lastClose < 2.0;

  // ── 近 20 日均成交额 ──────────────────────────────────────────
  const amt20      = amounts.slice(-20);
  const avgAmount20d = amt20.length > 0 ? amt20.reduce((s, v) => s + v, 0) / amt20.length : 0;

  // ── 趋势因子均线 ──────────────────────────────────────────────
  const ma5  = ma(closes, 5);
  const ma20 = ma(closes, 20);
  const ma60 = ma(closes, 60);

  const isTrending    = !!ma20 && lastClose > ma20;
  const priceVsMA20   = ma20 ? ((lastClose - ma20) / ma20) * 100 : 0;

  // ════════════════════════════════════════════════════════════════
  // 1. 趋势修复因子 (0-100)   权重 35%
  //    MA 三线共振策略：MA5 > MA20 > 0，MA20 > MA60 = 大趋势确认
  // ════════════════════════════════════════════════════════════════
  let trendScore  = 0;
  let trendDetail = "";

  if (n < 20) {
    trendScore  = 35; // 数据不足，偏保守中性
    trendDetail = "K线数据不足 20 日，趋势判断受限";
    warnings.push("历史 K 线不足 20 日，趋势信号弱");
  } else {
    let ts = 30; // baseline（更低的基准，需要更多条件触发才能过门槛）

    // ① 价格站上 MA20（基本条件）
    if (ma20 && lastClose > ma20) {
      ts += 20; reasons.push("收盘价站上 MA20");
    } else {
      ts -= 15; warnings.push("收盘价位于 MA20 下方");
    }

    // ② MA5 > MA20（短期金叉）
    if (ma5 && ma20 && ma5 > ma20) {
      ts += 15; reasons.push("MA5 上穿 MA20（短期金叉）");
    } else {
      warnings.push("MA5 仍在 MA20 下方，短期趋势未确认");
    }

    // ③ MA20 斜率向上（过去 10 日）
    if (n >= 30) {
      const ma20_10dAgo = ma(closes.slice(0, n - 10), 20);
      if (ma20 && ma20_10dAgo && ma20 > ma20_10dAgo) {
        ts += 15; reasons.push("MA20 向上倾斜（趋势修复中）");
      } else {
        ts -= 10; warnings.push("MA20 仍向下，中期趋势未扭转");
      }
    }

    // ④ 价格突破 MA60（大趋势确认，v2 权重加重）
    if (ma60 && lastClose > ma60) {
      ts += 15; reasons.push("价格突破 MA60，大趋势确认");
    } else if (ma60) {
      warnings.push("价格仍在 MA60 下方，大趋势未确认");
    }

    // ⑤ MA60 斜率向上（v2 新增，大趋势拐点）
    if (n >= 80 && ma60) {
      const ma60_20dAgo = ma(closes.slice(0, n - 20), 60);
      if (ma60_20dAgo && ma60 > ma60_20dAgo) {
        ts += 10; reasons.push("MA60 向上，大趋势开始修复");
      }
    }

    trendScore  = Math.max(0, Math.min(100, ts));
    trendDetail = `MA20=${ma20?.toFixed(2) ?? "—"}, MA5=${ma5?.toFixed(2) ?? "—"}, MA60=${ma60?.toFixed(2) ?? "—"}, 偏离${priceVsMA20 > 0 ? "+" : ""}${priceVsMA20.toFixed(1)}%`;
  }

  // ════════════════════════════════════════════════════════════════
  // 2. 量能突破因子 (0-100)   权重 30%   ← v2 核心新增
  //    ST 反转的"聪明钱"代理指标：机构悄悄建仓 → 量能异常放大
  //    先于价格反转发生，是最具预测性的技术信号
  // ════════════════════════════════════════════════════════════════
  let volumeSurgeScore  = 0;
  let volumeSurgeDetail = "";

  if (isSuspended) {
    volumeSurgeScore  = 0;
    volumeSurgeDetail = "停牌，量能信号无效";
  } else if (n < 10) {
    volumeSurgeScore  = 30; // 数据不足，中性
    volumeSurgeDetail = "K线不足，量能信号受限";
  } else {
    let vs = 30; // baseline

    // 计算基础量比
    const vol5  = vols.slice(-5).reduce((s, v) => s + v, 0) / 5;
    const vol20 = vols.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const volRatio = vol20 > 0 ? vol5 / vol20 : 1;

    // ① 5日均量/20日均量倍数（主要量能突破信号）
    if (volRatio >= 2.0) {
      vs += 40; reasons.push(`量能强势放大（近5日均量 ${volRatio.toFixed(1)}x 于20日均量）`);
    } else if (volRatio >= 1.5) {
      vs += 25; reasons.push(`量能明显放大（${volRatio.toFixed(1)}x）`);
    } else if (volRatio >= 1.2) {
      vs += 10; reasons.push(`量能温和放大（${volRatio.toFixed(1)}x）`);
    } else if (volRatio < 0.7) {
      vs -= 15; warnings.push(`量能萎缩（${volRatio.toFixed(1)}x），弱势缩量`);
    } else if (volRatio < 0.9) {
      vs -= 5;  warnings.push(`量能轻微缩量（${volRatio.toFixed(1)}x）`);
    }

    // ② 近5日最大单日量/20日均量（主力单日集中买入）
    const maxVol5d = Math.max(...vols.slice(-5));
    const singleDayRatio = vol20 > 0 ? maxVol5d / vol20 : 1;
    if (singleDayRatio >= 3.0) {
      vs += 20; reasons.push(`近5日出现主力大量（单日 ${singleDayRatio.toFixed(1)}x 于均量）`);
    } else if (singleDayRatio >= 2.0) {
      vs += 10; reasons.push(`近5日有放量迹象（单日最大 ${singleDayRatio.toFixed(1)}x）`);
    }

    // ③ 近3日量能递增趋势（连续放量更可靠）
    if (n >= 3 &&
        vols[n-1] > vols[n-2] &&
        vols[n-2] > vols[n-3] &&
        vols[n-1] > vol20) {
      vs += 10; reasons.push("近3日量能连续递增且高于均量");
    }

    // 绝对成交额太低时，量能倍数无意义（防止小盘ST虚假量能信号）
    if (avgAmount20d < 5_000_000) {
      vs = Math.min(vs, 35); // 绝对流动性不足，量能信号上限 35
      warnings.push("绝对成交额过低，量能信号可信度受限");
    }

    volumeSurgeScore  = Math.max(0, Math.min(100, vs));
    volumeSurgeDetail = `5日/20日量比 ${volRatio.toFixed(2)}x，单日最大量比 ${singleDayRatio.toFixed(2)}x`;
  }

  // ════════════════════════════════════════════════════════════════
  // 3. 流动性因子 (0-100)   权重 20%
  //    纯粹衡量绝对成交额（能否安全退出，不含量能信号）
  // ════════════════════════════════════════════════════════════════
  let liquidityScore  = 0;
  let liquidityDetail = "";

  if (isSuspended) {
    liquidityScore  = 0;
    liquidityDetail = "当日停牌，无法交易";
    warnings.push("股票停牌，流动性为零");
  } else {
    const amt = avgAmount20d;
    if      (amt >= 50_000_000) { liquidityScore = 90; reasons.push(`近20日均成交额 ${(amt/1e7).toFixed(1)} 千万，流动性优秀`); }
    else if (amt >= 30_000_000) { liquidityScore = 80; reasons.push(`近20日均成交额 ${(amt/1e7).toFixed(1)} 千万，流动性良好`); }
    else if (amt >= 20_000_000) { liquidityScore = 70; reasons.push(`近20日均成交额 ${(amt/1e7).toFixed(1)} 千万`); }
    else if (amt >= 10_000_000) { liquidityScore = 50; }
    else if (amt >=  5_000_000) { liquidityScore = 30; warnings.push("成交额偏低（< 1000万），流动性不足"); }
    else                         { liquidityScore = 10; warnings.push("成交额极低，强烈不建议参与"); }

    liquidityDetail = `近20日均额 ${(avgAmount20d / 1e6).toFixed(0)} 万元`;
  }

  // ════════════════════════════════════════════════════════════════
  // 4. 动量因子 (0-100)   权重 15%
  //    v2 修改：删除"60日低位加分"（反向信号）
  //    改为：从低位已回升才加分（有反转证据）
  // ════════════════════════════════════════════════════════════════
  let momentumScore = 50;

  const ret5  = n > 5  ? ((closes[n-1] - closes[n-6])  / closes[n-6])  * 100 : null;
  const ret20 = n > 20 ? ((closes[n-1] - closes[n-21]) / closes[n-21]) * 100 : null;

  let ms = 50;
  if (ret5  !== null) {
    if      (ret5  >  5)   { ms += 15; reasons.push(`近5日涨幅 +${ret5.toFixed(1)}%，短期动量强`); }
    else if (ret5  >  0)   { ms +=  8; }
    else if (ret5  > -5)   { ms -=  5; warnings.push(`近5日小幅下跌 ${ret5.toFixed(1)}%`); }
    else if (ret5  > -10)  { ms -= 10; warnings.push(`近5日跌幅 ${ret5.toFixed(1)}%，短期弱势`); }
    else                   { ms -= 18; warnings.push(`近5日大幅下跌 ${ret5.toFixed(1)}%，强烈弱势`); }
  }
  if (ret20 !== null) {
    if      (ret20 >  10)  { ms += 15; reasons.push(`近20日涨幅 +${ret20.toFixed(1)}%，中期动量强`); }
    else if (ret20 >   0)  { ms +=  8; }
    else if (ret20 > -10)  { ms -=  8; warnings.push(`近20日下跌 ${ret20.toFixed(1)}%`); }
    else if (ret20 > -20)  { ms -= 15; warnings.push(`近20日大幅下跌 ${ret20.toFixed(1)}%`); }
    else                   { ms -= 20; warnings.push(`近20日暴跌 ${ret20.toFixed(1)}%，极度弱势`); }
  }

  // v2 新增：从60日低点回升超过15%才视为真正反转（有反转证据才加分）
  // v1 的"处于60日低位加分"是反向信号，已删除
  const low60 = n >= 60 ? Math.min(...closes.slice(-60)) : null;
  if (low60 && low60 > 0 && lastClose > low60 * 1.20) {
    ms += 12; reasons.push(`已从60日低点回升 ${((lastClose/low60 - 1)*100).toFixed(0)}%，具备反转证据`);
  }

  momentumScore = Math.max(0, Math.min(100, ms));

  // ════════════════════════════════════════════════════════════════
  // 5. 风险惩罚（v2：更严格，零容忍跌停）
  // ════════════════════════════════════════════════════════════════
  let riskPenalty = 0;
  let riskDetail  = "";

  // ① 连续跌停惩罚（v2：1次跌停就重罚，而不是2次才触发）
  if (consecutiveLimitDnCount >= 3) {
    riskPenalty += 30; warnings.push(`连续 ${consecutiveLimitDnCount} 日跌停，风险极高`);
  } else if (consecutiveLimitDnCount === 2) {
    riskPenalty += 25; warnings.push("连续 2 日跌停，流动性严重受损，禁止买入");
  } else if (consecutiveLimitDnCount === 1) {
    riskPenalty += 15; warnings.push("昨日跌停（v2 零容忍策略：禁止在跌停后买入）");
  }

  // ② 价格底线（v2 加强：<2元硬性拒绝，< 3元也有惩罚）
  if (priceTooLow) {
    riskPenalty += 20; warnings.push(`股价 ${lastClose.toFixed(2)} 元 < 2元，面值退市风险极高`);
  } else if (lastClose < 3.0) {
    riskPenalty += 10; warnings.push(`股价 ${lastClose.toFixed(2)} 元偏低，需关注退市风险`);
  }

  // ③ 停牌
  if (isSuspended) { riskPenalty += 20; }

  riskPenalty = Math.min(30, riskPenalty);
  riskDetail  = consecutiveLimitDnCount > 0
    ? `连续跌停 ${consecutiveLimitDnCount} 日，风险惩罚 -${riskPenalty}`
    : priceTooLow ? `股价极低（${lastClose.toFixed(2)} 元），面值退市风险，惩罚 -${riskPenalty}`
    : lastClose < 3.0 ? `股价偏低（${lastClose.toFixed(2)} 元），惩罚 -${riskPenalty}`
    : "无重大风险惩罚项";

  // ════════════════════════════════════════════════════════════════
  // 综合得分（v2 新权重）
  // trend 35% | volumeSurge 30% | liquidity 20% | momentum 15%
  // ════════════════════════════════════════════════════════════════
  const raw =
    trendScore       * 0.35 +
    volumeSurgeScore * 0.30 +
    liquidityScore   * 0.20 +
    momentumScore    * 0.15;

  const totalScore = Math.max(0, Math.min(100, Math.round(raw - riskPenalty)));

  // ════════════════════════════════════════════════════════════════
  // 买入判断（v2 全面收紧）
  // ════════════════════════════════════════════════════════════════
  const isBuyable =
    !isSuspended &&
    !priceTooLow &&                         // 价格 >= 2.0元（新增）
    consecutiveLimitDnCount === 0 &&        // 零容忍：任何跌停都不买（从 < 2 改为 = 0）
    avgAmount20d >= 30_000_000 &&           // 近20日均额 >= 3000万（从 2000万 提高）
    liquidityScore >= 60 &&                 // 流动性评分 >= 60（从 50 提高）
    trendScore >= 65 &&                     // 趋势评分 >= 65（从 55 提高）
    volumeSurgeScore >= 55 &&               // 量能突破 >= 55（新增，核心条件）
    totalScore >= 70;                       // 综合 >= 70（从 60 提高）

  return {
    trendScore,
    volumeSurgeScore,
    liquidityScore,
    momentumScore,
    fundamentalScore: 0,  // v2 已去除，保留字段兼容
    catalystScore:    0,  // v2 已去除，保留字段兼容
    riskPenalty,
    totalScore,
    isBuyable,
    hasConsecutiveLimitDn:   consecutiveLimitDnCount > 0,
    consecutiveLimitDnCount,
    isSuspended,
    priceTooLow,
    lastClose,
    avgAmount20d,
    priceVsMA20,
    isTrending,
    trendDetail,
    volumeSurgeDetail,
    liquidityDetail,
    momentumDetail: [
      ret5  !== null ? `5日收益 ${ret5  > 0 ? "+" : ""}${ret5.toFixed(1)}%`  : "5日数据不足",
      ret20 !== null ? `20日收益 ${ret20 > 0 ? "+" : ""}${ret20.toFixed(1)}%` : "20日数据不足",
    ].join(" | "),
    fundamentalNote: "v2 已去除基本面占位因子（原固定50分无选股能力），由量能突破因子替代",
    catalystNote:    "v2 已去除摘帽预期占位因子（原固定50分无选股能力），由量能突破因子替代",
    riskDetail,
    reasons,
    warnings,
  };
}
