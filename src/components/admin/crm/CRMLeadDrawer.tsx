import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, ExternalLink, Loader2, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CRMLeadDrawerBase, { type LeadDrawerTab } from './CRMLeadDrawerBase';

export type { LeadDrawerTab };

type Props = React.ComponentProps<typeof CRMLeadDrawerBase>;

type OnboardingHandoff = {
  exists?: boolean;
  onboardingId?: string;
  projectId?: string;
  projectNumber?: string;
  projectName?: string;
  status?: string;
  inviteCount?: number;
  inviteLastSentAt?: string | null;
  completedAt?: string | null;
  onboardingUrl?: string | null;
  linkAvailable?: boolean;
  canResend?: boolean;
};

function formatDate(value?: string | null) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not yet' : date.toLocaleString();
}

function safeOnboardingUrl(value?: string | null) {
  if (!value) return '';
  try {
    const target = new URL(value, window.location.origin);
    const allowedOrigins = new Set([
      window.location.origin,
      'https://www.profoxwebdesigner.com',
      'https://profoxwebdesigner.com',
    ]);
    if (!allowedOrigins.has(target.origin)) return '';
    if (!target.pathname.startsWith('/client-onboarding/')) return '';
    return target.toString();
  } catch {
    return '';
  }
}

export default function CRMLeadDrawer(props: Props) {
  return (
    <>
      <CRMLeadDrawerBase {...props} />
      <SellerOnboardingHandoff leadId={props.lead.id} onChanged={props.onChanged} />
    </>
  );
}

function SellerOnboardingHandoff({ leadId, onChanged }: { leadId: string; onChanged: (message: string) => Promise<void> }) {
  const [handoff, setHandoff] = useState<OnboardingHandoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('crm_get_lead_onboarding_handoff', { p_lead_id: leadId });
    if (rpcError) {
      setHandoff(null);
      setError(rpcError.message || 'Client onboarding status could not be loaded.');
    } else {
      setHandoff((data || null) as OnboardingHandoff | null);
    }
    setLoading(false);
  };

  useEffect(() => {
    setHandoff(null);
    setNotice('');
    void load();
  }, [leadId]);

  const onboardingUrl = useMemo(() => safeOnboardingUrl(handoff?.onboardingUrl), [handoff?.onboardingUrl]);
  const status = handoff?.status || 'Pending';
  const complete = status === 'Completed';

  const resend = async () => {
    if (!handoff?.canResend || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const { data, error: rpcError } = await supabase.rpc('crm_resend_lead_onboarding', { p_lead_id: leadId });
    if (rpcError) {
      setError(rpcError.message || 'Client onboarding invitation could not be resent.');
    } else {
      setHandoff((data || null) as OnboardingHandoff | null);
      setNotice('Fresh onboarding invitation sent from the canonical paid-project record.');
      await onChanged('Client onboarding invitation resent and recorded for this lead.');
    }
    setBusy(false);
  };

  const copyLink = async () => {
    if (!onboardingUrl) return;
    try {
      await navigator.clipboard.writeText(onboardingUrl);
      setError('');
      setNotice('Secure onboarding link copied.');
    } catch {
      setNotice('');
      setError('The onboarding link could not be copied. Open it and copy from the browser instead.');
    }
  };

  if (loading) {
    return (
      <div className="fixed bottom-5 right-5 z-[130] flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500 shadow-xl">
        <Loader2 className="h-4 w-4 animate-spin text-[#000080]" /> Checking client onboarding…
      </div>
    );
  }

  if (!handoff?.exists && !error) return null;

  return (
    <section className="fixed bottom-4 right-4 z-[130] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:bottom-5 sm:right-5">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Client Onboarding</div>
          {handoff?.exists && <div className="mt-1 truncate text-xs font-black text-slate-900">{handoff.projectNumber || 'Paid project'} · {handoff.projectName || 'ProFox project'}</div>}
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-50" aria-label="Refresh client onboarding"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>

      <div className="space-y-3 p-4">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold leading-5 text-rose-700">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold leading-5 text-emerald-700">{notice}</div>}

        {handoff?.exists && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'In Progress' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{status}</span>
              <span className="text-[10px] font-semibold text-slate-400">Invites: {Number(handoff.inviteCount || 0)}</span>
            </div>

            <div className="grid gap-1 text-[10px] leading-5 text-slate-500">
              <div>Last invite: {formatDate(handoff.inviteLastSentAt)}</div>
              {complete && <div>Completed: {formatDate(handoff.completedAt)}</div>}
            </div>

            {complete ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" />Customer onboarding is complete. Seller follow-up reminders are stopped.</div>
            ) : (
              <>
                {!onboardingUrl && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold leading-5 text-amber-800">No reusable onboarding link is available. Resend once to issue a fresh secure link.</div>}
                <div className="grid grid-cols-2 gap-2">
                  {onboardingUrl && <button type="button" onClick={() => window.open(onboardingUrl, '_blank', 'noopener,noreferrer')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#000080] px-3 text-[10px] font-black text-white"><ExternalLink className="h-3.5 w-3.5" />Open form</button>}
                  {onboardingUrl && <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700"><Clipboard className="h-3.5 w-3.5" />Copy link</button>}
                  {handoff.canResend && <button type="button" disabled={busy} onClick={() => void resend()} className={`${onboardingUrl ? 'col-span-2' : 'col-span-2'} inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#000080]/20 bg-blue-50 px-3 text-[10px] font-black text-[#000080] disabled:opacity-50`}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Resend onboarding invite</button>}
                </div>
                <p className="text-[9px] leading-4 text-slate-400">This uses the existing paid-project onboarding record. Resends are rate-limited server-side and do not create duplicate onboarding records.</p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
