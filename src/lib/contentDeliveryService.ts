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

  async block(deliverableId: string, reason: string) {
    const { error } = await supabase.rpc('block_content_deliverable', { p_deliverable_id: deliverableId, p_reason: reason });
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
    const { data, error } = await supabase
      .from('system_configuration')
      .update({ config_value: config, updated_at: new Date().toISOString() })
      .eq('config_key', 'content_delivery_sop_v1')
      .select('config_value')
      .single();
    throwIfError(error);
    return data.config_value as ContentDeliveryConfig;
  }
};
