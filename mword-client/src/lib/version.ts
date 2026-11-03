import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { api } from './api';
import type { AppVersionResponse } from './types';

export interface LocalAppInfo {
  version: string;
  build: number;
  isNative: boolean;
  platform: 'android' | 'ios' | 'web';
}

const SKIP_VERSION_KEY = 'mword_skip_version';

// 获取当前 App 的本地版本信息
export async function getLocalAppInfo(): Promise<LocalAppInfo> {
  const isNative = Capacitor.isNativePlatform();
  if (isNative) {
    try {
      const info = await App.getInfo();
      const build = parseInt(info.build, 10);
      const platform = Capacitor.getPlatform() as 'android' | 'ios';
      return {
        version: info.version || '1.0.0',
        build: isNaN(build) ? 1 : build,
        isNative: true,
        platform: platform === 'ios' ? 'ios' : 'android',
      };
    } catch {
      // 获取原生信息异常时降级处理
    }
  }
  return {
    version: '1.0.0',
    build: 1,
    isNative: false,
    platform: 'web',
  };
}

// 语义化版本对比：v1 > v2 返回 1，v1 < v2 返回 -1，相等返回 0
export function compareSemVer(v1: string, v2: string): number {
  const p1 = (v1 || '').replace(/^v/, '').split('.').map(x => parseInt(x, 10) || 0);
  const p2 = (v2 || '').replace(/^v/, '').split('.').map(x => parseInt(x, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// 检查是否存在新版本
export async function checkAppUpdate(): Promise<{
  local: LocalAppInfo;
  remote: AppVersionResponse;
  hasUpdate: boolean;
}> {
  const local = await getLocalAppInfo();
  const remote = await api<AppVersionResponse>(
    `/app/version?currentVersionCode=${local.build}&currentVersionName=${encodeURIComponent(local.version)}`
  );
  const hasUpdate = Boolean(
    remote.hasUpdate ||
    remote.latestVersionCode > local.build ||
    compareSemVer(remote.latestVersionName, local.version) > 0
  );
  return {
    local,
    remote: {
      ...remote,
      hasUpdate,
    },
    hasUpdate,
  };
}

const memoryFallback = new Map<string, string>();

function getStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('__test__', '1');
      window.localStorage.removeItem('__test__');
      return window.localStorage;
    }
  } catch {
    // 降级使用内存存储
  }
  return {
    getItem: (k: string) => memoryFallback.get(k) ?? null,
    setItem: (k: string, v: string) => memoryFallback.set(k, v),
  };
}

// 记录用户跳过某版本
export function setSkipVersion(versionName: string) {
  try {
    getStorage()?.setItem(SKIP_VERSION_KEY, versionName);
  } catch {
    // 忽略异常
  }
}

// 判断某版本是否已被用户跳过
export function isVersionSkipped(versionName: string): boolean {
  try {
    return getStorage()?.getItem(SKIP_VERSION_KEY) === versionName;
  } catch {
    return false;
  }
}

// 触发下载或跳转更新页面
export function triggerAppUpdate(downloadUrl: string) {
  if (!downloadUrl) return;
  // 在移动端与 Web 端直接通过系统浏览器或下载链接打开
  window.open(downloadUrl, '_system');
}
