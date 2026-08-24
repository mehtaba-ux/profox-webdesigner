import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Code2,
  FileText,
  Palette,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../lib/AuthContext';
import {
  getVisibleWorkspaceApps,
  getWorkspaceAppLaunchPath,
  WORKSPACE_GROUPS
} from '../../../lib/workspaceApps';
import { departmentDefinitionForRole } from '../../../lib/organization';
import WorkspaceAppIcon from './WorkspaceAppIcon';
import WorkspaceFocusStrip from './WorkspaceFocusStrip';
import WorkspaceShell from './WorkspaceShell';
import './AdminAppWorkspace.css';

const FOUNDER_ROLE_DASHBOARDS = [
  { label: 'Seller Dashboard', description: 'Sales team command center', path: '/admin/seller-command-center', icon: TrendingUp, tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  { label: 'Content Writer', description: 'Content delivery dashboard', path: '/admin/app/projects?tab=myWork&previewRole=content_writer', icon: FileText, tone: 'border-violet-200 bg-violet-50 text-violet-700' },
  { label: 'Designer', description: 'Design delivery dashboard', path: '/admin/app/projects?tab=myWork&previewRole=uiux_designer', icon: Palette, tone: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700' },
  { label: 'Developer', description: 'Development dashboard', path: '/admin/app/projects?tab=myWork&previewRole=developer', icon: Code2, tone: 'border-cyan-200 bg-cyan-50 text-cyan-700' }
] as const;

export default function WorkspaceLauncher() {
  const navigate = useNavigate();
  const { user, profile, role, status, isAdminOrEditor, loading } = useAuth();
  const [query, setQuery] = useState('');

  const visibleApps = useMemo(() => getVisibleWorkspaceApps(role, status), [role, status]);
  const filteredApps = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return visibleApps;
    return visibleApps.filter(app => `${app.label} ${app.description}`.toLowerCase().includes(value));
  }, [query, visibleApps]);
  const groupedApps = useMemo(() => WORKSPACE_GROUPS
    .map(group => ({ ...group, apps: filteredApps.filter(app => app.group === group.id) }))
    .filter(group => group.apps.length > 0), [filteredApps]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#000080] border-t-transparent" /></div>;
  if (!user || !profile || !isAdminOrEditor) return <Navigate to="/admin" replace />;

  const primaryDepartment = departmentDefinitionForRole(role);
  const firstName = (profile.fullName || user.email || 'there').split(' ')[0];
  const showFounderRoleDashboards = role === 'admin' && status === 'active';
  const openApp = (app: (typeof visibleApps)[number]) => navigate(getWorkspaceAppLaunchPath(app, role, status));

  return (
    <WorkspaceShell activeAppId="workspace" searchValue={query} onSearchChange={setQuery} searchPlaceholder="Search workspaces">
      <div className="pf-page-heading">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#000080]"><ShieldCheck className="h-3.5 w-3.5" />Secure ProFox workspace</div>
          <h1>Welcome back, {firstName}!</h1>
          <p>{primaryDepartment.label} · Open the tools and work assigned to your role.</p>
        </div>
        <div className="rounded-xl border border-[#e4eaf3] bg-white px-4 py-2.5 text-right shadow-sm">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Available workspaces</div>
          <div className="mt-0.5 text-xl font-extrabold text-slate-900">{visibleApps.length}</div>
        </div>
      </div>

      {status === 'onboarding' && (
        <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-[11px] leading-5 text-indigo-900">
          Your workspace is limited to ProFox Academy while onboarding is in progress. Operational tools appear automatically after activation.
        </div>
      )}

      {status === 'active' && <WorkspaceFocusStrip />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-5">
          {filteredApps.length === 0 ? (
            <div className="pf-reference-card px-6 py-16 text-center">
              <p className="text-sm font-bold text-slate-700">No matching workspaces found.</p>
              <p className="mt-1 text-xs text-slate-400">Try another search term.</p>
            </div>
          ) : groupedApps.map(group => (
            <section key={group.id} className="pf-reference-card overflow-hidden">
              <div className="flex items-end justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">{group.label}</h2>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">{group.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-500">{group.apps.length}</span>
              </div>

              <div className="grid gap-px bg-slate-100 sm:grid-cols-2 2xl:grid-cols-3">
                {group.apps.map(app => (
                  <button key={app.id} type="button" onClick={() => openApp(app)} className="group flex min-h-[104px] items-center gap-4 bg-white p-4 text-left transition hover:bg-[#f9fbfe]">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${app.iconBackgroundClass}`}>
                      <WorkspaceAppIcon name={app.icon} className={`h-5 w-5 ${app.iconClass}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-xs font-extrabold text-slate-900">{app.label}</h3>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-[#000080]" />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-slate-500">{app.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-5">
          <section className="pf-reference-card p-5">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-slate-400">My access</div>
            <div className="mt-3 text-base font-extrabold text-slate-900">{primaryDepartment.shortLabel}</div>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">Only role-approved workspaces are shown. Employee access remains connected to onboarding and certification status.</p>
            <button type="button" onClick={() => navigate(['sales','sales_rep','sales_team'].includes(String(role || '')) ? '/admin/seller-profile' : '/admin/profile')} className="mt-4 min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[10px] font-extrabold text-slate-700 transition hover:border-[#000080]/20 hover:text-[#000080]">Open my profile</button>
          </section>

          {showFounderRoleDashboards && (
            <section className="pf-reference-card overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-[#000080]">Founder access</div>
                <h2 className="mt-1 text-sm font-extrabold text-slate-900">Team dashboards</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {FOUNDER_ROLE_DASHBOARDS.map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} type="button" onClick={() => navigate(item.path)} className="group flex w-full items-center gap-3 bg-white px-4 py-3 text-left transition hover:bg-[#f9fbfe]">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${item.tone}`}><Icon className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-extrabold text-slate-900">{item.label}</div><div className="mt-0.5 truncate text-[9px] text-slate-400">{item.description}</div></div>
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-[#000080]" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      </div>
    </WorkspaceShell>
  );
}
