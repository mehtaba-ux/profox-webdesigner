import { supabase } from './supabase';
import { getChatAccessToken } from './chatService';

export type CommunicationAttachment = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  channel?: string;
};

export type UploadedCommunicationAttachment = CommunicationAttachment & { file: File };

export const COMMUNICATION_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
export const COMMUNICATION_ATTACHMENT_MAX_COUNT = 5;
export const COMMUNICATION_ATTACHMENT_ACCEPT = [
  'image/jpeg','image/png','image/webp','image/gif','application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv',
].join(',');

const ALLOWED_TYPES = new Set(COMMUNICATION_ATTACHMENT_ACCEPT.split(','));

function validate(file: File) {
  if (!ALLOWED_TYPES.has((file.type || '').toLowerCase())) throw new Error('This file type is not allowed.');
  if (file.size < 1) throw new Error('The selected file is empty.');
  if (file.size > COMMUNICATION_ATTACHMENT_MAX_BYTES) throw new Error('Files must be 50 MB or smaller.');
}

async function bearerHeader() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function upload(form: FormData, publicToken?: string): Promise<UploadedCommunicationAttachment> {
  const file = form.get('file');
  if (!(file instanceof File)) throw new Error('Choose a file to attach.');
  validate(file);
  const headers: Record<string, string> = publicToken
    ? { 'X-ProFox-Chat-Token': publicToken }
    : await bearerHeader();
  const response = await fetch('/api/communication-attachments/upload', { method: 'POST', headers, body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.attachment?.id) throw new Error(payload?.error || 'The attachment could not be uploaded.');
  return { ...payload.attachment, file } as UploadedCommunicationAttachment;
}

export async function uploadSalesAttachment(input: {
  conversationId: string;
  channel: 'chat' | 'email' | 'note';
  file: File;
  internalNote?: boolean;
}) {
  const form = new FormData();
  form.set('scope', 'sales');
  form.set('conversationId', input.conversationId);
  form.set('channel', input.channel);
  form.set('internalNote', input.internalNote ? 'true' : 'false');
  form.set('file', input.file);
  const publicToken = input.channel === 'chat' ? getChatAccessToken(input.conversationId) : '';
  return upload(form, publicToken || undefined);
}

export async function uploadInternalAttachment(input: { threadId: string; file: File }) {
  const form = new FormData();
  form.set('scope', 'internal');
  form.set('threadId', input.threadId);
  form.set('channel', 'client_portal');
  form.set('file', input.file);
  return upload(form);
}

export async function downloadCommunicationAttachment(input: {
  attachment: CommunicationAttachment;
  conversationId?: string;
}) {
  const publicToken = input.conversationId ? getChatAccessToken(input.conversationId) : '';
  const headers: Record<string, string> = publicToken
    ? { 'X-ProFox-Chat-Token': publicToken }
    : await bearerHeader();
  const response = await fetch(`/api/communication-attachments/${encodeURIComponent(input.attachment.id)}`, { headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'The attachment could not be downloaded.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = input.attachment.name || 'attachment';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function formatAttachmentSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export async function fileToBase64(file: File) {
  validate(file);
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  return btoa(binary);
}
