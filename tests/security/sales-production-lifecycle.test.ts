import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const lifecycleMigration = readFileSync('supabase/migrations/20260905033454_sales_to_production_lifecycle_clarity.sql', 'utf8');
const responseCountFix = readFileSync('supabase/migrations/20260905040655_fix_sales_handoff_brief_response_count.sql', 'utf8');
const lifecycleService = readFileSync('src/lib/sellerLifecycleService.ts', 'utf8');
const lifecyclePanel = readFileSync('src/components/admin/SellerLifecyclePanel.tsx', 'utf8');
const sellerDashboard = readFileSync('src/components/admin/SellerExperienceClosure.tsx', 'utf8');
const handoffService = readFileSync('src/lib/salesHandoffService.ts', 'utf8');
const handoffView = readFileSync('src/components/admin/SalesProjectHandoverView.tsx', 'utf8');

test('seller lifecycle is an aggregation over the canonical systems, not a second pipeline', () => {
  assert.match(lifecycleMigration, /create or replace function public\.crm_get_seller_lifecycle_queue/);
  assert.match(lifecycleMigration, /from public\.crm_leads/);
  assert.match(lifecycleMigration, /public\.crm_opportunities/);
  assert.match(lifecycleMigration, /public\.quotations/);
  assert.match(lifecycleMigration, /public\.payments/);
  assert.match(lifecycleMigration, /public\.projects/);
  assert.match(lifecycleMigration, /public\.client_onboardings/);
  assert.doesNotMatch(lifecycleMigration, /create table[^;]*(seller_lifecycle|sales_lifecycle|handoff_queue)/i);
});

test('seller lifecycle exposes the six approved operational queues', () => {
  for (const key of ['active_leads', 'deals_quotations', 'awaiting_payment', 'onboarding', 'ready_for_handoff', 'closed_customers']) {
    assert.match(lifecycleMigration, new RegExp(key));
  }
  for (const label of ['Active Leads', 'Deals & Quotations', 'Awaiting Payment', 'Client Onboarding', 'Ready for Handoff', 'Closed Customers']) {
    assert.match(lifecyclePanel, new RegExp(label.replace(/[&]/g, '\\&')));
  }
  assert.match(lifecycleMigration, /\/admin\/project-handover\//);
  assert.match(lifecycleService, /crm_get_seller_lifecycle_queue/);
  assert.doesNotMatch(lifecycleService, /\.from\(/);
});

test('existing Seller Command Center is preserved and composed with the lifecycle panel', () => {
  assert.match(sellerDashboard, /SellerLifecyclePanel/);
  assert.match(sellerDashboard, /SellerExperienceLegacy/);
});

test('final Sales handoff is gated by completed client onboarding and does not require duplicate answers', () => {
  assert.match(lifecycleMigration, /Client onboarding must be completed before the final Sales handoff can be sent/);
  assert.match(lifecycleMigration, /No additional Sales commitments beyond the accepted quotation and completed client onboarding/);
  assert.match(lifecycleMigration, /if v_notes='' then/);
  assert.match(lifecycleMigration, /new\.stage:='Requirements'/);
  assert.match(lifecycleMigration, /new\.stage not in \('Client Onboarding','Requirements'\)/);
});

test('production JSON response-count fix uses supported jsonb key enumeration', () => {
  assert.match(responseCountFix, /jsonb_object_keys\(v_onboarding\.responses\)/);
  assert.doesNotMatch(responseCountFix, /then\s+jsonb_object_length\s*\(/i);
  assert.match(responseCountFix, /revoke all on function public\.project_get_sales_handoff_brief\(uuid\) from public,anon/);
  assert.match(responseCountFix, /grant execute on function public\.project_get_sales_handoff_brief\(uuid\) to authenticated,service_role/);
});

test('handoff UI reviews the canonical brief and only accepts optional Sales exceptions', () => {
  assert.match(handoffService, /project_get_sales_handoff_brief/);
  assert.match(handoffService, /submit_sales_project_handover/);
  assert.match(handoffView, /Additional Sales commitments \/ exceptions/);
  assert.match(handoffView, /Leave blank when there is nothing additional/);
  assert.match(handoffView, /Send Client Brief to Project Manager/);
  assert.match(handoffView, /Requirements and client onboarding are not repeated in production/);
  assert.match(handoffView, /production starts directly with Content/);
  assert.doesNotMatch(handoffView, /before Client Onboarding/);
  assert.doesNotMatch(handoffView, /Record the full sales-to-delivery handover context/);
  assert.doesNotMatch(handoffView, /clean\.length < 10/);
});

test('handoff and lifecycle access remain protected server-side', () => {
  assert.match(lifecycleMigration, /if not public\.is_admin\(\) and v_uid is distinct from v_salesperson and v_uid is distinct from v_project\.project_manager_id/);
  assert.match(lifecycleMigration, /Sales lifecycle access denied/);
  assert.match(lifecycleMigration, /revoke all on function public\.crm_get_seller_lifecycle_queue\(uuid\) from public,anon/);
  assert.match(lifecycleMigration, /grant execute on function public\.crm_get_seller_lifecycle_queue\(uuid\) to authenticated,service_role/);
});
