import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260905121500_align_sales_requirements_production_flow.sql', 'utf8');
const registry = readFileSync('src/lib/projectDeliveryStageRegistry.ts', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');
const service = readFileSync('src/lib/salesHandoffService.ts', 'utf8');
const handoff = readFileSync('src/components/admin/SalesProjectHandoverView.tsx', 'utf8');

test('active project journey contains production stages only', () => {
  const activeBlock = registry.match(/ACTIVE_PROJECT_DELIVERY_STAGES:[\s\S]*?\];/)?.[0] || '';
  const expected = [
    'Sales Handover', 'Content', 'UI/UX Design', 'Client Design Approval', 'Development',
    'QA', 'Client Review', 'Final Revisions', 'Launch', 'Handover', 'Completed'
  ];
  for (const stage of expected) assert.match(activeBlock, new RegExp(stage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(activeBlock, /'Client Onboarding'/);
  assert.doesNotMatch(activeBlock, /'Requirements'/);
  assert.match(main, /configureProjectDeliveryStageRegistry\(\)/);
});

test('requirements are enforced before quote, verified payment and project creation', () => {
  assert.match(migration, /enforce_sales_requirements_before_quotation_write/);
  assert.match(migration, /before insert or update of opportunity_id on public\.quotations/i);
  assert.match(migration, /enforce_sales_requirements_before_verified_payment/);
  assert.match(migration, /first qualifying payment can be verified/i);
  assert.match(migration, /enforce_sales_requirements_before_project_creation/);
  assert.match(migration, /before a delivery project can be created/i);
});

test('sales handoff requires requirements and releases directly to Content', () => {
  assert.match(migration, /Seller requirements are missing/);
  assert.match(migration, /new\.stage := 'Content'/);
  assert.match(migration, /After Sales Handover, the project must move to Content/);
  assert.match(migration, /release the project to Content/);
  assert.doesNotMatch(migration, /then start Requirements/);
  assert.doesNotMatch(migration, /Requirements ownership/);
});

test('legacy pre-production delivery templates are retired without creating parallel systems', () => {
  assert.match(migration, /stage_key in \('Client Onboarding', 'Requirements'\)/);
  assert.match(migration, /set active = false/);
  assert.match(migration, /Review Production Brief & Release to Content/);
  assert.doesNotMatch(migration, /create table/i);
});

test('historical missing requirements are corrected only in canonical opportunity and project', () => {
  assert.match(migration, /crm_correct_sales_requirements_for_handoff/);
  assert.match(migration, /update public\.crm_opportunities/);
  assert.match(migration, /update public\.projects/);
  assert.match(migration, /source salesperson or Administrator/i);
  assert.match(service, /correctRequirements/);
  assert.match(service, /crm_correct_sales_requirements_for_handoff/);
});

test('handoff UI clearly separates Seller requirements from client onboarding inputs', () => {
  assert.match(handoff, /Seller Requirements — Confirmed Before Quotation/);
  assert.match(handoff, /Completed Client Onboarding Inputs/);
  assert.match(handoff, /release the project directly to Content/);
  assert.match(handoff, /do not invent requirements/i);
  assert.doesNotMatch(handoff, /proceeds to Requirements/);
  assert.doesNotMatch(handoff, /before Requirements can begin/);
});
