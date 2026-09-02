import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('seller-started Website Chat keeps a secure customer route and canonical launch path', () => {
  const app = read('src/App.tsx');
  const chatService = read('src/lib/chatService.ts');
  const inbox = read('src/lib/unifiedInboxService.ts');

  assert.match(app, /path="\/chat\/:token"/);
  assert.match(app, /path="\/chat\/session\/:conversationId"/);
  assert.match(chatService, /public_sales_chat_redeem_link/);
  assert.match(chatService, /sales_start_customer_chat/);
  assert.match(inbox, /conversationKind \|\| ''\) === 'website'/);
  assert.match(inbox, /preferredLeadId \? capabilityTarget\.id/);
});

test('customer chat migration preserves least privilege and customer-safe requirements', () => {
  const migration = read('supabase/migrations/20260902101549_sales_started_customer_chat_magic_link.sql');

  assert.match(migration, /alter table public\.sales_chat_customer_links enable row level security/i);
  assert.match(migration, /revoke all on public\.sales_chat_customer_links from anon, authenticated/i);
  assert.match(migration, /sales_chat_is_staff\(\)/);
  assert.match(migration, /crm_can_access_lead/);
  assert.match(migration, /v_lead\.project_details/);
  assert.doesNotMatch(migration, /v_lead\.notes/);
  assert.match(migration, /customer_sales_chat_started/);
  assert.match(migration, /\{\{websiteUrl\}\}/);
});

test('paid Client Portal keeps customer-facing chat, email and WhatsApp while excluding internal notes', () => {
  const portalMigration = read('supabase/migrations/20260902102843_client_portal_unified_relationship_communication.sql');
  const portalUi = read('src/components/client/ClientRelationshipHistory.tsx');

  assert.match(portalMigration, /client_email_messages/);
  assert.match(portalMigration, /client_whatsapp_messages/);
  assert.match(portalMigration, /not m\.is_internal_note/);
  assert.match(portalUi, /touchClientPortalConversation/);
  assert.match(portalUi, /Sales & relationship conversations/);
});
