import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  Save,
  UserRound,
  XCircle,
} from 'lucide-react';
import type { CRMLead } from '../../../types';
import {
  CRMDiscoveryQuestion,
  CRMDiscoveryResponse,
  CRMInformationCertainty,
  CRMRequirement,
  CRMSalesDiscoveryWorkspace,
  crmSalesDiscoveryService,
} from '../../../lib/crmSalesDiscoveryService';
import { getDiscoveryQuestionConfiguration, hasMeaningfulDiscoveryStructuredValue } from '../../../lib/crmDiscoveryUtils';
import { getCertaintyGuidance, getQuestionClassGuidance, getSellerGuidance } from '../../../lib/crmSellerGuidance';
import { meetingService, SalesMeeting } from '../../../lib/meetingService';
import {
  chooseDefaultManagedMeeting,
  deriveMeetingLearnedToday,
  deriveMeetingOpenQuestions,
  getMeetingManagementCandidates,
  getMeetingManagementPhase,
  meetingCustomerRecapComplete,
} from '../../../lib/crmMeetingManagementUtils';
import {
  CERTAINTY_LABELS,
  ClientVoiceDraft,
  ClientVoiceForm,
  QuestionAnswerPanel,
  ResponseDraft,
  emptyClientVoice,
  normalizeDraft,
  responseDraft,
} from './CRMDiscoveryWorkspace';
import SellerGuidanceHelp from './SellerGuidanceHelp';

type CloseoutDraft = {
  outcome: string;
  requirementsSummary: string;
  problemsIdentified: string;
  decisionMakers: string;
  commercialNotes: string;
  timelineNotes: string;
  nextStep: string;
  followUpAt: string;
};

type CustomerRecapDraft = {
  customerSummary: string;
  customerNextStep: string;
  customerNextStepTiming: string;
};

export type CRMMeetingManagementWorkspaceProps = {
  lead: CRMLead;
  ownerName?: string;
  refreshKey?: string;
  onChanged?: (message: string) => Promise<void> | void;
  onScheduleMeeting: () => void;
  onOpenMeetingPrep: () => void;
  onViewRequirements: () => void;
  onViewDiscovery: () => void;
};

const phaseLabels = {
  UPCOMING: 'Upcoming',
  MEETING_TIME: 'Meeting time',
  NEEDS_CLOSEOUT: 'Needs close-out',
  COMPLETED: 'Completed',
  NO_SHOW: 'No Show',
} as const;

const phaseTone = {
  UPCOMING: 'border-sky-200 bg-sky-50 text-sky-700',
  MEETING_TIME: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  NEEDS_CLOSEOUT: 'border-amber-200 bg-amber-50 text-amber-800',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  NO_SHOW: 'border-slate-200 bg-slate-100 text-slate-700',
} as const;

const questionTone: Record<string, string> = {
  CORE: 'border-[#000080]/20 bg-[#000080]/5 text-[#000080]',
  RECOMMENDED: 'border-sky-200 bg-sky-50 text-sky-700',
  CONDITIONAL: 'border-amber-200 bg-amber-50 text-amber-800',
  COMPLEX: 'border-violet-200 bg-violet-50 text-violet-700',
};

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Not recorded';

const toLocalInput = (value?: string) => value ? new Date(value).toISOString().slice(0, 16) : '';
const fromLocalInput = (value: string) => value ? new Date(value).toISOString() : undefined;

const closeoutFor = (meeting: SalesMeeting): CloseoutDraft => ({
  outcome: meeting.outcome,
  requirementsSummary: meeting.requirementsSummary,
  problemsIdentified: meeting.problemsIdentified,
  decisionMakers: meeting.decisionMakers,
  commercialNotes: meeting.commercialNotes,
  timelineNotes: meeting.timelineNotes,
  nextStep: meeting.nextStep,
  followUpAt: toLocalInput(meeting.followUpAt),
});

const recapFor = (meeting: SalesMeeting): CustomerRecapDraft => ({
  customerSummary: meeting.customerSummary,
  customerNextStep: meeting.customerNextStep,
  customerNextStepTiming: meeting.customerNextStepTiming,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function CRMMeetingManagementWorkspace({
  lead,
  ownerName,
  refreshKey,
  onChanged,
  onScheduleMeeting,
  onOpenMeetingPrep,
  onViewRequirements,
  onViewDiscovery,
}: CRMMeetingManagementWorkspaceProps) {
  const [workspace, setWorkspace] = useState<CRMSalesDiscoveryWorkspace | null>(null);
  const [meetings, setMeetings] = useState<SalesMeeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'recap' | 'complete' | 'no-show' | 'launch' | 'voice' | ''>('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [closeout, setCloseout] = useState<CloseoutDraft | null>(null);
  const [savedCloseout, setSavedCloseout] = useState<CloseoutDraft | null>(null);
  const [recap, setRecap] = useState<CustomerRecapDraft | null>(null);
  const [savedRecap, setSavedRecap] = useState<CustomerRecapDraft | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [responseEdit, setResponseEdit] = useState<ResponseDraft | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<ClientVoiceDraft>(() => emptyClientVoice());

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    mode === 'refresh' ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const nextWorkspace = await crmSalesDiscoveryService.getWorkspace({ leadId: lead.id });
      const nextMeetings = await meetingService.listCRMMeetings({ leadId: lead.id, opportunityId: nextWorkspace.opportunityId });
      setWorkspace(nextWorkspace);
      setMeetings(nextMeetings);
      setSelectedMeetingId(previous => nextMeetings.some(meeting => meeting.id === previous)
        ? previous
        : chooseDefaultManagedMeeting(nextMeetings)?.id ?? '');
    } catch {
      setError('Meeting Management could not be loaded. Check CRM access and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lead.id]);

  useEffect(() => {
    setWorkspace(null);
    setMeetings([]);
    setSelectedMeetingId('');
    setCloseout(null);
    setSavedCloseout(null);
    setRecap(null);
    setSavedRecap(null);
    setEditingQuestionId(null);
    setResponseEdit(null);
    setVoiceOpen(false);
    setVoiceDraft(emptyClientVoice());
    setActionError('');
    void load('initial');
  }, [load, refreshKey]);

  const candidates = useMemo(() => getMeetingManagementCandidates(meetings), [meetings]);
  const meeting = useMemo(() => meetings.find(item => item.id === selectedMeetingId) ?? null, [meetings, selectedMeetingId]);
  const prep = useMemo(() => workspace?.meetingPreparations.find(item => item.meetingId === selectedMeetingId) ?? null, [workspace, selectedMeetingId]);

  useEffect(() => {
    if (!meeting) return;
    const nextCloseout = closeoutFor(meeting);
    const nextRecap = recapFor(meeting);
    setCloseout(nextCloseout);
    setSavedCloseout(nextCloseout);
    setRecap(nextRecap);
    setSavedRecap(nextRecap);
    setEditingQuestionId(null);
    setResponseEdit(null);
    setVoiceOpen(false);
    setVoiceDraft(emptyClientVoice());
    setActionError('');
  }, [meeting?.id, meeting?.updatedAt]);

  const closeoutDirty = Boolean(closeout && savedCloseout && !same(closeout, savedCloseout));
  const recapDirty = Boolean(recap && savedRecap && !same(recap, savedRecap));
  const dirty = closeoutDirty || recapDirty || Boolean(editingQuestionId) || voiceOpen;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const responseByQuestion = useMemo(() => new Map((workspace?.responses ?? []).map(response => [response.question_id, response])), [workspace]);
  const questionById = useMemo(() => new Map((workspace?.questions ?? []).map(question => [question.id, question])), [workspace]);
  const activeRequirements = useMemo(() => (workspace?.requirements ?? []).filter(requirement => requirement.record_state === 'ACTIVE'), [workspace]);
  const requirementByKey = useMemo(() => new Map(activeRequirements.map(requirement => [requirement.requirement_key, requirement])), [activeRequirements]);
  const definitionByKey = useMemo(() => new Map((workspace?.requirementDefinitions ?? []).map(definition => [definition.requirementKey, definition])), [workspace]);
  const selectedQuestions = useMemo(() => (prep?.selectedQuestionIds ?? []).map(id => questionById.get(id)).filter((question): question is CRMDiscoveryQuestion => Boolean(question)), [prep, questionById]);
  const openQuestions = useMemo(() => workspace ? deriveMeetingOpenQuestions(workspace, prep?.selectedQuestionIds ?? []) : [], [workspace, prep]);
  const learnedToday = useMemo(() => workspace && meeting ? deriveMeetingLearnedToday(meeting.id, workspace.responses, workspace.clientVoice, closeout?.outcome) : [], [workspace, meeting, closeout?.outcome]);
  const currentMeetingVoice = useMemo(() => (workspace?.clientVoice ?? []).filter(entry => entry.meeting_id === selectedMeetingId), [workspace, selectedMeetingId]);

  const switchMeeting = (id: string) => {
    if (id === selectedMeetingId) return;
    if (dirty && !window.confirm('You have unsaved Meeting Management work. Switch meetings and discard those unsaved changes?')) return;
    setSelectedMeetingId(id);
  };

  const refresh = async () => {
    if (dirty && !window.confirm('Refresh Meeting Management and discard unsaved changes?')) return;
    await load('refresh');
  };

  const saveDraft = async () => {
    if (!meeting || !closeout) return;
    setBusy('draft'); setActionError('');
    try {
      await meetingService.saveCloseoutDraft(meeting.id, {
        outcome: closeout.outcome,
        requirementsSummary: closeout.requirementsSummary,
        problemsIdentified: closeout.problemsIdentified,
        decisionMakers: closeout.decisionMakers,
        commercialNotes: closeout.commercialNotes,
        timelineNotes: closeout.timelineNotes,
        nextStep: closeout.nextStep,
        followUpAt: fromLocalInput(closeout.followUpAt),
      });
      await load('refresh');
      await onChanged?.('Meeting close-out draft saved.');
    } catch {
      setActionError('The close-out draft could not be saved. Your unsaved notes are still here.');
    } finally { setBusy(''); }
  };

  const saveRecap = async () => {
    if (!meeting || !recap) return;
    if (!window.confirm(meeting.status === 'Completed'
      ? 'This is customer-facing content. Saving a complete reviewed recap after completion may queue the existing reviewed customer follow-up and replace a pending fallback. Save this reviewed content?'
      : 'This is customer-facing content. If the meeting is later completed, the existing post-meeting automation may use this reviewed recap. Save it?')) return;
    setBusy('recap'); setActionError('');
    try {
      await meetingService.saveCustomerFollowup(meeting.id, recap);
      await load('refresh');
      await onChanged?.('Customer-safe meeting recap saved after Seller review.');
    } catch {
      setActionError('The customer-safe recap could not be saved. Your unsaved text is still here.');
    } finally { setBusy(''); }
  };

  const saveResponse = async (question: CRMDiscoveryQuestion) => {
    if (!workspace || !meeting || !responseEdit) return;
    const normalized = normalizeDraft(responseEdit);
    if (normalized.state === 'ANSWERED' && !normalized.answer.trim() && !hasMeaningfulDiscoveryStructuredValue(normalized.structuredValue)) {
      setActionError('An Answered question needs actual content before it can be saved.'); return;
    }
    setBusy('draft'); setActionError('');
    try {
      await crmSalesDiscoveryService.saveResponse({
        leadId: workspace.leadId,
        questionId: question.id,
        meetingId: meeting.id,
        questionState: normalized.state,
        answerText: normalized.answer.trim() || null,
        structuredValue: normalized.structuredValue,
        informationCertainty: normalized.certainty,
        followUpRequired: normalized.followUp,
        source: { type: 'SALES_MEETING', recordId: meeting.id, recordedAt: new Date().toISOString() },
      });
      setEditingQuestionId(null); setResponseEdit(null); await load('refresh'); await onChanged?.('Meeting Discovery answer saved.');
    } catch {
      setActionError('This Discovery answer could not be saved. Your unsaved answer is still here.');
    } finally { setBusy(''); }
  };

  const saveVoice = async () => {
    if (!workspace || !meeting || !voiceDraft.customerStatement.trim()) { setActionError('Record what the client said before saving Client Voice.'); return; }
    setBusy('voice'); setActionError('');
    try {
      await crmSalesDiscoveryService.saveClientVoice({
        leadId: workspace.leadId,
        meetingId: meeting.id,
        customerStatement: voiceDraft.customerStatement.trim(),
        sellerInterpretation: voiceDraft.sellerInterpretation.trim() || null,
        linkedRequirementId: voiceDraft.linkedRequirementId || null,
        informationCertainty: voiceDraft.certainty,
        source: { type: 'SALES_MEETING', recordId: meeting.id, recordedAt: new Date().toISOString() },
      });
      setVoiceDraft(emptyClientVoice()); setVoiceOpen(false); await load('refresh'); await onChanged?.('Meeting Client Voice saved.');
    } catch {
      setActionError('Client Voice could not be saved. Your unsaved text is still here.');
    } finally { setBusy(''); }
  };

  const launch = async () => {
    if (!meeting) return;
    setBusy('launch'); setActionError('');
    try {
      const url = await meetingService.getLaunchUrl(meeting.id);
      if (!url) { setActionError('No authorized meeting launch URL is available yet.'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { setActionError('The secure meeting launch URL could not be loaded.'); }
    finally { setBusy(''); }
  };

  const finalize = async (status: 'Completed' | 'No Show') => {
    if (!meeting || !closeout) return;
    if (closeoutDirty) { setActionError('Save the close-out draft before finalizing the meeting.'); return; }
    if (recapDirty) { setActionError('Save or discard the customer-safe recap changes before finalizing. Unsaved recap text is never sent automatically.'); return; }
    const recapComplete = meetingCustomerRecapComplete(meeting);
    const message = status === 'Completed'
      ? `Complete this meeting?\n\nStatus → Completed\nOutcome: ${closeout.outcome || 'Missing'}\nNext Step: ${closeout.nextStep || 'Missing'}\nFollow-Up: ${closeout.followUpAt ? formatDate(fromLocalInput(closeout.followUpAt)) : 'Missing'}\nCustomer-safe recap: ${recapComplete ? 'Complete and reviewed' : 'Incomplete — existing fallback safety may run'}\nOpen Discovery gaps: ${openQuestions.length}\n\nThis does NOT advance the Pipeline automatically.`
      : 'Mark this meeting No Show?\n\nThe meeting will close as No Show. The existing No Show Follow-Up automation may create the dedicated follow-up task, notify the Seller, and send the existing customer rebooking communication. No generic Meeting Follow-Up will be created by Part 5.';
    if (!window.confirm(message)) return;
    setBusy(status === 'Completed' ? 'complete' : 'no-show'); setActionError('');
    try {
      await meetingService.finalize(meeting.id, {
        status,
        outcome: closeout.outcome,
        requirementsSummary: closeout.requirementsSummary,
        problemsIdentified: closeout.problemsIdentified,
        decisionMakers: closeout.decisionMakers,
        commercialNotes: closeout.commercialNotes,
        timelineNotes: closeout.timelineNotes,
        nextStep: closeout.nextStep,
        followUpAt: fromLocalInput(closeout.followUpAt),
      });
      await load('refresh');
      await onChanged?.(status === 'Completed' ? 'Meeting completed and close-out recorded.' : 'Meeting marked No Show through the existing meeting workflow.');
    } catch {
      setActionError(status === 'Completed'
        ? 'The server did not accept completion. Confirm Outcome, Next Step and Follow-Up timing for an active CRM deal.'
        : 'The meeting could not be marked No Show. It may already be closed or you may not have permission.');
    } finally { setBusy(''); }
  };

  if (loading && !workspace) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div>;
  if (error && !workspace) return <ErrorState message={error} onRetry={() => void load('initial')} />;
  if (!meeting || !workspace) return <section className="rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm"><CalendarCheck2 className="mx-auto h-9 w-9 text-[#000080]" /><h3 className="mt-3 text-base font-black text-slate-900">No sales meeting is available for management.</h3><p className="mt-2 text-xs text-slate-500">Meeting Management reuses the existing Sales meeting schedule. Schedule the meeting first.</p><button type="button" onClick={onScheduleMeeting} className="mt-5 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white">Schedule meeting</button></section>;

  const phase = getMeetingManagementPhase(meeting);
  const closed = meeting.status === 'Completed' || meeting.status === 'No Show';
  const ownerLabel = meeting.salespersonId === lead.salespersonId && ownerName ? ownerName : 'Assigned meeting Seller';
  const prepObjective = prep?.preparation?.meeting_objective?.trim() || 'Not recorded';
  const prepAdvance = prep?.preparation?.intended_advance?.trim() || 'Not recorded';
  const activeGroups: Array<[string, CRMInformationCertainty]> = [['Client Confirmed', 'CLIENT_CONFIRMED'], ['Awaiting Client', 'AWAITING_CLIENT'], ['Needs Specialist Validation', 'NEEDS_SPECIALIST_VALIDATION']];

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-[.14em] text-[#000080]">Meeting Management</span><SellerGuidanceHelp guidance={getSellerGuidance('section.meeting_management')} /><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${phaseTone[phase]}`}>{phaseLabels[phase]}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black text-slate-600">{meeting.status}</span></div><h3 className="mt-2 break-words text-lg font-black text-slate-950">{meeting.title}</h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500"><span>{meeting.meetingType}</span><span>{formatDate(meeting.startAt)}</span><span>{meeting.timezone}</span><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{ownerLabel}</span></div></div><div className="flex flex-wrap gap-2">{candidates.length > 1 && <select value={selectedMeetingId} onChange={event => switchMeeting(event.target.value)} className="h-10 max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700">{candidates.map(item => <option key={item.id} value={item.id}>{formatDate(item.startAt)} · {item.status} · {item.title}</option>)}</select>}<button type="button" disabled={refreshing} onClick={() => void refresh()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>{!closed && <button type="button" disabled={busy === 'launch'} onClick={() => void launch()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-3 text-xs font-black text-white">{busy === 'launch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}Join meeting</button>}</div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Mini label="Prep state" value={prep?.preparationState ?? 'NOT_STARTED'} /><Mini label="Meeting Objective" value={prepObjective} /><Mini label="Intended Advance" value={prepAdvance} /><Mini label="Selected questions" value={String(selectedQuestions.length)} /></div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={onOpenMeetingPrep} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-[#000080]">Open Meeting Prep</button>{prep?.preparationState !== 'READY' && <span className="self-center text-[10px] font-bold text-amber-700">Prep was not marked Ready. This is a quality warning, not a close-out blocker.</span>}</div>
    </section>

    {actionError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{actionError}</div>}
    {dirty && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-bold text-amber-900">Unsaved Meeting Management work is still in this drawer. Save it before switching meetings, refreshing or completing the meeting.</div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950">Selected questions</h3><p className="mt-1 text-xs text-slate-500">Part 4 questions are reused as the primary live Discovery list. Existing answers are shown so the client is not blindly asked again.</p></div><button type="button" onClick={onViewDiscovery} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black text-[#000080]">Open all Discovery</button></div><div className="mt-4 space-y-3">{selectedQuestions.map(question => { const response = responseByQuestion.get(question.id); const config = getDiscoveryQuestionConfiguration(question); return <article key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${questionTone[config.questionClass]}`}>{config.questionClass}</span><SellerGuidanceHelp guidance={getQuestionClassGuidance(config.questionClass)} /><span className="text-[10px] font-bold text-slate-400">{question.framework}</span></div><h4 className="mt-2 break-words text-sm font-black text-slate-900">{question.question_text}</h4><QuestionAnswerPanel question={question} response={response} editing={editingQuestionId === question.id} draft={editingQuestionId === question.id ? responseEdit : null} busy={busy === 'draft'} requirementByKey={requirementByKey} definitionByKey={definitionByKey} idPrefix={`meeting-${meeting.id}-`} onBeginEdit={() => { if (!closed) { setEditingQuestionId(question.id); setResponseEdit(responseDraft(response)); } }} onCancelEdit={() => { setEditingQuestionId(null); setResponseEdit(null); }} onDraftChange={setResponseEdit} onSave={() => void saveResponse(question)} onViewRequirements={onViewRequirements} /></article>; })}{selectedQuestions.length === 0 && <Empty text="No questions were selected in Meeting Prep. Use Open Meeting Prep to select the questions that matter." />}</div></section>

    <section className="grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-1 text-sm font-black text-slate-950"><MessageCircle className="h-4 w-4 text-[#000080]" />Client Voice<SellerGuidanceHelp guidance={getSellerGuidance('section.client_voice')} /></h3><p className="mt-1 text-xs text-slate-500">Capture what the client said separately from Seller interpretation. It does not auto-confirm a Requirement.</p></div>{!closed && <button type="button" onClick={() => { setVoiceDraft(emptyClientVoice()); setVoiceOpen(true); }} className="rounded-lg bg-[#000080] px-3 py-2 text-[10px] font-black text-white">Add Client Voice</button>}</div>{voiceOpen && <ClientVoiceForm draft={voiceDraft} requirements={activeRequirements} definitionByKey={definitionByKey} onChange={setVoiceDraft} onSave={() => void saveVoice()} onCancel={() => { setVoiceOpen(false); setVoiceDraft(emptyClientVoice()); }} busy={busy === 'voice'} editing={false} idPrefix={`meeting-${meeting.id}-voice`} />}<div className="mt-4 space-y-2">{currentMeetingVoice.map(entry => <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wide text-[#000080]">CLIENT SAID</div><p className="mt-1 whitespace-pre-wrap break-words text-xs font-semibold text-slate-900">{entry.customer_statement}</p><div className="mt-2 text-[9px] font-black uppercase tracking-wide text-slate-500">SELLER INTERPRETATION</div><p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-600">{entry.seller_interpretation || 'No interpretation recorded.'}</p><div className="mt-2 text-[10px] font-bold text-slate-400">{CERTAINTY_LABELS[entry.information_certainty]}<SellerGuidanceHelp guidance={getCertaintyGuidance(entry.information_certainty)} /></div></div>)}{currentMeetingVoice.length === 0 && <Empty text="No Client Voice has been linked to this meeting yet." />}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950">Requirements context</h3><p className="mt-1 text-xs text-slate-500">Structured Requirements remain canonical in crm_requirements. This is read-only context.</p></div><button type="button" onClick={onViewRequirements} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black text-[#000080]">Open Requirements</button></div><div className="mt-4 space-y-4">{activeGroups.map(([label, certainty]) => { const items = activeRequirements.filter(item => item.information_certainty === certainty); return <div key={certainty}><div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}<SellerGuidanceHelp guidance={getCertaintyGuidance(certainty)} /></div><div className="mt-2 space-y-2">{items.slice(0, 5).map(item => <RequirementRow key={item.id} item={item} />)}{!items.length && <div className="text-[10px] text-slate-400">None recorded.</div>}</div></div>; })}</div></div></section>

    <section className="grid gap-5 xl:grid-cols-2"><ContextList title="What we learned today" items={learnedToday.map(item => `${item.kind}: ${item.text}`)} empty="No meeting-linked Discovery, Client Voice or Outcome has been captured yet." /><ContextList title="Open questions" items={openQuestions.map(item => `${item.question.question_text} — ${item.reason}`)} empty="No selected/Core open questions are currently derived." /></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-1"><h3 className="text-sm font-black text-slate-950">Meeting close-out</h3><SellerGuidanceHelp guidance={getSellerGuidance('section.meeting_closeout')} /></div><p className="mt-1 text-xs leading-5 text-slate-500">Internal meeting documentation. These fields do not approve pricing, feasibility, Package Fit, Proposal Readiness or Pipeline movement.</p>{closeout && <div className="mt-4 grid gap-4 lg:grid-cols-2"><TextArea label="Outcome" value={closeout.outcome} disabled={closed} guidance="field.meeting_outcome" onChange={value => setCloseout({ ...closeout, outcome: value })} /><TextArea label="Problems / Needs" value={closeout.problemsIdentified} disabled={closed} guidance="field.problems_identified" onChange={value => setCloseout({ ...closeout, problemsIdentified: value })} /><TextArea label="Requirements Summary" value={closeout.requirementsSummary} disabled={closed} onChange={value => setCloseout({ ...closeout, requirementsSummary: value })} /><TextArea label="Decision Makers" value={closeout.decisionMakers} disabled={closed} guidance="field.decision_makers" onChange={value => setCloseout({ ...closeout, decisionMakers: value })} /><TextArea label="Commercial Notes" value={closeout.commercialNotes} disabled={closed} guidance="field.commercial_notes" onChange={value => setCloseout({ ...closeout, commercialNotes: value })} /><TextArea label="Timeline Notes" value={closeout.timelineNotes} disabled={closed} guidance="field.timeline_notes" onChange={value => setCloseout({ ...closeout, timelineNotes: value })} /><TextArea label="Next Step" value={closeout.nextStep} disabled={closed} guidance="field.next_step" onChange={value => setCloseout({ ...closeout, nextStep: value })} /><label className="block"><span className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Follow-Up Time<SellerGuidanceHelp guidance={getSellerGuidance('field.follow_up_at')} /></span><input type="datetime-local" value={closeout.followUpAt} disabled={closed} onChange={event => setCloseout({ ...closeout, followUpAt: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm disabled:opacity-60" /></label></div>}{!closed && <div className="mt-4 flex justify-end"><button type="button" disabled={!closeoutDirty || busy !== ''} onClick={() => void saveDraft()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save close-out draft<SellerGuidanceHelp guidance={getSellerGuidance('action.save_closeout_draft')} /></button></div>}</section>

    <section className="rounded-2xl border border-sky-200 bg-sky-50/40 p-5 shadow-sm"><h3 className="text-sm font-black text-slate-950">Customer-safe recap</h3><p className="mt-1 text-xs font-semibold leading-5 text-sky-900">CUSTOMER-FACING. The existing post-meeting communication automation may use this reviewed content. Never copy private Seller notes, hypotheses, technical concerns, discount judgment or internal interpretation into it.</p>{recap && <div className="mt-4 grid gap-4 lg:grid-cols-2"><TextArea label="Customer Summary" value={recap.customerSummary} disabled={meeting.status === 'No Show'} guidance="field.customer_summary" onChange={value => setRecap({ ...recap, customerSummary: value })} /><TextArea label="Customer Next Step" value={recap.customerNextStep} disabled={meeting.status === 'No Show'} guidance="field.customer_next_step" onChange={value => setRecap({ ...recap, customerNextStep: value })} /><TextArea label="Customer Timing" value={recap.customerNextStepTiming} disabled={meeting.status === 'No Show'} guidance="field.customer_next_step_timing" onChange={value => setRecap({ ...recap, customerNextStepTiming: value })} /></div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-[10px] font-bold text-slate-500">AI suggestions, if used elsewhere, must never save or send this content without Seller review.</span>{meeting.status !== 'No Show' && <button type="button" disabled={!recapDirty || busy !== ''} onClick={() => void saveRecap()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy === 'recap' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save reviewed recap<SellerGuidanceHelp guidance={getSellerGuidance('action.save_customer_recap')} /></button>}</div></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{closed ? <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /><div><h3 className="text-sm font-black text-slate-950">Meeting {meeting.status}</h3><p className="mt-1 text-xs text-slate-500">{meeting.completedAt ? `Completed ${formatDate(meeting.completedAt)}. ` : ''}The final meeting status is authoritative and core close-out fields are read-only here.</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><Mini label="Outcome" value={meeting.outcome || 'Not recorded'} /><Mini label="Next Step" value={meeting.nextStep || 'No further action recorded'} /><Mini label="Follow-Up" value={formatDate(meeting.followUpAt)} /></div></div></div> : <><div className="flex items-center gap-1"><h3 className="text-sm font-black text-slate-950">Complete meeting</h3><SellerGuidanceHelp guidance={getSellerGuidance('action.complete_meeting')} /></div><p className="mt-1 text-xs leading-5 text-slate-500">Completion records the meeting truth and may trigger the existing post-meeting communication/follow-up automation. It does not advance Pipeline or confirm all Requirements/Discovery.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy !== ''} onClick={() => void finalize('Completed')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busy === 'complete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Complete Meeting</button><button type="button" disabled={busy !== ''} onClick={() => void finalize('No Show')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black text-rose-700 disabled:opacity-50">{busy === 'no-show' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Mark No Show<SellerGuidanceHelp guidance={getSellerGuidance('action.mark_no_show')} /></button></div></>}</section>
  </div>;
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 whitespace-pre-wrap break-words text-xs font-bold leading-5 text-slate-700">{value}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-400">{text}</div>; }
function ContextList({ title, items, empty }: { title: string; items: string[]; empty: string }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-black text-slate-950">{title}</h3><div className="mt-3 space-y-2">{items.slice(0, 10).map((item, index) => <div key={`${title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">{item}</div>)}{!items.length && <Empty text={empty} />}</div></section>; }
function RequirementRow({ item }: { item: CRMRequirement }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><div className="text-xs font-black text-slate-800">{item.title}</div><div className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-4 text-slate-500">{item.content || 'Structured value captured.'}</div></div>; }
function TextArea({ label, value, disabled, guidance, onChange }: { label: string; value: string; disabled?: boolean; guidance?: string; onChange: (value: string) => void }) { return <label className="block"><span className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}{guidance && <SellerGuidanceHelp guidance={getSellerGuidance(guidance)} />}</span><textarea rows={4} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-800 disabled:opacity-60" /></label>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm" role="alert"><AlertTriangle className="mx-auto h-7 w-7 text-rose-600" /><h3 className="mt-3 text-sm font-black text-slate-900">Meeting Management unavailable</h3><p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">{message}</p><button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white"><RefreshCw className="h-4 w-4" />Retry</button></div>; }
