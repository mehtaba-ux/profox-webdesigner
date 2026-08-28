import { supabase } from './supabase';

export type MailProvider = 'none' | 'zoho';
export type CalendarProvider = 'google' | 'zoho';
export type MeetingProvider = 'google_meet' | 'zoho_meeting';
export type ZohoMailConnectionStatus = 'disconnected' | 'connected' | 'reconnect_required' | 'error';

export interface ProfessionalIntegrationsConfig {
  zohoEnabled: boolean;
  zohoMailEnabled: boolean;
  zohoCalendarEnabled: boolean;
  zohoMeetingEnabled: boolean;
  mailProvisioningEnabled: boolean;
  professionalEmailRequired: boolean;
  defaultMailProvider: MailProvider;
  defaultCalendarProvider: CalendarProvider;
  defaultMeetingProvider: MeetingProvider;
  zohoOrganizationId: string;
  zohoDataCenter: string;
  zohoProviderConfigured: boolean;
  zohoClientIdHint: string;
  zohoClientSecretStored: boolean;
  zohoMailConnectionStatus: ZohoMailConnectionStatus;
  zohoMailConnected: boolean;
  zohoMailLastVerifiedAt: string | null;
}

export interface ProfessionalIntegrationHealth {
  generatedAt: string;
  google: {
    connectedAccounts: number;
    activeProviderAccounts: number;
    pending: number;
    retry: number;
    processing: number;
    reconnectRequired: number;
    failedHistorical: number;
    deadLetter: number;
    skipped: number;
    oldestPendingAt: string | null;
  };
  zoho: {
    connectedAccounts: number;
    errorAccounts: number;
    organizationMailStatus: ZohoMailConnectionStatus;
    organizationMailConnected: boolean;
    organizationMailLastVerifiedAt: string | null;
  };
  mailboxes: {
    active: number;
    provisioning: number;
    error: number;
    suspended: number;
    queuePending: number;
    queueRetry: number;
    queueProcessing: number;
    queueDeadLetter: number;
    oldestQueuedAt: string | null;
  };
  clientInbox: {
    messagesLast24Hours: number;
    deliveryIssues: number;
  };
}

export interface ZohoMailAuthorizationStart {
  authorizeUrl: string;
  callbackUrl: string;
}

const DEFAULT_CONFIG: ProfessionalIntegrationsConfig = {
  zohoEnabled: false,
  zohoMailEnabled: false,
  zohoCalendarEnabled: false,
  zohoMeetingEnabled: false,
  mailProvisioningEnabled: false,
  professionalEmailRequired: false,
  defaultMailProvider: 'none',
  defaultCalendarProvider: 'google',
  defaultMeetingProvider: 'google_meet',
  zohoOrganizationId: '',
  zohoDataCenter: '',
  zohoProviderConfigured: false,
  zohoClientIdHint: '',
  zohoClientSecretStored: false,
  zohoMailConnectionStatus: 'disconnected',
  zohoMailConnected: false,
  zohoMailLastVerifiedAt: null,
};

const DEFAULT_HEALTH: ProfessionalIntegrationHealth = {
  generatedAt: '',
  google: {
    connectedAccounts: 0,
    activeProviderAccounts: 0,
    pending: 0,
    retry: 0,
    processing: 0,
    reconnectRequired: 0,
    failedHistorical: 0,
    deadLetter: 0,
    skipped: 0,
    oldestPendingAt: null,
  },
  zoho: {
    connectedAccounts: 0,
    errorAccounts: 0,
    organizationMailStatus: 'disconnected',
    organizationMailConnected: false,
    organizationMailLastVerifiedAt: null,
  },
  mailboxes: {
    active: 0,
    provisioning: 0,
    error: 0,
    suspended: 0,
    queuePending: 0,
    queueRetry: 0,
    queueProcessing: 0,
    queueDeadLetter: 0,
    oldestQueuedAt: null,
  },
  clientInbox: { messagesLast24Hours: 0, deliveryIssues: 0 },
};

function connectionStatus(value: unknown): ZohoMailConnectionStatus {
  return ['connected', 'reconnect_required', 'error'].includes(String(value))
    ? String(value) as ZohoMailConnectionStatus
    : 'disconnected';
}

function normalize(value: any): ProfessionalIntegrationsConfig {
  return {
    ...DEFAULT_CONFIG,
    zohoEnabled: Boolean(value?.zohoEnabled),
    zohoMailEnabled: Boolean(value?.zohoMailEnabled),
    zohoCalendarEnabled: Boolean(value?.zohoCalendarEnabled),
    zohoMeetingEnabled: Boolean(value?.zohoMeetingEnabled),
    mailProvisioningEnabled: Boolean(value?.mailProvisioningEnabled),
    professionalEmailRequired: Boolean(value?.professionalEmailRequired),
    defaultMailProvider: value?.defaultMailProvider === 'zoho' ? 'zoho' : 'none',
    defaultCalendarProvider: value?.defaultCalendarProvider === 'zoho' ? 'zoho' : 'google',
    defaultMeetingProvider: value?.defaultMeetingProvider === 'zoho_meeting' ? 'zoho_meeting' : 'google_meet',
    zohoOrganizationId: String(value?.zohoOrganizationId || ''),
    zohoDataCenter: String(value?.zohoDataCenter || ''),
    zohoProviderConfigured: Boolean(value?.zohoProviderConfigured),
    zohoClientIdHint: String(value?.zohoClientIdHint || ''),
    zohoClientSecretStored: Boolean(value?.zohoClientSecretStored),
    zohoMailConnectionStatus: connectionStatus(value?.zohoMailConnectionStatus),
    zohoMailConnected: Boolean(value?.zohoMailConnected),
    zohoMailLastVerifiedAt: value?.zohoMailLastVerifiedAt ? String(value.zohoMailLastVerifiedAt) : null,
  };
}

function count(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeHealth(value: any): ProfessionalIntegrationHealth {
  return {
    generatedAt: String(value?.generatedAt || ''),
    google: {
      connectedAccounts: count(value?.google?.connectedAccounts),
      activeProviderAccounts: count(value?.google?.activeProviderAccounts),
      pending: count(value?.google?.pending),
      retry: count(value?.google?.retry),
      processing: count(value?.google?.processing),
      reconnectRequired: count(value?.google?.reconnectRequired),
      failedHistorical: count(value?.google?.failedHistorical),
      deadLetter: count(value?.google?.deadLetter),
      skipped: count(value?.google?.skipped),
      oldestPendingAt: value?.google?.oldestPendingAt ? String(value.google.oldestPendingAt) : null,
    },
    zoho: {
      connectedAccounts: count(value?.zoho?.connectedAccounts),
      errorAccounts: count(value?.zoho?.errorAccounts),
      organizationMailStatus: connectionStatus(value?.zoho?.organizationMailStatus),
      organizationMailConnected: Boolean(value?.zoho?.organizationMailConnected),
      organizationMailLastVerifiedAt: value?.zoho?.organizationMailLastVerifiedAt ? String(value.zoho.organizationMailLastVerifiedAt) : null,
    },
    mailboxes: {
      active: count(value?.mailboxes?.active),
      provisioning: count(value?.mailboxes?.provisioning),
      error: count(value?.mailboxes?.error),
      suspended: count(value?.mailboxes?.suspended),
      queuePending: count(value?.mailboxes?.queuePending),
      queueRetry: count(value?.mailboxes?.queueRetry),
      queueProcessing: count(value?.mailboxes?.queueProcessing),
      queueDeadLetter: count(value?.mailboxes?.queueDeadLetter),
      oldestQueuedAt: value?.mailboxes?.oldestQueuedAt ? String(value.mailboxes.oldestQueuedAt) : null,
    },
    clientInbox: {
      messagesLast24Hours: count(value?.clientInbox?.messagesLast24Hours),
      deliveryIssues: count(value?.clientInbox?.deliveryIssues),
    },
  };
}

function throwRpc(error: any, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export const professionalIntegrationService = {
  async getAdminConfig(): Promise<ProfessionalIntegrationsConfig> {
    const { data, error } = await supabase.rpc('admin_get_professional_integrations');
    if (error) throwRpc(error, 'Professional integration settings could not be loaded.');
    return normalize(data);
  },

  async getAdminHealth(): Promise<ProfessionalIntegrationHealth> {
    const { data, error } = await supabase.rpc('admin_get_integration_health');
    if (error) throwRpc(error, 'Integration health could not be loaded.');
    return normalizeHealth(data || DEFAULT_HEALTH);
  },

  async saveZohoProvider(input: {
    clientId: string;
    clientSecret?: string;
    organizationId: string;
    dataCenter: string;
  }): Promise<ProfessionalIntegrationsConfig> {
    const { data, error } = await supabase.rpc('admin_set_zoho_provider', {
      p_client_id: input.clientId.trim(),
      p_client_secret: input.clientSecret?.trim() || '',
      p_organization_id: input.organizationId.trim(),
      p_data_center: input.dataCenter.trim(),
    });
    if (error) throwRpc(error, 'Zoho provider configuration could not be saved.');
    return normalize(data);
  },

  async startZohoMailAuthorization(): Promise<ZohoMailAuthorizationStart> {
    const { data, error } = await supabase.functions.invoke('zoho-mail-admin', {
      body: { action: 'start' },
    });
    if (error) throwRpc(error, 'Zoho Mail authorization could not be started.');
    const authorizeUrl = String(data?.authorizeUrl || '');
    const callbackUrl = String(data?.callbackUrl || '');
    if (!authorizeUrl.startsWith('https://') || !callbackUrl.startsWith('https://')) {
      throw new Error('Zoho Mail authorization returned an invalid redirect.');
    }
    return { authorizeUrl, callbackUrl };
  },

  async savePolicy(input: Pick<ProfessionalIntegrationsConfig,
    | 'zohoEnabled'
    | 'zohoMailEnabled'
    | 'zohoCalendarEnabled'
    | 'zohoMeetingEnabled'
    | 'mailProvisioningEnabled'
    | 'professionalEmailRequired'
    | 'defaultMailProvider'
    | 'defaultCalendarProvider'
    | 'defaultMeetingProvider'
  >): Promise<ProfessionalIntegrationsConfig> {
    const { data, error } = await supabase.rpc('admin_set_professional_integrations', {
      p_zoho_enabled: input.zohoEnabled,
      p_zoho_mail_enabled: input.zohoMailEnabled,
      p_zoho_calendar_enabled: input.zohoCalendarEnabled,
      p_zoho_meeting_enabled: input.zohoMeetingEnabled,
      p_mail_provisioning_enabled: input.mailProvisioningEnabled,
      p_professional_email_required: input.professionalEmailRequired,
      p_default_mail_provider: input.defaultMailProvider,
      p_default_calendar_provider: input.defaultCalendarProvider,
      p_default_meeting_provider: input.defaultMeetingProvider,
    });
    if (error) throwRpc(error, 'Professional integration policy could not be saved.');
    return normalize(data);
  },
};
