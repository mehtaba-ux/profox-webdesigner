import { useState } from 'react';
import { CalendarClock, Eye, Loader2, RefreshCw, RotateCcw, ShieldX } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export type ContentPortfolioTaskControlRecord = {
  id: string;
  status: string;
  attemptNo: number;
  maxAttempts?: number;
  issuedAt?: string;
  dueAt?: string;
  viewedAt?: string;
  firstSavedAt?: string;
  lastSavedAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
};

type Props = {
  task: ContentPortfolioTaskControlRecord;
  isAdmin: boolean;
  onChanged: () => Promise<any> | any;
};

const ACTIVE_EDITABLE_STATUSES = ['Issued', 'Viewed', 'In Progress'];

function formatDate(value?: string) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ContentPortfolioTaskControls({ task, isAdmin, onChanged }: Props) {
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [extensionHours, setExtensionHours] = useState(24);
  const [revokeReason, setRevokeReason] = useState('');

  const activeEditable = ACTIVE_EDITABLE_STATUSES.includes(task.status);
  const canMarkUnderReview = task.status === 'Submitted';

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setNotice('');
    setError('');
    try {
      await action();
      setNotice(success);
      await onChanged();
    } catch (err: any) {
      setError(err?.message || 'The portfolio task action could not be completed.');
    } finally {
      setBusy('');
    }
  };

  const resend = () => run('resend', async () => {
    const { error: rpcError } = await supabase.rpc('admin_resend_recruitment_task', { p_task_id: task.id });
    if (rpcError) throw rpcError;
  }, 'A fresh secure Portfolio Review link has been queued for delivery. The previous link is invalid.');

  const extend = () => run('extend', async () => {
    const hours = Number(extensionHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 336) {
      throw new Error('Extension must be between 1 and 336 hours.');
    }
    const { error: rpcError } = await supabase.rpc('admin_extend_recruitment_task_deadline', {
      p_task_id: task.id,
      p_hours: hours,
    });
    if (rpcError) throw rpcError;
  }, 'Portfolio Review deadline extended and a fresh secure link has been queued.');

  const revoke = () => run('revoke', async () => {
    const reason = revokeReason.trim();
    if (reason.length < 5) throw new Error('Enter a clear revocation reason.');
    if (!window.confirm('Revoke this Portfolio Review request? The current secure link will stop working.')) {
      throw new Error('Revocation cancelled.');
    }
    const { error: rpcError } = await supabase.rpc('admin_revoke_recruitment_task', {
      p_task_id: task.id,
      p_reason: reason,
    });
    if (rpcError) throw rpcError;
  }, 'Portfolio Review request revoked and the secure link invalidated.');

  const markUnderReview = () => run('review', async () => {
    const { error: rpcError } = await supabase.rpc('admin_mark_recruitment_task_under_review', { p_task_id: task.id });
    if (rpcError) throw rpcError;
  }, 'Portfolio submission marked Under Review.');

  return <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Portfolio task control</div>
        <div className="mt-1 text-sm font-black text-slate-900">Attempt {task.attemptNo || 1} of {task.maxAttempts || 2} · {task.status}</div>
      </div>
      {!isAdmin&&<span className="rounded-full bg-slate-200 px-3 py-1 text-[10px] font-black text-slate-600">Admin controls restricted</span>}
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Timing label="Issued" value={formatDate(task.issuedAt)}/>
      <Timing label="Deadline" value={formatDate(task.dueAt)}/>
      <Timing label="First opened" value={formatDate(task.viewedAt)}/>
      <Timing label="First saved" value={formatDate(task.firstSavedAt)}/>
      <Timing label="Last saved" value={formatDate(task.lastSavedAt)}/>
      <Timing label="Submitted" value={formatDate(task.submittedAt)}/>
      <Timing label="Review started" value={formatDate(task.reviewedAt)}/>
    </div>

    {error&&<div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
    {notice&&<div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{notice}</div>}

    {isAdmin&&<div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button disabled={Boolean(busy)||!activeEditable} onClick={()=>void resend()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 disabled:opacity-40">
          {busy==='resend'?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}Resend Secure Link
        </button>
        {canMarkUnderReview&&<button disabled={Boolean(busy)} onClick={()=>void markUnderReview()} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs font-black text-[#000080] disabled:opacity-40">
          {busy==='review'?<Loader2 className="h-4 w-4 animate-spin"/>:<Eye className="h-4 w-4"/>}Mark Under Review
        </button>}
      </div>

      {activeEditable&&<div className="grid gap-2 lg:grid-cols-2">
        <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2">
          <input aria-label="Extension hours" type="number" min={1} max={336} value={extensionHours} onChange={e=>setExtensionHours(Number(e.target.value))} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"/>
          <button disabled={Boolean(busy)} onClick={()=>void extend()} className="inline-flex items-center gap-2 rounded-lg bg-[#000080] px-3 py-2 text-xs font-black text-white disabled:opacity-40">
            {busy==='extend'?<Loader2 className="h-4 w-4 animate-spin"/>:<CalendarClock className="h-4 w-4"/>}Extend Hours
          </button>
        </div>
        <div className="flex gap-2 rounded-xl border border-red-100 bg-white p-2">
          <input value={revokeReason} onChange={e=>setRevokeReason(e.target.value)} placeholder="Reason to revoke this request" className="min-w-0 flex-1 rounded-lg border border-red-100 px-3 py-2 text-xs"/>
          <button disabled={Boolean(busy)||revokeReason.trim().length<5} onClick={()=>void revoke()} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40">
            {busy==='revoke'?<Loader2 className="h-4 w-4 animate-spin"/>:<ShieldX className="h-4 w-4"/>}Revoke
          </button>
        </div>
      </div>}

      {!activeEditable&&!canMarkUnderReview&&<div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><RotateCcw className="h-4 w-4"/>This attempt is read-only because it has already been submitted, reviewed, completed, failed, retried, or revoked.</div>}
    </div>}
  </div>;
}

function Timing({label,value}:{label:string;value:string}){
  return <div className="rounded-xl border border-slate-100 bg-white p-3"><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><div className="mt-1 text-[11px] font-bold text-slate-700">{value}</div></div>;
}
