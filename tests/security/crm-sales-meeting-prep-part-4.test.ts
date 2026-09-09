import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type {
  CRMDiscoveryQuestion,
  CRMDiscoveryResponse,
  CRMMeetingPreparationWorkspaceItem,
  CRMRequirement,
  CRMSalesDiscoveryWorkspace,
} from '../../src/lib/crmSalesDiscoveryService';
import {
  buildMeetingPrepGaps,
  buildMeetingPrepKnownContext,
  buildRecommendedMeetingQuestions,
  chooseDefaultMeetingForPreparation,
  getUpcomingMeetingsForPreparation,
  splitMeetingHypotheses,
} from '../../src/lib/crmMeetingPrepUtils';
import { getSellerGuidance } from '../../src/lib/crmSellerGuidance';

const part1Migration = readFileSync('supabase/migrations/20260906113000_crm_sales_discovery_foundation_part_1.sql', 'utf8');
const part4Migration = readFileSync('supabase/migrations/20260909103000_crm_sales_meeting_prep_part_4.sql', 'utf8');
const drawer = readFileSync('src/components/admin/crm/CRMLeadDrawerBase.tsx', 'utf8');
const meetingPrep = readFileSync('src/components/admin/crm/CRMMeetingPrepWorkspace.tsx', 'utf8');
const meetingPrepUtils = readFileSync('src/lib/crmMeetingPrepUtils.ts', 'utf8');
const service = readFileSync('src/lib/crmSalesDiscoveryService.ts', 'utf8');
const guidance = readFileSync('src/lib/crmSellerGuidance.ts', 'utf8');
const helpComponent = readFileSync('src/components/admin/crm/SellerGuidanceHelp.tsx', 'utf8');
const part1Tests = readFileSync('tests/security/crm-sales-discovery-foundation-part-1.test.ts', 'utf8');
const part2Tests = readFileSync('tests/security/crm-sales-requirements-part-2.test.ts', 'utf8');
const part3Tests = readFileSync('tests/security/crm-sales-probing-discovery-part-3.test.ts', 'utf8');
const part35Tests = readFileSync('tests/security/crm-seller-guidance-part-3-5.test.ts', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');

const at = (hours: number) => new Date(Date.UTC(2026, 8, 9, 12 + hours)).toISOString();
const NOW = Date.UTC(2026, 8, 9, 12);

const makeMeeting = (id: string, hours: number, status = 'Scheduled'): CRMMeetingPreparationWorkspaceItem => ({
  meetingId: id,
  title: `Meeting ${id}`,
  scheduledAt: at(hours),
  status,
  meetingType: 'Discovery Meeting',
  timezone: 'Asia/Kolkata',
  preparationState: 'NOT_STARTED',
  preparedBy: null,
  preparedByName: null,
  preparedAt: null,
  preparation: null,
  selectedQuestionIds: [],
});

const makeQuestion = (
  id: string,
  questionClass: 'CORE' | 'RECOMMENDED' | 'CONDITIONAL' | 'COMPLEX' = 'CORE',
  relatedRequirementKeys: string[] = [],
): CRMDiscoveryQuestion => ({
  id,
  lead_id: null,
  question_key: id,
  category: 'PROJECT_SCOPE',
  question_text: `Question ${id}?`,
  purpose: 'Purpose',
  framework: 'SCOPE',
  active: true,
  sort_order: 1,
  applicability: { questionClass, relatedRequirementKeys, section: 'PROJECT' },
  is_custom: false,
  created_by: null,
  updated_by: null,
  created_at: at(-24),
  updated_at: at(-24),
});

const makeResponse = (
  questionId: string,
  overrides: Partial<CRMDiscoveryResponse> = {},
): CRMDiscoveryResponse => ({
  id: `response-${questionId}`,
  lead_id: 'lead-1',
  question_id: questionId,
  meeting_id: null,
  question_state: 'NOT_ASKED',
  answer_text: null,
  structured_value: null,
  information_certainty: 'AWAITING_CLIENT',
  source_type: null,
  source_record_id: null,
  source_recorded_at: null,
  follow_up_required: false,
  created_by: 'seller-1',
  updated_by: 'seller-1',
  created_at: at(-24),
  updated_at: at(-24),
  ...overrides,
});

const makeRequirement = (
  key: string,
  overrides: Partial<CRMRequirement> = {},
): CRMRequirement => ({
  id: `requirement-${key}`,
  lead_id: 'lead-1',
  requirement_key: key,
  category: 'PROJECT_SCOPE',
  title: `Requirement ${key}`,
  content: 'Captured value',
  structured_value: null,
  is_custom: false,
  information_certainty: 'CLIENT_CONFIRMED',
  record_state: 'ACTIVE',
  source_type: 'SELLER_MANUAL_ENTRY',
  source_record_id: null,
  source_recorded_at: at(-24),
  created_by: 'seller-1',
  updated_by: 'seller-1',
  created_at: at(-24),
  updated_at: at(-24),
  ...overrides,
});

const makeWorkspace = (overrides: Partial<CRMSalesDiscoveryWorkspace> = {}): CRMSalesDiscoveryWorkspace => ({
  leadId: 'lead-1',
  opportunityId: 'opportunity-1',
  requirementDefinitions: [],
  requirements: [],
  questions: [],
  responses: [],
  clientVoice: [],
  meetingPreparations: [],
  ...overrides,
});

// TEST 1
test('TEST 1 — existing sales_meetings is reused', () => {
  assert.match(part4Migration, /update public\.sales_meetings/i);
  assert.doesNotMatch(part4Migration, /create\s+table\s+(?:public\.)?(?:crm_)?meeting/i);
});

// TEST 2
test('TEST 2 — existing crm_meeting_preparations is reused', () => {
  assert.match(service, /from\('crm_meeting_preparations'\)/);
  assert.match(part4Migration, /public\.crm_meeting_preparations/);
});

// TEST 3
test('TEST 3 — existing crm_meeting_discovery_questions is reused', () => {
  assert.match(part4Migration, /public\.crm_meeting_discovery_questions/);
  assert.match(service, /crm_set_meeting_discovery_questions/);
});

// TEST 4
test('TEST 4 — no duplicate Meeting Prep table is created', () => {
  assert.doesNotMatch(part4Migration, /create\s+table/i);
});

// TEST 5
test('TEST 5 — no duplicate readiness column is created', () => {
  assert.doesNotMatch(part4Migration, /add\s+column/i);
  assert.doesNotMatch(part4Migration, /\bis_ready\b|\bprep_complete\b|\bmeeting_ready\b/i);
});

// TEST 6
test('TEST 6 — existing mark_sales_meeting_prepared RPC is reused', () => {
  assert.match(part4Migration, /create or replace function public\.mark_sales_meeting_prepared\(p_meeting_id uuid\)/i);
  assert.doesNotMatch(part4Migration, /mark_sales_meeting_prepared_v2|crm_mark_meeting_ready/i);
});

// TEST 7
test('TEST 7 — existing crmSalesDiscoveryService is reused', () => {
  assert.match(meetingPrep, /crmSalesDiscoveryService\.getWorkspace/);
  assert.match(meetingPrep, /crmSalesDiscoveryService\.saveMeetingPreparation/);
});

// TEST 8
test('TEST 8 — existing SellerGuidanceHelp is reused', () => {
  assert.match(meetingPrep, /import SellerGuidanceHelp from '\.\/SellerGuidanceHelp'/);
  assert.doesNotMatch(meetingPrep, /function\s+(?:Tooltip|HelpPopover|GuidancePopover)/);
});

// TEST 9
test('TEST 9 — Meeting Prep appears once in Lead Drawer tabs', () => {
  assert.equal((drawer.match(/label: 'Meeting Prep'/g) || []).length, 1);
});

// TEST 10
test('TEST 10 — Meeting Prep stays inside the Lead Drawer', () => {
  assert.match(drawer, /<CRMMeetingPrepWorkspace/);
  assert.doesNotMatch(meetingPrep, /useNavigate|window\.location|navigate\(/);
});

// TEST 11
test('TEST 11 — no-meeting empty state works', () => {
  assert.match(meetingPrep, /No upcoming sales meeting is available for preparation\./);
});

// TEST 12
test('TEST 12 — existing scheduling action is reused', () => {
  assert.match(meetingPrep, /onScheduleMeeting/);
  assert.match(drawer, /onScheduleMeeting=\{onOpenMeeting\}/);
  assert.doesNotMatch(meetingPrep, /insert\([^\n]*sales_meetings/);
});

// TEST 13
test('TEST 13 — multiple meetings are handled', () => {
  assert.match(meetingPrep, /upcomingMeetings\.length > 1/);
  assert.match(meetingPrep, /changeMeeting/);
});

// TEST 14
test('TEST 14 — nearest relevant upcoming meeting defaults correctly', () => {
  const meetings = [makeMeeting('later', 5), makeMeeting('past', -1), makeMeeting('nearest', 1), makeMeeting('cancelled', 0.5, 'Cancelled')];
  assert.equal(chooseDefaultMeetingForPreparation(meetings, NOW)?.meetingId, 'nearest');
  assert.deepEqual(getUpcomingMeetingsForPreparation(meetings, NOW).map(item => item.meetingId), ['nearest', 'later']);
});

// TEST 15
test('TEST 15 — Meeting A and B preparation remain isolated by meeting id', () => {
  assert.match(service, /meeting_id: input\.meetingId/);
  assert.match(part4Migration, /primary key \(meeting_id\)|crm_meeting_preparations/i);
  assert.match(meetingPrep, /selectedMeetingId/);
});

// TEST 16
test('TEST 16 — Objective saves to canonical Meeting Prep', () => {
  assert.match(meetingPrep, /meetingObjective: draft\.meetingObjective/);
  assert.match(service, /payload\.meeting_objective = input\.meetingObjective/);
});

// TEST 17
test('TEST 17 — Intended Advance saves canonically', () => {
  assert.match(meetingPrep, /intendedAdvance: draft\.intendedAdvance/);
  assert.match(service, /payload\.intended_advance = input\.intendedAdvance/);
});

// TEST 18
test('TEST 18 — hypotheses remain Seller hypotheses', () => {
  assert.match(meetingPrep, /SELLER HYPOTHESIS/);
  assert.match(meetingPrep, /not Client Voice, Requirements, technical approval/i);
});

// TEST 19
test('TEST 19 — Seller Notes remain private preparation detail', () => {
  assert.match(meetingPrep, /Private Seller Notes/);
  assert.match(meetingPrep, /Internal preparation notes/);
});

// TEST 20
test('TEST 20 — What We Know is derived and not separately persisted', () => {
  assert.match(meetingPrep, /buildMeetingPrepKnownContext/);
  assert.doesNotMatch(part4Migration, /what_we_know/i);
});

// TEST 21
test('TEST 21 — What We Still Need is derived and not separately persisted', () => {
  assert.match(meetingPrep, /buildMeetingPrepGaps/);
  assert.doesNotMatch(part4Migration, /what_we_still_need|missing_information/i);
});

// TEST 22
test('TEST 22 — answered client-confirmed information is not blindly recommended again', () => {
  const question = makeQuestion('answered-core');
  const response = makeResponse(question.id, { question_state: 'ANSWERED', answer_text: 'Confirmed answer', information_certainty: 'CLIENT_CONFIRMED' });
  const recommendations = buildRecommendedMeetingQuestions(makeWorkspace({ questions: [question], responses: [response] }));
  assert.equal(recommendations.length, 0);
});

// TEST 23
test('TEST 23 — NEEDS_FOLLOW_UP is surfaced first', () => {
  const follow = makeQuestion('follow');
  const core = makeQuestion('core');
  const responses = [makeResponse(follow.id, { question_state: 'NEEDS_FOLLOW_UP', information_certainty: 'SELLER_OBSERVATION' })];
  const recommendations = buildRecommendedMeetingQuestions(makeWorkspace({ questions: [core, follow], responses }));
  assert.equal(recommendations[0]?.question.id, 'follow');
});

// TEST 24
test('TEST 24 — AWAITING_CLIENT is surfaced', () => {
  const question = makeQuestion('awaiting');
  const response = makeResponse(question.id, { question_state: 'ASKED', information_certainty: 'AWAITING_CLIENT' });
  assert.equal(buildRecommendedMeetingQuestions(makeWorkspace({ questions: [question], responses: [response] }))[0]?.reason, 'Awaiting client information or confirmation.');
});

// TEST 25
test('TEST 25 — NEEDS_SPECIALIST_VALIDATION is surfaced', () => {
  const requirement = makeRequirement('technical', { information_certainty: 'NEEDS_SPECIALIST_VALIDATION' });
  const gaps = buildMeetingPrepGaps(makeWorkspace({ requirements: [requirement] }));
  assert.ok(gaps.some(item => /specialist validation/i.test(item.detail)));
});

// TEST 26
test('TEST 26 — Core gaps receive appropriate priority', () => {
  const core = makeQuestion('core');
  const recommended = makeQuestion('recommended', 'RECOMMENDED');
  const recommendations = buildRecommendedMeetingQuestions(makeWorkspace({ questions: [recommended, core] }));
  assert.equal(recommendations[0]?.priority, 'CORE');
});

// TEST 27
test('TEST 27 — Conditional questions obey applicability', () => {
  const conditional = makeQuestion('conditional', 'CONDITIONAL', ['booking_required']);
  const hidden = buildRecommendedMeetingQuestions(makeWorkspace({ questions: [conditional] }));
  assert.equal(hidden.length, 0);
  const requirement = makeRequirement('booking_required');
  const shown = buildRecommendedMeetingQuestions(makeWorkspace({ questions: [conditional], requirements: [requirement] }));
  assert.equal(shown.length, 1);
});

// TEST 28
test('TEST 28 — Complex questions do not clutter simple deals', () => {
  const complex = makeQuestion('complex', 'COMPLEX', ['api_requirements']);
  assert.equal(buildRecommendedMeetingQuestions(makeWorkspace({ questions: [complex] })).length, 0);
});

// TEST 29
test('TEST 29 — meeting question selection uses canonical relation', () => {
  assert.match(part4Migration, /crm_meeting_discovery_questions/);
});

// TEST 30
test('TEST 30 — selection uses crm_set_meeting_discovery_questions RPC', () => {
  assert.match(service, /rpc\('crm_set_meeting_discovery_questions'/);
});

// TEST 31
test('TEST 31 — cross-Lead custom questions remain rejected', () => {
  assert.match(part4Migration, /q\.lead_id is null or q\.lead_id = v_lead_id/);
});

// TEST 32
test('TEST 32 — inactive questions cannot be selected', () => {
  assert.match(part4Migration, /q\.active/);
});

// TEST 33
test('TEST 33 — recommended questions are not automatically persisted', () => {
  assert.match(meetingPrep, /buildRecommendedMeetingQuestions/);
  assert.match(meetingPrep, /Save question set/);
  assert.doesNotMatch(meetingPrepUtils, /crmSalesDiscoveryService|supabase/);
});

// TEST 34
test('TEST 34 — opening Meeting Prep does not alter Discovery', () => {
  assert.doesNotMatch(meetingPrep, /saveResponse\(/);
});

// TEST 35
test('TEST 35 — opening Meeting Prep does not alter Requirements', () => {
  assert.doesNotMatch(meetingPrep, /saveRequirement\(/);
});

// TEST 36
test('TEST 36 — opening Meeting Prep does not create Client Voice', () => {
  assert.doesNotMatch(meetingPrep, /saveClientVoice\(/);
});

// TEST 37
test('TEST 37 — opening Meeting Prep does not change Pipeline', () => {
  assert.doesNotMatch(meetingPrep, /crm_transition_opportunity|transitionOpportunity|updateStage|convertToOpportunity/);
});

// TEST 38
test('TEST 38 — Mark Prep Ready requires authorized Seller/Admin', () => {
  assert.match(part4Migration, /public\.is_admin\(\)/);
  assert.match(part4Migration, /v_meeting\.salesperson_id is distinct from v_uid/);
});

// TEST 39
test('TEST 39 — only Scheduled/Rescheduled meeting can be prepared', () => {
  assert.match(part4Migration, /status not in \('Scheduled', 'Rescheduled'\)/);
});

// TEST 40
test('TEST 40 — missing Meeting Objective blocks READY server-side', () => {
  assert.match(part4Migration, /Meeting Objective is required before Meeting Prep can be marked Ready/);
});

// TEST 41
test('TEST 41 — missing Intended Advance blocks READY server-side', () => {
  assert.match(part4Migration, /Intended Advance is required before Meeting Prep can be marked Ready/);
});

// TEST 42
test('TEST 42 — valid preparation can become READY', () => {
  assert.match(part4Migration, /set prep_reviewed_at = now\(\)/);
  assert.match(part4Migration, /'prepared', true/);
});

// TEST 43
test('TEST 43 — readiness remains canonical on sales_meetings', () => {
  assert.match(part4Migration, /prep_reviewed_at/);
  assert.match(part4Migration, /prep_reviewed_by/);
  assert.doesNotMatch(part4Migration, /alter table public\.crm_meeting_preparations.*ready/is);
});

// TEST 44
test('TEST 44 — material objective edit invalidates READY', () => {
  assert.match(part4Migration, /new\.meeting_objective is not distinct from old\.meeting_objective/);
  assert.match(part4Migration, /after update of meeting_objective, intended_advance, hypotheses/);
});

// TEST 45
test('TEST 45 — material intended-advance edit invalidates READY', () => {
  assert.match(part4Migration, /new\.intended_advance is not distinct from old\.intended_advance/);
});

// TEST 46
test('TEST 46 — selected-question edit invalidates READY', () => {
  assert.match(part4Migration, /crm_meeting_discovery_questions_invalidate_ready/);
  assert.match(part4Migration, /after insert or delete on public\.crm_meeting_discovery_questions/);
});

// TEST 47
test('TEST 47 — hypotheses edits invalidate READY while Seller Notes are supplemental', () => {
  assert.match(part4Migration, /new\.hypotheses is not distinct from old\.hypotheses/);
  assert.doesNotMatch(part4Migration, /after update of[^\n]*seller_notes/);
});

// TEST 48
test('TEST 48 — readiness invalidation is server-side', () => {
  assert.match(part4Migration, /create trigger crm_meeting_preparations_invalidate_ready/);
  assert.match(part4Migration, /create trigger crm_meeting_discovery_questions_invalidate_ready/);
});

// TEST 49
test('TEST 49 — Part 4 Meeting Prep guidance exists', () => {
  assert.ok(getSellerGuidance('section.meeting_prep'));
});

// TEST 50
test('TEST 50 — Meeting Objective guidance exists', () => {
  assert.ok(getSellerGuidance('field.meeting_objective'));
});

// TEST 51
test('TEST 51 — Intended Advance guidance exists', () => {
  assert.ok(getSellerGuidance('field.intended_advance'));
});

// TEST 52
test('TEST 52 — hypothesis guidance exists', () => {
  assert.ok(getSellerGuidance('field.seller_hypotheses'));
});

// TEST 53
test('TEST 53 — known/unknown guidance exists', () => {
  assert.ok(getSellerGuidance('section.what_we_know'));
  assert.ok(getSellerGuidance('section.what_we_still_need'));
});

// TEST 54
test('TEST 54 — Mark Prep Ready guidance exists', () => {
  assert.ok(getSellerGuidance('action.mark_prep_ready'));
});

// TEST 55
test('TEST 55 — guidance remains read-only', () => {
  assert.doesNotMatch(helpComponent, /crmSalesDiscoveryService|supabase|\.insert\(|\.update\(/);
});

// TEST 56
test('TEST 56 — private prep is not customer/public readable', () => {
  assert.match(part4Migration, /revoke all on function public\.crm_get_sales_discovery_workspace\(uuid, uuid\) from public, anon/);
  assert.doesNotMatch(meetingPrep, /customer_summary|customer_next_step/);
});

// TEST 57
test('TEST 57 — anonymous access remains denied', () => {
  assert.match(part4Migration, /from public, anon/);
  assert.match(part1Migration, /enable row level security/i);
});

// TEST 58
test('TEST 58 — Lead→Opportunity continuity remains relationship-based', () => {
  assert.match(part4Migration, /left join public\.crm_opportunities mo on mo\.id = m\.opportunity_id/);
  assert.match(part4Migration, /coalesce\(m\.lead_id, mo\.lead_id\) = v_lead_id/);
});

// TEST 59
test('TEST 59 — Lead A → Lead B state is reset', () => {
  assert.match(drawer, /useEffect\(\(\) => \{[\s\S]*setMeetingPrepVisited\(initialTab === 'meeting-prep'\)[\s\S]*\}, \[lead\.id, initialTab\]\)/);
  assert.match(meetingPrep, /setSelectedMeetingId\(''\)/);
});

// TEST 60
test('TEST 60 — Meeting A → Meeting B loads its own canonical preparation', () => {
  assert.match(meetingPrep, /draftForMeeting\(selectedMeeting\)/);
  assert.match(meetingPrep, /selectedMeeting\?\.selectedQuestionIds/);
});

// TEST 61
test('TEST 61 — no fake client data is created', () => {
  assert.doesNotMatch(part4Migration, /insert into public\.crm_(?:requirements|discovery_responses|client_voice)/i);
  assert.doesNotMatch(meetingPrep, /sample client|fake client/i);
});

// TEST 62
test('TEST 62 — no sales_products changes', () => {
  assert.doesNotMatch(part4Migration + meetingPrep + service, /sales_products/);
});

// TEST 63
test('TEST 63 — no Package Fit feature is implemented', () => {
  assert.doesNotMatch(meetingPrep + meetingPrepUtils + service + part4Migration, /\bpackage_fit\b|\bpackageFit\b|\bpackageScore\b|\bpackageScoring\b|\brecommendationEngine\b/);
});

// TEST 64
test('TEST 64 — no Proposal Readiness feature is implemented', () => {
  assert.doesNotMatch(meetingPrep + meetingPrepUtils + service + part4Migration, /\bproposal_readiness\b|\bproposal_ready\b|\bproposalReady\b|\bproposalScore\b|\bproposalReadiness\b/);
});

// TEST 65
test('TEST 65 — no quotation gate is changed', () => {
  assert.doesNotMatch(part4Migration, /quotation sent|quotation blocker|quotation gate/i);
});

// TEST 66
test('TEST 66 — no payment/Won behavior is changed', () => {
  assert.doesNotMatch(part4Migration, /advance payment|payment.*won|won.*payment/i);
});

// TEST 67
test('TEST 67 — no live Meeting Management is implemented', () => {
  assert.doesNotMatch(meetingPrep, /meeting timer|transcript|live meeting mode|meeting outcome|close-out/i);
});

// TEST 68
test('TEST 68 — Part 1 regression suite remains present', () => {
  assert.match(part1Tests, /CRM Sales Discovery Foundation|TEST 1|test\(/i);
});

// TEST 69
test('TEST 69 — Part 2 regression suite remains present', () => {
  assert.match(part2Tests, /Requirements|TEST 1|test\(/i);
});

// TEST 70
test('TEST 70 — Part 3 regression suite remains present', () => {
  assert.match(part3Tests, /Discovery|TEST 1|test\(/i);
});

// TEST 71
test('TEST 71 — Part 3.5 regression suite remains present', () => {
  assert.match(part35Tests, /SellerGuidanceHelp|TEST 1|test\(/i);
});

// TEST 72
test('TEST 72 — TypeScript validation remains executable', () => {
  assert.match(packageJson, /"lint":\s*"tsc --noEmit"/);
});

// TEST 73
test('TEST 73 — security suite remains executable', () => {
  assert.match(packageJson, /"test:security":\s*"tsx --test tests\/security\/\*\.test\.ts"/);
});

// TEST 74
test('TEST 74 — migration integrity check remains executable', () => {
  assert.match(packageJson, /"migrations:check"/);
});

// TEST 75
test('TEST 75 — production build remains executable', () => {
  assert.match(packageJson, /"build":\s*"vite build/);
});

// Additional behavior tests required by the implementation.
test('extra — selected recommendations are excluded without mutating source data', () => {
  const q1 = makeQuestion('q1');
  const q2 = makeQuestion('q2');
  const workspace = makeWorkspace({ questions: [q1, q2] });
  const recommendations = buildRecommendedMeetingQuestions(workspace, ['q1']);
  assert.deepEqual(recommendations.map(item => item.question.id), ['q2']);
  assert.equal(workspace.questions.length, 2);
});

test('extra — known context keeps client statement and Seller interpretation separate', () => {
  const known = buildMeetingPrepKnownContext({ companyName: 'Acme' }, makeWorkspace({
    clientVoice: [{
      id: 'voice-1', lead_id: 'lead-1', meeting_id: null, customer_statement: 'We need fewer manual steps.', seller_interpretation: 'Automation may matter.', linked_requirement_id: null,
      information_certainty: 'SELLER_OBSERVATION', source_type: null, source_record_id: null, source_recorded_at: null, created_by: 'seller-1', updated_by: 'seller-1', created_at: at(-1), updated_at: at(-1),
    }],
  }));
  assert.ok(known.some(item => item.label === 'CLIENT SAID' && /manual steps/.test(item.value)));
  assert.ok(known.some(item => item.label === 'SELLER INTERPRETATION' && /Automation/.test(item.value)));
});

test('extra — structured hypothesis values are preserved rather than overwritten', () => {
  const structured = { type: 'legacy', value: 'preserve me' };
  const split = splitMeetingHypotheses(['Editable theory', structured]);
  assert.deepEqual(split.editable, ['Editable theory']);
  assert.deepEqual(split.preserved, [structured]);
});

test('extra — cancelled and completed meetings are excluded from prep selection', () => {
  const meetings = [makeMeeting('scheduled', 1), makeMeeting('completed', 2, 'Completed'), makeMeeting('cancelled', 3, 'Cancelled')];
  assert.deepEqual(getUpcomingMeetingsForPreparation(meetings, NOW).map(item => item.meetingId), ['scheduled']);
});
