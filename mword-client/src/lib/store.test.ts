import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Profile, ReviewEvent, SyncResponse, User } from './types';

const profile: Profile = { bookId: 'cet4', goal: '阅读', interests: ['科技'], dailyMinutes: 20, level: '基础', onboardingCompleted: true };
const user: User = { id: 'test-user', username: 'reader', role: 'USER', profile };
const response = (value: unknown) => Promise.resolve(new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const serverEvents: ReviewEvent[] = [];
let holdSync: ((value: Response) => void) | null = null;
let uploaded: ReviewEvent[] = [];
let deferSync = false;
function syncResult(events: ReviewEvent[]): SyncResponse {
  serverEvents.push(...events.filter(event => !serverEvents.some(old => old.eventId === event.eventId)));
  return { cursor: serverEvents.length, acceptedEventIds: events.map(event => event.eventId), acceptedReadingEventIds: [], events: [...serverEvents], readingEvents: [], states: [], profile, articles: [], serverTime: new Date().toISOString(), schedulerVersion: 'interval-v1' };
}
beforeAll(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('CustomEvent', class extends Event { detail: unknown; constructor(type: string, options?: { detail?: unknown }) { super(type); this.detail = options?.detail; } });
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    const path = url.replace('/mword-api', '');
    if (path === '/auth/login' || path === '/me') return response(user.id ? (path === '/me' ? user : { token: 'test-session', user, expiresAt: '2027-01-01T00:00:00Z' }) : null);
    if (path === '/books/cet4/words') return response([{ id: 'lemma:retain', lemma: 'retain', meaning: '保留' }]);
    if (path === '/books' || path === '/articles' || path === '/ai/tasks') return response([]);
    if (path === '/ai/quota') return response({ available: 30, reserved: 0, sceneCosts: { EXPLAIN: 1, MEMORY: 1, CONTEXT: 1, ARTICLE: 3 }, usage: [] });
    if (path === '/sync') {
      uploaded = JSON.parse(options?.body as string).events;
      if (deferSync) return new Promise<Response>(resolve => { holdSync = resolve; });
      return response(syncResult(uploaded));
    }
    throw new Error(`unexpected path ${path}`);
  }));
});
describe('durable account outbox', () => {
  it('does not lose a second offline event while the first request is in flight', async () => {
    const { useLearningStore: store } = await import('./store');
    await store.getState().authenticate('login', { username: 'reader', password: 'password' });
    deferSync = true;
    await store.getState().recordEvent({ wordId: 'lemma:retain', kind: 'RECALL', rating: 3 });
    await vi.waitFor(() => expect(holdSync).not.toBeNull());
    const first = [...uploaded];
    store.setState({ online: false });
    await store.getState().recordEvent({ wordId: 'lemma:retain', kind: 'CONTEXT', rating: 4 });
    holdSync!(await response(syncResult(first))); holdSync = null;
    await vi.waitFor(() => expect(store.getState().sync.status).toBe('idle'));
    expect(store.getState().events).toHaveLength(2);
    expect(store.getState().sync.pending).toBe(1);
    const { readLocal } = await import('./storage');
    const cached = await readLocal<{ events: ReviewEvent[]; pending: string[] }>('account:test-user');
    expect(cached?.events).toHaveLength(2); expect(cached?.pending).toHaveLength(1);
    deferSync = false; store.setState({ online: true }); await store.getState().synchronize();
    expect(store.getState().sync.pending).toBe(0);
    expect(new Set(store.getState().events.map(event => event.eventId)).size).toBe(2);
  });
});
