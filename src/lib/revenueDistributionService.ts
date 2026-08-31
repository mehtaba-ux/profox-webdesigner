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
    const [dashboard, management] = await Promise.all([
      supabase.rpc('admin_revenue_distribution_dashboard'),
      supabase.rpc('admin_revenue_distribution_management_snapshot'),
    ]);
    if (dashboard.error) return dashboard;
    // Keep the existing dashboard available during a rolling frontend/database deploy.
    // Any real authorization or query error still fails closed.
    if (management.error && !['PGRST202', '42883'].includes(String(management.error.code || ''))) return management;
    return {
      data: {
        ...(dashboard.data || {}),
        productProfiles: management.data?.productProfiles || [],
        projectActuals: management.data?.projectActuals || [],
      },
      error: null,
    };
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
  async saveProductProfile(productId: string, roles: RevenueDistributionRoleConfig[]) {
    return await supabase.rpc('admin_save_revenue_distribution_product_profile', {
      p_product_id: productId,
      p_roles: roles,
    });
  },
  async clearProductProfile(productId: string) {
    return await supabase.rpc('admin_clear_revenue_distribution_product_profile', { p_product_id: productId });
  },
  async setQuotationOverride(quotationId: string, roles: RevenueDistributionRoleConfig[] | null, reason = '') {
    return await supabase.rpc('set_quotation_revenue_distribution_override', {
      p_quotation_id: quotationId,
      p_roles: roles,
      p_reason: reason || null,
    });
  },
};
