import { supabase } from './supabase';

export type CRMScopeConditionType = 'ASSUMPTION' | 'EXCLUSION' | 'DEPENDENCY' | 'CLIENT_RESPONSIBILITY' | 'SCOPE_BOUNDARY';
export type CRMScopeConditionState = 'DRAFT' | 'ACTIVE' | 'STALE' | 'RESOLVED' | 'SUPERSEDED' | 'WITHDRAWN';
export type CRMScopeSourceType = 'MANUAL' | 'REQUIREMENT' | 'VALIDATION' | 'MEETING';
export type CRMPromiseType = 'SCOPE' | 'TECHNICAL' | 'TIMELINE' | 'COMMERCIAL' | 'SUPPORT' | 'COMPLIANCE' | 'PERFORMANCE_RESULT' | 'OTHER';
export type CRMPromiseState = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'WITHDRAWN';
export type CRMPromiseSourceType = 'INTERNAL_DRAFT' | 'MANUAL_CLIENT_COMMUNICATION' | 'MEETING' | 'REQUIREMENT' | 'VALIDATION';
export type CRMValidationAlignmentStatus = 'NOT_REQUIRED' | 'PENDING' | 'WITHIN_CONSTRAINTS' | 'CONFLICT';

export type CRMScopeCondition = {
  id: string;
  leadId: string;
  opportunityId?: string | null;
  conditionType: CRMScopeConditionType;
  title: string;
  conditionText: string;
  state: CRMScopeConditionState;
  sourceRequirementId?: string | null;
  sourceValidationId?: string | null;
  sourceMeetingId?: string | null;
  sourceType: CRMScopeSourceType;
  sourceRecordId?: string | null;
  sourceSummary?: string | null;
  validationAlignmentStatus: CRMValidationAlignmentStatus;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  activatedAt?: string | null;
  supersedesConditionId?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  withdrawnAt?: string | null;
  withdrawalReason?: string | null;
  sourceRequirementTitle?: string | null;
  sourceRequirementKey?: string | null;
  sourceRequirementCertainty?: string | null;
  sourceValidationType?: string | null;
  sourceValidationStatus?: string | null;
  approvedConstraints?: string | null;
  sourceMeetingTitle?: string | null;
  sourceMeetingStartAt?: string | null;
};

export type CRMPromise = {
  id: string;
  leadId: string;
  opportunityId?: string | null;
  promiseType: CRMPromiseType;
  promiseText: string;
  internalContext?: string | null;
  recordState: CRMPromiseState;
  sourceType: CRMPromiseSourceType;
  sourceRecordId?: string | null;
  sourceMeetingId?: string | null;
  sourceSummary?: string | null;
  linkedRequirementId?: string | null;
  linkedValidationId?: string | null;
  validationAlignmentStatus: CRMValidationAlignmentStatus;
  promisedBy?: string | null;
  promisedByName?: string | null;
  promisedAt?: string | null;
  recordedBy: string;
  recordedByName?: string | null;
  recordedAt: string;
  updatedAt: string;
  supersedesPromiseId?: string | null;
  withdrawnAt?: string | null;
  withdrawalReason?: string | null;
  linkedRequirementTitle?: string | null;
  linkedRequirementKey?: string | null;
  linkedRequirementCertainty?: string | null;
  linkedValidationType?: string | null;
  linkedValidationStatus?: string | null;
  approvedConstraints?: string | null;
  sourceMeetingTitle?: string | null;
  sourceMeetingStartAt?: string | null;
  futureQuoteCoverage: 'NOT_YET_EVALUATED' | string;
};

export type CRMScopeSourceRequirement = {
  id: string;
  requirementKey: string;
  title: string;
  category: string;
  content?: string | null;
  structuredValue?: unknown;
  isCustom: boolean;
  informationCertainty: string;
  recordState: string;
  sourceType?: string | null;
  updatedAt: string;
  proposalReconciliationStatus?: 'RECONCILED' | 'NOT_MATERIAL' | null;
  proposalScopeConditionId?: string | null;
  proposalReconciliationNote?: string | null;
  proposalReconciledAt?: string | null;
};

export type CRMScopeValidation = {
  id: string;
  validationType: string;
  severity: string;
  status: string;
  subject: string;
  requirementId?: string | null;
  meetingId?: string | null;
  approvedConstraints?: string | null;
  decisionSummary?: string | null;
  updatedAt: string;
  supersedesValidationId?: string | null;
};

export type CRMScopeMeeting = {
  id: string;
  title: string;
  status: string;
  startAt?: string | null;
  completedAt?: string | null;
};

export type CRMScopeCommitmentIssue = {
  code: string;
  message: string;
  hardBlocker?: boolean;
  sourceType?: string;
  conditionId?: string;
  promiseId?: string;
  validationId?: string;
  requiredValidationType?: string;
  approvedConstraints?: string;
  action?: { actionKey: string; label: string; target: string };
};

export type CRMScopeCommitmentAssessment = {
  opportunityId: string;
  leadId: string;
  policyKey: string;
  policyVersion: number;
  evaluatedAt: string;
  scopeConditions: {
    status: string;
    activeCount: number;
    draftCount: number;
    staleCount: number;
    resolvedCount: number;
    supersededCount: number;
    withdrawnCount: number;
    unreconciledRequirements: Array<Record<string, unknown>>;
    blockers: CRMScopeCommitmentIssue[];
    warnings: CRMScopeCommitmentIssue[];
  };
  promises: {
    status: string;
    activeCount: number;
    draftCount: number;
    supersededCount: number;
    withdrawnCount: number;
    unapprovedCount: number;
    validationRequiredCount: number;
    validationConflictCount: number;
    blockers: CRMScopeCommitmentIssue[];
    warnings: CRMScopeCommitmentIssue[];
  };
  blockers: CRMScopeCommitmentIssue[];
  warnings: CRMScopeCommitmentIssue[];
  sourceTraceability: Array<Record<string, unknown>>;
  futureQuoteCoverage: Array<{ key: string; status: 'NOT_YET_EVALUATED' | string; coverageState?: string }>;
  finalQuotationSendGateActive: false;
  writesQuotation: false;
};

export type CRMScopeCommitmentWorkspace = {
  leadId: string;
  opportunityId?: string | null;
  conditions: CRMScopeCondition[];
  promises: CRMPromise[];
  sourceRequirements: CRMScopeSourceRequirement[];
  validations: CRMScopeValidation[];
  meetings: CRMScopeMeeting[];
  assessment?: CRMScopeCommitmentAssessment | null;
};

export type SaveScopeConditionDraftInput = {
  conditionId?: string | null;
  leadId: string;
  opportunityId?: string | null;
  conditionType: CRMScopeConditionType;
  title: string;
  conditionText: string;
  sourceRequirementId?: string | null;
  sourceValidationId?: string | null;
  sourceMeetingId?: string | null;
  sourceType: CRMScopeSourceType;
  sourceRecordId?: string | null;
  sourceSummary?: string | null;
  validationAlignmentStatus?: CRMValidationAlignmentStatus | null;
};

export type SavePromiseDraftInput = {
  promiseId?: string | null;
  leadId: string;
  opportunityId?: string | null;
  promiseType: CRMPromiseType;
  promiseText: string;
  internalContext?: string | null;
  sourceType: CRMPromiseSourceType;
  sourceRecordId?: string | null;
  sourceMeetingId?: string | null;
  sourceSummary?: string | null;
  linkedRequirementId?: string | null;
  linkedValidationId?: string | null;
  validationAlignmentStatus?: CRMValidationAlignmentStatus | null;
};

const rpcError = (fallback: string, error?: { message?: string } | null) => {
  const detail = error?.message?.trim();
  return new Error(detail ? `${fallback} ${detail}` : fallback);
};

export const crmSalesScopeCommitmentService = {
  async getWorkspace(input: { leadId: string; opportunityId?: string | null }): Promise<CRMScopeCommitmentWorkspace> {
    const { data, error } = await supabase.rpc('crm_get_sales_scope_commitment_workspace', {
      p_lead_id: input.leadId,
      p_opportunity_id: input.opportunityId || null,
    });
    if (error) throw rpcError('Scope & Commitments could not be loaded.', error);
    return data as CRMScopeCommitmentWorkspace;
  },

  async saveConditionDraft(input: SaveScopeConditionDraftInput): Promise<string> {
    const { data, error } = await supabase.rpc('crm_save_sales_scope_condition_draft', {
      p_condition_id: input.conditionId || null,
      p_lead_id: input.leadId,
      p_opportunity_id: input.opportunityId || null,
      p_condition_type: input.conditionType,
      p_title: input.title.trim(),
      p_condition_text: input.conditionText.trim(),
      p_source_requirement_id: input.sourceRequirementId || null,
      p_source_validation_id: input.sourceValidationId || null,
      p_source_meeting_id: input.sourceMeetingId || null,
      p_source_type: input.sourceType,
      p_source_record_id: input.sourceRecordId?.trim() || null,
      p_source_summary: input.sourceSummary?.trim() || null,
      p_validation_alignment_status: input.validationAlignmentStatus || null,
    });
    if (error) throw rpcError('Scope Condition draft could not be saved.', error);
    return data as string;
  },

  async reviseCondition(input: { conditionId: string; title: string; conditionText: string; validationAlignmentStatus?: CRMValidationAlignmentStatus | null }): Promise<string> {
    const { data, error } = await supabase.rpc('crm_revise_sales_scope_condition', {
      p_condition_id: input.conditionId,
      p_title: input.title.trim(),
      p_condition_text: input.conditionText.trim(),
      p_validation_alignment_status: input.validationAlignmentStatus || null,
    });
    if (error) throw rpcError('Scope Condition revision could not be created.', error);
    return data as string;
  },

  async transitionCondition(input: { conditionId: string; action: 'ACTIVATE' | 'RESOLVE' | 'WITHDRAW'; reason?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('crm_transition_sales_scope_condition', {
      p_condition_id: input.conditionId,
      p_action: input.action,
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw rpcError('Scope Condition lifecycle action failed.', error);
    return data as string;
  },

  async reconcileRequirement(input: { requirementId: string; action: 'LINK_CONDITION' | 'NOT_MATERIAL'; conditionId?: string | null; note?: string | null }): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('crm_reconcile_sales_scope_requirement', {
      p_requirement_id: input.requirementId,
      p_action: input.action,
      p_condition_id: input.conditionId || null,
      p_note: input.note?.trim() || null,
    });
    if (error) throw rpcError('Requirement reconciliation failed.', error);
    return (data || {}) as Record<string, unknown>;
  },

  async savePromiseDraft(input: SavePromiseDraftInput): Promise<string> {
    const { data, error } = await supabase.rpc('crm_save_sales_promise_draft', {
      p_promise_id: input.promiseId || null,
      p_lead_id: input.leadId,
      p_opportunity_id: input.opportunityId || null,
      p_promise_type: input.promiseType,
      p_promise_text: input.promiseText.trim(),
      p_internal_context: input.internalContext?.trim() || null,
      p_source_type: input.sourceType,
      p_source_record_id: input.sourceRecordId?.trim() || null,
      p_source_meeting_id: input.sourceMeetingId || null,
      p_source_summary: input.sourceSummary?.trim() || null,
      p_linked_requirement_id: input.linkedRequirementId || null,
      p_linked_validation_id: input.linkedValidationId || null,
      p_validation_alignment_status: input.validationAlignmentStatus || null,
    });
    if (error) throw rpcError('Promise draft could not be saved.', error);
    return data as string;
  },

  async revisePromise(input: Omit<SavePromiseDraftInput, 'promiseId' | 'leadId' | 'opportunityId' | 'promiseType'> & { promiseId: string }): Promise<string> {
    const { data, error } = await supabase.rpc('crm_revise_sales_promise', {
      p_promise_id: input.promiseId,
      p_promise_text: input.promiseText.trim(),
      p_internal_context: input.internalContext?.trim() || null,
      p_source_type: input.sourceType,
      p_source_record_id: input.sourceRecordId?.trim() || null,
      p_source_meeting_id: input.sourceMeetingId || null,
      p_source_summary: input.sourceSummary?.trim() || null,
      p_linked_requirement_id: input.linkedRequirementId || null,
      p_linked_validation_id: input.linkedValidationId || null,
      p_validation_alignment_status: input.validationAlignmentStatus || null,
    });
    if (error) throw rpcError('Promise revision could not be created.', error);
    return data as string;
  },

  async transitionPromise(input: { promiseId: string; action: 'ACTIVATE' | 'WITHDRAW'; clientCommunicated?: boolean; reason?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('crm_transition_sales_promise', {
      p_promise_id: input.promiseId,
      p_action: input.action,
      p_client_communicated: Boolean(input.clientCommunicated),
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw rpcError('Promise lifecycle action failed.', error);
    return data as string;
  },
};
