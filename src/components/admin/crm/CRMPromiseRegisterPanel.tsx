import React, { useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, History, Loader2, MessageSquareWarning, Pencil, Plus, Save, ShieldAlert, X } from 'lucide-react';
import {
  CRMPromise,
  CRMPromiseSourceType,
  CRMPromiseType,
  CRMScopeCommitmentAssessment,
  CRMScopeMeeting,
  CRMScopeSourceRequirement,
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
  promises: CRMPromise[];
  requirements: CRMScopeSourceRequirement[];
  validations: CRMScopeValidation[];
  meetings: CRMScopeMeeting[];
  assessment?: CRMScopeCommitmentAssessment | null;
  onChanged: (message: string) => Promise<void> | void;
};

type Draft = {
  id?: string;
  mode: 'create' | 'edit-draft' | 'revision';
  promiseType: CRMPromiseType;
  promiseText: string;
  internalContext: string;
  sourceType: CRMPromiseSourceType;
  sourceRecordId: string;
  sourceMeetingId: string;
  sourceSummary: string;
  linkedRequirementId: string;
  linkedValidationId: string;
  validationAlignmentStatus: CRMValidationAlignmentStatus;
};

type DialogAction = { kind: 'activate' | 'withdraw'; promise: CRMPromise } | null;
const TYPES: CRMPromiseType[] = ['SCOPE', 'TECHNICAL', 'TIMELINE', 'COMMERCIAL', 'SUPPORT', 'COMPLIANCE', 'PERFORMANCE_RESULT', 'OTHER'];
const SOURCES: CRMPromiseSourceType[] = ['INTERNAL_DRAFT', 'MANUAL_CLIENT_COMMUNICATION', 'MEETING', 'REQUIREMENT', 'VALIDATION'];
const ALIGNMENT: CRMValidationAlignmentStatus[] = ['PENDING', 'WITHIN_CONSTRAINTS', 'CONFLICT'];
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
const emptyDraft = (): Draft => ({ mode: 'create', promiseType: 'SCOPE', promiseText: '', internalContext: '', sourceType: 'INTERNAL_DRAFT', sourceRecordId: '', sourceMeetingId: '', sourceSummary: '', linkedRequirementId: '', linkedValidationId: '', validationAlignmentStatus: 'NOT_REQUIRED' });

function stateTone(state: string) {
  if (state === 'ACTIVE') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'DRAFT') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export default function CRMPromiseRegisterPanel({ leadId, opportunityId, promises, requirements, validations, meetings, assessment, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dialog, setDialog] = useState<DialogAction>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const current = useMemo(() => promises.filter(item => ['DRAFT', 'ACTIVE'].includes(item.recordState)), [promises]);
  const history = useMemo(() => promises.filter(item => ['SUPERSEDED', 'WITHDRAWN'].includes(item.recordState)), [promises]);
  const promiseAssessment = assessment?.promises;
  const unapproved = useMemo(() => (promiseAssessment?.blockers || []).filter(item => item.code.includes('PROMISE_')), [promiseAssessment]);

  const openEdit = (promise?: CRMPromise) => {
    setError('');
    if (!promise) { setDraft(emptyDraft()); return; }
    setDraft({
      id: promise.id,
      mode: promise.recordState === 'DRAFT' ? 'edit-draft' : 'revision',
      promiseType: promise.promiseType,
      promiseText: promise.promiseText,
      internalContext: promise.internalContext || '',
      sourceType: promise.sourceType,
      sourceRecordId: promise.sourceRecordId || '',
      sourceMeetingId: promise.sourceMeetingId || '',
      sourceSummary: promise.sourceSummary || '',
      linkedRequirementId: promise.linkedRequirementId || '',
      linkedValidationId: promise.linkedValidationId || '',
      validationAlignmentStatus: promise.linkedValidationId ? promise.validationAlignmentStatus : 'NOT_REQUIRED',
    });
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (draft.promiseText.trim().length < 6) { setError('Add the exact Promise wording before saving.'); return; }
    setBusy('save'); setError('');
    try {
      if (draft.mode === 'revision' && draft.id) {
        await crmSalesScopeCommitmentService.revisePromise({ promiseId: draft.id, promiseText: draft.promiseText, internalContext: draft.internalContext || null, sourceType: draft.sourceType, sourceRecordId: draft.sourceRecordId || null, sourceMeetingId: draft.sourceMeetingId || null, sourceSummary: draft.sourceSummary || null, linkedRequirementId: draft.linkedRequirementId || null, linkedValidationId: draft.linkedValidationId || null, validationAlignmentStatus: draft.linkedValidationId ? draft.validationAlignmentStatus : 'NOT_REQUIRED' });
        setDraft(null); await onChanged('Promise revision draft created.');
      } else {
        await crmSalesScopeCommitmentService.savePromiseDraft({ promiseId: draft.id || null, leadId, opportunityId, promiseType: draft.promiseType, promiseText: draft.promiseText, internalContext: draft.internalContext || null, sourceType: draft.sourceType, sourceRecordId: draft.sourceRecordId || null, sourceMeetingId: draft.sourceMeetingId || null, sourceSummary: draft.sourceSummary || null, linkedRequirementId: draft.linkedRequirementId || null, linkedValidationId: draft.linkedValidationId || null, validationAlignmentStatus: draft.linkedValidationId ? draft.validationAlignmentStatus : 'NOT_REQUIRED' });
        setDraft(null); await onChanged(draft.id ? 'Promise draft updated.' : 'Promise draft saved as internal preparation.');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Promise draft could not be saved.'); }
    finally { setBusy(''); }
  };

  const runDialog = async (payload: { confirmed: boolean; reason: string }) => {
    if (!dialog) return;
    const active = dialog; setBusy('dialog'); setError('');
    try {
      await crmSalesScopeCommitmentService.transitionPromise({ promiseId: active.promise.id, action: active.kind === 'activate' ? 'ACTIVATE' : 'WITHDRAW', clientCommunicated: active.kind === 'activate' ? payload.confirmed : false, reason: payload.reason || null });
      setDialog(null);
      await onChanged(active.kind === 'activate' ? 'Promise recorded as an actual client commitment.' : 'Promise withdrawn with history preserved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Promise lifecycle action failed.'); }
    finally { setBusy(''); }
  };

  const openValidation = () => {
    const element = document.getElementById('crm-sales-validation');
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.dispatchEvent(new CustomEvent('crm-readiness-navigate', { detail: { target: 'validation' } }));
  };

  return <section id="crm-promise-register" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Promise Register">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><MessageSquareWarning className="h-4 w-4" />Promise Register<SellerGuidanceHelp guidance={getScopeCommitmentGuidance('promise_register')} /></div><p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-600">Record material commitments ProFox actually communicated to the client. This is commitment truth—not a place for client requests, Seller hypotheses, package recommendations, or internal preparation.</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${promiseAssessment?.status === 'READY' || promiseAssessment?.status === 'NO_ACTIVE_PROMISES' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : promiseAssessment?.status === 'BLOCKED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{promiseAssessment?.status || 'NOT EVALUATED'}</span><button type="button" onClick={() => openEdit()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white"><Plus className="h-4 w-4" />New Promise draft</button></div></div>

    <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><div className="flex items-center gap-1 text-xs font-black text-amber-950">Internal preparation is not a Promise<SellerGuidanceHelp guidance={getScopeCommitmentGuidance('promise_register')} /></div><p className="mt-1 text-[11px] leading-5 text-amber-900">Keep planned wording as <strong>DRAFT</strong>. Record an <strong>ACTIVE</strong> Promise only when ProFox actually communicated the commitment to the client. If a real commitment was made without required approval, record the truth and let readiness block it—do not hide it.</p></div></div></div>

    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Active" value={promiseAssessment?.activeCount ?? current.filter(x => x.recordState === 'ACTIVE').length} /><Metric label="Internal drafts" value={promiseAssessment?.draftCount ?? current.filter(x => x.recordState === 'DRAFT').length} /><Metric label="Unapproved" value={promiseAssessment?.unapprovedCount ?? 0} danger={(promiseAssessment?.unapprovedCount || 0) > 0} /><Metric label="Validation issues" value={(promiseAssessment?.validationRequiredCount || 0) + (promiseAssessment?.validationConflictCount || 0)} danger={((promiseAssessment?.validationRequiredCount || 0) + (promiseAssessment?.validationConflictCount || 0)) > 0} /></div>

    {unapproved.length > 0 && <div className="mt-4 rounded-xl border-2 border-rose-300 bg-rose-50 p-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-rose-800"><AlertOctagon className="h-4 w-4" />Unapproved commitment — proposal readiness blocked<SellerGuidanceHelp guidance={getScopeCommitmentGuidance('unapproved_commitment')} /></div><ul className="mt-2 space-y-2">{unapproved.map((item, index) => <li key={`${item.code}-${index}`} className="rounded-lg border border-rose-200 bg-white p-2.5 text-xs leading-5 text-rose-800"><div className="font-bold">{item.message}</div>{item.approvedConstraints && <div className="mt-1"><span className="font-black">Approved constraints:</span> {item.approvedConstraints}</div>}{item.action?.target === 'validation' && <button type="button" onClick={openValidation} className="mt-2 min-h-9 rounded-lg border border-rose-200 px-3 text-[11px] font-black text-rose-700">Open Sales Validation</button>}</li>)}</ul></div>}

    {draft && <PromiseEditor draft={draft} setDraft={setDraft} requirements={requirements} validations={validations} meetings={meetings} busy={busy === 'save'} onSave={() => void saveDraft()} onCancel={() => { setDraft(null); setError(''); }} />}
    {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{error}</div>}

    <div className="mt-5 space-y-3">{current.length === 0 && !draft ? <div className="rounded-xl border border-dashed border-slate-200 px-4 py-7 text-center text-xs text-slate-500">No Promise records yet. That is valid when no material commitment has actually been communicated.</div> : current.map(promise => <PromiseCard key={promise.id} promise={promise} onEdit={() => openEdit(promise)} onActivate={() => setDialog({ kind: 'activate', promise })} onWithdraw={() => setDialog({ kind: 'withdraw', promise })} onOpenValidation={openValidation} />)}</div>

    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-1 text-xs font-black text-slate-800">Future quotation reconciliation<SellerGuidanceHelp guidance={getScopeCommitmentGuidance('future_quote')} /></div><p className="mt-1 text-[11px] leading-5 text-slate-600">Part 9 does not claim quotation coverage or activate the final send gate.</p><div className="mt-2 flex flex-wrap gap-2">{(assessment?.futureQuoteCoverage || [{ key: 'PROMISE_COVERAGE', status: 'NOT_YET_EVALUATED' }, { key: 'FINAL_SCOPE_RECONCILIATION', status: 'NOT_YET_EVALUATED' }, { key: 'QUOTATION_SNAPSHOT_COVERAGE', status: 'NOT_YET_EVALUATED' }]).map(item => <span key={item.key} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-black text-slate-600">{item.key.replaceAll('_', ' ')} · {item.status}</span>)}</div></div>

    <div className="mt-5 border-t border-slate-100 pt-4"><button type="button" onClick={() => setHistoryOpen(value => !value)} aria-expanded={historyOpen} className="inline-flex min-h-9 items-center gap-2 text-xs font-black text-slate-600">{historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<History className="h-4 w-4" />History ({history.length})</button>{historyOpen && <div className="mt-3 space-y-2">{history.length ? history.map(promise => <PromiseCard key={promise.id} promise={promise} historical onEdit={() => undefined} onActivate={() => undefined} onWithdraw={() => undefined} onOpenValidation={openValidation} />) : <div className="text-xs text-slate-400">No historical Promise records.</div>}</div>}</div>

    <CRMConsequentialActionDialog open={Boolean(dialog)} title={dialog?.kind === 'activate' ? 'Record this Promise?' : 'Withdraw this Promise?'} description={dialog?.kind === 'activate' ? 'Recording makes this a current material commitment in CRM truth. Approval integrity is evaluated separately; a real but unapproved commitment will remain visible and block Proposal Readiness.' : 'Withdrawal preserves the original commitment and audit trail. It does not claim that the client accepted removal of the obligation.'} confirmLabel={dialog?.kind === 'activate' ? 'Record Promise' : 'Withdraw Promise'} confirmTone={dialog?.kind === 'withdraw' ? 'danger' : 'primary'} requiredCheckboxLabel={dialog?.kind === 'activate' ? 'Did ProFox actually communicate this commitment to the client?' : undefined} requireReason={dialog?.kind === 'withdraw'} reasonLabel="Withdrawal reason" guidance={getScopeCommitmentGuidance(dialog?.kind === 'activate' ? 'promise_confirm' : 'promise_register')} busy={busy === 'dialog'} onCancel={() => !busy && setDialog(null)} onConfirm={runDialog} />
  </section>;
}

function Metric({ label: metricLabel, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className={`rounded-xl border p-3 ${danger ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}><div className={`text-lg font-black ${danger ? 'text-rose-700' : 'text-slate-950'}`}>{value}</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{metricLabel}</div></div>; }

function PromiseEditor({ draft, setDraft, requirements, validations, meetings, busy, onSave, onCancel }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft | null>>; requirements: CRMScopeSourceRequirement[]; validations: CRMScopeValidation[]; meetings: CRMScopeMeeting[]; busy: boolean; onSave: () => void; onCancel: () => void }) {
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(previous => previous ? { ...previous, [key]: value } : previous);
  return <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-1 text-xs font-black text-slate-900">{draft.mode === 'revision' ? 'Create history-safe Promise revision' : draft.mode === 'edit-draft' ? 'Edit Promise draft' : 'New Promise draft'}<SellerGuidanceHelp guidance={getScopeCommitmentGuidance('promise_source')} /></div><p className="mt-1 text-[11px] leading-5 text-slate-500">Saving remains internal preparation. “Record Promise” is a separate action that requires explicit confirmation of actual client communication.</p></div><button type="button" onClick={onCancel} aria-label="Close editor" className="h-9 w-9 rounded-lg text-slate-500 hover:bg-white"><X className="mx-auto h-4 w-4" /></button></div>
    <div className="mt-3 grid gap-3 md:grid-cols-2"><Field labelText="Promise type"><select disabled={draft.mode === 'revision'} value={draft.promiseType} onChange={e => update('promiseType', e.target.value as CRMPromiseType)} className="part9-input">{TYPES.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></Field><Field labelText="Source / evidence" help="promise_source"><select value={draft.sourceType} onChange={e => { const value = e.target.value as CRMPromiseSourceType; update('sourceType', value); if (value !== 'MEETING') update('sourceMeetingId', ''); }} className="part9-input">{SOURCES.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></Field></div>
    <Field labelText="Exact Promise wording" wide><textarea value={draft.promiseText} onChange={e => update('promiseText', e.target.value)} rows={4} maxLength={6000} className="part9-input resize-y" placeholder="Use the exact material commitment—not a request, hypothesis, or sales intention." /></Field>
    <Field labelText="Internal context" wide><textarea value={draft.internalContext} onChange={e => update('internalContext', e.target.value)} rows={2} maxLength={3000} className="part9-input resize-y" placeholder="Optional internal context. This does not prove client communication." /></Field>
    <div className="grid gap-3 md:grid-cols-2">{draft.sourceType === 'MEETING' ? <Field labelText="Completed Sales meeting"><select value={draft.sourceMeetingId} onChange={e => update('sourceMeetingId', e.target.value)} className="part9-input"><option value="">Choose Meeting…</option>{meetings.map(item => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></Field> : <Field labelText="Source record / reference"><input value={draft.sourceRecordId} onChange={e => update('sourceRecordId', e.target.value)} maxLength={240} className="part9-input" placeholder="Email/thread/CRM reference, if available" /></Field>}<Field labelText="Source summary / communication evidence"><input value={draft.sourceSummary} onChange={e => update('sourceSummary', e.target.value)} maxLength={2000} className="part9-input" placeholder="Where/when was this communicated?" /></Field></div>
    <div className="grid gap-3 md:grid-cols-2"><Field labelText="Linked Requirement"><select value={draft.linkedRequirementId} onChange={e => update('linkedRequirementId', e.target.value)} className="part9-input"><option value="">No linked Requirement</option>{requirements.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field><Field labelText="Linked Sales Validation"><select value={draft.linkedValidationId} onChange={e => { update('linkedValidationId', e.target.value); update('validationAlignmentStatus', e.target.value ? 'PENDING' : 'NOT_REQUIRED'); }} className="part9-input"><option value="">No linked Validation</option>{validations.map(item => <option key={item.id} value={item.id}>{label(item.validationType)} · {item.status}</option>)}</select></Field></div>
    {draft.linkedValidationId && <Field labelText="Validation alignment" help="condition_validation" wide><select value={draft.validationAlignmentStatus === 'NOT_REQUIRED' ? 'PENDING' : draft.validationAlignmentStatus} onChange={e => update('validationAlignmentStatus', e.target.value as CRMValidationAlignmentStatus)} className="part9-input">{ALIGNMENT.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></Field>}
    <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600">Cancel</button><button type="button" disabled={busy} onClick={onSave} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{draft.mode === 'revision' ? 'Create revision draft' : 'Save internal draft'}</button></div>
    <style>{`.part9-input{min-height:40px;width:100%;border:1px solid rgb(203 213 225);border-radius:.75rem;background:white;padding:.6rem .75rem;font-size:.75rem;color:rgb(15 23 42);outline:none}.part9-input:focus{border-color:#000080;box-shadow:0 0 0 2px rgb(219 234 254)}.part9-input:disabled{background:rgb(241 245 249);color:rgb(100 116 139)}`}</style>
  </div>;
}

function Field({ labelText, children, wide = false, help }: { labelText: string; children: React.ReactNode; wide?: boolean; help?: string }) { return <label className={`mt-3 block text-[11px] font-black text-slate-700 ${wide ? 'md:col-span-2' : ''}`}><span className="flex items-center gap-1">{labelText}{help && <SellerGuidanceHelp guidance={getScopeCommitmentGuidance(help)} />}</span><div className="mt-1.5">{children}</div></label>; }

function PromiseCard({ promise, historical = false, onEdit, onActivate, onWithdraw, onOpenValidation }: { promise: CRMPromise; historical?: boolean; onEdit: () => void; onActivate: () => void; onWithdraw: () => void; onOpenValidation: () => void }) {
  const sourceSafe = promise.sourceType !== 'INTERNAL_DRAFT';
  return <article className={`rounded-xl border p-3 ${promise.recordState === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50/30' : historical ? 'border-slate-200 bg-slate-50/70' : 'border-amber-200 bg-amber-50/30'}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${stateTone(promise.recordState)}`}>{promise.recordState}</span><span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label(promise.promiseType)}</span>{promise.recordState === 'DRAFT' && <span className="text-[10px] font-black text-amber-700">INTERNAL ONLY — NOT YET A CLIENT PROMISE</span>}</div><p className="mt-2 whitespace-pre-wrap text-sm font-black leading-6 text-slate-950">{promise.promiseText}</p><div className="mt-3 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-2"><div><span className="font-black text-slate-700">Source:</span> {label(promise.sourceType)}{promise.sourceMeetingTitle ? ` · ${promise.sourceMeetingTitle}` : promise.sourceSummary ? ` · ${promise.sourceSummary}` : ''}</div>{promise.recordState === 'ACTIVE' ? <div><span className="font-black text-slate-700">Promised by / at:</span> {promise.promisedByName || 'Authorized Seller'} · {fmt(promise.promisedAt)}</div> : <div><span className="font-black text-slate-700">Draft recorded:</span> {promise.recordedByName || 'Authorized Seller'} · {fmt(promise.recordedAt)}</div>}{promise.sourceSummary && <div className="sm:col-span-2"><span className="font-black text-slate-700">Communication evidence:</span> {promise.sourceSummary}</div>}{promise.internalContext && <div className="sm:col-span-2"><span className="font-black text-slate-700">Internal context:</span> {promise.internalContext}</div>}{promise.linkedRequirementTitle && <div><span className="font-black text-slate-700">Requirement:</span> {promise.linkedRequirementTitle}</div>}{promise.linkedValidationId && <div className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-2"><span className="font-black text-[#000080]">Validation:</span> {label(promise.linkedValidationType || 'linked')} · {promise.linkedValidationStatus || 'Unknown'} · Alignment {label(promise.validationAlignmentStatus)}{promise.approvedConstraints && <div className="mt-1"><span className="font-black">Approved constraints:</span> {promise.approvedConstraints}</div>}<button type="button" onClick={onOpenValidation} className="mt-1 font-black text-[#000080] underline">Open Sales Validation</button></div>}{promise.withdrawalReason && <div className="sm:col-span-2"><span className="font-black text-slate-700">Withdrawal:</span> {promise.withdrawalReason}</div>}<div className="sm:col-span-2"><span className="font-black text-slate-700">Future quote coverage:</span> {promise.futureQuoteCoverage || 'NOT_YET_EVALUATED'}</div></div>{promise.recordState === 'ACTIVE' && !sourceSafe && <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] font-black text-rose-700"><ShieldAlert className="h-4 w-4" />Active commitment source requires review.</div>}</div>{!historical && <div className="flex shrink-0 flex-wrap gap-2">{promise.recordState === 'DRAFT' && <><button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-600"><Pencil className="h-3.5 w-3.5" />Edit draft</button><button type="button" onClick={onActivate} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#000080] px-3 text-[11px] font-black text-white"><CheckCircle2 className="h-3.5 w-3.5" />Record Promise</button></>}{promise.recordState === 'ACTIVE' && <button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-[#000080]"><Pencil className="h-3.5 w-3.5" />Create revision</button>}<button type="button" onClick={onWithdraw} className="min-h-9 rounded-lg border border-rose-200 bg-white px-3 text-[11px] font-black text-rose-700">Withdraw</button></div>}</div></article>;
}
