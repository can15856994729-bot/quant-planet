/**
 * lib/cpoChokepointPoolService.ts
 *
 * CPO 咽喉池 — 光芯片/激光器、硅光/光引擎、高速光模块、
 *              CPO封装/耦合/自动化设备、数据中心散热/电源配套
 *
 * CPO 产业链核心卡点：高速光芯片、硅光平台、光电共封装精密耦合、
 * 800G/1.6T/3.2T 量产能力、热管理。
 *
 * ⚠️ 产业链分类为规则匹配，需人工复核，不构成投资建议。
 */

// ── 类型定义 ──────────────────────────────────────────────────────

export type CpoChokepointGroupKey =
  | "laser"
  | "silicon-photonics"
  | "optical-module"
  | "packaging"
  | "thermal";

export interface CpoChokepointGroup {
  key:         CpoChokepointGroupKey;
  groupName:   string;
  chokePoint:  string;
  description: string;
  color:       string;
}

export interface CpoChokepointStock {
  tsCode:              string;
  symbol:              string;
  name:                string;
  primarySegment:      string;
  groups:              CpoChokepointGroupKey[];
  role:                string;
  chokePointDesc:      string;
  technicalBarrier:    "极高" | "高" | "中高" | "中" | "中低" | "低";
  localizationSpace:   "极高" | "高" | "中高" | "中" | "中低" | "低";
  aiDemandLevel:       "极强" | "强" | "中高" | "中" | "间接";
  isCore:              boolean;
  // 静态能力评分 0-100
  laserChipScore:        number;   // 光芯片/激光器能力 25%
  siliconPhotonicsScore: number;   // 硅光/光引擎/光器件能力 20%
  packagingYieldScore:   number;   // 封装耦合良率能力 20%
  moduleProductionScore: number;   // 高速光模块量产能力 15%
  notes:               string;
}

export interface CpoChokepointScore {
  laserChipScore:        number;   // 25%
  siliconPhotonicsScore: number;   // 20%
  packagingYieldScore:   number;   // 20%
  moduleProductionScore: number;   // 15%
  financialQualityScore: number;   // 10%
  valuationScore:        number;   // 10%
  totalScore:            number;
  rating:                "优秀" | "良好" | "一般" | "较差";
}

// ── 分组定义 ─────────────────────────────────────────────────────

export const CPO_CHOKEPOINT_GROUPS: CpoChokepointGroup[] = [
  {
    key:         "laser",
    groupName:   "光芯片/激光器/CW光源",
    chokePoint:  "高速光芯片和CW激光器",
    description: "CPO 的底层物理基础，决定整个光链路性能上限。光芯片/CW 激光器高度依赖进口，是国产替代最紧迫的卡脖子环节。",
    color:       "#ef4444",
  },
  {
    key:         "silicon-photonics",
    groupName:   "硅光/光引擎/光器件",
    chokePoint:  "硅光平台和光引擎集成",
    description: "CPO 的核心集成平台，将激光器、调制器、探测器集成于一体。硅光平台是实现 CPO 量产的关键技术路径。",
    color:       "#3b82f6",
  },
  {
    key:         "optical-module",
    groupName:   "高速光模块",
    chokePoint:  "800G/1.6T光模块量产",
    description: "当前最直接受益 AI 需求爆发的核心环节，800G/1.6T 光模块是数据中心 AI 算力互联的必要组件。",
    color:       "#a855f7",
  },
  {
    key:         "packaging",
    groupName:   "CPO封装/耦合/自动化设备",
    chokePoint:  "光电共封装精密耦合与良率",
    description: "CPO 量产最大的技术挑战，光芯片与电芯片的精密耦合对齐良率决定成本，自动化封测设备是产业化的关键。",
    color:       "#00E5A8",
  },
  {
    key:         "thermal",
    groupName:   "数据中心散热/电源配套",
    chokePoint:  "AI算力热管理与供电",
    description: "AI 服务器功耗急剧增加，液冷散热和高效电源成为数据中心基础设施的核心约束，受益于 AI 投资持续增长。",
    color:       "#f59e0b",
  },
];

// ── 股票数据 ──────────────────────────────────────────────────────

export const CPO_CHOKEPOINT_STOCKS: CpoChokepointStock[] = [

  // ── 第一组：光芯片 / 激光器 / CW 光源 ────────────────────────
  {
    tsCode: "688498.SH", symbol: "688498", name: "源杰科技",
    primarySegment: "光芯片/激光器",
    groups: ["laser"],
    role: "高速光芯片龙头",
    chokePointDesc: "EML/DFB激光器芯片，800G光模块核心光芯片，国产替代率极低",
    technicalBarrier: "极高", localizationSpace: "极高", aiDemandLevel: "极强",
    isCore: true,
    laserChipScore: 95, siliconPhotonicsScore: 62, packagingYieldScore: 45, moduleProductionScore: 40,
    notes: "国内高速光芯片龙头，EML芯片量产能力持续提升，CPO商业化核心受益标的",
  },
  {
    tsCode: "688048.SH", symbol: "688048", name: "长光华芯",
    primarySegment: "光芯片/激光器",
    groups: ["laser"],
    role: "半导体激光器芯片",
    chokePointDesc: "高功率半导体激光器芯片，泵浦激光器、光纤激光器核心芯片，进口替代重要标的",
    technicalBarrier: "高", localizationSpace: "高", aiDemandLevel: "强",
    isCore: true,
    laserChipScore: 90, siliconPhotonicsScore: 55, packagingYieldScore: 42, moduleProductionScore: 38,
    notes: "国内半导体激光器芯片龙头，高功率激光芯片国产化重要推动力",
  },
  {
    tsCode: "688313.SH", symbol: "688313", name: "仕佳光子",
    primarySegment: "光芯片/光器件",
    groups: ["laser", "silicon-photonics"],
    role: "光芯片/光分路器",
    chokePointDesc: "PLC光分路器芯片和光收发芯片，光器件核心基础元件",
    technicalBarrier: "高", localizationSpace: "高", aiDemandLevel: "强",
    isCore: true,
    laserChipScore: 85, siliconPhotonicsScore: 82, packagingYieldScore: 65, moduleProductionScore: 55,
    notes: "光芯片和光分路器龙头，产品覆盖多个CPO核心器件，受益AI通信链路扩容",
  },
  {
    tsCode: "300620.SZ", symbol: "300620", name: "光库科技",
    primarySegment: "光芯片/光器件",
    groups: ["laser", "silicon-photonics"],
    role: "光隔离器/光环行器",
    chokePointDesc: "高端光隔离器、光环行器、光放大器，CPO和高速光模块关键无源/有源器件",
    technicalBarrier: "高", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: true,
    laserChipScore: 82, siliconPhotonicsScore: 85, packagingYieldScore: 70, moduleProductionScore: 62,
    notes: "光隔离器/光环行器国内龙头，高端光器件长期受益AI光通信需求扩张",
  },

  // ── 第二组：硅光 / 光引擎 / 光器件 ─────────────────────────
  {
    tsCode: "300394.SZ", symbol: "300394", name: "天孚通信",
    primarySegment: "光器件/光引擎",
    groups: ["silicon-photonics"],
    role: "光纤连接器/精密光器件",
    chokePointDesc: "高端光纤连接器、精密光器件，光引擎关键配套，高速光通信核心组件",
    technicalBarrier: "高", localizationSpace: "中高", aiDemandLevel: "极强",
    isCore: true,
    laserChipScore: 55, siliconPhotonicsScore: 90, packagingYieldScore: 88, moduleProductionScore: 72,
    notes: "光纤连接器和精密光器件龙头，高速光模块和CPO关键配套，AI需求爆发直接受益",
  },
  {
    tsCode: "300570.SZ", symbol: "300570", name: "太辰光",
    primarySegment: "光器件/光引擎",
    groups: ["silicon-photonics"],
    role: "光纤连接/光器件",
    chokePointDesc: "光纤适配器和高精密光器件，高速互联配套组件",
    technicalBarrier: "高", localizationSpace: "中高", aiDemandLevel: "极强",
    isCore: true,
    laserChipScore: 45, siliconPhotonicsScore: 88, packagingYieldScore: 82, moduleProductionScore: 68,
    notes: "光纤连接器和光器件重要供应商，高速光通信AI需求爆发核心受益",
  },
  {
    tsCode: "300548.SZ", symbol: "300548", name: "博创科技",
    primarySegment: "光器件/光模块",
    groups: ["silicon-photonics", "optical-module"],
    role: "光模块/光引擎",
    chokePointDesc: "高速光模块和光引擎，布局CPO光引擎集成，数据中心光互联",
    technicalBarrier: "高", localizationSpace: "中高", aiDemandLevel: "极强",
    isCore: true,
    laserChipScore: 58, siliconPhotonicsScore: 85, packagingYieldScore: 78, moduleProductionScore: 82,
    notes: "光模块和光引擎供应商，CPO光引擎布局先行者，AI需求拉动高速光模块需求",
  },
  {
    tsCode: "301205.SZ", symbol: "301205", name: "联特科技",
    primarySegment: "高速光模块",
    groups: ["silicon-photonics", "optical-module"],
    role: "高速光模块",
    chokePointDesc: "100G/400G/800G高速光模块，数据中心AI算力互联核心配套",
    technicalBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "极强",
    isCore: false,
    laserChipScore: 45, siliconPhotonicsScore: 75, packagingYieldScore: 72, moduleProductionScore: 85,
    notes: "高速光模块重要供应商，400G/800G产品线持续扩张，受益AI数据中心需求",
  },

  // ── 第三组：高速光模块 ───────────────────────────────────────
  {
    tsCode: "300308.SZ", symbol: "300308", name: "中际旭创",
    primarySegment: "高速光模块",
    groups: ["optical-module"],
    role: "高速光模块绝对龙头",
    chokePointDesc: "400G/800G/1.6T高速光模块，全球AI数据中心核心供应商，市场份额领先",
    technicalBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    isCore: true,
    laserChipScore: 68, siliconPhotonicsScore: 80, packagingYieldScore: 92, moduleProductionScore: 98,
    notes: "高速光模块全球领导者，800G/1.6T产品已量产出货，AI算力需求爆发最直接受益标的",
  },
  {
    tsCode: "300502.SZ", symbol: "300502", name: "新易盛",
    primarySegment: "高速光模块",
    groups: ["optical-module"],
    role: "高速光模块龙头",
    chokePointDesc: "高速硅光光模块，800G/1.6T产品布局，AI互联核心供应商",
    technicalBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    isCore: true,
    laserChipScore: 62, siliconPhotonicsScore: 78, packagingYieldScore: 90, moduleProductionScore: 95,
    notes: "高速硅光光模块龙头，800G产品量产，硅光技术路线领先，AI需求爆发核心受益",
  },
  {
    tsCode: "002281.SZ", symbol: "002281", name: "光迅科技",
    primarySegment: "高速光模块",
    groups: ["optical-module"],
    role: "光模块/光芯片综合龙头",
    chokePointDesc: "光模块与光芯片一体化布局，国家队背景，产品线最全面的光器件综合供应商",
    technicalBarrier: "高", localizationSpace: "中高", aiDemandLevel: "极强",
    isCore: true,
    laserChipScore: 78, siliconPhotonicsScore: 82, packagingYieldScore: 86, moduleProductionScore: 90,
    notes: "光迅科技为烽火通信旗下，光模块+光芯片全产业链布局，国家队背景，综合竞争力强",
  },
  {
    tsCode: "000988.SZ", symbol: "000988", name: "华工科技",
    primarySegment: "高速光模块",
    groups: ["optical-module"],
    role: "光模块/激光器材综合供应商",
    chokePointDesc: "光模块、激光器和激光加工综合供应商，数据中心AI光通信受益",
    technicalBarrier: "高", localizationSpace: "中高", aiDemandLevel: "极强",
    isCore: true,
    laserChipScore: 74, siliconPhotonicsScore: 72, packagingYieldScore: 80, moduleProductionScore: 88,
    notes: "华工科技旗下光模块业务AI数据中心受益，激光器材和激光加工多元布局",
  },
  {
    tsCode: "603083.SH", symbol: "603083", name: "剑桥科技",
    primarySegment: "高速光模块",
    groups: ["optical-module"],
    role: "光模块供应商",
    chokePointDesc: "数据中心高速光模块，400G/800G产品方向",
    technicalBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: false,
    laserChipScore: 50, siliconPhotonicsScore: 62, packagingYieldScore: 75, moduleProductionScore: 82,
    notes: "光模块供应商，布局高速数据中心光模块产品，AI需求拉动受益",
  },

  // ── 第四组：CPO 封装 / 耦合 / 自动化设备 ────────────────────
  {
    tsCode: "300757.SZ", symbol: "300757", name: "罗博特科",
    primarySegment: "CPO封装设备",
    groups: ["packaging"],
    role: "光模块自动化封测设备",
    chokePointDesc: "光模块自动化封装和测试设备，CPO量产的核心制程装备，A股稀缺标的",
    technicalBarrier: "高", localizationSpace: "极高", aiDemandLevel: "强",
    isCore: true,
    laserChipScore: 35, siliconPhotonicsScore: 52, packagingYieldScore: 88, moduleProductionScore: 68,
    notes: "光模块自动化封测设备龙头，CPO量产必需的精密封装设备，国产替代空间极大",
  },
  {
    tsCode: "002185.SZ", symbol: "002185", name: "华天科技",
    primarySegment: "CPO封装/测试",
    groups: ["packaging"],
    role: "先进封装OSAT",
    chokePointDesc: "先进封装OSAT，CPO所需的先进封装能力，Chiplet和光电共封装方向布局",
    technicalBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "中高",
    isCore: false,
    laserChipScore: 30, siliconPhotonicsScore: 48, packagingYieldScore: 82, moduleProductionScore: 58,
    notes: "国内OSAT龙头之一，布局先进封装方向，CPO商业化受益封装需求增长",
  },
  {
    tsCode: "600584.SH", symbol: "600584", name: "长电科技",
    primarySegment: "CPO封装/测试",
    groups: ["packaging"],
    role: "OSAT封装龙头",
    chokePointDesc: "全球TOP3封装测试，先进封装SiP/Chiplet能力，为CPO光电集成提供封装基础",
    technicalBarrier: "高", localizationSpace: "中", aiDemandLevel: "中高",
    isCore: false,
    laserChipScore: 35, siliconPhotonicsScore: 52, packagingYieldScore: 85, moduleProductionScore: 58,
    notes: "全球第三大封装测试公司，先进封装能力强，CPO光电集成封装长期受益",
  },
  {
    tsCode: "002156.SZ", symbol: "002156", name: "通富微电",
    primarySegment: "CPO封装/测试",
    groups: ["packaging"],
    role: "先进封装/倒装焊",
    chokePointDesc: "倒装芯片封装和先进Chiplet封装，AI芯片封装核心受益",
    technicalBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "中高",
    isCore: false,
    laserChipScore: 30, siliconPhotonicsScore: 45, packagingYieldScore: 78, moduleProductionScore: 52,
    notes: "先进封装OSAT，AI芯片封装测试需求增长受益，布局Chiplet先进封装",
  },
  {
    tsCode: "300567.SZ", symbol: "300567", name: "精测电子",
    primarySegment: "CPO封装/测试",
    groups: ["packaging"],
    role: "光电测试设备",
    chokePointDesc: "显示/半导体/光电测试设备，光通信器件测试配套",
    technicalBarrier: "中高", localizationSpace: "高", aiDemandLevel: "中高",
    isCore: false,
    laserChipScore: 25, siliconPhotonicsScore: 45, packagingYieldScore: 74, moduleProductionScore: 52,
    notes: "精密测试设备供应商，光电测试方向布局，CPO量产测试需求受益",
  },

  // ── 第五组：数据中心散热 / 电源配套 ─────────────────────────
  {
    tsCode: "002837.SZ", symbol: "002837", name: "英维克",
    primarySegment: "数据中心散热",
    groups: ["thermal"],
    role: "数据中心精密空调/液冷龙头",
    chokePointDesc: "数据中心精密空调和液冷系统，AI服务器热管理核心供应商",
    technicalBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: false,
    laserChipScore: 20, siliconPhotonicsScore: 25, packagingYieldScore: 40, moduleProductionScore: 35,
    notes: "数据中心液冷和精密空调龙头，AI服务器功耗急剧上升拉动冷却需求",
  },
  {
    tsCode: "301018.SZ", symbol: "301018", name: "申菱环境",
    primarySegment: "数据中心散热",
    groups: ["thermal"],
    role: "数据中心冷却设备",
    chokePointDesc: "工业和数据中心冷却系统，AI算力中心散热配套",
    technicalBarrier: "中", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: false,
    laserChipScore: 15, siliconPhotonicsScore: 20, packagingYieldScore: 38, moduleProductionScore: 30,
    notes: "工业冷却和数据中心散热方案供应商，AI算力投资拉动需求",
  },
  {
    tsCode: "002335.SZ", symbol: "002335", name: "科华数据",
    primarySegment: "数据中心电源",
    groups: ["thermal"],
    role: "UPS/数据中心电源",
    chokePointDesc: "数据中心UPS和精密配电，AI算力中心供电基础设施",
    technicalBarrier: "中", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: false,
    laserChipScore: 18, siliconPhotonicsScore: 22, packagingYieldScore: 35, moduleProductionScore: 32,
    notes: "UPS和数据中心电源龙头，AI服务器规模扩大推动供电基础设施需求",
  },
  {
    tsCode: "002518.SZ", symbol: "002518", name: "科士达",
    primarySegment: "数据中心电源",
    groups: ["thermal"],
    role: "数据中心UPS/储能",
    chokePointDesc: "数据中心UPS和储能系统，AI算力中心电力配套",
    technicalBarrier: "中", localizationSpace: "中高", aiDemandLevel: "强",
    isCore: false,
    laserChipScore: 15, siliconPhotonicsScore: 20, packagingYieldScore: 35, moduleProductionScore: 30,
    notes: "UPS和储能系统供应商，数据中心电力基础设施需求受益AI投资",
  },
  {
    tsCode: "002364.SZ", symbol: "002364", name: "中恒电气",
    primarySegment: "数据中心电源",
    groups: ["thermal"],
    role: "通信电源/数据中心配电",
    chokePointDesc: "通信电源和数据中心配电系统，AI算力设施供电配套",
    technicalBarrier: "中", localizationSpace: "中高", aiDemandLevel: "中高",
    isCore: false,
    laserChipScore: 15, siliconPhotonicsScore: 18, packagingYieldScore: 30, moduleProductionScore: 28,
    notes: "通信电源和数据中心配电，AI算力基础设施电力需求间接受益",
  },
];

// ── 核心重点池 ────────────────────────────────────────────────────

export const CPO_CHOKEPOINT_CORE_POOL: CpoChokepointStock[] =
  CPO_CHOKEPOINT_STOCKS.filter(s => s.isCore);

// ── 风险提示 ──────────────────────────────────────────────────────

export const CPO_CHOKEPOINT_RISKS: string[] = [
  "AI服务器需求不及预期，大规模算力投资放缓影响光模块出货",
  "海外大客户订单波动，少数客户集中度高带来收入不确定性",
  "光模块价格下行，800G及以上高速模块ASP竞争性下滑",
  "毛利率下滑，原材料涨价和产品降价双重挤压",
  "CPO商业化进度不及预期，传统光模块方案仍为主流",
  "硅光/CPO技术路线变化，部分现有供应商技术路线被迭代",
  "光耦合良率不及预期，CPO封装技术难题导致量产成本居高不下",
  "客户集中度高，头部云厂商资本开支缩减影响较大",
  "海外贸易限制，光芯片进口受限影响国内光模块厂商成本",
  "估值过高，光通信板块整体高溢价存在回调风险",
];

// ── 评分函数 ──────────────────────────────────────────────────────

export function calcCpoChokepointScore(
  stock: CpoChokepointStock,
  opts?: { pe?: number | null; pb?: number | null },
): CpoChokepointScore {
  const { laserChipScore, siliconPhotonicsScore, packagingYieldScore, moduleProductionScore } = stock;

  // 财务质量（10%）— 默认65，真实数据接入后可细化
  const financialQualityScore = 65;

  // 估值合理性（10%）— 基于PE/PB
  let valuationScore = 60;
  if (opts?.pe != null && opts.pe > 0) {
    if      (opts.pe < 20)  valuationScore = 88;
    else if (opts.pe < 35)  valuationScore = 75;
    else if (opts.pe < 55)  valuationScore = 60;
    else if (opts.pe < 80)  valuationScore = 45;
    else if (opts.pe < 120) valuationScore = 35;
    else                    valuationScore = 25;
  }
  if (opts?.pb != null) {
    if (opts.pb < 3)  valuationScore = Math.min(valuationScore + 5, 100);
    if (opts.pb > 10) valuationScore = Math.max(valuationScore - 12, 0);
  }

  const totalScore = Math.round(
    laserChipScore        * 0.25 +
    siliconPhotonicsScore * 0.20 +
    packagingYieldScore   * 0.20 +
    moduleProductionScore * 0.15 +
    financialQualityScore * 0.10 +
    valuationScore        * 0.10,
  );

  const rating: CpoChokepointScore["rating"] =
    totalScore >= 80 ? "优秀" :
    totalScore >= 60 ? "良好" :
    totalScore >= 40 ? "一般" : "较差";

  return {
    laserChipScore,
    siliconPhotonicsScore,
    packagingYieldScore,
    moduleProductionScore,
    financialQualityScore,
    valuationScore,
    totalScore,
    rating,
  };
}
