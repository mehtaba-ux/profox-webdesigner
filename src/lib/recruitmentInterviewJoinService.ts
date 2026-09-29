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
    const joinUrl = String(row.joinUrl || '');
    if (!/^https:\/\//i.test(joinUrl)) throw new Error('Interview join link is not ready.');
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
    };
  },
};
