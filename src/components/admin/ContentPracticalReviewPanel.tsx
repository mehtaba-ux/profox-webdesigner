import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { trainingService, type TrainingModule, type UserProgress } from '../../lib/trainingService';

interface Props {
  traineeUserId?: string | null;
  onChanged?: () => Promise<void> | void;
}

export default function ContentPracticalReviewPanel({ traineeUserId, onChanged }: Props) {
  const [module,setModule]=useState<TrainingModule|null>(null);
  const [progress,setProgress]=useState<UserProgress|null>(null);
  const [submission,setSubmission]=useState<any>(null);
  const [score,setScore]=useState(90);
  const [feedback,setFeedback]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const load=async()=>{
    if(!traineeUserId){setModule(null);setProgress(null);setSubmission(null);setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const [modulesRes,progressRes]=await Promise.all([trainingService.getModules(true),trainingService.getUserProgress(traineeUserId)]);
      const practical=(modulesRes.data||[]).find(item=>item.slug==='content-practical-certification')||null;
      if(!practical){setModule(null);setProgress(null);setSubmission(null);return;}
      const item=(progressRes.data||[]).find(row=>row.module_id===practical.id)||null;
      const assignment=item?await trainingService.getLatestAssignment(traineeUserId,practical.id):{data:null,error:null};
      setModule(practical);setProgress(item);setSubmission(assignment.data||null);
      setScore(Math.max(Number(practical.passing_score||90),Number(item?.score||0)||90));
      setFeedback(item?.feedback||'');
    }catch(err:any){setError(err?.message||'Practical certification evidence could not be loaded.');}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[traineeUserId]);

  const passScore=Number(module?.passing_score||90);
  const submitted=progress?.status==='Submitted';
  const passed=progress?.status==='Passed'||progress?.status==='Completed';
  const retry=progress?.status==='Retry Required';
  const validSubmission=useMemo(()=>submission?.type==='content_writer_practical',[submission]);

  const review=async(status:'Passed'|'Retry Required')=>{
    if(!progress||!module)return;
    setBusy(true);setError('');setNotice('');
    try{
      if(status==='Passed'&&score<passScore)throw new Error(`A score of at least ${passScore}% is required to pass Content Creator Practical Certification.`);
      if(status==='Retry Required'&&feedback.trim().length<10)throw new Error('Give the trainee specific feedback before requesting a retry.');
      const result=await trainingService.reviewAssignment(progress.id,'',status,feedback.trim(),score);
      if(result.error)throw result.error;
      setNotice(status==='Passed'?'Practical passed. The protected workflow moved the candidate to Final Approval. Production activation remains locked.':'Retry required. The candidate returned to Content Academy with your feedback.');
      await load();
      await onChanged?.();
    }catch(err:any){setError(err?.message||'Practical review could not be saved.');}
    finally{setBusy(false)}
  };

  if(!traineeUserId)return null;
  if(loading)return <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[#000080]"/>Loading Content practical...</div></section>;
  if(!module)return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-xs text-amber-800">Content Practical Certification is not configured.</section>;

  return <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.17em] text-[#000080]">Independent certification gate</div><h3 className="mt-1 text-lg font-black text-slate-900">Content Creator Practical Review</h3><p className="mt-1 text-xs leading-5 text-slate-500">Passing requires {passScore}%+ and moves the candidate to Final Approval. Production access remains locked until separate Final Approval and System Access gates are completed. The writer cannot review their own practical.</p></div><StatusBadge status={progress?.status||'Not Started'} score={progress?.score}/></div>
    {error&&<Notice danger>{error}</Notice>}{notice&&<Notice>{notice}</Notice>}

    {!progress&&<div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">The trainee has not started the practical module yet.</div>}
    {progress&&!validSubmission&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800"><AlertCircle className="mr-2 inline h-4 w-4"/>No valid `content_writer_practical` submission is available yet. Do not pass this candidate.</div>}

    {validSubmission&&<div className="grid gap-4 md:grid-cols-2">
      <Evidence label="Final content" value={submission.content}/>
      <Evidence label="Content evidence URL" value={submission.contentUrl} link/>
      <Evidence label="Research & source reasoning" value={submission.researchNotes}/>
      <Evidence label="Claims & evidence" value={submission.claimsEvidence}/>
      <Evidence label="Writer Self-QA" value={submission.selfQaNotes}/>
      <Evidence label="UI/UX handoff" value={submission.handoffNotes}/>
      <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Declarations</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(submission.declarations||{}).map(([key,value])=><div key={key} className={`flex items-center gap-2 text-xs font-bold ${value?'text-emerald-700':'text-red-700'}`}>{value?<CheckCircle2 className="h-4 w-4"/>:<AlertCircle className="h-4 w-4"/>}{humanize(key)}</div>)}</div></div>
    </div>}

    {(submitted||retry)&&validSubmission&&<div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="grid gap-4 sm:grid-cols-[160px_1fr]"><label><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Independent score</span><div className="mt-2 flex items-center gap-2"><input type="number" min={0} max={100} value={score} onChange={e=>setScore(Math.max(0,Math.min(100,Number(e.target.value))))} className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black"/><span className="text-sm font-black text-slate-500">%</span></div></label><label><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Reviewer feedback</span><textarea rows={4} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Record strengths, defects and any revision required..." className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 outline-none focus:border-[#000080]"/></label></div><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><button disabled={busy} onClick={()=>void review('Retry Required')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-xs font-black text-amber-700 disabled:opacity-40">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<RotateCcw className="h-4 w-4"/>}Require Retry</button><button disabled={busy||score<passScore} onClick={()=>void review('Passed')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<ShieldCheck className="h-4 w-4"/>}Pass Practical</button></div></div>}

    {passed&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4"/>Practical Certification is passed. The candidate must still complete Final Approval and System Access confirmation before activation.</div>}
  </section>;
}

function Evidence({label,value,link=false}:{label:string;value?:string;link?:boolean}){return <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>{!value?<p className="mt-2 text-xs text-slate-400">Not supplied</p>:link?<a href={value} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-xs font-bold text-[#000080]">Open evidence <ExternalLink className="h-3 w-3"/></a>:<p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">{value}</p>}</div>}
function StatusBadge({status,score}:{status:string;score?:number}){const passed=['Passed','Completed'].includes(status);const retry=status==='Retry Required';return <span className={`rounded-full px-3 py-1 text-[10px] font-black ${passed?'bg-emerald-100 text-emerald-700':retry?'bg-red-100 text-red-700':status==='Submitted'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600'}`}>{status}{typeof score==='number'?` · ${score}%`:''}</span>}
function Notice({children,danger=false}:{children:React.ReactNode;danger?:boolean}){return <div className={`rounded-xl border p-3 text-xs font-semibold ${danger?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>}
function humanize(value:string){return value.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,letter=>letter.toUpperCase())}
