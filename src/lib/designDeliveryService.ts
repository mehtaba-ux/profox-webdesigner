import { supabase } from './supabase';

export type DesignEvidenceType =
  | 'business_objective'
  | 'target_audience'
  | 'primary_conversion'
  | 'approved_content'
  | 'brand_assets'
  | 'research'
  | 'information_architecture'
  | 'user_flow'
  | 'wireframe'
  | 'design_system'
  | 'design_file'
  | 'prototype'
  | 'handoff_notes'
  | 'implementation_reference';

export type DesignReviewDecision = 'Pass' | 'Minor Revision' | 'Major Revision' | 'Reject / Rework';

export interface DesignDeliveryReadiness {
  ready: boolean;
  status: string;
  checks: Record<string, boolean>;
  blockers: string[];
}

export interface DesignDeliveryEvidence {
  id: string;
  project_task_id: string;
  project_id: string;
  evidence_type: DesignEvidenceType;
  label: string;
  reference_url: string;
  reference_note: string;
  version_label: string;
  status: 'Draft' | 'Approved' | 'Superseded';
  active: boolean;
  created_by: string;
  created_at: string;
}

export interface DesignDeliveryReview {
  id: string;
  project_task_id: string;
  project_id: string;
  review_round: number;
  review_type: 'Independent Design QA' | 'Accessibility Review' | 'Technical Feasibility' | 'Implementation QA';
  reviewer_user_id: string;
  status: 'Pending' | 'Pass' | 'Minor Revision' | 'Major Revision' | 'Reject / Rework' | 'Cancelled';
  quality_score: number | null;
  notes: string;
  requested_at: string;
  completed_at: string | null;
}

export interface DesignPackageContext {
  primaryProductCode: string | null;
  depth: 'Launch' | 'Growth' | 'Scale' | 'Custom' | 'Unmapped' | string;
  packageSnapshot: string | null;
  products: Array<{
    productId: string | null;
    code: string;
    name: string;
    type: string;
    scope: string[];
    quantity: number;
  }>;
  requiredSubmissionEvidence: DesignEvidenceType[];
}

export interface DesignDeliveryWorkspace {
  task: any;
  project: any;
  client: any;
  config: Record<string, any>;
  packageContext?: DesignPackageContext;
  readiness: DesignDeliveryReadiness;
  evidence: DesignDeliveryEvidence[];
  reviews: DesignDeliveryReview[];
  clientFeedback: any[];
}

export interface DesignReviewQueueItem {
  reviewId: string;
  taskId: string;
  reviewType: DesignDeliveryReview['review_type'];
  reviewRound: number;
  requestedAt: string;
  taskTitle: string;
  priority: string;
  dueDate: string | null;
  projectId: string;
  projectNumber: string;
  projectName: string;
  clientName: string;
  designerName: string;
  ageHours: number;
  slaHours: number;
  slaStatus: 'Healthy' | 'Due Soon' | 'Breached';
}

export interface DesignProjectHandoff {
  projectId: string;
  projectNumber: string;
  projectName: string;
  stage: string;
  package: DesignPackageContext;
  clientApproval: {
    action?: string;
    notes?: string;
    approvedAt?: string;
    toStage?: string;
  };
  evidence: Array<{
    id: string;
    taskId: string;
    type: 'design_file' | 'prototype' | 'design_system' | 'handoff_notes';
    label: string;
    url: string;
    note: string;
    version: string;
    createdAt: string;
  }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`${label} is invalid.`);
}

function asError(error: any, fallback: string) {
  return new Error(error?.message || fallback);
}

export const designDeliveryService = {
  async getWorkspace(taskId: string): Promise<DesignDeliveryWorkspace> {
    assertUuid(taskId, 'Task');
    const { data, error } = await supabase.rpc('design_delivery_workspace', { p_task_id: taskId });
    if (error) throw asError(error, 'Unable to load Design Delivery workspace.');
    return data as DesignDeliveryWorkspace;
  },

  async getProjectHandoff(projectId: string): Promise<DesignProjectHandoff> {
    assertUuid(projectId, 'Project');
    const { data, error } = await supabase.rpc('design_delivery_get_project_handoff', { p_project_id: projectId });
    if (error) throw asError(error, 'Unable to load approved design handoff.');
    return data as DesignProjectHandoff;
  },

  async addEvidence(input: {
    taskId: string;
    type: DesignEvidenceType;
    label?: string;
    referenceUrl?: string;
    referenceNote?: string;
    versionLabel?: string;
    status?: 'Draft' | 'Approved';
  }) {
    assertUuid(input.taskId, 'Task');
    if (!input.referenceUrl?.trim() && !input.referenceNote?.trim()) {
      throw new Error('Add a source link or evidence note.');
    }
    const { data, error } = await supabase.rpc('design_delivery_add_evidence', {
      p_task_id: input.taskId,
      p_evidence_type: input.type,
      p_label: input.label?.trim() || '',
      p_reference_url: input.referenceUrl?.trim() || '',
      p_reference_note: input.referenceNote?.trim() || '',
      p_version_label: input.versionLabel?.trim() || '',
      p_status: input.status || 'Approved'
    });
    if (error) throw asError(error, 'Unable to save design evidence.');
    return data as string;
  },

  async startTask(taskId: string) {
    assertUuid(taskId, 'Task');
    const { data, error } = await supabase.rpc('design_delivery_start_task', { p_task_id: taskId });
    if (error) throw asError(error, 'Unable to start the design task.');
    return data as { taskId: string; status: string };
  },

  async submitForReview(taskId: string, note = '') {
    assertUuid(taskId, 'Task');
    const { data, error } = await supabase.rpc('design_delivery_submit_for_review', {
      p_task_id: taskId,
      p_note: note.trim()
    });
    if (error) throw asError(error, 'Unable to submit the design for review.');
    return data as { taskId: string; status: string; reviewRound: number };
  },

  async getMyReviews(): Promise<DesignReviewQueueItem[]> {
    const { data, error } = await supabase.rpc('design_delivery_get_my_reviews');
    if (error) throw asError(error, 'Unable to load Design Delivery review queue.');
    return (Array.isArray(data) ? data : []) as DesignReviewQueueItem[];
  },

  async submitReviewDecision(input: {
    reviewId: string;
    decision: DesignReviewDecision;
    qualityScore?: number | null;
    notes?: string;
  }) {
    assertUuid(input.reviewId, 'Review');
    if (input.decision !== 'Pass' && !input.notes?.trim()) {
      throw new Error('Structured review feedback is required when changes or rework are requested.');
    }
    const { data, error } = await supabase.rpc('design_delivery_submit_review_decision', {
      p_review_id: input.reviewId,
      p_decision: input.decision,
      p_quality_score: input.qualityScore ?? null,
      p_notes: input.notes?.trim() || ''
    });
    if (error) throw asError(error, 'Unable to submit the review decision.');
    return data as Record<string, any>;
  }
};
