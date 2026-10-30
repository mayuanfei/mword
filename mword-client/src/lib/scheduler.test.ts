import { describe, expect, it } from 'vitest';
import { calculateStates, mergeEvents } from './scheduler';
import type { ReviewEvent } from './types';

const base: ReviewEvent = { eventId: 'a', deviceId: 'phone', wordId: 'lemma:retain', senseId: 'lemma:retain:core', occurredAt: '2026-01-01T00:00:00.000Z', kind: 'RECALL', rating: 3, usedHint: false };
describe('interval-v1', () => {
  it('does not schedule an exposure as proof of recall', () => expect(calculateStates([{ ...base, kind: 'EXPOSURE' }])).toEqual([]));
  it('caps hinted ratings and retries a lapse in ten minutes', () => {
    expect(calculateStates([{ ...base, rating: 4, usedHint: true }])[0]).toMatchObject({ intervalDays: 1, status: 'LEARNING' });
    expect(calculateStates([{ ...base, rating: 1 }])[0]).toMatchObject({ lapses: 1, repetitions: 0, dueAt: '2026-01-01T00:10:00.000Z' });
  });
  it('replays out of order cross-device events deterministically and deduplicates', () => {
    const later = { ...base, eventId: 'b', deviceId: 'ipad', occurredAt: '2026-01-02T00:00:00.000Z', rating: 4 as const };
    expect(calculateStates([later, base, base])).toEqual(calculateStates([base, later]));
    expect(calculateStates([base, later])[0]).toMatchObject({ intervalDays: 4, repetitions: 2, dueAt: '2026-01-06T00:00:00.000Z' });
  });
  it('keeps word senses independent and breaks timestamp ties by eventId', () => {
    const tie = { ...base, eventId: 'b', rating: 1 as const };
    const otherSense = { ...base, eventId: 'c', senseId: 'lemma:retain:other' };
    expect(calculateStates([tie, otherSense, base])).toHaveLength(2);
    expect(calculateStates([tie, base])[0].lapses).toBe(1);
  });
  it('merges the server snapshot with events created during an in-flight sync', () => {
    const late = { ...base, eventId: 'late' };
    expect(mergeEvents([base], [base, late]).map(event => event.eventId)).toEqual(['a', 'late']);
  });
});
