import { supabase } from './supabase';

export interface WhatsAppBusinessConfig {
  phoneNumberId: string;
  businessAccountId: string;
  businessPhone: string;
  graphApiVersion: string;
  defaultTemplateName: string;
  defaultTemplateLanguage: string;
  accessTokenStored: boolean;
  verifyTokenStored: boolean;
  appSecretStored: boolean;
  configured: boolean;
  enabled: boolean;
}

export interface CustomerCommunicationCapabilities {
  canAccess: boolean;
  role: string;
  canSendChat: boolean;
  canViewEmail: boolean;
  canSendEmail: boolean;
  canManageStatus: boolean;
  whatsappConfigured: boolean;
  whatsappSessionOpen: boolean;
  whatsappTemplateConfigured: boolean;
  whatsappTemplateName: string;
  canSendWhatsApp: boolean;
  customerPhone: string;
  whatsappBusinessPhone: string;
}

export interface WhatsAppSendResult {
  providerAccepted: boolean;
  requestId: string;
  providerMessageId: string;
  recipientPhone: string;
  usedTemplate: boolean;
}

function errorMessage(error: any, fallback: string) {
  const context = error?.context?.body?.error || error?.context?.body?.message;
  return String(context || error?.message || fallback);
}

function normalizeConfig(value: any): WhatsAppBusinessConfig {
  return {
    phoneNumberId: String(value?.phoneNumberId || ''),
    businessAccountId: String(value?.businessAccountId || ''),
    businessPhone: String(value?.businessPhone || ''),
    graphApiVersion: String(value?.graphApiVersion || 'v23.0'),
    defaultTemplateName: String(value?.defaultTemplateName || ''),
    defaultTemplateLanguage: String(value?.defaultTemplateLanguage || 'en_US'),
    accessTokenStored: Boolean(value?.accessTokenStored),
    verifyTokenStored: Boolean(value?.verifyTokenStored),
    appSecretStored: Boolean(value?.appSecretStored),
    configured: Boolean(value?.configured),
    enabled: Boolean(value?.enabled),
  };
}

function normalizeCapabilities(value: any): CustomerCommunicationCapabilities {
  return {
    canAccess: Boolean(value?.canAccess),
    role: String(value?.role || ''),
    canSendChat: Boolean(value?.canSendChat),
    canViewEmail: Boolean(value?.canViewEmail),
    canSendEmail: Boolean(value?.canSendEmail),
    canManageStatus: Boolean(value?.canManageStatus),
    whatsappConfigured: Boolean(value?.whatsappConfigured),
    whatsappSessionOpen: Boolean(value?.whatsappSessionOpen),
    whatsappTemplateConfigured: Boolean(value?.whatsappTemplateConfigured),
    whatsappTemplateName: String(value?.whatsappTemplateName || ''),
    canSendWhatsApp: Boolean(value?.canSendWhatsApp),
    customerPhone: String(value?.customerPhone || ''),
    whatsappBusinessPhone: String(value?.whatsappBusinessPhone || ''),
  };
}

export const whatsappBusinessService = {
  async getAdminConfig(): Promise<WhatsAppBusinessConfig> {
    const { data, error } = await supabase.rpc('admin_get_whatsapp_business_config');
    if (error) throw new Error(error.message || 'WhatsApp Business configuration could not be loaded.');
    return normalizeConfig(data);
  },

  async saveAdminConfig(input: {
    phoneNumberId: string;
    businessAccountId: string;
    businessPhone: string;
    graphApiVersion: string;
    accessToken?: string;
    verifyToken?: string;
    appSecret?: string;
    defaultTemplateName?: string;
    defaultTemplateLanguage?: string;
    enabled: boolean;
  }): Promise<WhatsAppBusinessConfig> {
    const { data, error } = await supabase.rpc('admin_set_whatsapp_business_provider', {
      p_phone_number_id: input.phoneNumberId.trim(),
      p_business_account_id: input.businessAccountId.trim(),
      p_business_phone: input.businessPhone.trim(),
      p_graph_api_version: input.graphApiVersion.trim() || 'v23.0',
      p_access_token: input.accessToken?.trim() || '',
      p_verify_token: input.verifyToken?.trim() || '',
      p_app_secret: input.appSecret?.trim() || '',
      p_default_template_name: input.defaultTemplateName?.trim() || '',
      p_default_template_language: input.defaultTemplateLanguage?.trim() || 'en_US',
      p_enabled: input.enabled,
    });
    if (error) throw new Error(error.message || 'WhatsApp Business configuration could not be saved.');
    return normalizeConfig(data);
  },

  async getCapabilities(conversationId: string): Promise<CustomerCommunicationCapabilities> {
    const { data, error } = await supabase.rpc('customer_communication_get_capabilities', {
      p_conversation_id: conversationId,
    });
    if (error) throw new Error(error.message || 'Customer communication capabilities could not be loaded.');
    return normalizeCapabilities(data);
  },

  async sendMessage(input: { conversationId: string; message: string; idempotencyKey: string }): Promise<WhatsAppSendResult> {
    const { data, error } = await supabase.functions.invoke('whatsapp-business', {
      body: {
        action: 'send',
        conversationId: input.conversationId,
        message: input.message,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (error) throw new Error(errorMessage(error, 'WhatsApp message could not be sent.'));
    if (data?.error) throw new Error(String(data.error));
    if (!data?.providerAccepted) throw new Error('WhatsApp did not confirm that the message was accepted.');
    return {
      providerAccepted: true,
      requestId: String(data?.requestId || ''),
      providerMessageId: String(data?.providerMessageId || ''),
      recipientPhone: String(data?.recipientPhone || ''),
      usedTemplate: Boolean(data?.usedTemplate),
    };
  },
};
