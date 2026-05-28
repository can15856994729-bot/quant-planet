import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quantplanet.app',
  appName: '量化星球',
  webDir: 'out',
  // 在生产环境下加载线上 Vercel 地址（保留 API routes 和实时行情）
  server: {
    url: 'https://quant-planet.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#07111F',
  },
};

export default config;
