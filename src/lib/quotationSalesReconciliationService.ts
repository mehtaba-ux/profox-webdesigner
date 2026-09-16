import { supabase } from './supabase';

export type QuotationSalesCoverageStatus =
  | 'UNMAPPED'
  | 'PARTIAL'
  | 'COVERED'
  | 'CONFLICT'
  | 'STALE'
  | 'LEGACY_NOT_CAPTURED';

export type QuotationSalesCoverageReviewStatus = 'PARTIAL' | 'COVERED' | 'CONFLICT';
export type QuotationSalesCoverageTargetType = 'QUOTATION_FIELD' | 'QUOTATION_ITEM';
export type QuotationSalesSourceType = 'SCOPE_CONDITION' | 'PROMISE';

export interface QuotationSalesTargetEvidence {
  exists?: boolean;
  customerVisible?: boolean;
  contentPresent?: boolean;
  prohibited?: boolean;
  targetType?: QuotationSalesCoverageTargetType;
  fieldKey?: string;
  itemId?: string;
  label?: string;
  productCode?: string;
  excerpt?: string | null;
  fingerprint?: string | null;
}

export interface QuotationSalesValidationContext {
  validationId?: string;
  validationType?: string;
  status?: string;
  approvedConstraints?: string | null;
}

export interface QuotationTimelineComparison {
  parsed?: boolean;
  minDays?: number;
  maxDays?: number;
  unit?: string;
  quotationMinDays?: number | null;
  quotationMaxDays?: number | null;
  quotationUnit?: string | null;
  quotationText?: string | null;
  status?: 'ALIGNED' | 'CONFLICT' | 'NOT_EVALUATED' | string;
  reason?: string | null;
}

export interface QuotationCommercialApprovalContext {
  required?: boolean;
  satisfied?: boolean;
  status?: 'APPROVED' | 'NOT_REQUIRED' | 'APPROVAL_REQUIRED' | string;
  quotationStatus?: string | null;
  approvalDecision?: string | null;
  approvalRequestedAt?: string | null;
  approvalDecidedAt?: string | null;
  reasons?: string[];
}

export interface QuotationScopeCoverageRow {
  conditionId: string;
  conditionType: string;
  title: string;
  conditionText: string;
  sourceType?: string | null;
  sourceRequirementId?: string | null;
  sourceValidationId?: string | null;
  sourceMeetingId?: string | null;
  sourceSummary?: string | null;
  validationAlignmentStatus?: string | null;
  validation?: QuotationSalesValidationContext | null;
  coverageId?: string | null;
  storedCoverageStatus?: string | null;
  coverageStatus: QuotationSalesCoverageStatus;
  targetType?: QuotationSalesCoverageTargetType | null;
  quotationFieldKey?: string | null;
  quotationItemId?: string | null;
  targetExcerpt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  coverageNote?: string | null;
  eligibleTargets: string[];
}

export interface QuotationPromiseCoverageRow {
  promiseId: string;
  promiseType: string;
  promiseText: string;
  recordState?: string;
  promisedBy?: string | null;
  promisedByName?: string | null;
  promisedAt?: string | null;
  sourceType?: string | null;
  sourceSummary?: string | null;
  linkedRequirementId?: string | null;
  linkedValidationId?: string | null;
  validationAlignmentStatus?: string | null;
  validation?: QuotationSalesValidationContext | null;
  promiseIntegrityStatus?: 'PASS' | 'BLOCKED' | string;
  futureSendBlockerStatus?: 'PASS' | 'BLOCKED' | string;
  timelineComparison?: QuotationTimelineComparison | null;
  commercialApproval?: QuotationCommercialApprovalContext | null;
  coverageId?: string | null;
  storedCoverageStatus?: string | null;
  coverageStatus: QuotationSalesCoverageStatus;
  targetType?: QuotationSalesCoverageTargetType | null;
  quotationFieldKey?: string | null;
  quotationItemId?: string | null;
  targetExcerpt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  coverageNote?: string | null;
  eligibleTargets: string[];
}

export interface QuotationDraftPromiseRow {
  promiseId: string;
  promiseType: string;
  promiseText: string;
  recordState: 'DRAFT' | string;
  displayStatus?: string;
  sourceType?: string | null;
  sourceSummary?: string | null;
  recordedBy?: string | null;
  recordedByName?: string | null;
  recordedAt?: string | null;
  updatedAt?: string | null;
}

export interface QuotationSalesDimension {
  key: 'PROMISE_COVERAGE' | 'FINAL_SCOPE_RECONCILIATION' | 'QUOTATION_SNAPSHOT_COVERAGE' | string;
  status: string;
  coverageState?: string;
  activeCount?: number;
  coveredCount?: number;
  draftCount?: number;
}

export interface QuotationSalesIssue {
  code?: string;
  message?: string;
  sourceType?: string;
  futureSendBlocker?: boolean;
  conditionId?: string;
  promiseId?: string;
  quotationItemId?: string;
  quotationFieldKey?: string;
  coverageStatus?: string;
}

export interface QuotationSalesScopeSnapshotMetadata {
  captured?: boolean;
  status?: string;
  capturedAt?: string | null;
  schemaVersion?: number | null;
  quotationRevision?: number | null;
  immutable?: boolean;
  finalReconciliationStatus?: string | null;
  promiseCoverageStatus?: string | null;
  finalScopeReconciliationStatus?: string | null;
}

export interface QuotationSalesReconciliationAssessment {
  quotationId: string;
  opportunityId?: string | null;
  leadId?: string | null;
  quotationRevision?: number | null;
  quotationStatus?: string | null;
  policyKey: string;
  policyVersion: number;
  evaluatedAt?: string;
  proposalReadiness?: Record<string, any> | null;
  packageFit?: Record<string, any> | null;
  scopeConditionCoverage: QuotationScopeCoverageRow[];
  promiseCoverage: QuotationPromiseCoverageRow[];
  draftPromises?: QuotationDraftPromiseRow[];
  validationConflicts?: QuotationSalesIssue[];
  staleCoverage?: Array<QuotationScopeCoverageRow | QuotationPromiseCoverageRow>;
  missingCoverage?: Array<QuotationScopeCoverageRow | QuotationPromiseCoverageRow>;
  quotedProductAlignment?: {
    status?: string;
    reason?: string;
    quotedProduct?: Record<string, unknown> | null;
    currentPackageFitStatus?: string;
    recommendedProduct?: Record<string, unknown> | null;
  } | null;
  approvedConstraints?: Array<Record<string, any>>;
  exactBlockers: QuotationSalesIssue[];
  warnings: QuotationSalesIssue[];
  status: string;
  readyForSnapshot: boolean;
  snapshotCoverageState: string;
  quotationDimensions: QuotationSalesDimension[];
  availableTargets?: {
    fields?: QuotationSalesTargetEvidence[];
    items?: QuotationSalesTargetEvidence[];
  };
  sourceAssessment?: Record<string, unknown> | null;
  historicalQuotation?: boolean;
  legacyCoverageNotCaptured?: boolean;
  salesScopeSnapshot?: QuotationSalesScopeSnapshotMetadata | null;
  finalQuotationSendGateActive: boolean;
  writesQuotation: boolean;
  writesCoverageOnRead: boolean;
}

export interface QuotationSalesScopeSnapshotPreview {
  snapshotSchemaVersion: number;
  policyKey?: string;
  policyVersion?: number;
  reconciliationPolicy?: {
    policyKey?: string;
    policyVersion?: number;
  };
  quotationId: string;
  quotationRevision?: number | null;
  quotationStatusAtEvaluation?: string | null;
  opportunityId?: string | null;
  leadId?: string | null;
  evaluationTimestamp?: string;
  capturedAt?: string;
  sendTimeTimestamp?: string;
  proposalReadiness?: Record<string, unknown>;
  packageFit?: Record<string, unknown>;
  quotedProducts?: Array<Record<string, unknown>>;
  activeScopeConditions?: Array<Record<string, unknown>>;
  activePromises?: Array<Record<string, unknown>>;
  coverageMappings?: Record<string, unknown> | Array<Record<string, unknown>>;
  approvedConstraints?: Array<Record<string, unknown>>;
  currentApprovedSpecialistConstraints?: Array<Record<string, unknown>>;
  relevantValidations?: Array<Record<string, unknown>>;
  promiseCoverageResult?: QuotationSalesDimension | Record<string, unknown>;
  finalScopeReconciliationResult?: QuotationSalesDimension | Record<string, unknown>;
  quotationSnapshotCoverageResult?: QuotationSalesDimension | Record<string, unknown>;
  finalReconciliationStatus?: string;
  quotationDimensions?: QuotationSalesDimension[];
  snapshotCoverageState?: string;
  readyForSnapshot?: boolean;
  blockers?: QuotationSalesIssue[];
  warnings?: QuotationSalesIssue[];
  persisted: boolean;
  finalQuotationSendGateActive: boolean;
}

export interface ReviewQuotationSalesCoverageInput {
  quotationId: string;
  sourceType: QuotationSalesSourceType;
  sourceId: string;
  coverageStatus: QuotationSalesCoverageReviewStatus;
  targetType: QuotationSalesCoverageTargetType;
  quotationFieldKey?: string | null;
  quotationItemId?: string | null;
  coverageNote?: string | null;
}

export const quotationSalesReconciliationService = {
  async assess(quotationId: string) {
    const { data, error } = await supabase.rpc('crm_get_quotation_sales_reconciliation', {
      p_quotation_id: quotationId,
    });
    return { data: (data as QuotationSalesReconciliationAssessment | null) ?? null, error };
  },

  async reviewCoverage(input: ReviewQuotationSalesCoverageInput) {
    return await supabase.rpc('crm_review_quotation_sales_coverage', {
      p_quotation_id: input.quotationId,
      p_source_type: input.sourceType,
      p_source_id: input.sourceId,
      p_coverage_status: input.coverageStatus,
      p_target_type: input.targetType,
      p_quotation_field_key: input.targetType === 'QUOTATION_FIELD' ? input.quotationFieldKey || null : null,
      p_quotation_item_id: input.targetType === 'QUOTATION_ITEM' ? input.quotationItemId || null : null,
      p_coverage_note: input.coverageNote?.trim() || null,
    });
  },

  async buildSnapshotPreview(quotationId: string) {
    const { data, error } = await supabase.rpc('crm_build_quotation_sales_scope_snapshot', {
      p_quotation_id: quotationId,
    });
    return { data: (data as QuotationSalesScopeSnapshotPreview | null) ?? null, error };
  },
};
