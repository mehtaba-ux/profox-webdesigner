import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, Loader2, Mail, ShieldAlert, XCircle } from 'lucide-react';
import { recruitmentTaskService, type AdminRecruitmentTask, type LeadResearchEntry } from '../../lib/recruitmentTaskService';

interface Props {
  task: AdminRecruitmentTask;
  candidateName: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

function fmt(value?: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function RecruitmentTaskReviewDialog({ task, candidateName, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [extensionHours, setExtensionHours] = useState(48);
  const [revokeReason, setRevokeReason] = useState('');

  useEffect(() => {
    if (task.status !== 'Submitted') return;
    void recruitmentTaskService.markUnderReview(task.id).then(onChanged).catch(() => undefined);
  }, [task.id]);

  const leads = useMemo(() => task.finalData?.leads || task.draftData?.leads || [], [task.finalData, task.draftData]);
  const editable = ['Issued','Viewed','In Progress'].includes(task.status);
  const submitted = Boolean(task.submittedAt && task.finalData);

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(message); await onChanged(); }
    catch (err: any) { setError(err?.message || 'The recruitment task action could not be completed.'); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[170] flex items-stretch justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
    <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-3xl">
      <header className="border-b border-slate-200 px-5 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.14em] text-[#000080]">Recruitment Practical Task</div><h2 className="mt-1 text-xl font-black text-slate-900">{task.title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{candidateName} · Attempt {task.attemptNo} · {task.status}</p></div><button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:text-slate-800"><XCircle className="h-5 w-5"/></button></div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 sm:p-7">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Issued" value={fmt(task.issuedAt)}/><Summary label="Due" value={fmt(task.dueAt)}/><Summary label="Submitted" value={fmt(task.submittedAt)}/><Summary label="Task version" value={`v${task.templateVersion || '1'}`}/></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Summary label="Target" value={`${task.targetNiche || 'Configured niche'} · ${task.targetMarket || 'Configured market'}`}/><Summary label="Expected work" value={`${task.requiredItems} leads · ${task.estimatedMinutes} minutes`}/></div>

        {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}
        {notice && <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>{notice}</div>}

        {task.retryFeedback && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-sm font-black text-amber-900">Retry feedback supplied to candidate</div><p className="mt-1 text-sm leading-6 text-amber-800">{task.retryFeedback}</p></div>}

        {editable && <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"><h3 className="text-sm font-black text-slate-900">Candidate task controls</h3><p className="mt-1 text-sm leading-6 text-slate-600">The candidate has not finally submitted this attempt. Resending or extending rotates the secure token so the previous link stops working.</p><div className="mt-4 grid gap-3 md:grid-cols-[auto_1fr_auto]"><button type="button" disabled={busy} onClick={()=>void run(()=>recruitmentTaskService.resend(task.id),'A new secure task link was emailed to the candidate.')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-[#000080] disabled:opacity-50"><Mail className="h-4 w-4"/>Resend Secure Link</button><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Clock3 className="h-4 w-4 text-slate-400"/><input type="number" min={1} max={336} value={extensionHours} onChange={e=>setExtensionHours(Number(e.target.value||48))} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"/><span className="text-xs font-bold text-slate-500">hours</span></label><button type="button" disabled={busy} onClick={()=>void run(()=>recruitmentTaskService.extendDeadline(task.id,extensionHours),`Deadline extended by ${extensionHours} hours and a new secure link was emailed.`)} className="min-h-11 rounded-xl bg-[#000080] px-4 text-sm font-bold text-white disabled:opacity-50">Extend Deadline</button></div><div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]"><input value={revokeReason} onChange={e=>setRevokeReason(e.target.value)} placeholder="Reason for revoking this active task" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-[#000080]"/><button type="button" disabled={busy||revokeReason.trim().length<5} onClick={()=>void run(()=>recruitmentTaskService.revoke(task.id,revokeReason),'Task revoked and recorded in the candidate audit trail.')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 disabled:opacity-40"><ShieldAlert className="h-4 w-4"/>Revoke Task</button></div></section>}

        {!submitted ? <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 text-sm leading-6 text-slate-700"><strong className="text-[#000080]">Submission not final yet.</strong> Draft content stays private to Recruitment and cannot be scored as a final assessment until the candidate submits this attempt.</section> : <section className="mt-6"><div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-black text-slate-900">Submitted lead research</h3><p className="mt-1 text-sm leading-6 text-slate-600">Review the evidence below, then score the candidate using the existing structured Recruitment assessment. Candidate answers and evaluator scoring remain separate records.</p></div><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800">{leads.length} submitted</span></div><div className="mt-4 space-y-4">{leads.map((lead,index)=><LeadCard key={index} lead={lead} index={index}/>)}</div></section>}
      </div>

      <footer className="border-t border-slate-200 bg-white px-5 py-4 sm:px-7"><div className="flex justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-[#000080] px-6 text-sm font-bold text-white">Close Review</button></div></footer>
    </div>
  </div>;
}

function LeadCard({ lead, index }: { lead: LeadResearchEntry; index: number }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-xs font-black uppercase tracking-wide text-[#000080]">Lead {index+1}</div><h4 className="mt-1 text-lg font-black text-slate-900">{lead.businessName || 'Unnamed business'}</h4><p className="mt-1 text-sm text-slate-500">{lead.niche} · {lead.location}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${lead.priority==='High'?'bg-emerald-100 text-emerald-800':lead.priority==='Medium'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-700'}`}>{lead.priority || 'No priority'}</span></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><Block title="Qualification" text={lead.fitReason}/><Block title="Qualification evidence" text={lead.qualificationSignals}/><Block title="Decision maker" text={`${lead.decisionMakerName} · ${lead.decisionMakerRole}`} link={lead.decisionMakerSourceUrl}/><Block title="Digital problem / opportunity" text={lead.digitalProblem}/><Block title="Recommended ProFox service" text={`${lead.serviceFit}\n${lead.serviceFitReason}`}/><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Research evidence</div><div className="mt-2 space-y-2">{lead.evidenceUrls.map((url,i)=><a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-start gap-2 break-all text-sm font-semibold text-[#000080] hover:underline"><ExternalLink className="mt-0.5 h-4 w-4 shrink-0"/>{url}</a>)}</div></div></div><a href={lead.website} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#000080] hover:underline"><ExternalLink className="h-4 w-4"/>Open business website</a></article>;
}

function Block({ title, text, link }: { title: string; text: string; link?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{text || 'Not provided'}</p>{link && <a href={link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 break-all text-sm font-semibold text-[#000080] hover:underline"><ExternalLink className="h-4 w-4"/>{link}</a>}</div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm font-bold leading-5 text-slate-900">{value}</div></div>;
}
