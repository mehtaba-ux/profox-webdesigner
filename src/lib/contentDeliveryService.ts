import { supabase } from './supabase';

export type ContentLifecycleStage =
  | 'Requested'
  | 'Intake Validated'
  | 'Research'
  | 'Strategy / Brief'
  | 'Ready for Writing'
  | 'Drafting'
  | 'Writer Self-QA'
  | 'SME / Fact Check'
  | '2i Editorial Review'
  | 'SEO / Conversion Review'
  | 'Ready for Client Review'
  | 'Client Approved'
  | 'Ready for Implementation'
  | 'Implemented'
  | 'In-Context QA'
  | 'Approved for Publication'
  | 'Published'
  | 'Measured / Maintained'
  | 'Blocked — Information Required';

export type ContentReviewType =
  | 'Writer Self-QA'
  | 'SME Fact Check'
  | '2i Editorial Review'
  | 'SEO / Conversion Review'
  | 'In-Context QA';

export type ContentReviewDecision = 'Passed' | 'Changes Required' | 'Rework' | 'Rejected';

export interface ContentBrief {
  target_audience?: string;
  primary_user_need?: string;
  business_objective?: string;
  primary_cta?: string;
  brand_voice?: string;
  approved_facts?: string;
  required_sections?: string;
  differentiators?: string;
  source_material?: string;
  competitor_references?: string;
  seo_primary_keyword?: string;
  seo_secondary_keywords?: string;
  special_restrictions?: string;
  approval_contact?: string;
  [key: string]: unknown;
}

export interface ContentDeliverable {
  id: string;
  project_task_id: string;
  project_id: string;
  content_type: string;
  lifecycle_stage: ContentLifecycleStage;
  brief: ContentBrief;
  brief_ready: boolean;
  blocked_from_stage?: string | null;
  blocked_reason?: string | null;
  current_version_no: number;
  revision_round: number;
  quality_score?: number | null;
  quality_status: 'Not Scored' | 'Pass' | 'Revision Required' | 'Rework';
  critical_defect_count: number;
  major_defect_count: number;
  published_at?: string | null;
  measured_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentVersion {
  id: string;
  deliverable_id: string;
  version_no: number;
  content: string;
  change_summary?: string | null;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Superseded';
  created_by: string;
  created_at: string;
}

export interface ContentClaim {
  id: string;
  deliverable_id: string;
  version_id?: string | null;
  claim_text: string;
  claim_type: 'Factual' | 'Statistic' | 'Comparative' | 'Testimonial' | 'Credential' | 'Performance' | 'Other';
  material: boolean;
  source_url?: string | null;
  source_note?: string | null;
  verification_status: 'Pending' | 'Verified' | 'Rejected' | 'Not Required';
  verification_note?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContentReview {
  id: string;
  deliverable_id: string;
  version_id?: string | null;
  review_type: ContentReviewType;
  reviewer_id: string;
  decision: ContentReviewDecision;
  scores: Record<string, number>;
  total_score?: number | null;
  defects: Array<{ severity: 'C0' | 'C1' | 'C2' | 'C3'; label?: string; note?: string }>;
  feedback?: string | null;
  created_at: string;
}

export interface ContentDeliveryEvent {
  id: string;
  event_type: string;
  from_stage?: string | null;
  to_stage?: string | null;
  notes?: string | null;
  metadata: Record<string, unknown>;
  actor_id?: string | null;
  created_at: string;
}

export interface ContentDeliveryConfig {
  sopCode: string;
  wipLimit: number;
  reviewSlaHours: number;
  clientReviewSlaHours: number;
  qualityPassScore: number;
  qualityRevisionFloor: number;
  requiredBriefFields: string[];
  qualityDimensions: Array<{ key: string; label: string; weight: number }>;
  packageProfiles: Record<string, Record<string, unknown>>;
  defaultPackageProfile: Record<string, unknown>;
}

export type WorkerCompensationModel =
  | 'Fixed Project Fee'
  | 'Fixed Deliverable Fee'
  | 'Per Unit'
  | 'Custom Project Amount'
  | 'Package-Based Rate';

export interface WorkerCompensationConfig {
  version?: number;
  active: boolean;
  enabledModels: WorkerCompensationModel[];
  defaultModel: WorkerCompensationModel;
  defaultCurrency: string;
  includedRevisions: number;
  qualityThreshold: number;
  earningTrigger: string;
  acceptanceRequired: boolean;
  payoutFrequency: string;
  payoutHoldDays: number;
  minimumPayout: number;
  managerOverridePercent: number;
  customApprovalThreshold: number;
  pmOverrideAllowed: boolean;
  adminOverrideAllowed: boolean;
  scopeChangeAcceptanceRequired: boolean;
  blockedTimeExcluded: boolean;
  priorityPolicy: Record<string, number>;
  deadlineRules: { dueSoonDays: number; lateEscalationHours: number };
  notificationPolicy: Record<string, boolean>;
}

export interface WorkerRateCard {
  id?: string;
  content_type?: string;
  contentType?: string;
  sales_product_id?: string | null;
  salesProductId?: string | null;
  compensation_model?: WorkerCompensationModel;
  compensationModel?: WorkerCompensationModel;
  default_fee?: number;
  defaultFee?: number;
  per_unit_rate?: number | null;
  perUnitRate?: number | null;
  currency: string;
  included_revisions?: number;
  includedRevisions?: number;
  quality_threshold?: number;
  qualityThreshold?: number;
  default_timeline_days?: number | null;
  defaultTimelineDays?: number | null;
  approval_gate?: string;
  approvalGate?: string;
  active: boolean;
}

export interface WorkerCommandCenter {
  config: WorkerCompensationConfig;
  workload: { active: number; limit: number };
  summary: { activeValue: number; waitingApproval: number; payable: number; paidThisMonth: number; needsAttention: number };
  assignments: any[];
  earnings: any[];
  performance: { projectsCompleted: number; averageQuality: number; qualityTrend: number[]; onTimeRate: number; firstPassRate: number; averageRevisionRounds: number; averageCycleTimeDays: number };
  week: { projectsDue: number; reviewsReturned: number; waitingClient: number; potentialEarnings: number };
}

export interface ContentWorkspace {
  deliverable: ContentDeliverable;
  config: ContentDeliveryConfig;
  readiness: { ready: boolean; percent: number; missing: string[]; complete: number; total: number };
  package: {
    code?: string | null;
    name?: string | null;
    profile: Record<string, any>;
    catalog: { id?: string; code?: string; name?: string; priceMode?: string; basePrice?: number; currency?: string; scope?: string[] };
  };
  versions: ContentVersion[];
  claims: ContentClaim[];
  reviews: ContentReview[];
  events: ContentDeliveryEvent[];
}

export interface ContentReviewQueueItem {
  deliverableId: string;
  taskId: string;
  taskTitle: string;
  stage: ContentLifecycleStage;
  qualityScore?: number | null;
  revisionRound: number;
  dueDate?: string | null;
  projectId: string;
  projectNumber: string;
  projectName: string;
  clientName?: string | null;
  writerId?: string | null;
  writerName?: string | null;
  currentVersionNo: number;
}

export interface ContentDeliveryMetrics {
  total: number;
  active: number;
  blocked: number;
  waitingReview: number;
  waitingClient: number;
  published: number;
  averageQuality?: number | null;
  averageRevisionRound?: number | null;
}

export interface ContentUiuxHandoffItem {
  deliverableId: string;
  taskId: string;
  title: string;
  contentType: string;
  handoffAt?: string | null;
  lifecycleStage: ContentLifecycleStage;
  brief: ContentBrief;
  version: { id?: string; versionNo?: number; content?: string; changeSummary?: string | null; status?: string; createdAt?: string };
  claims: Array<{ claim: string; type: string; sourceUrl?: string | null; sourceNote?: string | null; verificationStatus: string }>;
  clientApproval: { id?: string; action?: string; notes?: string | null; createdAt?: string };
}

export interface ContentUiuxHandoff {
  projectId: string;
  items: ContentUiuxHandoffItem[];
}

function throwIfError(error: any) {
  if (error) throw error;
}

export const contentDeliveryService = {
  async getWorkspace(taskId: string): Promise<ContentWorkspace> {
    const { data, error } = await supabase.rpc('get_content_delivery_workspace', { p_task_id: taskId });
    throwIfError(error);
    return data as ContentWorkspace;
  },

  async saveBrief(deliverableId: string, brief: ContentBrief) {
    const { data, error } = await supabase.rpc('save_content_brief', { p_deliverable_id: deliverableId, p_brief: brief });
    throwIfError(error);
    return data as ContentWorkspace['readiness'];
  },

  async saveVersion(deliverableId: string, content: string, changeSummary = '') {
    const { data, error } = await supabase.rpc('save_content_version', {
      p_deliverable_id: deliverableId,
      p_content: content,
      p_change_summary: changeSummary
    });
    throwIfError(error);
    return data as { id: string; versionNo: number };
  },

  async upsertClaim(input: {
    deliverableId: string;
    claimId?: string | null;
    claimText: string;
    claimType: ContentClaim['claim_type'];
    material: boolean;
    sourceUrl?: string;
    sourceNote?: string;
  }) {
    const { data, error } = await supabase.rpc('upsert_content_claim', {
      p_deliverable_id: input.deliverableId,
      p_claim_id: input.claimId || null,
      p_claim_text: input.claimText,
      p_claim_type: input.claimType,
      p_material: input.material,
      p_source_url: input.sourceUrl || null,
      p_source_note: input.sourceNote || null
    });
    throwIfError(error);
    return data as string;
  },

  async verifyClaim(claimId: string, status: 'Verified' | 'Rejected' | 'Not Required', note = '') {
    const { error } = await supabase.rpc('verify_content_claim', { p_claim_id: claimId, p_status: status, p_note: note || null });
    throwIfError(error);
  },

  async recordReview(input: {
    deliverableId: string;
    reviewType: ContentReviewType;
    decision: ContentReviewDecision;
    scores?: Record<string, number>;
    defects?: ContentReview['defects'];
    feedback?: string;
  }) {
    const { data, error } = await supabase.rpc('record_content_review', {
      p_deliverable_id: input.deliverableId,
      p_review_type: input.reviewType,
      p_decision: input.decision,
      p_scores: input.scores || {},
      p_defects: input.defects || [],
      p_feedback: input.feedback || null
    });
    throwIfError(error);
    return data as { id: string; decision: ContentReviewDecision; totalScore?: number | null; criticalDefects: number; majorDefects: number };
  },

  async advance(deliverableId: string, reason = '') {
    const { data, error } = await supabase.rpc('advance_content_deliverable', { p_deliverable_id: deliverableId, p_reason: reason || null });
    throwIfError(error);
    return data as { from: ContentLifecycleStage; to: ContentLifecycleStage };
  },

  async block(deliverableId: string, reason: string, dependency = 'External Dependency') {
    const { error } = await supabase.rpc('block_content_deliverable_with_dependency', { p_deliverable_id: deliverableId, p_reason: reason, p_dependency: dependency });
    throwIfError(error);
  },

  async resume(deliverableId: string, note = '') {
    const { data, error } = await supabase.rpc('resume_content_deliverable', { p_deliverable_id: deliverableId, p_note: note || null });
    throwIfError(error);
    return data as ContentLifecycleStage;
  },

  async getReviewQueue(): Promise<ContentReviewQueueItem[]> {
    const { data, error } = await supabase.rpc('get_content_review_queue');
    throwIfError(error);
    return (data || []) as ContentReviewQueueItem[];
  },

  async getMetrics(): Promise<ContentDeliveryMetrics> {
    const { data, error } = await supabase.rpc('get_content_delivery_metrics');
    throwIfError(error);
    return data as ContentDeliveryMetrics;
  },

  async getUiuxHandoff(projectId: string): Promise<ContentUiuxHandoff> {
    const { data, error } = await supabase.rpc('get_content_uiux_handoff', { p_project_id: projectId });
    throwIfError(error);
    return (data || { projectId, items: [] }) as ContentUiuxHandoff;
  },

  async getSystemConfig(): Promise<ContentDeliveryConfig | null> {
    const { data, error } = await supabase.from('system_configuration').select('config_value').eq('config_key', 'content_delivery_sop_v1').maybeSingle();
    throwIfError(error);
    return (data?.config_value || null) as ContentDeliveryConfig | null;
  },

  async saveSystemConfig(config: ContentDeliveryConfig) {
    const { data, error } = await supabase.rpc('save_content_delivery_config', { p_config: config });
    throwIfError(error);
    return data as ContentDeliveryConfig;
  },

  async getCompensationAdminSnapshot() {
    const { data, error } = await supabase.rpc('get_content_compensation_admin_snapshot');
    throwIfError(error);
    return data as { config: WorkerCompensationConfig; rateCards: WorkerRateCard[]; salesProducts: any[]; tiers: any[] };
  },

  async saveCompensationConfig(config: WorkerCompensationConfig) {
    const { data, error } = await supabase.rpc('admin_save_worker_compensation_config', { p_config: config });
    throwIfError(error);
    return data as WorkerCompensationConfig;
  },

  async saveRateCard(card: WorkerRateCard) {
    const normalized = {
      id: card.id || null,
      contentType: card.contentType || card.content_type,
      salesProductId: card.salesProductId ?? card.sales_product_id ?? null,
      compensationModel: card.compensationModel || card.compensation_model,
      defaultFee: Number(card.defaultFee ?? card.default_fee ?? 0),
      perUnitRate: card.perUnitRate ?? card.per_unit_rate ?? null,
      currency: card.currency,
      includedRevisions: Number(card.includedRevisions ?? card.included_revisions ?? 0),
      qualityThreshold: Number(card.qualityThreshold ?? card.quality_threshold ?? 0),
      defaultTimelineDays: card.defaultTimelineDays ?? card.default_timeline_days ?? null,
      approvalGate: card.approvalGate || card.approval_gate,
      active: card.active
    };
    const { data, error } = await supabase.rpc('admin_upsert_worker_rate_card', { p_card: normalized });
    throwIfError(error);
    return data as string;
  },

  async savePerformanceTier(tier: Record<string, unknown>) {
    const { data, error } = await supabase.rpc('admin_upsert_worker_performance_tier', { p_tier: tier });
    throwIfError(error);
    return data as string;
  },

  async getAssignmentContext(projectId: string) {
    const { data, error } = await supabase.rpc('get_content_assignment_context', { p_project_id: projectId });
    throwIfError(error);
    return data as any;
  },

  async createWorkAssignment(input: Record<string, unknown>) {
    const { data, error } = await supabase.rpc('create_content_work_assignment', { p_input: input });
    throwIfError(error);
    return data as string;
  },

  async approveAssignment(assignmentId: string, approved: boolean, reason = '') {
    const { error } = await supabase.rpc('admin_approve_worker_assignment', { p_assignment_id: assignmentId, p_approved: approved, p_reason: reason || null });
    throwIfError(error);
  },

  async respondToAssignment(assignmentId: string, action: 'Accept' | 'Request Clarification', message = '') {
    const { error } = await supabase.rpc('writer_respond_work_assignment', { p_assignment_id: assignmentId, p_action: action, p_message: message || null });
    throwIfError(error);
  },

  async answerAssignmentClarification(assignmentId: string, message: string) {
    const { error } = await supabase.rpc('manager_answer_work_assignment', { p_assignment_id: assignmentId, p_message: message });
    throwIfError(error);
  },

  async cancelWorkAssignment(assignmentId: string, reason: string) {
    const { error } = await supabase.rpc('manager_cancel_worker_assignment', { p_assignment_id: assignmentId, p_reason: reason });
    throwIfError(error);
  },

  async proposeScopeChange(assignmentId: string, newScope: Record<string, unknown>, addedItems: Record<string, unknown>[], additionalFee: number, reason: string) {
    const { data, error } = await supabase.rpc('manager_propose_worker_scope_change', { p_assignment_id: assignmentId, p_new_scope: newScope, p_added_items: addedItems, p_additional_fee: additionalFee, p_reason: reason });
    throwIfError(error);
    return data as string;
  },

  async reviewScopeChange(changeId: string, approved: boolean, reason = '') {
    const { error } = await supabase.rpc('admin_review_worker_scope_change', { p_change_id: changeId, p_approved: approved, p_reason: reason || null });
    throwIfError(error);
  },

  async respondToScopeChange(changeId: string, accepted: boolean, message = '') {
    const { error } = await supabase.rpc('writer_respond_worker_scope_change', { p_change_id: changeId, p_accepted: accepted, p_message: message || null });
    throwIfError(error);
  },

  async getScopeChanges(assignmentIds: string[]) {
    if (assignmentIds.length === 0) return [];
    const { data, error } = await supabase.from('worker_assignment_scope_changes').select('*').in('assignment_id', assignmentIds).order('created_at', { ascending: false });
    throwIfError(error);
    return data || [];
  },

  async getWorkAssignmentSnapshot(assignmentId: string) {
    const { data, error } = await supabase.from('worker_work_assignments').select('id,scope_snapshot,deliverable_snapshot,scope_version,agreed_fee,currency').eq('id', assignmentId).single();
    throwIfError(error);
    return data as any;
  },

  async getMyCommandCenter(): Promise<WorkerCommandCenter> {
    const { data, error } = await supabase.rpc('get_my_worker_command_center');
    throwIfError(error);
    return data as WorkerCommandCenter;
  },

  async getCompensationManagementSnapshot() {
    const { data, error } = await supabase.rpc('get_worker_compensation_management_snapshot');
    throwIfError(error);
    return data as any;
  },

  async createPayoutBatch(earningIds: string[], scheduledFor: string, notes = '') {
    const { data, error } = await supabase.rpc('admin_create_worker_payout_batch', { p_earning_ids: earningIds, p_scheduled_for: scheduledFor, p_notes: notes || null });
    throwIfError(error);
    return data as string;
  },

  async markPayoutPaid(payoutId: string, transactionReference: string, paymentMethod = '') {
    const { error } = await supabase.rpc('admin_mark_worker_payout_paid', { p_payout_id: payoutId, p_transaction_reference: transactionReference, p_payment_method: paymentMethod || null });
    throwIfError(error);
  },

  async setEarningHold(earningId: string, hold: boolean, reason = '') {
    const { error } = await supabase.rpc('admin_set_worker_earning_hold', { p_earning_id: earningId, p_hold: hold, p_reason: reason || null });
    throwIfError(error);
  }
};
