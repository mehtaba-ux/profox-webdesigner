import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Loader2, Mail, RefreshCw, Save, ShieldCheck, Video } from 'lucide-react';
import {
  professionalIntegrationService,
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

export default function ProfessionalIntegrationsAdmin() {
  const [config, setConfig] = useState<ProfessionalIntegrationsConfig | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [dataCenter, setDataCenter] = useState('in');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const next = await professionalIntegrationService.getAdminConfig();
      setConfig(next);
      setClientId(next.zohoClientIdHint || '');
      setOrganizationId(next.zohoOrganizationId || '');
      setDataCenter(next.zohoDataCenter || 'in');
    } catch (err) { setError(errorMessage(err, 'Professional integration settings could not be loaded.')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

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
      setMessage('Zoho provider credentials were saved securely. No Zoho service was enabled automatically.');
    } catch (err) { setError(errorMessage(err, 'Zoho provider configuration could not be saved.')); }
    finally { setBusy(false); }
  };

  const savePolicy = async () => {
    if (!config) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await professionalIntegrationService.savePolicy(config);
      setConfig(next);
      setMessage('Professional integration policy saved. ProFox remains the operational source of truth.');
    } catch (err) { setError(errorMessage(err, 'Professional integration policy could not be saved.')); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /></div>;
  if (!config) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error || 'Professional integrations are unavailable.'}</div>;

  const zohoLocked = !config.zohoProviderConfigured;
  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Professional integrations</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Google stays live. Zoho is optional and feature-gated.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">ProFox CRM, meetings, customer records and conversations remain authoritative. Configure Zoho here only when licenses and OAuth credentials are ready; saving credentials alone never replaces Google or enables a service.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 p-4"><Mail className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Mail</div><div className="mt-1 text-xs text-slate-500">Brevo remains transactional delivery. Zoho Mail is for staff professional mailboxes and Client Inbox sync.</div></div>
        <div className="rounded-2xl border border-slate-200 p-4"><CalendarDays className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Calendar</div><div className="mt-1 text-xs text-slate-500">Google remains the default. Zoho Calendar can be selected later per policy/account without duplicating ProFox meetings.</div></div>
        <div className="rounded-2xl border border-slate-200 p-4"><Video className="h-5 w-5 text-[#000080]" /><div className="mt-2 text-sm font-black">Meetings</div><div className="mt-1 text-xs text-slate-500">Google Meet remains available. Zoho Meeting stays dormant until explicitly configured and enabled.</div></div>
      </div>

      <div className="rounded-3xl border border-blue-100 bg-blue-50/50 p-5">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">Zoho organization & OAuth {config.zohoProviderConfigured && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">The client secret is stored in Supabase Vault and is never returned to the browser.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Zoho OAuth client ID" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} type="password" placeholder={config.zohoClientSecretStored ? 'Client secret stored — leave blank to keep it' : 'Zoho OAuth client secret'} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input value={organizationId} onChange={e => setOrganizationId(e.target.value)} placeholder="Zoho organization ID" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <select value={dataCenter} onChange={e => setDataCenter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{DATA_CENTERS.map(dc => <option key={dc.value} value={dc.value}>{dc.label}</option>)}</select>
        </div>
        <button type="button" onClick={() => void saveProvider()} disabled={busy} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save provider securely</button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Toggle checked={config.zohoEnabled} disabled={zohoLocked} onChange={v => setConfig({ ...config, zohoEnabled: v })} label="Enable Zoho provider" detail="Master switch. It does not disable Google." />
        <Toggle checked={config.zohoMailEnabled} disabled={zohoLocked} onChange={v => setConfig({ ...config, zohoMailEnabled: v })} label="Enable Zoho Mail" detail="Allows staff mailbox workflows when provisioning is also enabled." />
        <Toggle checked={config.zohoCalendarEnabled} disabled={zohoLocked} onChange={v => setConfig({ ...config, zohoCalendarEnabled: v })} label="Enable Zoho Calendar" detail="Makes Zoho Calendar eligible; ProFox calendar data remains authoritative." />
        <Toggle checked={config.zohoMeetingEnabled} disabled={zohoLocked} onChange={v => setConfig({ ...config, zohoMeetingEnabled: v })} label="Enable Zoho Meeting" detail="Makes Zoho Meeting eligible for configured staff accounts." />
        <Toggle checked={config.mailProvisioningEnabled} disabled={zohoLocked || !config.zohoMailEnabled} onChange={v => setConfig({ ...config, mailProvisioningEnabled: v })} label="Enable mailbox provisioning" detail="Only enable after the Zoho organization is licensed and ready for API provisioning." />
        <Toggle checked={config.professionalEmailRequired} disabled={!config.zohoMailEnabled} onChange={v => setConfig({ ...config, professionalEmailRequired: v })} label="Require professional email for Sales setup" detail="When enabled, Sales account setup waits for a real active professional mailbox." />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-black text-slate-700">Default mail provider<select value={config.defaultMailProvider} onChange={e => setConfig({ ...config, defaultMailProvider: e.target.value as ProfessionalIntegrationsConfig['defaultMailProvider'] })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"><option value="none">None / Brevo transactional only</option><option value="zoho" disabled={!config.zohoMailEnabled}>Zoho Mail</option></select></label>
        <label className="text-xs font-black text-slate-700">Default calendar provider<select value={config.defaultCalendarProvider} onChange={e => setConfig({ ...config, defaultCalendarProvider: e.target.value as ProfessionalIntegrationsConfig['defaultCalendarProvider'] })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"><option value="google">Google Calendar</option><option value="zoho" disabled={!config.zohoCalendarEnabled}>Zoho Calendar</option></select></label>
        <label className="text-xs font-black text-slate-700">Default meeting provider<select value={config.defaultMeetingProvider} onChange={e => setConfig({ ...config, defaultMeetingProvider: e.target.value as ProfessionalIntegrationsConfig['defaultMeetingProvider'] })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"><option value="google_meet">Google Meet</option><option value="zoho_meeting" disabled={!config.zohoMeetingEnabled}>Zoho Meeting</option></select></label>
      </div>

      <button type="button" onClick={() => void savePolicy()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save integration policy</button>
    </section>
  );
}
