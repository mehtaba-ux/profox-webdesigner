import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260920150000_crm_sales_payment_won_activation_part_12.sql', 'utf8');
const crmService = await readFile('src/lib/crmService.ts', 'utf8');
const sellerService = await readFile('src/lib/sellerCommandCenterService.ts', 'utf8');
const pipeline = await readFile('src/components/admin/CRMPipeline.tsx', 'utf8');
const sellerWorkspace = await readFile('src/components/admin/SellerExperienceLegacy.tsx', 'utf8');
const paymentsUi = await readFile('src/components/admin/PaymentsManager.tsx', 'utf8');
const salesService = await readFile('src/lib/salesService.ts', 'utf8');

test('Part 12 creates no duplicate business table and derives a bounded activation read model', () => {
  assert.doesNotMatch(migration, /create\s+table/i);
  assert.match(migration, /crm_get_sale_activation_state\(p_opportunity_id uuid\)/i);
  assert.match(migration, /crm_get_sale_activation_queue\(\)/i);
  for (const source of ['public.payments','public.quotations','public.crm_opportunities','public.crm_activities','public.clients','public.projects','public.client_onboardings','public.commission_entries']) {
    assert.match(migration, new RegExp(source.replace('.','\\.')));
  }
});

test('accepted quotation requires both Accepted status and accepted_at', () => {
  assert.match(migration, /v_q\.status<>'Accepted' or v_q\.accepted_at is null/i);
  assert.match(migration, /q\.status='Accepted'[\s\S]{0,100}q\.accepted_at is not null/i);
});

test('payment verification is restricted to Admin or protected gateway settlement', () => {
  assert.match(migration, /not public\.is_admin\(\) and not v_gateway/i);
  assert.match(migration, /Payment verification is restricted to Admin or trusted gateway settlement/i);
  assert.match(migration, /profox\.gateway_settlement/);
});

test('browser cannot forge payment settlement evidence including through Admin direct table update', () => {
  assert.match(migration, /profox\.payment_verification_rpc/);
  assert.match(migration, /Payment settlement evidence is server-derived/i);
  assert.match(migration, /before insert or update on public\.payments/i);
  assert.match(migration, /new\.verified_at is distinct from old\.verified_at/i);
  assert.match(migration, /new\.verified_by is distinct from old\.verified_by/i);
  assert.match(migration, /new\.amount_paid is distinct from old\.amount_paid/i);
});

test('partial payment stays Partially Paid and returns before Won activation', () => {
  const partial = migration.indexOf("status='Partially Paid'");
  const won = migration.indexOf("set status='Won'", partial);
  assert.ok(partial >= 0);
  assert.ok(won > partial);
  assert.match(migration.slice(partial, won), /return v_payment\.client_id/i);
});

test('Won is an outcome of canonical verification, not a manual pipeline action', () => {
  assert.match(migration, /profox\.payment_verified_won_transition/);
  assert.match(migration, /Won is created automatically when a qualifying payment is verified/i);
  assert.match(pipeline, /stage\.name === 'Won'/);
  assert.match(crmService, /Opportunities may only become Won through Admin-verified advance\/full payment/i);
});

test('direct Won writes and Won inserts are protected', () => {
  assert.match(migration, /if tg_op='INSERT'[\s\S]*new\.status='Won' or new\.stage='Won'/i);
  assert.match(migration, /before insert or update on public\.crm_opportunities/i);
  assert.match(migration, /v_verified_won<>'1'/i);
});

test('Awaiting Advance Payment is protected by canonical customer acceptance', () => {
  assert.match(migration, /new\.stage='Awaiting Advance Payment'/);
  assert.match(migration, /Customer acceptance is required before moving this opportunity to Awaiting Advance Payment/i);
  assert.match(migration, /q\.opportunity_id=new\.id[\s\S]{0,160}q\.status='Accepted'[\s\S]{0,100}q\.accepted_at is not null/i);
});

test('payment quotation opportunity lineage and cross-client activation are fail-closed', () => {
  assert.match(migration, /The Payment is linked to a different quotation\/opportunity/i);
  assert.match(migration, /Cross-client activation is blocked/i);
  assert.match(migration, /v_opp\.client_id is distinct from v_quote\.client_id/i);
  assert.match(migration, /v_opp\.client_id is distinct from v_payment\.client_id/i);
  assert.match(migration, /v_quote\.client_id is distinct from v_payment\.client_id/i);
});

test('client, commission, project and onboarding activation reuse canonical functions and records', () => {
  assert.match(migration, /insert into public\.clients/i);
  assert.match(migration, /generate_commission_for_verified_payment/i);
  assert.match(migration, /create_project_from_sale/i);
  assert.match(migration, /public\.client_onboardings/i);
  assert.doesNotMatch(migration, /won_clients|sales_clients_v2|project_customers|payment_followups|payment_tasks/i);
});

test('read model represents external payment wait without inventing an Activity', () => {
  assert.match(migration, /externalWaitRepresented/);
  assert.match(migration, /waitingOn','Customer payment/);
  assert.match(migration, /Follow up if unpaid by the due date/i);
  assert.doesNotMatch(migration, /insert into public\.crm_activities/i);
});

test('Payment Follow-Up remains canonical crm_activities truth', () => {
  assert.match(migration, /a\.activity_type='Payment Follow-Up'/);
  assert.match(migration, /public\.crm_activities/);
  assert.doesNotMatch(migration, /create\s+table[^;]*(payment_tasks|payment_followups|collection_reminders_v2)/i);
});

test('read model never exposes payment link or provider token', () => {
  const readModel = migration.slice(migration.indexOf('create or replace function public.crm_get_sale_activation_state'));
  assert.doesNotMatch(readModel, /'paymentLink'|'providerPaymentId'|'provider_payment_id'|'public_payment_token_hash'/i);
  assert.match(readModel, /'requestAvailable'/);
});

test('Seller and Pipeline services reuse the same bounded read RPC', () => {
  assert.match(crmService, /crm_get_sale_activation_queue/);
  assert.match(sellerService, /crm_get_sale_activation_queue/);
  assert.match(crmService, /saleActivation/);
  assert.match(sellerService, /saleActivation/);
});

test('Seller surfaces operational payment truth but no verify action', () => {
  assert.match(sellerWorkspace, /Payment \/ sale activation/);
  assert.match(sellerWorkspace, /Outstanding|outstanding/);
  assert.match(sellerWorkspace, /OVERDUE/);
  assert.match(sellerWorkspace, /Review verification/);
  assert.doesNotMatch(sellerWorkspace, /verifyPayment\(/);
});

test('Payment Admin keeps verification in canonical Payments workflow', () => {
  assert.match(paymentsUi, /Admin verify payment through protected workflow/);
  assert.match(paymentsUi, /salesService\.verifyPayment/);
  assert.match(salesService, /supabase\.rpc\('verify_payment_atomic'/);
});

test('Part 10B policy is asserted before and after Part 12 migration', () => {
  assert.ok((migration.match(/finalQuotationSendGateActive/g) || []).length >= 2);
  assert.match(migration, /policyVersion/);
  assert.match(migration, /snapshotSchemaVersion/);
  assert.match(migration, /<> 2/);
});

test('Part 12 performs no production business-data backfill', () => {
  const beforeFunctions = migration.split('create or replace function public.protect_payment_verification_fields')[0];
  assert.doesNotMatch(beforeFunctions, /insert into public\.(payments|clients|projects|client_onboardings|crm_activities)/i);
  assert.doesNotMatch(beforeFunctions, /update public\.(payments|quotations|crm_opportunities|clients|projects|client_onboardings)/i);
});

test('refund history remains a payment status and no Un-Won model is introduced', () => {
  assert.match(migration, /Refunded|Partially Refunded/);
  assert.doesNotMatch(migration, /un.?won|reopen.*won|reverse.*won/i);
});

test('Part 13 handoff acceptance is not implemented', () => {
  assert.doesNotMatch(migration, /handoff_accept|handoff_return|delivery_accept|delivery_return/i);
  assert.doesNotMatch(crmService + sellerService + pipeline + sellerWorkspace + paymentsUi, /handoff_accept|handoff_return|delivery_accept|delivery_return/i);
});
