import { supabase } from './supabase';

export type RecruitmentTaskStatus =
  | 'Issued'
  | 'Viewed'
  | 'In Progress'
  | 'Submitted'
  | 'Under Review'
  | 'Passed'
  | 'Retry Required'
  | 'Failed'
  | 'Revoked';

export interface LeadResearchEntry {
  businessName: string;
  website: string;
  location: string;
  niche: string;
  fitReason: string;
  qualificationSignals: string;
  evidenceUrls: string[];
  decisionMakerName: string;
  decisionMakerRole: string;
  decisionMakerSourceUrl: string;
  digitalProblem: string;
  serviceFit: string;
  priority: 'High' | 'Medium' | 'Low' | '';
  serviceFitReason: string;
}

export interface RecruitmentTaskAnswers {
  leads: LeadResearchEntry[];
}

export interface PublicRecruitmentTask {
  title: string;
  description: string;
  targetMarket: string;
  targetNiche: string;
  requiredItems: number;
  estimatedMinutes: number;
  instructions: string[];
  attemptNo: number;
  maxAttempts: number;
  candidateName: string;
  applicationReference: string;
  status: RecruitmentTaskStatus;
  issuedAt: string;
  dueAt: string;
  submittedAt?: string | null;
  retryFeedback: string;
  expired: boolean;
  canEdit: boolean;
  answers: RecruitmentTaskAnswers;
}

export interface AdminRecruitmentTask {
  id: string;
  stage: string;
  attemptNo: number;
  status: RecruitmentTaskStatus;
  title: string;
  targetMarket: string;
  targetNiche: string;
  requiredItems: number;
  estimatedMinutes: number;
  maxAttempts: number;
  instructions: string[];
  templateVersion: string;
  retryFeedback: string;
  issuedAt: string;
  dueAt: string;
  viewedAt?: string | null;
  firstSavedAt?: string | null;
  lastSavedAt?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  finalData?: RecruitmentTaskAnswers | null;
  draftData?: RecruitmentTaskAnswers | null;
}

export interface RecruitmentTaskTemplate {
  id: string;
  taskKey: string;
  systemRole: string;
  stage: string;
  title: string;
  description: string;
  targetMarket: string;
  targetNiche: string;
  requiredItems: number;
  deadlineHours: number;
  estimatedMinutes: number;
  maxAttempts: number;
  instructions: string[];
  version: number;
  updatedAt?: string;
}

export const emptyLeadResearchEntry = (): LeadResearchEntry => ({
  businessName: '',
  website: '',
  location: '',
  niche: '',
  fitReason: '',
  qualificationSignals: '',
  evidenceUrls: [],
  decisionMakerName: '',
  decisionMakerRole: '',
  decisionMakerSourceUrl: '',
  digitalProblem: '',
  serviceFit: '',
  priority: '',
  serviceFitReason: '',
});

function normalizeAnswers(value: unknown, requiredItems = 5): RecruitmentTaskAnswers {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const raw = Array.isArray(row.leads) ? row.leads : [];
  const leads = raw.slice(0, requiredItems).map((item: any) => ({
    businessName: String(item?.businessName || ''),
    website: String(item?.website || ''),
    location: String(item?.location || ''),
    niche: String(item?.niche || ''),
    fitReason: String(item?.fitReason || ''),
    qualificationSignals: String(item?.qualificationSignals || ''),
    evidenceUrls: Array.isArray(item?.evidenceUrls) ? item.evidenceUrls.map((url: unknown) => String(url || '')).filter(Boolean) : [],
    decisionMakerName: String(item?.decisionMakerName || ''),
    decisionMakerRole: String(item?.decisionMakerRole || ''),
    decisionMakerSourceUrl: String(item?.decisionMakerSourceUrl || ''),
    digitalProblem: String(item?.digitalProblem || ''),
    serviceFit: String(item?.serviceFit || ''),
    priority: ['High','Medium','Low'].includes(String(item?.priority || '')) ? item.priority : '',
    serviceFitReason: String(item?.serviceFitReason || ''),
  })) as LeadResearchEntry[];
  while (leads.length < requiredItems) leads.push(emptyLeadResearchEntry());
  return { leads };
}

function normalizePublicTask(data: any): PublicRecruitmentTask {
  const requiredItems = Math.max(1, Number(data?.requiredItems || 5));
  return {
    title: String(data?.title || 'Recruitment Practical Task'),
    description: String(data?.description || ''),
    targetMarket: String(data?.targetMarket || ''),
    targetNiche: String(data?.targetNiche || ''),
    requiredItems,
    estimatedMinutes: Number(data?.estimatedMinutes || 90),
    instructions: Array.isArray(data?.instructions) ? data.instructions.map((item: unknown) => String(item || '')).filter(Boolean) : [],
    attemptNo: Number(data?.attemptNo || 1),
    maxAttempts: Number(data?.maxAttempts || 1),
    candidateName: String(data?.candidateName || 'Candidate'),
    applicationReference: String(data?.applicationReference || ''),
    status: String(data?.status || 'Issued') as RecruitmentTaskStatus,
    issuedAt: String(data?.issuedAt || ''),
    dueAt: String(data?.dueAt || ''),
    submittedAt: data?.submittedAt ? String(data.submittedAt) : null,
    retryFeedback: String(data?.retryFeedback || ''),
    expired: data?.expired === true,
    canEdit: data?.canEdit === true,
    answers: normalizeAnswers(data?.answers, requiredItems),
  };
}

export const recruitmentTaskService = {
  async open(token: string): Promise<PublicRecruitmentTask> {
    const { data, error } = await supabase.rpc('public_open_recruitment_task', { p_token: token });
    if (error) throw error;
    return normalizePublicTask(data);
  },

  async saveDraft(token: string, answers: RecruitmentTaskAnswers): Promise<{ savedAt?: string; status?: string }> {
    const { data, error } = await supabase.rpc('public_save_recruitment_task_draft', { p_token: token, p_answers: answers });
    if (error) throw error;
    return data || {};
  },

  async submit(token: string, answers: RecruitmentTaskAnswers): Promise<{ submittedAt?: string; alreadySubmitted?: boolean }> {
    const { data, error } = await supabase.rpc('public_submit_recruitment_task', { p_token: token, p_answers: answers });
    if (error) throw error;
    return data || {};
  },

  async listForApplicant(applicantId: string): Promise<AdminRecruitmentTask[]> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_tasks', { p_applicant_id: applicantId });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map((row: any) => ({
      ...row,
      id: String(row?.id || ''),
      stage: String(row?.stage || ''),
      attemptNo: Number(row?.attemptNo || 0),
      requiredItems: Number(row?.requiredItems || 0),
      estimatedMinutes: Number(row?.estimatedMinutes || 0),
      maxAttempts: Number(row?.maxAttempts || 1),
      instructions: Array.isArray(row?.instructions) ? row.instructions.map((item: unknown) => String(item || '')) : [],
      finalData: row?.finalData ? normalizeAnswers(row.finalData, Number(row?.requiredItems || 5)) : null,
      draftData: row?.draftData ? normalizeAnswers(row.draftData, Number(row?.requiredItems || 5)) : null,
    })) as AdminRecruitmentTask[];
  },

  async markUnderReview(taskId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_mark_recruitment_task_under_review', { p_task_id: taskId });
    if (error) throw error;
  },

  async resend(taskId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_resend_recruitment_task', { p_task_id: taskId });
    if (error) throw error;
  },

  async extendDeadline(taskId: string, hours: number): Promise<void> {
    const { error } = await supabase.rpc('admin_extend_recruitment_task_deadline', { p_task_id: taskId, p_hours: hours });
    if (error) throw error;
  },

  async revoke(taskId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('admin_revoke_recruitment_task', { p_task_id: taskId, p_reason: reason });
    if (error) throw error;
  },

  async getTemplate(systemRole = 'sales', stage = 'Lead Research Test'): Promise<RecruitmentTaskTemplate> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_task_template', { p_system_role: systemRole, p_stage: stage });
    if (error) throw error;
    if (!data) throw new Error('Recruitment task template was not found.');
    return {
      ...data,
      requiredItems: Number(data.requiredItems || 5),
      deadlineHours: Number(data.deadlineHours || 72),
      estimatedMinutes: Number(data.estimatedMinutes || 90),
      maxAttempts: Number(data.maxAttempts || 3),
      version: Number(data.version || 1),
      instructions: Array.isArray(data.instructions) ? data.instructions.map((item: unknown) => String(item || '')) : [],
    } as RecruitmentTaskTemplate;
  },

  async saveTemplate(input: RecruitmentTaskTemplate): Promise<RecruitmentTaskTemplate> {
    const { data, error } = await supabase.rpc('admin_save_recruitment_task_template', {
      p_system_role: input.systemRole,
      p_stage: input.stage,
      p_title: input.title,
      p_description: input.description,
      p_target_market: input.targetMarket,
      p_target_niche: input.targetNiche,
      p_required_items: input.requiredItems,
      p_deadline_hours: input.deadlineHours,
      p_estimated_minutes: input.estimatedMinutes,
      p_max_attempts: input.maxAttempts,
      p_instructions: input.instructions,
    });
    if (error) throw error;
    return { ...input, ...(data || {}) } as RecruitmentTaskTemplate;
  },
};
