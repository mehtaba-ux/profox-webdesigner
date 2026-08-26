import { supabase } from './supabase';
import type { RecruitmentRubricItem, RecruitmentStagePolicy, RecruitmentSystemRole } from './recruitmentWorkflowService';

export interface RecruitmentPipelineJob {
  jobId: string;
  title: string;
  department: string;
  status: string;
  systemRole: RecruitmentSystemRole;
  activeStageCount: number;
  totalCandidates: number;
  activeCandidates: number;
}

export interface RecruitmentPipelineStage extends RecruitmentStagePolicy {
  id: string;
  jobId: string;
  systemProtected: boolean;
  currentCandidateCount: number;
  openCandidateCount: number;
  historyReferenceCount: number;
}

export interface RecruitmentStageCreateInput {
  jobId: string;
  stage: string;
  afterStage?: string | null;
  slaHours?: number;
  assessmentRequired?: boolean;
  passingScore?: number | null;
  interviewRequired?: boolean;
  rubric?: RecruitmentRubricItem[];
}

export interface RecruitmentStageRemovalResult {
  success: boolean;
  action: 'deleted' | 'archived';
  stage: string;
  historyReferences: number;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeStage(row: any): RecruitmentPipelineStage {
  return {
    id: String(row?.id || ''),
    jobId: String(row?.jobId || ''),
    stage: String(row?.stage || ''),
    sortOrder: Number(row?.sortOrder || 0),
    active: row?.active !== false,
    assessmentRequired: Boolean(row?.assessmentRequired),
    passingScore: row?.passingScore == null ? null : Number(row.passingScore),
    slaHours: Number(row?.slaHours || 0),
    interviewRequired: Boolean(row?.interviewRequired),
    rubric: asArray<any>(row?.rubric).map(item => ({
      key: String(item?.key || ''),
      label: String(item?.label || ''),
      maxPoints: Number(item?.maxPoints || 0),
    })),
    updatedAt: row?.updatedAt ? String(row.updatedAt) : undefined,
    systemProtected: Boolean(row?.systemProtected),
    currentCandidateCount: Number(row?.currentCandidateCount || 0),
    openCandidateCount: Number(row?.openCandidateCount || 0),
    historyReferenceCount: Number(row?.historyReferenceCount || 0),
  };
}

export const recruitmentPipelineService = {
  async getJobs(): Promise<RecruitmentPipelineJob[]> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_pipeline_jobs');
    if (error) throw error;
    return asArray<any>(data).map(row => ({
      jobId: String(row?.jobId || ''),
      title: String(row?.title || 'Untitled role'),
      department: String(row?.department || 'Unassigned'),
      status: String(row?.status || ''),
      systemRole: String(row?.systemRole || 'pending'),
      activeStageCount: Number(row?.activeStageCount || 0),
      totalCandidates: Number(row?.totalCandidates || 0),
      activeCandidates: Number(row?.activeCandidates || 0),
    }));
  },

  async getStages(jobId: string): Promise<RecruitmentPipelineStage[]> {
    if (!jobId) return [];
    const { data, error } = await supabase.rpc('admin_get_recruitment_stage_policies', { p_job_id: jobId });
    if (error) throw error;
    return asArray<any>(data).map(normalizeStage).sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
  },

  async saveStage(stage: RecruitmentPipelineStage): Promise<void> {
    const { error } = await supabase.rpc('admin_save_recruitment_stage_policy', {
      p_job_id: stage.jobId,
      p_stage: stage.stage,
      p_assessment_required: stage.assessmentRequired,
      p_passing_score: stage.assessmentRequired ? stage.passingScore ?? 0 : null,
      p_sla_hours: stage.slaHours,
      p_interview_required: stage.interviewRequired,
      p_rubric: stage.rubric,
    });
    if (error) throw error;
  },

  async createStage(input: RecruitmentStageCreateInput): Promise<void> {
    const { error } = await supabase.rpc('admin_create_recruitment_stage', {
      p_job_id: input.jobId,
      p_stage: input.stage.trim(),
      p_after_stage: input.afterStage || null,
      p_sla_hours: input.slaHours ?? 24,
      p_assessment_required: input.assessmentRequired ?? false,
      p_passing_score: input.assessmentRequired ? input.passingScore ?? 70 : null,
      p_interview_required: input.interviewRequired ?? false,
      p_rubric: input.rubric || [],
    });
    if (error) throw error;
  },

  async reorderStages(jobId: string, orderedStageIds: string[]): Promise<void> {
    const { error } = await supabase.rpc('admin_reorder_recruitment_stages', {
      p_job_id: jobId,
      p_stage_ids: orderedStageIds,
    });
    if (error) throw error;
  },

  async removeStage(stageId: string): Promise<RecruitmentStageRemovalResult> {
    const { data, error } = await supabase.rpc('admin_remove_recruitment_stage', { p_stage_id: stageId });
    if (error) throw error;
    return {
      success: Boolean(data?.success),
      action: data?.action === 'archived' ? 'archived' : 'deleted',
      stage: String(data?.stage || ''),
      historyReferences: Number(data?.historyReferences || 0),
    };
  },

  async restoreStage(stageId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_restore_recruitment_stage', { p_stage_id: stageId });
    if (error) throw error;
  },
};
