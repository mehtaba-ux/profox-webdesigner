import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Clipboard, ExternalLink, Loader2, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomerCommunicationDrawer from '../CustomerCommunicationDrawer';
import SellerCustomerLifecycleSummary from '../SellerCustomerLifecycleSummary';
import CRMLeadDrawerBase, { type LeadDrawerTab } from './CRMLeadDrawerBase';

export type { LeadDrawerTab };

type Props = Omit<React.ComponentProps<typeof CRMLeadDrawerBase>, 'onOpenConversation' | 'headerSummary' | 'overviewSidebarExtra'>;

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
  const [conversationOpen, setConversationOpen] = useState(false);
  const customerLabel = props.lead.contactName || props.lead.companyName || props.lead.title;

  useEffect(() => {
    setConversationOpen(false);
  }, [props.lead.id]);

  return (
    <>
      <CRMLeadDrawerBase
        {...props}
        onOpenConversation={() => setConversationOpen(true)}
        headerSummary={(
          <SellerCustomerLifecycleSummary
            leadId={props.lead.id}
            compact
            collapsible
            defaultExpanded={false}
          />
        )}
      />
      <SellerOnboardingHandoff leadId={props.lead.id} onChanged={props.onChanged} />
      {conversationOpen && <CustomerCommunicationDrawer leadId={props.lead.id} customerLabel={customerLabel} onClose={() => setConversationOpen(false)} />}
    </>
  );
}

function SellerOnboardingHandoff({ leadId, onChanged }: { leadId: string; onChanged: (message: string) => Promise<void> }) {
  const [handoff, setHandoff] = useState<OnboardingHandoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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
    setExpanded(false);
    setDismissed(false);
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

  if (dismissed) return null;

  if (loading) {
    return (
      <section className="fixed bottom-4 right-4 z-[130] flex w-[calc(100%-2rem)] max-w-[420px] items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-xs font-bold text-slate-500 shadow-2xl backdrop-blur sm:bottom-5 sm:right-5">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#000080]" />
        <span className="min-w-0 flex-1 truncate">Checking client onboarding…</span>
        <button type="button" onClick={() => setDismissed(true)} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close client onboarding"><X className="h-4 w-4" /></button>
      </section>
    );
  }

  if (!handoff?.exists && !error) return null;

  return (
    <section className="fixed bottom-4 right-4 z-[130] w-[calc(100%-2rem)] max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur sm:bottom-5 sm:right-5">
      <div className={`flex min-w-0 items-center gap-3 px-3 py-3 ${expanded ? 'border-b border-slate-100 bg-slate-50/80' : 'bg-white/95'}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#000080]"><ShieldCheck className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.14em] text-[#000080]">Client Onboarding</span>
            {handoff?.exists && <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'In Progress' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{status}</span>}
          </div>
          <div className="mt-0.5 truncate text-[10px] font-bold text-slate-500">{handoff?.exists ? `${handoff.projectNumber || 'Paid project'} · ${handoff.projectName || 'ProFox project'}` : error || 'Onboarding status unavailable'}</div>
        </div>
        {expanded && (
          <button type="button" onClick={() => void load()} disabled={loading || busy} className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh client onboarding"><RefreshCw className="h-3.5 w-3.5" /></button>
        )}
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Minimize client onboarding' : 'Expand client onboarding'}
          className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition hover:bg-slate-50 hover:text-[#000080]"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Close client onboarding"><X className="h-4 w-4" /></button>
      </div>

      {expanded && (
        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-4">
          {error && <div className="break-words rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold leading-5 text-rose-700">{error}</div>}
          {notice && <div className="break-words rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold leading-5 text-emerald-700">{notice}</div>}

          {handoff?.exists && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'In Progress' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{status}</span>
                <span className="text-[10px] font-semibold text-slate-400">Invites: {Number(handoff.inviteCount || 0)}</span>
              </div>

              <div className="grid gap-1 break-words text-[10px] leading-5 text-slate-500">
                <div>Last invite: {formatDate(handoff.inviteLastSentAt)}</div>
                {complete && <div>Completed: {formatDate(handoff.completedAt)}</div>}
              </div>

              {complete ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-black leading-5 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">Customer onboarding is complete. Seller follow-up reminders are stopped.</span></div>
              ) : (
                <>
                  {!onboardingUrl && <div className="break-words rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold leading-5 text-amber-800">No reusable onboarding link is available. Resend once to issue a fresh secure link.</div>}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {onboardingUrl && <button type="button" onClick={() => window.open(onboardingUrl, '_blank', 'noopener,noreferrer')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#000080] px-3 text-[10px] font-black text-white"><ExternalLink className="h-3.5 w-3.5" />Open form</button>}
                    {onboardingUrl && <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700"><Clipboard className="h-3.5 w-3.5" />Copy link</button>}
                    {handoff.canResend && <button type="button" disabled={busy} onClick={() => void resend()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#000080]/20 bg-blue-50 px-3 text-[10px] font-black text-[#000080] disabled:opacity-50 sm:col-span-2">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Resend onboarding invite</button>}
                  </div>
                  <p className="break-words text-[9px] leading-4 text-slate-400">This uses the existing paid-project onboarding record. Resends are rate-limited server-side and do not create duplicate onboarding records.</p>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
