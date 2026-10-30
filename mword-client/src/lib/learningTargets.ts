import type { Article, ReadingEvent, ReviewEvent, ReviewState, Word } from './types';

export interface LearningTargetInput {
  words: Word[];
  reviewStates: ReviewState[];
  articles: Article[];
  readingEvents: ReadingEvent[];
  events: ReviewEvent[];
  now?: number;
  dueLimit?: number;
  newLimit?: number;
}

interface Coverage {
  articleCount: number;
  completedReadCount: number;
  lookupCount: number;
  lastLookup: number;
}

function coverageFor(input: LearningTargetInput) {
  const coverage = new Map<string, Coverage>();
  const entry = (id: string) => {
    let current = coverage.get(id);
    if (!current) {
      current = { articleCount: 0, completedReadCount: 0, lookupCount: 0, lastLookup: 0 };
      coverage.set(id, current);
    }
    return current;
  };
  const completedArticles = new Set(input.readingEvents.filter(event => event.completed).map(event => event.articleId));
  // Count each saved article once. Generation or reading is coverage, never mastery.
  const articles = new Map(input.articles.map(article => [article.id, article]));
  for (const article of articles.values()) {
    for (const wordId of new Set(article.targetWordIds)) {
      const current = entry(wordId);
      if (article.source === 'AI') current.articleCount++;
      if (completedArticles.has(article.id)) current.completedReadCount++;
    }
  }
  for (const event of new Map(input.events.map(event => [event.eventId, event])).values()) {
    if (event.kind !== 'EXPOSURE') continue;
    const current = entry(event.wordId);
    current.lookupCount++;
    current.lastLookup = Math.max(current.lastLookup, Date.parse(event.occurredAt) || 0);
  }
  return coverage;
}

function rankByCoverage(input: LearningTargetInput) {
  const coverage = coverageFor(input);
  const zero: Coverage = { articleCount: 0, completedReadCount: 0, lookupCount: 0, lastLookup: 0 };
  return input.words.map((word, index) => ({ word, index })).sort((a, b) => {
    const first = coverage.get(a.word.id) || zero;
    const second = coverage.get(b.word.id) || zero;
    return first.articleCount - second.articleCount
      || first.completedReadCount - second.completedReadCount
      || first.lookupCount - second.lookupCount
      || first.lastLookup - second.lastLookup
      || a.index - b.index;
  }).map(item => item.word);
}

export function selectLearningTargets(input: LearningTargetInput) {
  const now = input.now ?? Date.now();
  const wordMap = new Map(input.words.map(word => [word.id, word]));
  const scheduled = new Set(input.reviewStates.map(state => state.wordId));
  const seenDue = new Set<string>();
  const dueWords = [...input.reviewStates]
    .filter(state => wordMap.has(state.wordId) && Date.parse(state.dueAt) <= now)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || b.lapses - a.lapses || a.wordId.localeCompare(b.wordId))
    .filter(state => {
      if (seenDue.has(state.wordId)) return false;
      seenDue.add(state.wordId);
      return true;
    })
    .slice(0, input.dueLimit ?? 3)
    .map(state => wordMap.get(state.wordId)!);
  const newWords = rankByCoverage(input)
    .filter(word => !scheduled.has(word.id))
    .slice(0, input.newLimit ?? 5);
  return { dueWords, newWords, targetWords: [...dueWords, ...newWords] };
}

export function selectMatchedArticleTargets(input: LearningTargetInput & { body: string; maxTargets?: number }) {
  const matched = input.words.filter(word => {
    const escaped = word.lemma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i').test(input.body);
  });
  const limit = Math.max(0, Math.min(30, Math.floor(input.maxTargets ?? 30)));
  const narrowed = { ...input, words: matched, dueLimit: limit, newLimit: limit };
  const plan = selectLearningTargets(narrowed);
  const ordered = [...plan.dueWords, ...plan.newWords, ...rankByCoverage(narrowed)];
  const used = new Set<string>();
  return ordered.filter(word => {
    if (used.has(word.id)) return false;
    used.add(word.id);
    return true;
  }).slice(0, limit);
}
