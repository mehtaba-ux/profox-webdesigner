import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  FileText,
  History,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRoundCheck,
  XCircle
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  SALES_HANDOFF_RETURN_REASONS,
  SalesHandoffBrief,
  SalesHandoffReturnReason,
  salesHandoffService
} from '../../lib/salesHandoffService';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];
const VIEW_ROLES = [...SELLER_ROLES, 'project_manager', 'site_manager'];

const RETURN_REASON_LABELS: Record<SalesHandoffReturnReason, string> = {
  MISSING_REQUIREMENT: 'Missing requirement',
  UNCLEAR_REQUIREMENT: 'Unclear requirement',
  SCOPE_CONFLICT: 'Scope conflict',
  PROMISE_NOT_COVERED: 'Promise not covered',
  VALIDATION_MISSING: 'Validation missing',
  TIMELINE_CONFLICT: 'Timeline conflict',
  CLIENT_DEPENDENCY_MISSING: 'Client dependency missing',
  ONBOARDING_INFORMATION_INCOMPLETE: 'Onboarding information incomplete',
  COMMERCIAL_CLARIFICATION: 'Commercial clarification',
  OTHER: 'Other'
};

function formatMoney(value?: number | null, currency?: string | null) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency || 'USD'} ${amount.toLocaleString()}`;
  }
}

function formatDate(value?: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function lifecycleLabel(status?: string | null) {
  switch (status) {
    case 'SUBMITTED': return 'Submitted';
    case 'RESUBMITTED': return 'Resubmitted';
    case 'RETURNED_TO_SALES': return 'Returned to Sales';
    case 'ACCEPTED': return 'Accepted';
    default: return 'Not Submitted';
  }
}

function lifecycleClasses(status?: string | null) {
  if (status === 'ACCEPTED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'RETURNED_TO_SALES') return 'bg-red-100 text-red-800';
  if (status === 'SUBMITTED' || status === 'RESUBMITTED') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
}

function sourceUrlForReason(reason: SalesHandoffReturnReason | undefined, brief: SalesHandoffBrief) {
  if (!reason) return brief.sourceLinks.project;
  if (['MISSING_REQUIREMENT', 'UNCLEAR_REQUIREMENT', 'PROMISE_NOT_COVERED', 'VALIDATION_MISSING', 'SCOPE_CONFLICT', 'TIMELINE_CONFLICT', 'CLIENT_DEPENDENCY_MISSING'].includes(reason)) {
    return brief.sourceLinks.requirements;
  }
  if (reason === 'ONBOARDING_INFORMATION_INCOMPLETE') return brief.sourceLinks.onboarding;
  if (reason === 'COMMERCIAL_CLARIFICATION') return brief.sourceLinks.quotation;
  return brief.sourceLinks.project;
}

export default function SalesProjectHandoverView() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const active = Boolean(user && profile && profile.status === 'active');
  const isSeller = Boolean(active && profile && SELLER_ROLES.includes(profile.role));
  const allowed = Boolean(active && profile && (isAdmin || VIEW_ROLES.includes(profile.role)));
  const [brief, setBrief] = useState<SalesHandoffBrief | null>(null);
  const [notes, setNotes] = useState('');
  const [requirementsDraft, setRequirementsDraft] = useState('');
  const [savingRequirements, setSavingRequirements] = useState(false);
  const [requirementsSaved, setRequirementsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [returnReasons, setReturnReasons] = useState<SalesHandoffReturnReason[]>([]);
  const [missingItemsText, setMissingItemsText] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  const load = async () => {
    if (!allowed || !id) return;
    setLoading(true);
    setError('');
    try {
      const next = await salesHandoffService.getBrief(id);
      setBrief(next);
      setNotes(next.sellerNotes || '');
      setRequirementsDraft(next.salesRequirements || '');
    } catch (err: any) {
      setError(err?.message || 'The protected Sales handoff brief could not be loaded.');
      setBrief(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed && id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, id]);

  const currentReturn = brief?.lifecycleStatus === 'RETURNED_TO_SALES' ? brief.currentAttempt : null;
  const isPendingReview = brief?.lifecycleStatus === 'SUBMITTED' || brief?.lifecycleStatus === 'RESUBMITTED';

  const restoreRequirements = async () => {
    if (!brief || savingRequirements || !isSeller) return;
    setSavingRequirements(true);
    setRequirementsSaved(false);
    setError('');
    setSuccess('');
    try {
      await salesHandoffService.restoreMissingRequirements(brief.projectId, requirementsDraft.trim());
      const refreshed = await salesHandoffService.getBrief(brief.projectId);
      setBrief(refreshed);
      setRequirementsDraft(refreshed.salesRequirements || '');
      setRequirementsSaved(true);
    } catch (err: any) {
      setError(err?.message || 'The missing legacy Sales requirements summary could not be restored.');
    } finally {
      setSavingRequirements(false);
    }
  };

  const submit = async () => {
    if (!brief || saving || !isSeller || !brief.canSubmit) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await salesHandoffService.submit(brief.projectId, notes.trim());
      const refreshed = await salesHandoffService.getBrief(brief.projectId);
      setBrief(refreshed);
      setNotes(refreshed.sellerNotes || '');
      setSuccess(result.idempotent ? 'The current handoff is already waiting for Delivery review.' : `Handoff attempt #${result.attemptNumber} sent to Delivery through the protected workflow.`);
    } catch (err: any) {
      setError(err?.message || 'The Sales handoff could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  const accept = async () => {
    if (!brief?.currentAttempt || saving || !brief.canAccept) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await salesHandoffService.accept(brief.projectId, brief.currentAttempt.attemptNumber);
      const refreshed = await salesHandoffService.getBrief(brief.projectId);
      setBrief(refreshed);
      setSuccess('Delivery accepted the current Sales handoff. Content remains protected by the existing stage gate until all required workflow tasks are complete.');
    } catch (err: any) {
      setError(err?.message || 'The Sales handoff could not be accepted.');
    } finally {
      setSaving(false);
    }
  };

  const toggleReason = (reason: SalesHandoffReturnReason) => {
    setReturnReasons(current => current.includes(reason) ? current.filter(item => item !== reason) : [...current, reason]);
  };

  const returnToSales = async () => {
    if (!brief?.currentAttempt || saving || !brief.canReturn) return;
    const lines = missingItemsText.split('\n').map(line => line.trim()).filter(Boolean);
    if (returnReasons.length === 0 || lines.length === 0 || reviewNotes.trim().length < 10) {
      setError('Return to Sales requires a structured reason, at least one actionable missing item, and a clear review note.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const primary = returnReasons[0];
      await salesHandoffService.returnToSales({
        projectId: brief.projectId,
        expectedAttempt: brief.currentAttempt.attemptNumber,
        reasonCodes: returnReasons,
        missingItems: lines.map(label => ({
          label,
          sourceType: primary,
          actionUrl: sourceUrlForReason(primary, brief)
        })),
        reviewNotes: reviewNotes.trim()
      });
      const refreshed = await salesHandoffService.getBrief(brief.projectId);
      setBrief(refreshed);
      setReturnReasons([]);
      setMissingItemsText('');
      setReviewNotes('');
      setSuccess('The handoff was returned to Sales with structured remediation. Sales owns the correction until resubmission and acceptance.');
    } catch (err: any) {
      setError(err?.message || 'The Sales handoff could not be returned to Sales.');
    } finally {
      setSaving(false);
    }
  };

  const deliveryFacts = useMemo(() => {
    if (!brief?.onboarding?.deliveryFacts) return [];
    return Object.entries(brief.onboarding.deliveryFacts).filter(([, value]) => String(value || '').trim());
  }, [brief]);

  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!allowed) return <Navigate to="/admin" replace />;

  const backUrl = isSeller ? '/admin/seller-command-center' : '/admin/app/projects?tab=projects';

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={() => navigate(backUrl)}
          className="mb-5 inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-[#000080] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ArrowLeft className="h-4 w-4" /> {isSeller ? 'Back to Seller Command Center' : 'Back to Projects'}
        </button>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 bg-slate-50/80 p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-[#000080] p-3 text-white"><ClipboardCheck className="h-5 w-5" /></div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Sales → Delivery Handoff</div>
                  <h1 className="mt-1 text-2xl font-black">Authoritative Client Brief & Delivery Review</h1>
                  <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-500">
                    This view derives current truth from structured Sales Requirements, the accepted quotation snapshot, verified Payment, completed Onboarding, Validations, Promises and Scope Conditions. Review history stores lifecycle/version evidence only.
                  </p>
                </div>
              </div>
              {brief && <span className={`rounded-full px-3 py-1.5 text-[10px] font-black ${lifecycleClasses(brief.lifecycleStatus)}`}>{lifecycleLabel(brief.lifecycleStatus)}</span>}
            </div>
          </header>

          <div className="p-5 sm:p-8">
            {loading ? (
              <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div>
            ) : error && !brief ? (
              <Notice tone="error">{error}</Notice>
            ) : brief ? (
              <div className="space-y-7">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Info label="Project" value={brief.projectName || 'Project'} />
                  <Info label="Project Number" value={brief.projectNumber || 'Pending'} />
                  <Info label="Current Stage" value={brief.projectStage || 'Sales Handover'} />
                  <Info label="Seller" value={brief.seller?.name || 'Unresolved'} />
                  <Info label="Project Manager" value={brief.projectManager?.name || 'Not Assigned'} />
                </div>

                <ReadinessPanel brief={brief} navigate={navigate} />

                {brief.sourceDrift && (
                  <Notice tone="warning">
                    Canonical handoff evidence changed after the latest submission/review. Delivery cannot rely on the stale version. Sales must review current source truth and resubmit before Content can begin.
                  </Notice>
                )}

                {currentReturn && (
                  <section className="rounded-2xl border border-red-200 bg-red-50 p-5" aria-labelledby="returned-handoff-title">
                    <div className="flex items-start gap-3">
                      <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                      <div className="min-w-0 flex-1">
                        <h2 id="returned-handoff-title" className="text-sm font-black text-red-950">RETURNED TO SALES · Attempt #{currentReturn.attemptNumber}</h2>
                        <p className="mt-1 text-xs leading-5 text-red-800">Returned {formatDate(currentReturn.reviewedAt)} by {currentReturn.reviewedByName || 'Delivery reviewer'}. Sales owns these corrections until a new version is resubmitted and accepted.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {(currentReturn.returnReasonCodes || []).map(code => <span key={code} className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[9px] font-black text-red-800">{RETURN_REASON_LABELS[code as SalesHandoffReturnReason] || code}</span>)}
                        </div>
                        {currentReturn.returnNotes && <div className="mt-4 rounded-xl border border-red-200 bg-white p-4 text-xs leading-5 text-slate-700"><div className="mb-1 text-[9px] font-black uppercase tracking-wider text-red-700">Reviewer note</div>{currentReturn.returnNotes}</div>}
                        <div className="mt-4 space-y-2">
                          {(currentReturn.missingItems || []).map((item: any, index) => (
                            <div key={`${item.label || 'item'}-${index}`} className="flex flex-col gap-2 rounded-xl border border-red-200 bg-white p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                              <span className="font-semibold text-slate-700">{item.label || 'Resolve the returned item at its authoritative source.'}</span>
                              {item.actionUrl && <button type="button" onClick={() => navigate(String(item.actionUrl))} className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#000080] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Open source <ExternalLink className="h-3 w-3" /></button>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <section className="grid gap-4 lg:grid-cols-3">
                  <SummaryCard
                    icon={<FileText className="h-4 w-4 text-[#000080]" />}
                    title="Accepted Quotation"
                    primary={brief.quotation.number || 'Quotation'}
                    secondary={`${brief.quotation.status || 'Accepted'} · ${formatMoney(brief.quotation.total, brief.quotation.currency)}`}
                    foot={`Accepted ${formatDate(brief.quotation.acceptedAt)} · Revision ${brief.quotation.revisionNumber || 1}`}
                  />
                  <SummaryCard
                    icon={<CreditCard className="h-4 w-4 text-emerald-700" />}
                    title="Verified Payment"
                    primary={brief.payment.reference || 'Verified payment'}
                    secondary={`${brief.payment.type || 'Payment'} · ${formatMoney(brief.payment.amountPaid, brief.payment.currency)}`}
                    foot={brief.payment.verified ? `Verified ${formatDate(brief.payment.verifiedAt)}` : 'Payment verification is required'}
                  />
                  <SummaryCard
                    icon={<CheckCircle2 className="h-4 w-4 text-emerald-700" />}
                    title="Client Onboarding"
                    primary={brief.onboarding.status || 'Not available'}
                    secondary={`${brief.onboarding.responseCount} captured answers`}
                    foot={brief.onboarding.completed ? `Completed ${formatDate(brief.onboarding.completedAt)}` : 'Must be completed before handoff'}
                  />
                </section>

                <Section title="Customer & Business">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="Company" value={brief.customer?.companyName || 'Not recorded'} />
                    <Info label="Primary Contact" value={brief.customer?.primaryContact || 'Not recorded'} />
                    <Info label="Country" value={brief.customer?.country || 'Not recorded'} />
                    <Info label="Industry" value={brief.customer?.industry || 'Not recorded'} />
                  </div>
                </Section>

                <Section title="Why They Bought / Business Context">
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextFact label="Why the client bought" value={brief.businessContext?.whyClientBought} />
                    <TextFact label="Original problem" value={brief.businessContext?.originalProblem} />
                    <TextFact label="Business impact" value={brief.businessContext?.businessImpact} />
                    <TextFact label="Desired outcome" value={brief.businessContext?.desiredOutcome} />
                    <TextFact label="Target audience / users" value={brief.businessContext?.targetAudience || brief.onboarding.deliveryFacts?.targetAudience} />
                  </div>
                </Section>

                <Section title="Confirmed Sales Requirements" subtitle="Confirmed Structured Requirements come from canonical crm_requirements records. Legacy requirements_summary remains non-authoritative Delivery context.">
                  {brief.requirements.length === 0 ? <div className="space-y-4"><Empty>Confirmed structured Sales Requirements are missing. Resolve them in the CRM Requirements workflow.</Empty>{isSeller && <div className="rounded-xl border border-red-200 bg-red-50 p-4"><div className="text-xs font-black text-red-900">Legacy missing requirements remediation</div><p className="mt-1 text-[10px] leading-4 text-red-800">If this paid legacy project is missing its historical Sales summary, restore only factual requirements already gathered from the customer. This does not change the accepted quotation or add new commercial scope, and it does not replace the Part 13 structured Requirements blocker.</p><textarea value={requirementsDraft} onChange={event=>{setRequirementsDraft(event.target.value);setRequirementsSaved(false);}} rows={4} maxLength={10000} className="mt-3 w-full rounded-xl border border-red-200 bg-white p-3 text-xs leading-5 outline-none focus:border-red-400" placeholder="Restore the factual historical Sales requirements summary..." /><button type="button" onClick={()=>void restoreRequirements()} disabled={savingRequirements || requirementsDraft.trim().length < 20} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{savingRequirements ? <Loader2 className="h-4 w-4 animate-spin"/> : <FileText className="h-4 w-4"/>}Save Missing Sales Requirements</button>{requirementsSaved && <div className="mt-3 text-[10px] font-bold text-emerald-800">Legacy Sales summary restored. Resolve structured Requirements in CRM before Part 13 can become READY.</div>}</div>}</div> : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {brief.requirements.map((item: any) => (
                        <EvidenceCard key={item.id} title={item.title || item.key} badge={item.certainty || item.recordState} actionUrl={item.sourceUrl} navigate={navigate}>
                          <div className="whitespace-pre-wrap">{item.description || (item.structuredValue ? JSON.stringify(item.structuredValue) : 'Not applicable')}</div>
                          <div className="mt-2 text-[10px] text-slate-400">{item.category} · {item.sourceType || 'CRM'} · Updated {formatDate(item.updatedAt)}</div>
                        </EvidenceCard>
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Accepted Commercial Agreement" subtitle="Historical quotation snapshots win over current Sales Catalog values.">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <TextFact label="Scope Summary" value={brief.quotation.scopeSummary || brief.scopeSummary} />
                    <TextFact label="Explicit Exclusions" value={brief.quotation.exclusions || brief.exclusions} />
                    <TextFact label="Client Responsibilities" value={brief.quotation.clientResponsibilities} />
                    <TextFact label="Delivery Assumptions" value={brief.quotation.deliveryAssumptions} />
                    <TextFact label="Payment Terms" value={brief.quotation.paymentTerms} />
                    <TextFact label="Handover / Support" value={brief.quotation.handoverSupport} />
                  </div>
                  <div className="mt-4 space-y-3">
                    {(brief.quotation.items || []).map((item: any) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div><div className="text-sm font-black">{item.productName || item.productCode || 'Quoted item'}</div><div className="mt-1 text-xs leading-5 text-slate-600">{item.description || 'Accepted quotation item snapshot.'}</div></div>
                          <div className="text-xs font-black text-[#000080]">{item.quantity || 1} × {formatMoney(item.unitPrice, brief.quotation.currency)}</div>
                        </div>
                        {(item.durationMin || item.durationMax || item.timelineImpact) && <div className="mt-2 text-[10px] font-semibold text-slate-500">Timeline: {item.durationMin || '?'}–{item.durationMax || '?'} {item.durationUnit || ''} {item.timelineImpact ? `· ${item.timelineImpact}` : ''}</div>}
                      </div>
                    ))}
                  </div>
                  {brief.quotation.salesScopeSnapshotPresent ? <Notice tone="success">Part 10B immutable Sales-scope snapshot is attached to this accepted quotation under schema version {brief.quotation.salesScopeSnapshotSchemaVersion || 2}.</Notice> : <Notice tone="warning">This accepted quotation predates the Part 10B immutable scope snapshot. Delivery is using accepted quotation item snapshots plus current canonical Sales evidence; this is explicitly flagged by readiness.</Notice>}
                </Section>

                <Section title="Timeline">
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextFact label="Accepted quotation timeline" value={brief.quotation.durationSnapshotText} />
                    <ArraySummary label="Timeline validations" rows={brief.timeline?.timelineValidations || []} field="approvedConstraints" />
                    <ArraySummary label="Timeline promises" rows={brief.timeline?.timelinePromises || []} field="promise" />
                    <ArraySummary label="Timeline dependencies" rows={brief.timeline?.dependencies || []} field="condition" />
                  </div>
                </Section>

                <Section title="Technical / Commercial / Timeline / Compliance Validations">
                  {brief.validations.length === 0 ? <Empty>No current specialist Validation records apply.</Empty> : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {brief.validations.map((item: any) => <EvidenceCard key={item.id} title={item.subject || item.type} badge={item.stale ? 'STALE' : item.status} actionUrl={item.sourceUrl} navigate={navigate}>
                        <div>{item.decision || item.approvedConstraints || item.reworkReason || 'Review evidence is recorded in the canonical Validation.'}</div>
                        <div className="mt-2 text-[10px] text-slate-400">{item.type} · Severity {item.severity} · {item.reviewerTeam || 'Reviewer team'}</div>
                      </EvidenceCard>)}
                    </div>
                  )}
                </Section>

                <Section title="Promise Register">
                  {brief.promises.length === 0 ? <Empty>No active material Sales Promises are recorded.</Empty> : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {brief.promises.map((item: any) => <EvidenceCard key={item.id} title={item.type || 'Promise'} badge={item.validationState} actionUrl={item.sourceUrl} navigate={navigate}>
                        <div>{item.promise}</div>
                        {item.sourceSummary && <div className="mt-2 text-[10px] text-slate-400">{item.sourceSummary}</div>}
                      </EvidenceCard>)}
                    </div>
                  )}
                </Section>

                <Section title="Assumptions / Exclusions / Dependencies">
                  {brief.scopeConditions.length === 0 ? <Empty>No active material Scope Conditions are recorded.</Empty> : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {brief.scopeConditions.map((item: any) => <EvidenceCard key={item.id} title={item.title || item.type} badge={`${item.type} · ${item.state}`} actionUrl={item.sourceUrl} navigate={navigate}>
                        <div>{item.condition}</div>
                        <div className="mt-2 text-[10px] text-slate-400">Validation: {item.validationState || 'NOT_REQUIRED'}</div>
                      </EvidenceCard>)}
                    </div>
                  )}
                </Section>

                <Section title="Payment & Client Onboarding">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <SummaryCard icon={<CreditCard className="h-4 w-4 text-emerald-700" />} title="Canonical Payment" primary={brief.payment.verified ? 'Verified' : 'Not Verified'} secondary={`${brief.payment.type || 'Payment'} · ${formatMoney(brief.payment.amountPaid, brief.payment.currency)}`} foot={formatDate(brief.payment.verifiedAt)} />
                    <SummaryCard icon={<UserRoundCheck className="h-4 w-4 text-blue-700" />} title="Canonical Onboarding" primary={brief.onboarding.completed ? 'Completed' : brief.onboarding.status || 'Pending'} secondary={`${brief.onboarding.responseCount} delivery facts captured`} foot={formatDate(brief.onboarding.completedAt)} />
                  </div>
                  {deliveryFacts.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">{deliveryFacts.map(([key, value]) => <TextFact key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase())} value={String(value || '')} />)}</div>}
                  <p className="mt-4 text-[10px] leading-4 text-slate-400">Access tokens, passwords, private keys, payment-provider identifiers and private onboarding secrets are intentionally not exposed in this handoff view.</p>
                </Section>

                <Section title="Outstanding Delivery Dependencies">
                  {brief.outstandingDeliveryDependencies.length === 0 ? <Empty>No current canonical Delivery dependency is listed.</Empty> : (
                    <div className="space-y-2">
                      {brief.outstandingDeliveryDependencies.map((item: any, index) => <div key={item.sourceId || index} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950"><div className="font-black">{item.label || item.type || 'Dependency'}</div><div className="mt-1 leading-5">{item.detail || 'Resolve/track this dependency in its canonical source.'}</div>{item.actionUrl && <button type="button" onClick={() => navigate(item.actionUrl)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-[#000080]">Open source <ExternalLink className="h-3 w-3" /></button>}</div>)}
                    </div>
                  )}
                </Section>

                <Section title="Seller Final Notes" subtitle="Additional Sales commitments / exceptions — these notes supplement canonical facts; they cannot override Requirements, quotation, payment, onboarding, Validations, Promises or Scope Conditions. Requirements and client onboarding are not repeated in production. Leave blank when there is nothing additional. Sales confirms requirements before the quotation, and after Delivery acceptance production starts directly with Content.">
                  <textarea
                    value={notes}
                    onChange={event => { setNotes(event.target.value); setError(''); setSuccess(''); }}
                    rows={5}
                    maxLength={10000}
                    disabled={!isSeller || !brief.canSubmit}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Optional: only final Sales context not already captured at an authoritative source..."
                  />
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400"><span>Resolve returned issues at their canonical source before resubmitting.</span><span className="font-bold">{notes.length.toLocaleString()} / 10,000</span></div>
                </Section>

                <Section title="Review History" subtitle="Every submission/review attempt remains auditable. Accepted rows retain stable canonical source references, version timestamps and fingerprints.">
                  {brief.history.length === 0 ? <Empty>No handoff attempt has been submitted yet.</Empty> : (
                    <div className="space-y-3">
                      {brief.history.map(attempt => <article key={attempt.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-black">Attempt #{attempt.attemptNumber} · {lifecycleLabel(attempt.status)}</div><div className="mt-1 text-[10px] text-slate-500">Submitted {formatDate(attempt.submittedAt)} by {attempt.submittedByName || 'Seller'}{attempt.reviewedAt ? ` · Reviewed ${formatDate(attempt.reviewedAt)} by ${attempt.reviewedByName || 'Delivery'}` : ''}</div></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${lifecycleClasses(attempt.status)}`}>{lifecycleLabel(attempt.status)}</span></div>
                        {attempt.returnNotes && <div className="mt-3 text-xs leading-5 text-slate-700">{attempt.returnNotes}</div>}
                      </article>)}
                    </div>
                  )}
                </Section>

                {isPendingReview && brief.canReturn && (
                  <section className="rounded-2xl border border-red-200 bg-red-50 p-5" aria-labelledby="return-form-title">
                    <h2 id="return-form-title" className="text-sm font-black text-red-950">Return to Sales</h2>
                    <p className="mt-1 text-xs leading-5 text-red-800">Use actionable structured reasons. Do not use vague feedback such as “fix this.”</p>
                    <fieldset className="mt-4">
                      <legend className="text-[10px] font-black uppercase tracking-wider text-red-800">Reason categories</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {SALES_HANDOFF_RETURN_REASONS.map(reason => <label key={reason} className="flex cursor-pointer items-center gap-2 rounded-xl border border-red-200 bg-white p-3 text-xs font-semibold text-slate-700"><input type="checkbox" checked={returnReasons.includes(reason)} onChange={() => toggleReason(reason)} className="h-4 w-4" />{RETURN_REASON_LABELS[reason]}</label>)}
                      </div>
                    </fieldset>
                    <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-red-800" htmlFor="handoff-missing-items">Missing / action items · one per line</label>
                    <textarea id="handoff-missing-items" value={missingItemsText} onChange={event => setMissingItemsText(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-red-200 bg-white p-3 text-xs leading-5 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder={"Clarify authentication roles in Requirements\nResolve timeline Validation\nConfirm client-owned content dependency"} />
                    <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-red-800" htmlFor="handoff-review-note">Reviewer note</label>
                    <textarea id="handoff-review-note" value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-red-200 bg-white p-3 text-xs leading-5 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder="Explain what Sales must resolve at the authoritative source and what Delivery needs to see on resubmission." />
                    <button type="button" onClick={() => void returnToSales()} disabled={saving || returnReasons.length===0 || missingItemsText.trim().length===0 || reviewNotes.trim().length<10} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><XCircle className="h-4 w-4" /> Return to Sales</button>
                  </section>
                )}

                {error && <Notice tone="error">{error}</Notice>}
                {success && <Notice tone="success">{success}</Notice>}

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Server-authoritative lifecycle. Generic task completion cannot bypass Delivery acceptance.</div>
                  <div className="flex flex-wrap gap-2">
                    {isSeller && brief.canSubmit && <button type="button" title="Send Client Brief to Project Manager" onClick={() => void submit()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{brief.lifecycleStatus === 'RETURNED_TO_SALES' || (brief.lifecycleStatus === 'ACCEPTED' && brief.sourceDrift) ? 'Resubmit to Delivery' : 'Send to Delivery'}</button>}
                    {brief.canAccept && <button type="button" onClick={() => void accept()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-xs font-black text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Accept Handoff</button>}
                    {!brief.canSubmit && !brief.canAccept && !brief.canReturn && <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-black text-slate-500">{brief.lifecycleStatus === 'ACCEPTED' ? 'Delivery accepted' : brief.lifecycleStatus === 'RETURNED_TO_SALES' ? 'Sales correction required' : isPendingReview ? 'Waiting for Delivery review' : 'Read-only handoff state'}</span>}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function ReadinessPanel({ brief, navigate }: { brief: SalesHandoffBrief; navigate: ReturnType<typeof useNavigate> }) {
  const readiness = brief.readiness;
  const tone = readiness.status === 'BLOCKED' ? 'border-red-200 bg-red-50' : readiness.status === 'WARNING' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50';
  const text = readiness.status === 'BLOCKED' ? 'text-red-950' : readiness.status === 'WARNING' ? 'text-amber-950' : 'text-emerald-950';
  return <section className={`rounded-2xl border p-5 ${tone}`} aria-labelledby="handoff-readiness-title">
    <div className="flex items-start gap-3">{readiness.status === 'READY' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" /> : <AlertTriangle className={`mt-0.5 h-5 w-5 ${readiness.status === 'BLOCKED' ? 'text-red-700' : 'text-amber-700'}`} />}<div className="min-w-0 flex-1"><h2 id="handoff-readiness-title" className={`text-sm font-black ${text}`}>Handoff Readiness: {readiness.status}</h2><p className="mt-1 text-xs leading-5 opacity-80">Hard blockers cannot be overridden by a numeric score or frontend button. Warnings remain visible to Delivery.</p></div></div>
    {(readiness.blockers || []).length > 0 && <div className="mt-4 space-y-2">{readiness.blockers.map((issue, index) => <IssueRow key={`${issue.code}-${index}`} issue={issue} navigate={navigate} tone="error" />)}</div>}
    {(readiness.warnings || []).length > 0 && <div className="mt-4 space-y-2">{readiness.warnings.map((issue, index) => <IssueRow key={`${issue.code}-${index}`} issue={issue} navigate={navigate} tone="warning" />)}</div>}
  </section>;
}

function IssueRow({ issue, navigate, tone }: { issue: any; navigate: ReturnType<typeof useNavigate>; tone: 'error' | 'warning' }) {
  return <div className="flex flex-col gap-2 rounded-xl border border-white/70 bg-white/80 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><div><div className={`font-black ${tone === 'error' ? 'text-red-800' : 'text-amber-800'}`}>{issue.code?.replaceAll('_',' ') || 'Readiness issue'}</div><div className="mt-1 leading-5 text-slate-700">{issue.message}</div></div>{issue.actionUrl && <button type="button" onClick={() => navigate(issue.actionUrl)} className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black text-[#000080]">Resolve at source <ExternalLink className="h-3 w-3" /></button>}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 break-words text-sm font-black text-slate-800">{value}</div></div>;
}

function SummaryCard({ icon, title, primary, secondary, foot }: { icon: React.ReactNode; title: string; primary: string; secondary: string; foot: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{icon}{title}</div><div className="mt-3 text-sm font-black text-slate-900">{primary}</div><div className="mt-1 text-xs font-bold text-slate-600">{secondary}</div><div className="mt-3 text-[10px] text-slate-400">{foot}</div></div>;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4"><h2 className="text-sm font-black">{title}</h2>{subtitle && <p className="mt-1 text-[10px] leading-4 text-slate-500">{subtitle}</p>}</div>{children}</section>;
}

function TextFact({ label, value }: { label: string; value?: string | null }) {
  const shown=String(value || '').trim();
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-2 whitespace-pre-wrap text-xs leading-5 ${shown ? 'text-slate-700' : 'text-slate-400'}`}>{shown || 'Not recorded in the current authoritative source.'}</div></div>;
}

function ArraySummary({ label, rows, field }: { label: string; rows: any[]; field: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div>{rows.length===0 ? <div className="mt-2 text-xs text-slate-400">None recorded.</div> : <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-700">{rows.map((row,index)=><li key={row.id || index}>• {row[field] || row.subject || row.title || row.type || 'Recorded evidence'}</li>)}</ul>}</div>;
}

function EvidenceCard({ title, badge, actionUrl, navigate, children }: { title: string; badge?: string; actionUrl?: string; navigate: ReturnType<typeof useNavigate>; children: React.ReactNode }) {
  return <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div className="text-xs font-black text-slate-900">{title}</div>{badge && <span className="rounded-full bg-white px-2 py-1 text-[8px] font-black uppercase text-slate-600">{badge.replaceAll('_',' ')}</span>}</div><div className="mt-2 text-xs leading-5 text-slate-700">{children}</div>{actionUrl && <button type="button" onClick={()=>navigate(actionUrl)} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-[#000080]">Verify source <ExternalLink className="h-3 w-3" /></button>}</article>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">{children}</div>;
}

function Notice({ tone, children }: { tone: 'error' | 'warning' | 'success'; children: React.ReactNode }) {
  const cls = tone==='error' ? 'border-red-200 bg-red-50 text-red-800' : tone==='warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  const Icon = tone==='success' ? CheckCircle2 : tone==='warning' ? AlertTriangle : XCircle;
  return <div className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold leading-5 ${cls}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" />{children}</div>;
}
