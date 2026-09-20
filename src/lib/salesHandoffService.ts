import { supabase } from './supabase';

export type SalesHandoffLifecycleStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'RESUBMITTED' | 'RETURNED_TO_SALES' | 'ACCEPTED';
export type SalesHandoffReadinessStatus = 'READY' | 'WARNING' | 'BLOCKED';

export interface SalesHandoffIssue {
  code: string;
  message: string;
  sourceType?: string;
  actionUrl?: string;
  [key: string]: unknown;
}

export interface SalesHandoffReadiness {
  projectId: string;
  status: SalesHandoffReadinessStatus;
  blockers: SalesHandoffIssue[];
  warnings: SalesHandoffIssue[];
  outstandingDeliveryDependencies: Array<Record<string, unknown>>;
  checks: Record<string, unknown>;
}

export interface SalesHandoffAttempt {
  id: string;
  attemptNumber: number;
  status: Exclude<SalesHandoffLifecycleStatus, 'NOT_SUBMITTED'>;
  submittedBy?: string | null;
  submittedByName?: string | null;
  submittedAt?: string | null;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  decision?: string | null;
  returnReasonCodes?: string[];
  returnNotes?: string | null;
  missingItems?: Array<Record<string, unknown>>;
  sourceRefs?: Record<string, unknown>;
  sourceDigest?: string | null;
  sourceDrift?: boolean;
  resubmittedFromAttemptId?: string | null;
}

export interface SalesHandoffBrief {
  projectId: string;
  projectNumber: string;
  projectName: string;
  projectStage: string;
  projectStatus: string;
  packageSnapshot?: string | null;
  customer: {
    clientId?: string | null;
    companyName?: string | null;
    primaryContact?: string | null;
    email?: string | null;
    phone?: string | null;
    country?: string | null;
    industry?: string | null;
  };
  sourceOpportunity: {
    id?: string | null;
    stage?: string | null;
    status?: string | null;
    leadId?: string | null;
  };
  seller: { id?: string | null; name?: string | null };
  projectManager: { id?: string | null; name?: string | null };
  businessContext: Record<string, string | null | undefined>;
  requirements: Array<Record<string, any>>;
  requirementsCaptured: boolean;
  salesRequirements?: string | null;
  legacyRequirementsSummaryAuthoritative?: boolean;
  scopeSummary?: string | null;
  exclusions?: string | null;
  quotation: {
    id?: string | null;
    number?: string | null;
    status?: string | null;
    revisionNumber?: number | null;
    total?: number | null;
    currency?: string | null;
    acceptedAt?: string | null;
    scopeSummary?: string | null;
    exclusions?: string | null;
    clientResponsibilities?: string | null;
    deliveryAssumptions?: string | null;
    handoverSupport?: string | null;
    paymentTerms?: string | null;
    durationSnapshotText?: string | null;
    salesScopeSnapshotPresent?: boolean;
    salesScopeSnapshotAt?: string | null;
    salesScopeSnapshotSchemaVersion?: number | null;
    salesScopeSnapshot?: Record<string, unknown> | null;
    items: Array<Record<string, any>>;
    url?: string | null;
  };
  payment: {
    verified: boolean;
    id?: string | null;
    reference?: string | null;
    type?: string | null;
    amountPaid?: number | null;
    currency?: string | null;
    verifiedAt?: string | null;
    url?: string | null;
  };
  onboarding: {
    id?: string | null;
    status?: string | null;
    completed: boolean;
    completedAt?: string | null;
    questionCount: number;
    responseCount: number;
    deliveryFacts?: Record<string, string | null | undefined>;
    url?: string | null;
  };
  discovery: Record<string, string | null | undefined>;
  validations: Array<Record<string, any>>;
  promises: Array<Record<string, any>>;
  scopeConditions: Array<Record<string, any>>;
  timeline: Record<string, any>;
  outstandingDeliveryDependencies: Array<Record<string, any>>;
  readiness: SalesHandoffReadiness;
  sellerNotes?: string | null;
  sellerHandoffDone: boolean;
  pmReviewStatus: string;
  lifecycleStatus: SalesHandoffLifecycleStatus;
  currentAttempt?: SalesHandoffAttempt | null;
  history: SalesHandoffAttempt[];
  sourceDrift: boolean;
  firstPassAccepted: boolean;
  canSubmit: boolean;
  canAccept: boolean;
  canReturn: boolean;
  readyToSend: boolean;
  blockedReason?: string | null;
  sourceLinks: Record<string, string>;
}

export interface SalesRequirementsRestoration {
  projectId: string;
  opportunityId: string;
  requirements: string;
  alreadyCaptured: boolean;
  restored: boolean;
}

export interface SalesHandoffSubmission {
  projectId: string;
  attemptId?: string;
  attemptNumber: number;
  status: string;
  submittedBy: string;
  submittedAt: string;
  idempotent?: boolean;
  readinessStatus?: string;
  projectManagerAssigned?: boolean;
  nextProductionStage?: string;
}

export interface SalesHandoffDecision {
  projectId: string;
  attemptNumber: number;
  status: 'ACCEPTED' | 'RETURNED_TO_SALES';
  acceptedBy?: string;
  acceptedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reasonCodes?: string[];
  missingItems?: Array<Record<string, unknown>>;
  idempotent?: boolean;
  contentGateSatisfied?: boolean;
  salesOwnershipRestored?: boolean;
}

export const SALES_HANDOFF_RETURN_REASONS = [
  'MISSING_REQUIREMENT',
  'UNCLEAR_REQUIREMENT',
  'SCOPE_CONFLICT',
  'PROMISE_NOT_COVERED',
  'VALIDATION_MISSING',
  'TIMELINE_CONFLICT',
  'CLIENT_DEPENDENCY_MISSING',
  'ONBOARDING_INFORMATION_INCOMPLETE',
  'COMMERCIAL_CLARIFICATION',
  'OTHER'
] as const;

export type SalesHandoffReturnReason = typeof SALES_HANDOFF_RETURN_REASONS[number];

export const salesHandoffService = {
  async getBrief(projectId: string): Promise<SalesHandoffBrief> {
    const { data, error } = await supabase.rpc('project_get_sales_handoff_brief', {
      p_project_id: projectId
    });
    if (error) throw error;
    if (!data) throw new Error('Sales handoff brief is unavailable.');
    return data as SalesHandoffBrief;
  },

  async restoreMissingRequirements(projectId: string, requirements: string): Promise<SalesRequirementsRestoration> {
    const { data, error } = await supabase.rpc('record_missing_sales_project_requirements', {
      p_project_id: projectId,
      p_requirements: requirements
    });
    if (error) throw error;
    if (!data) throw new Error('Missing Sales requirements could not be restored.');
    return data as SalesRequirementsRestoration;
  },

  async submit(projectId: string, notes: string): Promise<SalesHandoffSubmission> {
    const { data, error } = await supabase.rpc('submit_sales_project_handover', {
      p_project_id: projectId,
      p_notes: notes
    });
    if (error) throw error;
    if (!data) throw new Error('Sales handoff could not be submitted.');
    return data as SalesHandoffSubmission;
  },

  async accept(projectId: string, expectedAttempt: number): Promise<SalesHandoffDecision> {
    const { data, error } = await supabase.rpc('accept_sales_project_handover', {
      p_project_id: projectId,
      p_expected_attempt: expectedAttempt
    });
    if (error) throw error;
    if (!data) throw new Error('Sales handoff could not be accepted.');
    return data as SalesHandoffDecision;
  },

  async returnToSales(params: {
    projectId: string;
    expectedAttempt: number;
    reasonCodes: SalesHandoffReturnReason[];
    missingItems: Array<Record<string, unknown>>;
    reviewNotes: string;
  }): Promise<SalesHandoffDecision> {
    const { data, error } = await supabase.rpc('return_sales_project_handover', {
      p_project_id: params.projectId,
      p_expected_attempt: params.expectedAttempt,
      p_reason_codes: params.reasonCodes,
      p_missing_items: params.missingItems,
      p_review_notes: params.reviewNotes
    });
    if (error) throw error;
    if (!data) throw new Error('Sales handoff could not be returned to Sales.');
    return data as SalesHandoffDecision;
  }
};
