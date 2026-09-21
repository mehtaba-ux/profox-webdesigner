import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260921190000_crm_seller_quality_performance_part_15.sql','utf8');
const service = await readFile('src/lib/salesPerformanceService.ts','utf8');
const ui = await readFile('src/components/admin/SalesPerformanceManagement.tsx','utf8');

test('Part 15 reuses the existing performance persistence',()=>{
  assert.doesNotMatch(migration,/\bcreate\s+table\b/i);
  assert.match(migration,/sales_performance_reviews/);
  assert.match(migration,/sales_performance_settings/);
  assert.match(migration,/seller_quality_reviews/);
  assert.match(migration,/duplicate Seller Performance truth system/);
});

test('one canonical period-aware calculation path backs current and completed-review snapshots',()=>{
  assert.match(migration,/get_sales_performance_period_snapshot\(/);
  assert.match(migration,/get_sales_performance_period_snapshot\(p_salesperson_id,v_activation_date,current_date\)/);
  assert.match(migration,/get_sales_performance_period_snapshot\(v_review\.salesperson_id,v_review\.period_start,v_review\.period_end\)/);
  assert.match(migration,/Completed performance reviews are immutable/);
});

test('Part 15 uses canonical source systems',()=>{
  assert.match(migration,/crm_get_sales_gate_assessment\(v_opp\.id,'REQUIREMENTS_CONFIRMED'\)/);
  assert.match(migration,/crm_get_sales_gate_assessment\(v_opp\.id,'PROPOSAL_READINESS'\)/);
  assert.match(migration,/project_sales_handover_attempts/);
  assert.match(migration,/Part 11 opportunity-linked crm_activities/);
  assert.match(migration,/payments\.status=Verified \+ verified_at/);
  assert.doesNotMatch(migration,/\bo\.next_follow_up_at\b/);
});

test('unsupported blame metrics fail closed',()=>{
  assert.match(migration,/postSaleSalesAttributedScopeChanges/);
  assert.match(migration,/clientExpectationDisputes/);
  assert.match(migration,/NOT_TRACKED_AUTHORITATIVELY/);
  assert.match(migration,/does not infer blame/);
  assert.match(migration,/sentiment are not used to infer a client dispute/);
});

test('metric availability and currency behavior are explicit',()=>{
  for (const status of ['AVAILABLE','INSUFFICIENT_DATA','NOT_TRACKED_AUTHORITATIVELY']) assert.match(migration,new RegExp(status));
  assert.match(migration,/Currencies are kept separate\. No FX conversion is invented\./);
  assert.match(migration,/sampleSize/);
  assert.match(migration,/periodStart/);
  assert.match(migration,/periodEnd/);
});

test('human review remains authoritative',()=>{
  assert.match(migration,/A completed review requires a management decision/);
  assert.match(migration,/Apply any access\/offboarding change through the existing Team & Users control/);
  assert.doesNotMatch(migration,/update\s+public\.user_profiles\s+set\s+status/i);
  assert.doesNotMatch(migration,/commission_rules|certification_level|quality_score/i);
  assert.match(ui,/Human management review remains the decision authority/);
  assert.match(ui,/never preselects a decision, required action, access restriction or employment outcome/);
});

test('Seller and Admin use existing UI and service',()=>{
  assert.match(service,/get_my_sales_performance/);
  assert.match(service,/admin_get_sales_performance/);
  assert.match(service,/get_sales_performance_period_snapshot/);
  assert.match(ui,/Performance & Coaching/);
  assert.match(ui,/Quality revenue \+ clean delivery/);
  assert.match(ui,/System evidence · read only/);
  assert.match(ui,/Legacy immutable snapshot — Part 15 metrics were not backfilled/);
});

test('security contract is fixed-path and guarded',()=>{
  assert.match(migration,/SECURITY DEFINER\s+SET search_path='public','pg_temp'/i);
  assert.match(migration,/You can only view your own sales performance/);
  assert.match(migration,/Admin access required/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.get_sales_performance_period_snapshot.*FROM PUBLIC,anon/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.get_sales_performance_period_snapshot.*TO authenticated/);
});

test('Part 10B and Part 16 boundaries are explicit',()=>{
  assert.match(migration,/finalQuotationSendGateActive/);
  assert.match(migration,/policyVersion/);
  assert.match(migration,/snapshotSchemaVersion/);
  assert.doesNotMatch(migration+service+ui,/sales academy \/ certification permissions|auto.*certif|quality.*certification/i);
});
