import { supabase } from './supabase';

export type BookingQuestionType = 'text' | 'textarea' | 'select';
export type BookingAnalyticsEvent =
  | 'Page Viewed'
  | 'Service Selected'
  | 'Expert Selected'
  | 'First Available Selected'
  | 'Slot Selected'
  | 'Qualification Started'
  | 'Booking Completed';

export interface BookingQualificationQuestion {
  id: string;
  label: string;
  type: BookingQuestionType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface PublicBookingSettings {
  active: boolean;
  pageTitle: string;
  pageSubtitle: string;
  confirmationMessage: string;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  maxBookingsPerEmailPerDay: number;
  requirePrivacyConsent: boolean;
  privacyConsentText: string;
  qualificationQuestions: BookingQualificationQuestion[];
}

export interface BookingExpert {
  salespersonId: string;
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  country: string;
  avatarUrl: string;
  niches: string[];
  serviceExpertise: string[];
  languages: string[];
  meetingType: string;
  meetingDurationMinutes: number;
  timezone: string;
  workingDays: number[];
  workStart: string;
  workEnd: string;
}

export interface BookingSlot {
  startAt: string;
  endAt: string;
  timezone: string;
  durationMinutes: number;
}

export interface BookingProfile {
  salespersonId: string;
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  country: string;
  avatarUrl: string;
  niches: string[];
  serviceExpertise: string[];
  languages: string[];
  meetingType: string;
  meetingDurationMinutes: number;
  isPublic: boolean;
  acceptingBookings: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AvailabilityBlock {
  id: string;
  userId: string;
  startAt: string;
  endAt: string;
  reason: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicBookingRequest {
  requestKey: string;
  salespersonId: string;
  startAt: string;
  visitorTimezone: string;
  contactName: string;
  email: string;
  phone?: string;
  companyName: string;
  website?: string;
  country: string;
  industry?: string;
  serviceInterest?: string;
  qualificationAnswers: Record<string, string>;
  honeypot?: string;
}

export interface PublicBookingResult {
  bookingReference: string;
  meetingId: string;
  leadId: string;
  salespersonId: string;
  expertName: string;
  startAt: string;
  endAt: string;
  timezone: string;
  visitorTimezone: string;
  confirmationMessage: string;
  managementToken?: string;
  managementExpiresAt?: string;
}

export interface BookingManagement {
  bookingReference: string;
  status: 'Confirmed' | 'Cancelled';
  contactName: string;
  email: string;
  companyName: string;
  serviceInterest: string;
  visitorTimezone: string;
  startAt: string;
  endAt: string;
  sellerTimezone: string;
  meetingStatus: string;
  meetingType: string;
  meetingUrl: string;
  salespersonId: string;
  expertName: string;
  expertHeadline: string;
  expertCountry: string;
  expertAvatarUrl: string;
  canReschedule: boolean;
  canCancel: boolean;
  tokenExpiresAt: string;
}

const DEFAULT_PUBLIC_BOOKING_SETTINGS: PublicBookingSettings = {
  active: false,
  pageTitle: 'Book a strategy call',
  pageSubtitle: 'Choose the ProFox specialist who best matches your business and select an available time.',
  confirmationMessage: 'Your meeting is confirmed.',
  maxAdvanceDays: 60,
  slotIntervalMinutes: 15,
  maxBookingsPerEmailPerDay: 3,
  requirePrivacyConsent: true,
  privacyConsentText: 'I agree that ProFox may process this meeting request under the',
  qualificationQuestions: []
};

const mapExpert = (row: any): BookingExpert => ({
  salespersonId: row.salesperson_id,
  slug: row.slug,
  displayName: row.display_name || 'ProFox Specialist',
  headline: row.headline || '',
  bio: row.bio || '',
  country: row.country || '',
  avatarUrl: row.avatar_url || '',
  niches: Array.isArray(row.niches) ? row.niches : [],
  serviceExpertise: Array.isArray(row.service_expertise) ? row.service_expertise : [],
  languages: Array.isArray(row.languages) ? row.languages : [],
  meetingType: row.meeting_type || 'Discovery Meeting',
  meetingDurationMinutes: Number(row.meeting_duration_minutes || 30),
  timezone: row.timezone || 'UTC',
  workingDays: Array.isArray(row.working_days) ? row.working_days.map(Number) : [1, 2, 3, 4, 5],
  workStart: String(row.work_start || '09:00').slice(0, 5),
  workEnd: String(row.work_end || '17:00').slice(0, 5)
});

const mapProfile = (row: any): BookingProfile => ({
  salespersonId: row.salesperson_id,
  slug: row.slug,
  displayName: row.display_name || '',
  headline: row.headline || '',
  bio: row.bio || '',
  country: row.country || '',
  avatarUrl: row.avatar_url || '',
  niches: Array.isArray(row.niches) ? row.niches : [],
  serviceExpertise: Array.isArray(row.service_expertise) ? row.service_expertise : [],
  languages: Array.isArray(row.languages) ? row.languages : [],
  meetingType: row.meeting_type || 'Discovery Meeting',
  meetingDurationMinutes: Number(row.meeting_duration_minutes || 30),
  isPublic: row.is_public === true,
  acceptingBookings: row.accepting_bookings === true,
  sortOrder: Number(row.sort_order || 100),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapBlock = (row: any): AvailabilityBlock => ({
  id: row.id,
  userId: row.user_id,
  startAt: row.start_at,
  endAt: row.end_at,
  reason: row.reason || '',
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const normalizeSettings = (data: any): PublicBookingSettings => ({
  ...DEFAULT_PUBLIC_BOOKING_SETTINGS,
  ...(data || {}),
  qualificationQuestions: Array.isArray(data?.qualificationQuestions)
    ? data.qualificationQuestions
        .filter((question: any) => question && typeof question.id === 'string' && typeof question.label === 'string')
        .map((question: any) => ({
          id: question.id,
          label: question.label,
          type: ['text', 'textarea', 'select'].includes(question.type) ? question.type : 'text',
          required: question.required === true,
          placeholder: question.placeholder || '',
          options: Array.isArray(question.options) ? question.options.map(String) : []
        }))
    : []
});

function stablePublicBookingRequestKey(input: PublicBookingRequest) {
  const fingerprint = `${input.salespersonId}|${input.startAt}|${input.email.trim().toLowerCase()}`;
  const storageKey = `profox-public-booking:${fingerprint}`;
  if (typeof window === 'undefined') return input.requestKey;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    window.sessionStorage.setItem(storageKey, input.requestKey);
  } catch {
    // Storage may be unavailable in strict browser privacy modes. The caller-provided key still protects one request attempt.
  }
  return input.requestKey;
}

export const bookingService = {
  async getPublicSettings(): Promise<PublicBookingSettings> {
    const { data, error } = await supabase.rpc('get_public_booking_settings');
    if (error) throw error;
    return normalizeSettings(data);
  },

  async listPublicExperts(): Promise<BookingExpert[]> {
    const { data, error } = await supabase.rpc('list_public_booking_experts');
    if (error) throw error;
    return (data || []).map(mapExpert);
  },

  async getPublicSlots(salespersonId: string, fromDate?: string, days = 14): Promise<BookingSlot[]> {
    const { data, error } = await supabase.rpc('get_public_booking_slots', {
      p_salesperson_id: salespersonId,
      p_from_date: fromDate || null,
      p_days: days
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      startAt: row.start_at,
      endAt: row.end_at,
      timezone: row.timezone || 'UTC',
      durationMinutes: Number(row.duration_minutes || 30)
    }));
  },

  async findFirstAvailable(experts: BookingExpert[], serviceInterest = '', fromDate?: string, days = 14) {
    const candidates = serviceInterest
      ? experts.filter(expert => expert.serviceExpertise.some(value => value.toLowerCase() === serviceInterest.toLowerCase()))
      : experts;
    const rows = await Promise.all(candidates.map(async expert => ({
      expert,
      slots: await this.getPublicSlots(expert.salespersonId, fromDate, days)
    })));
    const options = rows.flatMap(row => row.slots.slice(0, 1).map(slot => ({ expert: row.expert, slot })));
    options.sort((a, b) => new Date(a.slot.startAt).getTime() - new Date(b.slot.startAt).getTime());
    return options[0] || null;
  },

  async bookPublicMeeting(input: PublicBookingRequest): Promise<PublicBookingResult> {
    const requestKey = stablePublicBookingRequestKey(input);
    const { data, error } = await supabase.rpc('book_public_sales_meeting', {
      p_request_key: requestKey,
      p_salesperson_id: input.salespersonId,
      p_start_at: input.startAt,
      p_visitor_timezone: input.visitorTimezone,
      p_contact_name: input.contactName,
      p_email: input.email,
      p_phone: input.phone || '',
      p_company_name: input.companyName,
      p_website: input.website || '',
      p_country: input.country,
      p_industry: input.industry || 'Other',
      p_service_interest: input.serviceInterest || '',
      p_qualification_answers: { ...input.qualificationAnswers, _privacyConsent: 'accepted' },
      p_honeypot: input.honeypot || ''
    });
    if (error) throw error;
    const result = data as PublicBookingResult;
    try {
      const { data: access, error: accessError } = await supabase.rpc('claim_public_booking_management_token', {
        p_request_key: requestKey,
        p_email: input.email
      });
      if (!accessError && access) {
        result.managementToken = access.token;
        result.managementExpiresAt = access.expiresAt;
      }
    } catch {
      // Booking confirmation must remain successful even if management-link retrieval is temporarily unavailable.
    }
    return result;
  },

  async trackEvent(sessionKey: string, eventType: BookingAnalyticsEvent, salespersonId = '', serviceInterest = '', metadata: Record<string, unknown> = {}) {
    if (!sessionKey) return;
    const { error } = await supabase.rpc('track_public_booking_event', {
      p_session_key: sessionKey,
      p_event_type: eventType,
      p_salesperson_id: salespersonId || null,
      p_service_interest: serviceInterest,
      p_metadata: metadata
    });
    if (error) console.warn('Booking analytics event was not recorded:', error.message);
  },

  async getManagedBooking(token: string): Promise<BookingManagement> {
    const { data, error } = await supabase.rpc('get_public_booking_management', { p_token: token });
    if (error) throw error;
    return data as BookingManagement;
  },

  async rescheduleManagedBooking(token: string, startAt: string, visitorTimezone: string): Promise<BookingManagement> {
    const { data, error } = await supabase.rpc('reschedule_public_booking', {
      p_token: token,
      p_start_at: startAt,
      p_visitor_timezone: visitorTimezone
    });
    if (error) throw error;
    return data as BookingManagement;
  },

  async cancelManagedBooking(token: string, reason = ''): Promise<BookingManagement> {
    const { data, error } = await supabase.rpc('cancel_public_booking', { p_token: token, p_reason: reason });
    if (error) throw error;
    return data as BookingManagement;
  },

  async getProfile(salespersonId: string): Promise<BookingProfile | null> {
    const { data, error } = await supabase
      .from('public_booking_profiles')
      .select('*')
      .eq('salesperson_id', salespersonId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapProfile(data) : null;
  },

  async saveProfile(profile: BookingProfile): Promise<BookingProfile> {
    const { data, error } = await supabase
      .from('public_booking_profiles')
      .upsert({
        salesperson_id: profile.salespersonId,
        slug: profile.slug,
        display_name: profile.displayName,
        headline: profile.headline,
        bio: profile.bio,
        country: profile.country,
        niches: profile.niches,
        service_expertise: profile.serviceExpertise,
        languages: profile.languages,
        meeting_type: profile.meetingType,
        meeting_duration_minutes: profile.meetingDurationMinutes,
        is_public: profile.isPublic,
        accepting_bookings: profile.acceptingBookings,
        sort_order: profile.sortOrder,
        updated_at: new Date().toISOString()
      }, { onConflict: 'salesperson_id' })
      .select('*')
      .single();
    if (error) throw error;
    return mapProfile(data);
  },

  async listBlocks(userId: string): Promise<AvailabilityBlock[]> {
    const { data, error } = await supabase
      .from('booking_availability_blocks')
      .select('*')
      .eq('user_id', userId)
      .gte('end_at', new Date().toISOString())
      .order('start_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapBlock);
  },

  async addBlock(userId: string, startAt: string, endAt: string, reason = ''): Promise<AvailabilityBlock> {
    const { data, error } = await supabase
      .from('booking_availability_blocks')
      .insert({ user_id: userId, start_at: startAt, end_at: endAt, reason })
      .select('*')
      .single();
    if (error) throw error;
    return mapBlock(data);
  },

  async deleteBlock(id: string): Promise<void> {
    const { error } = await supabase.from('booking_availability_blocks').delete().eq('id', id);
    if (error) throw error;
  },

  async listProfilesForAdmin(): Promise<BookingProfile[]> {
    const { data, error } = await supabase
      .from('public_booking_profiles')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapProfile);
  },

  async getAdminSettings(): Promise<PublicBookingSettings> {
    const { data, error } = await supabase
      .from('system_configuration')
      .select('config_value')
      .eq('config_key', 'public_booking_settings')
      .maybeSingle();
    if (error) throw error;
    return normalizeSettings(data?.config_value);
  },

  async saveAdminSettings(settings: PublicBookingSettings): Promise<PublicBookingSettings> {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw authError || new Error('Authentication required.');

    const normalized: PublicBookingSettings = {
      ...settings,
      active: settings.active === true,
      maxAdvanceDays: Math.min(Math.max(Number(settings.maxAdvanceDays || 60), 1), 365),
      slotIntervalMinutes: Math.min(Math.max(Number(settings.slotIntervalMinutes || 15), 5), 120),
      maxBookingsPerEmailPerDay: Math.min(Math.max(Number(settings.maxBookingsPerEmailPerDay || 3), 1), 20),
      qualificationQuestions: settings.qualificationQuestions.map((question, index) => ({
        id: (question.id || `question_${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
        label: question.label.trim(),
        type: question.type,
        required: question.required === true,
        placeholder: question.placeholder || '',
        options: question.type === 'select' ? (question.options || []).map(option => option.trim()).filter(Boolean) : []
      })).filter(question => question.id && question.label)
    };

    const { data, error } = await supabase
      .from('system_configuration')
      .upsert({
        config_key: 'public_booking_settings',
        config_value: normalized,
        description: 'Admin-configurable public ProFox booking flow, qualification questions, and slot policy.',
        updated_by: authData.user.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'config_key' })
      .select('config_value')
      .single();
    if (error) throw error;
    return normalizeSettings(data?.config_value);
  }
};
