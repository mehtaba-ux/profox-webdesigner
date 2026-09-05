import { supabase } from './supabase';

export interface SalesHandoffBrief {
  projectId: string;
  projectNumber: string;
  projectName: string;
  projectStage: string;
  projectStatus: string;
  packageSnapshot?: string | null;
  requirementsSummary?: string | null;
  requirementsComplete: boolean;
  scopeSummary?: string | null;
  exclusions?: string | null;
  quotation: {
    id?: string | null;
    number?: string | null;
    status?: string | null;
    total?: number | null;
    currency?: string | null;
    acceptedAt?: string | null;
  };
  payment: {
    verified: boolean;
    reference?: string | null;
    type?: string | null;
    amountPaid?: number | null;
    currency?: string | null;
    verifiedAt?: string | null;
  };
  onboarding: {
    id?: string | null;
    status?: string | null;
    completed: boolean;
    completedAt?: string | null;
    questionCount: number;
    responseCount: number;
  };
  discovery: Record<string, string | null | undefined>;
  sellerHandoffDone: boolean;
  pmReviewStatus: string;
  projectManager: {
    id?: string | null;
    name?: string | null;
  };
  sellerNotes?: string | null;
  readyToSend: boolean;
}

export interface SalesHandoffSubmission {
  projectId: string;
  submittedBy: string;
  sourceSellerSubmission: boolean;
  notes: string;
  submittedAt: string;
  requirementsComplete?: boolean;
  onboardingComplete?: boolean;
  projectManagerAssigned?: boolean;
}

export interface SalesRequirementsCorrection {
  projectId: string;
  opportunityId: string;
  requirementsSummary: string;
  requirementsComplete: boolean;
  updatedAt: string;
}

export const salesHandoffService = {
  async getBrief(projectId: string): Promise<SalesHandoffBrief> {
    const { data, error } = await supabase.rpc('project_get_sales_handoff_brief', {
      p_project_id: projectId
    });
    if (error) throw error;
    if (!data) throw new Error('Sales handoff brief is unavailable.');
    return data as SalesHandoffBrief;
  },

  async correctRequirements(projectId: string, requirementsSummary: string): Promise<SalesRequirementsCorrection> {
    const { data, error } = await supabase.rpc('crm_correct_sales_requirements_for_handoff', {
      p_project_id: projectId,
      p_requirements_summary: requirementsSummary
    });
    if (error) throw error;
    if (!data) throw new Error('Seller requirements could not be saved.');
    return data as SalesRequirementsCorrection;
  },

  async submit(projectId: string, notes: string): Promise<SalesHandoffSubmission> {
    const { data, error } = await supabase.rpc('submit_sales_project_handover', {
      p_project_id: projectId,
      p_notes: notes
    });
    if (error) throw error;
    if (!data) throw new Error('Sales handoff could not be submitted.');
    return data as SalesHandoffSubmission;
  }
};
