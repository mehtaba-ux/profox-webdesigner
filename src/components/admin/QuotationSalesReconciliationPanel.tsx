import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
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
  if (['PASS', 'READY', 'COVERED', 'READY_TO_SNAPSHOT'].includes(value)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['WARNING', 'PARTIAL', 'LEGACY', 'LEGACY_NOT_CAPTURED', 'HISTORICAL'].includes(value)) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (['BLOCKED', 'CONFLICT', 'STALE', 'UNMAPPED'].includes(value)) return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function StatusBadge({ status, label }: { status?: string; label?: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(status)}`}>{label || String(status || 'Unknown').replaceAll('_', ' ')}</span>;
}

function TargetOptionLabel({ target }: { target: QuotationSalesTargetEvidence }) {
  if (target.targetType === 'QUOTATION_ITEM') return <>{target.label || 'Quotation item'}{target.productCode ? ` · ${target.productCode}` : ''}</>;
  return <>{target.label || FIELD_LABELS[target.fieldKey || ''] || target.fieldKey || 'Quotation field'}</>;
}

function sourceId(kind: SourceKind, row: SourceRow) {
  return kind === 'SCOPE_CONDITION' ? (row as QuotationScopeCoverageRow).conditionId : (row as QuotationPromiseCoverageRow).promiseId;
}

function currentTargetToken(row: SourceRow) {
  if (row.targetType === 'QUOTATION_ITEM' && row.quotationItemId) return `QUOTATION_ITEM:${row.quotationItemId}`;
  if (row.targetType === 'QUOTATION_FIELD' && row.quotationFieldKey) return `QUOTATION_FIELD:${row.quotationFieldKey}`;
  return '';
}

function CoverageEditor({
  quotationId,
  kind,
  row,
  targets,
  readOnly,
  onSaved,
}: {
  quotationId: string;
  kind: SourceKind;
  row: SourceRow;
  targets: QuotationSalesTargetEvidence[];
  readOnly: boolean;
  onSaved: () => Promise<void>;
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
  const [targetToken, setTargetToken] = useState(existingToken || (() => {
    const first = eligible[0];
    return first?.targetType === 'QUOTATION_ITEM' ? `QUOTATION_ITEM:${first.itemId}` : first?.fieldKey ? `QUOTATION_FIELD:${first.fieldKey}` : '';
  })());
  const [status, setStatus] = useState<QuotationSalesCoverageReviewStatus>(row.coverageStatus === 'PARTIAL' || row.coverageStatus === 'CONFLICT' ? row.coverageStatus : 'COVERED');
  const [note, setNote] = useState(row.coverageNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTargetToken(existingToken || (() => {
      const first = eligible[0];
      return first?.targetType === 'QUOTATION_ITEM' ? `QUOTATION_ITEM:${first.itemId}` : first?.fieldKey ? `QUOTATION_FIELD:${first.fieldKey}` : '';
    })());
    setStatus(row.coverageStatus === 'PARTIAL' || row.coverageStatus === 'CONFLICT' ? row.coverageStatus : 'COVERED');
    setNote(row.coverageNote || '');
    setError('');
  }, [existingToken, row.coverageStatus, row.coverageNote, eligible]);

  const save = async () => {
    setError('');
    if (!targetToken) {
      setError('Choose a meaningful customer-visible quotation target first.');
      return;
    }
    if ((status === 'PARTIAL' || status === 'CONFLICT') && note.trim().length < 3) {
      setError('Partial or Conflict needs a brief explanation.');
      return;
    }
    const [targetType, targetId] = targetToken.split(':', 2) as [QuotationSalesCoverageTargetType, string];
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
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await onSaved();
  };

  return <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
      Coverage review
      <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('field.coverage_status')} />
    </div>
    {eligible.length ? <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px]">
      <label className="block">
        <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-600">Customer-visible target <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('field.coverage_target')} /></span>
        <select disabled={readOnly || saving} value={targetToken} onChange={event => setTargetToken(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-100">
          <option value="">Choose target</option>
          {eligible.map(target => {
            const value = target.targetType === 'QUOTATION_ITEM' ? `QUOTATION_ITEM:${target.itemId}` : `QUOTATION_FIELD:${target.fieldKey}`;
            return <option key={value} value={value}>{target.label || FIELD_LABELS[target.fieldKey || ''] || target.productCode || 'Quotation target'}</option>;
          })}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold text-slate-600">Decision</span>
        <select disabled={readOnly || saving} value={status} onChange={event => setStatus(event.target.value as QuotationSalesCoverageReviewStatus)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold disabled:bg-slate-100">
          <option value="COVERED">Covered</option>
          <option value="PARTIAL">Partial</option>
          <option value="CONFLICT">Conflict</option>
        </select>
      </label>
    </div> : <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">No eligible target currently contains meaningful customer-visible content. Update the normal quotation field or committed line item, save the quotation, then refresh this panel.</div>}
    <label className="mt-3 block">
      <span className="mb-1 block text-[11px] font-bold text-slate-600">Review note {status === 'COVERED' ? <span className="font-normal text-slate-400">(optional)</span> : <span className="text-red-600">(required)</span>}</span>
      <textarea disabled={readOnly || saving} rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder={status === 'COVERED' ? 'Optional context for this reviewed mapping' : 'Explain what is partial or conflicting'} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 disabled:bg-slate-100" />
    </label>
    {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-[10px] leading-4 text-slate-500">Reviewer identity, review time, target fingerprint and staleness are controlled by the server.</p>
      <button type="button" disabled={readOnly || saving || !eligible.length} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}Save Review
      </button>
    </div>
  </div>;
}

function SourceCard({
  quotationId,
  kind,
  row,
  targets,
  readOnly,
  onSaved,
}: {
  quotationId: string;
  kind: SourceKind;
  row: SourceRow;
  targets: QuotationSalesTargetEvidence[];
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const condition = kind === 'SCOPE_CONDITION' ? row as QuotationScopeCoverageRow : null;
  const promise = kind === 'PROMISE' ? row as QuotationPromiseCoverageRow : null;
  const title = condition ? `${condition.conditionType.replaceAll('_', ' ')} · ${condition.title}` : `${promise?.promiseType.replaceAll('_', ' ')} Promise`;
  const wording = condition?.conditionText || promise?.promiseText || '';
  const isStale = row.coverageStatus === 'STALE';
  const integrityBlocked = Boolean(promise && promise.promiseIntegrityStatus === 'BLOCKED');

  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${isStale || integrityBlocked ? 'border-red-200' : 'border-slate-200'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#000080]">{kind === 'SCOPE_CONDITION' ? 'Scope Condition' : 'Client Promise'}</span>
          <StatusBadge status={row.coverageStatus} />
          {integrityBlocked && <StatusBadge status="BLOCKED" label="Promise integrity blocked" />}
        </div>
        <h4 className="mt-2 text-sm font-black text-slate-950">{title}</h4>
        <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">{wording}</p>
      </div>
      {isStale && <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('status.coverage_stale')} />}
      {integrityBlocked && <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('status.promise_integrity')} />}
    </div>

    <div className="mt-3 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-2">
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><b className="text-slate-700">Source:</b> {condition?.sourceType || promise?.sourceType || '—'}{(condition?.sourceSummary || promise?.sourceSummary) ? ` · ${condition?.sourceSummary || promise?.sourceSummary}` : ''}</div>
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><b className="text-slate-700">Validation:</b> {row.validation?.validationType || 'Not linked'}{row.validation?.status ? ` · ${row.validation.status.replaceAll('_', ' ')}` : ''}{row.validationAlignmentStatus ? ` · ${row.validationAlignmentStatus.replaceAll('_', ' ')}` : ''}</div>
    </div>
    {row.validation?.approvedConstraints && <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-900"><b>Approved constraints:</b> {row.validation.approvedConstraints}</div>}
    {row.targetExcerpt && <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-[11px] leading-5 text-emerald-900"><b>Current mapped quotation evidence:</b> {row.targetExcerpt}</div>}
    {row.reviewedAt && <p className="mt-2 text-[10px] text-slate-400">Last reviewed {new Date(row.reviewedAt).toLocaleString()}</p>}

    {!readOnly && <CoverageEditor quotationId={quotationId} kind={kind} row={row} targets={targets} readOnly={readOnly} onSaved={onSaved} />}
  </article>;
}

export default function QuotationSalesReconciliationPanel({ quotationId, onClose }: Props) {
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
    if (result.error || !result.data) {
      setError(result.error?.message || 'Could not load Sales reconciliation.');
      return;
    }
    setAssessment(result.data);
    setSnapshot(null);
  };

  useEffect(() => { void load(); }, [quotationId]);

  const buildPreview = async () => {
    setSnapshotLoading(true);
    setError('');
    const result = await quotationSalesReconciliationService.buildSnapshotPreview(quotationId);
    setSnapshotLoading(false);
    if (result.error || !result.data) {
      setError(result.error?.message || 'Could not build the read-only snapshot preview.');
      return;
    }
    setSnapshot(result.data);
  };

  if (loading) return <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div>;
  if (!assessment) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error || 'Sales reconciliation is unavailable.'}</div>;

  const targets = [...(assessment.availableTargets?.fields || []), ...(assessment.availableTargets?.items || [])];
  const historical = Boolean(assessment.historicalQuotation);
  const reviewableStatus = ['Draft', 'Ready for Approval', 'Approved'].includes(String(assessment.quotationStatus || ''));
  const readOnly = historical || !reviewableStatus;
  const dimensions = assessment.quotationDimensions || [];

  return <section id="quotation-sales-reconciliation" className="space-y-5" aria-label="Quotation Sales reconciliation">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-[#000080]">
            Part 10A · Quotation integrity
            <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('section.quotation_sales_reconciliation')} />
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Sales Reconciliation</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Verify that current Scope Conditions and real client Promises are represented in this exact quotation revision. This panel compares canonical truth; it never rewrites the quotation automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button>
          {onClose && <button type="button" onClick={onClose} aria-label="Close Sales reconciliation" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><XCircle className="h-4 w-4" /></button>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={assessment.status} />
        <span className="text-[10px] font-semibold text-slate-400">Quotation revision {assessment.quotationRevision || 1} · {assessment.quotationStatus || 'Unknown status'}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]" /><div><div className="flex items-center gap-1 font-black">Final Send Gate: NOT YET ACTIVE <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('status.final_send_gate')} /></div><p className="mt-1">Part 10A is a non-blocking readiness preview. Existing quotation approval and Send Quotation behavior remain unchanged until a later explicitly activated phase.</p></div></div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {dimensions.map(dimension => <div key={dimension.key} className="rounded-2xl border border-slate-200 p-3.5"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{dimension.key.replaceAll('_', ' ')}</p><StatusBadge status={dimension.status} /></div><p className="mt-2 text-xs font-bold text-slate-800">{String(dimension.coverageState || 'Not evaluated').replaceAll('_', ' ')}</p>{dimension.activeCount != null && <p className="mt-1 text-[10px] text-slate-500">{dimension.coveredCount || 0} covered / {dimension.activeCount} active</p>}</div>)}
      </div>
    </header>

    {historical && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="flex items-center gap-1 font-black">Historical quotation · {assessment.legacyCoverageNotCaptured ? 'Legacy coverage not captured' : 'Read-only reconciliation history'} <SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('status.legacy_coverage')} /></div><p className="mt-1">Part 10A does not fabricate or backfill coverage for delivered quotation history.</p></div></div></div>}

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}

    <div className="grid gap-4 lg:grid-cols-2">
      <div className={`rounded-2xl border p-4 ${statusTone(assessment.quotedProductAlignment?.status)}`}>
        <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide">Quoted package alignment</p><p className="mt-1 text-sm font-black">{assessment.quotedProductAlignment?.status || 'Not evaluated'}</p></div><SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('status.package_alignment')} /></div>
        <p className="mt-2 text-xs leading-5">Current Package Fit: {assessment.quotedProductAlignment?.currentPackageFitStatus || 'Not evaluated'}. Reconciliation never adds, removes, upgrades, or downgrades quotation products automatically.</p>
      </div>
      <div className={`rounded-2xl border p-4 ${statusTone(assessment.snapshotCoverageState)}`}>
        <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide">Snapshot foundation</p><p className="mt-1 text-sm font-black">{assessment.snapshotCoverageState.replaceAll('_', ' ')}</p></div><SellerGuidanceHelp guidance={getQuotationSalesReconciliationGuidance('status.snapshot_preview')} /></div>
        <p className="mt-2 text-xs leading-5">{assessment.readyForSnapshot ? 'The deterministic read-only builder is eligible to produce the current preview.' : 'Resolve current reconciliation blockers before the builder can be treated as ready.'} Nothing is frozen or persisted in Part 10A.</p>
        <button type="button" disabled={snapshotLoading} onClick={() => void buildPreview()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-current/20 bg-white/70 px-3 py-2 text-xs font-black disabled:opacity-50">{snapshotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}Build read-only preview</button>
      </div>
    </div>

    {snapshot && <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-slate-900">Snapshot preview built</p><p className="mt-1 text-slate-500">Schema v{snapshot.snapshotSchemaVersion} · reconciliation {snapshot.finalReconciliationStatus || 'unknown'}</p></div><StatusBadge status={snapshot.persisted ? 'PASS' : 'WARNING'} label={snapshot.persisted ? 'Persisted' : 'Not persisted'} /></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><b>{snapshot.activeScopeConditions?.length || 0}</b><span className="ml-1 text-slate-500">active conditions</span></div><div className="rounded-xl bg-slate-50 p-3"><b>{snapshot.activePromises?.length || 0}</b><span className="ml-1 text-slate-500">active promises</span></div><div className="rounded-xl bg-slate-50 p-3"><b>{snapshot.quotedProducts?.length || 0}</b><span className="ml-1 text-slate-500">quoted lines</span></div></div></div>}

    {(assessment.exactBlockers?.length > 0 || assessment.warnings?.length > 0) && <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-black text-red-700"><ShieldAlert className="h-4 w-4" />Future send blockers ({assessment.exactBlockers?.length || 0})</div><div className="mt-3 space-y-2">{(assessment.exactBlockers || []).slice(0, 12).map((issue, index) => <div key={`${issue.code || 'blocker'}-${index}`} className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-800"><b>{issue.code?.replaceAll('_', ' ') || 'Blocker'}:</b> {issue.message || 'Current reconciliation is blocked.'}</div>)}</div></div>
      <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-black text-amber-800"><AlertTriangle className="h-4 w-4" />Warnings ({assessment.warnings?.length || 0})</div><div className="mt-3 space-y-2">{(assessment.warnings || []).slice(0, 12).map((issue, index) => <div key={`${issue.code || 'warning'}-${index}`} className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><b>{issue.code?.replaceAll('_', ' ') || 'Warning'}:</b> {issue.message || 'Review this item.'}</div>)}</div></div>
    </div>}

    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#000080]">Current proposal boundaries</p><h3 className="mt-1 text-base font-black text-slate-950">Scope Conditions</h3></div><span className="text-xs font-semibold text-slate-500">{assessment.scopeConditionCoverage.length} active</span></div>
      <div className="space-y-3">{assessment.scopeConditionCoverage.length ? assessment.scopeConditionCoverage.map(row => <SourceCard key={row.conditionId} quotationId={quotationId} kind="SCOPE_CONDITION" row={row} targets={targets} readOnly={readOnly} onSaved={load} />) : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />No Active Scope Conditions require quotation coverage.</div>}</div>
    </section>

    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#000080]">Actually communicated commitments</p><h3 className="mt-1 text-base font-black text-slate-950">Promise Coverage</h3></div><span className="text-xs font-semibold text-slate-500">{assessment.promiseCoverage.length} active</span></div>
      <div className="space-y-3">{assessment.promiseCoverage.length ? assessment.promiseCoverage.map(row => <SourceCard key={row.promiseId} quotationId={quotationId} kind="PROMISE" row={row} targets={targets} readOnly={readOnly} onSaved={load} />) : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800"><BadgeCheck className="mr-2 inline h-4 w-4" />No material Active Promises are registered. Zero Promises is a valid state.</div>}</div>
    </section>

    {assessment.approvedConstraints && assessment.approvedConstraints.length > 0 && <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex items-center gap-2 text-sm font-black text-blue-900"><ShieldCheck className="h-4 w-4" />Current approved specialist constraints</div><div className="mt-3 space-y-2">{assessment.approvedConstraints.map((constraint, index) => <div key={String(constraint.validationId || index)} className="rounded-xl bg-white p-3 text-xs leading-5 text-blue-900">{String(constraint.constraints || constraint.approvedConstraints || 'Approved specialist constraint')}</div>)}</div></section>}
  </section>;
}
