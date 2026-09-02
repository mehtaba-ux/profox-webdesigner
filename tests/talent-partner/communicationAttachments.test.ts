import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('unified communication keeps file controls on supported channels and WhatsApp text-only', () => {
  const crm = read('src/components/admin/SalesChatInbox.tsx');
  const customer = read('src/pages/CustomerChatPage.tsx');
  const portal = read('src/components/client/ClientRelationshipHistory.tsx');
  const projectChat = read('src/components/client/ClientProjectChat.tsx');

  assert.match(crm, /attachmentsEnabled=\{replyMode !== 'whatsapp'\}/);
  assert.match(crm, /PROFESSIONAL_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES/);
  assert.match(crm, /uploadSalesAttachment/);
  assert.match(customer, /CommunicationAttachmentList/);
  assert.match(customer, /uploadSalesAttachment/);
  assert.match(portal, /client_get_relationship_history_v2/);
  assert.match(portal, /uploadClientPortalSalesAttachment/);
  assert.match(projectChat, /uploadInternalAttachment/);
  assert.match(projectChat, /CommunicationComposerTools/);
});

test('professional email routes R2 files through dedicated Zoho attachment provider flow', () => {
  const mail = read('src/lib/professionalMailService.ts');
  const provider = read('supabase/functions/zoho-mail-attachments/index.ts');
  const worker = read('worker/index.ts');

  assert.match(mail, /attachments\.length \? 'zoho-mail-attachments' : 'zoho-mail-admin'/);
  assert.match(mail, /sync_inbox_attachments/);
  assert.doesNotMatch(mail, /contentBase64/);

  assert.match(provider, /communication_attachment_bind_email_request/);
  assert.match(provider, /service-email-export/);
  assert.match(provider, /messages\/attachments/);
  assert.match(provider, /attachmentinfo\?includeInline=false/);
  assert.match(provider, /service-email-ingest/);
  assert.match(provider, /attachments: providerAttachments/);

  assert.match(worker, /service-email-ingest/);
  assert.match(worker, /service-email-export/);
  assert.match(worker, /client_relationship/);
  assert.match(worker, /X-ProFox-Attachment-Ingest-Token/);
});

test('attachment bridge migration preserves customer-only portal access and service-only secret retrieval', () => {
  const migration = read('supabase/migrations/20260902145558_communication_attachments_client_portal_and_email_r2_bridge.sql');

  assert.match(migration, /client_portal_can_access_sales_conversation/);
  assert.match(migration, /u\.role='customer'/);
  assert.match(migration, /lower\(coalesce\(u\.status,''\)\)='active'/);
  assert.match(migration, /revoke all on function public\.service_get_communication_attachment_ingest_secret\(\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.service_get_communication_attachment_ingest_secret\(\) to service_role/i);
  assert.match(migration, /communication_attachment_service_email_export/);
  assert.match(migration, /communication_attachment_service_prepare_email_ingest/);
  assert.match(migration, /client_get_relationship_history_v2/);
});
