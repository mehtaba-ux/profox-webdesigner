import { supabase } from './supabase';

export type CRMSalesValidationType = 'TECHNICAL' | 'COMMERCIAL' | 'TIMELINE' | 'COMPLIANCE_RISK' | 'SCOPE';
export type CRMSalesValidationSeverity = 'GREEN' | 'AMBER' | 'RED';
export type CRMSalesValidationStatus = 'PENDING' | 'IN_REVIEW' | 'NEEDS_INFORMATION' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'STALE';
export type CRMSalesValidationSourceType = 'REQUIREMENT' | 'PACKAGE_FIT' | 'MEETING' | 'MANUAL';

export type CRMSalesValidation = {
  id: string;
  leadId: string;
  opportunityId: string | null;
  requirementId: string | null;
  meetingId: string | null;
  productId: string | null;
  packageFitPolicyKey?: string | null;
  packageFitPolicyVersion?: number | null;
  validationType: CRMSalesValidationType;
  severity: CRMSalesValidationSeverity;
  subject: string;
  requestContext: string;
  sourceType: CRMSalesValidationSourceType;
  sourceKey: string;
  sourceSnapshot?: Record<string, unknown>;
  sourceChangedAt?: string | null;
  status: CRMSalesValidationStatus;
  reviewerTeam: string;
  requestedBy: string;
  requestedByName?: string | null;
  requestedAt: string;
  assignedReviewerId: string | null;
  assignedReviewerName?: string | null;
  startedAt: string | null;
  informationRequested: string | null;
  resubmissionNote: string | null;
  decisionSummary: string | null;
  approvedConstraints: string | null;
  rejectionReworkReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  supersedesValidationId: string | null;
  requirementTitle?: string | null;
  requirementKey?: string | null;
  requirementCertainty?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CRMRequirementValidationState = {
  id: string;
  requirementKey: string;
  title: string;
  category: string;
  informationCertainty: string;
  updatedAt: string;
  latestValidationId: string | null;
  latestValidationType: CRMSalesValidationType | null;
  latestValidationSeverity: CRMSalesValidationSeverity | null;
  latestValidationStatus: CRMSalesValidationStatus | null;
  latestApprovedConstraints: string | null;
  latestInformationRequested: string | null;
  reviewerTeam: string | null;
};

export type CRMSalesValidationWorkspace = {
  leadId: string;
  opportunityId: string | null;
  validations: CRMSalesValidation[];
  requirementsNeedingValidation: CRMRequirementValidationState[];
  summary: {
    requiredReviews: number;
    pending: number;
    needsInformation: number;
    approved: number;
    criticalUnresolved: number;
  };
};

export type CRMSalesValidationQueueItem = {
  id: string;
  validationType: CRMSalesValidationType;
  severity: CRMSalesValidationSeverity;
  status: CRMSalesValidationStatus;
  subject: string;
  leadId: string;
  leadTitle: string;
  companyName: string;
  opportunityId: string | null;
  opportunityName: string | null;
  requirementId: string | null;
  requirementTitle: string | null;
  requirementKey: string | null;
  sourceType: CRMSalesValidationSourceType;
  sourceKey: string;
  reviewerTeam: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  assignedReviewerId: string | null;
  assignedReviewerName: string | null;
  sourceChangedAt: string | null;
  updatedAt: string;
};

export type CRMSalesValidationDetail = {
  validation: CRMSalesValidation & { sourceAcknowledgedAt?: string | null };
  lead: { id: string; title: string; companyName: string };
  opportunity: { id: string; name: string; stage: string } | null;
  requirement: {
    id: string;
    requirementKey: string;
    title: string;
    category: string;
    content: string | null;
    structuredValue: unknown;
    informationCertainty: string;
    recordState: string;
    updatedAt: string;
  } | null;
  product: {
    id: string;
    code: string;
    name: string;
    productType: string;
    technology: string | null;
    scope: unknown;
    managerApprovalRequired: boolean | null;
    timelineImpact: string | null;
    updatedAt: string;
  } | null;
  requester: { id: string; name: string };
  assignedReviewer: { id: string; name: string; role: string; department: string } | null;
};

export type RequestSalesValidationInput = {
  leadId: string;
  opportunityId?: string | null;
  requirementId?: string | null;
  meetingId?: string | null;
  productId?: string | null;
  validationType?: CRMSalesValidationType | null;
  subject: string;
  requestContext: string;
  sourceType: CRMSalesValidationSourceType;
  sourceKey?: string | null;
};

export type TransitionSalesValidationInput = {
  validationId: string;
  action: 'START' | 'NEEDS_INFORMATION' | 'RESUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL';
  informationRequest?: string | null;
  resubmissionNote?: string | null;
  decisionSummary?: string | null;
  approvedConstraints?: string | null;
  rejectionReason?: string | null;
  cancelReason?: string | null;
};

const safeError = (message: string) => new Error(message);

export const crmSalesValidationService = {
  async getWorkspace(leadId: string, opportunityId?: string | null): Promise<CRMSalesValidationWorkspace> {
    const { data, error } = await supabase.rpc('crm_get_sales_validation_workspace', {
      p_lead_id: leadId,
      p_opportunity_id: opportunityId ?? null,
    });
    if (error || !data) throw safeError('Sales validation information could not be loaded.');
    return data as CRMSalesValidationWorkspace;
  },

  async request(input: RequestSalesValidationInput): Promise<CRMSalesValidation> {
    const { data, error } = await supabase.rpc('crm_request_sales_validation', {
      p_lead_id: input.leadId,
      p_opportunity_id: input.opportunityId ?? null,
      p_requirement_id: input.requirementId ?? null,
      p_meeting_id: input.meetingId ?? null,
      p_product_id: input.productId ?? null,
      p_validation_type: input.validationType ?? null,
      p_subject: input.subject,
      p_request_context: input.requestContext,
      p_source_type: input.sourceType,
      p_source_key: input.sourceKey ?? null,
    });
    if (error || !data) throw safeError(error?.message || 'The review request could not be created.');
    return data as CRMSalesValidation;
  },

  async transition(input: TransitionSalesValidationInput): Promise<CRMSalesValidation> {
    const { data, error } = await supabase.rpc('crm_transition_sales_validation', {
      p_validation_id: input.validationId,
      p_action: input.action,
      p_information_request: input.informationRequest ?? null,
      p_resubmission_note: input.resubmissionNote ?? null,
      p_decision_summary: input.decisionSummary ?? null,
      p_approved_constraints: input.approvedConstraints ?? null,
      p_rejection_reason: input.rejectionReason ?? null,
      p_cancel_reason: input.cancelReason ?? null,
    });
    if (error || !data) throw safeError(error?.message || 'The review action could not be completed.');
    return data as CRMSalesValidation;
  },

  async getQueue(): Promise<CRMSalesValidationQueueItem[]> {
    const { data, error } = await supabase.rpc('crm_get_sales_validation_queue');
    if (error || !data) throw safeError('The Sales Validation queue could not be loaded.');
    return ((data as { items?: CRMSalesValidationQueueItem[] }).items || []);
  },

  async getDetail(validationId: string): Promise<CRMSalesValidationDetail> {
    const { data, error } = await supabase.rpc('crm_get_sales_validation_detail', { p_validation_id: validationId });
    if (error || !data) throw safeError('This Sales validation could not be opened.');
    return data as CRMSalesValidationDetail;
  },
};
