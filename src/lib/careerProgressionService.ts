import { supabase } from './supabase';

export type CareerProgressionReviewStatus = 'Eligible' | 'Under Review' | 'Proposal Offered' | 'Accepted' | 'Declined' | 'Not Offered' | 'No Longer Eligible';

export interface CareerProgressionCriterion {
  productCode: string;
  productName: string;
  requiredSales: number;
  currentSales?: number;
  met?: boolean;
  basePrice?: number;
  currency?: string;
  priceMode?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export interface CareerProgressionProgress {
  enabled: boolean;
  eligible: boolean;
  qualificationMode: 'ANY' | 'ALL';
  periodType: 'calendar_month' | 'rolling_30_days' | 'quarter';
  periodStart: string;
  periodEnd: string;
  policyVersion: number;
  totalVerifiedSales: number;
  minimumTotalSales: number;
  activeDays: number;
  minimumActiveDays: number;
  criteria: CareerProgressionCriterion[];
  managementReviewRequired: boolean;
  review?: any;
}

export interface CareerProgressionSettings {
  enabled: boolean;
  publicVisible: boolean;
  qualificationMode: 'ANY' | 'ALL';
  periodType: 'calendar_month' | 'rolling_30_days' | 'quarter';
  minimumTotalSales: number;
  minimumActiveDays: number;
  publicTitle: string;
  publicDescription: string;
  defaultMonthlySalary?: number | null;
  salaryCurrency: string;
  publicShowSalaryAmount: boolean;
  incentiveDescription: string;
  policyVersion: number;
}

export interface CareerProgressionAdminPayload {
  settings: CareerProgressionSettings;
  thresholds: CareerProgressionCriterion[];
  salespeople: Array<{
    userId: string;
    name: string;
    email: string;
    progress: CareerProgressionProgress;
    review?: any;
  }>;
}

const mapSettings = (raw: any): CareerProgressionSettings => ({
  enabled: Boolean(raw?.enabled),
  publicVisible: Boolean(raw?.public_visible ?? raw?.publicVisible),
  qualificationMode: (raw?.qualification_mode ?? raw?.qualificationMode ?? 'ANY') as 'ANY' | 'ALL',
  periodType: (raw?.period_type ?? raw?.periodType ?? 'calendar_month') as CareerProgressionSettings['periodType'],
  minimumTotalSales: Number(raw?.minimum_total_sales ?? raw?.minimumTotalSales ?? 0),
  minimumActiveDays: Number(raw?.minimum_active_days ?? raw?.minimumActiveDays ?? 0),
  publicTitle: raw?.public_title ?? raw?.publicTitle ?? '',
  publicDescription: raw?.public_description ?? raw?.publicDescription ?? '',
  defaultMonthlySalary: raw?.default_monthly_salary ?? raw?.defaultMonthlySalary ?? null,
  salaryCurrency: raw?.salary_currency ?? raw?.salaryCurrency ?? 'USD',
  publicShowSalaryAmount: Boolean(raw?.public_show_salary_amount ?? raw?.publicShowSalaryAmount),
  incentiveDescription: raw?.incentive_description ?? raw?.incentiveDescription ?? '',
  policyVersion: Number(raw?.policy_version ?? raw?.policyVersion ?? 1)
});

const mapProgress = (raw: any): CareerProgressionProgress => ({
  enabled: Boolean(raw?.enabled),
  eligible: Boolean(raw?.eligible),
  qualificationMode: (raw?.qualificationMode || 'ANY') as 'ANY' | 'ALL',
  periodType: (raw?.periodType || 'calendar_month') as CareerProgressionProgress['periodType'],
  periodStart: raw?.periodStart || '',
  periodEnd: raw?.periodEnd || '',
  policyVersion: Number(raw?.policyVersion || 1),
  totalVerifiedSales: Number(raw?.totalVerifiedSales || 0),
  minimumTotalSales: Number(raw?.minimumTotalSales || 0),
  activeDays: Number(raw?.activeDays || 0),
  minimumActiveDays: Number(raw?.minimumActiveDays || 0),
  criteria: Array.isArray(raw?.criteria) ? raw.criteria : [],
  managementReviewRequired: raw?.managementReviewRequired !== false,
  review: raw?.review || undefined
});

export const careerProgressionService = {
  async getMine(): Promise<CareerProgressionProgress> {
    const { data, error } = await supabase.rpc('get_my_sales_career_progression');
    if (error) throw error;
    return mapProgress(data || {});
  },

  async getAdmin(): Promise<CareerProgressionAdminPayload> {
    const { data, error } = await supabase.rpc('admin_get_sales_career_progression');
    if (error) throw error;
    return {
      settings: mapSettings(data?.settings || {}),
      thresholds: Array.isArray(data?.thresholds) ? data.thresholds.map((item: any) => ({
        productCode: item.productCode,
        productName: item.productName,
        requiredSales: Number(item.requiredSales || 0),
        basePrice: Number(item.basePrice || 0),
        currency: item.currency || 'USD',
        priceMode: item.priceMode || 'fixed',
        enabled: item.enabled !== false,
        sortOrder: Number(item.sortOrder || 0)
      })) : [],
      salespeople: Array.isArray(data?.salespeople) ? data.salespeople.map((person: any) => ({
        ...person,
        progress: mapProgress(person.progress || {})
      })) : []
    };
  },

  async save(settings: CareerProgressionSettings, thresholds: CareerProgressionCriterion[]): Promise<CareerProgressionAdminPayload> {
    const { data, error } = await supabase.rpc('admin_update_sales_career_progression', {
      p_settings: {
        enabled: settings.enabled,
        publicVisible: settings.publicVisible,
        qualificationMode: settings.qualificationMode,
        periodType: settings.periodType,
        minimumTotalSales: settings.minimumTotalSales,
        minimumActiveDays: settings.minimumActiveDays,
        publicTitle: settings.publicTitle,
        publicDescription: settings.publicDescription,
        defaultMonthlySalary: settings.defaultMonthlySalary ?? null,
        salaryCurrency: settings.salaryCurrency,
        publicShowSalaryAmount: settings.publicShowSalaryAmount,
        incentiveDescription: settings.incentiveDescription
      },
      p_thresholds: thresholds.map((item, index) => ({
        productCode: item.productCode,
        requiredSales: Number(item.requiredSales),
        enabled: item.enabled !== false,
        sortOrder: index + 1
      }))
    });
    if (error) throw error;
    return {
      settings: mapSettings(data?.settings || {}),
      thresholds: Array.isArray(data?.thresholds) ? data.thresholds : [],
      salespeople: Array.isArray(data?.salespeople) ? data.salespeople.map((person: any) => ({ ...person, progress: mapProgress(person.progress || {}) })) : []
    };
  },

  async updateReview(reviewId: string, status: CareerProgressionReviewStatus, notes?: string, monthlySalary?: number | null, currency?: string, incentiveNotes?: string) {
    const { data, error } = await supabase.rpc('admin_update_sales_career_progression_review', {
      p_review_id: reviewId,
      p_status: status,
      p_notes: notes || null,
      p_monthly_salary: monthlySalary ?? null,
      p_currency: currency || null,
      p_incentive_notes: incentiveNotes || null
    });
    if (error) throw error;
    return data;
  }
};
