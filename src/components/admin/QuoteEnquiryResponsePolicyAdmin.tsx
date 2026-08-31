import React, { useEffect, useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, Clock3, Loader2, Save, ShieldAlert } from 'lucide-react';
import { leadAssignmentService, type QuoteResponsePolicy } from '../../lib/leadAssignmentService';

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || fallback)
    : fallback;
}

const DEFAULT_POLICY: QuoteResponsePolicy = {
  firstResponseSlaMinutes: 30,
  notifyManagersOnNewLead: true,
  notifyAssigneeOnAssignment: true,
  escalateOverdueToManagers: true,
};

export default function QuoteEnquiryResponsePolicyAdmin() {
  const [policy, setPolicy] = useState<QuoteResponsePolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        setPolicy(await leadAssignmentService.getQuoteResponsePolicy());
      } catch (err) {
        setError(errorMessage(err, 'The enquiry response policy could not be loaded.'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const save = async () => {
    if (!Number.isInteger(policy.firstResponseSlaMinutes) || policy.firstResponseSlaMinutes < 5 || policy.firstResponseSlaMinutes > 1440) {
      setError('First-response SLA must be a whole number between 5 and 1440 minutes.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      setPolicy(await leadAssignmentService.saveQuoteResponsePolicy(policy));
      setMessage('Fast-response policy saved. Existing assignment mode and seller/manager lists were preserved.');
    } catch (err) {
      setError(errorMessage(err, 'The enquiry response policy could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 via-white to-amber-50 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#000080] p-2.5 text-white"><Clock3 className="h-5 w-5" /></div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">Website enquiry response policy</div>
            <h2 className="mt-1 text-lg font-black text-slate-950">Protect every new quote request with a response SLA.</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">This uses the existing CRM assignment configuration. It does not change Manual vs Round Robin or who is eligible to receive leads.</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[#000080]" />Loading response policy…</div>
        ) : (
          <>
            {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
            {message && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}

            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="block text-xs font-black text-slate-900">First-response SLA</span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">The countdown starts when a website enquiry is assigned to a salesperson.</span>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    step={5}
                    value={policy.firstResponseSlaMinutes}
                    onChange={event => setPolicy(current => ({ ...current, firstResponseSlaMinutes: Number(event.target.value) }))}
                    className="h-11 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:border-[#000080]"
                  />
                  <span className="text-xs font-bold text-slate-500">minutes</span>
                </div>
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                  <input type="checkbox" checked={policy.notifyManagersOnNewLead} onChange={event => setPolicy(current => ({ ...current, notifyManagersOnNewLead: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#000080]" />
                  <span><BellRing className="mb-2 h-4 w-4 text-[#000080]" /><span className="block text-xs font-black text-slate-900">Alert management immediately</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">Notify Admin and configured assignment managers when a quote enquiry arrives.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                  <input type="checkbox" checked={policy.notifyAssigneeOnAssignment} onChange={event => setPolicy(current => ({ ...current, notifyAssigneeOnAssignment: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#000080]" />
                  <span><CheckCircle2 className="mb-2 h-4 w-4 text-[#000080]" /><span className="block text-xs font-black text-slate-900">Alert assigned seller</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">Notify the salesperson immediately after manual, bulk, equal or automatic assignment.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                  <input type="checkbox" checked={policy.escalateOverdueToManagers} onChange={event => setPolicy(current => ({ ...current, escalateOverdueToManagers: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#000080]" />
                  <span><ShieldAlert className="mb-2 h-4 w-4 text-[#000080]" /><span className="block text-xs font-black text-slate-900">Escalate missed SLA</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">Alert the seller plus Admin/configured managers if the first response becomes overdue.</span></span>
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[10px] leading-4 text-slate-600"><strong className="text-slate-900">Recommended default:</strong> 30 minutes, with all three alerts enabled. The normal CRM follow-up schedule continues after the first customer response.</div>
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save response policy</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
