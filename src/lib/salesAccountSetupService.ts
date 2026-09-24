import { supabase } from './supabase';

export type ProfessionalEmailSendConnectionStatus = 'disconnected' | 'connected' | 'reconnect_required' | 'error';

export interface SalesAccountSetupStatus {
  userId: string;
  profilePhotoReady: boolean;
  timezoneReady: boolean;
  professionalEmailRequired: boolean;
  professionalEmailReady: boolean;
  professionalEmailCredentialPending: boolean;
  professionalEmailAuthorizedOnce: boolean;
  professionalEmailSendConnected: boolean;
  professionalEmailSendConnectionStatus: ProfessionalEmailSendConnectionStatus;
  professionalEmailAdminManaged: boolean;
  workEmail: string;
  mailProvider: 'none' | 'zoho';
  calendarProvider: 'google' | 'zoho';
  meetingProvider: 'google_meet' | 'zoho_meeting';
  calendarConnected: boolean;
  meetingReady: boolean;
  googleCalendarConnected: boolean;
  googleMeetReady: boolean;
  googleAccountEmail: string;
  googleCalendarTimezone: string;
  zohoCalendarConnected: boolean;
  zohoMeetingReady: boolean;
  zohoAccountEmail: string;
  zohoCalendarTimezone: string;
  zohoEnabled: boolean;
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

// Legacy support type only. Current seller onboarding never reveals or depends
// on a Zoho mailbox password; provider authorization is Admin-managed.
export interface ProfessionalMailboxFirstLogin {
  available: boolean;
  workEmail: string;
  temporaryPassword: string;
  oneTimePassword: boolean;
  reason: string;
}

const MAIL_CONNECTION_STATES = new Set<ProfessionalEmailSendConnectionStatus>([
  'disconnected',
  'connected',
  'reconnect_required',
  'error',
]);

function normalizeStatus(value: any): SalesAccountSetupStatus {
  const calendarProvider = value?.calendarProvider === 'zoho' ? 'zoho' : 'google';
  const meetingProvider = value?.meetingProvider === 'zoho_meeting' ? 'zoho_meeting' : 'google_meet';
  const professionalEmailRequired = Boolean(value?.professionalEmailRequired);
  const professionalEmailReady = value?.professionalEmailReady === undefined ? true : Boolean(value?.professionalEmailReady);
  const rawMailConnectionStatus = String(value?.professionalEmailSendConnectionStatus || 'disconnected') as ProfessionalEmailSendConnectionStatus;
  return {
    userId: String(value?.userId || ''),
    profilePhotoReady: Boolean(value?.profilePhotoReady),
    timezoneReady: Boolean(value?.timezoneReady),
    professionalEmailRequired,
    professionalEmailReady,
    professionalEmailCredentialPending: Boolean(value?.professionalEmailCredentialPending),
    professionalEmailAuthorizedOnce: Boolean(value?.professionalEmailAuthorizedOnce),
    professionalEmailSendConnected: Boolean(value?.professionalEmailSendConnected),
    professionalEmailSendConnectionStatus: MAIL_CONNECTION_STATES.has(rawMailConnectionStatus) ? rawMailConnectionStatus : 'disconnected',
    professionalEmailAdminManaged: value?.professionalEmailAdminManaged === undefined ? true : Boolean(value.professionalEmailAdminManaged),
    workEmail: String(value?.workEmail || ''),
    mailProvider: value?.mailProvider === 'zoho' ? 'zoho' : 'none',
    calendarProvider,
    meetingProvider,
    calendarConnected: value?.calendarConnected === undefined
      ? (calendarProvider === 'google' ? Boolean(value?.googleCalendarConnected) : Boolean(value?.zohoCalendarConnected))
      : Boolean(value?.calendarConnected),
    meetingReady: value?.meetingReady === undefined
      ? (meetingProvider === 'google_meet' ? Boolean(value?.googleMeetReady) : Boolean(value?.zohoMeetingReady))
      : Boolean(value?.meetingReady),
    googleCalendarConnected: Boolean(value?.googleCalendarConnected),
    googleMeetReady: Boolean(value?.googleMeetReady),
    googleAccountEmail: String(value?.googleAccountEmail || ''),
    googleCalendarTimezone: String(value?.googleCalendarTimezone || ''),
    zohoCalendarConnected: Boolean(value?.zohoCalendarConnected),
    zohoMeetingReady: Boolean(value?.zohoMeetingReady),
    zohoAccountEmail: String(value?.zohoAccountEmail || ''),
    zohoCalendarTimezone: String(value?.zohoCalendarTimezone || ''),
    zohoEnabled: Boolean(value?.zohoEnabled),
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

function normalizeMailboxFirstLogin(value: any): ProfessionalMailboxFirstLogin {
  return {
    available: Boolean(value?.available),
    workEmail: String(value?.workEmail || ''),
    temporaryPassword: String(value?.temporaryPassword || ''),
    oneTimePassword: Boolean(value?.oneTimePassword),
    reason: String(value?.reason || ''),
  };
}

export const salesAccountSetupService = {
  async getMyStatus(): Promise<SalesAccountSetupStatus> {
    const { data, error } = await supabase.rpc('get_my_sales_account_setup_status');
    if (error) throw error;
    return normalizeStatus(data);
  },

  // Legacy support RPC only. It is not part of seller onboarding.
  async getMyProfessionalMailboxFirstLogin(): Promise<ProfessionalMailboxFirstLogin> {
    const { data, error } = await supabase.rpc('get_my_professional_mailbox_first_login');
    if (error) throw error;
    return normalizeMailboxFirstLogin(data);
  },

  async advanceCrmTour(step: number): Promise<SalesAccountSetupStatus> {
    const { data, error } = await supabase.rpc('advance_my_sales_crm_setup_tour', { p_step: step });
    if (error) throw error;
    return normalizeStatus(data);
  },
};
