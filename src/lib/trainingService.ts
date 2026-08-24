import { supabase } from './supabase';
import { DEFAULT_TRAINING_MODULES_FULL } from '../data/defaultTraining';

export interface TrainingModule {
  id: string;
  title: string;
  slug: string;
  description: string;
  module_type: 'lesson' | 'quiz' | 'assignment' | 'practical';
  sort_order: number;
  required: boolean;
  active: boolean;
  passing_score?: number;
  requires_admin_review: boolean;
  training_track?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TrainingLesson {
  id: string;
  module_id: string;
  title: string;
  content: string;
  video_url?: string;
  sort_order: number;
  active?: boolean;
}

export interface UserProgress {
  id: string;
  user_id: string;
  module_id: string;
  status: 'Not Started' | 'In Progress' | 'Submitted' | 'Passed' | 'Retry Required' | 'Completed';
  progress_percent: number;
  score?: number;
  attempts: number;
  completed_at?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_status?: 'Passed' | 'Retry Required';
  feedback?: string;
  admin_feedback?: string;
  module?: TrainingModule;
  submission_data?: any;
  updated_at?: string;
}

export interface QuizSubmissionResult {
  score: number;
  passed: boolean;
  status: UserProgress['status'];
}

export type TrainingTrack = 'sales' | 'uiux_design' | 'web_development' | string;

export interface AcademyDescriptor {
  track: TrainingTrack | null;
  name: string;
  certificationLabel: string;
  activeRoleLabel: string;
  finalCertificationSlug?: string;
}

function fallbackModules(includeInactive = false): TrainingModule[] {
  return DEFAULT_TRAINING_MODULES_FULL
    .map(module => ({
      id: module.id,
      title: module.title,
      slug: module.slug,
      description: module.description,
      module_type: module.module_type,
      sort_order: module.sort_order,
      required: module.required,
      active: module.active !== false,
      passing_score: module.passing_score,
      requires_admin_review: module.requires_admin_review
    }))
    .filter(module => includeInactive || module.active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function boundedScore(score: number) {
  if (!Number.isFinite(score)) throw new Error('Training score must be a number.');
  return Math.max(0, Math.min(100, Math.round(score)));
}

function academyDescriptor(track: TrainingTrack | null): AcademyDescriptor {
  if (track === 'web_development') {
    return {
      track,
      name: 'ProFox Developer Academy',
      certificationLabel: 'Web Developer Certification',
      activeRoleLabel: 'Active Developer',
      finalCertificationSlug: 'dev-final-certification'
    };
  }
  if (track === 'uiux_design') {
    return {
      track,
      name: 'ProFox Design Academy',
      certificationLabel: 'UI/UX Design Certification',
      activeRoleLabel: 'Active Designer',
      finalCertificationSlug: 'uiux-final-certification'
    };
  }
  return {
    track: track || 'sales',
    name: 'ProFox Sales Academy',
    certificationLabel: 'Sales Certification',
    activeRoleLabel: 'Active Rep',
    finalCertificationSlug: 'final-certification'
  };
}

async function currentTrainingTrack(): Promise<TrainingTrack | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase.rpc('training_track_for_user', { p_user_id: userId });
  if (error) throw error;
  return data ? String(data) : null;
}

export const trainingService = {
  academyDescriptor,

  async getMyTrainingTrack(): Promise<{ data: TrainingTrack | null; error: any }> {
    try {
      return { data: await currentTrainingTrack(), error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async getMyAcademyDescriptor(): Promise<{ data: AcademyDescriptor; error: any }> {
    try {
      const track = await currentTrainingTrack();
      return { data: academyDescriptor(track), error: null };
    } catch (error) {
      return { data: academyDescriptor(null), error };
    }
  },

  async getModules(includeInactive = false): Promise<{ data: TrainingModule[]; error: any }> {
    // Candidate/staff learning must use the server-resolved Academy track. This also
    // applies the track-specific sort order and review/pass overrides. Admins without
    // an assigned training track retain the complete curriculum editor view.
    if (!includeInactive) {
      try {
        const track = await currentTrainingTrack();
        if (track) {
          const { data, error } = await supabase.rpc('get_my_training_modules');
          if (error) return { data: [], error };
          const rows = Array.isArray(data) ? data : [];
          return {
            data: (rows as TrainingModule[]).filter(module => module.active !== false).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
            error: null
          };
        }
      } catch (error) {
        // Do not silently expose the global catalog when track resolution fails.
        return { data: [], error };
      }
    }

    let query = supabase.from('training_modules').select('*').order('sort_order', { ascending: true });
    if (!includeInactive) query = query.eq('active', true);
    const { data, error } = await query;
    if (error) return { data: fallbackModules(includeInactive), error };
    if (!data || data.length === 0) return { data: fallbackModules(includeInactive), error: null };
    return { data: data as TrainingModule[], error: null };
  },

  async createModule(moduleData: Partial<TrainingModule>) {
    const payload = {
      title: moduleData.title || 'New Training Module',
      slug: moduleData.slug || `module-${Date.now()}`,
      description: moduleData.description || '',
      module_type: moduleData.module_type || 'lesson',
      sort_order: moduleData.sort_order ?? 99,
      required: moduleData.required !== false,
      active: moduleData.active !== false,
      passing_score: moduleData.passing_score ?? null,
      requires_admin_review: Boolean(moduleData.requires_admin_review),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('training_modules').insert([payload]).select().single();
    return { data: (data as TrainingModule | null) || null, error };
  },

  async updateModule(moduleId: string, updates: Partial<TrainingModule>) {
    const clean = { ...updates } as any;
    delete clean.training_track;
    const { data, error } = await supabase.from('training_modules').update({ ...clean, updated_at: new Date().toISOString() }).eq('id', moduleId).select().single();
    return { data: (data as TrainingModule | null) || null, error };
  },

  async deleteModule(moduleId: string) {
    const { error } = await supabase.from('training_modules').delete().eq('id', moduleId);
    return { error };
  },

  async getLessons(moduleId: string): Promise<{ data: TrainingLesson[]; error: any }> {
    const { data, error } = await supabase.from('training_lessons').select('*').eq('module_id', moduleId).eq('active', true).order('sort_order', { ascending: true });
    if (!error && data && data.length > 0) return { data: data as TrainingLesson[], error: null };
    const fallback = DEFAULT_TRAINING_MODULES_FULL.find(module => module.id === moduleId)?.lessons?.map(lesson => ({
      id: lesson.id,
      module_id: moduleId,
      title: lesson.title,
      content: lesson.content,
      video_url: lesson.video_url,
      sort_order: lesson.sort_order,
      active: true
    })) || [];
    return { data: fallback, error };
  },

  async saveLesson(lesson: Partial<TrainingLesson>) {
    if (!lesson.module_id) return { data: null, error: new Error('module_id is required') };
    const payload = {
      ...(lesson.id ? { id: lesson.id } : {}),
      module_id: lesson.module_id,
      title: lesson.title || 'Lesson Title',
      content: lesson.content || '',
      video_url: lesson.video_url || '',
      sort_order: lesson.sort_order ?? 1,
      active: lesson.active !== false,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('training_lessons').upsert(payload).select().single();
    return { data: (data as TrainingLesson | null) || null, error };
  },

  async deleteLesson(_moduleId: string, lessonId: string) {
    const { error } = await supabase.from('training_lessons').delete().eq('id', lessonId);
    return { error };
  },

  async getUserProgress(userId: string): Promise<{ data: UserProgress[]; error: any }> {
    if (!userId) return { data: [], error: null };
    const { data, error } = await supabase.from('user_training_progress').select('*, module:training_modules(*)').eq('user_id', userId);
    return { data: (data || []) as UserProgress[], error };
  },

  async getLatestAssignment(userId: string, moduleId: string): Promise<{ data: any | null; error: any }> {
    if (!userId || !moduleId) return { data: null, error: null };
    const { data, error } = await supabase
      .from('training_assignments')
      .select('submission_data,created_at')
      .eq('user_id', userId)
      .eq('module_id', moduleId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data: data?.submission_data ?? null, error };
  },

  async saveEvidence(userId: string, moduleId: string, progressId: string, submissionData: any) {
    const { data, error } = await supabase.from('training_assignments').insert([{
      user_id: userId,
      module_id: moduleId,
      progress_id: progressId,
      submission_data: submissionData
    }]).select('submission_data').single();
    return { data: data?.submission_data ?? null, error };
  },

  async startModule(userId: string, moduleId: string) {
    const { data: existing, error: lookupError } = await supabase.from('user_training_progress').select('*').eq('user_id', userId).eq('module_id', moduleId).maybeSingle();
    if (lookupError) return { data: null, error: lookupError };
    if (existing) return { data: existing as UserProgress, error: null };

    const { data, error } = await supabase.from('user_training_progress').insert({
      user_id: userId,
      module_id: moduleId,
      status: 'In Progress',
      progress_percent: 10,
      attempts: 0,
      completed_at: null,
      updated_at: new Date().toISOString()
    }).select().single();
    return { data: (data as UserProgress | null) || null, error };
  },

  async updateProgress(progressId: string, updates: Partial<UserProgress>) {
    const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
    delete payload.id;
    delete payload.user_id;
    delete payload.module_id;
    delete payload.module;
    delete payload.submission_data;
    if (typeof payload.score === 'number') payload.score = boundedScore(payload.score);
    const { data, error } = await supabase.from('user_training_progress').update(payload).eq('id', progressId).select().single();
    return { data: (data as UserProgress | null) || null, error };
  },

  async submitAssignment(userId: string, moduleId: string, progressId: string, submissionData: any) {
    const { error: submissionError } = await supabase.from('training_assignments').insert([{
      user_id: userId,
      module_id: moduleId,
      progress_id: progressId,
      submission_data: submissionData
    }]);
    if (submissionError) return { data: null, error: submissionError };
    const { data, error } = await supabase.from('user_training_progress').update({
      status: 'Submitted',
      progress_percent: 100,
      completed_at: null,
      updated_at: new Date().toISOString()
    }).eq('id', progressId).eq('user_id', userId).eq('module_id', moduleId).select().single();
    return { data: (data as UserProgress | null) || null, error };
  },

  async submitQuizAnswers(progressId: string, answers: number[]) {
    if (!progressId) return { data: null as QuizSubmissionResult | null, error: new Error('Training progress ID is required.') };
    const normalizedAnswers = answers.map(answer => Number.isInteger(answer) ? answer : -1);
    const { data, error } = await supabase.rpc('submit_sales_academy_quiz', {
      p_progress_id: progressId,
      p_answers: normalizedAnswers
    });
    return { data: (data as QuizSubmissionResult | null) || null, error };
  },

  async requestFinalApproval() {
    try {
      const track = await currentTrainingTrack();
      const rpcName = track === 'web_development'
        ? 'request_developer_final_approval'
        : track === 'uiux_design'
          ? 'request_uiux_final_approval'
          : 'request_sales_final_approval';
      const { error } = await supabase.rpc(rpcName);
      return { error };
    } catch (error) {
      return { error };
    }
  },

  async reviewAssignment(progressId: string, _reviewerId: string, status: 'Passed' | 'Retry Required', feedback: string, rawScore?: number) {
    const { data: reviewTarget, error: lookupError } = await supabase
      .from('user_training_progress')
      .select('module:training_modules(slug)')
      .eq('id', progressId)
      .single();
    if (lookupError) return { data: null, error: lookupError };
    const moduleSlug = (reviewTarget as any)?.module?.slug;
    if (moduleSlug === 'lead-research') {
      if (typeof window !== 'undefined') window.location.assign('/admin/lead-research');
      return { data: null, error: null };
    }
    if (moduleSlug === 'loom-outreach') {
      if (typeof window !== 'undefined') window.location.assign('/admin/loom-outreach');
      return { data: null, error: null };
    }

    const score = boundedScore(rawScore ?? (status === 'Passed' ? 100 : 50));
    const { error } = await supabase.rpc('admin_review_training_progress', {
      p_progress_id: progressId,
      p_status: status,
      p_feedback: feedback.trim(),
      p_score: score
    });
    if (error) return { data: null, error };
    const { data, error: fetchError } = await supabase.from('user_training_progress').select('*').eq('id', progressId).single();
    return { data: (data as UserProgress | null) || null, error: fetchError };
  },

  async activateSalesperson(targetUserId: string, adminId: string) {
    const { error } = await supabase.rpc('activate_salesperson', {
      target_user_id: targetUserId,
      admin_id: adminId
    });
    return { error };
  }
};
