import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ChevronDown, ChevronRight, CircleHelp, Edit3, Link2, Loader2, MessageCircle, MessageSquareText, Plus, RefreshCw, Save, X } from 'lucide-react';
import {
  CRM_DISCOVERY_FRAMEWORKS,
  CRM_DISCOVERY_QUESTION_STATES,
  CRM_INFORMATION_CERTAINTY,
  CRM_REQUIREMENT_MANUAL_SOURCE,
  CRMClientVoiceEntry,
  CRMDiscoveryFramework,
  CRMDiscoveryQuestion,
  CRMDiscoveryQuestionState,
  CRMDiscoveryResponse,
  CRMInformationCertainty,
  CRMJsonValue,
  CRMRequirement,
  CRMSalesDiscoveryWorkspace,
  crmSalesDiscoveryService,
} from '../../../lib/crmSalesDiscoveryService';
import {
  calculateDiscoveryCoverage,
  createCustomDiscoveryQuestionKey,
  getDiscoveryQuestionConfiguration,
  hasMeaningfulDiscoveryAnswer,
  hasMeaningfulDiscoveryStructuredValue,
  isAdditionalDiscoveryQuestionRelevant,
} from '../../../lib/crmDiscoveryUtils';
import {
  SellerGuidanceEntry,
  getCertaintyGuidance,
  getDiscoveryQuestionGuidance,
  getDiscoveryStateGuidance,
  getQuestionClassGuidance,
  getSellerGuidance,
} from '../../../lib/crmSellerGuidance';
import SellerGuidanceHelp from './SellerGuidanceHelp';

export type CRMDiscoveryWorkspaceProps = {
  leadId?: string;
  opportunityId?: string;
  refreshKey?: string;
  onChanged?: (message: string) => Promise<void> | void;
  onViewRequirements?: () => void;
};

type DiscoveryFilter = 'all' | 'not_asked' | 'answered' | 'follow_up' | 'awaiting' | 'validation' | 'custom';
type ResponseDraft = { state: CRMDiscoveryQuestionState; answer: string; certainty: CRMInformationCertainty; followUp: boolean; structuredValue: CRMJsonValue | null };
type CustomQuestionDraft = { question: string; category: string; framework: CRMDiscoveryFramework; purpose: string; answer: string };
type ClientVoiceDraft = { customerStatement: string; sellerInterpretation: string; linkedRequirementId: string; certainty: CRMInformationCertainty };

const FILTERS: Array<{ id: DiscoveryFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'not_asked', label: 'Not asked' }, { id: 'answered', label: 'Answered' },
  { id: 'follow_up', label: 'Needs follow-up' }, { id: 'awaiting', label: 'Awaiting client' },
  { id: 'validation', label: 'Needs validation' }, { id: 'custom', label: 'Custom' },
];
const SECTION_LABELS: Record<string, string> = {
  SITUATION: 'Situation', PROBLEM: 'Problem', IMPACT: 'Impact', DESIRED_OUTCOME: 'Desired outcome', AUDIENCE: 'Audience', PROJECT: 'Project',
  CONTENT: 'Content', BRAND: 'Brand', COMMERCIAL: 'Timeline / Budget', DECISION: 'Decision process', COMPLEX: 'Complex deal', INTEGRATIONS: 'Integrations',
  ECOMMERCE: 'E-commerce', BOOKING: 'Booking', SEO: 'SEO', ANALYTICS: 'Analytics', TECHNICAL: 'Technical', CUSTOM_APP: 'Custom app', RISKS: 'Risks / dependencies', CUSTOM: 'Custom',
};
const CUSTOM_CATEGORIES = [
  ['SITUATION_BUSINESS', 'Situation / Business'], ['PROBLEM', 'Problem'], ['IMPACT', 'Impact'], ['DESIRED_OUTCOME', 'Desired outcome'], ['AUDIENCE', 'Audience'],
  ['PROJECT_SCOPE', 'Project / Scope'], ['CONTENT', 'Content'], ['BRAND', 'Brand'], ['COMMERCIAL_TIMELINE', 'Commercial / Timeline'], ['DECISION_PROCESS', 'Decision process'],
  ['INTEGRATIONS', 'Integrations'], ['ECOMMERCE', 'E-commerce'], ['BOOKING', 'Booking'], ['SEO', 'SEO'], ['ANALYTICS', 'Analytics'], ['TECHNICAL', 'Technical'],
  ['CUSTOM_APPLICATION', 'Custom application'], ['RISKS_DEPENDENCIES', 'Risks / Dependencies'],
] as const;
const SECTION_GROUPS = [
  { key: 'conversation', label: 'Core conversation', sections: ['SITUATION', 'PROBLEM', 'IMPACT', 'DESIRED_OUTCOME'] },
  { key: 'scope', label: 'Scope', sections: ['AUDIENCE', 'PROJECT', 'CONTENT', 'BRAND'] },
  { key: 'commercial', label: 'Commercial', sections: ['COMMERCIAL', 'DECISION', 'COMPLEX'] },
  { key: 'advanced', label: 'Technical / Conditional', sections: ['INTEGRATIONS', 'ECOMMERCE', 'BOOKING', 'SEO', 'ANALYTICS', 'TECHNICAL', 'CUSTOM_APP', 'RISKS', 'CUSTOM'] },
];
const QUESTION_STATE_LABELS: Record<CRMDiscoveryQuestionState, string> = {
  NOT_ASKED: 'Not asked', ASKED: 'Asked', ANSWERED: 'Answered', NEEDS_FOLLOW_UP: 'Needs follow-up', NOT_APPLICABLE: 'Not applicable',
};
const CERTAINTY_LABELS: Record<CRMInformationCertainty, string> = {
  CLIENT_CONFIRMED: 'Client confirmed', SELLER_OBSERVATION: 'Seller observation', SELLER_HYPOTHESIS: 'Seller hypothesis', AWAITING_CLIENT: 'Awaiting client',
  NEEDS_SPECIALIST_VALIDATION: 'Needs specialist validation', NOT_APPLICABLE: 'Not applicable',
};
const QUESTION_CLASS_TONE: Record<string, string> = {
  CORE: 'border-[#000080]/20 bg-[#000080]/5 text-[#000080]', RECOMMENDED: 'border-sky-200 bg-sky-50 text-sky-700',
  CONDITIONAL: 'border-amber-200 bg-amber-50 text-amber-800', COMPLEX: 'border-violet-200 bg-violet-50 text-violet-700',
};
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
const humanize = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
const sourceLabel = (source?: string | null) => !source ? 'Source not recorded' : source === CRM_REQUIREMENT_MANUAL_SOURCE ? 'Manual Seller entry' : humanize(source);
const emptyCustomQuestion = (): CustomQuestionDraft => ({ question: '', category: 'PROJECT_SCOPE', framework: 'CUSTOM', purpose: '', answer: '' });
const emptyClientVoice = (): ClientVoiceDraft => ({ customerStatement: '', sellerInterpretation: '', linkedRequirementId: '', certainty: 'SELLER_OBSERVATION' });
const responseDraft = (response?: CRMDiscoveryResponse): ResponseDraft => ({ state: response?.question_state ?? 'ASKED', answer: response?.answer_text ?? '', certainty: response?.information_certainty ?? 'AWAITING_CLIENT', followUp: response?.follow_up_required ?? false, structuredValue: response?.structured_value ?? null });
const clientVoiceDraft = (entry: CRMClientVoiceEntry): ClientVoiceDraft => ({ customerStatement: entry.customer_statement, sellerInterpretation: entry.seller_interpretation ?? '', linkedRequirementId: entry.linked_requirement_id ?? '', certainty: entry.information_certainty });
const normalizeDraft = (draft: ResponseDraft): ResponseDraft => {
  if (draft.state === 'NOT_APPLICABLE' || draft.certainty === 'NOT_APPLICABLE') return { ...draft, state: 'NOT_APPLICABLE', certainty: 'NOT_APPLICABLE', followUp: false };
  if (draft.state === 'NEEDS_FOLLOW_UP') return { ...draft, followUp: true };
  return draft;
};

export default function CRMDiscoveryWorkspace({ leadId, opportunityId, refreshKey, onChanged, onViewRequirements }: CRMDiscoveryWorkspaceProps) {
  const [workspace, setWorkspace] = useState<CRMSalesDiscoveryWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const [showAdditional, setShowAdditional] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ResponseDraft | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [newCustom, setNewCustom] = useState<CustomQuestionDraft>(() => emptyCustomQuestion());
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customEdit, setCustomEdit] = useState<CustomQuestionDraft | null>(null);
  const [clientVoiceOpen, setClientVoiceOpen] = useState(false);
  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null);
  const [voiceDraft, setVoiceDraft] = useState<ClientVoiceDraft>(() => emptyClientVoice());

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!leadId && !opportunityId) { setWorkspace(null); setLoading(false); setError('A connected Lead or Opportunity is required to load Discovery.'); return; }
    mode === 'refresh' ? setRefreshing(true) : setLoading(true); setError('');
    try { setWorkspace(await crmSalesDiscoveryService.getWorkspace({ leadId, opportunityId })); }
    catch { setError('Discovery could not be loaded. Check your CRM access and try again.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [leadId, opportunityId]);

  useEffect(() => {
    setWorkspace(null); setEditingQuestionId(null); setDraft(null); setCustomOpen(false); setNewCustom(emptyCustomQuestion()); setEditingCustomId(null); setCustomEdit(null);
    setClientVoiceOpen(false); setEditingVoiceId(null); setVoiceDraft(emptyClientVoice()); setShowAdditional(false); setFilter('all'); setActionError(''); void load('initial');
  }, [load, refreshKey]);

  const activeQuestions = useMemo(() => (workspace?.questions ?? []).filter(question => question.active), [workspace]);
  const responseByQuestion = useMemo(() => new Map((workspace?.responses ?? []).map(response => [response.question_id, response])), [workspace]);
  const activeRequirements = useMemo(() => (workspace?.requirements ?? []).filter(requirement => requirement.record_state === 'ACTIVE'), [workspace]);
  const requirementByKey = useMemo(() => new Map(activeRequirements.map(requirement => [requirement.requirement_key, requirement])), [activeRequirements]);
  const definitionByKey = useMemo(() => new Map((workspace?.requirementDefinitions ?? []).filter(item => item.active).map(item => [item.requirementKey, item])), [workspace]);
  const coverage = useMemo(() => calculateDiscoveryCoverage(activeQuestions, workspace?.responses ?? []), [activeQuestions, workspace]);
  const standardQuestions = useMemo(() => activeQuestions.filter(question => !question.is_custom && question.lead_id === null), [activeQuestions]);
  const customQuestions = useMemo(() => activeQuestions.filter(question => question.is_custom && question.lead_id === workspace?.leadId), [activeQuestions, workspace?.leadId]);

  const matchesFilter = useCallback((question: CRMDiscoveryQuestion) => {
    const response = responseByQuestion.get(question.id);
    if (filter === 'custom') return question.is_custom;
    if (question.is_custom) return filter === 'all';
    if (filter === 'not_asked') return !response || response.question_state === 'NOT_ASKED';
    if (filter === 'answered') return response?.question_state === 'ANSWERED' && hasMeaningfulDiscoveryAnswer(response);
    if (filter === 'follow_up') return response?.question_state === 'NEEDS_FOLLOW_UP' || Boolean(response?.follow_up_required);
    if (filter === 'awaiting') return response?.information_certainty === 'AWAITING_CLIENT';
    if (filter === 'validation') return response?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION';
    return true;
  }, [filter, responseByQuestion]);
  const coreQuestions = useMemo(() => standardQuestions.filter(question => getDiscoveryQuestionConfiguration(question).questionClass === 'CORE' && matchesFilter(question)), [standardQuestions, matchesFilter]);
  const additionalQuestions = useMemo(() => standardQuestions.filter(question => getDiscoveryQuestionConfiguration(question).questionClass !== 'CORE' && matchesFilter(question)), [standardQuestions, matchesFilter]);
  const relevantAdditionalCount = useMemo(() => additionalQuestions.filter(question => isAdditionalDiscoveryQuestionRelevant(question, activeRequirements, responseByQuestion.get(question.id))).length, [additionalQuestions, activeRequirements, responseByQuestion]);
  const visibleCustomQuestions = useMemo(() => customQuestions.filter(matchesFilter), [customQuestions, matchesFilter]);

  const saveResponse = async (question: CRMDiscoveryQuestion) => {
    if (!workspace || !draft) return;
    const normalized = normalizeDraft(draft); const existing = responseByQuestion.get(question.id);
    if (normalized.state === 'ANSWERED' && !normalized.answer.trim() && !hasMeaningfulDiscoveryStructuredValue(normalized.structuredValue)) { setActionError('An Answered question needs an actual answer before it can be saved.'); return; }
    setBusyKey(question.id); setActionError('');
    try {
      await crmSalesDiscoveryService.saveResponse({
        leadId: workspace.leadId, questionId: question.id, meetingId: existing?.meeting_id ?? null, questionState: normalized.state,
        answerText: normalized.answer.trim() || null, structuredValue: normalized.structuredValue, informationCertainty: normalized.certainty,
        followUpRequired: normalized.followUp, source: { type: CRM_REQUIREMENT_MANUAL_SOURCE, recordId: existing?.source_record_id ?? null, recordedAt: new Date().toISOString() },
      });
      setEditingQuestionId(null); setDraft(null); await load('refresh'); await onChanged?.('Discovery answer saved.');
    } catch { setActionError('This discovery answer could not be saved. Your unsaved answer is still here; review it and try again.'); }
    finally { setBusyKey(''); }
  };

  const addCustomQuestion = async () => {
    if (!workspace || !newCustom.question.trim()) { setActionError('Custom question text is required.'); return; }
    const questionKey = createCustomDiscoveryQuestionKey(activeQuestions.map(item => item.question_key)); setBusyKey('custom-new'); setActionError('');
    try {
      const created = await crmSalesDiscoveryService.saveQuestion({ leadId: workspace.leadId, questionKey, category: newCustom.category, questionText: newCustom.question.trim(), purpose: newCustom.purpose.trim() || null, framework: newCustom.framework, applicability: { questionClass: 'RECOMMENDED', relatedRequirementKeys: [], section: 'CUSTOM' }, isCustom: true });
      if (newCustom.answer.trim()) await crmSalesDiscoveryService.saveResponse({ leadId: workspace.leadId, questionId: created.id, questionState: 'ANSWERED', answerText: newCustom.answer.trim(), structuredValue: null, informationCertainty: 'AWAITING_CLIENT', followUpRequired: false, source: { type: CRM_REQUIREMENT_MANUAL_SOURCE, recordedAt: new Date().toISOString() } });
      setNewCustom(emptyCustomQuestion()); setCustomOpen(false); await load('refresh'); await onChanged?.('Custom discovery question added.');
    } catch { setActionError('The custom question could not be fully saved. Your draft is still here; review it and try again.'); }
    finally { setBusyKey(''); }
  };

  const saveCustomQuestion = async (question: CRMDiscoveryQuestion) => {
    if (!workspace || !question.is_custom || !customEdit?.question.trim()) { setActionError('Custom question text is required.'); return; }
    setBusyKey(`custom-edit-${question.id}`); setActionError('');
    try {
      await crmSalesDiscoveryService.saveQuestion({ id: question.id, leadId: workspace.leadId, questionKey: question.question_key, category: customEdit.category, questionText: customEdit.question.trim(), purpose: customEdit.purpose.trim() || null, framework: customEdit.framework, active: question.active, sortOrder: question.sort_order, applicability: question.applicability, isCustom: true });
      setEditingCustomId(null); setCustomEdit(null); await load('refresh'); await onChanged?.('Custom discovery question updated.');
    } catch { setActionError('The custom question could not be saved. Your unsaved changes are still here.'); }
    finally { setBusyKey(''); }
  };

  const deactivateCustomQuestion = async (question: CRMDiscoveryQuestion) => {
    if (!workspace || !question.is_custom || !window.confirm(`Deactivate “${question.question_text}”? Existing discovery history will be retained.`)) return;
    setBusyKey(`custom-archive-${question.id}`); setActionError('');
    try {
      await crmSalesDiscoveryService.saveQuestion({ id: question.id, leadId: workspace.leadId, questionKey: question.question_key, category: question.category, questionText: question.question_text, purpose: question.purpose, framework: question.framework, active: false, sortOrder: question.sort_order, applicability: question.applicability, isCustom: true });
      await load('refresh'); await onChanged?.('Custom discovery question deactivated.');
    } catch { setActionError('The custom question could not be deactivated. Try again.'); }
    finally { setBusyKey(''); }
  };

  const saveClientVoice = async () => {
    if (!workspace || !voiceDraft.customerStatement.trim()) { setActionError('Record what the client said before saving Client Voice.'); return; }
    const existing = editingVoiceId ? workspace.clientVoice.find(entry => entry.id === editingVoiceId) : undefined;
    setBusyKey(editingVoiceId ? `voice-${editingVoiceId}` : 'voice-new'); setActionError('');
    try {
      await crmSalesDiscoveryService.saveClientVoice({ id: existing?.id, leadId: workspace.leadId, meetingId: existing?.meeting_id ?? null, customerStatement: voiceDraft.customerStatement.trim(), sellerInterpretation: voiceDraft.sellerInterpretation.trim() || null, linkedRequirementId: voiceDraft.linkedRequirementId || null, informationCertainty: voiceDraft.certainty, source: { type: CRM_REQUIREMENT_MANUAL_SOURCE, recordId: existing?.source_record_id ?? null, recordedAt: new Date().toISOString() } });
      setEditingVoiceId(null); setVoiceDraft(emptyClientVoice()); setClientVoiceOpen(false); await load('refresh'); await onChanged?.('Client Voice saved.');
    } catch { setActionError('Client Voice could not be saved. Your unsaved text is still here; review it and try again.'); }
    finally { setBusyKey(''); }
  };

  if (loading && !workspace) return <div className="flex min-h-64 items-center justify-center" aria-live="polite"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /><span className="sr-only">Loading Probing and Discovery</span></div>;
  if (error && !workspace) return <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm" role="alert"><AlertTriangle className="mx-auto h-7 w-7 text-rose-600" /><h3 className="mt-3 text-sm font-black text-slate-900">Discovery unavailable</h3><p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">{error}</p><button type="button" onClick={() => void load('initial')} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"><RefreshCw className="h-4 w-4" />Retry</button></div>;
  if (!workspace) return null;

  const shared = { responseByQuestion, requirementByKey, definitionByKey, editingQuestionId, draft, busyKey, onBeginEdit: (question: CRMDiscoveryQuestion, response?: CRMDiscoveryResponse) => { setEditingQuestionId(question.id); setDraft(responseDraft(response)); setActionError(''); }, onCancelEdit: () => { setEditingQuestionId(null); setDraft(null); setActionError(''); }, onDraftChange: setDraft, onSave: (question: CRMDiscoveryQuestion) => void saveResponse(question), onViewRequirements };
  const renderGroups = (questions: CRMDiscoveryQuestion[], prefix: string) => SECTION_GROUPS.map(group => {
    const groupQuestions = questions.filter(question => group.sections.includes(getDiscoveryQuestionConfiguration(question).section));
    return groupQuestions.length ? <DiscoveryGroup key={`${prefix}-${group.key}`} title={group.label} questions={groupQuestions} {...shared} /> : null;
  });

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><MessageSquareText className="h-4 w-4" />Discovery<SellerGuidanceHelp guidance={getSellerGuidance('section.discovery')} /></div><div className="mt-2 text-lg font-black text-slate-950">{coverage.answeredCore + coverage.resolvedNotApplicableCore} / {coverage.totalCore} Core questions resolved</div><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Guide a natural consultative conversation. Capture facts first; Discovery is informational and does not create package, proposal, pipeline, quotation, payment, or Won decisions.</p></div><button type="button" disabled={refreshing} onClick={() => void load('refresh')} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button></div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5"><Metric label="Core answered" value={coverage.answeredCore} /><Metric label="Needs follow-up" value={coverage.needsFollowUp} /><Metric label="Awaiting client" value={coverage.awaitingClient} /><Metric label="Client Voice" value={workspace.clientVoice.length} /><Metric label="Needs validation" value={coverage.needsSpecialistValidation} /></div>
    </section>

    <div className="overflow-x-auto pb-1"><div className="flex min-w-max gap-2">{FILTERS.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-10 rounded-xl border px-3 text-[11px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080] ${filter === item.id ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{item.label}</button>)}</div></div>
    {actionError && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{actionError}</div>}

    {filter !== 'custom' && <section className="space-y-3" aria-label="Core discovery questions"><div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950">Core discovery</h3><p className="mt-1 text-xs text-slate-500">Prioritized questions for diagnosis before recommendation.</p></div><span className="text-[11px] font-bold text-slate-400">{coreQuestions.length} shown</span></div>{coreQuestions.length ? renderGroups(coreQuestions, 'core') : <EmptyState text="No Core questions match this filter." />}</section>}

    {filter !== 'custom' && <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><button type="button" aria-expanded={showAdditional} onClick={() => setShowAdditional(value => !value)} className="flex min-h-12 w-full items-center justify-between gap-3 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"><span><span className="block text-sm font-black text-slate-950">Additional discovery</span><span className="mt-0.5 block text-xs text-slate-500">Recommended, Conditional and Complex questions. {relevantAdditionalCount} currently look relevant; expand anytime to review all {additionalQuestions.length}.</span></span>{showAdditional ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />}</button>{showAdditional && <div className="space-y-3 border-t border-slate-100 p-4">{additionalQuestions.length ? renderGroups(additionalQuestions, 'additional') : <EmptyState text="No additional questions match this filter." />}</div>}</section>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="flex items-center gap-2 text-sm font-black text-slate-950"><CircleHelp className="h-4 w-4 text-[#000080]" />Custom questions<SellerGuidanceHelp guidance={getSellerGuidance('field.custom_question')} /></h3><p className="mt-1 text-xs text-slate-500">Lead-specific questions for context the standard playbook does not cover.</p></div><button type="button" onClick={() => { setCustomOpen(value => !value); setActionError(''); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#000080] px-3 text-[11px] font-black text-white"><Plus className="h-4 w-4" />Add custom question</button></div>
      {customOpen && <CustomQuestionForm draft={newCustom} onChange={setNewCustom} onSave={() => void addCustomQuestion()} onCancel={() => { setNewCustom(emptyCustomQuestion()); setCustomOpen(false); setActionError(''); }} busy={busyKey === 'custom-new'} />}
      <div className="mt-4 space-y-3">{visibleCustomQuestions.map(question => { const response = responseByQuestion.get(question.id); const isEditing = editingCustomId === question.id && customEdit; return <div key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">{isEditing ? <CustomQuestionForm draft={customEdit} onChange={setCustomEdit} onSave={() => void saveCustomQuestion(question)} onCancel={() => { setEditingCustomId(null); setCustomEdit(null); setActionError(''); }} busy={busyKey === `custom-edit-${question.id}`} editing /> : <><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-1 text-sm font-black text-slate-900">{question.question_text}<SellerGuidanceHelp guidance={getSellerGuidance('field.custom_question')} /></div><div className="mt-1 text-[11px] font-semibold text-slate-500">{humanize(question.framework)} · Custom</div>{question.purpose && <p className="mt-2 text-xs leading-5 text-slate-600">{question.purpose}</p>}</div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => { setEditingCustomId(question.id); setCustomEdit({ question: question.question_text, category: question.category, framework: question.framework, purpose: question.purpose ?? '', answer: '' }); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700"><Edit3 className="h-3.5 w-3.5" />Edit question</button><button type="button" onClick={() => void deactivateCustomQuestion(question)} disabled={busyKey === `custom-archive-${question.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-600 disabled:opacity-50"><Archive className="h-3.5 w-3.5" />Deactivate</button></div></div><QuestionAnswerPanel question={question} response={response} editing={editingQuestionId === question.id} draft={editingQuestionId === question.id ? draft : null} busy={busyKey === question.id} requirementByKey={requirementByKey} definitionByKey={definitionByKey} onBeginEdit={() => { setEditingQuestionId(question.id); setDraft(responseDraft(response)); setActionError(''); }} onCancelEdit={() => { setEditingQuestionId(null); setDraft(null); setActionError(''); }} onDraftChange={setDraft} onSave={() => void saveResponse(question)} onViewRequirements={onViewRequirements} /></>}</div>; })}{!visibleCustomQuestions.length && <EmptyState text="No active custom questions match this filter." />}</div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="flex items-center gap-2 text-sm font-black text-slate-950"><MessageCircle className="h-4 w-4 text-[#000080]" />Client Voice<SellerGuidanceHelp guidance={getSellerGuidance('section.client_voice')} /></h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Keep what the client said separate from Seller interpretation. A Seller interpretation is not automatically a confirmed client fact.</p></div><button type="button" onClick={() => { setEditingVoiceId(null); setVoiceDraft(emptyClientVoice()); setClientVoiceOpen(true); setActionError(''); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#000080] px-3 text-[11px] font-black text-white"><Plus className="h-4 w-4" />Add Client Voice</button></div>
      {clientVoiceOpen && <ClientVoiceForm draft={voiceDraft} requirements={activeRequirements} definitionByKey={definitionByKey} onChange={setVoiceDraft} onSave={() => void saveClientVoice()} onCancel={() => { setClientVoiceOpen(false); setEditingVoiceId(null); setVoiceDraft(emptyClientVoice()); setActionError(''); }} busy={busyKey === (editingVoiceId ? `voice-${editingVoiceId}` : 'voice-new')} editing={Boolean(editingVoiceId)} />}
      <div className="mt-4 space-y-3">{workspace.clientVoice.map(entry => { const linked = entry.linked_requirement_id ? activeRequirements.find(requirement => requirement.id === entry.linked_requirement_id) : undefined; return <article key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[.12em] text-[#000080]">What the client said<SellerGuidanceHelp guidance={getSellerGuidance('field.client_voice_statement')} /></div><p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-900">{entry.customer_statement}</p><div className="mt-3 flex items-center gap-1 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Seller interpretation<SellerGuidanceHelp guidance={getSellerGuidance('field.client_voice_interpretation')} /></div><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{entry.seller_interpretation || 'No Seller interpretation recorded.'}</p><div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold"><StatusPill label={CERTAINTY_LABELS[entry.information_certainty]} guidance={getCertaintyGuidance(entry.information_certainty)} />{linked && <StatusPill label={`Related Requirement: ${linked.title}`} />}<span className="self-center text-slate-400">{sourceLabel(entry.source_type)} · {fmt(entry.updated_at)}</span><SellerGuidanceHelp guidance={getSellerGuidance('field.requirement_source')} /></div></div><button type="button" onClick={() => { setEditingVoiceId(entry.id); setVoiceDraft(clientVoiceDraft(entry)); setClientVoiceOpen(true); }} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700"><Edit3 className="h-3.5 w-3.5" />Edit</button></div></article>; })}{!workspace.clientVoice.length && <EmptyState text="No Client Voice entries yet." />}</div>
    </section>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Keep secrets out of Discovery.</strong> Record access needs such as “HubSpot access will be needed during onboarding,” never passwords, API secrets, private keys, recovery codes, authentication secrets, or payment-card details.</div>
  </div>;
}

type SharedQuestionProps = {
  responseByQuestion: Map<string, CRMDiscoveryResponse>; requirementByKey: Map<string, CRMRequirement>; definitionByKey: Map<string, { title: string }>;
  editingQuestionId: string | null; draft: ResponseDraft | null; busyKey: string;
  onBeginEdit: (question: CRMDiscoveryQuestion, response?: CRMDiscoveryResponse) => void; onCancelEdit: () => void; onDraftChange: (draft: ResponseDraft) => void;
  onSave: (question: CRMDiscoveryQuestion) => void; onViewRequirements?: () => void;
};
function DiscoveryGroup({ title, questions, ...shared }: { title: string; questions: CRMDiscoveryQuestion[] } & SharedQuestionProps) {
  const [open, setOpen] = useState(true);
  return <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex min-h-12 w-full items-center justify-between gap-3 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"><span className="text-xs font-black uppercase tracking-[.1em] text-slate-700">{title} <span className="text-slate-400">({questions.length})</span></span>{open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</button>{open && <div className="divide-y divide-slate-100 border-t border-slate-100">{questions.map(question => <QuestionRow key={question.id} question={question} response={shared.responseByQuestion.get(question.id)} editing={shared.editingQuestionId === question.id} draft={shared.editingQuestionId === question.id ? shared.draft : null} busy={shared.busyKey === question.id} requirementByKey={shared.requirementByKey} definitionByKey={shared.definitionByKey} onBeginEdit={() => shared.onBeginEdit(question, shared.responseByQuestion.get(question.id))} onCancelEdit={shared.onCancelEdit} onDraftChange={shared.onDraftChange} onSave={() => shared.onSave(question)} onViewRequirements={shared.onViewRequirements} />)}</div>}</div>;
}

type QuestionRowProps = { question: CRMDiscoveryQuestion; response?: CRMDiscoveryResponse; editing: boolean; draft: ResponseDraft | null; busy: boolean; requirementByKey: Map<string, CRMRequirement>; definitionByKey: Map<string, { title: string }>; onBeginEdit: () => void; onCancelEdit: () => void; onDraftChange: (draft: ResponseDraft) => void; onSave: () => void; onViewRequirements?: () => void };
function QuestionRow(props: QuestionRowProps) {
  const config = getDiscoveryQuestionConfiguration(props.question);
  const guidance = props.question.is_custom ? getSellerGuidance('field.custom_question') : getDiscoveryQuestionGuidance(props.question);
  return <div className="p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] ${QUESTION_CLASS_TONE[config.questionClass] || QUESTION_CLASS_TONE.CORE}`}>{config.questionClass}</span><SellerGuidanceHelp guidance={getQuestionClassGuidance(config.questionClass)} /><span className="text-[10px] font-bold text-slate-400">{SECTION_LABELS[config.section] || humanize(config.section)} · {humanize(props.question.framework)}</span></div><div className="mt-2 flex items-start gap-1"><h4 className="min-w-0 break-words text-sm font-black leading-5 text-slate-950">{props.question.question_text}</h4><SellerGuidanceHelp guidance={guidance} /></div><p className="mt-1 text-xs leading-5 text-slate-500">{props.question.purpose || 'Use this question to clarify the client context before recommending a solution.'}</p></div>{!props.editing && <button type="button" onClick={props.onBeginEdit} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700"><Edit3 className="h-3.5 w-3.5" />{props.response ? 'Edit answer' : 'Answer'}</button>}</div><QuestionAnswerPanel {...props} /></div>;
}
function QuestionAnswerPanel({ question, response, editing, draft, busy, requirementByKey, definitionByKey, onBeginEdit, onCancelEdit, onDraftChange, onSave, onViewRequirements }: QuestionRowProps) {
  const config = getDiscoveryQuestionConfiguration(question);
  if (editing && draft) { const normalized = normalizeDraft(draft); return <div className="mt-4 rounded-xl border border-[#000080]/15 bg-slate-50 p-4"><div className="grid gap-3 md:grid-cols-2"><Field label="Question state" htmlFor={`state-${question.id}`} guidance={getDiscoveryStateGuidance(normalized.state)}><select id={`state-${question.id}`} value={normalized.state} onChange={event => onDraftChange(normalizeDraft({ ...normalized, state: event.target.value as CRMDiscoveryQuestionState }))} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800">{CRM_DISCOVERY_QUESTION_STATES.map(state => <option key={state} value={state}>{QUESTION_STATE_LABELS[state]}</option>)}</select></Field><Field label="Certainty" htmlFor={`certainty-${question.id}`} guidance={getCertaintyGuidance(normalized.certainty)}><select id={`certainty-${question.id}`} value={normalized.certainty} onChange={event => onDraftChange(normalizeDraft({ ...normalized, certainty: event.target.value as CRMInformationCertainty }))} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800">{CRM_INFORMATION_CERTAINTY.map(certainty => <option key={certainty} value={certainty}>{CERTAINTY_LABELS[certainty]}</option>)}</select></Field></div><Field label="Answer" htmlFor={`answer-${question.id}`} className="mt-3" guidance={question.is_custom ? getSellerGuidance('field.custom_question') : getDiscoveryQuestionGuidance(question)}><textarea id={`answer-${question.id}`} rows={4} value={normalized.answer} onChange={event => onDraftChange({ ...normalized, answer: event.target.value })} aria-describedby={`answer-help-${question.id}`} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-800" placeholder={normalized.state === 'NOT_APPLICABLE' ? 'No answer required when not applicable.' : 'Capture the client answer or a faithful Seller note.'} /><p id={`answer-help-${question.id}`} className="mt-1 text-[10px] leading-4 text-slate-400">Answered requires meaningful content. Existing structured values are preserved even when this text is edited.</p></Field><label className="mt-3 flex min-h-10 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={normalized.followUp} disabled={normalized.state === 'NOT_APPLICABLE'} onChange={event => onDraftChange({ ...normalized, followUp: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-[#000080] focus:ring-[#000080]" />Follow-up required<SellerGuidanceHelp guidance={getSellerGuidance('field.follow_up_required')} /></label>{normalized.certainty === 'NEEDS_SPECIALIST_VALIDATION' && <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] font-bold text-rose-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Specialist validation required. No review workflow has been started.</div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={onSave} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#000080] px-3 text-[11px] font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save</button><button type="button" disabled={busy} onClick={onCancelEdit} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700"><X className="h-3.5 w-3.5" />Cancel</button></div></div>; }
  const state = response?.question_state ?? 'NOT_ASKED';
  return <div className="mt-3"><div className="flex flex-wrap items-center gap-2"><StatusPill label={QUESTION_STATE_LABELS[state]} guidance={getDiscoveryStateGuidance(state)} />{response && <StatusPill label={CERTAINTY_LABELS[response.information_certainty]} guidance={getCertaintyGuidance(response.information_certainty)} />}{(response?.question_state === 'NEEDS_FOLLOW_UP' || response?.follow_up_required) && <StatusPill label="Follow-up required" attention guidance={getSellerGuidance('field.follow_up_required')} />}</div><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{response?.answer_text?.trim() ? response.answer_text : hasMeaningfulDiscoveryStructuredValue(response?.structured_value) ? 'Structured discovery details are recorded.' : 'Not answered yet.'}</p>{response?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION' && <div className="mt-2 flex items-start gap-2 text-[11px] font-bold text-rose-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Specialist validation required</div>}{response && <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-slate-400">{sourceLabel(response.source_type)} · Updated {fmt(response.updated_at)}<SellerGuidanceHelp guidance={getSellerGuidance('field.requirement_source')} /></div>}{!!config.relatedRequirementKeys.length && <div className="mt-3 flex flex-wrap items-center gap-2"><Link2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />{config.relatedRequirementKeys.map(key => { const requirement = requirementByKey.get(key); const title = definitionByKey.get(key)?.title || requirement?.title || humanize(key); const requirementState = requirement ? CERTAINTY_LABELS[requirement.information_certainty] : 'Not captured'; return <StatusPill key={key} label={`${title}: ${requirementState}`} />; })}{onViewRequirements && <button type="button" onClick={onViewRequirements} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-black text-[#000080]">View in Requirements</button>}</div>}{question.is_custom && !response && <button type="button" onClick={onBeginEdit} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700"><Edit3 className="h-3.5 w-3.5" />Answer</button>}</div>;
}
function CustomQuestionForm({ draft, onChange, onSave, onCancel, busy, editing = false }: { draft: CustomQuestionDraft; onChange: (draft: CustomQuestionDraft) => void; onSave: () => void; onCancel: () => void; busy: boolean; editing?: boolean }) {
  return <div className="mt-4 rounded-xl border border-[#000080]/15 bg-slate-50 p-4"><Field label="Question" htmlFor={editing ? 'custom-question-edit' : 'custom-question-new'} guidance={getSellerGuidance('field.custom_question')}><textarea id={editing ? 'custom-question-edit' : 'custom-question-new'} rows={3} value={draft.question} onChange={event => onChange({ ...draft, question: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></Field><div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Category" htmlFor={editing ? 'custom-category-edit' : 'custom-category-new'}><select id={editing ? 'custom-category-edit' : 'custom-category-new'} value={draft.category} onChange={event => onChange({ ...draft, category: event.target.value })} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800">{CUSTOM_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Framework" htmlFor={editing ? 'custom-framework-edit' : 'custom-framework-new'}><select id={editing ? 'custom-framework-edit' : 'custom-framework-new'} value={draft.framework} onChange={event => onChange({ ...draft, framework: event.target.value as CRMDiscoveryFramework })} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800">{CRM_DISCOVERY_FRAMEWORKS.map(framework => <option key={framework} value={framework}>{humanize(framework)}</option>)}</select></Field></div><Field label="Purpose (optional)" htmlFor={editing ? 'custom-purpose-edit' : 'custom-purpose-new'} className="mt-3" guidance={getSellerGuidance('field.custom_question_purpose')}><input id={editing ? 'custom-purpose-edit' : 'custom-purpose-new'} value={draft.purpose} onChange={event => onChange({ ...draft, purpose: event.target.value })} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800" /></Field>{!editing && <Field label="Answer now (optional)" htmlFor="custom-answer-new" className="mt-3" guidance={getSellerGuidance('field.custom_question')}><textarea id="custom-answer-new" rows={3} value={draft.answer} onChange={event => onChange({ ...draft, answer: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></Field>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={onSave} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#000080] px-3 text-[11px] font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{editing ? 'Save question' : 'Add question'}</button><button type="button" disabled={busy} onClick={onCancel} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700"><X className="h-3.5 w-3.5" />Cancel</button></div></div>;
}
function ClientVoiceForm({ draft, requirements, definitionByKey, onChange, onSave, onCancel, busy, editing }: { draft: ClientVoiceDraft; requirements: CRMRequirement[]; definitionByKey: Map<string, { title: string }>; onChange: (draft: ClientVoiceDraft) => void; onSave: () => void; onCancel: () => void; busy: boolean; editing: boolean }) {
  return <div className="mt-4 rounded-xl border border-[#000080]/15 bg-slate-50 p-4"><Field label="What the client said" htmlFor="client-voice-statement" guidance={getSellerGuidance('field.client_voice_statement')}><textarea id="client-voice-statement" rows={4} value={draft.customerStatement} onChange={event => onChange({ ...draft, customerStatement: event.target.value })} aria-describedby="client-voice-statement-help" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-800" /><p id="client-voice-statement-help" className="mt-1 text-[10px] text-slate-400">Record the client's words or a faithful paraphrase.</p></Field><Field label="Seller interpretation" htmlFor="client-voice-interpretation" className="mt-3" guidance={getSellerGuidance('field.client_voice_interpretation')}><textarea id="client-voice-interpretation" rows={3} value={draft.sellerInterpretation} onChange={event => onChange({ ...draft, sellerInterpretation: event.target.value })} aria-describedby="client-voice-interpretation-help" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-800" /><p id="client-voice-interpretation-help" className="mt-1 text-[10px] text-slate-400">Your interpretation is not automatically a confirmed client fact.</p></Field><div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Related Requirement (optional)" htmlFor="client-voice-requirement"><select id="client-voice-requirement" value={draft.linkedRequirementId} onChange={event => onChange({ ...draft, linkedRequirementId: event.target.value })} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"><option value="">No linked Requirement</option>{requirements.map(requirement => <option key={requirement.id} value={requirement.id}>{definitionByKey.get(requirement.requirement_key)?.title || requirement.title}</option>)}</select></Field><Field label="Certainty" htmlFor="client-voice-certainty" guidance={getCertaintyGuidance(draft.certainty)}><select id="client-voice-certainty" value={draft.certainty} onChange={event => onChange({ ...draft, certainty: event.target.value as CRMInformationCertainty })} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800">{CRM_INFORMATION_CERTAINTY.map(certainty => <option key={certainty} value={certainty}>{CERTAINTY_LABELS[certainty]}</option>)}</select></Field></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={onSave} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#000080] px-3 text-[11px] font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{editing ? 'Save Client Voice' : 'Add Client Voice'}</button><button type="button" disabled={busy} onClick={onCancel} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700"><X className="h-3.5 w-3.5" />Cancel</button></div></div>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-lg font-black text-slate-950">{value}</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-slate-400">{label}</div></div>; }
function StatusPill({ label, attention = false, guidance }: { label: string; attention?: boolean; guidance?: SellerGuidanceEntry }) { return <span className="inline-flex items-center gap-1"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${attention ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</span>{guidance && <SellerGuidanceHelp guidance={guidance} />}</span>; }
function EmptyState({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-400">{text}</div>; }
function Field({ label, htmlFor, className = '', children, guidance }: { label: string; htmlFor: string; className?: string; children: React.ReactNode; guidance?: SellerGuidanceEntry }) { return <div className={className}><div className="mb-1.5 flex items-center gap-1"><label htmlFor={htmlFor} className="text-[10px] font-black uppercase tracking-[.08em] text-slate-500">{label}</label>{guidance && <SellerGuidanceHelp guidance={guidance} />}</div>{children}</div>; }
