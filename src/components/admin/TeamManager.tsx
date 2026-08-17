import React, { useState } from 'react';
import { useCMS } from '../../lib/CMSProvider';
import { TeamMemberProfile, PortfolioItem } from '../../types';


import { Users, Briefcase, Clock, Search, Trash2, Copy, Check, Send, Plus, X } from 'lucide-react';
import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import { deleteSalesRep, addSalesRep } from '../../lib/chatService';

export default function TeamManager({ portfolioItems }: { portfolioItems: PortfolioItem[] }) {
  const { content, updateSection } = useCMS();
  const { confirm: confirmAction } = useConfirmContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedLink, setCopiedLink] = useState('');
  const [inviteEmails, setInviteEmails] = useState({ developer_designer: '', sales_team: '' });

  // Modal for creating custom Sales Rep
  const [showAddSalesModal, setShowAddSalesModal] = useState(false);
  const [newSalesForm, setNewSalesForm] = useState({
    fullName: '',
    email: '',
    title: 'Sales Representative',
    bio: '',
    specialties: 'Web Packages, Custom Quotations',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=250'
  });

  const sendInviteEmail = (role: string) => {
    const email = inviteEmails[role as keyof typeof inviteEmails];
    if (!email) return;

    const url = `${window.location.origin}/admin?mode=register&role=${role}`;
    const roleName = role === 'sales_team' ? 'Sales Team Member' : 'Website Designer / Developer';
    const subject = encodeURIComponent(`Invitation to join Profox Web Designer Team`);
    const body = encodeURIComponent(`Hello,\n\nYou have been invited to join the Profox Web Designer team as a ${roleName}.\n\nPlease click the link below to create your account, complete your onboarding profile, and access your dashboard:\n\n${url}\n\nBest regards,\nProfox Web Designer`);
    
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    setInviteEmails(prev => ({ ...prev, [role]: '' }));
  };

  const teamMembers: TeamMemberProfile[] = content.team_members || [];

  const filteredMembers = teamMembers.filter(member => 
    member.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const designMembers = filteredMembers.filter(m => m.role === 'developer_designer');
  const salesMembers = filteredMembers.filter(m => m.role === 'sales_team');
  const otherMembers = filteredMembers.filter(m => m.role !== 'developer_designer' && m.role !== 'sales_team');

  const copyOnboardingLink = (role: string) => {
    const url = `${window.location.origin}/admin?mode=register&role=${role}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(role);
    setTimeout(() => setCopiedLink(''), 2000);
  };

  const handleDelete = async (id: string) => {
    if (await confirmAction('Remove Team Member', 'Are you sure you want to remove this sales/team member? They will be removed from the team section and chat widget.')) {
      const updated = teamMembers.filter(m => m.id !== id);
      await updateSection('team_members', updated);
      await deleteSalesRep(id);
    }
  };

  const handleAddSalesMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSalesForm.fullName) return;

    const memberId = `sales_${Date.now()}`;
    const newMember: TeamMemberProfile = {
      id: memberId,
      userId: memberId,
      role: 'sales_team',
      fullName: newSalesForm.fullName,
      title: newSalesForm.title,
      bio: newSalesForm.bio,
      avatar: newSalesForm.avatar,
      createdAt: new Date().toISOString()
    };

    const updated = [...teamMembers, newMember];
    await updateSection('team_members', updated);

    // Sync to chat sales reps
    await addSalesRep({
      id: memberId,
      name: newSalesForm.fullName,
      email: newSalesForm.email || `${newSalesForm.fullName.toLowerCase().replace(/\s+/g, '.')}@profoxweb.com`,
      title: newSalesForm.title,
      avatar: newSalesForm.avatar,
      specialties: newSalesForm.specialties.split(',').map(s => s.trim()).filter(Boolean),
      rating: 5.0,
      reviewCount: 1,
      isOnline: true,
      bio: newSalesForm.bio
    });

    setShowAddSalesModal(false);
    setNewSalesForm({
      fullName: '',
      email: '',
      title: 'Sales Representative',
      bio: '',
      specialties: 'Web Packages, Custom Quotations',
      avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=250'
    });
  };

  const renderMemberCard = (member: TeamMemberProfile) => {
    const memberPortfolios = portfolioItems.filter(p => p.authorId === member.userId);
    const pendingCount = memberPortfolios.filter(p => p.status === 'pending').length;

    return (
      <div key={member.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 relative group">
        <ConfirmButton
          onClick={() => handleDelete(member.id)}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          title="Remove Member"
        >
          <Trash2 className="w-4 h-4" />
        </ConfirmButton>

        <div className="flex items-center gap-4 mb-6">
          <img 
            src={member.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop'} 
            alt={member.fullName}
            className="w-16 h-16 rounded-xl object-cover shadow-sm"
          />
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">{member.fullName}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{member.title}</p>
            <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {member.role.replace('_', ' ')}
            </div>
          </div>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-300 mb-6 line-clamp-3 h-16">
          {member.bio || 'No bio provided.'}
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <Briefcase className="w-4 h-4" />
              <span className="font-semibold text-slate-900 dark:text-white">{memberPortfolios.length}</span> Total
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                {pendingCount} Pending
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-[#000080] dark:text-blue-400" />
            Team Directory
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Manage your onboarded team members and invite new ones.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:border-[#000080] focus:ring-1 focus:ring-[#000080] outline-none transition-all dark:text-white w-64"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Design & Dev Column */}
        <div className="bg-white dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-700 gap-4">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              💻 Website Design & Development
            </h3>
            <div className="flex items-center gap-2">
              <input 
                type="email"
                placeholder="Enter email address..."
                value={inviteEmails.developer_designer}
                onChange={(e) => setInviteEmails(prev => ({ ...prev, developer_designer: e.target.value }))}
                className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-[#000080] dark:text-white w-48"
              />
              <ConfirmButton
                onClick={() => sendInviteEmail('developer_designer')}
                disabled={!inviteEmails.developer_designer}
                className="text-xs bg-[#000080] hover:bg-[#000066] text-white py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" /> Invite
              </ConfirmButton>
              <ConfirmButton
                onClick={() => copyOnboardingLink('developer_designer')}
                className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors font-medium border border-slate-200 dark:border-slate-700 cursor-pointer"
                title="Copy Invite Link"
              >
                {copiedLink === 'developer_designer' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </ConfirmButton>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {designMembers.length > 0 ? (
              designMembers.map(renderMemberCard)
            ) : (
              <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                No Design & Development team members yet.
              </div>
            )}
          </div>
        </div>
        
        {/* Sales Column */}
        <div className="bg-white dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-700 gap-4">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              📈 Sales Team
            </h3>
            <div className="flex items-center gap-2">
              <ConfirmButton
                onClick={() => setShowAddSalesModal(true)}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-3 rounded-lg flex items-center gap-1 transition-colors font-medium cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Sales Rep
              </ConfirmButton>
              <input 
                type="email"
                placeholder="Enter email address..."
                value={inviteEmails.sales_team}
                onChange={(e) => setInviteEmails(prev => ({ ...prev, sales_team: e.target.value }))}
                className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-[#000080] dark:text-white w-40"
              />
              <ConfirmButton
                onClick={() => sendInviteEmail('sales_team')}
                disabled={!inviteEmails.sales_team}
                className="text-xs bg-[#000080] hover:bg-[#000066] text-white py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" /> Invite
              </ConfirmButton>
              <ConfirmButton
                onClick={() => copyOnboardingLink('sales_team')}
                className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors font-medium border border-slate-200 dark:border-slate-700 cursor-pointer"
                title="Copy Invite Link"
              >
                {copiedLink === 'sales_team' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </ConfirmButton>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {salesMembers.length > 0 ? (
              salesMembers.map(renderMemberCard)
            ) : (
              <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                No Sales Team members yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {otherMembers.length > 0 && (
        <div className="mt-8 bg-white dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              Other Roles
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {otherMembers.map(renderMemberCard)}
          </div>
        </div>
      )}

      {/* Add Sales Rep Modal */}
      {showAddSalesModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" /> Add Sales Representative
              </h3>
              <ConfirmButton 
                onClick={() => setShowAddSalesModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </ConfirmButton>
            </div>

            <form onSubmit={handleAddSalesMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jordan Smith"
                  value={newSalesForm.fullName}
                  onChange={(e) => setNewSalesForm(prev => ({ ...prev, fullName: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-[#000080] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. jordan.sales@profoxweb.com"
                  value={newSalesForm.email}
                  onChange={(e) => setNewSalesForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-[#000080] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Title / Role
                </label>
                <input
                  type="text"
                  placeholder="e.g. Senior E-Commerce Consultant"
                  value={newSalesForm.title}
                  onChange={(e) => setNewSalesForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-[#000080] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Specialties (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shopify Packages, Enterprise Quotes, Custom Apps"
                  value={newSalesForm.specialties}
                  onChange={(e) => setNewSalesForm(prev => ({ ...prev, specialties: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-[#000080] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Avatar Photo URL
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={newSalesForm.avatar}
                  onChange={(e) => setNewSalesForm(prev => ({ ...prev, avatar: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-[#000080] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Short Bio
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief description of sales expertise..."
                  value={newSalesForm.bio}
                  onChange={(e) => setNewSalesForm(prev => ({ ...prev, bio: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-[#000080] dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <ConfirmButton
                  type="button"
                  onClick={() => setShowAddSalesModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </ConfirmButton>
                <ConfirmButton
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#000080] hover:bg-[#000066] text-white rounded-xl shadow-md transition-all"
                >
                  Create Sales Member
                </ConfirmButton>
              </div>
            </form>
          </div>
        </div>
      )}

      
    </div>
  );
}
