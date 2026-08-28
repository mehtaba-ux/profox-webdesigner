import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Compass,
  Copy,
  EyeOff,
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
import {
  salesAccountSetupService,
  type ProfessionalMailboxFirstLogin,
  type SalesAccountSetupStatus,
} from '../../lib/salesAccountSetupService';
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
      <div><div className="text-sm font-black text-slate-900">{label}</div><div className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</div></div>
    </div>
  );
}

export default function SalesAccountSetup({ onCompleted }: { onCompleted?: () => Promise<void> | void }) {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [status, setStatus] = useState<SalesAccountSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [mailboxBusy, setMailboxBusy] = useState(false);
  const [mailboxCredential, setMailboxCredential] = useState<ProfessionalMailboxFirstLogin | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || '');
  const [reviewStep, setReviewStep] = useState(1);

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
      if (next.setupCompleted) await onCompleted?.();
    } catch (err) {
      setError(errorMessage(err, 'Your Sales account setup status could not be loaded.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => { setAvatarUrl(profile?.avatarUrl || ''); }, [profile?.avatarUrl]);
  useEffect(() => { setMailboxCredential(null); void load(); }, [user?.id]);

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

  const revealMailboxCredential = async () => {
    if (mailboxBusy) return;
    setMailboxBusy(true); setError(''); setMessage('');
    try {
      const credential = await salesAccountSetupService.getMyProfessionalMailboxFirstLogin();
      if (!credential.available || !credential.temporaryPassword) {
        setMailboxCredential(null);
        if (credential.reason === 'already_retrieved_or_existing_account') setMessage('No unretrieved first-login password is available. It may already have been retrieved, or this mailbox existed before ProFox provisioning.');
        else if (credential.reason === 'mailbox_not_active') setMessage('Your professional mailbox is not active yet. Refresh the setup checks after provisioning finishes.');
        else setMessage('A first-login password is not available. If you cannot sign in, contact a ProFox administrator for a secure reset.');
        await load(true);
        return;
      }
      setMailboxCredential(credential);
      setMessage('First-login password revealed. ProFox has removed the stored password from Vault. Copy it now and change it when you first sign in.');
      await load(true);
    } catch (err) {
      setError(errorMessage(err, 'Your first-login mailbox password could not be retrieved.'));
    } finally { setMailboxBusy(false); }
  };

  const copySecureValue = async (value: string, label: string) => {
    setError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser.');
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied to your clipboard.`);
    } catch (err) { setError(errorMessage(err, `${label} could not be copied.`)); }
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
    ...(status.professionalEmailRequired ? [status.professionalEmailReady, !status.professionalEmailCredentialPending] : []),
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
  const zohoMailboxReady = status.mailProvider === 'zoho' && status.professionalEmailReady && Boolean(status.workEmail);

  const mailboxAccessPanel = zohoMailboxReady ? (
    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" /><div className="min-w-0 flex-1"><div className="text-xs font-black text-slate-900">First login to Zoho Mail</div><p className="mt-1 text-[11px] leading-5 text-slate-600">The temporary password can be revealed only once. Reveal it only when you are ready to copy it and sign in.</p></div></div>
      {mailboxCredential?.available && mailboxCredential.temporaryPassword ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-amber-200 bg-white p-4">
          <div><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Work email</div><div className="mt-1 break-all text-sm font-black text-slate-900">{mailboxCredential.workEmail || status.workEmail}</div></div>
          <div><div className="text-[10px] font-black uppercase tracking-wide text-amber-700">Temporary password · visible once</div><div className="mt-1 break-all rounded-xl bg-slate-950 px-3 py-2.5 font-mono text-sm font-bold text-white">{mailboxCredential.temporaryPassword}</div></div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => void copySecureValue(mailboxCredential.workEmail || status.workEmail, 'Work email')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"><Copy className="h-4 w-4" />Copy email</button>
            <button type="button" onClick={() => void copySecureValue(mailboxCredential.temporaryPassword, 'Temporary password')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#000080] px-3 text-xs font-black text-white"><Copy className="h-4 w-4" />Copy password</button>
            <button type="button" onClick={() => setMailboxCredential(null)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"><EyeOff className="h-4 w-4" />Hide credential</button>
          </div>
        </div>
      ) : status.professionalEmailCredentialPending ? (
        <button type="button" onClick={() => void revealMailboxCredential()} disabled={mailboxBusy} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{mailboxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Reveal first-login password once</button>
      ) : <div className="mt-3 text-[11px] font-semibold text-emerald-700">First-login credential handoff is complete or this mailbox uses an existing password.</div>}
    </div>
  ) : null;

  if (status.setupCompleted) {
    return <div className="mx-auto max-w-3xl py-10"><div className="rounded-[32px] border border-emerald-200 bg-white p-8 text-center shadow-sm sm:p-10"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700"><BadgeCheck className="h-8 w-8" /></div><div className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Sales account ready</div><h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Your ProFox Sales workspace is ready.</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">Your professional identity, {calendarProviderLabel}, {meetingProviderLabel}, working availability and CRM orientation are verified. Keep these connections healthy so customers and the ProFox team can rely on your workspace.</p><button type="button" onClick={() => navigate('/admin/today')} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#000080] px-6 text-sm font-black text-white hover:bg-[#000066]">Open my Sales workspace <ArrowRight className="h-4 w-4" /></button></div></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-2 sm:py-4">
      <section className="overflow-hidden rounded-[32px] border border-blue-100 bg-white shadow-sm"><div className="bg-gradient-to-br from-[#000080] to-[#1111a8] px-5 py-7 text-white sm:px-8 sm:py-9"><div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-3xl"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200"><Sparkles className="h-4 w-4" />Welcome to your active Sales account</div><h1 className="mt-3 text-2xl font-black sm:text-3xl">Set up your workspace before you start selling.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">Complete these steps once so your professional email, calendar, customer meetings and CRM workflow are ready. Your progress is verified from the real system.</p></div><div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm lg:min-w-[220px]"><div className="flex items-center justify-between text-xs font-bold text-blue-100"><span>Account setup</span><span>{status.progressPercent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${status.progressPercent}%` }} /></div><div className="mt-2 text-[10px] leading-4 text-blue-200">{completedRequirements}/{requiredCount} technical requirements · {status.crmTourStep}/6 CRM guide steps</div></div></div></div></section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-800">{message}</div>}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">Part 1 · Mandatory account setup</div><h2 className="mt-1 text-xl font-black">Make your account customer-ready</h2><p className="mt-1 text-sm leading-6 text-slate-500">These checks come from the real mailbox, OAuth, provider and availability state.</p></div><button type="button" onClick={() => void load()} disabled={busy || photoSaving || mailboxBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 disabled:opacity-50"><RefreshCw className="h-4 w-4" />Refresh checks</button></div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#000080]"><UserRound className="h-5 w-5" /></div><div><div className="text-xs font-black uppercase tracking-wide text-[#000080]">Step A · Professional identity</div><h3 className="mt-1 text-lg font-black">Use a professional profile photo</h3><p className="mt-1 text-xs leading-5 text-slate-500">Customers and teammates will see this identity across ProFox.</p></div></div><div className="mt-5"><ProfileImageUploader value={avatarUrl} name={profile?.fullName || user?.email} onChange={url => void saveProfessionalPhoto(url)} disabled={photoSaving} professionalRequired /></div><div className="mt-4 grid gap-2"><Requirement complete={status.profilePhotoReady} label="Professional photo uploaded" detail="A clear, recent head-and-shoulders image is required." /><Requirement complete={status.timezoneReady} label="Timezone recorded" detail={`Current account timezone: ${profile?.timezone || 'Not set'}. Meeting times depend on this.`} /></div><button type="button" onClick={() => navigate('/admin/seller-profile')} className="mt-4 text-xs font-black text-[#000080] hover:underline">Review full profile & timezone →</button></div>

          {status.professionalEmailRequired && <div className="rounded-3xl border border-slate-200 p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Mail className="h-5 w-5" /></div><div><div className="text-xs font-black uppercase tracking-wide text-indigo-700">Step B · Professional email</div><h3 className="mt-1 text-lg font-black">Activate your ProFox mailbox</h3><p className="mt-1 text-xs leading-5 text-slate-500">Your professional mailbox is provisioned by ProFox. If a one-time password is waiting, retrieve it here exactly once.</p></div></div><div className="mt-5 grid gap-2"><Requirement complete={status.professionalEmailReady} label="Professional mailbox active" detail={status.workEmail || 'Your mailbox is still being provisioned.'} /><Requirement complete={!status.professionalEmailCredentialPending} label="First-login credential handoff complete" detail={status.professionalEmailCredentialPending ? 'Reveal and save the one-time password before continuing.' : 'No unretrieved temporary password remains in ProFox Vault.'} /></div>{mailboxAccessPanel}</div>}

          <div className="rounded-3xl border border-slate-200 p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><CalendarDays className="h-5 w-5" /></div><div><div className="text-xs font-black uppercase tracking-wide text-rose-700">Step {status.professionalEmailRequired ? 'C' : 'B'} · Calendar & meetings</div><h3 className="mt-1 text-lg font-black">Connect {calendarProviderLabel} + {meetingProviderLabel}</h3><p className="mt-1 text-xs leading-5 text-slate-500">Your provider is assigned by Admin. Connect it once so CRM meetings can synchronize without manual link copying.</p></div></div><div className="mt-5 grid gap-2"><Requirement complete={status.calendarConnected} label={`${calendarProviderLabel} connected`} detail={calendarAccountEmail || `Connect the ${calendarProviderLabel} account assigned to your ProFox work.`} /><Requirement complete={status.meetingReady} label={`${meetingProviderLabel} ready`} detail={status.meetingProvider === 'zoho_meeting' ? 'Zoho Calendar must report zmeeting conferencing capability.' : 'Eligible ProFox meetings must be able to create a Google Meet link.'} /><Requirement complete={status.availabilityReady} label="Working availability configured" detail={status.availabilityReady ? `Working hours saved${status.workStart && status.workEnd ? ` · ${status.workStart}–${status.workEnd}` : ''}.` : 'Set your working days, hours, buffers and booking availability.'} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{!status.calendarConnected ? <button type="button" onClick={() => void connectAssignedCalendar()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}Connect {calendarProviderLabel}</button> : !status.meetingReady ? <button type="button" onClick={() => void enableAssignedMeeting()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}Verify {meetingProviderLabel}</button> : <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 text-xs font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" />Calendar & meeting ready</div>}<button type="button" onClick={() => navigate('/admin/booking-setup')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700"><Clock3 className="h-4 w-4" />Set working availability</button></div><p className="mt-3 text-[10px] leading-4 text-slate-400">ProFox remains the authoritative CRM meeting record. External Calendar data is a synchronized layer.</p></div>
        </div>
      </section>

      <section className={`rounded-[28px] border bg-white p-5 shadow-sm sm:p-7 ${technicalReady ? 'border-slate-200' : 'border-amber-200'}`}>
        <div className="flex items-start gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${technicalReady ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'}`}><Compass className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">Part 2 · CRM guided tour</div><h2 className="mt-1 text-xl font-black">Learn the ProFox sales workflow</h2><p className="mt-1 text-sm leading-6 text-slate-500">Complete the six short steps in order.</p></div></div>
        {!technicalReady ? <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><div className="font-black text-amber-950">Finish the mandatory account setup first</div><p className="mt-1 text-sm leading-6 text-amber-800">The CRM tour unlocks after your professional identity{status.professionalEmailRequired ? ', professional mailbox and credential handoff' : ''}, {calendarProviderLabel}, {meetingProviderLabel} and working availability are verified.</p></div></div></div> : <div className="mt-6 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]"><div className="space-y-2">{CRM_TOUR.map((item, index) => { const step = index + 1; const completed = step <= status.crmTourStep; const active = step === reviewStep; return <button key={item.title} type="button" onClick={() => setReviewStep(step)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-[#000080] bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${completed ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-[#000080] text-white' : 'bg-slate-100 text-slate-500'}`}>{completed ? '✓' : step}</span><span className={`text-xs font-black ${active ? 'text-[#000080]' : 'text-slate-700'}`}>{item.title}</span></button>; })}</div><div className="rounded-3xl border border-slate-200 bg-slate-50/50 p-5 sm:p-7"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#000080] shadow-sm"><TourIcon className="h-5 w-5" /></div><div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">CRM guide · {reviewStep} of 6</div><h3 className="mt-1 text-lg font-black text-slate-950">{currentTour.title}</h3><div className="mt-1 text-xs font-bold text-[#000080]">{currentTour.location}</div></div></div><p className="mt-5 text-sm leading-7 text-slate-600">{currentTour.summary}</p><div className="mt-5 space-y-3">{currentTour.points.map(point => <div key={point} className="flex items-start gap-3 rounded-2xl bg-white p-4"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p className="text-sm leading-6 text-slate-600">{point}</p></div>)}</div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setReviewStep(Math.max(1, reviewStep - 1))} disabled={reviewStep === 1 || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 disabled:opacity-40"><ArrowLeft className="h-4 w-4" />Previous</button>{reviewStep <= status.crmTourStep ? <button type="button" onClick={() => setReviewStep(Math.min(6, reviewStep + 1))} disabled={reviewStep === 6} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white disabled:opacity-40">Review next <ArrowRight className="h-4 w-4" /></button> : reviewStep === status.crmTourStep + 1 ? <button type="button" onClick={() => void completeTourStep()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{reviewStep === 6 ? 'Complete CRM tour' : 'I understand — continue'} {!busy && reviewStep < 6 && <ArrowRight className="h-4 w-4" />}</button> : <button type="button" onClick={() => setReviewStep(Math.min(6, status.crmTourStep + 1))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-xs font-black text-white">Return to required step <ArrowRight className="h-4 w-4" /></button>}</div></div></div>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]" /><div><h3 className="text-sm font-black text-slate-900">Why this setup is mandatory</h3><p className="mt-1 text-xs leading-5 text-slate-500">A professional identity builds trust, professional email protects customer communication, accurate calendar authorization prevents scheduling failures, the configured meeting provider keeps customer links reliable, and disciplined CRM usage protects the customer journey.</p></div></div></section>
    </div>
  );
}
