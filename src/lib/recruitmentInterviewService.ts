import { supabase } from './supabase';

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
  setupMessage: string;
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
  return {
    interviewRequired: row.interviewRequired === true,
    interviewerId: String(row.interviewerId || ''),
    interviewerName: String(row.interviewerName || 'ProFox Recruitment Team'),
    timezone: String(row.timezone || 'UTC'),
    durationMinutes: Number(row.durationMinutes || 30),
    meetingType: String(row.meetingType || 'Recruitment Interview'),
    providerLabel: String(row.providerLabel || 'Google Meet'),
    calendarReady: row.calendarReady === true,
    setupRequired: row.setupRequired === true,
    setupMessage: String(row.setupMessage || ''),
    setupUrl: String(row.setupUrl || '/admin/meetings?tab=availability'),
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

    // The meeting insert already queues Google synchronization atomically. This
    // authenticated nudge lets a connected staff calendar process the new Meet
    // event immediately when the sync worker is available, without making the
    // successful booking depend on an external API call.
    try {
      await supabase.functions.invoke('process-google-calendar-sync', {
        body: { action: 'sync_now' },
      });
    } catch {
      // The queued sync remains the source of truth and will retry independently.
    }

    return (data || { success: true }) as RecruitmentInterviewBookingResult;
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
