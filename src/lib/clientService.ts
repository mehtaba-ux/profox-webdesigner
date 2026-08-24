import { supabase } from './supabase';
import { SalesClient, UserProfile } from '../types';
import { mapDbToUserProfile } from './profileService';

export interface ClientRecord extends SalesClient {
  linkedUserId?: string | null;
}

export interface ClientHistoryRecord {
  opportunities: Array<{
    id: string;
    name: string;
    status: string;
    stage: string;
    expectedValue: number;
    currency: string;
    createdAt: string;
  }>;
  quotations: Array<{
    id: string;
    quotationNumber: string;
    status: string;
    total: number;
    currency: string;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    paymentReference: string;
    status: string;
    amountDue: number;
    amountPaid: number;
    currency: string;
    createdAt: string;
  }>;
  projects: Array<{
    id: string;
    projectNumber: string;
    projectName: string;
    stage: string;
    status: string;
    createdAt: string;
  }>;
}

function mapClient(row: any): ClientRecord {
  return {
    id: row.id,
    companyName: row.company_name,
    primaryContactName: row.primary_contact_name,
    email: row.email,
    phone: row.phone,
    website: row.website,
    country: row.country,
    industry: row.industry,
    salespersonId: row.salesperson_id,
    sourceOpportunityId: row.source_opportunity_id,
    firstQuotationId: row.first_quotation_id,
    totalSalesValue: Number(row.total_sales_value || 0),
    currency: row.currency || 'USD',
    status: row.status,
    notes: row.notes,
    linkedUserId: row.linked_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const clientService = {
  async getClients(): Promise<{ data: ClientRecord[]; error: any }> {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('company_name', { ascending: true });
    return { data: (data || []).map(mapClient), error };
  },

  async getClient(clientId: string): Promise<{ data: ClientRecord | null; error: any }> {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();
    return { data: data ? mapClient(data) : null, error };
  },

  async getHistory(clientId: string): Promise<{ data: ClientHistoryRecord; error: any }> {
    const empty: ClientHistoryRecord = { opportunities: [], quotations: [], payments: [], projects: [] };
    const [oppRes, quoteRes, paymentRes, projectRes] = await Promise.all([
      supabase
        .from('crm_opportunities')
        .select('id,name,status,stage,expected_value,currency,created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('quotations')
        .select('id,quotation_number,status,total,currency,created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('payments')
        .select('id,payment_reference,status,amount_due,amount_paid,currency,created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('projects')
        .select('id,project_number,project_name,stage,status,created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
    ]);

    const error = oppRes.error || quoteRes.error || paymentRes.error || projectRes.error;
    if (error) return { data: empty, error };

    return {
      data: {
        opportunities: (oppRes.data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          stage: row.stage,
          expectedValue: Number(row.expected_value || 0),
          currency: row.currency || 'USD',
          createdAt: row.created_at
        })),
        quotations: (quoteRes.data || []).map((row: any) => ({
          id: row.id,
          quotationNumber: row.quotation_number,
          status: row.status,
          total: Number(row.total || 0),
          currency: row.currency || 'USD',
          createdAt: row.created_at
        })),
        payments: (paymentRes.data || []).map((row: any) => ({
          id: row.id,
          paymentReference: row.payment_reference,
          status: row.status,
          amountDue: Number(row.amount_due || 0),
          amountPaid: Number(row.amount_paid || 0),
          currency: row.currency || 'USD',
          createdAt: row.created_at
        })),
        projects: (projectRes.data || []).map((row: any) => ({
          id: row.id,
          projectNumber: row.project_number,
          projectName: row.project_name,
          stage: row.stage,
          status: row.status,
          createdAt: row.created_at
        }))
      },
      error: null
    };
  },

  async getLinkedPortalProfile(client: ClientRecord): Promise<{ data: UserProfile | null; error: any }> {
    if (!client.linkedUserId) return { data: null, error: null };
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', client.linkedUserId)
      .maybeSingle();
    return { data: data ? mapDbToUserProfile(data) : null, error };
  },

  async findPortalCandidateByEmail(email: string): Promise<{ data: UserProfile | null; error: any }> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return { data: null, error: null };
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .ilike('email', normalized)
      .maybeSingle();
    return { data: data ? mapDbToUserProfile(data) : null, error };
  },

  async linkPortalAccount(clientId: string, userId: string) {
    const { error } = await supabase.rpc('link_client_account', {
      p_client_id: clientId,
      p_target_user_id: userId
    });
    return { error };
  },

  async unlinkPortalAccount(clientId: string) {
    const { error } = await supabase.rpc('unlink_client_account', {
      p_client_id: clientId
    });
    return { error };
  }
};
