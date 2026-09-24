import { supabase } from './supabase';

export interface LeadAssignmentStatus {
  canManage: boolean;
  mode: 'manual' | 'round_robin';
  eligibleSalespersonIds: string[];
}

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
};
