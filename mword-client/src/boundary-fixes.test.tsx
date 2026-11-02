// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ReviewPage } from './pages/ReviewPage';
import { useLearningStore } from './lib/store';
import { calculateStates } from './lib/scheduler';
import { advanceStudySession } from './lib/studySession';
import { DEFAULT_PROFILE, type AiTask, type ReviewEvent } from './lib/types';
import { button, click, mount } from './test/render';

vi.mock('./lib/store', async () => {
  const { create } = await import('zustand');
  return { useLearningStore: create(() => ({})) };
});
vi.mock('./lib/native', () => ({ speakWord: vi.fn(), enableReviewReminder: vi.fn(), syncReviewReminder: vi.fn() }));

const now = new Date(2026, 10, 2, 12).getTime();
const recall = (wordId: string, time: number, rating: 1 | 2 | 3 | 4 = 3): ReviewEvent => ({
  eventId: `${wordId}-${time}-${rating}`,
  deviceId: 'test',
  wordId,
  senseId: `${wordId}:core`,
  occurredAt: new Date(time).toISOString(),
  kind: 'RECALL',
  rating,
  usedHint: false
});
const compactText = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s/g, '');

describe('boundary fixes verification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const profile = { ...DEFAULT_PROFILE, dailyMinutes: 10, onboardingCompleted: true };
    useLearningStore.setState({
      initialized: true,
      bootstrap: vi.fn(async () => {}),
      user: { id: 'test', username: 'learner', role: 'USER', profile },
      profile,
      words: Array.from({ length: 15 }, (_, i) => ({ id: `w${i}`, lemma: `word${i}`, meaning: '释义' })),
      books: [{ id: profile.bookId, name: '测试词书', wordCount: 15, description: '', version: 'test', sourceUrl: '', license: '' }],
      events: [],
      reviewStates: [],
      online: true,
      error: null,
      aiTasks: [],
      quota: null,
      studySessions: {},
      createStudySession: vi.fn(async (queue, append = false) => {
        const previous = useLearningStore.getState().studySessions.cet4;
        useLearningStore.setState({
          studySessions: {
            cet4: append && previous && previous.index < previous.queue.length
              ? { ...previous, queue: [...previous.queue, ...queue.filter((id: string) => !previous.queue.slice(previous.index).includes(id))] }
              : { id: 'session-1', bookId: 'cet4', queue, index: 0, completedCount: 0, repeatedCount: 0, skippedCount: 0, hintUsed: false, updatedAt: new Date(now).toISOString() }
          }
        });
      }),
      saveStudyQuestion: vi.fn(async (_position, patch) => {
        const current = useLearningStore.getState().studySessions.cet4;
        if (!current) return;
        useLearningStore.setState({
          studySessions: { cet4: { ...current, ...patch, updatedAt: new Date(now).toISOString() } }
        });
      }),
      sync: { status: 'idle', pending: 0, lastSyncAt: null, error: null },
      recordEvent: vi.fn(async input => {
        const oldEvents = useLearningStore.getState().events;
        const event: ReviewEvent = {
          ...recall(input.wordId, Date.now(), input.rating),
          ...input,
          senseId: input.senseId || `${input.wordId}:core`,
          usedHint: !!input.usedHint
        };
        const nextEvents = [...oldEvents, event];
        const sessions = useLearningStore.getState().studySessions;
        useLearningStore.setState({
          events: nextEvents,
          reviewStates: calculateStates(nextEvents),
          studySessions: input.session && input.kind === 'RECALL'
            ? { cet4: advanceStudySession(sessions.cet4, input.rating) }
            : input.session && input.kind === 'CONTEXT'
              ? { cet4: { ...sessions.cet4, questionSubmitted: true } }
              : sessions
        });
      })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('disables starting a session while new book words are still loading', async () => {
    useLearningStore.setState({ words: [] });
    await mount(<App />);
    expect(button('开始今日背词').disabled).toBe(true);
    expect(document.querySelector('.study-hero-title')?.textContent).not.toContain('今日背词任务已达成');
  });

  it('does not declare daily goal reached while forgotten words remain in the repeat queue', async () => {
    const events = Array.from({ length: 12 }, (_, i) => recall(`w${i}`, now, 1));
    const queue = [...Array.from({ length: 12 }, (_, i) => `w${i}`), ...Array.from({ length: 12 }, (_, i) => `w${i}`)];
    useLearningStore.setState({
      events,
      reviewStates: calculateStates(events),
      studySessions: {
        cet4: {
          id: 'session-1',
          bookId: 'cet4',
          queue,
          index: 12,
          completedCount: 0,
          repeatedCount: 12,
          skippedCount: 0,
          hintUsed: false,
          updatedAt: new Date(now).toISOString()
        }
      }
    });
    await mount(<App />);
    expect(document.querySelector('.study-hero-title')?.textContent).not.toContain('今日背词任务已达成');
    expect(compactText('.plan-ring')).toContain('0/12词');
    expect(compactText('.plan-ring')).toContain('当轮还有12词待强化');
    expect(document.body.textContent).not.toContain('再学一组新词');
  });

  it('restores AI context exercise across page navigation and allows answering', async () => {
    const task: AiTask = {
      id: 'ctx-task-1',
      requestId: 'req-1',
      scene: 'CONTEXT',
      status: 'SUCCEEDED',
      cost: 1,
      result: JSON.stringify({
        sentence: 'Please retain this receipt.',
        sentenceTranslation: '请保留这张收据。',
        options: ['保留', '放弃', '拒绝', '忽略'],
        answer: 0,
        explanation: 'retain 意为保留'
      }),
      error: null,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      wordId: 'w0'
    };
    useLearningStore.setState({
      aiTasks: [task],
      requestAi: vi.fn(async () => task),
      studySessions: {
        cet4: {
          id: 'session-1',
          bookId: 'cet4',
          queue: ['w0'],
          index: 0,
          completedCount: 0,
          repeatedCount: 0,
          skippedCount: 0,
          hintUsed: false,
          updatedAt: new Date(now).toISOString()
        }
      }
    });
    const view = await mount(<ReviewPage now={now} onOpenWord={vi.fn()} onSettings={vi.fn()} />);
    await click('生成新句练习');
    expect(document.querySelector('.question-sentence')?.textContent).toBe('Please retain this receipt.');
    await click('A.');
    await view.render(null);
    await view.render(<ReviewPage now={now} onOpenWord={vi.fn()} onSettings={vi.fn()} />);
    expect(document.querySelector('.question-sentence')?.textContent).toBe('Please retain this receipt.');
    await click('确认答案');
    expect(document.querySelector('.question-result')?.textContent).toContain('理解正确');
  });
});
