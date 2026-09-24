import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const templates = readFileSync('supabase/migrations/20260904105019_explicit_service_family_onboarding_templates.sql', 'utf8');
const editReconciliation = readFileSync('supabase/migrations/20260904105933_explicit_service_family_edit_reconciliation.sql', 'utf8');
const dedupeLibrary = readFileSync('supabase/migrations/20260904110323_deduplicate_onboarding_field_library.sql', 'utf8');
const snapshotResolver = readFileSync('supabase/migrations/20260904100016_scope_aware_onboarding_snapshot_backfill.sql', 'utf8');

test('onboarding catalog has explicit future service families and template-backed product fields', () => {
  assert.match(templates, /add column if not exists service_family text/i);
  assert.match(templates, /add column if not exists onboarding_template_key text/i);
  for (const family of ['website', 'automation', 'email_marketing', 'web_app', 'mobile_app', 'saas', 'custom_software']) {
    assert.match(templates, new RegExp(`"key":"${family}"`));
  }
  assert.match(templates, /alter column service_family set not null/i);
  assert.match(templates, /alter column onboarding_template_key set not null/i);
});

test('web app, mobile app, SaaS, automation and email templates capture delivery-critical information', () => {
  assert.match(templates, /"key":"web_app"[\s\S]*?"userJourneyRequirements"[\s\S]*?"authPermissions"[\s\S]*?"dataRequirements"[\s\S]*?"acceptanceCriteria"/);
  assert.match(templates, /"key":"mobile_app"[\s\S]*?"platformTargets"[\s\S]*?"notificationRequirements"[\s\S]*?"appStoreRequirements"[\s\S]*?"acceptanceCriteria"/);
  assert.match(templates, /"key":"saas"[\s\S]*?"businessModel"[\s\S]*?"billingEntitlementRequirements"[\s\S]*?"securityComplianceRequirements"[\s\S]*?"acceptanceCriteria"/);
  assert.match(templates, /"key":"automation"[\s\S]*?"automationCurrentProcess"[\s\S]*?"automationExceptionRules"[\s\S]*?"acceptanceCriteria"/);
  assert.match(templates, /"key":"email_marketing"[\s\S]*?"emailMarketingGoals"[\s\S]*?"emailAudienceRequirements"[\s\S]*?"emailCampaignRequirements"[\s\S]*?"trackingGoals"/);
});

test('purchased scope adds only feature-specific onboarding requirements and deduplicates them', () => {
  for (const field of ['bookingRequirements', 'chatRequirements', 'crmRequirements', 'emailAutomationRequirements', 'trackingGoals', 'paymentGatewayRequirements', 'notificationRequirements', 'dataMigrationRequirements', 'authPermissions', 'adminReporting', 'integrationRequirements', 'offlineDeviceRequirements']) {
    assert.match(templates, new RegExp(`v_extra:=array_append\\(v_extra,'${field}'\\)`));
  }
  assert.match(templates, /if not \(v_key=any\(v_result\)\) then v_result:=array_append\(v_result,v_key\)/);
  assert.match(dedupeLibrary, /distinct on \(entry\.item->>'key'\)/);
  assert.match(dedupeLibrary, /jsonb_set\(cfg\.config_value,'\{fieldLibrary\}'/);
});

test('quotation onboarding remains frozen to committed purchased lines only', () => {
  assert.match(snapshotResolver, /coalesce\(qi\.optional_for_client,false\)=false/);
  assert.match(snapshotResolver, /v_snapshot_item->'onboardingFields'/);
  assert.match(snapshotResolver, /v_snapshot_item->'onboardingRequirements'/);
});

test('catalog edits recalculate automatic classifications while preserving genuine custom mappings', () => {
  assert.match(editReconciliation, /v_current_source='custom'/);
  assert.match(editReconciliation, /v_service_family:=public\.client_onboarding_infer_service_family/);
  assert.match(editReconciliation, /v_template_key:=public\.client_onboarding_infer_template_key/);
  assert.match(editReconciliation, /public\.client_onboarding_template_requirements\(v_template_key,v_scope,v_service_family\)/);
  assert.match(editReconciliation, /'source','custom'/);
});
