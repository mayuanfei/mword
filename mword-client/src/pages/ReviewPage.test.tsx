// @vitest-environment jsdom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewPage } from './ReviewPage';
import { useLearningStore } from '../lib/store';
import { DEFAULT_PROFILE, type AiTask } from '../lib/types';
import { calculateStates } from '../lib/scheduler';
import { advanceStudySession } from '../lib/studySession';
import { button, click, key, mount } from '../test/render';

vi.mock('../lib/store', async () => {
  const { create } = await import('zustand');
  return { useLearningStore: create(() => ({})) };
});
vi.mock('../lib/native', () => ({ speakWord: vi.fn() }));

const now = new Date(2026, 10, 2, 12).getTime();
const task: AiTask = { id: 'question', requestId: 'request', scene: 'CONTEXT', status: 'SUCCEEDED', cost: 1,
  result: JSON.stringify({ sentence: 'Remember alpha.', sentenceTranslation: '记住阿尔法。', options: ['阿尔法', '乙', '丙', '丁'], answer: 0, explanation: '正确释义' }),
  error: null, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), wordId: 'alpha' };
const page = (time = now) => <ReviewPage now={time} onOpenWord={vi.fn()} onSettings={vi.fn()} />;

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  useLearningStore.setState({ profile: { ...DEFAULT_PROFILE, dailyMinutes: 10 }, events: [], reviewStates: [],
    words: ['alpha', 'bravo', 'charlie'].map(id => ({ id, lemma: id, meaning: '释义', senseId: `${id}:core` })),
    studySessions: { cet4: { id: 'session', bookId: 'cet4', queue: ['alpha','bravo','charlie'], index: 0, completedCount: 0, repeatedCount: 0, skippedCount: 0, hintUsed: false, updatedAt: new Date(now).toISOString() } },
    markStudyHint: vi.fn(async () => {}), skipStudyWord: vi.fn(async () => {}),
    aiTasks: [task], quota: null, online: true, recordEvent: vi.fn(async input => {
      if (input.kind === 'RECALL') {
        const session = useLearningStore.getState().studySessions.cet4;
        useLearningStore.setState({ studySessions: { cet4: advanceStudySession(session, input.rating) } });
      }
    }), requestAi: vi.fn(async () => task) });
});

describe('review interactions', () => {
  it('keeps mnemonic details collapsed and surfaces draft meaning provenance', async () => {
    const words = useLearningStore.getState().words.map(word => ({ ...word, definitionStatus: 'editorial-draft',
      definitionSource: 'mword 基础释义整理', sourceUrl: 'https://example.test/word-list', memoryAssets: { mnemonics: '助记联想' } }));
    useLearningStore.setState({ words });
    await mount(page()); await click('看释义');
    expect(document.querySelector<HTMLDetailsElement>('.recall-memory')?.open).toBe(false);
    expect(document.querySelector('.definition-draft')?.textContent).toContain('待校对');
    expect(document.querySelector('.word-provenance')?.textContent).toContain('mword 基础释义整理');
    expect(document.querySelector('.word-provenance a')).toBeNull();
    expect(document.querySelector('.recall-actions button')?.textContent).toContain('忘记了');
  });

  it('saves once and advances one card for rapid keys and clicks while storage is pending', async () => {
    let finish!: () => void;
    const record = vi.fn(() => new Promise<void>(resolve => { finish = () => {
      useLearningStore.setState({ studySessions: { cet4: advanceStudySession(useLearningStore.getState().studySessions.cet4, 3) } }); resolve();
    }; }));
    useLearningStore.setState({ recordEvent: record });
    await mount(page());
    await click('看释义');
    const ratingButton = button('正常想起');
    await act(async () => { key('3'); key('3'); ratingButton.click(); });
    expect(record).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('alpha');
    await act(async () => { finish(); });
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('bravo');
    expect(document.querySelector('.review-header')?.textContent).toContain('2 / 3');
    await act(async () => { key('3'); });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('ignores held keys, unrevealed cards and words with no meaning', async () => {
    useLearningStore.setState({ words: [{ id: 'alpha', lemma: 'alpha', meaning: '' }], aiTasks: [] });
    await mount(page());
    await act(async () => { key('3'); key(' ', true); });
    expect(button('看释义')).toBeDefined();
    await click('看释义');
    await act(async () => { key('3'); });
    expect(useLearningStore.getState().recordEvent).not.toHaveBeenCalled();
  });

  it('keeps the card available for retry after a failed save', async () => {
    const record = vi.fn().mockRejectedValueOnce(new Error('存储失败')).mockImplementation(async () => {
      useLearningStore.setState({ studySessions: { cet4: advanceStudySession(useLearningStore.getState().studySessions.cet4, 3) } });
    });
    useLearningStore.setState({ recordEvent: record });
    await mount(page());
    await click('看释义');
    await click('正常想起');
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('alpha');
    await click('正常想起');
    expect(record).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('bravo');
  });

  it.each([true, false])('records translation assistance even after hiding it: %s', async usedHint => {
    await mount(page());
    await click('生成新句练习');
    if (usedHint) { await click('看不懂句子'); await click('收起整句'); }
    await click('A.');
    await click('确认答案');
    const record = vi.mocked(useLearningStore.getState().recordEvent);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'CONTEXT', rating: 3, usedHint }));
    const input = record.mock.calls[0][0];
    const state = calculateStates([{ ...input, eventId: 'event', deviceId: 'test', senseId: 'alpha:core', usedHint: !!input.usedHint, occurredAt: new Date(now).toISOString() }])[0];
    expect(state.status).toBe(usedHint ? 'LEARNING' : 'REVIEW');
    await click('看释义');
    await click('正常想起');
    await click('生成新句练习');
    expect(document.body.textContent).not.toContain('本题已查看翻译');
  });

  it('does not restart an active session or reveal answers when the clock updates', async () => {
    const view = await mount(page());
    await click('看释义');
    await click('正常想起');
    await view.render(page(now + 60_000));
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('bravo');
    expect(button('看释义')).toBeDefined();
  });

  it('restores the exact queue position on remount, with the answer hidden', async () => {
    const view = await mount(page());
    await click('看释义'); await click('忘记了');
    await view.render(null); await view.render(page());
    expect(document.querySelector('.recall-card h2')?.textContent).toBe('bravo');
    expect(button('看释义')).toBeDefined();
    expect(document.querySelector('.review-header')?.textContent).toContain('2 / 4');
  });
});
