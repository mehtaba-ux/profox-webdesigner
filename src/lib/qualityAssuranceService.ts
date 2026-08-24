import { supabase } from './supabase';
import type { DevelopmentEvidenceType } from './developmentDeliveryService';

export type QaEvidenceType = Extract<DevelopmentEvidenceType,
  | 'test_result' | 'browser_responsive_check' | 'accessibility_check' | 'staging_url'
  | 'security_check' | 'performance_check' | 'qa_handoff' | 'smoke_test'
  | 'analytics_check' | 'monitoring_check'>;

export interface QaDeliveryWorkspace {
  task: any;
  project: any;
  evidence: any[];
  findings: any[];
  requiredEvidence: QaEvidenceType[];
  missingEvidence: QaEvidenceType[];
  ready: boolean;
  canReview: boolean;
}

export interface QaReviewQueueItem {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  priority: string;
  dueDate?: string;
  submittedAt: string;
  assigneeName: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const assertId = (value: string, label: string) => {
  if (!UUID_RE.test(value)) throw new Error(`${label} is invalid.`);
};
const asError = (error: any, fallback: string) => new Error(error?.message || fallback);

export const qualityAssuranceService = {
  async getWorkspace(taskId: string): Promise<QaDeliveryWorkspace> {
    assertId(taskId, 'Task');
    const { data, error } = await supabase.rpc('qa_delivery_workspace', { p_task_id: taskId });
    if (error) throw asError(error, 'Unable to load the QA workspace.');
    return data as QaDeliveryWorkspace;
  },

  async startTask(taskId: string) {
    assertId(taskId, 'Task');
    const { data, error } = await supabase.rpc('qa_delivery_start_task', { p_task_id: taskId });
    if (error) throw asError(error, 'Unable to start QA work.');
    return data;
  },

  async addEvidence(input: { taskId: string; type: QaEvidenceType; label?: string; referenceUrl?: string; referenceNote?: string }) {
    assertId(input.taskId, 'Task');
    if (!input.referenceUrl?.trim() && !input.referenceNote?.trim()) throw new Error('Add a source link or evidence note.');
    const { data, error } = await supabase.rpc('qa_delivery_add_evidence', {
      p_task_id: input.taskId,
      p_evidence_type: input.type,
      p_label: input.label?.trim() || '',
      p_reference_url: input.referenceUrl?.trim() || '',
      p_reference_note: input.referenceNote?.trim() || ''
    });
    if (error) throw asError(error, 'Unable to save QA evidence.');
    return data as string;
  },

  async submitForReview(taskId: string, note = '') {
    assertId(taskId, 'Task');
    const { data, error } = await supabase.rpc('qa_delivery_submit_for_review', { p_task_id: taskId, p_note: note.trim() });
    if (error) throw asError(error, 'Unable to submit QA for review.');
    return data;
  },

  async getReviewQueue(): Promise<QaReviewQueueItem[]> {
    const { data, error } = await supabase.rpc('qa_delivery_get_review_queue');
    if (error) throw asError(error, 'Unable to load the QA review queue.');
    return (Array.isArray(data) ? data : []) as QaReviewQueueItem[];
  },

  async reviewDecision(taskId: string, decision: 'Pass' | 'Changes Required', notes = '') {
    assertId(taskId, 'Task');
    if (decision === 'Changes Required' && notes.trim().length < 10) throw new Error('Give specific feedback before requesting changes.');
    const { data, error } = await supabase.rpc('qa_delivery_review_decision', {
      p_task_id: taskId,
      p_decision: decision,
      p_notes: notes.trim()
    });
    if (error) throw asError(error, 'Unable to complete QA review.');
    return data;
  }
};
