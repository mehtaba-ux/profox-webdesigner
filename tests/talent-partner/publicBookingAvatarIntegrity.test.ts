import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260831192000_fix_public_booking_avatar_source.sql', 'utf8');
const bookingService = readFileSync('src/lib/bookingService.ts', 'utf8');
const publicBookingFlow = readFileSync('src/components/PublicBookingFlow.tsx', 'utf8');

test('public booking always reads the canonical staff profile photo', () => {
  assert.match(migration, /new\.avatar_url := ''/i);
  assert.match(migration, /like 'data:%'/i);
  assert.match(migration, /sales\.demo@profoxwebdesigner\.test/i);
  assert.doesNotMatch(bookingService, /avatar_url:\s*profile\.avatarUrl/i);
});

test('the recovered Sales test photo is durable R2 media', () => {
  assert.match(migration, /aftab-public-profile\.webp/i);
  assert.doesNotMatch(migration, /data:image/i);
});

test('booking cards use the shared resilient avatar renderer', () => {
  assert.match(publicBookingFlow, /import AppAvatar from '.\/admin\/workspace\/AppAvatar'/i);
  assert.match(publicBookingFlow, /<AppAvatar name=\{expert\.displayName\} src=\{expert\.avatarUrl\}/i);
  assert.doesNotMatch(publicBookingFlow, /<img src=\{expert\.avatarUrl\}/i);
});
