import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/pages/ClientOnboardingPage.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260904111859_onboarding_core_discovery_mandatory.sql', 'utf8');

test('client onboarding is a maximum four-step progressive form', () => {
  assert.match(page, /const STEP_META = \[/);
  for (const id of ['business', 'experience', 'requirements', 'launch']) {
    assert.match(page, new RegExp(`id: '${id}'`));
  }
  assert.match(page, /Step \{safeCurrentStep \+ 1\} of \{steps\.length\}/);
  assert.match(page, /goNext/);
  assert.match(page, /completeOnboarding/);
});

test('client onboarding keeps every resolved field while reducing visual length', () => {
  assert.match(page, /fields\.forEach\(\(field, originalIndex\)/);
  assert.match(page, /optionalFields\.map\(renderField\)/);
  assert.match(page, /Optional details \(\{optionalFields\.length\}\)/);
  assert.match(page, /View purchased scope details/);
  assert.match(page, /<details/);
});

test('mobile onboarding removes nested scope gutter and horizontal overflow risks', () => {
  assert.match(page, /min-h-screen overflow-x-hidden/);
  assert.match(page, /max-w-3xl px-4/);
  assert.match(page, /grid min-w-0 gap-3 lg:grid-cols-2/);
  assert.match(page, /break-words/);
  assert.match(page, /-mx-4 border-t/);
});

test('mandatory discovery baseline is present in every onboarding form', () => {
  for (const key of ['projectGoals', 'targetAudience', 'primaryOffer', 'competitors']) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(migration, /v_key = 'competitors'[\s\S]*?'required', true/);
  assert.match(migration, /foreach v_core_key in array array\['projectGoals','targetAudience','primaryOffer','competitors'\]/);
  assert.match(migration, /v_base := v_base \|\| jsonb_build_array\(v_item\)/);
});

test('onboarding remains purchased-scope aware in the UI', () => {
  assert.match(page, /We only ask for information needed to deliver what you purchased\./);
  assert.match(page, /Purchased scope verified/);
  assert.match(page, /Anything outside this agreed scope should be handled as a scope change or add-on/);
});
