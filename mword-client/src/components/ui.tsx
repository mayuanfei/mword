import { AlertCircle, ArrowRight, BookOpen, Check, Clock3, LoaderCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AiTask, Explanation, ContextQuestion } from '../lib/types';
import { SCENE_NAMES } from '../lib/types';

export function Brand() { return <div className="brand"><span className="brand-mark"><BookOpen size={21}/></span><div>mword<small>把词读懂，把词记住</small></div></div>; }
export function Heading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) { return <header className="page-heading"><div><div className="eyebrow">{eyebrow || 'YOUR LEARNING JOURNEY'}</div><h1>{title}</h1><p>{description}</p></div>{action || <span className="date-pill">{new Date().toLocaleDateString('zh-CN', {month:'long',day:'numeric',weekday:'long'})}</span>}</header>; }
export function Notice({ children, kind = '', onDismiss }: { children: ReactNode; kind?: 'warning' | 'error' | ''; onDismiss?: () => void }) { return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><AlertCircle size={16}/><div>{children}</div>{onDismiss && <button className="text-button" onClick={onDismiss}>关闭</button>}</div>; }
export function Metric({ label, value, unit, detail, icon }: {label:string;value:number|string;unit?:string;detail:string;icon?:ReactNode}) { return <div className="card metric"><div className="metric-label">{icon}{label}</div><div className="metric-value">{value}<span>{unit}</span></div><div className="metric-foot">{detail}</div></div>; }
export function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="card empty-state"><div className="empty-icon"><BookOpen size={27}/></div><h2>{title}</h2><p>{description}</p>{action}</div>; }
export const formatTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '尚未同步';
export function parseResult<T>(task?: AiTask): T | null {
  if (!task?.result) return null;
  try {
    const value=JSON.parse(task.result);
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    if(task.scene==='CONTEXT'&&(!Array.isArray(value.options)||!value.options.every((option:unknown)=>typeof option==='string')||typeof value.sentence!=='string'||!Number.isInteger(value.answer)||value.answer<0||value.answer>=value.options.length||typeof value.explanation!=='string'))return null;
    if((task.scene==='EXPLAIN'||task.scene==='MEMORY')&&(typeof value.meaning!=='string'||typeof value.explanation!=='string'))return null;
    if(task.scene==='ARTICLE'&&(typeof value.title!=='string'||typeof value.body!=='string'))return null;
    return value as T;
  } catch { return null; }
}
export function TaskCard({ task, onOpenArticle, onOpenQuestion }: { task: AiTask; onOpenArticle?: (id:string)=>void; onOpenQuestion?: (task:AiTask)=>void }) {
  const result = parseResult<Explanation | ContextQuestion | {title:string;body:string}>(task);
  const completed = task.status === 'SUCCEEDED';
  return <div className="task-card"><header><span className="pill"><Sparkles size={11}/>{SCENE_NAMES[task.scene]}</span><span className={`task-state ${task.status.toLowerCase()}`}>{task.status==='QUEUED'?'等待生成':task.status==='RUNNING'?'正在生成':completed?'已保存':'生成失败'}</span></header>
    <small>{formatTime(task.createdAt)} · {completed?`已消耗 ${task.cost} 额度`:task.status==='FAILED'?'未扣除额度':`预占 ${task.cost} 额度`}</small>
    {task.error && <p className="task-error">{task.error}</p>}
    {!completed && task.status!=='FAILED' && <p className="task-pending"><LoaderCircle size={12} className="spin"/>生成后会保存，可稍后回来查看。</p>}
    {completed && result && 'explanation' in result && <p>{result.explanation}</p>}
    {completed && result && 'title' in result && <p>{result.title}</p>}
    {completed && result && 'sentence' in result && <p>{result.sentence}</p>}
    {completed && !result && task.result && <p>{task.result}</p>}
    {completed && result && 'explanation' in result && 'meaning' in result && <details className="task-result"><summary>查看完整讲解</summary><p><b>{result.meaning}</b></p>{result.collocations?.length>0&&<div className="collocations">{result.collocations.map((item,index)=><span key={index}>{item}</span>)}</div>}{result.memoryTip&&<p>记忆联想：{result.memoryTip}</p>}{result.example&&<p>{result.example}<br/>{result.exampleTranslation}</p>}<p>{result.sourceNote||'AI 辅助内容，记忆联想不是历史词源。'}</p></details>}
    {completed && result && 'sentence' in result && <details className="task-result"><summary>查看已保存的练习内容</summary><p>{result.sentence}</p>{'sentenceTranslation' in result && result.sentenceTranslation && <p style={{color:'#526645'}}><b>整句释义：</b>{result.sentenceTranslation}</p>}{result.options.map((option,index)=><p key={index}>{String.fromCharCode(65+index)}. {option}</p>)}<details><summary>查看答案与解释</summary><p>答案：{result.options[result.answer]}</p><p>{result.explanation}</p></details><p>这里查看答案不会计入成功练习。请在复习页作答，留下真实记录。</p></details>}
    {completed && result && 'sentence' in result && task.wordId && onOpenQuestion && <button className="text-button" onClick={()=>onOpenQuestion(task)}>去复习页作答<ArrowRight size={12}/></button>}
    {task.articleId && onOpenArticle && <button className="text-button" onClick={()=>onOpenArticle(task.articleId!)}>打开文章<ArrowRight size={12}/></button>}
  </div>;
}
export function ProgressRing({ value }: { value: number }) { const percentage=Math.max(0,Math.min(100,value)); return <div className="progress-ring"><svg width="80" height="80" aria-hidden="true"><circle cx="40" cy="40" r="33" stroke="#e7eddd" strokeWidth="6" fill="none"/><circle cx="40" cy="40" r="33" stroke="#93ad70" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${percentage*2.073} 207.3`} fill="none"/></svg><div className="ring-value">{Math.round(percentage)}<small>%</small></div></div>; }
export function Step({ done, label, detail }: {done:boolean;label:string;detail:string}) { return <div className={`plan-line ${done?'done':''}`}><span className="step-icon">{done?<Check size={12}/>:<Clock3 size={12}/>}</span>{label}<strong>{detail}</strong></div>; }
