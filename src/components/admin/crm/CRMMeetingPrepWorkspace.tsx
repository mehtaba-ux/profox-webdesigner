import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Lightbulb,
  ListChecks,
  Loader2,
  NotebookPen,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { CRMLead } from '../../../types';
import {
  CRMDiscoveryQuestion,
  CRMJsonValue,
  CRMMeetingPreparationWorkspaceItem,
  CRMSalesDiscoveryWorkspace,
  crmSalesDiscoveryService,
} from '../../../lib/crmSalesDiscoveryService';
import { getDiscoveryQuestionConfiguration, hasMeaningfulDiscoveryAnswer } from '../../../lib/crmDiscoveryUtils';
import {
  buildMeetingPrepGaps,
  buildMeetingPrepKnownContext,
  buildRecommendedMeetingQuestions,
  getUpcomingMeetingsForPreparation,
  splitMeetingHypotheses,
} from '../../../lib/crmMeetingPrepUtils';
import {
  getDiscoveryQuestionGuidance,
  getQuestionClassGuidance,
  getSellerGuidance,
} from '../../../lib/crmSellerGuidance';
import SellerGuidanceHelp from './SellerGuidanceHelp';

export type CRMMeetingPrepWorkspaceProps = {
  lead: CRMLead;
  refreshKey?: string;
  onChanged?: (message: string) => Promise<void> | void;
  onScheduleMeeting: () => void;
  onViewRequirements: () => void;
  onViewDiscovery: () => void;
};

type PrepDraft = {
  meetingObjective: string;
  intendedAdvance: string;
  hypotheses: string[];
  sellerNotes: string;
  preservedHypotheses: CRMJsonValue[];
};

const stateTone: Record<string, string> = {
  NOT_STARTED: 'border-slate-200 bg-slate-50 text-slate-600',
  IN_PROGRESS: 'border-amber-200 bg-amber-50 text-amber-800',
  READY: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};
const classTone: Record<string, string> = {
  CORE: 'border-[#000080]/20 bg-[#000080]/5 text-[#000080]',
  RECOMMENDED: 'border-sky-200 bg-sky-50 text-sky-700',
  CONDITIONAL: 'border-amber-200 bg-amber-50 text-amber-800',
  COMPLEX: 'border-violet-200 bg-violet-50 text-violet-700',
};
const stateLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
const emptyDraft = (): PrepDraft => ({ meetingObjective: '', intendedAdvance: '', hypotheses: [], sellerNotes: '', preservedHypotheses: [] });

const draftForMeeting = (meeting?: CRMMeetingPreparationWorkspaceItem | null): PrepDraft => {
  const raw = Array.isArray(meeting?.preparation?.hypotheses) ? meeting?.preparation?.hypotheses ?? [] : [];
  const split = splitMeetingHypotheses(raw as unknown[]);
  return {
    meetingObjective: meeting?.preparation?.meeting_objective ?? '',
    intendedAdvance: meeting?.preparation?.intended_advance ?? '',
    hypotheses: split.editable,
    sellerNotes: meeting?.preparation?.seller_notes ?? '',
    preservedHypotheses: split.preserved as CRMJsonValue[],
  };
};

const sameDraft = (a: PrepDraft, b: PrepDraft) =>
  a.meetingObjective === b.meetingObjective
  && a.intendedAdvance === b.intendedAdvance
  && a.sellerNotes === b.sellerNotes
  && JSON.stringify(a.hypotheses) === JSON.stringify(b.hypotheses)
  && JSON.stringify(a.preservedHypotheses) === JSON.stringify(b.preservedHypotheses);

export default function CRMMeetingPrepWorkspace({
  lead,
  refreshKey,
  onChanged,
  onScheduleMeeting,
  onViewRequirements,
  onViewDiscovery,
}: CRMMeetingPrepWorkspaceProps) {
  const [workspace, setWorkspace] = useState<CRMSalesDiscoveryWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedMeetingId, setSelectedMeetingId] = useState('');
  const [draft, setDraft] = useState<PrepDraft>(() => emptyDraft());
  const [savedDraft, setSavedDraft] = useState<PrepDraft>(() => emptyDraft());
  const [questionDraft, setQuestionDraft] = useState<string[]>([]);
  const [savedQuestionIds, setSavedQuestionIds] = useState<string[]>([]);
  const [hypothesisText, setHypothesisText] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [showAllKnown, setShowAllKnown] = useState(false);
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [showQuestionCatalog, setShowQuestionCatalog] = useState(false);
  const [busy, setBusy] = useState<'prep' | 'questions' | 'ready' | ''>('');

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    mode === 'refresh' ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const next = await crmSalesDiscoveryService.getWorkspace({ leadId: lead.id });
      setWorkspace(next);
      const upcoming = getUpcomingMeetingsForPreparation(next.meetingPreparations);
      setSelectedMeetingId(previous => upcoming.some(meeting => meeting.meetingId === previous) ? previous : (upcoming[0]?.meetingId ?? ''));
    } catch {
      setError('Meeting Prep could not be loaded. Check your CRM access and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lead.id]);

  useEffect(() => {
    setWorkspace(null);
    setSelectedMeetingId('');
    setDraft(emptyDraft());
    setSavedDraft(emptyDraft());
    setQuestionDraft([]);
    setSavedQuestionIds([]);
    setQuestionSearch('');
    setHypothesisText('');
    setActionError('');
    setShowAllKnown(false);
    setShowAllGaps(false);
    setShowQuestionCatalog(false);
    void load('initial');
  }, [load, refreshKey]);

  const upcomingMeetings = useMemo(() => getUpcomingMeetingsForPreparation(workspace?.meetingPreparations ?? []), [workspace]);
  const selectedMeeting = useMemo(() => upcomingMeetings.find(meeting => meeting.meetingId === selectedMeetingId) ?? null, [upcomingMeetings, selectedMeetingId]);

  useEffect(() => {
    const nextDraft = draftForMeeting(selectedMeeting);
    const nextQuestions = selectedMeeting?.selectedQuestionIds ?? [];
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setQuestionDraft(nextQuestions);
    setSavedQuestionIds(nextQuestions);
    setHypothesisText('');
    setQuestionSearch('');
    setActionError('');
    setShowQuestionCatalog(false);
  }, [selectedMeetingId, selectedMeeting?.preparation?.updated_at, selectedMeeting?.preparedAt, selectedMeeting?.selectedQuestionIds.join('|')]);

  const prepDirty = !sameDraft(draft, savedDraft);
  const questionsDirty = useMemo(() => {
    const a = [...new Set(questionDraft)].sort();
    const b = [...new Set(savedQuestionIds)].sort();
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [questionDraft, savedQuestionIds]);
  const dirty = prepDirty || questionsDirty;

  const responseByQuestion = useMemo(() => new Map((workspace?.responses ?? []).map(response => [response.question_id, response])), [workspace]);
  const questionById = useMemo(() => new Map((workspace?.questions ?? []).map(question => [question.id, question])), [workspace]);
  const known = useMemo(() => workspace ? buildMeetingPrepKnownContext(lead, workspace) : [], [lead, workspace]);
  const gaps = useMemo(() => workspace ? buildMeetingPrepGaps(workspace) : [], [workspace]);
  const recommendations = useMemo(() => workspace ? buildRecommendedMeetingQuestions(workspace, questionDraft) : [], [workspace, questionDraft]);
  const selectedQuestions = useMemo(() => questionDraft.map(id => questionById.get(id)).filter((item): item is CRMDiscoveryQuestion => Boolean(item)), [questionDraft, questionById]);
  const filteredQuestions = useMemo(() => {
    const needle = questionSearch.trim().toLowerCase();
    return (workspace?.questions ?? []).filter(question => question.active && (!needle || [question.question_text, question.category, question.framework, getDiscoveryQuestionConfiguration(question).questionClass].some(value => value.toLowerCase().includes(needle))));
  }, [workspace, questionSearch]);

  const changeMeeting = (meetingId: string) => {
    if (meetingId === selectedMeetingId) return;
    if (dirty && !window.confirm('You have unsaved Meeting Prep changes. Switch meetings and discard those unsaved changes?')) return;
    setSelectedMeetingId(meetingId);
  };

  const refresh = async () => {
    if (dirty && !window.confirm('Refresh Meeting Prep and discard unsaved changes?')) return;
    await load('refresh');
  };

  const savePreparation = async () => {
    if (!selectedMeeting) return;
    setBusy('prep');
    setActionError('');
    try {
      await crmSalesDiscoveryService.saveMeetingPreparation({
        meetingId: selectedMeeting.meetingId,
        meetingObjective: draft.meetingObjective.trim() || null,
        intendedAdvance: draft.intendedAdvance.trim() || null,
        hypotheses: [...draft.preservedHypotheses, ...draft.hypotheses.map(item => item.trim()).filter(Boolean)],
        sellerNotes: draft.sellerNotes.trim() || null,
      });
      await load('refresh');
      await onChanged?.('Meeting Prep saved.');
    } catch {
      setActionError('Meeting Prep could not be saved. Your unsaved preparation is still here; review it and try again.');
    } finally {
      setBusy('');
    }
  };

  const saveQuestions = async () => {
    if (!selectedMeeting) return;
    setBusy('questions');
    setActionError('');
    try {
      await crmSalesDiscoveryService.setMeetingQuestions(selectedMeeting.meetingId, questionDraft);
      await load('refresh');
      await onChanged?.('Questions for this meeting updated.');
    } catch {
      setActionError('The meeting question set could not be saved. Your selection is still here; review it and try again.');
    } finally {
      setBusy('');
    }
  };

  const markReady = async () => {
    if (!selectedMeeting) return;
    if (prepDirty || questionsDirty) {
      setActionError('Save your current Meeting Prep changes before marking the preparation Ready.');
      return;
    }
    setBusy('ready');
    setActionError('');
    try {
      await crmSalesDiscoveryService.markMeetingPrepared(selectedMeeting.meetingId);
      await load('refresh');
      await onChanged?.('Meeting Prep marked Ready.');
    } catch {
      setActionError('Meeting Prep could not be marked Ready. Confirm the meeting is Scheduled/Rescheduled and that Objective and Intended Advance are saved.');
    } finally {
      setBusy('');
    }
  };

  const toggleQuestion = (questionId: string) => setQuestionDraft(current => current.includes(questionId) ? current.filter(id => id !== questionId) : [...current, questionId]);
  const addHypothesis = () => {
    const value = hypothesisText.trim();
    if (!value) return;
    setDraft(current => ({ ...current, hypotheses: [...current.hypotheses, value] }));
    setHypothesisText('');
  };

  if (loading && !workspace) return <div className="flex min-h-64 items-center justify-center" aria-live="polite"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /><span className="sr-only">Loading Meeting Prep</span></div>;
  if (error && !workspace) return <ErrorState message={error} onRetry={() => void load('initial')} />;

  if (!selectedMeeting) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
      <CalendarDays className="mx-auto h-9 w-9 text-[#000080]" />
      <div className="mt-3 flex items-center justify-center gap-1"><h3 className="text-base font-black text-slate-900">No upcoming sales meeting is available for preparation.</h3><SellerGuidanceHelp guidance={getSellerGuidance('section.meeting_prep')} /></div>
      <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">Meeting Prep reuses the existing Sales meeting schedule. Book the meeting first; no second calendar or Meeting record is created here.</p>
      <button type="button" onClick={onScheduleMeeting} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white"><CalendarDays className="h-4 w-4" />Schedule meeting</button>
    </section>;
  }

  const objectiveReady = draft.meetingObjective.trim().length > 0;
  const advanceReady = draft.intendedAdvance.trim().length > 0;
  const canMarkReady = objectiveReady && advanceReady && !prepDirty && !questionsDirty && selectedMeeting.preparationState !== 'READY';
  const knownVisible = showAllKnown ? known : known.slice(0, 6);
  const gapsVisible = showAllGaps ? gaps : gaps.slice(0, 6);

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><CalendarDays className="h-4 w-4" />Meeting Prep<SellerGuidanceHelp guidance={getSellerGuidance('section.meeting_prep')} /></div>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${stateTone[selectedMeeting.preparationState]}`}>{stateLabel(selectedMeeting.preparationState)}</span>
            <SellerGuidanceHelp guidance={getSellerGuidance('field.preparation_state')} />
          </div>
          <h3 className="mt-2 break-words text-lg font-black text-slate-950">{selectedMeeting.title}</h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500">
            <span>{formatDate(selectedMeeting.scheduledAt)}</span>
            <span>{selectedMeeting.status}</span>
            {selectedMeeting.meetingType && <span>{selectedMeeting.meetingType}</span>}
          </div>
          {selectedMeeting.preparedAt && <div className="mt-2 text-[10px] font-semibold text-emerald-700">Prepared {formatDate(selectedMeeting.preparedAt)}{selectedMeeting.preparedByName ? ` by ${selectedMeeting.preparedByName}` : ''}</div>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:items-end">
          {upcomingMeetings.length > 1 && <label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Meeting
            <select value={selectedMeetingId} onChange={event => changeMeeting(event.target.value)} className="mt-1 h-10 max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700">
              {upcomingMeetings.map(meeting => <option key={meeting.meetingId} value={meeting.meetingId}>{formatDate(meeting.scheduledAt)} · {meeting.title}</option>)}
            </select>
          </label>}
          <button type="button" disabled={refreshing} onClick={() => void refresh()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
      </div>
      {selectedMeeting.preparationState === 'READY' && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-bold leading-5 text-emerald-800">Ready means the Seller has reviewed preparation for this meeting. It does not mean Discovery, Requirements, technical validation, package fit, proposal readiness, quotation, payment, or Pipeline progression is complete.</div>}
    </section>

    {actionError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{actionError}</div>}
    {(prepDirty || questionsDirty) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-bold text-amber-900">Unsaved changes: {prepDirty ? 'preparation plan' : ''}{prepDirty && questionsDirty ? ' and ' : ''}{questionsDirty ? 'meeting questions' : ''}.</div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4"><div className="text-[10px] font-black uppercase tracking-[.13em] text-slate-500">Preparation plan</div><p className="mt-1 text-xs text-slate-500">Define the purpose of this meeting and the reasonable movement you want from it.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Meeting Objective" guidanceKey="field.meeting_objective" value={draft.meetingObjective} onChange={value => setDraft(current => ({ ...current, meetingObjective: value }))} placeholder="What specifically must this meeting accomplish?" />
        <Field label="Intended Advance" guidanceKey="field.intended_advance" value={draft.intendedAdvance} onChange={value => setDraft(current => ({ ...current, intendedAdvance: value }))} placeholder="What reasonable next commitment or movement should come from this meeting?" />
      </div>
      <div className="mt-4 flex justify-end"><button type="button" disabled={busy !== '' || !prepDirty} onClick={() => void savePreparation()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy === 'prep' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save preparation</button></div>
    </section>

    <div className="grid gap-5 xl:grid-cols-2">
      <ContextPanel title="What We Know" count={known.length} guidanceKey="section.what_we_know" description="Read-only context already captured so the client does not have to repeat themselves." onOpenPrimary={onViewRequirements} primaryLabel="Open Requirements" onOpenSecondary={onViewDiscovery} secondaryLabel="Open Discovery">
        {known.length === 0 ? <Empty text="No reliable captured context is available yet." /> : <div className="space-y-2">{knownVisible.map(item => <article key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex flex-wrap items-center gap-1.5"><span className="text-[9px] font-black uppercase tracking-wide text-slate-500">{item.label}</span><span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[8px] font-black text-slate-500">{item.certainty}</span></div><p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{item.value}</p><div className="mt-1 text-[9px] font-semibold text-slate-400">Source: {item.source}</div></article>)}{known.length > 6 && <ShowMore open={showAllKnown} onClick={() => setShowAllKnown(value => !value)} remaining={known.length - 6} />}</div>}
      </ContextPanel>
      <ContextPanel title="What We Still Need" count={gaps.length} guidanceKey="section.what_we_still_need" description="Prioritized unresolved information. Core gaps appear first; Conditional/Complex items appear only when relevant." onOpenPrimary={onViewDiscovery} primaryLabel="Open Discovery" onOpenSecondary={onViewRequirements} secondaryLabel="Open Requirements">
        {gaps.length === 0 ? <Empty text="No relevant unresolved gaps are currently surfaced." /> : <div className="space-y-2">{gapsVisible.map(gap => <article key={gap.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[8px] font-black ${classTone[gap.priority]}`}>{gap.priority}</span><span className="text-[9px] font-black text-slate-400">{gap.source}</span></div><div className="mt-1.5 break-words text-xs font-black text-slate-800">{gap.label}</div><p className="mt-1 text-[10px] leading-4 text-slate-500">{gap.detail}</p></article>)}{gaps.length > 6 && <ShowMore open={showAllGaps} onClick={() => setShowAllGaps(value => !value)} remaining={gaps.length - 6} />}</div>}
      </ContextPanel>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-1"><h3 className="text-sm font-black text-slate-900">Questions for this meeting</h3><SellerGuidanceHelp guidance={getSellerGuidance('section.meeting_questions')} /></div><p className="mt-1 text-xs leading-5 text-slate-500">Selection is preparation only. Actual answers remain in Probing & Discovery.</p></div>
        <button type="button" disabled={busy !== '' || !questionsDirty} onClick={() => void saveQuestions()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy === 'questions' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save question set</button>
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4"><div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[.12em] text-[#000080]"><Lightbulb className="h-4 w-4" />Recommended unresolved questions<SellerGuidanceHelp guidance={getSellerGuidance('section.recommended_questions')} /></div>{recommendations.length === 0 ? <p className="mt-2 text-xs text-slate-500">No additional relevant questions are currently recommended.</p> : <div className="mt-3 space-y-2">{recommendations.slice(0, 6).map(item => <QuestionRow key={item.question.id} question={item.question} response={item.response} note={item.reason} actionLabel="Add" onAction={() => toggleQuestion(item.question.id)} />)}</div>}</div>

      <div className="mt-4"><div className="mb-2 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Selected · {selectedQuestions.length}</div>{selectedQuestions.length === 0 ? <Empty text="No questions selected yet. Review the recommendations or search the existing Discovery catalog." /> : <div className="space-y-2">{selectedQuestions.map(question => <QuestionRow key={question.id} question={question} response={responseByQuestion.get(question.id)} actionLabel="Remove" onAction={() => toggleQuestion(question.id)} />)}</div>}</div>

      <div className="mt-4 border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowQuestionCatalog(value => !value)} aria-expanded={showQuestionCatalog} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-black text-slate-600"><Search className="h-4 w-4" />{showQuestionCatalog ? 'Hide question catalog' : 'Search question catalog'}</button>{showQuestionCatalog && <div className="mt-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={questionSearch} onChange={event => setQuestionSearch(event.target.value)} placeholder="Search existing Discovery questions…" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#000080]" /></div><div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">{filteredQuestions.map(question => <QuestionRow key={question.id} question={question} response={responseByQuestion.get(question.id)} actionLabel={questionDraft.includes(question.id) ? 'Remove' : 'Add'} onAction={() => toggleQuestion(question.id)} />)}</div></div>}</div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-5 xl:grid-cols-2">
        <div><div className="flex items-center gap-1"><h3 className="text-sm font-black text-slate-900">Seller Hypotheses</h3><SellerGuidanceHelp guidance={getSellerGuidance('field.seller_hypotheses')} /></div><p className="mt-1 text-xs leading-5 text-slate-500">Private working theories only. They are not Client Voice, Requirements, technical approval, or client-confirmed facts.</p><div className="mt-3 flex gap-2"><textarea rows={2} value={hypothesisText} onChange={event => setHypothesisText(event.target.value)} placeholder="Add a working theory to validate or reject in the meeting…" className="min-h-20 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-[#000080]" /><button type="button" onClick={addHypothesis} disabled={!hypothesisText.trim()} className="inline-flex min-h-10 self-end items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-[#000080] disabled:opacity-50"><Plus className="h-4 w-4" />Add</button></div><div className="mt-3 space-y-2">{draft.hypotheses.length === 0 ? <Empty text="No Seller hypotheses recorded. This is optional." /> : draft.hypotheses.map((value, index) => <div key={`${index}-${value}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[8px] font-black uppercase tracking-wide text-amber-800">SELLER HYPOTHESIS</div><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-amber-950">{value}</p></div><button type="button" onClick={() => setDraft(current => ({ ...current, hypotheses: current.hypotheses.filter((_, itemIndex) => itemIndex !== index) }))} className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-amber-700" aria-label="Remove Seller hypothesis"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>{draft.preservedHypotheses.length > 0 && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] font-semibold leading-4 text-slate-600">{draft.preservedHypotheses.length} existing structured hypothesis item(s) are preserved unchanged for backward compatibility.</div>}</div>
        <div><div className="flex items-center gap-1"><h3 className="text-sm font-black text-slate-900">Private Seller Notes</h3><SellerGuidanceHelp guidance={getSellerGuidance('field.private_seller_notes')} /></div><p className="mt-1 text-xs leading-5 text-slate-500">Internal preparation notes. Do not store passwords, API secrets, private keys, recovery codes, card information, or authentication credentials.</p><textarea rows={10} value={draft.sellerNotes} onChange={event => setDraft(current => ({ ...current, sellerNotes: event.target.value }))} placeholder="Internal notes for preparing this meeting…" className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 outline-none focus:border-[#000080]" /><p className="mt-2 text-[9px] leading-4 text-slate-400">Seller Notes are treated as supplemental and do not invalidate READY by themselves. Objective, Intended Advance, hypotheses, and selected-question changes do invalidate READY server-side.</p></div>
      </div>
      <div className="mt-4 flex justify-end"><button type="button" disabled={busy !== '' || !prepDirty} onClick={() => void savePreparation()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy === 'prep' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Seller preparation</button></div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-1"><h3 className="text-sm font-black text-slate-900">Preparation readiness</h3><SellerGuidanceHelp guidance={getSellerGuidance('action.mark_prep_ready')} /></div>
      <p className="mt-1 text-xs leading-5 text-slate-500">The checklist helps you review preparation. The server remains authoritative for READY.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <CheckItem complete={objectiveReady && !prepDirty} label="Meeting Objective defined" />
        <CheckItem complete={advanceReady && !prepDirty} label="Intended Advance defined" />
        <ReviewItem label={known.length ? `${known.length} known context item(s) available to review` : 'No known context captured yet'} />
        <ReviewItem label={gaps.length ? `${gaps.length} important gap(s) available to review` : 'No current gaps surfaced'} />
        <ReviewItem label={selectedQuestions.length ? `${selectedQuestions.length} meeting question(s) selected` : 'Review recommended questions'} />
        <ReviewItem label={draft.hypotheses.length ? `${draft.hypotheses.length} Seller hypothesis item(s) to validate` : 'Hypotheses optional when not needed'} />
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><div className="text-[10px] leading-5 text-slate-500">Required server rules: authorized Seller/Admin, Scheduled/Rescheduled meeting, saved Meeting Objective, and saved Intended Advance.</div><button type="button" disabled={busy !== '' || !canMarkReady} onClick={() => void markReady()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF0E0E] px-5 text-xs font-black text-white disabled:opacity-40">{busy === 'ready' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{selectedMeeting.preparationState === 'READY' ? 'Prep Ready' : 'Mark Prep Ready'}</button></div>
    </section>
  </div>;
}

function Field({ label, guidanceKey, value, onChange, placeholder }: { label: string; guidanceKey: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block text-xs font-black text-slate-700"><span className="flex items-center gap-1">{label}<SellerGuidanceHelp guidance={getSellerGuidance(guidanceKey)} /></span><textarea rows={4} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium leading-5 outline-none focus:border-[#000080]" /></label>;
}

function ContextPanel({ title, count, guidanceKey, description, children, onOpenPrimary, primaryLabel, onOpenSecondary, secondaryLabel }: { title: string; count: number; guidanceKey: string; description: string; children: React.ReactNode; onOpenPrimary: () => void; primaryLabel: string; onOpenSecondary: () => void; secondaryLabel: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-1"><h3 className="text-sm font-black text-slate-900">{title}</h3><SellerGuidanceHelp guidance={getSellerGuidance(guidanceKey)} /></div><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-500">{count}</span></div><div className="mt-4">{children}</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onOpenPrimary} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-[#000080]">{primaryLabel}</button><button type="button" onClick={onOpenSecondary} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600">{secondaryLabel}</button></div></section>;
}

function QuestionRow({ question, response, note, actionLabel, onAction }: { question: CRMDiscoveryQuestion; response?: CRMSalesDiscoveryWorkspace['responses'][number]; note?: string; actionLabel: string; onAction: () => void }) {
  const config = getDiscoveryQuestionConfiguration(question);
  const answered = response?.question_state === 'ANSWERED' && hasMeaningfulDiscoveryAnswer(response);
  return <article className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full border px-2 py-0.5 text-[8px] font-black ${classTone[config.questionClass]}`}>{config.questionClass}</span><SellerGuidanceHelp guidance={getQuestionClassGuidance(config.questionClass)} /><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[8px] font-black text-slate-500">{stateLabel(question.framework)}</span>{response && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[8px] font-black text-slate-500">{stateLabel(response.question_state)}</span>}</div><div className="mt-1.5 flex items-start gap-1"><p className="break-words text-xs font-black leading-5 text-slate-800">{question.question_text}</p><SellerGuidanceHelp guidance={getDiscoveryQuestionGuidance(question)} /></div>{note && <p className="mt-1 text-[10px] font-semibold leading-4 text-[#000080]">{note}</p>}{answered && response?.answer_text && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[10px] leading-4 text-slate-500">Current answer: {response.answer_text}</p>}</div><button type="button" onClick={onAction} className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[9px] font-black text-[#000080]">{actionLabel}</button></div></article>;
}

function CheckItem({ complete, label }: { complete: boolean; label: string }) {
  return <div className={`flex min-h-12 items-center gap-2 rounded-xl border p-3 text-[10px] font-bold ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{complete ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}{label}</div>;
}
function ReviewItem({ label }: { label: string }) {
  return <div className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] font-bold text-slate-600"><Clock3 className="h-4 w-4 shrink-0" />{label}</div>;
}
function ShowMore({ open, onClick, remaining }: { open: boolean; onClick: () => void; remaining: number }) {
  return <button type="button" onClick={onClick} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-500">{open ? 'Show less' : `Show ${remaining} more`}</button>;
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">{text}</div>;
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm" role="alert"><AlertTriangle className="mx-auto h-7 w-7 text-rose-600" /><h3 className="mt-3 text-sm font-black text-slate-900">Meeting Prep unavailable</h3><p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">{message}</p><button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white"><RefreshCw className="h-4 w-4" />Retry</button></div>;
}
