import React, { useEffect, useState } from 'react';
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
  Video,
} from 'lucide-react';
import {
  professionalIntegrationService,
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

function connectionLabel(status: ProfessionalIntegrationsConfig['zohoMailConnectionStatus']) {
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

  const load = async () => {
    setLoading(true); setError(''); setHealthError('');
    try {
      const next = await professionalIntegrationService.getAdminConfig();
      setConfig(next);
      setClientId(next.zohoClientIdHint || '');
      setOrganizationId(next.zohoOrganizationId || '');
      setDataCenter(next.zohoDataCenter || 'in');
      try {
        setHealth(await professionalIntegrationService.getAdminHealth());
      } catch (err) {
        setHealthError(errorMessage(err, 'Integration health could not be loaded.'));
      }
    } catch (err) { setError(errorMessage(err, 'Professional integration settings could not be loaded.')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!oauthCallbackOrigin) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== oauthCallbackOrigin || event.data?.type !== 'profox-zoho-mail-oauth') return;
      setOauthCallbackOrigin('');
      if (event.data?.success) {
        setError('');
        setMessage(String(event.data?.message || 'Zoho Mail was connected and verified. Professional mailbox provisioning is active.'));
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
      setConfig(next); setClientSecret(''); setClientId(next.zohoClientIdHint || '');
      setMessage('Zoho provider credentials were saved securely. Connect Zoho Mail below to verify organization access before provisioning can run.');
    } catch (err) { setError(errorMessage(err, 'Zoho provider configuration could not be saved.')); }
    finally { setBusy(false); }
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
      const popup = window.open(auth.authorizeUrl, 'profox-zoho-mail-oauth', 'popup=yes,width=720,height=820,resizable=yes,scrollbars=yes');
      if (!popup) throw new Error('The Zoho authorization window was blocked. Allow pop-ups for ProFox and try again.');
      setOauthCallbackOrigin(callbackOrigin);
      setMessage('Zoho authorization opened. Approve the requested Mail organization permission; ProFox will verify the connection before enabling provisioning.');
    } catch (err) {
      setError(errorMessage(err, 'Zoho Mail authorization could not be started.'));
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = async () => {
    if (!config) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await professionalIntegrationService.savePolicy(config);
      setConfig(next);
      setMessage('Professional integration policy saved. ProFox remains the operational source of truth.');
      try {
        setHealth(await professionalIntegrationService.getAdminHealth());
        setHealthError('');
      } catch (err) {
        setHealthError(errorMessage(err, 'Integration health could not be refreshed.'));
      }
    } catch (err) { setError(errorMessage(err, 'Professional integration policy could not be saved.')); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /></div>;
  if (!config) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error || 'Professional integrations are unavailable.'}</div>;

  const zohoLocked = !config.zohoProviderConfigured;
  const zohoMailLocked = !config.zohoMailConnected;
  const currentIssues = health
    ? health.google.deadLetter
      + health.google.reconnectRequired
      + health.zoho.errorAccounts
      + (['error', 'reconnect_required'].includes(health.zoho.organizationMailStatus) ? 1 : 0)
      + health.mailboxes.error
      + health.mailboxes.queueDeadLetter
      + health.clientInbox.deliveryIssues
    : 0;

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Professional integrations</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Google stays live. Zoho Mail activates only after verified OAuth.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">ProFox CRM, meetings, customer records and conversations remain authoritative. Saving Zoho credentials never creates mailboxes by itself; after organization authorization is verified, ProFox enables Zoho Mail provisioning and queues eligible staff automatically.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 p-4"><Mail className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Mail</div><div className="mt-1 text-xs text-slate-500">Brevo remains transactional delivery. Verified Zoho Mail powers staff professional mailboxes and the future Client Inbox email channel.</div></div>
        <div className="rounded-2xl border border-slate-200 p-4"><CalendarDays className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Calendar</div><div className="mt-1 text-xs text-slate-500">Google remains the default. Zoho Calendar can be selected later without duplicating ProFox meetings.</div></div>
        <div className="rounded-2xl border border-slate-200 p-4"><Video className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Meetings</div><div className="mt-1 text-xs text-slate-500">Google Meet remains available. Zoho Meeting stays dormant until separately proven and enabled.</div></div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-slate-950"><Activity className="h-4 w-4 text-[#000080]" />Integration health</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Operational counts only. OAuth tokens, one-time passwords, secrets and message contents are never returned by this health view.</p>
          </div>
          {health && (
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${currentIssues > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {currentIssues > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {currentIssues > 0 ? `${currentIssues} item${currentIssues === 1 ? '' : 's'} need attention` : 'Operational'}
            </div>
          )}
        </div>

        {healthError && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{healthError}</div>}
        {health && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Google calendar sync</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                <Metric label="Connected" value={health.google.connectedAccounts} />
                <Metric label="Active provider" value={health.google.activeProviderAccounts} />
                <Metric label="Pending" value={health.google.pending} />
                <Metric label="Retry" value={health.google.retry} warning />
                <Metric label="Processing" value={health.google.processing} />
                <Metric label="Reconnect" value={health.google.reconnectRequired} warning />
                <Metric label="Dead letter" value={health.google.deadLetter} warning />
                <Metric label="Skipped" value={health.google.skipped} />
              </div>
              <div className="mt-2 text-[11px] text-slate-500">Oldest pending/retry: <span className="font-bold text-slate-700">{formatTimestamp(health.google.oldestPendingAt)}</span>. Historical failed jobs retained: <span className="font-bold text-slate-700">{health.google.failedHistorical}</span>.</div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-black text-slate-900">Zoho provider health</div>
                <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="User connections" value={health.zoho.connectedAccounts} /><Metric label="User errors" value={health.zoho.errorAccounts} warning /></div>
                <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${health.zoho.organizationMailConnected ? 'bg-emerald-50 text-emerald-800' : health.zoho.organizationMailStatus === 'disconnected' ? 'bg-slate-50 text-slate-600' : 'bg-amber-50 text-amber-800'}`}>
                  Organization Mail: {connectionLabel(health.zoho.organizationMailStatus)}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Last verified: {formatTimestamp(health.zoho.organizationMailLastVerifiedAt)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-black text-slate-900">Professional mailboxes</div>
                <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Active" value={health.mailboxes.active} /><Metric label="Provisioning" value={health.mailboxes.provisioning} /><Metric label="Errors" value={health.mailboxes.error} warning /><Metric label="Suspended" value={health.mailboxes.suspended} /></div>
                <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Queue pending" value={health.mailboxes.queuePending} /><Metric label="Queue retry" value={health.mailboxes.queueRetry} warning /><Metric label="Processing" value={health.mailboxes.queueProcessing} /><Metric label="Dead letter" value={health.mailboxes.queueDeadLetter} warning /></div>
                <p className="mt-2 text-[11px] text-slate-500">Oldest queued/retry: {formatTimestamp(health.mailboxes.oldestQueuedAt)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-black text-slate-900">Unified Client Inbox</div>
                <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Last 24 hours" value={health.clientInbox.messagesLast24Hours} /><Metric label="Delivery issues" value={health.clientInbox.deliveryIssues} warning /></div>
                <p className="mt-2 text-[11px] leading-4 text-slate-500">External rich HTML is suppressed in the staff timeline until a trusted sanitizer is present in the ingestion path.</p>
              </div>
            </div>
            <div className="text-[10px] text-slate-400">Health generated: {formatTimestamp(health.generatedAt)}</div>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-blue-100 bg-blue-50/50 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-slate-900">Zoho organization & OAuth {config.zohoMailConnected && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Client credentials are stored in Supabase Vault. The Mail refresh token is stored only after Zoho organization access is successfully verified.</p>
          </div>
          <div className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${config.zohoMailConnected ? 'bg-emerald-100 text-emerald-800' : config.zohoMailConnectionStatus === 'disconnected' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{connectionLabel(config.zohoMailConnectionStatus)}</div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Zoho OAuth client ID" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} type="password" placeholder={config.zohoClientSecretStored ? 'Client secret stored — leave blank to keep it' : 'Zoho OAuth client secret'} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input value={organizationId} onChange={e => setOrganizationId(e.target.value)} placeholder="Zoho organization ID" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <select value={dataCenter} onChange={e => setDataCenter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{DATA_CENTERS.map(dc => <option key={dc.value} value={dc.value}>{dc.label}</option>)}</select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveProvider()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save provider securely</button>
          <button type="button" onClick={() => void connectZohoMail()} disabled={busy || !config.zohoProviderConfigured} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#000080]/20 bg-white px-4 text-xs font-black text-[#000080] disabled:cursor-not-allowed disabled:opacity-40"><ExternalLink className="h-4 w-4" />{config.zohoMailConnected ? 'Re-verify Zoho Mail' : 'Connect & verify Zoho Mail'}</button>
        </div>
        {config.zohoMailLastVerifiedAt && <p className="mt-3 text-[11px] font-semibold text-slate-500">Last verified: {formatTimestamp(config.zohoMailLastVerifiedAt)}</p>}
        <p className="mt-3 text-[11px] leading-5 text-slate-500">After verification succeeds, ProFox automatically enables Zoho Mail + mailbox provisioning, keeps Google/Brevo intact, creates a new provider generation, and queues eligible completed staff accounts exactly once.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Toggle checked={config.zohoEnabled} disabled={zohoLocked} onChange={v => setConfig({ ...config, zohoEnabled: v })} label="Enable Zoho provider" detail="Master switch. It never disables Google." />
        <Toggle checked={config.zohoMailEnabled} disabled={zohoLocked || zohoMailLocked} onChange={v => setConfig({ ...config, zohoMailEnabled: v, mailProvisioningEnabled: v ? config.mailProvisioningEnabled : false, professionalEmailRequired: v ? config.professionalEmailRequired : false, defaultMailProvider: v ? config.defaultMailProvider : 'none' })} label="Enable Zoho Mail" detail="Becomes available only after verified organization OAuth. Verification enables it automatically." />
        <Toggle checked={config.zohoCalendarEnabled} disabled={zohoLocked} onChange={v => setConfig({ ...config, zohoCalendarEnabled: v })} label="Enable Zoho Calendar" detail="Makes Zoho Calendar eligible; ProFox calendar data remains authoritative." />
        <Toggle checked={config.zohoMeetingEnabled} disabled={zohoLocked} onChange={v => setConfig({ ...config, zohoMeetingEnabled: v })} label="Enable Zoho Meeting" detail="Makes Zoho Meeting eligible for configured staff accounts." />
        <Toggle checked={config.mailProvisioningEnabled} disabled={zohoMailLocked || !config.zohoMailEnabled} onChange={v => setConfig({ ...config, mailProvisioningEnabled: v })} label="Enable mailbox provisioning" detail="Verified Zoho Mail enables this automatically. Turn it off only to pause new mailbox creation." />
        <Toggle checked={config.professionalEmailRequired} disabled={zohoMailLocked || !config.zohoMailEnabled} onChange={v => setConfig({ ...config, professionalEmailRequired: v })} label="Require professional email for Sales setup" detail="Keep optional until mailbox provisioning has been proven with controlled staff accounts." />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-black text-slate-700">Default mail provider<select value={config.defaultMailProvider} onChange={e => setConfig({ ...config, defaultMailProvider: e.target.value as ProfessionalIntegrationsConfig['defaultMailProvider'] })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"><option value="none">None / Brevo transactional only</option><option value="zoho" disabled={!config.zohoMailConnected || !config.zohoMailEnabled}>Zoho Mail</option></select></label>
        <label className="text-xs font-black text-slate-700">Default calendar provider<select value={config.defaultCalendarProvider} onChange={e => setConfig({ ...config, defaultCalendarProvider: e.target.value as ProfessionalIntegrationsConfig['defaultCalendarProvider'] })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"><option value="google">Google Calendar</option><option value="zoho" disabled={!config.zohoCalendarEnabled}>Zoho Calendar</option></select></label>
        <label className="text-xs font-black text-slate-700">Default meeting provider<select value={config.defaultMeetingProvider} onChange={e => setConfig({ ...config, defaultMeetingProvider: e.target.value as ProfessionalIntegrationsConfig['defaultMeetingProvider'] })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"><option value="google_meet">Google Meet</option><option value="zoho_meeting" disabled={!config.zohoMeetingEnabled}>Zoho Meeting</option></select></label>
      </div>

      <button type="button" onClick={() => void savePolicy()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save integration policy</button>
    </section>
  );
}
