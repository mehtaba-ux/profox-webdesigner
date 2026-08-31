import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Eye,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { adminTeamDashboardPreviewService, type TeamDashboardPreviewAudit } from '../../lib/adminTeamDashboardPreviewService';
import { departmentDefinitionForRole, primaryDepartmentForRole } from '../../lib/organization';
import { profileService } from '../../lib/profileService';
import { getVisibleWorkspaceApps, WORKSPACE_APPS } from '../../lib/workspaceApps';
import { ONBOARDING_STATUS_LABELS, ROLE_LABELS, type UserProfile, type UserStatus } from '../../types';
import Logo from '../Logo';
import AppAvatar from './workspace/AppAvatar';

const PREVIEWABLE_ROLES = new Set([
  'sales', 'sales_rep', 'sales_team', 'project_manager', 'site_manager', 'content_writer',
  'editor', 'uiux_designer', 'developer', 'web_developer', 'developer_designer', 'qa',
  'finance', 'accountant',
]);

const statusPriority: Record<UserStatus, number> = { active: 0, onboarding: 1, inactive: 2, pending: 3 };

function isRealCurrentTeamMember(profile: UserProfile) {
  return PREVIEWABLE_ROLES.has(profile.role)
    && profile.status !== 'pending'
    && !profile.email.toLowerCase().endsWith('@profoxwebdesigner.test');
}

function chooseDepartmentRepresentatives(profiles: UserProfile[]) {
  const candidates = profiles.filter(isRealCurrentTeamMember).sort((left, right) => {
    const statusDifference = statusPriority[left.status] - statusPriority[right.status];
    if (statusDifference !== 0) return statusDifference;
    const onboardingDifference = (right.onboardingProgress || 0) - (left.onboardingProgress || 0);
    if (onboardingDifference !== 0) return onboardingDifference;
    return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
  });
  const representatives = new Map<string, UserProfile>();
  for (const profile of candidates) {
    const department = primaryDepartmentForRole(profile.role);
    if (!representatives.has(department)) representatives.set(department, profile);
  }
  return [...representatives.values()];
}

function statusClass(status: UserStatus) {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'onboarding') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export default function AdminTeamDashboardPreview() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState('');
  const [audit, setAudit] = useState<TeamDashboardPreviewAudit | null>(null);
  const [error, setError] = useState('');
  const selectedId = searchParams.get('member') || '';

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    profileService.getAllProfiles().then(result => {
      if (!active) return;
      if (result.error) setError(result.error.message || 'Current team members could not be loaded.');
      else setProfiles(result.data || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [authLoading, isAdmin]);

  const representatives = useMemo(() => chooseDepartmentRepresentatives(profiles), [profiles]);
  const selected = representatives.find(profile => profile.id === selectedId) || null;
  const currentApps = selected ? getVisibleWorkspaceApps(selected.role, selected.status) : [];
  const roleApps = selected
    ? WORKSPACE_APPS.filter(app => app.roles.includes(selected.role))
    : [];

  useEffect(() => {
    if (!selectedId || loading) return;
    if (!selected) {
      setError('That account is not the selected current representative for its department.');
      setSearchParams({}, { replace: true });
    }
  }, [selected, selectedId, loading, setSearchParams]);

  const openPreview = async (profile: UserProfile) => {
    setOpeningId(profile.id);
    setError('');
    try {
      const event = await adminTeamDashboardPreviewService.recordOpen(profile.id);
      setAudit(event);
      setSearchParams({ member: profile.id });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'The dashboard preview could not be opened.');
    } finally {
      setOpeningId('');
    }
  };

  if (authLoading || loading) return <div className="flex min-h-[560px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!isAdmin) return <div className="mx-auto mt-10 max-w-xl rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700">Administrator access is required.</div>;

  if (selected) {
    const department = departmentDefinitionForRole(selected.role);
    return (
      <div className="min-h-full bg-slate-50">
        <div className="sticky top-0 z-20 border-b border-amber-300 bg-amber-50 px-4 py-3 shadow-sm">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-amber-900"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="text-sm font-black">Admin preview · Read only</div><p className="text-xs leading-5">You remain signed in as Admin. No employee action, record, payout, message, or setting can be changed from this preview.</p></div></div>
            <button type="button" onClick={() => { setAudit(null); setSearchParams({}); }} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white"><ArrowLeft className="h-4 w-4" />Exit preview</button>
          </div>
        </div>

        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="h-2 bg-gradient-to-r from-[#000080] via-blue-600 to-cyan-400" />
            <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4"><AppAvatar name={selected.fullName || selected.email} src={selected.avatarUrl} size="lg" /><div><div className="text-xs font-black uppercase tracking-[0.18em] text-[#000080]">{department.label}</div><h1 className="mt-1 text-2xl font-black text-slate-950">{selected.fullName || 'Unnamed team member'}</h1><p className="mt-1 text-sm text-slate-500">{ROLE_LABELS[selected.role] || selected.role} · representative dashboard</p></div></div>
              <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClass(selected.status)}`}>{selected.status}</span><span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-[#000080]">One of one preview for {department.shortLabel}</span></div>
            </div>
          </section>

          {error && <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertTriangle className="h-5 w-5" />{error}</div>}

          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><ShieldCheck className="h-4 w-4" />Current access</div><div className="mt-3 text-xl font-black text-slate-950">{selected.status === 'active' ? 'Enabled' : selected.status === 'onboarding' ? 'Academy only' : 'Disabled'}</div><p className="mt-1 text-xs leading-5 text-slate-500">Reflects the employee's current account status.</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><BookOpenCheck className="h-4 w-4" />Onboarding</div><div className="mt-3 text-xl font-black text-slate-950">{selected.onboardingProgress || 0}%</div><p className="mt-1 text-xs leading-5 text-slate-500">{ONBOARDING_STATUS_LABELS[selected.onboardingStatus] || selected.onboardingStatus}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><LayoutDashboard className="h-4 w-4" />Available now</div><div className="mt-3 text-xl font-black text-slate-950">{currentApps.length} module{currentApps.length === 1 ? '' : 's'}</div><p className="mt-1 text-xs leading-5 text-slate-500">Calculated from the existing role and status access rules.</p></div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black text-slate-950">Dashboard modules</h2><p className="mt-1 text-sm text-slate-500">The same workspace definitions used by the live employee dashboard.</p></div><Eye className="h-5 w-5 text-[#000080]" /></div>
            {currentApps.length > 0 ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{currentApps.map(app => <article key={app.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="text-sm font-black text-slate-900">{app.label}</div><p className="mt-2 text-xs leading-5 text-slate-500">{app.description}</p><div className="mt-4 text-[10px] font-black uppercase tracking-wider text-emerald-700">Visible in current dashboard</div></article>)}</div> : <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="font-black text-amber-900">No live workspace access in the current state</div><p className="mt-1 text-sm leading-6 text-amber-800">This accurately mirrors an {selected.status} account. Its role is configured for {roleApps.length} workspace module{roleApps.length === 1 ? '' : 's'} after the required activation/onboarding gate is satisfied.</p></div>}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900"><span><strong>Audit recorded:</strong> {audit ? `event #${audit.eventId}` : 'this preview was authorized by the server'}.</span><span>No employee session or credential was created.</span></div>
        </main>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <button type="button" onClick={() => navigate('/admin/app/team')} className="mb-5 inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-[#000080]"><ArrowLeft className="h-4 w-4" />Back to Team Management</button>
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><div className="flex items-center gap-3"><Logo className="h-11 w-auto" /><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">ProFox Admin</p><h1 className="text-2xl font-black text-slate-950">Team dashboard preview</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">One real current account is selected for each department. Open a dashboard to verify its role, status, onboarding gate, and visible workspace modules without signing out or changing live employee data.</p></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800"><ShieldCheck className="mr-2 inline h-4 w-4" />Read-only and audited</div></div>
      </header>

      {error && <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertTriangle className="h-5 w-5" />{error}</div>}

      {representatives.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center"><Users className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 font-black text-slate-800">No real current team accounts are available</h2><p className="mt-1 text-sm text-slate-500">Synthetic, customer, pending, and Admin accounts are intentionally excluded.</p></div> : <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{representatives.map(profile => { const department = departmentDefinitionForRole(profile.role); return <article key={profile.id} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg"><div className="flex items-start gap-3"><AppAvatar name={profile.fullName || profile.email} src={profile.avatarUrl} size="md" /><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-wider text-[#000080]">{department.label}</p><h2 className="mt-1 truncate text-base font-black text-slate-950">{profile.fullName || 'Unnamed team member'}</h2><p className="truncate text-xs text-slate-500">{ROLE_LABELS[profile.role] || profile.role}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black capitalize ${statusClass(profile.status)}`}>{profile.status}</span></div><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><div className="text-xs text-slate-500"><strong className="text-slate-800">{profile.onboardingProgress || 0}%</strong> onboarding</div><button type="button" onClick={() => void openPreview(profile)} disabled={Boolean(openingId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white transition hover:bg-[#000066] disabled:opacity-50">{openingId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Preview dashboard<ChevronRight className="h-4 w-4" /></button></div></article>; })}</section>}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-600" />Selection prefers an active member, then onboarding, then inactive, using existing accounts only. Management, customers, pending users, and synthetic test profiles are excluded.</div>
    </main>
  );
}
