import { supabase } from './supabase';

export type RazorpayXPayoutStatus = {
  enabled: boolean;
  mode: 'test' | 'live';
  keyId?: string;
  configured: boolean;
  webhookConfigured: boolean;
  accountNumberLast4?: string;
  defaultBankMode: 'IMPS' | 'NEFT' | 'RTGS';
  queueIfLowBalance: boolean;
  ready?: boolean;
  testReady?: boolean;
  productionReady?: boolean;
  lastTestSuccess?: boolean;
  lastTestAt?: string;
  lastTestMessage?: string;
};

function failure(error: any, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export const razorpayxPayoutService = {
  async getStatus(): Promise<RazorpayXPayoutStatus> {
    const { data, error } = await supabase.rpc('admin_get_razorpayx_payout_status');
    if (error) failure(error, 'RazorpayX payout settings could not be loaded.');
    return data as RazorpayXPayoutStatus;
  },

  async saveSettings(input: {
    enabled: boolean;
    mode: 'test' | 'live';
    keyId: string;
    apiSecret?: string;
    accountNumber?: string;
    webhookSecret?: string;
    defaultBankMode: 'IMPS' | 'NEFT' | 'RTGS';
    queueIfLowBalance: boolean;
  }): Promise<RazorpayXPayoutStatus> {
    const { data, error } = await supabase.rpc('admin_set_razorpayx_payout_settings', {
      p_enabled: input.enabled,
      p_mode: input.mode,
      p_key_id: input.keyId,
      p_api_secret: input.apiSecret || '',
      p_account_number: input.accountNumber || '',
      p_webhook_secret: input.webhookSecret || '',
      p_default_bank_mode: input.defaultBankMode,
      p_queue_if_low_balance: input.queueIfLowBalance,
    });
    if (error) failure(error, 'RazorpayX payout settings could not be saved.');
    return data as RazorpayXPayoutStatus;
  },

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const { data, error } = await supabase.functions.invoke('razorpayx-payouts', { body: { action: 'test' } });
    if (error) failure(error, 'RazorpayX connection test failed.');
    if (!data?.ok) throw new Error(String(data?.message || 'RazorpayX connection test failed.'));
    return data;
  },

  async processBatch(batchId: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('razorpayx-payouts', { body: { action: 'process_batch', batchId } });
    if (error) failure(error, 'RazorpayX batch processing failed.');
    if (data?.error) throw new Error(String(data.error));
    return data;
  },

  async getMyProfile(): Promise<any> {
    const { data, error } = await supabase.rpc('get_my_worker_payout_profile');
    if (error) failure(error, 'Employee payout profile could not be loaded.');
    return data;
  },

  async submitMyProfile(payoutMethod: 'Bank Account' | 'UPI', details: Record<string, string>): Promise<any> {
    const { data, error } = await supabase.rpc('submit_my_worker_payout_profile', { p_payout_method: payoutMethod, p_details: details });
    if (error) failure(error, 'Employee payout profile could not be saved.');
    return data;
  },

  async getAdminState(): Promise<any> {
    const { data, error } = await supabase.rpc('admin_get_worker_razorpayx_payout_state');
    if (error) failure(error, 'Employee payout state could not be loaded.');
    return data;
  },

  async revealProfile(profileId: string, reason: string): Promise<any> {
    const { data, error } = await supabase.rpc('admin_reveal_worker_payout_profile', { p_profile_id: profileId, p_reason: reason });
    if (error) failure(error, 'Employee payout details could not be revealed.');
    return data;
  },

  async reviewProfile(profileId: string, decision: 'Verified' | 'Rejected', reason = '', reference = ''): Promise<any> {
    const { data, error } = await supabase.rpc('admin_review_worker_payout_profile', {
      p_profile_id: profileId,
      p_decision: decision,
      p_reason: reason || null,
      p_verification_reference: reference || null,
    });
    if (error) failure(error, 'Employee payout profile review failed.');
    return data;
  },
};
