import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, FileText, History, Link, Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import SellerGuidanceHelp from './SellerGuidanceHelp';
import { getSellerGuidance } from '../../../lib/crmSellerGuidance';
import '../../../lib/crmSalesScopeCommitmentGuidance';
import {
  crmSalesScopeCommitmentService,
  CRMValidationAlignment,
  CRMSalesScopeCommitmentWorkspace,
  CRMScopeCondition,
  CRMScopeConditionType,
  CRMScopeSourceRequirement,
} from '../../../lib/crmSalesScopeCommitmentService';

type Props = { workspace: CRMSalesScopeCommitmentWorkspace; onChanged: (message: string) => Promise<void> | void };
type Draft = { id?: string; type: CRMScopeConditionType; title: string; text: string; requirementId: string; validationId: string; meetingId: string; sourceSummary: string; alignment: CRMValidationAlignment };
const emptyDraft = (): Draft => ({ type: 'SCOPE_BOUNDARY', title: '', text: '', requirementId: '', validationId: '', meetingId: '', sourceSummary: '', alignment: 'NOT_REQUIRED' });
const TYPES: Array<{ value: CRMScopeConditionType; label: string; guidance?: string }> = [
  { value: 'ASSUMPTION', label: 'Assumption', guidance: 'field.assumption_condition' },
  { value: 'EXCLUSION', label: 'Exclusion', guidance: 'field.exclusion_condition' },
  { value: 'DEPENDENCY', label: 'Dependency', guidance: 'field.dependency_condition' },
  { value: 'CLIENT_RESPONSIBILITY', label: 'Client Responsibility', guidance: 'field.client_responsibility_condition' },
  { value: 'SCOPE_BOUNDARY', label: 'Scope Boundary' },
];
const stateTone: Record<string, string> = {
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-700', DRAFT: 'border-slate-200 bg-slate-50 text-slate-600', STALE: 'border-rose-200 bg-rose-50 text-rose-700',
  RESOLVED: 'border-blue-200 bg-blue-50 text-[#000080]', SUPERSEDED: 'border-slate-200 bg-slate-100 text-slate-500', WITHDRAWN: 'border-slate-200 bg-slate-100 text-slate-500',
};
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
const typeForRequirement = (req: CRMScopeSourceRequirement): CRMScopeConditionType => req.requirementKey === 'assumptions' ? 'ASSUMPTION' : req.requirementKey === 'exclusions' ? 'EXCLUSION' : req.requirementKey === 'client_dependencies' ? 'DEPENDENCY' : 'SCOPE_BOUNDARY';
const reqValue = (req: CRMScopeSourceRequirement) => req.content?.trim() || (req.structuredValue ? JSON.stringify(req.structuredValue) : 'Structured Requirement recorded');

export default function CRMScopeConditionsPanel({ workspace, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [linkByRequirement, setLinkByRequirement] = useState<Record<string, string>>({});
  const current = useMemo(() => workspace.conditions.filter(item => ['ACTIVE','STALE','DRAFT'].includes(item.state)), [workspace.conditions]);
  const history = useMemo(() => workspace.conditions.filter(item => ['RESOLVED','SUPERSEDED','WITHDRAWN'].includes(item.state)), [workspace.conditions]);
  const linkable = useMemo(() => workspace.conditions.filter(item => ['ACTIVE','STALE','DRAFT'].includes(item.state)), [workspace.conditions]);
  const assessment = workspace.assessment?.scopeConditions;

  const mutate = async (key: string, task: () => Promise<unknown>, message: string) => {
    setBusy(key); setError('');
    try { await task(); setDraft(null); await onChanged(message); }
    catch (e) { setError(e instanceof Error ? e.message : 'The Scope Condition action could not be completed.'); }
    finally { setBusy(''); }
  };

  const openFromRequirement = (req: CRMScopeSourceRequirement) => setDraft({
    ...emptyDraft(), type: typeForRequirement(req), title: req.title, text: reqValue(req), requirementId: req.id,
  });
  const editDraft = (item: CRMScopeCondition) => setDraft({
    id: item.id, type: item.conditionType, title: item.title, text: item.conditionText, requirementId: item.sourceRequirementId || '', validationId: item.sourceValidationId || '', meetingId: item.sourceMeetingId || '', sourceSummary: item.sourceSummary || '', alignment: item.validationAlignmentStatus,
  });
  const saveDraft = async () => {
    if (!draft) return;
    const sourceType = draft.validationId ? 'VALIDATION' : draft.requirementId ? 'REQUIREMENT' : draft.meetingId ? 'MEETING' : 'MANUAL';
    await mutate(`save:${draft.id || 'new'}`, () => crmSalesScopeCommitmentService.saveConditionDraft({
      conditionId: draft.id, leadId: workspace.leadId, opportunityId: workspace.opportunityId, conditionType: draft.type, title: draft.title, conditionText: draft.text,
      sourceRequirementId: draft.requirementId || null, sourceValidationId: draft.validationId || null, sourceMeetingId: draft.meetingId || null, sourceType,
      sourceSummary: draft.sourceSummary || null, validationAlignmentStatus: draft.validationId ? draft.alignment : 'NOT_REQUIRED',
    }), draft.id ? 'Scope Condition draft updated.' : 'Scope Condition draft created.');
  };
  const activate = async (item: CRMScopeCondition) => {
    if (!window.confirm('Activate this Scope Condition as a current proposal boundary? Active wording is history-protected; material changes require a revision.')) return;
    await mutate(`activate:${item.id}`, () => crmSalesScopeCommitmentService.transitionCondition(item.id, 'ACTIVATE'), 'Scope Condition activated.');
  };
  const revise = async (item: CRMScopeCondition) => {
    const title = window.prompt('Revision title', item.title); if (!title) return;
    const text = window.prompt('Revised Scope Condition wording. The old wording will remain in history.', item.conditionText); if (!text || text.trim() === item.conditionText.trim()) return;
    if (!window.confirm('Create a history-safe Draft revision? The current condition remains unchanged until the revision is activated.')) return;
    await mutate(`revise:${item.id}`, () => crmSalesScopeCommitmentService.reviseCondition(item.id, title, text, item.sourceValidationId ? item.validationAlignmentStatus : 'NOT_REQUIRED'), 'Scope Condition revision draft created.');
  };
  const resolve = async (item: CRMScopeCondition) => {
    const reason = window.prompt('Optional resolution note', item.resolutionNote || '');
    if (!window.confirm('Resolve this Scope Condition? It will remain in history and no longer be a current proposal boundary.')) return;
    await mutate(`resolve:${item.id}`, () => crmSalesScopeCommitmentService.transitionCondition(item.id, 'RESOLVE', reason), 'Scope Condition resolved.');
  };
  const withdraw = async (item: CRMScopeCondition) => {
    const reason = window.prompt('Why is this Scope Condition being withdrawn?'); if (!reason || reason.trim().length < 6) return;
    if (!window.confirm('Withdraw this Scope Condition and preserve its wording/reason in history?')) return;
    await mutate(`withdraw:${item.id}`, () => crmSalesScopeCommitmentService.transitionCondition(item.id, 'WITHDRAW', reason), 'Scope Condition withdrawn.');
  };
  const markNotMaterial = async (req: CRMScopeSourceRequirement) => {
    const note = window.prompt('Explain why this source Requirement is not material for the commercial proposal.'); if (!note || note.trim().length < 6) return;
    await mutate(`not-material:${req.id}`, () => crmSalesScopeCommitmentService.reconcileRequirement(req.id, 'NOT_MATERIAL', null, note), 'Requirement marked Not Material for Proposal.');
  };
  const linkExisting = async (req: CRMScopeSourceRequirement) => {
    const conditionId = linkByRequirement[req.id]; if (!conditionId) return;
    const condition = linkable.find(item => item.id === conditionId); if (!condition) return;
    if (!window.confirm(`Link “${req.title}” to the existing Scope Condition “${condition.title}”?`)) return;
    await mutate(`link:${req.id}`, () => crmSalesScopeCommitmentService.reconcileRequirement(req.id, 'LINK_CONDITION', conditionId, 'Linked to existing Scope Condition'), 'Requirement linked to an existing Scope Condition.');
  };

  return <section id="crm-scope-conditions" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Scope Conditions">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Scope Conditions<SellerGuidanceHelp guidance={getSellerGuidance('section.scope_conditions')} /></div><p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-500">Reconciled pre-quotation assumptions, exclusions, dependencies, client responsibilities and scope boundaries. Requirements remain the discovery source; quotations remain downstream snapshots.</p></div>
      <div className="flex items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${assessment?.status === 'READY' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : assessment?.status === 'BLOCKED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{assessment?.status || 'NO OPPORTUNITY'}</span><button type="button" onClick={() => setDraft(emptyDraft())} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-3 text-xs font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"><Plus className="h-4 w-4" />New condition</button></div>
    </div>

    {error && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</div>}
    {assessment && (assessment.blockers.length > 0 || assessment.warnings.length > 0) && <div className="mt-4 space-y-2">
      {assessment.blockers.map((issue, index) => <div key={`${issue.code}-${index}`} className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{issue.message}</div>)}
      {assessment.warnings.map((issue, index) => <div key={`${issue.code}-${index}`} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />{issue.message}</div>)}
    </div>}

    {workspace.sourceRequirements.length > 0 && <div className="mt-5"><h4 className="text-xs font-black text-slate-900">Requirement reconciliation</h4><p className="mt-1 text-[11px] text-slate-500">Nothing is created automatically. Explicitly create/link a proposal boundary or record why the source is not material.</p><div className="mt-3 space-y-2">{workspace.sourceRequirements.map(req => <article key={req.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="text-xs font-black text-slate-900">{req.title}</div><div className="mt-1 text-[10px] font-bold text-slate-500">{req.requirementKey} · {req.informationCertainty} · {req.proposalReconciliationStatus || 'UNRECONCILED'}</div></div>{req.proposalReconciliationStatus === 'RECONCILED' ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">RECONCILED</span> : req.proposalReconciliationStatus === 'NOT_MATERIAL' ? <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-black text-slate-600">NOT MATERIAL</span> : <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-800">NEEDS RECONCILIATION</span>}</div><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{reqValue(req)}</p>{req.proposalReconciliationNote && <p className="mt-1 text-[10px] text-slate-500">{req.proposalReconciliationNote}</p>}<div className="mt-3 flex flex-wrap items-end gap-2"><button type="button" onClick={() => openFromRequirement(req)} className="min-h-10 rounded-lg bg-[#000080] px-3 text-[10px] font-black text-white">Create Scope Condition</button><div className="min-w-[180px] flex-1"><label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Link existing<select value={linkByRequirement[req.id] || ''} onChange={e => setLinkByRequirement(previous => ({ ...previous, [req.id]: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">Choose current condition</option>{linkable.map(item => <option key={item.id} value={item.id}>{item.title} · {item.state}</option>)}</select></label></div><button type="button" disabled={!linkByRequirement[req.id] || busy === `link:${req.id}`} onClick={() => void linkExisting(req)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-[#000080] disabled:opacity-50"><Link className="mr-1 inline h-3.5 w-3.5" />Link</button><button type="button" disabled={busy === `not-material:${req.id}`} onClick={() => void markNotMaterial(req)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600">Not Material for Proposal</button></div></article>)}</div></div>}

    {draft && <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/30 p-4"><div className="flex items-center gap-2 text-xs font-black text-slate-900"><FileText className="h-4 w-4 text-[#000080]" />{draft.id ? 'Edit Draft Scope Condition' : 'Create Draft Scope Condition'}<SellerGuidanceHelp guidance={getSellerGuidance('action.create_scope_condition')} /></div><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-[10px] font-black text-slate-600">Type <SellerGuidanceHelp guidance={getSellerGuidance('field.scope_condition_type')} /><select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as CRMScopeConditionType })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs">{TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-[10px] font-black text-slate-600">Title<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs" /></label></div><label className="mt-3 block text-[10px] font-black text-slate-600">Condition<textarea rows={4} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6" /></label><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-[10px] font-black text-slate-600">Source Requirement <SellerGuidanceHelp guidance={getSellerGuidance('field.scope_condition_source')} /><select value={draft.requirementId} onChange={e => setDraft({ ...draft, requirementId: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">None</option>{workspace.sourceRequirements.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="text-[10px] font-black text-slate-600">Source Validation<select value={draft.validationId} onChange={e => setDraft({ ...draft, validationId: e.target.value, alignment: e.target.value ? 'PENDING' : 'NOT_REQUIRED' })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">None</option>{workspace.validations.map(item => <option key={item.id} value={item.id}>{item.validationType} · {item.status} · {item.subject}</option>)}</select></label><label className="text-[10px] font-black text-slate-600">Source Meeting<select value={draft.meetingId} onChange={e => setDraft({ ...draft, meetingId: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">None</option>{workspace.meetings.map(item => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></label></div>{draft.validationId && <label className="mt-3 block text-[10px] font-black text-slate-600">Approved-constraint reconciliation<select value={draft.alignment} onChange={e => setDraft({ ...draft, alignment: e.target.value as CRMValidationAlignment })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="PENDING">Needs human reconciliation</option><option value="WITHIN_CONSTRAINTS">Within approved constraints</option><option value="CONFLICT">Conflicts / wording must change</option></select></label>}<label className="mt-3 block text-[10px] font-black text-slate-600">Source/context summary<textarea rows={2} value={draft.sourceSummary} onChange={e => setDraft({ ...draft, sourceSummary: e.target.value })} placeholder="Describe the source in plain language when useful. Never paste credentials or secrets." className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs" /></label><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">Cancel</button><button type="button" disabled={busy.startsWith('save:')} onClick={() => void saveDraft()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy.startsWith('save:') ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Save Draft</button></div></div>}

    <div className="mt-5"><h4 className="text-xs font-black text-slate-900">Current material conditions</h4>{current.length === 0 ? <div className="mt-2 rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">No current Scope Conditions. This is valid when no material source Requirement needs reconciliation.</div> : <div className="mt-3 space-y-2">{current.map(item => <article key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="text-xs font-black text-slate-900">{item.title}</div><div className="mt-1 text-[10px] font-bold text-slate-500">{item.conditionType.replaceAll('_',' ')} · source: {item.sourceRequirementTitle || item.sourceValidationType || item.sourceMeetingTitle || item.sourceSummary || item.sourceType}</div></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${stateTone[item.state]}`}>{item.state}</span></div><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{item.conditionText}</p>{item.state === 'STALE' && <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[10px] font-bold text-rose-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Source changed. Review and revise before relying on this proposal boundary.<SellerGuidanceHelp guidance={getSellerGuidance('status.scope_condition_stale')} /></div>}{item.approvedConstraints && <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2 text-[10px] text-slate-700"><strong>Approved constraints:</strong> {item.approvedConstraints}</div>}<div className="mt-3 flex flex-wrap gap-2">{item.state === 'DRAFT' && <><button type="button" onClick={() => editDraft(item)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-[10px] font-black text-slate-600">Edit Draft</button><button type="button" disabled={busy === `activate:${item.id}`} onClick={() => void activate(item)} className="min-h-10 rounded-lg bg-[#000080] px-3 text-[10px] font-black text-white">Activate</button></>}{['ACTIVE','STALE'].includes(item.state) && <><button type="button" disabled={busy === `revise:${item.id}`} onClick={() => void revise(item)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-[10px] font-black text-[#000080]">Create Revision</button><button type="button" disabled={busy === `resolve:${item.id}`} onClick={() => void resolve(item)} className="min-h-10 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black text-emerald-700">Resolve</button></>}<button type="button" disabled={busy === `withdraw:${item.id}`} onClick={() => void withdraw(item)} className="min-h-10 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[10px] font-black text-rose-700">Withdraw</button></div></article>)}</div>}</div>

    <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-black text-slate-700"><History className="h-4 w-4" />History · {history.length}<ChevronDown className="ml-auto h-4 w-4" /></summary><div className="border-t border-slate-200 p-3">{history.length === 0 ? <p className="text-xs text-slate-500">No resolved, superseded or withdrawn history.</p> : <div className="space-y-2">{history.map(item => <div key={item.id} className="rounded-lg bg-white p-3 text-xs"><div className="font-black text-slate-800">{item.title} · {item.state}</div><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{item.conditionText}</p><div className="mt-1 text-[10px] text-slate-400">Updated {fmt(item.updatedAt)}{item.withdrawalReason ? ` · Withdrawal: ${item.withdrawalReason}` : ''}</div></div>)}</div>}</div></details>
  </section>;
}
