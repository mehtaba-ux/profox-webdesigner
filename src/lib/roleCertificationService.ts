import { supabase } from './supabase';

export type RoleCertificationDecision = 'Passed' | 'Retry Required';

export interface RoleCertificationSubmissionResult {
  success: boolean;
  progressId: string;
  assignmentId: string;
  status: 'Submitted';
  trainingTrack: string;
}

export const roleCertificationService = {
  async submit(submission: Record<string, unknown>): Promise<RoleCertificationSubmissionResult> {
    const { data, error } = await supabase.rpc('submit_role_final_certification', { p_submission: submission });
    if (error) throw error;
    return data as RoleCertificationSubmissionResult;
  },

  async review(progressId: string, decision: RoleCertificationDecision, feedback: string, score: number): Promise<void> {
    const { error } = await supabase.rpc('admin_review_role_final_certification', {
      p_progress_id: progressId,
      p_status: decision,
      p_feedback: feedback,
      p_score: score,
    });
    if (error) throw error;
  },
};
