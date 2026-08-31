import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import AdminDashboard from '../AdminDashboard';
import { useAuth } from '../../../lib/AuthContext';
import {
  getWorkspaceAppForTab,
  getWorkspaceAppLaunchPath
} from '../../../lib/workspaceApps';
import { isSyntheticTestProfile } from '../../../lib/testStaffAccessService';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];

export default function AdminEntry() {
  const { user, profile, role, status, isAdminOrEditor, loading } = useAuth();
  const [searchParams] = useSearchParams();

  if (loading) return <AdminDashboard />;
  if (!user) return <AdminDashboard />;
  if (isSyntheticTestProfile(profile)) return <Navigate to="/admin/test-workspace" replace />;

  // UI/UX trainees use the shared authenticated account with a role-specific Academy.
  // Production My Work remains unavailable until protected activation completes.
  if (status === 'onboarding' && role === 'uiux_designer') {
    return <Navigate to="/design-academy" replace />;
  }

  if (!isAdminOrEditor) return <AdminDashboard />;

  const legacyTab = searchParams.get('tab');
  if (legacyTab) {
    const owningApp = getWorkspaceAppForTab(legacyTab, role, status);
    if (owningApp) return <Navigate to={`/admin/app/${owningApp.id}?tab=${encodeURIComponent(legacyTab)}`} replace />;
  }

  if (status === 'onboarding') {
    const academy = getWorkspaceAppForTab('training', role, status);
    if (academy) return <Navigate to={getWorkspaceAppLaunchPath(academy, role, status)} replace />;
  }

  if (status === 'active' && role && SELLER_ROLES.includes(role)) {
    return <Navigate to="/admin/today" replace />;
  }

  return <Navigate to="/admin/workspace" replace />;
}
