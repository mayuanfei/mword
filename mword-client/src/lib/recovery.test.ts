import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article, Profile, ReadingEvent, ReviewEvent, User } from './types';

const fixture = vi.hoisted(() => ({ values: new Map<string, unknown>(), requests: [] as { deviceId: string; events: ReviewEvent[]; readingEvents: ReadingEvent[] }[], serverEvents: [] as ReviewEvent[], serverReadings: [] as ReadingEvent[], articles: [] as Article[], restored: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));
vi.mock('./storage', () => ({
  readLocal: async (key: string) => structuredClone(fixture.values.get(key) ?? null),
  writeLocal: async (key: string, value: unknown) => { fixture.values.set(key, structuredClone(value)); },
  deviceId: async () => 'current-device',
}));
const oldProfile: Profile = { bookId: 'cet4', goal: '旧目标', interests: ['科技'], dailyMinutes: 20, level: '基础', onboardingCompleted: true };
const newProfile: Profile = { ...oldProfile, goal: '最新阅读目标', dailyMinutes: 30 };
const user: User = { id: 'recovery-user', username: 'reader', role: 'USER', profile: oldProfile };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const event = (eventId: string, deviceId: string): ReviewEvent => ({ eventId, deviceId, wordId: 'lemma:retain', senseId: 'lemma:retain:core', kind: 'RECALL', rating: 3, usedHint: false, occurredAt: '2026-01-01T00:00:00.000Z' });

beforeEach(() => {
  vi.resetModules(); fixture.values.clear(); fixture.requests = []; fixture.serverEvents = []; fixture.serverReadings = []; fixture.articles = []; fixture.restored = false;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('navigator', { onLine: true });
  fixture.values.set('activeUser', user);
  fixture.values.set('words:cet4', [{ id: 'lemma:retain', lemma: 'retain', meaning: '保留' }]);
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const path = url.replace('/mword-api', '');
    if (path === '/me') return json(user);
    if (path === '/books' || path === '/ai/tasks') return json([]);
    if (path === '/articles') return json(fixture.articles);
    if (path === '/books/cet4/words') return json([{ id: 'lemma:retain', lemma: 'retain', meaning: '保留' }]);
    if (path === '/ai/quota') return json({ available: 30, reserved: 0, sceneCosts: {}, usage: [] });
    if (path === '/sync') {
      const request = JSON.parse(options?.body as string);
      fixture.requests.push(request);
      if (!fixture.restored) { fixture.restored = true; return json({ code: 'CURSOR_AHEAD', message: 'Older server backup' }, 409); }
      if (request.readingEvents.some((value: ReadingEvent) => !fixture.articles.some(article => article.id === value.articleId))) return json({ code: 'NOT_FOUND', message: 'Article missing' }, 404);
      if (request.events.some((value: ReviewEvent) => value.deviceId !== request.deviceId)) return json({ code: 'INVALID_DEVICE', message: 'Wrong device' }, 400);
      fixture.serverEvents.push(...request.events);
      fixture.serverReadings.push(...request.readingEvents);
      return json({ cursor: fixture.serverEvents.length, acceptedEventIds: request.events.map((value: ReviewEvent) => value.eventId), acceptedReadingEventIds: request.readingEvents.map((value: ReadingEvent) => value.eventId), events: fixture.serverEvents, readingEvents: fixture.serverReadings, states: [], profile: newProfile, articles: fixture.articles, serverTime: '2026-01-02T00:00:00.000Z', schedulerVersion: 'interval-v1' });
    }
    throw new Error(`Unexpected request ${path}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function seed(events: ReviewEvent[], readingEvents: ReadingEvent[] = [], articles: Article[] = []) {
  fixture.values.set('account:recovery-user', { user, profile: newProfile, events, readingEvents, articles, pending: [], pendingReading: [], cursor: 10, lastSyncAt: null, profileVersion: 1, profileDirty: false });
}

describe('durable account recovery', () => {
  it('restores the latest account profile during offline startup', async () => {
    seed([]); vi.stubGlobal('navigator', { onLine: false });
    const { useLearningStore: store } = await import('./store');
    await store.getState().bootstrap();
    expect(store.getState().user?.id).toBe(user.id);
    expect(store.getState().profile).toEqual(newProfile);
    expect(store.getState().words).toHaveLength(1);
    expect(fixture.requests).toEqual([]);
  });

  it('replays every original device separately and preserves a missing article reading without blocking reviews', async () => {
    const first = event('event-a', 'old-android'); const second = event('event-b', 'old-iphone');
    const reading: ReadingEvent = { eventId: 'reading-a', deviceId: 'old-android', articleId: 'lost-article', position: 1, completed: true, occurredAt: first.occurredAt };
    const valid: ReadingEvent = { ...reading, eventId: 'reading-b', articleId: 'valid-article' };
    const other: ReadingEvent = { ...valid, eventId: 'reading-c', deviceId: 'old-iphone' };
    const lostArticle: Article = { id: 'lost-article', title: 'Local copy', body: 'We retain the full article.', source: 'USER', targetWordIds: [], createdAt: first.occurredAt };
    const validArticle: Article = { ...lostArticle, id: 'valid-article', title: 'Available article' };
    fixture.articles = [validArticle];
    seed([first, second], [reading, valid, other], [lostArticle, validArticle]);
    const { useLearningStore: store } = await import('./store');
    await store.getState().bootstrap();
    await vi.waitFor(() => expect(store.getState().sync.status).toBe('error'));
    expect(fixture.serverEvents.map(value => value.eventId)).toEqual(['event-a', 'event-b']);
    const uploads = fixture.requests.filter(value => value.events.length);
    expect(uploads).toHaveLength(2);
    expect(uploads.every(batch => batch.readingEvents.length === 0 && batch.events.every(value => value.deviceId === batch.deviceId))).toBe(true);
    expect(store.getState().events).toHaveLength(2);
    expect(store.getState().sync.pending).toBe(1);
    expect(fixture.serverReadings.map(value => value.eventId)).toEqual(['reading-b', 'reading-c']);
    expect(store.getState().articles.find(article => article.id === 'lost-article')?.body).toBe(lostArticle.body);
    expect(store.getState().sync.error).toContain('单词回忆记录仍可继续同步');
    const cached = fixture.values.get('account:recovery-user') as { pending: string[]; pendingReading: string[]; readingEvents: ReadingEvent[] };
    expect(cached.pending).toEqual([]); expect(cached.pendingReading).toEqual(['reading-a']); expect(cached.readingEvents).toHaveLength(3);
    // An explicit retry discovers a restored server article and automatically uploads its retained reading.
    fixture.articles.push(lostArticle);
    await store.getState().synchronize();
    await vi.waitFor(() => expect(store.getState().sync.pending).toBe(0));
    expect(store.getState().sync.status).toBe('idle');
    expect(fixture.serverReadings.map(value => value.eventId)).toEqual(['reading-b', 'reading-c', 'reading-a']);
  });
});
