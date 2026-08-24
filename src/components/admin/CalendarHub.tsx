import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  ListTodo,
  Loader2,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Unplug,
  UsersRound
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { googleCalendarService, type GoogleCalendarIntegrationSnapshot, type GoogleCalendarProviderSetup } from '../../lib/googleCalendarService';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];

function dateTime(value?: string | null) {
  if (!value) return 'Not yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function CalendarHub() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading } = useAuth();
  const allowed = Boolean(user && (isAdmin || (profile?.status === 'active' && SELLER_ROLES.includes(profile?.role || ''))));
  const [googleSnapshot, setGoogleSnapshot] = useState<GoogleCalendarIntegrationSnapshot | null>(null);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [googleMessage, setGoogleMessage] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [createMeet, setCreateMeet] = useState(true);
  const [providerSetup, setProviderSetup] = useState<GoogleCalendarProviderSetup | null>(null);
  const [providerClientId, setProviderClientId] = useState('');
  const [providerClientSecret, setProviderClientSecret] = useState('');
  const [providerSaving, setProviderSaving] = useState(false);

  const loadGoogle = useCallback(async () => {
    if (!allowed) return;
    setGoogleLoading(true);
    setGoogleError('');
    try {
      const [snapshot, setup] = await Promise.all([
        googleCalendarService.getSnapshot(),
        isAdmin ? googleCalendarService.getProviderSetup() : Promise.resolve(null)
      ]);
      setGoogleSnapshot(snapshot);
      setProviderSetup(setup);
      setSyncEnabled(snapshot.connection.syncEnabled !== false);
      setCreateMeet(snapshot.connection.createMeet !== false);
    } catch (error: any) {
      setGoogleError(error?.message || 'Google Calendar status could not be loaded.');
    } finally {
      setGoogleLoading(false);
    }
  }, [allowed, isAdmin]);

  useEffect(() => {
    if (!loading && allowed) void loadGoogle();
  }, [loading, allowed, loadGoogle]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get('google');
    if (!google) return;
    if (google === 'connected') setGoogleMessage('Google Calendar connected. ProFox Calendar remains the primary scheduling system.');
    if (google === 'disconnected') setGoogleMessage('Google Calendar disconnected. ProFox Calendar continues normally.');
    if (google === 'error') setGoogleError(params.get('message') || 'Google Calendar connection was not completed.');
    params.delete('google');
    params.delete('message');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);

  if (loading) return <div className="min-h-screen bg-slate-50" />;
  if (!allowed) return <Navigate to="/admin/workspace" replace />;

  const connection = googleSnapshot?.connection;
  const health = googleSnapshot?.health;
  const connected = connection?.status === 'connected';
  const reconnectRequired = connection?.status === 'reconnect_required';

  const connectGoogle = async () => {
    setGoogleError('');
    setGoogleMessage('');
    setGoogleSaving(true);
    try {
      const authorizationUrl = await googleCalendarService.startConnection(reconnectRequired);
      window.location.assign(authorizationUrl);
    } catch (error: any) {
      setGoogleError(error?.message || 'Google Calendar connection could not be started.');
      setGoogleSaving(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!window.confirm('Disconnect Google Calendar? ProFox Calendar, bookings and CRM follow-ups will continue normally.')) return;
    setGoogleSaving(true);
    setGoogleError('');
    setGoogleMessage('');
    try {
      await googleCalendarService.disconnect();
      setGoogleMessage('Google Calendar disconnected. ProFox Calendar remains active.');
      await loadGoogle();
    } catch (error: any) {
      setGoogleError(error?.message || 'Google Calendar could not be disconnected.');
    } finally {
      setGoogleSaving(false);
    }
  };

  const saveGooglePreferences = async () => {
    setGoogleSaving(true);
    setGoogleError('');
    setGoogleMessage('');
    try {
      const next = await googleCalendarService.updatePreferences(syncEnabled, createMeet);
      setGoogleSnapshot(current => current ? { ...current, connection: next } : current);
      setGoogleMessage('Google Calendar preferences saved.');
    } catch (error: any) {
      setGoogleError(error?.message || 'Google Calendar preferences could not be saved.');
    } finally {
      setGoogleSaving(false);
    }
  };

  const syncGoogleNow = async () => {
    setGoogleSyncing(true);
    setGoogleError('');
    setGoogleMessage('');
    try {
      await googleCalendarService.syncNow();
      setGoogleMessage('Google Calendar synchronization was queued.');
      await loadGoogle();
    } catch (error: any) {
      setGoogleError(error?.message || 'Google Calendar synchronization could not be queued.');
    } finally {
      setGoogleSyncing(false);
    }
  };

  const saveProviderSetup = async () => {
    setProviderSaving(true);
    setGoogleError('');
    setGoogleMessage('');
    try {
      const next = await googleCalendarService.saveProviderSetup(providerClientId, providerClientSecret);
      setProviderSetup(next);
      setProviderClientId('');
      setProviderClientSecret('');
      setGoogleSnapshot(current => current ? { ...current, providerConfigured: next.configured } : current);
      setGoogleMessage('Google OAuth provider configured securely. Salespeople can now connect their own Google Calendar.');
    } catch (error: any) {
      setGoogleError(error?.message || 'Google OAuth provider configuration could not be saved.');
    } finally {
      setProviderSaving(false);
    }
  };

  const copyRedirectUri = async () => {
    const value = googleSnapshot?.redirectUri || '';
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setGoogleMessage('Google OAuth redirect URI copied.');
  };

  const cards = [
    {
      title: 'Today',
      description: 'See meetings, overdue follow-ups, new bookings, quotation actions and alerts in priority order.',
      icon: ListTodo,
      action: () => navigate('/admin/today'),
      tone: 'bg-violet-50 text-violet-700 border-violet-200'
    },
    {
      title: 'My Meetings',
      description: 'Open scheduled meetings, outcomes, follow-ups and rescheduling.',
      icon: CalendarDays,
      action: () => navigate('/admin/meetings'),
      tone: 'bg-rose-50 text-rose-700 border-rose-200'
    },
    {
      title: 'Booking Setup',
      description: 'Manage your public expert profile, working hours, buffers and time off.',
      icon: UsersRound,
      action: () => navigate('/admin/booking-setup'),
      tone: 'bg-blue-50 text-[#000080] border-blue-200'
    },
    {
      title: 'Public Booking Page',
      description: 'Preview the service-first visitor experience, specialist selection and live availability.',
      icon: ExternalLink,
      action: () => window.open('/book-a-meeting','_blank','noopener,noreferrer'),
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    ...(isAdmin ? [
      {
        title: 'Booking Flow Settings',
        description: 'Control qualification questions, slot policy and public booking availability.',
        icon: SlidersHorizontal,
        action: () => navigate('/admin/booking-settings'),
        tone: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
      },
      {
        title: 'Booking Analytics',
        description: 'Measure service selection, specialist selection, slot selection and completed-booking conversion.',
        icon: BarChart3,
        action: () => navigate('/admin/booking-analytics'),
        tone: 'bg-amber-50 text-amber-700 border-amber-200'
      },
      {
        title: 'Notifications & Automation',
        description: 'Manage email provider, reminders, follow-up timing, templates, retry rules and delivery health.',
        icon: BellRing,
        action: () => navigate('/admin/automation-settings'),
        tone: 'bg-cyan-50 text-cyan-700 border-cyan-200'
      }
    ] : [])
  ];

  return <div className="profox-app-shell min-h-screen bg-[#f3f7fc] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl items-center gap-3"><button onClick={()=>navigate('/admin/workspace')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-xl font-black">Calendar & Meetings</h1><p className="text-xs text-slate-500">Native scheduling, seller productivity, public booking and optional Google synchronization in one connected workspace.</p></div></div></header>
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5 sm:p-6"><div className="flex items-start gap-3"><div className="rounded-2xl bg-white p-2.5 text-[#000080] shadow-sm"><Settings2 className="h-5 w-5"/></div><div><h2 className="font-black text-[#000080]">ProFox Calendar stays in control</h2><p className="mt-1 text-sm leading-6 text-blue-800">Public booking, availability, reminders and CRM follow-up work natively. Google Calendar is an optional synchronization layer, never a dependency and never the source of ProFox meeting truth.</p></div></div></div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards.map(card=>{const Icon=card.icon;return <button key={card.title} onClick={card.action} className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${card.tone}`}><Icon className="h-5 w-5"/></div><h3 className="mt-5 text-lg font-black">{card.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p><div className="mt-5 text-xs font-black text-[#000080]">Open workspace →</div></button>;})}</div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-blue-50 p-2.5 text-[#000080]"><CalendarDays className="h-5 w-5" /></div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">Optional integration</div>
              <h2 className="mt-1 text-lg font-black">Google Calendar & Google Meet</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Keep Google busy time in availability checks and synchronize eligible ProFox meetings to Google. ProFox remains the authoritative calendar; imported Google data is busy-only and does not replace CRM or meeting records.</p>
            </div>
          </div>
          {googleLoading ? <Loader2 className="h-5 w-5 animate-spin text-[#000080]" /> : <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${connected ? 'bg-emerald-100 text-emerald-800' : reconnectRequired ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{connected ? 'Connected' : reconnectRequired ? 'Reconnect required' : 'Not connected'}</span>}
        </div>

        {googleError && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold leading-5 text-red-700">{googleError}</div>}
        {googleMessage && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold leading-5 text-emerald-800">{googleMessage}</div>}

        {isAdmin && <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-black text-indigo-950"><KeyRound className="h-4 w-4"/>Admin Google provider setup</div><p className="mt-2 max-w-3xl text-[11px] leading-5 text-indigo-800">Create a Google OAuth Web application, enable Google Calendar API, and add the redirect URI below. The client secret is stored in Supabase Vault and is never returned to this page.</p></div><span className={`w-fit rounded-full px-3 py-1 text-[9px] font-black uppercase ${providerSetup?.configured || googleSnapshot?.providerConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{providerSetup?.configured || googleSnapshot?.providerConfigured ? 'Provider ready' : 'Setup required'}</span></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="block text-[10px] font-black uppercase tracking-wide text-indigo-900">OAuth client ID<input value={providerClientId} onChange={event=>setProviderClientId(event.target.value)} placeholder={providerSetup?.clientIdHint || '123456789.apps.googleusercontent.com'} className="mt-1.5 h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#000080]"/></label>
            <label className="block text-[10px] font-black uppercase tracking-wide text-indigo-900">OAuth client secret<input type="password" autoComplete="new-password" value={providerClientSecret} onChange={event=>setProviderClientSecret(event.target.value)} placeholder={providerSetup?.secretStored ? 'Stored securely — leave blank to keep it' : 'Enter the Google client secret'} className="mt-1.5 h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#000080]"/></label>
          </div>
          <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-3"><div className="text-[9px] font-black uppercase tracking-wide text-indigo-500">Authorized redirect URI</div><div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-[11px] text-slate-700">{googleSnapshot?.redirectUri || 'Loading redirect URI...'}</code><button type="button" onClick={()=>void copyRedirectUri()} disabled={!googleSnapshot?.redirectUri} className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50" title="Copy redirect URI"><Copy className="h-4 w-4"/></button></div></div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={()=>void saveProviderSetup()} disabled={providerSaving || (!providerSetup?.configured && (!providerClientId.trim() || !providerClientSecret.trim()))} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{providerSaving?<Loader2 className="h-4 w-4 animate-spin"/>:<KeyRound className="h-4 w-4"/>}Save Google provider</button><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 text-xs font-black text-indigo-800"><ExternalLink className="h-4 w-4"/>Open Google Cloud credentials</a></div>
        </div>}

        {!googleLoading && !connected && !reconnectRequired && <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
          <h3 className="text-sm font-black">Connect only if you want Google synchronization</h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">Native ProFox booking and meetings already work without Google. OAuth credentials remain server-side; refresh tokens are stored through the secure backend.</p>
          <button onClick={() => void connectGoogle()} disabled={googleSaving || googleSnapshot?.providerConfigured === false} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{googleSaving ? <Loader2 className="h-4 w-4 animate-spin"/> : <CalendarDays className="h-4 w-4"/>}Connect Google Calendar</button>
          {googleSnapshot?.providerConfigured === false && <p className="mt-3 text-[11px] font-semibold text-amber-700">Google OAuth provider credentials are not configured on the server yet. ProFox Calendar remains fully available.</p>}
        </div>}

        {!googleLoading && reconnectRequired && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-black text-amber-950">Google authorization needs to be renewed</h3>
          <p className="mt-2 text-xs leading-5 text-amber-800">{connection?.lastError || 'The Google grant or token can no longer be used. Reconnect the account; ProFox Calendar is unaffected.'}</p>
          <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void connectGoogle()} disabled={googleSaving || googleSnapshot?.providerConfigured === false} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Reconnect Google Calendar</button><button onClick={() => void disconnectGoogle()} disabled={googleSaving} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-black text-amber-900"><Unplug className="h-4 w-4"/>Disconnect</button></div>
        </div>}

        {!googleLoading && connected && <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-black">Connected account</div><div className="mt-1 text-sm font-semibold text-slate-700">{connection?.accountEmail || 'Google account'}</div><div className="mt-1 text-[10px] text-slate-400">Primary calendar · {connection?.calendarTimezone || 'timezone not reported'}</div></div><CheckCircle2 className="h-5 w-5 text-emerald-600"/></div>
            <div className="mt-5 space-y-4">
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"><input type="checkbox" checked={syncEnabled} onChange={event=>setSyncEnabled(event.target.checked)} className="mt-0.5"/><div><div className="text-xs font-black">Synchronize with Google Calendar</div><div className="mt-1 text-[11px] leading-5 text-slate-500">Use Google busy time for availability and keep eligible ProFox meetings synchronized.</div></div></label>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"><input type="checkbox" checked={createMeet} onChange={event=>setCreateMeet(event.target.checked)} className="mt-0.5"/><div><div className="text-xs font-black">Create Google Meet when applicable</div><div className="mt-1 text-[11px] leading-5 text-slate-500">Request a Google Meet conference for synchronized ProFox sales meetings when no existing meeting link should be preserved.</div></div></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void saveGooglePreferences()} disabled={googleSaving} className="rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{googleSaving ? 'Saving…' : 'Save preferences'}</button><button onClick={() => void syncGoogleNow()} disabled={googleSyncing || !syncEnabled} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-50">{googleSyncing ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}Sync now</button><button onClick={() => void disconnectGoogle()} disabled={googleSaving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-700 disabled:opacity-50"><Unplug className="h-4 w-4"/>Disconnect</button></div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Synchronization health</div>
            <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-black">{health?.pendingJobs || 0}</div><div className="mt-1 text-[9px] font-black uppercase text-slate-400">Pending jobs</div></div><div className={`rounded-xl p-3 ${(health?.failedJobs || 0) > 0 ? 'bg-red-50' : 'bg-slate-50'}`}><div className={`text-xl font-black ${(health?.failedJobs || 0) > 0 ? 'text-red-700' : ''}`}>{health?.failedJobs || 0}</div><div className="mt-1 text-[9px] font-black uppercase text-slate-400">Failed jobs</div></div></div>
            <div className="mt-4 space-y-3 text-[11px] leading-5 text-slate-500"><div><span className="font-black text-slate-700">Last successful sync:</span> {dateTime(health?.lastSuccessfulSyncAt || connection?.lastSuccessfulSyncAt)}</div><div><span className="font-black text-slate-700">Last attempt:</span> {dateTime(health?.lastAttemptAt || connection?.lastAttemptAt)}</div>{health?.lastError && <div className="rounded-xl bg-red-50 p-3 text-red-700"><span className="font-black">Latest error:</span> {health.lastError}</div>}{health?.lastAudit?.detail && <div className="rounded-xl bg-slate-50 p-3"><span className="font-black text-slate-700">Latest sync event:</span> {health.lastAudit.detail}</div>}</div>
          </div>
        </div>}
      </section>
    </main>
  </div>;
}
