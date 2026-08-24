import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAcademyResumeSync } from '../../hooks/useAcademyResumeCheckpoint';

type Lesson = { id:string; title:string; content:string; sortOrder:number };
type Question = { id:string; prompt:string; options:string[]; section:string; caseKey:string; sortOrder:number };
type TrackProgress = { status?:string; lessonIndex?:number; preSurveyAnswers?:string[]; diagnosticAnswers?:string[]; score?:number|null; attempts?:number; completedAt?:string|null } | null;
type NicheTrack = {
  id:string; nicheName:string; slug:string; summary:string; passingScore:number; sortOrder:number; required:boolean;
  contentStatus?:'published'|'coming_soon'|'draft';
  preSurveyQuestions:string[]; diagnosticQuestions:string[]; lessons:Lesson[]; questions:Question[]; progress:TrackProgress;
};
type AssessmentResult = {
  score:number; passed:boolean; passingScore:number; criticalMisses:number; criticalPass:boolean; status:string;
  moduleComplete?:boolean; requiredPublished?:number; completedRequired?:number; moduleProgress?:number;
  feedback:Array<{questionId:string;correct:boolean;critical:boolean;explanation:string;section:string}>;
};
type Stage='overview'|'survey'|'lessons'|'diagnostic'|'assessment'|'result'|'complete';

const errMsg=(e:any,f:string)=>e?.message||f;

export default function NichePlaybooksView({moduleId}:{moduleId:string}) {
  const [tracks,setTracks]=useState<NicheTrack[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [stage,setStage]=useState<Stage>('overview');
  const [lessonIndex,setLessonIndex]=useState(0);
  const [survey,setSurvey]=useState<string[]>([]);
  const [diagnostic,setDiagnostic]=useState<string[]>([]);
  const [answers,setAnswers]=useState<Record<string,number>>({});
  const [qIndex,setQIndex]=useState(0);
  const [result,setResult]=useState<AssessmentResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const selected=useMemo(()=>tracks.find(t=>t.id===selectedId)||null,[tracks,selectedId]);

  const hydrate=(t:NicheTrack,keepResult=false)=>{
    setLessonIndex(Math.max(0,Math.min(Number(t.progress?.lessonIndex||0),Math.max(t.lessons.length-1,0))));
    setSurvey(Array.isArray(t.progress?.preSurveyAnswers)&&t.progress!.preSurveyAnswers!.length===t.preSurveyQuestions.length?t.progress!.preSurveyAnswers!:Array(t.preSurveyQuestions.length).fill(''));
    setDiagnostic(Array.isArray(t.progress?.diagnosticAnswers)&&t.progress!.diagnosticAnswers!.length===t.diagnosticQuestions.length?t.progress!.diagnosticAnswers!:Array(t.diagnosticQuestions.length).fill(''));
    if(!keepResult){setAnswers({});setQIndex(0);setResult(null);}
  };

  const load=async(preferred?:string,keepResult=false)=>{
    setLoading(true); setError('');
    try {
      const {data,error:e}=await supabase.rpc('get_niche_training_module',{p_module_id:moduleId});
      if(e) throw e;
      const next=(data?.tracks||[]) as NicheTrack[];
      setTracks(next);
      const id=preferred||selectedId||next[0]?.id||'';
      setSelectedId(id);
      const t=next.find(x=>x.id===id); if(t) hydrate(t,keepResult);
    } catch(e:any){ setError(errMsg(e,'Niche training could not be loaded.')); }
    finally { setLoading(false); }
  };

  useEffect(()=>{void load();},[moduleId]);

  useAcademyResumeSync(
    loading?null:moduleId,
    !loading&&!result,
    {selectedId,stage,lessonIndex,survey,diagnostic,answers,qIndex},
    checkpoint=>{
      if(!checkpoint)return;
      if(checkpoint.stage==='overview'){setStage('overview');return;}
      const t=tracks.find(x=>x.id===checkpoint.selectedId);
      if(!t||t.contentStatus!=='published')return;
      setSelectedId(t.id);
      hydrate(t);
      if(t.progress?.status==='Completed'){setStage('complete');return;}
      const surveyStored=Array.isArray(t.progress?.preSurveyAnswers)&&t.progress!.preSurveyAnswers!.length===t.preSurveyQuestions.length;
      if(!surveyStored){
        if(Array.isArray(checkpoint.survey)&&checkpoint.survey.length===t.preSurveyQuestions.length)setSurvey(checkpoint.survey);
        setStage('survey');return;
      }
      if((t.progress?.lessonIndex||0)<Math.max(t.lessons.length-1,0)){setStage('lessons');return;}
      const diagnosticStored=Array.isArray(t.progress?.diagnosticAnswers)&&t.progress!.diagnosticAnswers!.length===t.diagnosticQuestions.length;
      if(!diagnosticStored){
        if(Array.isArray(checkpoint.diagnostic)&&checkpoint.diagnostic.length===t.diagnosticQuestions.length)setDiagnostic(checkpoint.diagnostic);
        setStage('diagnostic');return;
      }
      setStage('assessment');
      if(checkpoint.answers&&typeof checkpoint.answers==='object')setAnswers(checkpoint.answers);
      const savedQ=Number(checkpoint.qIndex);if(Number.isInteger(savedQ))setQIndex(Math.max(0,Math.min(savedQ,Math.max(t.questions.length-1,0))));
    }
  );

  const openTrack=(t:NicheTrack)=>{
    setSelectedId(t.id); hydrate(t);
    if(t.contentStatus!=='published'){setStage('overview');return;}
    if(t.progress?.status==='Completed'){setStage('complete');return;}
    if(!t.progress?.preSurveyAnswers||t.progress.preSurveyAnswers.length!==t.preSurveyQuestions.length){setStage('survey');return;}
    if((t.progress?.lessonIndex||0)<Math.max(t.lessons.length-1,0)){setStage('lessons');return;}
    if(!t.progress?.diagnosticAnswers||t.progress.diagnosticAnswers.length!==t.diagnosticQuestions.length){setStage('diagnostic');return;}
    setStage('assessment');
  };

  const rpc=async(name:string,args:any)=>{
    setBusy(true);setError('');
    const r=await supabase.rpc(name,args);
    setBusy(false);
    if(r.error){setError(errMsg(r.error,'Could not save training progress.'));return null;}
    return r.data;
  };

  const saveSurvey=async()=>{
    if(!selected)return;
    if(survey.some(v=>!v.trim())){setError('Answer every baseline question before continuing.');return;}
    if(await rpc('save_niche_training_pre_survey',{p_track_id:selected.id,p_answers:survey.map(v=>v.trim())})!==null){
      await load(selected.id);setStage('lessons');
    }
  };

  const moveLesson=async(next:number)=>{
    if(!selected)return;
    const n=Math.max(0,Math.min(next,selected.lessons.length-1));
    if(await rpc('save_niche_training_step',{p_track_id:selected.id,p_lesson_index:n})!==null){
      setLessonIndex(n);
      if(next>=selected.lessons.length-1){await load(selected.id);setStage('diagnostic');}
    }
  };

  const saveDiagnostic=async()=>{
    if(!selected)return;
    if(diagnostic.some(v=>v.trim().length<30)){setError('Each diagnostic response should explain your reasoning in enough detail.');return;}
    if(await rpc('save_niche_training_diagnostic',{p_track_id:selected.id,p_answers:diagnostic.map(v=>v.trim())})!==null){
      await load(selected.id);setStage('assessment');
    }
  };

  const submit=async()=>{
    if(!selected)return;
    const ordered=selected.questions.map(q=>answers[q.id]);
    if(ordered.some(v=>v===undefined)){setError('Answer every certification question before submitting.');return;}
    const data=await rpc('submit_niche_training_assessment',{p_track_id:selected.id,p_answers:ordered});
    if(data){
      const submitted=data as AssessmentResult;
      await load(selected.id,true);
      setResult(submitted);
      setStage('result');
    }
  };

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-3xl border bg-white"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;

  const published=tracks.filter(t=>t.contentStatus==='published');
  const coming=tracks.filter(t=>t.contentStatus==='coming_soon');

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-[#000080] to-[#1f2aa5] p-6 text-white sm:p-8">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Module 4 · Niche Expert Academy</div>
        <h2 className="mt-2 text-2xl font-black sm:text-3xl">Learn the Industry Before You Sell Into It</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">Roofing and HVAC are the current required certifications. The remaining niche tracks are already reserved in the Academy and can be published later from Admin without rebuilding Module 4.</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6">
        <Metric value={`${published.length}`} label="Available now"/>
        <Metric value={`${published.filter(t=>t.progress?.status==='Completed').length}`} label="Certified"/>
        <Metric value={`${coming.length}`} label="Coming later"/>
      </div>
    </section>

    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

    {stage==='overview'&&<>
      <section>
        <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Available certifications</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {published.map((t,i)=><button key={t.id} onClick={()=>openTrack(t)} className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#000080]/40 hover:shadow-lg">
            <div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#000080]/10 text-xs font-black text-[#000080]">{i+1}</span><Status status={t.progress?.status||'Not Started'} /></div>
            <h3 className="mt-5 text-lg font-black">{t.nicheName}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{t.summary}</p>
            <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs font-black text-[#000080]"><span>{t.progress?.status==='Completed'?'Review certification':'Open expert training'}</span><ArrowRight className="h-4 w-4"/></div>
          </button>)}
        </div>
      </section>
      {coming.length>0&&<section>
        <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Planned niche library</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {coming.map(t=><div key={t.id} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-slate-500"><Clock3 className="h-4 w-4"/><span className="text-[10px] font-black uppercase tracking-wider">Coming later</span></div>
            <h3 className="mt-3 text-sm font-black text-slate-800">{t.nicheName}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t.summary}</p>
          </div>)}
        </div>
      </section>}
    </>}

    {selected&&stage!=='overview'&&<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-6 flex items-center justify-between border-b pb-5">
        <div className="flex items-start gap-3"><button onClick={()=>setStage('overview')} className="rounded-xl border p-2"><ArrowLeft className="h-4 w-4"/></button><div><div className="text-[10px] font-black uppercase tracking-wider text-[#000080]">{selected.nicheName}</div><h3 className="mt-1 text-xl font-black">{title(stage)}</h3></div></div>
        <Status status={selected.progress?.status||'In Progress'} score={selected.progress?.score??undefined}/>
      </div>

      {stage==='survey'&&<div className="space-y-4"><p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">Answer without researching. This is a baseline, not a pass/fail test. Your unfinished answers auto-save.</p>{selected.preSurveyQuestions.map((q,i)=><label key={i} className="block rounded-2xl border p-4"><span className="text-xs font-bold">{i+1}. {q}</span><textarea rows={2} value={survey[i]||''} onChange={e=>setSurvey(p=>p.map((v,x)=>x===i?e.target.value:v))} className="mt-3 w-full rounded-xl border bg-slate-50 px-3 py-2 text-xs"/></label>)}<Right><Primary busy={busy} onClick={saveSurvey}>Start Training</Primary></Right></div>}

      {stage==='lessons'&&selected.lessons[lessonIndex]&&<div className="space-y-5">
        <div className="flex justify-between text-xs font-black text-[#000080]"><span>Training {lessonIndex+1} of {selected.lessons.length}</span><span>{Math.round(((lessonIndex+1)/selected.lessons.length)*100)}%</span></div>
        <div className="prose prose-slate max-w-none rounded-3xl border bg-slate-50 p-6 text-sm leading-7"><ReactMarkdown>{selected.lessons[lessonIndex].content}</ReactMarkdown></div>
        <div className="flex justify-between"><button disabled={lessonIndex===0||busy} onClick={()=>setLessonIndex(x=>Math.max(0,x-1))} className="rounded-xl border px-4 py-2 text-xs font-bold disabled:opacity-40">Previous</button><Primary busy={busy} onClick={()=>void moveLesson(lessonIndex+1)}>{lessonIndex===selected.lessons.length-1?'Finish Lessons':'Next Lesson'}</Primary></div>
      </div>}

      {stage==='diagnostic'&&<div className="space-y-4"><p className="rounded-2xl bg-blue-50 p-4 text-xs text-blue-900">Diagnose the business before recommending technology. Explain your reasoning. Unfinished diagnostic text auto-saves.</p>{selected.diagnosticQuestions.map((q,i)=><label key={i} className="block rounded-2xl border p-4"><span className="text-xs font-bold">{i+1}. {q}</span><textarea rows={5} value={diagnostic[i]||''} onChange={e=>setDiagnostic(p=>p.map((v,x)=>x===i?e.target.value:v))} className="mt-3 w-full rounded-xl border bg-slate-50 px-3 py-2 text-xs"/></label>)}<Right><Primary busy={busy} onClick={saveDiagnostic}>Continue to Certification</Primary></Right></div>}

      {stage==='assessment'&&selected.questions[qIndex]&&<div className="space-y-5">
        <div className="flex justify-between text-xs font-black text-[#000080]"><span>Question {qIndex+1} of {selected.questions.length} · Progress saved</span><span>Pass {selected.passingScore}% + all critical</span></div>
        <div className="rounded-3xl border p-6"><h4 className="text-base font-black">{selected.questions[qIndex].prompt}</h4><div className="mt-5 space-y-3">{selected.questions[qIndex].options.map((o,i)=><button key={i} onClick={()=>setAnswers(p=>({...p,[selected.questions[qIndex].id]:i}))} className={`w-full rounded-2xl border p-4 text-left text-sm ${answers[selected.questions[qIndex].id]===i?'border-[#000080] bg-blue-50':'border-slate-200'}`}>{o}</button>)}</div></div>
        <div className="flex justify-between"><button disabled={qIndex===0} onClick={()=>setQIndex(x=>Math.max(0,x-1))} className="rounded-xl border px-4 py-2 text-xs font-bold disabled:opacity-40">Previous</button>{qIndex<selected.questions.length-1?<button onClick={()=>setQIndex(x=>Math.min(selected.questions.length-1,x+1))} className="rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white">Next Question</button>:<Primary busy={busy} onClick={submit}>Submit Certification</Primary>}</div>
      </div>}

      {stage==='result'&&result&&<div className="space-y-5 text-center"><div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${result.passed?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}`}>{result.passed?<CheckCircle2/>:<RotateCcw/>}</div><h3 className="text-2xl font-black">{result.passed?'Niche Certified':'Retry Required'}</h3><p className="text-sm text-slate-600">Score {result.score}% · Critical misses {result.criticalMisses}</p>{result.passed&&result.moduleComplete&&<p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Roofing + HVAC requirements are complete. Module 4 is now completed and Module 5 can unlock.</p>}<Right><Primary busy={false} onClick={()=>{setAnswers({});setQIndex(0);setResult(null);setStage(result.passed?'complete':'assessment')}}>{result.passed?'View Certification':'Retry Assessment'}</Primary></Right></div>}

      {stage==='complete'&&<div className="space-y-5 text-center"><ShieldCheck className="mx-auto h-14 w-14 text-emerald-600"/><h3 className="text-2xl font-black">{selected.nicheName} — Certified</h3><p className="text-sm text-slate-600">You can review the training at any time. Certification is stored separately for this niche.</p><div className="flex justify-center gap-3"><button onClick={()=>setStage('overview')} className="rounded-xl border px-5 py-3 text-xs font-bold">Back to Niches</button><button onClick={()=>setStage('lessons')} className="rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white">Review Lessons</button></div></div>}
    </section>}
  </div>;
}

function title(s:Stage){return({survey:'Baseline Survey',lessons:'Industry Training',diagnostic:'Business Diagnostic',assessment:'Certification Assessment',result:'Certification Result',complete:'Certification Complete',overview:'Niche Academy'} as Record<Stage,string>)[s]}
function Metric({value,label}:{value:string;label:string}){return <div className="rounded-2xl border bg-slate-50 p-4"><div className="text-2xl font-black text-[#000080]">{value}</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div></div>}
function Status({status,score}:{status:string;score?:number}){const good=status==='Completed';return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${good?'bg-emerald-100 text-emerald-700':status==='Retry Required'?'bg-red-100 text-red-700':'bg-slate-100 text-slate-600'}`}>{good?'Certified':status}{score!=null?` · ${score}%`:''}</span>}
function Primary({busy,onClick,children}:{busy:boolean;onClick:()=>void;children:React.ReactNode}){return <button disabled={busy} onClick={onClick} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-50">{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}{children}<ArrowRight className="h-4 w-4"/></button>}
function Right({children}:{children:React.ReactNode}){return <div className="flex justify-end">{children}</div>}
