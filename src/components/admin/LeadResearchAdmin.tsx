import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { trainingService, TrainingModule } from '../../lib/trainingService';
import { LeadResearchAdminSubmission, LeadResearchConfig, leadResearchTrainingService } from '../../lib/leadResearchTrainingService';

const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#000080]';
const msg=(e:any,f:string)=>e?.message||f;
const lines=(value:string[])=>value.join('\n');
const parseLines=(value:string)=>value.split('\n').map(x=>x.trim()).filter(Boolean);

type EditableConfig={
  minCandidates:number;minSourceTypes:number;qualifiedRequired:number;rejectedRequired:number;passingScore:number;
  sourceTypes:string;rejectionReasons:string;profoxFitOptions:string;hardGates:string;rubric:string;criticalFailures:string;
};
const toEditable=(c:LeadResearchConfig,passingScore:number):EditableConfig=>({
  minCandidates:c.minCandidates,minSourceTypes:c.minSourceTypes,qualifiedRequired:c.qualifiedRequired,rejectedRequired:c.rejectedRequired,passingScore,
  sourceTypes:lines(c.sourceTypes),rejectionReasons:lines(c.rejectionReasons),profoxFitOptions:lines(c.profoxFitOptions),
  hardGates:c.hardGates.map(x=>`${x.key} | ${x.label}`).join('\n'),
  rubric:c.rubric.map(x=>`${x.key} | ${x.label} | ${x.max}`).join('\n'),
  criticalFailures:c.criticalFailures.map(x=>`${x.key} | ${x.label}`).join('\n')
});
const parsePairs=(value:string)=>parseLines(value).map(line=>{const [key,...rest]=line.split('|').map(x=>x.trim());return {key,label:rest.join(' | ')};}).filter(x=>x.key&&x.label);
const parseRubric=(value:string)=>parseLines(value).map(line=>{const [key,label,max]=line.split('|').map(x=>x.trim());return {key,label,max:Number(max)};}).filter(x=>x.key&&x.label&&Number.isFinite(x.max));

export default function LeadResearchAdmin(){
  const {isAdmin,loading:authLoading}=useAuth();
  const navigate=useNavigate();
  const [module,setModule]=useState<TrainingModule|null>(null);
  const [config,setConfig]=useState<LeadResearchConfig|null>(null);
  const [edit,setEdit]=useState<EditableConfig|null>(null);
  const [submissions,setSubmissions]=useState<LeadResearchAdminSubmission[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [rubricScores,setRubricScores]=useState<Record<string,number>>({});
  const [critical,setCritical]=useState<string[]>([]);
  const [feedback,setFeedback]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState<'reviews'|'settings'>('reviews');

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const modules=await trainingService.getModules(true);
      const m=(modules.data||[]).find(x=>x.slug==='lead-research')||null;
      if(!m)throw new Error('Module 5 Lead Research & Qualification was not found.');
      const [cfgRes,subRes]=await Promise.all([leadResearchTrainingService.getConfig(m.id),leadResearchTrainingService.adminListSubmissions()]);
      if(cfgRes.error||!cfgRes.data)throw cfgRes.error||new Error('Lead Research config unavailable.');
      if(subRes.error)throw subRes.error;
      setModule(m);setConfig(cfgRes.data);setEdit(toEditable(cfgRes.data,m.passing_score||80));setSubmissions(subRes.data||[]);
      setSelectedId(current=>current&&(subRes.data||[]).some(x=>x.progressId===current)?current:(subRes.data||[]).find(x=>x.status==='Submitted')?.progressId||(subRes.data||[])[0]?.progressId||'');
    }catch(e:any){setError(msg(e,'Lead Research Admin could not be loaded.'));}
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

  const review=async()=>{
    if(!selected||selected.status!=='Submitted')return;
    setBusy(true);setError('');setMessage('');
    const {data,error:e}=await leadResearchTrainingService.adminReview(selected.progressId,rubricScores,critical,feedback);
    if(e)setError(msg(e,'Review could not be saved.'));else{setMessage(`Review saved: ${(data as any)?.status} · ${(data as any)?.score}/100.`);await load();}
    setBusy(false);
  };
  const saveSettings=async()=>{
    if(!module||!edit)return;
    const rubric=parseRubric(edit.rubric);const total=rubric.reduce((a,b)=>a+b.max,0);
    if(total!==100){setError(`Rubric maximums total ${total}; they must total 100.`);return;}
    setBusy(true);setError('');setMessage('');
    const payload={minCandidates:edit.minCandidates,minSourceTypes:edit.minSourceTypes,qualifiedRequired:edit.qualifiedRequired,rejectedRequired:edit.rejectedRequired,passingScore:edit.passingScore,
      sourceTypes:parseLines(edit.sourceTypes),rejectionReasons:parseLines(edit.rejectionReasons),profoxFitOptions:parseLines(edit.profoxFitOptions),hardGates:parsePairs(edit.hardGates),rubric,criticalFailures:parsePairs(edit.criticalFailures)};
    const {error:e}=await leadResearchTrainingService.adminUpdateConfig(module.id,payload);
    if(e)setError(msg(e,'Lead Research settings could not be saved.'));else{setMessage('Module 5 research standards saved.');await load();}
    setBusy(false);
  };

  if(authLoading)return null;
  if(!isAdmin)return <Navigate to="/admin/workspace" replace/>;
  if(loading)return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div className="flex items-start gap-3"><button onClick={()=>navigate('/admin/app/recruitment?tab=onboarding')} className="rounded-xl border p-2"><ArrowLeft className="h-4 w-4"/></button><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">Sales Academy · Module 5</div><h1 className="text-xl font-black">Lead Research Academy</h1><p className="mt-1 text-xs text-slate-500">Review research dossiers, enforce quality gates, and customize the research standard without code.</p></div></div><button onClick={()=>void load()} disabled={busy} className="rounded-xl border p-2.5"><RefreshCw className="h-4 w-4"/></button></div></header>
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">{error&&<Notice danger>{error}</Notice>}{message&&<Notice>{message}</Notice>}
      <div className="flex gap-2 rounded-2xl border bg-white p-1"><button onClick={()=>setTab('reviews')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${tab==='reviews'?'bg-[#000080] text-white':'text-slate-600'}`}>Submissions & Rubric Review</button><button onClick={()=>setTab('settings')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${tab==='settings'?'bg-[#000080] text-white':'text-slate-600'}`}>Research Standards & Settings</button></div>
      {tab==='reviews'&&<div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-2 rounded-3xl border bg-white p-4 shadow-sm"><div className="mb-2 text-[10px] font-black uppercase text-slate-400">Review Queue</div>{submissions.length===0&&<div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No Module 5 submissions yet.</div>}{submissions.map(s=><button key={s.progressId} onClick={()=>setSelectedId(s.progressId)} className={`w-full rounded-2xl border p-4 text-left ${s.progressId===selectedId?'border-[#000080] bg-blue-50':'border-slate-200 bg-slate-50'}`}><div className="text-xs font-black">{s.candidateName}</div><div className="mt-1 text-[10px] text-slate-500">{s.candidateEmail||'No email'} · {s.status}</div>{s.score!=null&&<div className="mt-2 text-[10px] font-black text-[#000080]">Score {s.score}/100</div>}</button>)}</aside>
        <section className="space-y-5">{!selected?<div className="rounded-3xl border bg-white p-8 text-sm text-slate-500">Select a submission to review.</div>:<>
          <div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-[#000080]">{selected.status}</div><h2 className="mt-1 text-lg font-black">{selected.candidateName}</h2><p className="text-xs text-slate-500">Submitted {selected.submittedAt?new Date(selected.submittedAt).toLocaleString():'—'}</p></div><ClipboardCheck className="h-6 w-6 text-[#000080]"/></div></div>
          <SubmissionPreview submission={selected.submission}/>
          {selected.status==='Submitted'&&config&&<div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-black">Admin review rubric</h3><p className="mt-1 text-xs text-slate-500">Pass requires {module?.passing_score||80}/100 and zero critical integrity failures.</p></div><div className={`text-2xl font-black ${score>=(module?.passing_score||80)&&critical.length===0?'text-emerald-600':'text-amber-600'}`}>{score}/100</div></div><div className="grid gap-3 md:grid-cols-2">{config.rubric.map(r=><Field key={r.key} label={`${r.label} / ${r.max}`}><input type="number" min={0} max={r.max} className={input} value={rubricScores[r.key]||0} onChange={e=>setRubricScores(p=>({...p,[r.key]:Math.max(0,Math.min(r.max,Number(e.target.value))) }))}/></Field>)}</div><div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4"><div className="flex items-center gap-2 text-red-700"><ShieldAlert className="h-4 w-4"/><span className="text-xs font-black">Critical failures</span></div><div className="mt-3 grid gap-2 md:grid-cols-2">{config.criticalFailures.map(c=><label key={c.key} className="text-xs text-red-900"><input type="checkbox" className="mr-2" checked={critical.includes(c.key)} onChange={e=>setCritical(p=>e.target.checked?[...p,c.key]:p.filter(x=>x!==c.key))}/>{c.label}</label>)}</div></div><Field label="Candidate feedback"><textarea rows={5} className={`${input} mt-4`} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Explain strengths, corrections and next actions."/></Field><div className="mt-5 flex justify-end"><button disabled={busy} onClick={()=>void review()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-black text-white"><CheckCircle2 className="h-4 w-4"/>Save Review Decision</button></div></div>}
          {selected.status!=='Submitted'&&selected.reviewDetail&&<div className="rounded-3xl border bg-white p-6 shadow-sm"><h3 className="text-sm font-black">Latest review</h3><div className="mt-3 text-2xl font-black text-[#000080]">{selected.reviewDetail.totalScore}/100 · {selected.reviewDetail.status}</div><p className="mt-3 whitespace-pre-wrap text-xs text-slate-600">{selected.reviewDetail.feedback||'No feedback recorded.'}</p></div>}
        </>}</section>
      </div>}
      {tab==='settings'&&edit&&<div className="space-y-6"><div className="rounded-3xl border bg-white p-6 shadow-sm"><h2 className="text-sm font-black">Assignment requirements</h2><div className="mt-4 grid gap-4 sm:grid-cols-5"><Num label="Raw candidates" value={edit.minCandidates} onChange={v=>setEdit({...edit,minCandidates:v})}/><Num label="Min source types" value={edit.minSourceTypes} onChange={v=>setEdit({...edit,minSourceTypes:v})}/><Num label="Qualified dossiers" value={edit.qualifiedRequired} onChange={v=>setEdit({...edit,qualifiedRequired:v})}/><Num label="Rejected dossiers" value={edit.rejectedRequired} onChange={v=>setEdit({...edit,rejectedRequired:v})}/><Num label="Passing score" value={edit.passingScore} onChange={v=>setEdit({...edit,passingScore:v})}/></div></div><TextSettings title="Discovery source types" hint="One source type per line." value={edit.sourceTypes} onChange={v=>setEdit({...edit,sourceTypes:v})}/><TextSettings title="Rejection reasons" hint="One reason per line." value={edit.rejectionReasons} onChange={v=>setEdit({...edit,rejectionReasons:v})}/><TextSettings title="ProFox fit options" hint="One option per line." value={edit.profoxFitOptions} onChange={v=>setEdit({...edit,profoxFitOptions:v})}/><TextSettings title="Hard qualification gates" hint="Format: stable_key | Seller-facing label" value={edit.hardGates} onChange={v=>setEdit({...edit,hardGates:v})}/><TextSettings title="Admin rubric" hint="Format: stable_key | Rubric label | maximum points. Maximums must total 100." value={edit.rubric} onChange={v=>setEdit({...edit,rubric:v})}/><TextSettings title="Critical automatic failures" hint="Format: stable_key | Failure label" value={edit.criticalFailures} onChange={v=>setEdit({...edit,criticalFailures:v})}/><div className="flex justify-end"><button disabled={busy} onClick={()=>void saveSettings()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-black text-white"><Save className="h-4 w-4"/>Save Research Standards</button></div></div>}
    </main>
  </div>;
}

function SubmissionPreview({submission}:{submission:any}){if(!submission)return <div className="rounded-3xl border bg-white p-6 text-sm text-slate-500">No assignment payload found.</div>;const cs=submission.candidates||[],qs=submission.qualified||[],rs=submission.rejected||[];return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Metric v={String(cs.length)} l="Raw Candidates"/><Metric v={String(qs.length)} l="Qualified"/><Metric v={String(rs.length)} l="Rejected"/></div><div className="rounded-3xl border bg-white p-6 shadow-sm"><h3 className="text-sm font-black">Qualified dossiers</h3><div className="mt-4 space-y-3">{qs.map((q:any,i:number)=><div key={i} className="rounded-2xl border bg-slate-50 p-4 text-xs"><div className="font-black text-[#000080]">{q.candidateId} · Score {Object.values(q.scoreBreakdown||{}).reduce((a:any,b:any)=>Number(a)+Number(b),0)}/100</div><div className="mt-2 grid gap-2 md:grid-cols-2"><P l="Facts" v={q.facts}/><P l="Observations" v={q.observations}/><P l="Hypotheses" v={q.hypotheses}/><P l="Unknowns" v={q.unknowns}/><P l="Opportunity Evidence" v={q.opportunityEvidence}/><P l="Qualification" v={q.qualificationReason}/></div></div>)}</div></div><div className="rounded-3xl border bg-white p-6 shadow-sm"><h3 className="text-sm font-black">Rejected dossiers</h3><div className="mt-4 space-y-2">{rs.map((r:any,i:number)=><div key={i} className="rounded-xl bg-slate-50 p-3 text-xs"><strong>{r.candidateId} · {r.rejectionReason}</strong><div className="mt-1 text-slate-600">{r.evidence}</div></div>)}</div></div><details className="rounded-2xl border bg-white p-4"><summary className="cursor-pointer text-xs font-black">View complete raw submission</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-[10px] text-slate-600">{JSON.stringify(submission,null,2)}</pre></details></div>}
function P({l,v}:{l:string;v:any}){return <div><div className="text-[9px] font-black uppercase text-slate-400">{l}</div><div className="mt-1 whitespace-pre-wrap text-slate-700">{v||'—'}</div></div>}
function Metric({v,l}:{v:string;l:string}){return <div className="rounded-2xl border bg-white p-4"><div className="text-xl font-black text-[#000080]">{v}</div><div className="text-[10px] font-bold uppercase text-slate-500">{l}</div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span><div className="mt-2">{children}</div></label>}
function Num({label,value,onChange}:{label:string;value:number;onChange:(n:number)=>void}){return <Field label={label}><input type="number" min={1} max={100} className={input} value={value} onChange={e=>onChange(Number(e.target.value))}/></Field>}
function TextSettings({title,hint,value,onChange}:{title:string;hint:string;value:string;onChange:(v:string)=>void}){return <div className="rounded-3xl border bg-white p-6 shadow-sm"><h3 className="text-sm font-black">{title}</h3><p className="mt-1 text-xs text-slate-500">{hint}</p><textarea rows={8} className={`${input} mt-4 font-mono`} value={value} onChange={e=>onChange(e.target.value)}/></div>}
function Notice({danger=false,children}:{danger?:boolean;children:React.ReactNode}){return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${danger?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>}
