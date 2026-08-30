import { supabase } from './supabase';

export interface RevenueDistributionRoleConfig {
  key: string;
  label: string;
  weightPercent: number;
  talentPartnerJobSlug?: string | null;
}

export interface RevenueDistributionConfig {
  version: number;
  targetMarginPercent: number;
  minimumMarginPercent: number;
  reservePerformanceBonus: boolean;
  selfGeneratedBonusUsesMarginBuffer: boolean;
  salesTalentPartnerJobSlug: string;
  deliveryRoles: RevenueDistributionRoleConfig[];
}

export const revenueDistributionService = {
  async getDashboard() {
    return await supabase.rpc('admin_revenue_distribution_dashboard');
  },
  async getConfig() {
    return await supabase.rpc('revenue_distribution_config');
  },
  async saveConfig(config: RevenueDistributionConfig) {
    return await supabase.rpc('admin_save_revenue_distribution_config', { p_config: config });
  },
  async previewProduct(productCode: string, price?: number | null) {
    return await supabase.rpc('revenue_distribution_preview_product', {
      p_product_code: productCode,
      p_price: price ?? null,
    });
  },
  async previewQuotation(quotationId: string) {
    return await supabase.rpc('revenue_distribution_preview_quotation', { p_quotation_id: quotationId });
  },
};
