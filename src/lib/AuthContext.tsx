import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';
import { 
  UserProfile, 
  UserRole, 
  UserStatus, 
  OnboardingStatus, 
  Department,
  ROLE_LABELS,
  STATUS_LABELS,
  ONBOARDING_STATUS_LABELS,
  DEPARTMENTS
} from '../types';
import { profileService } from './profileService';

export type { UserRole, UserStatus, OnboardingStatus, Department, UserProfile };
export { ROLE_LABELS, STATUS_LABELS, ONBOARDING_STATUS_LABELS, DEPARTMENTS };

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  status: UserStatus | null;
  onboardingStatus: OnboardingStatus | null;
  onboardingProgress: number;
  loading: boolean;
  isAdmin: boolean;
  isActive: boolean;
  isOnboarding: boolean;
  isAdminOrEditor: boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  hasPermission: (permission: string) => boolean;
  refreshProfile: () => Promise<UserProfile | null>;
  updateMyProfile: (data: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'country' | 'timezone' | 'avatarUrl'>>) => Promise<{ success: boolean; error?: string }>;
  completeOnboarding: () => Promise<void>;
  setRoleForUser: (role: UserRole) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  status: null,
  onboardingStatus: null,
  onboardingProgress: 0,
  loading: true,
  isAdmin: false,
  isActive: false,
  isOnboarding: false,
  isAdminOrEditor: false,
  hasRole: () => false,
  hasPermission: () => false,
  refreshProfile: async () => null,
  updateMyProfile: async () => ({ success: false, error: 'Not initialized' }),
  completeOnboarding: async () => {},
  setRoleForUser: () => {},
  logout: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load and synchronize user profile from secure database
  const syncUserProfile = useCallback(async (currentUser: User | null): Promise<UserProfile | null> => {
    if (!currentUser) {
      setProfile(null);
      return null;
    }

    try {
      // 1. Fetch profile from database
      const { data: existingProfile } = await profileService.getProfile(currentUser.id);
      
      if (existingProfile) {
        setProfile(existingProfile);
        return existingProfile;
      }

      // 2. If profile not found in database, securely ensure a pending profile is created
      const newProfile = await profileService.ensureProfile(currentUser);
      setProfile(newProfile);
      return newProfile;
    } catch (err) {
      console.error('Failed to synchronize user profile:', err);
      // Fallback safe pending profile
      const fallback: UserProfile = {
        id: currentUser.id,
        userId: currentUser.id,
        email: currentUser.email || '',
        fullName: currentUser.email?.split('@')[0] || 'User',
        role: 'pending',
        department: 'General',
        status: 'pending',
        onboardingStatus: 'not_started',
        onboardingProgress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setProfile(fallback);
      return fallback;
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!user) return null;
    return await syncUserProfile(user);
  }, [user, syncUserProfile]);

  useEffect(() => {
    let isMounted = true;

    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await syncUserProfile(currentUser);
      } else {
        setProfile(null);
      }
      if (isMounted) setLoading(false);
    }).catch(err => {
      console.warn('Session check warning:', err);
      if (isMounted) setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await syncUserProfile(currentUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncUserProfile]);

  // Derived state directly from verified database profile
  const role: UserRole | null = profile?.role ?? null;
  const status: UserStatus | null = profile?.status ?? null;
  const onboardingStatus: OnboardingStatus | null = profile?.onboardingStatus ?? null;
  const onboardingProgress: number = profile?.onboardingProgress ?? 0;

  // Authorization checks
  const isActive = Boolean(user && status === 'active');
  const isOnboarding = Boolean(user && status === 'onboarding');
  const isAdmin = Boolean(user && status === 'active' && role === 'admin');

  // Staff workspace shell access. Pending users are admitted only while they are in the
  // controlled onboarding state; workspace routing restricts that state to Sales Academy only.
  const isAdminOrEditor = Boolean(
    user && 
    (status === 'active' || status === 'onboarding') && 
    (
      role === 'admin' || 
      role === 'site_manager' || 
      role === 'editor' || 
      role === 'developer' || 
      role === 'web_developer' ||
      role === 'uiux_designer' || 
      role === 'content_writer' || 
      role === 'qa' || 
      role === 'project_manager' || 
      role === 'sales' ||
      role === 'sales_rep' ||
      role === 'developer_designer' || 
      role === 'sales_team' ||
      (role === 'pending' && status === 'onboarding')
    )
  );

  const hasRole = useCallback((...rolesToCheck: UserRole[]): boolean => {
    if (!user || status !== 'active' || !role) return false;
    if (role === 'admin') return true; // Admins satisfy role checks
    return rolesToCheck.includes(role);
  }, [user, status, role]);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user || status !== 'active' || !role) return false;
    if (role === 'admin') return true;
    
    switch (permission) {
      case 'edit_content':
      case 'manage_pages':
      case 'manage_blog':
        return ['site_manager', 'editor'].includes(role);
      case 'manage_portfolio':
        return ['site_manager', 'editor', 'developer', 'web_developer', 'uiux_designer', 'developer_designer'].includes(role);
      case 'manage_leads':
      case 'view_sales_inbox':
        return ['sales', 'sales_rep', 'sales_team', 'site_manager'].includes(role);
      case 'manage_team':
      case 'assign_roles':
        return false;
      default:
        return false;
    }
  }, [user, status, role]);

  const updateMyProfile = async (
    data: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'country' | 'timezone' | 'avatarUrl'>>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated' };

    const res = await profileService.updateMyProfile(user.id, data);
    if (res.error) {
      return { success: false, error: res.error.message || 'Failed to update profile' };
    }
    if (res.data) {
      setProfile(res.data);
    }
    return { success: true };
  };

  const completeOnboarding = async () => {
    if (!user) return;
    await profileService.updateOnboardingProgress(user.id, 'completed', 100);
    await refreshProfile();
  };

  // Safe setter - checks if caller is authorized admin or updates local representation if permissible
  const setRoleForUser = async (newRole: UserRole) => {
    if (!user) return;
    if (isAdmin) {
      // Admin can update their current view / role
      await profileService.adminUpdateUser(user.id, { role: newRole });
      await refreshProfile();
    } else {
      console.warn('Unauthorized role change attempt blocked.');
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Signout warning:', err);
    } finally {
      setUser(null);
      setProfile(null);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      role,
      status,
      onboardingStatus,
      onboardingProgress,
      loading,
      isAdmin,
      isActive,
      isOnboarding,
      isAdminOrEditor,
      hasRole,
      hasPermission,
      refreshProfile,
      updateMyProfile,
      completeOnboarding,
      setRoleForUser,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
