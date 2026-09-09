import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, CheckCircle2, Info, Loader2, Package, PlusCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  CRMPackageFitAddonCandidate,
  CRMPackageFitAssessment,
  CRMPackageFitCandidate,
  CRMPackageFitProduct,
  CRMPackageFitStatus,
  CRMPackageFitTrace,
  crmPackageFitService,
} from '../../../lib/crmPackageFitService';
import { getPackageFitGuidance } from '../../../lib/crmPackageFitGuidance';
import SellerGuidanceHelp from './SellerGuidanceHelp';

export type CRMPackageFitPanelProps = {
  leadId?: string;
  opportunityId?: string;
  refreshKey?: string;
  onViewDiscovery?: () => void;
};

const STATUS_TONE: Record<CRMPackageFitStatus, string> = {
  FIT: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  POSSIBLE_FIT: 'border-blue-200 bg-blue-50 text-[#000080]',
  MISMATCH: 'border-rose-200 bg-rose-50 text-rose-700',
  REVIEW_REQUIRED: 'border-amber-200 bg-amber-50 text-amber-800',
};

const statusLabel = (status: CRMPackageFitStatus) => status.replaceAll('_', ' ');
const confidenceTone = (value: string) => value === 'HIGH'
  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
  : value === 'MEDIUM'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-rose-200 bg-rose-50 text-rose-700';

const fmtTime = (value?: string | null) => value
  ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Current request';

const formatPrice = (product: CRMPackageFitProduct) => {
  if (product.priceMode === 'custom') return 'Custom / assessment pricing';
  if (product.basePrice == null || !product.currency) return product.priceMode.replaceAll('_', ' ');
  const formatted = new Intl.NumberFormat(undefined, { style: 'currency', currency: product.currency, maximumFractionDigits: 0 }).format(product.basePrice);
  return product.priceMode === 'starting_at' ? `Starting at ${formatted}` : formatted;
};

const duration = (product: CRMPackageFitProduct) => {
  if (product.timelineImpact === 'assessment_required') return 'Timeline assessment required';
  if (product.deliveryDurationMin == null && product.deliveryDurationMax == null) return 'No fixed catalog duration';
  const unit = (product.deliveryDurationUnit || 'days').replaceAll('_', ' ');
  if (product.deliveryDurationMin != null && product.deliveryDurationMax != null) return `${product.deliveryDurationMin}–${product.deliveryDurationMax} ${unit}`;
  return `${product.deliveryDurationMin ?? product.deliveryDurationMax} ${unit}`;
};

export default function CRMPackageFitPanel({ leadId, opportunityId, refreshKey, onViewDiscovery }: CRMPackageFitPanelProps) {
  const [assessment, setAssessment] = useState<CRMPackageFitAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!leadId && !opportunityId) {
      setAssessment(null);
      setLoading(false);
      setError('A connected Lead or Opportunity is required for Package Fit.');
      return;
    }
    mode === 'refresh' ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setAssessment(await crmPackageFitService.getAssessment({ leadId, opportunityId }));
    } catch {
      setError('Package Fit could not be evaluated from the current CRM information.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadId, opportunityId]);

  useEffect(() => {
    setAssessment(null);
    void load('initial');
  }, [load, refreshKey]);

  const likelyFitLabel = useMemo(() => {
    if (!assessment?.recommendedProduct) return 'No reliable package recommendation yet';
    return assessment.confidence === 'LOW'
      ? `Current possible fit: ${assessment.recommendedProduct.name}`
      : `Current likely fit: ${assessment.recommendedProduct.name}`;
  }, [assessment]);

  const scrollToRequirements = () => document.getElementById('crm-requirements-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (loading && !assessment) return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">
      <div className="flex min-h-28 items-center justify-center gap-2 text-xs font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" />Evaluating Package Fit from current CRM truth…</div>
    </section>
  );

  if (error && !assessment) return (
    <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm" role="alert">
      <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" /><div><h3 className="text-sm font-black text-slate-900">Package Fit unavailable</h3><p className="mt-1 text-xs leading-5 text-slate-500">{error}</p><button type="button" onClick={() => void load('initial')} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white"><RefreshCw className="h-4 w-4" />Retry</button></div></div>
    </section>
  );

  if (!assessment) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Package Fit assessment">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><Package className="h-4 w-4" />Package Fit<SellerGuidanceHelp guidance={getPackageFitGuidance('section.package_fit')} /></div>
            <h3 className="mt-2 break-words text-lg font-black text-slate-950">{likelyFitLabel}</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Deterministic guidance from current Requirements, relevant Discovery and the live Sales Catalog. This is not technical, commercial, timeline, manager, proposal, quotation, or Pipeline approval.</p>
          </div>
          <button type="button" disabled={refreshing} onClick={() => void load('refresh')} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh assessment</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1.5 text-[9px] font-black ${STATUS_TONE[assessment.status]}`}>{statusLabel(assessment.status)}</span><SellerGuidanceHelp guidance={getPackageFitGuidance('field.package_fit_status')} />
          <span className={`rounded-full border px-3 py-1.5 text-[9px] font-black ${confidenceTone(assessment.confidence)}`}>{assessment.confidence} confidence</span><SellerGuidanceHelp guidance={getPackageFitGuidance('field.package_fit_confidence')} />
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[9px] font-black text-slate-500">Policy v{assessment.policyVersion}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[9px] font-black text-slate-500">Evaluated {fmtTime(assessment.evaluatedAt)}</span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {assessment.recommendedProduct ? <CatalogCard product={assessment.recommendedProduct} /> : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><div className="text-xs font-black text-amber-900">More information or review is required before a reliable recommendation</div><p className="mt-1 text-[10px] leading-4 text-amber-800">The evaluator intentionally returned no package rather than fabricating certainty.</p></div></div>
          </div>
        )}

        {assessment.reasons.length > 0 && <TraceSection title="Why this fits" guidanceKey="section.package_fit_reasons" items={assessment.reasons} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />}
        {assessment.complexitySignals.length > 0 && <TraceSection title="Mismatch / complexity signals" guidanceKey="section.package_fit_mismatch" items={assessment.complexitySignals} icon={<ArrowDownRight className="h-4 w-4 text-rose-600" />} />}
        {assessment.missingInformation.length > 0 && <TraceSection title="Need clarification" guidanceKey="section.package_fit_missing_information" items={assessment.missingInformation} icon={<Info className="h-4 w-4 text-[#000080]" />} actions={[{ label: 'Open Requirements', onClick: scrollToRequirements }, ...(onViewDiscovery ? [{ label: 'Open Discovery', onClick: onViewDiscovery }] : [])]} />}
        {assessment.validationSignals.length > 0 && <TraceSection title="Validation needed" guidanceKey="section.package_fit_validation" items={assessment.validationSignals} icon={<ShieldCheck className="h-4 w-4 text-amber-700" />} />}

        <AddonGuidance addOns={assessment.possibleAddOns || []} />
        <CandidateComparison candidates={assessment.candidateProducts} />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Active Requirements" value={assessment.sourceSummary.activeRequirementCount} />
          <Metric label="Client confirmed" value={assessment.sourceSummary.confirmedRequirementCount} />
          <Metric label="Active packages" value={assessment.sourceSummary.activePackageCount} />
          <Metric label="Active add-ons" value={assessment.sourceSummary.activeAddonCount} />
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] leading-4 text-slate-600"><strong>Current-data rule:</strong> this assessment is recalculated from current CRM truth and current <code>sales_products</code>. Possible add-ons are guidance only and are never added to a quotation here. An accepted quotation remains the customer-specific historical commercial agreement and is not rewritten by Package Fit.</div>
      </div>
    </section>
  );
}

function CatalogCard({ product }: { product: CRMPackageFitProduct }) {
  const scope = Array.isArray(product.scope) ? product.scope.filter(item => typeof item === 'string') as string[] : [];
  return <div className="rounded-2xl border border-[#000080]/15 bg-slate-50 p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[.12em] text-[#000080]">Current catalog guidance<SellerGuidanceHelp guidance={getPackageFitGuidance('field.current_catalog_guidance')} /></div><div className="mt-1 break-words text-base font-black text-slate-950">{product.name}</div><div className="mt-1 text-xs font-bold text-slate-600">{formatPrice(product)} · {product.code}</div></div>
      <div className="flex flex-wrap gap-2">
        {product.managerApprovalRequired && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-800">Manager approval required<SellerGuidanceHelp guidance={getPackageFitGuidance('field.manager_approval_required')} /></span>}
        {product.timelineImpact === 'assessment_required' && <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[9px] font-black text-[#000080]">Timeline assessment required<SellerGuidanceHelp guidance={getPackageFitGuidance('field.timeline_assessment_required')} /></span>}
      </div>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Data label="Technology" value={product.technology || 'Current catalog does not specify technology'} /><Data label="Delivery guidance" value={duration(product)} /></div>
    {scope.length > 0 && <div className="mt-4"><div className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">Current scope guidance</div><ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{scope.slice(0, 8).map(item => <li key={item} className="flex gap-2 text-[10px] leading-4 text-slate-600"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#000080]" />{item}</li>)}</ul>{scope.length > 8 && <div className="mt-2 text-[9px] font-bold text-slate-400">+{scope.length - 8} more current catalog scope items</div>}</div>}
  </div>;
}

function AddonGuidance({ addOns }: { addOns: CRMPackageFitAddonCandidate[] }) {
  if (!addOns.length) return null;
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex items-center gap-2 text-xs font-black text-slate-800"><PlusCircle className="h-4 w-4 text-[#000080]" />Possible current catalog add-ons</div>
    <p className="mt-1 text-[10px] leading-4 text-slate-500">Stable Requirement-to-code mappings only. These are current catalog options, not approved scope and not quotation items.</p>
    <div className="mt-3 grid gap-2 md:grid-cols-2">{addOns.map(addOn => <div key={`${addOn.code}-${addOn.trigger.requirementId || addOn.trigger.requirementKey}`} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-black text-slate-900">{addOn.name}</div><div className="mt-0.5 text-[9px] font-bold text-slate-400">{addOn.code} · {formatPrice(addOn)}</div></div>{addOn.reviewRequired && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[8px] font-black text-amber-800">Review needed</span>}</div><p className="mt-2 text-[9px] leading-4 text-slate-600">{addOn.trigger.message}</p></div>)}</div>
  </div>;
}

function TraceSection({ title, guidanceKey, items, icon, actions = [] }: { title: string; guidanceKey: string; items: CRMPackageFitTrace[]; icon: React.ReactNode; actions?: Array<{ label: string; onClick: () => void }> }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-black text-slate-800">{icon}{title}<SellerGuidanceHelp guidance={getPackageFitGuidance(guidanceKey)} /></div>{actions.length > 0 && <div className="flex flex-wrap gap-2">{actions.map(action => <button key={action.label} type="button" onClick={action.onClick} className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[9px] font-black text-[#000080]">{action.label}</button>)}</div>}</div>
    <ul className="mt-3 space-y-2">{items.map((item, index) => <li key={`${item.code}-${item.requirementId || item.questionId || index}`} className="rounded-lg bg-slate-50 p-3"><p className="break-words text-[11px] font-bold leading-5 text-slate-700">{item.message}</p><div className="mt-1 flex flex-wrap gap-1.5 text-[8px] font-black uppercase tracking-wide text-slate-400">{item.requirementKey && <span>{item.requirementKey}</span>}{item.questionKey && <span>{item.questionKey}</span>}{item.certainty && <span>{item.certainty.replaceAll('_', ' ')}</span>}{item.provisional && <span>Provisional</span>}</div></li>)}</ul>
  </div>;
}

function CandidateComparison({ candidates }: { candidates: CRMPackageFitCandidate[] }) {
  if (!candidates.length) return null;
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="text-xs font-black text-slate-800">Current package candidates</div><p className="mt-1 text-[10px] leading-4 text-slate-500">Assessment status is Package Fit policy output. Product name and commercial details remain live catalog data.</p>
    <div className="mt-3 grid gap-2 md:grid-cols-2">{candidates.map(candidate => <div key={candidate.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="break-words text-xs font-black text-slate-900">{candidate.name}</div><div className="mt-0.5 text-[9px] font-bold text-slate-400">{candidate.code} · {formatPrice(candidate)}</div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-black ${STATUS_TONE[candidate.assessmentStatus]}`}>{statusLabel(candidate.assessmentStatus)}</span></div>{candidate.mismatchReasons.length > 0 && <ul className="mt-2 space-y-1">{candidate.mismatchReasons.slice(0, 3).map((reason, index) => <li key={`${reason.code}-${index}`} className="text-[9px] leading-4 text-rose-700">• {reason.message}</li>)}</ul>}</div>)}</div>
  </div>;
}

function Data({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[8px] font-black uppercase tracking-[.12em] text-slate-400">{label}</div><div className="mt-1 break-words text-[11px] font-bold leading-5 text-slate-700">{value}</div></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-lg font-black text-slate-900">{value}</div><div className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div></div>; }
