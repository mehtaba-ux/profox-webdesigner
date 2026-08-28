import { supabase } from './supabase';

export interface ZohoCalendarConnectionStatus {
  connected: boolean;
  status: 'connected' | 'reconnect_required' | 'disconnected' | 'error';
  accountEmail: string;
  calendarId: string;
  calendarTimezone: string;
  meetingReady: boolean;
  lastAuthAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  calendarEnabled: boolean;
  meetingEnabled: boolean;
  effectiveCalendarProvider: 'google' | 'zoho';
  effectiveMeetingProvider: 'google_meet' | 'zoho_meeting';
}

const endpoint = `${String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/zoho-calendar-oauth`;

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Authentication required.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || 'Zoho Calendar request failed.'));
  return payload as T;
}

export const zohoCalendarService = {
  async getStatus(): Promise<{ connection: ZohoCalendarConnectionStatus; providerConfigured: boolean; redirectUri: string }> {
    return invoke({ action: 'status' });
  },
  async connect(returnPath = '/admin/meetings?tab=availability'): Promise<void> {
    const result = await invoke<{ authorizationUrl: string }>({ action: 'start', returnPath });
    if (!String(result.authorizationUrl || '').startsWith('https://')) throw new Error('Zoho returned an invalid authorization URL.');
    window.location.assign(result.authorizationUrl);
  },
  async reconnect(returnPath = '/admin/meetings?tab=availability'): Promise<void> {
    const result = await invoke<{ authorizationUrl: string }>({ action: 'reconnect', returnPath });
    if (!String(result.authorizationUrl || '').startsWith('https://')) throw new Error('Zoho returned an invalid authorization URL.');
    window.location.assign(result.authorizationUrl);
  },
  async disconnect(): Promise<void> {
    await invoke({ action: 'disconnect' });
  },
  async syncNow(): Promise<void> {
    await invoke({ action: 'sync_now' });
  },
};
