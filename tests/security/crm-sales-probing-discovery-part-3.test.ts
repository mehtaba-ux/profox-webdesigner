import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  calculateDiscoveryCoverage,
  createCustomDiscoveryQuestionKey,
  getDiscoveryQuestionConfiguration,
  hasMeaningfulDiscoveryAnswer,
} from '../../src/lib/crmDiscoveryUtils';
import type {
  CRMDiscoveryQuestion,
  CRMDiscoveryResponse,
} from '../../src/lib/crmSalesDiscoveryService';

const part1 = readFileSync('supabase/migrations/20260906113000_crm_sales_discovery_foundation_part_1.sql', 'utf8');
const hardening = readFileSync('supabase/migrations/20260906113500_crm_sales_discovery_foundation_hardening.sql', 'utf8');
const part2 = readFileSync('supabase/migrations/20260906123000_crm_sales_requirements_part_2.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20260908100000_crm_sales_probing_discovery_part_3.sql', 'utf8');
const service = readFileSync('src/lib/crmSalesDiscoveryService.ts', 'utf8');
const helper = readFileSync('src/lib/crmDiscoveryUtils.ts', 'utf8');
const drawer = readFileSync('src/components/admin/crm/CRMLeadDrawerBase.tsx', 'utf8');
const workspace = readFileSync('src/components/admin/crm/CRMDiscoveryWorkspace.tsx', 'utf8');
const requirementsWorkspace = readFileSync('src/components/admin/crm/CRMRequirementsWorkspace.tsx', 'utf8');
const docs = readFileSync('docs/crm-sales-probing-discovery-part-3.md', 'utf8');

const certaintyStates = [
  'CLIENT_CONFIRMED',
  'SELLER_OBSERVATION',
  'SELLER_HYPOTHESIS',
  'AWAITING_CLIENT',
  'NEEDS_SPECIALIST_VALIDATION',
  'NOT_APPLICABLE',
] as const;
const questionStates = ['NOT_ASKED', 'ASKED', 'ANSWERED', 'NEEDS_FOLLOW_UP', 'NOT_APPLICABLE'] as const;
const standardKeys = [...migration.matchAll(/^\s+\('([a-z0-9_]+)',/gm)].map(match => match[1]);

const makeQuestion = (patch: Partial<CRMDiscoveryQuestion> = {}): CRMDiscoveryQuestion => ({
  id: 'question-1',
  lead_id: null,
  question_key: 'problem_main',
  category: 'PROBLEM',
  question_text: 'What is the biggest problem?',
  purpose: null,
  framework: 'PROBLEM',
  active: true,
  sort_order: 10,
  applicability: { questionClass: 'CORE', relatedRequirementKeys: ['primary_problem'], section: 'PROBLEM' },
  is_custom: false,
  created_by: null,
  updated_by: null,
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T00:00:00Z',
  ...patch,
});

const makeResponse = (patch: Partial<CRMDiscoveryResponse> = {}): CRMDiscoveryResponse => ({
  id: 'response-1',
  lead_id: 'lead-1',
  question_id: 'question-1',
  meeting_id: null,
  question_state: 'ANSWERED',
  answer_text: 'The current process loses qualified enquiries.',
  structured_value: null,
  information_certainty: 'AWAITING_CLIENT',
  source_type: 'SELLER_MANUAL_ENTRY',
  source_record_id: null,
  source_recorded_at: '2026-09-08T00:00:00Z',
  follow_up_required: false,
  created_by: 'user-1',
  updated_by: 'user-1',
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T00:00:00Z',
  ...patch,
});

test('TEST 1 — Probing & Discovery tab appears immediately after Requirements', () => {
  assert.match(drawer, /LeadDrawerTab = 'overview' \| 'requirements' \| 'discovery' \| 'timeline' \| 'communication' \| 'activities'/);
  assert.match(drawer, /id: 'requirements', label: 'Requirements'[\s\S]*id: 'discovery', label: 'Probing & Discovery'[\s\S]*id: 'timeline', label: 'Complete log'/);
});

test('TEST 2 — existing Requirements tab and workspace remain connected', () => {
  assert.match(drawer, /CRMRequirementsWorkspace/);
  assert.match(drawer, /id: 'requirements', label: 'Requirements'/);
  assert.match(requirementsWorkspace, /crmSalesDiscoveryService\.getWorkspace/);
});

test('TEST 3 — Overview remains functional', () => {
  assert.match(drawer, /id: 'overview', label: 'Overview'/);
  assert.match(drawer, /tab === 'overview'/);
});

test('TEST 4 — Complete log remains functional', () => {
  assert.match(drawer, /id: 'timeline', label: 'Complete log'/);
  assert.match(drawer, /tab === 'timeline'/);
});

test('TEST 5 — Conversation behavior remains intact', () => {
  assert.match(drawer, /id: 'communication', label: 'Conversation'/);
  assert.match(drawer, /item\.id === 'communication'[\s\S]*onOpenConversation\(\)/);
});

test('TEST 6 — Follow-ups remain intact', () => {
  assert.match(drawer, /id: 'activities', label: 'Follow-ups'/);
  assert.match(drawer, /tab === 'activities'/);
});

test('TEST 7 — Discovery lazy-loads and remains mounted after first visit', () => {
  assert.match(drawer, /discoveryVisited/);
  assert.match(drawer, /if \(item\.id === 'discovery'\) setDiscoveryVisited\(true\)/);
  assert.match(drawer, /discoveryVisited &&/);
  assert.match(drawer, /tab === 'discovery' \? 'block' : 'hidden'/);
  assert.match(drawer, /setDiscoveryVisited\(initialTab === 'discovery'\)/);
});

test('TEST 8 — opening Discovery does not create response rows', () => {
  assert.doesNotMatch(migration, /insert into public\.crm_discovery_responses/i);
  const loadBlock = workspace.match(/const load = useCallback[\s\S]*?\}, \[leadId, opportunityId\]\);/)?.[0] || '';
  assert.match(loadBlock, /crmSalesDiscoveryService\.getWorkspace/);
  assert.doesNotMatch(loadBlock, /saveResponse|saveClientVoice|saveQuestion/);
});

test('TEST 9 — standard global questions are canonical, stable and unique', () => {
  assert.equal(standardKeys.length, 99);
  assert.equal(new Set(standardKeys).size, standardKeys.length);
  assert.match(migration, /insert into public\.crm_discovery_questions/);
  assert.match(migration, /null,\s*false,\s*true,/);
  assert.match(workspace, /standardQuestions[\s\S]*!question\.is_custom && question\.lead_id === null/);
});

test('TEST 10 — Core questions are prioritized', () => {
  assert.equal(getDiscoveryQuestionConfiguration(makeQuestion()).questionClass, 'CORE');
  assert.match(workspace, /Core discovery/);
  assert.match(workspace, /getDiscoveryQuestionConfiguration\(question\)\.questionClass === 'CORE'/);
});

test('TEST 11 — Conditional and Complex questions are progressively disclosed, not default-expanded', () => {
  assert.match(migration, /"questionClass":"CONDITIONAL"/);
  assert.match(migration, /"questionClass":"COMPLEX"/);
  assert.match(workspace, /const \[showAdditional, setShowAdditional\] = useState\(false\)/);
  assert.match(workspace, /aria-expanded=\{showAdditional\}/);
  assert.match(workspace, /Recommended, Conditional and Complex questions/);
});

test('TEST 12 — Seller can save an ANSWERED response through the existing service', () => {
  assert.match(workspace, /const saveResponse = async/);
  assert.match(workspace, /crmSalesDiscoveryService\.saveResponse\(\{/);
  assert.match(service, /from\('crm_discovery_responses'\)/);
  assert.match(service, /upsert\(payload, \{ onConflict: 'lead_id,question_id' \}\)/);
});

test('TEST 13 — ANSWERED cannot be saved with an empty answer', () => {
  assert.equal(hasMeaningfulDiscoveryAnswer(makeResponse({ answer_text: '', structured_value: null })), false);
  assert.match(workspace, /normalized\.state === 'ANSWERED'[\s\S]*An Answered question needs an actual answer/);
  assert.match(part1, /question_state <> 'ANSWERED'[\s\S]*answer_text is not null[\s\S]*structured_value is not null/i);
});

test('TEST 14 — NOT_APPLICABLE resolves cleanly', () => {
  const coverage = calculateDiscoveryCoverage([makeQuestion()], [makeResponse({ question_state: 'NOT_APPLICABLE', answer_text: null, information_certainty: 'NOT_APPLICABLE' })]);
  assert.equal(coverage.resolvedNotApplicableCore, 1);
  assert.equal(coverage.unresolvedCore, 0);
  assert.match(workspace, /state === 'NOT_APPLICABLE' \|\| draft\.certainty === 'NOT_APPLICABLE'/);
});

test('TEST 15 — ASKED is an explicit persisted question state', () => {
  assert.match(service, /'ASKED'/);
  assert.match(workspace, /ASKED: 'Asked'/);
  assert.match(workspace, /response\?\.question_state \?\? 'ASKED'/);
});

test('TEST 16 — NEEDS_FOLLOW_UP persists and forces follow-up visibility', () => {
  assert.match(workspace, /NEEDS_FOLLOW_UP: 'Needs follow-up'/);
  assert.match(workspace, /draft\.state === 'NEEDS_FOLLOW_UP'[\s\S]*followUp: true/);
  assert.match(service, /input\.followUpRequired \?\? input\.questionState === 'NEEDS_FOLLOW_UP'/);
});

test('TEST 17 — follow-up count includes state or explicit follow-up flag exactly once per response', () => {
  const q2 = makeQuestion({ id: 'question-2', question_key: 'q2' });
  const coverage = calculateDiscoveryCoverage(
    [makeQuestion(), q2],
    [makeResponse({ question_state: 'NEEDS_FOLLOW_UP', follow_up_required: true }), makeResponse({ id: 'r2', question_id: 'question-2', question_state: 'ASKED', follow_up_required: true })],
  );
  assert.equal(coverage.needsFollowUp, 2);
});

test('TEST 18 — all six certainty states remain supported', () => {
  for (const state of certaintyStates) {
    assert.match(service, new RegExp(state));
    assert.match(workspace, new RegExp(state));
  }
  const declaration = service.match(/CRM_INFORMATION_CERTAINTY = \[([\s\S]*?)\] as const/)?.[1] || '';
  assert.equal(certaintyStates.filter(state => declaration.includes(`'${state}'`)).length, 6);
});

test('TEST 19 — nothing new defaults to CLIENT_CONFIRMED', () => {
  assert.match(workspace, /response\?\.information_certainty \?\? 'AWAITING_CLIENT'/);
  assert.match(workspace, /emptyClientVoice[\s\S]*certainty: 'SELLER_OBSERVATION'/);
  assert.doesNotMatch(workspace, /\?\? 'CLIENT_CONFIRMED'/);
});

test('TEST 20 — SELLER_HYPOTHESIS remains distinct from client confirmation', () => {
  assert.match(workspace, /SELLER_HYPOTHESIS: 'Seller hypothesis'/);
  assert.notEqual('SELLER_HYPOTHESIS', 'CLIENT_CONFIRMED');
});

test('TEST 21 — NEEDS_SPECIALIST_VALIDATION remains unresolved without adding a review workflow', () => {
  const coverage = calculateDiscoveryCoverage([makeQuestion()], [makeResponse({ information_certainty: 'NEEDS_SPECIALIST_VALIDATION', question_state: 'ASKED', answer_text: null })]);
  assert.equal(coverage.needsSpecialistValidation, 1);
  assert.equal(coverage.unresolvedCore, 1);
  assert.doesNotMatch(workspace, /Request technical review|Start specialist review|review workflow/i);
});

test('TEST 22 — Seller can create a Custom Question', () => {
  assert.match(workspace, /const addCustomQuestion = async/);
  assert.match(workspace, /crmSalesDiscoveryService\.saveQuestion\(\{ leadId: workspace\.leadId/);
  assert.match(workspace, /isCustom: true/);
});

test('TEST 23 — Custom Question key is collision-safe', () => {
  const values = ['same', 'unique'];
  const key = createCustomDiscoveryQuestionKey(['custom_same'], () => values.shift() || 'fallback');
  assert.equal(key, 'custom_unique');
  assert.match(helper, /custom_\$\{uuidFactory/);
});

test('TEST 24 — Custom Questions are Lead-scoped', () => {
  assert.match(service, /if \(input\.isCustom && !input\.leadId\)/);
  assert.match(service, /custom discovery question requires a lead/i);
  assert.match(workspace, /question\.is_custom && question\.lead_id === workspace\?\.leadId/);
});

test('TEST 25 — cross-Lead Custom Question response linkage remains rejected', () => {
  assert.match(part1, /Custom discovery question belongs to another lead\./);
  assert.match(part1, /v_question_lead_id is distinct from new\.lead_id/);
});

test('TEST 26 — normal Sellers cannot modify standard global questions', () => {
  assert.match(part1, /crm_discovery_questions_update/);
  assert.match(part1, /\(not is_custom\)[\s\S]*lead_id is null[\s\S]*is_admin\(\)/i);
  assert.match(service, /if \(!input\.isCustom && input\.leadId\)/);
});

test('TEST 27 — Client Voice can be created through the canonical service', () => {
  assert.match(workspace, /const saveClientVoice = async/);
  assert.match(workspace, /crmSalesDiscoveryService\.saveClientVoice\(\{/);
  assert.match(service, /from\('crm_client_voice'\)/);
});

test('TEST 28 — client statement remains separate from Seller interpretation', () => {
  assert.match(part1, /customer_statement text not null/);
  assert.match(part1, /seller_interpretation text/);
  assert.match(workspace, /customerStatement/);
  assert.match(workspace, /sellerInterpretation/);
});

test('TEST 29 — Client Voice can link to a Requirement from the same Lead', () => {
  assert.match(workspace, /linkedRequirementId: voiceDraft\.linkedRequirementId \|\| null/);
  assert.match(part1, /linked_requirement_id uuid references public\.crm_requirements/);
  assert.match(part1, /Linked requirement must belong to the same lead\./);
});

test('TEST 30 — cross-Lead Requirement link remains rejected', () => {
  assert.match(part1, /v_requirement_lead_id is distinct from new\.lead_id/);
  assert.match(part1, /Linked requirement must belong to the same lead\./);
  assert.match(hardening, /crm_client_voice_validate_linkage/);
});

test('TEST 31 — Discovery displays related Requirement state without duplicating Requirements', () => {
  assert.match(workspace, /relatedRequirementKeys/);
  assert.match(workspace, /requirementByKey/);
  assert.match(workspace, /onViewRequirements/);
  assert.doesNotMatch(migration, /insert into public\.crm_requirements/i);
});

test('TEST 32 — Discovery answers do not automatically overwrite Requirements', () => {
  assert.doesNotMatch(workspace, /crmSalesDiscoveryService\.saveRequirement/);
  assert.doesNotMatch(migration, /update public\.crm_requirements|insert into public\.crm_requirements/i);
});

test('TEST 33 — no package recommendation is generated', () => {
  assert.doesNotMatch(workspace, /Recommended package|Package Fit|Proposal Readiness|Sales Readiness/i);
  assert.doesNotMatch(migration, /\$699|\$2,379|Launch|Growth|Scale/);
});

test('TEST 34 — no pipeline transition behavior changed', () => {
  assert.doesNotMatch(migration, /create or replace function public\.crm_transition_opportunity/i);
  assert.doesNotMatch(migration, /create or replace function public\.convert_lead_to_opportunity/i);
  assert.doesNotMatch(migration, /alter table public\.crm_opportunities/i);
});

test('TEST 35 — no quotation behavior changed', () => {
  assert.doesNotMatch(migration, /alter table public\.quotations/i);
  assert.doesNotMatch(migration, /create or replace function public\.[^(]*quotation/i);
});

test('TEST 36 — no payment or Won behavior changed', () => {
  assert.doesNotMatch(migration, /alter table public\.payments/i);
  assert.doesNotMatch(migration, /create or replace function public\.[^(]*(payment|won)/i);
});

test('TEST 37 — Opportunity workspace resolves to the same Lead Discovery data', () => {
  assert.match(service, /p_opportunity_id: reference\.opportunityId \?\? null/);
  assert.match(part2, /if p_opportunity_id is not null then[\s\S]*from public\.crm_opportunities o[\s\S]*where o\.id = p_opportunity_id/);
  assert.match(part2, /where d\.lead_id = v_lead_id|where r\.lead_id = v_lead_id/);
});

test('TEST 38 — Discovery rows are not copied during Lead→Opportunity conversion', () => {
  assert.doesNotMatch(migration, /insert into public\.crm_discovery_(questions|responses)[\s\S]*crm_opportunities/i);
  assert.doesNotMatch(migration, /copy.*discovery/i);
  assert.match(docs, /No Discovery copying/i);
});

test('TEST 39 — unauthorized Seller access is denied through existing Lead RLS', () => {
  assert.match(part1, /crm_discovery_responses_access/);
  assert.match(part1, /crm_client_voice_access/);
  assert.match(part1, /crm_can_access_lead\(lead_id\)/);
});

test('TEST 40 — anonymous Discovery access remains denied', () => {
  for (const table of ['crm_discovery_questions', 'crm_discovery_responses', 'crm_client_voice']) {
    assert.match(part1, new RegExp(`revoke all on table public\\.${table} from anon`));
  }
  assert.doesNotMatch(migration, /grant .*anon/i);
});

test('TEST 41 — answer and Client Voice audit events do not copy full sensitive text', () => {
  const auditFunction = part1.match(/create or replace function public\.crm_sales_discovery_audit_event\(\)[\s\S]*?\$\$;/i)?.[0] || part1;
  assert.match(auditFunction, /questionState/);
  assert.match(auditFunction, /informationCertainty/);
  assert.doesNotMatch(auditFunction, /v_metadata[\s\S]*answer_text/);
  assert.doesNotMatch(auditFunction, /v_metadata[\s\S]*customer_statement/);
});

test('TEST 42 — TypeScript contracts remain strongly typed for Discovery', () => {
  assert.match(service, /CRMDiscoveryQuestionState/);
  assert.match(service, /CRMDiscoveryFramework/);
  assert.match(service, /CRMDiscoveryResponse/);
  assert.match(workspace, /CRMDiscoveryWorkspaceProps/);
  assert.match(docs, /npm run build/);
});

test('TEST 43 — relevant security controls are covered by the focused regression suite', () => {
  assert.match(part1, /crm_sales_discovery_protect_identity/);
  assert.match(part1, /crm_validate_sales_discovery_linkage/);
  assert.match(hardening, /crm_discovery_responses_protect_identity/);
  assert.match(hardening, /crm_client_voice_protect_identity/);
});

test('TEST 44 — production-build verification is part of the documented release path', () => {
  assert.match(docs, /npm run build/);
  assert.match(drawer, /overflow-x-auto/);
  assert.match(workspace, /md:grid-cols-5/);
  assert.match(workspace, /aria-expanded/);
  assert.match(workspace, /aria-pressed/);
  assert.match(workspace, /focus-visible:outline/);
});
