import { supabase } from './supabase';

export type NotificationCenterFilter = 'all' | 'action' | 'approvals' | 'updates' | 'warnings';

export interface NotificationCenterItem {
  id: string;
  type: string;
  category: string;
  module: string;
  priority: 'Low' | 'Normal' | 'High' | 'Critical' | string;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationCenterPage {
  items: NotificationCenterItem[];
  unreadCount: number;
  filteredCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

function normalize(data: any): NotificationCenterPage {
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    unreadCount: Number(data?.unreadCount || 0),
    filteredCount: Number(data?.filteredCount || 0),
    offset: Number(data?.offset || 0),
    limit: Number(data?.limit || 30),
    hasMore: Boolean(data?.hasMore)
  };
}

export const notificationCenterService = {
  async get(options: { limit?: number; offset?: number; filter?: NotificationCenterFilter; unreadOnly?: boolean } = {}): Promise<NotificationCenterPage> {
    const { data, error } = await supabase.rpc('get_my_notification_center', {
      p_limit: options.limit ?? 30,
      p_offset: options.offset ?? 0,
      p_filter: options.filter ?? 'all',
      p_unread_only: options.unreadOnly ?? false
    });
    if (error) throw error;
    return normalize(data);
  },

  async getUnreadCount(): Promise<number> {
    const page = await this.get({ limit: 1 });
    return page.unreadCount;
  },

  async markRead(id: string): Promise<void> {
    const { error } = await supabase.rpc('mark_in_app_notification_read', { p_id: id });
    if (error) throw error;
  },

  async markAllRead(): Promise<number> {
    const { data, error } = await supabase.rpc('mark_all_in_app_notifications_read');
    if (error) throw error;
    return Number(data || 0);
  }
};
