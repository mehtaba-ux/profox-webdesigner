import { supabase } from './supabase';

export type LoomOutreachConfig = {
  minDurationSeconds: number;
  targetDurationMin: number;
  targetDurationMax: number;
  maxDurationSeconds: number;
  approvalScope: 'onboarding_only';
  profoxFitOptions: string[];
  rubric: Array<{ key: string; label: string; max: number }>;
  criticalFailures: Array<{ key: string; label: string }>;
  lessonCount: number;
  lessonsCompleted: number;
  draftData?: any;
  latestSubmission?: any;
  latestReview?: {
    totalScore?: number;
    criticalFailures?: string[];
    status?: 'Passed' | 'Retry Required';
    feedback?: string;
    createdAt?: string;
  } | null;
};

export type LoomOutreachAdminSubmission = {
  progressId: string;
  userId: string;
  status: string;
  score?: number | null;
  feedback?: string | null;
  reviewedAt?: string | null;
  updatedAt?: string | null;
  candidateName: string;
  candidateEmail?: string | null;
  assignmentId?: string | null;
  submittedAt?: string | null;
  submission?: any;
  reviewDetail?: any;
};

export const loomOutreachTrainingService = {
  async getConfig(moduleId: string) {
    const { data, error } = await supabase.rpc('get_loom_outreach_training_config', { p_module_id: moduleId });
    return { data: (data as LoomOutreachConfig | null) || null, error };
  },

  async completeLesson(progressId: string, lessonId: string) {
    const { data, error } = await supabase.rpc('complete_loom_outreach_lesson', {
      p_progress_id: progressId,
      p_lesson_id: lessonId
    });
    return { data, error };
  },

  async saveDraft(progressId: string, draft: any) {
    const { data, error } = await supabase.rpc('save_loom_outreach_draft', {
      p_progress_id: progressId,
      p_draft: draft
    });
    return { data, error };
  },

  async submit(progressId: string, submission: any) {
    const { data, error } = await supabase.rpc('submit_loom_outreach_assignment', {
      p_progress_id: progressId,
      p_submission: submission
    });
    return { data, error };
  },

  async adminListSubmissions() {
    const { data, error } = await supabase.rpc('admin_list_loom_outreach_submissions');
    return { data: ((data || []) as LoomOutreachAdminSubmission[]), error };
  },

  async adminReview(progressId: string, rubricScores: Record<string, number>, criticalFailures: string[], feedback: string) {
    const { data, error } = await supabase.rpc('admin_review_loom_outreach_assignment', {
      p_progress_id: progressId,
      p_rubric_scores: rubricScores,
      p_critical_failures: criticalFailures,
      p_feedback: feedback.trim()
    });
    return { data, error };
  },

  async adminUpdateConfig(moduleId: string, config: any) {
    const { data, error } = await supabase.rpc('admin_update_loom_outreach_config', {
      p_module_id: moduleId,
      p_config: config
    });
    return { data, error };
  }
};
