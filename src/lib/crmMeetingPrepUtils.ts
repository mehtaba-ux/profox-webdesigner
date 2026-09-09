import {
  getDiscoveryQuestionConfiguration,
  hasMeaningfulDiscoveryAnswer,
  hasMeaningfulDiscoveryStructuredValue,
  isAdditionalDiscoveryQuestionRelevant,
} from './crmDiscoveryUtils';
import type {
  CRMClientVoiceEntry,
  CRMDiscoveryQuestion,
  CRMDiscoveryResponse,
  CRMInformationCertainty,
  CRMJsonValue,
  CRMMeetingPreparationWorkspaceItem,
  CRMRequirement,
  CRMRequirementDefinition,
  CRMRequirementClass,
} from './crmSalesDiscoveryService';

export type CRMMeetingPrepHypothesis = {
  id: string;
  text: string;
  certainty: 'SELLER_HYPOTHESIS';
};

export type CRMMeetingPrepContextItem = {
  id: string;
  title: string;
  value: string;
  source: 'Requirement' | 'Discovery' | 'Client Voice';
  certainty: CRMInformationCertainty;
  priority: CRMRequirementClass;
};

export type CRMMeetingPrepGap = {
  id: string;
  title: string;
  reason: string;
  source: 'Requirement' | 'Discovery';
  priority: CRMRequirementClass;
  certainty?: CRMInformationCertainty;
};

const PRIORITY_ORDER: Record<CRMRequirementClass, number> = {
  CORE: 0,
  RECOMMENDED: 1,
  CONDITIONAL: 2,
  COMPLEX: 3,
};

const isRecord = (value: CRMJsonValue | null | undefined): value is { [key: string]: CRMJsonValue } =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const hasMeaningfulMeetingPrepText = (value: string | null | undefined): boolean =>
  Boolean(value?.trim());

export const isMeetingEligibleForPrep = (meeting: Pick<CRMMeetingPreparationWorkspaceItem, 'status'>): boolean =>
  meeting.status === 'Scheduled' || meeting.status === 'Rescheduled';

export const selectDefaultMeeting = (
  meetings: CRMMeetingPreparationWorkspaceItem[],
  now: Date = new Date(),
): CRMMeetingPreparationWorkspaceItem | null => {
  const eligible = meetings.filter(isMeetingEligibleForPrep);
  if (!eligible.length) return null;
  const nowMs = now.getTime();
  const future = eligible
    .filter(meeting => new Date(meeting.scheduledAt).getTime() >= nowMs)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  if (future.length) return future[0];
  return [...eligible].sort((a, b) =>
    new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  )[0];
};

const displayStructuredValue = (value: CRMJsonValue | null | undefined): string => {
  if (!hasMeaningfulDiscoveryStructuredValue(value)) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const simple = value
      .filter(item => ['string', 'number', 'boolean'].includes(typeof item))
      .map(item => String(item));
    return simple.length === value.length && simple.length ? simple.join(', ') : 'Structured information captured';
  }
  return 'Structured information captured';
};

const requirementPriority = (
  requirement: CRMRequirement,
  definitions: CRMRequirementDefinition[],
): CRMRequirementClass =>
  definitions.find(definition => definition.requirementKey === requirement.requirement_key)?.requirementClass ?? 'RECOMMENDED';

export const deriveWhatWeKnow = (
  requirements: CRMRequirement[],
  definitions: CRMRequirementDefinition[],
  questions: CRMDiscoveryQuestion[],
  responses: CRMDiscoveryResponse[],
  clientVoice: CRMClientVoiceEntry[],
): CRMMeetingPrepContextItem[] => {
  const questionById = new Map(questions.map(question => [question.id, question]));
  const items: CRMMeetingPrepContextItem[] = [];

  for (const requirement of requirements) {
    if (requirement.record_state !== 'ACTIVE') continue;
    const value = requirement.information_certainty === 'NOT_APPLICABLE'
      ? 'Not applicable'
      : requirement.content?.trim() || displayStructuredValue(requirement.structured_value);
    if (!value) continue;
    items.push({
      id: `requirement:${requirement.id}`,
      title: requirement.title,
      value,
      source: 'Requirement',
      certainty: requirement.information_certainty,
      priority: requirementPriority(requirement, definitions),
    });
  }

  for (const response of responses) {
    const question = questionById.get(response.question_id);
    if (!question) continue;
    const value = response.question_state === 'NOT_APPLICABLE'
      ? 'Not applicable'
      : response.answer_text?.trim() || displayStructuredValue(response.structured_value);
    if (!value) continue;
    items.push({
      id: `discovery:${response.id}`,
      title: question.question_text,
      value,
      source: 'Discovery',
      certainty: response.information_certainty,
      priority: getDiscoveryQuestionConfiguration(question).questionClass,
    });
  }

  for (const entry of clientVoice) {
    if (!entry.customer_statement.trim()) continue;
    items.push({
      id: `voice:${entry.id}`,
      title: 'Client said',
      value: entry.customer_statement,
      source: 'Client Voice',
      certainty: entry.information_certainty,
      priority: 'RECOMMENDED',
    });
  }

  return items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title));
};

export const deriveWhatWeStillNeed = (
  requirements: CRMRequirement[],
  definitions: CRMRequirementDefinition[],
  questions: CRMDiscoveryQuestion[],
  responses: CRMDiscoveryResponse[],
): CRMMeetingPrepGap[] => {
  const activeRequirements = requirements.filter(requirement => requirement.record_state === 'ACTIVE');
  const requirementByKey = new Map(activeRequirements.map(requirement => [requirement.requirement_key, requirement]));
  const responseByQuestion = new Map(responses.map(response => [response.question_id, response]));
  const gaps: CRMMeetingPrepGap[] = [];

  for (const definition of definitions) {
    if (!definition.active) continue;
    const requirement = requirementByKey.get(definition.requirementKey);
    if (requirement?.information_certainty === 'NOT_APPLICABLE') continue;
    const meaningful = Boolean(requirement?.content?.trim()) || hasMeaningfulDiscoveryStructuredValue(requirement?.structured_value);
    const attentionCertainty = requirement?.information_certainty === 'AWAITING_CLIENT'
      || requirement?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION'
      || requirement?.information_certainty === 'SELLER_HYPOTHESIS';
    const shouldSurface = definition.requirementClass === 'CORE'
      ? !meaningful || attentionCertainty
      : Boolean(requirement && attentionCertainty);
    if (!shouldSurface) continue;

    const reason = requirement?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION'
      ? 'Needs specialist validation.'
      : requirement?.information_certainty === 'AWAITING_CLIENT'
        ? 'Waiting for the client.'
        : requirement?.information_certainty === 'SELLER_HYPOTHESIS'
          ? 'Working hypothesis still needs validation.'
          : 'Core requirement is not captured yet.';
    gaps.push({
      id: `requirement:${definition.requirementKey}`,
      title: definition.title,
      reason,
      source: 'Requirement',
      priority: definition.requirementClass,
      certainty: requirement?.information_certainty,
    });
  }

  for (const question of questions) {
    if (!question.active) continue;
    const response = responseByQuestion.get(question.id);
    if (response?.question_state === 'NOT_APPLICABLE') continue;
    const config = getDiscoveryQuestionConfiguration(question);
    const relevant = config.questionClass === 'CORE'
      || config.questionClass === 'RECOMMENDED'
      || isAdditionalDiscoveryQuestionRelevant(question, activeRequirements, response);
    if (!relevant) continue;

    const needsFollowUp = response?.question_state === 'NEEDS_FOLLOW_UP' || response?.follow_up_required;
    const awaiting = response?.information_certainty === 'AWAITING_CLIENT';
    const specialist = response?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION';
    const unresolvedCore = config.questionClass === 'CORE' && (!response || !hasMeaningfulDiscoveryAnswer(response));
    if (!needsFollowUp && !awaiting && !specialist && !unresolvedCore) continue;

    gaps.push({
      id: `discovery:${question.id}`,
      title: question.question_text,
      reason: needsFollowUp
        ? 'Follow-up is required.'
        : specialist
          ? 'Needs specialist validation.'
          : awaiting
            ? 'Waiting for the client.'
            : 'Core discovery is still unresolved.',
      source: 'Discovery',
      priority: config.questionClass,
      certainty: response?.information_certainty,
    });
  }

  return gaps.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title));
};

const recommendationRank = (
  question: CRMDiscoveryQuestion,
  response?: CRMDiscoveryResponse,
): number => {
  if (response?.question_state === 'NEEDS_FOLLOW_UP' || response?.follow_up_required) return 0;
  if (response?.information_certainty === 'AWAITING_CLIENT') return 1;
  if (response?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION') return 2;
  const questionClass = getDiscoveryQuestionConfiguration(question).questionClass;
  if (questionClass === 'CORE') return 3;
  if (questionClass === 'CONDITIONAL') return 4;
  if (questionClass === 'RECOMMENDED') return 5;
  return 6;
};

export const deriveRecommendedMeetingQuestions = (
  questions: CRMDiscoveryQuestion[],
  responses: CRMDiscoveryResponse[],
  requirements: CRMRequirement[],
): CRMDiscoveryQuestion[] => {
  const responseByQuestion = new Map(responses.map(response => [response.question_id, response]));
  return questions
    .filter(question => {
      if (!question.active) return false;
      const response = responseByQuestion.get(question.id);
      if (response?.question_state === 'NOT_APPLICABLE') return false;
      const followUp = response?.question_state === 'NEEDS_FOLLOW_UP' || response?.follow_up_required;
      if (!followUp && response?.question_state === 'ANSWERED' && hasMeaningfulDiscoveryAnswer(response)) return false;
      if (!followUp && response?.information_certainty === 'CLIENT_CONFIRMED' && hasMeaningfulDiscoveryAnswer(response)) return false;
      const config = getDiscoveryQuestionConfiguration(question);
      if (config.questionClass === 'CORE' || config.questionClass === 'RECOMMENDED') return true;
      return isAdditionalDiscoveryQuestionRelevant(question, requirements, response);
    })
    .sort((a, b) => {
      const rank = recommendationRank(a, responseByQuestion.get(a.id)) - recommendationRank(b, responseByQuestion.get(b.id));
      return rank || a.sort_order - b.sort_order || a.question_text.localeCompare(b.question_text);
    });
};

export const parseMeetingPrepHypotheses = (
  values: CRMJsonValue[] | null | undefined,
): { hypotheses: CRMMeetingPrepHypothesis[]; unknownValues: CRMJsonValue[] } => {
  const hypotheses: CRMMeetingPrepHypothesis[] = [];
  const unknownValues: CRMJsonValue[] = [];

  for (const value of values ?? []) {
    if (
      isRecord(value)
      && typeof value.id === 'string'
      && typeof value.text === 'string'
      && value.text.trim()
      && value.certainty === 'SELLER_HYPOTHESIS'
    ) {
      hypotheses.push({ id: value.id, text: value.text, certainty: 'SELLER_HYPOTHESIS' });
    } else {
      unknownValues.push(value);
    }
  }

  return { hypotheses, unknownValues };
};

export const serializeMeetingPrepHypotheses = (
  hypotheses: CRMMeetingPrepHypothesis[],
  unknownValues: CRMJsonValue[] = [],
): CRMJsonValue[] => [
  ...hypotheses
    .filter(hypothesis => hypothesis.text.trim())
    .map(hypothesis => ({
      id: hypothesis.id,
      text: hypothesis.text.trim(),
      certainty: 'SELLER_HYPOTHESIS' as const,
    })),
  ...unknownValues,
];
