import { supabase } from './supabase';
import type { DesignEvidenceType } from './designDeliveryService';

export type DesignDeliveryDepth = 'Launch' | 'Growth' | 'Scale' | 'Custom' | 'Unmapped';

export interface DesignDeliveryAdminConfig {
  sopCode: string;
  version: string;
  wipLimit: number;
  minimumDesignQaScore: number;
  reviewSlaHours: number;
  clientReviewSlaHours: number;
  requireIndependentDesignQa: boolean;
  requireAccessibilityReview: boolean;
  requireTechnicalReview: boolean;
  requireBusinessObjective: boolean;
  requireTargetAudience: boolean;
  requirePrimaryConversion: boolean;
  requireContentReference: boolean;
  requireBrandAssetsReference: boolean;
  packageDepthByProductCode: Record<string, DesignDeliveryDepth>;
  requiredSubmissionEvidenceByDepth: Record<DesignDeliveryDepth, DesignEvidenceType[]>;
  [key: string]: any;
}

export interface DesignDeliveryAdminSettingsPayload {
  config: DesignDeliveryAdminConfig;
  catalogPackages: Array<{ id: string; code: string; name: string; productType: string; active: boolean }>;
  allowedDepths: DesignDeliveryDepth[];
  allowedEvidenceTypes: DesignEvidenceType[];
  minimumEvidenceByDepth: Record<DesignDeliveryDepth, DesignEvidenceType[]>;
  protectedControls: Record<string, boolean | number>;
}

function message(error: any, fallback: string) {
  return new Error(error?.message || fallback);
}

export const designDeliveryAdminService = {
  async getSettings(): Promise<DesignDeliveryAdminSettingsPayload> {
    const { data, error } = await supabase.rpc('admin_get_design_delivery_settings');
    if (error) throw message(error, 'Unable to load Design Delivery settings.');
    return data as DesignDeliveryAdminSettingsPayload;
  },

  async updateSettings(config: DesignDeliveryAdminConfig): Promise<DesignDeliveryAdminConfig> {
    const { data, error } = await supabase.rpc('admin_update_design_delivery_settings', { p_settings: config });
    if (error) throw message(error, 'Unable to save Design Delivery settings.');
    return data as DesignDeliveryAdminConfig;
  }
};
