import { supabase } from './supabase';

export interface PublicRecruitmentInterviewJoin {
  candidateName: string;
  interviewStage: string;
  interviewerName: string;
  startAt: string;
  endAt: string;
  timezone: string;
  providerLabel: string;
  joinUrl: string;
  status: string;
  meetingEnded: boolean;
  canReschedule: boolean;
  candidateRescheduled: boolean;
  rescheduleDeadline: string;
}

export interface PublicRecruitmentInterviewRescheduleSlot {
  startAt: string;
  endAt: string;
  timezone: string;
  durationMinutes: number;
  rescheduleDeadline: string;
}

export interface PublicRecruitmentInterviewRescheduleResult {
  success: boolean;
  interviewId: string;
  meetingId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  candidateRescheduled: boolean;
  emailPending: boolean;
  message: string;
}

export const recruitmentInterviewJoinService = {
  async open(token: string): Promise<PublicRecruitmentInterviewJoin> {
    const safeToken = String(token || '').trim();
    if (!safeToken) throw new Error('Interview link is missing.');
    const { data, error } = await supabase.rpc('public_open_recruitment_interview_join', {
      p_token: safeToken,
    });
    if (error) throw new Error(error.message);
    const row = (data || {}) as Record<string, unknown>;
    const meetingEnded = row.meetingEnded === true;
    const joinUrl = String(row.joinUrl || '');
    if (!meetingEnded && !/^https:\/\//i.test(joinUrl)) throw new Error('Interview join link is not ready.');
    return {
      candidateName: String(row.candidateName || 'Candidate'),
      interviewStage: String(row.interviewStage || 'Recruitment'),
      interviewerName: String(row.interviewerName || 'ProFox Recruitment Team'),
      startAt: String(row.startAt || ''),
      endAt: String(row.endAt || ''),
      timezone: String(row.timezone || 'UTC'),
      providerLabel: String(row.providerLabel || 'Zoho Meeting'),
      joinUrl,
      status: String(row.status || 'Scheduled'),
      meetingEnded,
      canReschedule: row.canReschedule === true,
      candidateRescheduled: row.candidateRescheduled === true,
      rescheduleDeadline: String(row.rescheduleDeadline || ''),
    };
  },

  async listRescheduleSlots(token: string): Promise<PublicRecruitmentInterviewRescheduleSlot[]> {
    const safeToken = String(token || '').trim();
    if (!safeToken) throw new Error('Interview link is missing.');
    const { data, error } = await supabase.rpc('public_get_recruitment_interview_reschedule_slots', {
      p_token: safeToken,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((row: any) => ({
      startAt: String(row?.start_at || row?.startAt || ''),
      endAt: String(row?.end_at || row?.endAt || ''),
      timezone: String(row?.timezone || 'UTC'),
      durationMinutes: Number(row?.duration_minutes || row?.durationMinutes || 30),
      rescheduleDeadline: String(row?.reschedule_deadline || row?.rescheduleDeadline || ''),
    })).filter(slot => Boolean(slot.startAt && slot.endAt));
  },

  async reschedule(token: string, startAt: string): Promise<PublicRecruitmentInterviewRescheduleResult> {
    const safeToken = String(token || '').trim();
    if (!safeToken) throw new Error('Interview link is missing.');
    if (!startAt) throw new Error('Choose an available interview time.');
    const { data, error } = await supabase.rpc('public_reschedule_recruitment_interview', {
      p_token: safeToken,
      p_start_at: startAt,
    });
    if (error) throw new Error(error.message);
    const row = (data || {}) as Record<string, unknown>;
    return {
      success: row.success !== false,
      interviewId: String(row.interviewId || ''),
      meetingId: String(row.meetingId || ''),
      startAt: String(row.startAt || startAt),
      endAt: String(row.endAt || ''),
      timezone: String(row.timezone || 'UTC'),
      candidateRescheduled: row.candidateRescheduled === true,
      emailPending: row.emailPending === true,
      message: String(row.message || 'Your interview has been rescheduled.'),
    };
  },
};
