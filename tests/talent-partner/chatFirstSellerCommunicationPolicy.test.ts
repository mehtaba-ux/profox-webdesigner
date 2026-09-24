import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260903063353_chat_first_seller_communication_policy.sql', 'utf8');
const inbox = readFileSync('src/components/admin/SalesChatInbox.tsx', 'utf8');
const provisioning = readFileSync('supabase/functions/process-professional-mailbox-provisioning/index.ts', 'utf8');
const lifecycle = readFileSync('supabase/functions/process-professional-mailbox-lifecycle/index.ts', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-professional-mailbox-worker.yml', 'utf8');

test('seller professional email is blocked at the authority layer while management remains eligible', () => {
  assert.match(migration, /array\['admin','project_manager','site_manager'\]::text\[\]/);
  assert.match(migration, /trg_enforce_professional_mailbox_role_policy/);
  assert.match(migration, /Seller professional email removed\. Customer communication uses secure ProFox Chat\./);
  assert.match(migration, /zoho_user_mail_send_connections/);
  assert.match(migration, /canViewEmail',v_can_view_email,'canSendEmail',v_can_send_email/);
});

test('transactional communication points customers back to the persistent secure chat', () => {
  assert.match(migration, /service_customer_relationship_chat_url/);
  assert.match(migration, /build_sales_meeting_customer_payload/);
  assert.match(migration, /quotation_conversation_resume_url/);
  assert.match(migration, /'conversationUrl'/);
  assert.match(migration, /continue in your secure ProFox conversation/);
});

test('seller UI has no professional email channel while historical email remains renderable', () => {
  assert.match(inbox, /PROFESSIONAL_EMAIL_ROLES = new Set\(\['admin','project_manager','site_manager'\]\)/);
  assert.match(inbox, /canUseProfessionalEmail && <button[\s\S]*?>Professional Email/);
  assert.match(inbox, /canUseProfessionalEmail && conversation\.hasEmail/);
  assert.match(inbox, /channel === 'email' \? <Mail/);
  assert.match(inbox, /!canUseProfessionalEmail && replyMode === 'email'/);
});

test('mailbox workers fail closed for sellers and use reversible Zoho lifecycle controls', () => {
  assert.match(provisioning, /service_professional_mailbox_eligible/);
  assert.match(provisioning, /ineligible_skipped/);
  assert.match(lifecycle, /mode: "disableUser"/);
  assert.match(lifecycle, /mode: "enableUser"/);
  assert.match(lifecycle, /removeMailforward: false/);
  assert.match(lifecycle, /removeGroupMembership: false/);
  assert.doesNotMatch(lifecycle, /method:\s*"DELETE"/);
  assert.match(deploy, /process-professional-mailbox-lifecycle/);
});