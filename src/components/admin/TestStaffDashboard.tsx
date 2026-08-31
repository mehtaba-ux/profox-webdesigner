import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { FlaskConical, LayoutDashboard, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { departmentDefinitionForRole } from '../../lib/organization';
import { canAccessWorkspaceItem, WORKSPACE_APPS } from '../../lib/workspaceApps';
import { isSyntheticTestProfile } from '../../lib/testStaffAccessService';
import { ROLE_LABELS } from '../../types';
import Logo from '../Logo';
import AppAvatar from './workspace/AppAvatar';
import WorkspaceAppIcon from './workspace/WorkspaceAppIcon';

export default function TestStaffDashboard() {
  const { user, profile, role, loading, logout } = useAuth();
  const apps = useMemo(() => WORKSPACE_APPS.filter(app => role && app.roles.includes(role) && (app.statuses || ['active']).includes('active')), [role]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#000080] border-t-transparent" /></div>;
  if (!user || !profile || !isSyntheticTestProfile(profile)) return <Navigate to="/admin" replace />;

  const department = departmentDefinitionForRole(profile.role);
  const availableScreens = apps.reduce((count, app) => count + app.items.filter(item => canAccessWorkspaceItem(item, profile.role, 'active')).length, 0);

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-amber-950"><FlaskConical className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="text-sm font-black">Isolated test account</div><p className="text-xs leading-5">Dashboard inspection only. Live CRM records, projects, payments, messages, uploads, and settings are not loaded in this session.</p></div></div>
          <button type="button" onClick={() => void logout()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white"><LogOut className="h-4 w-4" />Exit test account</button>
        </div>
      </div>

      <header className="border-b border-slate-200 bg-white px-4 py-5 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Logo className="h-10 w-auto" />
          <div className="flex items-center gap-3"><AppAvatar name={profile.fullName || profile.email} src={profile.avatarUrl} size="sm" /><div className="hidden text-right sm:block"><div className="text-xs font-black">{profile.fullName}</div><div className="text-[10px] text-slate-500">{ROLE_LABELS[profile.role] || profile.role}</div></div></div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="h-2 bg-gradient-to-r from-[#000080] via-blue-600 to-cyan-400" />
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]"><ShieldCheck className="h-4 w-4" />{department.label} · Test Dashboard</div><h1 className="mt-2 text-3xl font-black tracking-tight">Welcome, {profile.fullName?.split(' ')[0] || 'Team Member'}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This shows the role-based workspace structure the employee receives after activation while keeping the retained test identity inactive at the production database boundary.</p></div>
            <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-center"><div className="text-2xl font-black text-[#000080]">{apps.length}</div><div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Workspaces</div></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center"><div className="text-2xl font-black text-emerald-800">{availableScreens}</div><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Screens</div></div></div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2"><LayoutDashboard className="h-5 w-5 text-[#000080]" /><div><h2 className="text-lg font-black">Department workspace</h2><p className="text-xs text-slate-500">Uses the same central role and navigation definitions as the live dashboard.</p></div></div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{apps.map(app => { const items = app.items.filter(item => canAccessWorkspaceItem(item, profile.role, 'active')); return <article key={app.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${app.iconBackgroundClass}`}><WorkspaceAppIcon name={app.icon} className={`h-5 w-5 ${app.iconClass}`} /></div><div><h3 className="text-sm font-black">{app.label}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{app.description}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{items.length > 0 ? items.map(item => <span key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600">{item.label}</span>) : <span className="text-[10px] font-bold text-slate-400">Workspace landing screen</span>}</div></article>; })}</div>
        </section>

        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p><strong className="text-slate-900">Production isolation is active.</strong> This account remains inactive in `user_profiles`; the signed-in screen is a non-persistent dashboard inspection surface and does not render operational components.</p></div>
      </main>
    </div>
  );
}
