import React, { useMemo, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AdminDashboard from '../AdminDashboard';
import ClientOnboardingOperations from '../ClientOnboardingOperations';
import { useAuth } from '../../../lib/AuthContext';
import {
  canAccessWorkspaceApp,
  canAccessWorkspaceItem,
  getWorkspaceApp,
  getWorkspaceAppForTab,
  getWorkspaceAppLaunchPath,
  WorkspaceNavItem
} from '../../../lib/workspaceApps';
import WorkspaceAppIcon from './WorkspaceAppIcon';
import WorkspaceShell from './WorkspaceShell';
import './AdminAppWorkspace.css';
import { isSyntheticTestProfile } from '../../../lib/testStaffAccessService';

const TALENT_PARTNER_ITEM: WorkspaceNavItem = {
  id: 'talent-partners',
  label: 'Talent Partners',
  path: '/admin/talent-partners',
  section: 'Hiring Pipelines',
  roles: ['admin']
};

export default function AdminAppWorkspace() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, profile, role, status, isAdminOrEditor, loading } = useAuth();
  const [navigationQuery, setNavigationQuery] = useState('');

  const app = getWorkspaceApp(appId);
  const visibleItems = useMemo(() => {
    const items = app?.items.filter(item => canAccessWorkspaceItem(item, role, status)) || [];
    if (app?.id === 'recruitment' && role === 'admin' && status === 'active' && !items.some(item => item.id === TALENT_PARTNER_ITEM.id)) {
      return [...items, TALENT_PARTNER_ITEM];
    }
    return items;
  }, [app, role, status]);
  const searchedItems = useMemo(() => {
    const query = navigationQuery.trim().toLowerCase();
    if (!query) return visibleItems;
    return visibleItems.filter(item => `${item.label} ${item.section || ''}`.toLowerCase().includes(query));
  }, [navigationQuery, visibleItems]);
  const requestedTab = searchParams.get('tab');

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#000080] border-t-transparent" /></div>;
  }
  if (isSyntheticTestProfile(profile)) return <Navigate to="/admin/test-workspace" replace />;
  if (!user || !profile || !isAdminOrEditor) return <Navigate to="/admin" replace />;
  if (!app || !canAccessWorkspaceApp(app, role, status)) return <Navigate to="/admin/workspace" replace />;
  if (app.launchPath) return <Navigate to={app.launchPath} replace />;

  const selectedItem = requestedTab ? visibleItems.find(item => item.tab === requestedTab) : undefined;
  if (requestedTab && !selectedItem) {
    const owningApp = getWorkspaceAppForTab(requestedTab, role, status);
    if (owningApp && owningApp.id !== app.id) {
      return <Navigate to={`/admin/app/${owningApp.id}?tab=${encodeURIComponent(requestedTab)}`} replace />;
    }
    return <Navigate to={getWorkspaceAppLaunchPath(app, role, status)} replace />;
  }
  if (!requestedTab) return <Navigate to={getWorkspaceAppLaunchPath(app, role, status)} replace />;

  const showClientOnboardingOperations = app.id === 'projects' && requestedTab === 'projects' && (role === 'admin' || role === 'project_manager');

  const openItem = (item: WorkspaceNavItem) => {
    if (item.path) navigate(item.path, { state: { fromWorkspaceApp: app.id } });
    else if (item.tab) navigate(`/admin/app/${app.id}?tab=${encodeURIComponent(item.tab)}`);
  };

  return (
    <WorkspaceShell
      activeAppId={app.id}
      searchValue={navigationQuery}
      onSearchChange={setNavigationQuery}
      searchPlaceholder={`Search ${app.shortLabel}`}
    >
      <div className="pf-page-heading">
        <div>
          <h1>{selectedItem?.label || app.label}</h1>
          <p>{app.description}</p>
        </div>
      </div>

      <div className="pf-context-navigation">
        <div className="pf-context-navigation__identity">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border bg-white ${app.iconBackgroundClass}`}>
            <WorkspaceAppIcon name={app.icon} className={`h-[18px] w-[18px] ${app.iconClass}`} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-extrabold text-slate-900">{app.label}</div>
            <div className="mt-0.5 truncate text-[9px] text-slate-400">{visibleItems.length} available screen{visibleItems.length === 1 ? '' : 's'}</div>
          </div>
        </div>

        <nav className="pf-context-navigation__items" aria-label={`${app.label} screens`}>
          {searchedItems.map(item => {
            const active = Boolean(item.tab && item.tab === requestedTab);
            return (
              <button key={item.id} type="button" onClick={() => openItem(item)} className={`pf-context-navigation__item ${active ? 'is-active' : ''}`}>
                <span>{item.label}</span>
                {item.path ? <ExternalLink className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            );
          })}
          {searchedItems.length === 0 && <div className="px-3 py-2 text-[10px] text-slate-400">No matching screen in this workspace.</div>}
        </nav>
      </div>

      <div className="profox-admin-app-embed min-h-0">
        {showClientOnboardingOperations && <ClientOnboardingOperations />}
        <AdminDashboard key={`${app.id}:${location.search}`} />
      </div>
    </WorkspaceShell>
  );
}
