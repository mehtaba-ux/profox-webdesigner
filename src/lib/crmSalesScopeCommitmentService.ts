import { supabase } from './supabase';

export type CRMScopeConditionType = 'ASSUMPTION' | 'EXCLUSION' | 'DEPENDENCY' | 'CLIENT_RESPONSIBILITY' | 'SCOPE_BOUNDARY';
export type CRMScopeConditionState = 'DRAFT' | 'ACTIVE' | 'STALE' | 'RESOLVED' | 'SUPERSEDED' | 'WITHDRAWN';
export type CRMPromiseType = 'SCOPE' | 'TECHNICAL' | 'TIMELINE' | 'COMMERCIAL' | 'SUPPORT' | 'COMPLIANCE' | 'PERFORMANCE_RESULT' | 'OTHER';
export type CRMPromiseState = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'WITHDRAWN';
export type CRMValidationAlignment = 'NOT_REQUIRED' | 'PENDING' | 'WITHIN_CONSTRAINTS' | 'CONFLICT';

export type CRMScopeCondition = {
  id: string;
  leadId: string;
  opportunityId: string | null;
  conditionType: CRMScopeConditionType;
  title: string;
  conditionText: string;
  state: CRMScopeConditionState;
  sourceRequirementId: string | null;
  sourceValidationId: string | null;
  sourceMeetingId: string | null;
  sourceType: 'MANUAL' | 'REQUIREMENT' | 'VALIDATION' | 'MEETING';
  sourceRecordId: string | null;
  sourceSummary: string | null;
  validationAlignmentStatus: CRMValidationAlignment;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  supersedesConditionId: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  sourceRequirementTitle?: string | null;
  sourceRequirementKey?: string | null;
  sourceRequirementCertainty?: string | null;
  sourceValidationType?: string | null;
  sourceValidationStatus?: string | null;
  approvedConstraints?: string | null;
  sourceMeetingTitle?: string | null;
  sourceMeetingStartAt?: string | null;
};

export type CRMSalesPromise = {
  id: string;
  leadId: string;
  opportunityId: string | null;
  promiseType: CRMPromiseType;
  promiseText: string;
  internalContext: string | null;
  recordState: CRMPromiseState;
  sourceType: 'INTERNAL_DRAFT' | 'MANUAL_CLIENT_COMMUNICATION' | 'MEETING' | 'REQUIREMENT' | 'VALIDATION';
  sourceRecordId: string | null;
  sourceMeetingId: string | null;
  sourceSummary: string | null;
  linkedRequirementId: string | null;
  linkedValidationId: string | null;
  validationAlignmentStatus: CRMValidationAlignment;
  promisedBy: string | null;
  promisedByName?: string | null;
  promisedAt: string | null;
  recordedBy: string;
  recordedByName?: string | null;
  recordedAt: string;
  updatedAt: string;
  supersedesPromiseId: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  linkedRequirementTitle?: string | null;
  linkedRequirementKey?: string | null;
  linkedRequirementCertainty?: string | null;
  linkedValidationType?: string | null;
  linkedValidationStatus?: string | null;
  approvedConstraints?: string | null;
  sourceMeetingTitle?: string | null;
  sourceMeetingStartAt?: string | null;
  futureQuoteCoverage?: 'NOT_YET_EVALUATED' | string;
};

export type CRMScopeSourceRequirement = {
  id: string;
  requirementKey: string;
  title: string;
  category: string;
  content: string | null;
  structuredValue: unknown;
  isCustom: boolean;
  informationCertainty: string;
  recordState: string;
  sourceType: string | null;
  updatedAt: string;
  proposalReconciliationStatus: 'RECONCILED' | 'NOT_MATERIAL' | null;
  proposalScopeConditionId: string | null;
  proposalReconciliationNote: string | null;
  proposalReconciledAt: string | null;
};

export type CRMScopeValidation = {
  id: string;
  validationType: string;
  severity: string;
  status: string;
  subject: string;
  requirementId: string | null;
  meetingId: string | null;
  approvedConstraints: string | null;
  decisionSummary: string | null;
  updatedAt: string;
  supersedesValidationId: string | null;
};

export type CRMScopeMeeting = { id: string; title: string; status: string; startAt: string; completedAt: string | null };

export type CRMScopeCommitmentIssue = { code: string; message: string; sourceType?: string; hardBlocker?: boolean; conditionId?: string; promiseId?: string; validationId?: string; approvedConstraints?: string; action?: { actionKey: string; label: string; target: string } };
export type CRMScopeCommitmentAssessment = {
  opportunityId: string;
  leadId: string;
  evaluatedAt: string;
  scopeConditions: { status: 'READY' | 'NEEDS_RECONCILIATION' | 'BLOCKED'; activeCount: number; draftCount: number; staleCount: number; resolvedCount: number; supersededCount: number; withdrawnCount: number; unreconciledRequirements: Array<Record<string, unknown>>; blockers: CRMScopeCommitmentIssue[]; warnings: CRMScopeCommitmentIssue[] };
  promises: { status: 'NO_ACTIVE_PROMISES' | 'READY' | 'REVIEW_REQUIRED' | 'BLOCKED'; activeCount: number; draftCount: number; supersededCount: number; withdrawnCount: number; unapprovedCount: number; validationRequiredCount: number; validationConflictCount: number; blockers: CRMScopeCommitmentIssue[]; warnings: CRMScopeCommitmentIssue[] };
  blockers: CRMScopeCommitmentIssue[];
  warnings: CRMScopeCommitmentIssue[];
  sourceTraceability: Array<Record<string, unknown>>;
  futureQuoteCoverage: Array<{ key: string; status: 'NOT_YET_EVALUATED' | string; coverageState: string }>;
  finalQuotationSendGateActive: boolean;
  writesQuotation: boolean;
};

export type CRMSalesScopeCommitmentWorkspace = {
  leadId: string;
  opportunityId: string | null;
  conditions: CRMScopeCondition[];
  promises: CRMSalesPromise[];
  sourceRequirements: CRMScopeSourceRequirement[];
  validations: CRMScopeValidation[];
  meetings: CRMScopeMeeting[];
  assessment: CRMScopeCommitmentAssessment | null;
};

export type SaveConditionDraftInput = {
  conditionId?: string | null; leadId: string; opportunityId?: string | null; conditionType: CRMScopeConditionType; title: string; conditionText: string;
  sourceRequirementId?: string | null; sourceValidationId?: string | null; sourceMeetingId?: string | null; sourceType?: CRMScopeCondition['sourceType']; sourceRecordId?: string | null; sourceSummary?: string | null; validationAlignmentStatus?: CRMValidationAlignment | null;
};
export type SavePromiseDraftInput = {
  promiseId?: string | null; leadId: string; opportunityId?: string | null; promiseType: CRMPromiseType; promiseText: string; internalContext?: string | null;
  sourceType?: CRMSalesPromise['sourceType']; sourceRecordId?: string | null; sourceMeetingId?: string | null; sourceSummary?: string | null; linkedRequirementId?: string | null; linkedValidationId?: string | null; validationAlignmentStatus?: CRMValidationAlignment | null;
};

const genericError = (message: string) => new Error(message);

export const crmSalesScopeCommitmentService = {
  async getWorkspace(leadId: string, opportunityId?: string | null): Promise<CRMSalesScopeCommitmentWorkspace> {
    const { data, error } = await supabase.rpc('crm_get_sales_scope_commitment_workspace', { p_lead_id: leadId, p_opportunity_id: opportunityId ?? null });
    if (error || !data) throw genericError('Scope & Commitments could not be loaded. Refresh the CRM context and try again.');
    return data as CRMSalesScopeCommitmentWorkspace;
  },

  async saveConditionDraft(input: SaveConditionDraftInput): Promise<string> {
    const { data, error } = await supabase.rpc('crm_save_sales_scope_condition_draft', {
      p_condition_id: input.conditionId ?? null, p_lead_id: input.leadId, p_opportunity_id: input.opportunityId ?? null,
      p_condition_type: input.conditionType, p_title: input.title, p_condition_text: input.conditionText,
      p_source_requirement_id: input.sourceRequirementId ?? null, p_source_validation_id: input.sourceValidationId ?? null, p_source_meeting_id: input.sourceMeetingId ?? null,
      p_source_type: input.sourceType ?? 'MANUAL', p_source_record_id: input.sourceRecordId ?? null, p_source_summary: input.sourceSummary ?? null,
      p_validation_alignment_status: input.validationAlignmentStatus ?? null,
    });
    if (error || !data) throw genericError('The Scope Condition draft could not be saved. Review the source and try again.');
    return data as string;
  },

  async reconcileRequirement(requirementId: string, action: 'LINK_CONDITION' | 'NOT_MATERIAL', conditionId?: string | null, note?: string | null) {
    const { data, error } = await supabase.rpc('crm_reconcile_sales_scope_requirement', { p_requirement_id: requirementId, p_action: action, p_condition_id: conditionId ?? null, p_note: note ?? null });
    if (error || !data) throw genericError('Requirement reconciliation could not be saved. Refresh the source and try again.');
    return data as Record<string, unknown>;
  },

  async reviseCondition(conditionId: string, title: string, conditionText: string, alignment?: CRMValidationAlignment | null): Promise<string> {
    const { data, error } = await supabase.rpc('crm_revise_sales_scope_condition', { p_condition_id: conditionId, p_title: title, p_condition_text: conditionText, p_validation_alignment_status: alignment ?? null });
    if (error || !data) throw genericError('The history-safe Scope Condition revision could not be created.');
    return data as string;
  },

  async transitionCondition(conditionId: string, action: 'ACTIVATE' | 'RESOLVE' | 'WITHDRAW', reason?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('crm_transition_sales_scope_condition', { p_condition_id: conditionId, p_action: action, p_reason: reason ?? null });
    if (error || !data) throw genericError('The Scope Condition action could not be completed. Refresh the current record and try again.');
    return data as string;
  },

  async savePromiseDraft(input: SavePromiseDraftInput): Promise<string> {
    const { data, error } = await supabase.rpc('crm_save_sales_promise_draft', {
      p_promise_id: input.promiseId ?? null, p_lead_id: input.leadId, p_opportunity_id: input.opportunityId ?? null, p_promise_type: input.promiseType,
      p_promise_text: input.promiseText, p_internal_context: input.internalContext ?? null, p_source_type: input.sourceType ?? 'INTERNAL_DRAFT',
      p_source_record_id: input.sourceRecordId ?? null, p_source_meeting_id: input.sourceMeetingId ?? null, p_source_summary: input.sourceSummary ?? null,
      p_linked_requirement_id: input.linkedRequirementId ?? null, p_linked_validation_id: input.linkedValidationId ?? null, p_validation_alignment_status: input.validationAlignmentStatus ?? null,
    });
    if (error || !data) throw genericError('The Promise draft could not be saved. Review the source and try again.');
    return data as string;
  },

  async revisePromise(input: Omit<SavePromiseDraftInput, 'leadId' | 'opportunityId' | 'promiseId' | 'promiseType'> & { promiseId: string }): Promise<string> {
    const { data, error } = await supabase.rpc('crm_revise_sales_promise', {
      p_promise_id: input.promiseId, p_promise_text: input.promiseText, p_internal_context: input.internalContext ?? null, p_source_type: input.sourceType ?? 'INTERNAL_DRAFT',
      p_source_record_id: input.sourceRecordId ?? null, p_source_meeting_id: input.sourceMeetingId ?? null, p_source_summary: input.sourceSummary ?? null,
      p_linked_requirement_id: input.linkedRequirementId ?? null, p_linked_validation_id: input.linkedValidationId ?? null, p_validation_alignment_status: input.validationAlignmentStatus ?? null,
    });
    if (error || !data) throw genericError('The history-safe Promise revision could not be created.');
    return data as string;
  },

  async transitionPromise(promiseId: string, action: 'ACTIVATE' | 'WITHDRAW', clientCommunicated = false, reason?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('crm_transition_sales_promise', { p_promise_id: promiseId, p_action: action, p_client_communicated: clientCommunicated, p_reason: reason ?? null });
    if (error || !data) throw genericError('The Promise action could not be completed. Refresh the current commitment and try again.');
    return data as string;
  },
};
