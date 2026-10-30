import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mayuanfei.mword',
  appName: 'mword',
  webDir: 'dist-native',
  loggingBehavior: 'debug',
  plugins: { CapacitorSQLite: { iosDatabaseLocation: 'Library/CapacitorDatabase' } },
};
export default config;
