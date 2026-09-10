import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileCheck2, History, Link2, Loader2, Pencil, Plus, RefreshCw, Save, ShieldAlert, X } from 'lucide-react';
import {
  CRMScopeCommitmentAssessment,
  CRMScopeCondition,
  CRMScopeConditionType,
  CRMScopeMeeting,
  CRMScopeSourceRequirement,
  CRMScopeSourceType,
  CRMScopeValidation,
  CRMValidationAlignmentStatus,
  crmSalesScopeCommitmentService,
} from '../../../lib/crmSalesScopeCommitmentService';
import { getScopeCommitmentGuidance } from '../../../lib/crmSalesScopeCommitmentGuidance';
import SellerGuidanceHelp from './SellerGuidanceHelp';
import CRMConsequentialActionDialog from './CRMConsequentialActionDialog';

type Props = {
  leadId: string;
  opportunityId?: string | null;
  conditions: CRMScopeCondition[];
  sourceRequirements: CRMScopeSourceRequirement[];
  validations: CRMScopeValidation[];
  meetings: CRMScopeMeeting[];
  assessment?: CRMScopeCommitmentAssessment | null;
  onChanged: (message: string) => Promise<void> | void;
};

type Draft = {
  id?: string;
  mode: 'create' | 'edit-draft' | 'revision';
  conditionType: CRMScopeConditionType;
  title: string;
  conditionText: string;
  sourceType: CRMScopeSourceType;
  sourceRequirementId: string;
  sourceValidationId: string;
  sourceMeetingId: string;
  sourceRecordId: string;
  sourceSummary: string;
  validationAlignmentStatus: CRMValidationAlignmentStatus;
};

type DialogAction =
  | { kind: 'activate'; condition: CRMScopeCondition }
  | { kind: 'resolve'; condition: CRMScopeCondition }
  | { kind: 'withdraw'; condition: CRMScopeCondition }
  | { kind: 'not-material'; requirement: CRMScopeSourceRequirement }
  | null;

const TYPES: CRMScopeConditionType[] = ['ASSUMPTION', 'EXCLUSION', 'DEPENDENCY', 'CLIENT_RESPONSIBILITY', 'SCOPE_BOUNDARY'];
const SOURCES: CRMScopeSourceType[] = ['MANUAL', 'REQUIREMENT', 'VALIDATION', 'MEETING'];
const ALIGNMENT: CRMValidationAlignmentStatus[] = ['PENDING', 'WITHIN_CONSTRAINTS', 'CONFLICT'];
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';

const emptyDraft = (): Draft => ({ mode: 'create', conditionType: 'ASSUMPTION', title: '', conditionText: '', sourceType: 'MANUAL', sourceRequirementId: '', sourceValidationId: '', sourceMeetingId: '', sourceRecordId: '', sourceSummary: '', validationAlignmentStatus: 'NOT_REQUIRED' });

function stateTone(state: string) {
  if (state === 'ACTIVE') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'STALE') return 'border-rose-300 bg-rose-100 text-rose-800';
  if (state === 'DRAFT') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export default function CRMScopeConditionsPanel({ leadId, opportunityId, conditions, sourceRequirements, validations, meetings, assessment, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [linkingRequirementId, setLinkingRequirementId] = useState('');
  const [linkConditionId, setLinkConditionId] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const [dialog, setDialog] = useState<DialogAction>(null);

  const current = useMemo(() => conditions.filter(item => ['DRAFT', 'ACTIVE', 'STALE'].includes(item.state)), [conditions]);
  const history = useMemo(() => conditions.filter(item => ['RESOLVED', 'SUPERSEDED', 'WITHDRAWN'].includes(item.state)), [conditions]);
  const unreconciled = useMemo(() => sourceRequirements.filter(item => !item.proposalReconciliationStatus), [sourceRequirements]);
  const sourceLinkOptions = current.filter(item => ['DRAFT', 'ACTIVE', 'STALE'].includes(item.state));
  const scope = assessment?.scopeConditions;

  const openCreate = (requirement?: CRMScopeSourceRequirement) => {
    setError('');
    if (!requirement) { setDraft(emptyDraft()); return; }
    const value = requirement.content || (requirement.structuredValue == null ? '' : JSON.stringify(requirement.structuredValue));
    setDraft({ ...emptyDraft(), sourceType: 'REQUIREMENT', sourceRequirementId: requirement.id, title: requirement.title, conditionText: value || requirement.title, conditionType: requirement.requirementKey === 'exclusions' ? 'EXCLUSION' : requirement.requirementKey === 'client_dependencies' ? 'DEPENDENCY' : 'ASSUMPTION', sourceSummary: `Reconciled from Requirement: ${requirement.title}` });
  };

  const openEdit = (condition: CRMScopeCondition) => {
    setError('');
    setDraft({
      id: condition.id,
      mode: condition.state === 'DRAFT' ? 'edit-draft' : 'revision',
      conditionType: condition.conditionType,
      title: condition.title,
      conditionText: condition.conditionText,
      sourceType: condition.sourceType,
      sourceRequirementId: condition.sourceRequirementId || '',
      sourceValidationId: condition.sourceValidationId || '',
      sourceMeetingId: condition.sourceMeetingId || '',
      sourceRecordId: condition.sourceRecordId || '',
      sourceSummary: condition.sourceSummary || '',
      validationAlignmentStatus: condition.sourceValidationId ? condition.validationAlignmentStatus : 'NOT_REQUIRED',
    });
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (draft.title.trim().length < 3 || draft.conditionText.trim().length < 6) { setError('Add a clear title and at least 6 characters of Scope Condition wording.'); return; }
    setBusy('save'); setError('');
    try {
      if (draft.mode === 'revision' && draft.id) {
        await crmSalesScopeCommitmentService.reviseCondition({ conditionId: draft.id, title: draft.title, conditionText: draft.conditionText, validationAlignmentStatus: draft.sourceValidationId ? draft.validationAlignmentStatus : 'NOT_REQUIRED' });
        setDraft(null); await onChanged('Scope Condition revision draft created.');
      } else {
        await crmSalesScopeCommitmentService.saveConditionDraft({
          conditionId: draft.id || null,
          leadId,
          opportunityId,
          conditionType: draft.conditionType,
          title: draft.title,
          conditionText: draft.conditionText,
          sourceRequirementId: draft.sourceRequirementId || null,
          sourceValidationId: draft.sourceValidationId || null,
          sourceMeetingId: draft.sourceMeetingId || null,
          sourceType: draft.sourceType,
          sourceRecordId: draft.sourceRecordId || null,
          sourceSummary: draft.sourceSummary || null,
          validationAlignmentStatus: draft.sourceValidationId ? draft.validationAlignmentStatus : 'NOT_REQUIRED',
        });
        setDraft(null); await onChanged(draft.id ? 'Scope Condition draft updated.' : 'Scope Condition draft created.');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Scope Condition could not be saved.'); }
    finally { setBusy(''); }
  };

  const linkRequirement = async (requirementId: string) => {
    if (!linkConditionId) { setError('Choose a Scope Condition to link.'); return; }
    setBusy(`link:${requirementId}`); setError('');
    try {
      await crmSalesScopeCommitmentService.reconcileRequirement({ requirementId, action: 'LINK_CONDITION', conditionId: linkConditionId, note: linkNote || null });
      setLinkingRequirementId(''); setLinkConditionId(''); setLinkNote(''); await onChanged('Requirement linked to Scope Condition.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Requirement could not be reconciled.'); }
    finally { setBusy(''); }
  };

  const runDialogAction = async (payload: { confirmed: boolean; reason: string }) => {
    if (!dialog) return;
    const active = dialog; setBusy('dialog'); setError('');
    try {
      if (active.kind === 'not-material') await crmSalesScopeCommitmentService.reconcileRequirement({ requirementId: active.requirement.id, action: 'NOT_MATERIAL', note: payload.reason });
      else await crmSalesScopeCommitmentService.transitionCondition({ conditionId: active.condition.id, action: active.kind === 'activate' ? 'ACTIVATE' : active.kind === 'resolve' ? 'RESOLVE' : 'WITHDRAW', reason: payload.reason || null });
      setDialog(null);
      await onChanged(active.kind === 'not-material' ? 'Requirement marked Not Material for Proposal.' : active.kind === 'activate' ? 'Scope Condition activated.' : active.kind === 'resolve' ? 'Scope Condition resolved.' : 'Scope Condition withdrawn.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Scope Condition action failed.'); }
    finally { setBusy(''); }
  };

  const openValidation = () => {
    const element = document.getElementById('crm-sales-validation');
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.dispatchEvent(new CustomEvent('crm-readiness-navigate', { detail: { target: 'validation' } }));
  };

  return <section id="crm-scope-conditions" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Scope Conditions">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><FileCheck2 className="h-4 w-4" />Scope Conditions<SellerGuidanceHelp guidance={getScopeCommitmentGuidance('scope_conditions')} /></div><p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-600">Reconcile material discovery into explicit proposal assumptions, exclusions, dependencies, client responsibilities, and scope boundaries. This register does not replace Requirements or quotation truth.</p></div>
      <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${scope?.status === 'READY' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : scope?.status === 'BLOCKED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{scope?.status || 'NOT EVALUATED'}</span><button type="button" onClick={() => openCreate()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white"><Plus className="h-4 w-4" />New condition</button></div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Active" value={scope?.activeCount ?? current.filter(x => x.state === 'ACTIVE').length} /><Metric label="Draft" value={scope?.draftCount ?? current.filter(x => x.state === 'DRAFT').length} /><Metric label="Stale" value={scope?.staleCount ?? current.filter(x => x.state === 'STALE').length} danger={(scope?.staleCount || 0) > 0} /><Metric label="Needs reconciliation" value={unreconciled.length} danger={unreconciled.length > 0} /></div>

    {(scope?.blockers?.length || 0) > 0 && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3"><div className="flex items-center gap-2 text-xs font-black text-rose-800"><ShieldAlert className="h-4 w-4" />Scope blockers</div><ul className="mt-2 space-y-1.5 text-xs text-rose-800">{scope?.blockers.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul></div>}

    {unreconciled.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3"><div className="flex items-center gap-2 text-xs font-black text-amber-950"><AlertTriangle className="h-4 w-4" />Material Requirements need explicit proposal reconciliation</div><div className="mt-3 space-y-2">{unreconciled.map(requirement => <div key={requirement.id} className="rounded-xl border border-amber-200 bg-white p-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="text-xs font-black text-slate-900">{requirement.title}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{requirement.requirementKey} · {label(requirement.informationCertainty)}</div><p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-600">{requirement.content || (requirement.structuredValue == null ? 'Structured Requirement value recorded.' : JSON.stringify(requirement.structuredValue))}</p></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => openCreate(requirement)} className="min-h-9 rounded-lg bg-[#000080] px-3 text-[11px] font-black text-white">Create Scope Condition</button><button type="button" disabled={!sourceLinkOptions.length} onClick={() => { setLinkingRequirementId(linkingRequirementId === requirement.id ? '' : requirement.id); setLinkConditionId(''); setLinkNote(''); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-[#000080] disabled:opacity-40"><Link2 className="h-3.5 w-3.5" />Link existing</button><button type="button" onClick={() => setDialog({ kind: 'not-material', requirement })} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-600">Not Material for Proposal</button></div></div>{linkingRequirementId === requirement.id && <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]"><select aria-label="Existing Scope Condition" value={linkConditionId} onChange={e => setLinkConditionId(e.target.value)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">Choose condition…</option>{sourceLinkOptions.map(item => <option key={item.id} value={item.id}>{item.title} · {item.state}</option>)}</select><input aria-label="Reconciliation note" value={linkNote} onChange={e => setLinkNote(e.target.value)} placeholder="Optional reconciliation note" className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs" /><button type="button" disabled={busy === `link:${requirement.id}`} onClick={() => void linkRequirement(requirement.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#000080] px-3 text-xs font-black text-white disabled:opacity-50">{busy === `link:${requirement.id}` && <Loader2 className="h-4 w-4 animate-spin" />}Link</button></div>}</div>)}</div></div>}

    {draft && <ConditionEditor draft={draft} setDraft={setDraft} validations={validations} requirements={sourceRequirements} meetings={meetings} busy={busy === 'save'} onSave={() => void saveDraft()} onCancel={() => { setDraft(null); setError(''); }} />}
    {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{error}</div>}

    <div className="mt-5 space-y-3">{current.length === 0 && !draft ? <div className="rounded-xl border border-dashed border-slate-200 px-4 py-7 text-center text-xs text-slate-500">No Scope Conditions yet. Add only material proposal boundaries—do not duplicate ordinary Requirements.</div> : current.map(condition => <ConditionCard key={condition.id} condition={condition} onEdit={() => openEdit(condition)} onActivate={() => setDialog({ kind: 'activate', condition })} onResolve={() => setDialog({ kind: 'resolve', condition })} onWithdraw={() => setDialog({ kind: 'withdraw', condition })} onOpenValidation={openValidation} />)}</div>

    <div className="mt-5 border-t border-slate-100 pt-4"><button type="button" onClick={() => setHistoryOpen(value => !value)} aria-expanded={historyOpen} className="inline-flex min-h-9 items-center gap-2 text-xs font-black text-slate-600">{historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<History className="h-4 w-4" />History ({history.length})</button>{historyOpen && <div className="mt-3 space-y-2">{history.length ? history.map(condition => <ConditionCard key={condition.id} condition={condition} historical onEdit={() => undefined} onActivate={() => undefined} onResolve={() => undefined} onWithdraw={() => undefined} onOpenValidation={openValidation} />) : <div className="text-xs text-slate-400">No historical Scope Conditions.</div>}</div>}</div>

    <CRMConsequentialActionDialog open={Boolean(dialog)} title={dialog?.kind === 'activate' ? 'Activate Scope Condition?' : dialog?.kind === 'resolve' ? 'Resolve Scope Condition?' : dialog?.kind === 'withdraw' ? 'Withdraw Scope Condition?' : 'Mark Requirement Not Material?'} description={dialog?.kind === 'activate' ? 'This Draft becomes a current proposal boundary. Future material wording changes must use a history-safe revision.' : dialog?.kind === 'resolve' ? 'The condition leaves the current proposal boundary set but remains preserved in history.' : dialog?.kind === 'withdraw' ? 'Withdrawal preserves the original wording and records why it was intentionally removed.' : 'The Requirement remains discovery truth. You are explicitly documenting why it does not need a proposal boundary.'} confirmLabel={dialog?.kind === 'activate' ? 'Activate condition' : dialog?.kind === 'resolve' ? 'Resolve condition' : dialog?.kind === 'withdraw' ? 'Withdraw condition' : 'Mark Not Material'} confirmTone={dialog?.kind === 'withdraw' ? 'danger' : 'primary'} requireReason={dialog?.kind === 'withdraw' || dialog?.kind === 'resolve' || dialog?.kind === 'not-material'} reasonLabel={dialog?.kind === 'not-material' ? 'Why is this not material for the proposal?' : dialog?.kind === 'resolve' ? 'Resolution note' : 'Withdrawal reason'} guidance={getScopeCommitmentGuidance(dialog?.kind === 'not-material' ? 'not_material' : dialog?.kind === 'activate' ? 'condition_activate' : 'condition_revision')} busy={busy === 'dialog'} onCancel={() => !busy && setDialog(null)} onConfirm={runDialogAction} />
  </section>;
}

function Metric({ label: metricLabel, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className={`rounded-xl border p-3 ${danger ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}><div className={`text-lg font-black ${danger ? 'text-rose-700' : 'text-slate-950'}`}>{value}</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{metricLabel}</div></div>; }

function ConditionEditor({ draft, setDraft, validations, requirements, meetings, busy, onSave, onCancel }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft | null>>; validations: CRMScopeValidation[]; requirements: CRMScopeSourceRequirement[]; meetings: CRMScopeMeeting[]; busy: boolean; onSave: () => void; onCancel: () => void }) {
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(previous => previous ? { ...previous, [key]: value } : previous);
  const sourceLocked = draft.mode === 'revision';
  return <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-1 text-xs font-black text-slate-900">{draft.mode === 'revision' ? 'Create history-safe revision' : draft.mode === 'edit-draft' ? 'Edit Scope Condition draft' : 'New Scope Condition draft'}<SellerGuidanceHelp guidance={getScopeCommitmentGuidance(draft.mode === 'revision' ? 'condition_revision' : 'condition_source')} /></div><p className="mt-1 text-[11px] leading-5 text-slate-500">Drafts are internal preparation. Activating is a separate deliberate lifecycle action.</p></div><button type="button" onClick={onCancel} aria-label="Close editor" className="h-9 w-9 rounded-lg text-slate-500 hover:bg-white"><X className="mx-auto h-4 w-4" /></button></div>
    <div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Condition type"><select disabled={draft.mode === 'revision'} value={draft.conditionType} onChange={e => update('conditionType', e.target.value as CRMScopeConditionType)} className="input">{TYPES.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></Field><Field label="Title"><input value={draft.title} onChange={e => update('title', e.target.value)} maxLength={240} className="input" /></Field></div>
    <Field label="Exact Scope Condition wording" wide><textarea value={draft.conditionText} onChange={e => update('conditionText', e.target.value)} rows={4} maxLength={6000} className="input resize-y" /></Field>
    {!sourceLocked && <><div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Source / evidence" help="condition_source"><select value={draft.sourceType} onChange={e => { const value = e.target.value as CRMScopeSourceType; update('sourceType', value); if (value !== 'REQUIREMENT') update('sourceRequirementId', ''); if (value !== 'VALIDATION') update('sourceValidationId', ''); if (value !== 'MEETING') update('sourceMeetingId', ''); }} className="input">{SOURCES.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></Field>{draft.sourceType === 'REQUIREMENT' ? <Field label="Source Requirement"><select value={draft.sourceRequirementId} onChange={e => update('sourceRequirementId', e.target.value)} className="input"><option value="">Choose Requirement…</option>{requirements.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field> : draft.sourceType === 'VALIDATION' ? <Field label="Source Validation"><select value={draft.sourceValidationId} onChange={e => update('sourceValidationId', e.target.value)} className="input"><option value="">Choose Validation…</option>{validations.map(item => <option key={item.id} value={item.id}>{label(item.validationType)} · {item.status}</option>)}</select></Field> : draft.sourceType === 'MEETING' ? <Field label="Source Meeting"><select value={draft.sourceMeetingId} onChange={e => update('sourceMeetingId', e.target.value)} className="input"><option value="">Choose Meeting…</option>{meetings.map(item => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></Field> : <Field label="Source record / reference"><input value={draft.sourceRecordId} onChange={e => update('sourceRecordId', e.target.value)} maxLength={240} className="input" placeholder="Optional CRM/email/reference id" /></Field>}</div><Field label="Source summary / evidence" wide><textarea value={draft.sourceSummary} onChange={e => update('sourceSummary', e.target.value)} maxLength={2000} rows={2} className="input resize-y" placeholder="Where did this boundary come from?" /></Field></>}
    {(draft.sourceValidationId || draft.sourceType === 'VALIDATION') && <Field label="Validation alignment" help="condition_validation" wide><select value={draft.validationAlignmentStatus === 'NOT_REQUIRED' ? 'PENDING' : draft.validationAlignmentStatus} onChange={e => update('validationAlignmentStatus', e.target.value as CRMValidationAlignmentStatus)} className="input">{ALIGNMENT.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></Field>}
    <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600">Cancel</button><button type="button" disabled={busy} onClick={onSave} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{draft.mode === 'revision' ? 'Create revision draft' : 'Save draft'}</button></div>
    <style>{`.input{min-height:40px;width:100%;border:1px solid rgb(203 213 225);border-radius:.75rem;background:white;padding:.6rem .75rem;font-size:.75rem;color:rgb(15 23 42);outline:none}.input:focus{border-color:#000080;box-shadow:0 0 0 2px rgb(219 234 254)}.input:disabled{background:rgb(241 245 249);color:rgb(100 116 139)}`}</style>
  </div>;
}

function Field({ label: fieldLabel, children, wide = false, help }: { label: string; children: React.ReactNode; wide?: boolean; help?: string }) { return <label className={`mt-3 block text-[11px] font-black text-slate-700 ${wide ? 'md:col-span-2' : ''}`}><span className="flex items-center gap-1">{fieldLabel}{help && <SellerGuidanceHelp guidance={getScopeCommitmentGuidance(help)} />}</span><div className="mt-1.5">{children}</div></label>; }

function ConditionCard({ condition, historical = false, onEdit, onActivate, onResolve, onWithdraw, onOpenValidation }: { condition: CRMScopeCondition; historical?: boolean; onEdit: () => void; onActivate: () => void; onResolve: () => void; onWithdraw: () => void; onOpenValidation: () => void }) {
  return <article className={`rounded-xl border p-3 ${condition.state === 'STALE' ? 'border-rose-300 bg-rose-50' : historical ? 'border-slate-200 bg-slate-50/70' : 'border-slate-200 bg-white'}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${stateTone(condition.state)}`}>{condition.state}</span><span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label(condition.conditionType)}</span>{condition.state === 'STALE' && <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-700"><RefreshCw className="h-3 w-3" />SOURCE CHANGED — RECONCILE</span>}</div><h4 className="mt-2 text-sm font-black text-slate-950">{condition.title}</h4><p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">{condition.conditionText}</p><div className="mt-3 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-2"><div><span className="font-black text-slate-700">Source:</span> {label(condition.sourceType)}{condition.sourceRequirementTitle ? ` · ${condition.sourceRequirementTitle}` : condition.sourceValidationType ? ` · ${label(condition.sourceValidationType)}` : condition.sourceMeetingTitle ? ` · ${condition.sourceMeetingTitle}` : condition.sourceSummary ? ` · ${condition.sourceSummary}` : ''}</div><div><span className="font-black text-slate-700">Created:</span> {condition.createdByName || 'Authorized Seller'} · {fmt(condition.createdAt)}</div>{condition.sourceSummary && <div className="sm:col-span-2"><span className="font-black text-slate-700">Evidence:</span> {condition.sourceSummary}</div>}{condition.sourceValidationId && <div className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-2"><span className="font-black text-[#000080]">Validation:</span> {label(condition.sourceValidationType || 'linked')} · {condition.sourceValidationStatus || 'Unknown'} · Alignment {label(condition.validationAlignmentStatus)}{condition.approvedConstraints && <div className="mt-1"><span className="font-black">Approved constraints:</span> {condition.approvedConstraints}</div>}<button type="button" onClick={onOpenValidation} className="mt-1 font-black text-[#000080] underline">Open Sales Validation</button></div>}{condition.resolutionNote && <div><span className="font-black">Resolution:</span> {condition.resolutionNote}</div>}{condition.withdrawalReason && <div><span className="font-black">Withdrawal:</span> {condition.withdrawalReason}</div>}</div></div>{!historical && <div className="flex shrink-0 flex-wrap gap-2">{condition.state === 'DRAFT' && <><button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-[11px] font-black text-slate-600"><Pencil className="h-3.5 w-3.5" />Edit draft</button><button type="button" onClick={onActivate} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#000080] px-3 text-[11px] font-black text-white"><CheckCircle2 className="h-3.5 w-3.5" />Activate</button></>}{['ACTIVE', 'STALE'].includes(condition.state) && <><button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-[11px] font-black text-[#000080]"><Pencil className="h-3.5 w-3.5" />Create revision</button><button type="button" onClick={onResolve} className="min-h-9 rounded-lg border border-slate-200 px-3 text-[11px] font-black text-slate-600">Resolve</button></>}<button type="button" onClick={onWithdraw} className="min-h-9 rounded-lg border border-rose-200 px-3 text-[11px] font-black text-rose-700">Withdraw</button></div>}</div></article>;
}
