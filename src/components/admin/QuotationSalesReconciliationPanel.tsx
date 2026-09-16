import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  FileEdit,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import SellerGuidanceHelp from './crm/SellerGuidanceHelp';
import { getQuotationSalesReconciliationGuidance } from '../../lib/quotationSalesReconciliationGuidance';
import {
  quotationSalesReconciliationService,
  type QuotationPromiseCoverageRow,
  type QuotationSalesCoverageReviewStatus,
  type QuotationSalesCoverageTargetType,
  type QuotationSalesIssue,
  type QuotationSalesReconciliationAssessment,
  type QuotationSalesScopeSnapshotPreview,
  type QuotationSalesTargetEvidence,
  type QuotationScopeCoverageRow,
} from '../../lib/quotationSalesReconciliationService';

type SourceRow = QuotationScopeCoverageRow | QuotationPromiseCoverageRow;
type SourceKind = 'SCOPE_CONDITION' | 'PROMISE';

type Props = {
  quotationId: string;
  onClose?: () => void;
  onOpenTarget?: (target: QuotationSalesTargetEvidence) => void;
};

const FIELD_LABELS: Record<string, string> = {
  scope_summary: 'Scope Summary',
  exclusions: 'Exclusions',
  client_responsibilities: 'Client Responsibilities',
  delivery_assumptions: 'Delivery Assumptions',
  handover_support: 'Handover / Support',
  terms_and_conditions: 'Terms & Conditions',
  payment_terms: 'Payment Terms',
  duration_snapshot_text: 'Delivery Timeline',
};

function statusTone(status?: string) {
  const value = String(status || '').toUpperCase();
  if (['PASS', 'READY', 'COVERED', 'READY_TO_SNAPSHOT', 'SNAPSHOT_CAPTURED', 'ALIGNED', 'APPROVED', 'NOT_REQUIRED'].includes(value)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['WARNING', 'PARTIAL', 'LEGACY', 'LEGACY_NOT_CAPTURED', 'HISTORICAL', 'NOT_EVALUATED', 'INTERNAL_DRAFT_NOT_CLIENT_COMMITMENT', 'STAGED'].includes(value)) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (['BLOCKED', 'CONFLICT', 'STALE', 'UNMAPPED', 'APPROVAL_REQUIRED', 'NOT_FROZEN'].includes(value)) return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function StatusBadge({ status, label }: { status?: string; label?: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(status)}`}>{label || String(status || 'Unknown').replaceAll('_', ' ')}</span>;
}

function sourceId(kind: SourceKind, row: SourceRow) {
  return kind === 'SCOPE_CONDITION' ? (row as QuotationScopeCoverageRow).conditionId : (row as QuotationPromiseCoverageRow).promiseId;
}

function currentTargetToken(row: SourceRow) {
  if (row.targetType === 'QUOTATION_ITEM' && row.quotationItemId) return `QUOTATION_ITEM:${row.quotationItemId}`;
  if (row.targetType === 'QUOTATION_FIELD' && row.quotationFieldKey) return `QUOTATION_FIELD:${row.quotationFieldKey}`;
  return '';
}

function targetToken(target: QuotationSalesTargetEvidence) {
  if (target.targetType === 'QUOTATION_ITEM' && target.itemId) return `QUOTATION_ITEM:${target.itemId}`;
  if (target.targetType === 'QUOTATION_FIELD' && target.fieldKey) return `QUOTATION_FIELD:${target.fieldKey}`;
  return '';
}

function targetLabel(target?: QuotationSalesTargetEvidence | null) {
  if (!target) return 'Quotation target';
  return target.label || FIELD_LABELS[target.fieldKey || ''] || target.productCode || 'Quotation target';
}

function dimension(assessment: QuotationSalesReconciliationAssessment, key: string) {
  return (assessment.quotationDimensions || []).find(item => item.key === key);
}

function resolutionLabel(issue: QuotationSalesIssue) {
  const code = String(issue.code || '').toUpperCase();
  const source = String(issue.sourceType || '').toUpperCase();
  if (source === 'REQUIREMENT' || code.includes('REQUIREMENT')) return 'Open Requirements';
  if (source === 'DISCOVERY' || code.includes('DISCOVERY')) return 'Open Discovery';
  if (source === 'PACKAGE_FIT' || code.includes('PACKAGE')) return 'Open Package Fit';
  if (source === 'VALIDATION' || code.includes('VALIDATION')) return 'Open Sales Validation';
  if (source === 'SCOPE_CONDITION' || code.includes('SCOPE_')) return 'Open Scope Conditions / Sales Reconciliation';
  if (source === 'PROMISE' || code.includes('PROMISE')) return 'Open Promise Register / Sales Reconciliation';
  if (code.includes('COVERAGE')) return 'Open Sales Reconciliation';
  if (code.includes('APPROVAL') || source === 'QUOTATION_APPROVAL') return 'Open existing quotation approval';
  if (source === 'QUOTATION_ITEM' || source === 'QUOTATION' || code.includes('QUOTATION')) return 'Open / Edit canonical quotation target';
  return 'Resolve in the canonical Sales source';
}

function CoverageEditor({ quotationId, kind, row, targets, readOnly, onSaved, onOpenTarget }: {
  quotationId: string;
  kind: SourceKind;
  row: SourceRow;
  targets: QuotationSalesTargetEvidence[];
  readOnly: boolean;
  onSaved: () => Promise<void>;
  onOpenTarget?: (target: QuotationSalesTargetEvidence) => void;
}) {
  const eligible = useMemo(() => {
    const allowed = new Set(row.eligibleTargets || []);
    return targets.filter(target => {
      if (!target.customerVisible || !target.contentPresent) return false;
      if (target.targetType === 'QUOTATION_ITEM') return allowed.has('QUOTATION_ITEM');
      return Boolean(target.fieldKey && allowed.has(target.fieldKey));
    });
  }, [row.eligibleTargets, targets]);

  const existingToken = currentTargetToken(row);
  const [selectedToken, setSelectedToken] = useState(existingToken || targetToken(eligible[0]));
  const [status, setStatus] = useState<QuotationSalesCoverageReviewStatus>(row.coverageStatus === 'PARTIAL' || row.coverageStatus === 'CONFLICT' ? row.coverageStatus : 'COVERED');
  const [note, setNote] = useState(row.coverageNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedToken(existingToken || targetToken(eligible[0]));
    setStatus(row.coverageStatus === 'PARTIAL' || row.coverageStatus === 'CONFLICT' ? row.coverageStatus : 'COVERED');
    setNote(row.coverageNote || '');
    setError('');
  }, [existingToken, row.coverageStatus, row.coverageNote, eligible]);

  const selectedTarget = eligible.find(target => targetToken(target) === selectedToken) || null;

  const save = async () => {
    setError('');
    if (!selectedToken) return setError('Choose a meaningful customer-visible quotation target first.');
    if ((status === 'PARTIAL' || status === 'CONFLICT') && note.trim().length < 3) return setError('Partial or Conflict needs a brief explanation.');
    const [targetType, targetId] = selectedToken.split(':', 2) as [QuotationSalesCoverageTargetType, string];
    setSaving(true);
    const result = await quotationSalesReconciliationService.reviewCoverage({
      quotationId,
      sourceType: kind,
      sourceId: sourceId(kind, row),
      coverageStatus: status,
      targetType,
      quotationFieldKey: targetType === 'QUOTATION_FIELD' ? targetId : null,
      quotationItemId: targetType === 'QUOTATION_ITEM' ? targetId : null,
      coverageNote: note,
    });
    setSaving(false);
    if (result.error) return setError(result.error.message);
    await onSaved();
  };

  return <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Coverage review <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('field.coverage_status')} /></div>
    {eligible.length ? <>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px]">
        <label className="block"><span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-600">Customer-visible target <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('field.coverage_target')} /></span><select disabled={readOnly || saving} value={selectedToken} onChange={event => setSelectedToken(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-100"><option value="">Choose target</option>{eligible.map(target => <option key={targetToken(target)} value={targetToken(target)}>{targetLabel(target)}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-[11px] font-bold text-slate-600">Decision</span><select disabled={readOnly || saving} value={status} onChange={event => setStatus(event.target.value as QuotationSalesCoverageReviewStatus)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold disabled:bg-slate-100"><option value="COVERED">Covered</option><option value="PARTIAL">Partial</option><option value="CONFLICT">Conflict</option></select></label>
      </div>
      {selectedTarget && <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-wide text-blue-700">Current customer-visible quotation text · {targetLabel(selectedTarget)}</p><p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-blue-950">{selectedTarget.excerpt || 'No customer-visible text is currently present.'}</p></div>{onOpenTarget && <button type="button" onClick={() => onOpenTarget(selectedTarget)} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[10px] font-black text-[#000080] hover:bg-blue-50"><FileEdit className="h-3.5 w-3.5" />Open / Edit target</button>}</div></div>}
    </> : <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">No eligible target currently contains meaningful customer-visible content. Update the canonical quotation target, save it, then refresh this panel.</div>}
    <label className="mt-3 block"><span className="mb-1 block text-[11px] font-bold text-slate-600">Review note {status === 'COVERED' ? <span className="font-normal text-slate-400">(optional)</span> : <span className="text-red-600">(required)</span>}</span><textarea disabled={readOnly || saving} rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 disabled:bg-slate-100" /></label>
    {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] leading-4 text-slate-500">Reviewer identity, review time, target fingerprint and staleness are server-controlled.</p><button type="button" disabled={readOnly || saving || !eligible.length} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}Save Review</button></div>
  </div>;
}

function SourceCard({ quotationId, kind, row, targets, readOnly, onSaved, onOpenTarget }: {
  quotationId: string;
  kind: SourceKind;
  row: SourceRow;
  targets: QuotationSalesTargetEvidence[];
  readOnly: boolean;
  onSaved: () => Promise<void>;
  onOpenTarget?: (target: QuotationSalesTargetEvidence) => void;
}) {
  const condition = kind === 'SCOPE_CONDITION' ? row as QuotationScopeCoverageRow : null;
  const promise = kind === 'PROMISE' ? row as QuotationPromiseCoverageRow : null;
  const title = condition ? `${condition.conditionType.replaceAll('_', ' ')} · ${condition.title}` : `${promise?.promiseType.replaceAll('_', ' ')} Promise`;
  const wording = condition?.conditionText || promise?.promiseText || '';
  const blocked = row.coverageStatus === 'STALE' || Boolean(promise?.promiseIntegrityStatus === 'BLOCKED' || promise?.futureSendBlockerStatus === 'BLOCKED');

  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${blocked ? 'border-red-200' : 'border-slate-200'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#000080]">{kind === 'SCOPE_CONDITION' ? 'Scope Condition' : 'Client Promise'}</span><StatusBadge status={row.coverageStatus} />{promise?.promiseIntegrityStatus === 'BLOCKED' && <StatusBadge status="BLOCKED" label="Promise integrity blocked" />}</div><h4 className="mt-2 text-sm font-black text-slate-950">{title}</h4><p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">{wording}</p></div></div>
    <div className="mt-3 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-2"><div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><b className="text-slate-700">Source:</b> {condition?.sourceType || promise?.sourceType || '—'}{(condition?.sourceSummary || promise?.sourceSummary) ? ` · ${condition?.sourceSummary || promise?.sourceSummary}` : ''}</div><div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><b className="text-slate-700">Validation:</b> {row.validation?.validationType || 'Not linked'}{row.validation?.status ? ` · ${row.validation.status.replaceAll('_', ' ')}` : ''}</div></div>
    {promise && <div className="mt-2 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-2"><div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><b className="text-slate-700">Promised by:</b> {promise.promisedByName || promise.promisedBy || 'Unknown'}</div><div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><b className="text-slate-700">Promised at:</b> {promise.promisedAt ? new Date(promise.promisedAt).toLocaleString() : 'Unknown'}</div></div>}
    {row.validation?.approvedConstraints && <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-900"><b>Approved constraints:</b> {row.validation.approvedConstraints}</div>}
    {promise?.timelineComparison && <div className={`mt-2 rounded-xl border p-3 text-[11px] leading-5 ${statusTone(promise.timelineComparison.status)}`}><div className="flex flex-wrap items-center justify-between gap-2"><b>Timeline Promise vs quotation</b><StatusBadge status={promise.timelineComparison.status} /></div>{promise.timelineComparison.reason && <p className="mt-1">{promise.timelineComparison.reason}</p>}{promise.timelineComparison.status === 'CONFLICT' && <p className="mt-1 font-bold">Neither the Promise nor quotation is changed automatically.</p>}</div>}
    {promise?.commercialApproval && <div className={`mt-2 rounded-xl border p-3 text-[11px] leading-5 ${statusTone(promise.commercialApproval.status)}`}><div className="flex flex-wrap items-center justify-between gap-2"><b>Existing quotation approval dependency</b><StatusBadge status={promise.commercialApproval.status} /></div><p className="mt-1">{promise.commercialApproval.satisfied ? 'The canonical quotation approval requirement is satisfied or not required.' : 'Coverage does not bypass approval. Complete the existing quotation approval workflow.'}</p></div>}
    {row.targetExcerpt && <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-[11px] leading-5 text-emerald-900"><b>Current mapped quotation evidence:</b> {row.targetExcerpt}</div>}
    {row.reviewedAt && <p className="mt-2 text-[10px] text-slate-400">Last reviewed {new Date(row.reviewedAt).toLocaleString()}</p>}
    {!readOnly && <CoverageEditor quotationId={quotationId} kind={kind} row={row} targets={targets} readOnly={readOnly} onSaved={onSaved} onOpenTarget={onOpenTarget} />}
  </article>;
}

export default function QuotationSalesReconciliationPanel({ quotationId, onClose, onOpenTarget }: Props) {
  const [assessment, setAssessment] = useState<QuotationSalesReconciliationAssessment | null>(null);
  const [snapshot, setSnapshot] = useState<QuotationSalesScopeSnapshotPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const result = await quotationSalesReconciliationService.assess(quotationId);
    setLoading(false);
    if (result.error || !result.data) return setError(result.error?.message || 'Could not load Sales reconciliation.');
    setAssessment(result.data);
    setSnapshot(null);
  };

  useEffect(() => { void load(); }, [quotationId]);

  const buildPreview = async () => {
    setSnapshotLoading(true);
    setError('');
    const result = await quotationSalesReconciliationService.buildSnapshotPreview(quotationId);
    setSnapshotLoading(false);
    if (result.error || !result.data) return setError(result.error?.message || 'Could not build the server snapshot preview.');
    setSnapshot(result.data);
  };

  if (loading) return <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div>;
  if (!assessment) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error || 'Sales reconciliation is unavailable.'}</div>;

  const targets = [...(assessment.availableTargets?.fields || []), ...(assessment.availableTargets?.items || [])];
  const historical = Boolean(assessment.historicalQuotation);
  const reviewableStatus = ['Draft', 'Ready for Approval', 'Approved'].includes(String(assessment.quotationStatus || ''));
  const readOnly = historical || !reviewableStatus;
  const gateActive = Boolean(assessment.finalQuotationSendGateActive);
  const snapshotMeta = assessment.salesScopeSnapshot || null;
  const snapshotCaptured = Boolean(snapshotMeta?.captured);
  const blockerCount = assessment.exactBlockers?.length || 0;
  const readyToFreeze = Boolean(assessment.readyForSnapshot && blockerCount === 0 && !historical);
  const promiseDimension = dimension(assessment, 'PROMISE_COVERAGE');
  const scopeDimension = dimension(assessment, 'FINAL_SCOPE_RECONCILIATION');
  const proposalStatus = String(assessment.proposalReadiness?.status || 'Not evaluated');
  const packageStatus = String(assessment.quotedProductAlignment?.status || 'Not evaluated');
  const approved = assessment.quotationStatus === 'Approved';
  const readyLabel = historical ? 'Historical' : gateActive && readyToFreeze && approved ? 'Ready to Send' : 'Blocked';
  const draftPromises = assessment.draftPromises || [];

  return <section id="quotation-sales-reconciliation" className="space-y-5" aria-label="Quotation Sales reconciliation">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-[#000080]">Part 10B · Final quotation integrity <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('section.quotation_sales_reconciliation')} /></div><h2 className="mt-1 text-xl font-black text-slate-950">Sales Reconciliation</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Verify that this exact quotation reflects the current approved scope, active client commitments, specialist constraints, package alignment and existing quotation approval before Send.</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button>{onClose && <button type="button" onClick={onClose} aria-label="Close Sales reconciliation" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><XCircle className="h-4 w-4" /></button>}</div></div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge status={assessment.status} /><span className="text-[10px] font-semibold text-slate-400">Quotation revision {assessment.quotationRevision || 1} · {assessment.quotationStatus || 'Unknown status'} · policy v{assessment.policyVersion}</span></div>

      <div className={`mt-4 rounded-2xl border p-4 text-xs leading-5 ${gateActive ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="flex items-center gap-1 font-black">{gateActive ? 'FINAL SEND GATE — ACTIVE' : 'FINAL SEND GATE — STAGED / NOT ACTIVE'} <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance(gateActive ? 'status.final_send_gate_active' : 'status.final_send_gate')} /></div><p className="mt-1">{gateActive ? 'This quotation cannot be sent until all required Sales, scope, Promise, validation, commercial and coverage checks are current. The database enforces the same invariant for every legitimate transition to Sent.' : 'The Part 10B-compatible server and UI can evaluate final readiness, but production Send enforcement remains intentionally inactive until the resolution UI is independently verified in authenticated production.'}</p></div></div></div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-2xl border p-3.5 ${statusTone(readyLabel === 'Ready to Send' ? 'READY' : historical ? 'HISTORICAL' : 'BLOCKED')}`}><p className="text-[10px] font-black uppercase tracking-wide">Pre-send status</p><p className="mt-2 text-sm font-black">{readyLabel}</p><p className="mt-1 text-[10px]">{blockerCount} final blocker{blockerCount === 1 ? '' : 's'}</p></div>
        <div className={`rounded-2xl border p-3.5 ${statusTone(snapshotCaptured ? 'SNAPSHOT_CAPTURED' : readyToFreeze ? 'READY_TO_SNAPSHOT' : 'NOT_FROZEN')}`}><p className="text-[10px] font-black uppercase tracking-wide">Snapshot status</p><p className="mt-2 text-sm font-black">{snapshotCaptured ? 'Captured / immutable' : readyToFreeze ? 'Ready to freeze' : 'Not ready'}</p><SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance(snapshotCaptured ? 'status.snapshot_captured' : 'status.ready_to_snapshot')} /></div>
        <div className={`rounded-2xl border p-3.5 ${statusTone(approved ? 'APPROVED' : 'BLOCKED')}`}><p className="text-[10px] font-black uppercase tracking-wide">Quotation approval</p><p className="mt-2 text-sm font-black">{approved ? 'Approved' : assessment.quotationStatus || 'Not approved'}</p><p className="mt-1 text-[10px]">Existing commercial approval remains authoritative.</p></div>
        <div className={`rounded-2xl border p-3.5 ${statusTone(packageStatus)}`}><p className="text-[10px] font-black uppercase tracking-wide">Package alignment</p><p className="mt-2 text-sm font-black">{packageStatus.replaceAll('_', ' ')}</p><SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('status.package_alignment')} /></div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3"><div className={`rounded-2xl border p-3 ${statusTone(proposalStatus)}`}><p className="text-[10px] font-black uppercase">Proposal Readiness</p><p className="mt-1 text-xs font-bold">{proposalStatus.replaceAll('_', ' ')}</p></div><div className={`rounded-2xl border p-3 ${statusTone(scopeDimension?.status)}`}><p className="text-[10px] font-black uppercase">Scope Reconciliation</p><p className="mt-1 text-xs font-bold">{String(scopeDimension?.status || 'Not evaluated').replaceAll('_', ' ')}</p></div><div className={`rounded-2xl border p-3 ${statusTone(promiseDimension?.status)}`}><p className="text-[10px] font-black uppercase">Promise Coverage</p><p className="mt-1 text-xs font-bold">{String(promiseDimension?.status || 'Not evaluated').replaceAll('_', ' ')}</p></div></div>
    </header>

    {snapshotCaptured && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900"><div className="flex items-start gap-3"><FileCheck2 className="mt-0.5 h-5 w-5 shrink-0" /><div className="flex-1"><div className="flex items-center gap-1 font-black">Final Sales snapshot captured <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('field.immutable_send_snapshot')} /></div><div className="mt-2 grid gap-2 sm:grid-cols-3"><span>Captured: <b>{snapshotMeta?.capturedAt ? new Date(snapshotMeta.capturedAt).toLocaleString() : 'Server recorded'}</b></span><span>Schema: <b>v{snapshotMeta?.schemaVersion || '—'}</b></span><span>Quotation revision: <b>{snapshotMeta?.quotationRevision || assessment.quotationRevision || 1}</b></span></div><p className="mt-2">This historical evidence is read-only. Raw snapshot JSON is intentionally not exposed here. Create a quotation revision for corrections.</p></div></div></div>}

    {historical && !snapshotCaptured && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="flex items-center gap-1 font-black">Legacy / Sales-scope snapshot not captured <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('status.legacy_coverage')} /></div><p className="mt-1">This quotation predates immutable Part 10B capture. Current CRM data is not fabricated into historical PASS evidence.</p></div></div></div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}

    {!snapshotCaptured && <div className={`rounded-2xl border p-4 ${statusTone(readyToFreeze ? 'READY_TO_SNAPSHOT' : assessment.snapshotCoverageState)}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide">Send-time snapshot <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('field.sales_scope_snapshot')} /></div><p className="mt-1 text-sm font-black">{readyToFreeze ? 'Ready to freeze' : String(assessment.snapshotCoverageState || 'Not ready').replaceAll('_', ' ')}</p><p className="mt-1 max-w-3xl text-xs leading-5">Opening this workspace never writes the final snapshot. The server freezes it only inside a successful transition to Sent, after final assertion passes.</p></div><button type="button" disabled={snapshotLoading || historical} onClick={() => void buildPreview()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-current/20 bg-white/80 px-3 py-2 text-xs font-black disabled:opacity-50">{snapshotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}Build server preview</button></div></div>}

    {snapshot && !snapshot.persisted && <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-slate-900">Read-only snapshot evidence built</p><p className="mt-1 text-slate-500">Schema v{snapshot.snapshotSchemaVersion} · reconciliation {snapshot.finalReconciliationStatus || 'unknown'}</p></div><StatusBadge status={snapshot.readyForSnapshot ? 'READY_TO_SNAPSHOT' : 'BLOCKED'} /></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><b>{snapshot.activeScopeConditions?.length || 0}</b><span className="ml-1 text-slate-500">active conditions</span></div><div className="rounded-xl bg-slate-50 p-3"><b>{snapshot.activePromises?.length || 0}</b><span className="ml-1 text-slate-500">active promises</span></div><div className="rounded-xl bg-slate-50 p-3"><b>{snapshot.quotedProducts?.length || 0}</b><span className="ml-1 text-slate-500">quoted lines</span></div></div></div>}

    {(blockerCount > 0 || assessment.warnings?.length > 0) && <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-black text-red-700"><ShieldAlert className="h-4 w-4" />{gateActive ? 'Final send blockers' : 'Pre-activation send blockers'} ({blockerCount}) <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('field.final_send_blockers')} /></div><div className="mt-3 space-y-2">{(assessment.exactBlockers || []).slice(0, 16).map((issue, index) => <div key={`${issue.code || 'blocker'}-${index}`} className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-800"><b>{issue.code?.replaceAll('_', ' ') || 'Blocker'}:</b> {issue.message || 'Current reconciliation is blocked.'}<p className="mt-1 text-[10px] font-black uppercase tracking-wide text-red-600">Resolution: {resolutionLabel(issue)}</p></div>)}</div></div><div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-black text-amber-800"><AlertTriangle className="h-4 w-4" />Warnings ({assessment.warnings?.length || 0})</div><div className="mt-3 space-y-2">{(assessment.warnings || []).slice(0, 16).map((issue, index) => <div key={`${issue.code || 'warning'}-${index}`} className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><b>{issue.code?.replaceAll('_', ' ') || 'Warning'}:</b> {issue.message || 'Review this item.'}</div>)}</div></div></div>}

    <section><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#000080]">Current proposal boundaries</p><h3 className="mt-1 text-base font-black text-slate-950">Scope Conditions</h3></div><span className="text-xs font-semibold text-slate-500">{assessment.scopeConditionCoverage.length} active</span></div><div className="space-y-3">{assessment.scopeConditionCoverage.length ? assessment.scopeConditionCoverage.map(row => <SourceCard key={row.conditionId} quotationId={quotationId} kind="SCOPE_CONDITION" row={row} targets={targets} readOnly={readOnly} onSaved={load} onOpenTarget={onOpenTarget} />) : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />No Active Scope Conditions require quotation coverage.</div>}</div></section>

    {draftPromises.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Internal preparation only</p><h3 className="mt-1 text-base font-black text-slate-950">Draft Promises</h3></div><StatusBadge status="INTERNAL_DRAFT_NOT_CLIENT_COMMITMENT" label="Internal draft / not client commitment" /></div><p className="mt-2 text-xs leading-5 text-amber-900">Draft Promises require no quotation coverage and do not count as client commitments.</p><div className="mt-3 space-y-2">{draftPromises.map(draft => <article key={draft.promiseId} className="rounded-xl border border-amber-100 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-wide text-amber-700">{draft.promiseType.replaceAll('_', ' ')} · Draft</p><p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">{draft.promiseText}</p></article>)}</div></section>}

    <section><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#000080]">Actually communicated commitments</p><h3 className="mt-1 text-base font-black text-slate-950">Promise Coverage</h3></div><span className="text-xs font-semibold text-slate-500">{assessment.promiseCoverage.length} active</span></div><div className="space-y-3">{assessment.promiseCoverage.length ? assessment.promiseCoverage.map(row => <SourceCard key={row.promiseId} quotationId={quotationId} kind="PROMISE" row={row} targets={targets} readOnly={readOnly} onSaved={load} onOpenTarget={onOpenTarget} />) : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800"><BadgeCheck className="mr-2 inline h-4 w-4" />No material Active Promises are registered. Zero Promises is a valid state.</div>}</div></section>

    {assessment.approvedConstraints && assessment.approvedConstraints.length > 0 && <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex items-center gap-2 text-sm font-black text-blue-900"><ShieldCheck className="h-4 w-4" />Current approved specialist constraints</div><div className="mt-3 space-y-2">{assessment.approvedConstraints.map((constraint, index) => <div key={String(constraint.validationId || index)} className="rounded-xl bg-white p-3 text-xs leading-5 text-blue-900">{String(constraint.constraints || constraint.approvedConstraints || 'Approved specialist constraint')}</div>)}</div></section>}

    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[11px] leading-5 text-slate-500"><ArrowUpRight className="mr-1 inline h-3.5 w-3.5" />Open / Edit target always returns to the existing canonical quotation editor. Sales Reconciliation never edits customer-facing quotation content on your behalf.</div>
  </section>;
}
