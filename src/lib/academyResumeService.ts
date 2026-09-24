import { supabase } from './supabase';

export type AcademyResumeCheckpoint = Record<string, unknown>;

export const academyResumeService = {
  async get(moduleId: string) {
    if (!moduleId) return { data: null as AcademyResumeCheckpoint | null, error: null };
    const { data, error } = await supabase.rpc('get_academy_resume_checkpoint', { p_module_id: moduleId });
    return { data: (data as AcademyResumeCheckpoint | null) || null, error };
  },

  async save(moduleId: string, checkpoint: AcademyResumeCheckpoint) {
    if (!moduleId) {
      return { data: null as AcademyResumeCheckpoint | null, error: new Error('Training module ID is required.') };
    }
    const { data, error } = await supabase.rpc('save_academy_resume_checkpoint', {
      p_module_id: moduleId,
      p_checkpoint: checkpoint
    });
    return { data: (data as AcademyResumeCheckpoint | null) || null, error };
  },

  async clear(moduleId: string) {
    if (!moduleId) return { error: null };
    const { error } = await supabase.rpc('clear_academy_resume_checkpoint', { p_module_id: moduleId });
    return { error };
  }
};
