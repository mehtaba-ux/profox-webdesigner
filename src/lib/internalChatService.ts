import { supabase } from './supabase';

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
}

function mapContact(row: any): InternalChatContact {
  return {
    projectId: row.project_id,
    projectName: row.project_name || 'Project',
    userId: row.user_id,
    fullName: row.full_name || 'Team member',
    role: row.role || '',
    department: row.department || 'General',
    avatarUrl: row.avatar_url || '',
    communicationScope: row.communication_scope || 'Internal'
  };
}

function mapThread(row: any): InternalChatThread {
  return {
    projectId: row.project_id,
    projectName: row.project_name || 'Project',
    threadId: row.thread_id,
    otherUserId: row.other_user_id,
    otherFullName: row.other_full_name || 'Team member',
    otherRole: row.other_role || '',
    otherDepartment: row.other_department || 'General',
    otherAvatarUrl: row.other_avatar_url || '',
    lastMessagePreview: row.last_message_preview || '',
    lastMessageSenderId: row.last_message_sender_id || null,
    lastMessageAt: row.last_message_at || null,
    unreadCount: Number(row.unread_count || 0)
  };
}

function mapMessage(row: any): InternalChatMessage {
  return {
    messageId: row.message_id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderFullName: row.sender_full_name || 'Team member',
    senderRole: row.sender_role || '',
    body: row.body || '',
    createdAt: row.created_at
  };
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

  async getOrCreateThread(
    otherUserId: string,
    projectId: string
  ): Promise<{ data: string | null; error: any }> {
    const { data, error } = await supabase.rpc('internal_chat_get_or_create_thread', {
      p_other_user_id: otherUserId,
      p_project_id: projectId
    });
    return { data: error ? null : (data as string), error };
  },

  async getMessages(threadId: string, before?: string | null, limit = 100): Promise<{ data: InternalChatMessage[]; error: any }> {
    const { data, error } = await supabase.rpc('internal_chat_get_messages', {
      p_thread_id: threadId,
      p_before: before || null,
      p_limit: limit
    });
    return { data: error ? [] : (data || []).map(mapMessage), error };
  },

  async sendMessage(threadId: string, body: string): Promise<{ data: string | null; error: any }> {
    const { data, error } = await supabase.rpc('internal_chat_send_message', {
      p_thread_id: threadId,
      p_body: body
    });
    return { data: error ? null : (data as string), error };
  },

  async markRead(threadId: string): Promise<{ error: any }> {
    const { error } = await supabase.rpc('internal_chat_mark_read', { p_thread_id: threadId });
    return { error };
  }
};