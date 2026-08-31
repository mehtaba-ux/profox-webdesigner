import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, Mail, Phone, RefreshCw, TimerReset } from 'lucide-react';
import { leadAssignmentService, type CRMFastResponseLead } from '../../../lib/leadAssignmentService';

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || fallback)
    : fallback;
}

function countdown(dueAt: string | null, now: number) {
  if (!dueAt) return { text: 'SLA starts when assigned', overdue: false, urgency: 'normal' as const };
  const remainingMs = new Date(dueAt).getTime() - now;
  const overdue = remainingMs <= 0;
  const absoluteMinutes = Math.max(0, Math.ceil(Math.abs(remainingMs) / 60000));
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  const amount = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  if (overdue) return { text: `${amount} overdue`, overdue: true, urgency: 'overdue' as const };
  if (absoluteMinutes <= 10) return { text: `${amount} remaining`, overdue: false, urgency: 'urgent' as const };
  return { text: `${amount} remaining`, overdue: false, urgency: 'normal' as const };
}

export default function CRMLeadFastResponseQueue() {
  const [leads, setLeads] = useState<CRMFastResponseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      setLeads(await leadAssignmentService.getMyFastResponseLeads());
    } catch (err) {
      setError(errorMessage(err, 'Your fast-response enquiries could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const refreshId = window.setInterval(() => void load(true), 30000);
    const timerId = window.setInterval(() => setNow(Date.now()), 15000);
    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(timerId);
    };
  }, []);

  const urgentCount = useMemo(
    () => leads.filter(lead => countdown(lead.firstResponseDueAt, now).urgency !== 'normal').length,
    [leads, now],
  );

  const accept = async (leadId: string) => {
    setBusyId(leadId);
    setError('');
    try {
      await leadAssignmentService.acceptLead(leadId);
      await load(true);
    } catch (err) {
      setError(errorMessage(err, 'The enquiry could not be accepted.'));
    } finally {
      setBusyId('');
    }
  };

  if (loading && leads.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-[#000080]" />Checking assigned enquiries…
        </div>
      </div>
    );
  }

  if (!loading && leads.length === 0 && !error) return null;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-rose-50 via-white to-amber-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">
              <TimerReset className="h-4 w-4" />Fast-response queue
            </div>
            <h2 className="mt-2 text-lg font-black text-slate-950">Respond while the enquiry is warm.</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              These website enquiries are assigned to you and still need their first customer response. Accept ownership, contact the prospect, then complete the customer-facing CRM activity to stop the timer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {urgentCount > 0 && <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-black text-rose-700">{urgentCount} urgent</span>}
            <button type="button" onClick={() => void load()} disabled={loading || Boolean(busyId)} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 disabled:opacity-50" aria-label="Refresh fast-response queue">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-5">
        {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {leads.map(lead => {
          const timer = countdown(lead.firstResponseDueAt, now);
          const accepted = Boolean(lead.acceptedAt);
          const timerClass = timer.urgency === 'overdue'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : timer.urgency === 'urgent'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-blue-100 bg-blue-50 text-[#000080]';

          return (
            <article key={lead.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-black text-slate-950">{lead.name}</h3>
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${lead.leadQuality === 'High' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : lead.leadQuality === 'Medium' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{lead.leadQuality} · {lead.leadScore}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${accepted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>{accepted ? 'Accepted / working' : 'Needs acceptance'}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{lead.company || 'Company not provided'}{lead.serviceInterest ? ` · ${lead.serviceInterest}` : ''}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-black ${timerClass}`}><Clock3 className="h-3.5 w-3.5" />{timer.text}</span>
                    {lead.firstResponseSlaMinutes && <span className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-500">Target: {lead.firstResponseSlaMinutes} min</span>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {!accepted && (
                    <button type="button" onClick={() => void accept(lead.id)} disabled={busyId === lead.id} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">
                      {busyId === lead.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Accept & work lead
                    </button>
                  )}
                  <a href={`mailto:${encodeURIComponent(lead.email)}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700"><Mail className="h-4 w-4" />Email</a>
                  {lead.phone && <a href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700"><Phone className="h-4 w-4" />Call</a>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
