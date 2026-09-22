import { supabase } from './supabase';

export type SalesCertificationAuthorityMode = 'INDEPENDENT' | 'SUPERVISED';
export type SalesCertificationDealStatus = 'STAGED_NOT_ENFORCED' | 'INDEPENDENT' | 'SUPERVISED' | 'BLOCKED';

export interface SalesCertificationProductPermission {
  productId: string;
  productCode: string;
  productName: string;
  active: boolean;
  grantId?: string | null;
  grantStatus: 'GRANTED' | 'NOT_GRANTED' | string;
  authorityMode?: SalesCertificationAuthorityMode | null;
  evidenceType?: string | null;
  grantedAt?: string | null;
  policyVersion?: number | null;
}

export interface SalesCertificationSnapshot {
  policyKey: string;
  policyVersion: number;
  grantingActive: boolean;
  enforcementActive: boolean;
  criteriaApproved: boolean;
  rolloutState: string;
  rolloutReason?: string | null;
  salespersonId: string;
  generalCertificationReady: boolean;
  finalCertification: {
    sessionId?: string | null;
    status?: string | null;
    score?: number | null;
    evaluatedAt?: string | null;
    passed?: boolean;
  };
  products: SalesCertificationProductPermission[];
}

export interface SalesCertificationDealAssessment {
  policyKey: string;
  policyVersion: number;
  enforcementActive: boolean;
  salespersonId: string;
  opportunityId?: string | null;
  quotationId?: string | null;
  packageCodes: string[];
  packagePermissions: Array<{
    productCode: string;
    grantStatus: string;
    authorityMode?: SalesCertificationAuthorityMode | null;
  }>;
  generalCertificationReady: boolean;
  status: SalesCertificationDealStatus;
  canDraft: boolean;
  canSend: boolean;
  supervisionSatisfied: boolean;
  blockers: Array<{ code: string; productCode?: string; message: string }>;
  packageFitStatus?: string | null;
  separationOfDuties: string;
}

export interface SalesCertificationAdminState {
  policy: Record<string, any>;
  sellers: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    snapshot: SalesCertificationSnapshot;
  }>;
  history: Array<{
    id: string;
    salespersonId: string;
    salespersonName: string;
    productId: string;
    productCode: string;
    productName: string;
    authorityMode: SalesCertificationAuthorityMode;
    evidenceType: string;
    evidence: Record<string, any>;
    grantReason: string;
    policyVersion: number;
    grantedBy: string;
    grantedAt: string;
    revokedBy?: string | null;
    revokedAt?: string | null;
    revocationReason?: string | null;
  }>;
}

export const salesCertificationService = {
  async getMyPermissions(): Promise<SalesCertificationSnapshot> {
    const { data, error } = await supabase.rpc('get_my_sales_certification_permissions');
    if (error) throw error;
    return data as SalesCertificationSnapshot;
  },

  async getAdminState(): Promise<SalesCertificationAdminState> {
    const { data, error } = await supabase.rpc('admin_get_sales_certification_permissions');
    if (error) throw error;
    return data as SalesCertificationAdminState;
  },

  async getDealAssessment(input: {
    salespersonId?: string | null;
    productCode?: string | null;
    opportunityId?: string | null;
    quotationId?: string | null;
  }): Promise<SalesCertificationDealAssessment> {
    const { data, error } = await supabase.rpc('crm_get_sales_certification_deal_permission', {
      p_salesperson_id: input.salespersonId || null,
      p_product_code: input.productCode || null,
      p_opportunity_id: input.opportunityId || null,
      p_quotation_id: input.quotationId || null,
    });
    if (error) throw error;
    return data as SalesCertificationDealAssessment;
  },

  async grant(input: {
    salespersonId: string;
    salesProductId: string;
    authorityMode: SalesCertificationAuthorityMode;
    evidenceType: string;
    evidence: Record<string, any>;
    reason: string;
  }) {
    const { data, error } = await supabase.rpc('admin_grant_sales_package_certification', {
      p_salesperson_id: input.salespersonId,
      p_sales_product_id: input.salesProductId,
      p_authority_mode: input.authorityMode,
      p_evidence_type: input.evidenceType,
      p_evidence: input.evidence,
      p_reason: input.reason,
    });
    if (error) throw error;
    return data;
  },

  async revoke(grantId: string, reason: string) {
    const { data, error } = await supabase.rpc('admin_revoke_sales_package_certification', {
      p_grant_id: grantId,
      p_reason: reason,
    });
    if (error) throw error;
    return data;
  },
};
