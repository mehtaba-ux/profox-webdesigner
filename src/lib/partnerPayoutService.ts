import { supabase } from './supabase';

export interface SalesPartnerPayoutProfile {
  salespersonId: string;
  fullName: string;
  email: string;
  country: string;
  profileStatus: string;
  activationStage: string | null;
  finalApproval: boolean | null;
  agreementStatus: string | null;
  agreementNumber: string | null;
  agreementVerified: boolean;
  payoutMethod: 'PayPal';
  paypalEmail: string | null;
  preferredCurrency: string;
  paypalConfirmed: boolean;
  payoutEnabled: boolean;
  payoutEligible: boolean;
  holdReason: string | null;
  updatedAt?: string | null;
}

export type PartnerPayoutStatus = 'Ready' | 'On Hold' | 'Paid' | 'Cancelled';

export interface CommissionPartnerPayout {
  id: string;
  batchId: string;
  batchNumber: string;
  batchTitle: string;
  scheduledDate: string;
  batchStatus: string;
  salespersonId: string;
  salespersonName: string;
  salespersonEmail: string;
  country: string;
  currency: string;
  amount: number;
  entryCount: number;
  status: PartnerPayoutStatus;
  payoutMethod: 'PayPal';
  paypalEmail: string | null;
  preferredCurrency: string | null;
  paypalTransactionId: string | null;
  holdReason: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export const partnerPayoutService = {
  async listProfiles(): Promise<SalesPartnerPayoutProfile[]> {
    const { data, error } = await supabase.rpc('admin_list_sales_partner_payout_profiles');
    if (error) throw error;
    return normalizeArray<SalesPartnerPayoutProfile>(data);
  },

  async saveProfile(input: {
    salespersonId: string;
    paypalEmail: string;
    preferredCurrency: string;
    paypalConfirmed: boolean;
    payoutEnabled: boolean;
    notes?: string;
  }): Promise<SalesPartnerPayoutProfile> {
    const { data, error } = await supabase.rpc('admin_upsert_sales_partner_payout_profile', {
      p_salesperson_id: input.salespersonId,
      p_paypal_email: input.paypalEmail,
      p_preferred_currency: input.preferredCurrency,
      p_paypal_confirmed: input.paypalConfirmed,
      p_payout_enabled: input.payoutEnabled,
      p_notes: input.notes || '',
    });
    if (error) throw error;
    return data as SalesPartnerPayoutProfile;
  },

  async listPayouts(batchId?: string): Promise<CommissionPartnerPayout[]> {
    const { data, error } = await supabase.rpc('admin_get_commission_partner_payouts', {
      p_batch_id: batchId || null,
    });
    if (error) throw error;
    return normalizeArray<CommissionPartnerPayout>(data).map(item => ({
      ...item,
      amount: Number(item.amount || 0),
      entryCount: Number(item.entryCount || 0),
    }));
  },

  async refreshBatch(batchId: string): Promise<CommissionPartnerPayout[]> {
    const { data, error } = await supabase.rpc('admin_refresh_commission_partner_payouts', {
      p_batch_id: batchId,
    });
    if (error) throw error;
    return normalizeArray<CommissionPartnerPayout>(data).map(item => ({
      ...item,
      amount: Number(item.amount || 0),
      entryCount: Number(item.entryCount || 0),
    }));
  },

  async confirmPaid(payoutId: string, paypalTransactionId: string, notes = ''): Promise<void> {
    const { error } = await supabase.rpc('admin_confirm_commission_partner_payout', {
      p_partner_payout_id: payoutId,
      p_paypal_transaction_id: paypalTransactionId.trim(),
      p_notes: notes,
    });
    if (error) throw error;
  },
};

export const PAYPAL_SEND_URL = 'https://www.paypal.com/in/digital-wallet/send-receive-money/send-money';
