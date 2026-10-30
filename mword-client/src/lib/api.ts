import { Capacitor, registerPlugin } from '@capacitor/core';

interface SessionPlugin {
  get(): Promise<{ token?: string }>;
  set(options: { token: string }): Promise<void>;
  clear(): Promise<void>;
}
const session = registerPlugin<SessionPlugin>('MwordSession');
let token: string | null = null;
export const API_BASE = Capacitor.isNativePlatform()
  ? (import.meta.env.VITE_API_URL || 'https://www.mayuanfei.com/mword-api').replace(/\/$/, '')
  : '/mword-api';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function restoreSession() {
  if (Capacitor.isNativePlatform()) token = (await session.get()).token || null;
}
export async function setSession(value: string | null) {
  token = Capacitor.isNativePlatform() ? value : null;
  if (Capacitor.isNativePlatform()) {
    if (value) await session.set({ token: value }); else await session.clear();
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method, credentials: 'include', signal: controller.signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, data?.code || 'REQUEST_FAILED', data?.message || `服务暂时不可用（${response.status}）`);
    if (data === null) throw new ApiError(response.status, 'INVALID_RESPONSE', '学习服务返回了无法识别的内容，请检查服务地址与代理配置。');
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error('无法连接学习服务，请检查网络后重试。已保存的学习记录仍可离线使用。');
  } finally { clearTimeout(timeout); }
}
