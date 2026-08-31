import { supabase } from './supabase';

export interface LeadAssignmentStatus {
  canManage: boolean;
  mode: 'manual' | 'round_robin';
  eligibleSalespersonIds: string[];
}

export interface CRMFastResponseLead {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  serviceInterest: string | null;
  leadScore: number;
  leadQuality: string;
  acceptedAt: string | null;
  firstResponseDueAt: string | null;
  firstResponseSlaMinutes: number | null;
  createdAt: string;
}

export interface QuoteResponsePolicy {
  firstResponseSlaMinutes: number;
  notifyManagersOnNewLead: boolean;
  notifyAssigneeOnAssignment: boolean;
  escalateOverdueToManagers: boolean;
}

const normalizeResponsePolicy = (value: any): QuoteResponsePolicy => ({
  firstResponseSlaMinutes: Math.max(5, Math.min(1440, Number(value?.firstResponseSlaMinutes || 30))),
  notifyManagersOnNewLead: value?.notifyManagersOnNewLead !== false,
  notifyAssigneeOnAssignment: value?.notifyAssigneeOnAssignment !== false,
  escalateOverdueToManagers: value?.escalateOverdueToManagers !== false,
});

export const leadAssignmentService = {
  async getStatus(): Promise<LeadAssignmentStatus> {
    const { data, error } = await supabase.rpc('crm_get_lead_assignment_status');
    if (error) throw error;
    return {
      canManage: Boolean(data?.canManage),
      mode: data?.mode === 'round_robin' ? 'round_robin' : 'manual',
      eligibleSalespersonIds: Array.isArray(data?.eligibleSalespersonIds) ? data.eligibleSalespersonIds.map(String) : [],
    };
  },

  async bulkAssign(leadIds: string[], salespersonId: string): Promise<number> {
    const { data, error } = await supabase.rpc('crm_bulk_assign_leads', { p_lead_ids: leadIds, p_salesperson_id: salespersonId });
    if (error) throw error;
    return Number(data?.assignedCount || 0);
  },

  async distributeRoundRobin(leadIds: string[]): Promise<number> {
    const { data, error } = await supabase.rpc('crm_distribute_leads_round_robin', { p_lead_ids: leadIds });
    if (error) throw error;
    return Number(data?.assignedCount || 0);
  },

  async getMyFastResponseLeads(): Promise<CRMFastResponseLead[]> {
    const { data, error } = await supabase.rpc('crm_get_my_fast_response_leads');
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },

  async acceptLead(leadId: string): Promise<{ id: string; acceptedAt: string | null; firstResponseDueAt: string | null; firstResponseAt: string | null }> {
    const { data, error } = await supabase.rpc('crm_accept_lead', { p_lead_id: leadId });
    if (error) throw error;
    return data;
  },

  async getQuoteResponsePolicy(): Promise<QuoteResponsePolicy> {
    const { data, error } = await supabase.rpc('crm_admin_get_quote_response_policy');
    if (error) throw error;
    return normalizeResponsePolicy(data);
  },

  async saveQuoteResponsePolicy(policy: QuoteResponsePolicy): Promise<QuoteResponsePolicy> {
    const { data, error } = await supabase.rpc('crm_admin_save_quote_response_policy', { p_policy: policy });
    if (error) throw error;
    return normalizeResponsePolicy(data);
  },
};
