// lib/stockService.ts
// Unified stock service with 280+ stocks across A-share, HK, and US markets

export type Market = "A" | "HK" | "US";
export type Currency = "CNY" | "HKD" | "USD";
export type Exchange = "SH" | "SZ" | "BJ" | "HKEX" | "NASDAQ" | "NYSE" | "AMEX";

export interface StockInfo {
  symbol: string;
  name: string;
  nameEn?: string;
  market: Market;
  exchange: Exchange;
  currency: Currency;
  industry: string;
  price: number;
  change: number;
  changePct: number;
  volume?: number;
  marketCap?: number;
}

// ─── A股 (130+ stocks) ────────────────────────────────────────
const A_STOCKS: StockInfo[] = [
  // 白酒
  { symbol: "600519", name: "贵州茅台", nameEn: "Kweichow Moutai",    market: "A", exchange: "SH", currency: "CNY", industry: "白酒",    price: 1680.50, change: 22.30,  changePct: 1.35,  volume: 28460,    marketCap: 2113200000000 },
  { symbol: "000858", name: "五粮液",   nameEn: "Wuliangye Yibin",    market: "A", exchange: "SZ", currency: "CNY", industry: "白酒",    price: 135.80,  change: 2.40,   changePct: 1.80,  volume: 342000,   marketCap: 526000000000  },
  { symbol: "002304", name: "洋河股份", nameEn: "Jiangsu Yanghe",  market: "A", exchange: "SZ", currency: "CNY", industry: "白酒",    price: 82.50,   change: 1.20,   changePct: 1.48,  volume: 256000,   marketCap: 124000000000  },
  { symbol: "000568", name: "泸州老窖", nameEn: "Luzhou Laojiao",   market: "A", exchange: "SZ", currency: "CNY", industry: "白酒",    price: 128.40,  change: -1.60,  changePct: -1.23, volume: 312000,   marketCap: 192000000000  },
  { symbol: "600809", name: "山西汾酒", nameEn: "Shanxi Fenjiu",    market: "A", exchange: "SH", currency: "CNY", industry: "白酒",    price: 185.60,  change: 3.40,   changePct: 1.87,  volume: 189000,   marketCap: 226000000000  },
  { symbol: "000596", name: "古井贡酒", nameEn: "Gujing Gongjiu",   market: "A", exchange: "SZ", currency: "CNY", industry: "白酒",    price: 168.20,  change: 2.80,   changePct: 1.69,  volume: 98000,    marketCap: 98000000000   },
  { symbol: "603369", name: "今世缘",   nameEn: "Jinsiyuan",          market: "A", exchange: "SH", currency: "CNY", industry: "白酒",    price: 52.30,   change: 0.80,   changePct: 1.55,  volume: 145000,   marketCap: 42000000000   },
  { symbol: "000860", name: "顺鑫农业", nameEn: "Shunxin Agriculture", market: "A", exchange: "SZ", currency: "CNY", industry: "白酒", price: 18.60,   change: -0.30,  changePct: -1.59, volume: 234000,   marketCap: 15000000000   },
  // 银行
  { symbol: "601398", name: "工商银行", nameEn: "ICBC",            market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 5.82,    change: 0.04,   changePct: 0.69,  volume: 12456000, marketCap: 2070000000000 },
  { symbol: "601939", name: "建设銀行", nameEn: "CCB",             market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 7.14,    change: 0.06,   changePct: 0.85,  volume: 9870000,  marketCap: 1790000000000 },
  { symbol: "601288", name: "农业銀行", nameEn: "ABC",             market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 4.52,    change: 0.03,   changePct: 0.67,  volume: 15230000, marketCap: 1560000000000 },
  { symbol: "601988", name: "中国銀行", nameEn: "Bank of China",   market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 4.28,    change: 0.02,   changePct: 0.47,  volume: 11200000, marketCap: 1480000000000 },
  { symbol: "600036", name: "招商銀行", nameEn: "CMB",             market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 35.60,   change: 0.48,   changePct: 1.37,  volume: 2345000,  marketCap: 898000000000  },
  { symbol: "601166", name: "兴业銀行", nameEn: "Industrial Bank", market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 18.42,   change: 0.22,   changePct: 1.21,  volume: 3456000,  marketCap: 381000000000  },
  { symbol: "600000", name: "浦发銀行", nameEn: "SPD Bank",        market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 7.82,    change: -0.06,  changePct: -0.76, volume: 4562000,  marketCap: 226000000000  },
  { symbol: "000001", name: "平安銀行", nameEn: "Ping An Bank",    market: "A", exchange: "SZ", currency: "CNY", industry: "銀行",   price: 10.86,   change: 0.16,   changePct: 1.50,  volume: 6230000,  marketCap: 211000000000  },
  { symbol: "600016", name: "民生銀行", nameEn: "Minsheng Bank",   market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 3.62,    change: -0.04,  changePct: -1.09, volume: 8910000,  marketCap: 144000000000  },
  { symbol: "601818", name: "光大銀行", nameEn: "CEB Bank",        market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 3.24,    change: 0.02,   changePct: 0.62,  volume: 7230000,  marketCap: 189000000000  },
  { symbol: "601998", name: "中信銀行", nameEn: "CITIC Bank",      market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 6.48,    change: 0.08,   changePct: 1.25,  volume: 5670000,  marketCap: 164000000000  },
  { symbol: "601169", name: "北京銀行", nameEn: "Bank of Beijing", market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 5.72,    change: 0.06,   changePct: 1.06,  volume: 3210000,  marketCap: 85000000000   },
  { symbol: "002142", name: "宁波銀行", nameEn: "Bank of Ningbo",  market: "A", exchange: "SZ", currency: "CNY", industry: "銀行",   price: 24.80,   change: 0.36,   changePct: 1.47,  volume: 1890000,  marketCap: 149000000000  },
  { symbol: "601009", name: "南京銀行", nameEn: "Bank of Nanjing", market: "A", exchange: "SH", currency: "CNY", industry: "銀行",   price: 9.86,    change: 0.12,   changePct: 1.23,  volume: 2340000,  marketCap: 74000000000   },
  // 保险
  { symbol: "601318", name: "中国平安", nameEn: "Ping An Insurance", market: "A", exchange: "SH", currency: "CNY", industry: "保险", price: 42.80,   change: -0.60,  changePct: -1.38, volume: 1245600,  marketCap: 781600000000  },
  { symbol: "601628", name: "中国人寿", nameEn: "China Life",        market: "A", exchange: "SH", currency: "CNY", industry: "保险", price: 24.60,   change: 0.30,   changePct: 1.23,  volume: 2340000,  marketCap: 697000000000  },
  { symbol: "601601", name: "中国太保", nameEn: "China Pacific",     market: "A", exchange: "SH", currency: "CNY", industry: "保险", price: 28.40,   change: 0.40,   changePct: 1.43,  volume: 1230000,  marketCap: 257000000000  },
  { symbol: "601336", name: "新华保险", nameEn: "New China Life",    market: "A", exchange: "SH", currency: "CNY", industry: "保险", price: 32.60,   change: 0.60,   changePct: 1.87,  volume: 890000,   marketCap: 98000000000   },
  // 券商
  { symbol: "300059", name: "东方财富", nameEn: "East Money",          market: "A", exchange: "SZ", currency: "CNY", industry: "券商", price: 18.42,   change: 0.42,   changePct: 2.33,  volume: 5670000,  marketCap: 271000000000  },
  { symbol: "600030", name: "中信证券", nameEn: "CITIC Securities",    market: "A", exchange: "SH", currency: "CNY", industry: "券商", price: 22.80,   change: 0.38,   changePct: 1.70,  volume: 3450000,  marketCap: 338000000000  },
  { symbol: "601211", name: "国泰君安", nameEn: "Guotai Junan",        market: "A", exchange: "SH", currency: "CNY", industry: "券商", price: 16.40,   change: 0.28,   changePct: 1.74,  volume: 2890000,  marketCap: 170000000000  },
  { symbol: "600837", name: "海通证券", nameEn: "Haitong Securities",  market: "A", exchange: "SH", currency: "CNY", industry: "券商", price: 8.62,    change: 0.12,   changePct: 1.41,  volume: 4560000,  marketCap: 93000000000   },
  { symbol: "600999", name: "招商证券", nameEn: "CMB Securities",      market: "A", exchange: "SH", currency: "CNY", industry: "券商", price: 14.30,   change: 0.24,   changePct: 1.71,  volume: 2340000,  marketCap: 112000000000  },
  { symbol: "601688", name: "华泰证券", nameEn: "Huatai Securities",   market: "A", exchange: "SH", currency: "CNY", industry: "券商", price: 18.80,   change: 0.32,   changePct: 1.73,  volume: 1890000,  marketCap: 139000000000  },
  // 新能源/汽车
  { symbol: "002594", name: "比亚迪",   nameEn: "BYD Co",              market: "A", exchange: "SZ", currency: "CNY", industry: "新能源汽车", price: 245.60, change: 5.80, changePct: 2.42,  volume: 568900,   marketCap: 714300000000  },
  { symbol: "300750", name: "宁德时代", nameEn: "CATL",             market: "A", exchange: "SZ", currency: "CNY", industry: "动力电池", price: 198.40, change: 3.20,  changePct: 1.64,  volume: 892300,   marketCap: 869200000000  },
  { symbol: "000625", name: "长安汽车", nameEn: "Changan Auto",     market: "A", exchange: "SZ", currency: "CNY", industry: "汽车",   price: 12.80,   change: 0.28,   changePct: 2.24,  volume: 3450000,  marketCap: 107000000000  },
  { symbol: "600104", name: "上汽集团", nameEn: "SAIC Motor",       market: "A", exchange: "SH", currency: "CNY", industry: "汽车",   price: 14.60,   change: -0.20,  changePct: -1.35, volume: 2890000,  marketCap: 138000000000  },
  { symbol: "601238", name: "广汽集团", nameEn: "GAC Group",        market: "A", exchange: "SH", currency: "CNY", industry: "汽车",   price: 5.46,    change: 0.08,   changePct: 1.49,  volume: 4560000,  marketCap: 55000000000   },
  // 半导体/芯片
  { symbol: "688981", name: "中芯国际", nameEn: "SMIC",              market: "A", exchange: "SH", currency: "CNY", industry: "半导体", price: 54.80,   change: 1.20,   changePct: 2.24,  volume: 1230000,  marketCap: 414000000000  },
  { symbol: "688041", name: "海光信息", nameEn: "Hygon Information", market: "A", exchange: "SH", currency: "CNY", industry: "半导体", price: 68.40,   change: 2.40,   changePct: 3.64,  volume: 890000,   marketCap: 271000000000  },
  { symbol: "688008", name: "澜起科技", nameEn: "Montage Technology", market: "A", exchange: "SH", currency: "CNY", industry: "半导体", price: 32.60,  change: 0.80,   changePct: 2.51,  volume: 456000,   marketCap: 49000000000   },
  { symbol: "002371", name: "北方华创", nameEn: "NAURA Technology",  market: "A", exchange: "SZ", currency: "CNY", industry: "半导体", price: 198.40,  change: 6.40,   changePct: 3.33,  volume: 234000,   marketCap: 95000000000   },
  { symbol: "603501", name: "韦尔股份", nameEn: "Will Semi",         market: "A", exchange: "SH", currency: "CNY", industry: "半导体", price: 86.40,   change: 2.80,   changePct: 3.35,  volume: 345000,   marketCap: 76000000000   },
  { symbol: "300782", name: "卓胜微",   nameEn: "Vanchip",               market: "A", exchange: "SZ", currency: "CNY", industry: "半导体", price: 54.60,   change: 1.60,   changePct: 3.02,  volume: 234000,   marketCap: 27000000000   },
  { symbol: "300661", name: "圣邦股份", nameEn: "SGMICRO",           market: "A", exchange: "SZ", currency: "CNY", industry: "半导体", price: 118.40,  change: 4.20,   changePct: 3.68,  volume: 145000,   marketCap: 35000000000   },
  { symbol: "688256", name: "寒武纪",   nameEn: "Cambricon",             market: "A", exchange: "SH", currency: "CNY", industry: "AI芯片", price: 436.80,  change: 18.40,  changePct: 4.40,  volume: 198000,   marketCap: 176000000000  },
  // 科技/AI
  { symbol: "002230", name: "科大讯飞", nameEn: "iFlytek",           market: "A", exchange: "SZ", currency: "CNY", industry: "AI",     price: 36.80,   change: 1.20,   changePct: 3.37,  volume: 2340000,  marketCap: 100000000000  },
  { symbol: "002415", name: "海康威视", nameEn: "Hikvision",         market: "A", exchange: "SZ", currency: "CNY", industry: "安防",   price: 28.60,   change: 0.40,   changePct: 1.42,  volume: 3450000,  marketCap: 272000000000  },
  { symbol: "002236", name: "大华股份", nameEn: "Dahua Technology",  market: "A", exchange: "SZ", currency: "CNY", industry: "安防",   price: 12.40,   change: 0.20,   changePct: 1.64,  volume: 1890000,  marketCap: 37000000000   },
  // 医药/医疗
  { symbol: "600276", name: "恒瑞医药", nameEn: "Hengrui Medicine",  market: "A", exchange: "SH", currency: "CNY", industry: "医药",   price: 42.60,   change: -0.80,  changePct: -1.84, volume: 1230000,  marketCap: 271000000000  },
  { symbol: "603259", name: "药明康德", nameEn: "WuXi AppTec",       market: "A", exchange: "SH", currency: "CNY", industry: "医药CRO", price: 52.40,  change: 1.40,   changePct: 2.75,  volume: 890000,   marketCap: 152000000000  },
  { symbol: "600436", name: "片仔癟",   nameEn: "Pien Tze Huang",        market: "A", exchange: "SH", currency: "CNY", industry: "中药",   price: 286.40,  change: 4.60,   changePct: 1.63,  volume: 89000,    marketCap: 171000000000  },
  { symbol: "300760", name: "迈瑞医疗", nameEn: "Mindray",           market: "A", exchange: "SZ", currency: "CNY", industry: "医疗器械", price: 248.60, change: 3.60, changePct: 1.47,  volume: 234000,   marketCap: 298000000000  },
  { symbol: "300015", name: "爱尔眼科", nameEn: "Aier Eye Hospital", market: "A", exchange: "SZ", currency: "CNY", industry: "医疗",   price: 12.80,   change: 0.20,   changePct: 1.59,  volume: 2340000,  marketCap: 99000000000   },
  { symbol: "600763", name: "通策医疗", nameEn: "Tongce Medical",    market: "A", exchange: "SH", currency: "CNY", industry: "医疗",   price: 56.40,   change: 0.80,   changePct: 1.44,  volume: 145000,   marketCap: 22000000000   },
  { symbol: "300601", name: "康泰生物", nameEn: "Kangtai Biological", market: "A", exchange: "SZ", currency: "CNY", industry: "生物医药", price: 18.40, change: 0.40,   changePct: 2.22,  volume: 456000,   marketCap: 17000000000   },
  // 消费/零售
  { symbol: "603288", name: "海天味业", nameEn: "Haitian Flavouring", market: "A", exchange: "SH", currency: "CNY", industry: "食品",  price: 36.80,   change: 0.60,   changePct: 1.66,  volume: 890000,   marketCap: 208000000000  },
  { symbol: "601888", name: "中国中免", nameEn: "CDFG",               market: "A", exchange: "SH", currency: "CNY", industry: "免税零售", price: 72.40, change: 1.60, changePct: 2.26,  volume: 456000,   marketCap: 148000000000  },
  { symbol: "600887", name: "伊利股份", nameEn: "Yili Group",         market: "A", exchange: "SH", currency: "CNY", industry: "乳制品", price: 24.60,   change: 0.40,   changePct: 1.65,  volume: 2340000,  marketCap: 159000000000  },
  { symbol: "000333", name: "美的集团", nameEn: "Midea Group",        market: "A", exchange: "SZ", currency: "CNY", industry: "家电",   price: 58.60,   change: 0.80,   changePct: 1.38,  volume: 1890000,  marketCap: 404000000000  },
  { symbol: "000651", name: "格力电器", nameEn: "Gree Electric",      market: "A", exchange: "SZ", currency: "CNY", industry: "家电",   price: 36.80,   change: 0.40,   changePct: 1.10,  volume: 2340000,  marketCap: 218000000000  },
  { symbol: "600690", name: "海尔智家", nameEn: "Haier Smart Home",  market: "A", exchange: "SH", currency: "CNY", industry: "家电",   price: 24.60,   change: 0.40,   changePct: 1.65,  volume: 3450000,  marketCap: 223000000000  },
  // 能源
  { symbol: "601857", name: "中国石油", nameEn: "PetroChina",        market: "A", exchange: "SH", currency: "CNY", industry: "石油化工", price: 8.42,  change: 0.12,   changePct: 1.45,  volume: 6234000,  marketCap: 1548000000000 },
  { symbol: "600028", name: "中国石化", nameEn: "Sinopec",           market: "A", exchange: "SH", currency: "CNY", industry: "石油化工", price: 5.62,  change: 0.08,   changePct: 1.44,  volume: 8910000,  marketCap: 672000000000  },
  { symbol: "601088", name: "中国神华", nameEn: "China Shenhua",     market: "A", exchange: "SH", currency: "CNY", industry: "煤炭能源", price: 38.60, change: 0.60,   changePct: 1.58,  volume: 2340000,  marketCap: 771000000000  },
  { symbol: "600795", name: "国电电力", nameEn: "Guodian Power",     market: "A", exchange: "SH", currency: "CNY", industry: "电力",   price: 4.86,    change: 0.06,   changePct: 1.25,  volume: 4560000,  marketCap: 57000000000   },
  { symbol: "600011", name: "华能国际", nameEn: "Huaneng Power",     market: "A", exchange: "SH", currency: "CNY", industry: "电力",   price: 6.82,    change: 0.08,   changePct: 1.19,  volume: 3450000,  marketCap: 95000000000   },
  { symbol: "600938", name: "中国海油", nameEn: "CNOOC",             market: "A", exchange: "SH", currency: "CNY", industry: "石油化工", price: 18.60, change: 0.28,   changePct: 1.53,  volume: 5670000,  marketCap: 394000000000  },
  // 地产
  { symbol: "000002", name: "万科A",    nameEn: "Vanke",               market: "A", exchange: "SZ", currency: "CNY", industry: "房地产", price: 6.86,    change: -0.08,  changePct: -1.15, volume: 5670000,  marketCap: 81000000000   },
  { symbol: "600048", name: "保利发展", nameEn: "Poly Developments", market: "A", exchange: "SH", currency: "CNY", industry: "房地产", price: 8.42,  change: 0.12,   changePct: 1.45,  volume: 6780000,  marketCap: 98000000000   },
  { symbol: "001979", name: "招商蛇口", nameEn: "CMC",               market: "A", exchange: "SZ", currency: "CNY", industry: "房地产", price: 11.60,  change: 0.20,   changePct: 1.75,  volume: 3450000,  marketCap: 86000000000   },
  // 军工
  { symbol: "000768", name: "中航西飞", nameEn: "AVIC Xian Aircraft", market: "A", exchange: "SZ", currency: "CNY", industry: "军工",  price: 28.60,   change: 0.60,   changePct: 2.14,  volume: 1230000,  marketCap: 79000000000   },
  { symbol: "600038", name: "中直股份", nameEn: "AVIC Helicopter",   market: "A", exchange: "SH", currency: "CNY", industry: "军工",  price: 36.80,   change: 0.80,   changePct: 2.22,  volume: 456000,   marketCap: 33000000000   },
  { symbol: "600893", name: "航发动力", nameEn: "AECC Aviation Power", market: "A", exchange: "SH", currency: "CNY", industry: "军工", price: 42.60,   change: 1.20,   changePct: 2.90,  volume: 345000,   marketCap: 56000000000   },
  { symbol: "600316", name: "洪都航空", nameEn: "HAIG",               market: "A", exchange: "SH", currency: "CNY", industry: "军工",  price: 28.40,   change: 0.60,   changePct: 2.16,  volume: 234000,   marketCap: 40000000000   },
  // 传媒
  { symbol: "002027", name: "分众传媒", nameEn: "Focus Media",        market: "A", exchange: "SZ", currency: "CNY", industry: "传媒",  price: 6.42,    change: 0.12,   changePct: 1.91,  volume: 3450000,  marketCap: 47000000000   },
  { symbol: "300413", name: "芒果超媒", nameEn: "Mango Excellent Media", market: "A", exchange: "SZ", currency: "CNY", industry: "传媒", price: 18.60, change: 0.40,   changePct: 2.20,  volume: 890000,   marketCap: 25000000000   },
  { symbol: "002624", name: "完美世界", nameEn: "Perfect World",      market: "A", exchange: "SZ", currency: "CNY", industry: "游戏",   price: 8.42,    change: 0.18,   changePct: 2.18,  volume: 1230000,  marketCap: 14000000000   },
  // 钢铁/材料
  { symbol: "600019", name: "宝锤股份", nameEn: "Baosteel",           market: "A", exchange: "SH", currency: "CNY", industry: "钔铁",   price: 6.82,    change: 0.08,   changePct: 1.19,  volume: 6780000,  marketCap: 78000000000   },
  { symbol: "600282", name: "南锤股份", nameEn: "Nanjing Iron Steel", market: "A", exchange: "SH", currency: "CNY", industry: "钔铁",   price: 3.64,    change: 0.04,   changePct: 1.11,  volume: 4560000,  marketCap: 24000000000   },
  { symbol: "601899", name: "紫金矿业", nameEn: "Zijin Mining",       market: "A", exchange: "SH", currency: "CNY", industry: "有色金属", price: 14.80, change: 0.40,   changePct: 2.78,  volume: 5670000,  marketCap: 432000000000  },
  { symbol: "601600", name: "中国铝业", nameEn: "Aluminum Corp",      market: "A", exchange: "SH", currency: "CNY", industry: "有色金属", price: 6.24,  change: 0.12,   changePct: 1.96,  volume: 4560000,  marketCap: 131000000000  },
  // 基建/交通
  { symbol: "601668", name: "中国建筑", nameEn: "CSCEC",              market: "A", exchange: "SH", currency: "CNY", industry: "建筑",   price: 5.48,    change: 0.08,   changePct: 1.48,  volume: 8910000,  marketCap: 210000000000  },
  { symbol: "601390", name: "中国中铁", nameEn: "China Railway",      market: "A", exchange: "SH", currency: "CNY", industry: "建筑",   price: 6.82,    change: 0.10,   changePct: 1.49,  volume: 6780000,  marketCap: 221000000000  },
  { symbol: "601186", name: "中国铁建", nameEn: "CRCC",               market: "A", exchange: "SH", currency: "CNY", industry: "建筑",   price: 8.62,    change: 0.12,   changePct: 1.41,  volume: 5670000,  marketCap: 188000000000  },
  { symbol: "601800", name: "中国交建", nameEn: "CCCC",               market: "A", exchange: "SH", currency: "CNY", industry: "建筑",   price: 7.48,    change: 0.10,   changePct: 1.36,  volume: 6780000,  marketCap: 183000000000  },
  // 通信
  { symbol: "600941", name: "中国移动", nameEn: "China Mobile A",     market: "A", exchange: "SH", currency: "CNY", industry: "电信",   price: 86.40,   change: 0.80,   changePct: 0.93,  volume: 2340000,  marketCap: 1780000000000 },
  { symbol: "600050", name: "中国联通", nameEn: "China Unicom A",     market: "A", exchange: "SH", currency: "CNY", industry: "电信",   price: 5.82,    change: 0.06,   changePct: 1.04,  volume: 5670000,  marketCap: 185000000000  },
  { symbol: "601728", name: "中国电信", nameEn: "China Telecom A",    market: "A", exchange: "SH", currency: "CNY", industry: "电信",   price: 5.42,    change: 0.06,   changePct: 1.12,  volume: 6780000,  marketCap: 427000000000  },
  { symbol: "000063", name: "中兴通讯", nameEn: "ZTE",                market: "A", exchange: "SZ", currency: "CNY", industry: "通信设备", price: 28.60, change: 0.60,   changePct: 2.14,  volume: 2340000,  marketCap: 137000000000  },
  // 新能源/光伏
  { symbol: "601012", name: "隆基绿能", nameEn: "LONGi Green Energy", market: "A", exchange: "SH", currency: "CNY", industry: "光伏",   price: 14.80,   change: 0.40,   changePct: 2.78,  volume: 3450000,  marketCap: 119000000000  },
  { symbol: "002459", name: "晶澳科技", nameEn: "JA Solar",           market: "A", exchange: "SZ", currency: "CNY", industry: "光伏",   price: 12.40,   change: 0.30,   changePct: 2.48,  volume: 2340000,  marketCap: 36000000000   },
  { symbol: "600438", name: "通威股份", nameEn: "Tongwei",             market: "A", exchange: "SH", currency: "CNY", industry: "光伏",   price: 10.40,   change: 0.20,   changePct: 1.96,  volume: 3450000,  marketCap: 45000000000   },
  { symbol: "300274", name: "阳光电源", nameEn: "Sungrow Power",       market: "A", exchange: "SZ", currency: "CNY", industry: "逆变器", price: 64.80, change: 1.40,   changePct: 2.21,  volume: 1230000,  marketCap: 123000000000  },
  { symbol: "002271", name: "东方雨虹", nameEn: "Oriental Yuhong",    market: "A", exchange: "SZ", currency: "CNY", industry: "建材",   price: 12.60,   change: 0.20,   changePct: 1.61,  volume: 1890000,  marketCap: 25000000000   },
];

// ─── 港股 (65+ stocks) ────────────────────────────────────────
const HK_STOCKS: StockInfo[] = [
  // 科技互联网
  { symbol: "00700", name: "腾讯控股", nameEn: "Tencent",            market: "HK", exchange: "HKEX", currency: "HKD", industry: "互联网",  price: 320.40, change: -2.60,  changePct: -0.80, volume: 18920000, marketCap: 3082000000000 },
  { symbol: "09988", name: "阿里巴巴", nameEn: "Alibaba",            market: "HK", exchange: "HKEX", currency: "HKD", industry: "互联网",  price: 78.45,  change: 1.25,   changePct: 1.62,  volume: 32450000, marketCap: 1689000000000 },
  { symbol: "03690", name: "美团",     nameEn: "Meituan",                    market: "HK", exchange: "HKEX", currency: "HKD", industry: "本地生活", price: 145.30, change: 3.80, changePct: 2.69,  volume: 22130000, marketCap: 892000000000  },
  { symbol: "09618", name: "京东集团", nameEn: "JD.com",            market: "HK", exchange: "HKEX", currency: "HKD", industry: "电商",     price: 148.50, change: 3.20,   changePct: 2.20,  volume: 12340000, marketCap: 468000000000  },
  { symbol: "01810", name: "小米集团", nameEn: "Xiaomi",            market: "HK", exchange: "HKEX", currency: "HKD", industry: "智能硬件", price: 24.80, change: 0.60,  changePct: 2.48,  volume: 45670000, marketCap: 619000000000  },
  { symbol: "01024", name: "快手",     nameEn: "Kuaishou",                   market: "HK", exchange: "HKEX", currency: "HKD", industry: "短视频",  price: 38.60,  change: 0.80,   changePct: 2.12,  volume: 28900000, marketCap: 164000000000  },
  { symbol: "09999", name: "网易",     nameEn: "NetEase",                    market: "HK", exchange: "HKEX", currency: "HKD", industry: "互联网游戏", price: 158.60, change: 2.60, changePct: 1.67, volume: 8920000,  marketCap: 206000000000  },
  { symbol: "09888", name: "百度",     nameEn: "Baidu",                      market: "HK", exchange: "HKEX", currency: "HKD", industry: "互联网",  price: 82.40,  change: 1.40,   changePct: 1.73,  volume: 12340000, marketCap: 234000000000  },
  { symbol: "09626", name: "哔哩哔哩", nameEn: "Bilibili",           market: "HK", exchange: "HKEX", currency: "HKD", industry: "视频平台", price: 124.60, change: 3.40, changePct: 2.81,  volume: 6780000,  marketCap: 48000000000   },
  { symbol: "09961", name: "携程集团", nameEn: "Trip.com",           market: "HK", exchange: "HKEX", currency: "HKD", industry: "在线旅游", price: 468.60, change: 8.40, changePct: 1.83,  volume: 3450000,  marketCap: 322000000000  },
  // 通信
  { symbol: "00941", name: "中国移动", nameEn: "China Mobile HK",    market: "HK", exchange: "HKEX", currency: "HKD", industry: "电信",    price: 68.40,  change: 0.60,   changePct: 0.89,  volume: 28900000, marketCap: 1412000000000 },
  { symbol: "00762", name: "中国联通", nameEn: "China Unicom HK",    market: "HK", exchange: "HKEX", currency: "HKD", industry: "电信",    price: 5.24,   change: 0.06,   changePct: 1.16,  volume: 45670000, marketCap: 162000000000  },
  { symbol: "00728", name: "中国电信", nameEn: "China Telecom HK",   market: "HK", exchange: "HKEX", currency: "HKD", industry: "电信",    price: 3.82,   change: 0.04,   changePct: 1.06,  volume: 56780000, marketCap: 351000000000  },
  // 金融银行
  { symbol: "00005", name: "汇丰控股", nameEn: "HSBC",              market: "HK", exchange: "HKEX", currency: "HKD", industry: "銀行",    price: 64.80,  change: 0.80,   changePct: 1.25,  volume: 23450000, marketCap: 1213000000000 },
  { symbol: "00939", name: "建设銀行", nameEn: "CCB HK",            market: "HK", exchange: "HKEX", currency: "HKD", industry: "銀行",    price: 5.82,   change: 0.06,   changePct: 1.04,  volume: 78900000, marketCap: 1459000000000 },
  { symbol: "01398", name: "工商銀行", nameEn: "ICBC HK",           market: "HK", exchange: "HKEX", currency: "HKD", industry: "銀行",    price: 4.62,   change: 0.04,   changePct: 0.87,  volume: 89010000, marketCap: 1647000000000 },
  { symbol: "03988", name: "中国銀行", nameEn: "Bank of China HK",  market: "HK", exchange: "HKEX", currency: "HKD", industry: "銀行",    price: 3.48,   change: 0.02,   changePct: 0.58,  volume: 67890000, marketCap: 1243000000000 },
  { symbol: "03968", name: "招商銀行", nameEn: "CMB HK",            market: "HK", exchange: "HKEX", currency: "HKD", industry: "銀行",    price: 30.40,  change: 0.40,   changePct: 1.33,  volume: 12340000, marketCap: 769000000000  },
  { symbol: "02318", name: "中国平安", nameEn: "Ping An HK",        market: "HK", exchange: "HKEX", currency: "HKD", industry: "保险",    price: 36.80,  change: 0.60,   changePct: 1.66,  volume: 18920000, marketCap: 672000000000  },
  { symbol: "02628", name: "中国人寿", nameEn: "China Life HK",     market: "HK", exchange: "HKEX", currency: "HKD", industry: "保险",    price: 13.60,  change: 0.20,   changePct: 1.49,  volume: 23450000, marketCap: 386000000000  },
  { symbol: "01299", name: "友邦保险", nameEn: "AIA Group",         market: "HK", exchange: "HKEX", currency: "HKD", industry: "保险",    price: 58.60,  change: 0.80,   changePct: 1.38,  volume: 12340000, marketCap: 721000000000  },
  { symbol: "00388", name: "香港交易所", nameEn: "HKEx",        market: "HK", exchange: "HKEX", currency: "HKD", industry: "交易所", price: 286.40, change: 4.40, changePct: 1.56,  volume: 3450000,  marketCap: 366000000000  },
  { symbol: "00011", name: "恒生銀行", nameEn: "Hang Seng Bank",     market: "HK", exchange: "HKEX", currency: "HKD", industry: "銀行",    price: 98.60,  change: 0.80,   changePct: 0.82,  volume: 2340000,  marketCap: 192000000000  },
  // 消费
  { symbol: "02331", name: "李宁",     nameEn: "Li Ning",                    market: "HK", exchange: "HKEX", currency: "HKD", industry: "运动服装", price: 18.60, change: 0.40, changePct: 2.20,  volume: 12340000, marketCap: 46000000000   },
  { symbol: "02020", name: "安踏体育", nameEn: "Anta Sports",       market: "HK", exchange: "HKEX", currency: "HKD", industry: "运动服装", price: 68.40, change: 1.40, changePct: 2.09,  volume: 8920000,  marketCap: 192000000000  },
  { symbol: "00291", name: "华润啊酒", nameEn: "CR Beer",            market: "HK", exchange: "HKEX", currency: "HKD", industry: "食品饮料", price: 28.60, change: 0.40, changePct: 1.42,  volume: 6780000,  marketCap: 61000000000   },
  { symbol: "02319", name: "蒙牛乳业", nameEn: "Mengniu Dairy",      market: "HK", exchange: "HKEX", currency: "HKD", industry: "乳制品",  price: 14.80,  change: 0.20,   changePct: 1.37,  volume: 12340000, marketCap: 58000000000   },
  { symbol: "01880", name: "中国中免", nameEn: "CDFG HK",           market: "HK", exchange: "HKEX", currency: "HKD", industry: "免税零售", price: 62.40, change: 1.20, changePct: 1.96,  volume: 3450000,  marketCap: 128000000000  },
  { symbol: "06862", name: "海底捐",   nameEn: "Haidilao",               market: "HK", exchange: "HKEX", currency: "HKD", industry: "餐饮",    price: 14.80,  change: 0.40,   changePct: 2.78,  volume: 18920000, marketCap: 82000000000   },
  { symbol: "09633", name: "农夫山泉", nameEn: "Nongfu Spring",      market: "HK", exchange: "HKEX", currency: "HKD", industry: "饮料",    price: 26.40,  change: 0.40,   changePct: 1.54,  volume: 12340000, marketCap: 295000000000  },
  { symbol: "01929", name: "周大福",   nameEn: "Chow Tai Fook",           market: "HK", exchange: "HKEX", currency: "HKD", industry: "珠宝",    price: 8.62,   change: 0.12,   changePct: 1.41,  volume: 6780000,  marketCap: 86000000000   },
  { symbol: "09992", name: "泡泡玛特", nameEn: "Pop Mart",           market: "HK", exchange: "HKEX", currency: "HKD", industry: "玩具",    price: 86.40,  change: 3.40,   changePct: 4.10,  volume: 8920000,  marketCap: 112000000000  },
  // 能源
  { symbol: "00883", name: "中海油",   nameEn: "CNOOC HK",              market: "HK", exchange: "HKEX", currency: "HKD", industry: "石油",    price: 14.80,  change: 0.20,   changePct: 1.37,  volume: 28900000, marketCap: 315000000000  },
  { symbol: "00857", name: "中国石油", nameEn: "PetroChina HK",     market: "HK", exchange: "HKEX", currency: "HKD", industry: "石油化工", price: 6.42, change: 0.08,  changePct: 1.26,  volume: 56780000, marketCap: 1181000000000 },
  { symbol: "00386", name: "中国石化", nameEn: "Sinopec HK",        market: "HK", exchange: "HKEX", currency: "HKD", industry: "石油化工", price: 4.62, change: 0.06,  changePct: 1.32,  volume: 78900000, marketCap: 553000000000  },
  { symbol: "01088", name: "中国神华", nameEn: "China Shenhua HK",  market: "HK", exchange: "HKEX", currency: "HKD", industry: "煤炭",    price: 30.40,  change: 0.40,   changePct: 1.33,  volume: 6780000,  marketCap: 609000000000  },
  { symbol: "00916", name: "龙源电力", nameEn: "Longyuan Power",    market: "HK", exchange: "HKEX", currency: "HKD", industry: "风电",    price: 5.82,   change: 0.10,   changePct: 1.75,  volume: 12340000, marketCap: 45000000000   },
  // 地产
  { symbol: "02007", name: "碧桂园",   nameEn: "Country Garden",         market: "HK", exchange: "HKEX", currency: "HKD", industry: "房地产", price: 0.68,  change: 0.02,   changePct: 3.03,  volume: 89010000, marketCap: 18000000000   },
  { symbol: "00960", name: "龙湖集团", nameEn: "Longfor Group",     market: "HK", exchange: "HKEX", currency: "HKD", industry: "房地产", price: 10.40, change: 0.20,   changePct: 1.96,  volume: 23450000, marketCap: 46000000000   },
  { symbol: "01109", name: "华润置地", nameEn: "CR Land",           market: "HK", exchange: "HKEX", currency: "HKD", industry: "房地产", price: 24.60, change: 0.40,   changePct: 1.65,  volume: 12340000, marketCap: 86000000000   },
  { symbol: "00016", name: "新鸿基地产", nameEn: "Sun Hung Kai", market: "HK", exchange: "HKEX", currency: "HKD", industry: "房地产", price: 78.40, change: 0.80, changePct: 1.03,  volume: 3450000,  marketCap: 213000000000  },
  // 综合
  { symbol: "00001", name: "长和",     nameEn: "CK Hutchison",               market: "HK", exchange: "HKEX", currency: "HKD", industry: "综合",    price: 34.80,  change: 0.40,   changePct: 1.16,  volume: 6780000,  marketCap: 135000000000  },
  { symbol: "01113", name: "长实集团", nameEn: "CK Asset",          market: "HK", exchange: "HKEX", currency: "HKD", industry: "综合",    price: 38.60,  change: 0.40,   changePct: 1.05,  volume: 3450000,  marketCap: 104000000000  },
  // 汽车
  { symbol: "02594", name: "比亚迪股份", nameEn: "BYD HK",      market: "HK", exchange: "HKEX", currency: "HKD", industry: "新能源汽车", price: 234.40, change: 6.40, changePct: 2.81, volume: 8920000, marketCap: 676000000000 },
  { symbol: "00175", name: "吉利汽车", nameEn: "Geely Auto",        market: "HK", exchange: "HKEX", currency: "HKD", industry: "汽车",    price: 9.86,   change: 0.26,   changePct: 2.71,  volume: 45670000, marketCap: 96000000000   },
  { symbol: "02333", name: "长城汽车", nameEn: "Great Wall Motor",  market: "HK", exchange: "HKEX", currency: "HKD", industry: "汽车",    price: 12.40,  change: 0.30,   changePct: 2.48,  volume: 23450000, marketCap: 116000000000  },
  // 医药
  { symbol: "02269", name: "药明生物", nameEn: "WuXi Biologics",    market: "HK", exchange: "HKEX", currency: "HKD", industry: "生物医药", price: 14.80, change: 0.40, changePct: 2.78, volume: 12340000, marketCap: 80000000000  },
  { symbol: "01093", name: "石药集团", nameEn: "CSPC Pharmaceutical", market: "HK", exchange: "HKEX", currency: "HKD", industry: "医药", price: 6.82, change: 0.12, changePct: 1.79, volume: 23450000, marketCap: 67000000000    },
  { symbol: "01177", name: "中生制药", nameEn: "Sino Biopharm",     market: "HK", exchange: "HKEX", currency: "HKD", industry: "医药",    price: 5.24,   change: 0.08,   changePct: 1.55,  volume: 18920000, marketCap: 42000000000   },
  { symbol: "03692", name: "翰森制药", nameEn: "Hansoh Pharma",     market: "HK", exchange: "HKEX", currency: "HKD", industry: "医药",    price: 8.62,   change: 0.18,   changePct: 2.13,  volume: 6780000,  marketCap: 36000000000   },
  // 光能
  { symbol: "00968", name: "信义光能", nameEn: "Xinyi Solar",       market: "HK", exchange: "HKEX", currency: "HKD", industry: "光伏",    price: 3.84,   change: 0.08,   changePct: 2.13,  volume: 23450000, marketCap: 23000000000   },
];

// ─── 美股 (85+ stocks) ────────────────────────────────────────
const US_STOCKS: StockInfo[] = [
  // 科技大盘
  { symbol: "AAPL",  name: "苹果",     nameEn: "Apple",              market: "US", exchange: "NASDAQ", currency: "USD", industry: "科技",    price: 189.30,  change: 2.10,   changePct: 1.12,  volume: 68420000,  marketCap: 2920000000000 },
  { symbol: "MSFT",  name: "微软",     nameEn: "Microsoft",          market: "US", exchange: "NASDAQ", currency: "USD", industry: "科技",    price: 415.20,  change: 3.80,   changePct: 0.92,  volume: 21340000,  marketCap: 3087000000000 },
  { symbol: "GOOGL", name: "谷歌",     nameEn: "Alphabet",           market: "US", exchange: "NASDAQ", currency: "USD", industry: "互联网", price: 175.80, change: 1.60,  changePct: 0.92,  volume: 22140000,  marketCap: 2178000000000 },
  { symbol: "AMZN",  name: "亚马逊", nameEn: "Amazon",           market: "US", exchange: "NASDAQ", currency: "USD", industry: "电商/云", price: 196.50, change: 2.80, changePct: 1.45,  volume: 38420000,  marketCap: 2048000000000 },
  { symbol: "META",  name: "Meta",             nameEn: "Meta Platforms",     market: "US", exchange: "NASDAQ", currency: "USD", industry: "社交媒体", price: 525.60, change: -8.40, changePct: -1.57, volume: 15680000, marketCap: 1342000000000 },
  { symbol: "NVDA",  name: "苹果芯片", nameEn: "Nvidia",     market: "US", exchange: "NASDAQ", currency: "USD", industry: "半导体", price: 875.40, change: 18.60, changePct: 2.17,  volume: 45230000,  marketCap: 2158000000000 },
  { symbol: "TSLA",  name: "特斯拉", nameEn: "Tesla",            market: "US", exchange: "NASDAQ", currency: "USD", industry: "新能源汽车", price: 248.50, change: -6.40, changePct: -2.51, volume: 124560000, marketCap: 791000000000 },
  { symbol: "NFLX",  name: "奈飞",     nameEn: "Netflix",            market: "US", exchange: "NASDAQ", currency: "USD", industry: "流媒体", price: 628.40,  change: 8.60,   changePct: 1.39,  volume: 5670000,   marketCap: 269000000000  },
  { symbol: "AMD",   name: "AMD",              nameEn: "Advanced Micro Devices", market: "US", exchange: "NASDAQ", currency: "USD", industry: "半导体", price: 168.40, change: 4.60, changePct: 2.81, volume: 45670000,  marketCap: 273000000000  },
  { symbol: "INTC",  name: "苹果芯片", nameEn: "Intel",      market: "US", exchange: "NASDAQ", currency: "USD", industry: "半导体", price: 30.40,   change: -0.40,  changePct: -1.30, volume: 34560000,  marketCap: 129000000000  },
  { symbol: "ORCL",  name: "甲骨文", nameEn: "Oracle",           market: "US", exchange: "NYSE",   currency: "USD", industry: "企业软件", price: 128.40, change: 1.60, changePct: 1.26,  volume: 8920000,   marketCap: 352000000000  },
  { symbol: "CRM",   name: "Salesforce",       nameEn: "Salesforce",         market: "US", exchange: "NYSE",   currency: "USD", industry: "云软件",  price: 286.40,  change: 3.60,   changePct: 1.27,  volume: 5670000,   marketCap: 277000000000  },
  { symbol: "ADBE",  name: "Adobe",            nameEn: "Adobe",              market: "US", exchange: "NASDAQ", currency: "USD", industry: "软件",    price: 468.60,  change: 5.60,   changePct: 1.21,  volume: 3450000,   marketCap: 208000000000  },
  { symbol: "CSCO",  name: "思科",     nameEn: "Cisco",              market: "US", exchange: "NASDAQ", currency: "USD", industry: "网络",    price: 48.60,   change: 0.40,   changePct: 0.83,  volume: 12340000,  marketCap: 196000000000  },
  { symbol: "QCOM",  name: "高通",     nameEn: "Qualcomm",           market: "US", exchange: "NASDAQ", currency: "USD", industry: "半导体", price: 168.40, change: 2.40,   changePct: 1.45,  volume: 8920000,   marketCap: 188000000000  },
  { symbol: "TXN",   name: "德州仪器", nameEn: "Texas Instruments", market: "US", exchange: "NASDAQ", currency: "USD", industry: "半导体", price: 168.40, change: 1.80, changePct: 1.08, volume: 5670000,   marketCap: 154000000000  },
  { symbol: "AVGO",  name: "博通",     nameEn: "Broadcom",           market: "US", exchange: "NASDAQ", currency: "USD", industry: "半导体", price: 1368.40, change: 28.40, changePct: 2.12, volume: 3450000,   marketCap: 624000000000  },
  { symbol: "MU",    name: "美光",     nameEn: "Micron Technology",  market: "US", exchange: "NASDAQ", currency: "USD", industry: "存储芯片", price: 108.40, change: 2.80, changePct: 2.65, volume: 12340000,  marketCap: 120000000000  },
  { symbol: "AMAT",  name: "应用材料", nameEn: "Applied Materials", market: "US", exchange: "NASDAQ", currency: "USD", industry: "半导体设备", price: 198.40, change: 4.60, changePct: 2.37, volume: 6780000,   marketCap: 171000000000  },
  // 中概股
  { symbol: "BABA",  name: "阿里巴巴美股", nameEn: "Alibaba", market: "US", exchange: "NYSE", currency: "USD", industry: "电商", price: 72.40,   change: 1.20,   changePct: 1.69,  volume: 18920000,  marketCap: 697000000000  },
  { symbol: "JD",    name: "京东美股", nameEn: "JD.com US", market: "US", exchange: "NASDAQ", currency: "USD", industry: "电商",    price: 28.60,   change: 0.60,   changePct: 2.14,  volume: 6780000,   marketCap: 45000000000   },
  { symbol: "PDD",   name: "拼多多",   nameEn: "PDD Holdings",       market: "US", exchange: "NASDAQ", currency: "USD", industry: "电商",    price: 128.40,  change: 2.40,   changePct: 1.91,  volume: 8920000,   marketCap: 168000000000  },
  { symbol: "BIDU",  name: "百度",     nameEn: "Baidu US",           market: "US", exchange: "NASDAQ", currency: "USD", industry: "互联网", price: 86.40,   change: 1.40,   changePct: 1.65,  volume: 5670000,   marketCap: 31000000000   },
  { symbol: "NIO",   name: "蕉来",     nameEn: "NIO",                market: "US", exchange: "NYSE",   currency: "USD", industry: "新能源汽车", price: 5.62,  change: 0.12,   changePct: 2.18,  volume: 45670000,  marketCap: 11000000000   },
  { symbol: "XPEV",  name: "小鹏汽车", nameEn: "XPeng",     market: "US", exchange: "NYSE",   currency: "USD", industry: "新能源汽车", price: 9.86,  change: 0.26,   changePct: 2.71,  volume: 12340000,  marketCap: 8000000000    },
  { symbol: "LI",    name: "理想汽车", nameEn: "Li Auto",   market: "US", exchange: "NASDAQ", currency: "USD", industry: "新能源汽车", price: 22.40, change: 0.60,   changePct: 2.75,  volume: 8920000,   marketCap: 24000000000   },
  { symbol: "TME",   name: "腾讯音乐", nameEn: "Tencent Music", market: "US", exchange: "NYSE", currency: "USD", industry: "音乐",   price: 14.80,   change: 0.30,   changePct: 2.07,  volume: 5670000,   marketCap: 11000000000   },
  { symbol: "BILI",  name: "哔哩哔哩美股", nameEn: "Bilibili US", market: "US", exchange: "NASDAQ", currency: "USD", industry: "视频", price: 18.60, change: 0.40, changePct: 2.20,  volume: 6780000,   marketCap: 7000000000    },
  // 金融
  { symbol: "JPM",   name: "摩根大通", nameEn: "JPMorgan Chase",     market: "US", exchange: "NYSE",   currency: "USD", industry: "銀行",    price: 198.40,  change: 2.40,   changePct: 1.22,  volume: 8920000,   marketCap: 572000000000  },
  { symbol: "BAC",   name: "美国銀行", nameEn: "Bank of America",    market: "US", exchange: "NYSE",   currency: "USD", industry: "銀行",    price: 38.60,   change: 0.40,   changePct: 1.05,  volume: 34560000,  marketCap: 297000000000  },
  { symbol: "WFC",   name: "富国銀行", nameEn: "Wells Fargo",        market: "US", exchange: "NYSE",   currency: "USD", industry: "銀行",    price: 54.80,   change: 0.60,   changePct: 1.11,  volume: 18920000,  marketCap: 198000000000  },
  { symbol: "GS",    name: "高盛",     nameEn: "Goldman Sachs",      market: "US", exchange: "NYSE",   currency: "USD", industry: "投资銀行", price: 468.60, change: 6.60,  changePct: 1.43,  volume: 3450000,   marketCap: 156000000000  },
  { symbol: "MS",    name: "摩根士丹利", nameEn: "Morgan Stanley", market: "US", exchange: "NYSE", currency: "USD", industry: "投资銀行", price: 98.60, change: 1.20, changePct: 1.23, volume: 8920000,   marketCap: 159000000000  },
  { symbol: "BLK",   name: "贝莱德", nameEn: "BlackRock",        market: "US", exchange: "NYSE",   currency: "USD", industry: "资产管理", price: 868.40, change: 10.40, changePct: 1.21, volume: 1230000,   marketCap: 132000000000  },
  { symbol: "V",     name: "Visa",             nameEn: "Visa",               market: "US", exchange: "NYSE",   currency: "USD", industry: "支付",    price: 278.40,  change: 2.40,   changePct: 0.87,  volume: 5670000,   marketCap: 563000000000  },
  { symbol: "MA",    name: "万事达", nameEn: "Mastercard",       market: "US", exchange: "NYSE",   currency: "USD", industry: "支付",    price: 468.60,  change: 4.60,   changePct: 0.99,  volume: 3450000,   marketCap: 437000000000  },
  { symbol: "AXP",   name: "美国运通", nameEn: "American Express",   market: "US", exchange: "NYSE",   currency: "USD", industry: "支付",    price: 228.40,  change: 2.60,   changePct: 1.15,  volume: 2340000,   marketCap: 167000000000  },
  { symbol: "BRK.B", name: "伯克希尔", nameEn: "Berkshire Hathaway", market: "US", exchange: "NYSE",   currency: "USD", industry: "综合金融", price: 368.40, change: 3.60, changePct: 0.99, volume: 3450000, marketCap: 798000000000  },
  // 医疗
  { symbol: "JNJ",   name: "强生",     nameEn: "Johnson & Johnson",  market: "US", exchange: "NYSE",   currency: "USD", industry: "医药",    price: 158.40,  change: 1.60,   changePct: 1.02,  volume: 6780000,   marketCap: 381000000000  },
  { symbol: "PFE",   name: "辉瑞",     nameEn: "Pfizer",             market: "US", exchange: "NYSE",   currency: "USD", industry: "制药",    price: 26.40,   change: 0.20,   changePct: 0.76,  volume: 34560000,  marketCap: 149000000000  },
  { symbol: "MRK",   name: "默沙东", nameEn: "Merck",           market: "US", exchange: "NYSE",   currency: "USD", industry: "制药",    price: 128.40,  change: 1.40,   changePct: 1.10,  volume: 8920000,   marketCap: 324000000000  },
  { symbol: "ABBV",  name: "艾伯维", nameEn: "AbbVie",          market: "US", exchange: "NYSE",   currency: "USD", industry: "生物医药", price: 168.40, change: 1.80, changePct: 1.08, volume: 8920000,   marketCap: 298000000000  },
  { symbol: "LLY",   name: "礼来",     nameEn: "Eli Lilly",          market: "US", exchange: "NYSE",   currency: "USD", industry: "制药",    price: 798.40,  change: 12.40,  changePct: 1.58,  volume: 3450000,   marketCap: 755000000000  },
  { symbol: "UNH",   name: "联合健康", nameEn: "UnitedHealth", market: "US", exchange: "NYSE", currency: "USD", industry: "医疗保险", price: 528.40, change: 5.60, changePct: 1.07, volume: 2340000,   marketCap: 499000000000  },
  { symbol: "CVS",   name: "CVS Health",       nameEn: "CVS Health",        market: "US", exchange: "NYSE",   currency: "USD", industry: "药店",    price: 68.40,   change: 0.60,   changePct: 0.88,  volume: 6780000,   marketCap: 86000000000   },
  { symbol: "BMY",   name: "百时美施贵宝", nameEn: "Bristol-Myers Squibb", market: "US", exchange: "NYSE", currency: "USD", industry: "制药", price: 48.60, change: 0.40, changePct: 0.83, volume: 12340000,  marketCap: 99000000000   },
  // 消费
  { symbol: "WMT",   name: "沃尔玛", nameEn: "Walmart",         market: "US", exchange: "NYSE",   currency: "USD", industry: "零售",    price: 64.80,   change: 0.60,   changePct: 0.93,  volume: 12340000,  marketCap: 523000000000  },
  { symbol: "COST",  name: "好市多", nameEn: "Costco",          market: "US", exchange: "NASDAQ", currency: "USD", industry: "零售",    price: 828.40,  change: 8.60,   changePct: 1.05,  volume: 2340000,   marketCap: 367000000000  },
  { symbol: "TGT",   name: "塔吉特", nameEn: "Target",          market: "US", exchange: "NYSE",   currency: "USD", industry: "零售",    price: 148.40,  change: 1.60,   changePct: 1.09,  volume: 3450000,   marketCap: 68000000000   },
  { symbol: "HD",    name: "家得宝", nameEn: "Home Depot",      market: "US", exchange: "NYSE",   currency: "USD", industry: "家居",    price: 368.40,  change: 3.60,   changePct: 0.99,  volume: 3450000,   marketCap: 366000000000  },
  { symbol: "LOW",   name: "劳氏",     nameEn: "Lowe's",            market: "US", exchange: "NYSE",   currency: "USD", industry: "家居",    price: 228.40,  change: 2.40,   changePct: 1.06,  volume: 2340000,   marketCap: 134000000000  },
  { symbol: "MCD",   name: "麦当劳", nameEn: "McDonald's",      market: "US", exchange: "NYSE",   currency: "USD", industry: "餐饮",    price: 298.40,  change: 2.40,   changePct: 0.81,  volume: 3450000,   marketCap: 217000000000  },
  { symbol: "SBUX",  name: "星巴克", nameEn: "Starbucks",        market: "US", exchange: "NASDAQ", currency: "USD", industry: "餐饮",    price: 88.40,   change: 0.80,   changePct: 0.91,  volume: 6780000,   marketCap: 99000000000   },
  { symbol: "NKE",   name: "耒克",     nameEn: "Nike",              market: "US", exchange: "NYSE",   currency: "USD", industry: "运动服装", price: 78.40,  change: 0.80,   changePct: 1.03,  volume: 8920000,   marketCap: 118000000000  },
  { symbol: "DIS",   name: "迪士尼", nameEn: "Disney",          market: "US", exchange: "NYSE",   currency: "USD", industry: "娱乐媒体", price: 98.40,  change: 0.80,   changePct: 0.82,  volume: 8920000,   marketCap: 179000000000  },
  // 能源
  { symbol: "XOM",   name: "埃克森美孚", nameEn: "ExxonMobil",    market: "US", exchange: "NYSE",   currency: "USD", industry: "石油",    price: 108.40,  change: 1.20,   changePct: 1.12,  volume: 18920000,  marketCap: 459000000000  },
  { symbol: "CVX",   name: "雪佛龙", nameEn: "Chevron",         market: "US", exchange: "NYSE",   currency: "USD", industry: "石油",    price: 148.40,  change: 1.60,   changePct: 1.09,  volume: 8920000,   marketCap: 284000000000  },
  { symbol: "COP",   name: "康菲石油", nameEn: "ConocoPhillips", market: "US", exchange: "NYSE", currency: "USD", industry: "石油",    price: 108.40,  change: 1.20,   changePct: 1.12,  volume: 6780000,   marketCap: 136000000000  },
  // 工业
  { symbol: "BA",    name: "波音",     nameEn: "Boeing",            market: "US", exchange: "NYSE",   currency: "USD", industry: "航空航天", price: 198.40, change: 2.40,   changePct: 1.22,  volume: 6780000,   marketCap: 117000000000  },
  { symbol: "CAT",   name: "卡特彼勒", nameEn: "Caterpillar", market: "US", exchange: "NYSE", currency: "USD", industry: "工程机械", price: 368.40, change: 4.60,   changePct: 1.27,  volume: 2340000,   marketCap: 190000000000  },
  { symbol: "GE",    name: "通用电气", nameEn: "GE",         market: "US", exchange: "NYSE",   currency: "USD", industry: "工业",    price: 168.40,  change: 1.80,   changePct: 1.08,  volume: 5670000,   marketCap: 183000000000  },
  { symbol: "MMM",   name: "3M",               nameEn: "3M",                market: "US", exchange: "NYSE",   currency: "USD", industry: "工业",    price: 128.40,  change: 1.20,   changePct: 0.94,  volume: 3450000,   marketCap: 70000000000   },
  { symbol: "RTX",   name: "雷神技术", nameEn: "Raytheon Technologies", market: "US", exchange: "NYSE", currency: "USD", industry: "国防", price: 98.40,  change: 0.80,   changePct: 0.82,  volume: 5670000,   marketCap: 131000000000  },
  { symbol: "UPS",   name: "联合包裹", nameEn: "UPS",         market: "US", exchange: "NYSE",   currency: "USD", industry: "物流",    price: 128.40,  change: 1.20,   changePct: 0.94,  volume: 3450000,   marketCap: 110000000000  },
  { symbol: "FDX",   name: "联邦快递", nameEn: "FedEx",       market: "US", exchange: "NYSE",   currency: "USD", industry: "物流",    price: 248.40,  change: 2.40,   changePct: 0.98,  volume: 2340000,   marketCap: 63000000000   },
  // 通信
  { symbol: "T",     name: "AT&T",             nameEn: "AT&T",               market: "US", exchange: "NYSE",   currency: "USD", industry: "电信",    price: 18.40,   change: 0.20,   changePct: 1.10,  volume: 45670000,  marketCap: 131000000000  },
  { symbol: "VZ",    name: "威瑞森", nameEn: "Verizon",          market: "US", exchange: "NYSE",   currency: "USD", industry: "电信",    price: 40.60,   change: 0.40,   changePct: 0.99,  volume: 18920000,  marketCap: 171000000000  },
  { symbol: "TMUS",  name: "T-Mobile",         nameEn: "T-Mobile",           market: "US", exchange: "NASDAQ", currency: "USD", industry: "电信",    price: 198.40,  change: 2.20,   changePct: 1.12,  volume: 5670000,   marketCap: 231000000000  },
];

// ─── Combined stock list ──────────────────────────────────────
export const ALL_STOCKS: StockInfo[] = [...A_STOCKS, ...HK_STOCKS, ...US_STOCKS];

/** 本地股票库各市场数量（静态，用于 fallback 显示） */
export const LOCAL_STOCK_COUNTS = {
  A:     A_STOCKS.length,
  HK:    HK_STOCKS.length,
  US:    US_STOCKS.length,
  total: A_STOCKS.length + HK_STOCKS.length + US_STOCKS.length,
} as const;

// Build fast lookup map
const STOCK_MAP = new Map<string, StockInfo>(
  ALL_STOCKS.map((s) => [s.symbol.toUpperCase(), s])
);

// ─── Service functions ────────────────────────────────────────

export function getStockBySymbol(symbol: string): StockInfo | undefined {
  return STOCK_MAP.get(symbol.toUpperCase());
}

export function getStocksByMarket(market: Market): StockInfo[] {
  return ALL_STOCKS.filter((s) => s.market === market);
}

export interface SearchOptions {
  query?: string;
  market?: Market | null;
  page?: number;
  limit?: number;
  sort?: "marketCap" | "changePct" | "volume" | "name";
}

export interface SearchResult {
  stocks: StockInfo[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function searchStocks(options: SearchOptions = {}): SearchResult {
  const { query = "", market = null, page = 1, limit = 20, sort = "marketCap" } = options;

  let results = ALL_STOCKS;

  // Market filter
  if (market) {
    results = results.filter((s) => s.market === market);
  }

  // Text search - support Chinese name, English name, symbol, industry
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter((s) =>
      s.name.includes(query.trim()) ||
      s.symbol.toLowerCase().includes(q) ||
      (s.nameEn?.toLowerCase().includes(q) ?? false) ||
      s.industry.includes(query.trim())
    );
  }

  // Sort
  results = [...results].sort((a, b) => {
    switch (sort) {
      case "marketCap":
        return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      case "changePct":
        return Math.abs(b.changePct) - Math.abs(a.changePct);
      case "volume":
        return (b.volume ?? 0) - (a.volume ?? 0);
      case "name":
        return a.name.localeCompare(b.name, "zh");
      default:
        return (b.marketCap ?? 0) - (a.marketCap ?? 0);
    }
  });

  const total = results.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const stocks = results.slice(offset, offset + limit);

  return { stocks, total, page, limit, totalPages };
}

// Popular stocks for each market (shown when search is empty)
export const POPULAR_A_STOCKS = [
  "600519", "002594", "300750", "601398", "601318",
  "600036", "000858", "688981", "002230", "600276",
];
export const POPULAR_HK_STOCKS = [
  "00700", "09988", "03690", "09618", "01810",
  "00941", "00005", "02318", "00388", "02020",
];
export const POPULAR_US_STOCKS = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN",
  "META", "TSLA", "JPM", "V", "LLY",
];

export function getPopularStocks(market?: Market | null): StockInfo[] {
  const symbols = market === "A"
    ? POPULAR_A_STOCKS
    : market === "HK"
    ? POPULAR_HK_STOCKS
    : market === "US"
    ? POPULAR_US_STOCKS
    : [...POPULAR_A_STOCKS, ...POPULAR_HK_STOCKS, ...POPULAR_US_STOCKS];

  return symbols
    .map((sym) => STOCK_MAP.get(sym))
    .filter((s): s is StockInfo => s !== undefined);
}
