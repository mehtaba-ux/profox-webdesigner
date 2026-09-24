import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  CERTAINTY_GUIDANCE,
  DISCOVERY_GUIDANCE_COVERAGE_KEYS,
  DISCOVERY_STATE_GUIDANCE,
  QUESTION_CLASS_GUIDANCE,
  REQUIREMENT_GUIDANCE_COVERAGE_KEYS,
  getCertaintyGuidance,
  getDiscoveryQuestionGuidance,
  getDiscoveryStateGuidance,
  getQuestionClassGuidance,
  getRequirementGuidance,
  getSellerGuidance,
} from '../../src/lib/crmSellerGuidance';
import { DISCOVERY_FOCUS_ENTRIES } from '../../src/lib/crmSellerGuidanceData';
import type { CRMDiscoveryQuestion, CRMRequirementClass, CRMRequirementDefinition } from '../../src/lib/crmSalesDiscoveryService';

const discoveryMigration = readFileSync('supabase/migrations/20260908100000_crm_sales_probing_discovery_part_3.sql', 'utf8');
const requirementsMigration = readFileSync('supabase/migrations/20260906123000_crm_sales_requirements_part_2.sql', 'utf8');
const helpComponent = readFileSync('src/components/admin/crm/SellerGuidanceHelp.tsx', 'utf8');
const guidanceSource = readFileSync('src/lib/crmSellerGuidance.ts', 'utf8');
const guidanceData = readFileSync('src/lib/crmSellerGuidanceData.ts', 'utf8');
const discoveryWorkspace = readFileSync('src/components/admin/crm/CRMDiscoveryWorkspace.tsx', 'utf8');
const requirementsWorkspace = readFileSync('src/components/admin/crm/CRMRequirementsWorkspace.tsx', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');
const part1Tests = readFileSync('tests/security/crm-sales-discovery-foundation-part-1.test.ts', 'utf8');
const part2Tests = readFileSync('tests/security/crm-sales-requirements-part-2.test.ts', 'utf8');
const part3Tests = readFileSync('tests/security/crm-sales-probing-discovery-part-3.test.ts', 'utf8');

const discoveryKeys = [...discoveryMigration.matchAll(/^\s+\('([a-z0-9_]+)',/gm)].map(match => match[1]);
const classByDiscoveryKey = new Map<string, CRMRequirementClass>(
  [...discoveryMigration.matchAll(/^\s+\('([a-z0-9_]+)'[^\n]+?"questionClass":"(CORE|RECOMMENDED|CONDITIONAL|COMPLEX)"/gm)]
    .map(match => [match[1], match[2] as CRMRequirementClass]),
);
const requirementDefinitions: CRMRequirementDefinition[] = [...requirementsMigration.matchAll(/^\s+\('([A-Z_]+)', '(CORE|RECOMMENDED|CONDITIONAL|COMPLEX)', '([a-z0-9_]+)', '((?:[^']|'')+)'/gm)].map((match, index) => ({
  category: match[1],
  requirementClass: match[2] as CRMRequirementClass,
  requirementKey: match[3],
  title: match[4].replaceAll("''", "'"),
  helpText: `Capture the client's ${match[4].replaceAll("''", "'").toLowerCase()}.`,
  sortOrder: index + 1,
  active: true,
  applicability: null,
}));

const makeQuestion = (key: string, questionClass: CRMRequirementClass = classByDiscoveryKey.get(key) ?? 'CORE'): CRMDiscoveryQuestion => ({
  id: `question-${key}`,
  lead_id: null,
  question_key: key,
  category: 'PROJECT_SCOPE',
  question_text: `Question for ${key}?`,
  purpose: null,
  framework: 'SCOPE',
  active: true,
  sort_order: 1,
  applicability: { questionClass, relatedRequirementKeys: [], section: 'PROJECT' },
  is_custom: false,
  created_by: null,
  updated_by: null,
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T00:00:00Z',
});

const allGuidanceText = [guidanceSource, guidanceData].join('\n');
const placeholder = /\b(?:TODO|lorem ipsum|placeholder guidance|fill this in)\b/i;

// TEST 1
test('TEST 1 — one canonical reusable help/tooltip primitive exists', () => {
  assert.match(helpComponent, /export default function SellerGuidanceHelp/);
  assert.match(discoveryWorkspace, /SellerGuidanceHelp/);
  assert.match(requirementsWorkspace, /SellerGuidanceHelp/);
});

// TEST 2
test('TEST 2 — no second competing tooltip architecture was introduced', () => {
  assert.equal((discoveryWorkspace.match(/import SellerGuidanceHelp/g) || []).length, 1);
  assert.equal((requirementsWorkspace.match(/import SellerGuidanceHelp/g) || []).length, 1);
  assert.doesNotMatch(guidanceSource, /createPortal|role="tooltip"/);
});

// TEST 3
test('TEST 3 — all active standard Discovery questions have guidance', () => {
  assert.equal(discoveryKeys.length, 99);
  assert.equal(DISCOVERY_GUIDANCE_COVERAGE_KEYS.length, 99);
  assert.deepEqual(new Set(DISCOVERY_GUIDANCE_COVERAGE_KEYS), new Set(discoveryKeys));
  for (const key of discoveryKeys) assert.ok(getDiscoveryQuestionGuidance(makeQuestion(key)), key);
});

// TEST 4
test('TEST 4 — Discovery guidance keys are unique', () => {
  assert.equal(new Set(DISCOVERY_GUIDANCE_COVERAGE_KEYS).size, DISCOVERY_GUIDANCE_COVERAGE_KEYS.length);
});

// TEST 5
test('TEST 5 — no active standard question has blank guidance', () => {
  for (const [key, focus] of DISCOVERY_FOCUS_ENTRIES) {
    assert.ok(key.trim());
    assert.ok(focus.trim().length >= 35, key);
    assert.ok(getDiscoveryQuestionGuidance(makeQuestion(key))?.shortHelp.trim(), key);
  }
});

// TEST 6
test('TEST 6 — no placeholder guidance remains', () => {
  assert.doesNotMatch(allGuidanceText, placeholder);
});

// TEST 7
test('TEST 7 — Core question guidance exists', () => {
  const key = [...classByDiscoveryKey].find(([, value]) => value === 'CORE')?.[0];
  assert.ok(key && getDiscoveryQuestionGuidance(makeQuestion(key, 'CORE')));
  assert.ok(getQuestionClassGuidance('CORE').shortHelp.length > 30);
});

// TEST 8
test('TEST 8 — Recommended question guidance exists', () => {
  const key = [...classByDiscoveryKey].find(([, value]) => value === 'RECOMMENDED')?.[0];
  assert.ok(key && getDiscoveryQuestionGuidance(makeQuestion(key, 'RECOMMENDED')));
  assert.ok(getQuestionClassGuidance('RECOMMENDED').shortHelp.length > 30);
});

// TEST 9
test('TEST 9 — Conditional question guidance exists', () => {
  const key = [...classByDiscoveryKey].find(([, value]) => value === 'CONDITIONAL')?.[0];
  assert.ok(key && getDiscoveryQuestionGuidance(makeQuestion(key, 'CONDITIONAL')));
  assert.ok(getQuestionClassGuidance('CONDITIONAL').shortHelp.length > 30);
});

// TEST 10
test('TEST 10 — Complex question guidance exists', () => {
  const key = [...classByDiscoveryKey].find(([, value]) => value === 'COMPLEX')?.[0];
  assert.ok(key && getDiscoveryQuestionGuidance(makeQuestion(key, 'COMPLEX')));
  assert.ok(getQuestionClassGuidance('COMPLEX').shortHelp.length > 30);
});

// TEST 11
test('TEST 11 — question guidance is resolved by stable key, not row index', () => {
  assert.match(guidanceSource, /DISCOVERY_FOCUS\.get\(question\.question_key\)/);
  assert.doesNotMatch(guidanceSource, /questionIndex|rowIndex|renderIndex/);
});

// TEST 12
test('TEST 12 — question tooltip opens without writing data', () => {
  assert.match(helpComponent, /setQuickOpen\(true\)/);
  assert.doesNotMatch(helpComponent, /saveResponse|saveRequirement|saveClientVoice|saveQuestion/);
});

// TEST 13
test('TEST 13 — detailed question help opens without writing data', () => {
  assert.match(helpComponent, /setDetailOpen\(true\)/);
  assert.match(helpComponent, /role="dialog"/);
  assert.doesNotMatch(helpComponent, /crmSalesDiscoveryService|supabase|\.insert\(|\.update\(/);
});

// TEST 14
test('TEST 14 — examples are never inserted into Discovery responses', () => {
  assert.match(helpComponent, /Educational example — never saved/);
  assert.doesNotMatch(helpComponent, /answerText|customerStatement|structuredValue/);
});

// TEST 15
test('TEST 15 — every current Requirement Definition has useful guidance/description', () => {
  assert.equal(requirementDefinitions.length, 105);
  assert.equal(REQUIREMENT_GUIDANCE_COVERAGE_KEYS.length, 105);
  for (const definition of requirementDefinitions) {
    const guidance = getRequirementGuidance(definition);
    assert.ok(guidance, definition.requirementKey);
    assert.ok((guidance?.shortHelp.length ?? 0) >= 60, definition.requirementKey);
  }
});

// TEST 16
test('TEST 16 — Requirement guidance uses stable keys', () => {
  assert.deepEqual(new Set(REQUIREMENT_GUIDANCE_COVERAGE_KEYS), new Set(requirementDefinitions.map(item => item.requirementKey)));
  assert.match(guidanceSource, /REQUIREMENT_GUIDANCE_KEY_SET\.has\(definition\.requirementKey\)/);
});

// TEST 17
test('TEST 17 — AWAITING_CLIENT guidance is correct', () => {
  const help = getCertaintyGuidance('AWAITING_CLIENT');
  assert.match(help.shortHelp, /needs the client|client to provide|client to.*confirm/i);
  assert.match(help.shortHelp, /rather than guessing|gap visible/i);
});

// TEST 18
test('TEST 18 — CLIENT_CONFIRMED guidance is correct', () => {
  const help = getCertaintyGuidance('CLIENT_CONFIRMED');
  assert.match(help.shortHelp, /explicitly provided or confirmed/i);
  assert.match(help.shortHelp, /assumption|research|interpretation/i);
});

// TEST 19
test('TEST 19 — NEEDS_SPECIALIST_VALIDATION guidance is correct', () => {
  const help = getCertaintyGuidance('NEEDS_SPECIALIST_VALIDATION');
  assert.match(help.shortHelp, /feasibility|implementation|security|integration/i);
  assert.match(help.escalation ?? '', /specialist/i);
});

// TEST 20
test('TEST 20 — Discovery states all have guidance', () => {
  assert.deepEqual(Object.keys(DISCOVERY_STATE_GUIDANCE).sort(), ['ANSWERED', 'ASKED', 'NEEDS_FOLLOW_UP', 'NOT_APPLICABLE', 'NOT_ASKED'].sort());
  for (const state of Object.keys(DISCOVERY_STATE_GUIDANCE) as Array<keyof typeof DISCOVERY_STATE_GUIDANCE>) assert.ok(getDiscoveryStateGuidance(state).shortHelp);
});

// TEST 21
test('TEST 21 — question priorities all have guidance', () => {
  assert.deepEqual(Object.keys(QUESTION_CLASS_GUIDANCE).sort(), ['CORE', 'RECOMMENDED', 'CONDITIONAL', 'COMPLEX'].sort());
});

// TEST 22
test('TEST 22 — Client Voice fields have guidance', () => {
  assert.ok(getSellerGuidance('field.client_voice_statement'));
  assert.ok(getSellerGuidance('field.client_voice_interpretation'));
  assert.match(discoveryWorkspace, /field\.client_voice_statement/);
  assert.match(discoveryWorkspace, /field\.client_voice_interpretation/);
});

// TEST 23
test('TEST 23 — client quote and Seller interpretation remain distinct', () => {
  assert.notEqual(getSellerGuidance('field.client_voice_statement')?.key, getSellerGuidance('field.client_voice_interpretation')?.key);
  assert.match(discoveryWorkspace, /customerStatement/);
  assert.match(discoveryWorkspace, /sellerInterpretation/);
});

// TEST 24
test('TEST 24 — Custom Question has guidance', () => {
  const help = getSellerGuidance('field.custom_question');
  assert.ok(help);
  assert.match(help?.avoid ?? '', /duplicate|leading/i);
});

// TEST 25
test('TEST 25 — Custom Question Purpose has guidance', () => {
  assert.ok(getSellerGuidance('field.custom_question_purpose'));
  assert.match(discoveryWorkspace, /field\.custom_question_purpose/);
});

// TEST 26
test('TEST 26 — Follow-up state has guidance', () => {
  assert.ok(getSellerGuidance('field.follow_up_required'));
  assert.match(getDiscoveryStateGuidance('NEEDS_FOLLOW_UP').shortHelp, /follow-up|revisit/i);
});

// TEST 27
test('TEST 27 — technical/integration help does not imply automatic feasibility', () => {
  const integration = getDiscoveryQuestionGuidance(makeQuestion('integration_any', 'CORE'));
  assert.match(integration?.shortHelp ?? '', /do not promise feasibility/i);
  assert.match(integration?.escalation ?? '', /specialist/i);
});

// TEST 28
test('TEST 28 — budget help does not invent or save budget', () => {
  const budget = getDiscoveryQuestionGuidance(makeQuestion('commercial_budget', 'CORE'));
  assert.match(budget?.shortHelp ?? '', /without pressuring|investment context/i);
  assert.match(budget?.avoid ?? '', /Do not invent a budget/i);
  assert.doesNotMatch(helpComponent, /budget|sales_products/);
});

// TEST 29
test('TEST 29 — security guidance warns against storing secrets where relevant', () => {
  const security = getDiscoveryQuestionGuidance(makeQuestion('technical_security', 'CONDITIONAL'));
  assert.match(security?.securityNote ?? '', /passwords|API secrets|private keys|recovery codes/i);
  const accessRequirement = requirementDefinitions.find(item => item.requirementKey === 'access_required_later');
  assert.ok(accessRequirement);
  assert.match(getRequirementGuidance(accessRequirement!)?.securityNote ?? '', /never passwords|API secrets|private keys|recovery/i);
});

// TEST 30
test('TEST 30 — tooltip trigger is keyboard accessible', () => {
  assert.match(helpComponent, /<button[\s\S]*type="button"/);
  assert.match(helpComponent, /focus-visible:outline/);
});

// TEST 31
test('TEST 31 — tooltip help is available on focus', () => {
  assert.match(helpComponent, /onFocus=\{showQuick\}/);
  assert.match(helpComponent, /aria-describedby/);
});

// TEST 32
test('TEST 32 — detailed help is available by touch/click', () => {
  assert.match(helpComponent, /onClick=\{event =>/);
  assert.match(helpComponent, /setDetailOpen\(true\)/);
  assert.match(helpComponent, /items-end[\s\S]*sm:items-center/);
});

// TEST 33
test('TEST 33 — Escape closes detailed help', () => {
  assert.match(helpComponent, /event\.key === 'Escape'[\s\S]*setDetailOpen\(false\)/);
});

// TEST 34
test('TEST 34 — screen-reader labeling exists', () => {
  assert.match(helpComponent, /aria-label=\{accessibleLabel\}/);
  assert.match(helpComponent, /role="tooltip"/);
  assert.match(helpComponent, /aria-labelledby=\{dialogTitleId\}/);
});

// TEST 35
test('TEST 35 — tooltip is not clipped by Lead Drawer overflow', () => {
  assert.match(helpComponent, /createPortal/);
  assert.match(helpComponent, /document\.body/);
  assert.match(helpComponent, /z-\[240\]|z-\[245\]/);
  assert.match(helpComponent, /window\.innerWidth/);
});

// TEST 36
test('TEST 36 — mobile interaction works', () => {
  assert.match(helpComponent, /rounded-t-\[1\.5rem\]/);
  assert.match(helpComponent, /sm:max-w-2xl/);
  assert.match(helpComponent, /max-h-\[92vh\]/);
});

// TEST 37
test('TEST 37 — opening help causes no lifecycle transition', () => {
  assert.doesNotMatch(helpComponent, /transition|onStage|convert_lead_to_opportunity|crm_transition_opportunity/i);
});

// TEST 38
test('TEST 38 — opening help causes no Requirement update', () => {
  assert.doesNotMatch(helpComponent, /saveRequirement|crm_requirements/);
});

// TEST 39
test('TEST 39 — opening help causes no Discovery update', () => {
  assert.doesNotMatch(helpComponent, /saveResponse|crm_discovery_responses/);
});

// TEST 40
test('TEST 40 — opening help causes no Client Voice update', () => {
  assert.doesNotMatch(helpComponent, /saveClientVoice|crm_client_voice/);
});

// TEST 41
test('TEST 41 — opening help creates no fake records', () => {
  assert.doesNotMatch(helpComponent, /\.insert\(|\.upsert\(|\.update\(|fetch\(|supabase/);
  assert.match(helpComponent, /Guidance is instructional only/);
});

// TEST 42
test('TEST 42 — no new package recommendation behavior exists', () => {
  const changedUi = [helpComponent, guidanceSource, discoveryWorkspace, requirementsWorkspace].join('\n');
  assert.doesNotMatch(changedUi, /Recommended package|Package Fit|auto(?:matic)? package|selectPackage/i);
});

// TEST 43
test('TEST 43 — no pipeline gating changes exist', () => {
  const changed = [helpComponent, guidanceSource].join('\n');
  assert.doesNotMatch(changed, /crm_transition_opportunity|convert_lead_to_opportunity|supabase\.from|\.insert\(|\.upsert\(/i);
});

// TEST 44
test('TEST 44 — no quotation behavior changes exist', () => {
  assert.doesNotMatch([helpComponent, guidanceSource].join('\n'), /createQuotation|saveQuotation|quotation gate/i);
});

// TEST 45
test('TEST 45 — no payment/Won changes exist', () => {
  assert.doesNotMatch([helpComponent, guidanceSource].join('\n'), /recordPayment|markWon|payment gate|won gate/i);
});

// TEST 46
test('TEST 46 — no Meeting Prep Part 4 functionality was implemented', () => {
  const implementation = [helpComponent, guidanceSource, discoveryWorkspace, requirementsWorkspace].join('\n');
  assert.match(implementation, /Mark Prep Ready|Meeting Objective|Intended Advance/);
  assert.doesNotMatch(guidanceSource, /supabase\.from|\.insert\(|\.upsert\(/i);
});

// TEST 47
test('TEST 47 — Part 1 tests remain part of the regression suite', () => {
  assert.match(part1Tests, /CRM Sales Discovery|crm_requirements|crm_discovery/i);
  assert.match(packageJson, /tests\/security\/\*\.test\.ts/);
});

// TEST 48
test('TEST 48 — Part 2 tests remain part of the regression suite', () => {
  assert.match(part2Tests, /Requirements|requirement/i);
  assert.match(packageJson, /test:security/);
});

// TEST 49
test('TEST 49 — Part 3 tests remain part of the regression suite', () => {
  assert.match(part3Tests, /Probing|Discovery/);
  assert.match(packageJson, /test:security/);
});

// TEST 50
test('TEST 50 — TypeScript validation is wired to lint', () => {
  assert.match(packageJson, /"lint": "tsc --noEmit"/);
});

// TEST 51
test('TEST 51 — security regression command is present', () => {
  assert.match(packageJson, /"test:security": "tsx --test tests\/security\/\*\.test\.ts"/);
});

// TEST 52
test('TEST 52 — migration integrity command is present and Part 3.5 adds no migration dependency', () => {
  assert.match(packageJson, /"migrations:check":/);
  assert.doesNotMatch(guidanceSource, /supabase\/migrations|apply_migration|create table/i);
});

// TEST 53
test('TEST 53 — production-style build command is present', () => {
  assert.match(packageJson, /"build": "[^"]*vite build[^"]*verify-supabase-build-config\.mjs"/);
});

// Sanity: the canonical maps themselves stay complete.
test('sanity — certainty and class guidance maps have no blank entries', () => {
  for (const entry of [...Object.values(CERTAINTY_GUIDANCE), ...Object.values(QUESTION_CLASS_GUIDANCE)]) {
    assert.ok(entry.key && entry.title && entry.shortHelp.trim().length >= 20);
  }
});
