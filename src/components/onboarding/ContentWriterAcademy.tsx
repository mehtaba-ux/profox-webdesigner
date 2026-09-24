import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Clock3, Loader2, Lock, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../lib/AuthContext';
import { trainingService, type TrainingLesson, type TrainingModule, type UserProgress } from '../../lib/trainingService';
import ContentPracticalCertification, { type ContentPracticalSubmission } from './ContentPracticalCertification';

export default function ContentWriterAcademy(){
  const {user,profile}=useAuth();
  const [modules,setModules]=useState<TrainingModule[]>([]);
  const [progress,setProgress]=useState<UserProgress[]>([]);
  const [selected,setSelected]=useState<TrainingModule|null>(null);
  const [lessons,setLessons]=useState<TrainingLesson[]>([]);
  const [submission,setSubmission]=useState<any>(null);
  const [lessonIndex,setLessonIndex]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const load=async()=>{
    if(!user)return;
    setLoading(true);setError('');
    try{
      const[m,p]=await Promise.all([trainingService.getModules(),trainingService.getUserProgress(user.id)]);
      setModules((m.data||[]).filter(item=>item.slug.startsWith('content-')).sort((a,b)=>a.sort_order-b.sort_order));
      setProgress(p.data||[]);
    }catch(err:any){setError(err?.message||'Content Academy could not be loaded.');}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[user?.id]);

  const itemFor=(moduleId:string)=>progress.find(item=>item.module_id===moduleId);
  const locked=(module:TrainingModule)=>{
    const index=modules.findIndex(item=>item.id===module.id);
    if(index<=0)return false;
    const previous=modules[index-1];const item=itemFor(previous.id);
    return !item||!['Passed','Completed'].includes(item.status);
  };

  const open=async(module:TrainingModule)=>{
    if(!user||locked(module))return;
    setLoading(true);setError('');
    try{
      let item=itemFor(module.id);
      if(!item){const started=await trainingService.startModule(user.id,module.id);if(started.error||!started.data)throw started.error||new Error('Unable to start module.');item=started.data;}
      const[l,a]=await Promise.all([trainingService.getLessons(module.id),trainingService.getLatestAssignment(user.id,module.id)]);
      setSelected(module);setLessons(l.data||[]);setSubmission(a.data||null);setLessonIndex(0);
      await load();
    }catch(err:any){setError(err?.message||'Module could not be opened.');setLoading(false);}
  };

  const advanceLesson=async()=>{
    if(!selected||!user)return;
    const item=itemFor(selected.id);if(!item)return;
    if(lessonIndex<lessons.length-1){const next=lessonIndex+1;setLessonIndex(next);const{error}=await trainingService.updateProgress(item.id,{progress_percent:Math.max(10,Math.round(next/Math.max(lessons.length,1)*100))});if(error)setError(error.message||'Progress could not be saved.');return;}
    setBusy(true);setError('');
    try{const{error}=await trainingService.updateProgress(item.id,{status:'Completed',progress_percent:100,completed_at:new Date().toISOString()});if(error)throw error;setSelected(null);await load();}
    catch(err:any){setError(err?.message||'Module completion could not be saved.');}
    finally{setBusy(false)}
  };

  const submitPractical=async(payload:ContentPracticalSubmission)=>{
    if(!selected||!user)return;const item=itemFor(selected.id);if(!item)return;
    setBusy(true);setError('');
    try{const{error}=await trainingService.submitAssignment(user.id,selected.id,item.id,payload);if(error)throw error;setSubmission(payload);await load();}
    catch(err:any){setError(err?.message||'Practical submission could not be saved.');}
    finally{setBusy(false)}
  };

  const complete=progress.filter(item=>['Passed','Completed'].includes(item.status)&&modules.some(module=>module.id===item.module_id)).length;
  const overall=modules.length?Math.round(complete/modules.length*100):0;
  const selectedProgress=selected?itemFor(selected.id):undefined;
  const practical=selected?.slug==='content-practical-certification';
  const selectedDone=Boolean(selectedProgress&&['Passed','Completed'].includes(selectedProgress.status));

  if(loading&&!selected)return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div>;
  return <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}
    {!selected?<>
      <section className="rounded-[32px] bg-[#000080] p-7 text-white shadow-xl sm:p-9"><div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-white/70">ProFox Content Academy · PF-SOP-07</div><h1 className="mt-2 text-3xl font-black tracking-tight">Content Writer Onboarding & Certification</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">Learn the exact research-to-handoff operating system, then pass an independently reviewed practical before production Content Delivery access activates.</p></div><div className="min-w-[180px] rounded-2xl border border-white/20 bg-white/10 p-5"><div className="text-4xl font-black">{overall}%</div><div className="mt-1 text-[10px] font-black uppercase tracking-wider text-white/70">Certification progress</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-white" style={{width:`${overall}%`}}/></div></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Completed" value={`${complete} / ${modules.length}`}/><Metric label="Account state" value={profile?.status==='active'?'Production Active':'Onboarding'}/><Metric label="Final gate" value="Independent Practical"/></div></section>
      <section><div className="mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-[#000080]"/><h2 className="text-lg font-black text-slate-900">Content Academy curriculum</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{modules.map((module,index)=>{const item=itemFor(module.id);const isLocked=locked(module);const done=Boolean(item&&['Passed','Completed'].includes(item.status));const submitted=item?.status==='Submitted';const retry=item?.status==='Retry Required';return <button type="button" key={module.id} disabled={isLocked} onClick={()=>void open(module)} className={`flex min-h-[190px] flex-col justify-between rounded-3xl border p-5 text-left transition ${isLocked?'cursor-not-allowed border-slate-200 bg-slate-50 opacity-55':'border-slate-200 bg-white hover:border-[#000080]/40 hover:shadow-lg'}`}><div><div className="flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-50 text-xs font-black text-[#000080]">{index+1}</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${done?'bg-emerald-100 text-emerald-700':retry?'bg-red-100 text-red-700':submitted?'bg-amber-100 text-amber-700':isLocked?'bg-slate-100 text-slate-400':'bg-blue-50 text-[#000080]'}`}>{isLocked?'Locked':done?'Passed':retry?'Retry Required':submitted?'Under Review':item?.status||'Not Started'}</span></div><h3 className="mt-4 text-sm font-black leading-5 text-slate-900">{module.title}</h3><p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">{module.description}</p></div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-black text-[#000080]"><span>{isLocked?'Complete previous module':done?'Review module':retry?'Retry certification':submitted?'View submission':'Open module'}</span>{isLocked?<Lock className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}</div></button>})}</div></section>
    </>:<>
      <button onClick={()=>setSelected(null)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600"><ArrowLeft className="h-4 w-4"/>Back to Content Academy</button>
      {practical?<ContentPracticalCertification progress={selectedProgress} submission={submission} passingScore={selected.passing_score||90} isSubmitting={busy} onSubmit={submitPractical}/>:<section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div><div className="text-[10px] font-black uppercase tracking-[.17em] text-[#000080]">Content Academy · Module {selected.sort_order}</div><h2 className="mt-2 text-2xl font-black text-slate-900">{selected.title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{selected.description}</p></div>{lessons.length===0?<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">This module has no active lesson content. Contact Content leadership before proceeding.</div>:<><div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wide text-slate-400"><span>Lesson {lessonIndex+1} of {lessons.length}</span><span>{selectedProgress?.progress_percent||0}% saved</span></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-7"><h3 className="text-base font-black text-slate-900">{lessons[lessonIndex]?.title}</h3><div className="prose prose-slate mt-5 max-w-none text-sm leading-7"><ReactMarkdown>{lessons[lessonIndex]?.content||''}</ReactMarkdown></div></div><div className="flex items-center justify-between border-t border-slate-100 pt-5"><div className="flex items-center gap-2 text-xs text-slate-500">{selectedDone?<><CheckCircle2 className="h-4 w-4 text-emerald-600"/>Module complete</>:<><Clock3 className="h-4 w-4"/>Progress saves as you continue</>}</div>{!selectedDone&&<button disabled={busy} onClick={()=>void advanceLesson()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:lessonIndex<lessons.length-1?<ChevronRight className="h-4 w-4"/>:<ShieldCheck className="h-4 w-4"/>}{lessonIndex<lessons.length-1?'Next Lesson':'Complete Module'}</button>}</div></>}</section>}
    </>}
  </div>;
}

function Metric({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/15 bg-white/10 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-white/60">{label}</div><div className="mt-1 text-sm font-black text-white">{value}</div></div>}
