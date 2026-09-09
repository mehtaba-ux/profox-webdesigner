import { supabase } from './supabase';

export const CRM_INFORMATION_CERTAINTY = [
  'CLIENT_CONFIRMED',
  'SELLER_OBSERVATION',
  'SELLER_HYPOTHESIS',
  'AWAITING_CLIENT',
  'NEEDS_SPECIALIST_VALIDATION',
  'NOT_APPLICABLE',
] as const;

export type CRMInformationCertainty = (typeof CRM_INFORMATION_CERTAINTY)[number];

export const CRM_DISCOVERY_QUESTION_STATES = [
  'NOT_ASKED',
  'ASKED',
  'ANSWERED',
  'NEEDS_FOLLOW_UP',
  'NOT_APPLICABLE',
] as const;

export type CRMDiscoveryQuestionState = (typeof CRM_DISCOVERY_QUESTION_STATES)[number];

export const CRM_DISCOVERY_FRAMEWORKS = [
  'SITUATION',
  'PROBLEM',
  'IMPLICATION_IMPACT',
  'NEED_DESIRED_OUTCOME',
  'SCOPE',
  'COMMERCIAL',
  'DECISION',
  'TECHNICAL',
  'CUSTOM',
] as const;

export type CRMDiscoveryFramework = (typeof CRM_DISCOVERY_FRAMEWORKS)[number];
export type CRMRequirementState = 'ACTIVE' | 'ARCHIVED';
export type CRMRequirementClass = 'CORE' | 'RECOMMENDED' | 'CONDITIONAL' | 'COMPLEX';
export type CRMMeetingPreparationState = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
export type CRMJsonValue = null | boolean | number | string | CRMJsonValue[] | { [key: string]: CRMJsonValue };

export const CRM_REQUIREMENT_MANUAL_SOURCE = 'SELLER_MANUAL_ENTRY' as const;

export interface CRMRequirementDefinition {
  requirementKey: string;
  category: string;
  title: string;
  helpText: string;
  requirementClass: CRMRequirementClass;
  sortOrder: number;
  active: boolean;
  applicability: CRMJsonValue;
}

export interface CRMRequirement {
  id: string;
  lead_id: string;
  requirement_key: string;
  category: string;
  title: string;
  content: string | null;
  structured_value: CRMJsonValue | null;
  is_custom: boolean;
  information_certainty: CRMInformationCertainty;
  record_state: CRMRequirementState;
  source_type: string | null;
  source_record_id: string | null;
  source_recorded_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CRMDiscoveryQuestion {
  id: string;
  lead_id: string | null;
  question_key: string;
  category: string;
  question_text: string;
  purpose: string | null;
  framework: CRMDiscoveryFramework;
  active: boolean;
  sort_order: number;
  applicability: CRMJsonValue;
  is_custom: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMDiscoveryResponse {
  id: string;
  lead_id: string;
  question_id: string;
  meeting_id: string | null;
  question_state: CRMDiscoveryQuestionState;
  answer_text: string | null;
  structured_value: CRMJsonValue | null;
  information_certainty: CRMInformationCertainty;
  source_type: string | null;
  source_record_id: string | null;
  source_recorded_at: string | null;
  follow_up_required: boolean;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CRMClientVoiceEntry {
  id: string;
  lead_id: string;
  meeting_id: string | null;
  customer_statement: string;
  seller_interpretation: string | null;
  linked_requirement_id: string | null;
  information_certainty: CRMInformationCertainty;
  source_type: string | null;
  source_record_id: string | null;
  source_recorded_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CRMMeetingPreparation {
  meeting_id: string;
  meeting_objective: string | null;
  intended_advance: string | null;
  hypotheses: CRMJsonValue[];
  seller_notes: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CRMMeetingPreparationWorkspaceItem {
  meetingId: string;
  title: string;
  scheduledAt: string;
  status: string;
  meetingType: string | null;
  preparationState: CRMMeetingPreparationState;
  preparedBy: string | null;
  preparedAt: string | null;
  preparation: CRMMeetingPreparation | null;
  selectedQuestionIds: string[];
}

export interface CRMSalesDiscoveryWorkspace {
  leadId: string;
  opportunityId: string | null;
  requirementDefinitions: CRMRequirementDefinition[];
  requirements: CRMRequirement[];
  questions: CRMDiscoveryQuestion[];
  responses: CRMDiscoveryResponse[];
  clientVoice: CRMClientVoiceEntry[];
  meetingPreparations: CRMMeetingPreparationWorkspaceItem[];
}

export interface CRMSourceReference {
  type?: string | null;
  recordId?: string | null;
  recordedAt?: string | null;
}

export interface SaveRequirementInput {
  id?: string;
  leadId: string;
  requirementKey: string;
  category: string;
  title: string;
  content?: string | null;
  structuredValue?: CRMJsonValue | null;
  isCustom?: boolean;
  informationCertainty: CRMInformationCertainty;
  recordState?: CRMRequirementState;
  source?: CRMSourceReference;
}

export interface SaveDiscoveryQuestionInput {
  id?: string;
  leadId?: string | null;
  questionKey: string;
  category: string;
  questionText: string;
  purpose?: string | null;
  framework?: CRMDiscoveryFramework;
  active?: boolean;
  sortOrder?: number;
  applicability?: CRMJsonValue;
  isCustom: boolean;
}

export interface SaveDiscoveryResponseInput {
  leadId: string;
  questionId: string;
  meetingId?: string | null;
  questionState: CRMDiscoveryQuestionState;
  answerText?: string | null;
  structuredValue?: CRMJsonValue | null;
  informationCertainty: CRMInformationCertainty;
  followUpRequired?: boolean;
  source?: CRMSourceReference;
}

export interface SaveClientVoiceInput {
  id?: string;
  leadId: string;
  meetingId?: string | null;
  customerStatement: string;
  sellerInterpretation?: string | null;
  linkedRequirementId?: string | null;
  informationCertainty?: CRMInformationCertainty;
  source?: CRMSourceReference;
}

export interface SaveMeetingPreparationInput {
  meetingId: string;
  meetingObjective?: string | null;
  intendedAdvance?: string | null;
  hypotheses?: CRMJsonValue[];
  sellerNotes?: string | null;
}

export interface CRMMeetingPreparedResult {
  meetingId: string;
  prepReviewedAt: string;
  prepReviewedBy: string;
  prepared: boolean;
}

const actionError = (action: string): Error =>
  new Error(`Unable to ${action}. Please try again.`);

const requireWorkspaceReference = (leadId?: string, opportunityId?: string) => {
  if (!leadId && !opportunityId) throw new Error('A lead or opportunity is required.');
};

export const crmSalesDiscoveryService = {
  async getWorkspace(reference: { leadId?: string; opportunityId?: string }): Promise<CRMSalesDiscoveryWorkspace> {
    requireWorkspaceReference(reference.leadId, reference.opportunityId);
    const { data, error } = await supabase.rpc('crm_get_sales_discovery_workspace', {
      p_lead_id: reference.leadId ?? null,
      p_opportunity_id: reference.opportunityId ?? null,
    });
    if (error || !data) throw actionError('load sales discovery');
    const workspace = data as Omit<CRMSalesDiscoveryWorkspace, 'requirementDefinitions'> & { requirementDefinitions?: CRMRequirementDefinition[] };
    return {
      ...workspace,
      requirementDefinitions: Array.isArray(workspace.requirementDefinitions) ? workspace.requirementDefinitions : [],
    };
  },

  async saveRequirement(input: SaveRequirementInput): Promise<CRMRequirement> {
    const payload = {
      requirement_key: input.requirementKey,
      category: input.category,
      title: input.title,
      content: input.content ?? null,
      is_custom: input.isCustom ?? false,
      information_certainty: input.informationCertainty,
      record_state: input.recordState ?? 'ACTIVE',
      source_type: input.source?.type ?? null,
      source_record_id: input.source?.recordId ?? null,
      source_recorded_at: input.source?.recordedAt ?? null,
      ...(!input.id || input.structuredValue !== undefined ? { structured_value: input.structuredValue ?? null } : {}),
    };

    const query = input.id
      ? supabase.from('crm_requirements').update(payload).eq('id', input.id).eq('lead_id', input.leadId)
      : supabase.from('crm_requirements').insert({ ...payload, lead_id: input.leadId });
    const { data, error } = await query.select('*').single();
    if (error || !data) throw actionError('save the requirement');
    return data as CRMRequirement;
  },

  async archiveRequirement(leadId: string, requirementId: string): Promise<void> {
    const { error } = await supabase
      .from('crm_requirements')
      .update({ record_state: 'ARCHIVED' })
      .eq('id', requirementId)
      .eq('lead_id', leadId);
    if (error) throw actionError('archive the requirement');
  },

  async saveQuestion(input: SaveDiscoveryQuestionInput): Promise<CRMDiscoveryQuestion> {
    if (input.isCustom && !input.leadId) throw new Error('A custom discovery question requires a lead.');
    if (!input.isCustom && input.leadId) throw new Error('A standard discovery question cannot be scoped to one lead.');

    const payload = {
      question_key: input.questionKey,
      category: input.category,
      question_text: input.questionText,
      purpose: input.purpose ?? null,
      framework: input.framework ?? 'CUSTOM',
      active: input.active ?? true,
      sort_order: input.sortOrder ?? 0,
      applicability: input.applicability ?? {},
      is_custom: input.isCustom,
    };

    const query = input.id
      ? supabase.from('crm_discovery_questions').update(payload).eq('id', input.id)
      : supabase.from('crm_discovery_questions').insert({ ...payload, lead_id: input.leadId ?? null });
    const { data, error } = await query.select('*').single();
    if (error || !data) throw actionError('save the discovery question');
    return data as CRMDiscoveryQuestion;
  },

  async saveResponse(input: SaveDiscoveryResponseInput): Promise<CRMDiscoveryResponse> {
    const payload = {
      lead_id: input.leadId,
      question_id: input.questionId,
      meeting_id: input.meetingId ?? null,
      question_state: input.questionState,
      answer_text: input.answerText ?? null,
      structured_value: input.structuredValue ?? null,
      information_certainty: input.informationCertainty,
      follow_up_required: input.followUpRequired ?? input.questionState === 'NEEDS_FOLLOW_UP',
      source_type: input.source?.type ?? null,
      source_record_id: input.source?.recordId ?? null,
      source_recorded_at: input.source?.recordedAt ?? null,
    };
    const { data, error } = await supabase
      .from('crm_discovery_responses')
      .upsert(payload, { onConflict: 'lead_id,question_id' })
      .select('*')
      .single();
    if (error || !data) throw actionError('save the discovery answer');
    return data as CRMDiscoveryResponse;
  },

  async saveClientVoice(input: SaveClientVoiceInput): Promise<CRMClientVoiceEntry> {
    const payload = {
      meeting_id: input.meetingId ?? null,
      customer_statement: input.customerStatement,
      seller_interpretation: input.sellerInterpretation ?? null,
      linked_requirement_id: input.linkedRequirementId ?? null,
      information_certainty: input.informationCertainty ?? 'SELLER_OBSERVATION',
      source_type: input.source?.type ?? null,
      source_record_id: input.source?.recordId ?? null,
      source_recorded_at: input.source?.recordedAt ?? null,
    };
    const query = input.id
      ? supabase.from('crm_client_voice').update(payload).eq('id', input.id).eq('lead_id', input.leadId)
      : supabase.from('crm_client_voice').insert({ ...payload, lead_id: input.leadId });
    const { data, error } = await query.select('*').single();
    if (error || !data) throw actionError('save Client Voice');
    return data as CRMClientVoiceEntry;
  },

  async saveMeetingPreparation(input: SaveMeetingPreparationInput): Promise<CRMMeetingPreparation> {
    const { data: existing, error: loadError } = await supabase
      .from('crm_meeting_preparations')
      .select('*')
      .eq('meeting_id', input.meetingId)
      .maybeSingle();
    if (loadError) throw actionError('load Meeting Prep before saving');

    if (existing) {
      const patch: Record<string, CRMJsonValue | CRMJsonValue[] | null> = {};
      if (input.meetingObjective !== undefined) patch.meeting_objective = input.meetingObjective;
      if (input.intendedAdvance !== undefined) patch.intended_advance = input.intendedAdvance;
      if (input.hypotheses !== undefined) patch.hypotheses = input.hypotheses;
      if (input.sellerNotes !== undefined) patch.seller_notes = input.sellerNotes;

      if (Object.keys(patch).length === 0) return existing as CRMMeetingPreparation;

      const { data, error } = await supabase
        .from('crm_meeting_preparations')
        .update(patch)
        .eq('meeting_id', input.meetingId)
        .select('*')
        .single();
      if (error || !data) throw actionError('save Meeting Prep');
      return data as CRMMeetingPreparation;
    }

    const { data, error } = await supabase
      .from('crm_meeting_preparations')
      .insert({
        meeting_id: input.meetingId,
        meeting_objective: input.meetingObjective ?? null,
        intended_advance: input.intendedAdvance ?? null,
        hypotheses: input.hypotheses ?? [],
        seller_notes: input.sellerNotes ?? null,
      })
      .select('*')
      .single();
    if (error || !data) throw actionError('save Meeting Prep');
    return data as CRMMeetingPreparation;
  },

  async markMeetingPrepared(meetingId: string): Promise<CRMMeetingPreparedResult> {
    const { data, error } = await supabase.rpc('mark_sales_meeting_prepared', {
      p_meeting_id: meetingId,
    });
    if (error || !data) throw actionError('mark Meeting Prep ready');
    return data as CRMMeetingPreparedResult;
  },

  async setMeetingQuestions(meetingId: string, questionIds: string[]): Promise<string[]> {
    const { data, error } = await supabase.rpc('crm_set_meeting_discovery_questions', {
      p_meeting_id: meetingId,
      p_question_ids: [...new Set(questionIds)],
    });
    if (error) throw actionError('update Meeting Prep questions');
    return (data ?? []) as string[];
  },
};
