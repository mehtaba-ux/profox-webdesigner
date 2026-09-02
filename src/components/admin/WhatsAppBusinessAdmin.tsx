import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { whatsappBusinessService, type WhatsAppBusinessConfig } from '../../lib/whatsappBusinessService';

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-50';

function Field({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-slate-500">{label}</span>{detail && <span className="mt-1 block text-[10px] leading-4 text-slate-400">{detail}</span>}<div className="mt-1.5">{children}</div></label>;
}

export default function WhatsAppBusinessAdmin() {
  const [config, setConfig] = useState<WhatsAppBusinessConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    phoneNumberId: '',
    businessAccountId: '',
    businessPhone: '',
    graphApiVersion: 'v23.0',
    accessToken: '',
    verifyToken: '',
    appSecret: '',
    defaultTemplateName: '',
    defaultTemplateLanguage: 'en_US',
    enabled: false,
  });

  const webhookUrl = useMemo(() => {
    const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/g, '');
    return base ? `${base}/functions/v1/whatsapp-business` : 'Supabase URL unavailable';
  }, []);

  const applyConfig = (next: WhatsAppBusinessConfig) => {
    setConfig(next);
    setForm(current => ({
      ...current,
      phoneNumberId: next.phoneNumberId,
      businessAccountId: next.businessAccountId,
      businessPhone: next.businessPhone,
      graphApiVersion: next.graphApiVersion || 'v23.0',
      defaultTemplateName: next.defaultTemplateName,
      defaultTemplateLanguage: next.defaultTemplateLanguage || 'en_US',
      accessToken: '',
      verifyToken: '',
      appSecret: '',
      enabled: next.enabled,
    }));
  };

  const load = async () => {
    setLoading(true); setError('');
    try { applyConfig(await whatsappBusinessService.getAdminConfig()); }
    catch (err: any) { setError(err?.message || 'WhatsApp Business settings could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const next = await whatsappBusinessService.saveAdminConfig(form);
      applyConfig(next);
      setMessage(next.enabled
        ? 'WhatsApp Business configuration saved and enabled. Complete the Meta webhook subscription before using the channel with customers.'
        : 'WhatsApp Business configuration saved. The customer channel remains disabled until you enable it.');
    } catch (err: any) {
      setError(err?.message || 'WhatsApp Business settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /></section>;

  const storedSecrets = config ? [config.accessTokenStored, config.verifyTokenStored, config.appSecretStored].filter(Boolean).length : 0;

  return <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-emerald-700"><MessageCircle className="h-4 w-4" />WhatsApp Business</div>
        <h2 className="mt-1 text-xl font-black text-slate-950">Connect the official WhatsApp Business Cloud API.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">WhatsApp joins the same ProFox customer timeline as website chat and professional email. Provider secrets are stored in Supabase Vault and are never returned to the browser.</p>
      </div>
      <button type="button" disabled={saving} onClick={() => void load()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 disabled:opacity-50"><RefreshCw className="h-4 w-4" />Refresh</button>
    </div>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
    {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

    <div className={`rounded-2xl border p-4 ${config?.enabled && config?.configured ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-start gap-3">
        {config?.enabled && config?.configured ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
        <div><div className="text-sm font-black text-slate-900">{config?.enabled && config?.configured ? 'Provider enabled' : 'Provider not active yet'}</div><p className="mt-1 text-xs leading-5 text-slate-600">{storedSecrets}/3 provider secrets are stored. Until configuration is complete and enabled, sellers will see WhatsApp as unavailable instead of a fake send option.</p></div>
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <Field label="WhatsApp Phone Number ID"><input className={inputClass} value={form.phoneNumberId} onChange={e => setForm({ ...form, phoneNumberId: e.target.value })} placeholder="Meta Phone Number ID" /></Field>
      <Field label="WhatsApp Business Account ID"><input className={inputClass} value={form.businessAccountId} onChange={e => setForm({ ...form, businessAccountId: e.target.value })} placeholder="WABA ID" /></Field>
      <Field label="Business WhatsApp number" detail="International digits, for example 14155550123."><input className={inputClass} value={form.businessPhone} onChange={e => setForm({ ...form, businessPhone: e.target.value })} placeholder="Country code + number" /></Field>
      <Field label="Graph API version" detail="Kept configurable so Meta API upgrades do not require a code rewrite."><input className={inputClass} value={form.graphApiVersion} onChange={e => setForm({ ...form, graphApiVersion: e.target.value })} placeholder="v23.0" /></Field>
      <Field label="Permanent / system-user access token" detail={config?.accessTokenStored ? 'Stored securely — leave blank to keep the existing token.' : 'Required for first setup.'}><input type="password" autoComplete="new-password" className={inputClass} value={form.accessToken} onChange={e => setForm({ ...form, accessToken: e.target.value })} placeholder={config?.accessTokenStored ? 'Stored securely' : 'Meta access token'} /></Field>
      <Field label="Webhook verify token" detail={config?.verifyTokenStored ? 'Stored securely — leave blank to keep it.' : 'Choose a strong private verification token and use the same value in Meta.'}><input type="password" autoComplete="new-password" className={inputClass} value={form.verifyToken} onChange={e => setForm({ ...form, verifyToken: e.target.value })} placeholder={config?.verifyTokenStored ? 'Stored securely' : 'Private verification token'} /></Field>
      <Field label="Meta App Secret" detail={config?.appSecretStored ? 'Stored securely — leave blank to keep it.' : 'Used to validate X-Hub-Signature-256 on every incoming webhook.'}><input type="password" autoComplete="new-password" className={inputClass} value={form.appSecret} onChange={e => setForm({ ...form, appSecret: e.target.value })} placeholder={config?.appSecretStored ? 'Stored securely' : 'Meta app secret'} /></Field>
      <Field label="Approved outbound template" detail="Optional while a customer-service window is open. To initiate outside 24 hours, configure an approved template with one body variable {{1}} for the ProFox message."><input className={inputClass} value={form.defaultTemplateName} onChange={e => setForm({ ...form, defaultTemplateName: e.target.value })} placeholder="profox_customer_message" /></Field>
      <Field label="Template language"><input className={inputClass} value={form.defaultTemplateLanguage} onChange={e => setForm({ ...form, defaultTemplateLanguage: e.target.value })} placeholder="en_US" /></Field>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2"><div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Meta webhook callback URL</div><div className="mt-2 break-all rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-700">{webhookUrl}</div><p className="mt-2 text-[10px] leading-4 text-slate-500">Subscribe the Meta app to WhatsApp message webhooks. ProFox verifies the GET challenge with the private verify token and rejects POST payloads unless the App Secret HMAC signature is valid.</p></div>
    </div>

    <label className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><span><span className="block text-sm font-black text-slate-900">Enable WhatsApp in Unified Customer Conversations</span><span className="mt-1 block text-xs leading-5 text-slate-500">Enable only after provider credentials are stored and the Meta webhook is configured. No customer message is sent by enabling this switch.</span></span><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} className="mt-1 h-5 w-5 accent-[#000080]" /></label>

    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" /><p className="text-xs leading-5 text-slate-600">Unknown or ambiguous WhatsApp phone numbers are never auto-merged into a customer. They are held securely for review. Media is recorded as a safe placeholder for now; ProFox does not automatically download untrusted WhatsApp attachments.</p></div></div>

    <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void save()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving…' : 'Save WhatsApp configuration'}</button></div>
  </section>;
}
