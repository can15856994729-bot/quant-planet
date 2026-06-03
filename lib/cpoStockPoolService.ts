/**
 * lib/cpoStockPoolService.ts
 *
 * CPO / 共封装光学 / 高速光通信 产业链内置股票池服务
 * ────────────────────────────────────────────────────────────────────────────
 * 内置 A股 CPO 产业链分类股票池，按细分环节和投资逻辑分组。
 *
 * ⚠️ 免责声明：
 *   本股票池基于公开市场行业分类整理，不代表具体客户/供应商关系。
 *   产业链映射为规则匹配结果，需人工复核，不构成投资建议。
 */

// ── 类型定义 ──────────────────────────────────────────────────────────────

export type CpoSegment =
  | "高速光模块"
  | "光器件/光引擎"
  | "光芯片/激光器"
  | "光纤连接/通信网络"
  | "CPO设备/封装/测试"
  | "AI服务器PCB/高速互联"
  | "数据中心散热/电源";

export type CpoInvestmentGroup =
  | "高速光模块"
  | "光器件/光引擎"
  | "光芯片/激光器"
  | "光纤连接/通信网络"
  | "CPO封装/设备/测试"
  | "AI服务器PCB/高速互联"
  | "数据中心散热/电源";

export interface CpoStock {
  tsCode:                 string;
  symbol:                 string;
  name:                   string;
  segment:                CpoSegment;
  investmentGroups:       CpoInvestmentGroup[];
  techBarrier:            "高" | "中高" | "中" | "中低" | "低";
  localizationSpace:      "大" | "中高" | "中" | "中低" | "小";
  aiDemandLevel:          "极强" | "强" | "中高" | "中" | "间接";
  downstreamApplications: string[];
  note:                   string;
  // 静态评分因子 (0-100)
  valueRatioScore:        number;   // 环节价值量
  techBarrierScore:       number;   // 技术壁垒
  aiDemandScore:          number;   // AI算力需求受益度
  localizationScore:      number;   // 国产替代空间
  isCore:                 boolean;
}

export interface CpoGroupDef {
  key:   CpoInvestmentGroup;
  label: string;
  desc:  string;
  color: string;
}

export interface CpoScore {
  tsCode:                string;
  valueRatioScore:       number;   // 20%
  techBarrierScore:      number;   // 20%
  aiDemandScore:         number;   // 20%
  localizationScore:     number;   // 15%
  financialQualityScore: number;   // 15%
  valuationScore:        number;   // 10%
  totalScore:            number;   // 0-100
  rating:                "优秀" | "良好" | "一般" | "较差";
}

// ── 投资逻辑分组定义 ─────────────────────────────────────────────────────

export const CPO_INVESTMENT_GROUPS: CpoGroupDef[] = [
  {
    key:   "高速光模块",
    label: "高速光模块",
    desc:  "800G/1.6T 高速光模块是 AI 数据中心高速互联核心器件，直接受益于算力基础设施建设；海外大客户订单是核心驱动因素",
    color: "#a855f7",
  },
  {
    key:   "光器件/光引擎",
    label: "光器件/光引擎",
    desc:  "光无源器件和光引擎是 CPO 方案关键配套环节，技术壁垒较高；随 CPO 商业化推进，光引擎重要性持续提升",
    color: "#3b82f6",
  },
  {
    key:   "光芯片/激光器",
    label: "光芯片/激光器",
    desc:  "光芯片（InP/硅光）和激光器是 CPO/光模块最上游核心元器件，技术壁垒最高，国产替代空间最大，但业绩和估值波动大",
    color: "#ef4444",
  },
  {
    key:   "光纤连接/通信网络",
    label: "光纤连接",
    desc:  "光纤光缆和通信网络设备是 AI 数据中心基础设施配套，随算力扩张间接受益；业绩弹性相对低于光模块",
    color: "#f59e0b",
  },
  {
    key:   "CPO封装/设备/测试",
    label: "CPO封装/测试",
    desc:  "先进封装设备和光通信测试设备受益于 CPO 产业化；注意部分公司非纯 CPO 主业，需人工复核",
    color: "#00E5A8",
  },
  {
    key:   "AI服务器PCB/高速互联",
    label: "AI服务器PCB",
    desc:  "CPO 和高速光模块最终服务 AI 服务器，高速高频 PCB 和覆铜板受益于算力基础设施投资",
    color: "#22c55e",
  },
  {
    key:   "数据中心散热/电源",
    label: "散热/电源",
    desc:  "高功耗光模块和 AI 服务器推动数据中心散热和电源配套需求；与 CPO 相关性为间接受益",
    color: "#64748b",
  },
];

// ── CPO 产业链股票池（完整版）────────────────────────────────────────────

export const CPO_STOCKS: CpoStock[] = [

  // ── 1. 高速光模块 ─────────────────────────────────────────────────────
  {
    tsCode: "300308.SZ", symbol: "300308", name: "中际旭创",
    segment: "高速光模块",
    investmentGroups: ["高速光模块"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    downstreamApplications: ["AI数据中心", "800G/1.6T光模块", "海外云计算客户"],
    note: "A股光模块绝对龙头，800G/1.6T放量，海外大客户核心供应商",
    valueRatioScore: 92, techBarrierScore: 90, aiDemandScore: 98,
    localizationScore: 70, isCore: true,
  },
  {
    tsCode: "300502.SZ", symbol: "300502", name: "新易盛",
    segment: "高速光模块",
    investmentGroups: ["高速光模块"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    downstreamApplications: ["AI数据中心", "800G/1.6T光模块", "海外云计算客户"],
    note: "高速光模块核心标的，800G产品持续放量，AI算力受益弹性大",
    valueRatioScore: 90, techBarrierScore: 88, aiDemandScore: 96,
    localizationScore: 70, isCore: true,
  },
  {
    tsCode: "002281.SZ", symbol: "002281", name: "光迅科技",
    segment: "高速光模块",
    investmentGroups: ["高速光模块"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    downstreamApplications: ["AI数据中心", "高速光模块", "通信运营商"],
    note: "烽火集团旗下，光模块+光芯片自研，产品覆盖800G",
    valueRatioScore: 88, techBarrierScore: 88, aiDemandScore: 92,
    localizationScore: 72, isCore: true,
  },
  {
    tsCode: "000988.SZ", symbol: "000988", name: "华工科技",
    segment: "高速光模块",
    investmentGroups: ["高速光模块"],
    techBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "强",
    downstreamApplications: ["光模块", "激光应用", "智能制造"],
    note: "华中科技大学系，光模块+激光+智能制造综合布局",
    valueRatioScore: 80, techBarrierScore: 78, aiDemandScore: 85,
    localizationScore: 78, isCore: true,
  },
  {
    tsCode: "603083.SH", symbol: "603083", name: "剑桥科技",
    segment: "高速光模块",
    investmentGroups: ["高速光模块"],
    techBarrier: "中高", localizationSpace: "中", aiDemandLevel: "强",
    downstreamApplications: ["光模块", "光收发器", "数据中心"],
    note: "光模块供应商，积极布局高速光模块产品线",
    valueRatioScore: 75, techBarrierScore: 72, aiDemandScore: 82,
    localizationScore: 68, isCore: true,
  },
  {
    tsCode: "301205.SZ", symbol: "301205", name: "联特科技",
    segment: "高速光模块",
    investmentGroups: ["高速光模块", "光器件/光引擎"],
    techBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "强",
    downstreamApplications: ["高速光模块", "光无源器件", "数据中心"],
    note: "光模块+光器件双主业，高速产品持续升级",
    valueRatioScore: 78, techBarrierScore: 76, aiDemandScore: 85,
    localizationScore: 75, isCore: true,
  },
  {
    tsCode: "300548.SZ", symbol: "300548", name: "博创科技",
    segment: "高速光模块",
    investmentGroups: ["高速光模块", "光器件/光引擎"],
    techBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "强",
    downstreamApplications: ["高速光模块", "光引擎", "数据中心"],
    note: "光模块+光引擎布局，CPO产品线持续推进",
    valueRatioScore: 80, techBarrierScore: 78, aiDemandScore: 86,
    localizationScore: 76, isCore: true,
  },

  // ── 2. 光器件 / 光引擎 ────────────────────────────────────────────────
  {
    tsCode: "300394.SZ", symbol: "300394", name: "天孚通信",
    segment: "光器件/光引擎",
    investmentGroups: ["光器件/光引擎"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    downstreamApplications: ["光无源器件", "光引擎", "CPO配套"],
    note: "光无源器件龙头，CPO核心配套方向，毛利率高，客户结构优质",
    valueRatioScore: 90, techBarrierScore: 90, aiDemandScore: 95,
    localizationScore: 68, isCore: true,
  },
  {
    tsCode: "300570.SZ", symbol: "300570", name: "太辰光",
    segment: "光器件/光引擎",
    investmentGroups: ["光器件/光引擎"],
    techBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "强",
    downstreamApplications: ["光连接器", "光无源器件", "数据中心"],
    note: "光连接器+光无源器件，AI数据中心需求持续放量",
    valueRatioScore: 80, techBarrierScore: 78, aiDemandScore: 85,
    localizationScore: 75, isCore: true,
  },
  {
    tsCode: "688313.SH", symbol: "688313", name: "仕佳光子",
    segment: "光器件/光引擎",
    investmentGroups: ["光器件/光引擎", "光芯片/激光器"],
    techBarrier: "高", localizationSpace: "大", aiDemandLevel: "极强",
    downstreamApplications: ["光芯片", "AWG器件", "硅光", "CPO"],
    note: "光芯片和AWG器件龙头，硅光和CPO重要布局，国产替代旗手",
    valueRatioScore: 90, techBarrierScore: 92, aiDemandScore: 95,
    localizationScore: 92, isCore: true,
  },
  {
    tsCode: "300620.SZ", symbol: "300620", name: "光库科技",
    segment: "光器件/光引擎",
    investmentGroups: ["光器件/光引擎", "光芯片/激光器"],
    techBarrier: "高", localizationSpace: "大", aiDemandLevel: "极强",
    downstreamApplications: ["集成化光模块", "光引擎", "硅光芯片"],
    note: "硅光+光引擎布局，CPO方案核心器件供应商",
    valueRatioScore: 88, techBarrierScore: 90, aiDemandScore: 94,
    localizationScore: 88, isCore: true,
  },

  // ── 3. 光芯片 / 激光器 ────────────────────────────────────────────────
  {
    tsCode: "688498.SH", symbol: "688498", name: "源杰科技",
    segment: "光芯片/激光器",
    investmentGroups: ["光芯片/激光器"],
    techBarrier: "高", localizationSpace: "大", aiDemandLevel: "极强",
    downstreamApplications: ["EML激光器芯片", "光模块上游", "CPO光源"],
    note: "国内EML/CW激光器芯片龙头，CPO核心光源国产替代",
    valueRatioScore: 92, techBarrierScore: 94, aiDemandScore: 96,
    localizationScore: 95, isCore: true,
  },
  {
    tsCode: "688048.SH", symbol: "688048", name: "长光华芯",
    segment: "光芯片/激光器",
    investmentGroups: ["光芯片/激光器"],
    techBarrier: "高", localizationSpace: "大", aiDemandLevel: "强",
    downstreamApplications: ["半导体激光器芯片", "工业激光", "光通信"],
    note: "半导体激光芯片龙头，布局光通信/CPO方向，技术壁垒极高",
    valueRatioScore: 90, techBarrierScore: 92, aiDemandScore: 88,
    localizationScore: 92, isCore: true,
  },

  // ── 4. 光纤连接 / 通信网络 ────────────────────────────────────────────
  {
    tsCode: "600487.SH", symbol: "600487", name: "亨通光电",
    segment: "光纤连接/通信网络",
    investmentGroups: ["光纤连接/通信网络"],
    techBarrier: "中", localizationSpace: "中", aiDemandLevel: "中高",
    downstreamApplications: ["光纤光缆", "数据中心互联", "通信运营商"],
    note: "光纤光缆龙头，AI数据中心光纤用量提升受益",
    valueRatioScore: 72, techBarrierScore: 65, aiDemandScore: 75,
    localizationScore: 70, isCore: true,
  },
  {
    tsCode: "600522.SH", symbol: "600522", name: "中天科技",
    segment: "光纤连接/通信网络",
    investmentGroups: ["光纤连接/通信网络"],
    techBarrier: "中", localizationSpace: "中", aiDemandLevel: "中高",
    downstreamApplications: ["光纤光缆", "海缆", "电力传输"],
    note: "光纤光缆+海缆综合龙头，数据中心和海上互联配套",
    valueRatioScore: 70, techBarrierScore: 65, aiDemandScore: 72,
    localizationScore: 68, isCore: true,
  },
  {
    tsCode: "600498.SH", symbol: "600498", name: "烽火通信",
    segment: "光纤连接/通信网络",
    investmentGroups: ["光纤连接/通信网络"],
    techBarrier: "中高", localizationSpace: "中", aiDemandLevel: "中高",
    downstreamApplications: ["通信设备", "光纤光缆", "数据中心解决方案"],
    note: "烽火集团通信设备主体，提供完整数据中心光互联方案",
    valueRatioScore: 72, techBarrierScore: 68, aiDemandScore: 72,
    localizationScore: 68, isCore: false,
  },
  {
    tsCode: "600105.SH", symbol: "600105", name: "永鼎股份",
    segment: "光纤连接/通信网络",
    investmentGroups: ["光纤连接/通信网络"],
    techBarrier: "中", localizationSpace: "中", aiDemandLevel: "中高",
    downstreamApplications: ["特种光纤", "光通信配件", "超导"],
    note: "特种光纤+超导+光通信，关注AI数据中心特种光纤需求",
    valueRatioScore: 65, techBarrierScore: 62, aiDemandScore: 68,
    localizationScore: 68, isCore: false,
  },
  {
    tsCode: "601869.SH", symbol: "601869", name: "长飞光纤",
    segment: "光纤连接/通信网络",
    investmentGroups: ["光纤连接/通信网络"],
    techBarrier: "中高", localizationSpace: "中", aiDemandLevel: "中高",
    downstreamApplications: ["光纤光缆", "数据中心预制光缆", "通信"],
    note: "光纤光缆全球前三，数据中心预制光缆受益AI建设",
    valueRatioScore: 72, techBarrierScore: 68, aiDemandScore: 75,
    localizationScore: 68, isCore: false,
  },
  {
    tsCode: "000070.SZ", symbol: "000070", name: "特发信息",
    segment: "光纤连接/通信网络",
    investmentGroups: ["光纤连接/通信网络"],
    techBarrier: "中", localizationSpace: "中", aiDemandLevel: "中",
    downstreamApplications: ["光纤配件", "通信工程", "数据中心"],
    note: "特发集团信息产业，光纤连接产品配套",
    valueRatioScore: 58, techBarrierScore: 58, aiDemandScore: 62,
    localizationScore: 62, isCore: false,
  },

  // ── 5. CPO 设备 / 封装 / 测试 ─────────────────────────────────────────
  {
    tsCode: "300757.SZ", symbol: "300757", name: "罗博特科",
    segment: "CPO设备/封装/测试",
    investmentGroups: ["CPO封装/设备/测试"],
    techBarrier: "中高", localizationSpace: "大", aiDemandLevel: "中高",
    downstreamApplications: ["光通信设备", "先进封装设备", "精密制造"],
    note: "光通信设备自动化，布局CPO相关封装设备",
    valueRatioScore: 75, techBarrierScore: 72, aiDemandScore: 78,
    localizationScore: 80, isCore: true,
  },
  {
    tsCode: "002185.SZ", symbol: "002185", name: "华天科技",
    segment: "CPO设备/封装/测试",
    investmentGroups: ["CPO封装/设备/测试"],
    techBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "中高",
    downstreamApplications: ["先进封装", "半导体封装测试", "光电集成"],
    note: "先进封装龙头之一，布局光电共封装相关技术",
    valueRatioScore: 78, techBarrierScore: 76, aiDemandScore: 80,
    localizationScore: 80, isCore: true,
  },
  {
    tsCode: "600584.SH", symbol: "600584", name: "长电科技",
    segment: "CPO设备/封装/测试",
    investmentGroups: ["CPO封装/设备/测试"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "中高",
    downstreamApplications: ["先进封装", "Chiplet封装", "光电集成"],
    note: "国内最大封装测试企业，先进封装和CPO相关封装受益",
    valueRatioScore: 80, techBarrierScore: 80, aiDemandScore: 82,
    localizationScore: 72, isCore: false,
  },
  {
    tsCode: "002156.SZ", symbol: "002156", name: "通富微电",
    segment: "CPO设备/封装/测试",
    investmentGroups: ["CPO封装/设备/测试"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "中高",
    downstreamApplications: ["先进封装", "AI芯片封装", "光电封装"],
    note: "先进封装龙头，AMD核心供应商，光电共封装布局",
    valueRatioScore: 82, techBarrierScore: 82, aiDemandScore: 84,
    localizationScore: 72, isCore: false,
  },
  {
    tsCode: "000021.SZ", symbol: "000021", name: "深科技",
    segment: "CPO设备/封装/测试",
    investmentGroups: ["CPO封装/设备/测试"],
    techBarrier: "中", localizationSpace: "中", aiDemandLevel: "中",
    downstreamApplications: ["存储封装", "光通信配套"],
    note: "存储+光通信相关封装，间接受益AI数据中心",
    valueRatioScore: 60, techBarrierScore: 60, aiDemandScore: 65,
    localizationScore: 65, isCore: false,
  },
  {
    tsCode: "300456.SZ", symbol: "300456", name: "赛微电子",
    segment: "CPO设备/封装/测试",
    investmentGroups: ["CPO封装/设备/测试"],
    techBarrier: "高", localizationSpace: "大", aiDemandLevel: "强",
    downstreamApplications: ["MEMS", "硅光子晶圆代工", "光通信芯片"],
    note: "MEMS和硅光子晶圆代工，硅光CPO核心制造方向",
    valueRatioScore: 85, techBarrierScore: 88, aiDemandScore: 88,
    localizationScore: 90, isCore: false,
  },
  {
    tsCode: "300567.SZ", symbol: "300567", name: "精测电子",
    segment: "CPO设备/封装/测试",
    investmentGroups: ["CPO封装/设备/测试"],
    techBarrier: "中高", localizationSpace: "大", aiDemandLevel: "中高",
    downstreamApplications: ["光通信测试设备", "半导体测试", "面板测试"],
    note: "光通信+半导体测试设备，受益CPO产业化测试需求",
    valueRatioScore: 72, techBarrierScore: 72, aiDemandScore: 75,
    localizationScore: 80, isCore: false,
  },

  // ── 6. AI 服务器 PCB / 高速互联 ───────────────────────────────────────
  {
    tsCode: "002463.SZ", symbol: "002463", name: "沪电股份",
    segment: "AI服务器PCB/高速互联",
    investmentGroups: ["AI服务器PCB/高速互联"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    downstreamApplications: ["AI服务器高端PCB", "高速互联基板"],
    note: "AI服务器高端PCB龙头，CPO配套高速板材受益",
    valueRatioScore: 85, techBarrierScore: 85, aiDemandScore: 92,
    localizationScore: 70, isCore: true,
  },
  {
    tsCode: "300476.SZ", symbol: "300476", name: "胜宏科技",
    segment: "AI服务器PCB/高速互联",
    investmentGroups: ["AI服务器PCB/高速互联"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    downstreamApplications: ["AI服务器PCB", "高速通信板"],
    note: "AI服务器高端PCB弹性标的，与光模块客户高度重叠",
    valueRatioScore: 82, techBarrierScore: 82, aiDemandScore: 90,
    localizationScore: 65, isCore: true,
  },
  {
    tsCode: "002916.SZ", symbol: "002916", name: "深南电路",
    segment: "AI服务器PCB/高速互联",
    investmentGroups: ["AI服务器PCB/高速互联"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    downstreamApplications: ["AI服务器PCB", "HDI", "高速互联"],
    note: "高端HDI/高速PCB龙头，AI数据中心高速互联受益",
    valueRatioScore: 85, techBarrierScore: 88, aiDemandScore: 90,
    localizationScore: 68, isCore: true,
  },
  {
    tsCode: "688183.SH", symbol: "688183", name: "生益电子",
    segment: "AI服务器PCB/高速互联",
    investmentGroups: ["AI服务器PCB/高速互联"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "极强",
    downstreamApplications: ["AI服务器超高层板", "高速通信PCB"],
    note: "AI服务器超高层PCB专精企业",
    valueRatioScore: 88, techBarrierScore: 90, aiDemandScore: 92,
    localizationScore: 65, isCore: false,
  },
  {
    tsCode: "600183.SH", symbol: "600183", name: "生益科技",
    segment: "AI服务器PCB/高速互联",
    investmentGroups: ["AI服务器PCB/高速互联"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "强",
    downstreamApplications: ["高速CCL", "AI服务器PCB基材"],
    note: "国内覆铜板龙头，高速高频CCL受益AI数据中心建设",
    valueRatioScore: 85, techBarrierScore: 82, aiDemandScore: 85,
    localizationScore: 70, isCore: false,
  },
  {
    tsCode: "002384.SZ", symbol: "002384", name: "东山精密",
    segment: "AI服务器PCB/高速互联",
    investmentGroups: ["AI服务器PCB/高速互联"],
    techBarrier: "中高", localizationSpace: "中", aiDemandLevel: "中高",
    downstreamApplications: ["FPC", "服务器配套", "消费电子"],
    note: "FPC+服务器配套，间接受益AI算力需求",
    valueRatioScore: 72, techBarrierScore: 72, aiDemandScore: 75,
    localizationScore: 65, isCore: false,
  },
  {
    tsCode: "002938.SZ", symbol: "002938", name: "鹏鼎控股",
    segment: "AI服务器PCB/高速互联",
    investmentGroups: ["AI服务器PCB/高速互联"],
    techBarrier: "高", localizationSpace: "中", aiDemandLevel: "中高",
    downstreamApplications: ["FPC", "服务器/AI配套"],
    note: "全球FPC龙头，AI服务器FPC需求受益",
    valueRatioScore: 82, techBarrierScore: 85, aiDemandScore: 78,
    localizationScore: 62, isCore: false,
  },

  // ── 7. 数据中心散热 / 电源 ────────────────────────────────────────────
  {
    tsCode: "002837.SZ", symbol: "002837", name: "英维克",
    segment: "数据中心散热/电源",
    investmentGroups: ["数据中心散热/电源"],
    techBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "中高",
    downstreamApplications: ["数据中心精密空调", "液冷散热", "AI算力配套"],
    note: "数据中心精密空调龙头，液冷业务快速推进，AI算力配套受益",
    valueRatioScore: 75, techBarrierScore: 72, aiDemandScore: 82,
    localizationScore: 80, isCore: false,
  },
  {
    tsCode: "301018.SZ", symbol: "301018", name: "申菱环境",
    segment: "数据中心散热/电源",
    investmentGroups: ["数据中心散热/电源"],
    techBarrier: "中", localizationSpace: "中高", aiDemandLevel: "中高",
    downstreamApplications: ["数据中心热管理", "工业空调"],
    note: "数据中心热管理方案提供商，AI算力中心配套",
    valueRatioScore: 68, techBarrierScore: 65, aiDemandScore: 75,
    localizationScore: 72, isCore: false,
  },
  {
    tsCode: "002335.SZ", symbol: "002335", name: "科华数据",
    segment: "数据中心散热/电源",
    investmentGroups: ["数据中心散热/电源"],
    techBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "中高",
    downstreamApplications: ["UPS电源", "数据中心基础设施", "新能源"],
    note: "数据中心UPS电源+新能源储能双主业，AI算力中心电源配套",
    valueRatioScore: 70, techBarrierScore: 68, aiDemandScore: 78,
    localizationScore: 75, isCore: false,
  },
  {
    tsCode: "002518.SZ", symbol: "002518", name: "科士达",
    segment: "数据中心散热/电源",
    investmentGroups: ["数据中心散热/电源"],
    techBarrier: "中高", localizationSpace: "中高", aiDemandLevel: "中高",
    downstreamApplications: ["UPS电源", "数据中心电源管理", "储能"],
    note: "数据中心UPS电源，AI中心高功耗电源需求受益",
    valueRatioScore: 70, techBarrierScore: 68, aiDemandScore: 76,
    localizationScore: 75, isCore: false,
  },
  {
    tsCode: "002364.SZ", symbol: "002364", name: "中恒电气",
    segment: "数据中心散热/电源",
    investmentGroups: ["数据中心散热/电源"],
    techBarrier: "中", localizationSpace: "中高", aiDemandLevel: "中高",
    downstreamApplications: ["通信电源", "数据中心电源", "新能源"],
    note: "通信电源/数据中心供电，AI中心用电需求间接受益",
    valueRatioScore: 65, techBarrierScore: 62, aiDemandScore: 72,
    localizationScore: 72, isCore: false,
  },
];

// ── 20 只核心股票池 ──────────────────────────────────────────────────────

export const CPO_CORE_POOL = CPO_STOCKS.filter(s => s.isCore);

// ── 工具函数 ─────────────────────────────────────────────────────────────

export function getCpoByGroup(group: CpoInvestmentGroup): CpoStock[] {
  return CPO_STOCKS.filter(s => s.investmentGroups.includes(group));
}

export function getCpoBySegment(segment: CpoSegment): CpoStock[] {
  return CPO_STOCKS.filter(s => s.segment === segment);
}

export function getAllCpoTsCodes(): string[] {
  return CPO_STOCKS.map(s => s.tsCode);
}

export function getCoreCpoTsCodes(): string[] {
  return CPO_CORE_POOL.map(s => s.tsCode);
}

// ── CPO 评分计算 ─────────────────────────────────────────────────────────

/**
 * 计算 CPO BOM 评分 (0-100)
 * 维度权重：价值量20% + 技术壁垒20% + AI受益度20% + 国产替代15% + 财务15% + 估值10%
 */
export function calcCpoScore(
  stock: CpoStock,
  opts?: { pe?: number | null; pb?: number | null; roe?: number | null; grossMargin?: number | null }
): CpoScore {
  const { pe, pb, roe, grossMargin } = opts ?? {};

  // ── 财务质量 (15%) ────────────────────────────────────────────────────
  let financialQualityScore = 60;
  if (roe != null && roe > 0) {
    financialQualityScore = Math.min(100, 40 + roe * 2);
  } else if (grossMargin != null && grossMargin > 0) {
    financialQualityScore = Math.min(100, 40 + grossMargin * 0.8);
  }

  // ── 估值合理性 (10%) ──────────────────────────────────────────────────
  let valuationScore = 60;
  if (pe != null && pe > 0) {
    if (pe < 15)       valuationScore = 50;
    else if (pe <= 30) valuationScore = 88;
    else if (pe <= 50) valuationScore = 72;
    else if (pe <= 80) valuationScore = 58;
    else               valuationScore = 40;
  } else if (pb != null && pb > 0) {
    if (pb < 1)        valuationScore = 50;
    else if (pb <= 3)  valuationScore = 85;
    else if (pb <= 6)  valuationScore = 70;
    else               valuationScore = 50;
  }

  // ── 加权总分 ──────────────────────────────────────────────────────────
  const total = Math.round(
    stock.valueRatioScore   * 0.20 +
    stock.techBarrierScore  * 0.20 +
    stock.aiDemandScore     * 0.20 +
    stock.localizationScore * 0.15 +
    financialQualityScore   * 0.15 +
    valuationScore          * 0.10
  );

  const rating: CpoScore["rating"] =
    total >= 80 ? "优秀" :
    total >= 60 ? "良好" :
    total >= 40 ? "一般" : "较差";

  return {
    tsCode:                stock.tsCode,
    valueRatioScore:       stock.valueRatioScore,
    techBarrierScore:      stock.techBarrierScore,
    aiDemandScore:         stock.aiDemandScore,
    localizationScore:     stock.localizationScore,
    financialQualityScore,
    valuationScore,
    totalScore: total,
    rating,
  };
}

// ── 风险提示 ─────────────────────────────────────────────────────────────

export const CPO_COMMON_RISKS = [
  "AI 服务器需求不及预期，算力投资放缓",
  "海外大客户（超大规模云厂商）订单波动",
  "光模块价格竞争加剧，毛利率下滑",
  "硅光/CPO 商业化进度不及预期",
  "技术路线变化（直驱光/CPO/LPO 路线竞争）",
  "原材料（InP 衬底/稀土/化工品）价格上涨",
  "客户集中度高，依赖少数海外云厂商",
  "应收账款和存货规模扩大",
  "汇率波动（出口占比高的企业受影响）",
  "海外贸易限制，出口管制风险",
  "估值过高，短期涨幅透支基本面",
  "国内同行竞争加剧，价格战风险",
];

export const CPO_SEGMENT_RISKS: Record<CpoSegment, string[]> = {
  "高速光模块":          ["海外客户集中度高", "毛利率下行压力", "行业景气周期"],
  "光器件/光引擎":       ["CPO商业化不及预期", "光引擎标准化进度", "技术路线变化"],
  "光芯片/激光器":       ["技术突破难度大", "国产替代不及预期", "业绩高度波动"],
  "光纤连接/通信网络":   ["AI受益弹性较低", "价格竞争", "下游运营商资本开支"],
  "CPO设备/封装/测试":   ["非纯CPO主业", "需人工复核产业链相关性", "封装需求周期"],
  "AI服务器PCB/高速互联": ["PCB供需格局", "高端技术门槛", "海外竞争"],
  "数据中心散热/电源":   ["受益为间接", "竞争格局较分散", "毛利率偏低"],
};
