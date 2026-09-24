import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(process.cwd(), 'supabase', 'migrations');
const FILES = Object.freeze({
  meeting: '20260918120000_crm_sales_meeting_closeout_current_state_reconciliation.sql',
  validation: '20260918121000_crm_sales_validation_current_state_reconciliation.sql',
  readiness: '20260918122000_crm_sales_proposal_readiness_current_state_reconciliation.sql',
  catalog: '20260918123000_sales_catalog_current_state_reconciliation.sql',
});

async function source(key) {
  return readFile(path.join(ROOT, FILES[key]), 'utf8');
}

function assertTransactionalContract(sql, firstMutationMarker) {
  const pre = sql.indexOf('do $p10b6_pre$');
  const mutation = sql.toLowerCase().indexOf(firstMutationMarker.toLowerCase());
  const post = sql.indexOf('do $p10b6_post$');
  assert.ok(pre >= 0, 'missing fail-closed precondition block');
  assert.ok(mutation > pre, 'first mutation must occur after all preconditions begin');
  assert.ok(post > mutation, 'postconditions must execute after reconciliation statements');
  assert.match(sql, /P10B6_SEND_GATE_FALSE/);
  assert.match(sql, /finalQuotationSendGateActive/);
  assert.match(sql, /must remain false|changed from false|Send gate changed from false/i);
  assert.doesNotMatch(sql, /insert\s+into\s+profox_migrations\.applied_migrations/i);
}

test('Meeting reconciliation pins current close-out authority and fails closed before definition replacement', async () => {
  const sql = await source('meeting');
  assertTransactionalContract(sql, 'CREATE OR REPLACE FUNCTION public.save_sales_meeting_closeout_draft');
  assert.match(sql, /P10B6_MEETING_FUNCTIONS_CURRENT/);
  assert.match(sql, /P10B6_MEETING_ACLS_CURRENT/);
  assert.match(sql, /P10B6_MEETING_COMPLETED_NOSHOW_BOUNDARY/);
  assert.match(sql, /P10B6_MEETING_BUSINESS_COUNTS_UNCHANGED/);
  assert.match(sql, /queue_meeting_status_automation/);
  assert.match(sql, /meeting-followup:/);
  assert.match(sql, /unexpected save_sales_meeting_closeout_draft overload/);
  assert.match(sql, /unexpected finalize_sales_meeting overload/);
  assert.match(sql, /create or replace function public\.save_sales_meeting_closeout_draft/i);
  assert.match(sql, /create or replace function public\.finalize_sales_meeting/i);
});

test('Validation reconciliation represents compatible partial repair and exact final current Part 7 state', async () => {
  const sql = await source('validation');
  assertTransactionalContract(sql, 'insert into public.system_configuration');
  assert.match(sql, /create table if not exists public\.crm_sales_validations/i);
  assert.match(sql, /add column if not exists/i);
  assert.match(sql, /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/i);
  assert.match(sql, /P10B6_VALIDATION_SCHEMA_39_COLUMNS/);
  assert.match(sql, /P10B6_VALIDATION_CONSTRAINTS_CURRENT/);
  assert.match(sql, /P10B6_VALIDATION_INDEXES_13_CURRENT/);
  assert.match(sql, /P10B6_VALIDATION_TRIGGERS_3_ENABLED/);
  assert.match(sql, /P10B6_VALIDATION_RLS_POLICY_CURRENT/);
  assert.match(sql, /P10B6_VALIDATION_FUNCTIONS_CURRENT/);
  assert.match(sql, /P10B6_VALIDATION_POLICY_V1/);
  assert.match(sql, /P10B6_VALIDATION_MY_WORK_ROUTING/);
  assert.match(sql, /\/admin\?tab=myWork/);
  assert.match(sql, /unknown crm_sales_validations column exists/);
  assert.match(sql, /incompatible existing validation column/);
  assert.match(sql, /unknown validation constraint exists/);
  assert.match(sql, /unknown validation index exists/);
  assert.match(sql, /unknown validation trigger exists/);
  assert.match(sql, /duplicate active validation dedupe keys exist/);
  assert.match(sql, /unknown validation RLS policy exists/);
  assert.match(sql, /validation SELECT policy drifted/);
});

test('Proposal Readiness reconciliation installs evaluator 3 current authority without restoring intermediate engines', async () => {
  const sql = await source('readiness');
  assertTransactionalContract(sql, 'insert into public.system_configuration');
  assert.match(sql, /P10B6_READINESS_POLICY_V1_EVALUATOR_V3/);
  assert.match(sql, /P10B6_READINESS_DIMENSIONS_20_PLUS_3/);
  assert.match(sql, /P10B6_READINESS_EVALUATOR_CURRENT/);
  assert.match(sql, /P10B6_READINESS_PART9_SCOPE_PROMISE/);
  assert.match(sql, /P10B6_READINESS_TRANSITION_CURRENT/);
  assert.match(sql, /P10B6_READINESS_PIPELINE_INVARIANT/);
  assert.match(sql, /SCOPE_CONDITIONS_REGISTER/);
  assert.match(sql, /PROMISE_REGISTER_INTEGRITY/);
  assert.match(sql, /crm_get_sales_scope_commitment_assessment/);
  assert.match(sql, /unknown or newer Sales gate policy state/);
  assert.match(sql, /Requirements Confirmed stage is missing, duplicated, inactive, or malformed/);
  assert.match(sql, /create or replace function public\.crm_get_sales_gate_assessment/i);
  assert.match(sql, /create or replace function public\.crm_transition_opportunity/i);
  assert.doesNotMatch(sql, /create\s+(?:or\s+replace\s+)?function\s+public\.crm_get_sales_gate_assessment_v2/i);
});

test('Catalog reconciliation is schema/function-only on canonical data and rejects unknown business drift', async () => {
  const sql = await source('catalog');
  assertTransactionalContract(sql, 'alter table public.sales_products');
  assert.match(sql, /add column if not exists seller_guidance/i);
  assert.match(sql, /add column if not exists catalog_snapshot/i);
  assert.match(sql, /P10B6_CATALOG_SCHEMA_CURRENT/);
  assert.match(sql, /P10B6_CATALOG_ACTIVE_45_UNIQUE/);
  assert.match(sql, /P10B6_CATALOG_ADDONS_37_PRIVATE/);
  assert.match(sql, /P10B6_CATALOG_DEFINITIONS_COMPLETE/);
  assert.match(sql, /P10B6_CATALOG_PF_CUSTOM_CURRENT/);
  assert.match(sql, /P10B6_CATALOG_LAUNCH_CURRENT/);
  assert.match(sql, /P10B6_CATALOG_GROWTH_CURRENT/);
  assert.match(sql, /P10B6_CATALOG_SCALE_CURRENT/);
  assert.match(sql, /P10B6_CATALOG_PROTECTED_FIELDS_UNCHANGED/);
  assert.match(sql, /P10B6_CATALOG_QUOTATION_HISTORY_UNCHANGED/);
  assert.match(sql, /unknown PF-CUSTOM commercial drift/);
  assert.match(sql, /unknown PF-WEB-LAUNCH clarity drift/);
  assert.match(sql, /unknown PF-WEB-GROWTH clarity drift/);
  assert.match(sql, /unknown PF-WEB-SCALE clarity drift/);
  assert.doesNotMatch(sql, /^\s*update\s+public\.sales_products\b/im);
  assert.doesNotMatch(sql, /^\s*insert\s+into\s+public\.sales_products\b/im);
  assert.doesNotMatch(sql, /^\s*delete\s+from\s+public\.sales_products\b/im);
  assert.doesNotMatch(sql, /^\s*update\s+public\.quotation_items\b/im);
  assert.doesNotMatch(sql, /^\s*insert\s+into\s+public\.quotation_items\b/im);
  assert.doesNotMatch(sql, /^\s*delete\s+from\s+public\.quotation_items\b/im);
});

test('all four forward files declare repository implementation only and never claim production execution', async () => {
  for (const key of Object.keys(FILES)) {
    const sql = await source(key);
    assert.match(sql, /Production execution is not authorized by this repository implementation\./);
    assert.doesNotMatch(sql, /historical migration.*applied successfully/i);
  }
});
