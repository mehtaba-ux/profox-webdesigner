import { supabase } from './supabase';

export interface SalesAccountSetupStatus {
  userId: string;
  profilePhotoReady: boolean;
  timezoneReady: boolean;
  googleCalendarConnected: boolean;
  googleMeetReady: boolean;
  googleAccountEmail: string;
  googleCalendarTimezone: string;
  availabilityReady: boolean;
  workingDays: number[];
  workStart?: string | null;
  workEnd?: string | null;
  crmTourStep: number;
  crmTourCompleted: boolean;
  setupCompleted: boolean;
  completedAt?: string | null;
  startedAt?: string | null;
  progressPercent: number;
}

function normalizeStatus(value: any): SalesAccountSetupStatus {
  return {
    userId: String(value?.userId || ''),
    profilePhotoReady: Boolean(value?.profilePhotoReady),
    timezoneReady: Boolean(value?.timezoneReady),
    googleCalendarConnected: Boolean(value?.googleCalendarConnected),
    googleMeetReady: Boolean(value?.googleMeetReady),
    googleAccountEmail: String(value?.googleAccountEmail || ''),
    googleCalendarTimezone: String(value?.googleCalendarTimezone || ''),
    availabilityReady: Boolean(value?.availabilityReady),
    workingDays: Array.isArray(value?.workingDays) ? value.workingDays.map(Number) : [],
    workStart: value?.workStart ?? null,
    workEnd: value?.workEnd ?? null,
    crmTourStep: Math.max(0, Math.min(6, Number(value?.crmTourStep || 0))),
    crmTourCompleted: Boolean(value?.crmTourCompleted),
    setupCompleted: Boolean(value?.setupCompleted),
    completedAt: value?.completedAt ?? null,
    startedAt: value?.startedAt ?? null,
    progressPercent: Math.max(0, Math.min(100, Number(value?.progressPercent || 0))),
  };
}

export const salesAccountSetupService = {
  async getMyStatus(): Promise<SalesAccountSetupStatus> {
    const { data, error } = await supabase.rpc('get_my_sales_account_setup_status');
    if (error) throw error;
    return normalizeStatus(data);
  },

  async advanceCrmTour(step: number): Promise<SalesAccountSetupStatus> {
    const { data, error } = await supabase.rpc('advance_my_sales_crm_setup_tour', { p_step: step });
    if (error) throw error;
    return normalizeStatus(data);
  },
};
