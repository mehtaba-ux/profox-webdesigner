import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  Plus, 
  Search, 
  Trash2, 
  Clock, 
  ExternalLink, 
  Users, 
  ListChecks, 
  FileText, 
  Layout, 
  ChevronRight,
  ArrowRight,
  DollarSign,
  UserPlus,
  ShieldAlert,
  X
} from 'lucide-react';
import { 
  Project, 
  ProjectStage, 
  PROJECT_STAGES, 
  TASK_STATUSES, 
  TaskStatus,
  TaskPriority,
  UserProfile,
  ProjectStatus,
  CRMOpportunity,
  Payment
} from '../../types';
import { projectService } from '../../lib/projectService';
import { useAuth } from '../../lib/AuthContext';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';

export default function ProjectManager() {
  const { user, isAdmin, role } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStageFilter, setActiveStageFilter] = useState<ProjectStage | 'All'>('All');
  
  // Modal states
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'overview' | 'scope' | 'tasks' | 'team' | 'payments'>('overview');
  
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [projectTasks, setProjectTasks] = useState<any[]>([]);
  const [projectTeam, setProjectTeam] = useState<any[]>([]);
  const [projectPayments, setProjectPayments] = useState<Payment[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [wonOpportunities, setWonOpportunities] = useState<CRMOpportunity[]>([]);
  const [paymentWarning, setPaymentWarning] = useState<string | null>(null);

  // New task form state
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    department: 'Development',
    assigned_to: '',
    priority: 'Normal' as TaskPriority,
    status: 'To Do' as TaskStatus,
    due_date: '',
    notes: ''
  });

  // Assign team member form state
  const [selectedUserToAssign, setSelectedUserToAssign] = useState('');
  const [selectedRoleToAssign, setSelectedRoleToAssign] = useState('Developer');

  // Task filter state inside modal
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('All');

  // Editing state
  const [isSaving, setIsSaving] = useState(false);

  const canManageProjects = isAdmin || role === 'project_manager' || role === 'site_manager';
  const isSalesOnly = role === 'sales' || role === 'sales_rep' || role === 'sales_team';

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    const [pRes, uRes, oRes] = await Promise.all([
      projectService.getProjects(),
      supabase.from('user_profiles').select('*').eq('status', 'active'),
      supabase.from('crm_opportunities').select('*').eq('status', 'Won').order('won_at', { ascending: false })
    ]);

    setProjects(pRes.data || []);
    setAvailableUsers(uRes.data || []);
    setWonOpportunities(oRes.data || []);
    setLoading(false);
  };

  const handleViewDetails = async (project: any) => {
    setLoading(true);
    const sourceOppId = project.sourceOpportunityId || project.source_opportunity_id;
    const qId = project.quotationId || project.quotation_id;

    const [pRes, tRes, tmRes, payRes] = await Promise.all([
      projectService.getProjectById(project.id),
      projectService.getProjectTasks(project.id),
      projectService.getProjectTeam(project.id),
      projectService.getProjectPayments(sourceOppId, qId)
    ]);

    const projData = pRes.data;
    setSelectedProject(projData);
    setProjectTasks(tRes.data || []);
    setProjectTeam(tmRes.data || []);
    setProjectPayments(payRes.data || []);

    // Check payment completeness
    const totalVal = Number(projData?.projectValue || projData?.project_value || 0);
    const totalVerifiedPaid = (payRes.data || [])
      .filter((p: Payment) => p.status === 'Verified')
      .reduce((sum: number, p: Payment) => sum + (Number(p.amountPaid || (p as any).amount_paid) || 0), 0);

    const isNearLaunch = ['Launch', 'Handover', 'Completed'].includes(projData?.stage);
    if (totalVal > 0 && totalVerifiedPaid < totalVal) {
      setPaymentWarning(`Final Payment Required Before Launch (${projData.currency || 'USD'} ${(totalVal - totalVerifiedPaid).toLocaleString()} Outstanding)`);
    } else {
      setPaymentWarning(null);
    }

    setActiveWorkspaceTab('overview');
    setIsDetailModalOpen(true);
    setLoading(false);
  };

  const handleUpdateProject = async (updates: Record<string, any>) => {
    if (!selectedProject || !canManageProjects) return;
    setIsSaving(true);
    const { data, error } = await projectService.updateProject(selectedProject.id, updates as any);
    if (error) {
      alert('Failed to update project: ' + error.message);
    } else {
      setSelectedProject({ ...selectedProject, ...data, ...updates });
      await fetchInitialData();
    }
    setIsSaving(false);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newTask.title.trim()) return;

    setIsSaving(true);
    const taskPayload = {
      project_id: selectedProject.id,
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      department: newTask.department,
      assigned_to: newTask.assigned_to || null,
      created_by: user?.id,
      priority: newTask.priority,
      status: newTask.status,
      due_date: newTask.due_date || null,
      notes: newTask.notes.trim()
    };

    const { data, error } = await projectService.createTask(taskPayload);
    if (error) {
      alert('Failed to create task: ' + error.message);
    } else {
      setProjectTasks([...projectTasks, data]);
      setNewTask({
        title: '',
        description: '',
        department: 'Development',
        assigned_to: '',
        priority: 'Normal',
        status: 'To Do',
        due_date: '',
        notes: ''
      });
      setIsAddTaskModalOpen(false);
    }
    setIsSaving(false);
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    const { data, error } = await projectService.updateTask(taskId, { 
      status: newStatus,
      completedAt: newStatus === 'Done' ? new Date().toISOString() : null
    });
    if (!error) {
      setProjectTasks(projectTasks.map(t => t.id === taskId ? { ...t, ...data } : t));
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    const { error } = await projectService.deleteTask(taskId);
    if (!error) {
      setProjectTasks(projectTasks.filter(t => t.id !== taskId));
    }
  };

  const handleAssignTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !selectedUserToAssign) return;

    setIsSaving(true);
    const { error } = await projectService.assignTeamMember(
      selectedProject.id,
      selectedUserToAssign,
      selectedRoleToAssign
    );

    if (error) {
      alert('Failed to assign team member: ' + error.message);
    } else {
      const { data: updatedTeam } = await projectService.getProjectTeam(selectedProject.id);
      setProjectTeam(updatedTeam || []);
      setSelectedUserToAssign('');
    }
    setIsSaving(false);
  };

  const handleRemoveTeamMember = async (userId: string) => {
    if (!selectedProject || !confirm('Remove this team member from project?')) return;
    const { error } = await projectService.removeTeamMember(selectedProject.id, userId);
    if (!error) {
      setProjectTeam(projectTeam.filter(tm => tm.user_id !== userId));
    }
  };

  const handleInitializeProject = async (opportunityId: string) => {
    setLoading(true);
    const { data, error } = await projectService.initializeProjectFromOpportunity(opportunityId);
    if (error) {
      alert(error.message);
    } else {
      await fetchInitialData();
      setIsCreateModalOpen(false);
      handleViewDetails(data);
    }
    setLoading(false);
  };

  const filteredProjects = projects.filter(p => {
    const projName = p.projectName || p.project_name || '';
    const projNum = p.projectNumber || p.project_number || '';
    const clientComp = p.client?.companyName || p.client?.company_name || '';
    
    const matchesSearch = projName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          projNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          clientComp.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = activeStageFilter === 'All' || p.stage === activeStageFilter;
    return matchesSearch && matchesStage;
  });

  const getStageColor = (stage: ProjectStage) => {
    switch (stage) {
      case 'Sales Handover': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Client Onboarding': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Requirements': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Content': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'UI/UX Design': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Client Design Approval': return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
      case 'Development': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'QA': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Client Review': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'Final Revisions': return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'Launch': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Handover': return 'bg-green-50 text-green-700 border-green-200';
      case 'Completed': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case 'Low': return 'text-slate-500 bg-slate-50 border-slate-200';
      case 'Normal': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'High': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'Urgent': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-slate-500 bg-slate-50 border-slate-200';
    }
  };

  const totalCollected = projectPayments
    .filter(p => p.status === 'Verified')
    .reduce((sum, p) => sum + (Number(p.amountPaid || (p as any).amount_paid) || 0), 0);
  const totalVal = Number(selectedProject?.projectValue || selectedProject?.project_value || 0);
  const outstandingBal = Math.max(0, totalVal - totalCollected);

  const filteredTasks = projectTasks.filter(t => {
    if (taskStatusFilter === 'All') return true;
    return t.status === taskStatusFilter;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Project Delivery & Tasks</h1>
          <p className="text-slate-500 text-sm mt-1">Manage client projects, stage progression, team assignments, and delivery milestones.</p>
        </div>
        
        {canManageProjects && (
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 bg-[#000080] hover:bg-[#000066] text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create Project
          </button>
        )}
      </div>

      {/* Stage Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide max-w-3xl">
          {['All', ...PROJECT_STAGES].map(stage => (
            <button
              key={stage}
              onClick={() => setActiveStageFilter(stage as any)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all border cursor-pointer ${
                activeStageFilter === stage
                  ? 'bg-[#000080] text-white border-[#000080]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {stage}
            </button>
          ))}
        </div>

        <div className="relative min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search project, client, or number..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-[#000080] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-500">Syncing delivery workspace...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-[32px] py-20 text-center">
          <div className="bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Briefcase className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">No active projects found</h3>
          <p className="text-slate-500 max-w-sm mx-auto mt-2 text-sm">Projects are automatically created when an opportunity is won with verified advance payment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map(project => {
            const pNumber = project.projectNumber || project.project_number;
            const pName = project.projectName || project.project_name;
            const clientComp = project.client?.companyName || project.client?.company_name || 'Individual Client';
            const val = Number(project.projectValue || project.project_value || 0);

            return (
              <div 
                key={project.id}
                onClick={() => handleViewDetails(project)}
                className="bg-white border border-slate-200 rounded-[28px] p-6 hover:shadow-xl hover:border-blue-200 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-mono font-bold text-[#000080] bg-blue-50 px-2 py-1 rounded border border-blue-100">
                      {pNumber}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStageColor(project.stage)}`}>
                      {project.stage}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#000080] transition-colors line-clamp-1">
                    {pName}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-1">
                    <Users className="w-3.5 h-3.5" /> {clientComp}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Package Value</span>
                    <span className="font-bold text-slate-900">${val.toLocaleString()} {project.currency || 'USD'}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Target: {(project.targetDate || project.target_date) ? format(new Date(project.targetDate || project.target_date), 'MMM d, yyyy') : 'TBD'}
                    </div>
                    <span className="font-bold text-[#000080] group-hover:translate-x-1 transition-transform flex items-center gap-0.5">
                      Open <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Project Detail Workspace Modal */}
      {isDetailModalOpen && selectedProject && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm overflow-hidden">
          <div className="bg-white w-full max-w-6xl h-full max-h-[92vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-[#000080] p-2.5 rounded-2xl text-white">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{selectedProject.projectName || selectedProject.project_name}</h2>
                    <span className="text-xs font-mono font-bold text-[#000080] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      {selectedProject.projectNumber || selectedProject.project_number}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    Stage: <span className="text-[#000080] font-bold">{selectedProject.stage}</span> • Client: <span className="font-bold text-slate-700">{selectedProject.client?.companyName || selectedProject.client?.company_name}</span>
                  </p>
                </div>
              </div>
              
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Modal Workspace Layout */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Workspace Left Nav */}
              <div className="w-full md:w-60 border-r border-slate-100 bg-slate-50/50 p-4 space-y-1.5 flex flex-col shrink-0">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-1 mb-2">Delivery Workspace</div>
                
                <button 
                  onClick={() => setActiveWorkspaceTab('overview')}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 font-bold text-xs rounded-xl transition-all w-full text-left cursor-pointer ${
                    activeWorkspaceTab === 'overview'
                      ? 'bg-[#000080] text-white shadow-md'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <Layout className="w-4 h-4" /> Overview
                </button>

                <button 
                  onClick={() => setActiveWorkspaceTab('scope')}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 font-bold text-xs rounded-xl transition-all w-full text-left cursor-pointer ${
                    activeWorkspaceTab === 'scope'
                      ? 'bg-[#000080] text-white shadow-md'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <FileText className="w-4 h-4" /> Scope & Handover
                </button>

                <button 
                  onClick={() => setActiveWorkspaceTab('tasks')}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 font-bold text-xs rounded-xl transition-all w-full text-left cursor-pointer justify-between ${
                    activeWorkspaceTab === 'tasks'
                      ? 'bg-[#000080] text-white shadow-md'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ListChecks className="w-4 h-4" /> Tasks
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${activeWorkspaceTab === 'tasks' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {projectTasks.length}
                  </span>
                </button>

                <button 
                  onClick={() => setActiveWorkspaceTab('team')}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 font-bold text-xs rounded-xl transition-all w-full text-left cursor-pointer justify-between ${
                    activeWorkspaceTab === 'team'
                      ? 'bg-[#000080] text-white shadow-md'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4" /> Team
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${activeWorkspaceTab === 'team' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {projectTeam.length}
                  </span>
                </button>

                <button 
                  onClick={() => setActiveWorkspaceTab('payments')}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 font-bold text-xs rounded-xl transition-all w-full text-left cursor-pointer ${
                    activeWorkspaceTab === 'payments'
                      ? 'bg-[#000080] text-white shadow-md'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <DollarSign className="w-4 h-4" /> Payments Summary
                </button>

                {/* Stage and Status Controllers for PMs/Admins */}
                <div className="mt-auto pt-4 border-t border-slate-200 space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stage</label>
                    <select 
                      disabled={!canManageProjects}
                      value={selectedProject.stage}
                      onChange={(e) => handleUpdateProject({ stage: e.target.value as ProjectStage })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#000080] disabled:bg-slate-100 disabled:opacity-80"
                    >
                      {PROJECT_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Status</label>
                    <select 
                      disabled={!canManageProjects}
                      value={selectedProject.status || 'Active'}
                      onChange={(e) => handleUpdateProject({ status: e.target.value as ProjectStatus })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#000080] disabled:bg-slate-100 disabled:opacity-80"
                    >
                      <option value="Active">Active</option>
                      <option value="Paused">Paused</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Main Workspace Body */}
              <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
                
                {/* Warning Banner if Final Payment Outstanding near Launch */}
                {paymentWarning && (
                  <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-2xl flex items-center gap-3 animate-pulse">
                    <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider">Commercial Gate Warning</h4>
                      <p className="text-xs font-medium text-red-700 mt-0.5">{paymentWarning}</p>
                    </div>
                  </div>
                )}

                {/* TAB 1: OVERVIEW */}
                {activeWorkspaceTab === 'overview' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Client Card */}
                      <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-3">
                        <h4 className="text-xs font-black text-[#000080] uppercase tracking-widest flex items-center gap-2">
                          <Users className="w-4 h-4" /> Client & Contact
                        </h4>
                        <div className="space-y-2 text-xs">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Company</p>
                            <p className="font-bold text-slate-900">{selectedProject.client?.companyName || selectedProject.client?.company_name || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Primary Contact</p>
                            <p className="font-bold text-slate-800">{selectedProject.client?.primaryContactName || selectedProject.client?.primary_contact_name || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Email / Phone</p>
                            <p className="font-medium text-slate-600">{selectedProject.client?.email || 'N/A'} • {selectedProject.client?.phone || 'N/A'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Package & Value */}
                      <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-3">
                        <h4 className="text-xs font-black text-[#000080] uppercase tracking-widest flex items-center gap-2">
                          <Briefcase className="w-4 h-4" /> Package & Value
                        </h4>
                        <div className="space-y-2 text-xs">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Package Snapshot</p>
                            <span className="inline-block bg-blue-50 text-[#000080] text-[11px] font-bold px-2 py-0.5 rounded border border-blue-100 mt-0.5">
                              {selectedProject.packageSnapshot || selectedProject.package_snapshot || 'Custom Solution'}
                            </span>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Project Value</p>
                            <p className="text-sm font-extrabold text-slate-900">${totalVal.toLocaleString()} {selectedProject.currency || 'USD'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Timeline & PM */}
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Project Manager</label>
                        <select 
                          disabled={!canManageProjects}
                          value={selectedProject.projectManagerId || selectedProject.project_manager_id || ''}
                          onChange={(e) => handleUpdateProject({ project_manager_id: e.target.value, projectManagerId: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-[#000080] disabled:bg-slate-100"
                        >
                          <option value="">Unassigned</option>
                          {availableUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Target Date</label>
                        <input 
                          type="date"
                          disabled={!canManageProjects}
                          value={(selectedProject.targetDate || selectedProject.target_date) ? (selectedProject.targetDate || selectedProject.target_date).split('T')[0] : ''}
                          onChange={(e) => handleUpdateProject({ target_date: e.target.value, targetDate: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-[#000080] disabled:bg-slate-100"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Priority</label>
                        <select 
                          disabled={!canManageProjects}
                          value={selectedProject.priority || 'Normal'}
                          onChange={(e) => handleUpdateProject({ priority: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-[#000080] disabled:bg-slate-100"
                        >
                          <option value="Low">Low</option>
                          <option value="Normal">Normal</option>
                          <option value="High">High</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: SCOPE & HANDOVER */}
                {activeWorkspaceTab === 'scope' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Sales Handover & Commercial Scope</h3>
                        <p className="text-xs text-slate-500">Read and maintain sales notes, exclusions, and requirements discussed prior to sale.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#000080] uppercase tracking-widest">Requirements Summary</label>
                        <textarea 
                          disabled={!canManageProjects}
                          value={selectedProject.requirementsSummary || selectedProject.requirements_summary || ''}
                          onChange={(e) => setSelectedProject({ ...selectedProject, requirementsSummary: e.target.value })}
                          onBlur={(e) => handleUpdateProject({ requirements_summary: e.target.value, requirementsSummary: e.target.value })}
                          rows={6}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium focus:ring-2 focus:ring-[#000080]/10 outline-none leading-relaxed disabled:bg-slate-100"
                          placeholder="Project requirements..."
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#000080] uppercase tracking-widest">Sales Handover Notes</label>
                        <textarea 
                          disabled={!canManageProjects}
                          value={selectedProject.salesHandoverNotes || selectedProject.sales_handover_notes || ''}
                          onChange={(e) => setSelectedProject({ ...selectedProject, salesHandoverNotes: e.target.value })}
                          onBlur={(e) => handleUpdateProject({ sales_handover_notes: e.target.value, salesHandoverNotes: e.target.value })}
                          rows={6}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium focus:ring-2 focus:ring-[#000080]/10 outline-none leading-relaxed disabled:bg-slate-100"
                          placeholder="Sales handover notes..."
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#000080] uppercase tracking-widest">Approved Scope Summary</label>
                        <textarea 
                          disabled={!canManageProjects}
                          value={selectedProject.scopeSummary || selectedProject.scope_summary || ''}
                          onChange={(e) => setSelectedProject({ ...selectedProject, scopeSummary: e.target.value })}
                          onBlur={(e) => handleUpdateProject({ scope_summary: e.target.value, scopeSummary: e.target.value })}
                          rows={5}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium focus:ring-2 focus:ring-[#000080]/10 outline-none leading-relaxed disabled:bg-slate-100"
                          placeholder="Approved scope..."
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#000080] uppercase tracking-widest">Exclusions</label>
                        <textarea 
                          disabled={!canManageProjects}
                          value={selectedProject.exclusions || ''}
                          onChange={(e) => setSelectedProject({ ...selectedProject, exclusions: e.target.value })}
                          onBlur={(e) => handleUpdateProject({ exclusions: e.target.value })}
                          rows={5}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium focus:ring-2 focus:ring-[#000080]/10 outline-none leading-relaxed disabled:bg-slate-100"
                          placeholder="Explicit exclusions..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: TASKS */}
                {activeWorkspaceTab === 'tasks' && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                        {['All', ...TASK_STATUSES].map(s => (
                          <button
                            key={s}
                            onClick={() => setTaskStatusFilter(s)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                              taskStatusFilter === s
                                ? 'bg-[#000080] text-white border-[#000080]'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>

                      {!isSalesOnly && (
                        <button 
                          onClick={() => setIsAddTaskModalOpen(true)}
                          className="flex items-center gap-1.5 bg-[#000080] hover:bg-[#000066] text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Task
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {filteredTasks.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400 font-bold uppercase">No tasks found for this status</p>
                        </div>
                      ) : (
                        filteredTasks.map(task => (
                          <div key={task.id} className="bg-white border border-slate-200 p-4 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <select 
                                value={task.status}
                                onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-700 outline-none focus:border-[#000080] shrink-0"
                              >
                                {TASK_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                              </select>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className={`text-xs font-bold ${task.status === 'Done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                    {task.title}
                                  </h4>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getPriorityColor(task.priority)}`}>
                                    {task.priority}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                  <span className="font-bold text-[#000080]">{task.department}</span>
                                  <span>•</span>
                                  <span>Assignee: {task.assignee?.fullName || task.assignee?.full_name || 'Unassigned'}</span>
                                  {task.due_date && (
                                    <>
                                      <span>•</span>
                                      <span>Due: {format(new Date(task.due_date), 'MMM d, yyyy')}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {canManageProjects && (
                              <button 
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 4: TEAM */}
                {activeWorkspaceTab === 'team' && (
                  <div className="space-y-6">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-900">Project Team Members</h3>
                      <p className="text-xs text-slate-500">Assign active Content, Design, Development, and QA team members to this project.</p>
                    </div>

                    {canManageProjects && (
                      <form onSubmit={handleAssignTeamMember} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row items-end gap-3">
                        <div className="flex-1 space-y-1 w-full">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Team Member</label>
                          <select 
                            value={selectedUserToAssign}
                            onChange={(e) => setSelectedUserToAssign(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                            required
                          >
                            <option value="">-- Choose Member --</option>
                            {availableUsers.map(u => (
                              <option key={u.id} value={u.id}>{u.fullName} ({u.role} - {u.department})</option>
                            ))}
                          </select>
                        </div>

                        <div className="w-full sm:w-48 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Role</label>
                          <select 
                            value={selectedRoleToAssign}
                            onChange={(e) => setSelectedRoleToAssign(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                          >
                            <option value="Project Manager">Project Manager</option>
                            <option value="Content Writer">Content Writer</option>
                            <option value="UI/UX Designer">UI/UX Designer</option>
                            <option value="Developer">Developer</option>
                            <option value="QA Tester">QA Tester</option>
                          </select>
                        </div>

                        <button 
                          type="submit"
                          disabled={isSaving}
                          className="w-full sm:w-auto bg-[#000080] hover:bg-[#000066] text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Assign Member
                        </button>
                      </form>
                    )}

                    <div className="space-y-2">
                      {projectTeam.length === 0 ? (
                        <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400 font-bold uppercase">No specific team members assigned yet</p>
                        </div>
                      ) : (
                        projectTeam.map(tm => (
                          <div key={tm.id} className="bg-white border border-slate-200 p-3.5 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#000080]/10 text-[#000080] font-bold text-xs flex items-center justify-center">
                                {(tm.user?.fullName || tm.user?.full_name || 'U').charAt(0)}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-900">{tm.user?.fullName || tm.user?.full_name || 'User'}</h4>
                                <p className="text-[10px] text-slate-500">{tm.user?.email} • <strong className="text-[#000080]">{tm.role}</strong></p>
                              </div>
                            </div>

                            {canManageProjects && (
                              <button 
                                onClick={() => handleRemoveTeamMember(tm.user_id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 5: PAYMENTS */}
                {activeWorkspaceTab === 'payments' && (
                  <div className="space-y-6">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-900">Project Financial Summary</h3>
                      <p className="text-xs text-slate-500">Read-only payment status synchronized directly from the Payments module.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Value</div>
                        <div className="text-lg font-black text-slate-900 mt-1">${totalVal.toLocaleString()} {selectedProject.currency || 'USD'}</div>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
                        <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Verified Collected</div>
                        <div className="text-lg font-black text-emerald-700 mt-1">${totalCollected.toLocaleString()} {selectedProject.currency || 'USD'}</div>
                      </div>

                      <div className={`p-4 rounded-2xl border ${outstandingBal > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className={`text-[10px] font-black uppercase tracking-widest ${outstandingBal > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Outstanding</div>
                        <div className={`text-lg font-black mt-1 ${outstandingBal > 0 ? 'text-amber-700' : 'text-slate-900'}`}>${outstandingBal.toLocaleString()} {selectedProject.currency || 'USD'}</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-800">Payment Milestones</h4>
                      {projectPayments.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400 font-bold uppercase">No payment records found</p>
                        </div>
                      ) : (
                        projectPayments.map(pay => (
                          <div key={pay.id} className="bg-white border border-slate-200 p-3.5 rounded-xl flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-slate-900">{pay.paymentType || (pay as any).payment_type} Payment</div>
                              <div className="text-[10px] text-slate-500">{format(new Date(pay.createdAt || (pay as any).created_at), 'MMM d, yyyy')} • Ref: {pay.paymentReference || (pay as any).payment_reference || 'N/A'}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-extrabold text-slate-900">${Number(pay.amountPaid || (pay as any).amount_paid || 0).toLocaleString()}</div>
                              <span className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded ${pay.status === 'Verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {pay.status}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {isAddTaskModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Add New Project Task</h3>
              <button onClick={() => setIsAddTaskModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Task Title *</label>
                <input 
                  type="text"
                  required
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="e.g. Design Homepage Wireframe"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium outline-none focus:border-[#000080]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Department</label>
                  <select 
                    value={newTask.department}
                    onChange={(e) => setNewTask({ ...newTask, department: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium outline-none"
                  >
                    <option value="Content">Content</option>
                    <option value="Design">Design</option>
                    <option value="Development">Development</option>
                    <option value="QA">QA</option>
                    <option value="Management">Management</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Priority</label>
                  <select 
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as TaskPriority })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assignee</label>
                  <select 
                    value={newTask.assigned_to}
                    onChange={(e) => setNewTask({ ...newTask, assigned_to: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium outline-none"
                  >
                    <option value="">Unassigned</option>
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Due Date</label>
                  <input 
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label>
                <textarea 
                  rows={3}
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Task instructions..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-medium outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsAddTaskModalOpen(false)}
                  className="px-4 py-2 text-slate-500 font-bold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="bg-[#000080] hover:bg-[#000066] text-white px-5 py-2 rounded-xl font-bold cursor-pointer"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Creation Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Initialize Project Delivery</h2>
                <p className="text-xs text-slate-500">Convert a Won sale with verified advance payment into a project.</p>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                {wonOpportunities.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400 font-bold uppercase">No Won Opportunities found</p>
                  </div>
                ) : (
                  wonOpportunities.map(opp => (
                    <button
                      key={opp.id}
                      onClick={() => handleInitializeProject(opp.id)}
                      className="w-full flex items-center justify-between p-4 bg-white border border-slate-200 hover:border-[#000080] hover:shadow-md rounded-2xl transition-all group text-left cursor-pointer"
                    >
                      <div>
                        <div className="text-sm font-bold text-slate-900 group-hover:text-[#000080] transition-colors">{opp.companyName || opp.name}</div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Expected Value: ${Number(opp.expectedValue || (opp as any).value || 0).toLocaleString()} • Won on {(opp.wonAt || opp.createdAt) ? format(new Date(opp.wonAt || opp.createdAt), 'MMM d, yyyy') : 'Recently'}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#000080] group-hover:translate-x-1 transition-all" />
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="px-5 py-2 text-slate-500 font-bold text-xs hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
