import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Lightbulb, LoaderCircle, Sparkles, Volume2, X } from 'lucide-react';
import { useLearningStore } from '../lib/store';
import { speakWord } from '../lib/native';
import type { AiScene, Article, Explanation, Word } from '../lib/types';
import { Notice, parseResult } from './ui';

export function WordDrawer({word,article,onClose,onReview}:{word:Word;article?:Article;onClose:()=>void;onReview:()=>void}) {
  const {requestAi,aiTasks,quota,online} = useLearningStore();
  const [scene,setScene] = useState<AiScene>('EXPLAIN');
  const [taskId,setTaskId] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const drawer=useRef<HTMLElement>(null);
  const cachedTask=[...aiTasks].filter(item=>item.wordId===word.id&&(!item.senseId||item.senseId===word.senseId||item.senseId===`${word.id}:core`)&&item.status==='SUCCEEDED'&&(item.scene==='EXPLAIN'||item.scene==='MEMORY')).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0];
  const task=aiTasks.find(item=>item.id===taskId)||cachedTask;
  const explanation=parseResult<Explanation>(task);
  const context=article?.body.split(/(?<=[.!?])\s+/).find(sentence=>sentence.toLowerCase().includes(word.lemma.toLowerCase())) || word.example;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement | null;
    drawer.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape')onClose();
      if(event.key==='Tab' && drawer.current){ const elements=Array.from(drawer.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea'));const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown',key);const scroll=document.body.style.overflow;document.body.style.overflow='hidden';
    return ()=>{document.removeEventListener('keydown',key);document.body.style.overflow=scroll;previous?.focus();};
  },[word.id]);
  async function generate(next:AiScene){setScene(next);setError('');setBusy(true);try{const result=await requestAi({scene:next,wordId:word.id,senseId:word.senseId,context,difficulty:'请先用简明中文讲清本文义项，再给出一个不同语境的例句。'});setTaskId(result.id);}catch(e){setError(e instanceof Error?e.message:'请求未完成，请重试');}finally{setBusy(false);}}
  return <><div className="drawer-overlay" onClick={onClose}/><aside className="word-drawer" ref={drawer} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="word-title">
    <div className="drawer-top"><span>先理解，再记住 · 单词手册</span><button className="icon-button" onClick={onClose} aria-label="关闭单词讲解"><X size={18}/></button></div>
    <div className="word-heading"><h2 id="word-title">{word.lemma}</h2><button className="icon-button" aria-label={`朗读 ${word.lemma}`} onClick={()=>void speakWord(word.lemma).catch(e=>setError(e instanceof Error?e.message:'当前设备没有可用英语朗读'))}><Volume2 size={19}/></button></div>
    <div className="drawer-phonetic">{word.phonetic || '点击扬声器听发音'}</div>
    <p className="definition"><small>{word.partOfSpeech}</small>{word.meaning || explanation?.meaning || '本地词库暂未收录释义，可请求 AI 结合原句讲解。'}</p>
    {(word.definitionStatus==='reverse-gloss-draft'||word.definitionStatus==='editorial-draft')&&<p className="source-note" style={{marginTop:-15,marginBottom:19}}>基础释义待校对，结合原句确认。{word.definitionSource&&`资料依据：${word.definitionSource}。`}</p>}
    <section className="drawer-section"><h3><BookOpen size={14}/>在语境中理解</h3>{context?<div className="example">{context}<small>{context===word.example?word.exampleTranslation:'来自当前文章，解释时优先结合这句话。'}</small></div>:<p className="muted-copy">这个词暂未收录例句，可通过 AI 补充。</p>}</section>
    <section className="ai-help"><h3><Sparkles size={15}/>这个词，哪里让你卡住了？</h3><p>选择一种困难，获取针对讲解。结果保存后再次打开不扣额度。</p><div className="help-options">{([{scene:'EXPLAIN',label:'还是不懂'},{scene:'MEMORY',label:'帮我记住'}] as const).map(item=><button key={item.scene} className={taskId&&scene===item.scene?'selected':''} disabled={busy||!online} onClick={()=>void generate(item.scene)}>{item.label} · {quota?.sceneCosts[item.scene]??'—'} 额度</button>)}</div><small className="ai-help-note">AI 联想用于辅助记忆，不作为真实词源。新的请求会消耗额度。</small></section>
    {error&&<div style={{marginTop:16}}><Notice kind="error">{error}</Notice></div>}
    {!online&&<div style={{marginTop:16}}><Notice kind="warning">当前离线，本地释义和已保存内容仍可使用，动态讲解需要联网。</Notice></div>}
    {task&&(task.status==='RUNNING'||task.status==='QUEUED')&&<div className="ai-output"><LoaderCircle size={14} className="spin"/> 正在为这个词准备讲解。可以关闭页面，结果将保存在 AI 记录中。</div>}
    {task?.status==='FAILED'&&<div style={{marginTop:16}}><Notice kind="error">{task.error || '生成未成功，预占额度将释放。'}</Notice></div>}
    {explanation&&<section className="drawer-section"><h3><Lightbulb size={14}/>AI 辅助讲解{!taskId&&<span className="pill grey">已保存 · 本次不扣额度</span>}</h3><div className="ai-output"><strong>{explanation.meaning}</strong><p>{explanation.explanation}</p>{explanation.collocations?.length>0&&<div className="collocations">{explanation.collocations.map((item,index)=><span key={index}>{item}</span>)}</div>}{explanation.memoryTip&&<p><b>记忆联想：</b>{explanation.memoryTip}</p>}{explanation.example&&<div className="example">{explanation.example}<small>{explanation.exampleTranslation}</small></div>}<small>{explanation.sourceNote || 'AI 生成内容，可与原文和词典交叉核对；记忆联想不是历史词源。'}</small></div></section>}
    {(word.definitionSourceUrl||word.sourceUrl)&&<p className="source-note">释义来源：<a href={word.definitionSourceUrl||word.sourceUrl} target="_blank" rel="noreferrer">查看出处</a>{(word.definitionLicense||word.license)&&` · ${word.definitionLicense||word.license}`}</p>}
    <button className="button drawer-action" onClick={onReview}><Check size={15}/>隐藏解释，试着回忆</button>
  </aside></>;
}
