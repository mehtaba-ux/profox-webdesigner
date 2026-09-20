import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260920123000_crm_sales_negotiation_next_action_part_11.sql', 'utf8');
const service = await readFile('src/lib/crmService.ts', 'utf8');
const pipeline = await readFile('src/components/admin/CRMPipeline.tsx', 'utf8');
const activityCenter = await readFile('src/components/admin/CRMActivitiesExecutionCenter.tsx', 'utf8');
const types = await readFile('src/types.ts', 'utf8');
const guidance = await readFile('src/lib/crmSellerGuidance.ts', 'utf8');

test('Part 11 minimally extends crm_opportunities and does not create a negotiation table', () => {
  assert.match(migration, /alter table public\.crm_opportunities/i);
  assert.match(migration, /add column if not exists decision_status text/i);
  assert.match(migration, /add column if not exists primary_objection_category text/i);
  assert.match(migration, /add column if not exists waiting_on text/i);
  assert.match(migration, /add column if not exists decision_expected_at timestamptz/i);
  assert.doesNotMatch(migration, /create table[^;]*crm_negoti/i);
  assert.doesNotMatch(migration, /create table[^;]*(follow.?up|next.?action)/i);
});

test('decision state uses controlled values and never invents a default historical state', () => {
  for (const value of [
    'AWAITING_CLIENT_RESPONSE','CLIENT_REVIEWING','QUESTIONS_OR_OBJECTIONS',
    'REVISION_REQUESTED','COMMERCIAL_REVIEW_REQUIRED','INTERNAL_CLIENT_APPROVAL',
    'DECISION_DATE_CONFIRMED','PAUSED_BY_CLIENT',
  ]) assert.match(migration, new RegExp(value));
  const preRuntimeMutation = migration.split('create or replace function public.crm_record_negotiation_decision_state')[0];
  assert.doesNotMatch(preRuntimeMutation, /update\s+public\.crm_opportunities\s+set\s+decision_status/i);
  assert.doesNotMatch(migration, /default\s+'AWAITING_CLIENT_RESPONSE'/i);
});

test('silence is not converted into a price or budget objection', () => {
  assert.match(migration, /QUESTIONS_OR_OBJECTIONS/);
  assert.match(migration, /Record the known objection category/i);
  assert.match(guidance, /Silence means awaiting response, not automatically Price, Budget/i);
});

test('waiting externally still requires a canonical next action at transition time', () => {
  assert.match(migration, /waiting_on/i);
  assert.match(migration, /where a\.opportunity_id=v_opp\.id\s+and a\.status='Scheduled'/i);
  assert.match(migration, /Schedule the next customer action and assign an owner/i);
  assert.match(guidance, /Waiting on the customer still requires a scheduled re-check\/follow-up date/i);
});

test('canonical next action is explicitly opportunity-linked and deterministic', () => {
  assert.match(migration, /insert into public\.crm_activities/i);
  assert.match(migration, /v_opp\.lead_id,v_opp\.id,v_opp\.salesperson_id/i);
  assert.match(migration, /order by a\.due_at, a\.created_at, a\.id/i);
});

test('cross-opportunity and cross-lead activity linking is rejected', () => {
  assert.match(migration, /crm_guard_activity_opportunity_link/);
  assert.match(migration, /Activity lead must match the linked opportunity/i);
  assert.match(migration, /You may link activities only to your assigned opportunity/i);
});

test('Negotiation decision changes are server-authoritative, context-scoped, and browser actor/time cannot be forged', () => {
  assert.match(migration, /crm_protect_part11_negotiation_fields/);
  assert.match(migration, /stage not in \('Quotation Sent','Negotiation \/ Decision Pending'\)/);
  assert.match(migration, /app\.crm_negotiation_rpc/);
  assert.match(migration, /decision_recorded_at=now\(\)/i);
  assert.match(migration, /decision_recorded_by=v_uid/i);
  assert.match(migration, /v_uid uuid:=auth\.uid\(\)/i);
});

test('Negotiation transition remains inside the existing crm_transition_opportunity authority', () => {
  assert.match(migration, /create or replace function public\.crm_transition_opportunity\(p_opportunity_id uuid, p_target_stage text\)/i);
  assert.match(migration, /p_target_stage='Negotiation \/ Decision Pending'/);
  assert.match(migration, /Record the current customer decision status before moving this opportunity into Negotiation/i);
  assert.match(migration, /The current next action is overdue\. Complete or reschedule it before entering Negotiation/i);
});

test('forward and backward transitions still use canonical pipeline configuration', () => {
  assert.match(migration, /crm_pipeline_settings/);
  assert.match(migration, /allowedNext/);
  assert.match(migration, /allowBackward/);
  assert.match(migration, /allowedPrevious/);
});

test('Negotiation entry requires canonical quotation context but does not duplicate quotation readiness', () => {
  assert.match(migration, /A canonical sent quotation is required before entering Negotiation/i);
  assert.match(migration, /from public\.quotations q/i);
  assert.doesNotMatch(migration, /create table[^;]*quotation/i);
});

test('Awaiting Advance Payment acceptance boundary is preserved', () => {
  assert.match(migration, /p_target_stage='Awaiting Advance Payment'/);
  assert.match(migration, /q\.status='Accepted'/);
  assert.match(migration, /q\.accepted_at is not null/);
});

test('Won remains Admin/payment controlled', () => {
  assert.match(migration, /Won is controlled by Admin payment verification/i);
  assert.match(migration, /p\.status='Verified'/);
  assert.match(migration, /p\.payment_type in \('Advance','Full Payment'\)/);
  assert.doesNotMatch(migration, /insert into public\.payments/i);
});

test('Part 10B active gate is checked before and after migration', () => {
  const occurrences = (migration.match(/finalQuotationSendGateActive/g) || []).length;
  assert.ok(occurrences >= 2);
  assert.match(migration, /policyVersion/);
  assert.match(migration, /snapshotSchemaVersion/);
  assert.match(migration, /requires the active Part 10B Send gate/i);
  assert.match(migration, /must not weaken the active Part 10B Send gate/i);
});

test('last meaningful interaction is derived from canonical evidence and excludes internal notes and automated email', () => {
  assert.match(migration, /crm_get_last_meaningful_customer_interaction/);
  assert.match(migration, /internalNote/);
  assert.match(migration, /senderType/);
  assert.match(migration, /automated/);
  assert.match(migration, /sales_meetings/);
  assert.match(migration, /crm_activities/);
  assert.match(migration, /'No Answer','Voicemail','Wrong Number','No Response','Bounced'/);
  assert.doesNotMatch(migration, /'No Answer','Voicemail','Wrong Number','No Response','Bounced','Not Interested'/);
  assert.doesNotMatch(migration, /add column if not exists last_meaningful/i);
});

test('command center exposes next-action owner, due/overdue, decision state and latest outcome', () => {
  assert.match(migration, /next_activity_owner_name/);
  assert.match(migration, /'overdue',s\.next_activity_due_at<now\(\)/);
  assert.match(migration, /'decisionStatus',s\.decision_status/);
  assert.match(migration, /'waitingOn',s\.waiting_on/);
  assert.match(migration, /latestCompletedOutcome/);
  assert.match(migration, /negotiationAttentionReason/);
});

test('open-deal health uses actual Scheduled activity state rather than stale opportunity follow-up alone', () => {
  assert.match(migration, /'No next action scheduled'/);
  assert.match(migration, /'Next action overdue'/);
  assert.match(migration, /e\.next_activity_id is null/);
  assert.doesNotMatch(migration, /e\.next_follow_up_at is null and e\.next_activity_id is null/);
});

test('existing activity lifecycle is reused rather than duplicated', () => {
  assert.match(service, /crm_schedule_opportunity_next_action/);
  assert.match(types, /outcomeRecordedAt/);
  assert.match(types, /originalDueAt/);
  assert.match(types, /rescheduleCount/);
  assert.match(types, /cancellationReason/);
  assert.doesNotMatch(migration, /add column[^;]*activity_outcome/i);
  assert.doesNotMatch(migration, /add column[^;]*activity_reschedule_history/i);
});


test('Negotiation reschedule requires reason and preserves server-derived history', () => {
  assert.match(migration, /create or replace function public\.crm_reschedule_activity/);
  assert.match(migration, /A real reschedule reason is required for Negotiation next actions/);
  assert.match(migration, /original_due_at=coalesce\(original_due_at,due_at\)/);
  assert.match(migration, /reschedule_count=reschedule_count\+1/);
  assert.match(migration, /last_rescheduled_at=now\(\)/);
  assert.match(migration, /last_rescheduled_by=\(select auth\.uid\(\)\)/);
  assert.match(activityCenter, /Required for Negotiation next actions/);
  assert.match(activityCenter, /required=\{reasonRequired\}/);
});

test('Negotiation cancellation requires reason and cannot silently leave no next action', () => {
  assert.match(migration, /create or replace function public\.crm_cancel_activity/);
  assert.match(migration, /A real cancellation reason is required for Negotiation next actions/);
  assert.match(migration, /Schedule a replacement opportunity-linked action before cancelling the current Negotiation next action/);
  assert.match(migration, /cancellation_reason=left\(btrim\(coalesce\(p_reason,''\)\),1000\)/);
  assert.match(activityCenter, /Cancel with reason/);
  assert.match(activityCenter, /An active Negotiation opportunity must keep a scheduled opportunity-linked next action/);
  assert.match(activityCenter, /crmActivityExecutionService\.cancelActivity/);
});

test('Negotiation activity hardening keeps anonymous execution closed', () => {
  assert.match(migration, /revoke all on function public\.crm_reschedule_activity\(uuid,timestamptz,text,boolean\) from public, anon/i);
  assert.match(migration, /revoke all on function public\.crm_cancel_activity\(uuid,text\) from public, anon/i);
});

test('Part 11 UI is contextual and keeps activity lifecycle in the existing Activity Center', () => {
  assert.match(pipeline, /Decision &amp; Next Action/);
  assert.match(pipeline, /Negotiation is not a parking stage/);
  assert.match(pipeline, /Open Activity Center to complete, reschedule or cancel/);
  assert.match(pipeline, /Quotation Sent/);
  assert.match(pipeline, /Negotiation \/ Decision Pending/);
  assert.doesNotMatch(pipeline, /Force advance|Skip gate|Force send|Manager bypass|Mark customer accepted/i);
});

test('Part 11 UI communicates overdue state with text and not color alone', () => {
  assert.match(pipeline, /OVERDUE/);
  assert.match(pipeline, /nextActivity\.overdue/);
});

test('Part 11 UI provides explicit owner and due date context', () => {
  assert.match(pipeline, /Owner: \{opportunity\.nextActivity\.ownerName/);
  assert.match(pipeline, /type="datetime-local"/);
  assert.match(pipeline, /scheduleOpportunityNextAction/);
});

test('commercial exceptions remain routed to existing authorities', () => {
  assert.match(pipeline, /existing Sales Validation or quotation approval\/revision workflow/i);
  assert.match(pipeline, /Open CRM commercial review/);
  assert.match(pipeline, /\/admin\/quotation-approvals/);
  assert.match(pipeline, /Open quotation approval/);
  assert.doesNotMatch(migration, /crm_negotiation_approvals|negotiation_discount_approvals/i);
  assert.doesNotMatch(migration, /create table[^;]*approval/i);
});

test('customer acceptance is not writable from Part 11 service or UI', () => {
  assert.doesNotMatch(service, /markCustomerAccepted|acceptQuotation/);
  assert.doesNotMatch(pipeline, /Mark accepted|Customer accepted/i);
});

test('no payment, onboarding, handoff, manager-exception or AI implementation is introduced', () => {
  assert.doesNotMatch(migration, /insert into public\.payments|create table[^;]*handoff|create table[^;]*onboarding/i);
  assert.doesNotMatch(pipeline, /Sparkles|WandSparkles|✨/);
});

test('security-definer Part 11 functions use fixed safe search_path and minimum grants', () => {
  for (const fn of [
    'crm_guard_activity_opportunity_link',
    'crm_get_last_meaningful_customer_interaction',
    'crm_record_negotiation_decision_state',
    'crm_schedule_opportunity_next_action',
    'crm_transition_opportunity',
    'crm_get_pipeline_command_center',
  ]) {
    const pattern = new RegExp('function public\\.' + fn + '[\\s\\S]*?set search_path=public, pg_temp', 'i');
    assert.match(migration, pattern);
  }
  assert.match(migration, /revoke all on function public\.crm_record_negotiation_decision_state[^;]+from public, anon/i);
  assert.match(migration, /revoke all on function public\.crm_schedule_opportunity_next_action[^;]+from public, anon/i);
});

test('seller guidance reinforces truth, follow-up discipline and commercial boundaries', () => {
  assert.match(guidance, /Negotiation is not a parking stage/);
  assert.match(guidance, /Do not infer a price or budget objection from silence/i);
  assert.match(guidance, /Waiting externally is not permission to leave the opportunity without a next action/i);
  assert.match(guidance, /Part 11 Decision & Next Action/);
});
