import { supabase } from './supabase';

// PF-SOP-09 client boundary: quality-changing actions are executed by server-authoritative RPCs.
export type ReuseDecision = 'REUSE' | 'EXTEND' | 'REFACTOR' | 'BUILD NEW';
export type EngineeringEnvironment = 'Development' | 'Preview/Test' | 'Staging' | 'Production' | 'Multiple';

export interface DevelopmentTaskSpecInput {
  environment: EngineeringEnvironment;
  requirementReference: string;
  designReference: string;
  acceptanceCriteria: string;
  dependencies: string;
  securityConsiderations: string;
  accessibilityConsiderations: string;
  seoImplications: string;
  analyticsRequirements: string;
  testingRequirements: string;
  definitionOfDone: string;
  reuseDecision: ReuseDecision;
  reuseInspectionNotes: string;
  duplicationReason?: string;
  technicalRisks?: string;
}

export interface ArchitectureDecisionInput {
  decisionId: string;
  problem: string;
  context: string;
  optionsConsidered: string;
  selectedOption: string;
  reason: string;
  tradeoffs: string;
  securityImplications: string;
  costImplications: string;
  reversalMigrationImplications: string;
}

export interface ReleaseQualityScores {
  functionalCorrectness: number;
  maintainability: number;
  security: number;
  accessibility: number;
  performance: number;
  responsiveBrowser: number;
  reliabilityErrorHandling: number;
  testing: number;
  seoAnalytics: number;
  documentationDeployability: number;
}

export interface DevelopmentSopWorkspace {
  sop: {
    key: string;
    version: string;
    qualityGates: string[];
    engineeringModel: string[];
    nonNegotiables: string[];
    qualityScoreWeights: Record<keyof ReleaseQualityScores, number>;
  };
  deliveryTier: 'launch' | 'growth' | 'scale' | 'custom';
  supportDays: number;
  ticketReadiness: { ready: boolean; status: string; blockers: string[] };
  ticket: Record<string, any>;
  architectureDecisions: any[];
  releaseQualityAssessment: Record<string, any>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const assertId = (value: string, label: string) => { if (!UUID_RE.test(value)) throw new Error(`${label} is invalid.`); };
const toError = (error: any, fallback: string) => new Error(error?.message || fallback);

export const developmentSopService = {
  async getWorkspace(taskId: string): Promise<DevelopmentSopWorkspace> {
    assertId(taskId, 'Task');
    const { data, error } = await supabase.rpc('development_sop_workspace', { p_task_id: taskId });
    if (error) throw toError(error, 'Unable to load PF-SOP-09 controls.');
    return data as DevelopmentSopWorkspace;
  },

  async saveTaskSpec(taskId: string, input: DevelopmentTaskSpecInput) {
    assertId(taskId, 'Task');
    const { data, error } = await supabase.rpc('development_sop_upsert_task_spec', {
      p_task_id: taskId,
      p_environment: input.environment,
      p_requirement_reference: input.requirementReference.trim(),
      p_design_reference: input.designReference.trim(),
      p_acceptance_criteria: input.acceptanceCriteria.trim(),
      p_dependencies: input.dependencies.trim(),
      p_security_considerations: input.securityConsiderations.trim(),
      p_accessibility_considerations: input.accessibilityConsiderations.trim(),
      p_seo_implications: input.seoImplications.trim(),
      p_analytics_requirements: input.analyticsRequirements.trim(),
      p_testing_requirements: input.testingRequirements.trim(),
      p_definition_of_done: input.definitionOfDone.trim(),
      p_reuse_decision: input.reuseDecision,
      p_reuse_inspection_notes: input.reuseInspectionNotes.trim(),
      p_duplication_reason: input.duplicationReason?.trim() || '',
      p_technical_risks: input.technicalRisks?.trim() || '',
    });
    if (error) throw toError(error, 'Unable to save the Engineering Ticket.');
    return data;
  },

  async createArchitectureDecision(taskId: string, input: ArchitectureDecisionInput) {
    assertId(taskId, 'Task');
    const { data, error } = await supabase.rpc('development_sop_create_adr', {
      p_task_id: taskId,
      p_decision_id: input.decisionId.trim(),
      p_problem: input.problem.trim(),
      p_context: input.context.trim(),
      p_options_considered: input.optionsConsidered.trim(),
      p_selected_option: input.selectedOption.trim(),
      p_reason: input.reason.trim(),
      p_tradeoffs: input.tradeoffs.trim(),
      p_security_implications: input.securityImplications.trim() || 'Not applicable',
      p_cost_implications: input.costImplications.trim() || 'Not applicable',
      p_reversal_migration_implications: input.reversalMigrationImplications.trim() || 'Not applicable',
    });
    if (error) throw toError(error, 'Unable to record the Architecture Decision Record.');
    return data as string;
  },

  async submitReleaseQualityScore(taskId: string, scores: ReleaseQualityScores, criticalDefects: number, highDefects: number, notes = '') {
    assertId(taskId, 'Task');
    const { data, error } = await supabase.rpc('development_sop_submit_release_quality_score', {
      p_task_id: taskId,
      p_scores: scores,
      p_critical_defects: Math.max(0, Math.trunc(criticalDefects)),
      p_high_defects: Math.max(0, Math.trunc(highDefects)),
      p_notes: notes.trim(),
    });
    if (error) throw toError(error, 'Unable to submit the Engineering Quality Score.');
    return data;
  },
};
