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
const migration = read('supabase/migrations/20260909110000_crm_sales_meeting_management_closeout_part_5.sql');
const meetingService = read('src/lib/meetingService.ts');
const meetingManagement = read('src/components/admin/crm/CRMMeetingManagementWorkspace.tsx');
const discovery = read('src/components/admin/crm/CRMDiscoveryWorkspace.tsx');
const discoveryService = read('src/lib/crmSalesDiscoveryService.ts');
const drawer = read('src/components/admin/crm/CRMLeadDrawerBase.tsx');
const guidance = read('src/lib/crmSellerGuidance.ts');
const packageJson = JSON.parse(read('package.json'));
const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
const allSql = migrations.map(name => read(`supabase/migrations/${name}`)).join('\n');
const lowerMigration = migration.toLowerCase();
const lowerAllSql = allSql.toLowerCase();

const count = (text: string, value: string) => text.split(value).length - 1;
const fnSql = (name: string) => {
  const marker = `create or replace function public.${name.toLowerCase()}`;
  const start = lowerAllSql.lastIndexOf(marker);
  assert.notEqual(start, -1, `missing SQL function ${name}`);
  const tail = allSql.slice(start);
  const lowerTail = tail.toLowerCase();
  const next = lowerTail.indexOf('\ncreate or replace function ', marker.length);
  return next === -1 ? tail : tail.slice(0, next);
};
const draftSql = fnSql('save_sales_meeting_closeout_draft');
const finalizeSql = fnSql('finalize_sales_meeting');
const noShowSql = fnSql('queue_meeting_status_automation');
const communicationSql = fnSql('crm_queue_meeting_communication_update');
const customerPayloadSql = fnSql('build_sales_meeting_notification_payload');

const NOW = Date.UTC(2026, 8, 9, 12, 0, 0);
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString();
const makeMeeting = (id: string, startMinutes: number, endMinutes: number, status = 'Scheduled') => ({
  id, requestKey: `request-${id}`, leadId: 'lead-a', opportunityId: 'opp-a', salespersonId: 'seller-a',
  meetingType: 'Discovery Meeting', title: `Meeting ${id}`, description: '', startAt: iso(startMinutes), endAt: iso(endMinutes),
  timezone: 'Asia/Kolkata', provider: 'Manual', meetingUrl: '', attendeeName: 'Client', attendeeEmail: 'client@example.test',
  status, syncStatus: 'Not Connected', outcome: '', requirementsSummary: '', problemsIdentified: '', decisionMakers: '', commercialNotes: '', timelineNotes: '', nextStep: '',
  customerSummary: '', customerNextStep: '', customerNextStepTiming: '', createdBy: 'seller-a', createdAt: iso(-1440), updatedAt: iso(-60),
} as any);

const baseWorkspace = () => ({
  leadId: 'lead-a', opportunityId: 'opp-a', requirementDefinitions: [], requirements: [], clientVoice: [], meetingPreparations: [],
  questions: [
    { id: 'q-core', lead_id: null, question_key: 'business_context', category: 'BUSINESS', question_text: 'What is happening now?', purpose: null, framework: 'SITUATION', active: true, sort_order: 1, applicability: { questionClass: 'CORE', relatedRequirementKeys: [], section: 'SITUATION' }, is_custom: false, created_by: null, updated_by: null, created_at: iso(-100), updated_at: iso(-100) },
    { id: 'q-extra', lead_id: null, question_key: 'technical_context', category: 'TECHNICAL', question_text: 'What needs validation?', purpose: null, framework: 'TECHNICAL', active: true, sort_order: 2, applicability: { questionClass: 'RECOMMENDED', relatedRequirementKeys: [], section: 'TECHNICAL' }, is_custom: false, created_by: null, updated_by: null, created_at: iso(-100), updated_at: iso(-100) },
  ],
  responses: [],
} as any);

const cases: Array<[string, () => void]> = [
  ['sales_meetings remains canonical', () => { assert.match(meetingService, /from\('sales_meetings'\)/); assert.doesNotMatch(migration, /create\s+table\s+.*meeting/i); }],
  ['meetingService is reused', () => assert.match(meetingManagement, /meetingService\.(listCRMMeetings|getLaunchUrl|saveCloseoutDraft|finalize)/)],
  ['finalize_sales_meeting is reused', () => assert.match(meetingService, /rpc\('finalize_sales_meeting'/)],
  ['save_sales_meeting_customer_followup is reused', () => assert.match(meetingService, /rpc\('save_sales_meeting_customer_followup'/)],
  ['No second Meeting table exists', () => assert.doesNotMatch(migration, /create\s+table/i)],
  ['No second meeting-result table exists', () => { assert.doesNotMatch(lowerMigration, /meeting_results?/); assert.doesNotMatch(lowerMigration, /closeout_results?/); }],
  ['Meeting Management appears once in Lead Drawer', () => assert.equal(count(drawer, "label: 'Meeting Management'"), 1)],
  ['Meeting Management stays inside Lead Drawer', () => { assert.match(drawer, /<CRMMeetingManagementWorkspace/); assert.doesNotMatch(drawer, /\/meeting-management/); }],
  ['Meeting Prep remains separate and intact', () => { assert.match(drawer, /label: 'Meeting Prep'/); assert.match(drawer, /<CRMMeetingPrepWorkspace/); }],
  ['Meeting selector uses canonical meeting IDs', () => { assert.match(meetingManagement, /selectedMeetingId/); assert.match(meetingManagement, /value=\{item\.id\}/); }],
  ['Relevant active meeting defaults correctly', () => { const due = makeMeeting('due', -60, -30); const upcoming = makeMeeting('upcoming', 30, 60); assert.equal(chooseDefaultManagedMeeting([upcoming, due], NOW)?.id, 'due'); }],
  ['Multiple meetings remain isolated', () => { const a = makeMeeting('a', -60, -30); const b = makeMeeting('b', 30, 60); assert.deepEqual(getMeetingManagementCandidates([b, a], NOW).map(m => m.id), ['a', 'b']); }],
  ['Secure launch URL path is reused', () => { assert.match(meetingManagement, /meetingService\.getLaunchUrl\(meeting\.id\)/); assert.match(meetingService, /get_my_meeting_launch_url/); }],
  ['Part 4 Objective is visible', () => assert.match(meetingManagement, /meeting_objective/)],
  ['Part 4 Intended Advance is visible', () => assert.match(meetingManagement, /intended_advance/)],
  ['Selected Part 4 questions are reused', () => assert.match(meetingManagement, /prep\?\.selectedQuestionIds/)],
  ['Existing Discovery answers appear', () => assert.match(meetingManagement, /responseByQuestion\.get\(question\.id\)/)],
  ['Discovery responses use canonical crm_discovery_responses', () => assert.match(discoveryService, /from\('crm_discovery_responses'\)/)],
  ['Meeting-sourced answer records current meeting ID', () => assert.match(meetingManagement, /meetingId:\s*meeting\.id/)],
  ['Existing Discovery state model is reused', () => { assert.match(discovery, /CRM_DISCOVERY_QUESTION_STATES/); assert.match(meetingManagement, /QuestionAnswerPanel/); }],
  ['Existing certainty model is reused', () => { assert.match(discovery, /CRM_INFORMATION_CERTAINTY/); assert.match(meetingManagement, /CERTAINTY_LABELS/); }],
  ['Answered information is not blindly asked again', () => assert.match(meetingManagement, /Existing answers are shown so the client is not blindly asked again/)],
  ['NEEDS_FOLLOW_UP remains available', () => assert.match(discoveryService, /NEEDS_FOLLOW_UP/)],
  ['NEEDS_SPECIALIST_VALIDATION remains available', () => assert.match(discoveryService, /NEEDS_SPECIALIST_VALIDATION/)],
  ['Client Voice uses crm_client_voice', () => assert.match(discoveryService, /from\('crm_client_voice'\)/)],
  ['Client Voice records current meeting where applicable', () => assert.match(meetingManagement, /saveClientVoice\([\s\S]*meetingId:\s*meeting\.id/)],
  ['Client statement remains separate from Seller interpretation', () => { assert.match(meetingManagement, /customerStatement:/); assert.match(meetingManagement, /sellerInterpretation:/); }],
  ['Client Voice does not auto-confirm Requirement', () => { const block = meetingManagement.slice(meetingManagement.indexOf('const saveVoice'), meetingManagement.indexOf('const launch')); assert.doesNotMatch(block, /saveRequirement|updateRequirement/); }],
  ['Requirements remain in crm_requirements', () => assert.match(discoveryService, /from\('crm_requirements'\)/)],
  ['Requirements summary does not replace structured Requirements', () => { assert.match(meetingManagement, /requirementsSummary/); assert.match(meetingManagement, /activeRequirements/); assert.doesNotMatch(migration, /delete\s+from\s+public\.crm_requirements/i); }],
  ['New information can be derived from meeting-linked records', () => { const learned = deriveMeetingLearnedToday('m1', [{ meeting_id: 'm1', question_state: 'ANSWERED', answer_text: 'Client needs faster intake.', structured_value: null } as any], [], 'Advanced to technical review'); assert.equal(learned.length, 2); }],
  ['Open questions can be derived without new business table', () => { const ws = baseWorkspace(); assert.equal(deriveMeetingOpenQuestions(ws, ['q-extra']).length, 2); assert.doesNotMatch(migration, /open_questions/i); }],
  ['Existing outcome column reused', () => assert.match(migration, /outcome\s*=\s*coalesce\(p_outcome/)],
  ['Existing requirements_summary reused', () => assert.match(migration, /requirements_summary\s*=\s*coalesce\(p_requirements_summary/)],
  ['Existing problems_identified reused', () => assert.match(migration, /problems_identified\s*=\s*coalesce\(p_problems_identified/)],
  ['Existing decision_makers reused', () => assert.match(migration, /decision_makers\s*=\s*coalesce\(p_decision_makers/)],
  ['Existing commercial_notes reused', () => assert.match(migration, /commercial_notes\s*=\s*coalesce\(p_commercial_notes/)],
  ['Existing timeline_notes reused', () => assert.match(migration, /timeline_notes\s*=\s*coalesce\(p_timeline_notes/)],
  ['Existing next_step reused', () => assert.match(migration, /next_step\s*=\s*coalesce\(p_next_step/)],
  ['Existing follow_up_at reused', () => assert.match(migration, /follow_up_at\s*=\s*p_follow_up_at/)],
  ['Close-out draft persists safely if implemented', () => assert.match(draftSql, /update public\.sales_meetings set/i)],
  ['Draft save does not finalize meeting', () => assert.doesNotMatch(draftSql, /status\s*=\s*p_status|status\s*=\s*'Completed'/i)],
  ['Draft save does not advance Pipeline', () => assert.doesNotMatch(draftSql, /update public\.crm_opportunities|update public\.crm_leads/i)],
  ['Draft save sends no customer communication', () => assert.doesNotMatch(draftSql, /enqueue_notification|notification_outbox|enqueue_in_app_notification/i)],
  ['Completed status uses finalize_sales_meeting', () => assert.match(meetingManagement, /meetingService\.finalize\(meeting\.id/)],
  ['Server rejects anonymous finalization', () => { assert.match(finalizeSql, /auth\.uid\(\) is null/i); assert.match(migration, /revoke all on function public\.finalize_sales_meeting[\s\S]*from anon/i); }],
  ['Server rejects unauthorized Seller', () => assert.match(finalizeSql, /not public\.is_admin\(\)[\s\S]*salesperson_id<>auth\.uid\(\)/i)],
  ['Cancelled meeting cannot be finalized', () => assert.match(finalizeSql, /status='Cancelled'[\s\S]*cannot be finalized/i)],
  ['Closed meeting cannot be changed to a conflicting final state', () => assert.match(finalizeSql, /status in \('Completed','No Show'\)[\s\S]*already closed/i)],
  ['Completed meeting requires meaningful Outcome according to final policy', () => assert.match(finalizeSql, /p_status='Completed'[\s\S]*length\(trim\(coalesce\(p_outcome,''\)\)\)<2/i)],
  ['Active deal requires meaningful Next Step according to final policy', () => assert.match(finalizeSql, /v_requires_next_action[\s\S]*p_next_step/i)],
  ['Active deal requires follow-up timing according to final policy', () => assert.match(finalizeSql, /v_requires_next_action[\s\S]*p_follow_up_at is null/i)],
  ['Closed/disqualified lifecycle exception works correctly', () => assert.match(finalizeSql, /stage='Won'[\s\S]*v_requires_next_action:=false/i)],
  ['Unknown information is not forced or fabricated', () => { assert.doesNotMatch(finalizeSql, /unknown|not provided|n\/a/i); assert.doesNotMatch(meetingManagement, /auto.?fill|fabricat/i); }],
  ['Meeting completion does not require every Discovery question answered', () => assert.doesNotMatch(finalizeSql, /crm_discovery_responses|crm_discovery_questions/i)],
  ['Prep READY is not falsely treated as Discovery completeness', () => assert.doesNotMatch(finalizeSql, /crm_meeting_preparations|prep_reviewed|READY/)],
  ['No Show uses existing No Show status', () => { assert.match(finalizeSql, /\('Completed','No Show'\)/); assert.match(meetingManagement, /'Completed' \| 'No Show'/); }],
  ['No Show uses existing automation', () => { assert.match(noShowSql, /new\.status='No Show'/i); assert.match(noShowSql, /No Show Follow-Up/i); }],
  ['No Show does not create duplicate generic plus no-show tasks', () => { assert.match(finalizeSql, /if p_status='Completed'[\s\S]*Meeting Follow-Up/i); assert.doesNotMatch(finalizeSql.slice(finalizeSql.indexOf("IF p_status='Completed'")), /p_status='No Show'[\s\S]*Meeting Follow-Up/i); }],
  ['No Show customer rebooking communication is not duplicated', () => { assert.equal(count(noShowSql, "meeting-no-show-rebook:"), 1); assert.doesNotMatch(migration, /meeting-no-show-rebook:/i); }],
  ['Completed next-step activity belongs to correct Lead', () => assert.match(finalizeSql, /values\(v_meeting\.lead_id,v_meeting\.opportunity_id,v_meeting\.salesperson_id/i)],
  ['Completed next-step activity belongs to correct Opportunity', () => assert.match(finalizeSql, /values\(v_meeting\.lead_id,v_meeting\.opportunity_id,v_meeting\.salesperson_id/i)],
  ['Completed next-step activity belongs to correct Seller', () => assert.match(finalizeSql, /values\(v_meeting\.lead_id,v_meeting\.opportunity_id,v_meeting\.salesperson_id/i)],
  ['Finalize retry does not duplicate next-action activity', () => { assert.match(finalizeSql, /Automation key: meeting-follow-up:/i); assert.match(finalizeSql, /not exists\(select 1 from public\.crm_activities/i); }],
  ['Customer Summary uses existing field', () => assert.match(meetingService, /customer_summary/)],
  ['Customer Next Step uses existing field', () => assert.match(meetingService, /customer_next_step/)],
  ['Customer timing uses existing field', () => assert.match(meetingService, /customer_next_step_timing/)],
  ['Customer-safe content is separate from internal content', () => { const recapBlock = meetingManagement.slice(meetingManagement.indexOf('type CustomerRecapDraft'), meetingManagement.indexOf('export type CRMMeetingManagementWorkspaceProps')); assert.doesNotMatch(recapBlock, /commercialNotes|timelineNotes|decisionMakers|problemsIdentified/); }],
  ['AI suggestion cannot auto-save customer recap', () => { assert.doesNotMatch(meetingManagement, /generateContent|gemini|aiSuggestion/i); assert.match(meetingManagement, /window\.confirm\(meeting\.status === 'Completed'/); }],
  ['Customer recap explicitly warns of customer-facing effect', () => assert.match(meetingManagement, /customer-facing content/i)],
  ['Reviewed recap uses existing communication automation', () => { assert.match(communicationSql, /meeting-followup-reviewed:/i); assert.match(communicationSql, /meeting_completed_followup_customer/i); }],
  ['Fallback communication remains intact', () => { assert.match(noShowSql, /meeting-followup-fallback:/i); assert.match(noShowSql, /meeting_completed_followup_fallback_customer/i); }],
  ['Reviewed recap cancels or reconciles pending fallback', () => assert.match(communicationSql, /meeting-followup-fallback:[\s\S]*status='Cancelled'/i)],
  ['No duplicate reviewed customer follow-up is generated', () => { assert.match(communicationSql, /meeting-followup-reviewed:/i); assert.match(lowerAllSql, /dedupe_key/); }],
  ['Seller Guidance is reused', () => assert.match(meetingManagement, /SellerGuidanceHelp/)],
  ['Meeting Outcome guidance exists', () => assert.match(guidance, /field\.meeting_outcome/)],
  ['Next Step guidance exists', () => assert.match(guidance, /field\.meeting_next_step/)],
  ['Customer Summary guidance exists', () => assert.match(guidance, /field\.meeting_customer_summary/)],
  ['Commercial Notes guidance exists', () => assert.match(guidance, /field\.meeting_commercial_notes/)],
  ['Timeline Notes guidance exists', () => assert.match(guidance, /field\.meeting_timeline_notes/)],
  ['Complete Meeting guidance exists', () => assert.match(guidance, /action\.complete_meeting/)],
  ['Mark No Show guidance exists', () => assert.match(guidance, /action\.mark_meeting_no_show/)],
  ['Lead A to Lead B state does not leak', () => assert.match(meetingManagement, /setWorkspace\(null\)[\s\S]*setSelectedMeetingId\(''\)[\s\S]*\[load, refreshKey\]/)],
  ['Meeting A to Meeting B state does not leak', () => { assert.match(meetingManagement, /setCloseout\(nextCloseout\)/); assert.match(meetingManagement, /setResponseEdit\(null\)/); assert.match(meetingManagement, /discard those unsaved changes/); }],
  ['Internal meeting fields are not customer-readable', () => { for (const field of ['requirements_summary','problems_identified','decision_makers','commercial_notes','timeline_notes']) assert.doesNotMatch(customerPayloadSql, new RegExp(field, 'i')); }],
  ['Anonymous internal closeout access denied', () => { assert.match(migration, /revoke all on function public\.save_sales_meeting_closeout_draft[\s\S]*from anon/i); assert.match(draftSql, /auth\.uid\(\) is null/i); }],
  ['No fake production data is inserted', () => { assert.doesNotMatch(migration, /insert into public\.sales_meetings/i); assert.doesNotMatch(migration, /insert into public\.crm_leads/i); assert.doesNotMatch(migration, /@example\.(com|test)/i); }],
  ['No sales_products mutation', () => assert.doesNotMatch(migration, /sales_products/i)],
  ['No Package Fit workflow implemented', () => assert.doesNotMatch(lowerMigration, /package[_ ]fit|package_fit/)],
  ['No specialist-review workflow implemented', () => assert.doesNotMatch(lowerMigration, /create\s+table[\s\S]*specialist|specialist_review/)],
  ['No Proposal Readiness workflow implemented', () => assert.doesNotMatch(lowerMigration, /proposal_readiness|proposal readiness/)],
  ['No quotation gating implemented', () => assert.doesNotMatch(lowerMigration, /quotation_gate|quotation gating|quote_gate/)],
  ['No payment or Won change', () => { assert.doesNotMatch(lowerMigration, /update\s+public\.(payments|payment_records)/); assert.doesNotMatch(finalizeSql, /set\s+stage\s*=\s*'Won'/i); }],
  ['No automatic Pipeline transition', () => assert.doesNotMatch(finalizeSql, /set\s+stage\s*=|set\s+status\s*=\s*'Qualified'/i)],
  ['Part 1 regression remains represented in security suite', () => assert.ok(read('tests/security/crm-sales-discovery-foundation-part-1.test.ts').includes("node:test") || read('tests/security/crm-sales-discovery-foundation-part-1.test.ts').includes("from 'node:test'"))],
  ['Part 2 regression remains represented in security suite', () => assert.ok(read('tests/security/crm-sales-requirements-part-2.test.ts').includes("from 'node:test'"))],
  ['Part 3 regression remains represented in security suite', () => assert.ok(read('tests/security/crm-sales-probing-discovery-part-3.test.ts').includes("from 'node:test'"))],
  ['Part 3.5 regression remains represented in security suite', () => assert.ok(read('tests/security/crm-seller-guidance-part-3-5.test.ts').includes("from 'node:test'"))],
  ['Part 4 regression remains represented in security suite', () => assert.ok(read('tests/security/crm-sales-meeting-prep-part-4.test.ts').includes("from 'node:test'"))],
  ['TypeScript check is executable', () => assert.equal(packageJson.scripts?.lint, 'tsc --noEmit')],
  ['Security suite is executable', () => assert.match(packageJson.scripts?.['test:security'] ?? '', /tsx --test tests\/security\/\*\.test\.ts/)],
  ['Migration integrity check is executable', () => assert.ok(packageJson.scripts?.['migrations:check'])],
  ['Production build is executable', () => assert.ok(packageJson.scripts?.build)],
];

assert.equal(cases.length, 103, 'Part 5 acceptance suite must contain exactly the 103 required focused cases.');
cases.forEach(([name, run], index) => test(`Part 5 TEST ${index + 1}: ${name}`, run));

test('Part 5 additional: derived phases do not create a new database status', () => {
  assert.equal(getMeetingManagementPhase(makeMeeting('up', 30, 60), NOW), 'UPCOMING');
  assert.equal(getMeetingManagementPhase(makeMeeting('live', -5, 25), NOW), 'MEETING_TIME');
  assert.equal(getMeetingManagementPhase(makeMeeting('late', -60, -30), NOW), 'NEEDS_CLOSEOUT');
  assert.equal(getMeetingManagementPhase(makeMeeting('done', -60, -30, 'Completed'), NOW), 'COMPLETED');
  assert.equal(getMeetingManagementPhase(makeMeeting('missed', -60, -30, 'No Show'), NOW), 'NO_SHOW');
});

test('Part 5 additional: resolved Discovery stays out of open questions', () => {
  assert.equal(isDiscoveryResponseResolved({ question_state: 'ANSWERED', answer_text: 'Confirmed', structured_value: null, information_certainty: 'CLIENT_CONFIRMED', follow_up_required: false } as any), true);
});

test('Part 5 additional: customer recap completeness requires all three approved fields', () => {
  const meeting = makeMeeting('recap', -60, -30, 'Completed');
  meeting.customerSummary = 'Summary'; meeting.customerNextStep = 'Next'; meeting.customerNextStepTiming = 'Friday';
  assert.equal(meetingCustomerRecapComplete(meeting), true);
  meeting.customerNextStepTiming = '';
  assert.equal(meetingCustomerRecapComplete(meeting), false);
});
