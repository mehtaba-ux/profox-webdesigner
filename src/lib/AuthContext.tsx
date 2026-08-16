import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'site_manager' | 'editor' | 'customer' | 'developer_designer' | 'sales_team';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  isAdminOrEditor: boolean;
  loading: boolean;
  isOnboarded: boolean;
  completeOnboarding: () => void;
  setRoleForUser: (role: UserRole) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isAdminOrEditor: false,
  loading: true,
  isOnboarded: false,
  completeOnboarding: () => {},
  setRoleForUser: () => {},
  logout: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        syncRole(currentUser);
        syncOnboarding(currentUser);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        syncRole(currentUser);
        syncOnboarding(currentUser);
      } else {
        setRole(null);
        setIsOnboarded(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const syncRole = (currentUser: User) => {
    const metaRole = currentUser.user_metadata?.role as UserRole;
    const savedRole = localStorage.getItem(`profox_user_role_${currentUser.id}`) as UserRole;
    const email = currentUser.email?.toLowerCase() || '';

    if (metaRole && ['admin', 'site_manager', 'editor', 'customer', 'developer_designer', 'sales_team'].includes(metaRole)) {
      setRole(metaRole);
      localStorage.setItem(`profox_user_role_${currentUser.id}`, metaRole);
    } else if (savedRole && ['admin', 'site_manager', 'editor', 'customer', 'developer_designer', 'sales_team'].includes(savedRole)) {
      setRole(savedRole);
    } else if (email.includes('webdesigner') || email.includes('designer') || email.includes('developer')) {
      setRole('developer_designer');
      localStorage.setItem(`profox_user_role_${currentUser.id}`, 'developer_designer');
    } else if (email.includes('sales')) {
      setRole('sales_team');
      localStorage.setItem(`profox_user_role_${currentUser.id}`, 'sales_team');
    } else {
      setRole('admin');
      localStorage.setItem(`profox_user_role_${currentUser.id}`, 'admin');
    }
  };

  const syncOnboarding = (currentUser: User) => {
    const status = localStorage.getItem(`profox_user_onboarded_${currentUser.id}`);
    if (status === 'true') {
      setIsOnboarded(true);
    } else {
      setIsOnboarded(false);
    }
  };

  const completeOnboarding = () => {
    setIsOnboarded(true);
    if (user) {
      localStorage.setItem(`profox_user_onboarded_${user.id}`, 'true');
    }
  };

  const setRoleForUser = (newRole: UserRole) => {
    setRole(newRole);
    if (user) {
      localStorage.setItem(`profox_user_role_${user.id}`, newRole);
      supabase.auth.updateUser({
        data: { role: newRole }
      }).catch(err => console.error('Failed to update user role metadata:', err));
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setIsOnboarded(false);
  };

  const isAdminOrEditor = user !== null && (role === 'admin' || role === 'site_manager' || role === 'editor' || role === 'developer_designer' || role === 'sales_team');

  return (
    <AuthContext.Provider value={{
      user,
      role,
      isAdminOrEditor,
      loading,
      isOnboarded,
      completeOnboarding,
      setRoleForUser,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
