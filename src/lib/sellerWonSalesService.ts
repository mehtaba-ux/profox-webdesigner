import { supabase } from './supabase';

export interface SellerWonSale {
  opportunityId: string;
  leadId?: string | null;
  opportunityName: string;
  companyName: string;
  contactName?: string | null;
  salespersonId?: string | null;
  ownerName: string;
  quotationId?: string | null;
  quotationNumber?: string | null;
  paymentId: string;
  paymentReference: string;
  paymentType: string;
  paymentAmount: number;
  paymentCurrency: string;
  saleValue: number;
  currency: string;
  wonAt: string;
  actionUrl: string;
}

export interface SellerWonCurrencyTotal {
  currency: string;
  salesCount: number;
  salesValue: number;
}

export interface SellerMonthlyWonSales {
  generatedAt: string;
  monthStart: string;
  monthEndExclusive: string;
  timezone: string;
  scope: 'team' | 'individual';
  sellerId?: string | null;
  sales: SellerWonSale[];
  totals: SellerWonCurrencyTotal[];
}

const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export const sellerWonSalesService = {
  async get(monthStart: string, salespersonId: string | null = null): Promise<SellerMonthlyWonSales> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const { data, error } = await supabase.rpc('crm_get_seller_monthly_won_sales', {
      p_month: monthStart,
      p_salesperson_id: salespersonId,
      p_timezone: timezone,
    });
    if (error) throw error;

    return {
      generatedAt: data?.generatedAt || new Date().toISOString(),
      monthStart: data?.monthStart || monthStart,
      monthEndExclusive: data?.monthEndExclusive || monthStart,
      timezone: data?.timezone || timezone,
      scope: data?.scope === 'team' ? 'team' : 'individual',
      sellerId: data?.sellerId || null,
      sales: asArray<any>(data?.sales).map(item => ({
        opportunityId: String(item.opportunityId || ''),
        leadId: item.leadId || null,
        opportunityName: String(item.opportunityName || 'Won sale'),
        companyName: String(item.companyName || item.opportunityName || 'Customer'),
        contactName: item.contactName || null,
        salespersonId: item.salespersonId || null,
        ownerName: String(item.ownerName || 'Seller'),
        quotationId: item.quotationId || null,
        quotationNumber: item.quotationNumber || null,
        paymentId: String(item.paymentId || ''),
        paymentReference: String(item.paymentReference || ''),
        paymentType: String(item.paymentType || ''),
        paymentAmount: Number(item.paymentAmount || 0),
        paymentCurrency: String(item.paymentCurrency || item.currency || 'USD'),
        saleValue: Number(item.saleValue || 0),
        currency: String(item.currency || item.paymentCurrency || 'USD'),
        wonAt: String(item.wonAt || ''),
        actionUrl: String(item.actionUrl || '/admin/app/crm?tab=crm_leads'),
      })),
      totals: asArray<any>(data?.totals).map(item => ({
        currency: String(item.currency || 'USD'),
        salesCount: Number(item.salesCount || 0),
        salesValue: Number(item.salesValue || 0),
      })),
    };
  },
};
