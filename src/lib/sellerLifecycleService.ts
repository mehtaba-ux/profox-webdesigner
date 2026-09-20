import { supabase } from './supabase';

export type SellerLifecycleQueueKey =
  | 'active_leads'
  | 'deals_quotations'
  | 'awaiting_payment'
  | 'onboarding'
  | 'ready_for_handoff'
  | 'closed_customers';

export interface SellerLifecycleCounts {
  activeLeads: number;
  dealsQuotations: number;
  awaitingPayment: number;
  onboarding: number;
  readyForHandoff: number;
  closedCustomers: number;
}

export interface SellerLifecycleItem {
  leadId?: string | null;
  companyName: string;
  leadTitle?: string | null;
  salespersonId?: string | null;
  sellerName?: string | null;
  opportunityId?: string | null;
  quotationId?: string | null;
  quotationNumber?: string | null;
  paymentReference?: string | null;
  projectId?: string | null;
  projectNumber?: string | null;
  projectName?: string | null;
  onboardingId?: string | null;
  lifecycleStage: string;
  queueKey: SellerLifecycleQueueKey;
  nextActionLabel: string;
  actionUrl: string;
  blocker?: string | null;
  handoffStatus?: string | null;
  handoffAttempt?: number | null;
  currentOwnerRole?: string | null;
  currentOwnerName?: string | null;
  updatedAt?: string | null;
  raw?: Record<string, unknown>;
}

export interface SellerLifecycleClosedItem {
  leadId?: string | null;
  companyName: string;
  quotationId?: string | null;
  quotationNumber?: string | null;
  projectId?: string | null;
  projectNumber?: string | null;
  projectName?: string | null;
  lifecycleStage: string;
  currentOwnerName?: string | null;
  actionUrl: string;
  updatedAt?: string | null;
}

export interface SellerLifecycleQueue {
  scope: 'team' | 'individual';
  salespersonId?: string | null;
  counts: SellerLifecycleCounts;
  items: SellerLifecycleItem[];
  recentClosed: SellerLifecycleClosedItem[];
}

export interface SellerLifecycleMilestones {
  lead: boolean;
  quotation: boolean;
  payment: boolean;
  onboarding: boolean;
  handoff: boolean;
  production: boolean;
  completed: boolean;
}

export interface SellerCustomerLifecycle {
  leadId?: string | null;
  companyName: string;
  opportunityId?: string | null;
  quotationId?: string | null;
  quotationNumber?: string | null;
  paymentReference?: string | null;
  projectId?: string | null;
  projectNumber?: string | null;
  projectName?: string | null;
  onboardingId?: string | null;
  lifecycleStage: string;
  queueKey: SellerLifecycleQueueKey | 'archived';
  projectStage?: string | null;
  currentOwnerRole?: string | null;
  currentOwnerName?: string | null;
  nextActionLabel: string;
  actionUrl: string;
  blocker?: string | null;
  milestones: SellerLifecycleMilestones;
  raw?: Record<string, unknown>;
}

export interface SellerClosedCustomersPage {
  scope: 'team' | 'individual';
  salespersonId?: string | null;
  search: string;
  limit: number;
  offset: number;
  total: number;
  items: SellerLifecycleClosedItem[];
}

const ZERO_COUNTS: SellerLifecycleCounts = {
  activeLeads: 0,
  dealsQuotations: 0,
  awaitingPayment: 0,
  onboarding: 0,
  readyForHandoff: 0,
  closedCustomers: 0
};

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeItem(item: any): SellerLifecycleItem {
  if (item?.queueKey === 'onboarding' && item?.leadId) {
    return {
      ...item,
      nextActionLabel: 'View Onboarding',
      actionUrl: `/admin/app/crm?tab=leads&lead=${encodeURIComponent(item.leadId)}`
    };
  }
  return item as SellerLifecycleItem;
}

function normalize(raw: any): SellerLifecycleQueue {
  const counts = raw?.counts || {};
  return {
    scope: raw?.scope === 'team' ? 'team' : 'individual',
    salespersonId: raw?.salespersonId || null,
    counts: {
      ...ZERO_COUNTS,
      activeLeads: number(counts.activeLeads),
      dealsQuotations: number(counts.dealsQuotations),
      awaitingPayment: number(counts.awaitingPayment),
      onboarding: number(counts.onboarding),
      readyForHandoff: number(counts.readyForHandoff),
      closedCustomers: number(counts.closedCustomers)
    },
    items: Array.isArray(raw?.items) ? raw.items.map(normalizeItem) : [],
    recentClosed: Array.isArray(raw?.recentClosed) ? raw.recentClosed : []
  };
}

export const sellerLifecycleService = {
  async get(salespersonId?: string | null): Promise<SellerLifecycleQueue> {
    const { data, error } = await supabase.rpc('crm_get_seller_lifecycle_queue', {
      p_salesperson_id: salespersonId || null
    });
    if (error) throw error;
    return normalize(data);
  },

  async getCustomerLifecycle(params: { leadId?: string | null; projectId?: string | null }): Promise<SellerCustomerLifecycle> {
    const { data, error } = await supabase.rpc('crm_get_seller_customer_lifecycle', {
      p_lead_id: params.leadId || null,
      p_project_id: params.projectId || null
    });
    if (error) throw error;
    if (!data) throw new Error('Customer lifecycle is unavailable.');
    return data as SellerCustomerLifecycle;
  },

  async getClosed(params: { salespersonId?: string | null; search?: string; limit?: number; offset?: number } = {}): Promise<SellerClosedCustomersPage> {
    const { data, error } = await supabase.rpc('crm_get_seller_closed_customers', {
      p_salesperson_id: params.salespersonId || null,
      p_search: params.search?.trim() || null,
      p_limit: params.limit || 25,
      p_offset: params.offset || 0
    });
    if (error) throw error;
    const raw: any = data || {};
    return {
      scope: raw.scope === 'team' ? 'team' : 'individual',
      salespersonId: raw.salespersonId || null,
      search: String(raw.search || ''),
      limit: number(raw.limit) || 25,
      offset: number(raw.offset),
      total: number(raw.total),
      items: Array.isArray(raw.items) ? raw.items : []
    };
  }
};
