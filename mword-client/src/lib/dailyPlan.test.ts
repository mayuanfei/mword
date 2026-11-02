import { describe, expect, it } from 'vitest';
import { dailyNewWordGoal, localDayBounds, selectDailyPlan } from './dailyPlan';
import type { ReviewEvent, Word } from './types';

const now = new Date(2026, 10, 2, 12).getTime();
const { start, end } = localDayBounds(now);
const words: Word[] = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, lemma: `word${i}`, meaning: '释义' }));
const recall = (wordId: string, time: number, kind: ReviewEvent['kind'] = 'RECALL'): ReviewEvent => ({
  eventId: `${wordId}-${time}-${kind}`, deviceId: 'test', wordId, senseId: `${wordId}:core`,
  occurredAt: new Date(time).toISOString(), kind, rating: 3, usedHint: false
});

describe('daily new-word plan', () => {
  it('uses calendar midnights on daylight-saving transition days', () => {
    const day = new Date(2026, 10, 1, 12).getTime();
    const bounds = localDayBounds(day);
    expect(bounds.start).toBe(new Date(2026, 10, 1).getTime());
    expect(bounds.end).toBe(new Date(2026, 10, 2).getTime());
    expect(bounds.end - bounds.start).toBe(86_400_000 +
      (new Date(bounds.end).getTimezoneOffset() - new Date(bounds.start).getTimezoneOffset()) * 60_000);
  });

  it('uses the same word count as the configured time estimate', () => {
    expect([10, 15, 20, 30, 45].map(dailyNewWordGoal)).toEqual([12, 18, 24, 36, 54]);
  });

  it('keeps the daily cohort fixed as words are completed, including after a reload', () => {
    const initial = selectDailyPlan(words, [], 10, now);
    const events = [recall('w0', start + 1000)];
    const updated = selectDailyPlan(words, events, 10, now);
    expect(updated.targetWords).toEqual(initial.targetWords);
    expect(updated.remainingWords.map(word => word.id)).toEqual(initial.targetWords.slice(1).map(word => word.id));
    expect(selectDailyPlan(words, structuredClone(events), 10, now)).toEqual(updated);
    expect(updated.completedCount).toBe(1);
  });

  it('does not count old-word reviews, lookups or context answers as completed new-word recalls', () => {
    const events = [recall('w0', start - 1), recall('w0', now), recall('w1', now, 'EXPOSURE'), recall('w2', now, 'CONTEXT')];
    const plan = selectDailyPlan(words, events, 10, now);
    expect(plan.targetWords[0].id).toBe('w1');
    expect(plan.remainingWords).toEqual(plan.targetWords);
    expect(plan.completedCount).toBe(0);
  });

  it('deduplicates repeated recalls and never tops up a finished plan with extra words', () => {
    const events = words.slice(0, 12).flatMap(word => [recall(word.id, now), recall(word.id, now + 1)]);
    const plan = selectDailyPlan(words, events, 10, now);
    expect(plan.completedCount).toBe(12);
    expect(plan.remainingWords).toEqual([]);
    expect(selectDailyPlan(words, [...events, recall('w12', now)], 10, now).targetWords).toEqual(plan.targetWords);
  });

  it('limits the target to remaining book words and ignores other books and tomorrow', () => {
    const plan = selectDailyPlan(words.slice(0, 2), [recall('outside', now), recall('w0', end)], 10, now);
    expect(plan.targetWords).toHaveLength(2);
    expect(plan.completedCount).toBe(0);
  });

  it('builds the next day from the preceding day history', () => {
    const plan = selectDailyPlan(words, [recall('w0', end - 1)], 10, end);
    expect(plan.targetWords[0].id).toBe('w1');
    expect(plan.completedCount).toBe(0);
    expect(localDayBounds(end).start).toBe(end);
  });
});
