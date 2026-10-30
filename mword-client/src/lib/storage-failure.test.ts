import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile, ReadingEvent, ReviewEvent, User } from './types';

const fixture = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  failNextKey: null as string | null,
  holdNextKey: null as string | null,
  held: null as null | { resolve: () => void; reject: (error: Error) => void },
  sessionUser: null as User | null,
  serverEvents: new Map<string, ReviewEvent[]>(),
  uploaded: [] as { userId: string; events: ReviewEvent[] }[],
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => ({}),
}));

// Exercise the public store actions against an asynchronous persistence boundary.
// Only the disk boundary fails; the account mutation implementation remains real.
vi.mock('./storage', () => ({
  readLocal: vi.fn(async (key: string) => structuredClone(fixture.values.get(key) ?? null)),
  writeLocal: vi.fn(async (key: string, value: unknown) => {
    const snapshot = structuredClone(value);
    if (fixture.failNextKey === key) {
      fixture.failNextKey = null;
      throw new Error('disk full');
    }
    if (fixture.holdNextKey === key) {
      fixture.holdNextKey = null;
      await new Promise<void>((resolve, reject) => { fixture.held = { resolve, reject }; });
    }
    fixture.values.set(key, snapshot);
  }),
  deviceId: vi.fn(async () => 'regression-device'),
}));

const profile: Profile = { bookId: 'cet4', goal: '阅读英文文章', interests: ['科技'], dailyMinutes: 20, level: '基础', onboardingCompleted: true };
const makeUser = (username: string): User => ({ id: username, username, role: 'USER', profile: { ...profile, goal: `${username} 的阅读目标` } });
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
type PersistedAccount = { events: ReviewEvent[]; readingEvents: ReadingEvent[]; pending: string[]; pendingReading: string[] };

beforeEach(() => {
  vi.resetModules();
  fixture.values.clear(); fixture.failNextKey = null; fixture.holdNextKey = null; fixture.held = null;
  fixture.sessionUser = null; fixture.serverEvents.clear(); fixture.uploaded = [];
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const path = url.replace('/mword-api', '');
    if (path === '/auth/login') {
      const { username } = JSON.parse(options?.body as string);
      fixture.sessionUser = makeUser(username);
      return json({ token: `session:${username}`, user: fixture.sessionUser, expiresAt: '2027-01-01T00:00:00Z' });
    }
    if (path === '/auth/logout') { fixture.sessionUser = null; return new Response(null, { status: 204 }); }
    if (path === '/books') return json([{ id: 'cet4', name: '四级', description: '', wordCount: 2, version: '1', sourceUrl: '', license: '' }]);
    if (path === '/books/cet4/words') return json([{ id: 'lemma:retain', lemma: 'retain', meaning: '保留' }, { id: 'lemma:foster', lemma: 'foster', meaning: '培养' }]);
    if (path === '/ai/tasks' || path === '/articles') return json([]);
    if (path === '/ai/quota') return json({ available: 20, reserved: 0, sceneCosts: { EXPLAIN: 1, MEMORY: 1, CONTEXT: 1, ARTICLE: 3 }, usage: [] });
    if (path === '/sync') {
      if (!fixture.sessionUser) throw new Error('No server session');
      const user = fixture.sessionUser;
      const request = JSON.parse(options?.body as string) as { events: ReviewEvent[]; readingEvents: ReadingEvent[] };
      fixture.uploaded.push({ userId: user.id, events: structuredClone(request.events) });
      const previous = fixture.serverEvents.get(user.id) || [];
      const events = [...new Map([...previous, ...request.events].map(event => [event.eventId, event])).values()];
      fixture.serverEvents.set(user.id, events);
      return json({ cursor: events.length, acceptedEventIds: request.events.map(event => event.eventId), acceptedReadingEventIds: request.readingEvents.map(event => event.eventId), events, readingEvents: request.readingEvents, states: [], profile: user.profile, articles: [], serverTime: new Date().toISOString(), schedulerVersion: 'interval-v1' });
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function login(username = 'reader-a') {
  const { useLearningStore } = await import('./store');
  await useLearningStore.getState().authenticate('login', { username, password: 'password123' });
  return useLearningStore;
}

describe('persistence failures preserve truthful learning state', () => {
  it('does not count or upload a failed recall when a later draft save succeeds', async () => {
    const store = await login();
    store.setState({ online: false });
    fixture.failNextKey = 'account:reader-a';
    await expect(store.getState().recordEvent({ wordId: 'lemma:retain', kind: 'RECALL', rating: 3 })).rejects.toThrow();
    expect(store.getState().events).toEqual([]);
    expect(store.getState().reviewStates).toEqual([]);
    expect(store.getState().sync.pending).toBe(0);
    await store.getState().saveDraft({ title: 'My draft', body: 'The article is still being written.' });
    expect((fixture.values.get('account:reader-a') as PersistedAccount).events).toEqual([]);
    store.setState({ online: true });
    await store.getState().synchronize();
    expect(fixture.uploaded.flatMap(batch => batch.events)).toEqual([]);
  });

  it('does not mark a reading complete if its local write fails', async () => {
    const store = await login();
    store.setState({ online: false });
    fixture.failNextKey = 'account:reader-a';
    await expect(store.getState().recordReading('article-a', 1, true)).rejects.toThrow();
    expect(store.getState().readingEvents).toEqual([]);
    expect(store.getState().sync.pending).toBe(0);
    await store.getState().saveDraft({ title: '', body: 'A later successful write.' });
    expect((fixture.values.get('account:reader-a') as PersistedAccount).readingEvents).toEqual([]);
  });

  it('keeps only the successful event when two recalls overlap and the first write fails', async () => {
    const store = await login();
    store.setState({ online: false });
    fixture.holdNextKey = 'account:reader-a';
    const first = store.getState().recordEvent({ wordId: 'lemma:retain', kind: 'RECALL', rating: 3 }).then(() => false, () => true);
    await vi.waitFor(() => expect(fixture.held).not.toBeNull());
    const second = store.getState().recordEvent({ wordId: 'lemma:foster', kind: 'RECALL', rating: 4 });
    fixture.held!.reject(new Error('disk full'));
    expect(await first).toBe(true);
    await second;
    expect(store.getState().events.map(event => event.wordId)).toEqual(['lemma:foster']);
    expect(store.getState().reviewStates.map(state => state.wordId)).toEqual(['lemma:foster']);
    expect(store.getState().sync.pending).toBe(1);
    const cached = fixture.values.get('account:reader-a') as PersistedAccount;
    expect(cached.events.map(event => event.wordId)).toEqual(['lemma:foster']);
    expect(cached.pending).toEqual([cached.events[0].eventId]);
  });

  it.each(['resolve', 'reject'] as const)('does not publish an old account write into the new account after %s', async outcome => {
    const store = await login();
    store.setState({ online: false });
    fixture.holdNextKey = 'account:reader-a';
    const previous = store.getState().recordEvent({ wordId: 'lemma:retain', kind: 'RECALL', rating: 3 }).then(() => undefined, () => undefined);
    await vi.waitFor(() => expect(fixture.held).not.toBeNull());
    store.setState({ online: true });
    await store.getState().logout();
    const nextLogin = store.getState().authenticate('login', { username: 'reader-b', password: 'password123' });
    await vi.waitFor(() => expect(store.getState().user?.id).toBe('reader-b'));
    if (outcome === 'resolve') fixture.held!.resolve(); else fixture.held!.reject(new Error('old device write failed'));
    await previous;
    await nextLogin;
    expect(store.getState().user?.id).toBe('reader-b');
    expect(store.getState().profile.goal).toBe('reader-b 的阅读目标');
    expect(store.getState().events).toEqual([]);
    expect(store.getState().reviewStates).toEqual([]);
    expect(store.getState().error).toBeNull();
    expect(store.getState().sync.pending).toBe(0);
    expect((fixture.values.get('account:reader-b') as PersistedAccount).events).toEqual([]);
    expect(fixture.uploaded.filter(batch => batch.userId === 'reader-b').flatMap(batch => batch.events)).toEqual([]);
  });
});
