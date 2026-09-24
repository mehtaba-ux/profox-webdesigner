import type {
  CRMDiscoveryQuestion,
  CRMDiscoveryResponse,
  CRMMeetingPreparationWorkspaceItem,
  CRMRequirement,
  CRMRequirementClass,
  CRMSalesDiscoveryWorkspace,
} from './crmSalesDiscoveryService';
import {
  getDiscoveryQuestionConfiguration,
  hasMeaningfulDiscoveryAnswer,
  hasMeaningfulDiscoveryStructuredValue,
  isAdditionalDiscoveryQuestionRelevant,
} from './crmDiscoveryUtils';

export type CRMMeetingPrepLeadContext = {
  title?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  source?: string | null;
  country?: string | null;
  industry?: string | null;
  serviceInterest?: string | null;
};

export type CRMMeetingPrepKnownItem = {
  id: string;
  label: string;
  value: string;
  source: string;
  certainty: string;
};

export type CRMMeetingPrepGap = {
  id: string;
  label: string;
  detail: string;
  priority: CRMRequirementClass;
  source: 'Discovery' | 'Requirement';
};

export type CRMMeetingPrepQuestionRecommendation = {
  question: CRMDiscoveryQuestion;
  response?: CRMDiscoveryResponse;
  priority: CRMRequirementClass;
  reason: string;
  score: number;
};

const classOrder: Record<CRMRequirementClass, number> = {
  CORE: 0,
  RECOMMENDED: 1,
  CONDITIONAL: 2,
  COMPLEX: 3,
};

const text = (value?: string | null) => value?.trim() ?? '';

export const isUpcomingMeetingForPreparation = (
  meeting: CRMMeetingPreparationWorkspaceItem,
  now = Date.now(),
): boolean =>
  (meeting.status === 'Scheduled' || meeting.status === 'Rescheduled')
  && new Date(meeting.scheduledAt).getTime() >= now;

export const getUpcomingMeetingsForPreparation = (
  meetings: CRMMeetingPreparationWorkspaceItem[],
  now = Date.now(),
): CRMMeetingPreparationWorkspaceItem[] =>
  meetings
    .filter(meeting => isUpcomingMeetingForPreparation(meeting, now))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

export const chooseDefaultMeetingForPreparation = (
  meetings: CRMMeetingPreparationWorkspaceItem[],
  now = Date.now(),
): CRMMeetingPreparationWorkspaceItem | null => getUpcomingMeetingsForPreparation(meetings, now)[0] ?? null;

export const splitMeetingHypotheses = (values: unknown[]): {
  editable: string[];
  preserved: unknown[];
} => {
  const editable: string[] = [];
  const preserved: unknown[] = [];
  for (const value of values) {
    if (typeof value === 'string') editable.push(value);
    else preserved.push(value);
  }
  return { editable, preserved };
};

const requirementHasMeaning = (requirement?: CRMRequirement) => Boolean(requirement && (
  text(requirement.content)
  || hasMeaningfulDiscoveryStructuredValue(requirement.structured_value)
  || requirement.information_certainty === 'NOT_APPLICABLE'
));

export const buildMeetingPrepKnownContext = (
  lead: CRMMeetingPrepLeadContext,
  workspace: CRMSalesDiscoveryWorkspace,
): CRMMeetingPrepKnownItem[] => {
  const items: CRMMeetingPrepKnownItem[] = [];
  const addLead = (id: string, label: string, value?: string | null) => {
    if (!text(value)) return;
    items.push({ id: `lead-${id}`, label, value: text(value), source: 'Lead record', certainty: 'Recorded context' });
  };

  addLead('company', 'Company', lead.companyName);
  addLead('contact', 'Primary contact', lead.contactName);
  addLead('service', 'Service interest', lead.serviceInterest);
  addLead('industry', 'Industry', lead.industry);
  addLead('country', 'Country / market', lead.country);
  addLead('source', 'Lead source', lead.source);

  const questionById = new Map(workspace.questions.map(question => [question.id, question]));
  for (const response of workspace.responses) {
    if (response.question_state !== 'ANSWERED' || !hasMeaningfulDiscoveryAnswer(response)) continue;
    if (!['CLIENT_CONFIRMED', 'SELLER_OBSERVATION'].includes(response.information_certainty)) continue;
    const question = questionById.get(response.question_id);
    if (!question) continue;
    const value = text(response.answer_text) || 'Structured answer captured';
    items.push({
      id: `discovery-${response.id}`,
      label: question.question_text,
      value,
      source: 'Discovery',
      certainty: response.information_certainty === 'CLIENT_CONFIRMED' ? 'Client confirmed' : 'Seller observation',
    });
  }

  for (const requirement of workspace.requirements) {
    if (requirement.record_state !== 'ACTIVE' || !requirementHasMeaning(requirement)) continue;
    if (!['CLIENT_CONFIRMED', 'SELLER_OBSERVATION'].includes(requirement.information_certainty)) continue;
    items.push({
      id: `requirement-${requirement.id}`,
      label: requirement.title,
      value: text(requirement.content) || 'Structured Requirement captured',
      source: 'Requirements',
      certainty: requirement.information_certainty === 'CLIENT_CONFIRMED' ? 'Client confirmed' : 'Seller observation',
    });
  }

  for (const entry of workspace.clientVoice) {
    if (text(entry.customer_statement)) {
      items.push({
        id: `voice-${entry.id}`,
        label: 'CLIENT SAID',
        value: text(entry.customer_statement),
        source: 'Client Voice',
        certainty: 'Client statement',
      });
    }
    if (text(entry.seller_interpretation)) {
      items.push({
        id: `voice-interpretation-${entry.id}`,
        label: 'SELLER INTERPRETATION',
        value: text(entry.seller_interpretation),
        source: 'Client Voice',
        certainty: 'Seller interpretation',
      });
    }
  }

  return items;
};

export const buildMeetingPrepGaps = (
  workspace: CRMSalesDiscoveryWorkspace,
): CRMMeetingPrepGap[] => {
  const gaps: CRMMeetingPrepGap[] = [];
  const activeRequirements = workspace.requirements.filter(requirement => requirement.record_state === 'ACTIVE');
  const requirementByKey = new Map(activeRequirements.filter(requirement => !requirement.is_custom).map(requirement => [requirement.requirement_key, requirement]));

  for (const definition of workspace.requirementDefinitions.filter(item => item.active && item.requirementClass === 'CORE')) {
    const requirement = requirementByKey.get(definition.requirementKey);
    if (!requirement || !requirementHasMeaning(requirement)) {
      gaps.push({
        id: `requirement-missing-${definition.requirementKey}`,
        label: definition.title,
        detail: 'Core Requirement has not been captured yet.',
        priority: 'CORE',
        source: 'Requirement',
      });
    }
  }

  for (const requirement of activeRequirements) {
    if (requirement.information_certainty === 'AWAITING_CLIENT') {
      gaps.push({
        id: `requirement-awaiting-${requirement.id}`,
        label: requirement.title,
        detail: 'Awaiting client information or confirmation.',
        priority: 'CORE',
        source: 'Requirement',
      });
    } else if (requirement.information_certainty === 'NEEDS_SPECIALIST_VALIDATION') {
      gaps.push({
        id: `requirement-validation-${requirement.id}`,
        label: requirement.title,
        detail: 'Needs specialist validation before it can be treated as resolved.',
        priority: 'CORE',
        source: 'Requirement',
      });
    }
  }

  const responseByQuestion = new Map(workspace.responses.map(response => [response.question_id, response]));
  const activeQuestions = workspace.questions.filter(question => question.active);
  for (const question of activeQuestions) {
    const response = responseByQuestion.get(question.id);
    if (response?.question_state === 'NOT_APPLICABLE') continue;
    const config = getDiscoveryQuestionConfiguration(question);
    if (config.questionClass !== 'CORE' && !isAdditionalDiscoveryQuestionRelevant(question, activeRequirements, response)) continue;

    const unresolved = !response
      || response.question_state === 'NOT_ASKED'
      || response.question_state === 'ASKED'
      || response.question_state === 'NEEDS_FOLLOW_UP'
      || response.follow_up_required
      || response.information_certainty === 'AWAITING_CLIENT'
      || response.information_certainty === 'NEEDS_SPECIALIST_VALIDATION'
      || (response.question_state === 'ANSWERED' && !hasMeaningfulDiscoveryAnswer(response));
    if (!unresolved) continue;

    let detail = 'Important Discovery information is still unresolved.';
    if (response?.question_state === 'NEEDS_FOLLOW_UP' || response?.follow_up_required) detail = 'Needs follow-up or clarification.';
    else if (response?.information_certainty === 'AWAITING_CLIENT') detail = 'Awaiting client information or confirmation.';
    else if (response?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION') detail = 'Needs specialist validation.';
    else if (!response || response.question_state === 'NOT_ASKED') detail = 'Not asked yet.';

    gaps.push({
      id: `discovery-${question.id}`,
      label: question.question_text,
      detail,
      priority: config.questionClass,
      source: 'Discovery',
    });
  }

  return gaps.sort((a, b) => classOrder[a.priority] - classOrder[b.priority] || a.label.localeCompare(b.label));
};

export const buildRecommendedMeetingQuestions = (
  workspace: CRMSalesDiscoveryWorkspace,
  selectedQuestionIds: string[] = [],
): CRMMeetingPrepQuestionRecommendation[] => {
  const selected = new Set(selectedQuestionIds);
  const activeRequirements = workspace.requirements.filter(requirement => requirement.record_state === 'ACTIVE');
  const responseByQuestion = new Map(workspace.responses.map(response => [response.question_id, response]));
  const recommendations: CRMMeetingPrepQuestionRecommendation[] = [];

  for (const question of workspace.questions.filter(item => item.active)) {
    if (selected.has(question.id)) continue;
    const response = responseByQuestion.get(question.id);
    if (response?.question_state === 'NOT_APPLICABLE') continue;
    const config = getDiscoveryQuestionConfiguration(question);
    if (config.questionClass !== 'CORE' && !isAdditionalDiscoveryQuestionRelevant(question, activeRequirements, response)) continue;

    const needsFollowUp = response?.question_state === 'NEEDS_FOLLOW_UP' || Boolean(response?.follow_up_required);
    const awaitingClient = response?.information_certainty === 'AWAITING_CLIENT';
    const needsValidation = response?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION';
    const resolved = response?.question_state === 'ANSWERED' && hasMeaningfulDiscoveryAnswer(response) && !needsFollowUp && !awaitingClient && !needsValidation;
    if (resolved) continue;

    let score = 40 + classOrder[config.questionClass] * 10;
    let reason = `${config.questionClass.toLowerCase()} information is unresolved.`;
    if (needsFollowUp) { score = 0; reason = 'Needs follow-up from earlier Discovery.'; }
    else if (awaitingClient) { score = 5; reason = 'Awaiting client information or confirmation.'; }
    else if (needsValidation) { score = 10; reason = 'Needs clarification before specialist validation can progress.'; }
    else if (config.questionClass === 'CORE') { score = 20; reason = 'Unanswered Core Discovery question.'; }
    else if (config.questionClass === 'CONDITIONAL') { score = 50; reason = 'Relevant Conditional question for the current opportunity.'; }
    else if (config.questionClass === 'COMPLEX') { score = 60; reason = 'Relevant Complex-deal question for the current opportunity.'; }

    recommendations.push({ question, response, priority: config.questionClass, reason, score });
  }

  return recommendations.sort((a, b) => a.score - b.score || a.question.sort_order - b.question.sort_order || a.question.question_text.localeCompare(b.question.question_text));
};
