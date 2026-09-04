import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const checkout = readFileSync('src/pages/PublicPaymentCheckout.tsx', 'utf8');
const gatewayService = readFileSync('src/lib/paymentGatewayService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260904103000_enrich_public_payment_checkout_context.sql', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
const secureBadge = readFileSync('assets/payment/secure-payment-badge.svg', 'utf8');

test('public payment payload exposes only customer-facing quotation and milestone context', () => {
  assert.match(migration, /'proposalTitle'/);
  assert.match(migration, /'paymentProgress'/);
  assert.match(migration, /'lastGatewayCharge'/);
  assert.match(migration, /coalesce\(qi\.optional_for_client,false\)=false/);
  assert.doesNotMatch(migration, /internal_notes/);
  assert.doesNotMatch(migration, /revenue_distribution/);
  assert.doesNotMatch(migration, /approved_commission_rate/);
});

test('payment checkout renders clarity, trust, milestone and provider information', () => {
  assert.match(checkout, /What you’re paying for/);
  assert.match(checkout, /Your payment plan/);
  assert.match(checkout, /What happens after payment/);
  assert.match(checkout, /Protected checkout/);
  assert.match(checkout, /Final Razorpay charge/);
  assert.match(checkout, /Payment received and verified/);
  assert.match(checkout, /Remaining scheduled balance/);
  assert.match(gatewayService, /paymentProgress\?: PublicPaymentMilestone\[\]/);
  assert.match(gatewayService, /lastGatewayCharge\?:/);
});

test('payment provider logos and secure badge are always served from Cloudflare R2 paths', () => {
  assert.match(checkout, /\/api\/r2-media\/payment-brand\/paypal-logo\.png/);
  assert.match(checkout, /\/api\/r2-media\/payment-brand\/razorpay-logo\.png/);
  assert.match(checkout, /\/api\/r2-media\/payment-brand\/secure-payment-badge\.svg/);
  assert.match(secureBadge, /Secure Payment/);
  assert.match(secureBadge, /Server verified/);
});

test('production deployment syncs original provider assets into R2 and verifies them publicly', () => {
  assert.match(deploy, /www\.paypalobjects\.com\/webstatic\/mktg\/Logo\/pp-logo-200px\.png/);
  assert.match(deploy, /d6xcmfyh68wv8\.cloudfront\.net\/newsroom-content\/uploads\/2021\/02\/white\.png/);
  assert.match(deploy, /wrangler r2 object put 'profox-media\/payment-brand\/paypal-logo\.png'/);
  assert.match(deploy, /wrangler r2 object put 'profox-media\/payment-brand\/razorpay-logo\.png'/);
  assert.match(deploy, /wrangler r2 object put 'profox-media\/payment-brand\/secure-payment-badge\.svg'/);
  assert.match(deploy, /Verify payment brand assets are served from R2/);
});
