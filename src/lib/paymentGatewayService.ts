import { supabase } from './supabase';

export type PaymentProviderId = 'razorpay' | 'paypal';

export type GatewayProviderStatus = {
  enabled: boolean;
  mode: string;
  configured: boolean;
  webhookConfigured: boolean;
  checkoutReady?: boolean;
  productionReady?: boolean;
  testMode?: boolean;
  keyId?: string;
  clientId?: string;
  webhookId?: string;
  lastTestAt?: string;
  lastTestSuccess?: boolean;
  lastTestMessage?: string;
};

export type PaymentGatewayStatus = {
  checkoutBaseUrl: string;
  firstPaymentDueDays: number;
  milestoneDueDays: number;
  razorpay: GatewayProviderStatus;
  paypal: GatewayProviderStatus;
  canConfigure: boolean;
};

export type PublicPaymentQuotationItem = {
  name: string;
  description?: string;
  quantity?: number;
  lineTotal?: number;
  itemType?: string;
};

export type PublicPaymentMilestone = {
  paymentId: string;
  paymentReference?: string;
  milestoneNumber?: number;
  label: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  dueDate?: string;
  current?: boolean;
};

export type PublicPayment = {
  paymentId: string;
  paymentReference: string;
  quotationNumber?: string;
  customerName: string;
  customerEmail?: string;
  paymentType: string;
  milestoneNumber?: number;
  milestoneLabel?: string;
  amountDue: number;
  amountPaid: number;
  outstanding: number;
  currency: string;
  status: string;
  dueDate?: string;
  paidAt?: string;
  verifiedAt?: string;
  payable: boolean;
  quotation?: {
    number?: string;
    proposalTitle?: string;
    scopeSummary?: string;
    total?: number;
    currency?: string;
    status?: string;
    acceptedAt?: string;
    paymentTerms?: string;
    paymentSchedule?: Array<{ label?: string; percentage?: number; paymentType?: string; milestoneNumber?: number }>;
    deliveryTimeline?: string;
    items?: PublicPaymentQuotationItem[];
  } | null;
  paymentProgress?: PublicPaymentMilestone[];
  lastGatewayCharge?: {
    provider?: PaymentProviderId;
    providerAmount?: number;
    providerCurrency?: string;
    fxRate?: number;
    fxSource?: string;
    fxQuotedAt?: string;
    status?: string;
    completedAt?: string;
  } | null;
  providers: Array<{
    id: PaymentProviderId;
    label: string;
    enabled: boolean;
    mode?: string;
    productionReady?: boolean;
    testMode?: boolean;
  }>;
};

function throwIfError(error: any, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export const paymentGatewayService = {
  async getAdminStatus(): Promise<PaymentGatewayStatus> {
    const { data, error } = await supabase.rpc('admin_get_payment_gateway_status');
    if (error) throwIfError(error, 'Payment gateway settings could not be loaded.');
    return data as PaymentGatewayStatus;
  },

  async saveGeneral(input: { checkoutBaseUrl: string; firstPaymentDueDays: number; milestoneDueDays: number }): Promise<PaymentGatewayStatus> {
    const { data, error } = await supabase.rpc('admin_set_payment_gateway_general', {
      p_checkout_base_url: input.checkoutBaseUrl,
      p_first_payment_due_days: input.firstPaymentDueDays,
      p_milestone_due_days: input.milestoneDueDays,
    });
    if (error) throwIfError(error, 'General payment settings could not be saved.');
    return data as PaymentGatewayStatus;
  },

  async saveProvider(input: {
    provider: PaymentProviderId;
    enabled: boolean;
    mode: string;
    publicId: string;
    secret?: string;
    webhookSecret?: string;
    webhookId?: string;
  }): Promise<PaymentGatewayStatus> {
    const { data, error } = await supabase.rpc('admin_set_payment_gateway_provider', {
      p_provider: input.provider,
      p_enabled: input.enabled,
      p_mode: input.mode,
      p_public_id: input.publicId,
      p_secret: input.secret || '',
      p_webhook_secret: input.webhookSecret || '',
      p_webhook_id: input.webhookId || '',
    });
    if (error) throwIfError(error, `${input.provider} settings could not be saved.`);
    return data as PaymentGatewayStatus;
  },

  async testProvider(provider: PaymentProviderId): Promise<{ ok: boolean; message: string }> {
    const { data, error } = await supabase.functions.invoke('payment-gateway-admin', { body: { provider } });
    if (error) throwIfError(error, `${provider} connection test failed.`);
    return { ok: data?.ok === true, message: String(data?.message || '') };
  },

  async openPublicPayment(token: string): Promise<PublicPayment> {
    const { data, error } = await supabase.rpc('open_public_payment', { p_token: token });
    if (error) throwIfError(error, 'This payment link could not be opened.');
    return data as PublicPayment;
  },

  async openSupportChat(token: string): Promise<{ conversationUrl: string }> {
    const { data, error } = await supabase.rpc('open_public_payment_support_chat', { p_token: token });
    if (error) throwIfError(error, 'Secure Sales chat could not be opened.');
    const conversationUrl = String(data?.conversationUrl || '');
    if (!conversationUrl) throw new Error('Secure Sales chat link was not returned.');
    return { conversationUrl };
  },

  async checkout(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('payment-checkout', { body });
    if (error) throwIfError(error, 'Payment could not be processed.');
    if (data?.error) throw new Error(String(data.error));
    return data;
  },
};
