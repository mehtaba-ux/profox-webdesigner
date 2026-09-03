import { supabase } from './supabase';

export type PublicQuotationResponse = 'accept' | 'reject' | 'request_changes';

export interface PublicQuotationDecisionInput {
  token: string;
  response: PublicQuotationResponse;
  customerName?: string;
  customerEmail?: string;
  note?: string;
  consent?: boolean;
}

export const publicQuotationDecisionService = {
  async open(token: string) {
    return await supabase.rpc('open_public_quotation_v2', { p_token: token });
  },

  async respond(input: PublicQuotationDecisionInput) {
    return await supabase.rpc('respond_public_quotation_v2', {
      p_token: input.token,
      p_response: input.response,
      p_customer_name: input.customerName || '',
      p_customer_email: input.customerEmail || '',
      p_note: input.note || '',
      p_consent: Boolean(input.consent)
    });
  },

  async getAcceptedPayment(token: string) {
    return await supabase.rpc('get_public_quotation_payment', { p_token: token });
  }
};
