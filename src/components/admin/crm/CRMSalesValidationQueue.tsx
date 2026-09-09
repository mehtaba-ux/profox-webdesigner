import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CircleAlert, CircleHelp, Clock, Loader2, RefreshCw, ShieldCheck, UserCheck, X, XCircle } from 'lucide-react';
import {
  CRMSalesValidationDetail,
  CRMSalesValidationQueueItem,
  CRMSalesValidationSeverity,
  CRMSalesValidationStatus,
  crmSalesValidationService,
} from '../../../lib/crmSalesValidationService';
import { getSalesValidationGuidance } from '../../../lib/crmSalesValidationGuidance';
import SellerGuidanceHelp from './SellerGuidanceHelp';

const severityTone: Record<CRMSalesValidationSeverity, string> = {
  RED: 'border-rose-200 bg-rose-50 text-rose-700',
  AMBER: 'border-amber-200 bg-amber-50 text-amber-800',
  GREEN: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};
const statusTone: Record<CRMSalesValidationStatus, string> = {
  PENDING: 'border-slate-200 bg-slate-50 text-slate-700',
  IN_REVIEW: 'border-blue-200 bg-blue-50 text-[#000080]',
  NEEDS_INFORMATION: 'border-amber-200 bg-amber-50 text-amber-800',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-700',
  CANCELLED: 'border-slate-200 bg-slate-100 text-slate-500',
  STALE: 'border-orange-200 bg-orange-50 text-orange-800',
};
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
const age = (value: string) => {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};

type DecisionMode = 'NEEDS_INFORMATION' | 'APPROVE' | 'REJECT' | null;

export default function CRMSalesValidationQueue() {
  const [items, setItems] = useState<CRMSalesValidationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CRMSalesValidationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<DecisionMode>(null);
  const [informationRequest, setInformationRequest] = useState('');
  const [decisionSummary, setDecisionSummary] = useState('');
  const [constraints, setConstraints] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await crmSalesValidationService.getQueue()); }
    catch { setItems([]); setError('Sales Validation queue could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = async (id: string) => {
    setSelectedId(id); setDetail(null); setDetailLoading(true); setError(''); setMode(null);
    try { setDetail(await crmSalesValidationService.getDetail(id)); }
    catch { setError('This Sales validation could not be opened.'); setSelectedId(null); }
    finally { setDetailLoading(false); }
  };

  const refreshDetail = async () => {
    if (!selectedId) return;
    setDetailLoading(true);
    try { setDetail(await crmSalesValidationService.getDetail(selectedId)); await load(); }
    catch { setError('The review could not be refreshed.'); }
    finally { setDetailLoading(false); }
  };

  const start = async () => {
    if (!detail) return;
    setBusy(true); setError('');
    try { await crmSalesValidationService.transition({ validationId: detail.validation.id, action: 'START' }); await refreshDetail(); }
    catch (err: any) { setError(err?.message || 'The review could not be started.'); }
    finally { setBusy(false); }
  };

  const validateDecision = () => {
    if (mode === 'NEEDS_INFORMATION' && informationRequest.trim().length < 10) return 'Ask a precise question explaining exactly what information is needed.';
    if (mode === 'APPROVE' && decisionSummary.trim().length < 10) return 'Add a meaningful specialist decision summary before approval.';
    if (mode === 'REJECT' && rejectionReason.trim().length < 10) return 'Add a meaningful rejection or rework reason.';
    return '';
  };

  const prepareDecision = (next: Exclude<DecisionMode, null>) => {
    setMode(next); setError(''); setConfirmOpen(false);
  };

  const requestConfirmation = () => {
    const validationError = validateDecision();
    if (validationError) { setError(validationError); return; }
    setConfirmOpen(true);
  };

  const submitDecision = async () => {
    if (!detail || !mode) return;
    setBusy(true); setError('');
    try {
      await crmSalesValidationService.transition({
        validationId: detail.validation.id,
        action: mode,
        informationRequest: mode === 'NEEDS_INFORMATION' ? informationRequest.trim() : null,
        decisionSummary: mode === 'APPROVE' ? decisionSummary.trim() : null,
        approvedConstraints: mode === 'APPROVE' ? constraints.trim() : null,
        rejectionReason: mode === 'REJECT' ? rejectionReason.trim() : null,
      });
      setConfirmOpen(false); setMode(null); setInformationRequest(''); setDecisionSummary(''); setConstraints(''); setRejectionReason('');
      await refreshDetail();
    } catch (err: any) {
      setError(err?.message || 'The review decision could not be completed. Your text has been preserved.');
      setConfirmOpen(false);
    } finally { setBusy(false); }
  };

  const openItems = useMemo(() => items.filter(item => ['PENDING','IN_REVIEW','NEEDS_INFORMATION'].includes(item.status)), [items]);
  if (!loading && !error && items.length === 0) return null;

  return <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm" aria-label="Sales Validation Queue">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Sales Validation Queue<SellerGuidanceHelp guidance={getSalesValidationGuidance('section.sales_validation')} /></div><h2 className="mt-1 text-base font-black text-slate-950">Specialist reviews assigned to you or your eligible team</h2><p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">RED first, then AMBER, then GREEN. Queue access is server-filtered by active role, department, team policy and assignment.</p></div><button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
    {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{error}</div>}
    {loading ? <div className="flex min-h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /></div> : <div className="mt-4 space-y-2">{openItems.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">No open Sales validations are waiting for your review.</div> : openItems.map(item => <button key={item.id} type="button" onClick={() => void open(item.id)} className="flex w-full flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080] sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[8px] font-black ${severityTone[item.severity]}`}>{item.severity}</span><span className={`rounded-full border px-2 py-1 text-[8px] font-black ${statusTone[item.status]}`}>{item.status.replaceAll('_',' ')}</span><span className="text-[9px] font-black uppercase tracking-wide text-[#000080]">{item.validationType.replaceAll('_',' ')}</span></div><div className="mt-2 break-words text-xs font-black text-slate-900">{item.subject}</div><div className="mt-1 text-[10px] text-slate-500">{item.companyName || item.leadTitle} · {item.requirementTitle || item.sourceType.replaceAll('_',' ')} · Requested by {item.requestedByName}</div></div><div className="flex shrink-0 items-center gap-3 text-[9px] font-black text-slate-400"><Clock className="h-3.5 w-3.5" />{age(item.requestedAt)}<span>{item.assignedReviewerName || item.reviewerTeam.replaceAll('_',' ')}</span></div></button>)}</div>}

    {selectedId && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="sales-validation-detail-title" className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white shadow-2xl"><div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur"><div><div className="text-[9px] font-black uppercase tracking-[.16em] text-[#000080]">Sales Validation</div><h3 id="sales-validation-detail-title" className="mt-1 text-lg font-black text-slate-950">{detail?.validation.subject || 'Loading review…'}</h3></div><button type="button" onClick={() => { setSelectedId(null); setDetail(null); setMode(null); }} aria-label="Close Sales validation detail" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>{detailLoading || !detail ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div> : <ReviewDetail detail={detail} busy={busy} mode={mode} informationRequest={informationRequest} setInformationRequest={setInformationRequest} decisionSummary={decisionSummary} setDecisionSummary={setDecisionSummary} constraints={constraints} setConstraints={setConstraints} rejectionReason={rejectionReason} setRejectionReason={setRejectionReason} onStart={() => void start()} onMode={prepareDecision} onConfirm={requestConfirmation} onRefresh={() => void refreshDetail()} />}</div></div>}

    {confirmOpen && detail && mode && <DecisionConfirmation detail={detail} mode={mode} informationRequest={informationRequest} decisionSummary={decisionSummary} constraints={constraints} rejectionReason={rejectionReason} busy={busy} onCancel={() => setConfirmOpen(false)} onConfirm={() => void submitDecision()} />}
  </section>;
}

function ReviewDetail(props: { detail: CRMSalesValidationDetail; busy: boolean; mode: DecisionMode; informationRequest: string; setInformationRequest: (v:string)=>void; decisionSummary:string; setDecisionSummary:(v:string)=>void; constraints:string; setConstraints:(v:string)=>void; rejectionReason:string; setRejectionReason:(v:string)=>void; onStart:()=>void; onMode:(m:Exclude<DecisionMode,null>)=>void; onConfirm:()=>void; onRefresh:()=>void }) {
  const v = props.detail.validation;
  const sourceChanged = Boolean(v.sourceChangedAt && (!v.sourceAcknowledgedAt || v.sourceAcknowledgedAt < v.sourceChangedAt));
  const canReview = v.status === 'IN_REVIEW';
  return <div className="space-y-5 p-5"><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${severityTone[v.severity]}`}>{v.severity}</span><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${statusTone[v.status]}`}>{v.status.replaceAll('_',' ')}</span><span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[9px] font-black text-[#000080]">{v.validationType.replaceAll('_',' ')}</span><SellerGuidanceHelp guidance={getSalesValidationGuidance('field.validation_status')} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><Data label="Lead / company" value={`${props.detail.lead.title} · ${props.detail.lead.companyName}`} /><Data label="Requested" value={`${fmt(v.requestedAt)} by ${props.detail.requester.name}`} /><Data label="Reviewer / team" value={props.detail.assignedReviewer?.name || v.reviewerTeam.replaceAll('_',' ')} /><Data label="Source" value={`${v.sourceType.replaceAll('_',' ')} · ${v.sourceKey}`} /></div>
    <Block title="Review request" text={v.requestContext} />
    {props.detail.requirement && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-black text-slate-900"><CircleHelp className="h-4 w-4 text-[#000080]" />Current canonical Requirement</div><div className="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-400">{props.detail.requirement.requirementKey} · {props.detail.requirement.informationCertainty.replaceAll('_',' ')} · Updated {fmt(props.detail.requirement.updatedAt)}</div><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{props.detail.requirement.content || 'Structured Requirement data is present; no duplicate client statement is stored in this review.'}</p></div>}
    {props.detail.product && <div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><div className="text-xs font-black text-slate-900">Current Sales Catalog reference</div><div className="mt-1 text-[10px] font-bold text-[#000080]">{props.detail.product.name} · {props.detail.product.code}</div><p className="mt-2 text-[10px] leading-4 text-slate-600">Manager approval: {props.detail.product.managerApprovalRequired ? 'Required by current catalog' : 'Not flagged'} · Timeline: {props.detail.product.timelineImpact || 'Not specified'}. Commercial values remain in sales_products.</p></div>}
    {v.validationType === 'COMMERCIAL' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-bold leading-4 text-amber-900">This is pre-proposal commercial validation only. Any quotation-specific discount, price, payment schedule or quotation term still requires the existing Quotation Approval workflow.</div>}
    {sourceChanged && <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-[10px] font-bold leading-4 text-orange-900"><AlertTriangle className="mr-1 inline h-4 w-4" />The canonical source changed during review. Refresh and Start Review again to acknowledge current information before making a decision.</div>}
    {v.informationRequested && <Block title="Information requested" text={v.informationRequested} />}
    {v.decisionSummary && <Block title="Decision summary" text={v.decisionSummary} />}
    {v.approvedConstraints && <Block title="Approved constraints" text={v.approvedConstraints} />}
    {v.rejectionReworkReason && <Block title="Rejection / rework reason" text={v.rejectionReworkReason} />}

    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">{['PENDING','IN_REVIEW'].includes(v.status) && <button type="button" disabled={props.busy} onClick={props.onStart} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50"><UserCheck className="h-4 w-4" />{v.status==='PENDING' ? 'Start Review' : sourceChanged ? 'Acknowledge Current Source' : 'Refresh Review Source'}</button>}{canReview && !sourceChanged && <><button type="button" onClick={() => props.onMode('NEEDS_INFORMATION')} className="min-h-10 rounded-xl border border-amber-200 bg-amber-50 px-4 text-xs font-black text-amber-800">Needs Information</button><button type="button" onClick={() => props.onMode('APPROVE')} className="min-h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-700">Approve</button><button type="button" onClick={() => props.onMode('REJECT')} className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black text-rose-700">Reject</button></>}<button type="button" onClick={props.onRefresh} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600"><RefreshCw className="h-4 w-4" />Refresh</button></div>

    {props.mode === 'NEEDS_INFORMATION' && <DecisionEditor label="Exact information needed" value={props.informationRequest} onChange={props.setInformationRequest} placeholder="Confirm whether HubSpot sync is one-way or bidirectional." guidanceKey="action.request_more_information" onConfirm={props.onConfirm} confirmLabel="Review Request" />}
    {props.mode === 'APPROVE' && <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"><DecisionEditor label="Decision summary" value={props.decisionSummary} onChange={props.setDecisionSummary} placeholder="State exactly what is feasible." guidanceKey="field.validation_decision" /><label className="mt-3 block text-[10px] font-black text-slate-600">Approved constraints<SellerGuidanceHelp guidance={getSalesValidationGuidance('field.approved_constraints')} /><textarea rows={3} value={props.constraints} onChange={e => props.setConstraints(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs" placeholder="Conditions under which this approval applies." /></label><button type="button" onClick={props.onConfirm} className="mt-3 min-h-10 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white">Review Approval</button></div>}
    {props.mode === 'REJECT' && <DecisionEditor label="Rejection / rework reason" value={props.rejectionReason} onChange={props.setRejectionReason} placeholder="Explain what is not supported and what must change." guidanceKey="field.validation_rejection_reason" onConfirm={props.onConfirm} confirmLabel="Review Rejection" />}
  </div>;
}

function DecisionEditor({ label, value, onChange, placeholder, guidanceKey, onConfirm, confirmLabel }: { label:string; value:string; onChange:(v:string)=>void; placeholder:string; guidanceKey:string; onConfirm?:()=>void; confirmLabel?:string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><label className="text-[10px] font-black text-slate-600">{label}<SellerGuidanceHelp guidance={getSalesValidationGuidance(guidanceKey)} /><textarea rows={4} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs" placeholder={placeholder} /></label>{onConfirm && <button type="button" onClick={onConfirm} className="mt-3 min-h-10 rounded-xl bg-[#000080] px-4 text-xs font-black text-white">{confirmLabel}</button>}</div>; }

function DecisionConfirmation({ detail, mode, informationRequest, decisionSummary, constraints, rejectionReason, busy, onCancel, onConfirm }: { detail: CRMSalesValidationDetail; mode: Exclude<DecisionMode,null>; informationRequest:string; decisionSummary:string; constraints:string; rejectionReason:string; busy:boolean; onCancel:()=>void; onConfirm:()=>void }) {
  const label = mode === 'APPROVE' ? 'Approve' : mode === 'REJECT' ? 'Reject' : 'Request Information';
  const body = mode === 'APPROVE' ? decisionSummary : mode === 'REJECT' ? rejectionReason : informationRequest;
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/75 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="validation-confirm-title" className="w-full max-w-lg rounded-[24px] bg-white p-5 shadow-2xl"><div className="flex items-start gap-3">{mode==='APPROVE' ? <BadgeCheck className="mt-0.5 h-5 w-5 text-emerald-600" /> : mode==='REJECT' ? <XCircle className="mt-0.5 h-5 w-5 text-rose-600" /> : <CircleAlert className="mt-0.5 h-5 w-5 text-amber-700" />}<div><h3 id="validation-confirm-title" className="text-base font-black text-slate-950">Confirm {label}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{detail.lead.companyName || detail.lead.title} · {detail.validation.subject}. This action becomes auditable.</p></div></div><div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Decision / request</div><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{body}</p>{mode==='APPROVE' && constraints.trim() && <><div className="mt-3 text-[9px] font-black uppercase tracking-wide text-slate-400">Constraints</div><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{constraints}</p></>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600">Go Back</button><button type="button" disabled={busy} onClick={onConfirm} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-black text-white disabled:opacity-50 ${mode==='REJECT' ? 'bg-rose-700' : mode==='APPROVE' ? 'bg-emerald-700' : 'bg-[#000080]'}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirm {label}</button></div></div></div>;
}

function Data({ label, value }: { label:string; value:string }) { return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 break-words text-[10px] font-bold leading-4 text-slate-700">{value}</div></div>; }
function Block({ title, text }: { title:string; text:string }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{title}</div><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{text}</p></div>; }
