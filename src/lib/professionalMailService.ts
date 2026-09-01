import { supabase } from './supabase';

export type ProfessionalMailSendConnectionStatus = 'disconnected' | 'connected' | 'reconnect_required' | 'error';

export interface ProfessionalMailSendStatus {
  userId: string;
  eligible: boolean;
  workEmail: string;
  mailboxStatus: string;
  mailProvider: string;
  providerAccountReady: boolean;
  sendConnectionStatus: ProfessionalMailSendConnectionStatus;
  sendConnected: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
}

export interface ProfessionalMailAuthorizationStart {
  authorizeUrl: string;
  callbackUrl: string;
  workEmail: string;
}

export interface ProfessionalMailSendResult {
  providerAccepted: boolean;
  requestId: string;
  providerMessageId: string;
  sender: string;
  recipient: string;
}

const CONNECTION_STATES = new Set<ProfessionalMailSendConnectionStatus>([
  'disconnected',
  'connected',
  'reconnect_required',
  'error',
]);

function messageFromError(error: any, fallback: string) {
  const contextMessage = error?.context?.body?.error || error?.context?.body?.message;
  return String(contextMessage || error?.message || fallback);
}

function normalizeStatus(value: any): ProfessionalMailSendStatus {
  const rawConnectionStatus = String(value?.sendConnectionStatus || 'disconnected') as ProfessionalMailSendConnectionStatus;
  return {
    userId: String(value?.userId || ''),
    eligible: Boolean(value?.eligible),
    workEmail: String(value?.workEmail || ''),
    mailboxStatus: String(value?.mailboxStatus || 'not_configured'),
    mailProvider: String(value?.mailProvider || 'none'),
    providerAccountReady: Boolean(value?.providerAccountReady),
    sendConnectionStatus: CONNECTION_STATES.has(rawConnectionStatus) ? rawConnectionStatus : 'disconnected',
    sendConnected: Boolean(value?.sendConnected),
    lastVerifiedAt: value?.lastVerifiedAt ? String(value.lastVerifiedAt) : null,
    lastError: value?.lastError ? String(value.lastError) : null,
  };
}

export const professionalMailService = {
  async getMyStatus(): Promise<ProfessionalMailSendStatus> {
    const { data, error } = await supabase.rpc('get_my_professional_mail_send_status');
    if (error) throw new Error(error.message || 'Professional email status could not be loaded.');
    return normalizeStatus(data);
  },

  async startAuthorization(): Promise<ProfessionalMailAuthorizationStart> {
    const { data, error } = await supabase.functions.invoke('zoho-mail-admin', {
      body: { action: 'start_user_send' },
    });
    if (error) throw new Error(messageFromError(error, 'Professional Zoho Mail authorization could not be started.'));
    if (data?.error) throw new Error(String(data.error));

    const authorizeUrl = String(data?.authorizeUrl || '');
    const callbackUrl = String(data?.callbackUrl || '');
    const workEmail = String(data?.workEmail || '');
    if (!authorizeUrl.startsWith('https://') || !callbackUrl.startsWith('https://') || !workEmail) {
      throw new Error('Professional Zoho Mail authorization returned an invalid response.');
    }
    return { authorizeUrl, callbackUrl, workEmail };
  },

  async sendLeadEmail(input: { leadId: string; subject: string; body: string; idempotencyKey: string }): Promise<ProfessionalMailSendResult> {
    const { data, error } = await supabase.functions.invoke('zoho-mail-admin', {
      body: {
        action: 'send',
        leadId: input.leadId,
        subject: input.subject,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (error) throw new Error(messageFromError(error, 'Professional email could not be sent.'));
    if (data?.error) throw new Error(String(data.error));
    if (!data?.providerAccepted) throw new Error('Zoho Mail did not confirm that the send request was accepted.');

    return {
      providerAccepted: true,
      requestId: String(data?.requestId || ''),
      providerMessageId: String(data?.providerMessageId || ''),
      sender: String(data?.sender || ''),
      recipient: String(data?.recipient || ''),
    };
  },
};
