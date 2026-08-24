import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Loader2, Save, Send, ShieldCheck } from 'lucide-react';
import { TrainingLesson, UserProgress } from '../../lib/trainingService';
import { LeadResearchConfig, leadResearchTrainingService } from '../../lib/leadResearchTrainingService';

type Candidate = {
  candidateId: string; companyName: string; websiteUrl: string; country: string; industry: string;
  sourceType: string; sourceUrl: string; secondSourceUrl: string; researchStatus: 'Qualified'|'Research Pending'|'Rejected';
  duplicateCheckResult: 'Clear'|'Existing Record'|'Possible Duplicate'; researchNotes: string;
};
type QualifiedDossier = {
  candidateId: string; businessModel: string; contactRoute: string; facts: string; observations: string; hypotheses: string; unknowns: string;
  opportunityEvidence: string; qualificationReason: string; profoxFit: string[]; hardGates: Record<string, boolean>;
  scoreBreakdown: { icpFit:number; meaningfulNeed:number; opportunityPotential:number; contactability:number; timingSignals:number; researchConfidence:number };
};
type RejectedDossier = { candidateId:string; rejectionReason:string; evidence:string };

type Props = {
  moduleId:string; lessons:TrainingLesson[]; progress?:UserProgress; completed:boolean; onRefresh:()=>Promise<void>|void;
};

const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#000080]';
const blankCandidate=(i:number, source='Google Maps'):Candidate=>({candidateId:`C${String(i+1).padStart(2,'0')}`,companyName:'',websiteUrl:'',country:'',industry:'',sourceType:source,sourceUrl:'',secondSourceUrl:'',researchStatus:'Research Pending',duplicateCheckResult:'Clear',researchNotes:''});
const blankQualified=():QualifiedDossier=>({candidateId:'',businessModel:'',contactRoute:'',facts:'',observations:'',hypotheses:'',unknowns:'',opportunityEvidence:'',qualificationReason:'',profoxFit:[],hardGates:{},scoreBreakdown:{icpFit:0,meaningfulNeed:0,opportunityPotential:0,contactability:0,timingSignals:0,researchConfidence:0}});
const blankRejected=():RejectedDossier=>({candidateId:'',rejectionReason:'',evidence:''});
const errMsg=(e:any,f:string)=>e?.message||f;

export default function LeadResearchTraining({moduleId,lessons,progress,completed,onRefresh}:Props){
  const [cfg,setCfg]=useState<LeadResearchConfig|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [lessonIndex,setLessonIndex]=useState(0);
  const [view,setView]=useState<'learn'|'assignment'>('learn');
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [qualified,setQualified]=useState<QualifiedDossier[]>([]);
  const [rejected,setRejected]=useState<RejectedDossier[]>([]);
  const [integrity,setIntegrity]=useState({verifiedPublicSources:false,noFabrication:false,noUnauthorizedScraping:false,sourcesRecorded:false,duplicateChecksCompleted:false,aiResearchVerified:false});
  const hydratedRef=useRef(false);

  const hydrate=(data:LeadResearchConfig)=>{
    const d=data.draftData||{};
    setCandidates(Array.isArray(d.candidates)&&d.candidates.length===data.minCandidates?d.candidates:Array.from({length:data.minCandidates},(_,i)=>blankCandidate(i,data.sourceTypes[0]||'Google Maps')));
    setQualified(Array.isArray(d.qualified)&&d.qualified.length===data.qualifiedRequired?d.qualified:Array.from({length:data.qualifiedRequired},blankQualified));
    setRejected(Array.isArray(d.rejected)&&d.rejected.length===data.rejectedRequired?d.rejected:Array.from({length:data.rejectedRequired},blankRejected));
    if(d.integrity)setIntegrity(p=>({...p,...d.integrity}));
    const done=Math.min(data.lessonsCompleted||0,Math.max(lessons.length-1,0)); setLessonIndex(done);
    if((data.lessonsCompleted||0)>=lessons.length&&lessons.length)setView('assignment');
  };
  const load=async()=>{setLoading(true);setError('');hydratedRef.current=false;const {data,error:e}=await leadResearchTrainingService.getConfig(moduleId);if(e||!data)setError(errMsg(e,'Module 5 configuration could not be loaded.'));else{setCfg(data);hydrate(data);queueMicrotask(()=>{hydratedRef.current=true;});}setLoading(false);};
  useEffect(()=>{void load();},[moduleId]);

  const lessonsDone=(cfg?.lessonsCompleted||0)>=lessons.length&&lessons.length>0;
  const sourceCount=useMemo(()=>new Set(candidates.map(c=>c.sourceType).filter(Boolean)).size,[candidates]);
  const qualIds=new Set(candidates.filter(c=>c.researchStatus==='Qualified'&&c.duplicateCheckResult==='Clear').map(c=>c.candidateId));
  const rejIds=new Set(candidates.filter(c=>c.researchStatus==='Rejected').map(c=>c.candidateId));
  const totalScore=(q:QualifiedDossier)=>Object.values(q.scoreBreakdown).reduce((a,b)=>a+Number(b||0),0);
  const draftPayload=()=>({candidates,qualified,rejected,integrity});

  useEffect(()=>{
    if(!hydratedRef.current||!progress||completed||progress.status==='Submitted'||view!=='assignment')return;
    const timer=window.setTimeout(()=>{
      void leadResearchTrainingService.saveDraft(progress.id,draftPayload()).then(({error:e})=>{
        if(e)console.error('Lead Research auto-save failed:',e);
      });
    },900);
    return()=>window.clearTimeout(timer);
  },[progress?.id,progress?.status,completed,view,candidates,qualified,rejected,integrity]);

  const completeLesson=async()=>{
    if(!progress||!lessons[lessonIndex])return;setBusy(true);setError('');
    const {data,error:e}=await leadResearchTrainingService.completeLesson(progress.id,lessons[lessonIndex].id);
    if(e)setError(errMsg(e,'Lesson progress could not be saved.'));else{const next=Number((data as any)?.lessonsCompleted||0);setCfg(p=>p?{...p,lessonsCompleted:next}:p);if(next>=lessons.length){setView('assignment');setMessage('Training lessons complete. Now perform the research certification.');}else setLessonIndex(next);await onRefresh();}setBusy(false);
  };
  const saveDraft=async()=>{if(!progress)return;setBusy(true);setError('');setMessage('');const {error:e}=await leadResearchTrainingService.saveDraft(progress.id,draftPayload());if(e)setError(errMsg(e,'Draft could not be saved.'));else setMessage('Research draft saved.');setBusy(false);};
  const submit=async()=>{
    if(!progress||!cfg)return;
    if(!lessonsDone){setError('Complete all lessons first.');return;}
    if(sourceCount<cfg.minSourceTypes){setError(`Use at least ${cfg.minSourceTypes} distinct source types.`);return;}
    if(!Object.values(integrity).every(Boolean)){setError('Complete every integrity acknowledgement.');return;}
    setBusy(true);setError('');setMessage('');
    const payload={type:'lead_research_v2',candidates,qualified,rejected,integrity,researchCompletedAt:new Date().toISOString()};
    const {data,error:e}=await leadResearchTrainingService.submit(progress.id,payload);
    if(e)setError(errMsg(e,'Lead Research certification could not be submitted.'));else{setMessage('Submitted for Admin review. No CRM leads were created automatically.');await onRefresh();setCfg(p=>p?{...p,latestSubmission:payload}:p);}setBusy(false);
  };

  if(loading)return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;
  if(!cfg)return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error||'Module 5 is unavailable.'}</div>;
  if(completed)return <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8"><div className="flex items-center gap-3"><CheckCircle2 className="h-7 w-7 text-emerald-600"/><div><h2 className="font-black">Lead Research & Qualification Passed</h2><p className="text-sm text-emerald-800">Management approved your practical research standard. You may review the training content anytime.</p></div></div></div>;

  return <div className="space-y-6">
    <div className="rounded-3xl bg-gradient-to-r from-[#000080] to-[#FF0E0E] p-7 text-white shadow-xl"><div className="text-[10px] font-black uppercase tracking-[.2em] text-white/75">Module 5 · Admin Review Required</div><h2 className="mt-2 text-2xl font-black">Lead Research & Qualification</h2><p className="mt-2 max-w-3xl text-sm text-white/80">Learn the complete sourcing and qualification system, then prove you can find, verify, reject and prioritize prospects without polluting the CRM.</p><div className="mt-5 grid gap-3 sm:grid-cols-4"><Stat v={`${cfg.lessonsCompleted}/${lessons.length}`} l="Lessons"/><Stat v={`${cfg.minCandidates}`} l="Raw Candidates"/><Stat v={`${cfg.minSourceTypes}+`} l="Source Types"/><Stat v="80%" l="Admin Pass"/></div></div>
    {error&&<Notice danger>{error}</Notice>}{message&&<Notice>{message}</Notice>}
    <div className="flex gap-2 rounded-2xl border bg-white p-1"><button onClick={()=>setView('learn')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${view==='learn'?'bg-[#000080] text-white':'text-slate-600'}`}>1. Learn the SOP</button><button disabled={!lessonsDone} onClick={()=>setView('assignment')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${view==='assignment'?'bg-[#000080] text-white':'text-slate-600'} disabled:opacity-40`}>2. Practical Certification</button></div>

    {view==='learn'&&<div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Lesson {lessonIndex+1} of {lessons.length}</div><h3 className="mt-1 text-lg font-black">{lessons[lessonIndex]?.title}</h3></div><BookOpen className="h-6 w-6 text-[#000080]"/></div><div className="prose prose-slate max-w-none rounded-2xl bg-slate-50 p-6 text-sm"><ReactMarkdown>{lessons[lessonIndex]?.content||''}</ReactMarkdown></div><div className="mt-5 flex items-center justify-between"><button disabled={lessonIndex===0} onClick={()=>setLessonIndex(i=>Math.max(0,i-1))} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold disabled:opacity-30"><ArrowLeft className="h-4 w-4"/>Previous</button>{lessonIndex<(cfg.lessonsCompleted||0)&&<button onClick={()=>setLessonIndex(i=>Math.min(lessons.length-1,i+1))} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold">Review Next<ArrowRight className="h-4 w-4"/></button>}{lessonIndex===(cfg.lessonsCompleted||0)&&!lessonsDone&&<button disabled={busy} onClick={()=>void completeLesson()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white">Mark Learned & Continue<ArrowRight className="h-4 w-4"/></button>}</div></div>}

    {view==='assignment'&&<div className="space-y-7">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-[#000080]">Draft auto-save is active. You can leave this page and continue your research submission later.</div>
      <Section title={`Stage A · Research exactly ${cfg.minCandidates} raw candidates`} subtitle={`Use at least ${cfg.minSourceTypes} different discovery source types. Every candidate needs two independent source URLs and a CRM duplicate check.`}>
        <div className="mb-4 rounded-xl bg-blue-50 p-3 text-xs font-bold text-[#000080]">Distinct source types currently used: {sourceCount} / {cfg.minSourceTypes}</div>
        <div className="space-y-4">{candidates.map((c,i)=><div key={c.candidateId} className="rounded-2xl border bg-slate-50 p-4"><div className="mb-3 text-xs font-black text-[#000080]">{c.candidateId} · Candidate {i+1}</div><div className="grid gap-3 md:grid-cols-4"><F l="Company"><input className={input} value={c.companyName} onChange={e=>patchCandidate(i,{companyName:e.target.value})}/></F><F l="Website (optional)"><input className={input} value={c.websiteUrl} onChange={e=>patchCandidate(i,{websiteUrl:e.target.value})}/></F><F l="Country / Territory"><input className={input} value={c.country} onChange={e=>patchCandidate(i,{country:e.target.value})}/></F><F l="Industry / Niche"><input className={input} value={c.industry} onChange={e=>patchCandidate(i,{industry:e.target.value})}/></F></div><div className="mt-3 grid gap-3 md:grid-cols-3"><F l="Discovery Source"><select className={input} value={c.sourceType} onChange={e=>patchCandidate(i,{sourceType:e.target.value})}>{cfg.sourceTypes.map(x=><option key={x}>{x}</option>)}</select></F><F l="Primary Source URL"><input className={input} value={c.sourceUrl} onChange={e=>patchCandidate(i,{sourceUrl:e.target.value})} placeholder="https://..."/></F><F l="Independent Verification URL"><input className={input} value={c.secondSourceUrl} onChange={e=>patchCandidate(i,{secondSourceUrl:e.target.value})} placeholder="https://..."/></F></div><div className="mt-3 grid gap-3 md:grid-cols-3"><F l="Research Status"><select className={input} value={c.researchStatus} onChange={e=>patchCandidate(i,{researchStatus:e.target.value as Candidate['researchStatus']})}><option>Qualified</option><option>Research Pending</option><option>Rejected</option></select></F><F l="CRM Duplicate Check"><select className={input} value={c.duplicateCheckResult} onChange={e=>patchCandidate(i,{duplicateCheckResult:e.target.value as Candidate['duplicateCheckResult']})}><option>Clear</option><option>Existing Record</option><option>Possible Duplicate</option></select></F><F l="Research Notes"><textarea rows={2} className={input} value={c.researchNotes} onChange={e=>patchCandidate(i,{researchNotes:e.target.value})}/></F></div></div>)}</div>
      </Section>

      <Section title={`Stage B · Submit ${cfg.qualifiedRequired} qualified dossiers`} subtitle="Qualified dossiers must come from raw candidates marked Qualified with a Clear duplicate check. All eight hard gates must pass.">
        <div className="space-y-5">{qualified.map((q,i)=><div key={i} className="rounded-2xl border p-5"><div className="mb-3 text-xs font-black text-[#000080]">Qualified Dossier {i+1}</div><F l="Candidate"><select className={input} value={q.candidateId} onChange={e=>patchQualified(i,{candidateId:e.target.value})}><option value="">Select qualified candidate</option>{Array.from(qualIds).map(id=><option key={id}>{id}</option>)}</select></F><div className="mt-3 grid gap-3 md:grid-cols-2"><F l="Business Model"><textarea rows={2} className={input} value={q.businessModel} onChange={e=>patchQualified(i,{businessModel:e.target.value})}/></F><F l="Legitimate Contact Route / Likely Stakeholder"><textarea rows={2} className={input} value={q.contactRoute} onChange={e=>patchQualified(i,{contactRoute:e.target.value})}/></F><F l="Facts"><textarea rows={3} className={input} value={q.facts} onChange={e=>patchQualified(i,{facts:e.target.value})}/></F><F l="Observations"><textarea rows={3} className={input} value={q.observations} onChange={e=>patchQualified(i,{observations:e.target.value})}/></F><F l="Hypotheses"><textarea rows={3} className={input} value={q.hypotheses} onChange={e=>patchQualified(i,{hypotheses:e.target.value})}/></F><F l="Unknowns"><textarea rows={3} className={input} value={q.unknowns} onChange={e=>patchQualified(i,{unknowns:e.target.value})}/></F></div><div className="mt-3 grid gap-3 md:grid-cols-2"><F l="Opportunity Evidence"><textarea rows={4} className={input} value={q.opportunityEvidence} onChange={e=>patchQualified(i,{opportunityEvidence:e.target.value})}/></F><F l="Why Qualified / Recommended Next Action"><textarea rows={4} className={input} value={q.qualificationReason} onChange={e=>patchQualified(i,{qualificationReason:e.target.value})}/></F></div><div className="mt-4"><div className="text-[10px] font-black uppercase text-slate-500">Possible ProFox Fit</div><div className="mt-2 flex flex-wrap gap-2">{cfg.profoxFitOptions.map(x=><label key={x} className="rounded-xl border bg-slate-50 px-3 py-2 text-xs"><input type="checkbox" className="mr-2" checked={q.profoxFit.includes(x)} onChange={e=>patchFit(i,x,e.target.checked)}/>{x}</label>)}</div></div><div className="mt-4 rounded-xl bg-amber-50 p-4"><div className="text-[10px] font-black uppercase text-amber-900">Hard Qualification Gates</div><div className="mt-2 grid gap-2 md:grid-cols-2">{cfg.hardGates.map(g=><label key={g.key} className="text-xs font-medium"><input type="checkbox" className="mr-2" checked={!!q.hardGates[g.key]} onChange={e=>patchQualified(i,{hardGates:{...q.hardGates,[g.key]:e.target.checked}})}/>{g.label}</label>)}</div></div><ScoreEditor q={q} onChange={(key,val)=>patchQualified(i,{scoreBreakdown:{...q.scoreBreakdown,[key]:val}})} total={totalScore(q)}/></div>)}</div>
      </Section>

      <Section title={`Stage C · Submit ${cfg.rejectedRequired} rejected dossiers`} subtitle="Show that you can protect the CRM by rejecting businesses that do not belong.">
        <div className="space-y-4">{rejected.map((r,i)=><div key={i} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-3"><F l={`Rejected Candidate ${i+1}`}><select className={input} value={r.candidateId} onChange={e=>patchRejected(i,{candidateId:e.target.value})}><option value="">Select rejected candidate</option>{Array.from(rejIds).map(id=><option key={id}>{id}</option>)}</select></F><F l="Rejection Reason"><select className={input} value={r.rejectionReason} onChange={e=>patchRejected(i,{rejectionReason:e.target.value})}><option value="">Select reason</option>{cfg.rejectionReasons.map(x=><option key={x}>{x}</option>)}</select></F><F l="Evidence / Why It Does Not Belong"><textarea rows={3} className={input} value={r.evidence} onChange={e=>patchRejected(i,{evidence:e.target.value})}/></F></div>)}</div>
      </Section>

      <Section title="Stage D · Integrity Certification" subtitle="These acknowledgements are mandatory. A critical integrity failure can force Retry Required even when the numerical review score is high.">
        <div className="grid gap-3 md:grid-cols-2">{Object.entries({verifiedPublicSources:'I independently verified the submitted business information using public/business sources.',noFabrication:'I did not fabricate companies, people, contacts, problems, losses or evidence.',noUnauthorizedScraping:'I did not use prohibited scraping, bots, fake accounts or tools that bypass platform controls.',sourcesRecorded:'I recorded source URLs and kept facts separate from assumptions.',duplicateChecksCompleted:'I completed CRM duplicate checks before classifying qualified candidates.',aiResearchVerified:'Any AI-assisted research was independently verified before submission.'}).map(([k,l])=><label key={k} className="rounded-xl border bg-slate-50 p-3 text-xs font-medium"><input className="mr-2" type="checkbox" checked={(integrity as any)[k]} onChange={e=>setIntegrity(p=>({...p,[k]:e.target.checked}))}/>{l}</label>)}</div>
      </Section>
      <div className="flex flex-wrap justify-end gap-3 rounded-2xl border bg-white p-4"><button disabled={busy} onClick={()=>void saveDraft()} className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-xs font-black"><Save className="h-4 w-4"/>Save Now</button><button disabled={busy||progress?.status==='Submitted'} onClick={()=>void submit()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-black text-white disabled:opacity-50"><Send className="h-4 w-4"/>{progress?.status==='Submitted'?'Under Admin Review':'Submit for Admin Review'}</button></div>
    </div>}
  </div>;

  function patchCandidate(i:number,u:Partial<Candidate>){setCandidates(p=>p.map((x,n)=>n===i?{...x,...u}:x));}
  function patchQualified(i:number,u:Partial<QualifiedDossier>){setQualified(p=>p.map((x,n)=>n===i?{...x,...u}:x));}
  function patchRejected(i:number,u:Partial<RejectedDossier>){setRejected(p=>p.map((x,n)=>n===i?{...x,...u}:x));}
  function patchFit(i:number,x:string,on:boolean){const q=qualified[i];patchQualified(i,{profoxFit:on?Array.from(new Set([...q.profoxFit,x])):q.profoxFit.filter(v=>v!==x)});}
}

function Section({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}){return <div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="mb-5"><h3 className="text-base font-black">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p></div>{children}</div>}
function F({l,children}:{l:string;children:React.ReactNode}){return <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">{l}</span>{children}</label>}
function Stat({v,l}:{v:string;l:string}){return <div className="rounded-xl border border-white/20 bg-white/10 p-3"><div className="text-xl font-black">{v}</div><div className="text-[10px] font-bold uppercase text-white/70">{l}</div></div>}
function Notice({danger=false,children}:{danger?:boolean;children:React.ReactNode}){return <div className={`rounded-2xl border p-4 text-sm font-medium ${danger?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>}
function ScoreEditor({q,onChange,total}:{q:QualifiedDossier;onChange:(k:keyof QualifiedDossier['scoreBreakdown'],v:number)=>void;total:number}){const fields:[keyof QualifiedDossier['scoreBreakdown'],string,number][]=[['icpFit','ICP / Business Fit',25],['meaningfulNeed','Evidence of Meaningful Need',25],['opportunityPotential','Commercial Opportunity Potential',15],['contactability','Stakeholder / Contactability',15],['timingSignals','Timing / Activity Signals',10],['researchConfidence','Data / Research Confidence',10]];return <div className="mt-4 rounded-xl border bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-black uppercase text-slate-500">Prospect Quality Score</div><div className={`text-sm font-black ${total>=80?'text-emerald-600':total>=65?'text-amber-600':'text-red-600'}`}>{total}/100</div></div><div className="grid gap-3 md:grid-cols-3">{fields.map(([k,l,m])=><F key={k} l={`${l} / ${m}`}><input className={input} type="number" min={0} max={m} value={q.scoreBreakdown[k]} onChange={e=>onChange(k,Math.max(0,Math.min(m,Number(e.target.value))))}/></F>)}</div></div>}
