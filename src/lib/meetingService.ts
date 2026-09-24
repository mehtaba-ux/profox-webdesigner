import { supabase } from './supabase';

export type MeetingStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'No Show' | 'Rescheduled';
export type MeetingSyncStatus = 'Not Connected' | 'Pending' | 'Synced' | 'Error';

export interface SalesMeeting {
  id: string;
  requestKey: string;
  leadId?: string;
  opportunityId?: string;
  clientId?: string;
  salespersonId: string;
  activityId?: string;
  meetingType: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  provider: string;
  externalCalendarId?: string;
  externalEventId?: string;
  meetingUrl: string;
  attendeeName: string;
  attendeeEmail: string;
  status: MeetingStatus;
  syncStatus: MeetingSyncStatus;
  syncError?: string;
  outcome: string;
  requirementsSummary: string;
  problemsIdentified: string;
  decisionMakers: string;
  commercialNotes: string;
  timelineNotes: string;
  nextStep: string;
  followUpAt?: string;
  customerSummary: string;
  customerNextStep: string;
  customerNextStepTiming: string;
  prepReviewedAt?: string;
  prepReviewedBy?: string;
  createdBy: string;
  completedAt?: string;
  cancelledAt?: string;
  rescheduledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserCalendarSettings {
  userId: string;
  provider: string;
  calendarEmail: string;
  timezone: string;
  workingDays: number[];
  workStart: string;
  workEnd: string;
  defaultDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  bookingUrl: string;
  defaultPlatform: string;
  connectionStatus: 'Not Connected' | 'Connected' | 'Needs Reconnect' | 'Error';
  active: boolean;
  updatedAt: string;
}

export interface MeetingSettings {
  defaultDurationMinutes: number;
  allowedDurations: number[];
  minimumBookingNoticeMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  defaultTimezone: string;
  defaultMeetingType: string;
  meetingTypes: string[];
  titleTemplate: string;
  descriptionTemplate: string;
  providers: string[];
  defaultProvider: string;
  bookingInstructions: string;
  cancellationInstructions: string;
  reschedulingInstructions: string;
  reminderMinutes: number[];
  active: boolean;
}

export interface ScheduleMeetingInput {
  requestKey: string;
  salespersonId: string;
  leadId?: string;
  opportunityId?: string;
  clientId?: string;
  meetingType: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  provider: string;
  meetingUrl?: string;
  attendeeName?: string;
  attendeeEmail?: string;
}

export interface MeetingCloseoutInput {
  outcome?: string;
  requirementsSummary?: string;
  problemsIdentified?: string;
  decisionMakers?: string;
  commercialNotes?: string;
  timelineNotes?: string;
  nextStep?: string;
  followUpAt?: string;
}

export interface FinalizeMeetingInput extends MeetingCloseoutInput {
  status: 'Completed' | 'No Show';
}

export interface CustomerMeetingFollowupInput {
  customerSummary?: string;
  customerNextStep?: string;
  customerNextStepTiming?: string;
}

export const DEFAULT_MEETING_SETTINGS: MeetingSettings = {
  defaultDurationMinutes: 30,
  allowedDurations: [15, 30, 45, 60],
  minimumBookingNoticeMinutes: 120,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 15,
  defaultTimezone: 'Asia/Kolkata',
  defaultMeetingType: 'Discovery Meeting',
  meetingTypes: ['Discovery Meeting', 'Proposal Review', 'Project Consultation', 'Follow-Up Meeting'],
  titleTemplate: '{{company}} — {{meetingType}}',
  descriptionTemplate: 'ProFox meeting with {{contact}} from {{company}}.',
  providers: ['Manual'],
  defaultProvider: 'Manual',
  bookingInstructions: 'Confirm the prospect timezone before booking.',
  cancellationInstructions: 'Record cancellations in CRM and preserve meeting history.',
  reschedulingInstructions: 'Update the existing meeting instead of creating a duplicate.',
  reminderMinutes: [1440, 60],
  active: true
};

const mapMeeting = (row: any, meetingUrlOverride?: string | null): SalesMeeting => ({
  id: row.id,
  requestKey: row.request_key,
  leadId: row.lead_id || undefined,
  opportunityId: row.opportunity_id || undefined,
  clientId: row.client_id || undefined,
  salespersonId: row.salesperson_id,
  activityId: row.activity_id || undefined,
  meetingType: row.meeting_type,
  title: row.title,
  description: row.description || '',
  startAt: row.start_at,
  endAt: row.end_at,
  timezone: row.timezone || 'UTC',
  provider: row.provider || 'Manual',
  externalCalendarId: row.external_calendar_id || undefined,
  externalEventId: row.external_event_id || undefined,
  meetingUrl: meetingUrlOverride === undefined ? (row.meeting_url || '') : (meetingUrlOverride || ''),
  attendeeName: row.attendee_name || '',
  attendeeEmail: row.attendee_email || '',
  status: row.status,
  syncStatus: row.sync_status || 'Not Connected',
  syncError: row.sync_error || undefined,
  outcome: row.outcome || '',
  requirementsSummary: row.requirements_summary || '',
  problemsIdentified: row.problems_identified || '',
  decisionMakers: row.decision_makers || '',
  commercialNotes: row.commercial_notes || '',
  timelineNotes: row.timeline_notes || '',
  nextStep: row.next_step || '',
  followUpAt: row.follow_up_at || undefined,
  customerSummary: row.customer_summary || '',
  customerNextStep: row.customer_next_step || '',
  customerNextStepTiming: row.customer_next_step_timing || '',
  prepReviewedAt: row.prep_reviewed_at || undefined,
  prepReviewedBy: row.prep_reviewed_by || undefined,
  createdBy: row.created_by,
  completedAt: row.completed_at || undefined,
  cancelledAt: row.cancelled_at || undefined,
  rescheduledAt: row.rescheduled_at || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapCalendarSettings = (row: any): UserCalendarSettings => ({
  userId: row.user_id,
  provider: row.provider || 'Manual',
  calendarEmail: row.calendar_email || '',
  timezone: row.timezone || 'UTC',
  workingDays: Array.isArray(row.working_days) ? row.working_days.map(Number) : [1, 2, 3, 4, 5],
  workStart: String(row.work_start || '09:00').slice(0, 5),
  workEnd: String(row.work_end || '17:00').slice(0, 5),
  defaultDurationMinutes: Number(row.default_duration_minutes || 30),
  bufferBeforeMinutes: Number(row.buffer_before_minutes || 0),
  bufferAfterMinutes: Number(row.buffer_after_minutes || 15),
  bookingUrl: row.booking_url || '',
  defaultPlatform: row.default_platform || 'Manual',
  connectionStatus: row.connection_status || 'Not Connected',
  active: row.active !== false,
  updatedAt: row.updated_at
});

async function getLaunchUrl(meetingId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_my_meeting_launch_url', { p_meeting_id: meetingId });
  if (error) throw error;
  return typeof data === 'string' ? data : '';
}

async function getLaunchUrlMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('get_my_meeting_launch_urls');
  if (error) throw error;
  return new Map((data || []).map((row: any) => [String(row.meeting_id), String(row.launch_url || '')]));
}

async function mapStaffMeeting(row: any): Promise<SalesMeeting> {
  const launchUrl = await getLaunchUrl(String(row.id));
  return mapMeeting(row, launchUrl);
}

const CRM_MEETING_SAFE_COLUMNS = [
  'id', 'request_key', 'lead_id', 'opportunity_id', 'client_id', 'salesperson_id', 'activity_id',
  'meeting_type', 'title', 'description', 'start_at', 'end_at', 'timezone', 'provider',
  'attendee_name', 'attendee_email', 'status', 'sync_status', 'outcome', 'requirements_summary',
  'problems_identified', 'decision_makers', 'commercial_notes', 'timeline_notes', 'next_step',
  'follow_up_at', 'customer_summary', 'customer_next_step', 'customer_next_step_timing',
  'prep_reviewed_at', 'prep_reviewed_by', 'completed_at', 'cancelled_at', 'rescheduled_at',
  'created_by', 'created_at', 'updated_at'
].join(',');

export const meetingService = {
  async listMeetings(): Promise<SalesMeeting[]> {
    const [{ data, error }, launchUrls] = await Promise.all([
      supabase.from('sales_meetings').select('*').order('start_at', { ascending: true }),
      getLaunchUrlMap()
    ]);
    if (error) throw error;
    return (data || []).map(row => mapMeeting(row, launchUrls.get(String(row.id)) || ''));
  },

  async listCRMMeetings(reference: { leadId: string; opportunityId?: string | null }): Promise<SalesMeeting[]> {
    let query = supabase.from('sales_meetings').select(CRM_MEETING_SAFE_COLUMNS).order('start_at', { ascending: true });
    query = reference.opportunityId
      ? query.or(`lead_id.eq.${reference.leadId},opportunity_id.eq.${reference.opportunityId}`)
      : query.eq('lead_id', reference.leadId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(row => mapMeeting(row, ''));
  },

  async getMeeting(id: string): Promise<SalesMeeting | null> {
    const { data, error } = await supabase.from('sales_meetings').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapStaffMeeting(data) : null;
  },

  async getLaunchUrl(id: string): Promise<string> {
    return getLaunchUrl(id);
  },

  async schedule(input: ScheduleMeetingInput): Promise<SalesMeeting> {
    const { data, error } = await supabase.rpc('schedule_sales_meeting', {
      p_request_key: input.requestKey,
      p_salesperson_id: input.salespersonId,
      p_lead_id: input.leadId || null,
      p_opportunity_id: input.opportunityId || null,
      p_client_id: input.clientId || null,
      p_meeting_type: input.meetingType,
      p_title: input.title,
      p_description: input.description || '',
      p_start_at: input.startAt,
      p_end_at: input.endAt,
      p_timezone: input.timezone,
      p_provider: 'Manual',
      p_meeting_url: input.meetingUrl || '',
      p_attendee_name: input.attendeeName || '',
      p_attendee_email: input.attendeeEmail || ''
    });
    if (error) throw error;
    return mapStaffMeeting(data);
  },

  async reschedule(id: string, startAt: string, endAt: string, timezone: string, meetingUrl?: string): Promise<SalesMeeting> {
    const { data, error } = await supabase.rpc('reschedule_sales_meeting', {
      p_meeting_id: id,
      p_start_at: startAt,
      p_end_at: endAt,
      p_timezone: timezone,
      p_meeting_url: meetingUrl ?? null
    });
    if (error) throw error;
    return mapStaffMeeting(data);
  },

  async cancel(id: string, reason = ''): Promise<SalesMeeting> {
    const { data, error } = await supabase.rpc('cancel_sales_meeting', {
      p_meeting_id: id,
      p_reason: reason
    });
    if (error) throw error;
    return mapMeeting(data, '');
  },

  async saveCloseoutDraft(id: string, input: MeetingCloseoutInput): Promise<SalesMeeting> {
    const { data, error } = await supabase.rpc('save_sales_meeting_closeout_draft', {
      p_meeting_id: id,
      p_outcome: input.outcome || '',
      p_requirements_summary: input.requirementsSummary || '',
      p_problems_identified: input.problemsIdentified || '',
      p_decision_makers: input.decisionMakers || '',
      p_commercial_notes: input.commercialNotes || '',
      p_timeline_notes: input.timelineNotes || '',
      p_next_step: input.nextStep || '',
      p_follow_up_at: input.followUpAt || null
    });
    if (error) throw error;
    return mapMeeting(data, '');
  },

  async saveCustomerFollowup(id: string, input: CustomerMeetingFollowupInput): Promise<SalesMeeting> {
    const { data, error } = await supabase.rpc('save_sales_meeting_customer_followup', {
      p_meeting_id: id,
      p_customer_summary: input.customerSummary || '',
      p_customer_next_step: input.customerNextStep || '',
      p_customer_next_step_timing: input.customerNextStepTiming || ''
    });
    if (error) throw error;
    return mapMeeting(data, '');
  },

  async finalize(id: string, input: FinalizeMeetingInput): Promise<SalesMeeting> {
    const { data, error } = await supabase.rpc('finalize_sales_meeting', {
      p_meeting_id: id,
      p_status: input.status,
      p_outcome: input.outcome || '',
      p_requirements_summary: input.requirementsSummary || '',
      p_problems_identified: input.problemsIdentified || '',
      p_decision_makers: input.decisionMakers || '',
      p_commercial_notes: input.commercialNotes || '',
      p_timeline_notes: input.timelineNotes || '',
      p_next_step: input.nextStep || '',
      p_follow_up_at: input.followUpAt || null
    });
    if (error) throw error;
    return mapMeeting(data, '');
  },

  async getCalendarSettings(userId: string): Promise<UserCalendarSettings | null> {
    const { data, error } = await supabase.from('user_calendar_settings').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data ? mapCalendarSettings(data) : null;
  },

  async saveCalendarSettings(settings: Omit<UserCalendarSettings, 'updatedAt'>): Promise<UserCalendarSettings> {
    if (settings.provider !== 'Manual' || settings.connectionStatus !== 'Not Connected') {
      throw new Error('External calendar connection must be established through the secure OAuth flow, which is not enabled in this core release.');
    }
    const { data, error } = await supabase.from('user_calendar_settings').upsert({
      user_id: settings.userId,
      provider: 'Manual',
      calendar_email: settings.calendarEmail,
      timezone: settings.timezone,
      working_days: settings.workingDays,
      work_start: settings.workStart,
      work_end: settings.workEnd,
      default_duration_minutes: settings.defaultDurationMinutes,
      buffer_before_minutes: settings.bufferBeforeMinutes,
      buffer_after_minutes: settings.bufferAfterMinutes,
      booking_url: settings.bookingUrl,
      default_platform: settings.defaultPlatform,
      connection_status: 'Not Connected',
      active: settings.active,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).select('*').single();
    if (error) throw error;
    return mapCalendarSettings(data);
  },

  async getMeetingSettings(): Promise<MeetingSettings> {
    const { data, error } = await supabase.from('system_configuration').select('config_value').eq('config_key', 'meeting_settings').maybeSingle();
    if (error) throw error;
    return { ...DEFAULT_MEETING_SETTINGS, ...(data?.config_value || {}) } as MeetingSettings;
  },

  async saveMeetingSettings(settings: MeetingSettings): Promise<MeetingSettings> {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw authError || new Error('Authentication required.');
    const meetingTypes = [...new Set(settings.meetingTypes.map(v => v.trim()).filter(Boolean))];
    const durations = [...new Set(settings.allowedDurations.map(Number))].filter(v => Number.isFinite(v) && v >= 10 && v <= 240).sort((a, b) => a - b);
    if (!meetingTypes.length) throw new Error('At least one meeting type is required.');
    if (!durations.length) throw new Error('At least one allowed duration is required.');
    if (!meetingTypes.includes(settings.defaultMeetingType)) throw new Error('Default meeting type must be one of the configured meeting types.');
    if (!durations.includes(settings.defaultDurationMinutes)) throw new Error('Default duration must be one of the configured durations.');
    if (!settings.providers.includes('Manual') || settings.defaultProvider !== 'Manual') throw new Error('Manual must remain the enabled/default provider until secure external calendar authorization is deployed.');
    const normalized: MeetingSettings = {
      ...settings,
      meetingTypes,
      allowedDurations: durations,
      providers: ['Manual'],
      defaultProvider: 'Manual',
      minimumBookingNoticeMinutes: Math.max(0, Number(settings.minimumBookingNoticeMinutes || 0)),
      bufferBeforeMinutes: Math.max(0, Number(settings.bufferBeforeMinutes || 0)),
      bufferAfterMinutes: Math.max(0, Number(settings.bufferAfterMinutes || 0))
    };
    const { data, error } = await supabase.from('system_configuration').upsert({
      config_key: 'meeting_settings',
      config_value: normalized,
      description: 'Admin-configurable defaults for Sales meeting scheduling and calendar behavior.',
      updated_by: authData.user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'config_key' }).select('config_value').single();
    if (error) throw error;
    return { ...DEFAULT_MEETING_SETTINGS, ...(data?.config_value || {}) } as MeetingSettings;
  },

  async hasConflict(salespersonId: string, startAt: string, endAt: string, excludeMeetingId?: string): Promise<boolean> {
    let query = supabase.from('sales_meetings').select('id').eq('salesperson_id', salespersonId).in('status', ['Scheduled', 'Rescheduled']).lt('start_at', endAt).gt('end_at', startAt).limit(1);
    if (excludeMeetingId) query = query.neq('id', excludeMeetingId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).length > 0;
  }
};