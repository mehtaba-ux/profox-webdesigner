import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260921110000_crm_manager_exception_workspace_part_14.sql','utf8');
const service = await readFile('src/lib/managerExceptionService.ts','utf8');
const ui = await readFile('src/components/admin/ManagerExceptionWorkspace.tsx','utf8');
const apps = await readFile('src/lib/workspaceApps.ts','utf8');
const frame = await readFile('src/components/admin/workspace/WorkspaceRouteFrame.tsx','utf8');
const app = await readFile('src/App.tsx','utf8');

test('Part 14 creates no exception business table', () => {
  assert.doesNotMatch(migration,/create table/i);
  for (const forbidden of ['crm_manager_exceptions','sales_exception_records','manager_approval_items','exception_statuses','manager_tasks_v2']) {
    assert.match(migration,new RegExp("to_regclass\\('public\\." + forbidden + "'\\) is not null"));
  }
});

test('Part 14 adds one read-only aggregate RPC with fixed search_path', () => {
  assert.match(migration,/create or replace function public\.crm_get_manager_exception_workspace/);
  assert.match(migration,/language plpgsql\s+stable\s+security definer\s+set search_path='public','pg_temp'/i);
  assert.doesNotMatch(migration,/\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i);
});

test('Manager workspace is Admin-only and anonymous execution is revoked', () => {
  assert.match(migration,/v_role is distinct from 'admin'/);
  assert.match(migration,/Manager Exception Workspace access denied/);
  assert.match(migration,/revoke all on function public\.crm_get_manager_exception_workspace[\s\S]*from public,anon/i);
  assert.match(migration,/grant execute on function public\.crm_get_manager_exception_workspace[\s\S]*to authenticated,service_role/i);
});

test('generic Business Intelligence exception function is left untouched', () => {
  assert.doesNotMatch(migration,/create or replace function public\.get_business_intelligence_exceptions/i);
  assert.doesNotMatch(migration,/get_business_intelligence_exceptions\(/i);
});

test('Proposal Readiness reuses the canonical Sales gate evaluator', () => {
  assert.match(migration,/crm_get_sales_gate_assessment\(o\.id,'PROPOSAL_READINESS'\)/);
  assert.match(migration,/PROPOSAL_READINESS_BLOCKED/);
  assert.doesNotMatch(migration,/proposal_readiness_score|manager_readiness_score/i);
});

test('Sales Validation exceptions reuse current canonical validations', () => {
  assert.match(migration,/from public\.crm_sales_validations v/);
  assert.match(migration,/crm_sales_validation_reviewer_eligible/);
  assert.match(migration,/SALES_VALIDATION_PENDING/);
  assert.match(migration,/SALES_VALIDATION_STALE/);
  assert.match(migration,/supersedes_validation_id=v\.id/);
});

test('quotation approval exceptions preserve reviewer authorization', () => {
  assert.match(migration,/QUOTATION_APPROVAL_PENDING/);
  assert.match(migration,/QUOTATION_CHANGES_REQUESTED/);
  assert.match(migration,/quotation_approval_reviewer_authorized\(q\.id,v_uid\)/);
  assert.match(migration,/\/admin\/quotation-approvals\//);
});

test('meeting exceptions reuse canonical completed Sales meeting close-out facts', () => {
  assert.match(migration,/from public\.sales_meetings m/);
  assert.match(migration,/m\.status='Completed'/);
  assert.match(migration,/m\.lead_id is not null or m\.opportunity_id is not null/);
  assert.match(migration,/Outcome is missing/);
  assert.match(migration,/Next Step is missing/);
  assert.match(migration,/Follow-Up timing is missing/);
});

test('decision authority uses the existing Decision Process readiness dimension', () => {
  assert.match(migration,/DECISION_AUTHORITY_MISSING/);
  assert.match(migration,/d->>'key'='DECISION_PROCESS'/);
  assert.match(migration,/structured Requirements and Discovery/);
  assert.doesNotMatch(migration,/economic_buyer\s*=|authority_score/i);
});

test('next-action truth reuses Part 11 pipeline and work queue read models', () => {
  assert.match(migration,/crm_get_pipeline_command_center\(\)/);
  assert.match(migration,/crm_get_sales_work_queue\('team','all',500\)/);
  assert.match(migration,/NEXT_ACTION_MISSING/);
  assert.match(migration,/NEXT_ACTION_OVERDUE/);
  assert.doesNotMatch(migration,/o\.next_follow_up_at/);
});

test('stage SLA is sourced from the canonical Pipeline command center', () => {
  assert.match(migration,/STAGE_SLA_EXCEEDED/);
  assert.match(migration,/stageSlaHours/);
  assert.match(migration,/stageAgeHours/);
});

test('returned handoff comes only from current Part 13 RETURNED_TO_SALES state', () => {
  assert.match(migration,/project_sales_handover_attempts/);
  assert.match(migration,/HANDOFF_RETURNED_TO_SALES/);
  assert.match(migration,/where h\.status='RETURNED_TO_SALES'/);
  assert.doesNotMatch(migration,/NOT_SUBMITTED[\s\S]{0,200}HANDOFF_RETURNED_TO_SALES/);
});

test('Promise coverage reuses Part 9 and Part 10A/10B canonical coverage', () => {
  assert.match(migration,/from public\.crm_sales_promises p/);
  assert.match(migration,/public\.quotation_sales_coverage/);
  assert.match(migration,/PROMISE_QUOTE_COVERAGE_BLOCKED/);
  assert.match(migration,/p\.record_state='ACTIVE'/);
  assert.match(migration,/p\.source_type<>'INTERNAL_DRAFT'/);
  assert.match(migration,/coverage_status in \('UNMAPPED','PARTIAL','CONFLICT','STALE'\)/);
});

test('repeated overrides require actual audited override evidence', () => {
  assert.match(migration,/duration_override_at is not null/);
  assert.match(migration,/revenue_distribution_override_at is not null/);
  assert.match(migration,/event_type,''\)\) like '%override%'/);
  assert.match(migration,/having count\(\*\)>=2/);
  assert.doesNotMatch(migration,/create.*override|adminBypass|skipSalesGate/i);
});

test('stable exception keys are deterministic source keys', () => {
  for (const prefix of [
    'proposal-readiness:',
    'sales-validation:',
    'quotation-approval:',
    'meeting-closeout:',
    'decision-authority:',
    'next-action-missing:',
    'next-action-overdue:',
    'stage-sla:',
    'handoff-returned:',
    'promise-coverage:',
    'repeated-sop-override:'
  ]) assert.ok(migration.includes(prefix), 'missing stable exception key '+prefix);
  assert.doesNotMatch(migration,/gen_random_uuid\(\)/);
});

test('deduplication is deterministic and source-specific', () => {
  assert.match(migration,/row_number\(\) over\(partition by a\.exception_key/);
  assert.match(migration,/where rn=1/);
});

test('source resolution controls exception disappearance', () => {
  assert.match(migration,/v\.status in \('PENDING','IN_REVIEW','NEEDS_INFORMATION','REJECTED','STALE'\)/);
  assert.match(migration,/q\.approval_decision='changes_requested'/);
  assert.match(migration,/p\.next_activity_due_at<now\(\)/);
  assert.match(migration,/where h\.status='RETURNED_TO_SALES'/);
  assert.match(migration,/cov\.coverage_status in \('UNMAPPED','PARTIAL','CONFLICT','STALE'\)/);
});

test('workspace sorting separates source severity from presentation priority', () => {
  assert.match(migration,/'sourceSeverity',p\.source_severity/);
  assert.match(migration,/'workspacePriority',case when p\.sort_rank<=10/);
  assert.match(migration,/order by sort_rank asc,overdue desc,opened_at asc nulls last,exception_key/);
});

test('filters search owner and pagination are server-authoritative', () => {
  assert.match(migration,/p_filter text default 'all'/);
  assert.match(migration,/p_search text default ''/);
  assert.match(migration,/p_owner_id uuid default null/);
  assert.match(migration,/p_limit integer default 50/);
  assert.match(migration,/p_offset integer default 0/);
  assert.match(migration,/'hasMore'/);
});

test('aggregate metadata is deliberately narrow', () => {
  assert.doesNotMatch(migration,/customer_view_token_hash|meeting_url|payment_provider|provider_payment_id|access_token|refresh_token|private_key|api_secret/i);
  assert.match(ui,/safeMetadataFacts/);
});

test('UI is integrated into Founder Control rather than a new disconnected app', () => {
  assert.match(apps,/manager-exceptions.*Manager Exceptions.*\/admin\/manager-exceptions/);
  assert.match(app,/ManagerExceptionWorkspace/);
  assert.match(app,/path="\/admin\/manager-exceptions"/);
  assert.match(frame,/manager-exceptions.*return 'intelligence'/);
});

test('Seller does not receive a team Manager Exception workspace', () => {
  assert.match(apps,/manager-exceptions[\s\S]{0,160}roles: \['admin'\]/);
  assert.match(ui,/isAdmin/);
  assert.match(ui,/if \(!allowed\) return <Navigate to="\/admin"/);
});

test('UI has summary, filters, search, empty/loading/error states and canonical actions', () => {
  for (const marker of [
    'Manager Exceptions',
    'Only deals and handoffs that need intervention',
    'Total Exceptions',
    'Blocking',
    'Overdue',
    'Pending Review',
    'Search Manager Exceptions',
    'No matching Sales exceptions',
    'Loading Manager Exceptions',
    'Manager Exceptions could not be loaded',
    'Open the authoritative workflow to act'
  ]) assert.ok(ui.includes(marker), 'missing UI marker '+marker);
});

test('blocking and overdue states are not color-only', () => {
  assert.match(ui,/>Blocking</);
  assert.match(ui,/>Overdue</);
  assert.match(ui,/workspacePriority/);
});

test('detail drawer is read-only and routes remediation to source', () => {
  assert.match(ui,/Exception Detail · Read-Only/);
  assert.match(ui,/The Manager Exception Workspace does not resolve this item/);
  assert.match(ui,/item\.actionLabel/);
  assert.doesNotMatch(ui,/Resolve Exception|Ignore forever|Dismiss blocker|Hide exception permanently/);
});

test('UI contains no prohibited decorative AI icon language', () => {
  assert.doesNotMatch(ui,/Sparkles|WandSparkles|✨/);
});

test('service exposes only the read RPC', () => {
  assert.match(service,/crm_get_manager_exception_workspace/);
  assert.doesNotMatch(service,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('Part 10B gate 2/2 is explicitly preserved by migration pre/postconditions', () => {
  assert.match(migration,/finalQuotationSendGateActive/);
  assert.match(migration,/policyVersion/);
  assert.match(migration,/snapshotSchemaVersion/);
  assert.match(migration,/Part 14 changed protected Part 10B policy state/);
});
