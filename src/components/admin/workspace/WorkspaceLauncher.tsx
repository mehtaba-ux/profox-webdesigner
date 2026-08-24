import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Code2, FileText, Globe2, LogOut, Palette, Search, ShieldCheck, TrendingUp } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../lib/AuthContext';
import {
  getVisibleWorkspaceApps,
  getWorkspaceAppLaunchPath,
  WORKSPACE_GROUPS
} from '../../../lib/workspaceApps';
import { departmentDefinitionForRole } from '../../../lib/organization';
import { ROLE_LABELS } from '../../../types';
import WorkspaceAppIcon from './WorkspaceAppIcon';
import WorkspaceFocusStrip from './WorkspaceFocusStrip';

const FOUNDER_ROLE_DASHBOARDS = [
  {
    label: 'Seller Dashboard',
    description: 'Sales team command center',
    path: '/admin/seller-command-center',
    icon: TrendingUp,
    tone: 'border-amber-200 bg-amber-50 text-amber-700'
  },
  {
    label: 'Content Writer Dashboard',
    description: 'PF-SOP-07 delivery preview',
    path: '/admin/app/projects?tab=myWork&previewRole=content_writer',
    icon: FileText,
    tone: 'border-violet-200 bg-violet-50 text-violet-700'
  },
  {
    label: 'Designer Dashboard',
    description: 'PF-SOP-08 delivery preview',
    path: '/admin/app/projects?tab=myWork&previewRole=uiux_designer',
    icon: Palette,
    tone: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
  },
  {
    label: 'Developer Dashboard',
    description: 'PF-SOP-09 delivery preview',
    path: '/admin/app/projects?tab=myWork&previewRole=developer',
    icon: Code2,
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-700'
  }
] as const;

export default function WorkspaceLauncher() {
  const navigate = useNavigate();
  const {
    user,
    profile,
    role,
    status,
    isAdminOrEditor,
    loading,
    logout
  } = useAuth();
  const [query, setQuery] = useState('');

  const visibleApps = useMemo(
    () => getVisibleWorkspaceApps(role, status),
    [role, status]
  );

  const filteredApps = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return visibleApps;
    return visibleApps.filter(app =>
      `${app.label} ${app.description}`.toLowerCase().includes(value)
    );
  }, [query, visibleApps]);

  const groupedApps = useMemo(
    () => WORKSPACE_GROUPS
      .map(group => ({ ...group, apps: filteredApps.filter(app => app.group === group.id) }))
      .filter(group => group.apps.length > 0),
    [filteredApps]
  );

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

  const primaryDepartment = departmentDefinitionForRole(role);
  const showFounderRoleDashboards = role === 'admin' && status === 'active';

  const handleLogout = async () => {
    await logout();
    navigate('/admin', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(0,0,128,0.07),_transparent_34%),linear-gradient(135deg,#f8fafc_0%,#f1f5f9_50%,#eef2ff_100%)] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#000080] text-white shadow-lg shadow-blue-950/15">
              <span className="text-base font-black">P</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight">ProFox Workspace</h1>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#000080]">Business OS</span>
              </div>
              <p className="text-[11px] text-slate-500">One connected system, organized by business function.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:text-[#000080] sm:flex"
            >
              <Globe2 className="h-4 w-4" /> View Website
            </button>
            <div className="hidden text-right md:block">
              <div className="max-w-[190px] truncate text-xs font-bold text-slate-800">{profile.fullName || user.email}</div>
              <div className="text-[10px] font-semibold text-slate-400">{ROLE_LABELS[role || 'pending'] || role} · {primaryDepartment.shortLabel}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-xs font-black uppercase text-[#000080]">
              {(profile.fullName || user.email || 'U')[0]}
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:py-12">
        <div className="mb-9 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">
              <ShieldCheck className="h-4 w-4" /> Organized workspace
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Work by function, not by guesswork.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Revenue, delivery, people, website and company operations each have a clear home. Your role only sees the workspaces it needs.
            </p>
          </div>

          {visibleApps.length > 5 && (
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Find a workspace..."
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none shadow-sm transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100"
              />
            </div>
          )}
        </div>

        {status === 'onboarding' && (
          <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-900">
            Your workspace is limited to ProFox Academy while onboarding is in progress. Your operational department appears automatically after activation.
          </div>
        )}

        {status === 'active' && <WorkspaceFocusStrip />}

        {showFounderRoleDashboards && (
          <section className="mb-8 rounded-[28px] border border-blue-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:p-6">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Founder access</div>
                <h3 className="mt-1 text-lg font-black text-slate-900">Direct team dashboard access</h3>
                <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">
                  Open the existing Seller dashboard or inspect the real Content, Design and Development dashboards in a protected read-only preview. No duplicate dashboard or role impersonation is used.
                </p>
              </div>
              <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#000080]">Admin only</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {FOUNDER_ROLE_DASHBOARDS.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${item.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-black text-slate-900">{item.label}</div>
                      <div className="mt-1 truncate text-[10px] text-slate-400">{item.description}</div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-[#000080]" />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {filteredApps.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center">
            <p className="font-bold text-slate-700">No matching workspaces found.</p>
            <p className="mt-1 text-sm text-slate-400">Try another search term.</p>
          </div>
        ) : (
          <div className="space-y-9">
            {groupedApps.map(group => (
              <section key={group.id} className="rounded-[28px] border border-white/70 bg-white/55 p-4 shadow-sm backdrop-blur-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-1 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">{group.label}</h3>
                    <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">{group.description}</p>
                  </div>
                  <span className="mt-2 w-fit rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 sm:mt-0">
                    {group.apps.length} {group.apps.length === 1 ? 'workspace' : 'workspaces'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                  {group.apps.map(app => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => navigate(getWorkspaceAppLaunchPath(app, role, status))}
                      className="group flex min-w-0 flex-col items-center rounded-3xl px-2 py-3 text-center transition hover:-translate-y-1 hover:bg-white/70 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                    >
                      <div className={`relative flex h-[82px] w-[82px] items-center justify-center rounded-[22px] border bg-white shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition duration-200 group-hover:shadow-[0_16px_36px_rgba(15,23,42,0.14)] ${app.iconBackgroundClass}`}>
                        <WorkspaceAppIcon name={app.icon} className={`h-9 w-9 ${app.iconClass}`} />
                        <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition group-hover:opacity-100">
                          <ArrowUpRight className="h-3 w-3 text-slate-500" />
                        </div>
                      </div>
                      <div className="mt-3 w-full truncate text-sm font-bold text-slate-800">{app.shortLabel}</div>
                      <div className="mt-1 line-clamp-2 max-w-[155px] text-[10px] leading-4 text-slate-400">{app.description}</div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
