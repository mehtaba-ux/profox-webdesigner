import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const visibility = readFileSync('src/lib/paymentSupportVisibility.ts', 'utf8');
const checkout = readFileSync('src/pages/PublicPaymentCheckout.tsx', 'utf8');

test('payment checkout loads the chat visibility guard globally', () => {
  assert.match(main, /paymentSupportVisibility/);
});

test('visibility guard reuses the existing secure chat button instead of creating another chat flow', () => {
  assert.match(visibility, /Chat with your ProFox representative/);
  assert.match(visibility, /querySelectorAll<HTMLButtonElement>\('button'\)/);
  assert.match(visibility, /position: 'fixed'/);
  assert.match(visibility, /zIndex: '2147483000'/);
  assert.doesNotMatch(visibility, /open_public_payment_support_chat/);
  assert.doesNotMatch(visibility, /createElement\('button'\)/);
  assert.match(checkout, /paymentGatewayService\.openSupportChat\(token\)/);
  assert.match(checkout, /<MessageSquare className="h-4 w-4" \/>/);
});
