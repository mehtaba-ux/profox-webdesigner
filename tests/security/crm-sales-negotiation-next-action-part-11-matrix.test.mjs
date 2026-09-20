import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260920123000_crm_sales_negotiation_next_action_part_11.sql', 'utf8');
const pipeline = await readFile('src/components/admin/CRMPipeline.tsx', 'utf8');
const activityCenter = await readFile('src/components/admin/CRMActivitiesExecutionCenter.tsx', 'utf8');
const service = await readFile('src/lib/crmService.ts', 'utf8');
const activityService = await readFile('src/lib/crmActivityExecutionService.ts', 'utf8');
const guidance = await readFile('src/lib/crmSellerGuidance.ts', 'utf8');
const sellerHelp = await readFile('src/components/admin/crm/SellerGuidanceHelp.tsx', 'utf8');
const packageJson = await readFile('package.json', 'utf8');

const migrationFiles = (await readdir('supabase/migrations', { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
  .map(entry => entry.name)
  .sort();
const migrationCorpus = (await Promise.all(
  migrationFiles.map(name => readFile(`supabase/migrations/${name}`, 'utf8')),
)).join('\n');

function latestFunction(corpus, name) {
  const token = `create or replace function public.${name}`;
  const start = corpus.toLowerCase().lastIndexOf(token.toLowerCase());
  if (start < 0) return '';
  const end = corpus.indexOf('\n$$;', start);
  return end < 0 ? corpus.slice(start) : corpus.slice(start, end + 4);
}

const transition = latestFunction(migration, 'crm_transition_opportunity');
const completeActivity = latestFunction(migrationCorpus, 'crm_complete_activity');
const canManageActivity = latestFunction(migrationCorpus, 'crm_can_manage_activity');
const negotiationPanelStart = pipeline.indexOf('Decision &amp; Next Action');
const negotiationPanelEnd = pipeline.indexOf('Pipeline controls', negotiationPanelStart);
const negotiationPanel = negotiationPanelStart >= 0 && negotiationPanelEnd > negotiationPanelStart
  ? pipeline.slice(negotiationPanelStart, negotiationPanelEnd)
  : '';

const cases = [
  ['01 allowed transition comes from canonical config', () => /crm_pipeline_settings/.test(transition) && /allowedNext/.test(transition) && /allowedPrevious/.test(transition)],
  ['02 cannot enter Negotiation without decision state', () => /decision_status is null/.test(transition) && /Record the current customer decision status/.test(transition)],
  ['03 cannot enter Negotiation without next action', () => /Schedule the next customer action and assign an owner/.test(transition)],
  ['04 Scheduled action must belong to same opportunity', () => /a\.opportunity_id=v_opp\.id/.test(transition)],
  ['05 unrelated Lead activity does not satisfy hard gate', () => !/a\.lead_id=v_opp\.lead_id[\s\S]{0,300}a\.status='Scheduled'/.test(transition)],
  ['06 Completed activity does not satisfy gate', () => /a\.status='Scheduled'/.test(transition) && !/a\.status in \('Scheduled','Completed'\)/.test(transition)],
  ['07 Cancelled activity does not satisfy gate', () => /a\.status='Scheduled'/.test(transition) && !/a\.status in \('Scheduled','Cancelled'\)/.test(transition)],
  ['08 unassigned action does not satisfy gate', () => /v_next\.assigned_to is null/.test(transition) && /Assign an owner/.test(transition)],
  ['09 action due date is structurally required', () => /due_at\s+(?:timestamptz|timestamp with time zone)\s+not null/i.test(migrationCorpus)],
  ['10 overdue action does not satisfy entry gate', () => /v_next\.due_at<=now\(\)/.test(transition) && /current next action is overdue/i.test(transition)],
  ['11 valid future Scheduled opportunity action is accepted by next-action rule', () => /a\.status='Scheduled'/.test(transition) && /if v_next\.due_at<=now\(\)/.test(transition)],
  ['12 awaiting-client state is permitted without invented objection', () => /AWAITING_CLIENT_RESPONSE/.test(migration) && !/AWAITING_CLIENT_RESPONSE[^;]{0,240}primary_objection_category is null/.test(migration)],
  ['13 objection category is required only for objection status', () => /decision_status='QUESTIONS_OR_OBJECTIONS'[\s\S]{0,160}primary_objection_category is null/.test(migration)],
  ['14 silence is not categorized as PRICE or BUDGET', () => /Silence means awaiting response, not automatically Price, Budget/.test(guidance)],
  ['15 external waiting still requires follow-up action', () => /Waiting on the customer still requires a scheduled re-check\/follow-up date/.test(guidance) && /Schedule the next customer action/.test(transition)],
  ['16 stage transition remains server authoritative', () => /crm_transition_opportunity/.test(service) && /await crmService\.transitionOpportunity/.test(pipeline)],
  ['17 frontend cannot bypass transition RPC', () => /supabase\.rpc\('crm_transition_opportunity'/.test(service) && !/from\('crm_opportunities'\)\.update\([^)]*stage/.test(service)],
  ['18 backward transition into Negotiation is evaluated', () => /allowBackward/.test(transition) && /p_target_stage='Negotiation \/ Decision Pending'/.test(transition)],
  ['19 Accepted quotation remains authority for Awaiting Advance Payment', () => /p_target_stage='Awaiting Advance Payment'/.test(transition) && /q\.status='Accepted'/.test(transition) && /q\.accepted_at is not null/.test(transition)],
  ['20 Won/payment behavior remains unchanged', () => /Won is controlled by Admin payment verification/.test(transition) && /payment_type in \('Advance','Full Payment'\)/.test(transition)],

  ['21 activity completion derives completed timestamp server-side', () => /completed_at=now\(\)/.test(completeActivity)],
  ['22 outcome timestamp is server-derived', () => /outcome_recorded_at=case when[\s\S]*then now\(\)/.test(completeActivity)],
  ['23 reschedule preserves original due date', () => /original_due_at=coalesce\(original_due_at,due_at\)/.test(migration)],
  ['24 reschedule increments reschedule count', () => /reschedule_count=reschedule_count\+1/.test(migration)],
  ['25 reschedule records authenticated actor', () => /last_rescheduled_by=\(select auth\.uid\(\)\)/.test(migration)],
  ['26 Negotiation reschedule requires reason', () => /A real reschedule reason is required for Negotiation next actions/.test(migration) && /required=\{reasonRequired\}/.test(activityCenter)],
  ['27 Negotiation cancellation requires reason', () => /A real cancellation reason is required for Negotiation next actions/.test(migration) && /Cancellation reason/.test(activityCenter)],
  ['28 overdue activity remains visible', () => /OVERDUE/.test(pipeline) && /nextActivity\.overdue/.test(pipeline)],
  ['29 completion does not automatically change opportunity stage', () => completeActivity.length > 0 && !/crm_transition_opportunity|stage\s*=/.test(completeActivity)],
  ['30 cancellation cannot silently leave active Negotiation without warning', () => /Schedule a replacement opportunity-linked action before cancelling/.test(migration) && /must keep a scheduled opportunity-linked next action/.test(activityCenter)],
  ['31 next-action selection is deterministic', () => /order by a\.due_at, a\.created_at, a\.id/.test(migration)],
  ['32 opportunity-linked action outranks unrelated Lead activity', () => /where a\.opportunity_id=o\.id and a\.status='Scheduled'/.test(migration)],
  ['33 cross-opportunity mutation/reference is rejected', () => /You may link activities only to your assigned opportunity/.test(migration)],
  ['34 cross-Lead reference is rejected', () => /Activity lead must match the linked opportunity/.test(migration)],
  ['35 unauthorized Seller is rejected', () => /salesperson_id is distinct from v_uid/.test(migration) && /assigned opportunity/.test(migration)],
  ['36 Admin existing activity authority is preserved', () => /public\.is_admin\(\)/.test(canManageActivity)],

  ['37 decision state is structured and queryable', () => /add column if not exists decision_status text/.test(migration) && /crm_opportunities_decision_status_check/.test(migration)],
  ['38 decision mutation is audited', () => /negotiation_decision_state_changed/.test(migration) && /crm_write_lead_event/.test(migration)],
  ['39 browser cannot forge decision actor/time', () => /decision_recorded_at=now\(\)/.test(migration) && /decision_recorded_by=v_uid/.test(migration) && /crm_protect_part11_negotiation_fields/.test(migration)],
  ['40 commercial exception does not auto-approve', () => /Commercial exceptions are not approved here/.test(pipeline) && !/crm_negotiation_approvals/.test(migration)],
  ['41 existing Sales Validation remains authoritative', () => /existing Sales Validation/.test(pipeline) && /Open CRM commercial review/.test(pipeline)],
  ['42 quotation approval remains authoritative for quote-specific approval', () => /quotation approval\/revision workflow/.test(pipeline) && /\/admin\/quotation-approvals/.test(pipeline)],
  ['43 revised quotation still uses canonical quotation workflow', () => /Open quotation/.test(pipeline) && /Part 10B protects every revised Send/.test(pipeline)],
  ['44 Part 10A remains in regression authority', () => /test:crm-part10a/.test(packageJson)],
  ['45 Part 10B gate remains active true', () => /finalQuotationSendGateActive/.test(migration) && /is distinct from true/.test(migration)],
  ['46 Part 10B Send invariant is not reimplemented or weakened', () => /test:crm-part10b/.test(packageJson) && !/create or replace function public\.send_quotation_professional/.test(migration)],
  ['47 no force-send route introduced', () => !/Force send|force_send|skip.*send/i.test(pipeline + migration)],
  ['48 no duplicate approval table introduced', () => !/create table[^;]*(negotiation.*approval|approval.*negotiation)/i.test(migration)],

  ['49 Negotiation panel mounts only in appropriate context', () => /\['Quotation Sent','Negotiation \/ Decision Pending'\]\.includes\(opportunity\.stage\)/.test(pipeline)],
  ['50 next action clearly displays owner date and status', () => /Owner: \{opportunity\.nextActivity\.ownerName/.test(pipeline) && /Due ·/.test(pipeline) && /Current next action/.test(pipeline)],
  ['51 overdue state has text not color alone', () => /OVERDUE/.test(negotiationPanel)],
  ['52 keyboard navigation uses native controls and guidance dialog traps Tab', () => /<select/.test(negotiationPanel) && /<button/.test(negotiationPanel) && /event\.key === 'Tab'/.test(sellerHelp)],
  ['53 visible focus state is retained', () => /focus-visible:outline/.test(sellerHelp) && !/outline-none/.test(negotiationPanel)],
  ['54 validation errors are associated with Part 11 fields', () => /id="pipeline-operation-error" role="alert"/.test(pipeline) && /aria-describedby=\{error \? 'pipeline-operation-error'/.test(negotiationPanel)],
  ['55 mobile layout remains single-column usable', () => /flex flex-col/.test(negotiationPanel) && /w-full/.test(negotiationPanel)],
  ['56 tablet layout has responsive Part 11 grids', () => /sm:grid-cols-2/.test(negotiationPanel)],
  ['57 desktop operational density remains bounded', () => /sm:grid-cols-\[1fr_210px_auto\]/.test(negotiationPanel) && /max-w-2xl/.test(pipeline)],
  ['58 Part 11 panel introduces no animation that can ignore reduced-motion preference', () => !/animate-|transition-transform|motion-/.test(negotiationPanel)],
  ['59 Seller Guidance is accessible through existing help component', () => /SellerGuidanceHelp/.test(negotiationPanel) && /aria-haspopup/.test(sellerHelp) && /aria-modal="true"/.test(sellerHelp)],
  ['60 blocker/remediation actions open canonical destinations', () => /Open CRM commercial review/.test(negotiationPanel) && /Open quotation approval/.test(negotiationPanel) && /\/admin\/quotation-approvals/.test(negotiationPanel)],
];

assert.equal(cases.length, 60, 'Part 11 source-spec matrix must contain exactly 60 cases.');

for (const [name, verify] of cases) {
  test(`PART 11 MATRIX ${name}`, () => {
    assert.ok(verify(), name);
  });
}
