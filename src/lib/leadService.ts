import { supabase, dbProcedure } from './supabase';
import { ContactLead } from '../types';

export const leadService = {
  async getAllLeads(): Promise<ContactLead[]> {
    const { data, error } = await dbProcedure.getContentById('leads_database');
    if (error) {
      console.error('Error fetching leads:', error);
      return [];
    }
    return Array.isArray(data?.leads) ? data.leads : [];
  },

  async submitLead(leadData: Omit<ContactLead, 'id' | 'createdAt' | 'status' | 'source'>): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('submit_public_crm_lead', { p_payload: leadData });
      if (error) throw error;
      if (data?.success !== true) throw new Error('The enquiry could not be added to CRM.');
      return { success: true };
    } catch (err: any) {
      console.error('Lead submission failed:', err);
      return { success: false, error: err.message };
    }
  },

  async updateLeadStatus(leadId: string, status: ContactLead['status']): Promise<{ success: boolean; error?: string }> {
    try {
      const allLeads = await this.getAllLeads();
      const updatedLeads = allLeads.map(l => l.id === leadId ? { ...l, status } : l);
      
      const { error } = await dbProcedure.upsertContentItem('leads_database', { leads: updatedLeads });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteLead(leadId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const allLeads = await this.getAllLeads();
      const updatedLeads = allLeads.filter(l => l.id !== leadId);
      
      const { error } = await dbProcedure.upsertContentItem('leads_database', { leads: updatedLeads });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};
