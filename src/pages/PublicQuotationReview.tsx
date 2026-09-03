import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Loader2,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Printer,
  ShieldCheck,
  UserRound,
  X,
  XCircle
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import QuotationProposal from '../components/quotation/QuotationProposal';
import QuotationConversation from '../components/quotation/QuotationConversation';
import { publicQuotationDecisionService } from '../lib/publicQuotationDecisionService';

type PaymentCta = {
  paymentId?: string;
  paymentReference?: string;
  paymentUrl?: string;
  paymentType?: string;
  milestoneLabel?: string;
  amountDue?: number;
  currency?: string;
  status?: string;
  dueDate?: string;
};

type LegalMetadata = {
  termsUrl?: string;
  termsVersion?: string;
  paymentPolicyUrl?: string;
  paymentPolicyVersion?: string;
  consentText?: string;
};

function money(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

const fieldClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-[#000080]/5';

export default function PublicQuotationReview() {
  const { token = '' } = useParams<{ token: string }>();
  const [presentation, setPresentation] = useState<any>(null);
  const [payment, setPayment] = useState<PaymentCta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [changeOpen, setChangeOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const legal: LegalMetadata = useMemo(() => presentation?.legal || {}, [presentation]);
  const termsUrl = legal.termsUrl || 'https://www.profoxwebdesigner.com/terms-and-conditions';
  const paymentPolicyUrl = legal.paymentPolicyUrl || 'https://www.profoxwebdesigner.com/payment-policy';

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const opened = await publicQuotationDecisionService.open(token);
        if (opened.error) throw opened.error;
        const quote = opened.data;
        setPresentation(quote);
        setCustomerName(String(quote?.contactName || quote?.customerName || ''));
        setCustomerEmail(String(quote?.email || ''));

        if (quote?.status === 'Accepted') {
          const acceptedPayment = await publicQuotationDecisionService.getAcceptedPayment(token);
          if (acceptedPayment.error) throw acceptedPayment.error;
          if (acceptedPayment.data?.payment) setPayment(acceptedPayment.data.payment as PaymentCta);
        }
      } catch (err: any) {
        setError(err?.message || 'This quotation could not be opened.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const validateIdentity = () => {
    if (customerName.trim().length < 2) {
      setError('Please enter your full name before submitting your decision.');
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(customerEmail.trim())) {
      setError('Please enter a valid email address before submitting your decision.');
      return false;
    }
    return true;
  };

  const acceptQuotation = async () => {
    if (!presentation || !validateIdentity()) return;
    if (!consent) {
      setError('Please confirm the Terms & Conditions and Payment Policy before accepting.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await publicQuotationDecisionService.respond({
        token,
        response: 'accept',
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        consent: true
      });
      if (result.error) throw result.error;
      setPresentation((current: any) => ({ ...current, status: 'Accepted', acceptedAt: result.data?.acceptedAt || new Date().toISOString() }));
      if (result.data?.payment) setPayment(result.data.payment as PaymentCta);
      setMessage('Quotation accepted. Your consent and the policy versions presented to you have been securely recorded.');
    } catch (err: any) {
      setError(err?.message || 'Your acceptance could not be recorded.');
    } finally {
      setSaving(false);
    }
  };

  const rejectQuotation = async () => {
    if (!presentation || !validateIdentity()) return;
    if (rejectReason.trim().length < 3) {
      setError('Please tell us why you are declining this quotation.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await publicQuotationDecisionService.respond({
        token,
        response: 'reject',
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        note: rejectReason.trim(),
        consent: false
      });
      if (result.error) throw result.error;
      setPresentation((current: any) => ({ ...current, status: 'Rejected', rejectedAt: result.data?.rejectedAt || new Date().toISOString() }));
      setRejectOpen(false);
      setMessage('Your decision and feedback have been recorded. Thank you for reviewing the quotation.');
    } catch (err: any) {
      setError(err?.message || 'Your response could not be recorded.');
    } finally {
      setSaving(false);
    }
  };

  const requestChange = async () => {
    if (!changeNote.trim()) {
      setError('Please describe your question or requested change.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await publicQuotationDecisionService.respond({
        token,
        response: 'request_changes',
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        note: changeNote.trim()
      });
      if (result.error) throw result.error;
      setPresentation((current: any) => ({ ...current, changeRequestedAt: result.data?.changeRequestedAt || new Date().toISOString() }));
      setMessage(result.data?.message || 'Your question or requested change has been sent to ProFox.');
      setChangeOpen(false);
      setChangeNote('');
      window.dispatchEvent(new Event('profox:quotation-conversation-refresh'));
      window.setTimeout(() => document.getElementById('conversation')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err: any) {
      setError(err?.message || 'Your request could not be sent.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#000080]"/><p className="mt-3 text-sm font-semibold text-slate-500">Opening your secure quotation…</p></div></div>;
  }

  if (error && !presentation) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><XCircle className="mx-auto h-10 w-10 text-red-600"/><h1 className="mt-4 text-xl font-black">Quotation unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">{error}</p></div></div>;
  }

  const actionable = presentation?.status === 'Sent' && !presentation?.isSuperseded;

  const actions = actionable ? <div className="space-y-6">
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        <span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#000080]"/>Your full name</span>
        <input value={customerName} onChange={e => setCustomerName(e.target.value)} autoComplete="name" maxLength={120} className={fieldClass} placeholder="Full name"/>
      </label>
      <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        <span className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#000080]"/>Email address</span>
        <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} autoComplete="email" maxLength={254} className={fieldClass} placeholder="you@company.com"/>
      </label>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]"/>
        <div>
          <h3 className="text-sm font-black text-slate-900">Review the commercial terms before accepting</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">Your approved quotation defines the project-specific scope, price and payment schedule. The policies below explain the general ProFox terms that apply alongside it.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={termsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#000080]/15 bg-[#000080]/5 px-3 py-2 text-xs font-extrabold text-[#000080]">Terms & Conditions <ExternalLink className="h-3.5 w-3.5"/></a>
            <a href={paymentPolicyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#000080]/15 bg-[#000080]/5 px-3 py-2 text-xs font-extrabold text-[#000080]">Payment Policy <ExternalLink className="h-3.5 w-3.5"/></a>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">Terms version: {legal.termsVersion || '2026-08-07'} · Payment Policy version: {legal.paymentPolicyVersion || '2026-09-03'}</p>
        </div>
      </div>
    </div>

    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-[#000080]/15 bg-[#000080]/[0.03] p-4 transition hover:border-[#000080]/30">
      <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[#000080]"/>
      <span className="text-sm leading-6 text-slate-700">{legal.consentText || 'I have reviewed this quotation and agree to the ProFox Terms & Conditions and Payment Policy. I understand that accepting the quotation does not itself authorize a charge; any payment is authorized separately through the approved payment method or payment provider.'}</span>
    </label>

    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
      <span className="font-black">Important:</span> accepting this quotation confirms the commercial agreement only. It does not debit your card or bank account. Any payment is separately authorized through the secure payment flow.
    </div>

    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button onClick={() => void acceptQuotation()} disabled={saving || !consent || customerName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(customerEmail.trim())} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}Accept Quotation</button>
      <button onClick={() => setChangeOpen(true)} disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#000080]/20 bg-white px-5 py-3 text-sm font-black text-[#000080]"><MessageSquareText className="h-4 w-4"/>Ask a Question / Request Change</button>
      <button onClick={() => setRejectOpen(true)} disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700"><XCircle className="h-4 w-4"/>Decline Quotation</button>
    </div>
  </div> : <div className="space-y-3 text-sm text-slate-700">
    <p>This quotation is currently <strong>{presentation?.status}</strong>.</p>
    <p className="text-xs leading-5 text-slate-500">{presentation?.isSuperseded ? 'A newer revision is available. Please use the latest ProFox proposal.' : 'Your quotation and conversation history remain available for your records.'}</p>
  </div>;

  return <div className="min-h-screen bg-slate-100 px-3 py-5 sm:px-6 sm:py-8">
    <div className="no-print mx-auto mb-4 max-w-[1040px]">
      <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#000080]/5 text-[#000080]"><LockKeyhole className="h-4 w-4"/></div><div><p className="text-xs font-black text-slate-900">Secure ProFox quotation review</p><p className="text-[11px] text-slate-500">Your decision is recorded against this quotation revision.</p></div></div>
        <button onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"><Printer className="h-4 w-4"/>Print / Save PDF</button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}
    </div>

    {presentation && <QuotationProposal presentation={presentation} actions={<>
      {presentation.status === 'Accepted' && <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"/><div><p className="text-xs font-black uppercase tracking-wider text-emerald-800">Quotation accepted</p><p className="mt-1 text-sm leading-6 text-emerald-950">Acceptance is separate from payment authorization. Use the secure payment action below only when you are ready to authorize the applicable milestone.</p></div></div>
        {payment?.paymentUrl && <div className="mt-4 flex flex-col gap-4 rounded-xl border border-emerald-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">{payment.milestoneLabel || payment.paymentType || 'Approved payment milestone'}</p><p className="mt-1 text-sm text-slate-600">{money(Number(payment.amountDue || 0), payment.currency || presentation.currency)}{payment.paymentReference ? ` · ${payment.paymentReference}` : ''}</p></div><a href={payment.paymentUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white"><CreditCard className="h-4 w-4"/>Continue to Secure Payment</a></div>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold"><a href={termsUrl} target="_blank" rel="noreferrer" className="text-[#000080]">Terms & Conditions</a><a href={paymentPolicyUrl} target="_blank" rel="noreferrer" className="text-[#000080]">Payment Policy</a></div>
      </div>}
      {actions}
      <QuotationConversation token={token}/>
    </>}/>} 

    {changeOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="change-title" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="change-title" className="text-lg font-black">Ask a Question / Request a Change</h2><p className="mt-1 text-xs leading-5 text-slate-500">Tell your ProFox representative what should be clarified or changed. This message does not alter the quotation automatically.</p></div><button aria-label="Close" onClick={() => setChangeOpen(false)}><X className="h-5 w-5"/></button></div><textarea autoFocus maxLength={2000} rows={6} value={changeNote} onChange={e => setChangeNote(e.target.value)} placeholder="Describe your question or requested change…" className="mt-5 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-[#000080]"/><div className="mt-4 flex justify-end gap-2"><button onClick={() => setChangeOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancel</button><button onClick={() => void requestChange()} disabled={saving || !changeNote.trim()} className="rounded-xl bg-[#000080] px-5 py-2 text-sm font-black text-white disabled:opacity-40">{saving ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/> : null}Send to ProFox</button></div></div></div>}

    {rejectOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="reject-title" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="reject-title" className="text-lg font-black">Decline this quotation</h2><p className="mt-1 text-xs leading-5 text-slate-500">Please tell us what led to your decision. This helps ProFox close the quotation correctly and understand whether a revised proposal may be useful.</p></div><button aria-label="Close" onClick={() => setRejectOpen(false)}><X className="h-5 w-5"/></button></div><textarea autoFocus maxLength={2000} rows={5} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for declining…" className="mt-5 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-[#000080]"/><div className="mt-4 flex justify-end gap-2"><button onClick={() => setRejectOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancel</button><button onClick={() => void rejectQuotation()} disabled={saving || rejectReason.trim().length < 3} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-black text-white disabled:opacity-40">{saving ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/> : null}Confirm Decline</button></div></div></div>}
  </div>;
}
