import type { CRMRequirement, CRMRequirementDefinition } from './crmSalesDiscoveryService';

export type CRMRequirementCoverage = {
  totalCore: number;
  capturedCore: number;
  confirmedCore: number;
  resolvedNotApplicableCore: number;
  needsAttentionCore: number;
  missingCore: CRMRequirementDefinition[];
};

export function hasMeaningfulStructuredValue(value: CRMRequirement['structured_value']): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(item => hasMeaningfulStructuredValue(item as CRMRequirement['structured_value']));
  if (typeof value === 'object') return Object.values(value).some(item => hasMeaningfulStructuredValue(item as CRMRequirement['structured_value']));
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function hasMeaningfulRequirementValue(requirement?: CRMRequirement): boolean {
  if (!requirement || requirement.record_state !== 'ACTIVE') return false;
  return Boolean(requirement.content?.trim()) || hasMeaningfulStructuredValue(requirement.structured_value);
}

export function isRequirementCaptured(requirement?: CRMRequirement): boolean {
  if (!requirement || requirement.record_state !== 'ACTIVE') return false;
  return requirement.information_certainty === 'NOT_APPLICABLE' || hasMeaningfulRequirementValue(requirement);
}

export function calculateRequirementCoverage(
  definitions: CRMRequirementDefinition[],
  requirements: CRMRequirement[],
): CRMRequirementCoverage {
  const core = definitions.filter(definition => definition.active && definition.requirementClass === 'CORE');
  const activeStandardByKey = new Map(
    requirements
      .filter(requirement => requirement.record_state === 'ACTIVE' && !requirement.is_custom)
      .map(requirement => [requirement.requirement_key, requirement]),
  );

  let capturedCore = 0;
  let confirmedCore = 0;
  let resolvedNotApplicableCore = 0;
  let needsAttentionCore = 0;
  const missingCore: CRMRequirementDefinition[] = [];

  for (const definition of core) {
    const requirement = activeStandardByKey.get(definition.requirementKey);
    const captured = isRequirementCaptured(requirement);
    if (captured) capturedCore += 1;
    else missingCore.push(definition);

    if (requirement?.information_certainty === 'CLIENT_CONFIRMED' && hasMeaningfulRequirementValue(requirement)) confirmedCore += 1;
    if (requirement?.information_certainty === 'NOT_APPLICABLE') resolvedNotApplicableCore += 1;
    if (requirement && ['AWAITING_CLIENT', 'SELLER_HYPOTHESIS', 'NEEDS_SPECIALIST_VALIDATION'].includes(requirement.information_certainty)) needsAttentionCore += 1;
  }

  return {
    totalCore: core.length,
    capturedCore,
    confirmedCore,
    resolvedNotApplicableCore,
    needsAttentionCore,
    missingCore,
  };
}

export function createCustomRequirementKey(
  existingRequirementKeys: Iterable<string>,
  uuidFactory: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const existing = new Set(existingRequirementKeys);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `custom_${uuidFactory()}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error('Could not create a unique custom Requirement key.');
}
