/**
 * lib/pcbStockPoolService.ts
 *
 * PCB / 印制电路板 产业链内置股票池服务
 * ────────────────────────────────────────────────────────────────────────────
 * 内置 A股 PCB 产业链分类股票池，按细分环节和投资逻辑分组。
 *
 * ⚠️ 免责声明：
 *   本股票池基于公开市场行业分类整理，不代表具体客户/供应商关系。
 *   产业链映射为规则匹配结果，需人工复核，不构成投资建议。
 */

// ── 类型定义 ──────────────────────────────────────────────────────────────

export type PcbSegment =
  | "PCB制造"
  | "覆铜板材料"
  | "PCB设备耗材"
  | "柔性PCB/FPC"
  | "AI服务器PCB"
  | "汽车电子PCB";

export type PcbInvestmentGroup =
  | "AI服务器/高速通信PCB"
  | "高端覆铜板/材料"
  | "消费电子/FPC"
  | "汽车电子PCB"
  | "PCB设备耗材";

export interface PcbStock {
  tsCode:                 string;   // "002463.SZ"
  symbol:                 string;   // "002463"
  name:                   string;   // "沪电股份"
  segment:                PcbSegment;
  investmentGroups:       PcbInvestmentGroup[];
  techBarrier:            "高" | "中高" | "中" | "中低" | "低";
  localizationSpace:      "大" | "中高" | "中" | "中低" | "小";
  downstreamApplications: string[];
  note:                   string;
  // 静态评分因子（0-100）
  valueRatioScore:        number;   // 环节价值量
  techBarrierScore:       number;   // 技术壁垒
  downstreamDemandScore:  number;   // 下游景气度（静态基线）
  localizationScore:      number;   // 国产替代空间
  isCore:                 boolean;  // 是否在核心股票池
}

export interface PcbGroupDef {
  key:   PcbInvestmentGroup;
  label: string;
  desc:  string;
  color: string;
}

export interface PcbScore {
  tsCode:                 string;
  valueRatioScore:        number;  // 20%
  techBarrierScore:       number;  // 20%
  downstreamDemandScore:  number;  // 20%
  localizationScore:      number;  // 15%
  financialQualityScore:  number;  // 15% — 需要财务数据
  valuationScore:         number;  // 10% — 需要 PE/PB
  totalScore:             number;  // 0-100
  rating:                 "优秀" | "良好" | "一般" | "较差";
}

// ── 投资逻辑分组定义 ─────────────────────────────────────────────────────

export const PCB_INVESTMENT_GROUPS: PcbGroupDef[] = [
  {
    key:   "AI服务器/高速通信PCB",
    label: "AI服务器/高速PCB",
    desc:  "受益于AI算力基础设施建设，高速高频PCB需求爆发；高层数、小孔径、精密加工能力是核心壁垒",
    color: "#a855f7",
  },
  {
    key:   "高端覆铜板/材料",
    label: "高端覆铜板/材料",
    desc:  "覆铜板是PCB最核心原材料，占PCB成本35-45%；高频高速覆铜板受益于5G/AI/汽车电子需求升级",
    color: "#f59e0b",
  },
  {
    key:   "消费电子/FPC",
    label: "消费电子/FPC",
    desc:  "柔性电路板用于手机折叠屏、可穿戴设备；苹果链核心供应商，消费电子景气度高度相关",
    color: "#3b82f6",
  },
  {
    key:   "汽车电子PCB",
    label: "汽车电子PCB",
    desc:  "新能源汽车带动车规级PCB需求高增，单车用量提升3-5倍；车规认证壁垒高，格局较好",
    color: "#22c55e",
  },
  {
    key:   "PCB设备耗材",
    label: "PCB设备耗材",
    desc:  "PCB专用设备和化学品耗材受益于PCB产能扩张；国产替代空间大，龙头有望实现进口替代",
    color: "#00E5A8",
  },
];

// ── PCB 产业链股票池（完整版）────────────────────────────────────────────

export const PCB_STOCKS: PcbStock[] = [
  // ── PCB 制造核心股 ────────────────────────────────────────────────────
  {
    tsCode: "002463.SZ", symbol: "002463", name: "沪电股份",
    segment: "PCB制造",
    investmentGroups: ["AI服务器/高速通信PCB", "汽车电子PCB"],
    techBarrier: "高", localizationSpace: "中",
    downstreamApplications: ["AI服务器", "通信设备", "汽车电子"],
    note: "国内最大PCB制造商之一，高端AI服务器PCB龙头，汽车板快速放量",
    valueRatioScore: 85, techBarrierScore: 85, downstreamDemandScore: 90,
    localizationScore: 70, isCore: true,
  },
  {
    tsCode: "002916.SZ", symbol: "002916", name: "深南电路",
    segment: "PCB制造",
    investmentGroups: ["AI服务器/高速通信PCB"],
    techBarrier: "高", localizationSpace: "中",
    downstreamApplications: ["AI服务器", "通信设备", "消费电子"],
    note: "高端HDI/高速PCB龙头，AI服务器主要受益者之一",
    valueRatioScore: 85, techBarrierScore: 88, downstreamDemandScore: 88,
    localizationScore: 68, isCore: true,
  },
  {
    tsCode: "688183.SH", symbol: "688183", name: "生益电子",
    segment: "PCB制造",
    investmentGroups: ["AI服务器/高速通信PCB"],
    techBarrier: "高", localizationSpace: "中",
    downstreamApplications: ["AI服务器", "通信基站", "高端消费电子"],
    note: "专注高端PCB，AI服务器超高层板核心标的",
    valueRatioScore: 88, techBarrierScore: 90, downstreamDemandScore: 90,
    localizationScore: 65, isCore: true,
  },
  {
    tsCode: "603228.SH", symbol: "603228", name: "景旺电子",
    segment: "PCB制造",
    investmentGroups: ["汽车电子PCB"],
    techBarrier: "中高", localizationSpace: "中高",
    downstreamApplications: ["汽车电子", "工控", "消费电子"],
    note: "汽车电子PCB快速放量，车规认证完善",
    valueRatioScore: 75, techBarrierScore: 72, downstreamDemandScore: 78,
    localizationScore: 75, isCore: true,
  },
  {
    tsCode: "300476.SZ", symbol: "300476", name: "胜宏科技",
    segment: "PCB制造",
    investmentGroups: ["AI服务器/高速通信PCB"],
    techBarrier: "高", localizationSpace: "中",
    downstreamApplications: ["AI服务器", "通信设备"],
    note: "AI服务器高端PCB弹性标的，受益算力基建",
    valueRatioScore: 82, techBarrierScore: 82, downstreamDemandScore: 88,
    localizationScore: 65, isCore: true,
  },
  {
    tsCode: "002436.SZ", symbol: "002436", name: "兴森科技",
    segment: "PCB制造",
    investmentGroups: ["AI服务器/高速通信PCB"],
    techBarrier: "高", localizationSpace: "中",
    downstreamApplications: ["IC载板", "高端PCB", "AI服务器"],
    note: "IC载板龙头，布局高端PCB赛道",
    valueRatioScore: 88, techBarrierScore: 88, downstreamDemandScore: 85,
    localizationScore: 80, isCore: true,
  },
  {
    tsCode: "002815.SZ", symbol: "002815", name: "崇达技术",
    segment: "PCB制造",
    investmentGroups: ["汽车电子PCB"],
    techBarrier: "中高", localizationSpace: "中高",
    downstreamApplications: ["汽车电子", "工控", "消费电子"],
    note: "汽车电子PCB重要供应商，快速切入车规市场",
    valueRatioScore: 72, techBarrierScore: 70, downstreamDemandScore: 78,
    localizationScore: 75, isCore: true,
  },
  {
    tsCode: "002913.SZ", symbol: "002913", name: "奥士康",
    segment: "PCB制造",
    investmentGroups: ["汽车电子PCB"],
    techBarrier: "中高", localizationSpace: "中高",
    downstreamApplications: ["汽车电子", "消费电子", "工控"],
    note: "汽车PCB持续放量，大客户华为海思",
    valueRatioScore: 72, techBarrierScore: 70, downstreamDemandScore: 78,
    localizationScore: 75, isCore: true,
  },
  {
    tsCode: "603920.SH", symbol: "603920", name: "世运电路",
    segment: "PCB制造",
    investmentGroups: ["汽车电子PCB"],
    techBarrier: "中高", localizationSpace: "中高",
    downstreamApplications: ["汽车电子", "工控", "通信"],
    note: "汽车PCB占比持续提升，受益新能源车渗透",
    valueRatioScore: 70, techBarrierScore: 70, downstreamDemandScore: 78,
    localizationScore: 75, isCore: true,
  },
  {
    tsCode: "301282.SZ", symbol: "301282", name: "金禄电子",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控", "通信"],
    note: "中端PCB制造，客户较分散",
    valueRatioScore: 62, techBarrierScore: 60, downstreamDemandScore: 65,
    localizationScore: 65, isCore: false,
  },
  {
    tsCode: "300852.SZ", symbol: "300852", name: "四会富仕",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控"],
    note: "中小型PCB制造商",
    valueRatioScore: 58, techBarrierScore: 58, downstreamDemandScore: 62,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "300814.SZ", symbol: "300814", name: "中富电路",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控"],
    note: "中小型PCB，客户包含消费电子和工控",
    valueRatioScore: 60, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "300964.SZ", symbol: "300964", name: "本川智能",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控"],
    note: "PCB中端制造",
    valueRatioScore: 58, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "300739.SZ", symbol: "300739", name: "明阳电路",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控", "通信"],
    note: "PCB制造，布局汽车电子方向",
    valueRatioScore: 60, techBarrierScore: 60, downstreamDemandScore: 62,
    localizationScore: 65, isCore: false,
  },
  {
    tsCode: "605058.SH", symbol: "605058", name: "澳弘电子",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控"],
    note: "PCB制造",
    valueRatioScore: 58, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "603328.SH", symbol: "603328", name: "依顿电子",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控"],
    note: "PCB制造",
    valueRatioScore: 58, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "603936.SH", symbol: "603936", name: "博敏电子",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控"],
    note: "PCB制造",
    valueRatioScore: 58, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "002134.SZ", symbol: "002134", name: "天津普林",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["通信", "工控", "消费电子"],
    note: "PCB制造",
    valueRatioScore: 58, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "000823.SZ", symbol: "000823", name: "超声电子",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["通信", "工控"],
    note: "PCB制造",
    valueRatioScore: 58, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "600601.SH", symbol: "600601", name: "方正科技",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["工控", "通信", "消费电子"],
    note: "方正集团旗下，PCB业务",
    valueRatioScore: 60, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "001389.SZ", symbol: "001389", name: "广合科技",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控"],
    note: "PCB制造，广东地区企业",
    valueRatioScore: 58, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },
  {
    tsCode: "301628.SZ", symbol: "301628", name: "强达电路",
    segment: "PCB制造",
    investmentGroups: [],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["消费电子", "工控", "通信"],
    note: "PCB制造，近期上市",
    valueRatioScore: 58, techBarrierScore: 58, downstreamDemandScore: 60,
    localizationScore: 62, isCore: false,
  },

  // ── 覆铜板/上游材料 ───────────────────────────────────────────────────
  {
    tsCode: "600183.SH", symbol: "600183", name: "生益科技",
    segment: "覆铜板材料",
    investmentGroups: ["高端覆铜板/材料"],
    techBarrier: "高", localizationSpace: "中",
    downstreamApplications: ["高速通信", "AI服务器", "汽车电子", "消费电子"],
    note: "国内覆铜板龙头，高频高速产品持续升级",
    valueRatioScore: 88, techBarrierScore: 85, downstreamDemandScore: 85,
    localizationScore: 70, isCore: true,
  },
  {
    tsCode: "603186.SH", symbol: "603186", name: "华正新材",
    segment: "覆铜板材料",
    investmentGroups: ["高端覆铜板/材料"],
    techBarrier: "中高", localizationSpace: "中高",
    downstreamApplications: ["PCB基材", "高速传输", "汽车电子"],
    note: "覆铜板重要供应商，布局高频材料",
    valueRatioScore: 80, techBarrierScore: 75, downstreamDemandScore: 78,
    localizationScore: 78, isCore: true,
  },
  {
    tsCode: "688519.SH", symbol: "688519", name: "南亚新材",
    segment: "覆铜板材料",
    investmentGroups: ["高端覆铜板/材料"],
    techBarrier: "中高", localizationSpace: "中高",
    downstreamApplications: ["PCB基材", "高速传输"],
    note: "台湾南亚集团旗下A股，覆铜板供应商",
    valueRatioScore: 78, techBarrierScore: 72, downstreamDemandScore: 76,
    localizationScore: 72, isCore: true,
  },
  {
    tsCode: "002636.SZ", symbol: "002636", name: "金安国纪",
    segment: "覆铜板材料",
    investmentGroups: ["高端覆铜板/材料"],
    techBarrier: "中", localizationSpace: "中高",
    downstreamApplications: ["PCB基材", "消费电子"],
    note: "覆铜板制造，产品向高端延伸",
    valueRatioScore: 72, techBarrierScore: 68, downstreamDemandScore: 72,
    localizationScore: 75, isCore: true,
  },
  {
    tsCode: "300936.SZ", symbol: "300936", name: "中英科技",
    segment: "覆铜板材料",
    investmentGroups: ["高端覆铜板/材料"],
    techBarrier: "中", localizationSpace: "中高",
    downstreamApplications: ["PCB基材", "消费电子", "工控"],
    note: "覆铜板填料/特种材料供应商",
    valueRatioScore: 70, techBarrierScore: 68, downstreamDemandScore: 70,
    localizationScore: 75, isCore: false,
  },
  {
    tsCode: "603002.SH", symbol: "603002", name: "宏昌电子",
    segment: "覆铜板材料",
    investmentGroups: ["高端覆铜板/材料"],
    techBarrier: "中", localizationSpace: "中",
    downstreamApplications: ["PCB基材", "消费电子"],
    note: "覆铜板制造",
    valueRatioScore: 68, techBarrierScore: 65, downstreamDemandScore: 68,
    localizationScore: 70, isCore: false,
  },
  {
    tsCode: "688300.SH", symbol: "688300", name: "联瑞新材",
    segment: "覆铜板材料",
    investmentGroups: ["高端覆铜板/材料"],
    techBarrier: "中高", localizationSpace: "大",
    downstreamApplications: ["电子级填料", "PCB特种材料", "5G器件"],
    note: "电子级球形硅微粉龙头，覆铜板填料核心材料国产替代",
    valueRatioScore: 80, techBarrierScore: 80, downstreamDemandScore: 78,
    localizationScore: 85, isCore: true,
  },

  // ── PCB 设备耗材 ──────────────────────────────────────────────────────
  {
    tsCode: "301377.SZ", symbol: "301377", name: "鼎泰高科",
    segment: "PCB设备耗材",
    investmentGroups: ["PCB设备耗材"],
    techBarrier: "高", localizationSpace: "大",
    downstreamApplications: ["PCB钻孔设备", "精密耗材", "IC封装"],
    note: "PCB专用钻针龙头，国产替代空间显著",
    valueRatioScore: 82, techBarrierScore: 82, downstreamDemandScore: 80,
    localizationScore: 88, isCore: true,
  },
  {
    tsCode: "301200.SZ", symbol: "301200", name: "大族数控",
    segment: "PCB设备耗材",
    investmentGroups: ["PCB设备耗材"],
    techBarrier: "高", localizationSpace: "大",
    downstreamApplications: ["PCB数控钻铣设备", "激光加工"],
    note: "PCB数控加工设备领先企业，大族激光子公司",
    valueRatioScore: 85, techBarrierScore: 85, downstreamDemandScore: 80,
    localizationScore: 85, isCore: true,
  },
  {
    tsCode: "688700.SH", symbol: "688700", name: "东威科技",
    segment: "PCB设备耗材",
    investmentGroups: ["PCB设备耗材"],
    techBarrier: "中高", localizationSpace: "大",
    downstreamApplications: ["PCB电镀设备", "新能源电池", "半导体"],
    note: "PCB垂直连续电镀设备龙头，国产替代明确",
    valueRatioScore: 82, techBarrierScore: 80, downstreamDemandScore: 80,
    localizationScore: 88, isCore: true,
  },
  {
    tsCode: "688630.SH", symbol: "688630", name: "芯碁微装",
    segment: "PCB设备耗材",
    investmentGroups: ["PCB设备耗材"],
    techBarrier: "高", localizationSpace: "大",
    downstreamApplications: ["PCB直接成像设备", "半导体封装"],
    note: "PCB/半导体LDI激光直接成像设备，高度国产替代",
    valueRatioScore: 85, techBarrierScore: 88, downstreamDemandScore: 82,
    localizationScore: 90, isCore: true,
  },
  {
    tsCode: "300410.SZ", symbol: "300410", name: "正业科技",
    segment: "PCB设备耗材",
    investmentGroups: ["PCB设备耗材"],
    techBarrier: "中高", localizationSpace: "大",
    downstreamApplications: ["PCB检测设备", "X-Ray", "AOI"],
    note: "PCB检测设备供应商",
    valueRatioScore: 72, techBarrierScore: 72, downstreamDemandScore: 75,
    localizationScore: 80, isCore: false,
  },
  {
    tsCode: "002741.SZ", symbol: "002741", name: "光华科技",
    segment: "PCB设备耗材",
    investmentGroups: ["PCB设备耗材"],
    techBarrier: "中", localizationSpace: "中高",
    downstreamApplications: ["PCB化学品", "蚀刻液", "电镀药水"],
    note: "PCB专用化学品供应商，蚀刻液/电镀液",
    valueRatioScore: 68, techBarrierScore: 65, downstreamDemandScore: 72,
    localizationScore: 78, isCore: true,
  },
  {
    tsCode: "688603.SH", symbol: "688603", name: "天承科技",
    segment: "PCB设备耗材",
    investmentGroups: ["PCB设备耗材"],
    techBarrier: "中高", localizationSpace: "大",
    downstreamApplications: ["PCB化学品", "高端药水", "半导体材料"],
    note: "PCB高端化学品，国产替代空间显著",
    valueRatioScore: 75, techBarrierScore: 75, downstreamDemandScore: 75,
    localizationScore: 85, isCore: true,
  },

  // ── 柔性PCB / FPC ──────────────────────────────────────────────────────
  {
    tsCode: "002384.SZ", symbol: "002384", name: "东山精密",
    segment: "柔性PCB/FPC",
    investmentGroups: ["消费电子/FPC"],
    techBarrier: "中高", localizationSpace: "中",
    downstreamApplications: ["苹果链FPC", "汽车电子", "服务器"],
    note: "FPC/消费电子综合供应商，苹果链重要标的",
    valueRatioScore: 78, techBarrierScore: 75, downstreamDemandScore: 75,
    localizationScore: 65, isCore: true,
  },
  {
    tsCode: "002938.SZ", symbol: "002938", name: "鹏鼎控股",
    segment: "柔性PCB/FPC",
    investmentGroups: ["消费电子/FPC"],
    techBarrier: "高", localizationSpace: "中",
    downstreamApplications: ["苹果链FPC", "消费电子", "折叠屏"],
    note: "全球FPC龙头，苹果链最大FPC供应商",
    valueRatioScore: 88, techBarrierScore: 88, downstreamDemandScore: 78,
    localizationScore: 60, isCore: true,
  },
  {
    tsCode: "300657.SZ", symbol: "300657", name: "弘信电子",
    segment: "柔性PCB/FPC",
    investmentGroups: ["消费电子/FPC"],
    techBarrier: "中高", localizationSpace: "中高",
    downstreamApplications: ["可穿戴FPC", "消费电子", "工控"],
    note: "FPC供应商，消费电子和可穿戴方向",
    valueRatioScore: 70, techBarrierScore: 68, downstreamDemandScore: 68,
    localizationScore: 72, isCore: false,
  },
  {
    tsCode: "301123.SZ", symbol: "301123", name: "奕东电子",
    segment: "柔性PCB/FPC",
    investmentGroups: ["消费电子/FPC"],
    techBarrier: "中高", localizationSpace: "中高",
    downstreamApplications: ["FPC", "消费电子", "汽车电子"],
    note: "FPC及精密电子制造",
    valueRatioScore: 70, techBarrierScore: 68, downstreamDemandScore: 70,
    localizationScore: 72, isCore: false,
  },
  {
    tsCode: "300227.SZ", symbol: "300227", name: "光韵达",
    segment: "柔性PCB/FPC",
    investmentGroups: ["消费电子/FPC"],
    techBarrier: "中", localizationSpace: "中高",
    downstreamApplications: ["激光加工FPC", "消费电子", "LED"],
    note: "激光加工，FPC和LED封装相关",
    valueRatioScore: 62, techBarrierScore: 62, downstreamDemandScore: 65,
    localizationScore: 70, isCore: false,
  },
];

// ── 20 只核心股票池（重点关注）────────────────────────────────────────────

export const PCB_CORE_POOL = PCB_STOCKS.filter(s => s.isCore);

// ── 分组工具函数 ─────────────────────────────────────────────────────────

export function getPcbByGroup(group: PcbInvestmentGroup): PcbStock[] {
  return PCB_STOCKS.filter(s => s.investmentGroups.includes(group));
}

export function getPcbBySegment(segment: PcbSegment): PcbStock[] {
  return PCB_STOCKS.filter(s => s.segment === segment);
}

export function getAllPcbTsCodes(): string[] {
  return PCB_STOCKS.map(s => s.tsCode);
}

export function getCorePcbTsCodes(): string[] {
  return PCB_CORE_POOL.map(s => s.tsCode);
}

// ── PCB 评分计算 ──────────────────────────────────────────────────────────

/**
 * 计算 PCB BOM 评分（0-100）
 * @param stock PCB 股票静态信息
 * @param pe    市盈率（可选，来自 Tushare daily_basic）
 * @param pb    市净率（可选，来自 Tushare daily_basic）
 * @param roe   ROE（可选，来自 Tushare fina_indicator）
 * @param grossMargin 毛利率（可选）
 */
export function calcPcbScore(
  stock: PcbStock,
  opts?: { pe?: number | null; pb?: number | null; roe?: number | null; grossMargin?: number | null }
): PcbScore {
  const { pe, pb, roe, grossMargin } = opts ?? {};

  // ── 财务质量评分（15%）：ROE/毛利率/PE ──────────────────────────────
  let financialQualityScore = 60; // 无数据时基线
  if (roe != null && roe > 0) {
    financialQualityScore = Math.min(100, 40 + roe * 2);
  } else if (grossMargin != null && grossMargin > 0) {
    financialQualityScore = Math.min(100, 40 + grossMargin * 0.8);
  }

  // ── 估值合理性评分（10%）：PE/PB ──────────────────────────────────────
  let valuationScore = 60; // 无数据时基线
  if (pe != null && pe > 0) {
    // PE 10-25 得满分，<10 过低可能有问题，>50 估值偏高
    if (pe < 10) valuationScore = 50;
    else if (pe <= 25) valuationScore = 90;
    else if (pe <= 40) valuationScore = 75;
    else if (pe <= 60) valuationScore = 60;
    else valuationScore = 40;
  } else if (pb != null && pb > 0) {
    if (pb < 1) valuationScore = 55;
    else if (pb <= 3) valuationScore = 85;
    else if (pb <= 6) valuationScore = 70;
    else valuationScore = 50;
  }

  // ── 加权总分 ──────────────────────────────────────────────────────────
  const total = Math.round(
    stock.valueRatioScore       * 0.20 +
    stock.techBarrierScore      * 0.20 +
    stock.downstreamDemandScore * 0.20 +
    stock.localizationScore     * 0.15 +
    financialQualityScore       * 0.15 +
    valuationScore              * 0.10
  );

  const rating: PcbScore["rating"] =
    total >= 80 ? "优秀" :
    total >= 60 ? "良好" :
    total >= 40 ? "一般" : "较差";

  return {
    tsCode:                stock.tsCode,
    valueRatioScore:       stock.valueRatioScore,
    techBarrierScore:      stock.techBarrierScore,
    downstreamDemandScore: stock.downstreamDemandScore,
    localizationScore:     stock.localizationScore,
    financialQualityScore,
    valuationScore,
    totalScore: total,
    rating,
  };
}

// ── 风险提示 ─────────────────────────────────────────────────────────────

export const PCB_COMMON_RISKS = [
  "下游需求波动，AI服务器需求不及预期",
  "消费电子景气度低迷影响FPC/中低端PCB需求",
  "原材料（覆铜板/铜箔/化学品）价格上涨压缩毛利",
  "客户集中度高，大客户订单缩减风险",
  "应收账款和存货规模较大，资金占用风险",
  "技术迭代风险，新材料/新工艺可能颠覆现有格局",
  "估值过高，短期涨幅过大导致回调风险",
  "产能扩张超预期带来供需失衡和价格竞争",
  "国际贸易摩擦影响海外客户订单",
];

export const PCB_SEGMENT_RISKS: Record<PcbSegment, string[]> = {
  "PCB制造":   ["下游需求波动", "毛利率受原材料价格影响", "客户集中度高"],
  "覆铜板材料": ["铜箔/树脂等原材料价格波动", "下游PCB厂商需求传导", "产品技术升级风险"],
  "PCB设备耗材": ["PCB厂商资本开支缩减", "国产替代进度不及预期", "核心零部件进口依赖"],
  "柔性PCB/FPC": ["消费电子需求疲弱", "苹果链客户集中风险", "折叠屏渗透率不及预期"],
  "AI服务器PCB": ["AI算力需求不及预期", "高端PCB技术差距", "海外竞争对手压力"],
  "汽车电子PCB": ["新能源汽车销量下滑", "车规认证周期较长", "降价压力传导"],
};
