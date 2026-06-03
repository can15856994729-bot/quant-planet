/**
 * lib/pcbChokepointPoolService.ts
 *
 * PCB 咽喉池 — 高速覆铜板/CCL、高多层PCB/AI服务器PCB、
 *              光模块/高速互联PCB配套、PCB设备/耗材/制程
 *
 * PCB 产业链的核心卡点：高频高速材料（低Dk/Df CCL）、高多层加工能力、
 * AI 服务器 / 高速交换机 / 光模块 800G/1.6T 所需 PCB 及配套设备。
 *
 * ⚠️ 产业链分类为规则匹配，需人工复核，不构成投资建议。
 */

// ── 类型定义 ──────────────────────────────────────────────────────

export type PcbChokepointGroupKey = "ccl" | "multilayer" | "optical-pcb" | "equipment";

export interface PcbChokepointGroup {
  key:         PcbChokepointGroupKey;
  groupName:   string;
  chokePoint:  string;
  description: string;
  color:       string;
}

export interface PcbChokepointStock {
  tsCode:              string;
  symbol:              string;
  name:                string;
  primarySegment:      string;          // 主细分标签（显示用）
  groups:              PcbChokepointGroupKey[];
  role:                string;
  chokePointDesc:      string;          // 咽喉点描述
  technicalBarrier:    "极高" | "高" | "中高" | "中" | "中低" | "低";
  localizationSpace:   "极高" | "高" | "中高" | "中" | "中低" | "低";
  aiDemandLevel:       "极强" | "强" | "中高" | "中" | "间接";
  isCore:              boolean;
  // 静态能力评分 0-100
  premiumMaterialScore:  number;   // 高端材料能力 25%
  highSpeedAppScore:     number;   // 高速高频应用能力 20%
  multilayerMfgScore:    number;   // 高多层制造能力 20%
  aiServerBenefitScore:  number;   // AI服务器/高速通信受益度 15%
  notes:               string;
}

export interface PcbChokepointScore {
  premiumMaterialScore:  number;   // 25%
  highSpeedAppScore:     number;   // 20%
  multilayerMfgScore:    number;   // 20%
  aiServerBenefitScore:  number;   // 15%
  financialQualityScore: number;   // 10%
  valuationScore:        number;   // 10%
  totalScore:            number;
  rating:                "优秀" | "良好" | "一般" | "较差";
}

// ── 分组定义 ─────────────────────────────────────────────────────

export const PCB_CHOKEPOINT_GROUPS: PcbChokepointGroup[] = [
  {
    key:         "ccl",
    groupName:   "高速覆铜板/CCL",
    chokePoint:  "低Dk/Df高频高速覆铜板材料",
    description: "AI 服务器 PCB 核心基材，高频高速信号传输的物理基础。国内 CCL 供给集中，材料性能直接决定 AI 板传输带宽上限。",
    color:       "#f59e0b",
  },
  {
    key:         "multilayer",
    groupName:   "高多层PCB/AI服务器PCB",
    chokePoint:  "16层+高密度多层PCB制造",
    description: "AI 服务器主板、GPU 互联板和高速交换机 PCB 的核心制造能力。层数越高、密度越大，技术门槛越高，国产替代空间越大。",
    color:       "#3b82f6",
  },
  {
    key:         "optical-pcb",
    groupName:   "光模块/高速互联PCB",
    chokePoint:  "800G/1.6T光模块及高速互联PCB",
    description: "AI 算力互联核心载体，800G 以上光模块和高速背板是 CPO 架构的物理基础，对 PCB 制造精度要求极高。",
    color:       "#a855f7",
  },
  {
    key:         "equipment",
    groupName:   "PCB设备/耗材/制程",
    chokePoint:  "高端PCB制造设备与关键耗材",
    description: "PCB 制程的核心装备：高精密钻机、激光成像（LDI）、电镀线等。国产替代率低，是 A 股PCB设备稀缺品种。",
    color:       "#00E5A8",
  },
];

// ── 股票数据 ──────────────────────────────────────────────────────

export const PCB_CHOKEPOINT_STOCKS: PcbChokepointStock[] = [

  // ── 第一组：高速覆铜板 / CCL ────────────────────────────────────
  {
    tsCode: "600183.SH", symbol: "600183", name: "生益科技",
    primarySegment: "高速覆铜板/CCL",
    groups: ["ccl"],
    role: "高速覆铜板龙头",
    chokePointDesc: "M6/M7/M8 低Dk低Df系列CCL，AI服务器PCB核心基材，国内市场份额第一",
    technicalBarrier: "高", localizationSpace: "中高", aiDemandLevel: "极强",
    isCore: true,
    premiumMaterialScore: 92, highSpeedAppScore: 88, multilayerMfgScore: 45, aiServerBenefitScore: 92,
    notes: "国内高速CCL绝对龙头，M6/M7/M8产品大量供货AI服务器PCB，AI需求高景气直接受益",
  },
  {
    tsCode: "603186.SH", symbol: "603186", name: "华正新材",
    primarySegment: "高速覆铜板/CCL",
    groups: ["ccl"],
    role: "高频高速CCL供应商",
    chokePointDesc: "低损耗覆铜板，通信服务器高频板基材，积极布局AI服务器CCL",
    technicalBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: true,
    premiumMaterialScore: 80, highSpeedAppScore: 78, multilayerMfgScore: 42, aiServerBenefitScore: 82,
    notes: "高频高速CCL重要供应商，产品覆盖通信/服务器领域，积极研发AI服务器专用材料",
  },
  {
    tsCode: "688519.SH", symbol: "688519", name: "南亚新材",
    primarySegment: "高速覆铜板/CCL",
    groups: ["ccl"],
    role: "高端CCL供应商",
    chokePointDesc: "高端覆铜板及半固化片，国产替代进口CCL重要标的",
    technicalBarrier: "中高", localizationSpace: "高", aiDemandLevel: "强",
    isCore: true,
    premiumMaterialScore: 82, highSpeedAppScore: 76, multilayerMfgScore: 40, aiServerBenefitScore: 80,
    notes: "科创板上市，高端CCL领域国产化核心标的，半固化片领域具备竞争优势",
  },
  {
    tsCode: "002636.SZ", symbol: "002636", name: "金安国纪",
    primarySegment: "高速覆铜板/CCL",
    groups: ["ccl"],
    role: "覆铜板供应商",
    chokePointDesc: "多层板覆铜板，产品线向高频高速升级",
    technicalBarrier: "中", localizationSpace: "中高", aiDemandLevel: "中高",
    isCore: false,
    premiumMaterialScore: 65, highSpeedAppScore: 60, multilayerMfgScore: 38, aiServerBenefitScore: 65,
    notes: "覆铜板传统供应商，产品线向AI服务器需求方向升级",
  },
  {
    tsCode: "688300.SH", symbol: "688300", name: "联瑞新材",
    primarySegment: "高速覆铜板/CCL",
    groups: ["ccl"],
    role: "电子级球形硅微粉龙头",
    chokePointDesc: "CCL低介电填料核心原料，高纯度球形硅微粉，进口替代空间极大",
    technicalBarrier: "高", localizationSpace: "极高", aiDemandLevel: "强",
    isCore: true,
    premiumMaterialScore: 90, highSpeedAppScore: 72, multilayerMfgScore: 35, aiServerBenefitScore: 80,
    notes: "电子级球形硅微粉龙头，CCL低介电材料的关键填料，国内唯一达到国际水平的供应商之一",
  },
  {
    tsCode: "603002.SH", symbol: "603002", name: "宏昌电子",
    primarySegment: "高速覆铜板/CCL",
    groups: ["ccl"],
    role: "覆铜板基材供应商",
    chokePointDesc: "覆铜板基础材料，下游多层板受益AI建设",
    technicalBarrier: "中", localizationSpace: "中", aiDemandLevel: "中",
    isCore: false,
    premiumMaterialScore: 58, highSpeedAppScore: 55, multilayerMfgScore: 38, aiServerBenefitScore: 58,
    notes: "覆铜板中小供应商，产品线覆盖民用和工业",
  },
  {
    tsCode: "300936.SZ", symbol: "300936", name: "中英科技",
    primarySegment: "高速覆铜板/CCL",
    groups: ["ccl"],
    role: "高性能绝缘材料",
    chokePointDesc: "PCB专用高端绝缘材料，高频高速应用，国产替代进行中",
    technicalBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "中高",
    isCore: false,
    premiumMaterialScore: 70, highSpeedAppScore: 68, multilayerMfgScore: 38, aiServerBenefitScore: 68,
    notes: "特种绝缘材料供应商，布局AI高速PCB配套材料方向",
  },

  // ── 第二组：高多层 PCB / AI 服务器 PCB ────────────────────────
  {
    tsCode: "002463.SZ", symbol: "002463", name: "沪电股份",
    primarySegment: "高多层PCB",
    groups: ["multilayer", "optical-pcb"],
    role: "AI服务器PCB龙头",
    chokePointDesc: "高端HDI/厚铜板/背板，AI GPU服务器PCB核心供应商，技术最领先",
    technicalBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    isCore: true,
    premiumMaterialScore: 65, highSpeedAppScore: 92, multilayerMfgScore: 95, aiServerBenefitScore: 96,
    notes: "国内AI服务器PCB绝对龙头，为英伟达等AI服务器供应核心PCB，高速背板行业领先",
  },
  {
    tsCode: "300476.SZ", symbol: "300476", name: "胜宏科技",
    primarySegment: "高多层PCB",
    groups: ["multilayer", "optical-pcb"],
    role: "高多层PCB龙头",
    chokePointDesc: "高层数HDI PCB，AI算力板和高速网络设备核心供应",
    technicalBarrier: "高", localizationSpace: "中高", aiDemandLevel: "极强",
    isCore: true,
    premiumMaterialScore: 62, highSpeedAppScore: 88, multilayerMfgScore: 90, aiServerBenefitScore: 92,
    notes: "高多层PCB龙头，AI服务器PCB高景气受益，产能持续扩张",
  },
  {
    tsCode: "002916.SZ", symbol: "002916", name: "深南电路",
    primarySegment: "高多层PCB",
    groups: ["multilayer", "optical-pcb"],
    role: "高端PCB行业龙头",
    chokePointDesc: "通信/服务器高密多层PCB，技术覆盖最广，行业领先地位稳固",
    technicalBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    isCore: true,
    premiumMaterialScore: 70, highSpeedAppScore: 92, multilayerMfgScore: 94, aiServerBenefitScore: 93,
    notes: "PCB行业龙头，产品涵盖通信、服务器、数据中心，AI算力需求爆发核心受益标的",
  },
  {
    tsCode: "688183.SH", symbol: "688183", name: "生益电子",
    primarySegment: "高多层PCB",
    groups: ["multilayer", "optical-pcb"],
    role: "高频高速PCB",
    chokePointDesc: "高频通信PCB，5G/AI服务器核心供货，生益科技旗下",
    technicalBarrier: "高", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: true,
    premiumMaterialScore: 72, highSpeedAppScore: 85, multilayerMfgScore: 88, aiServerBenefitScore: 87,
    notes: "生益科技旗下PCB子公司，高频PCB领域重要标的，与母公司材料协同优势明显",
  },
  {
    tsCode: "603228.SH", symbol: "603228", name: "景旺电子",
    primarySegment: "高多层PCB",
    groups: ["multilayer"],
    role: "多层PCB重要供应商",
    chokePointDesc: "多层板和HDI，服务器/工业方向景气受益",
    technicalBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: true,
    premiumMaterialScore: 60, highSpeedAppScore: 78, multilayerMfgScore: 82, aiServerBenefitScore: 80,
    notes: "PCB行业重要供应商，多层板方向受AI算力需求拉动",
  },
  {
    tsCode: "002913.SZ", symbol: "002913", name: "奥士康",
    primarySegment: "高多层PCB",
    groups: ["multilayer"],
    role: "高多层PCB供应商",
    chokePointDesc: "16层以上多层PCB，服务器和网络通信",
    technicalBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: false,
    premiumMaterialScore: 55, highSpeedAppScore: 72, multilayerMfgScore: 78, aiServerBenefitScore: 78,
    notes: "高多层PCB重点供应商，服务器主板PCB受益",
  },
  {
    tsCode: "603920.SH", symbol: "603920", name: "世运电路",
    primarySegment: "高多层PCB",
    groups: ["multilayer"],
    role: "通信/工控PCB供应商",
    chokePointDesc: "通信基站和工业控制PCB，AI基础设施受益",
    technicalBarrier: "中", localizationSpace: "中高", aiDemandLevel: "中高",
    isCore: false,
    premiumMaterialScore: 48, highSpeedAppScore: 65, multilayerMfgScore: 68, aiServerBenefitScore: 68,
    notes: "通信工控PCB供应商，AI基础设施建设间接受益",
  },
  {
    tsCode: "002815.SZ", symbol: "002815", name: "崇达技术",
    primarySegment: "高多层PCB",
    groups: ["multilayer"],
    role: "多层PCB供应商",
    chokePointDesc: "多层PCB通信消费电子方向",
    technicalBarrier: "中", localizationSpace: "中高", aiDemandLevel: "中",
    isCore: false,
    premiumMaterialScore: 45, highSpeedAppScore: 60, multilayerMfgScore: 62, aiServerBenefitScore: 62,
    notes: "通信消费电子PCB，AI算力服务器间接受益",
  },

  // ── 第三组：光模块 / 高速互联 PCB 配套 ──────────────────────
  {
    tsCode: "002384.SZ", symbol: "002384", name: "东山精密",
    primarySegment: "光模块/高速互联PCB",
    groups: ["optical-pcb"],
    role: "FPC和精密元件",
    chokePointDesc: "高端FPC和精密连接元件，光模块高速互联配套，CPO封装辅助",
    technicalBarrier: "中高", localizationSpace: "中", aiDemandLevel: "强",
    isCore: false,
    premiumMaterialScore: 58, highSpeedAppScore: 80, multilayerMfgScore: 62, aiServerBenefitScore: 82,
    notes: "FPC和精密元件龙头，光模块高速互联配套受益AI算力爆发",
  },
  {
    tsCode: "002938.SZ", symbol: "002938", name: "鹏鼎控股",
    primarySegment: "光模块/高速互联PCB",
    groups: ["optical-pcb"],
    role: "FPC行业龙头",
    chokePointDesc: "柔性PCB（FPC）龙头，AI智能手机/数据中心FPC",
    technicalBarrier: "中高", localizationSpace: "中", aiDemandLevel: "中高",
    isCore: false,
    premiumMaterialScore: 62, highSpeedAppScore: 72, multilayerMfgScore: 55, aiServerBenefitScore: 72,
    notes: "FPC行业龙头，AI消费电子和服务器FPC受益",
  },

  // ── 第四组：PCB 设备 / 耗材 / 制程 ─────────────────────────
  {
    tsCode: "301200.SZ", symbol: "301200", name: "大族数控",
    primarySegment: "PCB设备/耗材",
    groups: ["equipment"],
    role: "PCB钻机/激光设备龙头",
    chokePointDesc: "高精密数控钻孔机和激光钻孔设备，AI服务器高密HDI PCB核心制程装备",
    technicalBarrier: "高", localizationSpace: "极高", aiDemandLevel: "强",
    isCore: true,
    premiumMaterialScore: 70, highSpeedAppScore: 82, multilayerMfgScore: 86, aiServerBenefitScore: 86,
    notes: "PCB设备龙头，数控钻机和激光设备核心供应商，AI服务器PCB制程升级直接受益",
  },
  {
    tsCode: "301377.SZ", symbol: "301377", name: "鼎泰高科",
    primarySegment: "PCB设备/耗材",
    groups: ["equipment"],
    role: "PCB微型钻头耗材龙头",
    chokePointDesc: "PCB高精密微型钻头，AI服务器高密度多层PCB核心消耗品",
    technicalBarrier: "高", localizationSpace: "高", aiDemandLevel: "强",
    isCore: true,
    premiumMaterialScore: 85, highSpeedAppScore: 80, multilayerMfgScore: 82, aiServerBenefitScore: 83,
    notes: "PCB微钻龙头，高密度PCB微孔加工核心耗材，AI服务器PCB层数增加直接拉动需求",
  },
  {
    tsCode: "688700.SH", symbol: "688700", name: "东威科技",
    primarySegment: "PCB设备/耗材",
    groups: ["equipment"],
    role: "PCB电镀设备龙头",
    chokePointDesc: "PCB高端电镀线，AI服务器厚铜PCB电镀关键工艺设备",
    technicalBarrier: "高", localizationSpace: "高", aiDemandLevel: "强",
    isCore: true,
    premiumMaterialScore: 78, highSpeedAppScore: 76, multilayerMfgScore: 84, aiServerBenefitScore: 82,
    notes: "PCB电镀设备龙头，厚铜板和AI服务器高端PCB核心制程设备，国产替代空间大",
  },
  {
    tsCode: "688630.SH", symbol: "688630", name: "芯碁微装",
    primarySegment: "PCB设备/耗材",
    groups: ["equipment"],
    role: "LDI激光直接成像设备",
    chokePointDesc: "PCB激光直接成像（LDI），高密度PCB光刻工艺核心国产化设备",
    technicalBarrier: "高", localizationSpace: "极高", aiDemandLevel: "强",
    isCore: false,
    premiumMaterialScore: 80, highSpeedAppScore: 84, multilayerMfgScore: 80, aiServerBenefitScore: 82,
    notes: "LDI设备A股稀缺标的，高密度PCB关键光刻设备，国产化率极低，替代空间大",
  },
  {
    tsCode: "688603.SH", symbol: "688603", name: "天承科技",
    primarySegment: "PCB设备/耗材",
    groups: ["equipment"],
    role: "PCB湿制程化学品",
    chokePointDesc: "PCB高端表面处理化学品，沉铜/电镀/蚀刻等关键工艺耗材",
    technicalBarrier: "中高", localizationSpace: "高", aiDemandLevel: "中高",
    isCore: false,
    premiumMaterialScore: 72, highSpeedAppScore: 68, multilayerMfgScore: 65, aiServerBenefitScore: 70,
    notes: "PCB化学品供应商，高端表面处理耗材国产化，AI服务器PCB制程需求增长受益",
  },
  {
    tsCode: "002741.SZ", symbol: "002741", name: "光华科技",
    primarySegment: "PCB设备/耗材",
    groups: ["equipment"],
    role: "PCB化学品供应商",
    chokePointDesc: "PCB蚀刻液和湿化学品，关键制程耗材",
    technicalBarrier: "中", localizationSpace: "中高", aiDemandLevel: "中",
    isCore: false,
    premiumMaterialScore: 60, highSpeedAppScore: 58, multilayerMfgScore: 55, aiServerBenefitScore: 62,
    notes: "PCB蚀刻液主要供应商，产业链配套耗材",
  },
  {
    tsCode: "300410.SZ", symbol: "300410", name: "正业科技",
    primarySegment: "PCB设备/耗材",
    groups: ["equipment"],
    role: "PCB检测设备",
    chokePointDesc: "PCB AOI光学检测和X-Ray检测设备，AI高密PCB良率控制",
    technicalBarrier: "中高", localizationSpace: "高", aiDemandLevel: "强",
    isCore: false,
    premiumMaterialScore: 65, highSpeedAppScore: 72, multilayerMfgScore: 70, aiServerBenefitScore: 75,
    notes: "PCB检测设备供应商，AI服务器高多层PCB良率要求提升拉动检测需求",
  },
];

// ── 核心重点池 ────────────────────────────────────────────────────

export const PCB_CHOKEPOINT_CORE_POOL: PcbChokepointStock[] =
  PCB_CHOKEPOINT_STOCKS.filter(s => s.isCore);

// ── 风险提示 ──────────────────────────────────────────────────────

export const PCB_CHOKEPOINT_RISKS: string[] = [
  "高速PCB需求不及预期，AI服务器采购放缓影响PCB出货量",
  "AI服务器需求波动，大客户订单周期性收缩",
  "覆铜板价格下行，CCL厂商毛利率承压",
  "上游铜箔/玻纤布/树脂原材料价格上涨，侵蚀利润空间",
  "毛利率下滑，行业竞争加剧导致产品ASP下行",
  "客户集中度高，少数大客户变化影响较大",
  "应收账款规模大，资金周转风险",
  "存货跌价风险，新品推迟导致库存积压",
  "高速PCB新进入者增多，竞争格局恶化",
  "技术路线变化，传统PCB被新型封装基板/光电共封装替代风险",
];

// ── 评分函数 ──────────────────────────────────────────────────────

export function calcPcbChokepointScore(
  stock: PcbChokepointStock,
  opts?: { pe?: number | null; pb?: number | null },
): PcbChokepointScore {
  const { premiumMaterialScore, highSpeedAppScore, multilayerMfgScore, aiServerBenefitScore } = stock;

  // 财务质量评分（10%）— 真实数据接入后可细化
  const financialQualityScore = 65;

  // 估值合理性（10%）— 基于PE/PB
  let valuationScore = 60;
  if (opts?.pe != null && opts.pe > 0) {
    if      (opts.pe < 15)  valuationScore = 90;
    else if (opts.pe < 25)  valuationScore = 80;
    else if (opts.pe < 35)  valuationScore = 70;
    else if (opts.pe < 50)  valuationScore = 55;
    else if (opts.pe < 70)  valuationScore = 42;
    else                    valuationScore = 30;
  }
  if (opts?.pb != null && opts.pe != null) {
    if (opts.pb < 2) valuationScore = Math.min(valuationScore + 5, 100);
    if (opts.pb > 8) valuationScore = Math.max(valuationScore - 12, 0);
  }

  const totalScore = Math.round(
    premiumMaterialScore  * 0.25 +
    highSpeedAppScore     * 0.20 +
    multilayerMfgScore    * 0.20 +
    aiServerBenefitScore  * 0.15 +
    financialQualityScore * 0.10 +
    valuationScore        * 0.10,
  );

  const rating: PcbChokepointScore["rating"] =
    totalScore >= 80 ? "优秀" :
    totalScore >= 60 ? "良好" :
    totalScore >= 40 ? "一般" : "较差";

  return {
    premiumMaterialScore,
    highSpeedAppScore,
    multilayerMfgScore,
    aiServerBenefitScore,
    financialQualityScore,
    valuationScore,
    totalScore,
    rating,
  };
}
