import { supabase } from './supabase';
import { Project, ProjectTask, ProjectStage, Payment } from '../types';

function mapProjectFromDb(row: any): any {
  if (!row) return null;
  return {
    ...row,
    id: row.id,
    projectNumber: row.project_number,
    projectName: row.project_name,
    clientId: row.client_id,
    sourceOpportunityId: row.source_opportunity_id,
    quotationId: row.quotation_id,
    packageSnapshot: row.package_snapshot,
    projectValue: Number(row.project_value || 0),
    currency: row.currency || 'USD',
    projectManagerId: row.project_manager_id,
    stage: row.stage,
    priority: row.priority,
    status: row.status,
    startDate: row.start_date,
    targetDate: row.target_date,
    completedAt: row.completed_at,
    requirementsSummary: row.requirements_summary,
    scopeSummary: row.scope_summary,
    exclusions: row.exclusions,
    salesHandoverNotes: row.sales_handover_notes,
    internalNotes: row.internal_notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProjectToDb(project: Partial<Project>) {
  const row: any = {};
  if (project.projectName !== undefined) row.project_name = project.projectName;
  if (project.clientId !== undefined) row.client_id = project.clientId;
  if (project.sourceOpportunityId !== undefined) row.source_opportunity_id = project.sourceOpportunityId;
  if (project.quotationId !== undefined) row.quotation_id = project.quotationId;
  if (project.packageSnapshot !== undefined) row.package_snapshot = project.packageSnapshot;
  if (project.projectValue !== undefined) row.project_value = project.projectValue;
  if (project.currency !== undefined) row.currency = project.currency;
  if (project.projectManagerId !== undefined) row.project_manager_id = project.projectManagerId;
  if (project.stage !== undefined) row.stage = project.stage;
  if (project.priority !== undefined) row.priority = project.priority;
  if (project.status !== undefined) row.status = project.status;
  if (project.startDate !== undefined) row.start_date = project.startDate;
  if (project.targetDate !== undefined) row.target_date = project.targetDate;
  if (project.completedAt !== undefined) row.completed_at = project.completedAt;
  if (project.requirementsSummary !== undefined) row.requirements_summary = project.requirementsSummary;
  if (project.scopeSummary !== undefined) row.scope_summary = project.scopeSummary;
  if (project.exclusions !== undefined) row.exclusions = project.exclusions;
  if (project.salesHandoverNotes !== undefined) row.sales_handover_notes = project.salesHandoverNotes;
  if (project.internalNotes !== undefined) row.internal_notes = project.internalNotes;
  return row;
}

function mapTaskFromDb(row: any): any {
  if (!row) return null;
  return {
    ...row,
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    department: row.department,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    priority: row.priority,
    status: row.status,
    startDate: row.start_date,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTaskToDb(task: Partial<ProjectTask>) {
  const row: any = {};
  if (task.projectId !== undefined) row.project_id = task.projectId;
  if (task.title !== undefined) row.title = task.title;
  if (task.description !== undefined) row.description = task.description;
  if (task.department !== undefined) row.department = task.department;
  if (task.assignedTo !== undefined) row.assigned_to = task.assignedTo;
  if (task.createdBy !== undefined) row.created_by = task.createdBy;
  if (task.priority !== undefined) row.priority = task.priority;
  if (task.status !== undefined) row.status = task.status;
  if (task.startDate !== undefined) row.start_date = task.startDate;
  if (task.dueDate !== undefined) row.due_date = task.dueDate;
  if (task.completedAt !== undefined) row.completed_at = task.completedAt;
  if (task.notes !== undefined) row.notes = task.notes;
  return row;
}

function mapPaymentFromDb(row: any): Payment {
  return {
    id: row.id,
    paymentReference: row.payment_reference,
    quotationId: row.quotation_id,
    opportunityId: row.opportunity_id,
    clientId: row.client_id,
    salespersonId: row.salesperson_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    paymentType: row.payment_type,
    milestoneNumber: row.milestone_number,
    milestoneLabel: row.milestone_label,
    amountDue: Number(row.amount_due || 0),
    amountPaid: Number(row.amount_paid || 0),
    currency: row.currency || 'USD',
    paymentMethod: row.payment_method,
    paymentProvider: row.payment_provider,
    paymentLink: row.payment_link,
    providerPaymentId: row.provider_payment_id,
    status: row.status,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const projectService = {
  async getProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*, client:clients(*), pm:user_profiles!project_manager_id(*), quotation:quotations(*)')
      .order('created_at', { ascending: false });
    return { data: (data || []).map(mapProjectFromDb), error };
  },

  async getProjectById(id: string) {
    const { data, error } = await supabase
      .from('projects')
      .select('*, client:clients(*), pm:user_profiles!project_manager_id(*), quotation:quotations(*)')
      .eq('id', id)
      .single();
    return { data: data ? mapProjectFromDb(data) : null, error };
  },

  async createProject(_project: Partial<Project>) {
    return { data: null, error: new Error('Projects must be created from a verified sale through initializeProjectFromOpportunity().') };
  },

  async updateProject(id: string, updates: Partial<Project>) {
    const { data, error } = await supabase
      .from('projects')
      .update(mapProjectToDb(updates))
      .eq('id', id)
      .select('*, client:clients(*), pm:user_profiles!project_manager_id(*), quotation:quotations(*)')
      .single();
    return { data: data ? mapProjectFromDb(data) : null, error };
  },

  async getProjectTeam(projectId: string) {
    const { data, error } = await supabase.from('project_team').select('*, user:user_profiles!user_id(*)').eq('project_id', projectId);
    return { data: data || [], error };
  },

  async assignTeamMember(projectId: string, userId: string, role: string) {
    const { data, error } = await supabase
      .from('project_team')
      .upsert([{ project_id: projectId, user_id: userId, role }], { onConflict: 'project_id,user_id' })
      .select('*, user:user_profiles!user_id(*)')
      .single();
    return { data, error };
  },

  async removeTeamMember(projectId: string, userId: string) {
    const { error } = await supabase.from('project_team').delete().eq('project_id', projectId).eq('user_id', userId);
    return { error };
  },

  async getProjectTasks(projectId: string) {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*, assignee:user_profiles!assigned_to(*), creator:user_profiles!created_by(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    return { data: (data || []).map(mapTaskFromDb), error };
  },

  async getMyTasks(userId: string) {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*, project:projects(*, client:clients(*)), assignee:user_profiles!assigned_to(*)')
      .eq('assigned_to', userId)
      .neq('status', 'Done')
      .order('due_date', { ascending: true });
    return { data: (data || []).map(mapTaskFromDb), error };
  },

  async getAllTasks() {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*, project:projects(*, client:clients(*)), assignee:user_profiles!assigned_to(*)')
      .order('due_date', { ascending: true });
    return { data: (data || []).map(mapTaskFromDb), error };
  },

  async createTask(task: Partial<ProjectTask>) {
    const { data: authData } = await supabase.auth.getUser();
    const payload = mapTaskToDb({ ...task, createdBy: task.createdBy || authData.user?.id || '' });
    const { data, error } = await supabase.from('project_tasks').insert([payload]).select('*, assignee:user_profiles!assigned_to(*)').single();
    return { data: data ? mapTaskFromDb(data) : null, error };
  },

  async updateTask(id: string, updates: Partial<ProjectTask>) {
    const { data, error } = await supabase.from('project_tasks').update(mapTaskToDb(updates)).eq('id', id).select('*, assignee:user_profiles!assigned_to(*)').single();
    return { data: data ? mapTaskFromDb(data) : null, error };
  },

  async deleteTask(id: string) {
    const { error } = await supabase.from('project_tasks').delete().eq('id', id);
    return { error };
  },

  async initializeProjectFromOpportunity(opportunityId: string) {
    const { data: projectId, error } = await supabase.rpc('create_project_from_sale', { p_opportunity_id: opportunityId });
    if (error) return { data: null, error: new Error(error.message) };
    return await this.getProjectById(projectId);
  },

  async submitSalesHandover(projectId: string, notes: string) {
    const { data, error } = await supabase.rpc('submit_sales_project_handover', {
      p_project_id: projectId,
      p_notes: notes
    });
    return { data: data as { projectId: string; submittedBy: string; sourceSellerSubmission: boolean; notes: string; submittedAt: string } | null, error };
  },

  async getProjectPayments(opportunityId?: string, quotationId?: string) {
    let query = supabase.from('payments').select('*');
    if (quotationId) query = query.eq('quotation_id', quotationId);
    else if (opportunityId) query = query.eq('opportunity_id', opportunityId);
    else return { data: [], error: null };
    const { data, error } = await query.order('created_at', { ascending: true });
    return { data: (data || []).map(mapPaymentFromDb), error };
  },

  async getProjectsByClientEmail(_email: string) {
    const { data, error } = await supabase.rpc('client_get_portal_projects');
    return { data: Array.isArray(data) ? data : [], error };
  },

  async approveClientStage(projectId: string, notes = '') {
    const { data, error } = await supabase.rpc('client_approve_project_stage', {
      p_project_id: projectId,
      p_notes: notes
    });
    return { data: data as ProjectStage | null, error };
  },

  async requestClientChanges(projectId: string, notes: string) {
    const { data, error } = await supabase.rpc('client_request_project_changes', {
      p_project_id: projectId,
      p_notes: notes
    });
    return { data: data as ProjectStage | null, error };
  },

  async updateProjectStage(projectId: string, stage: ProjectStage) {
    return await this.updateProject(projectId, { stage });
  },

  async getStageStaffingReadiness(projectId: string, stage: ProjectStage) {
    const { data, error } = await supabase.rpc('delivery_stage_staffing_readiness', {
      p_project_id: projectId,
      p_stage: stage
    });
    return { data: data as { stage: ProjectStage; ready: boolean; blockers: string[] } | null, error };
  }
};
