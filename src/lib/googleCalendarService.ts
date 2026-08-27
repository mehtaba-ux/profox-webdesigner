import { supabase } from './supabase';

export type GoogleConnectionState = 'connected' | 'reconnect_required' | 'disconnected' | 'error';

export interface GoogleCalendarConnectionStatus {
  provider: 'google';
  status: GoogleConnectionState;
  connected: boolean;
  syncEnabled: boolean;
  createMeet: boolean;
  accountEmail: string;
  calendarId: string;
  calendarTimezone: string;
  lastSuccessfulSyncAt?: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
}

export interface GoogleCalendarSyncHealth {
  status: GoogleConnectionState;
  pendingJobs: number;
  failedJobs: number;
  lastSuccessfulSyncAt?: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  lastAudit?: {
    operation?: string;
    status?: string;
    httpStatus?: number | null;
    detail?: string;
    createdAt?: string;
  } | null;
}

export interface GoogleCalendarIntegrationSnapshot {
  connection: GoogleCalendarConnectionStatus;
  health: GoogleCalendarSyncHealth;
  providerConfigured: boolean;
  redirectUri: string;
}

export interface GoogleCalendarProviderSetup {
  configured: boolean;
  clientIdHint: string;
  secretStored: boolean;
}

async function invokeOAuth(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('google-calendar-oauth', { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data || {};
}

export const googleCalendarService = {
  async getProviderSetup(): Promise<GoogleCalendarProviderSetup> {
    const payload = await invokeOAuth({ action: 'provider_status' });
    return payload.provider as GoogleCalendarProviderSetup;
  },

  async saveProviderSetup(clientId: string, clientSecret: string): Promise<GoogleCalendarProviderSetup> {
    const payload = await invokeOAuth({
      action: 'provider_setup',
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim()
    });
    return payload.provider as GoogleCalendarProviderSetup;
  },

  async getSnapshot(): Promise<GoogleCalendarIntegrationSnapshot> {
    const [statusPayload, healthResult] = await Promise.all([
      invokeOAuth({ action: 'status' }),
      supabase.rpc('get_google_calendar_sync_health')
    ]);
    if (healthResult.error) throw healthResult.error;
    return {
      connection: statusPayload.connection as GoogleCalendarConnectionStatus,
      providerConfigured: statusPayload.providerConfigured === true,
      redirectUri: String(statusPayload.redirectUri || ''),
      health: (healthResult.data || {
        status: 'disconnected', pendingJobs: 0, failedJobs: 0,
        lastSuccessfulSyncAt: null, lastAttemptAt: null, lastError: null, lastAudit: null
      }) as GoogleCalendarSyncHealth
    };
  },

  async startConnection(reconnect = false, returnPath = '/admin/calendar'): Promise<string> {
    const safeReturnPath = returnPath.startsWith('/admin/') ? returnPath : '/admin/calendar';
    const payload = await invokeOAuth({
      action: reconnect ? 'reconnect' : 'start',
      returnPath: safeReturnPath
    });
    const authorizationUrl = String(payload.authorizationUrl || '');
    if (!authorizationUrl.startsWith('https://accounts.google.com/')) {
      throw new Error('Google authorization URL could not be created.');
    }
    return authorizationUrl;
  },

  async disconnect(): Promise<void> {
    await invokeOAuth({ action: 'disconnect' });
  },

  async updatePreferences(syncEnabled: boolean, createMeet: boolean): Promise<GoogleCalendarConnectionStatus> {
    const payload = await invokeOAuth({ action: 'preferences', syncEnabled, createMeet });
    return payload.connection as GoogleCalendarConnectionStatus;
  },

  async syncNow(): Promise<void> {
    const { data, error } = await supabase.functions.invoke('process-google-calendar-sync', {
      body: { action: 'sync_now' }
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
  }
};
