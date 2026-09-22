import { supabase } from './supabase';

export type SalesCertificationAuthorityMode = 'INDEPENDENT' | 'SUPERVISED' | 'QUALIFY_ONLY';
export type SalesCertificationPermissionMode = SalesCertificationAuthorityMode | 'BLOCKED' | 'STAGED_NOT_ENFORCED';
export type SalesCertificationGrantStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED' | 'NOT_GRANTED';

export interface SalesCertificationProductPermission {
  productId: string;
  productCode: string;
  productName: string;
  active: boolean;
  requiredCertification?: string | null;
  configuredPermissionMode?: SalesCertificationPermissionMode | null;
  grantId?: string | null;
  certificationKey?: string | null;
  grantStatus: SalesCertificationGrantStatus | string;
  authorityMode?: SalesCertificationAuthorityMode | null;
  evidenceType?: string | null;
  grantedAt?: string | null;
  expiresAt?: string | null;
  policyVersion?: number | null;
}

export interface SalesCertificationSnapshot {
  policyKey: string;
  schemaVersion?: number;
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
  certifications?: Array<{
    grantId: string;
    certificationKey: string;
    productId?: string | null;
    productCode: string;
    authorityMode: SalesCertificationAuthorityMode;
    status: SalesCertificationGrantStatus | string;
    grantedAt?: string | null;
    expiresAt?: string | null;
    policyVersion?: number | null;
  }>;
  products: SalesCertificationProductPermission[];
}

export interface SalesCertificationItemPermission {
  productId?: string | null;
  productCode: string;
  productName?: string | null;
  productType?: string | null;
  requiredCertification?: string | null;
  permissionMode: SalesCertificationPermissionMode;
  allowed: boolean;
  canDraft: boolean;
  canSend: boolean;
  supervisionRequired: boolean;
  supervisionSatisfied?: boolean;
  validationRequired: boolean;
  validationSatisfied?: boolean;
  managerReviewRequired: boolean;
  escalationRequired?: boolean;
  recommendedAction?: string | null;
  remediation?: string | null;
}

export interface SalesCertificationDealAssessment {
  policyKey: string;
  schemaVersion?: number;
  policyVersion: number;
  enforcementActive: boolean;
  criteriaApproved?: boolean;
  rolloutState?: string | null;
  salespersonId: string;
  opportunityId?: string | null;
  quotationId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  requiredCertification?: string | null;
  permissionMode: SalesCertificationPermissionMode;
  status: SalesCertificationPermissionMode;
  allowed: boolean;
  canDraft: boolean;
  canSend: boolean;
  supervisionRequired: boolean;
  validationRequired: boolean;
  managerReviewRequired: boolean;
  supervisionSatisfied?: boolean;
  packageCodes: string[];
  itemPermissions?: SalesCertificationItemPermission[];
  certifications?: SalesCertificationSnapshot['certifications'];
  generalCertificationReady: boolean;
  reasons: string[];
  recommendedAction: string;
  blockers: Array<{ code: string; productCode?: string; requiredCertification?: string; message: string }>;
  packageFitStatus?: string | null;
  sourceEvidence?: Record<string, unknown>;
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
    certificationKey?: string | null;
    authorityMode: SalesCertificationAuthorityMode;
    grantState?: string | null;
    effectiveStatus?: SalesCertificationGrantStatus | string;
    expiresAt?: string | null;
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

  async updatePolicy(input: {
    productRules: Record<string, any>;
    addonRules: Record<string, any>;
    protectedCommitmentStages: string[];
    criteriaApproved: boolean;
    grantingActive: boolean;
    enforcementActive: boolean;
    reason: string;
  }) {
    const { data, error } = await supabase.rpc('admin_update_sales_certification_policy', {
      p_product_rules: input.productRules,
      p_addon_rules: input.addonRules,
      p_protected_commitment_stages: input.protectedCommitmentStages,
      p_criteria_approved: input.criteriaApproved,
      p_granting_active: input.grantingActive,
      p_enforcement_active: input.enforcementActive,
      p_reason: input.reason,
    });
    if (error) throw error;
    return data as Record<string, any>;
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
