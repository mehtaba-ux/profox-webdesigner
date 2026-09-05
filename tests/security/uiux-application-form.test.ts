import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const formSource = readFileSync('src/components/careers/UIUXDesignerApplicationForm.tsx', 'utf8');
const configSource = readFileSync('src/lib/uiuxApplicationFormConfig.ts', 'utf8');
const adminSource = readFileSync('src/components/admin/CareerJobsAdmin.tsx', 'utf8');
const editorSource = readFileSync('src/components/admin/UIUXApplicationFormEditor.tsx', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260905150000_uiux_application_form_v2.sql', 'utf8');

test('UIUX public application is a guided six-step flow with review-before-submit', () => {
  for (const id of ['profile', 'experience', 'portfolio', 'skills', 'work', 'review']) {
    assert.match(configSource, new RegExp(`id:'${id}'`));
  }
  assert.match(formSource, /Step \{currentStep \+ 1\} of \{steps\.length\}/);
  assert.match(formSource, /Review what you entered/);
  assert.match(formSource, /onClick=\{\(\)=>onEdit\(index\)\}/);
  assert.match(formSource, /Continue <ArrowRight/);
  assert.match(formSource, /Submit application/);
});

test('UIUX application keeps identity, portfolio, CV and consent controls non-optional', () => {
  for (const id of ['fullName', 'email', 'country', 'timezone', 'portfolioUrl', 'portfolioSharingConsent', 'availableHoursPerWeek', 'hasLaptopInternet', 'cv', 'consentAccurate', 'consentPrivacy']) {
    assert.match(configSource, new RegExp(`id:'${id}'[^\n]*lockedRequired:true`));
  }
  assert.match(configSource, /if \(definition\?\.lockedRequired\) return true/);
  assert.doesNotMatch(formSource, /localStorage|sessionStorage/);
});

test('UIUX form content is editable from the existing Admin Job Posts screen', () => {
  assert.match(adminSource, /UIUXApplicationFormEditor/);
  assert.match(adminSource, /details\.systemRole === 'uiux_designer'/);
  assert.match(adminSource, /onChange=\{\(next\) => updateDetails\(\{ applicationForm: next \}\)\}/);
  assert.match(editorSource, /Form content, requirements & order/);
  assert.match(editorSource, /Minimum weekly hours/);
  assert.match(editorSource, /Recruitment source options/);
  assert.match(editorSource, /Visible/);
  assert.match(editorSource, /Required/);
  assert.match(editorSource, /moveField/);
});

test('server submission enforces Admin-configured required fields without weakening CV verification', () => {
  assert.match(migrationSource, /role_details->'applicationForm'->'fieldConfig'/);
  assert.match(migrationSource, /coalesce\(\(v_field_cfg->>'required'\)::boolean,false\)/);
  assert.match(migrationSource, /jsonb_array_elements_text\(v_field_cfg->'options'\)/);
  assert.match(migrationSource, /recruitment_upload_intents/);
  assert.match(migrationSource, /storage\.objects/);
  assert.match(migrationSource, /application_policy_snapshot/);
});
