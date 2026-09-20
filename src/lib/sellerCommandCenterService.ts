import { supabase } from './supabase';
import type { SaleActivationState } from './saleActivationTypes';

export type SellerDashboardPeriod = 'today' | 'week' | 'month' | 'quarter' | 'custom';

export interface SellerAttentionItem {
  type: string;
  priority: 'high' | 'medium' | 'low' | string;
  title: string;
  detail: string;
  actionUrl?: string;
  entityId?: string;
}

export interface SellerPipelineStage {
  stage: string;
  count: number;
  value: number;
}

export interface SellerCoreProduct {
  code: string;
  name: string;
  priceMode: 'fixed' | 'starting_at' | 'custom';
  basePrice: number;
  currency: string;
  shortDescription?: string | null;
  scope: string[];
  standardPaymentTerms?: string | null;
  paymentSchedule: Array<{ milestoneNumber: number; paymentType: string; label: string; percentage: number }>;
  managerApprovalRequired: boolean;
}

export interface SellerCareerProgression {
  enabled?: boolean;
  eligible?: boolean;
  qualificationMode?: string;
  periodType?: string;
  periodStart?: string;
  periodEnd?: string;
  policyVersion?: number;
  totalVerifiedSales?: number;
  minimumTotalSales?: number;
  activeDays?: number;
  minimumActiveDays?: number;
  managementReviewRequired?: boolean;
  criteria?: Array<{
    productCode: string;
    productName: string;
    basePrice: number;
    currency: string;
    priceMode: string;
    requiredSales: number;
    currentSales: number;
    met: boolean;
  }>;
}

export interface SellerCommissionEntry {
  id: string;
  entryNumber: string;
  salespersonId?: string;
  salespersonName?: string;
  customerName: string;
  paymentId: string;
  paymentReference?: string | null;
  quotationId?: string | null;
  opportunityId?: string | null;
  productCode: string;
  productName: string;
  verifiedPaymentAmount: number;
  currency: string;
  baseRatePercent: number;
  selfGeneratedBonusPercent: number;
  performanceBonusPercent: number;
  effectiveRatePercent: number;
  commissionAmount: number;
  canonicalStatus: string;
  displayStatus: 'Pending Verification' | 'Earned' | 'Approved' | 'Scheduled' | 'Paid' | 'Reversed' | string;
  payoutBatchId?: string | null;
  payoutBatchNumber?: string | null;
  payoutScheduledDate?: string | null;
  payoutBatchStatus?: string | null;
  payoutReference?: string | null;
  paidAt?: string | null;
  reversalReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SellerPerformanceComparison {
  available: true;
  period: { start: string; end: string };
  confirmedPaidSales: number;
  verifiedRevenue: number;
  meetingsCompleted: number;
  changes: {
    confirmedPaidSales: { absolute: number; percent: number | null };
    verifiedRevenue: { absolute: number; percent: number | null };
    meetingsCompleted: { absolute: number; percent: number | null };
  };
}

export interface SellerTodayData {
  scope?: 'team' | 'individual';
  salespersonId?: string | null;
  timezone?: string;
  localDate?: string;
  counts: {
    followUpsDueToday: number;
    meetingsToday: number;
    overdueActivities: number;
    quotationsAwaitingResponse: number;
    paymentsAwaitingVerification: number;
    leadsNeedingAction: number;
    academyPolicyAcknowledgements: number;
    newBookings: number;
    quotationFollowUps: number;
    unreadNotifications: number;
  };
  todayMeetings: any[];
  followUpsDueToday: any[];
  overdueActivities: any[];
  leadActions: any[];
  paymentVerificationActions: any[];
  quotationActions: any[];
  academyPolicyActions: any[];
  upcomingMeetings: any[];
  notifications: any[];
}

export interface SellerCommandCenterData {
  scope: 'team' | 'individual';
  salespersonId?: string | null;
  generatedAt: string;
  timezone?: string;
  period: { key: SellerDashboardPeriod; start: string; end: string };
  comparison: SellerPerformanceComparison | null;
  today: SellerTodayData;
  performance: {
    confirmedPaidSales: number;
    verifiedRevenue: number;
    pipelineValue: number;
    monthlyTarget: number;
    monthlyTargetPaidSales: number;
    targetCompletion: number;
    meetingsCompleted: number;
    productBreakdown: Array<{ productCode: string; productName: string; sales: number }>;
  };
  pipeline: SellerPipelineStage[];
  commissions: {
    earned: number;
    pendingVerification: number;
    approved: number;
    scheduled: number;
    paid: number;
    reversed: number;
    payoutSchedule: string;
    upcomingPayout?: {
      id: string;
      batchNumber: string;
      scheduledDate: string;
      status: string;
      amount: number;
      entryCount: number;
    } | null;
    entries: SellerCommissionEntry[];
  };
  quotations: {
    draft: number;
    readyForApproval: number;
    sent: number;
    accepted: number;
    expired: number;
  };
  payments: {
    awaitingCustomer: number;
    verificationPending: number;
    overdue: number;
    verifiedInPeriod: number;
  };
  recentSales: Array<{
    paymentId: string;
    customerName: string;
    amount: number;
    currency: string;
    verifiedAt: string;
    productCode?: string;
    productName?: string;
    commissionAmount?: number;
    commissionStatus?: string;
    opportunityId?: string;
    quotationId?: string;
  }>;
  attention: SellerAttentionItem[];
  careerProgression?: SellerCareerProgression | null;
  coreProducts: SellerCoreProduct[];
  saleActivation: SaleActivationState[];
}

export interface SellerCommandCenterQuery {
  salespersonId?: string | null;
  period?: SellerDashboardPeriod;
  startDate?: string | null;
  endDate?: string | null;
}

function number(value: any) {
  return Number(value || 0);
}

function array(value: any) {
  return Array.isArray(value) ? value : [];
}

function normalizeToday(data: any): SellerTodayData {
  const counts = data?.counts || {};
  return {
    ...(data || {}),
    counts: {
      followUpsDueToday: number(counts.followUpsDueToday),
      meetingsToday: number(counts.meetingsToday),
      overdueActivities: number(counts.overdueActivities),
      quotationsAwaitingResponse: number(counts.quotationsAwaitingResponse ?? counts.quotationFollowUps),
      paymentsAwaitingVerification: number(counts.paymentsAwaitingVerification),
      leadsNeedingAction: number(counts.leadsNeedingAction),
      academyPolicyAcknowledgements: number(counts.academyPolicyAcknowledgements),
      newBookings: number(counts.newBookings),
      quotationFollowUps: number(counts.quotationFollowUps),
      unreadNotifications: number(counts.unreadNotifications)
    },
    todayMeetings: array(data?.todayMeetings),
    followUpsDueToday: array(data?.followUpsDueToday),
    overdueActivities: array(data?.overdueActivities),
    leadActions: array(data?.leadActions),
    paymentVerificationActions: array(data?.paymentVerificationActions),
    quotationActions: array(data?.quotationActions),
    academyPolicyActions: array(data?.academyPolicyActions),
    upcomingMeetings: array(data?.upcomingMeetings),
    notifications: array(data?.notifications)
  };
}

function normalize(data: any): SellerCommandCenterData {
  const comparison = data?.comparison?.available === true
    ? {
        ...data.comparison,
        confirmedPaidSales: number(data.comparison.confirmedPaidSales),
        verifiedRevenue: number(data.comparison.verifiedRevenue),
        meetingsCompleted: number(data.comparison.meetingsCompleted),
        changes: {
          confirmedPaidSales: {
            absolute: number(data.comparison?.changes?.confirmedPaidSales?.absolute),
            percent: data.comparison?.changes?.confirmedPaidSales?.percent == null ? null : number(data.comparison.changes.confirmedPaidSales.percent)
          },
          verifiedRevenue: {
            absolute: number(data.comparison?.changes?.verifiedRevenue?.absolute),
            percent: data.comparison?.changes?.verifiedRevenue?.percent == null ? null : number(data.comparison.changes.verifiedRevenue.percent)
          },
          meetingsCompleted: {
            absolute: number(data.comparison?.changes?.meetingsCompleted?.absolute),
            percent: data.comparison?.changes?.meetingsCompleted?.percent == null ? null : number(data.comparison.changes.meetingsCompleted.percent)
          }
        }
      } as SellerPerformanceComparison
    : null;

  return {
    ...(data || {}),
    scope: data?.scope === 'team' ? 'team' : 'individual',
    period: {
      key: (data?.period?.key || 'month') as SellerDashboardPeriod,
      start: String(data?.period?.start || ''),
      end: String(data?.period?.end || '')
    },
    comparison,
    today: normalizeToday(data?.today),
    performance: {
      confirmedPaidSales: number(data?.performance?.confirmedPaidSales),
      verifiedRevenue: number(data?.performance?.verifiedRevenue),
      pipelineValue: number(data?.performance?.pipelineValue),
      monthlyTarget: Math.max(1, number(data?.performance?.monthlyTarget) || 1),
      monthlyTargetPaidSales: number(data?.performance?.monthlyTargetPaidSales ?? data?.performance?.confirmedPaidSales),
      targetCompletion: number(data?.performance?.targetCompletion),
      meetingsCompleted: number(data?.performance?.meetingsCompleted),
      productBreakdown: array(data?.performance?.productBreakdown).map((row: any) => ({
        ...row,
        sales: number(row.sales)
      }))
    },
    pipeline: array(data?.pipeline).map((row: any) => ({
      stage: String(row.stage || ''),
      count: number(row.count),
      value: number(row.value)
    })),
    commissions: {
      earned: number(data?.commissions?.earned),
      pendingVerification: number(data?.commissions?.pendingVerification ?? data?.commissions?.underReview),
      approved: number(data?.commissions?.approved),
      scheduled: number(data?.commissions?.scheduled),
      paid: number(data?.commissions?.paid),
      reversed: number(data?.commissions?.reversed),
      payoutSchedule: String(data?.commissions?.payoutSchedule || ''),
      upcomingPayout: data?.commissions?.upcomingPayout || null,
      entries: array(data?.commissions?.entries).map((entry: any) => ({
        ...entry,
        verifiedPaymentAmount: number(entry.verifiedPaymentAmount),
        baseRatePercent: number(entry.baseRatePercent),
        selfGeneratedBonusPercent: number(entry.selfGeneratedBonusPercent),
        performanceBonusPercent: number(entry.performanceBonusPercent),
        effectiveRatePercent: number(entry.effectiveRatePercent),
        commissionAmount: number(entry.commissionAmount)
      }))
    },
    quotations: {
      draft: number(data?.quotations?.draft),
      readyForApproval: number(data?.quotations?.readyForApproval),
      sent: number(data?.quotations?.sent),
      accepted: number(data?.quotations?.accepted),
      expired: number(data?.quotations?.expired)
    },
    payments: {
      awaitingCustomer: number(data?.payments?.awaitingCustomer),
      verificationPending: number(data?.payments?.verificationPending),
      overdue: number(data?.payments?.overdue),
      verifiedInPeriod: number(data?.payments?.verifiedInPeriod ?? data?.payments?.verifiedThisMonth)
    },
    recentSales: array(data?.recentSales),
    attention: array(data?.attention),
    careerProgression: data?.careerProgression || null,
    coreProducts: array(data?.coreProducts).map((product: any) => ({
      ...product,
      basePrice: number(product.basePrice),
      scope: array(product.scope),
      paymentSchedule: array(product.paymentSchedule),
      managerApprovalRequired: product.managerApprovalRequired === true
    })),
    saleActivation: array(data?.saleActivation) as SaleActivationState[]
  } as SellerCommandCenterData;
}

export const sellerCommandCenterService = {
  async get(query?: SellerCommandCenterQuery | string | null): Promise<SellerCommandCenterData> {
    const options: SellerCommandCenterQuery = typeof query === 'string'
      ? { salespersonId: query }
      : (query || {});

    const period = options.period || 'month';
    const [coreResult, activationResult] = await Promise.all([
      supabase.rpc('get_seller_command_center', {
        p_salesperson_id: options.salespersonId || null,
        p_period: period,
        p_start_date: period === 'custom' ? (options.startDate || null) : null,
        p_end_date: period === 'custom' ? (options.endDate || null) : null
      }),
      supabase.rpc('crm_get_sale_activation_queue')
    ]);
    if (coreResult.error) throw coreResult.error;
    if (activationResult.error) throw activationResult.error;
    return normalize({
      ...(coreResult.data || {}),
      saleActivation: array(activationResult.data),
    });
  }
};
