import { supabase } from './supabase';
import {
  PROFESSIONAL_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  validateCommunicationAttachmentSelection,
  type UploadedCommunicationAttachment,
} from './communicationAttachmentService';

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
  adminManaged: boolean;
  authorizationRequired: boolean;
}

export interface ProfessionalMailSendResult {
  providerAccepted: boolean;
  requestId: string;
  providerMessageId: string;
  sender: string;
  recipient: string;
}

export interface ProfessionalMailInboxSyncResult {
  scanned: number;
  matched: number;
  synced: number;
  skippedExisting: number;
  skippedUnmatched: number;
  attachmentMessagesScanned?: number;
  attachmentMessagesFound?: number;
  attachmentsImported?: number;
  attachmentsSkippedExisting?: number;
  attachmentsSkippedUnsupported?: number;
  attachmentFailures?: number;
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
    adminManaged: value?.adminManaged === undefined ? true : Boolean(value.adminManaged),
    authorizationRequired: Boolean(value?.authorizationRequired),
  };
}

export const professionalMailService = {
  async getMyStatus(): Promise<ProfessionalMailSendStatus> {
    const { data, error } = await supabase.rpc('get_my_professional_mail_send_status');
    if (error) throw new Error(error.message || 'Professional email status could not be loaded.');
    return normalizeStatus(data);
  },

  // Compatibility guard for any stale UI bundle. Professional Mail OAuth is
  // organization-managed by ProFox Admin and staff must never authorize Zoho.
  async startAuthorization(): Promise<never> {
    throw new Error('Professional Email is managed centrally by ProFox Admin. No staff Zoho authorization is required.');
  },

  async syncInbox(): Promise<ProfessionalMailInboxSyncResult> {
    const { data, error } = await supabase.functions.invoke('zoho-mail-admin', {
      body: { action: 'sync_inbox' },
    });
    if (error) throw new Error(messageFromError(error, 'Professional inbox could not be synchronized.'));
    if (data?.error) throw new Error(String(data.error));

    const attachmentSync = await supabase.functions.invoke('zoho-mail-attachments', {
      body: { action: 'sync_inbox_attachments' },
    });
    if (attachmentSync.error) {
      throw new Error(messageFromError(attachmentSync.error, 'Professional inbox messages synchronized, but attachments could not be synchronized.'));
    }
    if (attachmentSync.data?.error) throw new Error(String(attachmentSync.data.error));

    return {
      scanned: Number(data?.scanned || 0),
      matched: Number(data?.matched || 0),
      synced: Number(data?.synced || 0),
      skippedExisting: Number(data?.skippedExisting || 0),
      skippedUnmatched: Number(data?.skippedUnmatched || 0),
      attachmentMessagesScanned: Number(attachmentSync.data?.scannedMessages || 0),
      attachmentMessagesFound: Number(attachmentSync.data?.messagesWithAttachments || 0),
      attachmentsImported: Number(attachmentSync.data?.imported || 0),
      attachmentsSkippedExisting: Number(attachmentSync.data?.skippedExisting || 0),
      attachmentsSkippedUnsupported: Number(attachmentSync.data?.skippedUnsupported || 0),
      attachmentFailures: Number(attachmentSync.data?.failed || 0),
    };
  },

  async sendLeadEmail(input: {
    leadId: string;
    subject: string;
    body: string;
    idempotencyKey: string;
    attachments?: UploadedCommunicationAttachment[];
  }): Promise<ProfessionalMailSendResult> {
    const attachments = input.attachments || [];
    validateCommunicationAttachmentSelection(attachments.map(item => item.file), PROFESSIONAL_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES);

    const functionName = attachments.length ? 'zoho-mail-attachments' : 'zoho-mail-admin';
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: {
        action: 'send',
        leadId: input.leadId,
        subject: input.subject,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
        attachments: attachments.map(attachment => ({
          id: attachment.id,
          name: attachment.name,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
        })),
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
