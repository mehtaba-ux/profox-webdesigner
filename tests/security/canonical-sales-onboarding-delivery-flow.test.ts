import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260905133000_align_sales_requirements_onboarding_delivery_flow.sql', 'utf8');
const stages = readFileSync('src/lib/canonicalProjectStages.ts', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');
const handoffView = readFileSync('src/components/admin/SalesProjectHandoverView.tsx', 'utf8');
const handoffService = readFileSync('src/lib/salesHandoffService.ts', 'utf8');

test('quotation creation requires confirmed Seller requirements before commercial progression', () => {
  assert.match(migration, /crm_enforce_quotation_qualification/);
  assert.match(migration, /'Requirements Confirmed'/);
  assert.match(migration, /Seller requirements must be confirmed before creating a quotation/);
  assert.match(migration, /Record the customer requirements before creating a quotation/);
  assert.match(migration, /nullif\(btrim\(coalesce\(v_opp\.requirements_summary,''\)\),''\) is null/);
  assert.doesNotMatch(migration, /v_opp\.stage not in \(\s*'Qualified'/);
  assert.doesNotMatch(migration, /v_opp\.stage not in \([^)]*'Meeting Scheduled'/s);
});

test('client onboarding and requirements are lifecycle inputs, not active production task stages', () => {
  assert.match(migration, /where stage_key in \('Client Onboarding','Requirements'\)/);
  assert.match(migration, /set active=false/);
  assert.match(migration, /Review Client Brief & Start Content/);
  assert.match(migration, /production starts with Content/);
});

test('protected project flow starts production at Content after Sales handoff', () => {
  assert.match(migration, /if old\.stage='Sales Handover'/);
  assert.match(migration, /if new\.stage<>'Content'/);
  assert.match(migration, /After Sales Handover, production starts with Content/);
  assert.match(migration, /Confirmed Sales requirements are required before Content can begin/);
  assert.match(migration, /Client onboarding must be completed before Content begins/);
  assert.match(migration, /when 'Content' then 'UI\/UX Design'/);
  assert.doesNotMatch(migration, /when 'Client Onboarding' then 'Requirements'/);
  assert.doesNotMatch(migration, /when 'Requirements' then 'Content'/);
});

test('active frontend project journey contains no duplicate onboarding or requirements stages', () => {
  const match = stages.match(/export const CANONICAL_PROJECT_STAGES: ProjectStage\[\] = \[([\s\S]*?)\];/);
  assert.ok(match, 'canonical active stage array should be declared');
  const activeStages = match[1];
  assert.match(activeStages, /'Sales Handover',\s*'Content'/s);
  assert.doesNotMatch(activeStages, /'Client Onboarding'/);
  assert.doesNotMatch(activeStages, /'Requirements'/);
  assert.match(main, /initializeCanonicalProjectStages\(\);/);
  assert.ok(main.indexOf('initializeCanonicalProjectStages();') < main.indexOf('createRoot('));
});

test('handoff is blocked without Seller requirements and clearly starts Content after review', () => {
  assert.match(migration, /requirementsCaptured/);
  assert.match(migration, /Confirmed Sales requirements are missing\. Sales must capture requirements before client onboarding and handoff/);
  assert.match(migration, /'nextProductionStage','Content'/);
  assert.match(handoffService, /requirementsCaptured: boolean/);
  assert.match(handoffService, /salesRequirements\?: string \| null/);
  assert.match(handoffView, /Confirmed Sales Requirements/);
  assert.match(handoffView, /Sales confirms requirements before the quotation/);
  assert.match(handoffView, /production starts directly with Content/);
  assert.doesNotMatch(handoffView, /proceeds to Requirements/);
});

test('the fix reuses canonical records rather than creating a parallel requirements or onboarding system', () => {
  assert.doesNotMatch(migration, /create table[^;]*(requirements|onboarding|handoff)/i);
  assert.match(migration, /public\.crm_opportunities/);
  assert.match(migration, /public\.client_onboardings/);
  assert.match(migration, /public\.projects/);
  assert.match(migration, /public\.project_tasks/);
});
