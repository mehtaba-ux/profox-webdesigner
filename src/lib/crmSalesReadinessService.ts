import { supabase } from './supabase';

export type CRMSalesGateKey = 'REQUIREMENTS_CONFIRMED' | 'PROPOSAL_READINESS';
export type CRMRequirementsReadinessStatus = 'PASS' | 'WARNING' | 'BLOCKED';
export type CRMProposalReadinessStatus = 'READY' | 'WARNING' | 'BLOCKED';

export type CRMReadinessAction = {
  actionKey: string;
  label: string;
  target: 'requirements' | 'discovery' | 'meeting-management' | 'package-fit' | 'validation' | 'follow-ups' | string;
  requirementKey?: string;
};

export type CRMReadinessIssue = {
  code: string;
  message: string;
  sourceType?: string;
  hardBlocker?: boolean;
  requirementId?: string | null;
  requirementKey?: string;
  validationId?: string;
  validationType?: string;
  severity?: string;
  action?: CRMReadinessAction;
};

export type CRMReadinessDimension = {
  key: string;
  label: string;
  status: string;
  resolved?: number;
  required?: number;
  confidence?: string;
  current?: Record<string, unknown> | null;
};

export type CRMApprovedConstraint = {
  validationId: string;
  validationType: string;
  requirementKey?: string;
  constraints: string;
};

export type CRMSalesGateAssessment = {
  opportunityId: string;
  leadId: string;
  gateKey: CRMSalesGateKey;
  policyKey: string;
  policyVersion: number;
  evaluatorVersion: number;
  evaluatedAt: string;
  status: CRMRequirementsReadinessStatus | CRMProposalReadinessStatus;
  score: number;
  coverageState: 'CURRENT_DIMENSIONS_COMPLETE' | 'FUTURE_DIMENSIONS_PENDING' | string;
  dimensions: CRMReadinessDimension[];
  blockers: CRMReadinessIssue[];
  warnings: CRMReadinessIssue[];
  resolvedValidations: Array<Record<string, unknown>>;
  approvedConstraints: CRMApprovedConstraint[];
  futureDimensions: Array<{ key: string; status: 'NOT_YET_EVALUATED' | string; coverageState?: string }>;
  nextAction?: Record<string, unknown> | null;
  packageFit?: Record<string, unknown>;
  legacyRequirementsSummaryPresent: boolean;
  finalQuotationSendGateActive: boolean;
};

const safeAssessment = (value: unknown): CRMSalesGateAssessment => value as CRMSalesGateAssessment;

export const crmSalesReadinessService = {
  async resolveOpportunityId(leadId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('crm_opportunities')
      .select('id')
      .eq('lead_id', leadId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error('The connected opportunity could not be resolved.');
    return data?.id || null;
  },

  async assess(opportunityId: string, gateKey: CRMSalesGateKey): Promise<CRMSalesGateAssessment> {
    const { data, error } = await supabase.rpc('crm_get_sales_gate_assessment', {
      p_opportunity_id: opportunityId,
      p_gate_key: gateKey,
    });
    if (error) throw new Error('Sales readiness could not be evaluated. Refresh the CRM context and try again.');
    return safeAssessment(data);
  },

  async assessForLead(leadId: string, gateKey: CRMSalesGateKey): Promise<CRMSalesGateAssessment | null> {
    const opportunityId = await this.resolveOpportunityId(leadId);
    return opportunityId ? this.assess(opportunityId, gateKey) : null;
  },

  blockerMessage(assessment: CRMSalesGateAssessment): string {
    if (!assessment.blockers.length) return 'Requirements Confirmed is ready.';
    return `Requirements Confirmed is blocked: ${assessment.blockers.slice(0, 5).map(item => item.message).join(' • ')}`;
  },
};
