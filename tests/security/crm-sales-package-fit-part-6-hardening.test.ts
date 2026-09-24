import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const lower = (value: string) => value.toLowerCase();
const has = (text: string, needle: string) => lower(text).includes(lower(needle));
const no = (text: string, needle: string) => !has(text, needle);
const block = (text: string, startNeedle: string, endNeedle: string) => {
  const start = lower(text).indexOf(lower(startNeedle));
  assert.notEqual(start, -1, `Missing block start: ${startNeedle}`);
  const tail = text.slice(start);
  const end = lower(tail).indexOf(lower(endNeedle));
  return end === -1 ? tail : tail.slice(0, end);
};
const lastBlock = (text: string, startNeedle: string, endNeedle: string) => {
  const start = lower(text).lastIndexOf(lower(startNeedle));
  assert.notEqual(start, -1, `Missing block start: ${startNeedle}`);
  const tail = text.slice(start);
  const end = lower(tail).indexOf(lower(endNeedle));
  return end === -1 ? tail : tail.slice(0, end);
};

const hardening = read('supabase/migrations/20260909162000_crm_sales_package_fit_part_6_policy_hardening.sql');
const service = read('src/lib/crmPackageFitService.ts');
const panel = read('src/components/admin/crm/CRMPackageFitPanel.tsx');
const requirements = read('src/components/admin/crm/CRMRequirementsWorkspace.tsx');
const drawer = read('src/components/admin/crm/CRMLeadDrawerBase.tsx');

const policy = block(hardening, 'config_value = jsonb_build_object(', "description = 'Versioned deterministic Package Fit policy");
const rules = block(policy, "'rules', jsonb_build_array(", "'addonMappings', jsonb_build_array(");
const addonMappings = block(policy, "'addonMappings', jsonb_build_array(", '),\n    ),');
const evaluator = block(hardening, 'CREATE OR REPLACE FUNCTION public.crm_get_package_fit_assessment', 'COMMENT ON FUNCTION public.crm_get_package_fit_assessment');
const addonEvaluation = lastBlock(evaluator, 'FOR v_mapping IN SELECT value FROM jsonb_array_elements(v_addon_mappings)', 'FOR v_custom IN');

type Case = [string, () => void];
const cases: Case[] = [
  ['hardening keeps the same canonical policy key', () => { assert.ok(has(hardening, "config_key = 'crm_package_fit_policy_v1'")); assert.ok(no(hardening, 'sales_package_fit_policy')); }],
  ['hardening creates no Package Fit business table', () => { assert.ok(no(hardening, 'create table')); }],
  ['buying-process complexity does not force Scale', () => { assert.ok(no(rules, "'economic_buyer'")); assert.ok(no(rules, "'procurement_process'")); assert.ok(no(rules, "'stakeholder_map'")); assert.ok(no(rules, "'internal_champion'")); }],
  ['CRM integration is not a forced base-package rule', () => { assert.ok(no(rules, "'crm_integration'")); assert.ok(has(addonMappings, "'crm_integration'")); }],
  ['booking has a stable add-on mapping', () => { assert.ok(has(addonMappings, "'booking_required'")); assert.ok(has(addonMappings, "'PF-ADD-BOOKING'")); }],
  ['CRM has a stable add-on mapping', () => { assert.ok(has(addonMappings, "'crm_integration'")); assert.ok(has(addonMappings, "'PF-ADD-CRM'")); }],
  ['API add-on requires review rather than automatic base-package escalation', () => { assert.ok(no(rules, "'api_requirements'")); assert.ok(has(addonMappings, "'api_requirements'")); assert.ok(has(addonMappings, "'PF-ADD-API'")); }],
  ['subscription add-on requires review rather than automatic base-package escalation', () => { assert.ok(no(rules, "'subscription_requirement'")); assert.ok(has(addonMappings, "'PF-ADD-SUBSCRIPTION'")); }],
  ['ambiguous generic third-party integration is not guessed into an add-on', () => { assert.ok(no(addonMappings, "'third_party_integrations'")); }],
  ['mapped add-on codes are validated against sales_products', () => { assert.ok(has(evaluator, "WHERE sp.code = v_mapping->>'productCode'")); assert.ok(has(evaluator, 'CATALOG_ADDON_CODE_INVALID')); }],
  ['inactive or wrong-type add-ons fail configuration validation', () => { assert.ok(has(evaluator, 'CATALOG_ADDON_INACTIVE')); assert.ok(has(evaluator, "lower(COALESCE(v_addon.product_type,'')) <> 'addon'")); }],
  ['possible add-ons are returned as separate guidance', () => { assert.ok(has(evaluator, "'possibleAddOns',v_possible_addons")); assert.ok(has(service, 'possibleAddOns: CRMPackageFitAddonCandidate[]')); }],
  ['add-on evaluation does not alter base package rank', () => { assert.ok(no(addonEvaluation, 'v_min_rank := greatest')); assert.ok(no(addonEvaluation, 'v_min_rank =')); }],
  ['only client-confirmed mapped requirements produce add-on candidates', () => { assert.ok(has(addonEvaluation, "WHEN 'CLIENT_CONFIRMED' THEN")); assert.ok(has(addonEvaluation, 'v_possible_addons := v_possible_addons')); }],
  ['seller hypothesis does not confirm an add-on', () => { assert.ok(has(addonEvaluation, "WHEN 'SELLER_HYPOTHESIS' THEN")); assert.ok(has(addonEvaluation, 'no add-on is treated as confirmed')); }],
  ['awaiting-client add-on input remains unresolved', () => { assert.ok(has(addonEvaluation, "WHEN 'AWAITING_CLIENT' THEN")); assert.ok(has(addonEvaluation, 'client confirmation is still pending')); }],
  ['review-required mapped add-on creates validation signal only', () => { assert.ok(has(addonEvaluation, 'v_validation_signals')); assert.ok(has(addonEvaluation, 'part 6 creates no review record and no quote item')); }],
  ['base-package mismatches use hard confirmed complexity signals', () => { assert.ok(has(evaluator, 'v_mismatch_signals := v_hard_complexity_signals')); assert.ok(has(evaluator, "v_candidate_status := 'MISMATCH'")); }],
  ['review-required assessment does not return a reliable recommended package', () => { assert.ok(has(evaluator, 'IF NOT v_has_review')); assert.ok(has(evaluator, 'AND v_has_fit_input')); }],
  ['add-on commercial data is sourced live from sales_products', () => { assert.ok(has(addonEvaluation, "'name',v_addon.name")); assert.ok(has(addonEvaluation, "'basePrice',v_addon.base_price")); assert.ok(has(addonEvaluation, "'scope',v_addon.scope")); }],
  ['UI labels add-ons as possible current catalog guidance', () => { assert.ok(has(panel, 'Possible current catalog add-ons')); assert.ok(has(panel, 'not approved scope and not quotation items')); }],
  ['UI never auto-adds an add-on to quotation', () => { assert.ok(has(panel, 'never added to a quotation here')); assert.ok(no(panel, 'createQuoteItem')); assert.ok(no(panel, 'addQuoteItem')); }],
  ['hardening does not change quotation Pipeline payment or Won', () => { assert.ok(no(evaluator, 'insert into public.quot')); assert.ok(no(evaluator, 'crm_transition_opportunity')); assert.ok(no(evaluator, 'update public.payments')); assert.ok(no(evaluator, 'markwon')); }],
  ['Package Fit stays embedded in Requirements without a new Lead tab', () => { assert.ok(has(requirements, '<CRMPackageFitPanel')); assert.ok(no(drawer, "label: 'Package Fit'")); }],
  ['canonical evaluator remains auth-only', () => { assert.ok(has(hardening, 'REVOKE ALL ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) FROM anon')); assert.ok(has(hardening, 'GRANT EXECUTE ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) TO authenticated')); }],
];

test('CRM Sales SOP Part 6 policy-hardening acceptance coverage', async t => {
  assert.equal(cases.length, 25);
  for (const [name, verify] of cases) await t.test(name, verify);
});
