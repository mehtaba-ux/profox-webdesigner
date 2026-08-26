import { supabase } from './supabase';
import type { RecruitmentAssessmentStatus } from './recruitmentWorkflowService';

export interface ProcessRecruitmentAssessmentInput {
  applicantId: string;
  stage: string;
  status: RecruitmentAssessmentStatus;
  score: number;
  rubricScores: Record<string, number>;
  criticalFailures: string[];
  evidence?: string;
  evidenceUrl?: string;
  notes?: string;
}

export interface UpdateRecruitmentAssessmentInput {
  assessmentId: string;
  status: RecruitmentAssessmentStatus;
  score: number;
  rubricScores: Record<string, number>;
  criticalFailures: string[];
  evidence?: string;
  evidenceUrl?: string;
  notes?: string;
}

export interface ProcessRecruitmentAssessmentResult {
  success: boolean;
  assessment?: {
    id?: string;
    attemptNo?: number;
    status?: RecruitmentAssessmentStatus;
    score?: number;
    passingScore?: number | null;
  };
  progression?: {
    success?: boolean;
    fromStage?: string;
    toStage?: string;
  } | null;
}

export const recruitmentAssessmentService = {
  async recordAndProcess(input: ProcessRecruitmentAssessmentInput): Promise<ProcessRecruitmentAssessmentResult> {
    const { data, error } = await supabase.rpc('admin_record_and_process_recruitment_assessment', {
      p_applicant_id: input.applicantId,
      p_stage: input.stage,
      p_status: input.status,
      p_score: input.score,
      p_rubric_scores: input.rubricScores,
      p_critical_failures: input.criticalFailures,
      p_evidence: input.evidence || '',
      p_evidence_url: input.evidenceUrl || '',
      p_notes: input.notes || '',
    });
    if (error) throw error;
    return (data || { success: true }) as ProcessRecruitmentAssessmentResult;
  },

  async updateAndProcess(input: UpdateRecruitmentAssessmentInput): Promise<ProcessRecruitmentAssessmentResult> {
    const { data, error } = await supabase.rpc('admin_update_and_process_recruitment_assessment', {
      p_assessment_id: input.assessmentId,
      p_status: input.status,
      p_score: input.score,
      p_rubric_scores: input.rubricScores,
      p_critical_failures: input.criticalFailures,
      p_evidence: input.evidence || '',
      p_evidence_url: input.evidenceUrl || '',
      p_notes: input.notes || '',
    });
    if (error) throw error;
    return (data || { success: true }) as ProcessRecruitmentAssessmentResult;
  },
};