import { supabase } from './supabase';

export type SalesPerformanceReviewType =
  | 'day_7_checkin'
  | 'day_30_review'
  | 'day_60_review'
  | 'day_90_final'
  | 'first_20_quality'
  | 'weekly_coaching';

export type SalesPerformanceReviewStatus = 'Scheduled' | 'In Review' | 'Completed' | 'Cancelled';
export type SalesPerformanceDecision = 'Continue' | 'Extend Review' | 'Restrict Scope' | 'Close Engagement';
export type SalesPerformanceManagementAction = 'Coaching' | 'Re-certification' | 'Supervised Calls' | 'Temporary Access Restriction' | 'Improvement Plan';
export type SalesPerformanceQualityKey =
  | 'customerConduct'
  | 'preparation'
  | 'crmAccuracy'
  | 'productAccuracy'
  | 'followUpReliability'
  | 'pipelineHealth'
  | 'conversion'
  | 'learning'
  | 'policyCompliance';

export const SALES_PERFORMANCE_QUALITY_AREAS: Array<{ key: SalesPerformanceQualityKey; label: string; help: string }> = [
  { key: 'customerConduct', label: 'Customer conduct', help: 'Professionalism, truthfulness and respectful prospect/customer handling.' },
  { key: 'preparation', label: 'Preparation', help: 'Research, call/meeting readiness and use of approved playbooks.' },
  { key: 'crmAccuracy', label: 'CRM accuracy', help: 'Complete factual records, ownership, next actions and timely logging.' },
  { key: 'productAccuracy', label: 'Product accuracy', help: 'Correct scope, package, pricing-authority and service representation.' },
  { key: 'followUpReliability', label: 'Follow-up reliability', help: 'Agreed actions completed on time with clear next steps.' },
  { key: 'pipelineHealth', label: 'Pipeline health', help: 'Qualified opportunities, realistic stages and healthy forward movement.' },
  { key: 'conversion', label: 'Conversion', help: 'Progress from outreach and meetings toward qualified commercial outcomes.' },
  { key: 'learning', label: 'Learning & coachability', help: 'Applies feedback, improves execution and completes required coaching.' },
  { key: 'policyCompliance', label: 'Policy compliance', help: 'Follows CRM, pricing, confidentiality, ethics and approval rules.' }
];

export const SALES_PERFORMANCE_MANAGEMENT_ACTIONS: SalesPerformanceManagementAction[] = [
  'Coaching',
  'Re-certification',
  'Supervised Calls',
  'Temporary Access Restriction',
  'Improvement Plan'
];

export interface SalesPerformanceSettings {
  enabled: boolean;
  reviewDay7: number;
  reviewDay30: number;
  reviewDay60: number;
  reviewDay90: number;
  firstInteractionReviewCount: number;
  weeklyCoachingIntervalDays: number;
  crmLoggingTargetPercent: number;
  policyVersion: number;
  updatedAt?: string | null;
}

export type SalesPerformanceMetricAvailability = 'AVAILABLE' | 'INSUFFICIENT_DATA' | 'NOT_TRACKED_AUTHORITATIVELY';

export interface SalesPerformanceQualityMetric {
  key: string;
  label: string;
  availability: SalesPerformanceMetricAvailability;
  value?: unknown;
  numerator?: number | null;
  denominator?: number | null;
  rate?: number | null;
  sampleSize: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  source?: string | null;
  sourceVersion?: string | null;
  notes?: string | null;
  [key: string]: unknown;
}

export interface SalesPerformancePeriod {
  start?: string | null;
  end?: string | null;
  days?: number | null;
  timezone?: string | null;
  boundary?: string | null;
  effectiveThrough?: string | null;
}

export interface SalesPerformanceCurrentOperationalHealth {
  asOf?: string | null;
  currentOpenOpportunities: number;
  currentMissingNextAction: number;
  currentOverdueNextAction: number;
  source?: string | null;
}

export interface SalesPerformanceSnapshot {
  schemaVersion?: number;
  period?: SalesPerformancePeriod;
  activationDate?: string | null;
  daysActive?: number | null;
  customerInteractions: number;
  crmActivitiesLogged: number;
  crmActivitiesCompleted: number;
  overdueActivities: number;
  leadsOwned: number;
  openOpportunities: number;
  wonOpportunities: number;
  pipelineValue: number;
  opportunitiesMissingNextFollowUp: number;
  meetingsScheduled: number;
  meetingsCompleted: number;
  meetingNoShows: number;
  quotationsCreated: number;
  quotationsSent: number;
  quotationsAccepted: number;
  verifiedPayments: number;
  verifiedSales: number;
  commissionEntries: number;
  qualityEvidence: Record<string, SalesPerformanceQualityMetric>;
  currentOperationalHealth: SalesPerformanceCurrentOperationalHealth;
  supportingEvidence: Record<string, unknown>;
  attribution: Record<string, unknown>;
}

export interface SalesPerformanceReview {
  id: string;
  salespersonId: string;
  applicantId?: string | null;
  reviewKey: string;
  reviewType: SalesPerformanceReviewType;
  scheduledFor: string;
  periodStart: string;
  periodEnd: string;
  status: SalesPerformanceReviewStatus;
  decision?: SalesPerformanceDecision | null;
  metricsSnapshot: Record<string, unknown>;
  qualityEvidence: Partial<Record<SalesPerformanceQualityKey, string>>;
  requiredActions: SalesPerformanceManagementAction[];
  strengths: string;
  coachingActions: string;
  risks: string;
  reviewNotes: string;
  scopeRestrictions: string;
  improvementPlan: string;
  ownerId?: string | null;
  completedBy?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SalesPerformanceSellerPayload {
  settings: SalesPerformanceSettings;
  activation: {
    applicantId?: string | null;
    activationDate?: string | null;
    activationAt?: string | null;
    applicantStage?: string | null;
    finalApproval?: boolean;
  };
  daysActive?: number | null;
  phase: string;
  snapshot: SalesPerformanceSnapshot;
  nextReview?: SalesPerformanceReview | null;
  reviews: SalesPerformanceReview[];
}

export interface SalesPerformanceAdminPerson {
  userId: string;
  name: string;
  email: string;
  role: string;
  activation: SalesPerformanceSellerPayload['activation'];
  snapshot: SalesPerformanceSnapshot;
  nextReview?: SalesPerformanceReview | null;
  reviews: SalesPerformanceReview[];
}

export interface SalesPerformanceAdminPayload {
  settings: SalesPerformanceSettings;
  salespeople: SalesPerformanceAdminPerson[];
}

const n = (value: unknown) => Number(value || 0);

function mapSettings(raw: any): SalesPerformanceSettings {
  return {
    enabled: raw?.enabled !== false,
    reviewDay7: n(raw?.review_day_7 ?? raw?.reviewDay7 ?? 7),
    reviewDay30: n(raw?.review_day_30 ?? raw?.reviewDay30 ?? 30),
    reviewDay60: n(raw?.review_day_60 ?? raw?.reviewDay60 ?? 60),
    reviewDay90: n(raw?.review_day_90 ?? raw?.reviewDay90 ?? 90),
    firstInteractionReviewCount: n(raw?.first_interaction_review_count ?? raw?.firstInteractionReviewCount ?? 20),
    weeklyCoachingIntervalDays: n(raw?.weekly_coaching_interval_days ?? raw?.weeklyCoachingIntervalDays ?? 7),
    crmLoggingTargetPercent: n(raw?.crm_logging_target_percent ?? raw?.crmLoggingTargetPercent ?? 100),
    policyVersion: n(raw?.policy_version ?? raw?.policyVersion ?? 1),
    updatedAt: raw?.updated_at ?? raw?.updatedAt ?? null
  };
}

function mapMetric(raw: any): SalesPerformanceQualityMetric {
  return {
    ...(raw && typeof raw === 'object' ? raw : {}),
    key: String(raw?.key || ''),
    label: String(raw?.label || raw?.key || 'Metric'),
    availability: (raw?.availability || 'INSUFFICIENT_DATA') as SalesPerformanceMetricAvailability,
    sampleSize: n(raw?.sampleSize)
  };
}

function mapSnapshot(raw: any): SalesPerformanceSnapshot {
  const qualityRaw = raw?.qualityEvidence && typeof raw.qualityEvidence === 'object' ? raw.qualityEvidence : {};
  return {
    schemaVersion: raw?.schemaVersion == null ? undefined : n(raw.schemaVersion),
    period: raw?.period && typeof raw.period === 'object' ? raw.period : undefined,
    activationDate: raw?.activationDate ?? null,
    daysActive: raw?.daysActive == null ? null : n(raw.daysActive),
    customerInteractions: n(raw?.customerInteractions),
    crmActivitiesLogged: n(raw?.crmActivitiesLogged),
    crmActivitiesCompleted: n(raw?.crmActivitiesCompleted),
    overdueActivities: n(raw?.overdueActivities),
    leadsOwned: n(raw?.leadsOwned),
    openOpportunities: n(raw?.openOpportunities),
    wonOpportunities: n(raw?.wonOpportunities),
    pipelineValue: n(raw?.pipelineValue),
    opportunitiesMissingNextFollowUp: n(raw?.opportunitiesMissingNextFollowUp),
    meetingsScheduled: n(raw?.meetingsScheduled),
    meetingsCompleted: n(raw?.meetingsCompleted),
    meetingNoShows: n(raw?.meetingNoShows),
    quotationsCreated: n(raw?.quotationsCreated),
    quotationsSent: n(raw?.quotationsSent),
    quotationsAccepted: n(raw?.quotationsAccepted),
    verifiedPayments: n(raw?.verifiedPayments),
    verifiedSales: n(raw?.verifiedSales),
    commissionEntries: n(raw?.commissionEntries),
    qualityEvidence: Object.fromEntries(Object.entries(qualityRaw).map(([key, value]) => [key, mapMetric(value)])),
    currentOperationalHealth: {
      asOf: raw?.currentOperationalHealth?.asOf ?? null,
      currentOpenOpportunities: n(raw?.currentOperationalHealth?.currentOpenOpportunities),
      currentMissingNextAction: n(raw?.currentOperationalHealth?.currentMissingNextAction),
      currentOverdueNextAction: n(raw?.currentOperationalHealth?.currentOverdueNextAction),
      source: raw?.currentOperationalHealth?.source ?? null
    },
    supportingEvidence: raw?.supportingEvidence && typeof raw.supportingEvidence === 'object' ? raw.supportingEvidence : {},
    attribution: raw?.attribution && typeof raw.attribution === 'object' ? raw.attribution : {}
  };
}

function mapReview(raw: any): SalesPerformanceReview {
  return {
    id: String(raw?.id || ''),
    salespersonId: String(raw?.salesperson_id ?? raw?.salespersonId ?? ''),
    applicantId: raw?.applicant_id ?? raw?.applicantId ?? null,
    reviewKey: String(raw?.review_key ?? raw?.reviewKey ?? ''),
    reviewType: (raw?.review_type ?? raw?.reviewType ?? 'weekly_coaching') as SalesPerformanceReviewType,
    scheduledFor: String(raw?.scheduled_for ?? raw?.scheduledFor ?? ''),
    periodStart: String(raw?.period_start ?? raw?.periodStart ?? ''),
    periodEnd: String(raw?.period_end ?? raw?.periodEnd ?? ''),
    status: (raw?.status ?? 'Scheduled') as SalesPerformanceReviewStatus,
    decision: (raw?.decision ?? null) as SalesPerformanceDecision | null,
    metricsSnapshot: raw?.metrics_snapshot ?? raw?.metricsSnapshot ?? {},
    qualityEvidence: raw?.quality_evidence ?? raw?.qualityEvidence ?? {},
    requiredActions: Array.isArray(raw?.required_actions ?? raw?.requiredActions)
      ? (raw?.required_actions ?? raw?.requiredActions) as SalesPerformanceManagementAction[]
      : [],
    strengths: String(raw?.strengths || ''),
    coachingActions: String(raw?.coaching_actions ?? raw?.coachingActions ?? ''),
    risks: String(raw?.risks || ''),
    reviewNotes: String(raw?.review_notes ?? raw?.reviewNotes ?? ''),
    scopeRestrictions: String(raw?.scope_restrictions ?? raw?.scopeRestrictions ?? ''),
    improvementPlan: String(raw?.improvement_plan ?? raw?.improvementPlan ?? ''),
    ownerId: raw?.owner_id ?? raw?.ownerId ?? null,
    completedBy: raw?.completed_by ?? raw?.completedBy ?? null,
    completedAt: raw?.completed_at ?? raw?.completedAt ?? null,
    createdAt: raw?.created_at ?? raw?.createdAt ?? null,
    updatedAt: raw?.updated_at ?? raw?.updatedAt ?? null
  };
}

function mapPerson(person: any): SalesPerformanceAdminPerson {
  return {
    userId: String(person?.userId || ''),
    name: String(person?.name || person?.email || 'Sales Representative'),
    email: String(person?.email || ''),
    role: String(person?.role || ''),
    activation: person?.activation || {},
    snapshot: mapSnapshot(person?.snapshot || {}),
    nextReview: person?.nextReview?.id ? mapReview(person.nextReview) : null,
    reviews: Array.isArray(person?.reviews) ? person.reviews.map(mapReview) : []
  };
}

function mapSellerPayload(raw: any): SalesPerformanceSellerPayload {
  const nextRaw = raw?.nextReview;
  return {
    settings: mapSettings(raw?.settings || {}),
    activation: raw?.activation || {},
    daysActive: raw?.daysActive == null ? null : n(raw.daysActive),
    phase: String(raw?.phase || ''),
    snapshot: mapSnapshot(raw?.snapshot || {}),
    nextReview: nextRaw && nextRaw.id ? mapReview(nextRaw) : null,
    reviews: Array.isArray(raw?.reviews) ? raw.reviews.map(mapReview) : []
  };
}

function mapAdminPayload(raw: any): SalesPerformanceAdminPayload {
  return {
    settings: mapSettings(raw?.settings || {}),
    salespeople: Array.isArray(raw?.salespeople) ? raw.salespeople.map(mapPerson) : []
  };
}

export const salesPerformanceService = {
  async getMine(): Promise<SalesPerformanceSellerPayload> {
    const { data, error } = await supabase.rpc('get_my_sales_performance');
    if (error) throw error;
    return mapSellerPayload(data || {});
  },

  async getAdmin(): Promise<SalesPerformanceAdminPayload> {
    const { data, error } = await supabase.rpc('admin_get_sales_performance');
    if (error) throw error;
    return mapAdminPayload(data || {});
  },

  async getPeriodSnapshot(salespersonId: string, periodStart: string, periodEnd: string): Promise<SalesPerformanceSnapshot> {
    const { data, error } = await supabase.rpc('get_sales_performance_period_snapshot', {
      p_salesperson_id: salespersonId,
      p_period_start: periodStart,
      p_period_end: periodEnd
    });
    if (error) throw error;
    return mapSnapshot(data || {});
  },

  async saveSettings(settings: SalesPerformanceSettings): Promise<SalesPerformanceAdminPayload> {
    const { data, error } = await supabase.rpc('admin_update_sales_performance_settings', {
      p_settings: {
        enabled: settings.enabled,
        reviewDay7: settings.reviewDay7,
        reviewDay30: settings.reviewDay30,
        reviewDay60: settings.reviewDay60,
        reviewDay90: settings.reviewDay90,
        firstInteractionReviewCount: settings.firstInteractionReviewCount,
        weeklyCoachingIntervalDays: settings.weeklyCoachingIntervalDays,
        crmLoggingTargetPercent: settings.crmLoggingTargetPercent
      }
    });
    if (error) throw error;
    return mapAdminPayload(data || {});
  },

  async updateReview(input: {
    reviewId: string;
    status: SalesPerformanceReviewStatus;
    decision?: SalesPerformanceDecision | null;
    qualityEvidence?: Partial<Record<SalesPerformanceQualityKey, string>>;
    requiredActions?: SalesPerformanceManagementAction[];
    strengths?: string;
    coachingActions?: string;
    risks?: string;
    reviewNotes?: string;
    scopeRestrictions?: string;
    improvementPlan?: string;
  }): Promise<{ review: SalesPerformanceReview; accessActionRequired: boolean; message: string }> {
    const { data, error } = await supabase.rpc('admin_update_sales_performance_review', {
      p_review_id: input.reviewId,
      p_status: input.status,
      p_decision: input.decision || null,
      p_strengths: input.strengths || null,
      p_coaching_actions: input.coachingActions || null,
      p_risks: input.risks || null,
      p_review_notes: input.reviewNotes || null,
      p_scope_restrictions: input.scopeRestrictions || null,
      p_improvement_plan: input.improvementPlan || null,
      p_quality_evidence: input.qualityEvidence || {},
      p_required_actions: input.requiredActions || []
    });
    if (error) throw error;
    return {
      review: mapReview(data?.review || {}),
      accessActionRequired: Boolean(data?.accessActionRequired),
      message: String(data?.message || 'Performance review updated.')
    };
  }
};
