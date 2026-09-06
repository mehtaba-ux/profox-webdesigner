import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCheck,
  Video,
} from 'lucide-react';
import {
  professionalIntegrationService,
  type MailboxCanaryCandidate,
  type ProfessionalIntegrationHealth,
  type ProfessionalIntegrationsConfig,
} from '../../lib/professionalIntegrationService';
import { zohoCalendarService, type ZohoCalendarIntegrationSnapshot } from '../../lib/zohoCalendarService';

const DATA_CENTERS = [
  { value: 'in', label: 'India (.in)' },
  { value: 'com', label: 'United States / Global (.com)' },
  { value: 'eu', label: 'Europe (.eu)' },
  { value: 'com.au', label: 'Australia (.com.au)' },
  { value: 'jp', label: 'Japan (.jp)' },
  { value: 'ca', label: 'Canada (.ca)' },
  { value: 'sa', label: 'Saudi Arabia (.sa)' },
];

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || fallback)
    : fallback;
}

function Toggle({ checked, onChange, label, detail, disabled = false }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-2xl border p-4 ${disabled ? 'bg-slate-50 opacity-60' : 'bg-white'}`}>
      <span><span className="block text-sm font-black text-slate-900">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span></span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="mt-1 h-5 w-5 accent-[#000080]" />
    </label>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${warning && value > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className={`text-lg font-black ${warning && value > 0 ? 'text-amber-800' : 'text-slate-950'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
  );
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return 'None';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString();
}

function mailConnectionLabel(status: ProfessionalIntegrationsConfig['zohoMailConnectionStatus']) {
  if (status === 'connected') return 'Connected & verified';
  if (status === 'reconnect_required') return 'Reconnect required';
  if (status === 'error') return 'Connection error';
  return 'Not connected';
}

function calendarConnectionLabel(snapshot: ZohoCalendarIntegrationSnapshot | null) {
  const status = snapshot?.connection.status || 'disconnected';
  if (status === 'connected' && snapshot?.connection.meetingReady) return 'Calendar + Meeting ready';
  if (status === 'connected') return 'Calendar connected · Meeting unavailable';
  if (status === 'reconnect_required') return 'Reconnect required';
  if (status === 'error') return 'Connection error';
  return 'Not connected';
}

export default function ProfessionalIntegrationsAdmin() {
  const [config, setConfig] = useState<ProfessionalIntegrationsConfig | null>(null);
  const [health, setHealth] = useState<ProfessionalIntegrationHealth | null>(null);
  const [calendarSnapshot, setCalendarSnapshot] = useState<ZohoCalendarIntegrationSnapshot | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [mailOrgClientId, setMailOrgClientId] = useState('');
  const [mailOrgClientSecret, setMailOrgClientSecret] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [dataCenter, setDataCenter] = useState('in');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [error, setError] = useState('');
  const [healthError, setHealthError] = useState('');
  const [message, setMessage] = useState('');
  const [oauthCallbackOrigin, setOauthCallbackOrigin] = useState('');
  const [canaryCandidates, setCanaryCandidates] = useState<MailboxCanaryCandidate[]>([]);
  const [canaryUserId, setCanaryUserId] = useState('');
  const [canaryBusy, setCanaryBusy] = useState(false);

  const loadCandidates = async (mailConnected: boolean) => {
    if (!mailConnected) {
      setCanaryCandidates([]);
      setCanaryUserId('');
      return;
    }
    const candidates = await professionalIntegrationService.listMailboxCanaryCandidates();
    setCanaryCandidates(candidates);
    setCanaryUserId(current => {
      if (candidates.some(item => item.userId === current && item.mailboxStatus !== 'active')) return current;
      return candidates.find(item => item.mailboxStatus !== 'active')?.userId || '';
    });
  };

  const load = async () => {
    setLoading(true);
    setError('');
    setHealthError('');
    try {
      const next = await professionalIntegrationService.getAdminConfig();
      setConfig(next);
      setClientId(next.zohoClientIdHint || '');
      setMailOrgClientId(next.zohoMailOrgClientIdHint || '');
      setOrganizationId(next.zohoOrganizationId || '');
      setDataCenter(next.zohoDataCenter || 'in');
      const [nextHealth, nextCalendar] = await Promise.all([
        professionalIntegrationService.getAdminHealth().catch(err => {
          setHealthError(errorMessage(err, 'Integration health could not be loaded.'));
          return null;
        }),
        zohoCalendarService.getStatus().catch(err => {
          setHealthError(current => current || errorMessage(err, 'Zoho Calendar/Meeting status could not be loaded.'));
          return null;
        }),
        loadCandidates(next.zohoMailConnected).catch(err => {
          setHealthError(current => current || errorMessage(err, 'Mailbox canary candidates could not be loaded.'));
        }),
      ]);
      if (nextHealth) setHealth(nextHealth);
      if (nextCalendar) setCalendarSnapshot(nextCalendar);
    } catch (err) {
      setError(errorMessage(err, 'Professional integration settings could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zoho = params.get('zoho');
    if (!zoho) return;
    if (zoho === 'service_connected') setMessage('Company-managed Zoho Calendar and Meeting authorization was verified.');
    if (zoho === 'error') setError(params.get('message') || 'Zoho Calendar and Meeting authorization failed.');
    params.delete('zoho'); params.delete('message');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    void load();
  }, []);

  useEffect(() => {
    if (!oauthCallbackOrigin) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== oauthCallbackOrigin || event.data?.type !== 'profox-zoho-mail-oauth') return;
      setOauthCallbackOrigin('');
      if (event.data?.success) {
        setError('');
        setMessage(String(event.data?.message || 'Zoho Mail organization authorization was verified.'));
        void load();
      } else {
        setMessage('');
        setError(String(event.data?.message || 'Zoho Mail authorization was not completed. Nothing was enabled.'));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [oauthCallbackOrigin]);

  const saveProvider = async () => {
    if (!config) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await professionalIntegrationService.saveZohoProvider({
        clientId: clientId.includes('...') ? '' : clientId,
        clientSecret,
        organizationId,
        dataCenter,
      });
      setConfig(next);
      setClientSecret('');
      setClientId(next.zohoClientIdHint || '');
      setMessage('Zoho Calendar/Meeting OAuth configuration was saved securely.');
    } catch (err) {
      setError(errorMessage(err, 'Zoho Calendar/Meeting provider configuration could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const saveMailOrgProvider = async () => {
    if (!config) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await professionalIntegrationService.saveZohoMailOrgProvider({
        clientId: mailOrgClientId.includes('...') ? '' : mailOrgClientId,
        clientSecret: mailOrgClientSecret,
      });
      setConfig(next);
      setMailOrgClientSecret('');
      setMailOrgClientId(next.zohoMailOrgClientIdHint || '');
      setMessage('Zoho Mail ORG OAuth credentials were saved securely. Admin consent is still required before Mail becomes operational.');
    } catch (err) {
      setError(errorMessage(err, 'Zoho Mail ORG OAuth configuration could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const connectZohoMail = async () => {
    if (!config?.zohoMailOrgProviderConfigured) {
      setError('Save a Zoho ORG-type OAuth client ID and secret for Mail first.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const auth = await professionalIntegrationService.startZohoMailAuthorization();
      const callbackOrigin = new URL(auth.callbackUrl).origin;
      const popup = window.open(auth.authorizeUrl, 'profox-zoho-mail-oauth', 'popup=yes,width=760,height=820,resizable=yes,scrollbars=yes');
      if (!popup) throw new Error('The Zoho authorization window was blocked. Allow pop-ups for ProFox and try again.');
      setOauthCallbackOrigin(callbackOrigin);
      setMessage('Zoho Mail Admin consent opened. Approve the company instance once; staff will never be asked to authorize Zoho individually.');
    } catch (err) {
      setError(errorMessage(err, 'Zoho Mail organization authorization could not be started.'));
    } finally {
      setBusy(false);
    }
  };

  const connectCentralCalendar = async () => {
    setCalendarBusy(true); setError(''); setMessage('');
    try {
      const snapshot = calendarSnapshot || await zohoCalendarService.getStatus();
      if (!snapshot.providerConfigured) throw new Error('Save the Zoho Calendar/Meeting OAuth client ID and secret first.');
      const returnPath = `${window.location.pathname}${window.location.search}`;
      if (snapshot.connection.status === 'connected') await zohoCalendarService.reconnect(returnPath);
      else if (snapshot.connection.status === 'reconnect_required' || snapshot.connection.status === 'error') await zohoCalendarService.reconnect(returnPath);
      else await zohoCalendarService.connect(returnPath);
    } catch (err) {
      setError(errorMessage(err, 'Company-managed Zoho Calendar/Meeting authorization could not be started.'));
      setCalendarBusy(false);
    }
  };

  const runMailboxCanary = async () => {
    if (!canaryUserId) {
      setError('Select one eligible employee for the professional-email test.');
      return;
    }
    setCanaryBusy(true); setError(''); setMessage('');
    try {
      const jobId = await professionalIntegrationService.queueMailboxCanary(canaryUserId);
      setMessage(`One-user mailbox canary queued safely. Job ${jobId.slice(0, 8)}… Bulk provisioning remains unchanged.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Mailbox canary could not be queued.'));
    } finally {
      setCanaryBusy(false);
    }
  };

  const updateZohoMaster = (enabled: boolean) => {
    if (!config) return;
    setConfig(enabled ? { ...config, zohoEnabled: true } : {
      ...config,
      zohoEnabled: false,
      zohoMailEnabled: false,
      zohoCalendarEnabled: false,
      zohoMeetingEnabled: false,
      mailProvisioningEnabled: false,
      professionalEmailRequired: false,
      defaultMailProvider: 'none',
      defaultCalendarProvider: 'google',
      defaultMeetingProvider: 'google_meet',
    });
  };

  const updateZohoMail = (enabled: boolean) => {
    if (!config) return;
    setConfig(enabled ? { ...config, zohoEnabled: true, zohoMailEnabled: true } : {
      ...config,
      zohoMailEnabled: false,
      mailProvisioningEnabled: false,
      professionalEmailRequired: false,
      defaultMailProvider: 'none',
    });
  };

  const updateZohoCalendar = (enabled: boolean) => {
    if (!config) return;
    setConfig(enabled ? { ...config, zohoEnabled: true, zohoCalendarEnabled: true } : {
      ...config,
      zohoCalendarEnabled: false,
      zohoMeetingEnabled: false,
      defaultCalendarProvider: 'google',
      defaultMeetingProvider: 'google_meet',
    });
  };

  const updateZohoMeeting = (enabled: boolean) => {
    if (!config) return;
    setConfig(enabled ? { ...config, zohoEnabled: true, zohoCalendarEnabled: true, zohoMeetingEnabled: true } : {
      ...config,
      zohoMeetingEnabled: false,
      defaultMeetingProvider: 'google_meet',
    });
  };

  const savePolicy = async () => {
    if (!config) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await professionalIntegrationService.savePolicy(config);
      setConfig(next);
      setMessage('Professional integration policy saved. ProFox remains the source of truth for CRM meetings and customer records.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Professional integration policy could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const availableCanaryCandidates = useMemo(
    () => canaryCandidates.filter(item => item.eligible && item.mailboxStatus !== 'active'),
    [canaryCandidates],
  );

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /></div>;
  if (!config) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error || 'Professional integrations are unavailable.'}</div>;

  const calendarReady = Boolean(calendarSnapshot?.connection.connected && calendarSnapshot.connection.meetingReady);
  const zohoLocked = !config.zohoProviderConfigured || !calendarReady;
  const mailLocked = !config.zohoMailConnected;
  const currentIssues = health
    ? health.google.deadLetter + health.google.reconnectRequired + health.zoho.errorAccounts + health.mailboxes.error + health.mailboxes.queueDeadLetter + health.clientInbox.deliveryIssues
    : 0;

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Professional integrations</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">One Admin authorizes Zoho. Staff work only inside ProFox.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Calendar/Meeting and Mail use separate server-side OAuth clients. Mail requires a Zoho ORG-type OAuth client and one organization-level Admin consent. Staff are never asked to approve Zoho Mail, Calendar or Meeting permissions.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy || calendarBusy || canaryBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 p-4"><Mail className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Zoho Mail</div><div className="mt-1 text-xs text-slate-500">One Admin-managed organization authorization for eligible professional mailboxes. Brevo remains the transactional notification sender.</div></div>
        <div className="rounded-2xl border border-slate-200 p-4"><CalendarDays className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Zoho Calendar</div><div className="mt-1 text-xs text-slate-500">One company-managed Calendar connection. Sellers never connect a personal Zoho Calendar.</div></div>
        <div className="rounded-2xl border border-slate-200 p-4"><Video className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Zoho Meeting</div><div className="mt-1 text-xs text-slate-500">Meeting links are created through the same central Calendar/Meeting service and remain attached to ProFox CRM records.</div></div>
      </div>

      <div className="rounded-3xl border border-blue-100 bg-blue-50/50 p-5">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">1. Organization + Calendar/Meeting OAuth app {config.zohoProviderConfigured && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">These credentials are used only for the central Zoho Calendar and Meeting service. They are stored in Supabase Vault and never returned to the browser.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Calendar/Meeting OAuth client ID" autoComplete="off" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} type="password" autoComplete="new-password" placeholder={config.zohoClientSecretStored ? 'Client secret stored — leave blank to keep it' : 'Calendar/Meeting OAuth client secret'} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input value={organizationId} onChange={e => setOrganizationId(e.target.value)} placeholder="Zoho organization ID" autoComplete="off" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <select value={dataCenter} onChange={e => setDataCenter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{DATA_CENTERS.map(dc => <option key={dc.value} value={dc.value}>{dc.label}</option>)}</select>
        </div>
        <button type="button" onClick={() => void saveProvider()} disabled={busy} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save Calendar/Meeting configuration</button>
      </div>

      <div className={`rounded-3xl border p-5 ${calendarReady ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="text-sm font-black text-slate-950">2. Authorize central Zoho Calendar + Meeting</div><p className="mt-1 text-xs leading-5 text-slate-500">Only a ProFox Administrator can run this consent. It verifies the central Calendar, Meeting organization and presenter without creating a test meeting.</p></div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${calendarReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{calendarConnectionLabel(calendarSnapshot)}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void connectCentralCalendar()} disabled={calendarBusy || !config.zohoProviderConfigured} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{calendarBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}{calendarSnapshot?.connection.connected ? 'Re-authorize Calendar + Meeting' : 'Connect Calendar + Meeting'}</button>
          <div className="text-[11px] text-slate-500">Last successful sync: <span className="font-bold text-slate-700">{formatTimestamp(calendarSnapshot?.connection.lastSuccessfulSyncAt)}</span></div>
        </div>
        {calendarSnapshot?.connection.lastError && <div className="mt-3 rounded-xl border border-amber-200 bg-white/70 p-3 text-[11px] font-semibold leading-5 text-amber-800">{calendarSnapshot.connection.lastError}</div>}
      </div>

      <div className="rounded-3xl border border-violet-100 bg-violet-50/40 p-5">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">3. Zoho Mail ORG OAuth app {config.zohoMailOrgProviderConfigured && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">Create a separate <strong>ORG-type</strong> OAuth client in Zoho for Mail instance authorization. Do not reuse a normal staff/user OAuth client. The organization ID and data center above are shared.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={mailOrgClientId} onChange={e => setMailOrgClientId(e.target.value)} placeholder="Zoho Mail ORG OAuth client ID" autoComplete="off" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input value={mailOrgClientSecret} onChange={e => setMailOrgClientSecret(e.target.value)} type="password" autoComplete="new-password" placeholder={config.zohoMailOrgClientSecretStored ? 'ORG client secret stored — leave blank to keep it' : 'Zoho Mail ORG OAuth client secret'} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
        </div>
        <button type="button" onClick={() => void saveMailOrgProvider()} disabled={busy} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save Mail ORG configuration</button>
      </div>

      <div className={`rounded-3xl border p-5 ${config.zohoMailConnected ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-black text-slate-950">4. Give one Admin consent for Zoho Mail</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">This uses Zoho instance-level organization consent for mailbox management, send, read and folder access. Staff do not sign in to Zoho and do not receive individual OAuth prompts.</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${config.zohoMailConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{mailConnectionLabel(config.zohoMailConnectionStatus)}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void connectZohoMail()} disabled={busy || !config.zohoMailOrgProviderConfigured} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50"><ExternalLink className="h-4 w-4" />{config.zohoMailConnected ? 'Re-authorize Zoho Mail' : 'Authorize Zoho Mail for organization'}</button>
          <div className="text-[11px] text-slate-500">Mode: <span className="font-bold text-slate-700">{config.zohoMailAuthorizationMode === 'instance_org' ? 'ORG instance' : 'Legacy / not migrated'}</span> · Required scopes: <span className="font-bold text-slate-700">{config.zohoMailScopesReady ? 'Ready' : 'Missing'}</span> · Last verified: <span className="font-bold text-slate-700">{formatTimestamp(config.zohoMailLastVerifiedAt)}</span></div>
        </div>
        {!config.zohoMailOrgProviderConfigured && <p className="mt-3 text-[11px] font-semibold text-amber-700">Complete step 3 with a Zoho ORG-type Mail OAuth client before authorizing Mail.</p>}
      </div>

      <div className={`rounded-3xl border p-5 ${config.zohoMailConnected ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
        <div className="flex items-start gap-3"><UserCheck className={`mt-0.5 h-5 w-5 ${config.zohoMailConnected ? 'text-emerald-700' : 'text-slate-400'}`} /><div><div className="text-sm font-black text-slate-950">5. Test exactly one professional mailbox</div><p className="mt-1 text-xs leading-5 text-slate-500">Run this only after central Mail consent succeeds. The canary is Admin-only and idempotent; bulk provisioning stays unchanged.</p></div></div>
        {config.zohoMailConnected ? (
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <select value={canaryUserId} onChange={e => setCanaryUserId(e.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="">Select an eligible employee</option>
              {availableCanaryCandidates.map(item => <option key={item.userId} value={item.userId}>{item.displayName} · {item.role || 'staff'}{item.email ? ` · ${item.email}` : ''}</option>)}
            </select>
            <button type="button" onClick={() => void runMailboxCanary()} disabled={canaryBusy || !canaryUserId} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:opacity-50">{canaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}Run one-user canary</button>
          </div>
        ) : <p className="mt-3 text-[11px] font-semibold text-slate-500">Central ORG Mail authorization must be ready before mailbox canary or bulk provisioning can be enabled.</p>}
        {config.zohoMailConnected && availableCanaryCandidates.length === 0 && <p className="mt-3 text-[11px] font-semibold text-slate-500">No eligible employee currently needs a test mailbox.</p>}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-black text-slate-950">6. Enable production provider policy</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">Enable services only after their central Admin authorization is healthy. Turning a parent service off resets dependent defaults in this form before saving.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Toggle checked={config.zohoEnabled} disabled={!config.zohoProviderConfigured && !config.zohoMailOrgProviderConfigured} onChange={updateZohoMaster} label="Enable Zoho provider" detail="Master eligibility switch. Google remains available unless you change the defaults below." />
          <Toggle checked={config.zohoMailEnabled} disabled={mailLocked} onChange={updateZohoMail} label="Enable Zoho Mail" detail="Requires verified Admin-managed ORG instance authorization." />
          <Toggle checked={config.zohoCalendarEnabled} disabled={zohoLocked} onChange={updateZohoCalendar} label="Enable Zoho Calendar" detail="Uses the single Admin-managed company Calendar connection. Staff do not authorize Zoho." />
          <Toggle checked={config.zohoMeetingEnabled} disabled={zohoLocked || !config.zohoCalendarEnabled} onChange={updateZohoMeeting} label="Enable Zoho Meeting" detail="Uses the same central service and verified Meeting organization capability." />
          <Toggle checked={config.mailProvisioningEnabled} disabled={mailLocked || !config.zohoMailEnabled} onChange={v => setConfig({ ...config, mailProvisioningEnabled: v })} label="Enable automatic mailbox provisioning" detail="After a canary passes, eligible Sales/Management accounts can be queued automatically." />
          <Toggle checked={config.professionalEmailRequired} disabled={!config.zohoMailEnabled} onChange={v => setConfig({ ...config, professionalEmailRequired: v })} label="Require professional email for Sales setup" detail="Sales setup waits for an active mapped mailbox and healthy central Mail service—never seller OAuth." />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-black text-slate-700">Default mail provider<select value={config.defaultMailProvider} onChange={e => setConfig({ ...config, defaultMailProvider: e.target.value as ProfessionalIntegrationsConfig['defaultMailProvider'] })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"><option value="none">None / Brevo transactional only</option><option value="zoho" disabled={!config.zohoMailEnabled}>Zoho Mail</option></select></label>
          <label className="text-xs font-black text-slate-700">Default calendar provider<select value={config.defaultCalendarProvider} onChange={e => setConfig({ ...config, defaultCalendarProvider: e.target.value as ProfessionalIntegrationsConfig['defaultCalendarProvider'] })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"><option value="google">Google Calendar</option><option value="zoho" disabled={!config.zohoCalendarEnabled}>Zoho Calendar</option></select></label>
          <label className="text-xs font-black text-slate-700">Default meeting provider<select value={config.defaultMeetingProvider} onChange={e => setConfig({ ...config, defaultMeetingProvider: e.target.value as ProfessionalIntegrationsConfig['defaultMeetingProvider'] })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"><option value="google_meet">Google Meet</option><option value="zoho_meeting" disabled={!config.zohoMeetingEnabled}>Zoho Meeting</option></select></label>
        </div>
        <button type="button" onClick={() => void savePolicy()} disabled={busy} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save integration policy</button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-black text-slate-950"><Activity className="h-4 w-4 text-[#000080]" />Integration health</div><p className="mt-1 text-xs leading-5 text-slate-500">Operational counts only. OAuth tokens, secrets, temporary passwords and customer message contents are never returned here.</p></div>{health && <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${currentIssues > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{currentIssues > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{currentIssues > 0 ? `${currentIssues} item${currentIssues === 1 ? '' : 's'} need attention` : 'Operational'}</div>}</div>
        {healthError && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{healthError}</div>}
        {health && <div className="mt-4 space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-900">Central Zoho services</div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Calendar service" value={health.zoho.connectedAccounts} /><Metric label="Calendar errors" value={health.zoho.errorAccounts} warning /></div><div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${health.zoho.organizationMailConnected ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>Organization Mail: {health.zoho.organizationMailConnected ? 'ORG instance ready' : mailConnectionLabel(health.zoho.organizationMailStatus)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-900">Professional mailboxes</div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Active" value={health.mailboxes.active} /><Metric label="Provisioning" value={health.mailboxes.provisioning} /><Metric label="Queue pending" value={health.mailboxes.queuePending} /><Metric label="Queue retry" value={health.mailboxes.queueRetry} warning /><Metric label="Processing" value={health.mailboxes.queueProcessing} /><Metric label="Dead letter" value={health.mailboxes.queueDeadLetter} warning /></div><p className="mt-2 text-[11px] text-slate-500">Oldest queued/retry: {formatTimestamp(health.mailboxes.oldestQueuedAt)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-900">Unified Client Inbox</div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Last 24 hours" value={health.clientInbox.messagesLast24Hours} /><Metric label="Delivery issues" value={health.clientInbox.deliveryIssues} warning /></div><p className="mt-2 text-[11px] leading-4 text-slate-500">Customer email remains assignment-scoped and auditable inside ProFox.</p></div>
          </div>
          <div><div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Google calendar sync remains available</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8"><Metric label="Connected" value={health.google.connectedAccounts} /><Metric label="Active provider" value={health.google.activeProviderAccounts} /><Metric label="Pending" value={health.google.pending} /><Metric label="Retry" value={health.google.retry} warning /><Metric label="Processing" value={health.google.processing} /><Metric label="Reconnect" value={health.google.reconnectRequired} warning /><Metric label="Dead letter" value={health.google.deadLetter} warning /><Metric label="Skipped" value={health.google.skipped} /></div></div>
          <div className="text-[10px] text-slate-400">Health generated: {formatTimestamp(health.generatedAt)}</div>
        </div>}
      </div>
    </section>
  );
}
