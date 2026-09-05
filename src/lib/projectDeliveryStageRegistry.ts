import { PROJECT_STAGES, type ProjectStage } from '../types';

// Sales requirements and client onboarding are pre-production prerequisites.
// Keep their legacy ProjectStage values for historical compatibility, but do not
// present them as active delivery stages to clients or delivery staff.
export const ACTIVE_PROJECT_DELIVERY_STAGES: ProjectStage[] = [
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

export function configureProjectDeliveryStageRegistry() {
  PROJECT_STAGES.splice(0, PROJECT_STAGES.length, ...ACTIVE_PROJECT_DELIVERY_STAGES);
}
