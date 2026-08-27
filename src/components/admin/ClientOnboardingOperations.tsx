import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, Mail, RefreshCw, RotateCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type OnboardingState = {
  exists?: boolean;
  id?: string;
  status?: string;
  inviteCount?: number;
  inviteLastSentAt?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  portalInviteCount?: number;
  portalInviteLastSentAt?: string | null;
  portalActivationClaimedAt?: string | null;
};

type OnboardingQueueItem = {
  projectId: string;
  projectNumber?: string;
  projectName?: string;
  projectStage?: string;
  projectStatus?: string;
  projectManagerId?: string | null;
  clientId?: string;
  clientName?: string;
  companyName?: string;
  email?: string;
  portalLinked?: boolean;
  verifiedFirstPayment?: boolean;
  onboarding?: OnboardingState;
};

function formatDate(value?: string | null) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not yet' : date.toLocaleString();
}

function statusClasses(status?: string) {
  if (status === 'Completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'In Progress') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function ClientOnboardingOperations() {
  const [items, setItems] = useState<OnboardingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('get_client_onboarding_operations_queue');
    if (rpcError) {
      setError(rpcError.message || 'Client onboarding operations could not be loaded.');
      setItems([]);
    } else {
      setItems(Array.isArray(data) ? data as OnboardingQueueItem[] : []);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    total: items.length,
    waiting: items.filter(item => !item.onboarding?.exists || ['Pending', 'In Progress'].includes(item.onboarding?.status || '')).length,
    completed: items.filter(item => item.onboarding?.status === 'Completed').length,
    portalActive: items.filter(item => item.portalLinked).length
  }), [items]);

  const resendOnboarding = async (item: OnboardingQueueItem) => {
    const key = `onboarding:${item.projectId}`;
    setBusyKey(key);
    setError('');
    setNotice('');
    const { error: rpcError } = await supabase.rpc('admin_send_client_onboarding', { p_project_id: item.projectId });
    if (rpcError) setError(rpcError.message || 'Client onboarding invitation could not be sent.');
    else {
      setNotice(`Onboarding invitation queued for ${item.projectNumber || item.projectName || 'the project'}.`);
      await load();
    }
    setBusyKey('');
  };

  const resendPortal = async (item: OnboardingQueueItem) => {
    if (!item.onboarding?.id) return;
    const key = `portal:${item.onboarding.id}`;
    setBusyKey(key);
    setError('');
    setNotice('');
    const { data, error: rpcError } = await supabase.rpc('admin_resend_client_portal_invitation', { p_onboarding_id: item.onboarding.id });
    if (rpcError) setError(rpcError.message || 'Portal activation invitation could not be sent.');
    else {
      const alreadyLinked = Boolean((data as any)?.alreadyLinked);
      setNotice(alreadyLinked ? 'This customer already has an active Client Portal.' : `Portal activation invitation queued for ${item.projectNumber || item.projectName || 'the project'}.`);
      await load();
    }
    setBusyKey('');
  };

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Client Onboarding Operations</div>
          <p className="mt-1 text-xs text-slate-500">Paid-project onboarding, invitation recovery and Client Portal activation status.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 md:grid-cols-4">
        <Metric label="Paid Projects" value={summary.total} />
        <Metric label="Needs Onboarding" value={summary.waiting} />
        <Metric label="Onboarding Complete" value={summary.completed} />
        <Metric label="Portal Active" value={summary.portalActive} />
      </div>

      {error && <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</div>}
      {notice && <div className="m-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{notice}</div>}

      {loading ? (
        <div className="flex min-h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /></div>
      ) : items.length === 0 ? (
        <div className="px-6 py-8 text-center text-xs text-slate-400">No paid projects are waiting for onboarding operations.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map(item => {
            const onboarding = item.onboarding || {};
            const status = onboarding.exists ? onboarding.status || 'Pending' : 'Not Created';
            const onboardingBusy = busyKey === `onboarding:${item.projectId}`;
            const portalBusy = onboarding.id ? busyKey === `portal:${onboarding.id}` : false;
            return (
              <div key={item.projectId} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-900">{item.projectNumber || 'Project'}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${statusClasses(status)}`}>{status}</span>
                    {item.portalLinked && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">Portal Active</span>}
                  </div>
                  <div className="mt-1 truncate text-sm font-bold text-slate-800">{item.projectName || item.companyName || 'ProFox project'}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500"><span>{item.companyName || item.clientName || 'Client'}</span><span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{item.email || 'No email'}</span><span>Stage: {item.projectStage || '—'}</span></div>
                </div>

                <div className="grid gap-1 text-[10px] text-slate-500 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" />Onboarding invite: {formatDate(onboarding.inviteLastSentAt)}</div>
                  <div className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" />Completed: {formatDate(onboarding.completedAt)}</div>
                  {!item.portalLinked && onboarding.status === 'Completed' && <div className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" />Portal invite: {formatDate(onboarding.portalInviteLastSentAt)}</div>}
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {status !== 'Completed' && (
                    <button type="button" disabled={Boolean(busyKey)} onClick={() => void resendOnboarding(item)} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-3.5 py-2 text-[10px] font-black text-white disabled:opacity-50">
                      {onboardingBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}{onboarding.exists ? 'Resend Onboarding' : 'Create & Send Onboarding'}
                    </button>
                  )}
                  {status === 'Completed' && !item.portalLinked && (
                    <button type="button" disabled={Boolean(busyKey)} onClick={() => void resendPortal(item)} className="inline-flex items-center gap-2 rounded-xl border border-[#000080] bg-white px-3.5 py-2 text-[10px] font-black text-[#000080] disabled:opacity-50">
                      {portalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Resend Portal Activation
                    </button>
                  )}
                  {item.portalLinked && <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[10px] font-black text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Portal Active</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-white px-4 py-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-lg font-black text-slate-900">{value}</div></div>;
}
