import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { api, ApiError, restoreSession, setSession } from './api';
import { readLocal, writeLocal, deviceId } from './storage';
import { syncReviewReminder } from './native';
import { calculateStates, mergeEvents, SCHEDULER_VERSION } from './scheduler';
import { advanceStudySession, assertSessionPosition, SessionPositionError } from './studySession';
import type { SessionPosition, StudySession } from './types';
import { DEFAULT_PROFILE, type AdminData, type AdminLedgerEntry, type AiRequest, type AiTask, type Article, type AuthResponse, type Book, type CreateAdminUserInput, type Profile, type ProviderInput, type Quota, type Rating, type ReadingEvent, type ReviewEvent, type ReviewState, type SyncResponse, type SyncStatus, type Usage, type User, type Word } from './types';

interface AccountCache {
  user: User; profile: Profile; events: ReviewEvent[]; readingEvents: ReadingEvent[]; articles: Article[];
  pending: string[]; pendingReading: string[]; cursor: number; lastSyncAt: string | null; profileVersion: number; profileDirty: boolean;
  aiTasks?: AiTask[]; quota?: Quota | null;
  draft?: { title: string; body: string };
  pendingAi?: Record<string, string>;
  pendingQuota?: Record<string, string>;
  serverArticleIds?: string[];
  studySessions?: Record<string, StudySession>;
}
interface LearningStore {
  initialized: boolean; loading: boolean; user: User | null; profile: Profile; books: Book[]; words: Word[];
  articles: Article[]; reviewStates: ReviewState[]; events: ReviewEvent[]; readingEvents: ReadingEvent[];
  quota: Quota | null; usage: Usage[]; aiTasks: AiTask[]; sync: SyncStatus; online: boolean; error: string | null;
  draft: { title: string; body: string }; saveDraft(value: { title: string; body: string }): Promise<void>;
  studySessions: Record<string, StudySession>;
  createStudySession(wordIds: string[], append?: boolean): Promise<void>;
  skipStudyWord(position: SessionPosition): Promise<void>;
  markStudyHint(position: SessionPosition): Promise<void>;
  saveStudyQuestion(position: SessionPosition, patch: Partial<Pick<StudySession, 'questionTaskId' | 'questionAnswer' | 'questionSubmitted' | 'translationHintUsed'>>): Promise<void>;
  bootstrap(): Promise<void>;
  authenticate(mode: 'login' | 'register', credentials: { username: string; password: string }): Promise<void>;
  logout(): Promise<void>; saveProfile(profile: Partial<Profile>): Promise<void>; synchronize(): Promise<void>;
  reloadWords(): Promise<void>;
  recordEvent(input: { wordId: string; senseId?: string; kind: ReviewEvent['kind']; rating: Rating; usedHint?: boolean; session?: SessionPosition }): Promise<void>;
  recordReading(articleId: string, position: number, completed: boolean): Promise<void>;
  requestAi(input: AiRequest): Promise<AiTask>; refreshAccount(): Promise<void>;
  createArticle(input: { title: string; body: string; targetWordIds: string[] }): Promise<Article>;
  clearError(): void; loadAdmin(): Promise<AdminData>; saveProvider(input: ProviderInput, id?: string): Promise<void>;
  deleteProvider(id: string): Promise<void>; adjustQuota(userId: string, amount: number, reason: string): Promise<void>;
  createAdminUser(input: CreateAdminUserInput): Promise<void>;
  updateUserStatus(userId: string, status: 'ACTIVE' | 'DISABLED'): Promise<void>;
  updateUserRole(userId: string, role: 'USER' | 'ADMIN'): Promise<void>;
  resetUserPassword(userId: string, password: string): Promise<void>;
  updateUserRemark(userId: string, remark: string): Promise<void>;
  revokeUserSessions(userId: string): Promise<void>;
  loadUserLedger(userId: string): Promise<AdminLedgerEntry[]>;
}
let active: AccountCache | null = null;
let generation = 0;
let bootstrapPromise: Promise<void> | null = null;
let syncPromise: Promise<void> | null = null;
let syncGeneration = -1;
let listenersInstalled = false;
const message = (error: unknown) => error instanceof Error ? error.message : '操作失败，请稍后重试';
function cacheKey(id: string) { return `account:${id}`; }
function updateSync() {
  if (!active) return;
  useLearningStore.setState(state => ({ sync: { ...state.sync, pending: active!.pending.length + active!.pendingReading.length + (active!.profileDirty ? 1 : 0), lastSyncAt: active!.lastSyncAt } }));
}
async function persist() {
  if (active) await writeLocal(cacheKey(active.user.id), active);
  updateSync();
}
let mutationChain: Promise<unknown> = Promise.resolve();
function commitAccount(stamp: number, mutate: (next: AccountCache) => void): Promise<AccountCache> {
  const operation = mutationChain.catch(() => undefined).then(async () => {
    if (!current(stamp)) throw new Error('账号已切换，请重新操作');
    const next = structuredClone(assertAccount());
    mutate(next);
    await writeLocal(cacheKey(next.user.id), next);
    if (!current(stamp)) throw new Error('账号已切换，请重新操作');
    active = next;
    updateSync();
    return next;
  });
  mutationChain = operation;
  return operation;
}
function assertAccount() { if (!active) throw new Error('请先登录'); return active; }
function current(stamp: number) { return generation === stamp; }
function mergeArticles(cached: Article[], fresh: Article[]) {
  return [...new Map([...cached, ...fresh].map(article => [article.id, article])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function uploadableReadings(account: AccountCache) {
  return account.readingEvents.filter(event => account.pendingReading.includes(event.eventId) && (!account.serverArticleIds || account.serverArticleIds.includes(event.articleId)));
}
function missingReadingCount(account: AccountCache) {
  return account.pendingReading.length - uploadableReadings(account).length;
}
const missingArticleMessage = '部分阅读记录等待服务器恢复文章，本机记录和文章正文已保留。其他阅读及单词回忆记录仍可继续同步。';
async function expireSession(stamp: number) {
  if (!current(stamp)) return;
  generation++; active = null;
  useLearningStore.setState({ user: null, studySessions: {}, words: [], events: [], readingEvents: [], articles: [], reviewStates: [], aiTasks: [], quota: null, usage: [], draft: { title: '', body: '' }, error: '登录已过期，请重新登录。本机尚未同步的学习记录已保留。', sync: { pending: 0, status: 'idle', lastSyncAt: null, error: null } });
  await setSession(null); await writeLocal('activeUser', null);
}
function updateReviewReminder(states: ReviewState[]) {
  void syncReviewReminder(states.map(state => state.dueAt).sort()[0]).catch(() => undefined);
}
async function loadWords(bookId: string) {
  const stamp = generation;
  const cached = await readLocal<Word[]>(`words:${bookId}`);
  if (current(stamp) && cached && useLearningStore.getState().profile.bookId === bookId) useLearningStore.setState({ words: cached });
  if (!useLearningStore.getState().online) return;
  const version = useLearningStore.getState().books.find(book => book.id === bookId)?.version;
  if (cached && version && await readLocal<string>(`words-version:${bookId}`) === version) return;
  const words = await api<Word[]>(`/books/${encodeURIComponent(bookId)}/words`);
  await writeLocal(`words:${bookId}`, words);
  await writeLocal(`words-version:${bookId}`, version || null);
  if (current(stamp) && useLearningStore.getState().profile.bookId === bookId) useLearningStore.setState({ words });
}
async function activate(user: User, preferCachedProfile = false) {
  generation++; const stamp = generation;
  const cached = await readLocal<AccountCache>(cacheKey(user.id));
  if (!current(stamp)) return;
  active = cached || { user, profile: user.profile, events: [], readingEvents: [], articles: [], pending: [], pendingReading: [], cursor: 0, lastSyncAt: null, profileVersion: 0, profileDirty: false };
  active.user = user;
  if (!active.profileDirty && !preferCachedProfile) active.profile = user.profile;
  const reviewStates = calculateStates(active.events);
  useLearningStore.setState({ user, studySessions: active.studySessions || {}, profile: active.profile, events: active.events, readingEvents: active.readingEvents, articles: active.articles, reviewStates, words: [], quota: active.quota || null, usage: active.quota?.usage || [], aiTasks: active.aiTasks || [], draft: active.draft || { title: '', body: '' }, error: null, sync: { pending: 0, lastSyncAt: active.lastSyncAt, status: 'idle', error: null } });
  updateReviewReminder(reviewStates);
  await writeLocal('activeUser', user); await persist(); await loadWords(active.profile.bookId);
}
async function pollTask(id: string, stamp: number) {
  // The persistent server task continues if the app closes. refreshAccount recovers it.
  for (let attempt = 0; attempt < 100 && current(stamp); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!current(stamp) || !useLearningStore.getState().online) return;
    try {
      const task = await api<AiTask>(`/ai/tasks/${id}`);
      if (!current(stamp)) return;
      const next = await commitAccount(stamp, account => { account.aiTasks = (account.aiTasks || []).map(existing => existing.id === task.id ? task : existing); });
      if (current(stamp)) useLearningStore.setState({ aiTasks: next.aiTasks || [] });
      if (task.status === 'SUCCEEDED' || task.status === 'FAILED') { await useLearningStore.getState().refreshAccount(); return; }
    } catch { return; }
  }
}

export const useLearningStore = create<LearningStore>((set, get) => ({
  initialized: false, loading: false, user: null, profile: { ...DEFAULT_PROFILE }, books: [], words: [], articles: [], reviewStates: [], events: [], readingEvents: [], quota: null, usage: [], aiTasks: [], sync: { pending: 0, lastSyncAt: null, status: 'idle', error: null }, online: typeof navigator === 'undefined' ? true : navigator.onLine, error: null,
  studySessions: {},
  draft: { title: '', body: '' },
  async saveDraft(value) { const stamp = generation; assertAccount(); set({ draft: value }); await commitAccount(stamp, account => { account.draft = value; }); },
  bootstrap() {
    bootstrapPromise ||= (async () => {
      set({ loading: true });
      try {
        await restoreSession();
        if (Capacitor.isNativePlatform()) set({ online: (await Network.getStatus()).connected });
        const books = await readLocal<Book[]>('books'); if (books) set({ books });
        const cachedUser = await readLocal<User>('activeUser');
        if (get().online) {
          try { const fresh = await api<Book[]>('/books'); set({ books: fresh }); await writeLocal('books', fresh); } catch (error) { if (!(error instanceof ApiError && error.status === 401)) set({ error: message(error) }); }
          try { await activate(await api<User>('/me')); }
          catch (error) {
            if (error instanceof ApiError && error.status === 401) { await setSession(null); await writeLocal('activeUser', null); }
            else if (cachedUser) { await activate(cachedUser, true); set({ error: message(error) }); }
            else set({ error: message(error) });
          }
        } else if (cachedUser) await activate(cachedUser, true);
        if (active && get().online) { await get().synchronize(); await get().refreshAccount(); }
      } catch (error) { set({ error: message(error) }); }
      finally { set({ initialized: true, loading: false }); }
      if (!listenersInstalled) {
        listenersInstalled = true;
        window.addEventListener('online', () => { set({ online: true }); void get().synchronize().then(() => get().refreshAccount()); });
        window.addEventListener('offline', () => set({ online: false }));
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && active && get().online) void get().synchronize().then(() => get().refreshAccount()); });
        if (Capacitor.isNativePlatform()) {
          await Network.addListener('networkStatusChange', status => { set({ online: status.connected }); if (status.connected) void get().synchronize().then(() => get().refreshAccount()); });
          await App.addListener('appStateChange', status => { if (status.isActive && active && get().online) void get().synchronize().then(() => get().refreshAccount()); });
        }
      }
    })();
    return bootstrapPromise;
  },
  async authenticate(mode, credentials) {
    set({ loading: true, error: null });
    try {
      const result = await api<AuthResponse>(`/auth/${mode}`, 'POST', credentials);
      if (!result.token) return;
      await setSession(result.token); await activate(result.user);
      const books = await api<Book[]>('/books'); set({ books }); await writeLocal('books', books);
      await get().synchronize(); await get().refreshAccount();
    } catch (error) { set({ error: message(error) }); throw error; }
    finally { set({ loading: false }); }
  },
  async logout() {
    if (get().online) {
      try { await api<void>('/auth/logout', 'POST'); }
      catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
    }
    else throw new Error('请联网后退出，以安全注销当前设备会话。');
    generation++; active = null;
    set({ user: null, studySessions: {}, profile: { ...DEFAULT_PROFILE }, words: [], events: [], readingEvents: [], reviewStates: [], articles: [], quota: null, usage: [], aiTasks: [], draft: { title: '', body: '' }, sync: { pending: 0, lastSyncAt: null, status: 'idle', error: null } });
    try { await setSession(null); await writeLocal('activeUser', null); }
    catch { set({ error: '服务器会话已注销，但本机凭证清理失败。请联网重新打开应用后确认。' }); }
  },
  async reloadWords() {
    const bookId = get().profile.bookId;
    if (!bookId) return;
    const version = get().books.find(book => book.id === bookId)?.version;
    const words = await api<Word[]>(`/books/${encodeURIComponent(bookId)}/words`);
    await writeLocal(`words:${bookId}`, words);
    await writeLocal(`words-version:${bookId}`, version || null);
    set({ words });
  },
  async saveProfile(partial) {
    const stamp = generation; const oldBook = assertAccount().profile.bookId;
    const account = await commitAccount(stamp, next => { next.profile = { ...next.profile, ...partial }; next.profileDirty = true; next.profileVersion++; });
    if (!current(stamp)) return;
    set({ profile: account.profile, ...(account.profile.bookId !== oldBook ? { words: [] } : {}) });
    if (oldBook !== account.profile.bookId) await loadWords(account.profile.bookId);
    if (get().online) await get().synchronize();
  },
  synchronize() {
    if (!active || !get().online) return Promise.resolve();
    if (syncPromise) {
      const belongsToPreviousAccount = syncGeneration !== generation;
      return belongsToPreviousAccount ? syncPromise.then(() => get().synchronize()) : syncPromise;
    }
    const stamp = generation;
    syncGeneration = stamp;
    syncPromise = (async () => {
      let readingBatch = false;
      set(state => ({ sync: { ...state.sync, status: 'syncing', error: null } }));
      try {
        let account = assertAccount();
        if (account.profileDirty) {
          const version = account.profileVersion;
          await api<Profile>('/me/profile', 'PUT', account.profile);
          if (!current(stamp)) return;
          await commitAccount(stamp, next => { if (next.profileVersion === version) next.profileDirty = false; });
          account = assertAccount();
        }
        const pendingEvents = account.events.filter(event => account.pending.includes(event.eventId));
        const pendingReadings = uploadableReadings(account);
        const id = pendingEvents[0]?.deviceId || pendingReadings[0]?.deviceId || await deviceId();
        const events = pendingEvents.filter(event => event.deviceId === id).slice(0, 500);
        // Separate article references from word reviews so a missing server article cannot block reviews.
        const readingEvents = events.length ? [] : pendingReadings.filter(event => event.deviceId === id).slice(0, 500);
        readingBatch = readingEvents.length > 0;
        if (!current(stamp)) return;
        const response = await api<SyncResponse>('/sync', 'POST', { cursor: account.cursor, deviceId: id, events, readingEvents });
        if (!current(stamp)) return;
        if (response.schedulerVersion !== SCHEDULER_VERSION) throw new Error('学习调度已升级，请更新应用后同步。');
        const chronological = (a: { occurredAt: string; eventId: string }, b: { occurredAt: string; eventId: string }) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.eventId.localeCompare(b.eventId);
        const oldBook = get().profile.bookId;
        const latest = await commitAccount(stamp, next => {
          next.events = mergeEvents(next.events, response.events).sort(chronological);
          next.readingEvents = mergeEvents(next.readingEvents, response.readingEvents || []).sort(chronological);
          next.pending = next.pending.filter(id => !response.acceptedEventIds.includes(id));
          next.pendingReading = next.pendingReading.filter(id => !(response.acceptedReadingEventIds || []).includes(id));
          next.cursor = response.cursor; next.lastSyncAt = response.serverTime; next.articles = mergeArticles(next.articles, response.articles); next.serverArticleIds = response.articles.map(article => article.id);
          if (!next.profileDirty) next.profile = response.profile;
        });
        if (!current(stamp)) return;
        const reviewStates = calculateStates(latest.events);
        set({ events: latest.events, readingEvents: latest.readingEvents, reviewStates, profile: latest.profile, articles: latest.articles, ...(latest.profile.bookId !== oldBook ? { words: [] } : {}) });
        updateReviewReminder(reviewStates);
        const waitingForArticle = missingReadingCount(latest) > 0 && !latest.pending.length && !uploadableReadings(latest).length && !latest.profileDirty;
        set(state => ({ sync: { ...state.sync, status: waitingForArticle ? 'error' : 'idle', error: waitingForArticle ? missingArticleMessage : null } }));
        await loadWords(latest.profile.bookId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await expireSession(stamp);
        else if (current(stamp) && error instanceof ApiError && error.code === 'CURSOR_AHEAD') {
          // A restored server backup may have an older cursor. Replay the durable local history.
          await commitAccount(stamp, next => { next.cursor = 0; next.pending = next.events.map(event => event.eventId); next.pendingReading = next.readingEvents.map(event => event.eventId); });
          if (current(stamp)) set(state => ({ sync: { ...state.sync, status: 'idle', error: null } }));
        } else if (current(stamp) && readingBatch && error instanceof ApiError && error.status === 404) {
          // Identify unavailable article references so one lost article does not block every reading.
          try {
            const articles = await api<Article[]>('/articles');
            const latest = await commitAccount(stamp, next => { next.articles = mergeArticles(next.articles, articles); next.serverArticleIds = articles.map(article => article.id); });
            if (current(stamp)) set(state => ({ articles: latest.articles, sync: { ...state.sync, status: latest.pending.length || uploadableReadings(latest).length || latest.profileDirty ? 'idle' : 'error', error: missingArticleMessage } }));
          } catch (recoveryError) {
            if (recoveryError instanceof ApiError && recoveryError.status === 401) await expireSession(stamp);
            else if (current(stamp)) set(state => ({ sync: { ...state.sync, status: 'error', error: message(recoveryError) } }));
          }
        } else if (current(stamp)) set(state => ({ sync: { ...state.sync, status: 'error', error: message(error) } }));
      } finally {
        syncPromise = null;
        if (current(stamp) && get().sync.status === 'idle' && active && (active.pending.length || uploadableReadings(active).length || active.profileDirty)) queueMicrotask(() => void get().synchronize());
      }
    })();
    return syncPromise;
  },
  async createStudySession(wordIds, append = false) {
    const stamp = generation; const bookId = assertAccount().profile.bookId;
    const available = new Set(get().words.map(word => word.id));
    const queue = [...new Set(wordIds)].filter(id => available.has(id));
    if (!queue.length) throw new Error('没有可学习的单词，请等待词库加载或选择其他词书。');
    const session: StudySession = { id: crypto.randomUUID(), bookId, queue, index: 0,
      completedCount: 0, repeatedCount: 0, skippedCount: 0, hintUsed: false, updatedAt: new Date().toISOString() };
    const account = await commitAccount(stamp, next => {
      if (next.profile.bookId !== bookId) throw new Error('词书已切换，请重新开始。');
      next.studySessions ||= {};
      const previous = next.studySessions[bookId];
      next.studySessions[bookId] = append && previous && previous.index < previous.queue.length
        ? { ...previous, queue: [...previous.queue, ...queue.filter(id => !previous.queue.slice(previous.index).includes(id))], updatedAt: session.updatedAt }
        : session;
    });
    if (current(stamp)) set({ studySessions: account.studySessions || {} });
  },
  async skipStudyWord(position) {
    const stamp = generation;
    const account = await commitAccount(stamp, next => {
      const session = next.studySessions?.[next.profile.bookId];
      assertSessionPosition(session, position);
      next.studySessions![next.profile.bookId] = advanceStudySession(session);
    });
    if (current(stamp)) set({ studySessions: account.studySessions || {} });
  },
  async markStudyHint(position) {
    const stamp = generation;
    const account = await commitAccount(stamp, next => {
      const session = next.studySessions?.[next.profile.bookId];
      assertSessionPosition(session, position);
      session.hintUsed = true;
    });
    if (current(stamp)) set({ studySessions: account.studySessions || {} });
  },
  async saveStudyQuestion(position, patch) {
    const stamp = generation;
    const account = await commitAccount(stamp, next => {
      const session = next.studySessions?.[next.profile.bookId];
      assertSessionPosition(session, position);
      Object.assign(session, patch, { updatedAt: new Date().toISOString() });
    });
    if (current(stamp)) set({ studySessions: account.studySessions || {} });
  },
  async recordEvent(input) {
    const stamp = generation; const id = await deviceId();
    if (!current(stamp)) throw new Error('账号已切换，请重新操作');
    assertAccount();
    const event: ReviewEvent = { eventId: crypto.randomUUID(), deviceId: id, wordId: input.wordId, senseId: input.senseId || `${input.wordId}:core`, occurredAt: new Date().toISOString(), kind: input.kind, rating: input.rating, usedHint: input.usedHint || false };
    try {
      const account = await commitAccount(stamp, next => {
        if (input.session) {
          const session = next.studySessions?.[next.profile.bookId];
          assertSessionPosition(session, input.session, input.wordId);
          if (input.kind === 'RECALL') {
            event.usedHint ||= session.hintUsed;
            next.studySessions![next.profile.bookId] = advanceStudySession(session, input.rating);
          } else if (input.kind === 'CONTEXT') {
            event.usedHint ||= !!session.translationHintUsed;
            session.questionSubmitted = true;
            session.updatedAt = new Date().toISOString();
          }
        }
        next.events.push(event); next.pending.push(event.eventId);
      });
      if (current(stamp)) {
        const reviewStates = calculateStates(account.events);
        set({ events: account.events, reviewStates, studySessions: account.studySessions || {} });
        updateReviewReminder(reviewStates);
      }
    } catch (error) {
      if (error instanceof SessionPositionError) throw error;
      if (current(stamp)) set({ error: '本机存储失败，学习记录尚未保存。请检查设备存储空间后重试。' });
      throw error;
    }
    if (get().online) void get().synchronize();
  },
  async recordReading(articleId, position, completed) {
    const stamp = generation; const id = await deviceId(); if (!current(stamp)) return;
    assertAccount();
    const event: ReadingEvent = { eventId: crypto.randomUUID(), deviceId: id, articleId, position, completed, occurredAt: new Date().toISOString() };
    const account = await commitAccount(stamp, next => { next.readingEvents.push(event); next.pendingReading.push(event.eventId); });
    if (current(stamp)) { set({ readingEvents: account.readingEvents }); if (get().online) void get().synchronize(); }
  },
  async requestAi(input) {
    const stamp = generation; assertAccount();
    const { session: sessionPosition, ...payload } = input;
    const key = JSON.stringify(payload);
    const account = await commitAccount(stamp, next => { next.pendingAi ||= {}; next.pendingAi[key] ||= crypto.randomUUID(); });
    const requestId = account.pendingAi![key];
    if (!current(stamp)) throw new Error('账号已切换，请在当前账号重新请求。');
    let task: AiTask;
    try { task = await api<AiTask>('/ai/tasks', 'POST', { ...payload, requestId }); }
    catch (error) {
      if (current(stamp) && error instanceof ApiError && error.status < 500) await commitAccount(stamp, next => { delete next.pendingAi?.[key]; });
      if (error instanceof ApiError && error.status === 401) await expireSession(stamp);
      throw error;
    }
    if (current(stamp)) {
      const next = await commitAccount(stamp, value => {
        delete value.pendingAi?.[key];
        value.aiTasks = [task, ...(value.aiTasks || []).filter(existing => existing.id !== task.id)];
        if (sessionPosition && payload.scene === 'CONTEXT') {
          const session = value.studySessions?.[value.profile.bookId];
          if (session && session.id === sessionPosition.id && session.index === sessionPosition.index) {
            session.questionTaskId = task.id;
            delete session.questionAnswer; delete session.questionSubmitted; delete session.translationHintUsed;
            session.updatedAt = new Date().toISOString();
          }
        }
      });
      if (current(stamp)) { set({ aiTasks: next.aiTasks || [], studySessions: next.studySessions || {} }); if (task.status === 'QUEUED' || task.status === 'RUNNING') void resumePoll(task.id, stamp); await get().refreshAccount(); }
    }
    return task;
  },
  async refreshAccount() {
    if (!active || !get().online) return;
    const stamp = generation;
    try {
      const [quota, aiTasks, articles] = await Promise.all([api<Quota>('/ai/quota'), api<AiTask[]>('/ai/tasks'), api<Article[]>('/articles')]);
      if (!current(stamp)) return;
      const next = await commitAccount(stamp, value => {
        value.articles = mergeArticles(value.articles, articles); value.serverArticleIds = articles.map(article => article.id);
        value.aiTasks = [...new Map([...(value.aiTasks || []), ...aiTasks].map(task => [task.id, task])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); value.quota = quota;
        const knownRequests = new Set(aiTasks.map(task => task.requestId));
        for (const [key, id] of Object.entries(value.pendingAi || {})) if (knownRequests.has(id)) delete value.pendingAi![key];
      });
      if (!current(stamp)) return;
      set({ quota, usage: quota.usage, aiTasks: next.aiTasks || [], articles: next.articles });
      for (const task of aiTasks.filter(value => value.status === 'QUEUED' || value.status === 'RUNNING')) void resumePoll(task.id, stamp);
    } catch (error) { if (error instanceof ApiError && error.status === 401) await expireSession(stamp); else if (current(stamp)) set({ error: message(error) }); }
  },
  async createArticle(input) {
    const stamp = generation; assertAccount();
    const article = await api<Article>('/articles', 'POST', { ...input, source: 'USER' });
    if (current(stamp)) {
      try { const next = await commitAccount(stamp, value => { value.articles = mergeArticles(value.articles, [article]); if (value.serverArticleIds) value.serverArticleIds = [...new Set([...value.serverArticleIds, article.id])]; }); if (current(stamp)) set({ articles: next.articles }); }
      catch { if (current(stamp)) set(state => ({ articles: [article, ...state.articles.filter(existing => existing.id !== article.id)], error: '文章已保存到服务器，但本机缓存失败。请联网重新打开后确认。' })); }
    }
    return article;
  },
  clearError() { set({ error: null }); },
  async loadAdmin() { const [providers, users, usage, tasks] = await Promise.all([api<AdminData['providers']>('/admin/providers'), api<AdminData['users']>('/admin/users'), api<AdminData['usage']>('/admin/usage'), api<AdminData['tasks']>('/admin/tasks')]); return { providers, users, usage, tasks }; },
  async saveProvider(input, id) { await api(`/admin/providers${id ? `/${id}` : ''}`, id ? 'PUT' : 'POST', input); },
  async deleteProvider(id) { await api(`/admin/providers/${id}`, 'DELETE'); },
  async adjustQuota(userId, amount, reason) {
    const stamp = generation; assertAccount();
    const key = JSON.stringify({ userId, amount, reason });
    const pending = await commitAccount(stamp, next => { next.pendingQuota ||= {}; next.pendingQuota[key] ||= crypto.randomUUID(); });
    if (!current(stamp)) throw new Error('账号已切换，请重新操作');
    try { await api(`/admin/users/${userId}/quota`, 'POST', { requestId: pending.pendingQuota![key], amount, reason }); }
    catch (error) {
      if (current(stamp) && error instanceof ApiError && error.status >= 400 && error.status < 500) await commitAccount(stamp, next => { delete next.pendingQuota?.[key]; });
      if (error instanceof ApiError && error.status === 401) await expireSession(stamp);
      throw error;
    }
    if (current(stamp)) { await commitAccount(stamp, next => { delete next.pendingQuota?.[key]; }); await get().refreshAccount(); }
  },
  async createAdminUser(input) {
    await api('/admin/users', 'POST', input);
  },
  async updateUserStatus(userId, status) {
    await api(`/admin/users/${userId}/status`, 'PUT', { status });
  },
  async updateUserRole(userId, role) {
    await api(`/admin/users/${userId}/role`, 'PUT', { role });
  },
  async resetUserPassword(userId, password) {
    await api(`/admin/users/${userId}/password`, 'PUT', { password });
  },
  async updateUserRemark(userId, remark) {
    await api(`/admin/users/${userId}/remark`, 'PUT', { remark });
  },
  async revokeUserSessions(userId) {
    await api(`/admin/users/${userId}/sessions`, 'DELETE');
  },
  async loadUserLedger(userId) {
    return api<AdminLedgerEntry[]>(`/admin/users/${userId}/ledger`);
  },
}));
const polling = new Set<string>();
async function resumePoll(id: string, stamp: number) {
  const key = `${stamp}:${id}`; if (polling.has(key)) return;
  polling.add(key); try { await pollTask(id, stamp); } finally { polling.delete(key); }
}
