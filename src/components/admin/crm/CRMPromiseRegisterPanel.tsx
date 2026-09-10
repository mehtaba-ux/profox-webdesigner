import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleAlert, FileText, History, Link, Loader2, ShieldCheck } from 'lucide-react';
import SellerGuidanceHelp from './SellerGuidanceHelp';
import { getSellerGuidance } from '../../../lib/crmSellerGuidance';
import '../../../lib/crmSalesScopeCommitmentGuidance';
import {
  crmSalesScopeCommitmentService,
  CRMPromiseType,
  CRMSalesPromise,
  CRMSalesScopeCommitmentWorkspace,
  CRMValidationAlignment,
} from '../../../lib/crmSalesScopeCommitmentService';

type Props = { workspace: CRMSalesScopeCommitmentWorkspace; onChanged: (message: string) => Promise<void> | void };
type Draft = {
  id?: string; promiseType: CRMPromiseType; promiseText: string; internalContext: string;
  sourceType: CRMSalesPromise['sourceType']; sourceRecordId: string; sourceMeetingId: string; sourceSummary: string;
  linkedRequirementId: string; linkedValidationId: string; alignment: CRMValidationAlignment;
};
const emptyDraft = (): Draft => ({ promiseType: 'SCOPE', promiseText: '', internalContext: '', sourceType: 'INTERNAL_DRAFT', sourceRecordId: '', sourceMeetingId: '', sourceSummary: '', linkedRequirementId: '', linkedValidationId: '', alignment: 'NOT_REQUIRED' });
const PROMISE_TYPES: CRMPromiseType[] = ['SCOPE','TECHNICAL','TIMELINE','COMMERCIAL','SUPPORT','COMPLIANCE','PERFORMANCE_RESULT','OTHER'];
const SOURCE_TYPES: Array<{ value: CRMSalesPromise['sourceType']; label: string }> = [
  { value: 'INTERNAL_DRAFT', label: 'Internal draft / not yet communicated' },
  { value: 'MANUAL_CLIENT_COMMUNICATION', label: 'Manual documented client communication' },
  { value: 'MEETING', label: 'Sales meeting' },
  { value: 'REQUIREMENT', label: 'Requirement context + documented communication' },
  { value: 'VALIDATION', label: 'Validation context + documented communication' },
];
const tone: Record<string, string> = { ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-700', DRAFT: 'border-slate-200 bg-slate-50 text-slate-600', SUPERSEDED: 'border-slate-200 bg-slate-100 text-slate-500', WITHDRAWN: 'border-slate-200 bg-slate-100 text-slate-500' };
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';

export default function CRMPromiseRegisterPanel({ workspace, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const current = useMemo(() => workspace.promises.filter(item => ['ACTIVE','DRAFT'].includes(item.recordState)), [workspace.promises]);
  const history = useMemo(() => workspace.promises.filter(item => ['SUPERSEDED','WITHDRAWN'].includes(item.recordState)), [workspace.promises]);
  const assessment = workspace.assessment?.promises;

  const mutate = async (key: string, task: () => Promise<unknown>, message: string) => {
    setBusy(key); setError('');
    try { await task(); setDraft(null); await onChanged(message); }
    catch (e) { setError(e instanceof Error ? e.message : 'The Promise action could not be completed.'); }
    finally { setBusy(''); }
  };
  const editDraft = (item: CRMSalesPromise) => setDraft({
    id: item.id, promiseType: item.promiseType, promiseText: item.promiseText, internalContext: item.internalContext || '', sourceType: item.sourceType,
    sourceRecordId: item.sourceRecordId || '', sourceMeetingId: item.sourceMeetingId || '', sourceSummary: item.sourceSummary || '',
    linkedRequirementId: item.linkedRequirementId || '', linkedValidationId: item.linkedValidationId || '', alignment: item.validationAlignmentStatus,
  });
  const saveDraft = async () => {
    if (!draft) return;
    await mutate(`save:${draft.id || 'new'}`, () => crmSalesScopeCommitmentService.savePromiseDraft({
      promiseId: draft.id, leadId: workspace.leadId, opportunityId: workspace.opportunityId, promiseType: draft.promiseType, promiseText: draft.promiseText,
      internalContext: draft.internalContext || null, sourceType: draft.sourceType, sourceRecordId: draft.sourceRecordId || null,
      sourceMeetingId: draft.sourceMeetingId || null, sourceSummary: draft.sourceSummary || null, linkedRequirementId: draft.linkedRequirementId || null,
      linkedValidationId: draft.linkedValidationId || null, validationAlignmentStatus: draft.linkedValidationId ? draft.alignment : 'NOT_REQUIRED',
    }), draft.id ? 'Promise draft updated.' : 'Promise draft saved.');
  };
  const recordActive = async (item: CRMSalesPromise) => {
    const communicated = window.confirm('Did ProFox actually communicate this commitment to the client?\n\nChoose OK only if the commitment was actually communicated. A client request, Seller hypothesis, Package Fit recommendation, or internal idea is not a Promise.');
    if (!communicated) return;
    if (!window.confirm('Record this as an ACTIVE Promise? The wording and actor/time become history-protected. If approval is missing, the commitment will remain visible as an unapproved blocker rather than being hidden.')) return;
    await mutate(`activate:${item.id}`, () => crmSalesScopeCommitmentService.transitionPromise(item.id, 'ACTIVATE', true), 'Active Promise recorded.');
  };
  const revise = async (item: CRMSalesPromise) => {
    const wording = window.prompt('Revised exact/faithful commitment wording. The old Promise will remain Active until this revision is explicitly recorded.', item.promiseText);
    if (!wording || wording.trim() === item.promiseText.trim()) return;
    if (!window.confirm('Create a Draft Promise revision? This does not yet change the commitment recorded as Active.')) return;
    await mutate(`revise:${item.id}`, () => crmSalesScopeCommitmentService.revisePromise({
      promiseId: item.id, promiseText: wording, internalContext: item.internalContext, sourceType: item.sourceType, sourceRecordId: item.sourceRecordId,
      sourceMeetingId: item.sourceMeetingId, sourceSummary: item.sourceSummary, linkedRequirementId: item.linkedRequirementId,
      linkedValidationId: item.linkedValidationId, validationAlignmentStatus: item.linkedValidationId ? item.validationAlignmentStatus : 'NOT_REQUIRED',
    }), 'Promise revision draft created.');
  };
  const withdraw = async (item: CRMSalesPromise) => {
    const reason = window.prompt('Why is this Promise being withdrawn? The historical commitment will remain visible.'); if (!reason || reason.trim().length < 6) return;
    if (!window.confirm('Withdraw this Promise while preserving its historical wording and reason? This action does not claim the client accepted removal of the obligation.')) return;
    await mutate(`withdraw:${item.id}`, () => crmSalesScopeCommitmentService.transitionPromise(item.id, 'WITHDRAW', false, reason), 'Promise withdrawn with history preserved.');
  };
  const openValidation = () => {
    const element = document.getElementById('crm-sales-validation');
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.dispatchEvent(new CustomEvent('crm-readiness-navigate', { detail: { target: 'validation' } }));
  };
  const blockerFor = (id: string) => assessment?.blockers.filter(item => item.promiseId === id) || [];

  return <section id="crm-promise-register" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Promise Register">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Promise Register<SellerGuidanceHelp guidance={getSellerGuidance('section.promise_register')} /></div><p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-500">Material commitments ProFox actually communicated to the client. This register preserves commitment truth even when an internal approval is missing.</p></div>
      <div className="flex items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${assessment?.status === 'READY' || assessment?.status === 'NO_ACTIVE_PROMISES' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : assessment?.status === 'BLOCKED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{assessment?.status?.replaceAll('_',' ') || 'NO OPPORTUNITY'}</span><button type="button" onClick={() => setDraft(emptyDraft())} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-3 text-xs font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"><FileText className="h-4 w-4" />New Promise Draft</button></div>
    </div>

    <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Promise safety:</strong> Record what ProFox actually committed. Do not turn a client's request, your assumption, a Seller hypothesis, a Package Fit recommendation, or a proposed idea into a Promise.</span><SellerGuidanceHelp guidance={getSellerGuidance('section.promise_register')} /></div>
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">Zero Active Promises is legitimate. Do not invent a Promise to satisfy a count. <SellerGuidanceHelp guidance={getSellerGuidance('field.future_quote_coverage')} /></div>

    {error && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</div>}
    {assessment && (assessment.blockers.length > 0 || assessment.warnings.length > 0) && <div className="mt-4 space-y-2">{assessment.blockers.map((issue, index) => <div key={`${issue.code}-${index}`} className="rounded-xl border border-rose-200 bg-rose-50 p-3"><div className="flex items-start gap-2 text-xs font-black text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{issue.message}</div>{issue.approvedConstraints && <div className="mt-2 rounded-lg bg-white/70 p-2 text-[10px] text-slate-700"><strong>Approved constraints:</strong> {issue.approvedConstraints}</div>}{issue.action?.target === 'validation' && <button type="button" onClick={openValidation} className="mt-2 min-h-9 rounded-lg border border-rose-200 bg-white px-3 text-[10px] font-black text-[#000080]">Request / Open Validation</button>}</div>)}{assessment.warnings.map((issue, index) => <div key={`${issue.code}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">{issue.message}</div>)}</div>}

    {draft && <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/30 p-4"><div className="flex items-center gap-2 text-xs font-black text-slate-900"><FileText className="h-4 w-4 text-[#000080]" />{draft.id ? 'Edit Promise Draft' : 'Create Promise Draft'}<SellerGuidanceHelp guidance={getSellerGuidance('action.record_promise')} /></div><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-[10px] font-black text-slate-600">Promise Type <SellerGuidanceHelp guidance={getSellerGuidance('field.promise_type')} /><select value={draft.promiseType} onChange={e => setDraft({ ...draft, promiseType: e.target.value as CRMPromiseType })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs">{PROMISE_TYPES.map(type => <option key={type} value={type}>{type.replaceAll('_',' ')}</option>)}</select></label><label className="text-[10px] font-black text-slate-600">Source <SellerGuidanceHelp guidance={getSellerGuidance('field.promise_source')} /><select value={draft.sourceType} onChange={e => setDraft({ ...draft, sourceType: e.target.value as CRMSalesPromise['sourceType'], sourceMeetingId: e.target.value === 'MEETING' ? draft.sourceMeetingId : '' })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs">{SOURCE_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><label className="mt-3 block text-[10px] font-black text-slate-600">Exact / faithful commitment<textarea rows={4} value={draft.promiseText} onChange={e => setDraft({ ...draft, promiseText: e.target.value })} placeholder="Write what ProFox actually committed, or proposed internal wording if this remains a Draft." className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6" /></label><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-[10px] font-black text-slate-600">Linked Requirement<select value={draft.linkedRequirementId} onChange={e => setDraft({ ...draft, linkedRequirementId: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">None</option>{workspace.sourceRequirements.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="text-[10px] font-black text-slate-600">Linked Validation<select value={draft.linkedValidationId} onChange={e => setDraft({ ...draft, linkedValidationId: e.target.value, alignment: e.target.value ? 'PENDING' : 'NOT_REQUIRED' })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">None</option>{workspace.validations.map(item => <option key={item.id} value={item.id}>{item.validationType} · {item.status} · {item.subject}</option>)}</select></label><label className="text-[10px] font-black text-slate-600">Source Meeting<select disabled={draft.sourceType !== 'MEETING'} value={draft.sourceMeetingId} onChange={e => setDraft({ ...draft, sourceMeetingId: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs disabled:bg-slate-100"><option value="">None</option>{workspace.meetings.filter(item => item.status === 'Completed').map(item => <option key={item.id} value={item.id}>{item.title} · {fmt(item.startAt)}</option>)}</select></label></div>{draft.linkedValidationId && <label className="mt-3 block text-[10px] font-black text-slate-600">Promise vs approved constraints<select value={draft.alignment} onChange={e => setDraft({ ...draft, alignment: e.target.value as CRMValidationAlignment })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="PENDING">Needs human reconciliation</option><option value="WITHIN_CONSTRAINTS">Promise is within approved constraints</option><option value="CONFLICT">Promise wording conflicts / must be revised</option></select></label>}<label className="mt-3 block text-[10px] font-black text-slate-600">Where / when was this communicated?<textarea rows={2} value={draft.sourceSummary} onChange={e => setDraft({ ...draft, sourceSummary: e.target.value })} placeholder={draft.sourceType === 'INTERNAL_DRAFT' ? 'Internal draft context only — not evidence of client communication.' : 'Describe the client communication source in plain language.'} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs" /></label><label className="mt-3 block text-[10px] font-black text-slate-600">Internal context<textarea rows={2} value={draft.internalContext} onChange={e => setDraft({ ...draft, internalContext: e.target.value })} placeholder="Optional internal context. Never store secrets or credentials." className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs" /></label><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">Cancel</button><button type="button" disabled={busy.startsWith('save:')} onClick={() => void saveDraft()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy.startsWith('save:') ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Save Draft</button></div></div>}

    <div className="mt-5"><h4 className="text-xs font-black text-slate-900">Current Promises and drafts</h4>{current.length === 0 ? <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No Active or Draft Promises recorded. This is valid when there is no material additional commitment.</div> : <div className="mt-3 space-y-2">{current.map(item => { const blockers = blockerFor(item.id); const unapproved = blockers.some(issue => issue.code.includes('UNAPPROVED') || issue.code.includes('VALIDATION')); return <article key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{item.promiseType.replaceAll('_',' ')}</div><p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-6 text-slate-900">{item.promiseText}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${tone[item.recordState]}`}>{item.recordState}</span></div>{item.recordState === 'ACTIVE' && <div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600"><strong>Promised by:</strong> {item.promisedByName || 'Recorded Seller'}<br/><strong>Promised at:</strong> {fmt(item.promisedAt)}</div><div className="rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600"><strong>Source:</strong> {item.sourceMeetingTitle || item.sourceSummary || item.sourceType.replaceAll('_',' ')}<br/><strong>Future Quote Coverage:</strong> {item.futureQuoteCoverage || 'NOT_YET_EVALUATED'}</div></div>}{item.linkedValidationId && <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2 text-[10px] text-slate-700"><strong>Validation:</strong> {item.linkedValidationType} · {item.linkedValidationStatus} · alignment {item.validationAlignmentStatus}{item.approvedConstraints && <><br/><strong>Approved constraints:</strong> {item.approvedConstraints}</>}</div>}{item.recordState === 'ACTIVE' && unapproved && <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[10px] font-black text-rose-700">UNAPPROVED COMMITMENT / REVIEW REQUIRED <SellerGuidanceHelp guidance={getSellerGuidance('status.promise_unapproved')} /></div>}<div className="mt-3 flex flex-wrap gap-2">{item.recordState === 'DRAFT' && <><button type="button" onClick={() => editDraft(item)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-[10px] font-black text-slate-600">Edit Draft</button><button type="button" disabled={busy === `activate:${item.id}`} onClick={() => void recordActive(item)} className="min-h-10 rounded-lg bg-[#000080] px-3 text-[10px] font-black text-white">Record Active Promise</button></>}{item.recordState === 'ACTIVE' && <button type="button" disabled={busy === `revise:${item.id}`} onClick={() => void revise(item)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-[10px] font-black text-[#000080]">Create Revision</button>}<button type="button" disabled={busy === `withdraw:${item.id}`} onClick={() => void withdraw(item)} className="min-h-10 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[10px] font-black text-rose-700">Withdraw</button>{item.recordState === 'ACTIVE' && unapproved && <button type="button" onClick={openValidation} className="min-h-10 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[10px] font-black text-amber-900">Request / Open Validation</button>}</div></article>; })}</div>}</div>

    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><div className="flex items-center gap-2 font-black text-slate-900"><Link className="h-4 w-4" />Future quotation reconciliation<SellerGuidanceHelp guidance={getSellerGuidance('field.future_quote_coverage')} /></div><p className="mt-1 leading-5">PROMISE_COVERAGE, FINAL_SCOPE_RECONCILIATION and QUOTATION_SNAPSHOT_COVERAGE remain NOT YET EVALUATED. Recording a Promise here does not prove the final quotation covers it.</p></div>

    <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-black text-slate-700"><History className="h-4 w-4" />Promise history · {history.length}<ChevronDown className="ml-auto h-4 w-4" /></summary><div className="border-t border-slate-200 p-3">{history.length === 0 ? <p className="text-xs text-slate-500">No superseded or withdrawn Promise history.</p> : <div className="space-y-2">{history.map(item => <div key={item.id} className="rounded-lg bg-white p-3 text-xs"><div className="font-black text-slate-800">{item.promiseType.replaceAll('_',' ')} · {item.recordState}</div><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{item.promiseText}</p><div className="mt-1 text-[10px] text-slate-400">Promised {fmt(item.promisedAt)} · Recorded {fmt(item.recordedAt)}{item.withdrawalReason ? ` · Withdrawal: ${item.withdrawalReason}` : ''}</div></div>)}</div>}</div></details>
  </section>;
}
