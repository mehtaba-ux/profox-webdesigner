import { PROJECT_STAGES, type ProjectStage } from '../types';

/**
 * Active production sequence.
 *
 * Requirements are captured by Sales before quotation/payment and Client Onboarding
 * is completed after verified payment. Neither is a production stage. The delivery
 * project therefore moves from Sales Handover directly into Content.
 *
 * ProjectStage keeps the two legacy values for historical database compatibility,
 * while the shared PROJECT_STAGES registry is normalized once at application start
 * so every existing screen uses the same active sequence.
 */
export const CANONICAL_PROJECT_STAGES: ProjectStage[] = [
  'Sales Handover',
  'Content',
  'UI/UX Design',
  'Client Design Approval',
  'Development',
  'QA',
  'Client Review',
  'Final Revisions',
  'Launch',
  'Handover',
  'Completed'
];

export function initializeCanonicalProjectStages() {
  const alreadyCanonical =
    PROJECT_STAGES.length === CANONICAL_PROJECT_STAGES.length &&
    PROJECT_STAGES.every((stage, index) => stage === CANONICAL_PROJECT_STAGES[index]);

  if (!alreadyCanonical) {
    PROJECT_STAGES.splice(0, PROJECT_STAGES.length, ...CANONICAL_PROJECT_STAGES);
  }
}
