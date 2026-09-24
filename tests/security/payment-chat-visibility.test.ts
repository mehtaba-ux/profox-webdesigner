import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const checkout = readFileSync('src/pages/PublicPaymentCheckout.tsx', 'utf8');

function supportCardSource() {
  const start = checkout.indexOf('function SupportCard()');
  const end = checkout.indexOf('function VerifiedPayment', start);
  assert.notEqual(start, -1, 'SupportCard must exist');
  assert.notEqual(end, -1, 'SupportCard boundary must exist');
  return checkout.slice(start, end);
}

test('payment checkout keeps one native chat action inside the SupportCard', () => {
  const support = supportCardSource();
  assert.match(support, /Need help before paying\?/);
  assert.match(support, /<button[^>]*onClick=\{\(\) => void openChat\(\)\}/);
  assert.match(support, /Chat with your ProFox representative/);
  assert.match(support, /<MessageSquare className="h-4 w-4" \/>/);
  assert.equal((support.match(/Chat with your ProFox representative/g) || []).length, 1);
});

test('payment chat action reuses the existing secure Sales chat flow', () => {
  const support = supportCardSource();
  assert.match(support, /paymentGatewayService\.openSupportChat\(token\)/);
  assert.match(support, /target\.pathname\.startsWith\('\/chat\/'\)/);
  assert.match(support, /window\.location\.assign/);
  assert.doesNotMatch(support, /createElement\('button'\)/);
  assert.doesNotMatch(main, /paymentSupportVisibility/);
});
