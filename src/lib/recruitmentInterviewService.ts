import { supabase } from './supabase';

export type RecruitmentInterviewSetupKind =
  | 'company_settings'
  | 'availability'
  | 'zoho_connection'
  | 'zoho_calendar'
  | 'zoho_meeting'
  | 'google_connection'
  | 'google_sync'
  | 'google_meet'
  | '';

export interface RecruitmentInterviewBookingContext {
  interviewRequired: boolean;
  interviewerId: string;
  interviewerName: string;
  timezone: string;
  durationMinutes: number;
  meetingType: string;
  providerLabel: string;
  calendarReady: boolean;
  setupRequired: boolean;
  setupKind: RecruitmentInterviewSetupKind;
  setupTitle: string;
  setupMessage: string;
  setupActionLabel: string;
  setupUrl: string;
  canBook: boolean;
  canSkip: boolean;
  interviewCompleted: boolean;
  interviewSkipped: boolean;
  skipReason: string;
  skippedAt?: string | null;
  skippedByName: string;
}

export interface RecruitmentInterviewSlot {
  startAt: string;
  endAt: string;
  timezone: string;
  durationMinutes: number;
}

export interface RecruitmentInterviewBookingResult {
  success: boolean;
  id: string;
  meetingId: string;
  stage: string;
  status: string;
  startAt: string;
  endAt: string;
  timezone: string;
  durationMinutes: number;
  provider: string;
  notificationState?: string;
}

export interface RecruitmentInterviewDeliveryStatus {
  interviewId: string;
  recipientEmail: string;
  sendCount: number;
  hasNotification: boolean;
  notificationId?: string | null;
  status: string;
  deliveryStatus: string;
  lastQueuedAt?: string | null;
  lastUpdatedAt?: string | null;
  lastError: string;
}

export interface RecruitmentInterviewResendResult {
  success: boolean;
  queued: boolean;
  duplicatePrevented: boolean;
  notificationId?: string | null;
  status: string;
  deliveryStatus: string;
  recipientEmail: string;
  message: string;
}

export interface RecruitmentInterviewSkipResult {
  success: boolean;
  skipId: string;
  stage: string;
  advanced: boolean;
  progression?: {
    success?: boolean;
    fromStage?: string;
    toStage?: string;
  } | null;
  assessmentStillRequired?: boolean;
}

function normalizeContext(value: unknown): RecruitmentInterviewBookingContext {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const setupKind = String(row.setupKind || '') as RecruitmentInterviewSetupKind;
  const fallbackUrl = setupKind === 'company_settings'
    ? '/admin/meeting-settings?source=recruitment'
    : setupKind === 'availability'
      ? '/admin/booking-setup?source=recruitment'
      : setupKind.startsWith('google_')
        ? '/admin/calendar?section=google&source=recruitment'
        : '/admin/calendar?section=zoho&source=recruitment';

  return {
    interviewRequired: row.interviewRequired === true,
    interviewerId: String(row.interviewerId || ''),
    interviewerName: String(row.interviewerName || 'ProFox Recruitment Team'),
    timezone: String(row.timezone || 'UTC'),
    durationMinutes: Number(row.durationMinutes || 30),
    meetingType: String(row.meetingType || 'Recruitment Interview'),
    providerLabel: String(row.providerLabel || 'Zoho Meeting'),
    calendarReady: row.calendarReady === true,
    setupRequired: row.setupRequired === true,
    setupKind,
    setupTitle: String(row.setupTitle || 'Meeting setup required'),
    setupMessage: String(row.setupMessage || ''),
    setupActionLabel: String(row.setupActionLabel || 'Open Meeting Setup'),
    setupUrl: String(row.setupUrl || fallbackUrl),
    canBook: row.canBook === true,
    canSkip: row.canSkip === true,
    interviewCompleted: row.interviewCompleted === true,
    interviewSkipped: row.interviewSkipped === true,
    skipReason: String(row.skipReason || ''),
    skippedAt: row.skippedAt ? String(row.skippedAt) : null,
    skippedByName: String(row.skippedByName || ''),
  };
}

export const recruitmentInterviewService = {
  async getBookingContext(applicantId: string): Promise<RecruitmentInterviewBookingContext> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_interview_booking_context', {
      p_applicant_id: applicantId,
    });
    if (error) throw error;
    return normalizeContext(data);
  },

  async listAvailableSlots(applicantId: string, fromDate?: string, days = 14): Promise<RecruitmentInterviewSlot[]> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_interview_slots', {
      p_applicant_id: applicantId,
      p_from_date: fromDate || null,
      p_days: days,
    });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map((row: any) => ({
      startAt: String(row?.start_at || row?.startAt || ''),
      endAt: String(row?.end_at || row?.endAt || ''),
      timezone: String(row?.timezone || 'UTC'),
      durationMinutes: Number(row?.duration_minutes || row?.durationMinutes || 30),
    })).filter(slot => Boolean(slot.startAt && slot.endAt));
  },

  async bookInterview(applicantId: string, startAt: string): Promise<RecruitmentInterviewBookingResult> {
    const { data, error } = await supabase.rpc('admin_book_recruitment_interview', {
      p_applicant_id: applicantId,
      p_start_at: startAt,
    });
    if (error) throw error;

    // The canonical meeting insert queues Zoho synchronization atomically.
    // This nudge asks the central Zoho worker to process the queued Calendar
    // event and Zoho Meeting immediately without making booking depend on the
    // provider API call succeeding in the browser request.
    try {
      await supabase.functions.invoke('process-zoho-calendar-sync', {
        body: { action: 'sync_now' },
      });
    } catch {
      // The queued sync remains the source of truth and will retry independently.
    }

    return (data || { success: true }) as RecruitmentInterviewBookingResult;
  },

  async getDeliveryStatus(interviewId: string): Promise<RecruitmentInterviewDeliveryStatus> {
    const { data, error } = await supabase.rpc('admin_get_recruitment_interview_delivery_status', {
      p_interview_id: interviewId,
    });
    if (error) throw error;
    const row = (data || {}) as Record<string, unknown>;
    return {
      interviewId: String(row.interviewId || interviewId),
      recipientEmail: String(row.recipientEmail || ''),
      sendCount: Number(row.sendCount || 0),
      hasNotification: row.hasNotification === true,
      notificationId: row.notificationId ? String(row.notificationId) : null,
      status: String(row.status || 'Not Sent'),
      deliveryStatus: String(row.deliveryStatus || 'Not Sent'),
      lastQueuedAt: row.lastQueuedAt ? String(row.lastQueuedAt) : null,
      lastUpdatedAt: row.lastUpdatedAt ? String(row.lastUpdatedAt) : null,
      lastError: String(row.lastError || ''),
    };
  },

  async resendInvitation(interviewId: string): Promise<RecruitmentInterviewResendResult> {
    const { data, error } = await supabase.rpc('admin_resend_recruitment_interview_invitation', {
      p_interview_id: interviewId,
    });
    if (error) throw error;
    const row = (data || {}) as Record<string, unknown>;
    return {
      success: row.success !== false,
      queued: row.queued === true,
      duplicatePrevented: row.duplicatePrevented === true,
      notificationId: row.notificationId ? String(row.notificationId) : null,
      status: String(row.status || 'Pending'),
      deliveryStatus: String(row.deliveryStatus || 'Unknown'),
      recipientEmail: String(row.recipientEmail || ''),
      message: String(row.message || 'Interview invitation queued for resend.'),
    };
  },

  async skipInterview(applicantId: string, reason: string): Promise<RecruitmentInterviewSkipResult> {
    const { data, error } = await supabase.rpc('admin_skip_recruitment_interview', {
      p_applicant_id: applicantId,
      p_reason: reason,
    });
    if (error) throw error;
    return (data || { success: true, advanced: false }) as RecruitmentInterviewSkipResult;
  },
};
