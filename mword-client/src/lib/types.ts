export type AiScene = 'EXPLAIN' | 'MEMORY' | 'CONTEXT' | 'ARTICLE';
export type Rating = 1 | 2 | 3 | 4;
export interface Profile { bookId: string; goal: string; interests: string[]; dailyMinutes: number; level: string; onboardingCompleted: boolean }
export interface User { id: string; username: string; role: 'USER' | 'ADMIN'; profile: Profile }
export interface AuthResponse { token: string; user: User; expiresAt: string }
export interface Book { id: string; name: string; description: string; version: string; sourceUrl: string; license: string; wordCount: number; attribution?: string[]; licenseUrl?: string }
export interface MemoryAssets { roots?: string; etymology?: string; mnemonics?: string; story?: string; collocations?: string[] }
export interface ExampleSource { name: string; url: string; translationUrl: string; attribution: string; license: string; licenseUrl: string; changes: string; status: string }
export interface Word { id: string; lemma: string; meaning: string; phonetic?: string; partOfSpeech?: string; example?: string; exampleTranslation?: string; exampleSource?: ExampleSource; usageNote?: string; senseId?: string; sourceUrl?: string; license?: string; definitionStatus?: string; definitionSource?: string; definitionSourceUrl?: string; definitionLicense?: string; memoryAssets?: MemoryAssets }
export interface StudySession { id: string; bookId: string; queue: string[]; index: number; completedCount: number; repeatedCount: number; skippedCount: number; hintUsed: boolean; questionTaskId?: string | null; questionAnswer?: number | null; questionSubmitted?: boolean; translationHintUsed?: boolean; updatedAt: string }
export interface SessionPosition { id: string; index: number }
export interface Article { id: string; title: string; body: string; source: 'SAMPLE' | 'USER' | 'AI'; targetWordIds: string[]; createdAt: string }
export interface ReviewEvent { eventId: string; deviceId: string; wordId: string; senseId: string; occurredAt: string; kind: 'RECALL' | 'CONTEXT' | 'EXPOSURE'; rating: Rating; usedHint: boolean }
export type StudyEvent = ReviewEvent;
export interface ReadingEvent { eventId: string; deviceId: string; articleId: string; position: number; completed: boolean; occurredAt: string }
export interface ReviewState { wordId: string; senseId: string; repetitions: number; lapses: number; intervalDays: number; dueAt: string; lastReviewedAt: string | null; status: 'NEW' | 'LEARNING' | 'REVIEW' }
export interface Usage { id: string; scene: AiScene; cost: number; status: string; createdAt: string }
export interface Quota { available: number; reserved: number; sceneCosts: Record<AiScene, number>; usage: Usage[] }
export interface AiTask { id: string; requestId: string; scene: AiScene; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'; cost: number; result: string | null; error: string | null; createdAt: string; updatedAt: string; articleId?: string | null; wordId?: string | null; senseId?: string | null }
export interface AiRequest { scene: AiScene; wordId?: string; senseId?: string; context?: string; difficulty?: string; targetWordIds?: string[]; session?: SessionPosition }
export interface Explanation { meaning: string; explanation: string; collocations: string[]; memoryTip: string; example: string; exampleTranslation: string; sourceNote?: string }
export interface ContextQuestion { sentence: string; sentenceTranslation?: string; options: string[]; answer: number; explanation: string }
export interface SyncResponse { cursor: number; acceptedEventIds: string[]; acceptedReadingEventIds?: string[]; events: ReviewEvent[]; readingEvents: ReadingEvent[]; states: ReviewState[]; profile: Profile; articles: Article[]; serverTime: string; schedulerVersion: string }
export interface Provider { id: string; name: string; baseUrl: string; model: string; enabled: boolean; hasKey: boolean; updatedAt: string; scenes: AiScene[]; priority: number }
export interface ProviderInput { name: string; baseUrl: string; model: string; apiKey?: string; enabled: boolean; scenes?: AiScene[]; priority?: number }
export interface AdminUser { id: string; username: string; role: string; available: number; reserved: number; createdAt: string }
export interface AdminUsage { id: string; userId: string; username: string; scene: AiScene; cost: number; status: string; inputTokens: number | null; outputTokens: number | null; durationMs: number | null; createdAt: string }
export interface AdminTask { id: string; userId: string; requestId: string; scene: AiScene; status: string; cost: number; error: string | null; createdAt: string; updatedAt: string }
export interface AdminData { providers: Provider[]; users: AdminUser[]; usage?: AdminUsage[]; tasks?: AdminTask[] }
export interface SyncStatus { pending: number; lastSyncAt: string | null; status: 'idle' | 'syncing' | 'error'; error: string | null }
export const DEFAULT_PROFILE: Profile = { bookId: 'cet4', goal: '读懂感兴趣的英文文章', interests: [], dailyMinutes: 20, level: '基础', onboardingCompleted: false };
export const SCENE_NAMES: Record<AiScene, string> = { EXPLAIN: '难词讲解', MEMORY: '记忆辅助', CONTEXT: '新句练习', ARTICLE: '兴趣文章' };
