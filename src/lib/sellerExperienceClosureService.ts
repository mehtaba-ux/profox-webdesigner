import { supabase } from './supabase';

export interface SellerFunnelStage { key: string; label: string; count: number; }
export interface SellerExactAttentionItem { type: string; priority: 'high' | 'medium' | 'low' | string; title: string; detail: string; actionUrl: string; entityId?: string; }
export interface SellerEnhancedMeeting { id: string; title?: string | null; attendeeName?: string | null; startAt: string; timezone?: string | null; meetingUrl?: string | null; leadId?: string | null; opportunityId?: string | null; prepReviewedAt?: string | null; prepUrl: string; crmFocusUrl?: string | null; manageUrl: string; }
export interface SellerClosureNotification { id: string; type?: string; title: string; message: string; actionUrl?: string; createdAt: string; }
export interface SellerAdjustedCommission { id: string; entryNumber: string; productName?: string; currency: string; currentAmount: number; adjustedFromAmount: number; reason?: string | null; adjustedAt: string; canonicalStatus: string; displayStatus: string; }
export interface SellerClosureCareerProgression { enabled?: boolean; eligible?: boolean; totalVerifiedSales?: number; minimumTotalSales?: number; activeDays?: number; minimumActiveDays?: number; criteria?: Array<{ productCode: string; productName: string; requiredSales: number; currentSales: number; met: boolean; }>; }
export interface SellerExperienceClosureData {
  scope: 'team' | 'individual';
  salespersonId?: string | null;
  timezone: string;
  localDate: string;
  funnel: SellerFunnelStage[];
  exactAttention: SellerExactAttentionItem[];
  tomorrowMeetings: SellerEnhancedMeeting[];
  upcomingMeetings: SellerEnhancedMeeting[];
  payoutReadiness: { pendingApprovalAmount: number; pendingPaymentVerificationAmount: number; adjustedCommissionTotal: number; };
  careerProgression?: SellerClosureCareerProgression | null;
  adjustedCommissions: SellerAdjustedCommission[];
  notifications: SellerClosureNotification[];
}

function number(value: unknown) { return Number(value || 0); }
function array<T = any>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function normalizeMeeting(row: any): SellerEnhancedMeeting {
  const id = String(row?.id || '');
  return {
    ...row,
    id,
    startAt: String(row?.startAt || ''),
    prepUrl: row?.prepUrl || `/admin/meeting-prep/${id}`,
    manageUrl: `/admin/meeting-manage/${id}`
  } as SellerEnhancedMeeting;
}
function normalize(raw: any): SellerExperienceClosureData {
  return {
    ...(raw || {}),
    scope: raw?.scope === 'team' ? 'team' : 'individual',
    timezone: String(raw?.timezone || 'UTC'),
    localDate: String(raw?.localDate || ''),
    funnel: array(raw?.funnel).map((row: any) => ({ key: String(row?.key || ''), label: String(row?.label || ''), count: number(row?.count) })),
    exactAttention: array(raw?.exactAttention),
    tomorrowMeetings: array(raw?.tomorrowMeetings).map(normalizeMeeting),
    upcomingMeetings: array(raw?.upcomingMeetings).map(normalizeMeeting),
    payoutReadiness: {
      pendingApprovalAmount: number(raw?.payoutReadiness?.pendingApprovalAmount),
      pendingPaymentVerificationAmount: number(raw?.payoutReadiness?.pendingPaymentVerificationAmount),
      adjustedCommissionTotal: number(raw?.payoutReadiness?.adjustedCommissionTotal)
    },
    careerProgression: raw?.careerProgression || null,
    adjustedCommissions: array(raw?.adjustedCommissions).map((row: any) => ({ ...row, currentAmount: number(row?.currentAmount), adjustedFromAmount: number(row?.adjustedFromAmount) })),
    notifications: array(raw?.notifications)
  } as SellerExperienceClosureData;
}

export const sellerExperienceClosureService = {
  async get(salespersonId?: string | null): Promise<SellerExperienceClosureData> {
    const { data, error } = await supabase.rpc('get_seller_experience_closure', { p_salesperson_id: salespersonId || null });
    if (error) throw error;
    return normalize(data);
  },
  async markNotificationRead(notificationId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_in_app_notification_read', { p_id: notificationId });
    if (error) throw error;
  },
  async markMeetingPrepared(meetingId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_sales_meeting_prepared', { p_meeting_id: meetingId });
    if (error) throw error;
  }
};
