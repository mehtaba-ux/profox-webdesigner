import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, FileText, Loader2, LockKeyhole, ShieldCheck, WalletCards, XCircle } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PaymentProviderId, PublicPayment, paymentGatewayService } from '../lib/paymentGatewayService';

function money(value: number, currency = 'USD') { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0)); } catch { return `${currency} ${Number(value || 0).toFixed(2)}`; } }
function date(value?: string) { if (!value) return 'As agreed'; const d = new Date(`${value}T00:00:00`); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }

async function loadRazorpayScript() {
  if ((window as any).Razorpay) return true;
  return await new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-profox-razorpay]');
    if (existing) { existing.addEventListener('load', () => resolve(true), { once: true }); existing.addEventListener('error', () => resolve(false), { once: true }); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true; script.dataset.profoxRazorpay = '1';
    script.onload = () => resolve(true); script.onerror = () => resolve(false); document.head.appendChild(script);
  });
}

export default function PublicPaymentCheckout() {
  const { token = '' } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [payment, setPayment] = useState<PublicPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => { setLoading(true); setError(''); try { setPayment(await paymentGatewayService.openPublicPayment(token)); } catch (e: any) { setError(e?.message || 'This payment link could not be opened.'); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, [token]);

  useEffect(() => {
    if (!token || searchParams.get('provider') !== 'paypal') return;
    if (searchParams.get('paypal_cancel') === '1') { setMessage('PayPal checkout was cancelled. No payment was recorded.'); window.history.replaceState({}, '', `/pay/${token}`); return; }
    if (searchParams.get('paypal_return') !== '1') return;
    const attemptId = searchParams.get('attempt') || '';
    const providerOrderId = searchParams.get('token') || '';
    if (!attemptId) { setError('PayPal return information is incomplete.'); return; }
    void (async () => {
      setBusy('paypal'); setError(''); setMessage('Completing your PayPal payment securely…');
      try {
        const result = await paymentGatewayService.checkout({ action: 'paypal_capture', paymentToken: token, attemptId, providerOrderId });
        if (result?.verified) setMessage('Payment received and verified successfully. Thank you.');
        window.history.replaceState({}, '', `/pay/${token}`);
        await refresh();
      } catch (e: any) { setError(e?.message || 'PayPal payment could not be completed.'); }
      finally { setBusy(''); }
    })();
  }, [token, searchParams]);

  const providers = useMemo(() => (payment?.providers || []).filter(p => p.enabled), [payment]);

  const startPayPal = async () => {
    setBusy('paypal'); setError(''); setMessage('');
    try { const result = await paymentGatewayService.checkout({ action: 'create', paymentToken: token, provider: 'paypal' }); if (result?.alreadyPaid) { await refresh(); return; } if (!result?.redirectUrl) throw new Error('PayPal approval URL was not returned.'); window.location.assign(String(result.redirectUrl)); }
    catch (e: any) { setError(e?.message || 'PayPal checkout could not be started.'); setBusy(''); }
  };

  const startRazorpay = async () => {
    setBusy('razorpay'); setError(''); setMessage('');
    try {
      const result = await paymentGatewayService.checkout({ action: 'create', paymentToken: token, provider: 'razorpay' });
      if (result?.alreadyPaid) { await refresh(); setBusy(''); return; }
      if (!(await loadRazorpayScript())) throw new Error('Razorpay Checkout could not be loaded. Please try again.');
      const Razorpay = (window as any).Razorpay;
      const checkout = new Razorpay({
        key: result.keyId, amount: result.amount, currency: result.currency, order_id: result.orderId,
        name: 'ProFox Web Designer', description: payment?.milestoneLabel || payment?.paymentType || 'Project payment',
        prefill: { name: result.customerName || payment?.customerName || '', email: result.customerEmail || payment?.customerEmail || '' },
        notes: { payment_reference: result.paymentReference || payment?.paymentReference || '' },
        theme: { color: '#000080' },
        modal: { ondismiss: () => { setBusy(''); setMessage('Razorpay checkout was closed. No payment is marked verified unless the gateway confirms capture.'); } },
        handler: async (response: any) => {
          try {
            setMessage('Verifying your Razorpay payment securely…');
            const verified = await paymentGatewayService.checkout({ action: 'razorpay_verify', paymentToken: token, attemptId: result.attemptId, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature });
            if (verified?.verified) setMessage('Payment received and verified successfully. Thank you.');
            await refresh();
          } catch (e: any) { setError(e?.message || 'Razorpay payment verification failed.'); }
          finally { setBusy(''); }
        },
      });
      checkout.on?.('payment.failed', (response: any) => { setError(response?.error?.description || 'Razorpay reported that the payment did not complete.'); setBusy(''); });
      checkout.open();
    } catch (e: any) { setError(e?.message || 'Razorpay checkout could not be started.'); setBusy(''); }
  };

  const pay = (provider: PaymentProviderId) => provider === 'paypal' ? startPayPal() : startRazorpay();

  if (loading && !payment) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (error && !payment) return <Shell><div className="mx-auto max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><XCircle className="mx-auto h-10 w-10 text-red-600" /><h1 className="mt-4 text-xl font-black">Payment unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">{error}</p></div></Shell>;

  return <Shell>{payment && <div className="mx-auto max-w-3xl space-y-5">
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="inline-flex items-center gap-2 text-[#000080]"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-wider">Secure ProFox Payment</span></div><h1 className="mt-3 text-2xl font-black sm:text-3xl">{payment.milestoneLabel || payment.paymentType}</h1><p className="mt-2 text-sm text-slate-500">For {payment.customerName} · {payment.paymentReference}</p></div><div className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase text-slate-600">{payment.status}</div></div></section>
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}{message && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</div>}
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="grid gap-4 sm:grid-cols-2"><Info label="Quotation" value={payment.quotationNumber || '—'} icon={<FileText className="h-4 w-4" />} /><Info label="Due date" value={date(payment.dueDate)} /><Info label="Payment amount" value={money(payment.amountDue, payment.currency)} /><Info label="Already received" value={money(payment.amountPaid, payment.currency)} /></div><div className="mt-6 rounded-3xl bg-slate-50 p-5"><div className="text-xs font-black uppercase tracking-wider text-slate-500">Amount payable now</div><div className="mt-2 text-4xl font-black text-[#000080]">{money(payment.outstanding, payment.currency)}</div><p className="mt-2 text-xs leading-5 text-slate-500">This amount is generated from your accepted quotation and cannot be edited on this checkout page.</p></div></section>
    {payment.status === 'Verified' || payment.verifiedAt ? <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center"><CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" /><h2 className="mt-4 text-xl font-black text-emerald-900">Payment verified</h2><p className="mt-2 text-sm leading-6 text-emerald-800">Thank you. ProFox has recorded this payment and the connected project workflow will continue automatically.</p></section> : payment.payable ? <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-[#000080]" /><h2 className="font-black">Choose a secure payment method</h2></div>{providers.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{providers.map(provider => <button key={provider.id} disabled={!!busy} onClick={() => void pay(provider.id)} className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black shadow-sm transition hover:border-[#000080] hover:bg-blue-50 disabled:opacity-50">{busy === provider.id ? <Loader2 className="h-5 w-5 animate-spin" /> : provider.id === 'paypal' ? <WalletCards className="h-5 w-5 text-[#000080]" /> : <CreditCard className="h-5 w-5 text-[#000080]" />}{provider.label}</button>)}</div> : <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Online payment providers are temporarily unavailable for this payment. Please contact ProFox for assistance.</div>}<p className="mt-4 text-[11px] leading-5 text-slate-500">Your payment is processed by the selected provider. ProFox never exposes provider API secrets in this browser page, and a payment is marked verified only after server-side provider verification.</p></section> : <section className="rounded-3xl border border-slate-200 bg-white p-6 text-center"><h2 className="font-black">This milestone is not payable right now</h2><p className="mt-2 text-sm text-slate-500">Contact ProFox if you believe this payment should be available.</p></section>}
  </div>}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <div className="min-h-screen bg-slate-50 text-slate-900"><main className="p-4 sm:p-8">{children}</main></div>; }
function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) { return <div className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{icon}{label}</div><div className="mt-2 text-sm font-black text-slate-900">{value}</div></div>; }
