import { supabase } from './supabase';
import type { CommunicationAttachment } from './communicationAttachmentService';

export interface InternalChatContact {
  projectId: string;
  projectName: string;
  userId: string;
  fullName: string;
  role: string;
  department: string;
  avatarUrl: string;
  communicationScope: string;
}

export interface InternalChatThread {
  projectId: string;
  projectName: string;
  threadId: string;
  otherUserId: string;
  otherFullName: string;
  otherRole: string;
  otherDepartment: string;
  otherAvatarUrl: string;
  lastMessagePreview: string;
  lastMessageSenderId?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
}

export interface InternalChatMessage {
  messageId: string;
  threadId: string;
  senderId: string;
  senderFullName: string;
  senderRole: string;
  body: string;
  createdAt: string;
  attachments: CommunicationAttachment[];
}

export interface ClientChatAccessOption {
  projectId: string;
  projectName: string;
  customerUserId: string;
  customerName: string;
  deliveryUserId: string;
  deliveryName: string;
  deliveryRole: string;
  grantId?: string | null;
  isActive: boolean;
  expiresAt?: string | null;
}

export interface InternalChatRealtimeEvent {
  table: 'internal_chat_messages' | 'internal_chat_threads';
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  record: Record<string, any>;
  oldRecord: Record<string, any>;
}

function mapContact(row: any): InternalChatContact {
  return { projectId: row.project_id, projectName: row.project_name || 'Project', userId: row.user_id, fullName: row.full_name || 'Project contact', role: row.role || '', department: row.department || 'General', avatarUrl: row.avatar_url || '', communicationScope: row.communication_scope || 'Project' };
}

function mapThread(row: any): InternalChatThread {
  return { projectId: row.project_id, projectName: row.project_name || 'Project', threadId: row.thread_id, otherUserId: row.other_user_id, otherFullName: row.other_full_name || 'Project contact', otherRole: row.other_role || '', otherDepartment: row.other_department || 'General', otherAvatarUrl: row.other_avatar_url || '', lastMessagePreview: row.last_message_preview || '', lastMessageSenderId: row.last_message_sender_id || null, lastMessageAt: row.last_message_at || null, unreadCount: Number(row.unread_count || 0) };
}

function mapMessage(row: any): InternalChatMessage {
  return { messageId: row.message_id, threadId: row.thread_id, senderId: row.sender_id, senderFullName: row.sender_full_name || 'Project contact', senderRole: row.sender_role || '', body: row.body || '', createdAt: row.created_at, attachments: Array.isArray(row.attachments) ? row.attachments : [] };
}

function mapAccessOption(row: any): ClientChatAccessOption {
  return { projectId: row.project_id, projectName: row.project_name || 'Project', customerUserId: row.customer_user_id, customerName: row.customer_name || 'Client', deliveryUserId: row.delivery_user_id, deliveryName: row.delivery_name || 'Delivery member', deliveryRole: row.delivery_role || '', grantId: row.grant_id || null, isActive: Boolean(row.is_active), expiresAt: row.expires_at || null };
}

export const internalChatService = {
  async listContacts(): Promise<{ data: InternalChatContact[]; error: any }> {
    const { data, error } = await supabase.rpc('internal_chat_contacts');
    return { data: error ? [] : (data || []).map(mapContact), error };
  },
  async listThreads(): Promise<{ data: InternalChatThread[]; error: any }> {
    const { data, error } = await supabase.rpc('internal_chat_list_threads');
    return { data: error ? [] : (data || []).map(mapThread), error };
  },
  async getOrCreateThread(otherUserId: string, projectId: string): Promise<{ data: string | null; error: any }> {
    const { data, error } = await supabase.rpc('internal_chat_get_or_create_thread', { p_other_user_id: otherUserId, p_project_id: projectId });
    return { data: error ? null : (data as string), error };
  },
  async getMessages(threadId: string, before?: string | null, limit = 50): Promise<{ data: InternalChatMessage[]; error: any }> {
    const current = await supabase.rpc('internal_chat_get_messages_v2', { p_thread_id: threadId, p_before: before || null, p_limit: limit });
    if (!current.error) return { data: (current.data || []).map(mapMessage), error: null };
    if (!/internal_chat_get_messages_v2|function .* does not exist/i.test(current.error.message || '')) return { data: [], error: current.error };
    const legacy = await supabase.rpc('internal_chat_get_messages', { p_thread_id: threadId, p_before: before || null, p_limit: limit });
    return { data: legacy.error ? [] : (legacy.data || []).map(mapMessage), error: legacy.error };
  },
  async sendMessage(threadId: string, body: string, attachmentIds: string[] = []): Promise<{ data: string | null; error: any }> {
    const ids = attachmentIds.filter(Boolean);
    const result = ids.length
      ? await supabase.rpc('internal_chat_send_message_with_attachments', { p_thread_id: threadId, p_body: body, p_attachment_ids: ids })
      : await supabase.rpc('internal_chat_send_message', { p_thread_id: threadId, p_body: body });
    return { data: result.error ? null : (result.data as string), error: result.error };
  },
  async markRead(threadId: string): Promise<{ error: any }> {
    const { error } = await supabase.rpc('internal_chat_mark_read', { p_thread_id: threadId });
    return { error };
  },
  async listClientAccessOptions(): Promise<{ data: ClientChatAccessOption[]; error: any }> {
    const { data, error } = await supabase.rpc('internal_chat_client_access_options');
    return { data: error ? [] : (data || []).map(mapAccessOption), error };
  },
  async setDeliveryClientAccess(projectId: string, deliveryUserId: string, allow: boolean, expiresAt?: string | null): Promise<{ data: string | null; error: any }> {
    const { data, error } = await supabase.rpc('internal_chat_set_delivery_client_access', { p_project_id: projectId, p_delivery_user_id: deliveryUserId, p_allow: allow, p_expires_at: expiresAt || null });
    return { data: error ? null : (data as string), error };
  },
  subscribeToProjectChat(onEvent: (event: InternalChatRealtimeEvent) => void): () => void {
    const channelName = `project-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_chat_messages' }, payload => onEvent({ table: 'internal_chat_messages', eventType: payload.eventType, record: (payload.new || {}) as Record<string, any>, oldRecord: (payload.old || {}) as Record<string, any> }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_chat_threads' }, payload => onEvent({ table: 'internal_chat_threads', eventType: payload.eventType, record: (payload.new || {}) as Record<string, any>, oldRecord: (payload.old || {}) as Record<string, any> }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }
};
