import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  calculateRequirementCoverage,
  createCustomRequirementKey,
  hasMeaningfulRequirementValue,
} from '../../src/lib/crmRequirementUtils';
import type { CRMRequirement, CRMRequirementDefinition } from '../../src/lib/crmSalesDiscoveryService';

const migration = readFileSync('supabase/migrations/20260906123000_crm_sales_requirements_part_2.sql', 'utf8');
const part1 = readFileSync('supabase/migrations/20260906113000_crm_sales_discovery_foundation_part_1.sql', 'utf8');
const hardening = readFileSync('supabase/migrations/20260906113500_crm_sales_discovery_foundation_hardening.sql', 'utf8');
const service = readFileSync('src/lib/crmSalesDiscoveryService.ts', 'utf8');
const drawer = readFileSync('src/components/admin/crm/CRMLeadDrawerBase.tsx', 'utf8');
const workspace = readFileSync('src/components/admin/crm/CRMRequirementsWorkspace.tsx', 'utf8');
const docs = readFileSync('docs/crm-sales-requirements-tab-part-2.md', 'utf8');

const certaintyStates = [
  'CLIENT_CONFIRMED',
  'SELLER_OBSERVATION',
  'SELLER_HYPOTHESIS',
  'AWAITING_CLIENT',
  'NEEDS_SPECIALIST_VALIDATION',
  'NOT_APPLICABLE',
] as const;

const definitionTuplePattern = /\('([A-Z_]+)', '(CORE|RECOMMENDED|CONDITIONAL|COMPLEX)', '([^']+)', '([^']+)', '[^']*'::jsonb, (\d+)\)/g;
const definitionTuples = [...migration.matchAll(definitionTuplePattern)];

const makeDefinition = (requirementKey: string, requirementClass: CRMRequirementDefinition['requirementClass'] = 'CORE'): CRMRequirementDefinition => ({
  requirementKey,
  category: 'BUSINESS',
  title: requirementKey,
  helpText: 'Help',
  requirementClass,
  sortOrder: 1,
  active: true,
  applicability: {},
});

const makeRequirement = (patch: Partial<CRMRequirement> = {}): CRMRequirement => ({
  id: 'requirement-id',
  lead_id: 'lead-id',
  requirement_key: 'business_objective',
  category: 'BUSINESS',
  title: 'Business objective',
  content: 'Meaningful detail',
  structured_value: null,
  is_custom: false,
  information_certainty: 'AWAITING_CLIENT',
  record_state: 'ACTIVE',
  source_type: 'SELLER_MANUAL_ENTRY',
  source_record_id: null,
  source_recorded_at: '2026-09-06T00:00:00Z',
  created_by: 'user-id',
  updated_by: 'user-id',
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
  ...patch,
});

test('TEST 1 — Requirements tab appears in the existing Lead Drawer', () => {
  assert.match(drawer, /LeadDrawerTab = 'overview' \| 'requirements' \| 'discovery' \| 'timeline' \| 'communication' \| 'activities'/);
  assert.match(drawer, /id: 'requirements', label: 'Requirements'/);
});

test('TEST 2 — Existing Overview tab remains present', () => {
  assert.match(drawer, /id: 'overview', label: 'Overview'/);
  assert.match(drawer, /tab === 'overview'/);
});

test('TEST 3 — Existing Complete log remains present', () => {
  assert.match(drawer, /id: 'timeline', label: 'Complete log'/);
  assert.match(drawer, /tab === 'timeline'/);
});

test('TEST 4 — Existing Conversation handoff remains present and canonical', () => {
  assert.match(drawer, /id: 'communication', label: 'Conversation'/);
  assert.match(drawer, /item\.id === 'communication'[\s\S]*onOpenConversation\(\)/);
});

test('TEST 5 — Existing Follow-ups remains present', () => {
  assert.match(drawer, /id: 'activities', label: 'Follow-ups'/);
  assert.match(drawer, /tab === 'activities'/);
});

test('TEST 6 — Requirements workspace loads through crmSalesDiscoveryService and the existing workspace RPC', () => {
  assert.match(workspace, /crmSalesDiscoveryService\.getWorkspace\(\{ leadId, opportunityId \}\)/);
  assert.match(service, /supabase\.rpc\('crm_get_sales_discovery_workspace'/);
  assert.doesNotMatch(workspace, /createClient\(/);
});

test('TEST 7 — 105 standard Requirement Definitions are global configuration and opening the tab does not seed deal rows', () => {
  assert.equal(definitionTuples.length, 105);
  assert.match(migration, /insert into public\.system_configuration/);
  assert.match(migration, /'crm_requirement_definitions_v1'/);
  assert.doesNotMatch(migration, /insert into public\.crm_requirements/i);
  assert.doesNotMatch(workspace, /saveRequirement\([^)]*\).*useEffect/s);
});

test('TEST 8 — Seller can explicitly save a standard Requirement through the Part 1 service', () => {
  assert.match(workspace, /const saveStandard = async/);
  assert.match(workspace, /crmSalesDiscoveryService\.saveRequirement\(\{/);
  assert.match(workspace, /isCustom: false/);
  assert.match(service, /from\('crm_requirements'\)/);
});

test('TEST 9 — Requirement save reloads persisted state and preserves existing structured values on text-only edits', () => {
  assert.match(workspace, /await crmSalesDiscoveryService\.saveRequirement[\s\S]*await load\('refresh'\)/);
  assert.match(service, /\.select\('\*'\)\.single\(\)/);
  assert.match(service, /!input\.id \|\| input\.structuredValue !== undefined/);
});

test('TEST 10 — all six Part 1 certainty states remain the only UI/service states', () => {
  for (const state of certaintyStates) {
    assert.match(service, new RegExp(state));
    assert.match(workspace, new RegExp(state));
  }
  const certaintyDeclaration = service.match(/CRM_INFORMATION_CERTAINTY = \[([\s\S]*?)\] as const/)?.[1] || '';
  assert.equal(certaintyStates.filter(state => certaintyDeclaration.includes(`'${state}'`)).length, 6);
});

test('TEST 11 — new standard and custom Requirement drafts safely default to AWAITING_CLIENT, never client-confirmed', () => {
  assert.match(workspace, /const standardDraft[\s\S]*requirement\?\.information_certainty \|\| 'AWAITING_CLIENT'/);
  assert.match(workspace, /const emptyCustom[\s\S]*certainty: 'AWAITING_CLIENT'/);
  assert.doesNotMatch(workspace, /const (?:standardDraft|emptyCustom)[\s\S]{0,450}certainty: 'CLIENT_CONFIRMED'/);
});

test('TEST 12 — Seller can add a deal-specific Custom Requirement', () => {
  assert.match(workspace, /const addCustom = async/);
  assert.match(workspace, /isCustom: true/);
  assert.match(workspace, /Add custom requirement/);
});

test('TEST 13 — custom Requirement keys are collision-resistant and checked against existing keys', () => {
  const keys = new Set(['custom_same']);
  const values = ['same', 'unique'];
  const key = createCustomRequirementKey(keys, () => values.shift() || 'fallback');
  assert.equal(key, 'custom_unique');
  assert.match(workspace, /createCustomRequirementKey\(activeRequirements\.map\(item => item\.requirement_key\)\)/);
});

test('TEST 14 — only Custom Requirements expose archive, with explicit confirmation and soft archive', () => {
  assert.match(workspace, /if \(!workspace \|\| !requirement\.is_custom\) return/);
  assert.match(workspace, /window\.confirm\(/);
  assert.match(workspace, /crmSalesDiscoveryService\.archiveRequirement/);
  assert.match(service, /update\(\{ record_state: 'ARCHIVED' \}\)/);
});

test('TEST 15 — standard Requirements use Not applicable rather than a normal archive action', () => {
  const standardSection = workspace.match(/function StandardRow[\s\S]*?function CustomRow/)?.[0] || '';
  assert.doesNotMatch(standardSection, /Archive/);
  assert.match(workspace, /NOT_APPLICABLE/);
});

test('TEST 16 — NOT_APPLICABLE is a resolved captured Core state even with no text', () => {
  const coverage = calculateRequirementCoverage(
    [makeDefinition('business_objective')],
    [makeRequirement({ content: null, information_certainty: 'NOT_APPLICABLE' })],
  );
  assert.equal(coverage.capturedCore, 1);
  assert.equal(coverage.resolvedNotApplicableCore, 1);
});

test('TEST 17 — missing Core count ignores recommended items and detects truly uncaptured Core items', () => {
  const definitions = [makeDefinition('one'), makeDefinition('two'), makeDefinition('recommended', 'RECOMMENDED')];
  const requirements = [makeRequirement({ requirement_key: 'one', content: 'Captured', information_certainty: 'SELLER_OBSERVATION' })];
  const coverage = calculateRequirementCoverage(definitions, requirements);
  assert.equal(coverage.totalCore, 2);
  assert.equal(coverage.capturedCore, 1);
  assert.deepEqual(coverage.missingCore.map(item => item.requirementKey), ['two']);
});

test('TEST 18 — SELLER_HYPOTHESIS is captured when meaningful but is never client-confirmed', () => {
  const coverage = calculateRequirementCoverage(
    [makeDefinition('business_objective')],
    [makeRequirement({ information_certainty: 'SELLER_HYPOTHESIS' })],
  );
  assert.equal(coverage.capturedCore, 1);
  assert.equal(coverage.confirmedCore, 0);
  assert.equal(coverage.needsAttentionCore, 1);
});

test('TEST 19 — AWAITING_CLIENT is not client confirmation and empty awaiting rows are not captured', () => {
  const empty = makeRequirement({ content: '', structured_value: null, information_certainty: 'AWAITING_CLIENT' });
  assert.equal(hasMeaningfulRequirementValue(empty), false);
  const coverage = calculateRequirementCoverage([makeDefinition('business_objective')], [empty]);
  assert.equal(coverage.capturedCore, 0);
  assert.equal(coverage.confirmedCore, 0);
  assert.equal(coverage.needsAttentionCore, 1);
});

test('TEST 20 — NEEDS_SPECIALIST_VALIDATION remains visibly unresolved without creating a review workflow', () => {
  assert.match(workspace, /Specialist validation required\. No review workflow has been started\./);
  assert.doesNotMatch(workspace, /Request technical review/i);
  const coverage = calculateRequirementCoverage(
    [makeDefinition('business_objective')],
    [makeRequirement({ information_certainty: 'NEEDS_SPECIALIST_VALIDATION' })],
  );
  assert.equal(coverage.confirmedCore, 0);
  assert.equal(coverage.needsAttentionCore, 1);
});

test('TEST 21 — canonical Lead facts are not duplicated into crm_requirements by the migration or viewing path', () => {
  for (const canonical of ['company_name', 'contact_name', 'email', 'phone', 'website', 'lead_score', 'estimated_value']) {
    assert.doesNotMatch(migration, new RegExp(`requirement_key[^\\n]*${canonical}`, 'i'));
  }
  assert.doesNotMatch(workspace, /company_name|contact_name|lead_score|estimated_value/);
});

test('TEST 22 — Requirements are lazy-loaded and unsaved tab drafts stay mounted across tab switches', () => {
  assert.match(drawer, /requirementsVisited/);
  assert.match(drawer, /if \(item\.id === 'requirements'\) setRequirementsVisited\(true\)/);
  assert.match(drawer, /requirementsVisited &&/);
  assert.match(drawer, /tab === 'requirements' \? 'block' : 'hidden'/);
  assert.match(drawer, /setRequirementsVisited\(initialTab === 'requirements'\)/);
});

test('TEST 23 — Requirement writes remain protected by the existing lead authorization boundary', () => {
  assert.match(part1, /create policy crm_requirements_access/);
  assert.match(part1, /using \(public\.crm_can_access_lead\(lead_id\)\)/);
  assert.match(part1, /with check \(public\.crm_can_access_lead\(lead_id\)\)/);
  assert.match(hardening, /crm_requirements_protect_identity/);
});

test('TEST 24 — anonymous Requirement access remains denied and global SOP definition writes remain Admin-controlled', () => {
  assert.match(part1, /revoke all on table public\.crm_requirements from anon/);
  assert.doesNotMatch(migration, /grant .*crm_requirements.*anon/i);
  assert.match(docs, /system_configuration/);
  assert.match(docs, /Admin-controlled/i);
});

test('TEST 25 — opportunityId workspace resolves to the same lead and Requirement records', () => {
  assert.match(migration, /if p_opportunity_id is not null then[\s\S]*from public\.crm_opportunities o[\s\S]*where o\.id = p_opportunity_id/);
  assert.match(migration, /where r\.lead_id = v_lead_id/);
  assert.match(service, /p_opportunity_id: reference\.opportunityId \?\? null/);
});

test('TEST 26 — conversion continuity does not copy or re-enter Requirements', () => {
  assert.doesNotMatch(migration, /insert into public\.crm_requirements[\s\S]*crm_opportunities/i);
  assert.doesNotMatch(migration, /update public\.crm_requirements[\s\S]*crm_opportunities/i);
  assert.match(docs, /No Requirement copying/i);
});

test('TEST 27 — Part 2 does not change crm_transition_opportunity or lead conversion behavior', () => {
  assert.doesNotMatch(migration, /create or replace function public\.crm_transition_opportunity/i);
  assert.doesNotMatch(migration, /create or replace function public\.convert_lead_to_opportunity/i);
  assert.doesNotMatch(migration, /alter table public\.crm_opportunities/i);
});

test('TEST 28 — Part 2 does not change quotation, payment, Won, package-fit, or commercial Sales Catalog truth', () => {
  assert.doesNotMatch(migration, /alter table public\.quotations/i);
  assert.doesNotMatch(migration, /create or replace function public\.[^(]*(payment|quotation|won)/i);
  assert.doesNotMatch(workspace, /Recommended package|Package Fit|Proposal Readiness|Sales Readiness/);
  assert.match(migration, /commercial package truth remains in sales_products/);
  assert.doesNotMatch(migration, /\$699|\$2,379|Launch|Growth|Scale/);
});

test('TEST 29 — TypeScript contracts are strongly typed for the canonical definition workspace', () => {
  assert.match(service, /CRMRequirementClass = 'CORE' \| 'RECOMMENDED' \| 'CONDITIONAL' \| 'COMPLEX'/);
  assert.match(service, /interface CRMRequirementDefinition/);
  assert.match(service, /requirementDefinitions: CRMRequirementDefinition\[\]/);
  assert.match(workspace, /CRMRequirementsWorkspaceProps/);
});

test('TEST 30 — focused security and data-safety controls are present in code and migration', () => {
  assert.doesNotMatch(migration, /create table public\.crm_requirement/i);
  assert.doesNotMatch(migration, /insert into public\.crm_requirements/i);
  assert.match(migration, /revoke all on function public\.crm_get_sales_discovery_workspace\(uuid, uuid\) from public, anon/);
  assert.match(migration, /grant execute on function public\.crm_get_sales_discovery_workspace\(uuid, uuid\) to authenticated/);
  assert.match(workspace, /Requirements could not be loaded\. Check your CRM access and try again\./);
  assert.doesNotMatch(workspace, /error\.message|SQL|Postgres/i);
});

test('TEST 31 — implementation preserves responsive/accessibility conventions and documents production build verification', () => {
  assert.match(drawer, /overflow-x-auto/);
  assert.match(workspace, /sm:grid-cols/);
  assert.match(workspace, /aria-expanded/);
  assert.match(workspace, /aria-pressed/);
  assert.match(workspace, /focus-visible:outline/);
  assert.match(workspace, /whitespace-pre-wrap break-words/);
  assert.match(docs, /npm run build/);
});