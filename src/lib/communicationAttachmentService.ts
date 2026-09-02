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
export const PROFESSIONAL_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const COMMUNICATION_ATTACHMENT_ACCEPT = [
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime','video/mpeg',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv',
].join(',');

const ALLOWED_TYPES = new Set(COMMUNICATION_ATTACHMENT_ACCEPT.split(','));

export function validateCommunicationAttachmentFile(file: File) {
  const contentType = (file.type || '').toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) throw new Error('This file type is not allowed. Use an image, MP4/WebM/MOV/MPEG video, PDF, Office document, TXT or CSV file.');
  if (file.size < 1) throw new Error('The selected file is empty.');
  if (file.size > COMMUNICATION_ATTACHMENT_MAX_BYTES) throw new Error('Files must be 50 MB or smaller.');
}

export function validateCommunicationAttachmentSelection(files: File[], maxTotalBytes?: number) {
  if (files.length > COMMUNICATION_ATTACHMENT_MAX_COUNT) throw new Error(`You can attach up to ${COMMUNICATION_ATTACHMENT_MAX_COUNT} files to one message.`);
  files.forEach(validateCommunicationAttachmentFile);
  if (maxTotalBytes && files.reduce((total, file) => total + file.size, 0) > maxTotalBytes) {
    throw new Error(`Professional Email attachments must total ${Math.round(maxTotalBytes / 1024 / 1024)} MB or less.`);
  }
}

async function bearerHeader() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function authorizationHeaders(conversationId?: string) {
  const publicToken = conversationId ? getChatAccessToken(conversationId) : '';
  return publicToken ? { 'X-ProFox-Chat-Token': publicToken } : bearerHeader();
}

async function upload(form: FormData, publicToken?: string): Promise<UploadedCommunicationAttachment> {
  const file = form.get('file');
  if (!(file instanceof File)) throw new Error('Choose a file to attach.');
  validateCommunicationAttachmentFile(file);
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

export async function fetchCommunicationAttachmentBlob(input: {
  attachment: CommunicationAttachment;
  conversationId?: string;
}) {
  const headers = await authorizationHeaders(input.conversationId);
  const response = await fetch(`/api/communication-attachments/${encodeURIComponent(input.attachment.id)}`, { headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'The attachment could not be opened.');
  }
  return response.blob();
}

export async function downloadCommunicationAttachment(input: {
  attachment: CommunicationAttachment;
  conversationId?: string;
}) {
  const blob = await fetchCommunicationAttachmentBlob(input);
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

export async function deleteCommunicationAttachment(input: {
  attachment: Pick<CommunicationAttachment, 'id'>;
  conversationId?: string;
}) {
  const headers = await authorizationHeaders(input.conversationId);
  const response = await fetch(`/api/communication-attachments/${encodeURIComponent(input.attachment.id)}`, { method: 'DELETE', headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'The unused attachment could not be removed.');
  }
}

export function formatAttachmentSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export async function fileToBase64(file: File) {
  validateCommunicationAttachmentFile(file);
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  return btoa(binary);
}
