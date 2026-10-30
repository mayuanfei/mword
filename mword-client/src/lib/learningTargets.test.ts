import { describe, expect, it } from 'vitest';
import { selectLearningTargets, selectMatchedArticleTargets, type LearningTargetInput } from './learningTargets';
import { calculateStates } from './scheduler';
import type { Article, ReadingEvent, ReviewEvent, ReviewState, Word } from './types';

const now = Date.parse('2026-10-12T08:00:00Z');
const word = (id: string): Word => ({ id, lemma: id, meaning: `释义 ${id}`, senseId: `${id}:core` });
const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map(word);
const input = (partial: Partial<LearningTargetInput> = {}): LearningTargetInput => ({ words, reviewStates: [], articles: [], readingEvents: [], events: [], now, ...partial });
const article = (id: string, targets: string[], source: Article['source'] = 'AI'): Article => ({ id, title: id, body: targets.join(' '), targetWordIds: targets, source, createdAt: '2026-10-12T07:00:00Z' });
const reading = (articleId: string, eventId: string): ReadingEvent => ({ eventId, articleId, deviceId: 'device', position: 1, completed: true, occurredAt: '2026-10-12T07:30:00Z' });
const exposure = (wordId: string, eventId: string, occurredAt = '2026-10-12T07:00:00Z'): ReviewEvent => ({ eventId, wordId, senseId: `${wordId}:core`, deviceId: 'device', kind: 'EXPOSURE', rating: 1, usedHint: false, occurredAt });
const state = (wordId: string, dueAt: string, lapses = 0): ReviewState => ({ wordId, senseId: `${wordId}:core`, repetitions: 1, lapses, intervalDays: 1, dueAt, lastReviewedAt: '2026-10-10T08:00:00Z', status: 'REVIEW' });

describe('learning target coverage', () => {
  it('rotates through words instead of repeating the first batch before recalls begin', () => {
    const first = selectLearningTargets(input({ newLimit: 2 })).newWords.map(item => item.id);
    expect(first).toEqual(['alpha', 'bravo']);
    const secondInput = input({ newLimit: 2, articles: [article('one', first)] });
    const second = selectLearningTargets(secondInput).newWords.map(item => item.id);
    expect(second).toEqual(['charlie', 'delta']);
    const thirdInput = input({ newLimit: 2, articles: [...secondInput.articles, article('two', second)] });
    const third = selectLearningTargets(thirdInput).newWords.map(item => item.id);
    expect(third).toEqual(['echo', 'foxtrot']);
    const nextRound = selectLearningTargets(input({ newLimit: 2, articles: [...thirdInput.articles, article('three', third)] })).newWords.map(item => item.id);
    expect(nextRound).toEqual(['alpha', 'bravo']);
  });

  it('filters other books before taking due slots and orders overdue words by date', () => {
    const reviewStates = [state('outside-book', '2026-01-01T00:00:00Z'), state('alpha', '2026-10-12T07:00:00Z'), state('bravo', '2026-10-10T00:00:00Z'), state('charlie', '2026-10-11T00:00:00Z'), state('delta', '2026-10-12T06:00:00Z'), state('echo', '2026-10-13T00:00:00Z')];
    const plan = selectLearningTargets(input({ reviewStates }));
    expect(plan.dueWords.map(item => item.id)).toEqual(['bravo', 'charlie', 'delta']);
    expect(plan.newWords.map(item => item.id)).toEqual(['foxtrot']);
    expect(new Set(plan.targetWords.map(item => item.id)).size).toBe(plan.targetWords.length);
  });

  it('uses actual completed reading as a coverage tie breaker without counting repeated completion events twice', () => {
    const articles = [article('sample', ['alpha'], 'SAMPLE'), article('unread', ['bravo'], 'SAMPLE')];
    const plan = selectLearningTargets(input({ articles, readingEvents: [reading('sample', 'one'), reading('sample', 'two')], newLimit: 1 }));
    expect(plan.newWords[0].id).toBe('bravo');
    expect(selectLearningTargets(input({ articles, newLimit: 1 })).newWords[0].id).toBe('alpha');
  });

  it('does not count lookup exposure as a successful recall or create a review schedule', () => {
    const events = [exposure('alpha', 'lookup')];
    expect(calculateStates(events)).toEqual([]);
    const plan = selectLearningTargets(input({ events, newLimit: 1 }));
    expect(plan.newWords[0].id).toBe('bravo');
    expect(plan.dueWords).toEqual([]);
  });

  it('counts one article once and avoids duplicate target words', () => {
    const saved = article('same-id', ['alpha', 'alpha']);
    const plan = selectLearningTargets(input({ articles: [saved, saved], newLimit: 6 }));
    expect(plan.newWords.at(-1)?.id).toBe('alpha');
    expect(new Set(plan.targetWords.map(item => item.id)).size).toBe(plan.targetWords.length);
  });

  it('keeps words without local definitions eligible for eventual book coverage', () => {
    const incomplete = { ...word('undefined-word'), meaning: '' };
    const plan = selectLearningTargets(input({ words: [word('defined-word'), incomplete], articles: [article('already-covered', ['defined-word'])], newLimit: 1 }));
    expect(plan.newWords[0].id).toBe('undefined-word');
  });
});

describe('pasted article targets', () => {
  it('caps markers at 30 while preserving the complete original article text', () => {
    const manyWords = Array.from({ length: 45 }, (_, index) => word(`vocabulary${index}`));
    const body = manyWords.map(item => item.lemma).join(' ') + '\nKeep the entire original text.';
    const request = { ...input({ words: manyWords }), body };
    expect(selectMatchedArticleTargets(request).length).toBe(30);
    expect(selectMatchedArticleTargets({ ...request, maxTargets: 100 }).length).toBe(30);
    expect(request.body).toBe(body);
    expect(request.words).toHaveLength(45);
  });

  it('marks whole-word matches, not a word hidden inside another word', () => {
    const matching = selectMatchedArticleTargets({ ...input({ words: [word('retain'), word('rain'), word('cat'), word('catalog')] }), body: 'Retain a catalog.' });
    expect(matching.map(item => item.id)).toEqual(['retain', 'catalog']);
  });
});
