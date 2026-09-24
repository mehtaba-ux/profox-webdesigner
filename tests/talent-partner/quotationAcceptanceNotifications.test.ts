import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260903052641_quotation_acceptance_staff_notifications.sql', 'utf8');

test('quotation acceptance notifies seller and responsible management exactly once', () => {
  assert.match(migration, /quotation_accepted_internal/);
  assert.match(migration, /notify_quotation_accepted_staff/);
  assert.match(migration, /trg_notify_quotation_accepted_staff/);
  assert.match(migration, /after update of status,accepted_at on public\.quotations/i);
  assert.match(migration, /new\.status<>'Accepted'/);
  assert.match(migration, /old\.status='Accepted' and old\.accepted_at is not distinct from new\.accepted_at/);

  assert.match(migration, /new\.salesperson_id/);
  assert.match(migration, /:seller:/);
  assert.match(migration, /array\[new\.approved_by,new\.approval_decided_by\]/);
  assert.match(migration, /managerUserIds/);
  assert.match(migration, /service_queue_active_admins_operational_notification/);
  assert.match(migration, /v_has_secondary/);
});

test('quotation acceptance staff notification is in-app plus email and points to canonical quote', () => {
  assert.match(migration, /service_queue_staff_operational_notification/);
  assert.match(migration, /\/admin\/focus\/quotation\//);
  assert.match(migration, /notificationCategory','Action Required'/);
  assert.match(migration, /notificationPriority','High'/);
  assert.match(migration, /From site to system\./);
  assert.match(migration, /https:\/\/www\.profoxwebdesigner\.com\//);
});

test('quotation acceptance trigger helper is not callable by normal users', () => {
  assert.match(migration, /revoke all on function public\.notify_quotation_accepted_staff\(\) from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.notify_quotation_accepted_staff\(\) to service_role/i);
});
