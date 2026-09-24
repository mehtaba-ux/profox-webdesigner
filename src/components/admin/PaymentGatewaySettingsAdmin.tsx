import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, CreditCard, Loader2, LockKeyhole, RefreshCw, Save, ShieldCheck, WalletCards, XCircle } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { GatewayProviderStatus, PaymentGatewayStatus, PaymentProviderId, paymentGatewayService } from '../../lib/paymentGatewayService';
import RazorpayXPayoutAdmin from './RazorpayXPayoutAdmin';

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');

export default function PaymentGatewaySettingsAdmin() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PaymentGatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [general, setGeneral] = useState({ checkoutBaseUrl: 'https://www.profoxwebdesigner.com', firstPaymentDueDays: 7, milestoneDueDays: 5 });
  const [razorpay, setRazorpay] = useState({ enabled: false, mode: 'test', publicId: '', secret: '', webhookSecret: '' });
  const [paypal, setPaypal] = useState({ enabled: false, mode: 'sandbox', publicId: '', secret: '', webhookId: '' });

  const hydrate = (data: PaymentGatewayStatus) => {
    setStatus(data);
    setGeneral({ checkoutBaseUrl: data.checkoutBaseUrl || 'https://www.profoxwebdesigner.com', firstPaymentDueDays: Number(data.firstPaymentDueDays ?? 7), milestoneDueDays: Number(data.milestoneDueDays ?? 5) });
    setRazorpay({ enabled: !!data.razorpay?.enabled, mode: data.razorpay?.mode || 'test', publicId: data.razorpay?.keyId || '', secret: '', webhookSecret: '' });
    setPaypal({ enabled: !!data.paypal?.enabled, mode: data.paypal?.mode || 'sandbox', publicId: data.paypal?.clientId || '', secret: '', webhookId: data.paypal?.webhookId || '' });
  };

  const load = async () => {
    setLoading(true); setError('');
    try { hydrate(await paymentGatewayService.getAdminStatus()); }
    catch (e: any) { setError(e?.message || 'Payment gateway settings could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  const saveGeneral = async () => {
    setBusy('general'); setError(''); setMessage('');
    try { const data = await paymentGatewayService.saveGeneral(general); hydrate(data); setMessage('General payment settings saved. New payment links will use this checkout base URL and due-date policy.'); }
    catch (e: any) { setError(e?.message || 'General payment settings could not be saved.'); }
    finally { setBusy(''); }
  };

  const saveProvider = async (provider: PaymentProviderId) => {
    setBusy(provider); setError(''); setMessage('');
    try {
      const source = provider === 'razorpay' ? razorpay : paypal;
      const data = await paymentGatewayService.saveProvider({
        provider,
        enabled: source.enabled,
        mode: source.mode,
        publicId: source.publicId,
        secret: source.secret,
        webhookSecret: provider === 'razorpay' ? razorpay.webhookSecret : '',
        webhookId: provider === 'paypal' ? paypal.webhookId : '',
      });
      hydrate(data);
      setMessage(`${provider === 'razorpay' ? 'Razorpay' : 'PayPal'} settings saved securely. Secret fields were written to Supabase Vault and cleared from this screen.`);
    } catch (e: any) { setError(e?.message || 'Provider settings could not be saved.'); }
    finally { setBusy(''); }
  };

  const testProvider = async (provider: PaymentProviderId) => {
    setBusy(`test-${provider}`); setError(''); setMessage('');
    try { const result = await paymentGatewayService.testProvider(provider); setMessage(result.message || `${provider} connection passed.`); await load(); }
    catch (e: any) { setError(e?.message || `${provider} connection test failed.`); }
    finally { setBusy(''); }
  };

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  const razorpayWebhook = `${SUPABASE_URL}/functions/v1/payment-webhook-razorpay`;
  const paypalWebhook = `${SUPABASE_URL}/functions/v1/payment-webhook-paypal`;
  const clientCheckoutReady = [status?.razorpay, status?.paypal].some(provider => provider?.checkoutReady);
  const productionCheckoutReady = [status?.razorpay, status?.paypal].some(provider => provider?.productionReady);

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-6xl items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">Admin · Finance Infrastructure</div><h1 className="mt-1 text-2xl font-black">Payment Gateway Setup</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Configure how ProFox collects quotation-linked payments. Sales Catalog owns commercial schedules; this area only controls secure payment collection.</p></div><div className="flex gap-2"><button onClick={() => navigate('/admin/app/sales?tab=payments')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">Payments</button><button onClick={() => void load()} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600"><RefreshCw className="h-4 w-4" /></button></div></div></header>
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      {error && <Notice danger>{error}</Notice>}{message && <Notice>{message}</Notice>}
      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard title="Quotation authority" text="Payment amounts come only from accepted quotation snapshots." ok />
        <StatusCard title="Secret storage" text="Provider secrets are write-only in Supabase Vault." ok />
        <StatusCard title="Online checkout" text={productionCheckoutReady ? 'At least one Live provider is production-ready for clients.' : clientCheckoutReady ? 'Verified Test checkout is available to clients for end-to-end testing; no provider is Live yet.' : 'No provider is currently ready for client checkout.'} ok={clientCheckoutReady} />
      </section>
      {clientCheckoutReady && !productionCheckoutReady && <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-black">Razorpay Test checkout is active</div><p className="mt-1 leading-6">Clients can now exercise the complete secure payment flow with Razorpay Test Mode. This is intentionally not marked production-ready and should use Razorpay test payment details only. Switch to Live later and run a fresh server-side connection test before real collection.</p></div></div></section>}
      {!clientCheckoutReady && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><div className="flex gap-3"><XCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-black">Online checkout is unavailable</div><p className="mt-1 leading-6">Configure the provider credentials and webhook verification, run a successful server-side connection test, then enable the provider.</p></div></div></section>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><div className="rounded-2xl bg-blue-50 p-3 text-[#000080]"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-black">General Payment Settings</h2><p className="text-xs text-slate-500">These values control generated payment links and due dates, never quotation pricing.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-3"><Field label="Checkout base URL"><input className={input} value={general.checkoutBaseUrl} onChange={e => setGeneral({ ...general, checkoutBaseUrl: e.target.value })} placeholder="https://www.profoxwebdesigner.com" /></Field><Field label="First payment due (days)"><input className={input} type="number" min={0} max={90} value={general.firstPaymentDueDays} onChange={e => setGeneral({ ...general, firstPaymentDueDays: Number(e.target.value) })} /></Field><Field label="Later milestone due (days)"><input className={input} type="number" min={0} max={90} value={general.milestoneDueDays} onChange={e => setGeneral({ ...general, milestoneDueDays: Number(e.target.value) })} /></Field></div><div className="mt-4 flex justify-end"><button disabled={!!busy} onClick={() => void saveGeneral()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{busy === 'general' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save General Settings</button></div></section>

      <ProviderCard title="Razorpay" icon={<CreditCard className="h-5 w-5" />} state={status?.razorpay} webhookUrl={razorpayWebhook} configuredText="Key ID + API Secret" webhookText="Razorpay webhook secret">
        <div className="grid gap-4 md:grid-cols-2"><Field label="Mode"><select className={input} value={razorpay.mode} onChange={e => setRazorpay({ ...razorpay, mode: e.target.value, enabled: false })}><option value="test">Test</option><option value="live">Live</option></select></Field><Field label="Key ID"><input className={input} value={razorpay.publicId} onChange={e => setRazorpay({ ...razorpay, publicId: e.target.value })} placeholder="rzp_test_... or rzp_live_..." /></Field><Field label="API Secret · write only"><input className={input} type="password" autoComplete="new-password" value={razorpay.secret} onChange={e => setRazorpay({ ...razorpay, secret: e.target.value })} placeholder={status?.razorpay?.configured ? 'Stored securely — enter only to replace' : 'Enter Razorpay API Secret'} /></Field><Field label="Webhook Secret · write only"><input className={input} type="password" autoComplete="new-password" value={razorpay.webhookSecret} onChange={e => setRazorpay({ ...razorpay, webhookSecret: e.target.value })} placeholder={status?.razorpay?.webhookConfigured ? 'Stored securely — enter only to replace' : 'Enter webhook secret'} /></Field></div>
        <ProviderActions enabled={razorpay.enabled} setEnabled={value => setRazorpay({ ...razorpay, enabled: value })} busy={busy} provider="razorpay" onSave={saveProvider} onTest={testProvider} canTest={!!status?.razorpay?.configured} canEnable={!!status?.razorpay?.configured && !!status?.razorpay?.webhookConfigured} />
      </ProviderCard>

      <ProviderCard title="PayPal" icon={<WalletCards className="h-5 w-5" />} state={status?.paypal} webhookUrl={paypalWebhook} configuredText="Client ID + Client Secret" webhookText="PayPal Webhook ID">
        <div className="grid gap-4 md:grid-cols-2"><Field label="Mode"><select className={input} value={paypal.mode} onChange={e => setPaypal({ ...paypal, mode: e.target.value, enabled: false })}><option value="sandbox">Sandbox</option><option value="live">Live</option></select></Field><Field label="Client ID"><input className={input} value={paypal.publicId} onChange={e => setPaypal({ ...paypal, publicId: e.target.value })} placeholder="PayPal REST Client ID" /></Field><Field label="Client Secret · write only"><input className={input} type="password" autoComplete="new-password" value={paypal.secret} onChange={e => setPaypal({ ...paypal, secret: e.target.value })} placeholder={status?.paypal?.configured ? 'Stored securely — enter only to replace' : 'Enter PayPal Client Secret'} /></Field><Field label="Webhook ID"><input className={input} value={paypal.webhookId} onChange={e => setPaypal({ ...paypal, webhookId: e.target.value })} placeholder="Webhook ID from PayPal Developer Dashboard" /></Field></div>
        <ProviderActions enabled={paypal.enabled} setEnabled={value => setPaypal({ ...paypal, enabled: value })} busy={busy} provider="paypal" onSave={saveProvider} onTest={testProvider} canTest={!!status?.paypal?.configured} canEnable={!!status?.paypal?.configured && !!status?.paypal?.webhookConfigured} />
      </ProviderCard>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><div className="flex gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-black">Provider activation rule</div><p className="mt-1 leading-6">A provider cannot be enabled until its public identifier, server secret and webhook verification configuration are complete. Razorpay Test Mode may be enabled for end-to-end client testing after a fresh successful connection test; only Live mode can become production-ready. Switching modes requires a new save and connection test.</p></div></div></section>
      <RazorpayXPayoutAdmin />
    </main>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function Notice({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) { return <div className={`rounded-2xl border p-4 text-sm font-semibold ${danger ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{children}</div>; }
function StatusCard({ title, text, ok }: { title: string; text: string; ok: boolean }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}<span className="text-xs font-black">{title}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></div>; }
function ProviderCard({ title, icon, state, webhookUrl, configuredText, webhookText, children }: { title: string; icon: React.ReactNode; state?: GatewayProviderStatus; webhookUrl: string; configuredText: string; webhookText: string; children: React.ReactNode }) {
  const copy = async () => { try { await navigator.clipboard.writeText(webhookUrl); } catch { /* browser may block clipboard */ } };
  const availability = state?.productionReady ? 'Production ready' : state?.checkoutReady ? 'Test checkout available' : 'Not available to customers';
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-center gap-3"><div className="rounded-2xl bg-slate-100 p-3 text-[#000080]">{icon}</div><div><h2 className="font-black">{title}</h2><div className="mt-1 flex flex-wrap gap-2"><Badge ok={!!state?.configured}>{configuredText}: {state?.configured ? 'configured' : 'not configured'}</Badge><Badge ok={!!state?.webhookConfigured}>{webhookText}: {state?.webhookConfigured ? 'configured' : 'not configured'}</Badge><Badge ok={!!state?.enabled}>{state?.enabled ? 'Enabled' : 'Disabled'}</Badge><Badge ok={!!state?.checkoutReady}>{availability}</Badge></div></div></div>{state?.lastTestAt && <div className="text-right text-[10px] text-slate-500"><div className={state.lastTestSuccess ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>{state.lastTestSuccess ? 'Last test passed' : 'Last test failed'}</div><div>{new Date(state.lastTestAt).toLocaleString()}</div></div>}</div>{state?.testMode && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Test checkout is available to clients. This provider is intentionally not production-ready; use provider test payment details only.</div>}{state?.enabled && !state?.checkoutReady && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">This provider is saved but customer checkout remains blocked until the selected mode passes a fresh server-side connection test.</div>}<div className="mt-5">{children}</div><div className="mt-4 rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Webhook URL</div><div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-slate-700">{webhookUrl}</code><button onClick={() => void copy()} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600" title="Copy webhook URL"><Copy className="h-4 w-4" /></button></div></div></section>;
}
function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) { return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{children}</span>; }
function ProviderActions({ enabled, setEnabled, busy, provider, onSave, onTest, canTest, canEnable }: { enabled: boolean; setEnabled: (value: boolean) => void; busy: string; provider: PaymentProviderId; onSave: (provider: PaymentProviderId) => Promise<void>; onTest: (provider: PaymentProviderId) => Promise<void>; canTest: boolean; canEnable: boolean }) { return <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><label className="inline-flex items-center gap-2 text-xs font-black"><input type="checkbox" checked={enabled} disabled={!canEnable && !enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4 disabled:opacity-40" />Enable provider for client checkout</label>{!canEnable && !enabled && <p className="mt-1 text-[10px] text-amber-700">Save credentials and webhook verification first; then enable the provider.</p>}</div><div className="flex gap-2"><button disabled={!!busy || !canTest} onClick={() => void onTest(provider)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black disabled:opacity-40">{busy === `test-${provider}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Test Connection</button><button disabled={!!busy} onClick={() => void onSave(provider)} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{busy === provider ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Provider</button></div></div>; }