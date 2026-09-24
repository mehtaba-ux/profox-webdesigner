import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Headphones,
  Loader2,
  LockKeyhole,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PaymentProviderId, PublicPayment, PublicPaymentMilestone, paymentGatewayService } from '../lib/paymentGatewayService';

const PAYMENT_ASSETS = {
  paypal: '/api/r2-media/payment-brand/paypal-logo.png',
  razorpay: '/api/r2-media/payment-brand/razorpay-logo.png',
  secure: '/api/r2-media/payment-brand/secure-payment-badge.svg',
} as const;

function money(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function date(value?: string) {
  if (!value) return 'As agreed';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function dateTime(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function loadRazorpayScript() {
  if ((window as any).Razorpay) return true;
  return await new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-profox-razorpay]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.profoxRazorpay = '1';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

type RazorpayQuote = {
  originalAmount: number;
  originalCurrency: string;
  providerAmount: number;
  providerCurrency: string;
  fxRate: number;
  fxSource?: string;
  fxQuotedAt?: string;
};

export default function PublicPaymentCheckout() {
  const { token = '' } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [payment, setPayment] = useState<PublicPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [razorpayQuote, setRazorpayQuote] = useState<RazorpayQuote | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setPayment(await paymentGatewayService.openPublicPayment(token));
    } catch (e: any) {
      setError(e?.message || 'This payment link could not be opened.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [token]);

  useEffect(() => {
    if (!token || searchParams.get('provider') !== 'paypal') return;
    if (searchParams.get('paypal_cancel') === '1') {
      setMessage('PayPal checkout was cancelled. No payment was recorded.');
      window.history.replaceState({}, '', `/pay/${token}`);
      return;
    }
    if (searchParams.get('paypal_return') !== '1') return;
    const attemptId = searchParams.get('attempt') || '';
    const providerOrderId = searchParams.get('token') || '';
    if (!attemptId) { setError('PayPal return information is incomplete.'); return; }
    void (async () => {
      setBusy('paypal');
      setError('');
      setMessage('Completing your PayPal payment securely…');
      try {
        const result = await paymentGatewayService.checkout({ action: 'paypal_capture', paymentToken: token, attemptId, providerOrderId });
        if (result?.verified) setMessage('Payment received and verified successfully. Thank you.');
        window.history.replaceState({}, '', `/pay/${token}`);
        await refresh();
      } catch (e: any) {
        setError(e?.message || 'PayPal payment could not be completed.');
      } finally {
        setBusy('');
      }
    })();
  }, [token, searchParams]);

  const providers = useMemo(() => (payment?.providers || []).filter(provider => provider.enabled), [payment]);
  const razorpayEnabled = useMemo(() => providers.some(provider => provider.id === 'razorpay'), [providers]);
  const razorpayTestMode = useMemo(() => providers.some(provider => provider.id === 'razorpay' && provider.testMode), [providers]);
  const verified = Boolean(payment && (payment.status === 'Verified' || payment.verifiedAt));
  const progress = useMemo(() => payment?.paymentProgress || [], [payment]);
  const projectOutstanding = useMemo(() => progress.reduce((sum, item) => sum + Math.max(Number(item.amountDue || 0) - Number(item.amountPaid || 0), 0), 0), [progress]);
  const projectPaid = useMemo(() => progress.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0), [progress]);

  const startPayPal = async () => {
    setBusy('paypal');
    setError('');
    setMessage('Opening secure PayPal checkout…');
    try {
      const result = await paymentGatewayService.checkout({ action: 'create', paymentToken: token, provider: 'paypal' });
      if (result?.alreadyPaid) { await refresh(); return; }
      if (!result?.redirectUrl) throw new Error('PayPal approval URL was not returned.');
      window.location.assign(String(result.redirectUrl));
    } catch (e: any) {
      setError(e?.message || 'PayPal checkout could not be started.');
      setBusy('');
    }
  };

  const startRazorpay = async () => {
    setBusy('razorpay');
    setError('');
    setMessage('Preparing the current INR conversion for Razorpay…');
    try {
      const result = await paymentGatewayService.checkout({ action: 'create', paymentToken: token, provider: 'razorpay' });
      if (result?.alreadyPaid) { await refresh(); setBusy(''); return; }
      const providerCurrency = String(result?.providerCurrency || result?.currency || '').toUpperCase();
      const providerAmount = Number(result?.providerAmount || (Number(result?.amount || 0) / 100));
      const originalCurrency = String(result?.originalCurrency || payment?.currency || '').toUpperCase();
      const originalAmount = Number(result?.originalAmount ?? payment?.outstanding ?? 0);
      const fxRate = Number(result?.fxRate || (originalCurrency === 'INR' ? 1 : 0));
      if (providerCurrency !== 'INR' || !(providerAmount > 0)) throw new Error('Razorpay did not return a valid INR checkout amount. Please try again.');

      const quote: RazorpayQuote = {
        originalAmount,
        originalCurrency,
        providerAmount,
        providerCurrency,
        fxRate,
        fxSource: result?.fxSource,
        fxQuotedAt: result?.fxQuotedAt,
      };
      setRazorpayQuote(quote);
      setMessage(originalCurrency === 'INR'
        ? `Razorpay checkout prepared for ${money(providerAmount, 'INR')}.`
        : `Razorpay conversion locked: ${money(originalAmount, originalCurrency)} → ${money(providerAmount, 'INR')}${fxRate > 0 ? ` at ${fxRate.toFixed(4)} INR per ${originalCurrency}` : ''}.`);

      if (!(await loadRazorpayScript())) throw new Error('Razorpay Checkout could not be loaded. Please try again.');
      const Razorpay = (window as any).Razorpay;
      const descriptionBase = payment?.milestoneLabel || payment?.paymentType || 'Project payment';
      const conversionDescription = originalCurrency === 'INR' ? money(providerAmount, 'INR') : `${money(originalAmount, originalCurrency)} → ${money(providerAmount, 'INR')}`;
      const checkout = new Razorpay({
        key: result.keyId,
        amount: result.amount,
        currency: 'INR',
        order_id: result.orderId,
        name: 'ProFox Web Designer',
        description: `${descriptionBase} · ${conversionDescription}`,
        prefill: { name: result.customerName || payment?.customerName || '', email: result.customerEmail || payment?.customerEmail || '' },
        notes: { payment_reference: result.paymentReference || payment?.paymentReference || '' },
        theme: { color: '#000080' },
        modal: {
          ondismiss: () => {
            setBusy('');
            setMessage('Razorpay checkout was closed. No payment is recorded unless the gateway confirms the transaction.');
          },
        },
        handler: async (response: any) => {
          try {
            setMessage('Verifying your Razorpay payment securely…');
            const resultVerified = await paymentGatewayService.checkout({
              action: 'razorpay_verify',
              paymentToken: token,
              attemptId: result.attemptId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            if (resultVerified?.verified) setMessage('Payment received and verified successfully. Thank you.');
            await refresh();
          } catch (e: any) {
            setError(e?.message || 'Razorpay payment verification failed.');
          } finally {
            setBusy('');
          }
        },
      });
      checkout.on?.('payment.failed', (response: any) => {
        const reason = response?.error?.description || 'Razorpay reported that the payment did not complete.';
        setError(`${reason} Try another available payment method or contact ProFox if you need help.`);
        setBusy('');
      });
      checkout.open();
    } catch (e: any) {
      setError(e?.message || 'Razorpay checkout could not be started.');
      setBusy('');
    }
  };

  const pay = (provider: PaymentProviderId) => provider === 'paypal' ? startPayPal() : startRazorpay();

  if (loading && !payment) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (error && !payment) return <Shell><div className="mx-auto max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><XCircle className="mx-auto h-10 w-10 text-red-600" /><h1 className="mt-4 text-xl font-black">Payment unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">{error}</p></div></Shell>;

  return <Shell>{payment && <div className="mx-auto max-w-6xl space-y-5">
    <PaymentHeader payment={payment} verified={verified} />

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><div className="flex gap-3"><XCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-black">Payment needs attention</div><p className="mt-1 font-medium leading-6">{error}</p></div></div></div>}
    {message && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</div>}

    {verified ? (
      <VerifiedPayment payment={payment} projectPaid={projectPaid} projectOutstanding={projectOutstanding} />
    ) : (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="space-y-5">
          <WhatYouArePayingFor payment={payment} />
          <PaymentPlan payment={payment} progress={progress} />
          <CustomerAndDelivery payment={payment} />
          <WhatHappensNext />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6">
          <AmountCard payment={payment} razorpayEnabled={razorpayEnabled} razorpayQuote={razorpayQuote} />
          {payment.payable ? (
            <PaymentMethods
              providers={providers}
              busy={busy}
              pay={pay}
              razorpayQuote={razorpayQuote}
              razorpayTestMode={razorpayTestMode}
              payment={payment}
            />
          ) : (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm"><h2 className="font-black">This milestone is not payable right now</h2><p className="mt-2 text-sm leading-6 text-slate-500">Contact ProFox if you believe this payment should be available.</p></section>
          )}
          <SecurityCard />
          <SupportCard />
        </aside>
      </div>
    )}

    <PaymentFooter payment={payment} />
  </div>}</Shell>;
}

function PaymentHeader({ payment, verified }: { payment: PublicPayment; verified: boolean }) {
  return <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
    <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-[#000080]"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-[.16em]">Secure ProFox Payment</span></div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${verified ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{verified ? 'Verified' : payment.status}</span>
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{verified ? 'Payment complete' : payment.milestoneLabel || payment.paymentType}</h1>
        <p className="mt-2 text-sm text-slate-500">{payment.customerName} · {payment.paymentReference}{payment.quotationNumber ? ` · ${payment.quotationNumber}` : ''}</p>
      </div>
      <img src={PAYMENT_ASSETS.secure} alt="Secure payment" className="h-auto w-[240px] max-w-full" />
    </div>
  </section>;
}

function WhatYouArePayingFor({ payment }: { payment: PublicPayment }) {
  const quote = payment.quotation;
  const items = quote?.items || [];
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <SectionTitle icon={<ReceiptText className="h-5 w-5" />} title="What you’re paying for" subtitle="A customer-facing summary of the accepted quotation linked to this payment." />
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Info label="Quotation" value={quote?.number || payment.quotationNumber || '—'} icon={<FileText className="h-4 w-4" />} />
      <Info label="Payment milestone" value={payment.milestoneLabel || payment.paymentType} icon={<CircleDollarSign className="h-4 w-4" />} />
      <Info label="Quotation total" value={money(Number(quote?.total || payment.amountDue), quote?.currency || payment.currency)} />
      <Info label="Due date" value={date(payment.dueDate)} icon={<CalendarDays className="h-4 w-4" />} />
    </div>
    {(quote?.proposalTitle || quote?.scopeSummary) && <div className="mt-5 rounded-2xl bg-slate-50 p-5"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Project</div><div className="mt-1 font-black text-slate-900">{quote?.proposalTitle || 'Accepted ProFox proposal'}</div>{quote?.scopeSummary && <p className="mt-2 text-sm leading-6 text-slate-600">{quote.scopeSummary}</p>}</div>}
    {items.length > 0 && <div className="mt-5 space-y-3"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Included services</div>{items.map((item, index) => <div key={`${item.name}-${index}`} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-4"><div><div className="font-black text-slate-900">{item.name}</div>{item.description && <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>}</div>{Number(item.lineTotal || 0) > 0 && <div className="shrink-0 text-sm font-black text-slate-900">{money(Number(item.lineTotal), quote?.currency || payment.currency)}</div>}</div></div>)}</div>}
  </section>;
}

function PaymentPlan({ payment, progress }: { payment: PublicPayment; progress: PublicPaymentMilestone[] }) {
  if (!progress.length) return null;
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <SectionTitle icon={<Clock3 className="h-5 w-5" />} title="Your payment plan" subtitle="See what has been received, what is due now, and what remains later." />
    <div className="mt-6 space-y-3">{progress.map((item, index) => {
      const paid = item.status === 'Verified' || Number(item.amountPaid || 0) >= Number(item.amountDue || 0);
      const current = item.current;
      return <div key={item.paymentId || `${item.label}-${index}`} className={`flex gap-4 rounded-2xl border p-4 ${current ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${paid ? 'bg-emerald-100 text-emerald-700' : current ? 'bg-blue-100 text-[#000080]' : 'bg-slate-100 text-slate-500'}`}>{paid ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-black">{item.milestoneNumber || index + 1}</span>}</div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-black text-slate-900">{item.label}{current ? ' · Due now' : ''}</div><div className="mt-1 text-xs text-slate-500">{paid ? 'Paid and verified' : item.dueDate ? `Due ${date(item.dueDate)}` : item.status}</div></div><div className="text-sm font-black text-slate-900">{money(Number(item.amountDue || 0), item.currency || payment.currency)}</div></div></div>
      </div>;
    })}</div>
  </section>;
}

function CustomerAndDelivery({ payment }: { payment: PublicPayment }) {
  return <section className="grid gap-5 md:grid-cols-2">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><SectionTitle icon={<UserRound className="h-5 w-5" />} title="Billing details" /><div className="mt-5 space-y-3 text-sm"><DetailRow label="Customer" value={payment.customerName || '—'} /><DetailRow label="Email" value={payment.customerEmail || '—'} /><DetailRow label="Payment reference" value={payment.paymentReference} /></div></div>
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><SectionTitle icon={<BadgeCheck className="h-5 w-5" />} title="Project context" /><div className="mt-5 space-y-3 text-sm"><DetailRow label="Quotation status" value={payment.quotation?.status || 'Accepted'} /><DetailRow label="Delivery" value={payment.quotation?.deliveryTimeline || 'As agreed in the quotation'} /><DetailRow label="Payment terms" value={payment.quotation?.paymentTerms || 'As agreed in the quotation'} /></div></div>
  </section>;
}

function WhatHappensNext() {
  const steps = [
    ['Payment is verified', 'ProFox validates the provider confirmation server-side before marking the milestone paid.'],
    ['Your record updates', 'The payment reference and paid amount are recorded against the accepted quotation.'],
    ['Project workflow continues', 'The connected project moves forward according to the agreed delivery and milestone plan.'],
  ];
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><SectionTitle icon={<ChevronRight className="h-5 w-5" />} title="What happens after payment" /><div className="mt-6 grid gap-4 sm:grid-cols-3">{steps.map(([title, text], index) => <div key={title} className="rounded-2xl bg-slate-50 p-4"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#000080] text-xs font-black text-white">{index + 1}</div><div className="mt-3 text-sm font-black text-slate-900">{title}</div><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>)}</div></section>;
}

function AmountCard({ payment, razorpayEnabled, razorpayQuote }: { payment: PublicPayment; razorpayEnabled: boolean; razorpayQuote: RazorpayQuote | null }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Amount payable now</div>
    <div className="mt-2 text-4xl font-black tracking-tight text-[#000080]">{money(payment.outstanding, payment.currency)}</div>
    <div className="mt-4 space-y-2 border-t border-slate-100 pt-4"><DetailRow label="Payment amount" value={money(payment.amountDue, payment.currency)} /><DetailRow label="Already received" value={money(payment.amountPaid, payment.currency)} /></div>
    {razorpayEnabled && payment.currency !== 'INR' && !razorpayQuote && <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><span className="font-black">Razorpay conversion:</span> the current server-side USD→INR reference rate is locked when you choose Razorpay. The INR charge is shown before the provider checkout opens.</div>}
    {razorpayQuote && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Final Razorpay charge</div><div className="mt-1 text-2xl font-black text-emerald-950">{money(razorpayQuote.providerAmount, razorpayQuote.providerCurrency)}</div>{razorpayQuote.originalCurrency !== 'INR' && <div className="mt-1 text-xs text-emerald-800">Equivalent to {money(razorpayQuote.originalAmount, razorpayQuote.originalCurrency)}{razorpayQuote.fxRate > 0 ? ` · 1 ${razorpayQuote.originalCurrency} = ${razorpayQuote.fxRate.toFixed(4)} INR` : ''}</div>}{razorpayQuote.fxSource && <div className="mt-2 text-[10px] leading-4 text-emerald-700">FX reference: {razorpayQuote.fxSource}{razorpayQuote.fxQuotedAt ? ` · locked ${dateTime(razorpayQuote.fxQuotedAt)}` : ''}</div>}</div>}
  </section>;
}

function PaymentMethods({ providers, busy, pay, razorpayQuote, razorpayTestMode, payment }: { providers: PublicPayment['providers']; busy: string; pay: (provider: PaymentProviderId) => void; razorpayQuote: RazorpayQuote | null; razorpayTestMode: boolean; payment: PublicPayment }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-[#000080]" /><h2 className="font-black">Choose a secure payment method</h2></div>
    {razorpayTestMode && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-amber-900">Razorpay · Test Mode</div><p className="mt-1 text-xs leading-5 text-amber-800">Use Razorpay test payment details only. No real customer funds should be charged through the Razorpay option while Test Mode is active.</p></div>}
    {providers.length ? <div className="mt-5 space-y-3">{providers.map(provider => {
      const isRazorpay = provider.id === 'razorpay';
      const ctaAmount = isRazorpay && razorpayQuote ? money(razorpayQuote.providerAmount, 'INR') : money(payment.outstanding, payment.currency);
      return <button key={provider.id} disabled={!!busy} onClick={() => void pay(provider.id)} className="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md disabled:translate-y-0 disabled:opacity-50">
        <div className="flex items-center gap-4 p-4">
          <div className={`flex h-12 w-28 shrink-0 items-center justify-center rounded-xl px-3 ${isRazorpay ? 'bg-[#0B1F3A]' : 'bg-white ring-1 ring-slate-200'}`}><img src={PAYMENT_ASSETS[provider.id]} alt={`${provider.label} logo`} className="max-h-8 max-w-full object-contain" /></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">Pay with {provider.label}</span>{provider.testMode && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">Test</span>}</div><div className="mt-1 text-xs text-slate-500">{isRazorpay ? 'Cards, UPI, Netbanking and supported wallets' : 'PayPal account and eligible PayPal funding methods'}</div></div>
          <div className="text-right"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Continue</div><div className="mt-1 text-xs font-black text-[#000080]">{busy === provider.id ? 'Opening…' : ctaAmount}</div></div>
          {busy === provider.id ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#000080]" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />}
        </div>
      </button>;
    })}</div> : <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Online payment providers are temporarily unavailable for this payment. Please contact ProFox for assistance.</div>}
  </section>;
}

function SecurityCard() {
  return <section className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><div className="text-sm font-black text-emerald-950">Protected checkout</div><ul className="mt-2 space-y-1.5 text-xs leading-5 text-emerald-900"><li>• Provider credentials are never exposed on this page.</li><li>• Card and bank details are entered with the selected payment provider.</li><li>• ProFox marks a payment verified only after server-side provider validation.</li><li>• This page is delivered over an encrypted HTTPS connection.</li></ul></div></div></section>;
}

function SupportCard() {
  const { token = '' } = useParams<{ token: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openChat = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError('');
    try {
      const { conversationUrl } = await paymentGatewayService.openSupportChat(token);
      const target = new URL(conversationUrl, window.location.origin);
      if (!target.pathname.startsWith('/chat/')) throw new Error('Secure Sales chat link is invalid.');
      window.location.assign(`${target.pathname}${target.search}${target.hash}`);
    } catch (e: any) {
      setError(e?.message || 'Secure Sales chat could not be opened.');
      setBusy(false);
    }
  };

  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <Headphones className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-black text-slate-900">Need help before paying?</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">If the amount, milestone, currency conversion, or payment method does not look right, stop here and message the ProFox representative handling this quotation.</p>
        <button type="button" onClick={() => void openChat()} disabled={busy || !token} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-3 text-xs font-black text-white shadow-sm transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
          {busy ? 'Opening secure chat…' : 'Chat with your ProFox representative'}
        </button>
        <p className="mt-2 text-[10px] leading-4 text-slate-400">Opens your existing secure customer conversation with the Sales representative responsible for this quotation.</p>
        {error && <p className="mt-2 text-xs font-semibold leading-5 text-red-600">{error}</p>}
      </div>
    </div>
  </section>;
}

function VerifiedPayment({ payment, projectPaid, projectOutstanding }: { payment: PublicPayment; projectPaid: number; projectOutstanding: number }) {
  const charge = payment.lastGatewayCharge;
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
    <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-8 w-8" /></div>
      <h2 className="mt-5 text-2xl font-black text-slate-950">Payment received and verified</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Thank you. This milestone has been recorded against your accepted quotation. Keep the payment reference below for your records.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><Info label="Amount received" value={money(payment.amountPaid, payment.currency)} /><Info label="Payment reference" value={payment.paymentReference} /><Info label="Quotation" value={payment.quotationNumber || '—'} /><Info label="Verified at" value={dateTime(payment.verifiedAt || payment.paidAt)} /></div>
      {charge?.providerAmount && charge?.providerCurrency && <div className="mt-5 rounded-2xl bg-slate-50 p-5"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Provider charge</div><div className="mt-1 text-xl font-black text-slate-900">{money(Number(charge.providerAmount), charge.providerCurrency)}</div><div className="mt-1 text-xs text-slate-500">Processed via {charge.provider === 'razorpay' ? 'Razorpay' : charge.provider === 'paypal' ? 'PayPal' : 'payment provider'}{charge.fxRate && charge.providerCurrency !== payment.currency ? ` · FX ${Number(charge.fxRate).toFixed(4)}` : ''}{charge.fxSource ? ` · ${charge.fxSource}` : ''}</div></div>}
      {payment.quotation?.items?.length ? <div className="mt-6"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Payment linked to</div><div className="mt-3 space-y-2">{payment.quotation.items.map((item, index) => <div key={`${item.name}-${index}`} className="rounded-2xl border border-slate-200 p-4"><div className="font-black text-slate-900">{item.name}</div>{item.description && <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>}</div>)}</div></div> : null}
    </section>
    <aside className="space-y-5 lg:sticky lg:top-6"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Project payment status</div><div className="mt-4 space-y-3"><DetailRow label="Paid across milestones" value={money(projectPaid || payment.amountPaid, payment.currency)} /><DetailRow label="Remaining scheduled balance" value={money(projectOutstanding, payment.currency)} /></div>{projectOutstanding > 0 ? <p className="mt-4 rounded-2xl bg-blue-50 p-4 text-xs leading-5 text-blue-900">Future milestones remain on the accepted payment plan. They become payable according to the agreed schedule.</p> : <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-xs font-semibold leading-5 text-emerald-900">No outstanding scheduled balance remains on this quotation.</p>}</section><SecurityCard /><SupportCard /></aside>
  </div>;
}

function PaymentFooter({ payment }: { payment: PublicPayment }) {
  return <footer className="pb-8 pt-2 text-center"><div className="mx-auto flex max-w-3xl flex-col items-center gap-3"><img src={PAYMENT_ASSETS.secure} alt="Secure ProFox payment" className="h-auto w-[200px] opacity-90" /><p className="text-[11px] leading-5 text-slate-500">This payment is tied to {payment.quotationNumber ? `quotation ${payment.quotationNumber}` : 'your accepted ProFox quotation'} and its agreed payment schedule. Do not continue if the customer, amount, or milestone shown on this page is not what you expect.</p><div className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">ProFox Web Designer · Secure customer payment</div></div></footer>;
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-50 p-2.5 text-[#000080]">{icon}</div><div><h2 className="font-black text-slate-950">{title}</h2>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}</div></div>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4"><span className="text-slate-500">{label}</span><span className="max-w-[65%] text-right font-bold text-slate-900">{value}</span></div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900"><main className="p-4 sm:p-8">{children}</main></div>;
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{icon}{label}</div><div className="mt-2 text-sm font-black leading-6 text-slate-900">{value}</div></div>;
}