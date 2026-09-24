import { supabase } from './supabase';

export interface NotificationDeliveryStatus {
  emailEnabled: boolean;
  emailProvider: 'disabled' | 'resend' | 'brevo';
  providerConfigured: boolean;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  publicBaseUrl: string;
  reminderMinutes: number[];
  noShowFollowUpHours: number;
  completedReviewHours: number;
  quotationFollowUpDays: number;
  quotationApprovalReminderHours: number[];
  adminReviewReminderHours: number[];
  paymentDueReminderDays: number[];
  paymentOverdueReminderDays: number[];
  paymentVerificationReminderHours: number[];
  projectTaskReminderDays: number[];
  projectTaskOverdueReminderDays: number[];
  commissionReviewReminderHours: number[];
  commissionPayoutReminderDays: number[];
  maxAttempts: number;
  pendingCount: number;
  failedCount: number;
  sentLast24Hours: number;
}

export interface NotificationTemplate {
  templateKey: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  active: boolean;
  description: string;
  updatedAt?: string;
}

export interface BookingAnalytics {
  days: number;
  views: number;
  completed: number;
  conversionRate: number;
  events: Array<{ eventType: string; count: number }>;
  topServices: Array<{ service: string; count: number }>;
  topExperts: Array<{ salespersonId: string; name: string; count: number }>;
}

export interface SalesTodayDashboard {
  scope: 'team' | 'individual';
  salespersonId?: string | null;
  counts: {
    meetingsToday: number;
    overdueActivities: number;
    newBookings: number;
    quotationFollowUps: number;
    unreadNotifications: number;
  };
  todayMeetings: any[];
  overdueActivities: any[];
  upcomingMeetings: any[];
  quotationActions: any[];
  notifications: any[];
}

const defaultStatus: NotificationDeliveryStatus = {
  emailEnabled: false,
  emailProvider: 'disabled',
  providerConfigured: false,
  fromEmail: '',
  fromName: 'ProFox',
  replyTo: '',
  publicBaseUrl: 'https://www.profoxwebdesigner.com',
  reminderMinutes: [1440, 60],
  noShowFollowUpHours: 2,
  completedReviewHours: 2,
  quotationFollowUpDays: 2,
  quotationApprovalReminderHours: [2, 8, 24],
  adminReviewReminderHours: [4, 24, 48],
  paymentDueReminderDays: [3, 1, 0],
  paymentOverdueReminderDays: [1, 3, 7],
  paymentVerificationReminderHours: [2, 8, 24],
  projectTaskReminderDays: [1, 0],
  projectTaskOverdueReminderDays: [1, 3, 7],
  commissionReviewReminderHours: [4, 24, 48],
  commissionPayoutReminderDays: [1, 0],
  maxAttempts: 5,
  pendingCount: 0,
  failedCount: 0,
  sentLast24Hours: 0
};

function mapTemplate(row: any): NotificationTemplate {
  return {
    templateKey: row.template_key,
    name: row.name || '',
    subjectTemplate: row.subject_template || '',
    bodyTemplate: row.body_template || '',
    active: row.active === true,
    description: row.description || '',
    updatedAt: row.updated_at
  };
}

function normalizeNumberList(values: number[], min: number, max: number, fallback: number[]) {
  const normalized = Array.from(new Set((values || []).map(Number).filter(value => Number.isFinite(value) && value >= min && value <= max)))
    .sort((a, b) => b - a);
  return normalized.length ? normalized : fallback;
}

export const salesAutomationService = {
  async getNotificationStatus(): Promise<NotificationDeliveryStatus> {
    const { data, error } = await supabase.rpc('admin_get_notification_status');
    if (error) throw error;
    return { ...defaultStatus, ...(data || {}) } as NotificationDeliveryStatus;
  },

  async setNotificationProvider(input: {
    provider: 'disabled' | 'resend' | 'brevo';
    apiKey?: string;
    fromEmail: string;
    fromName: string;
    replyTo?: string;
    emailEnabled: boolean;
  }): Promise<NotificationDeliveryStatus> {
    const { data, error } = await supabase.rpc('admin_set_notification_provider', {
      p_provider: input.provider,
      p_api_key: input.apiKey || '',
      p_from_email: input.fromEmail,
      p_from_name: input.fromName,
      p_reply_to: input.replyTo || '',
      p_email_enabled: input.emailEnabled
    });
    if (error) throw error;
    return { ...defaultStatus, ...(data || {}) } as NotificationDeliveryStatus;
  },

  async saveAutomationSettings(settings: Pick<NotificationDeliveryStatus,
    'publicBaseUrl' | 'reminderMinutes' | 'noShowFollowUpHours' | 'completedReviewHours' | 'quotationFollowUpDays' |
    'quotationApprovalReminderHours' | 'adminReviewReminderHours' | 'paymentDueReminderDays' | 'paymentOverdueReminderDays' |
    'paymentVerificationReminderHours' | 'projectTaskReminderDays' | 'projectTaskOverdueReminderDays' |
    'commissionReviewReminderHours' | 'commissionPayoutReminderDays' | 'maxAttempts'>) {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw authError || new Error('Authentication required.');
    const current = await this.getNotificationStatus();
    const payload = {
      emailEnabled: current.emailEnabled,
      emailProvider: current.emailProvider,
      providerConfigured: current.providerConfigured,
      fromEmail: current.fromEmail,
      fromName: current.fromName,
      replyTo: current.replyTo,
      publicBaseUrl: settings.publicBaseUrl.trim().replace(/\/$/, ''),
      reminderMinutes: normalizeNumberList(settings.reminderMinutes, 5, 10080, [1440, 60]),
      noShowFollowUpHours: Math.min(Math.max(Number(settings.noShowFollowUpHours || 2), 0), 168),
      completedReviewHours: Math.min(Math.max(Number(settings.completedReviewHours || 2), 0), 72),
      quotationFollowUpDays: Math.min(Math.max(Number(settings.quotationFollowUpDays || 2), 1), 30),
      quotationApprovalReminderHours: normalizeNumberList(settings.quotationApprovalReminderHours, 1, 168, [2, 8, 24]),
      adminReviewReminderHours: normalizeNumberList(settings.adminReviewReminderHours, 1, 336, [4, 24, 48]),
      paymentDueReminderDays: normalizeNumberList(settings.paymentDueReminderDays, 0, 30, [3, 1, 0]),
      paymentOverdueReminderDays: normalizeNumberList(settings.paymentOverdueReminderDays, 1, 90, [1, 3, 7]),
      paymentVerificationReminderHours: normalizeNumberList(settings.paymentVerificationReminderHours, 1, 168, [2, 8, 24]),
      projectTaskReminderDays: normalizeNumberList(settings.projectTaskReminderDays, 0, 30, [1, 0]),
      projectTaskOverdueReminderDays: normalizeNumberList(settings.projectTaskOverdueReminderDays, 1, 90, [1, 3, 7]),
      commissionReviewReminderHours: normalizeNumberList(settings.commissionReviewReminderHours, 1, 336, [4, 24, 48]),
      commissionPayoutReminderDays: normalizeNumberList(settings.commissionPayoutReminderDays, 0, 30, [1, 0]),
      maxAttempts: Math.min(Math.max(Number(settings.maxAttempts || 5), 1), 10)
    };
    if (!payload.publicBaseUrl.startsWith('https://') && !payload.publicBaseUrl.startsWith('http://')) throw new Error('Public base URL must begin with http:// or https://.');
    const { error } = await supabase.from('system_configuration').upsert({
      config_key: 'notification_settings',
      config_value: payload,
      description: 'ProFox server-side notification delivery, reminders and operational automation settings.',
      updated_by: auth.user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'config_key' });
    if (error) throw error;
    return payload;
  },

  async listTemplates(): Promise<NotificationTemplate[]> {
    const { data, error } = await supabase.from('notification_templates').select('*').order('name');
    if (error) throw error;
    return (data || []).map(mapTemplate);
  },

  async saveTemplate(template: NotificationTemplate): Promise<NotificationTemplate> {
    const { data, error } = await supabase.from('notification_templates').upsert({
      template_key: template.templateKey,
      name: template.name,
      subject_template: template.subjectTemplate,
      body_template: template.bodyTemplate,
      active: template.active,
      description: template.description
    }, { onConflict: 'template_key' }).select('*').single();
    if (error) throw error;
    return mapTemplate(data);
  },

  async retryFailedNotifications() {
    const { data, error } = await supabase.rpc('admin_retry_failed_notifications');
    if (error) throw error;
    return Number(data || 0);
  },

  async queueTestNotification(email: string) {
    const { data, error } = await supabase.rpc('admin_queue_test_notification', { p_recipient_email: email });
    if (error) throw error;
    return data as string | null;
  },

  async getBookingAnalytics(days = 30): Promise<BookingAnalytics> {
    const { data, error } = await supabase.rpc('admin_get_booking_analytics', { p_days: days });
    if (error) throw error;
    return data as BookingAnalytics;
  },

  async getTodayDashboard(salespersonId?: string): Promise<SalesTodayDashboard> {
    const { data, error } = await supabase.rpc('get_sales_today_dashboard', { p_salesperson_id: salespersonId || null });
    if (error) throw error;
    return data as SalesTodayDashboard;
  },

  async markNotificationRead(id: string) {
    const { error } = await supabase.rpc('mark_in_app_notification_read', { p_id: id });
    if (error) throw error;
  }
};
