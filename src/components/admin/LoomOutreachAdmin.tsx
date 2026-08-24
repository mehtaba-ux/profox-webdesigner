import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Save, ShieldCheck, Video } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { trainingService, TrainingModule } from '../../lib/trainingService';
import { LoomOutreachAdminSubmission, LoomOutreachConfig, loomOutreachTrainingService } from '../../lib/loomOutreachTrainingService';

const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#000080]';
const lines=(value:string[])=>value.join('\n');
const parseLines=(value:string)=>value.split('\n').map(x=>x.trim()).filter(Boolean);
const msg=(e:any,f:string)=>e?.message||f;

type EditableConfig={
  minDurationSeconds:number;targetDurationMin:number;targetDurationMax:number;maxDurationSeconds:number;passingScore:number;
  profoxFitOptions:string;rubric:string;criticalFailures:string;
};
const toEditable=(c:LoomOutreachConfig,passingScore:number):EditableConfig=>({
  minDurationSeconds:c.minDurationSeconds,targetDurationMin:c.targetDurationMin,targetDurationMax:c.targetDurationMax,maxDurationSeconds:c.maxDurationSeconds,passingScore,
  profoxFitOptions:lines(c.profoxFitOptions),rubric:c.rubric.map(x=>`${x.key} | ${x.label} | ${x.max}`).join('\n'),criticalFailures:c.criticalFailures.map(x=>`${x.key} | ${x.label}`).join('\n')
});
const parseRubric=(value:string)=>parseLines(value).map(line=>{const [key,label,max]=line.split('|').map(x=>x.trim());return {key,label,max:Number(max)};}).filter(x=>x.key&&x.label&&Number.isFinite(x.max));
const parsePairs=(value:string)=>parseLines(value).map(line=>{const [key,...rest]=line.split('|').map(x=>x.trim());return {key,label:rest.join(' | ')};}).filter(x=>x.key&&x.label);

export default function LoomOutreachAdmin(){
  const {isAdmin,loading:authLoading}=useAuth();
  const navigate=useNavigate();
  const [module,setModule]=useState<TrainingModule|null>(null);
  const [config,setConfig]=useState<LoomOutreachConfig|null>(null);
  const [edit,setEdit]=useState<EditableConfig|null>(null);
  const [submissions,setSubmissions]=useState<LoomOutreachAdminSubmission[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [rubricScores,setRubricScores]=useState<Record<string,number>>({});
  const [critical,setCritical]=useState<string[]>([]);
  const [feedback,setFeedback]=useState('');
  const [tab,setTab]=useState<'reviews'|'standards'>('reviews');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const modules=await trainingService.getModules(true);
      const m=(modules.data||[]).find(x=>x.slug==='loom-outreach')||null;
      if(!m)throw new Error('Module 6 Personalized Loom Outreach was not found.');
      const [cfgRes,subRes]=await Promise.all([loomOutreachTrainingService.getConfig(m.id),loomOutreachTrainingService.adminListSubmissions()]);
      if(cfgRes.error||!cfgRes.data)throw cfgRes.error||new Error('Module 6 configuration unavailable.');
      if(subRes.error)throw subRes.error;
      setModule(m);setConfig(cfgRes.data);setEdit(toEditable(cfgRes.data,m.passing_score||80));setSubmissions(subRes.data||[]);
      setSelectedId(current=>current&&(subRes.data||[]).some(x=>x.progressId===current)?current:(subRes.data||[]).find(x=>x.status==='Submitted')?.progressId||(subRes.data||[])[0]?.progressId||'');
    }catch(e:any){setError(msg(e,'Module 6 Admin could not be loaded.'));}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(isAdmin)void load();},[isAdmin]);

  const selected=submissions.find(x=>x.progressId===selectedId)||null;
  useEffect(()=>{
    if(!config||!selected)return;
    setRubricScores(Object.fromEntries(config.rubric.map(r=>[r.key,Number(selected.reviewDetail?.rubricScores?.[r.key]||0)])));
    setCritical(Array.isArray(selected.reviewDetail?.criticalFailures)?selected.reviewDetail.criticalFailures:[]);
    setFeedback(selected.reviewDetail?.feedback||'');
  },[selectedId,config]);
  const score=useMemo(()=>Object.values(rubricScores).reduce((a,b)=>a+Number(b||0),0),[rubricScores]);
  const projected=module&&score>=(module.passing_score||80)&&critical.length===0?'Passed':'Retry Required';

  const review=async()=>{
    if(!selected||selected.status!=='Submitted')return;
    setBusy(true);setError('');setMessage('');
    const {data,error:e}=await loomOutreachTrainingService.adminReview(selected.progressId,rubricScores,critical,feedback);
    if(e)setError(msg(e,'Module 6 review could not be saved.'));
    else{setMessage(`Review saved: ${(data as any)?.status} · ${(data as any)?.score}/100.`);await load();}
    setBusy(false);
  };

  const saveStandards=async()=>{
    if(!module||!edit)return;
    const rubric=parseRubric(edit.rubric);const total=rubric.reduce((a,b)=>a+b.max,0);
    if(total!==100){setError(`Rubric maximums total ${total}; they must total 100.`);return;}
    setBusy(true);setError('');setMessage('');
    const payload={
      minDurationSeconds:edit.minDurationSeconds,targetDurationMin:edit.targetDurationMin,targetDurationMax:edit.targetDurationMax,maxDurationSeconds:edit.maxDurationSeconds,
      passingScore:edit.passingScore,profoxFitOptions:parseLines(edit.profoxFitOptions),rubric,criticalFailures:parsePairs(edit.criticalFailures)
    };
    const {error:e}=await loomOutreachTrainingService.adminUpdateConfig(module.id,payload);
    if(e)setError(msg(e,'Module 6 standards could not be saved.'));
    else{setMessage('Module 6 Loom standards saved. The approval scope remains onboarding-only.');await load();}
    setBusy(false);
  };

  if(authLoading)return null;
  if(!isAdmin)return <Navigate to="/admin/workspace" replace/>;
  if(loading)return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div className="flex items-start gap-3"><button onClick={()=>navigate('/admin/app/recruitment?tab=onboarding')} className="rounded-xl border p-2"><ArrowLeft className="h-4 w-4"/></button><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">Sales Academy · Module 6</div><h1 className="text-xl font-black">Personalized Loom Certification</h1><p className="mt-1 text-xs text-slate-500">Review the one-time onboarding Loom test and control the quality standard without creating recurring approval work.</p></div></div><button onClick={()=>void load()} disabled={busy} className="rounded-xl border p-2.5"><RefreshCw className="h-4 w-4"/></button></div></header>
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><strong>Scope rule:</strong> This approval certifies the seller once during onboarding. After Module 6 is passed and onboarding is completed, normal prospecting Loom videos do not require per-video Admin approval.</div>
      {error&&<Notice danger>{error}</Notice>}{message&&<Notice>{message}</Notice>}
      <div className="flex gap-2 rounded-2xl border bg-white p-1"><button onClick={()=>setTab('reviews')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${tab==='reviews'?'bg-[#000080] text-white':'text-slate-600'}`}>Submissions & Video Review</button><button onClick={()=>setTab('standards')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${tab==='standards'?'bg-[#000080] text-white':'text-slate-600'}`}>Standards & Rubric</button></div>

      {tab==='reviews'&&<div className="grid gap-6 lg:grid-cols-[300px,1fr]">
        <section className="overflow-hidden rounded-3xl border bg-white"><div className="border-b bg-slate-50 p-4 text-xs font-black">Trainee Certifications</div><div className="max-h-[680px] divide-y overflow-y-auto">{submissions.length===0?<div className="p-6 text-xs text-slate-500">No Module 6 submissions yet.</div>:submissions.map(s=><button key={s.progressId} onClick={()=>setSelectedId(s.progressId)} className={`w-full p-4 text-left ${selectedId===s.progressId?'bg-blue-50':'hover:bg-slate-50'}`}><div className="text-xs font-black">{s.candidateName}</div><div className="mt-1 text-[10px] text-slate-500">{s.candidateEmail||'No email'}</div><span className={`mt-2 inline-block rounded-full px-2 py-1 text-[9px] font-black ${s.status==='Submitted'?'bg-amber-100 text-amber-800':s.status==='Passed'?'bg-emerald-100 text-emerald-800':'bg-red-100 text-red-800'}`}>{s.status}</span></button>)}</div></section>
        <section className="space-y-5">{!selected?<div className="rounded-3xl border bg-white p-8 text-sm text-slate-500">Select a trainee submission.</div>:<>
          <div className="rounded-3xl border bg-white p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Certification Submission</div><h2 className="mt-1 text-lg font-black">{selected.candidateName}</h2><p className="mt-1 text-xs text-slate-500">{selected.submission?.companyName} · {selected.submission?.targetContact} · {selected.submission?.targetRole}</p></div>{selected.submission?.loomUrl&&<a href={selected.submission.loomUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-3 text-xs font-black text-white"><Video className="h-4 w-4"/>Watch Loom<ExternalLink className="h-3.5 w-3.5"/></a>}</div>
            <div className="mt-5 grid gap-3 md:grid-cols-3"><Data label="Declared duration" value={`${selected.submission?.durationSeconds||'—'} seconds`}/><Data label="ProFox fit" value={selected.submission?.profoxFit||'—'}/><Data label="Source / CRM reference" value={selected.submission?.prospectSourceReference||'—'}/></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><Data label="Verified observation" value={selected.submission?.observation||'—'}/><Data label="Why it may matter" value={selected.submission?.whyItMatters||'—'}/><Data label="Useful idea" value={selected.submission?.idea||'—'}/><Data label="CTA" value={selected.submission?.cta||'—'}/></div>
            {selected.submission?.evidenceUrl&&<a href={selected.submission.evidenceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#000080]">Open evidence source<ExternalLink className="h-3.5 w-3.5"/></a>}
            <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-500">Companion message</div><p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{selected.submission?.companionMessage||'—'}</p></div>
          </div>

          <div className="rounded-3xl border bg-white p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-black">100-Point Review Rubric</h3><p className="mt-1 text-xs text-slate-500">Watch the actual Loom before scoring. Verify the real duration rather than relying only on the trainee's declared seconds.</p></div><div className={`rounded-xl px-4 py-2 text-center ${projected==='Passed'?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800'}`}><div className="text-lg font-black">{score}/100</div><div className="text-[9px] font-black uppercase">{projected}</div></div></div>
            <div className="grid gap-3 md:grid-cols-2">{config?.rubric.map(r=><label key={r.key} className="rounded-xl border p-3"><span className="flex items-center justify-between text-[11px] font-bold"><span>{r.label}</span><span className="text-slate-400">/{r.max}</span></span><input type="number" min={0} max={r.max} disabled={selected.status!=='Submitted'} className={`${input} mt-2`} value={rubricScores[r.key]??0} onChange={e=>setRubricScores(p=>({...p,[r.key]:Number(e.target.value)}))}/></label>)}</div>
          </div>

          <div className="rounded-3xl border bg-white p-6"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 text-red-600"/><div><h3 className="font-black">Critical Failure Check</h3><p className="mt-1 text-xs text-slate-500">Any selected critical failure forces Retry Required even if the numeric score is high.</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-2">{config?.criticalFailures.map(c=><label key={c.key} className="flex cursor-pointer items-start gap-3 rounded-xl border bg-slate-50 p-3 text-xs"><input type="checkbox" disabled={selected.status!=='Submitted'} checked={critical.includes(c.key)} onChange={e=>setCritical(p=>e.target.checked?[...p,c.key]:p.filter(x=>x!==c.key))}/><span>{c.label}</span></label>)}</div>
            <label className="mt-4 block"><span className="mb-1.5 block text-[11px] font-black">Coaching feedback</span><textarea rows={5} disabled={selected.status!=='Submitted'} className={input} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Explain exactly what to keep or change on the next recording."/></label>
            {selected.status==='Submitted'?<button disabled={busy} onClick={()=>void review()} className="mt-4 w-full rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40">Submit Admin Decision · {projected}</button>:<div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">This attempt has already been reviewed: {selected.status}{selected.score!==undefined&&selected.score!==null?` · ${selected.score}/100`:''}</div>}
          </div>
        </>}</section>
      </div>}

      {tab==='standards'&&edit&&<section className="space-y-6 rounded-3xl border bg-white p-6"><div><h2 className="text-lg font-black">Module 6 Operational Standards</h2><p className="mt-1 text-xs text-slate-500">Timing, passing score, fit options, rubric, and critical failures are Admin-editable. The one-time onboarding-only approval scope is intentionally fixed.</p></div>
        <div className="grid gap-3 md:grid-cols-5"><NumberField label="Minimum seconds" value={edit.minDurationSeconds} set={v=>setEdit(p=>p?{...p,minDurationSeconds:v}:p)}/><NumberField label="Target min" value={edit.targetDurationMin} set={v=>setEdit(p=>p?{...p,targetDurationMin:v}:p)}/><NumberField label="Target max" value={edit.targetDurationMax} set={v=>setEdit(p=>p?{...p,targetDurationMax:v}:p)}/><NumberField label="Maximum seconds" value={edit.maxDurationSeconds} set={v=>setEdit(p=>p?{...p,maxDurationSeconds:v}:p)}/><NumberField label="Passing score" value={edit.passingScore} set={v=>setEdit(p=>p?{...p,passingScore:v}:p)}/></div>
        <TextArea label="ProFox fit options · one per line" value={edit.profoxFitOptions} set={v=>setEdit(p=>p?{...p,profoxFitOptions:v}:p)} rows={6}/><TextArea label="Rubric · key | label | max points" value={edit.rubric} set={v=>setEdit(p=>p?{...p,rubric:v}:p)} rows={12}/><TextArea label="Critical failures · key | label" value={edit.criticalFailures} set={v=>setEdit(p=>p?{...p,criticalFailures:v}:p)} rows={14}/>
        <button disabled={busy} onClick={()=>void saveStandards()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white"><Save className="h-4 w-4"/>Save Module 6 Standards</button>
      </section>}
    </main>
  </div>;
}

function Data({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 whitespace-pre-wrap break-words text-xs font-medium text-slate-700">{value}</div></div>}
function Notice({children,danger=false}:{children:React.ReactNode;danger?:boolean}){return <div className={`rounded-2xl border p-4 text-sm ${danger?'border-red-200 bg-red-50 text-red-800':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{children}</div>}
function NumberField({label,value,set}:{label:string;value:number;set:(v:number)=>void}){return <label><span className="mb-1.5 block text-[10px] font-black text-slate-600">{label}</span><input type="number" className={input} value={value} onChange={e=>set(Number(e.target.value))}/></label>}
function TextArea({label,value,set,rows}:{label:string;value:string;set:(v:string)=>void;rows:number}){return <label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600">{label}</span><textarea rows={rows} className={`${input} font-mono`} value={value} onChange={e=>set(e.target.value)}/></label>}
