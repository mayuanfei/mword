import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Brain, Check, Lightbulb, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
import { useLearningStore } from '../lib/store';
import { speakWord } from '../lib/native';
import type { ContextQuestion, Rating, Word } from '../lib/types';
import { Empty, Heading, Notice, parseResult } from '../components/ui';
import type { Explanation } from '../lib/types';

export function ReviewPage({focusWord,initialWordIds,onRead,onSettings}:{focusWord:Word | null;initialWordIds?:string[]|null;onRead:()=>void;onSettings:()=>void}) {
  const {words,reviewStates,recordEvent,aiTasks,requestAi,quota,online,profile} = useLearningStore();
  const [queue,setQueue] = useState<string[]>([]);
  const [index,setIndex] = useState(0);
  const [savedRecalls,setSavedRecalls] = useState(0);
  const [skipped,setSkipped] = useState(0);
  const [revealed,setRevealed] = useState(false);
  const [hint,setHint] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [taskId,setTaskId] = useState<string|null>(null);
  const [answer,setAnswer] = useState<number|null>(null);
  const [submitted,setSubmitted] = useState(false);
  const due=useMemo(()=>reviewStates.filter(state=>new Date(state.dueAt).getTime()<=Date.now()),[reviewStates]);
  const missingDue=due.filter(state=>!words.some(word=>word.id===state.wordId));
  const batchKey=JSON.stringify(initialWordIds||[]);
  useEffect(()=>{ const currentWords=new Set(words.map(word=>word.id));const ids=focusWord?[focusWord.id]:initialWordIds?.length?initialWordIds:due.map(state=>state.wordId);setQueue([...new Set(ids)].filter(id=>currentWords.has(id)));setIndex(0);setSavedRecalls(0);setSkipped(0);setRevealed(false);setHint(false);setTaskId(null);setSubmitted(false);setAnswer(null); },[focusWord?.id,batchKey,profile.bookId,words.length]);
  const word=words.find(item=>item.id===queue[index]);
  const savedExplanation=parseResult<Explanation>([...aiTasks].filter(item=>item.wordId===word?.id&&item.status==='SUCCEEDED'&&(item.scene==='EXPLAIN'||item.scene==='MEMORY')).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0]);
  const meaning=word?.meaning||savedExplanation?.meaning;
  const task=aiTasks.find(item=>item.id===taskId);
  const question=parseResult<ContextQuestion>(task);
  async function rate(rating:Rating){if(!word)return;setBusy(true);setError('');try{await recordEvent({wordId:word.id,senseId:word.senseId,kind:'RECALL',rating,usedHint:hint});setSavedRecalls(value=>value+1);setIndex(value=>value+1);setRevealed(false);setHint(false);setTaskId(null);setAnswer(null);setSubmitted(false);}catch(e){setError(e instanceof Error?e.message:'学习记录未保存，请重试');}finally{setBusy(false);}}
  function skip(){setSkipped(value=>value+1);setIndex(value=>value+1);setRevealed(false);setHint(false);setTaskId(null);setAnswer(null);setSubmitted(false);setError('');}
  async function createQuestion(){if(!word)return;setError('');setBusy(true);try{const newTask=await requestAi({scene:'CONTEXT',wordId:word.id,senseId:word.senseId,context:word.example});setTaskId(newTask.id);setAnswer(null);setSubmitted(false);}catch(e){setError(e instanceof Error?e.message:'练习生成未成功');}finally{setBusy(false);}}
  async function checkQuestion(){if(!word||!question||answer===null)return;setBusy(true);setError('');try{await recordEvent({wordId:word.id,senseId:word.senseId,kind:'CONTEXT',rating:answer===question.answer?3:1,usedHint:false});setSubmitted(true);}catch(e){setError(e instanceof Error?e.message:'练习记录未保存');}finally{setBusy(false);}}
  return <><Heading eyebrow="RECALL, THEN REMEMBER" title="让记忆更牢一点" description="先自己想一想，再揭示答案。隔天还能想起，才是更可靠的进步。"/>
    {error&&<Notice kind="error" onDismiss={()=>setError('')}>{error}</Notice>}
    {missingDue.length>0&&<Notice kind="warning">还有 {missingDue.length} 个到期词来自其他词书。<button className="text-button" onClick={onSettings}>切换对应词书</button>后继续复习；这些记录仍然保留。</Notice>}
    {!word?<Empty title={queue.length?'本轮练习已结束':'暂时没有到期复习'} description={queue.length?`已保存 ${savedRecalls} 个词的回忆，跳过 ${skipped} 个词。跳过不计入回忆记录；已保存的学习记录将在联网后同步。`:'先读一篇文章，选择需要学习的词。完成一次回忆后，系统会安排下一次复习。'} action={<button className="button" onClick={onRead}>去读一篇文章<ArrowRight size={15}/></button>}/>:<div className="review-layout">
      <div className="review-header"><span>{initialWordIds?.length?'本篇单词学习':'本次回忆'} · {index+1} / {queue.length}</span><span><RotateCcw size={11} style={{verticalAlign:'middle',marginRight:5}}/>每次回忆都算一次学习</span></div>
      <div className="bar" style={{marginBottom:20}}><div className="bar-fill" style={{width:`${(index/queue.length)*100}%`}}/></div>
      <section className="card recall-card"><span className="pill"><Brain size={12}/>主动回忆</span><h2>{word.lemma}</h2><div className="phonetic">{word.phonetic}<button className="icon-button" aria-label={`朗读 ${word.lemma}`} onClick={()=>void speakWord(word.lemma).catch(e=>setError(e instanceof Error?e.message:'朗读暂不可用'))}><Volume2 size={16}/></button></div>
        {!revealed?<><p className="recall-cue">这个词是什么意思？<br/>先在心里回答，再看看是否想对了。</p><button className="button" style={{marginTop:25}} onClick={()=>setRevealed(true)}>揭示答案<ArrowRight size={14}/></button>{word.example&&<div style={{marginTop:18}}><button className="text-button" onClick={()=>setHint(true)}><Lightbulb size={12}/>需要一句提示</button>{hint&&<div className="answer-panel"><p>{word.example}</p><small>本次已使用提示，记录中会保留。</small></div>}</div>}</>:<><div className="answer-panel"><h3>{word.partOfSpeech&&`${word.partOfSpeech} `}{meaning || '本地词库暂未收录释义。建议先获取可靠讲解，再进行自评。'}</h3>{word.example&&<><p>{word.example}</p><small>{word.exampleTranslation}</small></>}{word.memoryAssets&&<div style={{marginTop:10,padding:'8px 12px',background:'#f5f8ef',borderRadius:8,fontSize:12,color:'#4d6837'}}>{word.memoryAssets.mnemonics&&<p style={{margin:'0 0 4px 0'}}><b>💡 巧记：</b>{word.memoryAssets.mnemonics}</p>}{word.memoryAssets.roots&&<p style={{margin:0}}><b>🌿 词根：</b>{word.memoryAssets.roots}</p>}</div>}{!word.meaning&&savedExplanation?.meaning&&<small>答案来自已保存的 AI 辅助讲解，仍可与词典核对。</small>}</div><p className="recall-cue">在揭示之前，你想起来了吗？按真实感受选择。</p><div className="rating-buttons">{([{label:'忘记了',rating:1},{label:'费力想起',rating:2},{label:'正常想起',rating:3},{label:'轻松想起',rating:4}] as const).map(item=><button key={item.rating} disabled={busy || !meaning} onClick={()=>void rate(item.rating)}>{item.label}</button>)}</div>{!meaning&&<p className="review-explanation">这个词缺少释义，暂不能确认自评。可返回阅读获取讲解，或跳过这个词。<button className="text-button" style={{marginLeft:8}} disabled={busy} onClick={skip}>暂时跳过</button></p>}</>}
      </section>
      <p className="review-explanation">只看到了答案不算成功回忆。自评与新语境练习分别记录，系统根据回忆结果安排复习。</p>
      <section className="card question-card" style={{marginTop:22}}><span className="pill orange"><Sparkles size={12}/>换个句子，检验理解</span><h2>到了新语境，还能读懂吗？</h2><p className="muted-copy">生成一个没练过的句子，不依赖刚才的原句。</p>
        {!task?<button className="button secondary" style={{marginTop:19}} disabled={busy||!online} onClick={()=>void createQuestion()}>生成新句练习 · {quota?.sceneCosts.CONTEXT??'—'} 额度</button>:task.status==='QUEUED'||task.status==='RUNNING'?<Notice>练习正在生成，结果将自动保存，可稍后在“我的”中查看。</Notice>:task.status==='FAILED'?<><Notice kind="error">{task.error||'生成失败，预占额度将释放。'}</Notice><button className="button secondary" disabled={busy||!online} onClick={()=>void createQuestion()}>重新生成 · {quota?.sceneCosts.CONTEXT??'—'} 额度</button></>:question?<><div className="question-sentence" style={{marginTop:20}}>{question.sentence}</div><div className="question-options">{question.options.map((option,optionIndex)=><button key={optionIndex} className={answer===optionIndex?'selected':''} disabled={submitted} onClick={()=>setAnswer(optionIndex)}>{String.fromCharCode(65+optionIndex)}. {option}</button>)}</div>{!submitted?<button className="button" style={{marginTop:18}} disabled={answer===null||busy} onClick={()=>void checkQuestion()}>确认答案<Check size={14}/></button>:<div className={`question-result ${answer===question.answer?'':'wrong'}`}><b>{answer===question.answer?'理解正确':'再看一看这个用法'}</b><p>{question.explanation}</p><p>正确答案：{question.options[question.answer]}</p></div>}</>:<Notice kind="warning">生成结果无法读取。可在“我的”查看原始任务结果，再尝试重新生成。</Notice>}
      </section>
    </div>}
  </>;
}
