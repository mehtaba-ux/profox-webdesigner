import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(resolve(here, '../../supabase/functions/process-google-calendar-sync/index.ts'), 'utf8');
const migration = readFileSync(
  resolve(here, '../../supabase/migrations/20260901050502_preserve_google_oauth_connection_on_sync_errors.sql'),
  'utf8',
);

test('ordinary Google sync failures preserve the seller OAuth connection', () => {
  assert.match(worker, /failOrRetry[\s\S]*?p_status:"connected"/i);
  assert.match(worker, /reconnect[\s\S]*?p_status:"reconnect_required"/i);
  assert.match(migration, /case when p_status='error' then 'connected' else p_status end/i);
});

test('legacy error rows with a stored OAuth token are repaired without exposing privileged access', () => {
  assert.match(migration, /where status='error'[\s\S]*?refresh_secret_id is not null[\s\S]*?disconnected_at is null/i);
  assert.match(migration, /revoke all on function public\.service_mark_google_connection_state\(uuid,text,text,boolean\) from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.service_mark_google_connection_state\(uuid,text,text,boolean\) to service_role,postgres/i);
});
