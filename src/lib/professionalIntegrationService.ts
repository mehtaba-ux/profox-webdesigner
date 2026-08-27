import { supabase } from './supabase';

export type MailProvider = 'none' | 'zoho';
export type CalendarProvider = 'google' | 'zoho';
export type MeetingProvider = 'google_meet' | 'zoho_meeting';

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
};

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
