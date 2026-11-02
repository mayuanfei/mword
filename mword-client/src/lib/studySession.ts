import type { Rating, SessionPosition, StudySession } from './types';

export class SessionPositionError extends Error {}

export function assertSessionPosition(session: StudySession | undefined, position: SessionPosition, wordId?: string): asserts session is StudySession {
  if (!session || session.id !== position.id || session.index !== position.index || session.index >= session.queue.length ||
    (wordId !== undefined && session.queue[session.index] !== wordId)) {
    throw new SessionPositionError('背词进度已变化，请在当前单词卡上继续。');
  }
}

export function advanceStudySession(session: StudySession, rating?: Rating): StudySession {
  const forgotten = rating === 1;
  const next: StudySession = { ...session, queue: forgotten ? [...session.queue, session.queue[session.index]] : session.queue,
    index: session.index + 1, completedCount: session.completedCount + (rating && !forgotten ? 1 : 0),
    repeatedCount: session.repeatedCount + (forgotten ? 1 : 0), skippedCount: session.skippedCount + (rating ? 0 : 1),
    hintUsed: false, updatedAt: new Date().toISOString() };
  delete next.questionTaskId; delete next.questionAnswer; delete next.questionSubmitted; delete next.translationHintUsed;
  return next;
}
