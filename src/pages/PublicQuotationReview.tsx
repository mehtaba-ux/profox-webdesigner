import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, MessageSquareText, Printer, ShieldCheck, X, XCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import QuotationProposal from '../components/quotation/QuotationProposal';
import QuotationConversation from '../components/quotation/QuotationConversation';
import { quotationCpqService } from '../lib/quotationCpqService';

type PaymentCta = { paymentId?:string; paymentReference?:string; paymentUrl?:string; paymentType?:string; milestoneLabel?:string; amountDue?:number; currency?:string; status?:string; dueDate?:string };

function money(value:number,currency='USD') { try { return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(value||0)); } catch { return `${currency} ${Number(value||0).toFixed(2)}`; } }

export default function PublicQuotationReview() {
  const { token='' } = useParams<{token:string}>();
  const [presentation,setPresentation] = useState<any>(null);
  const [payment,setPayment] = useState<PaymentCta|null>(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [note,setNote] = useState('');
  const [changeOpen,setChangeOpen] = useState(false);

  useEffect(() => { void (async () => {
    setLoading(true); setError('');
    try {
      const opened = await quotationCpqService.openPublic(token);
      if (opened.error) throw opened.error;
      const quote = opened.data;
      setPresentation(quote);
      if (quote?.status === 'Accepted') {
        const accepted = await quotationCpqService.respondPublic(token,'accept');
        if (accepted.error) throw accepted.error;
        if (accepted.data?.payment) setPayment(accepted.data.payment as PaymentCta);
      }
    } catch (err:any) { setError(err?.message || 'This quotation could not be opened.'); }
    finally { setLoading(false); }
  })(); }, [token]);

  const respond = async (response:'accept'|'reject'|'request_changes') => {
    if (!presentation) return;
    if (response === 'reject' && !window.confirm('Decline this quotation?')) return;
    if (response === 'request_changes' && !note.trim()) { setError('Please describe your question or requested change.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await quotationCpqService.respondPublic(token,response,note.trim());
      if (result.error) throw result.error;
      if (response === 'accept') {
        setPresentation((current:any)=>({...current,status:'Accepted',acceptedAt:result.data?.acceptedAt||current.acceptedAt}));
        if (result.data?.payment) setPayment(result.data.payment as PaymentCta);
        setMessage('Thank you. Your proposal is accepted and the approved first payment milestone is ready.');
      } else if (response === 'reject') {
        setPresentation((current:any)=>({...current,status:'Rejected',rejectedAt:result.data?.rejectedAt||new Date().toISOString()}));
        setMessage('Your response has been recorded. Thank you for reviewing the proposal.');
      } else {
        setPresentation((current:any)=>({...current,changeRequestedAt:result.data?.changeRequestedAt||new Date().toISOString()}));
        setMessage(result.data?.message || 'Your question or requested change has been sent to your ProFox conversation.');
        setChangeOpen(false); setNote('');
        window.dispatchEvent(new Event('profox:quotation-conversation-refresh'));
        window.setTimeout(() => document.getElementById('conversation')?.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
      }
    } catch (err:any) { setError(err?.message || 'Your response could not be recorded.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;
  if (error && !presentation) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><XCircle className="mx-auto h-10 w-10 text-red-600"/><h1 className="mt-4 text-xl font-black">Quotation unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">{error}</p></div></div>;

  const actions = presentation?.status === 'Sent' && !presentation?.isSuperseded ? <div>
    <p className="text-sm leading-6 text-slate-600">Review the scope, investment, estimated timeline, payment milestones, responsibilities and terms above. You can accept, ask a question/request a change, or decline.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button onClick={()=>void respond('accept')} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}Accept Quotation</button>
      <button onClick={()=>setChangeOpen(true)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-[#000080]/20 bg-white px-5 py-3 text-xs font-black text-[#000080]"><MessageSquareText className="h-4 w-4"/>Request Change / Ask Question</button>
      <button onClick={()=>void respond('reject')} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black text-slate-700 disabled:opacity-50"><XCircle className="h-4 w-4"/>Decline</button>
    </div>
  </div> : <div className="text-sm font-semibold text-slate-700">This quotation is currently <strong>{presentation?.status}</strong>. {presentation?.isSuperseded ? 'A newer revision is available; please use the latest ProFox proposal.' : 'Your conversation history remains available below.'}</div>;

  return <div className="min-h-screen bg-slate-100 px-3 py-5 sm:px-6 sm:py-8">
    <div className="no-print mx-auto mb-4 flex max-w-[1040px] flex-wrap items-center justify-between gap-3">
      <div>{error&&<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</div>}{message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">{message}</div>}</div>
      <button onClick={()=>window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm"><Printer className="h-4 w-4"/>Print / Save PDF</button>
    </div>
    {presentation&&<QuotationProposal presentation={presentation} actions={<>
      {presentation.status==='Accepted'&&payment?.paymentUrl&&<div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-emerald-800"><ShieldCheck className="h-5 w-5"/><span className="text-xs font-black uppercase tracking-wider">Approved payment milestone</span></div><p className="mt-2 text-lg font-black text-emerald-950">{payment.milestoneLabel||payment.paymentType||'First payment'}</p><p className="mt-1 text-sm text-emerald-800">{money(Number(payment.amountDue||0),payment.currency||presentation.currency)} · {payment.paymentReference}</p></div><a href={payment.paymentUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white"><CreditCard className="h-4 w-4"/>Pay Now</a></div><p className="mt-3 text-xs leading-5 text-emerald-800">This amount comes from the accepted quotation's server-side payment schedule snapshot and is verified again in the secure checkout flow.</p></div>}
      {actions}
      <QuotationConversation token={token}/>
    </>}/>} 

    {changeOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-black">Request a Change / Ask a Question</h2><p className="mt-1 text-xs leading-5 text-slate-500">Tell your ProFox representative what you would like clarified or changed. Your message is saved in the same ongoing quotation conversation and does not alter the quotation automatically.</p></div><button onClick={()=>setChangeOpen(false)}><X className="h-5 w-5"/></button></div><textarea autoFocus maxLength={2000} rows={6} value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe your question or requested change…" className="mt-5 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-[#000080]"/><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setChangeOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancel</button><button onClick={()=>void respond('request_changes')} disabled={saving||!note.trim()} className="rounded-xl bg-[#000080] px-5 py-2 text-sm font-black text-white disabled:opacity-40">{saving?<Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>:null}Send to ProFox</button></div></div></div>}
  </div>;
}
