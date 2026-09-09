import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { crmSalesReadinessService, CRMSalesGateAssessment, CRMReadinessAction, CRMReadinessIssue } from '../../../lib/crmSalesReadinessService';
import SellerGuidanceHelp from './SellerGuidanceHelp';
import { getSellerGuidance } from '../../../lib/crmSellerGuidance';

type Props = { leadId?: string; opportunityId?: string; refreshKey?: string };

const statusTone = (status?: string) => {
  if (status === 'PASS' || status === 'READY') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'WARNING') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-700';
};

function navigateAction(action?: CRMReadinessAction) {
  if (!action) return;
  window.dispatchEvent(new CustomEvent('crm-readiness-navigate', { detail: { target: action.target, requirementKey: action.requirementKey } }));
}

function IssueList({ title, issues, blocked }: { title: string; issues: CRMReadinessIssue[]; blocked?: boolean }) {
  if (!issues.length) return null;
  return <div className={`rounded-xl border p-3 ${blocked ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
    <div className="flex items-center gap-2 text-xs font-black text-slate-900">{blocked ? <AlertTriangle className="h-4 w-4 text-rose-600" /> : <CircleHelp className="h-4 w-4 text-amber-700" />}{title}</div>
    <ul className="mt-2 space-y-2">
      {issues.map((issue, index) => <li key={`${issue.code}-${index}`} className="rounded-lg bg-white/80 p-2.5 text-xs text-slate-700">
        <div className="font-semibold leading-5">{issue.message}</div>
        {issue.action && <button type="button" onClick={() => navigateAction(issue.action)} className="mt-1.5 min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-[#000080] hover:border-[#000080] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]">{issue.action.label}</button>}
      </li>)}
    </ul>
  </div>;
}

function AssessmentCard({ title, subtitle, assessment, guidanceKey, proposal }: { title: string; subtitle: string; assessment: CRMSalesGateAssessment; guidanceKey: string; proposal?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={title}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><ShieldCheck className="h-4 w-4" />{title}<SellerGuidanceHelp guidance={getSellerGuidance(guidanceKey)} /></div>
        <p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusTone(assessment.status)}`} aria-label={`${title} status ${assessment.status}`}>{assessment.status}</span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-600">{assessment.score}% current coverage</span>
      </div>
    </div>

    <button type="button" onClick={() => setExpanded(value => !value)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-black text-[#000080] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]" aria-expanded={expanded}>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{expanded ? 'Hide details' : 'Show details'}</button>

    {expanded && <div className="mt-3 space-y-3">
      <IssueList title="Hard blockers" issues={assessment.blockers} blocked />
      <IssueList title="Warnings" issues={assessment.warnings} />
      {assessment.approvedConstraints.length > 0 && <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
        <div className="text-xs font-black text-[#000080]">Approved specialist constraints</div>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-700">{assessment.approvedConstraints.map(item => <li key={`${item.validationId}-${item.validationType}`}><span className="font-black">{item.validationType.replaceAll('_', ' ')}:</span> {item.constraints}</li>)}</ul>
      </div>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {assessment.dimensions.map(item => <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{item.label}</div><div className="mt-1 text-xs font-black text-slate-900">{item.status}</div>{item.required != null && <div className="mt-1 text-[11px] text-slate-500">{item.resolved || 0} of {item.required} resolved</div>}</div>)}
      </div>
      {proposal && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-black text-slate-900">Future workflow coverage</div>
        <p className="mt-1 text-[11px] leading-5 text-slate-600">This is a pre-quotation assessment. The final quotation-send gate is not active in Part 8.</p>
        <ul className="mt-2 space-y-1 text-[11px] text-slate-600">{assessment.futureDimensions.map(item => <li key={item.key}>{item.key.replaceAll('_', ' ')} — <span className="font-black">{item.status}</span></li>)}</ul>
      </div>}
      {assessment.blockers.length === 0 && assessment.warnings.length === 0 && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />No current blocker is reported for this assessment.</div>}
    </div>}
  </section>;
}

export default function CRMSalesReadinessPanel({ leadId, opportunityId, refreshKey }: Props) {
  const [resolvedOpportunityId, setResolvedOpportunityId] = useState<string | null>(opportunityId || null);
  const [requirements, setRequirements] = useState<CRMSalesGateAssessment | null>(null);
  const [proposal, setProposal] = useState<CRMSalesGateAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try {
      const id = opportunityId || (leadId ? await crmSalesReadinessService.resolveOpportunityId(leadId) : null);
      setResolvedOpportunityId(id);
      if (!id) { setRequirements(null); setProposal(null); return; }
      const [requirementsResult, proposalResult] = await Promise.all([
        crmSalesReadinessService.assess(id, 'REQUIREMENTS_CONFIRMED'),
        crmSalesReadinessService.assess(id, 'PROPOSAL_READINESS'),
      ]);
      setRequirements(requirementsResult); setProposal(proposalResult);
    } catch { setError('Sales readiness could not be loaded. Refresh the current CRM information and try again.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [leadId, opportunityId]);

  useEffect(() => { void load(false); }, [load, refreshKey]);
  const evaluated = useMemo(() => requirements?.evaluatedAt || proposal?.evaluatedAt, [requirements, proposal]);

  if (loading) return <div className="flex min-h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white" aria-live="polite"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /><span className="sr-only">Loading Sales readiness</span></div>;
  if (!resolvedOpportunityId) return <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600"><div className="font-black text-slate-900">Sales readiness</div><p className="mt-1">Readiness becomes available after this Lead is connected to an Opportunity.</p></section>;
  if (error) return <section className="rounded-2xl border border-rose-200 bg-white p-4" role="alert"><div className="flex items-center gap-2 text-xs font-black text-rose-700"><AlertTriangle className="h-4 w-4" />Sales readiness unavailable</div><p className="mt-1 text-xs text-slate-500">{error}</p><button type="button" onClick={() => void load(true)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#000080] px-3 text-xs font-black text-white"><RefreshCw className="h-4 w-4" />Retry</button></section>;

  return <div className="space-y-3" data-crm-sales-readiness>
    <div className="flex items-center justify-end gap-2 text-[10px] text-slate-400">{evaluated && <span>Current assessment · {new Date(evaluated).toLocaleString()}</span>}<button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 font-black text-[#000080] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button></div>
    {requirements && <AssessmentCard title="Requirements Confirmed" subtitle="Structured server-side readiness for entering Requirements Confirmed. A written summary alone cannot satisfy this gate." assessment={requirements} guidanceKey="section.requirements_confirmed_readiness" />}
    {proposal && <AssessmentCard title="Proposal Readiness" subtitle="Pre-quotation assessment of current discovery, scope, Package Fit, specialist review and next-action readiness." assessment={proposal} guidanceKey="section.proposal_readiness" proposal />}
  </div>;
}
