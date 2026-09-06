import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260905050000_complete_seller_lifecycle_experience.sql', 'utf8');
const service = readFileSync('src/lib/sellerLifecycleService.ts', 'utf8');
const panel = readFileSync('src/components/admin/SellerLifecyclePanel.tsx', 'utf8');
const summary = readFileSync('src/components/admin/SellerCustomerLifecycleSummary.tsx', 'utf8');
const drawer = readFileSync('src/components/admin/crm/CRMLeadDrawer.tsx', 'utf8');
const drawerBase = readFileSync('src/components/admin/crm/CRMLeadDrawerBase.tsx', 'utf8');
const workspace = readFileSync('src/components/admin/crm/CRMLeadWorkspace.tsx', 'utf8');
const commandCenter = readFileSync('src/components/admin/SellerExperienceClosure.tsx', 'utf8');

test('detail lifecycle is protected and aggregates canonical systems only', () => {
  assert.match(migration, /crm_get_seller_customer_lifecycle/);
  for (const source of ['crm_leads', 'crm_opportunities', 'quotations', 'payments', 'projects', 'client_onboardings', 'project_tasks']) assert.match(migration, new RegExp(source));
  assert.doesNotMatch(migration, /create table/i);
  assert.match(migration, /revoke all on function public\.crm_get_seller_customer_lifecycle/);
  assert.match(migration, /grant execute on function public\.crm_get_seller_customer_lifecycle/);
});

test('customer detail shows one lifecycle bar, owner, project stage, next action and blocker', () => {
  for (const label of ['Customer Journey', 'Project Stage', 'Current Owner', 'NEXT ACTION', 'Blocker']) assert.match(summary, new RegExp(label));
  for (const milestone of ['Lead', 'Quote', 'Payment', 'Onboarding', 'Handoff', 'Production', 'Completed']) assert.match(summary, new RegExp(milestone));
  assert.match(drawer, /SellerCustomerLifecycleSummary/);
});

test('onboarding deep links remain supported while lead and conversation clicks stay contextual', () => {
  assert.match(service, /nextActionLabel: 'View Onboarding'/);
  assert.match(service, /tab=leads&lead=/);
  assert.match(workspace, /searchParams\.get\('lead'\)/);
  assert.match(workspace, /setSelected\(lead\);setDrawerTab\(tab\)/);
  assert.match(workspace, /CustomerCommunicationDrawer/);
  assert.match(workspace, /next\.delete\('lead'\)/);
  assert.doesNotMatch(workspace, /window\.location\.assign/);
  assert.doesNotMatch(workspace, /next\.set\('tab','leads'\)/);

  assert.match(drawer, /CustomerCommunicationDrawer/);
  assert.match(drawer, /conversationOpen/);
  assert.match(drawerBase, /item\.id==='communication'\?onOpenConversation\(\):setTab\(item\.id\)/);
  assert.match(drawerBase, /ConversationHandoff lead=\{lead\} onOpen=\{onOpenConversation\}/);
  assert.doesNotMatch(drawerBase, /tab=inbox&lead=/);
});

test('closed customers are searchable and paginated rather than limited to recent 20', () => {
  assert.match(migration, /crm_get_seller_closed_customers/);
  assert.match(migration, /p_search text/);
  assert.match(migration, /p_limit integer/);
  assert.match(migration, /p_offset integer/);
  assert.doesNotMatch(migration, /limit 20/i);
  assert.match(service, /getClosed/);
  assert.match(panel, /Search all closed customers/);
  assert.match(panel, /Previous/);
  assert.match(panel, /Next/);
});

test('seller command center prioritizes attention while retaining legacy tools', () => {
  assert.match(panel, /What Needs My Attention/);
  assert.match(commandCenter, /<details/);
  assert.match(commandCenter, /Seller tools, performance & history/);
  assert.match(commandCenter, /SellerExperienceLegacy/);
});

test('new lifecycle integrations remain RPC-only in the frontend service', () => {
  assert.match(service, /crm_get_seller_customer_lifecycle/);
  assert.match(service, /crm_get_seller_closed_customers/);
  assert.doesNotMatch(service, /\.from\(/);
});
