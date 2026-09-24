import React, { useMemo, useState } from 'react';
import { useCMS } from '../../lib/CMSProvider';
import { PortfolioItem, TeamMemberProfile } from '../../types';
import { Briefcase, Building2, Check, Clock, Copy, Plus, Search, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { useConfirmContext } from './ConfirmContext';
import { AGENCY_DEPARTMENTS, departmentDefinitionForRole, primaryDepartmentForRole } from '../../lib/organization';
import UserRoleManager from './UserRoleManager';
import AppAvatar from './workspace/AppAvatar';
import ProfileImageUploader from './workspace/ProfileImageUploader';

export default function TeamManager({ portfolioItems }: { portfolioItems: PortfolioItem[] }) {
  const { content, updateSection } = useCMS();
  const { confirm: confirmAction } = useConfirmContext();
  const [activeSubTab, setActiveSubTab] = useState<'roles' | 'showcase'>('roles');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedLink, setCopiedLink] = useState('');
  const [showAddSalesModal, setShowAddSalesModal] = useState(false);
  const [newSalesForm, setNewSalesForm] = useState({
    fullName: '',
    title: 'Sales Representative',
    bio: '',
    avatar: ''
  });

  const rawMembers: TeamMemberProfile[] = content.team_members || [];
  const teamMembers = useMemo(() => {
    const map = new Map<string, TeamMemberProfile>();
    rawMembers.forEach((member, index) => {
      const key = member.id || member.userId || `member_${index}`;
      if (!map.has(key)) map.set(key, member);
    });
    return Array.from(map.values());
  }, [rawMembers]);

  const filteredMembers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return teamMembers;
    return teamMembers.filter(member => {
      const department = departmentDefinitionForRole(member.role);
      return `${member.fullName} ${member.role} ${member.title} ${department.label}`.toLowerCase().includes(query);
    });
  }, [teamMembers, searchTerm]);

  const groupedMembers = useMemo(() => AGENCY_DEPARTMENTS.map(department => ({
    ...department,
    members: filteredMembers.filter(member => primaryDepartmentForRole(member.role) === department.value)
  })).filter(group => group.members.length > 0), [filteredMembers]);

  const copyOnboardingLink = () => {
    const url = `${window.location.origin}/admin?mode=register`;
    navigator.clipboard.writeText(url);
    setCopiedLink('register');
    setTimeout(() => setCopiedLink(''), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction('Remove Team Member', 'Are you sure you want to remove this team member from the public website showcase?'))) return;
    const updated = teamMembers.filter(member => member.id !== id);
    await updateSection('team_members', updated);
  };

  const handleAddSalesMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newSalesForm.fullName) return;

    const newId = `sales_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newMember: TeamMemberProfile = {
      id: newId,
      userId: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      role: 'sales_team',
      fullName: newSalesForm.fullName,
      title: newSalesForm.title,
      bio: newSalesForm.bio,
      avatar: newSalesForm.avatar,
      createdAt: new Date().toISOString()
    };

    await updateSection('team_members', [...teamMembers.filter(member => member.id !== newId), newMember]);

    setShowAddSalesModal(false);
    setNewSalesForm({
      fullName: '',
      title: 'Sales Representative',
      bio: '',
      avatar: ''
    });
  };

  const renderMemberCard = (member: TeamMemberProfile, index: number) => {
    const memberProjects = portfolioItems.filter(item => item.assignedTo === member.userId);
    const department = departmentDefinitionForRole(member.role);

    return (
      <div key={`${member.id || 'member'}_${index}`} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
        <div>
          <div className="flex items-start gap-4">
            <AppAvatar name={member.fullName} src={member.avatar} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="truncate font-bold text-slate-900">{member.fullName}</h4>
                <button onClick={() => void handleDelete(member.id)} className="rounded-lg p-1 text-slate-400 transition-colors hover:text-red-500" title="Remove from public website showcase">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs font-semibold text-[#000080]">{member.title}</p>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400"><Clock className="h-3 w-3" /> Joined {new Date(member.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
          <p className="mt-4 line-clamp-2 text-xs text-slate-600">{member.bio || 'No biography provided.'}</p>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 font-medium"><Briefcase className="h-3.5 w-3.5 text-slate-400" /><span>{memberProjects.length} Portfolio Projects</span></div>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{department.shortLabel}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="pf-reference-card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><Users className="h-5 w-5 text-[#000080]" /> Employees</h2>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">Manage employee access, departments, profile images and the separate public team directory.</p>
        </div>
        <div className="flex w-full items-center rounded-xl bg-slate-100 p-1 md:w-auto">
          <button onClick={() => setActiveSubTab('roles')} className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[10px] font-extrabold transition md:flex-none ${activeSubTab === 'roles' ? 'bg-white text-[#000080] shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
            <ShieldCheck className="h-3.5 w-3.5" /> Employee Directory
          </button>
          <button onClick={() => setActiveSubTab('showcase')} className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[10px] font-extrabold transition md:flex-none ${activeSubTab === 'showcase' ? 'bg-white text-[#000080] shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
            <Users className="h-3.5 w-3.5" /> Public Profiles ({teamMembers.length})
          </button>
        </div>
      </div>

      {activeSubTab === 'roles' ? (
        <UserRoleManager showHeader={false} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Users className="h-6 w-6 text-[#000080]" /> Public Team Showcase</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Public-facing profiles use the same department structure as internal Team & Users, so Sales, Content, Design and Development are never mixed into one generic team bucket.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowAddSalesModal(true)} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow transition-all hover:bg-emerald-700"><Plus className="h-3.5 w-3.5" /> Add Sales Rep</button>
              <button onClick={copyOnboardingLink} className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200" title="Copy Registration Link">
                {copiedLink === 'register' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} Copy Registration URL
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search name, title, role or department..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs text-slate-900 shadow-sm outline-none transition-all focus:border-[#000080]" />
          </div>

          {groupedMembers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No public team members match your search.</div>
          ) : (
            <div className="space-y-5">
              {groupedMembers.map(group => (
                <section key={group.value} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#000080]" /><h3 className="text-base font-bold text-slate-900">{group.label}</h3><span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-[#000080]">{group.members.length}</span></div>
                      <p className="mt-1 text-[11px] text-slate-500">{group.description}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{group.members.map(renderMemberCard)}</div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddSalesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
              <div><h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Plus className="h-5 w-5 text-emerald-600" /> Add Sales Representative</h3><p className="mt-1 text-[11px] text-slate-500">This profile will appear under Sales & Business Development.</p></div>
              <button type="button" onClick={() => setShowAddSalesModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleAddSalesMember} className="space-y-4">
              <div><label className="mb-1 block text-xs font-bold text-slate-700">Full Name *</label><input type="text" required placeholder="e.g. Jordan Smith" value={newSalesForm.fullName} onChange={event => setNewSalesForm(prev => ({ ...prev, fullName: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#000080]" /></div>
              <div><label className="mb-1 block text-xs font-bold text-slate-700">Title / Role</label><input type="text" value={newSalesForm.title} onChange={event => setNewSalesForm(prev => ({ ...prev, title: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#000080]" /></div>
              <ProfileImageUploader compact value={newSalesForm.avatar} name={newSalesForm.fullName || 'New team member'} onChange={avatar => setNewSalesForm(previous => ({ ...previous, avatar }))} />
              <div><label className="mb-1 block text-xs font-bold text-slate-700">Short Bio</label><textarea rows={2} value={newSalesForm.bio} onChange={event => setNewSalesForm(prev => ({ ...prev, bio: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#000080]" /></div>
              <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowAddSalesModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900">Cancel</button><button type="submit" className="rounded-xl bg-[#000080] px-4 py-2 text-xs font-bold text-white shadow transition-all hover:bg-[#000066]">Create Sales Member</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
