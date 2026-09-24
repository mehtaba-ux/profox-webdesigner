import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const core = await readFile('supabase/migrations/20260920181000_crm_sales_delivery_handoff_part_13.sql', 'utf8');
const lifecycle = await readFile('supabase/migrations/20260920181100_crm_sales_delivery_handoff_lifecycle_visibility_part_13.sql', 'utf8');
const service = await readFile('src/lib/salesHandoffService.ts', 'utf8');
const ui = await readFile('src/components/admin/SalesProjectHandoverView.tsx', 'utf8');
const projectUi = await readFile('src/components/admin/ProjectManager.tsx', 'utf8');
const sellerUi = await readFile('src/components/admin/SellerLifecyclePanel.tsx', 'utf8');
const lifecycleTableMatch = core.match(/create table public\.project_sales_handover_attempts \(([\s\S]*?)\n\);/i);
assert.ok(lifecycleTableMatch, 'Part 13 lifecycle table definition must exist');
const lifecycleTable = lifecycleTableMatch[1];

test('Part 13 creates exactly one lifecycle/review table and no duplicate commercial truth table', () => {
  const creates = [...core.matchAll(/create table public\.([a-z0-9_]+)/gi)].map(match => match[1]);
  assert.deepEqual(creates, ['project_sales_handover_attempts']);
  assert.doesNotMatch(core, /create table public\.(?:handoff_requirements|handoff_payments|handoff_quotations|handoff_onboarding|sales_handoff_v2)/i);
});

test('Part 13 lifecycle table stores review/version evidence rather than duplicated business truth', () => {
  assert.match(core, /attempt_number integer not null/);
  assert.match(core, /status text not null check \(status in \('SUBMITTED','RESUBMITTED','RETURNED_TO_SALES','ACCEPTED'\)\)/);
  assert.match(core, /source_refs jsonb not null/);
  assert.match(core, /source_digest text not null/);
  assert.match(core, /reviewed_by uuid/);
  assert.match(core, /return_reason_codes text\[\]/);
  assert.match(core, /missing_items jsonb/);
  assert.doesNotMatch(lifecycleTable, /quotation_items_snapshot|payment_verified|quotation_total|\brequirements\b|\bpromises\b|scope_conditions/i);
});

test('Part 13 migration fabricates no production handoff attempt', () => {
  assert.match(core, /select count\(\*\)::int into v_attempt_count from public\.project_sales_handover_attempts/);
  assert.match(core, /must not fabricate Sales handoff lifecycle rows/i);
  assert.doesNotMatch(core, /insert into public\.project_sales_handover_attempts[\s\S]{0,300}select[\s\S]{0,300}from public\.projects/i);
});

test('Part 13 source version evidence uses fingerprints for mutable canonical sources', () => {
  assert.match(core, /project_build_sales_handoff_source_refs/);
  assert.match(core, /sellerNotesFingerprint/);
  assert.match(core, /crm_requirements[\s\S]*fingerprint/);
  assert.match(core, /crm_sales_validations[\s\S]*fingerprint/);
  assert.match(core, /crm_sales_promises[\s\S]*fingerprint/);
  assert.match(core, /crm_sales_scope_conditions[\s\S]*fingerprint/);
  assert.doesNotMatch(core, /'project',[\s\S]{0,180}'updatedAt'/);
});

test('Part 13 readiness is server-authoritative and returns READY WARNING or BLOCKED', () => {
  assert.match(core, /project_get_sales_handoff_readiness/);
  assert.match(core, /if jsonb_array_length\(v_blockers\)>0 then v_status:='BLOCKED'/);
  assert.match(core, /elsif jsonb_array_length\(v_warnings\)>0 then v_status:='WARNING'/);
  assert.match(core, /else v_status:='READY'/);
});

test('Part 13 readiness enforces Won quote payment project client onboarding and structured requirements', () => {
  for (const marker of ['OPPORTUNITY_NOT_WON','ACCEPTED_QUOTATION_REQUIRED','VERIFIED_PAYMENT_REQUIRED','PROJECT_NOT_SALES_HANDOVER','CLIENT_NOT_LINKED','ONBOARDING_INCOMPLETE','STRUCTURED_REQUIREMENTS_MISSING']) {
    assert.match(core, new RegExp(marker));
  }
});

test('Part 13 readiness blocks material validation promise and scope conflicts', () => {
  assert.match(core, /REQUIRED_VALIDATION_UNRESOLVED/);
  assert.match(core, /PROMISE_ALIGNMENT_UNRESOLVED/);
  assert.match(core, /SCOPE_CONDITION_UNRESOLVED/);
  assert.match(core, /QUOTATION_RECONCILIATION_CONFLICT/);
});

test('Part 13 preserves legacy accepted quotations without weakening Part 10B', () => {
  assert.match(core, /LEGACY_QUOTATION_WITHOUT_PART10B_SNAPSHOT/);
  assert.match(core, /finalQuotationSendGateActive/);
  assert.match(core, /policyVersion/);
  assert.match(core, /snapshotSchemaVersion/);
});

test('Seller submission remains the existing submit_sales_project_handover RPC', () => {
  assert.match(core, /create or replace function public\.submit_sales_project_handover\(p_project_id uuid,p_notes text\)/i);
  assert.match(core, /Only the source Seller may submit or resubmit this Sales handoff/);
  assert.match(core, /project_get_sales_handoff_readiness/);
  assert.match(core, /source_digest/);
});

test('duplicate submit is idempotent while conflicting pending submit fails safely', () => {
  assert.match(core, /v_latest\.status in \('SUBMITTED','RESUBMITTED'\)/);
  assert.match(core, /'idempotent',true/);
  assert.match(core, /current handoff submission is already waiting for Delivery review/i);
});

test('resubmission creates a new attempt and preserves previous review history', () => {
  assert.match(core, /v_attempt:=v_latest\.attempt_number\+1/);
  assert.match(core, /v_status:='RESUBMITTED'/);
  assert.match(core, /resubmitted_from_attempt_id/);
});

test('PM assignment is optional for submission but required for Delivery acceptance', () => {
  assert.match(core, /PROJECT_MANAGER_NOT_ASSIGNED/);
  assert.match(core, /Sales may submit when otherwise ready/);
  assert.match(core, /Assign an active Project Manager before Delivery can accept/);
  assert.match(core, /service_queue_active_admins_operational_notification/);
});

test('Part 13 Accept is protected and rejects stale versions/source drift', () => {
  assert.match(core, /accept_sales_project_handover\(p_project_id uuid,p_expected_attempt integer\)/);
  assert.match(core, /Only the assigned Project Manager or Administrator may accept/);
  assert.match(core, /This handoff version is stale/);
  assert.match(core, /Canonical Sales handoff sources changed after submission/);
  assert.match(core, /status='ACCEPTED'/);
});

test('Part 13 Return requires structured actionable reasons and missing items', () => {
  assert.match(core, /return_sales_project_handover/);
  for (const reason of ['MISSING_REQUIREMENT','UNCLEAR_REQUIREMENT','SCOPE_CONFLICT','PROMISE_NOT_COVERED','VALIDATION_MISSING','TIMELINE_CONFLICT','CLIENT_DEPENDENCY_MISSING','ONBOARDING_INFORMATION_INCOMPLETE','COMMERCIAL_CLARIFICATION','OTHER']) {
    assert.match(core, new RegExp(reason));
  }
  assert.match(core, /requires 1 to 50 structured missing\/action items/i);
  assert.match(core, /OTHER requires a specific explanatory note/i);
});

test('Return restores Sales ownership without duplicating tasks', () => {
  assert.match(core, /Sales owns the returned handoff until corrected and resubmitted/);
  assert.match(core, /workflow_key='sales_handover_submission'/);
  assert.match(core, /workflow_key='sales_handover_review'/);
  assert.doesNotMatch(core, /insert into public\.project_tasks/);
});

test('Part 13 reuses operational notification helpers for submit return resubmit and accept', () => {
  assert.match(core, /service_queue_staff_operational_notification/);
  assert.match(core, /project-sales-handover-review:/);
  assert.match(core, /project-sales-handover-returned:/);
  assert.match(core, /project-sales-handover-accepted:/);
});

test('generic project task completion cannot bypass protected submit/review states', () => {
  assert.match(core, /old\.workflow_key='sales_handover_submission'/);
  assert.match(core, /old\.workflow_key='sales_handover_review'/);
  assert.match(core, /profox\.sales_handover_submission_rpc/);
  assert.match(core, /profox\.sales_handover_review_rpc/);
  assert.match(projectUi, /CONTROLLED_WORKFLOW_KEYS/);
});

test('Sales Handover to Content requires current accepted handoff and no source drift', () => {
  assert.match(core, /Delivery must accept the Sales handoff before Content can begin/);
  assert.match(core, /v_latest\.status<>'ACCEPTED'/);
  assert.match(core, /Canonical Sales handoff evidence changed after Delivery acceptance/);
});

test('Part 13 lifecycle RLS is narrow and direct browser writes are revoked', () => {
  assert.match(core, /alter table public\.project_sales_handover_attempts enable row level security/);
  assert.match(core, /revoke all on table public\.project_sales_handover_attempts from public,anon,authenticated/);
  assert.match(core, /grant select on table public\.project_sales_handover_attempts to authenticated,service_role/);
  assert.match(core, /o\.salesperson_id=auth\.uid\(\)/);
  assert.match(core, /p\.project_manager_id=auth\.uid\(\)/);
});

test('review history becomes immutable once reviewed', () => {
  assert.match(core, /A reviewed Sales handoff attempt is immutable/);
  assert.match(core, /Submitted Sales handoff version evidence is immutable/);
  assert.match(core, /cannot be deleted/);
});

test('authoritative handoff brief is extended rather than replaced', () => {
  assert.match(core, /create or replace function public\.project_get_sales_handoff_brief\(p_project_id uuid\)/i);
  for (const key of ['customer','businessContext','requirements','quotation','payment','onboarding','validations','promises','scopeConditions','timeline','outstandingDeliveryDependencies','history']) {
    assert.ok(core.includes("'" + key + "'"), 'missing brief section ' + key);
  }
});

test('handoff UI renders authoritative sections and review lifecycle', () => {
  for (const label of ['Customer & Business','Why They Bought / Business Context','Confirmed Structured Requirements','Accepted Commercial Agreement','Timeline','Technical / Commercial / Timeline / Compliance Validations','Promise Register','Assumptions / Exclusions / Dependencies','Payment & Client Onboarding','Outstanding Delivery Dependencies','Seller Final Notes','Review History']) {
    assert.ok(ui.includes(label), 'missing UI section ' + label);
  }
});

test('handoff UI has explicit Accept and Return to Sales actions and no bypass action', () => {
  assert.match(ui, /Accept Handoff/);
  assert.match(ui, /Return to Sales/);
  assert.match(ui, /Resubmit to Delivery/);
  assert.doesNotMatch(ui, /Skip Handoff|Force Accept|Start Content Anyway/);
});

test('returned handoff UX is textual accessible and links back to source', () => {
  assert.match(ui, /RETURNED TO SALES/);
  assert.match(ui, /Reason categories/);
  assert.match(ui, /Missing \/ action items/);
  assert.match(ui, /Open source/);
  assert.match(ui, /Resolve at source/);
});

test('Part 13 handoff view intentionally excludes secret/provider fields', () => {
  assert.doesNotMatch(ui, /provider_payment_id|payment_provider|access_token|refresh_token|private_key|api_secret/i);
  assert.match(ui, /Access tokens, passwords, private keys, payment-provider identifiers/);
  assert.doesNotMatch(core, /'providerPaymentId'|'paymentProvider'|'accessToken'|'privateKey'/);
});

test('Seller lifecycle queue keeps Submitted and Returned handoffs visible until Accepted', () => {
  assert.match(lifecycle, /handoff_status='RETURNED_TO_SALES'/);
  assert.match(lifecycle, /handoff_status in \('SUBMITTED','RESUBMITTED'\)/);
  assert.match(lifecycle, /handoff_status='ACCEPTED'/);
  assert.match(sellerUi, /Sales Handoff/);
  assert.match(sellerUi, /Returned to Sales/);
});

test('Project Manager workspace links to the existing handoff route', () => {
  assert.match(projectUi, /Sales Handoff Review/);
  assert.match(projectUi, /\/admin\/project-handover\//);
});

test('Part 13 service exposes get submit accept and return without a second API', () => {
  assert.match(service, /project_get_sales_handoff_brief/);
  assert.match(service, /submit_sales_project_handover/);
  assert.match(service, /accept_sales_project_handover/);
  assert.match(service, /return_sales_project_handover/);
  assert.doesNotMatch(service, /handoff-v2|salesHandoffV2/i);
});
