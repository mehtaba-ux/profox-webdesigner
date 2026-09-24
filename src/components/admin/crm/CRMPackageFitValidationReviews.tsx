import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CircleAlert, Loader2, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import type { CRMPackageFitAssessment, CRMPackageFitTrace } from '../../../lib/crmPackageFitService';
import {
  CRMSalesValidation,
  CRMSalesValidationType,
  CRMSalesValidationWorkspace,
  crmSalesValidationService,
} from '../../../lib/crmSalesValidationService';
import { getSalesValidationGuidance } from '../../../lib/crmSalesValidationGuidance';
import SellerGuidanceHelp from './SellerGuidanceHelp';

type Props = {
  leadId: string;
  opportunityId?: string | null;
  assessment: CRMPackageFitAssessment;
  onChanged?: () => void;
};

const typeLabel: Record<CRMSalesValidationType, string> = {
  TECHNICAL: 'Technical', COMMERCIAL: 'Commercial', TIMELINE: 'Timeline', COMPLIANCE_RISK: 'Compliance / Risk', SCOPE: 'Scope',
};

const inferType = (signal: CRMPackageFitTrace): CRMSalesValidationType => {
  const key = `${signal.requirementKey || ''} ${signal.code || ''}`.toLowerCase();
  if (/compliance|privacy|security|accessibility|risk/.test(key)) return 'COMPLIANCE_RISK';
  if (/timeline|deadline|delivery/.test(key)) return 'TIMELINE';
  if (/scope|migration|package/.test(key)) return 'SCOPE';
  return 'TECHNICAL';
};

const latestForSignal = (workspace: CRMSalesValidationWorkspace | null, signal: CRMPackageFitTrace) => {
  if (!workspace) return null;
  const requirementMatches = signal.requirementId
    ? workspace.validations.filter(v => v.requirementId === signal.requirementId)
    : [];
  const packageMatches = workspace.validations.filter(v => v.sourceType === 'PACKAGE_FIT' && v.sourceKey === `package-fit:${signal.code}`);
  return [...requirementMatches, ...packageMatches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
};

export default function CRMPackageFitValidationReviews({ leadId, opportunityId, assessment, onChanged }: Props) {
  const [workspace, setWorkspace] = useState<CRMSalesValidationWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setWorkspace(await crmSalesValidationService.getWorkspace(leadId, opportunityId)); }
    catch { setError('Review status could not be loaded.'); }
    finally { setLoading(false); }
  }, [leadId, opportunityId]);

  useEffect(() => { void load(); }, [load, assessment.evaluatedAt]);

  const signals = assessment.validationSignals || [];
  const specialCatalogSignals = useMemo(() => {
    const result: Array<{ code: string; type: CRMSalesValidationType; title: string; message: string }> = [];
    if (assessment.managerApprovalRequired && assessment.recommendedProduct) result.push({
      code: `manager-approval:${assessment.recommendedProduct.code}`,
      type: 'COMMERCIAL',
      title: `Review ${assessment.recommendedProduct.name} pre-proposal commercial requirement`,
      message: 'The current catalog marks this product as requiring manager approval. Part 7 review is pre-proposal only; any quotation-specific approval still uses the existing Quotation Approval workflow.',
    });
    if (assessment.timelineAssessmentRequired && assessment.recommendedProduct) result.push({
      code: `timeline-assessment:${assessment.recommendedProduct.code}`,
      type: 'TIMELINE',
      title: `Assess ${assessment.recommendedProduct.name} delivery timing`,
      message: 'The live catalog marks timeline impact as assessment required. A requested date is not an approved delivery commitment until the specific timing question is reviewed.',
    });
    return result;
  }, [assessment]);

  const requestSignal = async (signal: CRMPackageFitTrace) => {
    const type = inferType(signal);
    const key = `signal:${signal.code}`;
    setBusyKey(key); setError('');
    try {
      await crmSalesValidationService.request({
        leadId,
        opportunityId,
        requirementId: signal.requirementId || null,
        productId: assessment.recommendedProduct?.id || null,
        validationType: type,
        subject: `Review Package Fit signal: ${signal.requirementKey || signal.code}`,
        requestContext: signal.message,
        sourceType: signal.requirementId ? 'REQUIREMENT' : 'PACKAGE_FIT',
        sourceKey: signal.requirementId ? `requirement:${signal.requirementId}` : `package-fit:${signal.code}`,
      });
      await load(); onChanged?.();
    } catch (err: any) { setError(err?.message || 'The review request could not be created.'); }
    finally { setBusyKey(''); }
  };

  const requestCatalog = async (item: (typeof specialCatalogSignals)[number]) => {
    if (!assessment.recommendedProduct) return;
    setBusyKey(item.code); setError('');
    try {
      await crmSalesValidationService.request({
        leadId, opportunityId, productId: assessment.recommendedProduct.id, validationType: item.type,
        subject: item.title, requestContext: item.message, sourceType: 'PACKAGE_FIT', sourceKey: `package-fit:${item.code}`,
      });
      await load(); onChanged?.();
    } catch (err: any) { setError(err?.message || 'The review request could not be created.'); }
    finally { setBusyKey(''); }
  };

  if (!signals.length && !specialCatalogSignals.length) return null;

  return <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4" aria-label="Package Fit specialist validation reviews">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-black text-amber-900"><ShieldCheck className="h-4 w-4" />Specialist review status<SellerGuidanceHelp guidance={getSalesValidationGuidance('section.sales_validation')} /></div><p className="mt-1 text-[10px] leading-4 text-amber-800">Package Fit remains deterministic and read-only. Reviews are created only when you explicitly request one; approval resolves the validation question, not the underlying package classification.</p></div>{loading && <Loader2 className="h-4 w-4 animate-spin text-amber-700" />}</div>
    {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] font-bold text-rose-700" role="alert">{error}</div>}
    <div className="mt-3 space-y-2">
      {signals.map(signal => {
        const current = latestForSignal(workspace, signal);
        const inferred = inferType(signal);
        return <ReviewRow key={`${signal.code}-${signal.requirementId || 'signal'}`} title={`${typeLabel[inferred]} validation required`} message={signal.message} validation={current} busy={busyKey === `signal:${signal.code}`} onRequest={() => void requestSignal(signal)} />;
      })}
      {specialCatalogSignals.map(item => {
        const current = workspace?.validations.filter(v => v.sourceType === 'PACKAGE_FIT' && v.sourceKey === `package-fit:${item.code}`).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
        return <ReviewRow key={item.code} title={item.title} message={item.message} validation={current} busy={busyKey===item.code} onRequest={() => void requestCatalog(item)} />;
      })}
    </div>
  </section>;
}

function ReviewRow({ title, message, validation, busy, onRequest }: { title: string; message: string; validation: CRMSalesValidation | null; busy: boolean; onRequest: () => void }) {
  const unresolved = validation && ['PENDING','IN_REVIEW','NEEDS_INFORMATION'].includes(validation.status);
  const canFresh = validation?.status === 'STALE';
  const tone = validation?.status === 'APPROVED' ? 'border-emerald-200 bg-emerald-50' : validation?.status === 'REJECTED' || validation?.status === 'STALE' ? 'border-rose-200 bg-rose-50' : 'border-amber-100 bg-white';
  return <div className={`rounded-xl border p-3 ${tone}`}><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2 text-[10px] font-black text-slate-900">{validation?.status === 'APPROVED' ? <BadgeCheck className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-amber-700" />}{title}</div><p className="mt-1 break-words text-[10px] leading-4 text-slate-600">{message}</p>{validation && <div className="mt-2 text-[9px] font-black uppercase tracking-wide text-slate-500">{validation.validationType.replaceAll('_',' ')} · {validation.severity} · {validation.status.replaceAll('_',' ')} · {validation.assignedReviewerName || validation.reviewerTeam.replaceAll('_',' ')}</div>}{validation?.informationRequested && <p className="mt-2 text-[10px] leading-4 text-amber-800"><strong>Needs clarification:</strong> {validation.informationRequested}</p>}{validation?.approvedConstraints && <p className="mt-2 text-[10px] leading-4 text-emerald-800"><strong>Approved constraints:</strong> {validation.approvedConstraints}</p>}{validation?.rejectionReworkReason && <p className="mt-2 text-[10px] leading-4 text-rose-800"><strong>Rework reason:</strong> {validation.rejectionReworkReason}</p>}</div><div className="shrink-0">{!validation || canFresh ? <button type="button" disabled={busy} onClick={onRequest} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#000080] px-3 text-[9px] font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : canFresh ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}{canFresh ? 'Request Fresh Review' : 'Request Review'}</button> : unresolved ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[9px] font-black text-[#000080]">Review already open</span> : <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black text-slate-600">{validation.status.replaceAll('_',' ')}</span>}</div></div></div>;
}
