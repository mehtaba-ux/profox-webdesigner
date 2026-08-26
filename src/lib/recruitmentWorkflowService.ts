import { supabase } from './supabase';

export type RecruitmentSystemRole = 'sales' | 'uiux_designer' | 'developer' | 'content_writer' | 'pending' | string;

export interface RecruitmentRubricItem {
  key: string;
  label: string;
  maxPoints: number;
}

export interface RecruitmentStagePolicy {
  id?: string;
  jobId?: string;
  stage: string;
  sortOrder: number;
  active: boolean;
  assessmentRequired: boolean;
  passingScore?: number | null;
  slaHours: number;
  interviewRequired: boolean;
  rubric: RecruitmentRubricItem[];
  updatedAt?: string;
}

export type RecruitmentAssessmentStatus = 'Passed' | 'Failed' | 'Retry Required';

export interface RecruitmentAssessment {
  id: string;
  applicantId: string;
  jobId?: string | null;
  stage: string;
  attemptNo: number;
  status: RecruitmentAssessmentStatus;
  score: number;
  passingScore?: number | null;
  rubric: RecruitmentRubricItem[];
  rubricScores: Record<string, number>;
  criticalFailures: string[];
  evidence?: string;
  evidenceUrl?: string;
  evaluatorNotes?: string;
  evaluatorId?: string;
  evaluatorName?: string;
  evaluatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type RecruitmentInterviewStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'No Show' | 'Rescheduled';

export interface RecruitmentInterview {
  id: string;
  applicantId: string;
  stage: string;
  meetingId: string;
  interviewerId?: string;
  interviewerName?: string;
  interviewType?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  meetingUrl?: string;
  status: RecruitmentInterviewStatus;
  outcomeNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecruitmentWorkflowMeta {
  stageEnteredAt?: string;
  closedAt?: string;
  careerJobId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  onboardingInviteSentAt?: string;
  onboardingInviteLastSentAt?: string;
  onboardingInviteCount: number;
}

export interface RecruitmentJobContext {
  jobId?: string;
  title: string;
  department: string;
  systemRole: RecruitmentSystemRole;
  trainingTrack: string;
  workflowKey?: string;
}

export interface RecruitmentSourceFunnelRow {
  source: string;
  campaign: string;
  applications: number;
  shortlisted: number;
  selected: number;
  activated: number;
  closed: number;
}

const SALES_FALLBACK_STAGES = [
  'New Application',
  'Video Pending',
  'Video Review',
  'Initial Screening',
  'Shortlisted',
  'Sales Assessment',
  'Lead Research Test',
  'CRM Assessment',
  'Selected',
  'Agreement Pending',
  'One-Day Training',
  'Final Approval',
  'Ready for System Access',
  'Activated',
];

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizePolicy(row: any): RecruitmentStagePolicy {
  return {
    id: row?.id,
    jobId: row?.jobId,
    stage: String(row?.stage || ''),
    sortOrder: Number(row?.sortOrder || 0),
    active: row?.active !== false,
    assessmentRequired: Boolean(row?.assessmentRequired),
    passingScore: row?.passingScore == null ? null : Number(row.passingScore),
    slaHours: Number(row?.slaHours || 0),
    interviewRequired: Boolean(row?.interviewRequired),
    rubric: asArray<RecruitmentRubricItem>(row?.rubric).map(item => ({
      key: String(item?.key || ''),
      label: String(item?.label || ''),
      maxPoints: Number(item?.maxPoints || 0),
    })),
    updatedAt: row?.updatedAt,
  };
}

function orderedStages(policies?: RecruitmentStagePolicy[]) {
  const dynamic = (policies || [])
    .filter(item => item.active && item.stage)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(item => item.stage);
  return dynamic.length ? dynamic : SALES_FALLBACK_STAGES;
}

function roleDescriptor(role: RecruitmentSystemRole) {
  if (role === 'developer') return { roleLabel: 'Web Developer', academyLabel: 'Developer Academy', academyStage: 'Developer Academy' };
  if (role === 'uiux_designer') return { roleLabel: 'UI/UX Designer', academyLabel: 'Design Academy', academyStage: 'Design Academy' };
  if (role === 'content_writer') return { roleLabel: 'Content Writer', academyLabel: 'Content Academy', academyStage: 'Content Academy' };
  if (role === 'sales') return { roleLabel: 'Sales Representative', academyLabel: 'Sales Academy', academyStage: 'One-Day Training' };
  return { roleLabel: 'Candidate', academyLabel: 'Onboarding', academyStage: '' };
}

export const recruitmentWorkflowService = {
  // Kept for backward compatibility only. New workflow UI uses job-specific policies.
  stages: SALES_FALLBACK_STAGES,

  roleDescriptor,

  stageOrder(policies?: RecruitmentStagePolicy[]) {
    return orderedStages(policies);
  },

  nextStage(stage: string, policies?: RecruitmentStagePolicy[]): string | null {
    const stages = orderedStages(policies);
    const index = stages.indexOf(stage);
    return index >= 0 && index < stages.length - 1 ? stages[index + 1] : null;
  },

  isBeforeStage(stage: string, target: string, policies?: RecruitmentStagePolicy[]): boolean {
    const stages = orderedStages(policies);
    const stageIndex = stages.indexOf(stage);
    const targetIndex = stages.indexOf(target);
    return stageIndex >= 0 && targetIndex >= 0 && stageIndex < targetIndex;
  },

  async getJobContext(jobId?: string | null): Promise<RecruitmentJobContext> {
    if (!jobId) return { title: 'Sales Representative', department: 'Sales', systemRole: 'sales', trainingTrack: 'sales' };
    const { data, error } = await supabase
      .from('career_jobs')
      .select('id,title,department,application_type,role_details')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { jobId, title: 'Candidate', department: '', systemRole: 'pending', trainingTrack: 'general' };
    const details = data.role_details && typeof data.role_details === 'object' ? data.role_details as Record<string, any> : {};
    const systemRole = String(details.systemRole || (data.application_type === 'sales_representative' ? 'sales' : data.application_type === 'content_writer' ? 'content_writer' : 'pending'));
    return {
      jobId: data.id,
      title: String(data.title || roleDescriptor(systemRole).roleLabel),
      department: String(data.department || details.department || ''),
      systemRole,
      trainingTrack: String(details.trainingTrack || (systemRole === 'sales' ? 'sales' : systemRole === 'content_writer' ? 'content_delivery' : 'general')),
      workflowKey: details.workflowKey ? String(details.workflowKey) : undefined,
    };
  },

  async getStagePolicies(jobId?: string | null): Promise<RecruitmentStagePolicy[]> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_stage_policies', {
      p_job_id: jobId || null,
    });
    if (error) throw error;
    return asArray<any>(data).map(normalizePolicy).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async saveStagePolicy(policy: RecruitmentStagePolicy): Promise<void> {
    if (!policy.jobId) throw new Error('A Job Post must be selected before saving recruitment workflow settings.');
    const { error } = await supabase.rpc('admin_save_recruitment_stage_policy', {
      p_job_id: policy.jobId,
      p_stage: policy.stage,
      p_assessment_required: policy.assessmentRequired,
      p_passing_score: policy.assessmentRequired ? policy.passingScore ?? 0 : null,
      p_sla_hours: policy.slaHours,
      p_interview_required: policy.interviewRequired,
      p_rubric: policy.rubric,
    });
    if (error) throw error;
  },

  async getAssessments(applicantId: string): Promise<RecruitmentAssessment[]> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_assessments', {
      p_applicant_id: applicantId,
    });
    if (error) throw error;
    return asArray<any>(data).map(row => ({
      ...row,
      stage: String(row?.stage || ''),
      attemptNo: Number(row?.attemptNo || 0),
      score: Number(row?.score || 0),
      passingScore: row?.passingScore == null ? null : Number(row.passingScore),
      rubric: asArray<RecruitmentRubricItem>(row?.rubric),
      rubricScores: row?.rubricScores && typeof row.rubricScores === 'object' ? row.rubricScores : {},
      criticalFailures: asArray<string>(row?.criticalFailures),
    })) as RecruitmentAssessment[];
  },

  async recordAssessment(input: {
    applicantId: string;
    stage: string;
    status: RecruitmentAssessmentStatus;
    score: number;
    rubricScores: Record<string, number>;
    criticalFailures: string[];
    evidence?: string;
    evidenceUrl?: string;
    notes?: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('admin_record_recruitment_assessment', {
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
  },

  async getInterviews(applicantId: string): Promise<RecruitmentInterview[]> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_interviews', {
      p_applicant_id: applicantId,
    });
    if (error) throw error;
    return asArray<RecruitmentInterview>(data);
  },

  async scheduleInterview(input: {
    applicantId: string;
    startAt: string;
    endAt: string;
    timezone: string;
    meetingUrl?: string;
    interviewerId?: string | null;
  }): Promise<void> {
    const { error } = await supabase.rpc('admin_schedule_recruitment_interview', {
      p_applicant_id: input.applicantId,
      p_start_at: input.startAt,
      p_end_at: input.endAt,
      p_timezone: input.timezone,
      p_meeting_url: input.meetingUrl || '',
      p_interviewer_id: input.interviewerId || null,
    });
    if (error) throw error;
  },

  async updateInterview(input: {
    interviewId: string;
    status: RecruitmentInterviewStatus;
    outcomeNotes?: string;
    meetingUrl?: string | null;
  }): Promise<void> {
    const { error } = await supabase.rpc('admin_update_recruitment_interview', {
      p_interview_id: input.interviewId,
      p_status: input.status,
      p_outcome_notes: input.outcomeNotes || '',
      p_meeting_url: input.meetingUrl ?? null,
    });
    if (error) throw error;
  },

  async advanceStage(applicantId: string, targetStage?: string | null): Promise<void> {
    const { error } = await supabase.rpc('admin_advance_applicant_stage', {
      p_applicant_id: applicantId,
      p_target_stage: targetStage || null,
    });
    if (error) throw error;
  },

  async overrideStage(applicantId: string, targetStage: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('admin_override_applicant_stage', {
      p_applicant_id: applicantId,
      p_target_stage: targetStage,
      p_reason: reason,
    });
    if (error) throw error;
  },

  async closeApplicant(applicantId: string, reason: string, notes = ''): Promise<void> {
    const { error } = await supabase.rpc('admin_close_applicant', {
      p_applicant_id: applicantId,
      p_reason: reason,
      p_notes: notes,
    });
    if (error) throw error;
  },

  async sendAcademyAccess(applicantId: string): Promise<{ inviteMode?: string; inviteNumber?: number | null; trainingTrack?: string }> {
    const { data, error } = await supabase.functions.invoke('recruitment-account-invite', {
      body: { applicantId },
    });
    if (error) {
      const contextError = (error as any)?.context?.error;
      throw new Error(contextError || error.message || 'Academy access invitation could not be sent.');
    }
    if (!data?.ok) throw new Error(data?.error || 'Academy access invitation could not be sent.');
    return { inviteMode: data.inviteMode, inviteNumber: data.inviteNumber ?? null, trainingTrack: data.trainingTrack };
  },

  async approveFinal(applicantId: string, systemRole: RecruitmentSystemRole): Promise<void> {
    let rpcName: 'approve_developer_candidate_final' | 'approve_uiux_candidate_final' | 'approve_sales_candidate_final';
    if (systemRole === 'developer') rpcName = 'approve_developer_candidate_final';
    else if (systemRole === 'uiux_designer') rpcName = 'approve_uiux_candidate_final';
    else if (systemRole === 'sales') rpcName = 'approve_sales_candidate_final';
    else throw new Error('This role does not use the Sales/Design/Development Final Approval action.');
    const { error } = await supabase.rpc(rpcName, { p_applicant_id: applicantId });
    if (error) throw error;
  },

  async activateCandidate(userId: string, systemRole: RecruitmentSystemRole, adminId?: string | null): Promise<void> {
    if (systemRole === 'developer') {
      const { error } = await supabase.rpc('activate_web_developer', { p_user_id: userId });
      if (error) throw error;
      return;
    }
    if (systemRole === 'uiux_designer') {
      const { error } = await supabase.rpc('activate_uiux_designer', { p_user_id: userId });
      if (error) throw error;
      return;
    }
    if (systemRole === 'sales') {
      const { error } = await supabase.rpc('activate_salesperson', { target_user_id: userId, admin_id: adminId || null });
      if (error) throw error;
      return;
    }
    throw new Error('This role uses its own protected certification/activation workflow and cannot fall back to Sales activation.');
  },

  async getWorkflowMeta(applicantId: string): Promise<RecruitmentWorkflowMeta> {
    const { data, error } = await supabase
      .from('applicants')
      .select('stage_entered_at,closed_at,career_job_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,onboarding_invite_sent_at,onboarding_invite_last_sent_at,onboarding_invite_count')
      .eq('id', applicantId)
      .single();
    if (error) throw error;
    return {
      stageEnteredAt: data?.stage_entered_at,
      closedAt: data?.closed_at,
      careerJobId: data?.career_job_id,
      utmSource: data?.utm_source,
      utmMedium: data?.utm_medium,
      utmCampaign: data?.utm_campaign,
      utmContent: data?.utm_content,
      utmTerm: data?.utm_term,
      onboardingInviteSentAt: data?.onboarding_invite_sent_at,
      onboardingInviteLastSentAt: data?.onboarding_invite_last_sent_at,
      onboardingInviteCount: Number(data?.onboarding_invite_count || 0),
    };
  },

  async getSourceFunnel(): Promise<RecruitmentSourceFunnelRow[]> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_source_funnel');
    if (error) throw error;
    return asArray<any>(data).map(row => ({
      source: String(row?.source || 'Unknown'),
      campaign: String(row?.campaign || ''),
      applications: Number(row?.applications || 0),
      shortlisted: Number(row?.shortlisted || 0),
      selected: Number(row?.selected || 0),
      activated: Number(row?.activated || 0),
      closed: Number(row?.closed || 0),
    }));
  },
};