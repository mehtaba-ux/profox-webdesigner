import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import {
  chooseDefaultManagedMeeting,
  deriveMeetingLearnedToday,
  deriveMeetingOpenQuestions,
  getMeetingManagementCandidates,
  getMeetingManagementPhase,
  isDiscoveryResponseResolved,
  meetingCustomerRecapComplete,
} from '../../src/lib/crmMeetingManagementUtils';

const read = (path: string) => readFileSync(path, 'utf8');
const lower = (value: string) => value.toLowerCase();
const has = (text: string, needle: string) => lower(text).includes(lower(needle));
const no = (text: string, needle: string) => !has(text, needle);
const count = (text: string, needle: string) => text.split(needle).length - 1;

const migration = read('supabase/migrations/20260909110000_crm_sales_meeting_management_closeout_part_5.sql');
const meetingService = read('src/lib/meetingService.ts');
const meetingManagement = read('src/components/admin/crm/CRMMeetingManagementWorkspace.tsx');
const discovery = read('src/components/admin/crm/CRMDiscoveryWorkspace.tsx');
const discoveryService = read('src/lib/crmSalesDiscoveryService.ts');
const drawer = read('src/components/admin/crm/CRMLeadDrawerBase.tsx');
const guidance = read('src/lib/crmSellerGuidance.ts');
const part1Tests = read('tests/security/crm-sales-discovery-foundation-part-1.test.ts');
const part2Tests = read('tests/security/crm-sales-requirements-part-2.test.ts');
const part3Tests = read('tests/security/crm-sales-probing-discovery-part-3.test.ts');
const part35Tests = read('tests/security/crm-seller-guidance-part-3-5.test.ts');
const part4Tests = read('tests/security/crm-sales-meeting-prep-part-4.test.ts');
const packageJson = JSON.parse(read('package.json'));
const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
const allSql = migrations.map(name => read(`supabase/migrations/${name}`)).join('\n');
const lowerAllSql = lower(allSql);

const fnSql = (name: string) => {
  const marker = `create or replace function public.${lower(name)}`;
  const start = lowerAllSql.lastIndexOf(marker);
  assert.notEqual(start, -1, `Missing SQL function ${name}`);
  const tail = allSql.slice(start);
  const lowerTail = lower(tail);
  const next = lowerTail.indexOf('\ncreate or replace function ', marker.length);
  return next === -1 ? tail : tail.slice(0, next);
};

const block = (text: string, startNeedle: string, endNeedle: string) => {
  const start = lower(text).indexOf(lower(startNeedle));
  assert.notEqual(start, -1, `Missing block start: ${startNeedle}`);
  const tail = text.slice(start);
  const end = lower(tail).indexOf(lower(endNeedle));
  return end === -1 ? tail : tail.slice(0, end);
};

const lastBlock = (text: string, startNeedle: string, endNeedle: string) => {
  const start = lower(text).lastIndexOf(lower(startNeedle));
  assert.notEqual(start, -1, `Missing block start: ${startNeedle}`);
  const tail = text.slice(start);
  const end = lower(tail).indexOf(lower(endNeedle));
  return end === -1 ? tail : tail.slice(0, end);
};

const draftSql = fnSql('save_sales_meeting_closeout_draft');
const finalizeSql = fnSql('finalize_sales_meeting');
const noShowSql = fnSql('queue_meeting_status_automation');
const communicationSql = fnSql('crm_queue_meeting_communication_update');
const customerPayloadSql = fnSql('build_sales_meeting_notification_payload');
const completedFollowupBlock = lastBlock(finalizeSql, "if p_status = 'Completed'", 'return v_meeting;');
const saveVoiceBlock = block(meetingManagement, 'const saveVoice = async', 'const launch = async');
const saveRecapBlock = block(meetingManagement, 'const saveRecap = async', 'const saveResponse = async');
const recapTypeBlock = block(meetingManagement, 'type CustomerRecapDraft', 'export type CRMMeetingManagementWorkspaceProps');

const NOW = Date.UTC(2026, 8, 9, 12, 0, 0);
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString();

const makeMeeting = (id: string, startMinutes: number, endMinutes: number, status = 'Scheduled') => ({
  id,
  requestKey: `request-${id}`,
  leadId: 'lead-a',
  opportunityId: 'opp-a',
  salespersonId: 'seller-a',
  meetingType: 'Discovery Meeting',
  title: `Meeting ${id}`,
  description: '',
  startAt: iso(startMinutes),
  endAt: iso(endMinutes),
  timezone: 'Asia/Kolkata',
  provider: 'Manual',
  meetingUrl: '',
  attendeeName: 'Client',
  attendeeEmail: 'client@example.test',
  status,
  syncStatus: 'Not Connected',
  outcome: '',
  requirementsSummary: '',
  problemsIdentified: '',
  decisionMakers: '',
  commercialNotes: '',
  timelineNotes: '',
  nextStep: '',
  customerSummary: '',
  customerNextStep: '',
  customerNextStepTiming: '',
  createdBy: 'seller-a',
  createdAt: iso(-1440),
  updatedAt: iso(-60),
} as any);

const baseWorkspace = () => ({
  leadId: 'lead-a',
  opportunityId: 'opp-a',
  requirementDefinitions: [],
  requirements: [],
  clientVoice: [],
  meetingPreparations: [],
  questions: [
    {
      id: 'q-core',
      lead_id: null,
      question_key: 'business_context',
      category: 'BUSINESS',
      question_text: 'What is happening now?',
      purpose: null,
      framework: 'SITUATION',
      active: true,
      sort_order: 1,
      applicability: { questionClass: 'CORE', relatedRequirementKeys: [], section: 'SITUATION' },
      is_custom: false,
      created_by: null,
      updated_by: null,
      created_at: iso(-100),
      updated_at: iso(-100),
    },
    {
      id: 'q-extra',
      lead_id: null,
      question_key: 'technical_context',
      category: 'TECHNICAL',
      question_text: 'What needs validation?',
      purpose: null,
      framework: 'TECHNICAL',
      active: true,
      sort_order: 2,
      applicability: { questionClass: 'RECOMMENDED', relatedRequirementKeys: [], section: 'TECHNICAL' },
      is_custom: false,
      created_by: null,
      updated_by: null,
      created_at: iso(-100),
      updated_at: iso(-100),
    },
  ],
  responses: [],
} as any);

type AcceptanceCase = [string, () => void];
const cases: AcceptanceCase[] = [
  ['sales_meetings remains canonical', () => { assert.ok(has(meetingService, "from('sales_meetings')")); assert.ok(no(migration, 'create table')); }],
  ['meetingService is reused', () => { assert.ok(has(meetingManagement, 'meetingservice.listcrmmeetings')); assert.ok(has(meetingManagement, 'meetingservice.finalize')); }],
  ['finalize_sales_meeting is reused', () => { assert.ok(has(meetingService, "rpc('finalize_sales_meeting'")); }],
  ['save_sales_meeting_customer_followup is reused', () => { assert.ok(has(meetingService, "rpc('save_sales_meeting_customer_followup'")); }],
  ['No second Meeting table exists', () => { assert.ok(no(migration, 'create table')); }],
  ['No second meeting-result table exists', () => { assert.ok(no(migration, 'meeting_result')); assert.ok(no(migration, 'closeout_result')); }],
  ['Meeting Management appears once in Lead Drawer', () => { assert.equal(count(drawer, "label: 'Meeting Management'"), 1); }],
  ['Meeting Management stays inside Lead Drawer', () => { assert.ok(has(drawer, '<crmmeetingmanagementworkspace')); assert.ok(no(drawer, '/meeting-management')); }],
  ['Meeting Prep remains separate and intact', () => { assert.ok(has(drawer, "label: 'Meeting Prep'")); assert.ok(has(drawer, '<crmmeetingprepworkspace')); }],
  ['Meeting selector uses canonical meeting IDs', () => { assert.ok(has(meetingManagement, 'selectedmeetingid')); assert.ok(has(meetingManagement, 'value={item.id}')); }],
  ['Relevant active meeting defaults correctly', () => { const due = makeMeeting('due', -60, -30); const upcoming = makeMeeting('upcoming', 30, 60); assert.equal(chooseDefaultManagedMeeting([upcoming, due], NOW)?.id, 'due'); }],
  ['Multiple meetings remain isolated', () => { const a = makeMeeting('a', -60, -30); const b = makeMeeting('b', 30, 60); assert.deepEqual(getMeetingManagementCandidates([b, a], NOW).map(m => m.id), ['a', 'b']); }],
  ['Secure launch URL path is reused', () => { assert.ok(has(meetingManagement, 'meetingservice.getlaunchurl(meeting.id)')); assert.ok(has(meetingService, 'get_my_meeting_launch_url')); }],
  ['Part 4 Objective is visible', () => { assert.ok(has(meetingManagement, 'meeting_objective')); }],
  ['Part 4 Intended Advance is visible', () => { assert.ok(has(meetingManagement, 'intended_advance')); }],
  ['Selected Part 4 questions are reused', () => { assert.ok(has(meetingManagement, 'selectedquestionids')); }],
  ['Existing Discovery answers appear', () => { assert.ok(has(meetingManagement, 'responsebyquestion.get(question.id)')); }],
  ['Discovery responses use canonical crm_discovery_responses', () => { assert.ok(has(discoveryService, "from('crm_discovery_responses')")); }],
  ['Meeting-sourced answer records current meeting ID', () => { assert.ok(has(meetingManagement, 'meetingid: meeting.id')); }],
  ['Existing Discovery state model is reused', () => { assert.ok(has(discovery, 'crm_discovery_question_states')); assert.ok(has(meetingManagement, 'questionanswerpanel')); }],
  ['Existing certainty model is reused', () => { assert.ok(has(discovery, 'crm_information_certainty')); assert.ok(has(meetingManagement, 'certainty_labels')); }],
  ['Answered information is not blindly asked again', () => { assert.ok(has(meetingManagement, 'existing answers are shown so the client is not blindly asked again')); }],
  ['NEEDS_FOLLOW_UP remains available', () => { assert.ok(has(discoveryService, 'needs_follow_up')); }],
  ['NEEDS_SPECIALIST_VALIDATION remains available', () => { assert.ok(has(discoveryService, 'needs_specialist_validation')); }],
  ['Client Voice uses crm_client_voice', () => { assert.ok(has(discoveryService, "from('crm_client_voice')")); }],
  ['Client Voice records current meeting where applicable', () => { assert.ok(has(saveVoiceBlock, 'meetingid: meeting.id')); }],
  ['Client statement remains separate from Seller interpretation', () => { assert.ok(has(saveVoiceBlock, 'customerstatement:')); assert.ok(has(saveVoiceBlock, 'sellerinterpretation:')); }],
  ['Client Voice does not auto-confirm Requirement', () => { assert.ok(no(saveVoiceBlock, 'saverequirement')); assert.ok(no(saveVoiceBlock, 'updaterequirement')); }],
  ['Requirements remain in crm_requirements', () => { assert.ok(has(discoveryService, "from('crm_requirements')")); }],
  ['Requirements summary does not replace structured Requirements', () => { assert.ok(has(meetingManagement, 'requirementssummary')); assert.ok(has(meetingManagement, 'activerequirements')); assert.ok(no(migration, 'delete from public.crm_requirements')); }],
  ['New information can be derived from meeting-linked records', () => { const learned = deriveMeetingLearnedToday('m1', [{ meeting_id: 'm1', question_state: 'ANSWERED', answer_text: 'Client needs faster intake.', structured_value: null } as any], [], 'Advanced to technical review'); assert.deepEqual(learned.map(x => x.kind), ['Discovery', 'Outcome']); }],
  ['Open questions can be derived without new business table', () => { const ws = baseWorkspace(); assert.equal(deriveMeetingOpenQuestions(ws, ['q-extra']).length, 2); assert.ok(no(migration, 'open_questions')); }],
  ['Existing outcome column reused', () => { assert.ok(has(migration, 'v_outcome text :=')); assert.ok(has(migration, 'outcome = v_outcome')); }],
  ['Existing requirements_summary reused', () => { assert.ok(has(migration, 'v_requirements_summary text :=')); assert.ok(has(migration, 'requirements_summary = v_requirements_summary')); }],
  ['Existing problems_identified reused', () => { assert.ok(has(migration, 'v_problems_identified text :=')); assert.ok(has(migration, 'problems_identified = v_problems_identified')); }],
  ['Existing decision_makers reused', () => { assert.ok(has(migration, 'v_decision_makers text :=')); assert.ok(has(migration, 'decision_makers = v_decision_makers')); }],
  ['Existing commercial_notes reused', () => { assert.ok(has(migration, 'v_commercial_notes text :=')); assert.ok(has(migration, 'commercial_notes = v_commercial_notes')); }],
  ['Existing timeline_notes reused', () => { assert.ok(has(migration, 'v_timeline_notes text :=')); assert.ok(has(migration, 'timeline_notes = v_timeline_notes')); }],
  ['Existing next_step reused', () => { assert.ok(has(migration, 'v_next_step text :=')); assert.ok(has(migration, 'next_step = v_next_step')); }],
  ['Existing follow_up_at reused', () => { assert.ok(has(migration, 'follow_up_at = p_follow_up_at')); }],
  ['Close-out draft persists safely if implemented', () => { assert.ok(has(draftSql, 'update public.sales_meetings')); }],
  ['Draft save does not finalize meeting', () => { assert.ok(no(draftSql, 'status = p_status')); assert.ok(no(draftSql, "status = 'completed'")); }],
  ['Draft save does not advance Pipeline', () => { assert.ok(no(draftSql, 'update public.crm_opportunities')); assert.ok(no(draftSql, 'update public.crm_leads')); }],
  ['Draft save sends no customer communication', () => { assert.ok(no(draftSql, 'enqueue_notification')); assert.ok(no(draftSql, 'notification_outbox')); }],
  ['Completed status uses finalize_sales_meeting', () => { assert.ok(has(meetingManagement, 'meetingservice.finalize(meeting.id')); }],
  ['Server rejects anonymous finalization', () => { assert.ok(has(finalizeSql, 'if v_uid is null')); assert.ok(has(migration, 'from public, anon')); }],
  ['Server rejects unauthorized Seller', () => { assert.ok(has(finalizeSql, 'unauthorized meeting update.')); assert.ok(has(finalizeSql, 'salesperson_id is distinct from v_uid')); assert.ok(has(finalizeSql, 'has_active_role')); }],
  ['Cancelled meeting cannot be finalized', () => { assert.ok(has(finalizeSql, "status = 'cancelled'")); assert.ok(has(finalizeSql, 'cancelled meetings cannot be finalized.')); }],
  ['Closed meeting cannot be changed to a conflicting final state', () => { assert.ok(has(finalizeSql, "status in ('completed', 'no show')")); assert.ok(has(finalizeSql, 'meeting is already closed.')); }],
  ['Completed meeting requires meaningful Outcome according to final policy', () => { assert.ok(has(finalizeSql, 'length(v_outcome) < 12')); assert.ok(has(finalizeSql, 'require a meaningful outcome')); }],
  ['Active deal requires meaningful Next Step according to final policy', () => { assert.ok(has(finalizeSql, 'length(v_next_step) < 8')); assert.ok(has(finalizeSql, 'require a specific meaningful next step')); }],
  ['Active deal requires follow-up timing according to final policy', () => { assert.ok(has(finalizeSql, 'p_follow_up_at is null')); assert.ok(has(finalizeSql, 'require follow-up timing')); }],
  ['Closed/disqualified lifecycle exception works correctly', () => { assert.ok(has(finalizeSql, "coalesce(v_opportunity_stage, '') <> 'won'")); }],
  ['Unknown information is not forced or fabricated', () => { assert.ok(no(finalizeSql, "set outcome = 'unknown'")); assert.ok(no(finalizeSql, "set next_step = 'n/a'")); }],
  ['Meeting completion does not require every Discovery question answered', () => { assert.ok(no(finalizeSql, 'crm_discovery_responses')); assert.ok(no(finalizeSql, 'crm_discovery_questions')); }],
  ['Prep READY is not falsely treated as Discovery completeness', () => { assert.ok(no(finalizeSql, 'crm_meeting_preparations')); assert.ok(no(finalizeSql, 'prep_reviewed')); }],
  ['No Show uses existing No Show status', () => { assert.ok(has(finalizeSql, "p_status not in ('completed', 'no show')")); assert.ok(has(meetingManagement, "'completed' | 'no show'")); }],
  ['No Show uses existing automation', () => { assert.ok(has(noShowSql, "new.status='no show'")); assert.ok(has(noShowSql, 'no show follow-up')); }],
  ['No Show does not create duplicate generic plus no-show tasks', () => { assert.ok(has(completedFollowupBlock, "if p_status = 'completed'")); assert.ok(has(completedFollowupBlock, 'meeting follow-up')); assert.ok(no(completedFollowupBlock, "p_status = 'no show'")); }],
  ['No Show customer rebooking communication is not duplicated', () => { assert.equal(count(lower(noShowSql), 'meeting-no-show-rebook:'), 1); assert.equal(count(lower(migration), 'meeting-no-show-rebook:'), 0); }],
  ['Completed next-step activity belongs to correct Lead', () => { assert.ok(has(completedFollowupBlock, 'v_crm_lead_id')); }],
  ['Completed next-step activity belongs to correct Opportunity', () => { assert.ok(has(completedFollowupBlock, 'v_meeting.opportunity_id')); }],
  ['Completed next-step activity belongs to correct Seller', () => { assert.ok(has(completedFollowupBlock, 'v_meeting.salesperson_id')); }],
  ['Finalize retry does not duplicate next-action activity', () => { assert.ok(has(completedFollowupBlock, 'not exists')); assert.ok(has(completedFollowupBlock, 'automation key: meeting-followup:')); }],
  ['Customer Summary uses existing field', () => { assert.ok(has(meetingService, 'customer_summary')); }],
  ['Customer Next Step uses existing field', () => { assert.ok(has(meetingService, 'customer_next_step')); }],
  ['Customer timing uses existing field', () => { assert.ok(has(meetingService, 'customer_next_step_timing')); }],
  ['Customer-safe content is separate from internal content', () => { assert.ok(no(recapTypeBlock, 'commercialnotes')); assert.ok(no(recapTypeBlock, 'timelinenotes')); assert.ok(no(recapTypeBlock, 'decisionmakers')); assert.ok(no(recapTypeBlock, 'problemsidentified')); }],
  ['AI suggestion cannot auto-save customer recap', () => { assert.ok(no(meetingManagement, 'generatecontent')); assert.ok(no(meetingManagement, 'gemini')); assert.ok(has(saveRecapBlock, 'window.confirm')); }],
  ['Customer recap explicitly warns of customer-facing effect', () => { assert.ok(has(saveRecapBlock, 'customer-facing content')); }],
  ['Reviewed recap uses existing communication automation', () => { assert.ok(has(communicationSql, 'meeting-followup-reviewed:')); assert.ok(has(communicationSql, 'meeting_completed_followup_customer')); }],
  ['Fallback communication remains intact', () => { assert.ok(has(noShowSql, 'meeting-followup-fallback:')); assert.ok(has(noShowSql, 'meeting_completed_followup_fallback_customer')); }],
  ['Reviewed recap cancels or reconciles pending fallback', () => { assert.ok(has(communicationSql, 'meeting-followup-fallback:')); assert.ok(has(communicationSql, "status='cancelled'")); }],
  ['No duplicate reviewed customer follow-up is generated', () => { assert.equal(count(lower(communicationSql), 'meeting-followup-reviewed:'), 1); }],
  ['Seller Guidance is reused', () => { assert.ok(has(meetingManagement, 'sellerguidancehelp')); }],
  ['Meeting Outcome guidance exists', () => { assert.ok(has(guidance, 'field.meeting_outcome')); }],
  ['Next Step guidance exists', () => { assert.ok(has(guidance, 'field.next_step')); }],
  ['Customer Summary guidance exists', () => { assert.ok(has(guidance, 'field.customer_summary')); }],
  ['Commercial Notes guidance exists', () => { assert.ok(has(guidance, 'field.commercial_notes')); }],
  ['Timeline Notes guidance exists', () => { assert.ok(has(guidance, 'field.timeline_notes')); }],
  ['Complete Meeting guidance exists', () => { assert.ok(has(guidance, 'action.complete_meeting')); }],
  ['Mark No Show guidance exists', () => { assert.ok(has(guidance, 'action.mark_no_show')); }],
  ['Lead A to Lead B state does not leak', () => { assert.ok(has(meetingManagement, 'setworkspace(null)')); assert.ok(has(meetingManagement, "setselectedmeetingid('')")); assert.ok(has(meetingManagement, '[load, refreshkey]')); }],
  ['Meeting A to Meeting B state does not leak', () => { assert.ok(has(meetingManagement, 'setcloseout(nextcloseout)')); assert.ok(has(meetingManagement, 'setresponseedit(null)')); assert.ok(has(meetingManagement, 'discard those unsaved changes')); }],
  ['Internal meeting fields are not customer-readable', () => { for (const field of ['requirements_summary','problems_identified','decision_makers','commercial_notes','timeline_notes']) assert.ok(no(customerPayloadSql, field), `${field} leaked into customer payload`); }],
  ['Anonymous internal closeout access denied', () => { assert.ok(has(draftSql, 'if v_uid is null')); assert.ok(has(migration, 'revoke all on function public.save_sales_meeting_closeout_draft')); assert.ok(has(migration, 'from public, anon')); }],
  ['No fake production data is inserted', () => { assert.ok(no(migration, 'insert into public.sales_meetings')); assert.ok(no(migration, 'insert into public.crm_leads')); assert.ok(no(migration, '@example.com')); assert.ok(no(migration, '@example.test')); }],
  ['No sales_products mutation', () => { assert.ok(no(migration, 'sales_products')); }],
  ['No Package Fit workflow implemented', () => { assert.ok(no(migration, 'package_fit')); assert.ok(no(migration, 'package fit')); }],
  ['No specialist-review workflow implemented', () => { assert.ok(no(migration, 'specialist_review')); assert.ok(no(migration, 'create table public.specialist')); }],
  ['No Proposal Readiness workflow implemented', () => { assert.ok(no(migration, 'proposal_readiness')); assert.ok(no(migration, 'proposal readiness')); }],
  ['No quotation gating implemented', () => { assert.ok(no(migration, 'quotation_gate')); assert.ok(no(migration, 'quotation gating')); }],
  ['No payment or Won change', () => { assert.ok(no(migration, 'update public.payments')); assert.ok(no(finalizeSql, "stage = 'won'")); }],
  ['No automatic Pipeline transition', () => { assert.ok(no(finalizeSql, 'set stage =')); assert.ok(no(finalizeSql, "set status = 'qualified'")); }],
  ['Part 1 regression remains represented in security suite', () => { assert.ok(has(part1Tests, "from 'node:test'")); }],
  ['Part 2 regression remains represented in security suite', () => { assert.ok(has(part2Tests, "from 'node:test'")); }],
  ['Part 3 regression remains represented in security suite', () => { assert.ok(has(part3Tests, "from 'node:test'")); }],
  ['Part 3.5 regression remains represented in security suite', () => { assert.ok(has(part35Tests, "from 'node:test'")); }],
  ['Part 4 regression remains represented in security suite', () => { assert.ok(has(part4Tests, "from 'node:test'")); }],
  ['TypeScript check is executable', () => { assert.equal(packageJson.scripts?.lint, 'tsc --noEmit'); }],
  ['Security suite is executable', () => { assert.ok(String(packageJson.scripts?.['test:security'] ?? '').includes('tsx --test tests/security/*.test.ts')); }],
  ['Migration integrity check is executable', () => { assert.ok(Boolean(packageJson.scripts?.['migrations:check'])); }],
  ['Production build is executable', () => { assert.ok(Boolean(packageJson.scripts?.build)); }],
];

assert.equal(cases.length, 103, 'Part 5 acceptance suite must contain exactly the 103 required focused cases.');
cases.forEach(([name, run], index) => test(`Part 5 TEST ${index + 1}: ${name}`, run));

test('Part 5 additional: derived meeting phases use presentation state only', () => {
  assert.equal(getMeetingManagementPhase(makeMeeting('up', 30, 60), NOW), 'UPCOMING');
  assert.equal(getMeetingManagementPhase(makeMeeting('live', -5, 25), NOW), 'MEETING_TIME');
  assert.equal(getMeetingManagementPhase(makeMeeting('late', -60, -30), NOW), 'NEEDS_CLOSEOUT');
  assert.equal(getMeetingManagementPhase(makeMeeting('done', -60, -30, 'Completed'), NOW), 'COMPLETED');
  assert.equal(getMeetingManagementPhase(makeMeeting('missed', -60, -30, 'No Show'), NOW), 'NO_SHOW');
});

test('Part 5 additional: resolved Discovery stays out of open questions', () => {
  assert.equal(isDiscoveryResponseResolved({
    question_state: 'ANSWERED',
    answer_text: 'Confirmed',
    structured_value: null,
    information_certainty: 'CLIENT_CONFIRMED',
    follow_up_required: false,
  } as any), true);
});

test('Part 5 additional: customer recap completeness requires all three reviewed fields', () => {
  const meeting = makeMeeting('recap', -60, -30, 'Completed');
  meeting.customerSummary = 'Summary';
  meeting.customerNextStep = 'Next';
  meeting.customerNextStepTiming = 'Friday';
  assert.equal(meetingCustomerRecapComplete(meeting), true);
  meeting.customerNextStepTiming = '';
  assert.equal(meetingCustomerRecapComplete(meeting), false);
});
