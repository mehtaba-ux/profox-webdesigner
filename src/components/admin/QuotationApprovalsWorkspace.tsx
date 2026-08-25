import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Clock3, ExternalLink, FileText, Loader2, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { QuotationApprovalFilter, QuotationApprovalListItem, quotationApprovalService } from '../../lib/quotationApprovalService';
import QuotationProposal from '../quotation/QuotationProposal';

const FILTERS: Array<{ key: QuotationApprovalFilter; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'changes_requested', label: 'Changes Requested' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All Authorized' }
];

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
}

function timeWaiting(value?: string | null) {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60000) return 'Just now';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function decisionLabel(value?: string | null) {
  if (value === 'changes_requested') return 'Changes Requested';
  if (value === 'rejected') return 'Rejected';
  if (value === 'approved') return 'Approved';
  return 'Pending';
}

function decisionClasses(value?: string | null) {
  if (value === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (value === 'changes_requested') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (value === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-blue-50 text-[#000080] border-blue-200';
}

export default function QuotationApprovalsWorkspace() {
  const { quotationId } = useParams<{ quotationId: string }>();
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<QuotationApprovalFilter>('pending');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState<QuotationApprovalListItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<'approve'|'request_changes'|'reject'|null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadList = async () => {
    setLoading(true); setError('');
    try {
      const access = await quotationApprovalService.canAccess();
      setAuthorized(access);
      if (!access) return;
      const page = await quotationApprovalService.list(filter, debouncedSearch, 0, 75);
      setItems(page.items); setCount(page.count);
    } catch (err: any) { setError(err?.message || 'Approval requests could not be loaded.'); }
    finally { setLoading(false); }
  };

  const loadDetail = async (id: string) => {
    setDetailLoading(true); setError('');
    try { setDetail(await quotationApprovalService.detail(id)); }
    catch (err: any) { setDetail(null); setError(err?.message || 'This approval request is unavailable or you no longer have access.'); }
    finally { setDetailLoading(false); }
  };

  useEffect(() => { void loadList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, debouncedSearch]);
  useEffect(() => { if (quotationId && authorized !== false) void loadDetail(quotationId); else setDetail(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [quotationId, authorized]);

  const pendingCount = useMemo(() => items.filter(item => item.decision === 'pending' && item.status === 'Ready for Approval').length, [items]);

  const submitDecision = async () => {
    if (!quotationId || !decision) return;
    if (decision !== 'approve' && !comment.trim()) { setError('A clear reason is required when requesting changes or rejecting a quotation.'); return; }
    setSubmitting(true); setError('');
    try {
      await quotationApprovalService.review(quotationId, decision, comment.trim());
      setDecision(null); setComment('');
      await Promise.all([loadDetail(quotationId), loadList()]);
    } catch (err: any) { setError(err?.message || 'The approval decision could not be saved.'); }
    finally { setSubmitting(false); }
  };

  if (authorized === false) return <Navigate to="/admin/workspace" replace />;

  return <div className="min-h-screen bg-[#f5f8fc] text-slate-900">
    <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-7">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Commercial Governance</div>
          <h1 className="mt-1 text-2xl font-black">Quotation Approvals</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Review only the quotation requests you are authorized to manage. Approval reasons and commercial rules remain server-authoritative.</p>
        </div>
        <div className="flex items-center gap-2"><div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-[#000080]">{pendingCount} pending in view</div><button onClick={() => void loadList()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
      </div>
    </div>

    <main className="mx-auto max-w-[1600px] p-4 sm:p-7">
      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">{FILTERS.map(tab => <button key={tab.key} onClick={() => setFilter(tab.key)} className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-[11px] font-black ${filter === tab.key ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{tab.label}</button>)}</div>
        <div className="relative w-full xl:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quotation, seller or customer" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-[#000080]/40" /></div>
      </div>

      <div className={`grid gap-5 ${quotationId ? 'xl:grid-cols-[minmax(0,0.86fr)_minmax(560px,1.14fr)]' : ''}`}>
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-black">Approval Requests</h2><p className="mt-0.5 text-[10px] text-slate-400">{count} authorized request{count === 1 ? '' : 's'}</p></div></div>
          {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div> : items.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><Check className="h-7 w-7 text-emerald-600" /><div className="mt-3 text-sm font-black">No approval requests here.</div><p className="mt-1 text-xs text-slate-500">The current authorized queue is clear.</p></div> : <div className="divide-y divide-slate-100">
            {items.map(item => <button key={item.id} onClick={() => navigate(`/admin/quotation-approvals/${item.id}`)} className={`w-full p-4 text-left transition hover:bg-blue-50/30 ${quotationId === item.id ? 'bg-blue-50/50' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#000080]"><FileText className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black">{item.quotationNumber}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${decisionClasses(item.decision)}`}>{decisionLabel(item.decision)}</span><span className="text-[9px] font-bold text-slate-400">Rev {item.revisionNumber}</span></div>
                  <div className="mt-1 truncate text-[11px] font-bold text-slate-700">{item.customerName}</div>
                  <div className="mt-1 text-[10px] text-slate-500">Seller: {item.sellerName} · {money(item.total,item.currency)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] text-slate-400"><Clock3 className="h-3 w-3" /><span>{item.status === 'Ready for Approval' ? `Waiting ${timeWaiting(item.requestedAt)}` : new Date(item.requestedAt).toLocaleDateString()}</span>{item.approvalReasons?.[0] && <><span>•</span><span className="max-w-[330px] truncate">{item.approvalReasons[0]}</span></>}</div>
                </div><ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300" />
              </div>
            </button>)}
          </div>}
        </section>

        {quotationId && <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {detailLoading ? <div className="flex min-h-[520px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div> : detail ? <>
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3"><div><button onClick={() => navigate('/admin/quotation-approvals')} className="mb-2 inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 xl:hidden"><ArrowLeft className="h-3 w-3" />Back to requests</button><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black">{detail.quotationNumber}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black">Revision {detail.revisionNumber}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${decisionClasses(detail.approvalDecision)}`}>{decisionLabel(detail.approvalDecision)}</span></div><p className="mt-1 text-[11px] text-slate-500">{detail.customerName} · Seller: {detail.seller?.name || 'Seller'}</p></div><button onClick={() => navigate(`/admin/quotations/${detail.id}`)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-600">Open Workspace<ExternalLink className="h-3 w-3" /></button></div>
              {detail.status === 'Ready for Approval' && detail.approvalDecision === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => { setDecision('approve'); setComment(''); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white">Approve</button><button onClick={() => { setDecision('request_changes'); setComment(''); }} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white">Request Changes</button><button onClick={() => { setDecision('reject'); setComment(''); }} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700">Reject</button></div>}
            </div>

            <div className="space-y-5 bg-[#f8fafc] p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
                ['Quotation Total',money(detail.total,detail.currency)],
                ['Project Timeline',detail.durationSnapshotText || 'Requires confirmation'],
                ['Requested',detail.approvalRequestedAt ? new Date(detail.approvalRequestedAt).toLocaleString() : '—'],
                ['CRM Opportunity',detail.opportunity?.name || 'Not linked']
              ].map(([label,value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-xs font-black text-slate-800">{value}</div></div>)}</div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-xs font-black text-amber-800"><AlertTriangle className="h-4 w-4" />Why approval is required</div><div className="mt-2 space-y-1">{(detail.approvalReasons || []).map((reason:string,index:number) => <p key={index} className="text-[11px] leading-5 text-amber-800">• {reason}</p>)}</div></div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-black">Commercial Scope</h3><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[10px]"><thead className="text-slate-400"><tr><th className="pb-2">Product / Service</th><th className="pb-2">Qty</th><th className="pb-2">Price</th><th className="pb-2">Discount</th><th className="pb-2">Timeline</th><th className="pb-2">Context</th></tr></thead><tbody className="divide-y divide-slate-100">{(detail.lines || []).filter((line:any) => ['product','custom'].includes(line.itemType) || line.productName).map((line:any) => <tr key={line.id}><td className="py-2.5 pr-3"><div className="font-black text-slate-700">{line.productName}</div>{line.optional && <div className="text-[9px] text-slate-400">Optional</div>}</td><td className="py-2.5 pr-3">{line.quantity}</td><td className="py-2.5 pr-3">{money(line.lineTotal,detail.currency)}</td><td className="py-2.5 pr-3">{Number(line.discountAmount || 0) > 0 ? money(line.discountAmount,detail.currency) : '—'}</td><td className="py-2.5 pr-3">{line.timelineText || '—'}</td><td className="py-2.5">{line.timelineSource === 'admin_override' ? <div><span className="font-black text-amber-700">Admin override</span>{line.catalogTimeline && <div className="mt-0.5 text-slate-400">Catalog: {line.catalogTimeline.min ?? '—'}–{line.catalogTimeline.max ?? '—'} days</div>}</div> : line.timelineSource === 'seller_estimate' ? <span className="font-bold text-slate-500">Seller estimate</span> : <span className="text-slate-400">Catalog</span>}</td></tr>)}</tbody></table></div></div>

              <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-black">Payment Plan</h3><div className="mt-3 space-y-2">{Array.isArray(detail.paymentPlan?.schedule) && detail.paymentPlan.schedule.length ? detail.paymentPlan.schedule.map((row:any,index:number) => <div key={index} className="flex items-center justify-between gap-3 text-[11px]"><span>{row.label || row.paymentType} <span className="text-slate-400">({row.percentage}%)</span></span><b>{money(Number(row.amount || 0),detail.currency)}</b></div>) : <div className="text-[11px] text-slate-400">No resolved payment schedule.</div>}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-black">Deal Context</h3><div className="mt-3 space-y-2 text-[11px]"><div><span className="text-slate-400">Company:</span> <b>{detail.opportunity?.companyName || detail.customerName}</b></div><div><span className="text-slate-400">Contact:</span> <b>{detail.opportunity?.contactName || detail.contactName || '—'}</b></div><div><span className="text-slate-400">Pipeline:</span> <b>{detail.opportunity?.stage || '—'}</b></div><div><span className="text-slate-400">Seller:</span> <b>{detail.seller?.name || '—'}</b></div></div></div></div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-black">Professional Quotation Preview</h3><p className="mt-0.5 text-[10px] text-slate-400">Same customer-facing proposal used by the existing quotation flow.</p></div></div><div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50"><QuotationProposal presentation={detail.proposal} /></div></div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-black">Approval & Quotation History</h3>{detail.approvalDecisionNote && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px]"><b>Latest decision:</b> {decisionLabel(detail.approvalDecision)}{detail.approvalDecidedByName ? ` by ${detail.approvalDecidedByName}` : ''}<div className="mt-1 text-slate-500">{detail.approvalDecisionNote}</div></div>}<div className="mt-3 space-y-2">{(detail.history || []).length ? detail.history.map((event:any) => <div key={event.id} className="border-l-2 border-slate-200 pl-3"><div className="text-[11px] font-black">{event.title}</div><div className="mt-0.5 text-[10px] text-slate-500">{event.actorName} · {new Date(event.occurredAt).toLocaleString()}</div>{event.description && <div className="mt-1 text-[10px] leading-4 text-slate-500">{event.description}</div>}</div>) : <div className="text-[11px] text-slate-400">No related audit events are available yet.</div>}</div></div>
            </div>
          </> : <div className="flex min-h-[520px] items-center justify-center p-8 text-center text-xs text-slate-500">Select an authorized approval request.</div>}
        </section>}
      </div>
    </main>

    {decision && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-black">{decision === 'approve' ? 'Approve Quotation' : decision === 'request_changes' ? 'Request Changes' : 'Reject Quotation'}</h2><p className="mt-1 text-xs leading-5 text-slate-500">This decision is saved through the protected quotation approval workflow and added to the audit history.</p></div><button onClick={() => setDecision(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><label className="mt-5 block"><span className="mb-1.5 block text-xs font-black">{decision === 'approve' ? 'Approval note (optional)' : 'Reason (required)'}</span><textarea autoFocus rows={4} value={comment} onChange={e => setComment(e.target.value)} placeholder={decision === 'approve' ? 'Optional management note' : 'Explain clearly what the seller needs to change.'} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#000080]/40" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setDecision(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600">Cancel</button><button disabled={submitting || (decision !== 'approve' && !comment.trim())} onClick={() => void submitDecision()} className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-black text-white disabled:opacity-40 ${decision === 'approve' ? 'bg-emerald-600' : decision === 'request_changes' ? 'bg-amber-500' : 'bg-red-600'}`}>{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{decision === 'approve' ? 'Confirm Approval' : decision === 'request_changes' ? 'Send Change Request' : 'Confirm Rejection'}</button></div></div></div>}
  </div>;
}
