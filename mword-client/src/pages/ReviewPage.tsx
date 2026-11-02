import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Brain, Check, Flame, Languages, Lightbulb, RefreshCw, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
import { useLearningStore } from '../lib/store';
import { dailyNewWordGoal } from '../lib/dailyPlan';
import { speakWord } from '../lib/native';
import type { ContextQuestion, Rating, Word } from '../lib/types';
import { Heading, Notice, parseResult } from '../components/ui';
import { WordProvenance, ExampleAttribution } from '../components/WordProvenance';
import type { Explanation } from '../lib/types';

interface ReviewPageProps {
  now: number;
  onOpenWord: (word: Word) => void;
  onSettings: () => void;
  onHome?: () => void;
  onLearnMore?: () => void;
}

export function ReviewPage({ now, onOpenWord, onSettings, onHome, onLearnMore }: ReviewPageProps) {
  const { words, reviewStates, recordEvent, aiTasks, requestAi, quota, online, profile, studySessions, skipStudyWord, markStudyHint, saveStudyQuestion } = useLearningStore();
  const session = studySessions[profile.bookId];
  const queue = session?.queue || [];
  const index = session?.index || 0;
  const completedCount = session?.completedCount || 0;
  const repeatedCount = session?.repeatedCount || 0;
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState<string | null>(() => session?.questionTaskId ?? null);
  const [answer, setAnswer] = useState<number | null>(() => session?.questionAnswer ?? null);
  const [submitted, setSubmitted] = useState(() => !!session?.questionSubmitted);
  const [showHintTranslation, setShowHintTranslation] = useState(false);
  const [translationHintUsed, setTranslationHintUsed] = useState(() => !!session?.translationHintUsed);
  const translationHintUsedRef = useRef(!!session?.translationHintUsed);
  const actionInFlight = useRef(false);
  const recallReady = useRef(false);
  const sessionVersion = useRef(0);
  const questionSubmitted = useRef(!!session?.questionSubmitted);

  const due = useMemo(() => reviewStates.filter(state => Date.parse(state.dueAt) <= now), [reviewStates, now]);
  const currentWordIds = useMemo(() => new Set(words.map(word => word.id)), [words]);
  const missingDue = due.filter(state => !currentWordIds.has(state.wordId));
  const dailyBatchSize = dailyNewWordGoal(profile.dailyMinutes);

  function resetQuestion() {
    setTaskId(null);
    setSubmitted(false);
    questionSubmitted.current = false;
    setAnswer(null);
    setShowHintTranslation(false);
    setTranslationHintUsed(false);
    translationHintUsedRef.current = false;
  }

  function revealAnswer() {
    if (!word || busy || actionInFlight.current) return;
    recallReady.current = true;
    setRevealed(true);
  }

  useEffect(() => {
    sessionVersion.current++;
    setRevealed(false);
    recallReady.current = false;
    setHint(false);
    setError('');
    setTaskId(session?.questionTaskId ?? null);
    setSubmitted(!!session?.questionSubmitted);
    questionSubmitted.current = !!session?.questionSubmitted;
    setAnswer(session?.questionAnswer ?? null);
    setShowHintTranslation(false);
    setTranslationHintUsed(!!session?.translationHintUsed);
    translationHintUsedRef.current = !!session?.translationHintUsed;
    window.scrollTo({ top: 0, behavior: 'instant' });
    return () => { sessionVersion.current++; };
  }, [session?.id, index]);

  const word = words.find(item => item.id === queue[index]);
  const savedExplanation = parseResult<Explanation>([...aiTasks].filter(item => item.wordId === word?.id && item.status === 'SUCCEEDED' && (item.scene === 'EXPLAIN' || item.scene === 'MEMORY')).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]);
  const meaning = word?.meaning || savedExplanation?.meaning;
  const activeTaskId = taskId ?? session?.questionTaskId ?? null;
  const task = aiTasks.find(item => item.id === activeTaskId);
  const savedContextTask = [...aiTasks].filter(item => item.wordId === word?.id && item.scene === 'CONTEXT' && (item.status === 'SUCCEEDED' || item.status === 'RUNNING' || item.status === 'QUEUED')).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const question = parseResult<ContextQuestion>(task);

  // 快捷键支持：空格翻开答案，1/2/3/4 自评
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || busy || actionInFlight.current) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="dialog"]'))) return;
      if (event.key === ' ' || event.key === 'Enter') {
        if (target instanceof HTMLElement && target.closest('button, a')) return;
        if (!revealed && word) {
          event.preventDefault();
          revealAnswer();
        }
      } else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        const rating = Number(event.key) as Rating;
        void rate(rating);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [revealed, word, busy, meaning]);

  async function rate(rating: Rating) {
    if (!word || !session || !revealed || !recallReady.current || !meaning || busy || actionInFlight.current) return;
    actionInFlight.current = true;
    recallReady.current = false;
    const version = sessionVersion.current;
    setBusy(true);
    setError('');
    try {
      await recordEvent({ wordId: word.id, senseId: word.senseId, kind: 'RECALL', rating, usedHint: hint || session.hintUsed, session: { id: session.id, index } });
    } catch (e) {
      if (version === sessionVersion.current) {
        recallReady.current = true;
        setError(e instanceof Error ? e.message : '学习记录未保存，请重试');
      }
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  async function skip() {
    if (!session || busy || actionInFlight.current) return;
    const version = sessionVersion.current;
    actionInFlight.current = true; setBusy(true);
    try { await skipStudyWord({ id: session.id, index }); }
    catch (e) { if (version === sessionVersion.current) setError(e instanceof Error ? e.message : '跳过记录未保存'); }
    finally { actionInFlight.current = false; setBusy(false); }
  }

  async function showHint() {
    if (!session || busy || actionInFlight.current) return;
    const version = sessionVersion.current;
    actionInFlight.current = true; setBusy(true);
    try { await markStudyHint({ id: session.id, index }); if (version === sessionVersion.current) setHint(true); }
    catch (e) { if (version === sessionVersion.current) setError(e instanceof Error ? e.message : '提示记录未保存'); }
    finally { actionInFlight.current = false; setBusy(false); }
  }

  async function createQuestion() {
    if (!word || busy || actionInFlight.current) return;
    actionInFlight.current = true;
    const version = sessionVersion.current;
    const position = session ? { id: session.id, index } : undefined;
    setError('');
    setBusy(true);
    try {
      const newTask = await requestAi({ scene: 'CONTEXT', wordId: word.id, senseId: word.senseId, context: word.example, session: position });
      if (position) await saveStudyQuestion?.(position, { questionTaskId: newTask.id, questionAnswer: null, questionSubmitted: false, translationHintUsed: false });
      if (version !== sessionVersion.current) return;
      resetQuestion();
      setTaskId(newTask.id);
    } catch (e) {
      if (version === sessionVersion.current) setError(e instanceof Error ? e.message : '练习生成未成功');
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  async function checkQuestion() {
    if (!word || !session || !question || answer === null || submitted || questionSubmitted.current || busy || actionInFlight.current) return;
    actionInFlight.current = true;
    questionSubmitted.current = true;
    const version = sessionVersion.current;
    setBusy(true);
    setError('');
    try {
      await recordEvent({ wordId: word.id, senseId: word.senseId, kind: 'CONTEXT', rating: answer === question.answer ? 3 : 1, usedHint: translationHintUsedRef.current, session: { id: session.id, index } });
      if (version === sessionVersion.current) setSubmitted(true);
    } catch (e) {
      if (version === sessionVersion.current) {
        questionSubmitted.current = false;
        setError(e instanceof Error ? e.message : '练习记录未保存');
      }
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button className="text-button review-back" onClick={onHome || onSettings}><ArrowLeft size={14} /> 返回今日</button>
      <Heading eyebrow="ACTIVE RECALL" title="背单词 · 主动回忆" description="先在大脑中回忆释义，再翻开卡片自评。对抗遗忘，记牢每一个词。" />
      {error && <Notice kind="error" onDismiss={() => setError('')}>{error}</Notice>}
      {missingDue.length > 0 && (
        <Notice kind="warning">
          还有 {missingDue.length} 个到期词来自其他词书。
          <button className="text-button" onClick={onSettings}>切换对应词书</button>后继续复习；这些记录仍然保留。
        </Notice>
      )}

      {!word && session && index < queue.length ? (
        <Notice kind="warning">当前词条尚未加载或已移出词书，请返回今日检查词库。<button className="text-button" disabled={busy} onClick={() => void skip()}>跳过此词并保留其余进度</button></Notice>
      ) : !word ? (
        <div className="card empty-state" style={{ padding: '48px 30px' }}>
          <div className="empty-icon" style={{ background: '#edf2e5', color: '#455b36' }}>
            <Check size={32} />
          </div>
          <h2 style={{ fontSize: 22, color: '#35472d', marginBottom: 10 }}>🎉 太棒了！本轮背词已全部完成</h2>
          <p style={{ maxWidth: 460, margin: '0 auto 24px', color: '#7a8870', fontSize: 13, lineHeight: 1.8 }}>
            {completedCount > 0
              ? `本次完成了 ${completedCount} 次回忆${repeatedCount > 0 ? `，进行了 ${repeatedCount} 次错词强化` : ''}${session?.skippedCount ? `，跳过 ${session.skippedCount} 词` : ''}。系统已根据艾宾浩斯遗忘曲线排期，明天记得再来复习！`
              : '当前词书暂时没有需要复习或学习的词。可以开启下一组新词，或在设置中切换词书。'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="button" onClick={onHome || onSettings}>
              <ArrowLeft size={14} /> 返回今日面板
            </button>
            {onLearnMore && (
              <button className="button secondary" onClick={onLearnMore}>
                <RefreshCw size={14} /> 再学一组新词 (+{dailyBatchSize} 词)
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="review-layout">
          <div className="review-header">
            <span>
              <b>背词进度</b> · {index + 1} / {queue.length}
            </span>
            <span>
              <RotateCcw size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} />
              快捷键：空格揭示 · 1/2/3/4 评定
            </span>
          </div>

          <div className="bar" style={{ marginBottom: 20 }}>
            <div className="bar-fill" style={{ width: `${Math.min(100, (index / queue.length) * 100)}%` }} />
          </div>

          <section className="card recall-card">
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
              <span className="pill"><Brain size={12} /> 单词卡片</span>
              {index >= queue.length - repeatedCount && (
                <span className="pill orange"><Flame size={12} /> 当轮错词强化</span>
              )}
            </div>

            <h2>{word.lemma}</h2>

            <div className="phonetic">
              {word.phonetic}
              <button
                className="icon-button"
                aria-label={`朗读 ${word.lemma}`}
                onClick={() => void speakWord(word.lemma).catch(e => setError(e instanceof Error ? e.message : '朗读暂不可用'))}
              >
                <Volume2 size={16} />
              </button>
            </div>

            {!revealed ? (
              <>
                <p className="recall-cue">
                  这个词是什么意思？<br />
                  在大脑中快速提取记忆，再点击下方看释义。
                </p>
                <button className="button" style={{ marginTop: 25, minWidth: 160 }} disabled={busy} onClick={revealAnswer}>
                  看释义 / 揭示答案 <ArrowRight size={14} />
                </button>
                {word.example && (
                  <div style={{ marginTop: 18 }}>
                    <button className="text-button" disabled={busy} onClick={() => void showHint()}>
                      <Lightbulb size={12} /> {word.exampleSource ? '查看语料例句提示' : '查看例句提示'}
                    </button>
                    {hint && (
                      <div className="answer-panel">
                        <p>{word.example}</p>
                        <small>{word.exampleSource ? '语料例句可能采用其他义项。' : ''}本次已使用提示，记录中会保留。</small>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="answer-panel">
                  <h3>
                    {word.partOfSpeech && `${word.partOfSpeech} `}
                    {meaning || '本地词库暂未收录释义。建议先获取可靠讲解，再进行自评。'}
                  </h3>

                  <WordProvenance word={word} />
                  {word.example && (
                    <details className="recall-example">
                      <summary>{word.exampleSource ? '查看语料例句（义项待核对）' : '查看例句'}</summary>
                      <p style={{ margin: 0 }}>{word.example}</p>
                      <small style={{ marginTop: 4 }}>{word.exampleTranslation}</small>
                      <ExampleAttribution word={word} />
                    </details>
                  )}

                  {word.memoryAssets && (
                    <details className="recall-memory" key={word.id}><summary>展开助记与常用搭配</summary><p className="source-note">内置助记草稿，联想不作为真实词源依据。</p><div style={{ marginTop: 14, padding: '10px 14px', background: '#f5f8ef', borderRadius: 8, fontSize: 12, color: '#4d6837' }}>
                      {word.memoryAssets.mnemonics && (
                        <p style={{ margin: '0 0 6px 0' }}><b>💡 巧记：</b>{word.memoryAssets.mnemonics}</p>
                      )}
                      {word.memoryAssets.roots && (
                        <p style={{ margin: '0 0 6px 0' }}><b>🌿 词根：</b>{word.memoryAssets.roots}</p>
                      )}
                      {word.memoryAssets.collocations && word.memoryAssets.collocations.length > 0 && (
                        <p style={{ margin: 0 }}><b>🔗 搭配：</b>{word.memoryAssets.collocations.join(' · ')}</p>
                      )}
                    </div></details>
                  )}
                  <button className="text-button full-word-help" onClick={() => onOpenWord(word)}>查看完整讲解 / AI 答疑 <ArrowRight size={13} /></button>

                  {!word.meaning && savedExplanation?.meaning && (
                    <small>答案来自已保存的 AI 辅助讲解，仍可与词典核对。</small>
                  )}
                </div>

                <div className="recall-actions" aria-label="单词自评">
                <p className="recall-cue">在揭示之前，你想起来了吗？{session?.hintUsed ? '（本词已使用提示）' : ''}</p>
                <div className="rating-buttons">
                  {([
                    { label: '忘记了 (1)', rating: 1, tip: '本轮末尾重考' },
                    { label: '费力想起 (2)', rating: 2, tip: '短间隔复习' },
                    { label: '正常想起 (3)', rating: 3, tip: '正常间隔' },
                    { label: '轻松想起 (4)', rating: 4, tip: '牢固掌握' }
                  ] as const).map(item => (
                    <button
                      key={item.rating}
                      disabled={busy || !meaning}
                      onClick={() => void rate(item.rating)}
                      title={item.tip}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {!meaning && (
                  <p className="review-explanation">
                    这个词缺少释义，暂不能确认自评。<button className="text-button" style={{ marginLeft: 8 }} disabled={busy} onClick={() => void skip()}>暂时跳过</button>
                  </p>
                )}
                </div>
              </>
            )}
          </section>

          <p className="review-explanation">
            按真实掌握度评定：选“忘记了”的词会在当轮尾部自动重现强化，帮助快速形成牢固记忆。
          </p>

          <section className="card question-card" style={{ marginTop: 22 }}>
            <span className="pill orange"><Sparkles size={12} /> AI 检验 · 新语境练习</span>
            <h2>到了新句子里，还能认出它吗？</h2>
            <p className="muted-copy">为这个单词生成一个全新语境的理解选择题。</p>

            {!task ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 19 }}>
                <button
                  className="button secondary"
                  disabled={busy || !online}
                  onClick={() => void createQuestion()}
                >
                  生成新句练习 · {quota?.sceneCosts.CONTEXT ?? '—'} 额度
                </button>
                {savedContextTask && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      resetQuestion();
                      setTaskId(savedContextTask.id);
                      if (session) void saveStudyQuestion?.({ id: session.id, index }, { questionTaskId: savedContextTask.id, questionAnswer: null, questionSubmitted: false, translationHintUsed: false });
                    }}
                  >
                    继续已保存练习
                  </button>
                )}
              </div>
            ) : task.status === 'QUEUED' || task.status === 'RUNNING' ? (
              <Notice>练习正在生成，结果将自动保存，可稍后在“我的”中查看。</Notice>
            ) : task.status === 'FAILED' ? (
              <>
                <Notice kind="error">{task.error || '生成失败，预占额度将释放。'}</Notice>
                <button
                  className="button secondary"
                  disabled={busy || !online}
                  onClick={() => void createQuestion()}
                >
                  重新生成 · {quota?.sceneCosts.CONTEXT ?? '—'} 额度
                </button>
              </>
            ) : question ? (
              <>
                <div className="question-sentence" style={{ marginTop: 20 }}>{question.sentence}</div>
                {question.sentenceTranslation && !submitted && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      style={{ fontSize: 11, color: '#7a8d65' }}
                      onClick={() => {
                        translationHintUsedRef.current = true;
                        setTranslationHintUsed(true);
                        setShowHintTranslation(val => !val);
                        if (session) void saveStudyQuestion?.({ id: session.id, index }, { questionTaskId: activeTaskId, translationHintUsed: true });
                      }}
                    >
                      <Languages size={12} /> {showHintTranslation ? '收起整句中文释义' : '看不懂句子？查看整句翻译'}
                    </button>
                    {showHintTranslation && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#4d6837', background: '#f5f8ef', padding: '8px 12px', borderRadius: 8, lineHeight: 1.6 }}>
                        {question.sentenceTranslation}
                      </p>
                    )}
                  </div>
                )}
                <div className="question-options">
                  {question.options.map((option, optionIndex) => (
                    <button
                      key={optionIndex}
                      className={answer === optionIndex ? 'selected' : ''}
                      disabled={submitted || busy}
                      onClick={() => {
                        setAnswer(optionIndex);
                        if (session) void saveStudyQuestion?.({ id: session.id, index }, { questionTaskId: activeTaskId, questionAnswer: optionIndex });
                      }}
                    >
                      {String.fromCharCode(65 + optionIndex)}. {option}
                    </button>
                  ))}
                </div>
                {translationHintUsed && <small>本题已查看翻译，将按使用提示的练习记录。</small>}
                {!submitted ? (
                  <button
                    className="button"
                    style={{ marginTop: 18 }}
                    disabled={answer === null || busy}
                    onClick={() => void checkQuestion()}
                  >
                    确认答案 <Check size={14} />
                  </button>
                ) : (
                  <div className={`question-result ${answer === question.answer ? '' : 'wrong'}`}>
                    <b>{answer === question.answer ? '理解正确！' : '再看一看这个用法'}</b>
                    {question.sentenceTranslation && (
                      <p style={{ margin: '8px 0', fontSize: 13, color: '#3a502d', fontWeight: 550, lineHeight: 1.6 }}>
                        <b>整句释义：</b>{question.sentenceTranslation}
                      </p>
                    )}
                    <p>{question.explanation}</p>
                    <p>正确答案：{question.options[question.answer]}</p>
                  </div>
                )}
              </>
            ) : (
              <Notice kind="warning">生成结果无法读取。可在“我的”查看原始任务结果，再尝试重新生成。</Notice>
            )}
          </section>
        </div>
      )}
    </>
  );
}
