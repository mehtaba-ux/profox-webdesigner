import { supabase, isSupabaseConfigured } from './supabase';
import { UserProfile, UserRole, UserStatus, OnboardingStatus, Department } from '../types';

export function mapDbToUserProfile(row: any): UserProfile {
  if (!row) throw new Error('Null row passed to mapDbToUserProfile');
  return {
    id: row.id,
    userId: row.id,
    email: row.email || '',
    fullName: row.full_name || '',
    phone: row.phone || '',
    country: row.country || '',
    timezone: row.timezone || 'UTC',
    role: (row.role as UserRole) || 'pending',
    department: (row.department as Department) || 'General',
    status: (row.status as UserStatus) || 'pending',
    manager: row.manager || '',
    onboardingStatus: (row.onboarding_status as OnboardingStatus) || 'not_started',
    onboardingProgress: typeof row.onboarding_progress === 'number' ? row.onboarding_progress : 0,
    avatarUrl: row.avatar_url || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function mapUserProfileToDb(profile: Partial<UserProfile>): any {
  const row: any = {};
  if (profile.fullName !== undefined) row.full_name = profile.fullName;
  if (profile.phone !== undefined) row.phone = profile.phone;
  if (profile.country !== undefined) row.country = profile.country;
  if (profile.timezone !== undefined) row.timezone = profile.timezone;
  if (profile.avatarUrl !== undefined) row.avatar_url = profile.avatarUrl;
  if (profile.role !== undefined) row.role = profile.role;
  if (profile.department !== undefined) row.department = profile.department;
  if (profile.status !== undefined) row.status = profile.status;
  if (profile.manager !== undefined) row.manager = profile.manager;
  if (profile.onboardingStatus !== undefined) row.onboarding_status = profile.onboardingStatus;
  if (profile.onboardingProgress !== undefined) row.onboarding_progress = profile.onboardingProgress;
  row.updated_at = new Date().toISOString();
  return row;
}

function pendingProfile(user: { id: string; email?: string | null; user_metadata?: any }): UserProfile {
  const email = user.email || '';
  return {
    id: user.id,
    userId: user.id,
    email,
    fullName: user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'User',
    phone: '',
    country: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    role: 'pending',
    department: 'General',
    status: 'pending',
    manager: '',
    onboardingStatus: 'not_started',
    onboardingProgress: 0,
    avatarUrl: user.user_metadata?.avatar_url || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export const profileService = {
  async getProfile(userId: string): Promise<{ data: UserProfile | null; error: any }> {
    if (!userId) return { data: null, error: new Error('User ID is required') };
    if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase is not configured') };

    const { data, error } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
    if (error) return { data: null, error };
    return { data: data ? mapDbToUserProfile(data) : null, error: null };
  },

  async ensureProfile(user: { id: string; email?: string | null; user_metadata?: any }): Promise<UserProfile> {
    if (!user?.id) throw new Error('Valid authenticated user required');
    const { data, error } = await this.getProfile(user.id);
    if (data) return data;

    // Auth profiles are created by the secure database trigger. Never manufacture
    // privileged local state when the database is unavailable or a profile is missing.
    if (error) console.warn('Secure profile lookup failed:', error);
    return pendingProfile(user);
  },

  async updateMyProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'country' | 'timezone' | 'avatarUrl'>>
  ): Promise<{ data: UserProfile | null; error: any }> {
    if (!userId) return { data: null, error: new Error('User ID required') };
    const safeUpdates: any = { updated_at: new Date().toISOString() };
    if (updates.fullName !== undefined) safeUpdates.full_name = updates.fullName;
    if (updates.phone !== undefined) safeUpdates.phone = updates.phone;
    if (updates.country !== undefined) safeUpdates.country = updates.country;
    if (updates.timezone !== undefined) safeUpdates.timezone = updates.timezone;
    if (updates.avatarUrl !== undefined) safeUpdates.avatar_url = updates.avatarUrl;

    const { data, error } = await supabase.from('user_profiles').update(safeUpdates).eq('id', userId).select().single();
    return error ? { data: null, error } : { data: mapDbToUserProfile(data), error: null };
  },

  async adminUpdateUser(targetUserId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; data?: UserProfile; error?: string }> {
    if (!targetUserId) return { success: false, error: 'Target user ID required' };
    const { data, error } = await supabase.from('user_profiles').update(mapUserProfileToDb(updates)).eq('id', targetUserId).select().single();
    if (error) return { success: false, error: error.message || 'Failed to update user' };
    return { success: true, data: mapDbToUserProfile(data) };
  },

  async findByEmail(email: string): Promise<{ data: UserProfile | null; error: any }> {
    if (!email) return { data: null, error: null };
    const { data, error } = await supabase.from('user_profiles').select('*').ilike('email', email.trim()).maybeSingle();
    return error ? { data: null, error } : { data: data ? mapDbToUserProfile(data) : null, error: null };
  },

  async getAllProfiles(): Promise<{ data: UserProfile[]; error: any }> {
    const { data, error } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
    return error ? { data: [], error } : { data: (data || []).map(mapDbToUserProfile), error: null };
  },

  async updateOnboardingProgress(
    userId: string,
    onboardingStatus: OnboardingStatus,
    onboardingProgress: number
  ): Promise<{ success: boolean; error?: string }> {
    if (!userId) return { success: false, error: 'User ID required' };
    const { error } = await supabase.from('user_profiles').update({
      onboarding_status: onboardingStatus,
      onboarding_progress: Math.min(100, Math.max(0, onboardingProgress)),
      updated_at: new Date().toISOString()
    }).eq('id', userId);
    return error ? { success: false, error: error.message } : { success: true };
  }
};
