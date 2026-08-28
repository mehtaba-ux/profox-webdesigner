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

export default function ProfessionalIntegrationsAdmin() {
  const [config, setConfig] = useState<ProfessionalIntegrationsConfig | null>(null);
  const [health, setHealth] = useState<ProfessionalIntegrationHealth | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [dataCenter, setDataCenter] = useState('in');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
      setOrganizationId(next.zohoOrganizationId || '');
      setDataCenter(next.zohoDataCenter || 'in');
      const [nextHealth] = await Promise.all([
        professionalIntegrationService.getAdminHealth().catch(err => {
          setHealthError(errorMessage(err, 'Integration health could not be loaded.'));
          return null;
        }),
        loadCandidates(next.zohoMailConnected).catch(err => {
          setHealthError(errorMessage(err, 'Mailbox canary candidates could not be loaded.'));
        }),
      ]);
      if (nextHealth) setHealth(nextHealth);
    } catch (err) {
      setError(errorMessage(err, 'Professional integration settings could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!oauthCallbackOrigin) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== oauthCallbackOrigin || event.data?.type !== 'profox-zoho-mail-oauth') return;
      setOauthCallbackOrigin('');
      if (event.data?.success) {
        setError('');
        setMessage(String(event.data?.message || 'Zoho Mail organization access was verified. No mailbox was enabled automatically.'));
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
      setMessage('Zoho provider credentials were saved securely. Connect and verify Zoho Mail before enabling mailbox automation.');
    } catch (err) {
      setError(errorMessage(err, 'Zoho provider configuration could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const connectZohoMail = async () => {
    if (!config?.zohoProviderConfigured) {
      setError('Save the Zoho OAuth client ID, client secret, organization ID and data center first.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const auth = await professionalIntegrationService.startZohoMailAuthorization();
      const callbackOrigin = new URL(auth.callbackUrl).origin;
      const popup = window.open(auth.authorizeUrl, 'profox-zoho-mail-oauth', 'popup=yes,width=760,height=820,resizable=yes,scrollbars=yes');
      if (!popup) throw new Error('The Zoho authorization window was blocked. Allow pop-ups for ProFox and try again.');
      setOauthCallbackOrigin(callbackOrigin);
      setMessage('Zoho authorization opened. Approve the organization Mail permission; verification alone will not enable bulk provisioning.');
    } catch (err) {
      setError(errorMessage(err, 'Zoho Mail authorization could not be started.'));
    } finally {
      setBusy(false);
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

  const zohoLocked = !config.zohoProviderConfigured;
  const mailLocked = zohoLocked || !config.zohoMailConnected;
  const currentIssues = health
    ? health.google.deadLetter + health.google.reconnectRequired + health.zoho.errorAccounts + health.mailboxes.error + health.mailboxes.queueDeadLetter + health.clientInbox.deliveryIssues
    : 0;

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Professional integrations</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Configure Zoho safely from one Admin screen.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Save provider credentials, verify organization Mail access, run one mailbox canary, then enable Mail, Calendar and Meeting policy. Saving credentials or completing OAuth never creates mailboxes by itself.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy || canaryBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 p-4"><Mail className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Zoho Mail</div><div className="mt-1 text-xs text-slate-500">Professional staff mailboxes. Brevo remains the transactional notification sender.</div></div>
        <div className="rounded-2xl border border-slate-200 p-4"><CalendarDays className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Zoho Calendar</div><div className="mt-1 text-xs text-slate-500">Employees authorize their own Calendar once. ProFox meetings remain authoritative.</div></div>
        <div className="rounded-2xl border border-slate-200 p-4"><Video className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Zoho Meeting</div><div className="mt-1 text-xs text-slate-500">Meeting links are requested through the connected Zoho Calendar when capability is available.</div></div>
      </div>

      <div className="rounded-3xl border border-blue-100 bg-blue-50/50 p-5">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">1. Zoho organization & OAuth {config.zohoProviderConfigured && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">The client ID and secret are stored server-side in Supabase Vault. The secret is never returned to this screen.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Zoho OAuth client ID" autoComplete="off" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} type="password" autoComplete="new-password" placeholder={config.zohoClientSecretStored ? 'Client secret stored — leave blank to keep it' : 'Zoho OAuth client secret'} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input value={organizationId} onChange={e => setOrganizationId(e.target.value)} placeholder="Zoho organization ID" autoComplete="off" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <select value={dataCenter} onChange={e => setDataCenter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{DATA_CENTERS.map(dc => <option key={dc.value} value={dc.value}>{dc.label}</option>)}</select>
        </div>
        <button type="button" onClick={() => void saveProvider()} disabled={busy} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save provider securely</button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-slate-950">2. Verify Zoho Mail organization</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">OAuth verification proves that ProFox can access the configured Zoho Mail organization. It does not enable bulk provisioning.</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${config.zohoMailConnected ? 'bg-emerald-100 text-emerald-800' : config.zohoMailConnectionStatus === 'error' || config.zohoMailConnectionStatus === 'reconnect_required' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>{mailConnectionLabel(config.zohoMailConnectionStatus)}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void connectZohoMail()} disabled={busy || !config.zohoProviderConfigured} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50"><ExternalLink className="h-4 w-4" />{config.zohoMailConnected ? 'Re-authorize Zoho Mail' : 'Connect Zoho Mail'}</button>
          <div className="text-[11px] text-slate-500">Last verified: <span className="font-bold text-slate-700">{formatTimestamp(config.zohoMailLastVerifiedAt)}</span></div>
        </div>
        {!config.zohoProviderConfigured && <p className="mt-3 text-[11px] font-semibold text-amber-700">Complete step 1 before connecting Zoho Mail.</p>}
      </div>

      <div className={`rounded-3xl border p-5 ${config.zohoMailConnected ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
        <div className="flex items-start gap-3"><UserCheck className={`mt-0.5 h-5 w-5 ${config.zohoMailConnected ? 'text-emerald-700' : 'text-slate-400'}`} /><div><div className="text-sm font-black text-slate-950">3. Test exactly one professional mailbox</div><p className="mt-1 text-xs leading-5 text-slate-500">Use this before bulk provisioning. The canary is Admin-only, idempotent and cannot queue another employee while one canary is already in progress.</p></div></div>
        {config.zohoMailConnected ? (
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <select value={canaryUserId} onChange={e => setCanaryUserId(e.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="">Select an eligible employee</option>
              {availableCanaryCandidates.map(item => <option key={item.userId} value={item.userId}>{item.displayName} · {item.role || 'staff'}{item.email ? ` · ${item.email}` : ''}</option>)}
            </select>
            <button type="button" onClick={() => void runMailboxCanary()} disabled={canaryBusy || !canaryUserId} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:opacity-50">{canaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}Run one-user canary</button>
          </div>
        ) : <p className="mt-3 text-[11px] font-semibold text-slate-500">Verify Zoho Mail first. No test or bulk mailbox provisioning is available before organization verification.</p>}
        {config.zohoMailConnected && availableCanaryCandidates.length === 0 && <p className="mt-3 text-[11px] font-semibold text-slate-500">No eligible employee currently needs a test mailbox.</p>}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-black text-slate-950">4. Enable production provider policy</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">Enable only the services you have verified. Turning a parent service off automatically resets dependent defaults in this form before saving.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Toggle checked={config.zohoEnabled} disabled={zohoLocked} onChange={updateZohoMaster} label="Enable Zoho provider" detail="Master eligibility switch. Google remains available unless you change the defaults below." />
          <Toggle checked={config.zohoMailEnabled} disabled={mailLocked} onChange={updateZohoMail} label="Enable Zoho Mail" detail="Requires a verified organization connection." />
          <Toggle checked={config.zohoCalendarEnabled} disabled={zohoLocked} onChange={updateZohoCalendar} label="Enable Zoho Calendar" detail="Allows assigned employees to authorize their Calendar once from their account UI." />
          <Toggle checked={config.zohoMeetingEnabled} disabled={zohoLocked || !config.zohoCalendarEnabled} onChange={updateZohoMeeting} label="Enable Zoho Meeting" detail="Uses Calendar conferencing; each connected employee must report Zoho Meeting capability." />
          <Toggle checked={config.mailProvisioningEnabled} disabled={mailLocked || !config.zohoMailEnabled} onChange={v => setConfig({ ...config, mailProvisioningEnabled: v })} label="Enable automatic mailbox provisioning" detail="After the canary passes, activated eligible staff can be queued automatically." />
          <Toggle checked={config.professionalEmailRequired} disabled={!config.zohoMailEnabled} onChange={v => setConfig({ ...config, professionalEmailRequired: v })} label="Require professional email for Sales setup" detail="Sales setup waits for an active mailbox and completion of the one-time credential handoff." />
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
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-900">Zoho provider</div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="User connections" value={health.zoho.connectedAccounts} /><Metric label="User errors" value={health.zoho.errorAccounts} warning /></div><div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${health.zoho.organizationMailConnected ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>Organization Mail: {mailConnectionLabel(health.zoho.organizationMailStatus)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-900">Professional mailboxes</div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Active" value={health.mailboxes.active} /><Metric label="Provisioning" value={health.mailboxes.provisioning} /><Metric label="Queue pending" value={health.mailboxes.queuePending} /><Metric label="Queue retry" value={health.mailboxes.queueRetry} warning /><Metric label="Processing" value={health.mailboxes.queueProcessing} /><Metric label="Dead letter" value={health.mailboxes.queueDeadLetter} warning /></div><p className="mt-2 text-[11px] text-slate-500">Oldest queued/retry: {formatTimestamp(health.mailboxes.oldestQueuedAt)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-900">Unified Client Inbox</div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Last 24 hours" value={health.clientInbox.messagesLast24Hours} /><Metric label="Delivery issues" value={health.clientInbox.deliveryIssues} warning /></div><p className="mt-2 text-[11px] leading-4 text-slate-500">External rich HTML remains suppressed in the staff timeline until trusted sanitization is present.</p></div>
          </div>
          <div><div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Google calendar sync remains available</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8"><Metric label="Connected" value={health.google.connectedAccounts} /><Metric label="Active provider" value={health.google.activeProviderAccounts} /><Metric label="Pending" value={health.google.pending} /><Metric label="Retry" value={health.google.retry} warning /><Metric label="Processing" value={health.google.processing} /><Metric label="Reconnect" value={health.google.reconnectRequired} warning /><Metric label="Dead letter" value={health.google.deadLetter} warning /><Metric label="Skipped" value={health.google.skipped} /></div></div>
          <div className="text-[10px] text-slate-400">Health generated: {formatTimestamp(health.generatedAt)}</div>
        </div>}
      </div>
    </section>
  );
}
