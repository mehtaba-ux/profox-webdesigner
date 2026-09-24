import type {
  CRMDiscoveryQuestion,
  CRMDiscoveryResponse,
  CRMJsonValue,
  CRMRequirement,
  CRMRequirementClass,
} from './crmSalesDiscoveryService';

export type CRMDiscoveryQuestionConfiguration = {
  questionClass: CRMRequirementClass;
  relatedRequirementKeys: string[];
  section: string;
};

export type CRMDiscoveryCoverage = {
  totalCore: number;
  answeredCore: number;
  resolvedNotApplicableCore: number;
  unresolvedCore: number;
  needsFollowUp: number;
  awaitingClient: number;
  needsSpecialistValidation: number;
};

const QUESTION_CLASSES = new Set<CRMRequirementClass>(['CORE', 'RECOMMENDED', 'CONDITIONAL', 'COMPLEX']);

const isRecord = (value: CRMJsonValue | null | undefined): value is { [key: string]: CRMJsonValue } =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const hasMeaningfulDiscoveryStructuredValue = (value: CRMJsonValue | null | undefined): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulDiscoveryStructuredValue);
  return Object.values(value).some(hasMeaningfulDiscoveryStructuredValue);
};

export const hasMeaningfulDiscoveryAnswer = (response?: CRMDiscoveryResponse | null): boolean =>
  Boolean(response && (
    response.answer_text?.trim() ||
    hasMeaningfulDiscoveryStructuredValue(response.structured_value)
  ));

export const getDiscoveryQuestionConfiguration = (
  question: CRMDiscoveryQuestion,
): CRMDiscoveryQuestionConfiguration => {
  const applicability = isRecord(question.applicability) ? question.applicability : {};
  const rawClass = typeof applicability.questionClass === 'string' ? applicability.questionClass : '';
  const questionClass = QUESTION_CLASSES.has(rawClass as CRMRequirementClass)
    ? rawClass as CRMRequirementClass
    : question.is_custom ? 'RECOMMENDED' : 'CORE';
  const relatedRequirementKeys = Array.isArray(applicability.relatedRequirementKeys)
    ? applicability.relatedRequirementKeys.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const section = typeof applicability.section === 'string' && applicability.section.trim()
    ? applicability.section
    : question.category || 'CUSTOM';

  return { questionClass, relatedRequirementKeys, section };
};

export const isDiscoveryResponseResolved = (response?: CRMDiscoveryResponse | null): boolean => {
  if (!response) return false;
  if (response.question_state === 'NOT_APPLICABLE') return true;
  return response.question_state === 'ANSWERED' && hasMeaningfulDiscoveryAnswer(response);
};

export const calculateDiscoveryCoverage = (
  questions: CRMDiscoveryQuestion[],
  responses: CRMDiscoveryResponse[],
): CRMDiscoveryCoverage => {
  const activeQuestionIds = new Set(questions.filter(question => question.active).map(question => question.id));
  const activeResponses = responses.filter(response => activeQuestionIds.has(response.question_id));
  const responseByQuestion = new Map(activeResponses.map(response => [response.question_id, response]));
  const core = questions.filter(question =>
    question.active &&
    !question.is_custom &&
    getDiscoveryQuestionConfiguration(question).questionClass === 'CORE'
  );

  let answeredCore = 0;
  let resolvedNotApplicableCore = 0;
  for (const question of core) {
    const response = responseByQuestion.get(question.id);
    if (response?.question_state === 'NOT_APPLICABLE') resolvedNotApplicableCore += 1;
    else if (response?.question_state === 'ANSWERED' && hasMeaningfulDiscoveryAnswer(response)) answeredCore += 1;
  }

  return {
    totalCore: core.length,
    answeredCore,
    resolvedNotApplicableCore,
    unresolvedCore: core.length - answeredCore - resolvedNotApplicableCore,
    needsFollowUp: activeResponses.filter(response =>
      response.question_state === 'NEEDS_FOLLOW_UP' || response.follow_up_required
    ).length,
    awaitingClient: activeResponses.filter(response => response.information_certainty === 'AWAITING_CLIENT').length,
    needsSpecialistValidation: activeResponses.filter(
      response => response.information_certainty === 'NEEDS_SPECIALIST_VALIDATION'
    ).length,
  };
};

export const createCustomDiscoveryQuestionKey = (
  existingKeys: Iterable<string>,
  uuidFactory: () => string = () => globalThis.crypto.randomUUID(),
): string => {
  const existing = new Set(existingKeys);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `custom_${uuidFactory().replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error('Unable to create a unique custom discovery question key.');
};

export const isAdditionalDiscoveryQuestionRelevant = (
  question: CRMDiscoveryQuestion,
  requirements: CRMRequirement[],
  response?: CRMDiscoveryResponse | null,
): boolean => {
  if (response) return true;
  const config = getDiscoveryQuestionConfiguration(question);
  if (config.questionClass === 'RECOMMENDED') return true;
  if (config.relatedRequirementKeys.length === 0) return false;

  const related = requirements.filter(requirement =>
    requirement.record_state === 'ACTIVE' &&
    config.relatedRequirementKeys.includes(requirement.requirement_key)
  );
  if (related.some(requirement => requirement.information_certainty === 'NOT_APPLICABLE')) return false;
  return related.some(requirement =>
    Boolean(requirement.content?.trim()) ||
    hasMeaningfulDiscoveryStructuredValue(requirement.structured_value) ||
    requirement.information_certainty === 'CLIENT_CONFIRMED' ||
    requirement.information_certainty === 'NEEDS_SPECIALIST_VALIDATION'
  );
};
