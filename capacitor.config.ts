import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kilas.offlineshorts',
  appName: 'Kilas',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
