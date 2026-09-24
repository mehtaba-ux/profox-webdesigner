import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260903121000_razorpay_test_checkout_and_customer_payment_actions.sql', 'utf8');
const checkoutFunction = readFileSync('supabase/functions/payment-checkout/index.ts', 'utf8');
const checkoutPage = readFileSync('src/pages/PublicPaymentCheckout.tsx', 'utf8');
const gatewayService = readFileSync('src/lib/paymentGatewayService.ts', 'utf8');
const relationshipHistory = readFileSync('src/components/client/ClientRelationshipHistory.tsx', 'utf8');
const adminSettings = readFileSync('src/components/admin/PaymentGatewaySettingsAdmin.tsx', 'utf8');

test('Razorpay Test mode can be checkout-ready without becoming production-ready', () => {
  assert.match(migration, /payment_gateway_provider_checkout_enabled/);
  assert.match(migration, /mode',''\)\)='test'/);
  assert.match(migration, /\^rzp_test_/);
  assert.match(migration, /'productionReady',v_production_ready/);
  assert.match(migration, /'testMode',v_checkout_enabled and not v_production_ready/);
  assert.match(migration, /payment_gateway_provider_ready\(v_provider,v_pc\)/);
});

test('Razorpay checkout converts quotation currency to a locked INR provider charge', () => {
  assert.match(checkoutFunction, /api\.frankfurter\.app\/latest/);
  assert.match(checkoutFunction, /service_store_payment_gateway_quote/);
  assert.match(checkoutFunction, /p_provider_currency: "INR"/);
  assert.match(checkoutFunction, /Razorpay checkout must be created in INR/);
  assert.match(checkoutFunction, /providerAmount: charge\.providerAmount/);
  assert.match(checkoutFunction, /providerCurrency: charge\.providerCurrency/);
  assert.match(checkoutFunction, /attempt\.providerAmount/);
  assert.match(checkoutFunction, /attempt\.providerCurrency/);
  assert.match(checkoutFunction, /locked ProFox INR payment request/);
  assert.match(checkoutFunction, /Recent stored reference/);
});

test('public checkout exposes provider mode metadata and an explicit Razorpay Test action', () => {
  assert.match(gatewayService, /productionReady\?: boolean/);
  assert.match(gatewayService, /testMode\?: boolean/);
  assert.match(checkoutPage, /Pay with \{provider\.label\}/);
  assert.match(checkoutPage, /PAYMENT_ASSETS\[provider\.id\]/);
  assert.match(checkoutPage, /Razorpay · Test Mode/);
  assert.match(checkoutPage, /no real customer funds should be charged/i);
});

test('public checkout explains and displays the automatic INR conversion', () => {
  assert.match(checkoutPage, /server-side USD→INR reference rate is locked/);
  assert.match(checkoutPage, /Razorpay conversion locked/);
  assert.match(checkoutPage, /Final Razorpay charge/);
  assert.match(checkoutPage, /currency: 'INR'/);
  assert.match(checkoutPage, /Equivalent to/);
});

test('customer portal loads only authenticated customer payment actions and shows Razorpay CTA', () => {
  assert.match(migration, /create or replace function public\.client_get_payment_actions\(\)/i);
  assert.match(migration, /where ci\.linked_user_id=v_uid/);
  assert.match(migration, /grant execute on function public\.client_get_payment_actions\(\) to authenticated/);
  assert.match(relationshipHistory, /supabase\.rpc\('client_get_payment_actions'\)/);
  assert.match(relationshipHistory, /Pay with Razorpay/);
});

test('admin distinguishes Test checkout readiness from production readiness', () => {
  assert.match(adminSettings, /clientCheckoutReady/);
  assert.match(adminSettings, /productionCheckoutReady/);
  assert.match(adminSettings, /Razorpay Test checkout is active/);
  assert.match(adminSettings, /intentionally not production-ready/);
});
