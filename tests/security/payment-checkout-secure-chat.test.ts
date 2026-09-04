import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const checkout = readFileSync('src/pages/PublicPaymentCheckout.tsx', 'utf8');
const gatewayService = readFileSync('src/lib/paymentGatewayService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260904170000_public_payment_secure_sales_chat_bridge.sql', 'utf8');

test('payment support action reuses the existing secure customer chat experience', () => {
  assert.match(checkout, /Chat with your ProFox representative/);
  assert.match(checkout, /MessageSquare/);
  assert.match(checkout, /paymentGatewayService\.openSupportChat\(token\)/);
  assert.match(checkout, /target\.pathname\.startsWith\('\/chat\/'\)/);
  assert.match(gatewayService, /open_public_payment_support_chat/);
});

test('payment-to-chat bridge validates the payment token and reuses quotation conversation infrastructure', () => {
  assert.match(migration, /extensions\.digest\(p_token, 'sha256'\)/);
  assert.match(migration, /public_payment_token_hash = v_hash/);
  assert.match(migration, /quotation_conversation_resolve\(v_payment\.quotation_id\)/);
  assert.match(migration, /service_sales_chat_customer_link_url\(v_conversation_id, null\)/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.sales_chat_conversations/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.sales_chat_customer_links/i);
});

test('public payment payload still does not expose a seller identifier for chat routing', () => {
  assert.doesNotMatch(gatewayService, /salespersonId/);
  assert.doesNotMatch(gatewayService, /currentSalesId/);
  assert.doesNotMatch(gatewayService, /originalSalesId/);
});
