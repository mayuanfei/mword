import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTask, Profile, User } from './types';

const fixture = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  activeUser: null as User | null,
  quotaRequests: [] as { userId: string; requestId: string; amount: number; reason: string }[],
  quotaApplied: new Set<string>(),
  balances: new Map<string, number>(),
  aiRequests: [] as { requestId: string; scene: string; wordId: string }[],
  aiTasks: new Map<string, AiTask>(),
  failQuotaOnce: false,
  failAiOnce: false,
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));
vi.mock('./storage', () => ({
  readLocal: vi.fn(async (key: string) => structuredClone(fixture.values.get(key) ?? null)),
  writeLocal: vi.fn(async (key: string, value: unknown) => { fixture.values.set(key, structuredClone(value)); }),
  deviceId: vi.fn(async () => 'retry-test-device'),
}));

const profile: Profile = { bookId: 'cet4', goal: '阅读', interests: ['科技'], dailyMinutes: 20, level: '基础', onboardingCompleted: true };
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.resetModules();
  fixture.values.clear(); fixture.activeUser = null; fixture.quotaRequests = []; fixture.quotaApplied.clear(); fixture.balances.clear();
  fixture.aiRequests = []; fixture.aiTasks.clear(); fixture.failQuotaOnce = false; fixture.failAiOnce = false;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const path = url.replace('/mword-api', '');
    if (path === '/auth/login') {
      const { username } = JSON.parse(options?.body as string);
      fixture.activeUser = { id: username, username, role: 'ADMIN', profile };
      return json({ token: 'test-token', user: fixture.activeUser, expiresAt: '2027-01-01T00:00:00Z' });
    }
    if (path === '/auth/logout') { fixture.activeUser = null; return new Response(null, { status: 204 }); }
    if (path === '/books' || path === '/books/cet4/words' || path === '/articles') return json([]);
    if (path === '/sync') return json({ cursor: 0, acceptedEventIds: [], acceptedReadingEventIds: [], events: [], readingEvents: [], states: [], profile, articles: [], serverTime: new Date().toISOString(), schedulerVersion: 'interval-v1' });
    if (path === '/ai/quota') return json({ available: 100, reserved: 0, sceneCosts: { EXPLAIN: 1, MEMORY: 1, CONTEXT: 1, ARTICLE: 3 }, usage: [] });
    if (path.startsWith('/admin/users/') && path.endsWith('/quota') && options?.method === 'POST') {
      const payload = JSON.parse(options.body as string) as { requestId: string; amount: number; reason: string };
      const userId = path.split('/')[3];
      fixture.quotaRequests.push({ userId, ...payload });
      const unique = `${fixture.activeUser?.id}:${payload.requestId}`;
      if (!fixture.quotaApplied.has(unique)) {
        fixture.quotaApplied.add(unique);
        fixture.balances.set(userId, (fixture.balances.get(userId) ?? 0) + payload.amount);
      }
      // The server committed, but the client cannot tell whether it succeeded.
      if (fixture.failQuotaOnce) { fixture.failQuotaOnce = false; throw new TypeError('connection reset after quota commit'); }
      return json({ available: fixture.balances.get(userId) });
    }
    if (path === '/ai/tasks' && options?.method === 'POST') {
      const payload = JSON.parse(options.body as string) as { requestId: string; scene: AiTask['scene']; wordId: string };
      fixture.aiRequests.push(payload);
      if (!fixture.aiTasks.has(payload.requestId)) {
        const at = new Date().toISOString();
        fixture.aiTasks.set(payload.requestId, { id: `task:${payload.requestId}`, requestId: payload.requestId, scene: payload.scene, wordId: payload.wordId, senseId: `${payload.wordId}:core`, status: 'SUCCEEDED', cost: 1, error: null, result: JSON.stringify({ meaning: '保留', explanation: '在上下文中保留原有事物。', collocations: [], memoryTip: '', example: 'Retain the original files.', exampleTranslation: '保留原始文件。' }), createdAt: at, updatedAt: at });
      }
      if (fixture.failAiOnce) { fixture.failAiOnce = false; throw new TypeError('connection reset after task commit'); }
      return json(fixture.aiTasks.get(payload.requestId));
    }
    if (path === '/ai/tasks') return json([...fixture.aiTasks.values()]);
    throw new Error(`Unexpected fixture request: ${path}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function login(username = 'admin-a') {
  const { useLearningStore } = await import('./store');
  await useLearningStore.getState().authenticate('login', { username, password: 'password123' });
  return useLearningStore;
}

describe('quota adjustment retries', () => {
  it('reuses the original request after an unknown failure, then creates a fresh ID for a new adjustment', async () => {
    const store = await login();
    fixture.failQuotaOnce = true;
    await expect(store.getState().adjustQuota('reader', 20, '初始试用额度')).rejects.toThrow();
    const initialId = fixture.quotaRequests[0].requestId;
    await store.getState().adjustQuota('reader', 20, '初始试用额度');
    expect(fixture.quotaRequests[1].requestId).toBe(initialId);
    expect(fixture.balances.get('reader')).toBe(20);
    await store.getState().adjustQuota('reader', 20, '初始试用额度');
    expect(fixture.quotaRequests[2].requestId).not.toBe(initialId);
    expect(fixture.balances.get('reader')).toBe(40);
  });

  it('keeps the uncertain request ID after the same administrator logs in again', async () => {
    const store = await login();
    fixture.failQuotaOnce = true;
    await expect(store.getState().adjustQuota('reader', 15, '学习额度')).rejects.toThrow();
    const initialId = fixture.quotaRequests[0].requestId;
    await store.getState().logout();
    await store.getState().authenticate('login', { username: 'admin-a', password: 'password123' });
    await store.getState().adjustQuota('reader', 15, '学习额度');
    expect(fixture.quotaRequests[1].requestId).toBe(initialId);
    expect(fixture.balances.get('reader')).toBe(15);
  });

  it('does not reuse another administrator’s uncertain request', async () => {
    const store = await login();
    fixture.failQuotaOnce = true;
    await expect(store.getState().adjustQuota('reader', 10, '学习额度')).rejects.toThrow();
    const initialId = fixture.quotaRequests[0].requestId;
    await store.getState().logout();
    await store.getState().authenticate('login', { username: 'admin-b', password: 'password123' });
    await store.getState().adjustQuota('reader', 10, '学习额度');
    expect(fixture.quotaRequests[1].requestId).not.toBe(initialId);
  });
});

describe('AI generation retries', () => {
  it('keeps the request ID across an unknown task response and prevents a second task or charge', async () => {
    const store = await login();
    const request = { scene: 'EXPLAIN' as const, wordId: 'lemma:retain', context: 'Retain the original files.' };
    fixture.failAiOnce = true;
    await expect(store.getState().requestAi(request)).rejects.toThrow();
    const initialId = fixture.aiRequests[0].requestId;
    const task = await store.getState().requestAi(request);
    expect(fixture.aiRequests[1].requestId).toBe(initialId);
    expect(task.requestId).toBe(initialId);
    expect(fixture.aiTasks.size).toBe(1);
    expect(store.getState().aiTasks).toHaveLength(1);
    await store.getState().requestAi(request);
    expect(fixture.aiRequests[2].requestId).not.toBe(initialId);
    expect(fixture.aiTasks.size).toBe(2);
  });
});
