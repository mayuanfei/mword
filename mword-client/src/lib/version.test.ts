// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAppUpdate, getLocalAppInfo, isVersionSkipped, setSkipVersion } from './version';

afterEach(() => {
  vi.unstubAllGlobals();
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

describe('App version and update checker', () => {
  it('falls back to web app info when not in native runtime', async () => {
    const info = await getLocalAppInfo();
    expect(info.isNative).toBe(false);
    expect(info.platform).toBe('web');
    expect(info.version).toBe('1.0.0');
    expect(info.build).toBe(1);
  });

  it('detects an available update from the server response', async () => {
    const remoteResponse = {
      latestVersionCode: 2,
      latestVersionName: '1.0.1',
      minSupportedVersionCode: 1,
      changelog: '### 新功能\n- 支持检测更新与Changelog展示',
      downloadUrl: 'https://www.mayuanfei.com/mword-downloads/mword.apk',
      hasUpdate: true,
      forceUpdate: false,
    };

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(remoteResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    const result = await checkAppUpdate();
    expect(result.hasUpdate).toBe(true);
    expect(result.remote.latestVersionName).toBe('1.0.1');
    expect(result.remote.changelog).toContain('支持检测更新');
  });

  it('manages skipped versions correctly', () => {
    expect(isVersionSkipped('1.0.1')).toBe(false);
    setSkipVersion('1.0.1');
    expect(isVersionSkipped('1.0.1')).toBe(true);
    expect(isVersionSkipped('1.0.2')).toBe(false);
  });
});
