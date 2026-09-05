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
  currentOwnerRole?: string | null;
  currentOwnerName?: string | null;
  updatedAt?: string | null;
  raw?: Record<string, unknown>;
}

export interface SellerLifecycleClosedItem {
  leadId?: string | null;
  companyName: string;
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
    items: Array.isArray(raw?.items) ? raw.items : [],
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
  }
};
