import { supabase } from './supabase';

export type CRMPackageFitStatus = 'FIT' | 'POSSIBLE_FIT' | 'MISMATCH' | 'REVIEW_REQUIRED';
export type CRMPackageFitConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type CRMPackageFitTrace = {
  code: string;
  message: string;
  sourceType?: 'REQUIREMENT' | 'DISCOVERY' | 'CUSTOM_REQUIREMENT' | 'CATALOG' | 'POLICY';
  requirementId?: string | null;
  requirementKey?: string | null;
  questionId?: string | null;
  questionKey?: string | null;
  certainty?: string | null;
  minimumProductCode?: string | null;
  productCode?: string | null;
  provisional?: boolean;
};

export type CRMPackageFitProduct = {
  id: string;
  code: string;
  name: string;
  productType: string;
  priceMode: string;
  basePrice: number | null;
  currency: string | null;
  billingPeriod: string | null;
  scope: unknown;
  technology: string | null;
  managerApprovalRequired: boolean;
  timelineImpact: string | null;
  deliveryDurationMin: number | null;
  deliveryDurationMax: number | null;
  deliveryDurationUnit: string | null;
  deliveryDurationNote: string | null;
  serviceFamily: string | null;
  updatedAt: string | null;
};

export type CRMPackageFitCandidate = CRMPackageFitProduct & {
  assessmentStatus: CRMPackageFitStatus;
  mismatchReasons: CRMPackageFitTrace[];
};

export type CRMPackageFitAddonCandidate = CRMPackageFitProduct & {
  trigger: CRMPackageFitTrace;
  reviewRequired: boolean;
  provisional: boolean;
};

export type CRMPackageFitAssessment = {
  leadId: string;
  opportunityId: string | null;
  policyKey: string;
  policyVersion: number;
  evaluatedAt: string;
  catalogObservedAt: string | null;
  status: CRMPackageFitStatus;
  confidence: CRMPackageFitConfidence;
  recommendedProduct: CRMPackageFitProduct | null;
  candidateProducts: CRMPackageFitCandidate[];
  possibleAddOns: CRMPackageFitAddonCandidate[];
  reasons: CRMPackageFitTrace[];
  complexitySignals: CRMPackageFitTrace[];
  mismatchSignals: CRMPackageFitTrace[];
  missingInformation: CRMPackageFitTrace[];
  validationSignals: CRMPackageFitTrace[];
  managerApprovalRequired: boolean;
  timelineAssessmentRequired: boolean;
  sourceSummary: {
    activeRequirementCount: number;
    confirmedRequirementCount: number;
    unresolvedRequirementCount: number;
    customRequirementCount: number;
    discoverySignalCount: number;
    totalProductCount: number;
    activeProductCount: number;
    activePackageCount: number;
    activeAddonCount: number;
    requirementDefinitionVersion: number | null;
  };
  configurationStatus?: 'OK' | 'REVIEW_REQUIRED';
};

const actionError = () => new Error('Package Fit could not be evaluated. Please refresh and try again.');

export const crmPackageFitService = {
  async getAssessment(reference: { leadId?: string; opportunityId?: string }): Promise<CRMPackageFitAssessment> {
    if (!reference.leadId && !reference.opportunityId) throw new Error('A Lead or Opportunity is required for Package Fit.');

    const { data, error } = await supabase.rpc('crm_get_package_fit_assessment', {
      p_lead_id: reference.leadId ?? null,
      p_opportunity_id: reference.opportunityId ?? null,
    });

    if (error || !data) throw actionError();
    return data as CRMPackageFitAssessment;
  },
};
