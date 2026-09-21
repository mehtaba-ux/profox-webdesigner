import { supabase } from './supabase';

export type ManagerExceptionFilter =
  | 'all'
  | 'blocking'
  | 'overdue'
  | 'proposal_readiness'
  | 'validations'
  | 'quotation_approvals'
  | 'meeting_closeout'
  | 'decision_process'
  | 'next_action'
  | 'stage_sla'
  | 'returned_handoffs'
  | 'promise_coverage'
  | 'overrides';

export type ManagerExceptionItem = {
  exceptionKey: string;
  exceptionType: string;
  category: string;
  sourceSystem: string;
  sourceEntityType: string;
  sourceEntityId: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  projectId?: string | null;
  quotationId?: string | null;
  sellerId?: string | null;
  ownerId?: string | null;
  ownerName: string;
  title: string;
  reason: string;
  sourceStatus: string;
  sourceSeverity?: string | null;
  blocking: boolean;
  overdue: boolean;
  workspacePriority: 'CRITICAL' | 'HIGH' | 'NORMAL';
  openedAt?: string | null;
  ageHours?: number | null;
  dueAt?: string | null;
  sourceUpdatedAt?: string | null;
  recommendedAction: string;
  actionLabel: string;
  actionUrl: string;
  metadata: Record<string, unknown>;
};

export type ManagerExceptionCounts = {
  total: number;
  blocking: number;
  overdue: number;
  pendingReview: number;
  commercial: number;
  technical: number;
  timeline: number;
  meetingCloseOut: number;
  nextAction: number;
  stageSla: number;
  returnedHandoff: number;
  promiseCoverage: number;
  proposalReadiness: number;
  decisionProcess: number;
  repeatedOverride: number;
};

export type ManagerExceptionOwner = {
  id: string;
  name: string;
  count: number;
};

export type ManagerExceptionWorkspace = {
  generatedAt: string;
  scope: 'team';
  authority: 'ADMIN_ONLY';
  resolutionPolicy: 'SOURCE_DERIVED';
  filter: ManagerExceptionFilter;
  search: string;
  ownerId?: string | null;
  counts: ManagerExceptionCounts;
  owners: ManagerExceptionOwner[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  items: ManagerExceptionItem[];
};

export const managerExceptionService = {
  async getWorkspace(params?: {
    filter?: ManagerExceptionFilter;
    search?: string;
    ownerId?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<ManagerExceptionWorkspace> {
    const { data, error } = await supabase.rpc('crm_get_manager_exception_workspace', {
      p_filter: params?.filter || 'all',
      p_search: params?.search || '',
      p_owner_id: params?.ownerId || null,
      p_limit: params?.limit || 50,
      p_offset: params?.offset || 0,
    });
    if (error) throw error;
    if (!data) throw new Error('Manager Exceptions could not be loaded.');
    return data as ManagerExceptionWorkspace;
  },
};
