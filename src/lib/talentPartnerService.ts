import { supabase } from './supabase';

const ATTRIBUTION_KEY = 'profox:talent-partner-attribution:v1';
const SESSION_KEY = 'profox:talent-partner-session:v1';

export type TalentPartnerStatus = 'Pending' | 'Active' | 'Suspended' | 'Closed';
export type TalentRewardModel = 'sales' | 'project' | 'none';
export type TalentRewardStatus = 'Pending' | 'Approved' | 'Paid' | 'Reversed';

export interface TalentPartnerAttribution {
  partnerCode: string;
  sessionId: string;
  firstSeenAt: string;
  expiresAt: string;
  firstJobSlug?: string;
}

export interface TalentPartnerRewardPlan {
  enabled: boolean;
  rewardModel: TalentRewardModel;
  qualifyingEventCount: number;
  eventRewards: Array<{ rank: number; kind: 'percent' | 'fixed'; ratePercent?: number; fixedAmount?: number }>;
  retentionEnabled: boolean;
  retentionMonths: number;
  retentionRewardKind: 'percent' | 'fixed';
  retentionRatePercent: number;
  retentionFixedAmount: number;
  currency: string;
}

export interface TalentPartnerDashboard {
  profile: {
    userId: string;
    partnerCode: string;
    status: TalentPartnerStatus;
    fullName: string;
    email: string;
    companyName?: string;
    websiteUrl?: string;
    promotionChannels?: string[];
    payoutMethod?: string;
    payoutEmail?: string;
    preferredCurrency?: string;
    createdAt?: string;
  };
  stats: {
    visits: number;
    uniqueVisitors: number;
    applications: number;
    activatedHires: number;
    retainedHires: number;
    pendingEarnings: number;
    approvedEarnings: number;
    paidEarnings: number;
  };
  jobs: Array<{
    id: string;
    slug: string;
    title: string;
    shortSummary?: string;
    department?: string;
    location?: string;
    engagementType?: string;
    rewardPlan?: TalentPartnerRewardPlan | null;
  }>;
  referrals: Array<{
    id: string;
    applicationReference?: string;
    candidateName: string;
    jobTitle: string;
    jobSlug?: string;
    status: string;
    attributedAt?: string;
    activatedAt?: string;
    retentionEligibleAt?: string;
    performanceRewards?: Array<{ type: string; rank?: number; amount: number; currency: string; status: string; createdAt: string }>;
    salaryTransition?: { status: string; effectiveDate?: string; qualifyingDate?: string } | null;
  }>;
  rewards: Array<{
    id: string;
    eventType: 'sale' | 'project' | 'retention';
    eventRank?: number;
    eligibleAmount?: number;
    currency: string;
    rewardAmount: number;
    status: TalentRewardStatus;
    availableAt?: string;
    createdAt: string;
    jobTitle?: string;
  }>;
  payouts: Array<{
    id: string;
    batchNumber?: string;
    amount: number;
    currency: string;
    status: string;
    transactionId?: string;
    paidAt?: string;
    createdAt?: string;
  }>;
  notifications: Array<{ id: string; type: string; title: string; message: string; actionPath?: string; readAt?: string; createdAt: string }>;
  resources: Array<{ id: string; jobId?: string; title: string; type: string; content?: string; url?: string }>;
  sourceBreakdown: Array<{ source: string; visits: number; uniqueVisitors: number }>;
}

export interface TalentPartnerAdminData {
  settings: any;
  partners: any[];
  plans: any[];
  jobs: any[];
  referrals: any[];
  applicants: any[];
  rewards: any[];
  payoutBatches: any[];
  payouts: any[];
  completedProjects: any[];
  projectTeam: any[];
  resources: any[];
}

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function getSessionId() {
  if (typeof window === 'undefined') return randomId();
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = randomId();
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return randomId();
  }
}

function readAttribution(): TalentPartnerAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TalentPartnerAttribution;
    if (!parsed?.partnerCode || !parsed?.sessionId || !parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(ATTRIBUTION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveAttribution(value: TalentPartnerAttribution) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value)); } catch { /* storage can be unavailable */ }
}

function jobSlugFromPath(pathname: string) {
  const match = pathname.match(/^\/careers\/([^/?#]+)(?:\/apply)?\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function deviceCategory() {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent || '';
  if (/ipad|tablet/i.test(ua)) return 'Tablet';
  if (/mobile|android|iphone/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function referrerHost() {
  if (typeof document === 'undefined' || !document.referrer) return '';
  try { return new URL(document.referrer).hostname; } catch { return ''; }
}

function safeError(error: any, fallback: string) {
  return error?.message || error?.error_description || fallback;
}

export const talentPartnerService = {
  getAttribution: readAttribution,

  buildReferralUrl(jobSlug: string, partnerCode: string) {
    if (typeof window === 'undefined') return `/careers/${encodeURIComponent(jobSlug)}?ref=${encodeURIComponent(partnerCode)}`;
    const url = new URL(`/careers/${encodeURIComponent(jobSlug)}`, window.location.origin);
    url.searchParams.set('ref', partnerCode);
    return url.toString();
  },

  buildShortReferralUrl(jobSlug: string, partnerCode: string) {
    if (typeof window === 'undefined') return `/r/${encodeURIComponent(partnerCode)}/${encodeURIComponent(jobSlug)}`;
    return new URL(`/r/${encodeURIComponent(partnerCode)}/${encodeURIComponent(jobSlug)}`, window.location.origin).toString();
  },

  async captureReferralFromLocation() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const incomingCode = (params.get('ref') || '').trim().toUpperCase();
    const jobSlug = jobSlugFromPath(window.location.pathname);
    if (!incomingCode || !jobSlug) return readAttribution();

    const existing = readAttribution();
    // First valid touch stays authoritative in browser state. The server independently validates
    // the earliest valid visit for the application/job before creating referral ownership.
    const candidateCode = existing?.partnerCode || incomingCode;
    const sessionId = getSessionId();

    const { data, error } = await supabase.rpc('public_track_talent_partner_visit', {
      p_partner_code: candidateCode,
      p_job_slug: jobSlug,
      p_session_id: sessionId,
      p_context: {
        utmSource: params.get('utm_source') || '',
        utmMedium: params.get('utm_medium') || '',
        utmCampaign: params.get('utm_campaign') || '',
        utmContent: params.get('utm_content') || '',
        referrerHost: referrerHost(),
        landingPath: `${window.location.pathname}${window.location.search}`,
        deviceCategory: deviceCategory(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        locale: navigator.language || ''
      }
    });

    if (error || !data?.success) {
      // If an old stored code is no longer active, allow a new explicitly supplied valid code to
      // become the first current attribution rather than trapping the visitor in stale state.
      if (existing && incomingCode !== existing.partnerCode) {
        const retry = await supabase.rpc('public_track_talent_partner_visit', {
          p_partner_code: incomingCode,
          p_job_slug: jobSlug,
          p_session_id: sessionId,
          p_context: {
            utmSource: params.get('utm_source') || '', utmMedium: params.get('utm_medium') || '',
            utmCampaign: params.get('utm_campaign') || '', utmContent: params.get('utm_content') || '',
            referrerHost: referrerHost(), landingPath: `${window.location.pathname}${window.location.search}`,
            deviceCategory: deviceCategory(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '', locale: navigator.language || ''
          }
        });
        if (!retry.error && retry.data?.success) {
          const days = Number(retry.data.attributionWindowDays || 30);
          const next: TalentPartnerAttribution = {
            partnerCode: incomingCode,
            sessionId,
            firstSeenAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
            firstJobSlug: jobSlug
          };
          saveAttribution(next);
          return next;
        }
      }
      return existing;
    }

    if (existing) return existing;
    const days = Number(data.attributionWindowDays || 30);
    const next: TalentPartnerAttribution = {
      partnerCode: String(data.partnerCode || incomingCode),
      sessionId,
      firstSeenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
      firstJobSlug: jobSlug
    };
    saveAttribution(next);
    return next;
  },

  async claimApplication(applicationReference?: string, email?: string) {
    const attribution = readAttribution();
    if (!applicationReference || !email || !attribution) return { success: false, skipped: true };
    try {
      const { data, error } = await supabase.rpc('public_claim_talent_partner_application', {
        p_application_reference: applicationReference,
        p_email: email.trim().toLowerCase(),
        p_partner_code: attribution.partnerCode,
        p_session_id: attribution.sessionId
      });
      if (error) return { success: false, error: error.message };
      return data || { success: false };
    } catch (error: any) {
      return { success: false, error: safeError(error, 'Referral attribution could not be confirmed.') };
    }
  },

  async signUp(fullName: string, email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(), password,
      options: { data: { full_name: fullName.trim(), account_intent: 'talent_partner' } }
    });
    if (error) throw new Error(safeError(error, 'Could not create the Talent Partner account.'));
    if (data.session) await this.requestAccount(fullName);
    return data;
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new Error(safeError(error, 'Could not sign in.'));
    return data;
  },

  async signOut() { await supabase.auth.signOut(); },

  async requestAccount(fullName: string) {
    const { data, error } = await supabase.rpc('request_talent_partner_account', {
      p_full_name: fullName.trim(), p_terms_version: '2026-08-29'
    });
    if (error) throw new Error(safeError(error, 'Could not initialize the Talent Partner account.'));
    return data;
  },

  async getDashboard(): Promise<TalentPartnerDashboard> {
    const { data, error } = await supabase.rpc('talent_partner_get_dashboard');
    if (error) throw new Error(safeError(error, 'Could not load the Talent Partner dashboard.'));
    return data as TalentPartnerDashboard;
  },

  async updateMyProfile(values: {
    companyName?: string; websiteUrl?: string; promotionChannels?: string[];
    payoutMethod?: string; payoutEmail?: string; preferredCurrency?: string;
  }) {
    const { data, error } = await supabase.rpc('talent_partner_update_my_profile', {
      p_company_name: values.companyName || null,
      p_website_url: values.websiteUrl || null,
      p_promotion_channels: values.promotionChannels || [],
      p_payout_method: values.payoutMethod || null,
      p_payout_email: values.payoutEmail || null,
      p_preferred_currency: values.preferredCurrency || null
    });
    if (error) throw new Error(safeError(error, 'Could not update your Talent Partner profile.'));
    return data;
  },

  async markNotificationRead(id: string) {
    const { error } = await supabase.rpc('talent_partner_mark_notification_read', { p_notification_id: id });
    if (error) throw error;
  },

  async getAdminData(): Promise<TalentPartnerAdminData> {
    const [settings, partners, plans, jobs, referrals, applicants, rewards, payoutBatches, payouts, completedProjects, projectTeam, resources] = await Promise.all([
      supabase.from('talent_partner_program_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('talent_partner_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('talent_partner_reward_plans').select('*'),
      supabase.from('career_jobs').select('id,slug,title,department,application_type,status,role_details').order('display_order'),
      supabase.from('talent_partner_referrals').select('*').order('attributed_at', { ascending: false }),
      supabase.from('applicants').select('id,application_reference,full_name,email,stage,career_job_id,linked_user_id,refusal_reason'),
      supabase.from('talent_partner_reward_entries').select('*').order('created_at', { ascending: false }),
      supabase.from('talent_partner_payout_batches').select('*').order('created_at', { ascending: false }),
      supabase.from('talent_partner_payouts').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,project_number,project_name,status,stage,completed_at,currency').eq('status', 'Completed').eq('stage', 'Completed').order('completed_at', { ascending: false }),
      supabase.from('project_team').select('project_id,user_id,role,assigned_at'),
      supabase.from('talent_partner_resources').select('*').order('sort_order').order('created_at')
    ]);
    const failures = [settings, partners, plans, jobs, referrals, applicants, rewards, payoutBatches, payouts, completedProjects, projectTeam, resources].filter((result: any) => result.error);
    if (failures.length) throw new Error(failures[0].error.message || 'Talent Partner administration data could not be loaded.');
    return {
      settings: settings.data || {}, partners: partners.data || [], plans: plans.data || [], jobs: jobs.data || [],
      referrals: referrals.data || [], applicants: applicants.data || [], rewards: rewards.data || [],
      payoutBatches: payoutBatches.data || [], payouts: payouts.data || [], completedProjects: completedProjects.data || [],
      projectTeam: projectTeam.data || [], resources: resources.data || []
    };
  },

  async adminSetPartnerStatus(userId: string, status: TalentPartnerStatus, notes = '') {
    const { data, error } = await supabase.rpc('admin_set_talent_partner_status', { p_partner_user_id: userId, p_status: status, p_notes: notes || null });
    if (error) throw error; return data;
  },

  async adminSaveSettings(settings: any) {
    const { data, error } = await supabase.rpc('admin_save_talent_partner_program_settings', { p_settings: settings });
    if (error) throw error; return data;
  },

  async adminSavePlan(jobId: string, plan: any) {
    const { data, error } = await supabase.rpc('admin_save_talent_partner_reward_plan', {
      p_job_id: jobId,
      p_enabled: Boolean(plan.enabled),
      p_reward_model: plan.rewardModel,
      p_qualifying_event_count: Number(plan.qualifyingEventCount || 3),
      p_event_rewards: plan.eventRewards || [],
      p_retention_enabled: Boolean(plan.retentionEnabled),
      p_retention_months: Number(plan.retentionMonths || 6),
      p_retention_reward_kind: plan.retentionRewardKind || 'fixed',
      p_retention_rate_percent: Number(plan.retentionRatePercent || 0),
      p_retention_fixed_amount: Number(plan.retentionFixedAmount || 0),
      p_currency: plan.currency || 'USD',
      p_payout_hold_days: plan.payoutHoldDays === '' || plan.payoutHoldDays == null ? null : Number(plan.payoutHoldDays)
    });
    if (error) throw error; return data;
  },

  async adminApproveProjectReward(referralId: string, projectId: string, amount: number, currency: string, notes = '') {
    const { data, error } = await supabase.rpc('admin_approve_talent_partner_project_reward', {
      p_referral_id: referralId, p_project_id: projectId, p_worker_payment_amount: amount, p_currency: currency, p_notes: notes || null
    });
    if (error) throw error; return data;
  },

  async adminRecordSalaryTransition(referralId: string, effectiveDate: string, monthlySalary: number | null, currency: string, notes = '') {
    const { data, error } = await supabase.rpc('admin_record_talent_partner_salary_transition', {
      p_referral_id: referralId, p_effective_date: effectiveDate, p_monthly_salary: monthlySalary, p_currency: currency, p_notes: notes || null
    });
    if (error) throw error; return data;
  },

  async adminUpdateRewardStatus(rewardId: string, status: 'Approved' | 'Reversed', reason = '') {
    const { data, error } = await supabase.rpc('admin_update_talent_partner_reward_status', { p_reward_id: rewardId, p_status: status, p_reason: reason || null });
    if (error) throw error; return data;
  },

  async adminCreatePayoutBatch() {
    const { data, error } = await supabase.rpc('admin_create_talent_partner_payout_batch');
    if (error) throw error; return data;
  },

  async adminMarkPayoutPaid(payoutId: string, transactionId: string) {
    const { data, error } = await supabase.rpc('admin_mark_talent_partner_payout_paid', { p_payout_id: payoutId, p_transaction_id: transactionId });
    if (error) throw error; return data;
  },

  async adminRefreshRewards() {
    const { data, error } = await supabase.rpc('admin_refresh_talent_partner_rewards');
    if (error) throw error; return data;
  },

  async adminOverrideReferral(applicantId: string, partnerUserId: string, reason: string) {
    const { data, error } = await supabase.rpc('admin_override_talent_partner_referral', { p_applicant_id: applicantId, p_partner_user_id: partnerUserId, p_reason: reason });
    if (error) throw error; return data;
  }
};
