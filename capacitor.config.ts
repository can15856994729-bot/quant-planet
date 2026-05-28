import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quantplanet.app',
  appName: '量化星球',
  webDir: 'public',   // public/ 永远存在；APK 实际加载 server.url
  // 在生产环境下加载线上 Vercel 地址（保留 API routes 和实时行情）
  server: {
    url: 'https://app.quantplanetapp.com',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#07111F',
  },
};

export default config;
