import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Copy, CreditCard, ExternalLink, Loader2, Search, Send, Settings, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Payment, PaymentStatus, PAYMENT_STATUSES } from '../../types';
import { salesService } from '../../lib/salesService';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { crmService } from '../../lib/crmService';
import type { SaleActivationState } from '../../lib/saleActivationTypes';

interface PaymentsManagerProps { initialMetadata?: { quotationId?: string } }

function money(value: number, currency = 'USD') { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0)); } catch { return `${currency} ${Number(value || 0).toFixed(2)}`; } }

export default function PaymentsManager({ initialMetadata }: PaymentsManagerProps) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeStatusTab, setActiveStatusTab] = useState<PaymentStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activationByOpportunity, setActivationByOpportunity] = useState<Map<string, SaleActivationState>>(new Map());

  const fetchPayments = async () => {
    setLoading(true); setError('');
    try {
      const [paymentResult, activation] = await Promise.all([
        salesService.getPayments(),
        crmService.getSaleActivationQueue(),
      ]);
      if (paymentResult.error) throw paymentResult.error;
      setPayments(paymentResult.data || []);
      setActivationByOpportunity(new Map(activation.map(item => [item.opportunityId, item])));
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetchPayments(); }, [initialMetadata?.quotationId]);

  const sendPayment = async (payment: Payment) => {
    setBusy(payment.id); setError(''); setMessage('');
    const { data, error: sendError } = await supabase.rpc('send_generated_payment_request', { p_payment_id: payment.id });
    if (sendError) setError(sendError.message || 'Payment request could not be sent.');
    else { setMessage(`${data?.paymentReference || payment.paymentReference} is ready for the client at the generated secure payment link.`); await fetchPayments(); }
    setBusy('');
  };

  const verifyOffline = async (payment: Payment) => {
    if (!isAdmin) return;
    const amount = window.prompt('Confirm amount received outside the online gateway:', String(payment.amountDue - payment.amountPaid));
    if (amount === null) return;
    const received = Number(amount);
    if (!Number.isFinite(received) || received <= 0) { setError('Enter a valid received amount greater than zero.'); return; }
    const notes = window.prompt('Verification note / evidence reference (recommended):', '') || '';
    setBusy(`verify-${payment.id}`); setError(''); setMessage('');
    const { error: verifyError } = await salesService.verifyPayment(payment.id, user!.id, notes, received);
    if (verifyError) setError(verifyError.message || 'Payment verification failed.');
    else { setMessage(`${payment.paymentReference} verification completed through the protected Admin workflow.`); await fetchPayments(); }
    setBusy('');
  };

  const filteredPayments = useMemo(() => payments.filter(p => {
    const quoteMatch = !initialMetadata?.quotationId || p.quotationId === initialMetadata.quotationId;
    const statusMatch = activeStatusTab === 'All' || p.status === activeStatusTab;
    const q = searchQuery.trim().toLowerCase();
    const searchMatch = !q || p.customerName.toLowerCase().includes(q) || p.paymentReference.toLowerCase().includes(q) || (p.milestoneLabel || '').toLowerCase().includes(q);
    return quoteMatch && statusMatch && searchMatch;
  }), [payments, initialMetadata?.quotationId, activeStatusTab, searchQuery]);

  const stats = useMemo(() => ({
    open: payments.filter(p => !['Verified', 'Cancelled', 'Failed', 'Refunded'].includes(p.status)).length,
    verified: payments.filter(p => p.status === 'Verified').length,
    waiting: payments.filter(p => ['Sent', 'Pending', 'Partially Paid', 'Verification Pending'].includes(p.status)).length,
    draft: payments.filter(p => ['Draft', 'Ready'].includes(p.status)).length,
  }), [payments]);

  const statusClass = (status: PaymentStatus) => status === 'Verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'Failed' || status === 'Cancelled' ? 'border-red-200 bg-red-50 text-red-700' : status === 'Sent' || status === 'Pending' ? 'border-blue-200 bg-blue-50 text-blue-700' : status === 'Verification Pending' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-slate-50 text-slate-600';

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><h1 className="text-2xl font-bold text-slate-900">Payments & Transactions</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Payment milestones are generated automatically from accepted quotation snapshots. Sellers do not choose a second package, percentage or payment amount here.</p></div>{isAdmin && <button onClick={() => navigate('/admin/payment-gateway-settings')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-[#000080] shadow-sm"><Settings className="h-4 w-4" />Gateway Setup</button>}</div>
    {initialMetadata?.quotationId && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-semibold text-blue-800">Showing the automatically generated payment plan for the selected accepted quotation.</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}{message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={<Clock className="h-5 w-5" />} label="Open milestones" value={stats.open} /><Stat icon={<Send className="h-5 w-5" />} label="Awaiting client" value={stats.waiting} /><Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Verified" value={stats.verified} /><Stat icon={<ShieldCheck className="h-5 w-5" />} label="Locked future" value={stats.draft} /></div>

    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div className="flex gap-1 overflow-x-auto pb-1">{['All', ...PAYMENT_STATUSES].map(status => <button key={status} onClick={() => setActiveStatusTab(status as any)} className={`whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold ${activeStatusTab === status ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{status}</button>)}</div><div className="relative min-w-[240px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search payment…" className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none focus:border-[#000080]" /></div></div>

    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div> : filteredPayments.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-20 text-center"><CreditCard className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-4 text-lg font-bold">No payments found</h3><p className="mt-1 text-sm text-slate-500">Accepted quotation milestones will appear here automatically.</p></div> : <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[1050px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">Reference</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Milestone</th><th className="px-5 py-4">Amount</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Due</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredPayments.map(payment => <tr key={payment.id} className="hover:bg-slate-50/60"><td className="px-5 py-4"><div className="text-sm font-black text-[#000080]">{payment.paymentReference}</div><div className="text-[10px] font-bold uppercase text-slate-400">#{payment.milestoneNumber || '—'}</div></td><td className="px-5 py-4"><div className="text-sm font-bold">{payment.customerName}</div><div className="text-[10px] text-slate-500">{payment.customerEmail}</div></td><td className="px-5 py-4"><div className="text-xs font-bold text-slate-700">{payment.milestoneLabel || payment.paymentType}</div><div className="mt-1 text-[10px] text-slate-400">{payment.paymentProvider ? `Last provider: ${payment.paymentProvider}` : 'Provider chosen by client at checkout'}</div></td><td className="px-5 py-4"><div className="text-sm font-black">{money(payment.amountDue, payment.currency)}</div>{payment.amountPaid > 0 && <div className="text-[10px] font-bold text-emerald-600">Received {money(payment.amountPaid, payment.currency)}</div>}</td><td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(payment.status)}`}>{payment.status}</span>{payment.opportunityId && activationByOpportunity.get(payment.opportunityId) && <div className={`mt-2 text-[9px] font-black ${activationByOpportunity.get(payment.opportunityId)?.payment?.overdue ? 'text-red-700' : 'text-slate-500'}`}>{activationByOpportunity.get(payment.opportunityId)?.payment?.overdue ? 'OVERDUE · ' : ''}{activationByOpportunity.get(payment.opportunityId)?.operationalLabel.replaceAll('_',' ')}</div>}</td><td className="px-5 py-4 text-xs font-semibold text-slate-600">{payment.dueDate ? format(new Date(`${payment.dueDate}T00:00:00`), 'MMM d, yyyy') : 'Stage-gated'}</td><td className="px-5 py-4"><div className="flex justify-end gap-2">{['Draft', 'Ready'].includes(payment.status) && <button disabled={!!busy} onClick={() => void sendPayment(payment)} title="Send generated milestone" className="rounded-xl bg-blue-50 p-2 text-[#000080] disabled:opacity-40">{busy === payment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>}{payment.paymentLink && <><button onClick={() => void navigator.clipboard?.writeText(payment.paymentLink!)} title="Copy secure payment link" className="rounded-xl bg-slate-100 p-2 text-slate-600"><Copy className="h-4 w-4" /></button><a href={payment.paymentLink} target="_blank" rel="noreferrer" title="Open client checkout" className="rounded-xl bg-slate-100 p-2 text-slate-600"><ExternalLink className="h-4 w-4" /></a></>}{isAdmin && !['Verified', 'Cancelled', 'Failed', 'Refunded'].includes(payment.status) && <button aria-label="Admin verify payment through protected workflow" disabled={!!busy} onClick={() => void verifyOffline(payment)} title="Admin verify offline receipt" className="rounded-xl bg-emerald-50 p-2 text-emerald-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{busy === `verify-${payment.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}</button>}</div></td></tr>)}</tbody></table></div>}
  </div>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-[#000080]">{icon}<span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span></div><div className="mt-3 text-2xl font-black">{value}</div></div>; }
