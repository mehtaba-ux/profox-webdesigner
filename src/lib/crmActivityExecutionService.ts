import { supabase } from './supabase';

export interface ActivityTypeConfig {
  name: string;
  category: string;
  channel: string;
  active: boolean;
  defaultSubject: string;
  defaultInstructions: string;
  defaultDueMinutes: number;
  outcomes: string[];
  suggestedNextActivity?: string;
  requiredFields: string[];
  allowedRoles: string[];
  emailTemplate?: string | null;
  slaHours: number;
}

export interface ActivityPlanStep {
  key: string;
  delayMinutes: number;
  activityType: string;
  subject: string;
  channel: string;
  instructions?: string;
  manual?: boolean;
  branchByOutcome?: Record<string, number>;
}

export interface ActivityPlanConfig {
  key: string;
  name: string;
  active: boolean;
  stopConditions: string[];
  steps: ActivityPlanStep[];
}

export interface ActivityExecutionConfig {
  version: number;
  discipline: {
    noNextActionEnabled: boolean;
    validWaitingStates: string[];
    rescheduleReasonRequiredAfter: number;
  };
  priority: {
    highValueThreshold: number;
    highValueInactivityHours: number;
    quotationFollowUpHours: number;
    meetingFollowUpHours: number;
    overdueSlaHours: number;
    firstResponseHours: number;
  };
  workingHours: { start: string; end: string; weekdays: number[] };
  types: ActivityTypeConfig[];
  plans: ActivityPlanConfig[];
}

export interface ExecutionNextBestAction {
  label: string;
  actionKey: string;
  url: string;
  reason: string;
  quick?: boolean;
  requiresInput?: boolean;
}

export interface SalesWorkQueueItem {
  queueKind: 'activity' | 'missing_next_action';
  id: string;
  activityId?: string;
  leadId?: string;
  opportunityId?: string;
  priorityScore: number;
  priorityLevel: 'Act Now' | 'High' | 'Medium' | 'Normal';
  priorityReason: string;
  activityType: string;
  subject: string;
  channel?: string;
  status: string;
  dueAt?: string;
  startedAt?: string;
  outcome?: string;
  notes?: string;
  rescheduleCount?: number;
  originalDueAt?: string;
  ownerId?: string;
  ownerName?: string;
  companyName: string;
  contactName?: string;
  value?: number;
  currency?: string;
  stage?: string;
  leadScore?: number;
  leadQuality?: string;
  scoreReason?: string;
  quotation?: { id: string; status: string; total?: number; sentAt?: string; firstViewedAt?: string; lastViewedAt?: string; viewCount?: number };
  meeting?: { id: string; status: string; startAt?: string; outcome?: string };
  engagement?: { type: string; at: string };
  activityTypeConfig?: ActivityTypeConfig;
  recommendedAction: string;
  nextBestAction?: ExecutionNextBestAction;
  planEnrollmentId?: string;
  planStepKey?: string;
}

export interface SalesWorkQueue {
  generatedAt: string;
  scope: 'mine' | 'team';
  config: ActivityExecutionConfig;
  counts: {
    total: number;
    actNow: number;
    overdue: number;
    noNextAction: number;
    highValue: number;
    rescheduledRepeatedly: number;
  };
  items: SalesWorkQueueItem[];
  managerWorkload: Array<{ ownerId: string; ownerName: string; scheduled: number; overdue: number; completed30d: number; rescheduled: number }>;
}

export interface ActivityExecutionContext {
  activity: Record<string, any>;
  record: Record<string, any> | null;
  recentEvents: Array<{ id: string; eventType: string; title: string; description: string; actorName: string; actorRole: string; metadata: Record<string, unknown>; occurredAt: string }>;
  meeting?: Record<string, any> | null;
  quotation?: Record<string, any> | null;
  plan?: Record<string, any> | null;
  activityTypeConfig?: ActivityTypeConfig | null;
  nextBestAction?: ExecutionNextBestAction | null;
}

export interface ActivityEffectiveness {
  days: number;
  scope: 'mine' | 'team';
  totalActivities: number;
  completed: number;
  overdue: number;
  completionRate: number;
  onTimeRate: number;
  overdueRate: number;
  medianFollowUpDelayMinutes: number;
  excessiveRescheduling: number;
  outcomesByType: Array<{ activityType: string; completed: number; outcomes: Record<string, number> }>;
  byOwner: Array<{ ownerId: string; ownerName: string; scheduled: number; completed: number; overdue: number; onTime: number }>;
}

const rpc = async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
};

export const crmActivityExecutionService = {
  getWorkQueue(scope: 'mine' | 'team' = 'mine', channel = 'all', limit = 100) {
    return rpc<SalesWorkQueue>('crm_get_sales_work_queue', { p_scope: scope, p_channel: channel, p_limit: limit });
  },

  getConfig() {
    return rpc<ActivityExecutionConfig>('crm_get_activity_execution_config');
  },

  saveConfig(config: ActivityExecutionConfig) {
    return rpc<ActivityExecutionConfig>('crm_admin_save_activity_execution_config', { p_config: config });
  },

  getContext(activityId: string) {
    return rpc<ActivityExecutionContext>('crm_get_activity_execution_context', { p_activity_id: activityId });
  },

  getEffectiveness(days = 30, scope: 'mine' | 'team' = 'mine') {
    return rpc<ActivityEffectiveness>('crm_get_activity_effectiveness', { p_days: days, p_scope: scope });
  },

  startActivity(activityId: string) {
    return rpc<Record<string, unknown>>('crm_start_activity', { p_activity_id: activityId });
  },

  completeActivity(activityId: string, outcome: string, notes: string, next?: { create: boolean; activityType: string; subject: string; dueAt: string; channel?: string; notes?: string } | null) {
    return rpc<Record<string, unknown>>('crm_complete_activity', {
      p_activity_id: activityId,
      p_outcome: outcome || null,
      p_notes: notes || '',
      p_next: next || null,
    });
  },

  rescheduleActivity(activityId: string, dueAt: string, reason = '', snooze = false) {
    return rpc<Record<string, unknown>>('crm_reschedule_activity', {
      p_activity_id: activityId,
      p_due_at: dueAt,
      p_reason: reason,
      p_snooze: snooze,
    });
  },

  cancelActivity(activityId: string, reason = '') {
    return rpc<Record<string, unknown>>('crm_cancel_activity', { p_activity_id: activityId, p_reason: reason });
  },

  scheduleEntityFollowUp(entityType: 'lead' | 'opportunity', entityId: string, dueAt: string, subject: string, notes = '') {
    return rpc<Record<string, unknown>>('execute_productivity_action', {
      p_action_key: 'schedule_follow_up',
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_payload: { dueAt, subject, notes },
    });
  },

  launchPlan(entityType: 'lead' | 'opportunity', entityId: string, planKey: string) {
    return rpc<Record<string, unknown>>('crm_launch_activity_plan', { p_entity_type: entityType, p_entity_id: entityId, p_plan_key: planKey });
  },

  pausePlan(enrollmentId: string, reason: string, resumeAt?: string | null) {
    return rpc<Record<string, unknown>>('crm_pause_activity_plan', { p_enrollment_id: enrollmentId, p_reason: reason, p_resume_at: resumeAt || null });
  },

  resumePlan(enrollmentId: string) {
    return rpc<Record<string, unknown>>('crm_resume_activity_plan', { p_enrollment_id: enrollmentId });
  },

  stopPlan(enrollmentId: string, reason = 'Manual stop') {
    return rpc<Record<string, unknown>>('crm_stop_activity_plan', { p_enrollment_id: enrollmentId, p_reason: reason });
  },
};
