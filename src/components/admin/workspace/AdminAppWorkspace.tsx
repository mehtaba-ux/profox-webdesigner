import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Grid3X3,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AdminDashboard from '../AdminDashboard';
import { useAuth } from '../../../lib/AuthContext';
import {
  canAccessWorkspaceApp,
  canAccessWorkspaceItem,
  getWorkspaceApp,
  getWorkspaceAppForTab,
  getWorkspaceAppLaunchPath,
  WORKSPACE_GROUPS,
  WorkspaceNavItem
} from '../../../lib/workspaceApps';
import { departmentDefinitionForRole } from '../../../lib/organization';
import { ROLE_LABELS } from '../../../types';
import WorkspaceAppIcon from './WorkspaceAppIcon';
import './AdminAppWorkspace.css';

export default function AdminAppWorkspace() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, profile, role, status, isAdminOrEditor, loading, logout } = useAuth();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const app = getWorkspaceApp(appId);
  const visibleItems = useMemo(
    () => app?.items.filter(item => canAccessWorkspaceItem(item, role, status)) || [],
    [app, role, status]
  );
  const visibleSections = useMemo(() => {
    const sections: { label: string; items: WorkspaceNavItem[] }[] = [];
    visibleItems.forEach(item => {
      const label = item.section || 'Workspace';
      const existing = sections.find(section => section.label === label);
      if (existing) existing.items.push(item);
      else sections.push({ label, items: [item] });
    });
    return sections;
  }, [visibleItems]);
  const requestedTab = searchParams.get('tab');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#000080] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user || !profile || !isAdminOrEditor) {
    return <Navigate to="/admin" replace />;
  }

  if (!app || !canAccessWorkspaceApp(app, role, status)) {
    return <Navigate to="/admin/workspace" replace />;
  }

  if (app.launchPath) {
    return <Navigate to={app.launchPath} replace />;
  }

  const workspaceGroup = WORKSPACE_GROUPS.find(group => group.id === app.group);
  const primaryDepartment = departmentDefinitionForRole(role);
  const selectedItem = requestedTab
    ? visibleItems.find(item => item.tab === requestedTab)
    : undefined;

  if (requestedTab && !selectedItem) {
    const owningApp = getWorkspaceAppForTab(requestedTab, role, status);
    if (owningApp && owningApp.id !== app.id) {
      return <Navigate to={`/admin/app/${owningApp.id}?tab=${encodeURIComponent(requestedTab)}`} replace />;
    }
    return <Navigate to={getWorkspaceAppLaunchPath(app, role, status)} replace />;
  }

  if (!requestedTab) {
    return <Navigate to={getWorkspaceAppLaunchPath(app, role, status)} replace />;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/admin', { replace: true });
  };

  const openItem = (item: WorkspaceNavItem) => {
    setMobileNavigationOpen(false);
    if (item.path) {
      navigate(item.path, { state: { fromWorkspaceApp: app.id } });
      return;
    }
    if (item.tab) {
      navigate(`/admin/app/${app.id}?tab=${encodeURIComponent(item.tab)}`);
    }
  };

  const renderNavItem = (item: WorkspaceNavItem) => {
    const active = Boolean(item.tab && item.tab === requestedTab);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => openItem(item)}
        className={`group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${
          active
            ? 'bg-[#000080] text-white shadow-sm shadow-blue-950/15'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <span className="truncate">{item.label}</span>
        {item.path ? (
          <ExternalLink className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-white' : 'text-slate-300 group-hover:text-slate-500'}`} />
        ) : (
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-white/70' : 'text-slate-300 group-hover:text-slate-500'}`} />
        )}
      </button>
    );
  };

  const navigation = (
    <>
      <div className="border-b border-slate-200 px-5 py-5">
        <button
          type="button"
          onClick={() => navigate('/admin/workspace')}
          className="mb-5 flex items-center gap-2 text-[11px] font-bold text-slate-400 transition hover:text-[#000080]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Workspaces
        </button>
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${app.iconBackgroundClass}`}>
            <WorkspaceAppIcon name={app.icon} className={`h-5 w-5 ${app.iconClass}`} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-900">{app.label}</div>
            <div className="mt-0.5 text-[10px] leading-4 text-slate-400">{workspaceGroup?.label || 'Focused workspace'}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {visibleSections.map(section => (
            <div key={section.label}>
              <div className="mb-1.5 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                {section.label}
              </div>
              <div className="space-y-1">
                {section.items.map(renderNavItem)}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Primary department</div>
          <div className="mt-0.5 text-[11px] font-bold text-slate-700">{primaryDepartment.label}</div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        {navigation}
      </aside>

      {mobileNavigationOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setMobileNavigationOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[82vw] max-w-72 flex-col bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileNavigationOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            {navigation}
          </aside>
        </div>
      )}

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavigationOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/workspace')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#000080] transition hover:bg-blue-50"
              title="All Workspaces"
              aria-label="All Workspaces"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-900">{selectedItem?.label || app.label}</div>
              <div className="truncate text-[10px] text-slate-400">{workspaceGroup?.label || app.label} · ProFox Workspace</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500 transition hover:text-[#000080] sm:block"
            >
              View Website
            </button>
            <div className="hidden text-right md:block">
              <div className="max-w-[180px] truncate text-[11px] font-bold text-slate-800">{profile.fullName || user.email}</div>
              <div className="text-[9px] font-semibold text-slate-400">{ROLE_LABELS[role || 'pending'] || role} · {primaryDepartment.shortLabel}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-xs font-black uppercase text-[#000080]">
              {(profile.fullName || user.email || 'U')[0]}
            </div>
          </div>
        </header>

        <div className="profox-admin-app-embed min-h-[calc(100vh-72px)]">
          <AdminDashboard key={`${app.id}:${location.search}`} />
        </div>
      </div>
    </div>
  );
}
