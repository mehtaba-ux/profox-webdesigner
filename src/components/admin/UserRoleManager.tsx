import React, { useEffect, useMemo, useState } from 'react';
import {
  UserProfile,
  UserRole,
  UserStatus,
  OnboardingStatus,
  Department,
  ROLE_LABELS,
  ONBOARDING_STATUS_LABELS
} from '../../types';
import { profileService } from '../../lib/profileService';
import {
  AGENCY_DEPARTMENTS,
  departmentDefinition,
  departmentDefinitionForRole,
  primaryDepartmentForRole
} from '../../lib/organization';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Edit,
  LogIn,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserX,
  Users,
  X
} from 'lucide-react';
import ProfileImageUploader from './workspace/ProfileImageUploader';
import AppAvatar from './workspace/AppAvatar';
import { isSyntheticTestEmployee, testStaffAccessService } from '../../lib/testStaffAccessService';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: '👑 Admin' },
  { value: 'sales', label: '📈 Sales Representative' },
  { value: 'project_manager', label: '📋 Project Manager' },
  { value: 'content_writer', label: '✍️ Content Writer' },
  { value: 'uiux_designer', label: '🎨 UI/UX Designer' },
  { value: 'developer', label: '💻 Web Developer' },
  { value: 'qa', label: '🔍 Quality Assurance' },
  { value: 'site_manager', label: '🧭 Site / Delivery Manager' },
  { value: 'editor', label: '📝 Editor' },
  { value: 'finance', label: 'Finance' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'customer', label: '👤 Customer' },
  { value: 'pending', label: '⏳ Pending Approval' },
  { value: 'sales_rep', label: 'Sales Representative (legacy)' },
  { value: 'sales_team', label: 'Sales Representative (legacy team role)' },
  { value: 'web_developer', label: 'Web Developer (legacy)' },
  { value: 'developer_designer', label: 'Web Developer (legacy hybrid role)' }
];

export default function UserRoleManager({ showHeader = true }: { showHeader?: boolean }) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [switchingUserId, setSwitchingUserId] = useState('');
  const [editForm, setEditForm] = useState<{
    role: UserRole;
    status: UserStatus;
    department: Department;
    manager: string;
    onboardingStatus: OnboardingStatus;
    onboardingProgress: number;
    fullName: string;
    avatarUrl: string;
  }>({
    role: 'pending',
    status: 'pending',
    department: 'General',
    manager: '',
    onboardingStatus: 'not_started',
    onboardingProgress: 0,
    fullName: '',
    avatarUrl: ''
  });

  const loadProfiles = async () => {
    setLoading(true);
    setErrorMsg('');
    const res = await profileService.getAllProfiles();
    if (res.error) setErrorMsg(res.error.message || 'Failed to load user profiles from database.');
    else setProfiles(res.data || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProfiles();
    setRefreshing(false);
  };

  const openEditModal = (profile: UserProfile) => {
    setEditingProfile(profile);
    setEditForm({
      role: profile.role || 'pending',
      status: profile.status || 'pending',
      department: primaryDepartmentForRole(profile.role),
      manager: profile.manager || '',
      onboardingStatus: profile.onboardingStatus || 'not_started',
      onboardingProgress: profile.onboardingProgress || 0,
      fullName: profile.fullName || '',
      avatarUrl: profile.avatarUrl || ''
    });
  };

  const closeEditModal = () => setEditingProfile(null);

  const handleRoleChange = (role: UserRole) => {
    setEditForm(prev => ({
      ...prev,
      role,
      department: primaryDepartmentForRole(role)
    }));
  };

  const handleSaveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingProfile) return;

    setIsSaving(true);
    setErrorMsg('');
    const canonicalDepartment = primaryDepartmentForRole(editForm.role);
    const res = await profileService.adminUpdateUser(editingProfile.id, {
      role: editForm.role,
      status: editForm.status,
      department: canonicalDepartment,
      manager: editForm.manager,
      onboardingStatus: editForm.onboardingStatus,
      onboardingProgress: editForm.onboardingProgress,
      fullName: editForm.fullName,
      avatarUrl: editForm.avatarUrl
    });
    setIsSaving(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to update user.');
      return;
    }

    setSavedMsg(`${editingProfile.email} updated in ${departmentDefinition(canonicalDepartment).label}.`);
    setTimeout(() => setSavedMsg(''), 3000);
    closeEditModal();
    await loadProfiles();
  };

  const handleLoginAsEmployee = async (profile: UserProfile) => {
    if (!isSyntheticTestEmployee(profile) || switchingUserId) return;
    const confirmed = window.confirm(
      `Login as ${profile.fullName || profile.email}?\n\nYour current Admin session will be replaced. Sign out of the employee account and sign back in as Admin when you finish testing.`
    );
    if (!confirmed) return;

    setSwitchingUserId(profile.id);
    setErrorMsg('');
    try {
      await testStaffAccessService.loginAs(profile);
      window.location.assign('/admin');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Could not access the test employee account.');
      setSwitchingUserId('');
    }
  };

  const filteredProfiles = useMemo(() => profiles.filter(profile => {
    const organizationDepartment = primaryDepartmentForRole(profile.role);
    const haystack = `${profile.fullName || ''} ${profile.email || ''} ${ROLE_LABELS[profile.role] || profile.role} ${departmentDefinition(organizationDepartment).label}`.toLowerCase();
    const matchesSearch = haystack.includes(searchTerm.trim().toLowerCase());
    const matchesRole = roleFilter === 'all' || profile.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || profile.status === statusFilter;
    const matchesDepartment = departmentFilter === 'all' || organizationDepartment === departmentFilter;
    return matchesSearch && matchesRole && matchesStatus && matchesDepartment;
  }), [profiles, searchTerm, roleFilter, statusFilter, departmentFilter]);

  const departmentCounts = useMemo(() => AGENCY_DEPARTMENTS.map(department => ({
    ...department,
    count: profiles.filter(profile => primaryDepartmentForRole(profile.role) === department.value).length
  })), [profiles]);

  const groupedProfiles = useMemo(() => AGENCY_DEPARTMENTS.map(department => ({
    ...department,
    members: filteredProfiles.filter(profile => primaryDepartmentForRole(profile.role) === department.value)
  })).filter(group => group.members.length > 0), [filteredProfiles]);

  const pendingUsers = profiles.filter(profile => profile.status === 'pending' || profile.role === 'pending');
  const activeUsers = profiles.filter(profile => profile.status === 'active');

  const getStatusBadge = (status: UserStatus) => {
    if (status === 'active') return <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>;
    if (status === 'pending') return <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"><Clock className="h-3.5 w-3.5" /> Pending Approval</span>;
    if (status === 'onboarding') return <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"><RefreshCw className="h-3.5 w-3.5" /> Onboarding</span>;
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"><UserX className="h-3.5 w-3.5" /> Inactive</span>;
  };

  const getRoleBadge = (role: UserRole) => {
    const label = ROLE_LABELS[role] || role;
    const department = primaryDepartmentForRole(role);
    const classes = department === 'Management'
      ? 'bg-blue-50 text-[#000080] border-blue-200'
      : department === 'Sales'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : department === 'Content'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : department === 'UI/UX Design'
            ? 'bg-violet-50 text-violet-800 border-violet-200'
            : department === 'Development'
              ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
              : department === 'Quality Assurance'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-slate-100 text-slate-700 border-slate-200';
    return <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${classes}`}>{label}</span>;
  };

  const renderUserTable = (members: UserProfile[]) => (
    <div>
      <div className="space-y-3 p-3 md:hidden">
        {members.map(profile => {
          const department = departmentDefinitionForRole(profile.role);
          return <article key={profile.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <AppAvatar name={profile.fullName || profile.email} src={profile.avatarUrl} size="md" />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-slate-900">{profile.fullName || 'Unnamed User'}</div><div className="truncate text-[10px] text-slate-500">{profile.email}</div></div>
              {getStatusBadge(profile.status)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <div><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Role</div><div className="mt-1">{getRoleBadge(profile.role)}</div></div>
              <div><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Department</div><div className="mt-1 text-xs font-bold text-slate-700">{department.shortLabel}</div></div>
            </div>
            <div className="mt-4 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${profile.onboardingStatus === 'completed' ? 'bg-emerald-500' : 'bg-[#000080]'}`} style={{ width: `${profile.onboardingProgress || 0}%` }} /></div><span className="text-[10px] font-mono text-slate-500">{profile.onboardingProgress || 0}%</span></div>
            <div className="mt-4 grid gap-2">
              {isSyntheticTestEmployee(profile) && <button onClick={() => void handleLoginAsEmployee(profile)} disabled={Boolean(switchingUserId)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-3 text-[11px] font-black text-white disabled:opacity-50">{switchingUserId === profile.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}Login as test employee</button>}
              <button onClick={() => openEditModal(profile)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-[11px] font-black text-slate-700"><Edit className="h-3.5 w-3.5" />Edit profile and access</button>
            </div>
          </article>;
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3.5">Team Member</th>
            <th className="px-4 py-3.5">Role</th>
            <th className="px-4 py-3.5">Status</th>
            <th className="px-4 py-3.5">Primary Department</th>
            <th className="px-4 py-3.5">Onboarding</th>
            <th className="px-4 py-3.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {members.map(profile => {
            const department = departmentDefinitionForRole(profile.role);
            return (
              <tr key={profile.id} className="transition-colors hover:bg-slate-50/80">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <AppAvatar name={profile.fullName || profile.email} src={profile.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-900">{profile.fullName || 'Unnamed User'}</div>
                      <div className="truncate text-[11px] text-slate-500">{profile.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">{getRoleBadge(profile.role)}</td>
                <td className="px-4 py-3.5">{getStatusBadge(profile.status)}</td>
                <td className="px-4 py-3.5">
                  <div className="font-bold text-slate-700">{department.shortLabel}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{department.label}</div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full ${profile.onboardingStatus === 'completed' ? 'bg-emerald-500' : 'bg-[#000080]'}`} style={{ width: `${profile.onboardingProgress || 0}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{profile.onboardingProgress || 0}%</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{ONBOARDING_STATUS_LABELS[profile.onboardingStatus] || profile.onboardingStatus}</div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {isSyntheticTestEmployee(profile) && <button onClick={() => void handleLoginAsEmployee(profile)} disabled={Boolean(switchingUserId)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#000080] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-[#000066] disabled:opacity-50">{switchingUserId === profile.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />} Login as</button>}
                    <button onClick={() => openEditModal(profile)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-200">
                      <Edit className="h-3.5 w-3.5" /> Edit Access
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {showHeader && <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><ShieldCheck className="h-6 w-6 text-[#000080]" /> Team & Departments</h2>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-[#000080]">Database RLS Active</span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Every role has one clear primary department. Access remains role-controlled and production test impersonation is disabled.</p>
        </div>
        <button onClick={() => void handleRefresh()} disabled={refreshing || loading} className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>}

      {savedMsg && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> {savedMsg}</div>}
      {errorMsg && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-bold text-red-800"><AlertTriangle className="h-4 w-4 shrink-0 text-red-600" /> {errorMsg}</div>}

      {pendingUsers.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-600" /><h3 className="text-sm font-bold text-amber-900">Pending Account Approvals ({pendingUsers.length})</h3></div>
            <span className="text-[11px] font-medium text-amber-700">Assigning a role automatically places the user in the correct primary department.</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {pendingUsers.map(profile => (
              <div key={profile.id} className="rounded-xl border border-amber-200 bg-white p-3.5 shadow-sm">
                <div className="font-bold text-xs text-slate-900">{profile.fullName || 'New User'}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{profile.email}</div>
                <button onClick={() => openEditModal(profile)} className="mt-3 w-full rounded-lg bg-[#000080] py-1.5 text-center text-[11px] font-bold text-white">Assign Role & Department</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {departmentCounts.map(department => {
          const selected = departmentFilter === department.value;
          return (
            <button key={department.value} onClick={() => setDepartmentFilter(selected ? 'all' : department.value)} className={`rounded-2xl border p-3 text-left shadow-sm transition ${selected ? 'border-[#000080] bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200'}`}>
              <div className="text-lg font-black text-slate-900">{department.count}</div>
              <div className="mt-0.5 text-[10px] font-black leading-4 text-slate-600">{department.shortLabel}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row">
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search name, email, role or department..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs outline-none transition-colors focus:border-[#000080]" />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#000080]">
            <option value="all">All Roles ({profiles.length})</option>
            {ROLE_OPTIONS.filter(option => !['sales_rep','sales_team','web_developer','developer_designer'].includes(option.value)).map(option => <option key={option.value} value={option.value}>{option.label.replace(/^[^A-Za-z]+/, '')}</option>)}
          </select>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#000080]">
            <option value="all">All Statuses</option>
            <option value="active">Active ({activeUsers.length})</option>
            <option value="pending">Pending ({pendingUsers.length})</option>
            <option value="onboarding">Onboarding</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#000080]">
            <option value="all">All Departments</option>
            {AGENCY_DEPARTMENTS.map(department => <option key={department.value} value={department.value}>{department.label}</option>)}
          </select>
          {!showHeader && <button onClick={() => void handleRefresh()} disabled={refreshing || loading} className="flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-extrabold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-slate-500 shadow-sm"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#000080] border-t-transparent" /><span className="text-xs font-semibold">Loading secure user profiles...</span></div>
      ) : groupedProfiles.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm"><Users className="mx-auto mb-2 h-10 w-10 text-slate-300" /><h4 className="text-sm font-bold text-slate-700">No team members match these filters</h4><p className="mt-1 text-xs text-slate-400">Try another role, department, status or search term.</p></div>
      ) : (
        <div className="space-y-5">
          {groupedProfiles.map(group => (
            <section key={group.value} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#000080]" /><h3 className="text-sm font-black text-slate-900">{group.label}</h3><span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{group.members.length}</span></div>
                  <p className="mt-1 text-[11px] text-slate-500">{group.description}</p>
                </div>
              </div>
              {renderUserTable(group.members)}
            </section>
          ))}
        </div>
      )}

      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
              <div><h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-[#000080]" /> Edit Role & Access</h3><p className="mt-0.5 text-xs text-slate-500">{editingProfile.email}</p></div>
              <button type="button" onClick={closeEditModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <ProfileImageUploader
                compact
                value={editForm.avatarUrl}
                name={editForm.fullName || editingProfile.email}
                onChange={avatarUrl => setEditForm(previous => ({ ...previous, avatarUrl }))}
                disabled={isSaving}
              />
              <div><label className="mb-1 block text-xs font-bold text-slate-700">Full Name</label><input type="text" value={editForm.fullName} onChange={event => setEditForm(prev => ({ ...prev, fullName: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#000080]" /></div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div><label className="mb-1 block text-xs font-bold text-slate-700">Assigned Role *</label><select value={editForm.role} onChange={event => handleRoleChange(event.target.value as UserRole)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#000080]">{ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                <div><label className="mb-1 block text-xs font-bold text-slate-700">Account Status *</label><select value={editForm.status} onChange={event => setEditForm(prev => ({ ...prev, status: event.target.value as UserStatus }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#000080]"><option value="active">Active (Access Granted)</option><option value="pending">Pending Approval (Restricted)</option><option value="onboarding">Onboarding (In Training)</option><option value="inactive">Inactive (Deactivated)</option></select></div>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-[#000080]">Primary Department · Automatic</div>
                <div className="mt-1 text-sm font-black text-slate-900">{departmentDefinition(editForm.department).label}</div>
                <p className="mt-1 text-[11px] leading-5 text-slate-600">Department follows the assigned role so Sales, Content, Design, Development, QA and Delivery users cannot accidentally be filed under the wrong team.</p>
              </div>

              <div><label className="mb-1 block text-xs font-bold text-slate-700">Assigned Manager / Supervisor</label><input type="text" value={editForm.manager} onChange={event => setEditForm(prev => ({ ...prev, manager: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#000080]" placeholder="e.g. Project Manager or Founder" /></div>

              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 md:grid-cols-2">
                <div><label className="mb-1 block text-xs font-bold text-slate-700">Onboarding Status</label><select value={editForm.onboardingStatus} onChange={event => setEditForm(prev => ({ ...prev, onboardingStatus: event.target.value as OnboardingStatus }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#000080]"><option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="failed">Failed</option></select></div>
                <div><label className="mb-1 block text-xs font-bold text-slate-700">Onboarding Progress ({editForm.onboardingProgress}%)</label><input type="range" min={0} max={100} value={editForm.onboardingProgress} onChange={event => setEditForm(prev => ({ ...prev, onboardingProgress: parseInt(event.target.value, 10) || 0 }))} className="w-full accent-[#000080]" /></div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" onClick={closeEditModal} className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900">Cancel</button><button type="submit" disabled={isSaving} className="flex items-center gap-1.5 rounded-xl bg-[#000080] px-5 py-2 text-xs font-bold text-white shadow transition hover:bg-[#000066] disabled:opacity-50"><Save className="h-3.5 w-3.5" /> {isSaving ? 'Saving...' : 'Save Changes'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
