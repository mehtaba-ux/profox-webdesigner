import { supabase } from './supabase';

export type QuotationApprovalFilter = 'pending' | 'approved' | 'changes_requested' | 'rejected' | 'all';

export interface QuotationApprovalListItem {
  id: string;
  quotationNumber: string;
  sellerId?: string | null;
  sellerName: string;
  customerName: string;
  opportunityId?: string | null;
  opportunityName?: string | null;
  opportunityCompany?: string | null;
  total: number;
  currency: string;
  requestedAt: string;
  requestedBy?: string | null;
  approvalReasons: string[];
  status: string;
  decision?: string | null;
  decisionNote?: string | null;
  decidedAt?: string | null;
  reviewerName?: string | null;
  revisionNumber: number;
  priority: string;
  durationSnapshotText?: string | null;
}

export interface QuotationApprovalPage {
  items: QuotationApprovalListItem[];
  count: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export const quotationApprovalService = {
  async canAccess(): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_access_quotation_approvals');
    if (error) throw error;
    return Boolean(data);
  },

  async list(filter: QuotationApprovalFilter = 'pending', search = '', offset = 0, limit = 50): Promise<QuotationApprovalPage> {
    const { data, error } = await supabase.rpc('get_quotation_approval_requests', {
      p_filter: filter,
      p_search: search,
      p_limit: limit,
      p_offset: offset
    });
    if (error) throw error;
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      count: Number(data?.count || 0),
      offset: Number(data?.offset || 0),
      limit: Number(data?.limit || limit),
      hasMore: Boolean(data?.hasMore)
    };
  },

  async detail(id: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_quotation_approval_detail', { p_quotation_id: id });
    if (error) throw error;
    return data;
  },

  async review(id: string, decision: 'approve' | 'request_changes' | 'reject', comment = ''): Promise<any> {
    const { data, error } = await supabase.rpc('review_quotation_approval', {
      p_quotation_id: id,
      p_decision: decision,
      p_comment: comment || null
    });
    if (error) throw error;
    return data;
  }
};
