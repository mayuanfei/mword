// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useLearningStore } from './lib/store';
import { calculateStates } from './lib/scheduler';
import { advanceStudySession } from './lib/studySession';
import { localDayBounds } from './lib/dailyPlan';
import { DEFAULT_PROFILE, type ReviewEvent } from './lib/types';
import { button, click, mount } from './test/render';

vi.mock('./lib/store', async () => {
  const { create } = await import('zustand');
  return { useLearningStore: create(() => ({})) };
});
vi.mock('./lib/native', () => ({ speakWord: vi.fn(), enableReviewReminder: vi.fn() }));

const now = new Date(2026, 10, 2, 12).getTime();
const recall = (wordId: string, time: number): ReviewEvent => ({ eventId: `${wordId}-${time}`, deviceId: 'test', wordId, senseId: `${wordId}:core`, occurredAt: new Date(time).toISOString(), kind: 'RECALL', rating: 3, usedHint: false });
const compactText = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s/g, '');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const profile = { ...DEFAULT_PROFILE, dailyMinutes: 10, onboardingCompleted: true };
  const events = [recall('w0', now - 2 * 86_400_000)];
  useLearningStore.setState({ initialized: true, bootstrap: vi.fn(async () => {}),
    user: { id: 'test', username: 'learner', role: 'USER', profile }, profile,
    words: Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, lemma: `word${i}`, meaning: '释义' })),
    books: [{ id: profile.bookId, name: '测试词书', wordCount: 30, description: '', version: 'test', sourceUrl: '', license: '' }],
    events, reviewStates: calculateStates(events), online: false, error: null, aiTasks: [], quota: null,
    studySessions: {}, createStudySession: vi.fn(async (queue, append = false) => {
      const previous = useLearningStore.getState().studySessions.cet4;
      useLearningStore.setState({ studySessions: { cet4: append && previous ? { ...previous, queue: [...previous.queue, ...queue] } : {
        id: crypto.randomUUID(), bookId: 'cet4', queue, index: 0, completedCount: 0, repeatedCount: 0, skippedCount: 0, hintUsed: false, updatedAt: new Date(now).toISOString() } } });
    }),
    sync: { status: 'idle', pending: 0, lastSyncAt: null, error: null }, recordEvent: vi.fn(async input => {
      const oldEvents = useLearningStore.getState().events;
      const event: ReviewEvent = { ...recall(input.wordId, Date.now()), ...input,
        senseId: input.senseId || `${input.wordId}:core`, usedHint: !!input.usedHint };
      const nextEvents = [...oldEvents, event];
      const sessions = useLearningStore.getState().studySessions;
      useLearningStore.setState({ events: nextEvents, reviewStates: calculateStates(nextEvents), studySessions: input.session && input.kind === 'RECALL'
        ? { cet4: advanceStudySession(sessions.cet4, input.rating) } : sessions });
    }) });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('daily dashboard integration', () => {
  it('resumes the exact unfinished repeat queue after navigating away and remounting', async () => {
    const view = await mount(<App />);
    await click('开始今日背词'); await click('看释义'); await click('忘记了');
    const saved = structuredClone(useLearningStore.getState().studySessions.cet4);
    await click('返回今日');
    await view.render(null); await view.render(<App />);
    await click('继续本轮背词');
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('word1');
    expect(compactText('.review-header')).toContain('2/14');
    expect(useLearningStore.getState().studySessions.cet4).toEqual(saved);
    await click('看释义'); await click('查看完整讲解');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click('关闭讲解，继续本轮');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(useLearningStore.getState().studySessions.cet4).toEqual(saved);
  });

  it('paginates through all words, exposes keyboard-operable rows and resets paging on search', async () => {
    useLearningStore.setState({ words: Array.from({ length: 91 }, (_, i) => ({ id: `w${i}`, lemma: `word${i}`, meaning: '释义' })) });
    await mount(<App />); await click('词书进度');
    expect(document.querySelectorAll('button.vocab-row')).toHaveLength(40);
    expect(button('上一页').disabled).toBe(true);
    await click('下一页');
    expect(document.querySelector('.vocab-row b')?.textContent).toBe('word40');
    await click('下一页');
    expect(document.querySelectorAll('button.vocab-row')).toHaveLength(11);
    expect(button('下一页').disabled).toBe(true);
    const input = document.querySelector<HTMLInputElement>('[aria-label="搜索词书单词"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'word45');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.querySelectorAll('button.vocab-row')).toHaveLength(1);
    const row = document.querySelector<HTMLButtonElement>('button.vocab-row')!;
    expect(row.textContent).toContain('word45');
    expect(row.getAttribute('aria-label')).toBe('查看 word45 的释义与讲解');
    row.focus(); expect(document.activeElement).toBe(row);
    await act(async () => { row.click(); });
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('word45');
  });

  it('counts a word once when an unanswered new-word recall also has a due context exercise', async () => {
    const events: ReviewEvent[] = [...useLearningStore.getState().events,
      { ...recall('w1', now - 600_001), kind: 'CONTEXT', rating: 1 }];
    useLearningStore.setState({ events, reviewStates: calculateStates(events) });
    await mount(<App />);
    expect(button('开始今日背词 (13')).toBeDefined();
    expect(button('仅复习到期词 (2')).toBeDefined();
    expect(compactText('.plan-ring')).toContain('0/12词');
    await click('开始今日背词');
    expect(compactText('.review-header')).toContain('1/13');
  });

  it('keeps old-word reviews separate and decreases the fixed new-word remainder after studying', async () => {
    await mount(<App />);
    expect(button('开始今日背词 (13')).toBeDefined();
    await click('开始今日背词');
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('word0');
    await click('看释义');
    await click('正常想起');
    await click('今日背词');
    expect(compactText('.plan-ring')).toContain('0/12词');
    expect(button('仅学新词 (12')).toBeDefined();
    await click('仅学新词');
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('word1');
    await click('看释义');
    await click('正常想起');
    await click('今日背词');
    expect(compactText('.plan-ring')).toContain('1/12词');
    expect(button('仅学新词 (11')).toBeDefined();
    expect(button('继续本轮背词')).toBeDefined();
  });

  it('does not silently start the next batch after the goal is complete', async () => {
    const events = [...useLearningStore.getState().events, ...Array.from({ length: 12 }, (_, i) => recall(`w${i + 1}`, now))];
    // w0 的到期复习也已完成。
    events.push(recall('w0', now));
    useLearningStore.setState({ events, reviewStates: calculateStates(events) });
    await mount(<App />);
    expect(button('开始今日背词').disabled).toBe(true);
    expect(compactText('.plan-ring')).toContain('12/12词');
    await click('背词会话');
    expect(document.querySelector('.recall-card')).toBeNull();
    await click('返回今日面板');
    await click('再学一组新词');
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('word13');
  });

  it('refreshes due badges and resets today counts at midnight while offline', async () => {
    const beforeMidnight = new Date(2026, 10, 2, 23, 59, 59, 900).getTime();
    vi.setSystemTime(beforeMidnight);
    const events = [recall('w0', localDayBounds(now).start - 1), recall('w1', beforeMidnight)];
    const states = calculateStates(events).map(state => state.wordId === 'w0' ? { ...state, dueAt: new Date(beforeMidnight + 100).toISOString() } : state);
    useLearningStore.setState({ events, reviewStates: states });
    await mount(<App />);
    expect(compactText('.review-number')).toContain('0个词需要复习');
    expect(compactText('.study-task-badges')).toContain('今日已背1词');
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(compactText('.review-number')).toContain('1个词需要复习');
    expect(compactText('.study-task-badges')).toContain('今日已背0词');
    expect(compactText('.plan-ring')).toContain('0/12词');
  });
});
