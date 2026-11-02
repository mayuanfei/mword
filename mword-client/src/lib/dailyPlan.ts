import type { ReviewEvent, Word } from './types';

export function localDayBounds(now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

export function dailyNewWordGoal(dailyMinutes: number) {
  return Math.max(1, Math.round(dailyMinutes * 1.2));
}

export function selectDailyPlan(words: Word[], events: ReviewEvent[], dailyMinutes: number, now: number) {
  const { start, end } = localDayBounds(now);
  const learnedBeforeToday = new Set<string>();
  const recalledToday = new Set<string>();
  for (const event of events) {
    if (event.kind === 'EXPOSURE') continue;
    const time = Date.parse(event.occurredAt);
    if (time < start) learnedBeforeToday.add(event.wordId);
    if (time >= start && time < end && event.kind === 'RECALL') recalledToday.add(event.wordId);
  }
  // 只根据当天开始前的学习记录选词；当天完成的词保留在计划中，不补入下一词。
  const targetWords = words.filter(word => !learnedBeforeToday.has(word.id)).slice(0, dailyNewWordGoal(dailyMinutes));
  const remainingWords = targetWords.filter(word => !recalledToday.has(word.id));
  return { targetWords, remainingWords, completedCount: targetWords.length - remainingWords.length };
}
