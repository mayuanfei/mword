import type { ReviewEvent, ReviewState } from './types';

export const SCHEDULER_VERSION = 'interval-v1';
export function mergeEvents<T extends { eventId: string }>(...groups: T[][]): T[] {
  return [...new Map(groups.flat().map(event => [event.eventId, event])).values()];
}
export function calculateStates(input: ReviewEvent[]): ReviewState[] {
  const events = mergeEvents(input).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  const states = new Map<string, ReviewState>();
  for (const event of events) {
    if (event.kind === 'EXPOSURE') continue;
    const key = `${event.wordId}\0${event.senseId}`;
    const previous = states.get(key);
    let repetitions = previous?.repetitions || 0;
    let lapses = previous?.lapses || 0;
    let intervalDays = previous?.intervalDays || 0;
    const rating = event.usedHint ? Math.min(event.rating, 2) : event.rating;
    let status: ReviewState['status'];
    if (rating === 1) { repetitions = 0; lapses++; intervalDays = 0; status = 'LEARNING'; }
    else if (rating === 2) { repetitions++; intervalDays = 1; status = 'LEARNING'; }
    else {
      repetitions++;
      intervalDays = intervalDays <= 0 ? (rating === 4 ? 3 : 1) : Math.ceil(intervalDays * (rating === 4 ? 3.5 : 2.5));
      intervalDays = Math.min(intervalDays, 365); status = 'REVIEW';
    }
    states.set(key, { wordId: event.wordId, senseId: event.senseId, repetitions, lapses, intervalDays,
      dueAt: new Date(Date.parse(event.occurredAt) + (rating === 1 ? 600_000 : intervalDays * 86_400_000)).toISOString(),
      lastReviewedAt: event.occurredAt, status });
  }
  return [...states.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, state]) => state);
}
