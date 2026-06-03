/**
 * lib/bomIndustryTemplateService.ts
 *
 * BOM 产业链行业模板服务
 * ────────────────────────────────────────────────────────────────────────────
 * 提供 10 个行业的 BOM 拆解模板，每个模块包含：
 *   - 成本占比 / 技术壁垒 / 国产替代空间
 *   - 关键词（用于 A 股公司名称 / 行业分类匹配）
 *   - 典型上市公司列表（基于公开市场信息，非具体供应商关系）
 *
 * ⚠️ 免责声明：
 *   公司列表来自公开市场行业分类，不代表具体客户/供应商关系。
 *   股票映射为规则匹配结果，需人工复核，不构成投资建议。
 */

// ── 类型定义 ──────────────────────────────────────────────────────────────

export type TechBarrier     = "高" | "中高" | "中" | "中低" | "低";
export type LocalizationSpace = "大" | "中高" | "中" | "中低" | "小";
export type PricingPower    = "强" | "较强" | "中高" | "中" | "中低" | "较弱" | "弱";
export type BarrierLevel    = "高" | "中高" | "中" | "中低" | "低";

export interface BomModule {
  id:                   string;
  moduleName:           string;
  estimatedCostRatioMin: number;  // %
  estimatedCostRatioMax: number;  // %
  technicalBarrier:     TechBarrier;
  localizationSpace:    LocalizationSpace;
  pricingPower:         PricingPower;
  grossMarginPotential: BarrierLevel;       // 毛利率提升空间
  rawMaterialSensitivity: BarrierLevel;     // 原材料价格敏感度
  keyMaterials:         string[];           // 关键原材料
  nameKeywords:         string[];           // 公司名称关键词
  industryKeywords:     string[];           // 行业分类关键词
  businessKeywords:     string[];           // 主营业务关键词
  /** 公开市场中该细分领域的代表性上市公司（非具体供应商关系，需人工复核） */
  representativeStocks: Array<{ tsCode: string; symbol: string; name: string; note: string }>;
  investmentLogic:      string;
  risks:                string[];
  opportunities:        string[];
}

export interface BomIndustryTemplate {
  industry:     string;
  industryId:   string;
  description:  string;
  totalCost:    string;
  modules:      BomModule[];
  updatedAt:    string;
}

// ── 行业模板数据 ──────────────────────────────────────────────────────────

const TEMPLATES: Record<string, BomIndustryTemplate> = {

  // ── 1. 新能源汽车 ────────────────────────────────────────────────────────
  "新能源汽车": {
    industry:    "新能源汽车",
    industryId:  "nev",
    description: "新能源汽车以电池、电机、电控为核心，智能化趋势推动软件和传感器占比持续提升",
    totalCost:   "整车总成本约 15-30 万元（乘用车）",
    updatedAt:   "2025-08",
    modules: [
      {
        id: "nev-battery",
        moduleName: "动力电池系统",
        estimatedCostRatioMin: 35, estimatedCostRatioMax: 45,
        technicalBarrier: "高", localizationSpace: "中",
        pricingPower: "较强", grossMarginPotential: "中",
        rawMaterialSensitivity: "高",
        keyMaterials: ["碳酸锂", "正极材料", "负极材料", "电解液", "隔膜", "铝箔", "铜箔"],
        nameKeywords: ["锂能", "电池", "锂电", "动力电", "储能", "电芯", "正极", "负极", "电解液", "隔膜", "福能"],
        industryKeywords: ["动力电池", "锂电池", "电池"],
        businessKeywords: ["动力电池", "锂离子电池", "储能电池", "正极材料", "负极材料", "电解液", "隔膜"],
        representativeStocks: [
          { tsCode: "300750.SZ", symbol: "300750", name: "宁德时代", note: "A股动力电池龙头，行业市占率第一" },
          { tsCode: "300014.SZ", symbol: "300014", name: "亿纬锂能", note: "动力及储能电池企业" },
          { tsCode: "002074.SZ", symbol: "002074", name: "国轩高科", note: "动力电池企业，大众入股" },
          { tsCode: "300207.SZ", symbol: "300207", name: "欣旺达", note: "消费+动力电池企业" },
          { tsCode: "688567.SH", symbol: "688567", name: "孚能科技", note: "软包动力电池企业" },
        ],
        investmentLogic: "成本占比最高环节，技术路线多元（磷酸铁锂/三元/钠离子），碳酸锂价格影响显著，关注电池技术迭代和成本下降趋势",
        risks: ["碳酸锂价格大幅波动", "客户集中度高", "技术路线切换风险", "固态电池替代风险"],
        opportunities: ["固态电池国产化", "储能市场拓展", "海外市场准入", "二次电池回收"],
      },
      {
        id: "nev-motor",
        moduleName: "电机/电控系统",
        estimatedCostRatioMin: 10, estimatedCostRatioMax: 15,
        technicalBarrier: "中高", localizationSpace: "中高",
        pricingPower: "中", grossMarginPotential: "中高",
        rawMaterialSensitivity: "中",
        keyMaterials: ["稀土永磁", "硅钢片", "铜线", "IGBT", "SiC 芯片"],
        nameKeywords: ["电机", "电驱", "电控", "驱动", "汇川", "卧龙", "英搏", "绿控", "大洋", "巨一"],
        industryKeywords: ["电机", "电驱动", "功率半导体"],
        businessKeywords: ["电机", "电控", "驱动系统", "电驱动", "功率模块"],
        representativeStocks: [
          { tsCode: "300124.SZ", symbol: "300124", name: "汇川技术", note: "工业驱动+新能源汽车电驱动企业" },
          { tsCode: "300681.SZ", symbol: "300681", name: "英搏尔", note: "新能源汽车电控模块企业" },
          { tsCode: "600580.SH", symbol: "600580", name: "卧龙电驱", note: "电机制造企业" },
          { tsCode: "603290.SH", symbol: "603290", name: "斯达半导", note: "IGBT/SiC功率半导体企业" },
        ],
        investmentLogic: "电机电控一体化趋势，IGBT/SiC成本下降驱动毛利提升，国产替代空间较大",
        risks: ["IGBT/SiC依赖进口", "价格竞争加剧", "整车厂自研电驱"],
        opportunities: ["SiC国产替代", "电机一体化", "工业电驱带动规模效应"],
      },
      {
        id: "nev-adas",
        moduleName: "智能驾驶系统",
        estimatedCostRatioMin: 8, estimatedCostRatioMax: 20,
        technicalBarrier: "高", localizationSpace: "大",
        pricingPower: "较强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["车规芯片", "激光雷达", "毫米波雷达", "高精地图", "摄像头模组"],
        nameKeywords: ["德赛", "经纬", "华阳", "均胜", "保隆", "星宇", "奥特佳", "路特斯"],
        industryKeywords: ["汽车电子", "智能驾驶", "域控制器"],
        businessKeywords: ["智能驾驶", "自动驾驶", "域控制器", "激光雷达", "毫米波", "ADAS", "座舱"],
        representativeStocks: [
          { tsCode: "002920.SZ", symbol: "002920", name: "德赛西威", note: "汽车智能座舱/智驾域控制器" },
          { tsCode: "688295.SH", symbol: "688295", name: "经纬恒润", note: "汽车智能驾驶域控制器企业" },
          { tsCode: "002906.SZ", symbol: "002906", name: "华阳集团", note: "车载信息娱乐系统企业" },
          { tsCode: "600699.SH", symbol: "600699", name: "均胜电子", note: "汽车安全/智能座舱企业" },
        ],
        investmentLogic: "智能化提升最快的环节，软件定义汽车趋势，国内供应商加速本土化替代",
        risks: ["芯片供应短缺", "算法竞争激烈", "整车厂垂直整合"],
        opportunities: ["高阶ADAS普及", "域控制器集中化", "座舱智驾融合"],
      },
      {
        id: "nev-chip",
        moduleName: "车规级芯片",
        estimatedCostRatioMin: 5, estimatedCostRatioMax: 12,
        technicalBarrier: "高", localizationSpace: "大",
        pricingPower: "强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["硅晶圆", "光刻胶", "高纯气体", "封装材料"],
        nameKeywords: ["芯", "集成电路", "半导体", "华为", "黑芝麻", "地平线"],
        industryKeywords: ["半导体", "集成电路", "车载芯片"],
        businessKeywords: ["车规芯片", "MCU", "SoC", "AI芯片", "功率半导体", "IGBT", "SiC"],
        representativeStocks: [
          { tsCode: "603290.SH", symbol: "603290", name: "斯达半导", note: "IGBT/SiC车规功率半导体" },
          { tsCode: "688120.SH", symbol: "688120", name: "华海清科", note: "半导体设备企业" },
          { tsCode: "300661.SZ", symbol: "300661", name: "圣邦股份", note: "模拟芯片企业" },
        ],
        investmentLogic: "芯片是智能汽车最高壁垒环节，国产替代空间巨大，一旦进入车规认证周期极长",
        risks: ["车规认证周期长", "国际竞争激烈", "出口管制风险"],
        opportunities: ["国产SoC替代", "功率半导体国产化", "车规MCU本土化"],
      },
      {
        id: "nev-thermal",
        moduleName: "热管理系统",
        estimatedCostRatioMin: 5, estimatedCostRatioMax: 8,
        technicalBarrier: "中高", localizationSpace: "中高",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "中",
        keyMaterials: ["铝合金", "制冷剂", "压缩机", "阀门"],
        nameKeywords: ["热管理", "空调", "压缩机", "冷却", "三花", "拓普", "银轮", "克来机"],
        industryKeywords: ["热管理", "汽车空调"],
        businessKeywords: ["热管理", "电池冷却", "空调压缩机", "热泵系统"],
        representativeStocks: [
          { tsCode: "002050.SZ", symbol: "002050", name: "三花智控", note: "热管理核心零部件企业" },
          { tsCode: "601689.SH", symbol: "601689", name: "拓普集团", note: "汽车零部件综合供应商" },
          { tsCode: "002126.SZ", symbol: "002126", name: "银轮股份", note: "热交换器/热管理企业" },
        ],
        investmentLogic: "新能源化驱动热管理系统价值量提升（燃油车2k→新能源4-6k），国产化率高",
        risks: ["原材料铝价波动", "客户集中度较高", "价格竞争加剧"],
        opportunities: ["热泵系统普及", "冷板/液冷技术", "储能热管理"],
      },
      {
        id: "nev-connector",
        moduleName: "线束连接器",
        estimatedCostRatioMin: 4, estimatedCostRatioMax: 7,
        technicalBarrier: "中", localizationSpace: "中",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "中高",
        keyMaterials: ["铜", "铝", "绝缘材料", "连接端子"],
        nameKeywords: ["线束", "连接器", "沪光", "天海", "永贵", "申昊", "正海"],
        industryKeywords: ["汽车线束", "连接器"],
        businessKeywords: ["线束", "连接器", "高压线束", "新能源汽车线束"],
        representativeStocks: [
          { tsCode: "605333.SH", symbol: "605333", name: "沪光股份", note: "汽车线束企业" },
          { tsCode: "603533.SH", symbol: "603533", name: "天海防务", note: "连接器企业" },
          { tsCode: "002857.SZ", symbol: "002857", name: "三星新材", note: "汽车线束材料企业" },
        ],
        investmentLogic: "新能源化提升高压线束需求（燃油车3→新能源5-8km），铜价敏感",
        risks: ["铜价大幅上涨", "技术门槛相对较低", "低价竞争"],
        opportunities: ["高压线束国产化", "域控架构简化线束", "中央计算平台"],
      },
      {
        id: "nev-structure",
        moduleName: "车身结构件/轻量化",
        estimatedCostRatioMin: 8, estimatedCostRatioMax: 14,
        technicalBarrier: "中", localizationSpace: "中",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "高",
        keyMaterials: ["钢材", "铝合金", "碳纤维", "高强钢"],
        nameKeywords: ["拓普", "华域", "敏实", "文灿", "海达", "爱柯", "旭升"],
        industryKeywords: ["汽车零部件", "轻量化", "压铸"],
        businessKeywords: ["车身结构", "铝压铸", "轻量化", "一体化压铸", "车身覆盖件"],
        representativeStocks: [
          { tsCode: "601689.SH", symbol: "601689", name: "拓普集团", note: "汽车零部件综合供应商" },
          { tsCode: "600741.SH", symbol: "600741", name: "华域汽车", note: "汽车零部件综合供应商" },
          { tsCode: "601799.SH", symbol: "601799", name: "航天工程", note: "一体化压铸设备" },
        ],
        investmentLogic: "一体化压铸革新车身制造，铝合金轻量化趋势，国内装备和材料企业受益",
        risks: ["钢铝价格波动", "特斯拉自建压铸", "产能过剩"],
        opportunities: ["一体化压铸大渗透", "新材料轻量化", "工艺壁垒提升"],
      },
      {
        id: "nev-charging",
        moduleName: "充电系统",
        estimatedCostRatioMin: 2, estimatedCostRatioMax: 5,
        technicalBarrier: "中高", localizationSpace: "大",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "中",
        keyMaterials: ["功率模块", "变压器", "电容", "散热器"],
        nameKeywords: ["充电", "充电桩", "充电模块", "奥特迅", "英可瑞", "中恒", "科士达"],
        industryKeywords: ["充电桩", "充电系统"],
        businessKeywords: ["车载充电机", "OBC", "充电桩", "充电模块", "DC-DC"],
        representativeStocks: [
          { tsCode: "002869.SZ", symbol: "002869", name: "金银河", note: "充电设备企业" },
          { tsCode: "300390.SZ", symbol: "300390", name: "天孚通信", note: "光模块/充电相关" },
        ],
        investmentLogic: "充电基础设施快速扩张，大功率超充趋势，功率模块和热管理国产化受益",
        risks: ["标准碎片化", "价格竞争激烈", "运营商账期长"],
        opportunities: ["超充基础设施建设", "液冷超充", "海外充电标准切换"],
      },
    ],
  },

  // ── 2. 智能手机 ──────────────────────────────────────────────────────────
  "智能手机": {
    industry: "智能手机", industryId: "smartphone",
    description: "智能手机 BOM 以芯片和屏幕为最大成本，摄像头模组快速提升，射频/连接技术持续升级",
    totalCost: "旗舰机总成本约 3000-5000 元", updatedAt: "2025-08",
    modules: [
      {
        id: "sp-soc",
        moduleName: "应用处理器/SoC",
        estimatedCostRatioMin: 15, estimatedCostRatioMax: 25,
        technicalBarrier: "高", localizationSpace: "中",
        pricingPower: "强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["硅晶圆", "先进制程"],
        nameKeywords: ["海思", "紫光", "芯片", "集成电路", "半导体"],
        industryKeywords: ["半导体", "集成电路"],
        businessKeywords: ["SoC", "AP芯片", "手机芯片", "移动处理器"],
        representativeStocks: [
          { tsCode: "688981.SH", symbol: "688981", name: "中芯国际", note: "国内最大芯片代工企业" },
          { tsCode: "688561.SH", symbol: "688561", name: "奥普特", note: "半导体检测设备" },
        ],
        investmentLogic: "手机芯片高度集中，海思国产替代空间大，但先进制程受制于台积电",
        risks: ["先进制程受限", "高研发投入", "市场集中"], opportunities: ["国产芯片突破", "6G布局"],
      },
      {
        id: "sp-display",
        moduleName: "显示屏",
        estimatedCostRatioMin: 18, estimatedCostRatioMax: 28,
        technicalBarrier: "高", localizationSpace: "中",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "中",
        keyMaterials: ["OLED面板", "背光模组", "偏光片"],
        nameKeywords: ["京东方", "维信诺", "天马", "深天马", "和辉", "TCL"],
        industryKeywords: ["显示面板", "OLED"],
        businessKeywords: ["OLED", "手机屏幕", "显示面板"],
        representativeStocks: [
          { tsCode: "000725.SZ", symbol: "000725", name: "京东方A", note: "面板龙头，手机OLED快速扩张" },
          { tsCode: "688079.SH", symbol: "688079", name: "维信诺", note: "AMOLED手机面板企业" },
        ],
        investmentLogic: "国产OLED持续替代韩企，折叠屏带动ASP提升",
        risks: ["面板价格周期波动", "折叠屏良率"], opportunities: ["OLED国产替代", "折叠屏"],
      },
      {
        id: "sp-camera",
        moduleName: "摄像头模组",
        estimatedCostRatioMin: 10, estimatedCostRatioMax: 18,
        technicalBarrier: "中高", localizationSpace: "大",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "低",
        keyMaterials: ["CMOS传感器", "镜头", "马达", "图像处理芯片"],
        nameKeywords: ["舜宇", "欧菲", "丘钛", "晶科", "联创"],
        industryKeywords: ["摄像头模组", "光学"],
        businessKeywords: ["摄像头模组", "光学镜头", "CMOS"],
        representativeStocks: [
          { tsCode: "002456.SZ", symbol: "002456", name: "欧菲光", note: "光学模组企业" },
          { tsCode: "300718.SZ", symbol: "300718", name: "长盈精密", note: "精密结构件/摄像头相关" },
        ],
        investmentLogic: "多摄趋势提升价值量，潜望式长焦镜头技术升级",
        risks: ["下游集中度高", "传感器依赖索尼", "格局分散"], opportunities: ["潜望镜头", "折叠屏模组"],
      },
    ],
  },

  // ── 3. 光伏 ──────────────────────────────────────────────────────────────
  "光伏": {
    industry: "光伏", industryId: "solar",
    description: "光伏 BOM 以硅片/硅料和电池片为主要成本，组件封装占比高，设备是核心技术壁垒",
    totalCost: "光伏组件成本约 0.9-1.2 元/W", updatedAt: "2025-08",
    modules: [
      {
        id: "pv-silicon",
        moduleName: "多晶硅料",
        estimatedCostRatioMin: 20, estimatedCostRatioMax: 35,
        technicalBarrier: "高", localizationSpace: "小",
        pricingPower: "强", grossMarginPotential: "中",
        rawMaterialSensitivity: "高",
        keyMaterials: ["冶金硅", "盐酸", "电力"],
        nameKeywords: ["通威", "大全", "协鑫", "新疆硅", "东方希望"],
        industryKeywords: ["多晶硅", "硅料"],
        businessKeywords: ["多晶硅", "硅料生产"],
        representativeStocks: [
          { tsCode: "600438.SH", symbol: "600438", name: "通威股份", note: "硅料+电池片双龙头" },
          { tsCode: "688303.SH", symbol: "688303", name: "大全能源", note: "多晶硅料企业" },
        ],
        investmentLogic: "硅料是光伏供应链最高壁垒环节，价格弹性大，周期性强",
        risks: ["硅料价格大幅下跌", "产能过剩", "电力成本波动"], opportunities: ["颗粒硅技术", "成本领先"],
      },
      {
        id: "pv-cell",
        moduleName: "电池片",
        estimatedCostRatioMin: 25, estimatedCostRatioMax: 40,
        technicalBarrier: "中高", localizationSpace: "小",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "高",
        keyMaterials: ["硅片", "银浆", "靶材", "高纯气体"],
        nameKeywords: ["隆基", "晶澳", "天合", "晶科", "爱旭", "通威"],
        industryKeywords: ["光伏电池", "太阳能电池"],
        businessKeywords: ["TOPCon", "HJT", "光伏电池", "PERC电池"],
        representativeStocks: [
          { tsCode: "601012.SH", symbol: "601012", name: "隆基绿能", note: "单晶硅片/组件龙头" },
          { tsCode: "002459.SZ", symbol: "002459", name: "晶澳科技", note: "光伏组件企业" },
          { tsCode: "688429.SH", symbol: "688429", name: "爱旭股份", note: "N型光伏电池企业" },
        ],
        investmentLogic: "N型技术(TOPCon/HJT)迭代，转换效率提升是核心竞争力",
        risks: ["价格激烈竞争", "银浆成本", "产能过剩"], opportunities: ["N型技术迭代", "光伏出海"],
      },
      {
        id: "pv-equipment",
        moduleName: "光伏设备",
        estimatedCostRatioMin: 5, estimatedCostRatioMax: 10,
        technicalBarrier: "高", localizationSpace: "大",
        pricingPower: "较强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["光学器件", "精密机械", "控制系统"],
        nameKeywords: ["迈为", "金辰", "奥特维", "帝尔", "科瑞"],
        industryKeywords: ["光伏设备"],
        businessKeywords: ["丝网印刷", "串焊机", "激光消融", "光伏自动化"],
        representativeStocks: [
          { tsCode: "300751.SZ", symbol: "300751", name: "迈为股份", note: "HJT光伏电池设备龙头" },
          { tsCode: "300820.SZ", symbol: "300820", name: "金晟能源", note: "光伏设备企业" },
        ],
        investmentLogic: "设备是新技术验证和大规模量产的核心，HJT/TOPCon扩产受益",
        risks: ["下游扩产节奏不确定", "价格竞争"], opportunities: ["新电池技术扩产", "海外市场"],
      },
    ],
  },

  // ── 4. 储能 ──────────────────────────────────────────────────────────────
  "储能": {
    industry: "储能", industryId: "energy-storage",
    description: "储能系统以电芯和 PCS 为核心，EMS 软件附加价值高，集成能力是竞争关键",
    totalCost: "储能系统成本约 0.7-1.0 元/Wh", updatedAt: "2025-08",
    modules: [
      {
        id: "es-cell",
        moduleName: "储能电芯",
        estimatedCostRatioMin: 50, estimatedCostRatioMax: 65,
        technicalBarrier: "高", localizationSpace: "小",
        pricingPower: "较强", grossMarginPotential: "中",
        rawMaterialSensitivity: "高",
        keyMaterials: ["磷酸铁锂", "碳酸锂", "正极材料"],
        nameKeywords: ["储能", "锂电", "宁德", "亿纬", "鹏辉", "赣锋"],
        industryKeywords: ["储能", "动力电池"],
        businessKeywords: ["储能电芯", "储能电池", "磷酸铁锂电芯"],
        representativeStocks: [
          { tsCode: "300750.SZ", symbol: "300750", name: "宁德时代", note: "动力+储能双龙头" },
          { tsCode: "300014.SZ", symbol: "300014", name: "亿纬锂能", note: "储能电芯快速扩产" },
          { tsCode: "300438.SZ", symbol: "300438", name: "鹏辉能源", note: "储能电芯企业" },
        ],
        investmentLogic: "储能电芯成本占比最高，磷酸铁锂主流，大容量电芯趋势",
        risks: ["碳酸锂价格", "价格战", "产能过剩"], opportunities: ["大储快速增长", "海外市场"],
      },
      {
        id: "es-pcs",
        moduleName: "PCS储能变流器",
        estimatedCostRatioMin: 10, estimatedCostRatioMax: 18,
        technicalBarrier: "中高", localizationSpace: "中",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "中",
        keyMaterials: ["IGBT", "电容", "电感", "铜"],
        nameKeywords: ["阳光电源", "科华", "固德威", "锦浪", "古瑞瓦特"],
        industryKeywords: ["PCS", "储能变流器", "逆变器"],
        businessKeywords: ["储能变流器", "PCS", "逆变器"],
        representativeStocks: [
          { tsCode: "300274.SZ", symbol: "300274", name: "阳光电源", note: "光伏逆变器+储能PCS龙头" },
          { tsCode: "300390.SZ", symbol: "300390", name: "固德威", note: "户用储能PCS企业" },
        ],
        investmentLogic: "PCS技术壁垒中等，液冷方案提升技术差异化",
        risks: ["功率器件依赖", "价格竞争"], opportunities: ["大型储能PCS", "虚电厂"],
      },
    ],
  },

  // ── 5. 半导体设备 ────────────────────────────────────────────────────────
  "半导体设备": {
    industry: "半导体设备", industryId: "semi-equipment",
    description: "半导体设备是芯片制造核心基础设施，国产替代空间极大，技术壁垒极高",
    totalCost: "晶圆厂设备投资约 10-15 亿美元/万片", updatedAt: "2025-08",
    modules: [
      {
        id: "se-litho",
        moduleName: "光刻机",
        estimatedCostRatioMin: 25, estimatedCostRatioMax: 35,
        technicalBarrier: "高", localizationSpace: "大",
        pricingPower: "强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["光学镜片", "激光光源", "精密机械"],
        nameKeywords: ["光刻", "华卓精科"],
        industryKeywords: ["光刻设备"],
        businessKeywords: ["光刻机", "光刻技术"],
        representativeStocks: [
          { tsCode: "688327.SH", symbol: "688327", name: "华卓精科", note: "光刻机关键零部件企业" },
        ],
        investmentLogic: "国产光刻机最强护城河，ASML垄断，DUV国产突破是重大进展",
        risks: ["技术差距巨大", "出口管制"], opportunities: ["DUV光刻机突破", "零部件国产化"],
      },
      {
        id: "se-etch",
        moduleName: "刻蚀机",
        estimatedCostRatioMin: 15, estimatedCostRatioMax: 22,
        technicalBarrier: "高", localizationSpace: "中高",
        pricingPower: "较强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["射频源", "等离子体腔体", "精密零件"],
        nameKeywords: ["中微公司", "北方华创", "拓荆"],
        industryKeywords: ["刻蚀设备", "半导体设备"],
        businessKeywords: ["刻蚀机", "CCP", "ICP", "等离子"],
        representativeStocks: [
          { tsCode: "688012.SH", symbol: "688012", name: "中微公司", note: "刻蚀设备国产龙头" },
          { tsCode: "002371.SZ", symbol: "002371", name: "北方华创", note: "半导体设备综合供应商" },
        ],
        investmentLogic: "刻蚀机是国产进展最快的核心设备，中微公司实现高端突破",
        risks: ["技术持续升级压力", "客户验证周期长"], opportunities: ["28nm+国产替代", "NAND扩产"],
      },
      {
        id: "se-cvd",
        moduleName: "CVD/PVD薄膜设备",
        estimatedCostRatioMin: 12, estimatedCostRatioMax: 18,
        technicalBarrier: "高", localizationSpace: "中",
        pricingPower: "较强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["前驱体气体", "靶材", "加热组件"],
        nameKeywords: ["北方华创", "拓荆科技", "微导纳米"],
        industryKeywords: ["CVD设备", "薄膜设备"],
        businessKeywords: ["CVD", "ALD", "PVD", "薄膜沉积"],
        representativeStocks: [
          { tsCode: "002371.SZ", symbol: "002371", name: "北方华创", note: "CVD/PVD设备国产龙头" },
          { tsCode: "688072.SH", symbol: "688072", name: "拓荆科技", note: "CVD薄膜设备企业" },
        ],
        investmentLogic: "ALD国产化加速，存储器扩产带动需求",
        risks: ["技术迭代快", "先进制程认证难"], opportunities: ["先进制程渗透率提升"],
      },
    ],
  },

  // ── 6. 消费电子 ──────────────────────────────────────────────────────────
  "消费电子": {
    industry: "消费电子", industryId: "consumer-electronics",
    description: "消费电子包含 PC、耳机、TWS、AR/VR 等多形态产品，结构件和连接器是重要环节",
    totalCost: "视产品差异", updatedAt: "2025-08",
    modules: [
      {
        id: "ce-pcb",
        moduleName: "印制电路板(PCB)",
        estimatedCostRatioMin: 8, estimatedCostRatioMax: 15,
        technicalBarrier: "中高", localizationSpace: "中",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "中",
        keyMaterials: ["覆铜板", "铜箔", "树脂"],
        nameKeywords: ["深南电路", "景旺电子", "沪电股份", "生益科技"],
        industryKeywords: ["PCB", "印制电路板"],
        businessKeywords: ["PCB", "FPC", "HDI", "电路板"],
        representativeStocks: [
          { tsCode: "002916.SZ", symbol: "002916", name: "深南电路", note: "高端PCB企业" },
          { tsCode: "002384.SZ", symbol: "002384", name: "东山精密", note: "FPC/模组企业" },
        ],
        investmentLogic: "AI服务器和新能源带动高端PCB需求，国产技术持续提升",
        risks: ["铜价波动", "产能竞争"], opportunities: ["AI服务器PCB", "ABF载板"],
      },
    ],
  },

  // ── 7. 机器人 ────────────────────────────────────────────────────────────
  "机器人": {
    industry: "机器人", industryId: "robotics",
    description: "机器人以减速器、伺服电机、控制器为核心，人形机器人是最新高成长方向",
    totalCost: "工业机器人约 30-50 万元/台", updatedAt: "2025-08",
    modules: [
      {
        id: "rb-reducer",
        moduleName: "减速器",
        estimatedCostRatioMin: 25, estimatedCostRatioMax: 35,
        technicalBarrier: "高", localizationSpace: "大",
        pricingPower: "强", grossMarginPotential: "高",
        rawMaterialSensitivity: "中",
        keyMaterials: ["精密轴承", "高精钢材"],
        nameKeywords: ["绿的谐波", "来福谐波", "汇川", "双环传动"],
        industryKeywords: ["减速器", "谐波减速器", "RV减速器"],
        businessKeywords: ["谐波减速器", "RV减速器", "精密减速器"],
        representativeStocks: [
          { tsCode: "688017.SH", symbol: "688017", name: "绿的谐波", note: "谐波减速器国产龙头" },
        ],
        investmentLogic: "减速器是机器人最高壁垒零部件，日企垄断，国产突破意义重大",
        risks: ["精度差距", "客户认可周期"], opportunities: ["人形机器人需求", "谐波减速国产化"],
      },
      {
        id: "rb-servo",
        moduleName: "伺服电机/驱动器",
        estimatedCostRatioMin: 20, estimatedCostRatioMax: 30,
        technicalBarrier: "高", localizationSpace: "大",
        pricingPower: "较强", grossMarginPotential: "高",
        rawMaterialSensitivity: "中",
        keyMaterials: ["稀土永磁", "编码器", "驱动芯片"],
        nameKeywords: ["汇川技术", "雷赛智能", "贝斯特", "拓邦"],
        industryKeywords: ["伺服电机", "伺服驱动"],
        businessKeywords: ["伺服", "伺服系统", "运动控制"],
        representativeStocks: [
          { tsCode: "300124.SZ", symbol: "300124", name: "汇川技术", note: "国产伺服系统龙头" },
          { tsCode: "002979.SZ", symbol: "002979", name: "雷赛智能", note: "运动控制企业" },
        ],
        investmentLogic: "国产伺服快速崛起，人形机器人带动高端伺服需求激增",
        risks: ["外资品牌竞争激烈", "稀土价格"], opportunities: ["人形机器人伺服", "工业自动化升级"],
      },
    ],
  },

  // ── 8. 工业母机 ──────────────────────────────────────────────────────────
  "工业母机": {
    industry: "工业母机", industryId: "machine-tool",
    description: "数控机床是制造业基础，核心技术在于数控系统、精密丝杠和主轴，高端机床高度依赖进口",
    totalCost: "中高端加工中心约 50-500 万元/台", updatedAt: "2025-08",
    modules: [
      {
        id: "mt-cnc",
        moduleName: "数控系统",
        estimatedCostRatioMin: 20, estimatedCostRatioMax: 35,
        technicalBarrier: "高", localizationSpace: "大",
        pricingPower: "强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["处理器", "运动控制芯片"],
        nameKeywords: ["华中数控", "科德数控", "汇川", "固高"],
        industryKeywords: ["数控系统", "CNC"],
        businessKeywords: ["数控系统", "CNC控制器", "运动控制"],
        representativeStocks: [
          { tsCode: "300803.SZ", symbol: "300803", name: "指南针", note: "工业软件/数控相关" },
        ],
        investmentLogic: "数控系统是机床核心大脑，发那科垄断高端，国产持续突破",
        risks: ["技术差距大", "下游验证慢"], opportunities: ["国产替代加速", "工业软件升级"],
      },
    ],
  },

  // ── 9. 风电 ──────────────────────────────────────────────────────────────
  "风电": {
    industry: "风电", industryId: "wind-power",
    description: "风电整机以叶片、主轴承、齿轮箱为核心零部件，塔筒和海缆是基础设施关键",
    totalCost: "陆上风机约 3000-5000 元/kW", updatedAt: "2025-08",
    modules: [
      {
        id: "wp-blade",
        moduleName: "风机叶片",
        estimatedCostRatioMin: 15, estimatedCostRatioMax: 25,
        technicalBarrier: "中高", localizationSpace: "小",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "高",
        keyMaterials: ["玻纤", "碳纤", "环氧树脂"],
        nameKeywords: ["时代新材", "中材科技", "振江股份"],
        industryKeywords: ["风电叶片"],
        businessKeywords: ["风电叶片", "玻纤叶片", "碳纤叶片"],
        representativeStocks: [
          { tsCode: "600458.SH", symbol: "600458", name: "时代新材", note: "风电叶片龙头" },
          { tsCode: "002080.SZ", symbol: "002080", name: "中材科技", note: "玻纤/叶片企业" },
        ],
        investmentLogic: "叶片大型化趋势，碳纤维混用提升竞争壁垒",
        risks: ["原材料玻纤/碳纤成本", "叶片大型化技术难度"], opportunities: ["海上风电叶片"],
      },
    ],
  },

  // ── 10. 医疗器械 ────────────────────────────────────────────────────────
  "医疗器械": {
    industry: "医疗器械", industryId: "medical-device",
    description: "医疗器械涵盖影像诊断、体外诊断、高值耗材等多领域，国产替代空间大、政策支持强",
    totalCost: "视产品差异极大", updatedAt: "2025-08",
    modules: [
      {
        id: "md-imaging",
        moduleName: "医学影像设备",
        estimatedCostRatioMin: 30, estimatedCostRatioMax: 50,
        technicalBarrier: "高", localizationSpace: "大",
        pricingPower: "较强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["探测器", "射线管", "高压发生器"],
        nameKeywords: ["联影", "迈瑞", "东软", "万东", "安科"],
        industryKeywords: ["医学影像", "医疗器械"],
        businessKeywords: ["CT", "MRI", "DR", "超声", "PET"],
        representativeStocks: [
          { tsCode: "300760.SZ", symbol: "300760", name: "迈瑞医疗", note: "医疗器械综合龙头" },
          { tsCode: "600055.SH", symbol: "600055", name: "万东医疗", note: "医学影像设备企业" },
        ],
        investmentLogic: "国产影像设备快速突破高端市场，集采政策加速国产替代",
        risks: ["技术差距高端CT/MRI", "集采价格压力"], opportunities: ["国产替代中高端", "基层医疗扩配"],
      },
      {
        id: "md-ivd",
        moduleName: "体外诊断(IVD)",
        estimatedCostRatioMin: 20, estimatedCostRatioMax: 40,
        technicalBarrier: "中高", localizationSpace: "大",
        pricingPower: "中高", grossMarginPotential: "高",
        rawMaterialSensitivity: "中",
        keyMaterials: ["抗体", "酶", "磁珠", "发光底物"],
        nameKeywords: ["迈瑞", "新产业", "安图生物", "迈克生物", "美康"],
        industryKeywords: ["体外诊断", "IVD"],
        businessKeywords: ["化学发光", "免疫诊断", "分子诊断", "生化分析"],
        representativeStocks: [
          { tsCode: "300136.SZ", symbol: "300136", name: "信维通信", note: "医疗相关电子" },
          { tsCode: "603658.SH", symbol: "603658", name: "安图生物", note: "化学发光IVD龙头" },
        ],
        investmentLogic: "IVD是医疗耗材+设备双轮驱动，国产替代罗氏/西门子空间大",
        risks: ["集采降价", "海外竞争"], opportunities: ["国产替代进口品牌", "分子诊断快速增长"],
      },
    ],
  },

  // ── 11. PCB / 印制电路板 ─────────────────────────────────────────────────
  "PCB / 印制电路板": {
    industry:   "PCB / 印制电路板",
    industryId: "pcb",
    description: "印制电路板（PCB）是所有电子设备的核心基板，产业链涵盖覆铜板上游材料、精密制造工艺、FPC柔性板、专用设备耗材等环节，受益于AI算力、新能源汽车、消费电子等多重需求驱动",
    totalCost: "普通4层PCB约800-1500元/平方米，AI服务器高端PCB数倍以上",
    updatedAt: "2025-08",
    modules: [
      {
        id: "pcb-ccl",
        moduleName: "覆铜板(CCL)/基材",
        estimatedCostRatioMin: 35, estimatedCostRatioMax: 45,
        technicalBarrier: "中高", localizationSpace: "中",
        pricingPower: "较强", grossMarginPotential: "中高",
        rawMaterialSensitivity: "高",
        keyMaterials: ["电子铜箔", "环氧树脂", "玻纤布", "硅微粉填料"],
        nameKeywords: ["生益", "华正", "南亚", "金安国纪", "中英科技", "宏昌", "联瑞"],
        industryKeywords: ["覆铜板", "CCL", "高频材料", "PCB基材"],
        businessKeywords: ["覆铜板", "CCL", "高频高速基材", "电子级材料"],
        representativeStocks: [
          { tsCode: "600183.SH", symbol: "600183", name: "生益科技", note: "国内覆铜板龙头，高频高速产品" },
          { tsCode: "603186.SH", symbol: "603186", name: "华正新材", note: "覆铜板及高频材料" },
          { tsCode: "688519.SH", symbol: "688519", name: "南亚新材", note: "覆铜板供应商" },
          { tsCode: "002636.SZ", symbol: "002636", name: "金安国纪", note: "覆铜板制造" },
          { tsCode: "688300.SH", symbol: "688300", name: "联瑞新材", note: "电子级球形硅微粉，CCL填料" },
        ],
        investmentLogic: "覆铜板是PCB最核心原材料，占总成本35-45%。高频高速覆铜板受益5G/AI/汽车电子升级，国内生益科技持续突破高端市场，国产替代空间随AI推动而显著扩大",
        risks: ["铜箔/树脂等原材料价格波动", "高端高频材料技术仍有差距", "产能过剩压制价格"],
        opportunities: ["AI服务器推动高速CCL需求", "汽车电子用高可靠CCL国产化", "高频低损耗材料进口替代"],
      },
      {
        id: "pcb-process",
        moduleName: "PCB精密制造(HDI/高速/高层)",
        estimatedCostRatioMin: 15, estimatedCostRatioMax: 30,
        technicalBarrier: "高", localizationSpace: "中",
        pricingPower: "较强", grossMarginPotential: "高",
        rawMaterialSensitivity: "中",
        keyMaterials: ["覆铜板", "铜箔", "油墨", "化学品"],
        nameKeywords: ["沪电", "深南", "生益电子", "胜宏", "兴森", "崇达", "奥士康", "世运"],
        industryKeywords: ["PCB制造", "印制电路板", "高密度互联", "HDI", "高速通信PCB"],
        businessKeywords: ["HDI", "高速PCB", "超高层数PCB", "AI服务器板", "汽车PCB"],
        representativeStocks: [
          { tsCode: "002463.SZ", symbol: "002463", name: "沪电股份", note: "国内最大PCB厂之一，AI服务器/汽车板" },
          { tsCode: "002916.SZ", symbol: "002916", name: "深南电路", note: "高端HDI/高速PCB龙头" },
          { tsCode: "688183.SH", symbol: "688183", name: "生益电子", note: "专注高端PCB，AI服务器超高层板" },
          { tsCode: "300476.SZ", symbol: "300476", name: "胜宏科技", note: "AI服务器高端PCB弹性标的" },
          { tsCode: "002436.SZ", symbol: "002436", name: "兴森科技", note: "IC载板+高端PCB" },
        ],
        investmentLogic: "高技术壁垒PCB（HDI/高速/超高层）毛利率显著高于普通PCB。AI算力服务器推动超高层数、高密度互联PCB需求爆发，具备高端制造能力的企业享有订单溢价",
        risks: ["技术门槛高，追赶周期长", "客户集中度高", "资本支出压力大"],
        opportunities: ["AI服务器PCB超高速成长", "车规PCB渗透提速", "国内高端产能扩张"],
      },
      {
        id: "pcb-fpc",
        moduleName: "柔性电路板(FPC)",
        estimatedCostRatioMin: 15, estimatedCostRatioMax: 30,
        technicalBarrier: "中高", localizationSpace: "中",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "中",
        keyMaterials: ["FCCL柔性覆铜板", "PI薄膜", "胶黏剂"],
        nameKeywords: ["鹏鼎", "东山精密", "弘信电子", "奕东", "光韵达"],
        industryKeywords: ["FPC", "柔性电路板", "软性线路板"],
        businessKeywords: ["FPC", "柔性电路板", "折叠屏", "可穿戴"],
        representativeStocks: [
          { tsCode: "002938.SZ", symbol: "002938", name: "鹏鼎控股", note: "全球FPC龙头，苹果链核心供应商" },
          { tsCode: "002384.SZ", symbol: "002384", name: "东山精密", note: "FPC/消费电子综合供应商" },
          { tsCode: "300657.SZ", symbol: "300657", name: "弘信电子", note: "FPC供应商，可穿戴/消费电子" },
          { tsCode: "301123.SZ", symbol: "301123", name: "奕东电子", note: "FPC及精密电子制造" },
        ],
        investmentLogic: "FPC是智能手机、可穿戴、折叠屏的核心互联件，高精密FPC壁垒较高。苹果产业链为主要需求来源，折叠屏手机普及将带动FPC单台用量大幅提升",
        risks: ["消费电子景气度", "苹果链客户集中", "价格竞争激烈"],
        opportunities: ["折叠屏渗透提升FPC单价", "汽车FPC快速增长", "AI穿戴设备新需求"],
      },
      {
        id: "pcb-chem",
        moduleName: "PCB专用化学品/耗材",
        estimatedCostRatioMin: 8, estimatedCostRatioMax: 15,
        technicalBarrier: "中", localizationSpace: "中高",
        pricingPower: "中", grossMarginPotential: "中",
        rawMaterialSensitivity: "中",
        keyMaterials: ["硫酸铜", "蚀刻液原料", "有机溶剂"],
        nameKeywords: ["光华科技", "天承科技", "正业科技"],
        industryKeywords: ["PCB化学品", "蚀刻液", "电镀药水"],
        businessKeywords: ["PCB专用化学品", "蚀刻液", "电镀液", "阻焊油墨"],
        representativeStocks: [
          { tsCode: "002741.SZ", symbol: "002741", name: "光华科技", note: "PCB蚀刻液/电镀化学品" },
          { tsCode: "688603.SH", symbol: "688603", name: "天承科技", note: "PCB高端化学品，国产替代" },
        ],
        investmentLogic: "PCB化学品是耗材类，随PCB产量同步增长，高端化学品国产化率偏低，受益于PCB厂国产化需求",
        risks: ["原材料化工品价格波动", "技术壁垒相对低", "竞争格局分散"],
        opportunities: ["高端化学品进口替代", "PCB产量持续扩张带动需求"],
      },
      {
        id: "pcb-equip",
        moduleName: "PCB专用设备",
        estimatedCostRatioMin: 10, estimatedCostRatioMax: 18,
        technicalBarrier: "高", localizationSpace: "大",
        pricingPower: "强", grossMarginPotential: "高",
        rawMaterialSensitivity: "低",
        keyMaterials: ["精密运动控制系统", "激光器", "光学系统"],
        nameKeywords: ["大族数控", "东威科技", "芯碁微装", "鼎泰高科", "正业科技"],
        industryKeywords: ["PCB设备", "钻孔设备", "曝光设备", "电镀设备"],
        businessKeywords: ["PCB钻孔", "激光直接成像LDI", "垂直连续电镀", "精密钻针"],
        representativeStocks: [
          { tsCode: "301377.SZ", symbol: "301377", name: "鼎泰高科", note: "PCB专用钻针龙头" },
          { tsCode: "301200.SZ", symbol: "301200", name: "大族数控", note: "PCB数控加工设备" },
          { tsCode: "688700.SH", symbol: "688700", name: "东威科技", note: "PCB垂直连续电镀设备" },
          { tsCode: "688630.SH", symbol: "688630", name: "芯碁微装", note: "PCB/半导体LDI激光直接成像" },
          { tsCode: "688603.SH", symbol: "688603", name: "天承科技", note: "PCB高端化学品" },
        ],
        investmentLogic: "PCB专用设备高度依赖进口（日德为主），国产替代空间极大。PCB厂商产能扩张带动设备采购，高端设备国产化是确定性方向",
        risks: ["PCB厂资本支出周期性波动", "核心零部件仍有进口依赖", "研发投入持续"],
        opportunities: ["进口替代空间大", "PCB产能持续扩张", "AI服务器带动高端设备需求"],
      },
      {
        id: "pcb-auto",
        moduleName: "汽车电子/AI服务器高端PCB",
        estimatedCostRatioMin: 20, estimatedCostRatioMax: 40,
        technicalBarrier: "高", localizationSpace: "中高",
        pricingPower: "较强", grossMarginPotential: "高",
        rawMaterialSensitivity: "中",
        keyMaterials: ["高可靠性覆铜板", "铜箔", "特种油墨"],
        nameKeywords: ["沪电", "景旺", "世运", "奥士康", "崇达", "胜宏", "深南", "生益电子"],
        industryKeywords: ["汽车电子PCB", "车规PCB", "AI服务器PCB", "高速通信板"],
        businessKeywords: ["车规认证", "IATF16949", "超高层数PCB", "AI服务器主板", "数据中心"],
        representativeStocks: [
          { tsCode: "002463.SZ", symbol: "002463", name: "沪电股份", note: "汽车PCB+AI服务器双驱动" },
          { tsCode: "603228.SH", symbol: "603228", name: "景旺电子", note: "汽车PCB快速放量" },
          { tsCode: "603920.SH", symbol: "603920", name: "世运电路", note: "汽车PCB占比持续提升" },
          { tsCode: "002913.SZ", symbol: "002913", name: "奥士康", note: "汽车PCB持续放量" },
          { tsCode: "002815.SZ", symbol: "002815", name: "崇达技术", note: "汽车PCB重要供应商" },
        ],
        investmentLogic: "新能源汽车单车PCB用量是燃油车3-5倍，车规认证壁垒高，格局较好。AI服务器超高层数PCB对制造精度要求极高，具备高端能力的PCB企业享有溢价",
        risks: ["车规认证周期长", "下游汽车销量波动", "AI需求短期或有波动"],
        opportunities: ["新能源汽车渗透率提升", "AI算力持续扩张", "车规PCB国产替代加速"],
      },
    ],
  },

}; // end TEMPLATES

// ── 导出函数 ──────────────────────────────────────────────────────────────

export function getBomIndustryList(): string[] {
  return Object.keys(TEMPLATES);
}

export function getBomIndustryTemplate(industry: string): BomIndustryTemplate | null {
  return TEMPLATES[industry] ?? null;
}

export function getAllBomTemplates(): BomIndustryTemplate[] {
  return Object.values(TEMPLATES);
}

export function getBomModuleById(industry: string, moduleId: string): BomModule | null {
  const tmpl = TEMPLATES[industry];
  if (!tmpl) return null;
  return tmpl.modules.find(m => m.id === moduleId) ?? null;
}

/** 获取指定行业所有模块的关键词汇总 */
export function getAllKeywordsForIndustry(industry: string): string[] {
  const tmpl = TEMPLATES[industry];
  if (!tmpl) return [];
  const words: string[] = [];
  for (const mod of tmpl.modules) {
    words.push(...mod.nameKeywords, ...mod.industryKeywords, ...mod.businessKeywords);
  }
  return [...new Set(words)];
}
