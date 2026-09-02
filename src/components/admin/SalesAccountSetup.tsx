import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Compass,
  FileText,
  Handshake,
  KeyRound,
  ListTodo,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Video,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { googleCalendarService } from '../../lib/googleCalendarService';
import { zohoCalendarService } from '../../lib/zohoCalendarService';
import { profileService } from '../../lib/profileService';
import { professionalMailService, type ProfessionalMailSendStatus } from '../../lib/professionalMailService';
import { salesAccountSetupService, type SalesAccountSetupStatus } from '../../lib/salesAccountSetupService';
import ProfileImageUploader from './workspace/ProfileImageUploader';

const CRM_TOUR = [
  {
    title: 'Start every day from Today',
    location: 'CRM → Today — CRM Priorities',
    icon: ListTodo,
    summary: 'Use one command center for meetings, overdue follow-ups, new work and the next actions that need your attention.',
    points: [
      'Work the highest-priority and overdue items first instead of relying on memory.',
      'Open the related CRM record before contacting a prospect so you have the latest context.',
      'Finish each interaction by recording the outcome and the next action.',
    ],
  },
  {
    title: 'Keep Leads and Pipeline accurate',
    location: 'CRM → Leads / Opportunities',
    icon: UsersRound,
    summary: 'The CRM record is the source of truth for who the prospect is, what they need and where the opportunity stands.',
    points: [
      'Search before creating a lead so you do not create duplicates.',
      'Keep qualification, decision-maker, source and stage information factual and current.',
      'Move stages only when the real customer situation has changed—not just to make the pipeline look active.',
    ],
  },
  {
    title: 'Never leave a lead without a next step',
    location: 'CRM → Activities & Follow-Up',
    icon: Clock3,
    summary: 'Every meaningful sales interaction should leave a useful note, an outcome and a dated next activity.',
    points: [
      'Write concise notes that another ProFox team member can understand without asking you for context.',
      'Schedule the next follow-up before leaving the record whenever follow-up is required.',
      'Close or reschedule activities instead of leaving stale tasks behind.',
    ],
  },
  {
    title: 'Run meetings through the connected calendar',
    location: 'Calendar & Meetings',
    icon: CalendarDays,
    summary: 'Use the ProFox meeting workflow with your assigned calendar and meeting provider rather than creating disconnected meeting records.',
    points: [
      'Confirm the prospect timezone before scheduling.',
      'Use the configured meeting provider so the join link stays attached to the CRM meeting.',
      'Reschedule the existing meeting when plans change and record the outcome after the call.',
    ],
  },
  {
    title: 'Build quotations from approved commercial data',
    location: 'Sales → Catalog / Quotations / Payments',
    icon: FileText,
    summary: 'Use the approved catalog, pricing, project timeline and payment workflow instead of promising terms outside the system.',
    points: [
      'Select the correct package and add-ons, then confirm the automatically calculated project timeline.',
      'Review scope, commercial terms and customer details before sending the quotation.',
      'Treat payment status in ProFox as authoritative; never mark a sale Won based only on a verbal promise.',
    ],
  },
  {
    title: 'Close cleanly and hand over with context',
    location: 'CRM → Won / Handover / Commissions',
    icon: Handshake,
    summary: 'A good close ends with a complete handover so Delivery can serve the client without rebuilding the sales conversation.',
    points: [
      'Confirm verified payment and the final agreed scope before the Won transition.',
      'Preserve requirements, problems, decision-makers, timeline and important commercial notes for Delivery.',
      'Check your commissions and daily CRM hygiene, then start the next day from Today again.',
    ],
  },
] as const;

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || fallback);
  return fallback;
}

function Requirement({ complete, label, detail }: { complete: boolean; label: string; detail: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-3.5 ${complete ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-white'}`}>
      {complete ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
      <div>
        <div className="text-sm font-black text-slate-900">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</div>
      </div>
    </div>
  );
}

function mailConnectionLabel(status?: string | null) {
  if (status === 'connected') return 'Connected';
  if (status === 'reconnect_required') return 'Reconnect required';
  if (status === 'error') return 'Needs attention';
  return 'Not connected';
}

export default function SalesAccountSetup({ onCompleted }: { onCompleted?: () => Promise<void> | void }) {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [status, setStatus] = useState<SalesAccountSetupStatus | null>(null);
  const [mailStatus, setMailStatus] = useState<ProfessionalMailSendStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailError, setMailError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || '');
  const [reviewStep, setReviewStep] = useState(1);
  const oauthWindowRef = useRef<Window | null>(null);
  const oauthOriginRef = useRef('');
  const oauthPollRef = useRef<number | null>(null);

  const clearOAuthPoll = () => {
    if (oauthPollRef.current !== null) {
      window.clearInterval(oauthPollRef.current);
      oauthPollRef.current = null;
    }
  };

  const loadMailStatus = async (quiet = false) => {
    if (!quiet) setMailBusy(true);
    setMailError('');
    try {
      setMailStatus(await professionalMailService.getMyStatus());
    } catch (err) {
      setMailError(errorMessage(err, 'Professional email status could not be loaded.'));
    } finally {
      if (!quiet) setMailBusy(false);
    }
  };

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const next = await salesAccountSetupService.getMyStatus();
      setStatus(next);
      setReviewStep(current => {
        const nextRequired = Math.min(6, Math.max(1, next.crmTourStep + 1));
        return current < 1 || current > 6 ? nextRequired : current;
      });
      await loadMailStatus(true);
      if (next.setupCompleted) await onCompleted?.();
    } catch (err) {
      setError(errorMessage(err, 'Your Sales account setup status could not be loaded.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => { setAvatarUrl(profile?.avatarUrl || ''); }, [profile?.avatarUrl]);
  useEffect(() => { void load(); }, [user?.id]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== oauthWindowRef.current) return;
      if (oauthOriginRef.current && event.origin !== oauthOriginRef.current) return;
      if (event.data?.type !== 'profox-zoho-mail-send-oauth') return;

      clearOAuthPoll();
      setMailBusy(false);
      oauthWindowRef.current = null;
      oauthOriginRef.current = '';

      if (event.data?.success) {
        setMailError('');
        setMessage('Professional email activated. ProFox will now handle customer sending, reply synchronization and OAuth token refresh automatically.');
        void load(true);
      } else {
        setMessage('');
        setMailError(String(event.data?.message || 'Professional email permission was not connected.'));
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      clearOAuthPoll();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zoho = params.get('zoho');
    if (!zoho) return;
    if (zoho === 'connected') setMessage(params.get('meeting') === 'unavailable'
      ? 'Zoho Calendar connected, but this account did not report Zoho Meeting conferencing. Contact your ProFox administrator if Zoho Meeting is required.'
      : 'Zoho Calendar connected. Your assigned meeting capability is being verified.');
    if (zoho === 'error') setError(params.get('message') || 'Zoho Calendar connection was not completed.');
    params.delete('zoho'); params.delete('meeting'); params.delete('message');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    void load(true);
  }, []);

  const saveProfessionalPhoto = async (url: string) => {
    if (!user) return;
    setPhotoSaving(true); setError(''); setMessage('');
    try {
      const result = await profileService.updateMyProfile(user.id, { avatarUrl: url });
      if (result.error) throw result.error;
      setAvatarUrl(url);
      await refreshProfile();
      await load(true);
      setMessage('Professional profile photo saved. It will represent you across ProFox team, calendar and customer-facing views.');
    } catch (err) {
      setError(errorMessage(err, 'Your professional profile photo could not be saved.'));
    } finally { setPhotoSaving(false); }
  };

  const connectProfessionalEmail = async () => {
    if (mailBusy) return;
    setMailBusy(true); setMailError(''); setMessage('');
    try {
      const start = await professionalMailService.startAuthorization();
      oauthOriginRef.current = new URL(start.callbackUrl).origin;
      const popup = window.open(start.authorizeUrl, 'profox-zoho-professional-mail', 'popup=yes,width=680,height=760,resizable=yes,scrollbars=yes');
      if (!popup) throw new Error('Your browser blocked the Zoho authorization window. Allow pop-ups for ProFox and try again.');
      oauthWindowRef.current = popup;
      popup.focus();

      clearOAuthPoll();
      oauthPollRef.current = window.setInterval(() => {
        if (!oauthWindowRef.current?.closed) return;
        clearOAuthPoll();
        oauthWindowRef.current = null;
        oauthOriginRef.current = '';
        setMailBusy(false);
        void loadMailStatus(true);
      }, 500);
    } catch (err) {
      clearOAuthPoll();
      setMailBusy(false);
      oauthWindowRef.current = null;
      oauthOriginRef.current = '';
      setMailError(errorMessage(err, 'Professional email connection could not be started.'));
    }
  };

  const connectGoogle = async () => {
    const snapshot = await googleCalendarService.getSnapshot();
    const authorizationUrl = await googleCalendarService.startConnection(snapshot.connection.status === 'reconnect_required', '/admin/workspace');
    window.location.assign(authorizationUrl);
  };

  const connectAssignedCalendar = async () => {
    if (!status) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (status.calendarProvider === 'zoho') {
        const snapshot = await zohoCalendarService.getStatus();
        if (!snapshot.providerConfigured) throw new Error('Zoho OAuth is not configured by the Administrator yet.');
        if (snapshot.connection.status === 'reconnect_required' || snapshot.connection.status === 'error') await zohoCalendarService.reconnect('/admin/workspace');
        else await zohoCalendarService.connect('/admin/workspace');
        return;
      }
      await connectGoogle();
    } catch (err) {
      setError(errorMessage(err, `${status.calendarProvider === 'zoho' ? 'Zoho' : 'Google'} Calendar connection could not be started.`));
      setBusy(false);
    }
  };

  const enableAssignedMeeting = async () => {
    if (!status) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (status.meetingProvider === 'zoho_meeting') {
        const snapshot = await zohoCalendarService.getStatus();
        if (!snapshot.connection.connected) {
          setBusy(false);
          await connectAssignedCalendar();
          return;
        }
        if (!snapshot.connection.meetingEnabled) throw new Error('Zoho Meeting is not enabled by the ProFox Administrator yet.');
        if (!snapshot.connection.meetingReady) throw new Error('This Zoho account does not currently report Zoho Meeting conferencing capability. Reconnect after the plan/permission is available.');
        await load(true);
        setMessage('Zoho Meeting capability is verified. ProFox can request Meeting links for synchronized CRM meetings.');
        return;
      }
      const snapshot = await googleCalendarService.getSnapshot();
      if (snapshot.connection.status !== 'connected') throw new Error('Connect Google Calendar first.');
      await googleCalendarService.updatePreferences(snapshot.connection.syncEnabled !== false, true);
      await load(true);
      setMessage('Google Meet creation is enabled. ProFox can now create Meet links for eligible scheduled meetings.');
    } catch (err) {
      setError(errorMessage(err, 'The assigned meeting provider could not be enabled.'));
    } finally { setBusy(false); }
  };

  const completeTourStep = async () => {
    if (!status || busy) return;
    const expected = status.crmTourStep + 1;
    if (reviewStep !== expected) { setReviewStep(Math.min(6, expected)); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await salesAccountSetupService.advanceCrmTour(reviewStep);
      setStatus(next);
      if (reviewStep < 6) setReviewStep(reviewStep + 1);
      else setMessage('CRM guided tour complete. Your Sales account setup is now being verified.');
      if (next.setupCompleted) await onCompleted?.();
    } catch (err) {
      setError(errorMessage(err, 'This CRM tutorial step could not be completed.'));
    } finally { setBusy(false); }
  };

  const technicalChecks = useMemo(() => status ? [
    status.profilePhotoReady,
    status.timezoneReady,
    ...(status.professionalEmailRequired ? [status.professionalEmailReady, status.professionalEmailAuthorizedOnce] : []),
    status.calendarConnected,
    status.meetingReady,
    status.availabilityReady,
  ] : [], [status]);

  const technicalReady = technicalChecks.length > 0 && technicalChecks.every(Boolean);
  const completedRequirements = technicalChecks.filter(Boolean).length;
  const requiredCount = technicalChecks.length;
  const currentTour = CRM_TOUR[reviewStep - 1];
  const TourIcon = currentTour.icon;

  if (loading) return <div className="flex min-h-[520px] items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#000080]" /><p className="mt-3 text-sm font-semibold text-slate-500">Preparing your Sales workspace…</p></div></div>;
  if (!status) return <div className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error || 'Sales account setup is unavailable.'}</div>;

  const calendarProviderLabel = status.calendarProvider === 'zoho' ? 'Zoho Calendar' : 'Google Calendar';
  const meetingProviderLabel = status.meetingProvider === 'zoho_meeting' ? 'Zoho Meeting' : 'Google Meet';
  const calendarAccountEmail = status.calendarProvider === 'zoho' ? status.zohoAccountEmail : status.googleAccountEmail;
  const mailboxEligible = Boolean(mailStatus?.eligible);
  const mailboxActive = Boolean(mailStatus?.eligible && mailStatus.mailProvider === 'zoho' && mailStatus.mailboxStatus === 'active' && mailStatus.workEmail);
  const mailboxConnected = Boolean(mailboxActive && mailStatus?.sendConnected);
  const showMailboxCard = mailboxEligible || status.professionalEmailRequired || status.mailProvider === 'zoho' || Boolean(status.workEmail);
  const mailboxAuthorizedOnce = status.professionalEmailAuthorizedOnce;
  const mailboxConnectionStatus = mailStatus?.sendConnectionStatus || status.professionalEmailSendConnectionStatus;

  const professionalEmailCard = showMailboxCard ? (
    <div className="rounded-3xl border border-slate-200 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Mail className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-black uppercase tracking-wide text-indigo-700">Step B · Professional email</div>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${status.professionalEmailRequired ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{status.professionalEmailRequired ? 'Required' : 'Recommended'}</span>
          </div>
          <h3 className="mt-1 text-lg font-black">Activate once. Work from ProFox after that.</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Zoho opens only for the one-time consent to your exact professional mailbox. After approval, ProFox refreshes OAuth tokens, sends customer email and synchronizes replies automatically.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <Requirement complete={mailboxActive || status.professionalEmailReady} label="Professional mailbox active" detail={mailStatus?.workEmail || status.workEmail || 'Your professional mailbox is still being provisioned by ProFox.'} />
        <Requirement
          complete={mailboxAuthorizedOnce}
          label="One-time Zoho authorization completed"
          detail={mailboxAuthorizedOnce ? 'This exact professional mailbox has already been authorized. You do not need to manage Zoho day-to-day.' : 'Click Activate Professional Email once and approve the exact mailbox shown above.'}
        />
      </div>

      <div className={`mt-4 rounded-2xl border p-4 ${mailboxConnected ? 'border-emerald-200 bg-emerald-50/70' : mailboxAuthorizedOnce ? 'border-amber-200 bg-amber-50/70' : 'border-blue-100 bg-blue-50/60'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black text-slate-900"><KeyRound className="h-4 w-4 text-[#000080]" />ProFox Mail Connection</div>
            <div className={`mt-1 text-[11px] font-bold ${mailboxConnected ? 'text-emerald-700' : mailboxAuthorizedOnce ? 'text-amber-800' : 'text-slate-600'}`}>{mailConnectionLabel(mailboxConnectionStatus)}</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{mailboxConnected ? 'Ready for automatic customer sending and inbound reply synchronization inside ProFox.' : mailboxAuthorizedOnce ? 'Your one-time authorization is preserved. Reconnect Zoho to resume email; your CRM, Chat and Meetings access remains available.' : mailboxActive ? 'One approval is still needed. ProFox never asks you to store your Zoho password here.' : 'The mailbox must be active before OAuth authorization can start.'}</p>
          </div>
          {mailboxConnected ? (
            <div className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-100 px-4 text-xs font-black text-emerald-800"><CheckCircle2 className="h-4 w-4" />Connected</div>
          ) : (
            <button type="button" onClick={() => void connectProfessionalEmail()} disabled={mailBusy || !mailboxActive} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45">
              {mailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {mailboxAuthorizedOnce ? 'Reconnect Professional Email' : 'Activate Professional Email'}
            </button>
          )}
        </div>
      </div>
      {mailError && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] font-semibold leading-5 text-red-700">{mailError}</div>}
      <button type="button" onClick={() => navigate('/admin/seller-profile')} className="mt-4 text-xs font-black text-[#000080] hover:underline">Review professional email details →</button>
    </div>
  ) : null;

  if (status.setupCompleted) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-10">
        <div className="rounded-[32px] border border-emerald-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700"><BadgeCheck className="h-8 w-8" /></div>
          <div className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Sales account ready</div>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Your ProFox Sales workspace is ready.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">Your professional identity, {calendarProviderLabel}, {meetingProviderLabel}, working availability and CRM orientation are verified. Professional email health is handled separately so a future reconnect never locks you out of your workspace.</p>
          <button type="button" onClick={() => navigate('/admin/today')} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#000080] px-6 text-sm font-black text-white hover:bg-[#000066]">Open my Sales workspace <ArrowRight className="h-4 w-4" /></button>
        </div>
        {showMailboxCard && !mailboxConnected && (
          <div className="rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" />
              <div className="min-w-0 flex-1"><div className="text-sm font-black text-slate-900">Finish your one-time Professional Email activation</div><p className="mt-1 text-xs leading-5 text-slate-500">This does not block CRM, Chat or Meetings. Activate the mailbox once so customer email can run entirely inside ProFox.</p></div>
            </div>
            <button type="button" onClick={() => void connectProfessionalEmail()} disabled={mailBusy || !mailboxActive} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-45">{mailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{mailboxAuthorizedOnce ? 'Reconnect Professional Email' : 'Activate Professional Email'}</button>
            {mailError && <div className="mt-3 text-xs font-semibold text-red-700">{mailError}</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-2 sm:py-4">
      <section className="overflow-hidden rounded-[32px] border border-blue-100 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-[#000080] to-[#1111a8] px-5 py-7 text-white sm:px-8 sm:py-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200"><Sparkles className="h-4 w-4" />Welcome to your active Sales account</div>
              <h1 className="mt-3 text-2xl font-black sm:text-3xl">Set up your workspace before you start selling.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">Complete these steps once so your professional identity, customer communication, calendar, meetings and CRM workflow are ready. Professional email uses secure one-time OAuth—not mailbox password handling.</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm lg:min-w-[220px]">
              <div className="flex items-center justify-between text-xs font-bold text-blue-100"><span>Account setup</span><span>{status.progressPercent}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${status.progressPercent}%` }} /></div>
              <div className="mt-2 text-[10px] leading-4 text-blue-200">{completedRequirements}/{requiredCount} technical requirements · {status.crmTourStep}/6 CRM guide steps</div>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-800">{message}</div>}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">Part 1 · Account setup</div>
            <h2 className="mt-1 text-xl font-black">Make your account customer-ready</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">These checks come from the real mailbox, OAuth, provider and availability state.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy || photoSaving || mailBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 disabled:opacity-50"><RefreshCw className="h-4 w-4" />Refresh checks</button>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#000080]"><UserRound className="h-5 w-5" /></div>
              <div><div className="text-xs font-black uppercase tracking-wide text-[#000080]">Step A · Professional identity</div><h3 className="mt-1 text-lg font-black">Use a professional profile photo</h3><p className="mt-1 text-xs leading-5 text-slate-500">Customers and teammates will see this identity across ProFox.</p></div>
            </div>
            <div className="mt-5"><ProfileImageUploader value={avatarUrl} name={profile?.fullName || user?.email} onChange={url => void saveProfessionalPhoto(url)} disabled={photoSaving} professionalRequired /></div>
            <div className="mt-4 grid gap-2">
              <Requirement complete={status.profilePhotoReady} label="Professional photo uploaded" detail="A clear, recent head-and-shoulders image is required." />
              <Requirement complete={status.timezoneReady} label="Timezone recorded" detail={`Current account timezone: ${profile?.timezone || 'Not set'}. Meeting times depend on this.`} />
            </div>
            <button type="button" onClick={() => navigate('/admin/seller-profile')} className="mt-4 text-xs font-black text-[#000080] hover:underline">Review full profile & timezone →</button>
          </div>

          {professionalEmailCard}

          <div className="rounded-3xl border border-slate-200 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><CalendarDays className="h-5 w-5" /></div>
              <div><div className="text-xs font-black uppercase tracking-wide text-rose-700">Step {showMailboxCard ? 'C' : 'B'} · Calendar & meetings</div><h3 className="mt-1 text-lg font-black">Connect {calendarProviderLabel} + {meetingProviderLabel}</h3><p className="mt-1 text-xs leading-5 text-slate-500">Your provider is assigned by Admin. Connect it once so CRM meetings can synchronize without manual link copying.</p></div>
            </div>
            <div className="mt-5 grid gap-2">
              <Requirement complete={status.calendarConnected} label={`${calendarProviderLabel} connected`} detail={calendarAccountEmail || `Connect the ${calendarProviderLabel} account assigned to your ProFox work.`} />
              <Requirement complete={status.meetingReady} label={`${meetingProviderLabel} ready`} detail={status.meetingProvider === 'zoho_meeting' ? 'Zoho Calendar must report zmeeting conferencing capability.' : 'Eligible ProFox meetings must be able to create a Google Meet link.'} />
              <Requirement complete={status.availabilityReady} label="Working availability configured" detail={status.availabilityReady ? `Working hours saved${status.workStart && status.workEnd ? ` · ${status.workStart}–${status.workEnd}` : ''}.` : 'Set your working days, hours, buffers and booking availability.'} />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {!status.calendarConnected ? (
                <button type="button" onClick={() => void connectAssignedCalendar()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}Connect {calendarProviderLabel}</button>
              ) : !status.meetingReady ? (
                <button type="button" onClick={() => void enableAssignedMeeting()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}Verify {meetingProviderLabel}</button>
              ) : (
                <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 text-xs font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" />Calendar & meeting ready</div>
              )}
              <button type="button" onClick={() => navigate('/admin/booking-setup')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700"><Clock3 className="h-4 w-4" />Set working availability</button>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-400">ProFox remains the authoritative CRM meeting record. External Calendar data is a synchronized layer.</p>
          </div>
        </div>
      </section>

      <section className={`rounded-[28px] border bg-white p-5 shadow-sm sm:p-7 ${technicalReady ? 'border-slate-200' : 'border-amber-200'}`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${technicalReady ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'}`}><Compass className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">Part 2 · CRM guided tour</div><h2 className="mt-1 text-xl font-black">Learn the ProFox sales workflow</h2><p className="mt-1 text-sm leading-6 text-slate-500">Complete the six short steps in order.</p></div>
        </div>
        {!technicalReady ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><div className="font-black text-amber-950">Finish the mandatory account setup first</div><p className="mt-1 text-sm leading-6 text-amber-800">The CRM tour unlocks after your professional identity{status.professionalEmailRequired ? ', one-time professional email authorization' : ''}, {calendarProviderLabel}, {meetingProviderLabel} and working availability are verified.</p></div></div>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div className="space-y-2">
              {CRM_TOUR.map((item, index) => {
                const step = index + 1;
                const completed = step <= status.crmTourStep;
                const active = step === reviewStep;
                return <button key={item.title} type="button" onClick={() => setReviewStep(step)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-[#000080] bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${completed ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-[#000080] text-white' : 'bg-slate-100 text-slate-500'}`}>{completed ? '✓' : step}</span><span className={`text-xs font-black ${active ? 'text-[#000080]' : 'text-slate-700'}`}>{item.title}</span></button>;
              })}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50/50 p-5 sm:p-7">
              <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#000080] shadow-sm"><TourIcon className="h-5 w-5" /></div><div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">CRM guide · {reviewStep} of 6</div><h3 className="mt-1 text-lg font-black text-slate-950">{currentTour.title}</h3><div className="mt-1 text-xs font-bold text-[#000080]">{currentTour.location}</div></div></div>
              <p className="mt-5 text-sm leading-7 text-slate-600">{currentTour.summary}</p>
              <div className="mt-5 space-y-3">{currentTour.points.map(point => <div key={point} className="flex items-start gap-3 rounded-2xl bg-white p-4"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p className="text-sm leading-6 text-slate-600">{point}</p></div>)}</div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={() => setReviewStep(Math.max(1, reviewStep - 1))} disabled={reviewStep === 1 || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 disabled:opacity-40"><ArrowLeft className="h-4 w-4" />Previous</button>
                {reviewStep <= status.crmTourStep ? (
                  <button type="button" onClick={() => setReviewStep(Math.min(6, reviewStep + 1))} disabled={reviewStep === 6} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white disabled:opacity-40">Review next <ArrowRight className="h-4 w-4" /></button>
                ) : reviewStep === status.crmTourStep + 1 ? (
                  <button type="button" onClick={() => void completeTourStep()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{reviewStep === 6 ? 'Complete CRM tour' : 'I understand — continue'} {!busy && reviewStep < 6 && <ArrowRight className="h-4 w-4" />}</button>
                ) : (
                  <button type="button" onClick={() => setReviewStep(Math.min(6, status.crmTourStep + 1))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-xs font-black text-white">Return to required step <ArrowRight className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]" /><div><h3 className="text-sm font-black text-slate-900">Why this setup is mandatory</h3><p className="mt-1 text-xs leading-5 text-slate-500">A professional identity builds trust, secure OAuth protects customer email, accurate calendar authorization prevents scheduling failures, the configured meeting provider keeps customer links reliable, and disciplined CRM usage protects the customer journey.</p></div></div>
      </section>
    </div>
  );
}
