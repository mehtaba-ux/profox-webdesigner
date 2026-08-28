import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, Loader2, Save, Send, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type PortfolioCase = {
  projectTitle: string;
  industry: string;
  contentType: string;
  briefProblem: string;
  contribution: string;
  researchProcess: string;
  resultOutcome: string;
  sampleUrl: string;
};

type PortfolioAnswers = { portfolioCases: PortfolioCase[] };

type PublicTask = {
  taskKey: string;
  stage: string;
  title: string;
  description: string;
  targetMarket: string;
  targetNiche: string;
  requiredItems: number;
  estimatedMinutes: number;
  instructions: string[];
  attemptNo: number;
  maxAttempts: number;
  candidateName: string;
  applicationReference: string;
  status: string;
  issuedAt: string;
  dueAt: string;
  submittedAt?: string | null;
  retryFeedback?: string;
  expired: boolean;
  canEdit: boolean;
  answers: PortfolioAnswers;
};

const emptyCase = (): PortfolioCase => ({
  projectTitle: '', industry: '', contentType: '', briefProblem: '', contribution: '',
  researchProcess: '', resultOutcome: '', sampleUrl: '',
});

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';
const textareaClass = `${inputClass} min-h-[120px] resize-y leading-6`;

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeAnswers(value: any, requiredItems: number): PortfolioAnswers {
  const raw = Array.isArray(value?.portfolioCases) ? value.portfolioCases : [];
  const cases = raw.map((item: any) => ({
    projectTitle: String(item?.projectTitle || ''),
    industry: String(item?.industry || ''),
    contentType: String(item?.contentType || ''),
    briefProblem: String(item?.briefProblem || ''),
    contribution: String(item?.contribution || ''),
    researchProcess: String(item?.researchProcess || ''),
    resultOutcome: String(item?.resultOutcome || ''),
    sampleUrl: String(item?.sampleUrl || ''),
  })) as PortfolioCase[];
  while (cases.length < requiredItems) cases.push(emptyCase());
  return { portfolioCases: cases };
}

function validateCase(item: PortfolioCase) {
  const errors: string[] = [];
  if (!item.projectTitle.trim()) errors.push('Project title');
  if (!item.industry.trim()) errors.push('Industry or niche');
  if (!item.contentType.trim()) errors.push('Content type or channel');
  if (item.briefProblem.trim().length < 40) errors.push('Brief/problem explanation (40+ characters)');
  if (item.contribution.trim().length < 40) errors.push('Your exact contribution (40+ characters)');
  if (item.researchProcess.trim().length < 40) errors.push('Research/content process (40+ characters)');
  if (item.resultOutcome.trim().length < 20) errors.push('Result/outcome (20+ characters)');
  if (!isHttpUrl(item.sampleUrl)) errors.push('Valid sample URL');
  return errors;
}

export default function ContentPortfolioTaskPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [task, setTask] = useState<PublicTask | null>(null);
  const [answers, setAnswers] = useState<PortfolioAnswers>({ portfolioCases: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const saveTimer = useRef<number | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('public_open_recruitment_task', { p_token: token });
      if (rpcError) throw rpcError;
      if (!data || data.taskKey !== 'content_writer_portfolio_v2') throw new Error('This secure link is not a Content Creator portfolio task.');
      const requiredItems = Math.max(3, Number(data.requiredItems || 3));
      const normalized: PublicTask = {
        ...data,
        taskKey: String(data.taskKey || ''), stage: String(data.stage || ''), title: String(data.title || 'Portfolio Review'),
        description: String(data.description || ''), targetMarket: String(data.targetMarket || ''), targetNiche: String(data.targetNiche || ''),
        requiredItems, estimatedMinutes: Number(data.estimatedMinutes || 60), instructions: Array.isArray(data.instructions) ? data.instructions.map(String) : [],
        attemptNo: Number(data.attemptNo || 1), maxAttempts: Number(data.maxAttempts || 1), candidateName: String(data.candidateName || 'Candidate'),
        applicationReference: String(data.applicationReference || ''), status: String(data.status || 'Issued'), issuedAt: String(data.issuedAt || ''), dueAt: String(data.dueAt || ''),
        submittedAt: data.submittedAt || null, retryFeedback: String(data.retryFeedback || ''), expired: data.expired === true, canEdit: data.canEdit === true,
        answers: normalizeAnswers(data.answers, requiredItems),
      };
      setTask(normalized); setAnswers(normalized.answers); setDirty(false);
    } catch (err: any) {
      setTask(null); setError(err?.message || 'This secure portfolio task could not be opened.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [token]);

  const completed = useMemo(() => answers.portfolioCases.slice(0, task?.requiredItems || 0).filter(item => validateCase(item).length === 0).length, [answers, task?.requiredItems]);
  const progress = task?.requiredItems ? Math.round((completed / task.requiredItems) * 100) : 0;

  const saveDraft = async (silent = false) => {
    if (!task?.canEdit) return;
    setSaving(true); if (!silent) setNotice(''); setError('');
    try {
      const { error: rpcError } = await supabase.rpc('public_save_recruitment_task_draft', { p_token: token, p_answers: answers });
      if (rpcError) throw rpcError;
      setDirty(false); setNotice('Draft saved securely.');
    } catch (err: any) { setError(err?.message || 'Your draft could not be saved.'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (!dirty || !task?.canEdit || submitting) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void saveDraft(true); }, 1400);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [answers, dirty, task?.canEdit, submitting]);

  const updateCase = (index: number, key: keyof PortfolioCase, value: string) => {
    const next = [...answers.portfolioCases];
    while (next.length <= index) next.push(emptyCase());
    next[index] = { ...next[index], [key]: value };
    setAnswers({ portfolioCases: next }); setDirty(true); setNotice(''); setError('');
  };

  const submit = async () => {
    if (!task?.canEdit) return;
    const cases = answers.portfolioCases.slice(0, task.requiredItems);
    const invalidIndex = cases.findIndex(item => validateCase(item).length > 0);
    if (cases.length < task.requiredItems || invalidIndex >= 0) {
      const index = invalidIndex >= 0 ? invalidIndex : cases.length;
      const missing = validateCase(cases[index] || emptyCase());
      setError(`Complete portfolio case ${index + 1}. Missing: ${missing.join(', ')}.`);
      document.getElementById(`portfolio-case-${index + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!window.confirm('Submit your portfolio evidence for final review? After submission, this attempt becomes read-only.')) return;
    setSubmitting(true); setError(''); setNotice('');
    try {
      const { error: rpcError } = await supabase.rpc('public_submit_recruitment_task', { p_token: token, p_answers: { portfolioCases: cases } });
      if (rpcError) throw rpcError;
      await load(); setNotice('Portfolio submitted successfully for ProFox review.');
    } catch (err: any) { setError(err?.message || 'Your portfolio could not be submitted.'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="flex items-center gap-3 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-[#000080]"/>Loading your secure portfolio review...</div></div>;
  if (!task) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><div className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto h-9 w-9 text-red-500"/><h1 className="mt-4 text-xl font-black">Portfolio link unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-600">{error || 'This link is invalid, expired, or no longer active.'}</p></div></div>;

  const submitted = ['Submitted','Under Review','Passed','Retry Required','Failed'].includes(task.status);
  const readOnly = !task.canEdit;

  return <div className="min-h-screen bg-[#f5f6fb] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-5 py-5"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[.16em] text-[#000080]">ProFox Recruitment</div><div className="mt-1 text-sm font-semibold text-slate-500">Secure Content Creator portfolio portal</div></div><a href="https://www.profoxwebdesigner.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-black text-[#000080]">ProFox Web Designer <ExternalLink className="h-4 w-4"/></a></div></header>
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div className="max-w-3xl"><div className="text-xs font-black uppercase tracking-[.14em] text-[#000080]">Portfolio Review · Attempt {task.attemptNo}</div><h1 className="mt-2 text-3xl font-black tracking-tight">{task.title}</h1><p className="mt-3 text-sm leading-7 text-slate-600">{task.description}</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${submitted?'bg-emerald-100 text-emerald-800':task.expired?'bg-red-100 text-red-800':'bg-blue-100 text-[#000080]'}`}>{task.status}</span></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Application" value={task.applicationReference || 'ProFox candidate'}/><Summary label="Required cases" value={`${task.requiredItems} case studies`}/><Summary label="Expected time" value={`${task.estimatedMinutes} minutes`}/><Summary label="Deadline" value={formatDate(task.dueAt)}/></div>
        {task.retryFeedback&&<div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-sm font-black text-amber-900">Reviewer feedback</div><p className="mt-1 text-sm leading-6 text-amber-800">{task.retryFeedback}</p></div>}
        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]"/><div><h2 className="text-sm font-black text-[#000080]">What to submit</h2><ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">{task.instructions.map((item,index)=><li key={index} className="flex gap-2"><span className="font-black text-[#000080]">{index+1}.</span><span>{item}</span></li>)}</ul></div></div></div>
      </section>

      {error&&<div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0"/><span>{error}</span></div>}
      {notice&&<div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/><span>{notice}</span></div>}

      {submitted&&<section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600"/><div><h2 className="text-lg font-black">Portfolio submitted</h2><p className="mt-1 text-sm leading-6 text-slate-600">Submitted {formatDate(task.submittedAt)}. Your evidence is read-only while the ProFox team reviews this attempt.</p></div></div></section>}

      {!submitted&&<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-[.12em] text-slate-400">Progress</div><div className="mt-1 text-lg font-black">{completed} of {task.requiredItems} case studies complete</div></div><div className="flex items-center gap-2 text-xs font-bold text-slate-500">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Clock3 className="h-4 w-4"/>}{saving?'Saving securely...':dirty?'Changes waiting to save':'Draft auto-saves'}</div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#000080] transition-all" style={{width:`${progress}%`}}/></div></section>}

      <div className="space-y-5">{answers.portfolioCases.slice(0, task.requiredItems).map((item,index)=>{const missing=validateCase(item);const complete=missing.length===0;return <section id={`portfolio-case-${index+1}`} key={index} className="scroll-mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[.12em] text-[#000080]">Case study {index+1}</div><h2 className="mt-1 text-xl font-black">{item.projectTitle.trim() || `Portfolio case ${index+1}`}</h2></div>{complete?<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>Complete</span>:<span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Evidence required</span>}</div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label="Project / client title"><input disabled={readOnly} className={inputClass} value={item.projectTitle} onChange={e=>updateCase(index,'projectTitle',e.target.value)}/></Field><Field label="Industry / niche"><input disabled={readOnly} className={inputClass} value={item.industry} onChange={e=>updateCase(index,'industry',e.target.value)}/></Field><Field label="Content type / channel"><input disabled={readOnly} className={inputClass} placeholder="Website, landing page, blog, email, social..." value={item.contentType} onChange={e=>updateCase(index,'contentType',e.target.value)}/></Field><Field label="Public or authorized sample URL"><input disabled={readOnly} type="url" className={inputClass} placeholder="https://..." value={item.sampleUrl} onChange={e=>updateCase(index,'sampleUrl',e.target.value)}/></Field></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2"><Field label="Brief / problem"><textarea disabled={readOnly} className={textareaClass} value={item.briefProblem} onChange={e=>updateCase(index,'briefProblem',e.target.value)}/></Field><Field label="Your exact contribution"><textarea disabled={readOnly} className={textareaClass} value={item.contribution} onChange={e=>updateCase(index,'contribution',e.target.value)}/></Field><Field label="Research and content process"><textarea disabled={readOnly} className={textareaClass} value={item.researchProcess} onChange={e=>updateCase(index,'researchProcess',e.target.value)}/></Field><Field label="Result, outcome, or intended impact"><textarea disabled={readOnly} className={textareaClass} value={item.resultOutcome} onChange={e=>updateCase(index,'resultOutcome',e.target.value)}/></Field></div>
        {!complete&&!readOnly&&<div className="mt-4 text-xs leading-5 text-amber-700">Still needed: {missing.join(', ')}.</div>}
      </section>})}</div>

      {task.canEdit&&<section className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:justify-end"><button disabled={saving||submitting} onClick={()=>void saveDraft()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50"><Save className="h-4 w-4"/>Save draft</button><button disabled={saving||submitting||completed<task.requiredItems} onClick={()=>void submit()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white disabled:opacity-40"><Send className="h-4 w-4"/>{submitting?'Submitting...':'Submit portfolio for review'}</button></section>}
    </main>
  </div>;
}

function Summary({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-800">{value}</div></div>}
function Field({label,children}:{label:string;children:any}){return <label className="block text-xs font-black text-slate-700"><span>{label} *</span>{children}</label>}
