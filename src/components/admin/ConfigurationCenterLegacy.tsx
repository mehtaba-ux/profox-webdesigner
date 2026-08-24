import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  DollarSign, 
  Users, 
  GraduationCap, 
  Briefcase, 
  Globe, 
  History, 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  Check, 
  AlertCircle, 
  Shield, 
  Lock, 
  HelpCircle, 
  Sparkles, 
  Layers, 
  Search, 
  ArrowUpDown, 
  FileText, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Eye,
  Sliders,
  Send,
  BookOpen,
  Award
} from 'lucide-react';
import { 
  configService, 
  CompanySettingsConfig, 
  DepartmentConfig, 
  RoleDisplayConfig, 
  CarePlanConfig, 
  PaymentScheduleConfig, 
  FollowUpCadenceConfig, 
  RecruitmentStageConfig, 
  ProjectStageConfig, 
  TaskStatusConfig, 
  TaskPriorityConfig, 
  ClientPortalConfig,
  AuditLogEntry
} from '../../lib/configService';
import { NichePlaybook, OutreachTemplate, ProductQuizQuestion } from '../../data/defaultTraining';
import { trainingService, TrainingModule } from '../../lib/trainingService';
import { salesService } from '../../lib/salesService';
import { commissionService } from '../../lib/commissionService';
import { SalesProduct, CommissionRule, CommissionSettingsConfig } from '../../types';
import { useAuth } from '../../lib/AuthContext';

type ConfigCategory = 'business' | 'sales' | 'recruitment' | 'training' | 'delivery' | 'client_experience' | 'audit_logs';

export default function ConfigurationCenter() {
  const { user, profile } = useAuth();
  const userEmail = profile?.email || user?.email || 'admin@profox.example.com';

  const [activeCategory, setActiveCategory] = useState<ConfigCategory>('business');
  const [activeSubTab, setActiveSubTab] = useState<string>('company');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 5000);
    } else {
      setSaveSuccessMsg(msg);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  };

  return (
    <div className="space-y-6 pb-20 font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#000080] via-[#000066] to-[#0A1128] rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-blue-400/20 text-blue-300 border border-blue-400/30 text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-blue-300" /> Admin Configuration Center
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" /> Security Protected
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Dynamic Business Configuration & Settings
            </h1>
            <p className="text-blue-200/80 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Safely customize sales packages, pricing schedules, training curricula, niche playbooks, outreach cadences, and system labels without code modifications.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 px-4 py-3 rounded-xl shrink-0">
            <Sliders className="w-5 h-5 text-blue-300" />
            <div className="text-left text-xs">
              <div className="font-bold text-white">Live System Engine</div>
              <div className="text-blue-200 text-[10px]">Zero Downtime Updates</div>
            </div>
          </div>
        </div>

        {/* Global Notifications */}
        {saveSuccessMsg && (
          <div className="mt-4 flex items-center gap-2 bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 bg-rose-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Main Category Navigation Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          { id: 'business', label: 'Business & Roles', icon: Building2, defaultSub: 'company' },
          { id: 'sales', label: 'Sales & Pricing', icon: DollarSign, defaultSub: 'packages' },
          { id: 'recruitment', label: 'Recruitment', icon: Users, defaultSub: 'stages' },
          { id: 'training', label: 'Sales Academy', icon: GraduationCap, defaultSub: 'modules' },
          { id: 'delivery', label: 'Delivery & Stages', icon: Briefcase, defaultSub: 'project_stages' },
          { id: 'client_experience', label: 'Client Portal', icon: Globe, defaultSub: 'portal' },
          { id: 'audit_logs', label: 'Audit History', icon: History, defaultSub: 'audit' }
        ].map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id as ConfigCategory);
                setActiveSubTab(cat.defaultSub);
              }}
              className={`p-3 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-2 transition-all border cursor-pointer ${
                isActive
                  ? 'bg-[#000080] text-white border-[#000080] shadow-md shadow-blue-900/20'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span className="text-center truncate w-full">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Category Body Area */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        {activeCategory === 'business' && (
          <BusinessConfigSection 
            subTab={activeSubTab} 
            setSubTab={setActiveSubTab} 
            userEmail={userEmail} 
            onNotify={showNotification} 
          />
        )}

        {activeCategory === 'sales' && (
          <SalesConfigSection 
            subTab={activeSubTab} 
            setSubTab={setActiveSubTab} 
            userEmail={userEmail} 
            onNotify={showNotification} 
          />
        )}

        {activeCategory === 'recruitment' && (
          <RecruitmentConfigSection 
            subTab={activeSubTab} 
            setSubTab={setActiveSubTab} 
            userEmail={userEmail} 
            onNotify={showNotification} 
          />
        )}

        {activeCategory === 'training' && (
          <TrainingConfigSection 
            subTab={activeSubTab} 
            setSubTab={setActiveSubTab} 
            userEmail={userEmail} 
            onNotify={showNotification} 
          />
        )}

        {activeCategory === 'delivery' && (
          <DeliveryConfigSection 
            subTab={activeSubTab} 
            setSubTab={setActiveSubTab} 
            userEmail={userEmail} 
            onNotify={showNotification} 
          />
        )}

        {activeCategory === 'client_experience' && (
          <ClientExperienceConfigSection 
            userEmail={userEmail} 
            onNotify={showNotification} 
          />
        )}

        {activeCategory === 'audit_logs' && (
          <AuditHistorySection 
            onNotify={showNotification} 
          />
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 1. BUSINESS & ROLES CONFIGURATION
// ----------------------------------------------------
function BusinessConfigSection({
  subTab,
  setSubTab,
  userEmail,
  onNotify
}: {
  subTab: string;
  setSubTab: (t: string) => void;
  userEmail: string;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const [companyForm, setCompanyForm] = useState<CompanySettingsConfig>(configService.getCompanySettings());
  const [departments, setDepartments] = useState<DepartmentConfig[]>(configService.getDepartments(true));
  const [roles, setRoles] = useState<RoleDisplayConfig[]>(configService.getRoleLabels());

  // Department Modal State
  const [editingDep, setEditingDep] = useState<DepartmentConfig | null>(null);
  const [isDepModalOpen, setIsDepModalOpen] = useState(false);

  // Role Edit State
  const [editingRole, setEditingRole] = useState<RoleDisplayConfig | null>(null);

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      configService.updateCompanySettings(companyForm, userEmail);
      onNotify('Company Profile and operational settings updated successfully!');
    } catch (err: any) {
      onNotify(err.message || 'Failed to update company settings', true);
    }
  };

  const handleSaveDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDep) return;
    try {
      configService.saveDepartment(editingDep, userEmail);
      setDepartments(configService.getDepartments(true));
      setIsDepModalOpen(false);
      setEditingDep(null);
      onNotify(`Department "${editingDep.name}" saved successfully!`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to save department', true);
    }
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    try {
      configService.updateRoleLabel(editingRole.roleKey, editingRole, userEmail);
      setRoles(configService.getRoleLabels());
      setEditingRole(null);
      onNotify(`Role display label for "${editingRole.roleKey}" updated successfully!`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update role label', true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 gap-6 pb-2">
        <button
          onClick={() => setSubTab('company')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'company' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Company Profile & Info
        </button>
        <button
          onClick={() => setSubTab('departments')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'departments' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Departments & Divisions ({departments.length})
        </button>
        <button
          onClick={() => setSubTab('roles')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'roles' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Role Display Labels ({roles.length})
        </button>
      </div>

      {/* Subtab: Company Profile */}
      {subTab === 'company' && (
        <form onSubmit={handleSaveCompany} className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Company & Brand Profile</h3>
              <p className="text-xs text-slate-500">Manage legal, contact, and operational identifiers</p>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#000080] hover:bg-[#000066] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" /> Save Company Settings
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Business Name</label>
              <input
                type="text"
                value={companyForm.businessName}
                onChange={(e) => setCompanyForm({ ...companyForm, businessName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-medium focus:border-[#000080] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Legal Registered Entity</label>
              <input
                type="text"
                value={companyForm.legalEntity}
                onChange={(e) => setCompanyForm({ ...companyForm, legalEntity: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-medium focus:border-[#000080] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Official Website URL</label>
              <input
                type="text"
                value={companyForm.website}
                onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-medium focus:border-[#000080] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Primary Contact Email</label>
              <input
                type="email"
                value={companyForm.contactEmail}
                onChange={(e) => setCompanyForm({ ...companyForm, contactEmail: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-medium focus:border-[#000080] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Contact Phone</label>
              <input
                type="text"
                value={companyForm.contactPhone}
                onChange={(e) => setCompanyForm({ ...companyForm, contactPhone: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-medium focus:border-[#000080] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Security & Abuse Contact</label>
              <input
                type="email"
                value={companyForm.securityContact}
                onChange={(e) => setCompanyForm({ ...companyForm, securityContact: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-medium focus:border-[#000080] focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Business Office Address</label>
              <input
                type="text"
                value={companyForm.businessAddress}
                onChange={(e) => setCompanyForm({ ...companyForm, businessAddress: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-medium focus:border-[#000080] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Standard Currency</label>
              <input
                type="text"
                value={companyForm.currency}
                onChange={(e) => setCompanyForm({ ...companyForm, currency: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-medium focus:border-[#000080] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">VAT / Tax ID Number</label>
              <input
                type="text"
                value={companyForm.vatTaxNumber}
                onChange={(e) => setCompanyForm({ ...companyForm, vatTaxNumber: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-medium focus:border-[#000080] focus:outline-none"
              />
            </div>
          </div>
        </form>
      )}

      {/* Subtab: Departments */}
      {subTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Organizational Departments</h3>
              <p className="text-xs text-slate-500">Configure team departments, responsibilities, and routing</p>
            </div>
            <button
              onClick={() => {
                setEditingDep({
                  id: `dep_${Date.now()}`,
                  code: '',
                  name: '',
                  description: '',
                  sortOrder: departments.length + 1,
                  active: true
                });
                setIsDepModalOpen(true);
              }}
              className="px-3.5 py-2 bg-[#000080] hover:bg-[#000066] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Department
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {departments.map((d) => (
              <div key={d.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900">{d.name}</span>
                    <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                      code: {d.code}
                    </span>
                    {!d.active && (
                      <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{d.description || 'No description provided.'}</p>
                </div>
                <button
                  onClick={() => {
                    setEditingDep(d);
                    setIsDepModalOpen(true);
                  }}
                  className="p-1.5 text-slate-400 hover:text-[#000080] hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-200 cursor-pointer"
                  title="Edit Department"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Department Edit Modal */}
          {isDepModalOpen && editingDep && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">
                    {editingDep.code ? 'Edit Department' : 'Create New Department'}
                  </h4>
                  <button onClick={() => setIsDepModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveDepartment} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Department Name</label>
                    <input
                      type="text"
                      required
                      value={editingDep.name}
                      onChange={(e) => setEditingDep({ ...editingDep, name: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">System Code</label>
                    <input
                      type="text"
                      required
                      value={editingDep.code}
                      onChange={(e) => setEditingDep({ ...editingDep, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={editingDep.description}
                      onChange={(e) => setEditingDep({ ...editingDep, description: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingDep.active}
                        onChange={(e) => setEditingDep({ ...editingDep, active: e.target.checked })}
                        className="rounded text-[#000080]"
                      />
                      Active Department
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsDepModalOpen(false)}
                        className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab: Role Display Labels */}
      {subTab === 'roles' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-3">
            <Shield className="w-5 h-5 text-[#000080] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 space-y-1">
              <span className="font-bold text-[#000080] block">Immutable Key vs. Custom Admin Display Label</span>
              <p>
                To safeguard application security and Row Level Security (RLS) policies, internal system permission keys (e.g. <code className="font-mono font-bold">admin</code>, <code className="font-mono font-bold">sales</code>, <code className="font-mono font-bold">developer</code>) are immutable. However, you can freely customize their human-readable title and assigned department across all staff views.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {roles.map((r) => (
              <div key={r.roleKey} className="p-4 bg-white hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900">{r.displayLabel}</span>
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                      key: {r.roleKey}
                    </span>
                    <span className="text-[10px] bg-blue-50 text-[#000080] px-1.5 py-0.5 rounded font-bold">
                      {r.department}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{r.description}</p>
                </div>
                <button
                  onClick={() => setEditingRole(r)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-[#000080] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Label
                </button>
              </div>
            ))}
          </div>

          {/* Role Edit Modal */}
          {editingRole && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">
                    Edit Display Label for Role: <span className="font-mono text-[#000080]">{editingRole.roleKey}</span>
                  </h4>
                  <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveRole} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Human-Visible Title</label>
                    <input
                      type="text"
                      required
                      value={editingRole.displayLabel}
                      onChange={(e) => setEditingRole({ ...editingRole, displayLabel: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Department</label>
                    <input
                      type="text"
                      value={editingRole.department}
                      onChange={(e) => setEditingRole({ ...editingRole, department: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={editingRole.description}
                      onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingRole(null)}
                      className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                    >
                      Save Label
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 2. SALES & PRICING CONFIGURATION
// ----------------------------------------------------
function SalesConfigSection({
  subTab,
  setSubTab,
  userEmail,
  onNotify
}: {
  subTab: string;
  setSubTab: (t: string) => void;
  userEmail: string;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const [carePlans, setCarePlans] = useState<CarePlanConfig[]>(configService.getCarePlans(true));
  const [schedules, setSchedules] = useState<PaymentScheduleConfig[]>(configService.getPaymentSchedules());
  const [cadence, setCadence] = useState<FollowUpCadenceConfig>(configService.getCadence());
  const [templates, setTemplates] = useState<OutreachTemplate[]>(configService.getOutreachTemplates());
  const [leadSources, setLeadSources] = useState<string[]>(configService.getLeadSources());
  const [lostReasons, setLostReasons] = useState<string[]>(configService.getLostReasons());

  // Commission Configuration State
  const [commissionSettings, setCommissionSettings] = useState<CommissionSettingsConfig>(commissionService.getSettings());
  const [commissionRules, setCommissionRules] = useState<CommissionRule[]>(commissionService.getRules());
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);

  // Editing state for Care Plan
  const [editingCarePlan, setEditingCarePlan] = useState<CarePlanConfig | null>(null);

  // Editing state for Payment Schedule
  const [editingSchedule, setEditingSchedule] = useState<PaymentScheduleConfig | null>(null);

  // Editing state for Outreach Template
  const [editingTemplate, setEditingTemplate] = useState<OutreachTemplate | null>(null);

  // New item inputs
  const [newSourceInput, setNewSourceInput] = useState('');
  const [newLostReasonInput, setNewLostReasonInput] = useState('');

  const handleSaveCarePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCarePlan) return;
    try {
      configService.saveCarePlan(editingCarePlan, userEmail);
      setCarePlans(configService.getCarePlans(true));
      setEditingCarePlan(null);
      onNotify(`Care Plan "${editingCarePlan.name}" updated successfully!`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to save care plan', true);
    }
  };

  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;
    const res = configService.savePaymentSchedule(editingSchedule, userEmail);
    if (!res.success) {
      onNotify(res.message || 'Invalid milestone schedule', true);
      return;
    }
    setSchedules(configService.getPaymentSchedules());
    setEditingSchedule(null);
    onNotify(`Payment Schedule for "${editingSchedule.packageName}" validated and saved!`);
  };

  const handleSaveCadence = (e: React.FormEvent) => {
    e.preventDefault();
    const res = configService.saveCadence(cadence, userEmail);
    if (!res.success) {
      onNotify(res.message || 'Invalid cadence setup', true);
      return;
    }
    onNotify('Outreach Cadence updated successfully!');
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    configService.saveOutreachTemplate(editingTemplate, userEmail);
    setTemplates(configService.getOutreachTemplates());
    setEditingTemplate(null);
    onNotify(`Outreach Template "${editingTemplate.title}" saved successfully!`);
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 gap-6 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSubTab('packages')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            subTab === 'packages' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Care Plans & Retainers ({carePlans.length})
        </button>
        <button
          onClick={() => setSubTab('schedules')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            subTab === 'schedules' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Payment Schedules & 100% Rules ({schedules.length})
        </button>
        <button
          onClick={() => setSubTab('cadence')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            subTab === 'cadence' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Follow-Up Cadence ({cadence.steps.length} Steps)
        </button>
        <button
          onClick={() => setSubTab('templates')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            subTab === 'templates' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Sales Scripts & Templates ({templates.length})
        </button>
        <button
          onClick={() => setSubTab('sources_lost')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            subTab === 'sources_lost' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Lead Sources & Lost Reasons
        </button>
        <button
          onClick={() => setSubTab('commissions')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            subTab === 'commissions' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          Commission Rules & Rates ({commissionRules.length})
        </button>
      </div>

      {/* Subtab: Care Plans */}
      {subTab === 'packages' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Post-Launch Care Plans</h3>
              <p className="text-xs text-slate-500">Configure canonical support tiers: ProFox Care ($99/mo), Growth Care ($249/mo), Priority Care ($499/mo)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {carePlans.map((cp) => (
              <div key={cp.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-[#000080] rounded border border-blue-200">
                      {cp.badge}
                    </span>
                    <span className="text-lg font-black text-slate-900">${cp.price}{cp.period}</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">{cp.name}</h4>
                  <p className="text-xs text-slate-600">{cp.description}</p>
                  
                  <div className="pt-2 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Features</span>
                    {cp.features?.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setEditingCarePlan(cp)}
                  className="w-full py-2 bg-white hover:bg-[#000080] hover:text-white text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Care Plan
                </button>
              </div>
            ))}
          </div>

          {/* Care Plan Modal */}
          {editingCarePlan && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">Edit Care Plan: {editingCarePlan.name}</h4>
                  <button onClick={() => setEditingCarePlan(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveCarePlan} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Plan Name</label>
                      <input
                        type="text"
                        required
                        value={editingCarePlan.name}
                        onChange={(e) => setEditingCarePlan({ ...editingCarePlan, name: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Monthly Price ($)</label>
                      <input
                        type="number"
                        required
                        value={editingCarePlan.price}
                        onChange={(e) => setEditingCarePlan({ ...editingCarePlan, price: Number(e.target.value) })}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Badge Title</label>
                    <input
                      type="text"
                      value={editingCarePlan.badge}
                      onChange={(e) => setEditingCarePlan({ ...editingCarePlan, badge: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={editingCarePlan.description}
                      onChange={(e) => setEditingCarePlan({ ...editingCarePlan, description: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Features (One per line)</label>
                    <textarea
                      rows={4}
                      value={editingCarePlan.features?.join('\n')}
                      onChange={(e) => setEditingCarePlan({ ...editingCarePlan, features: e.target.value.split('\n').filter(Boolean) })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingCarePlan(null)}
                      className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                    >
                      Save Plan
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab: Payment Schedules */}
      {subTab === 'schedules' && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 space-y-1">
              <span className="font-bold text-emerald-800 block">Strict 100% Milestone Sum Validation</span>
              <p>
                All percentage-based payment schedules must total exactly 100%. Future default schedule edits automatically apply to newly generated proposals without rewriting historical quotation snapshots.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {schedules.map((s) => {
              const sum = s.milestones.reduce((acc, m) => acc + (Number(m.percentage) || 0), 0);
              return (
                <div key={s.id} className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-[#000080]/30 transition-all space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{s.packageName}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono ${sum === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          Total: {sum}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{s.description}</p>
                    </div>
                    <button
                      onClick={() => setEditingSchedule(JSON.parse(JSON.stringify(s)))}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-[#000080] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Milestones
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                    {s.milestones.map((m, idx) => (
                      <div key={m.id || idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Stage #{idx + 1}</span>
                          <span className="text-xs font-black text-[#000080] bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                            {m.percentage}%
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 leading-snug">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payment Schedule Modal */}
          {editingSchedule && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">
                    Configure Milestones: {editingSchedule.packageName}
                  </h4>
                  <button onClick={() => setEditingSchedule(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveSchedule} className="space-y-4">
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {editingSchedule.milestones.map((m, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-8">
                          <label className="block text-[9px] font-bold text-slate-400 uppercase">Milestone #{idx + 1} Label</label>
                          <input
                            type="text"
                            required
                            value={m.label}
                            onChange={(e) => {
                              const copy = [...editingSchedule.milestones];
                              copy[idx].label = e.target.value;
                              setEditingSchedule({ ...editingSchedule, milestones: copy });
                            }}
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-bold"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[9px] font-bold text-slate-400 uppercase">Percent (%)</label>
                          <input
                            type="number"
                            required
                            min="1"
                            max="100"
                            value={m.percentage}
                            onChange={(e) => {
                              const copy = [...editingSchedule.milestones];
                              copy[idx].percentage = Number(e.target.value);
                              setEditingSchedule({ ...editingSchedule, milestones: copy });
                            }}
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-black text-center"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (editingSchedule.milestones.length <= 1) return;
                              const copy = editingSchedule.milestones.filter((_, i) => i !== idx);
                              setEditingSchedule({ ...editingSchedule, milestones: copy });
                            }}
                            className="text-slate-300 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        const copy = [...editingSchedule.milestones];
                        copy.push({
                          id: `m_${Date.now()}`,
                          label: 'Next Milestone',
                          percentage: 0,
                          stageKey: 'stage',
                          requiresVerification: true
                        });
                        setEditingSchedule({ ...editingSchedule, milestones: copy });
                      }}
                      className="text-xs font-bold text-[#000080] flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Milestone
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">
                        Total:{' '}
                        <span className={`font-mono ${editingSchedule.milestones.reduce((s, m) => s + (Number(m.percentage) || 0), 0) === 100 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}`}>
                          {editingSchedule.milestones.reduce((s, m) => s + (Number(m.percentage) || 0), 0)}%
                        </span>
                      </span>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                      >
                        Save Schedule
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab: Follow-Up Cadence */}
      {subTab === 'cadence' && (
        <form onSubmit={handleSaveCadence} className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">{cadence.name}</h3>
              <p className="text-xs text-slate-500">Configure sequential outreach touchpoints (Day 1, 2, 3, 6, 9)</p>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#000080] hover:bg-[#000066] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" /> Save Outreach Cadence
            </button>
          </div>

          <div className="space-y-3">
            {cadence.steps.map((step, idx) => (
              <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Outreach Day</label>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs font-bold text-slate-600">Day</span>
                    <input
                      type="number"
                      required
                      min="1"
                      value={step.day}
                      onChange={(e) => {
                        const copy = [...cadence.steps];
                        copy[idx].day = Number(e.target.value);
                        setCadence({ ...cadence, steps: copy });
                      }}
                      className="w-16 bg-white border border-slate-200 rounded p-1.5 text-xs font-black text-center"
                    />
                  </div>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Channel</label>
                  <select
                    value={step.channel}
                    onChange={(e) => {
                      const copy = [...cadence.steps];
                      copy[idx].channel = e.target.value as any;
                      setCadence({ ...cadence, steps: copy });
                    }}
                    className="w-full mt-1 bg-white border border-slate-200 rounded p-1.5 text-xs font-bold text-slate-800"
                  >
                    <option value="Multi-Channel">Multi-Channel (Loom + Email)</option>
                    <option value="Email">Email</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Loom">Loom Video</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="WhatsApp">WhatsApp</option>
                  </select>
                </div>

                <div className="md:col-span-6">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Step Label & Strategy</label>
                  <input
                    type="text"
                    required
                    value={step.label}
                    onChange={(e) => {
                      const copy = [...cadence.steps];
                      copy[idx].label = e.target.value;
                      setCadence({ ...cadence, steps: copy });
                    }}
                    className="w-full mt-1 bg-white border border-slate-200 rounded p-1.5 text-xs font-medium text-slate-900"
                  />
                </div>

                <div className="md:col-span-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (cadence.steps.length <= 1) return;
                      const copy = cadence.steps.filter((_, i) => i !== idx);
                      setCadence({ ...cadence, steps: copy });
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                    title="Remove Step"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const lastDay = cadence.steps[cadence.steps.length - 1]?.day || 9;
              setCadence({
                ...cadence,
                steps: [
                  ...cadence.steps,
                  {
                    stepNumber: cadence.steps.length + 1,
                    day: lastDay + 3,
                    label: 'Follow-Up Touchpoint',
                    channel: 'Email',
                    description: 'Scheduled follow-up email.'
                  }
                ]
              });
            }}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add Cadence Touchpoint
          </button>
        </form>
      )}

      {/* Subtab: Sales Scripts & Templates */}
      {subTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Sales Outreach & Messaging Templates</h3>
              <p className="text-xs text-slate-500">Manage cold emails, Loom video intros, LinkedIn teasers, and payment follow-ups</p>
            </div>
            <button
              onClick={() => setEditingTemplate({
                id: `tmpl_${Date.now()}`,
                category: 'cold_email',
                title: 'New Outreach Template',
                subject: '',
                body: '',
                variables: ['first_name', 'company_name', 'salesperson_name']
              })}
              className="px-3.5 py-2 bg-[#000080] hover:bg-[#000066] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Template
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((t) => (
              <div key={t.id} className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-[#000080]/30 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded uppercase font-mono">
                      {t.category.replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => setEditingTemplate(JSON.parse(JSON.stringify(t)))}
                      className="text-slate-400 hover:text-[#000080] p-1 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">{t.title}</h4>
                  {t.subject && (
                    <div className="text-xs text-slate-500 font-medium">
                      <span className="font-bold text-slate-700">Subject:</span> {t.subject}
                    </div>
                  )}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-700 font-mono line-clamp-3 whitespace-pre-wrap">
                    {t.body}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 pt-1">
                  {t.variables?.map((v) => (
                    <span key={v} className="text-[9px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Template Edit Modal */}
          {editingTemplate && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">Edit Template: {editingTemplate.title}</h4>
                  <button onClick={() => setEditingTemplate(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveTemplate} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Title</label>
                      <input
                        type="text"
                        required
                        value={editingTemplate.title}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Category</label>
                      <select
                        value={editingTemplate.category}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value as any })}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                      >
                        <option value="cold_email">Cold Email</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="followup">Follow-Up</option>
                        <option value="loom_intro">Loom Video Intro</option>
                        <option value="meeting_request">Meeting Request</option>
                        <option value="quote_followup">Quotation Follow-Up</option>
                        <option value="payment_followup">Payment Follow-Up</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email Subject (Optional)</label>
                    <input
                      type="text"
                      value={editingTemplate.subject || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Template Content</label>
                    <textarea
                      rows={8}
                      required
                      value={editingTemplate.body}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-3 text-xs font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingTemplate(null)}
                      className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                    >
                      Save Template
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab: Lead Sources & Lost Reasons */}
      {subTab === 'sources_lost' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Lead Sources */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
            <div>
              <h4 className="font-bold text-sm text-slate-900">Configured Lead Sources</h4>
              <p className="text-xs text-slate-500">Options available in CRM lead creation & capture forms</p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. YouTube Ad"
                value={newSourceInput}
                onChange={(e) => setNewSourceInput(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newSourceInput.trim()) return;
                  const updated = [...leadSources, newSourceInput.trim()];
                  configService.saveLeadSources(updated, userEmail);
                  setLeadSources(updated);
                  setNewSourceInput('');
                  onNotify(`Lead source "${newSourceInput}" added.`);
                }}
                className="px-3 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg"
              >
                Add
              </button>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {leadSources.map((src, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-800">
                  <span>{src}</span>
                  <button
                    onClick={() => {
                      const updated = leadSources.filter((_, idx) => idx !== i);
                      configService.saveLeadSources(updated, userEmail);
                      setLeadSources(updated);
                      onNotify(`Lead source removed.`);
                    }}
                    className="text-slate-300 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Lost Reasons */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
            <div>
              <h4 className="font-bold text-sm text-slate-900">Opportunity Lost Reasons</h4>
              <p className="text-xs text-slate-500">Categorization options when an opportunity is marked as Lost</p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Technology Stack Incompatibility"
                value={newLostReasonInput}
                onChange={(e) => setNewLostReasonInput(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newLostReasonInput.trim()) return;
                  const updated = [...lostReasons, newLostReasonInput.trim()];
                  configService.saveLostReasons(updated, userEmail);
                  setLostReasons(updated);
                  setNewLostReasonInput('');
                  onNotify(`Lost reason added.`);
                }}
                className="px-3 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg"
              >
                Add
              </button>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {lostReasons.map((reason, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-800">
                  <span>{reason}</span>
                  <button
                    onClick={() => {
                      const updated = lostReasons.filter((_, idx) => idx !== i);
                      configService.saveLostReasons(updated, userEmail);
                      setLostReasons(updated);
                      onNotify(`Lost reason removed.`);
                    }}
                    className="text-slate-300 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Subtab: Commission Rules & Acceleration Rates */}
      {subTab === 'commissions' && (
        <div className="space-y-8">
          {/* Top Banner with Canonical Rules */}
          <div className="p-5 bg-gradient-to-r from-blue-900 to-[#000080] rounded-2xl text-white space-y-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="bg-blue-400/20 text-blue-200 border border-blue-400/30 text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Shield className="w-3 h-3" /> Core Operational Policy
              </span>
              <span className="bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" /> Verified Payments Only
              </span>
            </div>
            <h4 className="text-base font-black">Automated Sales Commission Engine Rules</h4>
            <p className="text-xs text-blue-200/90 leading-relaxed max-w-3xl">
              Commissions are automatically accrued ONLY when customer payments are verified and cleared. Base rates apply by package tier, with standardized accelerators for self-generated deals (+5%) and monthly closing volume (+2% from 11th sale onward).
            </p>
          </div>

          {/* General Accelerator Rules & Schedule Settings Form */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900">Commission Accelerators & Payout Policy</h4>
                <p className="text-xs text-slate-500">Configure system-wide bonus percentage points and payout cycle rules</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  commissionService.updateSettings(commissionSettings, userEmail);
                  onNotify('Global commission accelerator settings updated successfully!');
                }}
                className="px-4 py-2 bg-[#000080] hover:bg-blue-900 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save Global Settings
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Self-Generated Bonus (+%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="20"
                    value={commissionSettings.selfGeneratedBonusPercent}
                    onChange={(e) => setCommissionSettings({
                      ...commissionSettings,
                      selfGeneratedBonusPercent: parseFloat(e.target.value) || 0
                    })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                  <span className="text-xs font-bold text-slate-600">% pts</span>
                </div>
                <p className="text-[10px] text-slate-400">Added to base rate when sales rep sources the opportunity.</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Performance Bonus Threshold</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={commissionSettings.performanceBonusThreshold}
                    onChange={(e) => setCommissionSettings({
                      ...commissionSettings,
                      performanceBonusThreshold: parseInt(e.target.value) || 10
                    })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                  <span className="text-xs font-bold text-slate-600">sales</span>
                </div>
                <p className="text-[10px] text-slate-400">Sales required in month before accelerator triggers (11th+ sale).</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Performance Bonus (+%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={commissionSettings.performanceBonusPercent}
                    onChange={(e) => setCommissionSettings({
                      ...commissionSettings,
                      performanceBonusPercent: parseFloat(e.target.value) || 0
                    })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                  <span className="text-xs font-bold text-slate-600">% pts</span>
                </div>
                <p className="text-[10px] text-slate-400">Extra percentage point bonus on 11th and subsequent sales.</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Custom Deal Range (%)</label>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <input
                    type="number"
                    step="0.5"
                    value={commissionSettings.customDealMinRate}
                    onChange={(e) => setCommissionSettings({
                      ...commissionSettings,
                      customDealMinRate: parseFloat(e.target.value) || 10
                    })}
                    className="w-16 border border-slate-200 rounded-lg p-1.5 text-center text-xs font-bold"
                  />
                  <span>% to</span>
                  <input
                    type="number"
                    step="0.5"
                    value={commissionSettings.customDealMaxRate}
                    onChange={(e) => setCommissionSettings({
                      ...commissionSettings,
                      customDealMaxRate: parseFloat(e.target.value) || 15
                    })}
                    className="w-16 border border-slate-200 rounded-lg p-1.5 text-center text-xs font-bold"
                  />
                  <span>%</span>
                </div>
                <p className="text-[10px] text-slate-400">Allowed range for admin-approved custom enterprise quotes.</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Official Payout Cycle & Schedule Policy</label>
              <input
                type="text"
                value={commissionSettings.payoutScheduleDescription}
                onChange={(e) => setCommissionSettings({
                  ...commissionSettings,
                  payoutScheduleDescription: e.target.value
                })}
                className="w-full border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-800"
              />
              <p className="text-[10px] text-slate-400">Displayed in sales representatives' commission dashboards and financial statements.</p>
            </div>
          </div>

          {/* Package Commission Rules Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">Package Base Commission Rules</h4>
                <p className="text-xs text-slate-500">Default base percentage rate applied upon cleared milestone payments</p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Package Code</th>
                    <th className="py-3 px-4">Package Name</th>
                    <th className="py-3 px-4 text-center">Base Commission Rate</th>
                    <th className="py-3 px-4 text-center">Self-Gen Total</th>
                    <th className="py-3 px-4 text-center">11th+ Sale Total</th>
                    <th className="py-3 px-4 text-center">Approval Req.</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {commissionRules.map((rule) => {
                    const selfGenTotal = ((rule.baseRatePercent || 0) + (commissionSettings.selfGeneratedBonusPercent || 0)).toFixed(1);
                    const perfTotal = ((rule.baseRatePercent || 0) + (commissionSettings.performanceBonusPercent || 0)).toFixed(1);
                    return (
                      <tr key={rule.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">{rule.packageCode}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{rule.packageName}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-black text-sm text-[#000080] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                            {rule.baseRatePercent}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-emerald-700">
                          {selfGenTotal}%
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-purple-700">
                          {perfTotal}%
                        </td>
                        <td className="py-3 px-4 text-center">
                          {rule.requiresAdminApproval ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              Deal Review
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600">
                              Automated
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingRule({ ...rule })}
                            className="px-3 py-1 bg-slate-100 hover:bg-[#000080] hover:text-white text-slate-700 font-bold text-xs rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edit Package Rule Modal */}
          {editingRule && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">
                    Edit Commission Rule: <span className="text-[#000080]">{editingRule.packageName}</span>
                  </h4>
                  <button onClick={() => setEditingRule(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Base Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="50"
                      value={editingRule.baseRatePercent}
                      onChange={(e) => setEditingRule({
                        ...editingRule,
                        baseRatePercent: parseFloat(e.target.value) || 0
                      })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rule Notes / Description</label>
                    <textarea
                      rows={2}
                      value={editingRule.description || ''}
                      onChange={(e) => setEditingRule({
                        ...editingRule,
                        description: e.target.value
                      })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingRule.requiresAdminApproval}
                        onChange={(e) => setEditingRule({
                          ...editingRule,
                          requiresAdminApproval: e.target.checked
                        })}
                        className="rounded text-[#000080]"
                      />
                      Requires Manual Admin Deal Review
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingRule(null)}
                    className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      commissionService.saveRule(editingRule, userEmail);
                      setCommissionRules(commissionService.getRules());
                      setEditingRule(null);
                      onNotify(`Commission rule for "${editingRule.packageName}" updated!`);
                    }}
                    className="px-4 py-1.5 bg-[#000080] hover:bg-blue-900 text-white text-xs font-bold rounded-lg shadow cursor-pointer"
                  >
                    Save Rule
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 3. RECRUITMENT CONFIGURATION
// ----------------------------------------------------
function RecruitmentConfigSection({
  subTab,
  setSubTab,
  userEmail,
  onNotify
}: {
  subTab: string;
  setSubTab: (t: string) => void;
  userEmail: string;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const [stages, setStages] = useState<RecruitmentStageConfig[]>(configService.getRecruitmentStages(true));
  const [refusalReasons, setRefusalReasons] = useState<string[]>(configService.getRefusalReasons());
  const [newReasonInput, setNewReasonInput] = useState('');
  const [editingStage, setEditingStage] = useState<RecruitmentStageConfig | null>(null);

  const handleSaveStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStage) return;
    configService.updateRecruitmentStage(editingStage.stageKey, editingStage, userEmail);
    setStages(configService.getRecruitmentStages(true));
    setEditingStage(null);
    onNotify(`Recruitment stage label for "${editingStage.stageKey}" updated.`);
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 gap-6 pb-2">
        <button
          onClick={() => setSubTab('stages')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'stages' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Recruitment Stages ({stages.length})
        </button>
        <button
          onClick={() => setSubTab('refusals')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'refusals' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Refusal Reasons ({refusalReasons.length})
        </button>
      </div>

      {subTab === 'stages' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 space-y-1">
              <span className="font-bold text-amber-800 block">Protected Gating Architecture</span>
              <p>
                The Agreement Gate (<code className="font-mono font-bold">Agreement Signed</code>) and Activation Gate (<code className="font-mono font-bold">Activated</code>) are protected logic gates. You can customize the human display label and description, while underlying access control remains securely locked.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {stages.map((st) => (
              <div key={st.stageKey} className="p-4 bg-white hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] flex items-center justify-center font-bold">
                      {st.sortOrder}
                    </span>
                    <span className="font-bold text-xs text-slate-900">{st.displayLabel}</span>
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                      key: {st.stageKey}
                    </span>
                    {st.isGated && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Security Gated
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{st.description}</p>
                </div>
                <button
                  onClick={() => setEditingStage(st)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-[#000080] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Stage
                </button>
              </div>
            ))}
          </div>

          {editingStage && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">
                    Edit Stage: <span className="font-mono text-[#000080]">{editingStage.stageKey}</span>
                  </h4>
                  <button onClick={() => setEditingStage(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveStage} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Display Label</label>
                    <input
                      type="text"
                      required
                      value={editingStage.displayLabel}
                      onChange={(e) => setEditingStage({ ...editingStage, displayLabel: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={editingStage.description}
                      onChange={(e) => setEditingStage({ ...editingStage, description: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingStage(null)}
                      className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                    >
                      Save Stage
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'refusals' && (
        <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
          <div>
            <h4 className="font-bold text-sm text-slate-900">Applicant Refusal Reasons</h4>
            <p className="text-xs text-slate-500">Standardized rejection reasons used by HR and Admin</p>
          </div>

          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              placeholder="e.g. Schedule Unavailability"
              value={newReasonInput}
              onChange={(e) => setNewReasonInput(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (!newReasonInput.trim()) return;
                const updated = [...refusalReasons, newReasonInput.trim()];
                configService.saveRefusalReasons(updated, userEmail);
                setRefusalReasons(updated);
                setNewReasonInput('');
                onNotify(`Refusal reason added.`);
              }}
              className="px-3 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg"
            >
              Add
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {refusalReasons.map((reason, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-800">
                <span>{reason}</span>
                <button
                  onClick={() => {
                    const updated = refusalReasons.filter((_, i) => i !== idx);
                    configService.saveRefusalReasons(updated, userEmail);
                    setRefusalReasons(updated);
                    onNotify(`Refusal reason removed.`);
                  }}
                  className="text-slate-300 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 4. TRAINING / ACADEMY CONFIGURATION
// ----------------------------------------------------
function TrainingConfigSection({
  subTab,
  setSubTab,
  userEmail,
  onNotify
}: {
  subTab: string;
  setSubTab: (t: string) => void;
  userEmail: string;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [niches, setNiches] = useState<NichePlaybook[]>(configService.getNichePlaybooks());
  const [quizzes, setQuizzes] = useState<ProductQuizQuestion[]>(configService.getQuizQuestions());

  // Editing state for Module
  const [editingModule, setEditingModule] = useState<TrainingModule | null>(null);

  // Editing state for Niche
  const [editingNiche, setEditingNiche] = useState<NichePlaybook | null>(null);

  // Editing state for Quiz
  const [editingQuiz, setEditingQuiz] = useState<ProductQuizQuestion | null>(null);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    setLoadingModules(true);
    const { data } = await trainingService.getModules(true);
    setModules(data || []);
    setLoadingModules(false);
  };

  const handleSaveModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule) return;
    try {
      await trainingService.updateModule(editingModule.id, editingModule);
      await loadModules();
      setEditingModule(null);
      onNotify(`Academy module "${editingModule.title}" updated successfully!`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update module', true);
    }
  };

  const handleSaveNiche = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNiche) return;
    try {
      configService.saveNichePlaybook(editingNiche, userEmail);
      setNiches(configService.getNichePlaybooks());
      setEditingNiche(null);
      onNotify(`Niche playbook for "${editingNiche.niche}" saved successfully!`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to save niche playbook', true);
    }
  };

  const handleSaveQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuiz) return;
    try {
      configService.saveQuizQuestion(editingQuiz, userEmail);
      setQuizzes(configService.getQuizQuestions());
      setEditingQuiz(null);
      onNotify(`Quiz question updated successfully!`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to save quiz question', true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 gap-6 pb-2">
        <button
          onClick={() => setSubTab('modules')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'modules' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          20-Module Pathway ({modules.length})
        </button>
        <button
          onClick={() => setSubTab('niches')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'niches' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Niche Playbooks ({niches.length})
        </button>
        <button
          onClick={() => setSubTab('quizzes')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'quizzes' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Quiz Questions & Pass Scores ({quizzes.length})
        </button>
      </div>

      {/* Subtab: Modules */}
      {subTab === 'modules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Sales Academy Modules & Curriculum</h3>
              <p className="text-xs text-slate-500">Edit titles, descriptions, pass criteria, and administrative review gates</p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {modules.map((m) => (
              <div key={m.id} className="p-4 bg-white hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#000080] text-white font-mono text-[10px] flex items-center justify-center font-bold">
                      {m.sort_order}
                    </span>
                    <span className="font-bold text-xs text-slate-900">{m.title}</span>
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      slug: {m.slug}
                    </span>
                    <span className="text-[10px] bg-blue-50 text-blue-800 font-bold px-1.5 py-0.5 rounded capitalize">
                      {m.module_type}
                    </span>
                    {m.passing_score && (
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded">
                        Pass: {m.passing_score}%
                      </span>
                    )}
                    {m.requires_admin_review && (
                      <span className="text-[10px] bg-amber-50 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                        Admin Review Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{m.description}</p>
                </div>
                <button
                  onClick={() => setEditingModule(JSON.parse(JSON.stringify(m)))}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-[#000080] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Module
                </button>
              </div>
            ))}
          </div>

          {editingModule && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">
                    Edit Module #{editingModule.sort_order}: {editingModule.title}
                  </h4>
                  <button onClick={() => setEditingModule(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveModule} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Module Title</label>
                    <input
                      type="text"
                      required
                      value={editingModule.title}
                      onChange={(e) => setEditingModule({ ...editingModule, title: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={editingModule.description}
                      onChange={(e) => setEditingModule({ ...editingModule, description: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Passing Score (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editingModule.passing_score || 80}
                        onChange={(e) => setEditingModule({ ...editingModule, passing_score: Number(e.target.value) })}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Module Type</label>
                      <select
                        value={editingModule.module_type}
                        onChange={(e) => setEditingModule({ ...editingModule, module_type: e.target.value as any })}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                      >
                        <option value="lesson">Lesson</option>
                        <option value="quiz">Quiz</option>
                        <option value="assignment">Assignment</option>
                        <option value="practical">Practical Evaluation</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingModule.requires_admin_review}
                        onChange={(e) => setEditingModule({ ...editingModule, requires_admin_review: e.target.checked })}
                        className="rounded text-[#000080]"
                      />
                      Requires Admin Review
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingModule.active}
                        onChange={(e) => setEditingModule({ ...editingModule, active: e.target.checked })}
                        className="rounded text-[#000080]"
                      />
                      Active Module
                    </label>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingModule(null)}
                      className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                    >
                      Save Module
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab: Niches */}
      {subTab === 'niches' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">11 Canonical Niche Playbooks</h3>
              <p className="text-xs text-slate-500">Manage ideal prospects, decision makers, outreach angles, and discovery questions</p>
            </div>
            <button
              onClick={() => setEditingNiche({
                id: `niche_${Date.now()}`,
                niche: 'New Commercial Niche',
                idealProspect: '',
                decisionMaker: '',
                commonBusinessProblems: [],
                websiteProblems: [],
                recommendedService: 'ProFox Growth',
                outreachAngle: '',
                commonObjections: [],
                discoveryQuestions: []
              })}
              className="px-3.5 py-2 bg-[#000080] hover:bg-[#000066] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Niche Playbook
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {niches.map((n) => (
              <div key={n.id} className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-[#000080]/30 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{n.niche}</span>
                    <button
                      onClick={() => setEditingNiche(JSON.parse(JSON.stringify(n)))}
                      className="text-slate-400 hover:text-[#000080] p-1 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-slate-600">
                    <span className="font-bold text-slate-800">Ideal Prospect:</span> {n.idealProspect}
                  </div>
                  <div className="text-xs text-slate-600">
                    <span className="font-bold text-slate-800">Decision Maker:</span> {n.decisionMaker}
                  </div>
                  <div className="p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg text-xs text-[#000080]">
                    <span className="font-bold">Recommended:</span> {n.recommendedService}
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 italic">
                  "{n.outreachAngle}"
                </div>
              </div>
            ))}
          </div>

          {editingNiche && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">Edit Niche Playbook: {editingNiche.niche}</h4>
                  <button onClick={() => setEditingNiche(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveNiche} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Niche Name</label>
                    <input
                      type="text"
                      required
                      value={editingNiche.niche}
                      onChange={(e) => setEditingNiche({ ...editingNiche, niche: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ideal Prospect</label>
                      <input
                        type="text"
                        value={editingNiche.idealProspect}
                        onChange={(e) => setEditingNiche({ ...editingNiche, idealProspect: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Decision Maker</label>
                      <input
                        type="text"
                        value={editingNiche.decisionMaker}
                        onChange={(e) => setEditingNiche({ ...editingNiche, decisionMaker: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Recommended Package / Direction</label>
                    <input
                      type="text"
                      value={editingNiche.recommendedService}
                      onChange={(e) => setEditingNiche({ ...editingNiche, recommendedService: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-[#000080]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Outreach Angle</label>
                    <textarea
                      rows={2}
                      value={editingNiche.outreachAngle}
                      onChange={(e) => setEditingNiche({ ...editingNiche, outreachAngle: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Discovery Questions (One per line)</label>
                    <textarea
                      rows={3}
                      value={editingNiche.discoveryQuestions?.join('\n')}
                      onChange={(e) => setEditingNiche({ ...editingNiche, discoveryQuestions: e.target.value.split('\n').filter(Boolean) })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingNiche(null)}
                      className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                    >
                      Save Playbook
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab: Quizzes */}
      {subTab === 'quizzes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Certification & Product Quiz Questions</h3>
              <p className="text-xs text-slate-500">Edit quiz question prompts, multiple-choice options, and explanations</p>
            </div>
            <button
              onClick={() => setEditingQuiz({
                id: `pq_${Date.now()}`,
                question: 'New question prompt...',
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctIndex: 0,
                explanation: 'Explanation for correct answer...'
              })}
              className="px-3.5 py-2 bg-[#000080] hover:bg-[#000066] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Quiz Question
            </button>
          </div>

          <div className="space-y-3">
            {quizzes.map((q, idx) => (
              <div key={q.id} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-[#000080]/30 transition-all space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-blue-50 text-[#000080] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-200">
                      #{idx + 1}
                    </span>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">{q.question}</h4>
                      <p className="text-[11px] text-slate-500 mt-1">{q.explanation}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingQuiz(JSON.parse(JSON.stringify(q)))}
                    className="p-1.5 text-slate-400 hover:text-[#000080] cursor-pointer shrink-0"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {q.options?.map((opt, oIdx) => (
                    <div
                      key={oIdx}
                      className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                        oIdx === q.correctIndex
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      <span>{opt}</span>
                      {oIdx === q.correctIndex && (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {editingQuiz && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">Edit Quiz Question</h4>
                  <button onClick={() => setEditingQuiz(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveQuiz} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Question Prompt</label>
                    <textarea
                      rows={2}
                      required
                      value={editingQuiz.question}
                      onChange={(e) => setEditingQuiz({ ...editingQuiz, question: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Answer Options (Select correct option radio)</label>
                    {editingQuiz.options?.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correctOption"
                          checked={editingQuiz.correctIndex === oIdx}
                          onChange={() => setEditingQuiz({ ...editingQuiz, correctIndex: oIdx })}
                          className="text-[#000080]"
                        />
                        <input
                          type="text"
                          required
                          value={opt}
                          onChange={(e) => {
                            const copy = [...editingQuiz.options];
                            copy[oIdx] = e.target.value;
                            setEditingQuiz({ ...editingQuiz, options: copy });
                          }}
                          className="flex-1 border border-slate-200 rounded p-1.5 text-xs"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Explanation</label>
                    <textarea
                      rows={2}
                      value={editingQuiz.explanation}
                      onChange={(e) => setEditingQuiz({ ...editingQuiz, explanation: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingQuiz(null)}
                      className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                    >
                      Save Question
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 5. DELIVERY / PROJECTS & TASKS CONFIGURATION
// ----------------------------------------------------
function DeliveryConfigSection({
  subTab,
  setSubTab,
  userEmail,
  onNotify
}: {
  subTab: string;
  setSubTab: (t: string) => void;
  userEmail: string;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const [stages, setStages] = useState<ProjectStageConfig[]>(configService.getProjectStages(true));
  const [statuses, setStatuses] = useState<TaskStatusConfig[]>(configService.getTaskStatuses());
  const [priorities, setPriorities] = useState<TaskPriorityConfig[]>(configService.getTaskPriorities());

  const [editingStage, setEditingStage] = useState<ProjectStageConfig | null>(null);

  const handleSaveStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStage) return;
    configService.updateProjectStage(editingStage.stageKey, editingStage, userEmail);
    setStages(configService.getProjectStages(true));
    setEditingStage(null);
    onNotify(`Project stage "${editingStage.stageKey}" updated successfully!`);
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 gap-6 pb-2">
        <button
          onClick={() => setSubTab('project_stages')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'project_stages' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Project Delivery Stages ({stages.length})
        </button>
        <button
          onClick={() => setSubTab('task_statuses')}
          className={`text-xs font-bold pb-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'task_statuses' ? 'border-[#000080] text-[#000080]' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Task Statuses & Priorities
        </button>
      </div>

      {subTab === 'project_stages' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-[#000080] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 space-y-1">
              <span className="font-bold text-[#000080] block">Protected Payment & Launch Gates</span>
              <p>
                Milestone checkpoints (e.g. Design Approval, Staging Approval, and Launch) are permanently connected to payment security rules. You can edit their display labels and sort order without breaking backend validation.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {stages.map((st) => (
              <div key={st.stageKey} className="p-4 bg-white hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] flex items-center justify-center font-bold">
                      {st.sortOrder}
                    </span>
                    <span className="font-bold text-xs text-slate-900">{st.displayLabel}</span>
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                      key: {st.stageKey}
                    </span>
                    {st.isProtectedGate && (
                      <span className="text-[10px] bg-blue-50 text-[#000080] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border border-blue-200">
                        <Lock className="w-2.5 h-2.5" /> Protected Gate
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{st.description}</p>
                </div>
                <button
                  onClick={() => setEditingStage(st)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-[#000080] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Stage
                </button>
              </div>
            ))}
          </div>

          {editingStage && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-sm text-slate-900">
                    Edit Project Stage: <span className="font-mono text-[#000080]">{editingStage.stageKey}</span>
                  </h4>
                  <button onClick={() => setEditingStage(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveStage} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Display Label</label>
                    <input
                      type="text"
                      required
                      value={editingStage.displayLabel}
                      onChange={(e) => setEditingStage({ ...editingStage, displayLabel: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={editingStage.description}
                      onChange={(e) => setEditingStage({ ...editingStage, description: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingStage(null)}
                      className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#000080] text-white text-xs font-bold rounded-lg shadow"
                    >
                      Save Stage
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'task_statuses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Task Statuses */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
            <div>
              <h4 className="font-bold text-sm text-slate-900">Task Status Labels</h4>
              <p className="text-xs text-slate-500">Statuses displayed across sprint boards</p>
            </div>
            <div className="space-y-2">
              {statuses.map((st) => (
                <div key={st.statusKey} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: st.color }} />
                    <span className="font-bold text-xs text-slate-800">{st.displayLabel}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">key: {st.statusKey}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Task Priorities */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
            <div>
              <h4 className="font-bold text-sm text-slate-900">Task Priority Levels</h4>
              <p className="text-xs text-slate-500">Urgency classifications for task assignees</p>
            </div>
            <div className="space-y-2">
              {priorities.map((pr) => (
                <div key={pr.priorityKey} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${pr.badgeClass}`}>
                    {pr.displayLabel}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">key: {pr.priorityKey}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 6. CLIENT EXPERIENCE CONFIGURATION
// ----------------------------------------------------
function ClientExperienceConfigSection({
  userEmail,
  onNotify
}: {
  userEmail: string;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const [portalForm, setPortalForm] = useState<ClientPortalConfig>(configService.getClientPortalConfig());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      configService.updateClientPortalConfig(portalForm, userEmail);
      onNotify('Client Portal instructions and display text updated!');
    } catch (err: any) {
      onNotify(err.message || 'Failed to save portal settings', true);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Client Portal Content & Messaging</h3>
          <p className="text-xs text-slate-500">Customize welcome greetings, payment instructions, and file upload notices</p>
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-[#000080] hover:bg-[#000066] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" /> Save Portal Settings
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Welcome Headline</label>
          <input
            type="text"
            value={portalForm.welcomeHeadline}
            onChange={(e) => setPortalForm({ ...portalForm, welcomeHeadline: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 font-bold focus:border-[#000080] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Welcome Subtitle</label>
          <textarea
            rows={2}
            value={portalForm.welcomeSubheadline}
            onChange={(e) => setPortalForm({ ...portalForm, welcomeSubheadline: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:border-[#000080] focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Client Support Email</label>
            <input
              type="email"
              value={portalForm.supportEmail}
              onChange={(e) => setPortalForm({ ...portalForm, supportEmail: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:border-[#000080] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Support Phone & Hours</label>
            <input
              type="text"
              value={portalForm.businessHours}
              onChange={(e) => setPortalForm({ ...portalForm, businessHours: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:border-[#000080] focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Payment & Invoicing Instructions</label>
          <textarea
            rows={3}
            value={portalForm.paymentInstructions}
            onChange={(e) => setPortalForm({ ...portalForm, paymentInstructions: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:border-[#000080] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">File Upload Guidelines</label>
          <textarea
            rows={2}
            value={portalForm.uploadGuidelines}
            onChange={(e) => setPortalForm({ ...portalForm, uploadGuidelines: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:border-[#000080] focus:outline-none"
          />
        </div>
      </div>
    </form>
  );
}

// ----------------------------------------------------
// 7. AUDIT HISTORY SECTION
// ----------------------------------------------------
function AuditHistorySection({
  onNotify
}: {
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>(configService.getAuditLogs());
  const [filterText, setFilterText] = useState('');

  const filtered = logs.filter((l) =>
    l.entity.toLowerCase().includes(filterText.toLowerCase()) ||
    l.changedBy.toLowerCase().includes(filterText.toLowerCase()) ||
    (l.recordTitle && l.recordTitle.toLowerCase().includes(filterText.toLowerCase())) ||
    (l.fieldChanged && l.fieldChanged.toLowerCase().includes(filterText.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Configuration Audit History</h3>
          <p className="text-xs text-slate-500">Immutable trace log of all administrative customization actions</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search logs..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#000080]"
            />
          </div>
          <button
            onClick={() => setLogs(configService.getAuditLogs())}
            className="p-1.5 text-slate-500 hover:text-[#000080] hover:bg-slate-100 rounded-lg"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200/60">
          <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-600">No configuration changes logged yet.</p>
          <p className="text-[11px] text-slate-400 mt-1">Changes made in this Configuration Center will automatically be recorded here.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {filtered.map((log) => (
            <div key={log.id} className="p-4 bg-white hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#000080] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {log.entity}
                  </span>
                  <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                    Action: {log.action}
                  </span>
                  {log.recordTitle && (
                    <span className="font-bold text-slate-800 truncate max-w-xs">
                      {log.recordTitle}
                    </span>
                  )}
                </div>
                <div className="text-slate-500 flex items-center gap-2 text-[11px]">
                  <span>Field: <strong className="text-slate-700">{log.fieldChanged || 'record'}</strong></span>
                  <span>•</span>
                  <span>By: <strong className="text-slate-700">{log.changedBy}</strong></span>
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-400 font-mono shrink-0">
                <Clock className="w-3 h-3 inline mr-1" />
                {new Date(log.changedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
