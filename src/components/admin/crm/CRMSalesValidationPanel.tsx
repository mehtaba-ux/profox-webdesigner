import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CircleAlert, CircleHelp, Clock, Loader2, RefreshCw, Send, ShieldCheck, XCircle } from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import {
  CRMSalesValidation,
  CRMSalesValidationSeverity,
  CRMSalesValidationStatus,
  CRMSalesValidationType,
  CRMSalesValidationWorkspace,
  crmSalesValidationService,
} from '../../../lib/crmSalesValidationService';
import { getSalesValidationGuidance } from '../../../lib/crmSalesValidationGuidance';
import SellerGuidanceHelp from './SellerGuidanceHelp';

export type CRMSalesValidationPanelProps = {
  leadId: string;
  opportunityId?: string | null;
  refreshKey?: string;
  onChanged?: () => Promise<void> | void;
};

const TYPE_LABEL: Record<CRMSalesValidationType, string> = {
  TECHNICAL: 'Technical', COMMERCIAL: 'Commercial', TIMELINE: 'Timeline', COMPLIANCE_RISK: 'Compliance / Risk', SCOPE: 'Scope',
};
const STATUS_LABEL: Record<CRMSalesValidationStatus, string> = {
  PENDING: 'Pending', IN_REVIEW: 'In Review', NEEDS_INFORMATION: 'Needs Information', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled', STALE: 'Stale',
};
const SEVERITY_TONE: Record<CRMSalesValidationSeverity, string> = {
  GREEN: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  AMBER: 'border-amber-200 bg-amber-50 text-amber-800',
  RED: 'border-rose-200 bg-rose-50 text-rose-700',
};
const STATUS_TONE: Record<CRMSalesValidationStatus, string> = {
  PENDING: 'border-slate-200 bg-slate-50 text-slate-700',
  IN_REVIEW: 'border-blue-200 bg-blue-50 text-[#000080]',
  NEEDS_INFORMATION: 'border-amber-200 bg-amber-50 text-amber-800',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-700',
  CANCELLED: 'border-slate-200 bg-slate-100 text-slate-500',
  STALE: 'border-orange-200 bg-orange-50 text-orange-800',
};

const fmt = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';

export default function CRMSalesValidationPanel({ leadId, opportunityId, refreshKey, onChanged }: CRMSalesValidationPanelProps) {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<CRMSalesValidationWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const [manualType, setManualType] = useState<CRMSalesValidationType>('TECHNICAL');
  const [subject, setSubject] = useState('');
  const [context, setContext] = useState('');

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    mode === 'refresh' ? setRefreshing(true) : setLoading(true);
    setError('');
    try { setWorkspace(await crmSalesValidationService.getWorkspace(leadId, opportunityId)); }
    catch { setError('Sales validation information could not be loaded.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [leadId, opportunityId]);

  useEffect(() => { void load('initial'); }, [load, refreshKey]);

  const activeByRequirement = useMemo(() => {
    const map = new Map<string, CRMSalesValidation>();
    (workspace?.validations || []).forEach(item => {
      if (!item.requirementId) return;
      const existing = map.get(item.requirementId);
      const rank = (status: CRMSalesValidationStatus) => ['PENDING','IN_REVIEW','NEEDS_INFORMATION'].includes(status) ? 0 : status === 'STALE' ? 1 : 2;
      if (!existing || rank(item.status) < rank(existing.status) || (rank(item.status) === rank(existing.status) && item.updatedAt > existing.updatedAt)) map.set(item.requirementId, item);
    });
    return map;
  }, [workspace]);

  const afterMutation = async () => { await load('refresh'); await onChanged?.(); };

  const requestRequirement = async (requirementId: string, title: string) => {
    setBusyId(requirementId); setError('');
    try {
      await crmSalesValidationService.request({
        leadId, opportunityId, requirementId, validationType: null,
        subject: `Validate ${title}`,
        requestContext: `Specialist review is required because “${title}” is currently marked Needs Specialist Validation in the canonical Requirements workspace.`,
        sourceType: 'REQUIREMENT', sourceKey: `requirement:${requirementId}`,
      });
      await afterMutation();
    } catch (err: any) { setError(err?.message || 'The review request could not be created.'); }
    finally { setBusyId(''); }
  };

  const requestFresh = async (validation: CRMSalesValidation) => {
    setBusyId(validation.id); setError('');
    try {
      await crmSalesValidationService.request({
        leadId, opportunityId, requirementId: validation.requirementId, meetingId: validation.meetingId, productId: validation.productId,
        validationType: validation.validationType, subject: validation.subject,
        requestContext: `Fresh review requested because the previous ${TYPE_LABEL[validation.validationType]} decision is stale after its canonical source changed.`,
        sourceType: validation.sourceType, sourceKey: validation.sourceKey,
      });
      await afterMutation();
    } catch (err: any) { setError(err?.message || 'A fresh review could not be requested.'); }
    finally { setBusyId(''); }
  };

  const resubmit = async (validation: CRMSalesValidation) => {
    const note = window.prompt('Optional resubmission note. Update the canonical Requirement/Discovery first; do not paste duplicate client data here.', '') ?? null;
    if (note === null) return;
    setBusyId(validation.id); setError('');
    try { await crmSalesValidationService.transition({ validationId: validation.id, action: 'RESUBMIT', resubmissionNote: note }); await afterMutation(); }
    catch (err: any) { setError(err?.message || 'The review could not be resubmitted.'); }
    finally { setBusyId(''); }
  };

  const cancel = async (validation: CRMSalesValidation) => {
    const reason = window.prompt('Why is this review being cancelled? The record will remain in history.', '');
    if (reason === null) return;
    if (!window.confirm(`Cancel “${validation.subject}”?\n\nThis does not delete the review. The cancellation remains auditable.`)) return;
    setBusyId(validation.id); setError('');
    try { await crmSalesValidationService.transition({ validationId: validation.id, action: 'CANCEL', cancelReason: reason }); await afterMutation(); }
    catch (err: any) { setError(err?.message || 'The review could not be cancelled.'); }
    finally { setBusyId(''); }
  };

  const requestManual = async () => {
    if (subject.trim().length < 6 || context.trim().length < 8) { setError('Add a clear review subject and explain what needs review and why it matters.'); return; }
    setBusyId('manual'); setError('');
    try {
      await crmSalesValidationService.request({ leadId, opportunityId, validationType: manualType, subject: subject.trim(), requestContext: context.trim(), sourceType: 'MANUAL', sourceKey: `manual:${manualType}:${subject.trim().toLowerCase()}` });
      setRequestOpen(false); setSubject(''); setContext(''); await afterMutation();
    } catch (err: any) { setError(err?.message || 'The review request could not be created.'); }
    finally { setBusyId(''); }
  };

  if (loading && !workspace) return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite"><div className="flex min-h-24 items-center justify-center gap-2 text-xs font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" />Loading Sales validation…</div></section>;
  if (!workspace && error) return <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm" role="alert"><AlertTriangle className="mx-auto h-6 w-6 text-rose-600" /><p className="mt-2 text-center text-xs font-bold text-rose-700">{error}</p><button type="button" onClick={() => void load('initial')} className="mx-auto mt-3 flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white"><RefreshCw className="h-4 w-4" />Retry</button></section>;
  if (!workspace) return null;

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Sales validation">
    <div className="border-b border-slate-100 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Sales Validation<SellerGuidanceHelp guidance={getSalesValidationGuidance('section.sales_validation')} /></div><h3 className="mt-2 text-lg font-black text-slate-950">Specialist review without duplicate CRM truth</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Reviews resolve a specific feasibility, commercial, timing, risk or scope question. They do not confirm client facts, approve a quotation or advance Pipeline.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setRequestOpen(v => !v)} className="min-h-10 rounded-xl bg-[#000080] px-4 text-xs font-black text-white">Request Review</button><button type="button" disabled={refreshing} onClick={() => void load('refresh')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"><Metric label="Required reviews" value={workspace.summary.requiredReviews} /><Metric label="Pending / review" value={workspace.summary.pending} /><Metric label="Needs information" value={workspace.summary.needsInformation} /><Metric label="Approved" value={workspace.summary.approved} /><Metric label="Critical unresolved" value={workspace.summary.criticalUnresolved} /></div>
    </div>

    <div className="space-y-4 p-5">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{error}</div>}

      {requestOpen && <div className="rounded-xl border border-[#000080]/20 bg-slate-50 p-4"><div className="flex items-center gap-1 text-xs font-black text-slate-900">Manual review request<SellerGuidanceHelp guidance={getSalesValidationGuidance('action.request_validation')} /></div><p className="mt-1 text-[10px] leading-4 text-slate-500">Use this only for a real pre-proposal uncertainty not already represented by a Needs Specialist Validation Requirement. Quote-specific discounts/pricing/payment terms remain in Quotation Approval.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-[10px] font-black text-slate-600">Review type<select value={manualType} onChange={e => setManualType(e.target.value as CRMSalesValidationType)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900">{Object.entries(TYPE_LABEL).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-[10px] font-black text-slate-600">What needs review?<input value={subject} onChange={e => setSubject(e.target.value)} maxLength={240} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900" placeholder="e.g. Validate accelerated launch feasibility" /></label></div><label className="mt-3 block text-[10px] font-black text-slate-600">Why is this important?<textarea value={context} onChange={e => setContext(e.target.value)} maxLength={4000} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900" placeholder="Describe the specific uncertainty; keep client facts in Requirements/Discovery." /></label><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setRequestOpen(false)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600">Cancel</button><button type="button" disabled={busyId==='manual'} onClick={() => void requestManual()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busyId==='manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Request Review</button></div></div>}

      {workspace.requirementsNeedingValidation.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4"><div className="flex items-center gap-2 text-xs font-black text-amber-900"><CircleAlert className="h-4 w-4" />Requirements needing specialist validation</div><div className="mt-3 space-y-2">{workspace.requirementsNeedingValidation.map(req => {
        const validation = activeByRequirement.get(req.id);
        return <div key={req.id} className="rounded-xl border border-amber-100 bg-white p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="break-words text-xs font-black text-slate-900">{req.title}</div><div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">{req.requirementKey} · {req.informationCertainty.replaceAll('_',' ')}</div>{validation?.approvedConstraints && <p className="mt-2 text-[10px] leading-4 text-emerald-700"><strong>Approved constraints:</strong> {validation.approvedConstraints}</p>}</div><div className="flex shrink-0 flex-wrap items-center gap-2">{validation ? <StatusBadge validation={validation} /> : <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-800">No review requested</span>}{!validation && <button type="button" disabled={busyId===req.id} onClick={() => void requestRequirement(req.id,req.title)} className="min-h-9 rounded-lg bg-[#000080] px-3 text-[9px] font-black text-white disabled:opacity-50">Request Review</button>}{validation?.status==='STALE' && <button type="button" disabled={busyId===validation.id} onClick={() => void requestFresh(validation)} className="min-h-9 rounded-lg bg-[#000080] px-3 text-[9px] font-black text-white disabled:opacity-50">Request fresh review</button>}</div></div></div>;
      })}</div></div>}

      <div><div className="flex items-center gap-2 text-xs font-black text-slate-800"><Clock className="h-4 w-4" />Review history and open work</div>{workspace.validations.length === 0 ? <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No Sales validation has been requested for this Lead.</div> : <div className="mt-3 space-y-3">{workspace.validations.map(v => <ValidationCard key={v.id} validation={v} currentUserId={user?.id || ''} busy={busyId===v.id} onResubmit={() => void resubmit(v)} onCancel={() => void cancel(v)} onFresh={() => void requestFresh(v)} />)}</div>}</div>
    </div>
  </section>;
}

function ValidationCard({ validation, currentUserId, busy, onResubmit, onCancel, onFresh }: { validation: CRMSalesValidation; currentUserId: string; busy: boolean; onResubmit: () => void; onCancel: () => void; onFresh: () => void }) {
  const canCancel = validation.requestedBy === currentUserId && ['PENDING','NEEDS_INFORMATION'].includes(validation.status);
  const guidanceKey = `status.validation_${validation.status.toLowerCase()}`;
  return <article className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${SEVERITY_TONE[validation.severity]}`}>{validation.severity}</span><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${STATUS_TONE[validation.status]}`}>{STATUS_LABEL[validation.status]}</span><SellerGuidanceHelp guidance={getSalesValidationGuidance(guidanceKey)} /><span className="text-[9px] font-black uppercase tracking-wide text-[#000080]">{TYPE_LABEL[validation.validationType]}</span></div><h4 className="mt-2 break-words text-sm font-black text-slate-950">{validation.subject}</h4><p className="mt-1 break-words text-[10px] leading-4 text-slate-500">{validation.requestContext}</p><div className="mt-2 text-[9px] font-bold text-slate-400">Requested {fmt(validation.requestedAt)} · {validation.assignedReviewerName ? `Reviewer: ${validation.assignedReviewerName}` : `Queue: ${validation.reviewerTeam.replaceAll('_',' ')}`}</div></div><div className="flex shrink-0 flex-wrap gap-2">{validation.status==='NEEDS_INFORMATION' && <button type="button" disabled={busy} onClick={onResubmit} className="min-h-9 rounded-lg bg-[#000080] px-3 text-[9px] font-black text-white disabled:opacity-50">Resubmit Review</button>}{validation.status==='STALE' && <button type="button" disabled={busy} onClick={onFresh} className="min-h-9 rounded-lg bg-[#000080] px-3 text-[9px] font-black text-white disabled:opacity-50">Fresh Review</button>}{canCancel && <button type="button" disabled={busy} onClick={onCancel} className="min-h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[9px] font-black text-rose-700 disabled:opacity-50">Cancel</button>}</div></div>
    {validation.informationRequested && <Callout icon={<CircleHelp className="h-4 w-4 text-amber-700" />} label="Exact clarification requested" value={validation.informationRequested} />}
    {validation.decisionSummary && <Callout icon={<BadgeCheck className="h-4 w-4 text-emerald-600" />} label="Specialist decision" value={validation.decisionSummary} />}
    {validation.approvedConstraints && <Callout icon={<ShieldCheck className="h-4 w-4 text-[#000080]" />} label="Approved constraints" value={validation.approvedConstraints} />}
    {validation.rejectionReworkReason && <Callout icon={<XCircle className="h-4 w-4 text-rose-600" />} label="Rejection / rework reason" value={validation.rejectionReworkReason} />}
    {validation.status==='STALE' && <Callout icon={<RefreshCw className="h-4 w-4 text-orange-700" />} label="Previous decision is historical" value="The linked Requirement materially changed after the decision. Do not rely on the previous approval/rejection as current specialist judgment." />}
  </article>;
}

function StatusBadge({ validation }: { validation: CRMSalesValidation }) { return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${STATUS_TONE[validation.status]}`}>{TYPE_LABEL[validation.validationType]} · {STATUS_LABEL[validation.status]}</span>; }
function Callout({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="mt-3 rounded-lg bg-slate-50 p-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wide text-slate-500">{icon}{label}</div><p className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-4 text-slate-700">{value}</p></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-lg font-black text-slate-900">{value}</div><div className="mt-0.5 text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div></div>; }
