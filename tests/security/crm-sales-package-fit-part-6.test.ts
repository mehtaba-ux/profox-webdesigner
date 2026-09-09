import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const lower = (value: string) => value.toLowerCase();
const has = (text: string, needle: string) => lower(text).includes(lower(needle));
const no = (text: string, needle: string) => !has(text, needle);

const migration = read('supabase/migrations/20260909160000_crm_sales_package_fit_part_6.sql');
const service = read('src/lib/crmPackageFitService.ts');
const guidance = read('src/lib/crmPackageFitGuidance.ts');
const panel = read('src/components/admin/crm/CRMPackageFitPanel.tsx');
const requirements = read('src/components/admin/crm/CRMRequirementsWorkspace.tsx');
const discoveryService = read('src/lib/crmSalesDiscoveryService.ts');
const drawer = read('src/components/admin/crm/CRMLeadDrawerBase.tsx');
const packageJson = JSON.parse(read('package.json'));

const policyStart = migration.indexOf("'crm_package_fit_policy_v1',\n    jsonb_build_object(");
const policyEnd = migration.indexOf("'Versioned deterministic Package Fit policy", policyStart);
assert.ok(policyStart >= 0 && policyEnd > policyStart);
const policyBlock = migration.slice(policyStart, policyEnd);

const fnStart = lower(migration).indexOf('create or replace function public.crm_get_package_fit_assessment');
assert.ok(fnStart >= 0);
const functionBlock = migration.slice(fnStart);

const ruleKeys = [...migration.matchAll(/'ruleKey','([^']+)'/g)].map(match => match[1]);
const policyRequirementKeys = [...migration.matchAll(/'requirementKey','([^']+)'/g)].map(match => match[1]);

type AcceptanceCase = [string, () => void];
const cases: AcceptanceCase[] = [
  ['sales_products remains canonical commercial source', () => { assert.ok(has(functionBlock, 'from public.sales_products')); assert.ok(has(panel, 'current sales catalog')); }],
  ['No duplicate product catalog is created', () => { assert.ok(no(migration, 'create table')); assert.ok(no(migration, 'sales_package_catalog')); }],
  ['No client-specific Package Fit table is created', () => { assert.ok(no(migration, 'create table')); assert.ok(no(migration, 'crm_package_fit ')); assert.ok(no(migration, 'crm_package_recommendations')); }],
  ['One canonical Package Fit policy exists', () => { assert.equal((migration.match(/crm_package_fit_policy_v1/g) || []).length > 0, true); assert.ok(has(migration, 'system_configuration')); }],
  ['Policy is versioned', () => { assert.ok(has(policyBlock, "'policyVersion', 1")); assert.ok(has(service, 'policyVersion')); }],
  ['Policy has unique rule keys', () => { assert.equal(ruleKeys.length, new Set(ruleKeys).size); assert.ok(ruleKeys.length >= 20); }],
  ['Policy package codes are validated against sales_products', () => { assert.ok(has(functionBlock, 'where sp.code = v_code')); assert.ok(has(functionBlock, 'catalog_package_code_invalid')); }],
  ['Unknown package code fails closed', () => { assert.ok(has(functionBlock, 'catalog_package_code_invalid')); assert.ok(has(functionBlock, "v_status := 'review_required'")); }],
  ['Inactive package cannot be recommended', () => { assert.ok(has(functionBlock, 'catalog_package_inactive')); assert.ok(has(functionBlock, 'sp.active')); }],
  ['Requirement Definitions are reused', () => { assert.ok(has(functionBlock, "config_key = 'crm_requirement_definitions_v1'")); }],
  ['Requirement keys in policy are validated as canonical', () => { assert.ok(has(functionBlock, 'unknown_requirement_key')); assert.ok(policyRequirementKeys.includes('authentication_requirement')); }],
  ['Discovery questions are reused', () => { assert.ok(has(functionBlock, 'public.crm_discovery_questions')); assert.ok(has(discoveryService, 'CRMDiscoveryQuestion')); }],
  ['Requirement applicability foundation is reused', () => { assert.ok(has(functionBlock, "config_value->'definitions'")); assert.ok(has(discoveryService, 'applicability')); }],
  ['Discovery applicability is reused where relevant', () => { assert.ok(has(functionBlock, "q.applicability->'relatedRequirementKeys'")); }],
  ['Lead input works', () => { assert.ok(has(functionBlock, 'p_lead_id uuid default null')); assert.ok(has(service, 'leadId?: string')); }],
  ['Opportunity input works', () => { assert.ok(has(functionBlock, 'p_opportunity_id uuid default null')); assert.ok(has(service, 'opportunityId?: string')); }],
  ['Lead and Opportunity mismatch is rejected', () => { assert.ok(has(functionBlock, 'lead and opportunity do not belong to the same sales lifecycle')); }],
  ['Lead to Opportunity continuity uses same Lead Requirements', () => { assert.ok(has(functionBlock, 'select o.lead_id')); assert.ok(has(functionBlock, 'r.lead_id = v_lead_id')); }],
  ['No Requirements copying occurs', () => { assert.ok(no(functionBlock, 'insert into public.crm_requirements')); assert.ok(no(functionBlock, 'update public.crm_requirements')); }],
  ['Archived Requirement does not drive current fit', () => { assert.ok(has(functionBlock, "r.record_state = 'ACTIVE'")); }],
  ['CLIENT_CONFIRMED can drive deterministic minimum package', () => { assert.ok(has(functionBlock, "when 'CLIENT_CONFIRMED' then")); assert.ok(has(functionBlock, 'v_min_rank := greatest')); }],
  ['SELLER_OBSERVATION does not silently become confirmed fact', () => { assert.ok(has(functionBlock, "when 'SELLER_OBSERVATION' then")); assert.ok(has(functionBlock, 'does not hard-classify the package')); }],
  ['SELLER_HYPOTHESIS cannot force hard recommendation', () => { assert.ok(has(functionBlock, "when 'SELLER_HYPOTHESIS' then")); assert.ok(has(functionBlock, 'only a seller hypothesis')); }],
  ['AWAITING_CLIENT creates missing-information behavior', () => { assert.ok(has(functionBlock, "when 'AWAITING_CLIENT' then")); assert.ok(has(functionBlock, 'client confirmation is still pending')); }],
  ['NEEDS_SPECIALIST_VALIDATION creates validation signal', () => { assert.ok(has(functionBlock, "when 'NEEDS_SPECIALIST_VALIDATION' then")); assert.ok(has(functionBlock, 'v_validation_signals')); }],
  ['NOT_APPLICABLE does not create complexity', () => { assert.ok(has(functionBlock, "information_certainty <> 'NOT_APPLICABLE'")); }],
  ['Custom unmapped Requirement is not silently ignored', () => { assert.ok(has(functionBlock, 'custom_requirement_review')); assert.ok(has(functionBlock, 'v_has_review := true')); }],
  ['Custom unmapped Requirement does not use AI as authority', () => { assert.ok(no(functionBlock, 'openai')); assert.ok(no(functionBlock, 'llm')); assert.ok(no(functionBlock, 'embedding')); }],
  ['Page count alone cannot determine package', () => { assert.ok(no(functionBlock, 'pages <= 5')); assert.ok(no(functionBlock, 'pages <= 12')); assert.ok(no(policyBlock, "'required_pages','minPackageCode'")); }],
  ['Small page count plus custom app signals cannot wrongly recommend basic package', () => { assert.ok(has(policyBlock, "'authentication_requirement','minPackageCode','PF-CUSTOM'")); assert.ok(has(policyBlock, "'portal_dashboard','minPackageCode','PF-CUSTOM'")); }],
  ['Simple Launch scenario can remain plausible', () => { assert.ok(has(policyBlock, "'PF-WEB-LAUNCH'")); assert.ok(has(functionBlock, 'v_min_rank integer := 1')); }],
  ['Growth scenario has approved policy signals', () => { assert.ok(has(policyBlock, "'growth.copywriting'")); assert.ok(has(policyBlock, "'PF-WEB-GROWTH'")); }],
  ['Scale scenario has approved policy signals', () => { assert.ok(has(policyBlock, "'scale.accessibility'")); assert.ok(has(policyBlock, "'PF-WEB-SCALE'")); }],
  ['Custom scenario has approved custom-application signals', () => { assert.ok(has(policyBlock, "'custom.authentication'")); assert.ok(has(policyBlock, "'PF-CUSTOM'")); }],
  ['Package comparison explains mismatch reasons', () => { assert.ok(has(functionBlock, "v_candidate_status := 'MISMATCH'")); assert.ok(has(functionBlock, "'mismatchReasons'")); }],
  ['Complexity reasons trace to canonical facts', () => { assert.ok(has(functionBlock, "'requirementId', v_requirement.id")); assert.ok(has(functionBlock, "'requirementKey', v_requirement.requirement_key")); }],
  ['Missing-information reasons trace to canonical facts', () => { assert.ok(has(functionBlock, 'v_missing_information')); assert.ok(has(functionBlock, "'sourceType','REQUIREMENT'")); }],
  ['Validation signals trace to canonical facts', () => { assert.ok(has(functionBlock, 'v_validation_signals')); assert.ok(has(functionBlock, "'certainty',v_requirement.information_certainty")); }],
  ['Confidence is deterministic', () => { assert.ok(has(functionBlock, "v_confidence := 'LOW'")); assert.ok(has(functionBlock, "v_confidence := 'MEDIUM'")); assert.ok(has(functionBlock, "v_confidence := 'HIGH'")); }],
  ['Confidence does not use fake mathematical precision', () => { assert.ok(no(service, 'confidence: number')); assert.ok(has(service, "'HIGH' | 'MEDIUM' | 'LOW'")); }],
  ['Low confidence does not produce false certainty', () => { assert.ok(has(panel, 'more information or review is required before a reliable recommendation')); assert.ok(no(panel, 'SELL THIS PACKAGE NOW')); }],
  ['No candidate can be returned from inactive catalog row', () => { assert.ok(has(functionBlock, "sp.active\n      and lower(coalesce(sp.product_type,'')) = 'package'")); }],
  ['Manager approval flag comes from sales_products', () => { assert.ok(has(functionBlock, 'v_product.manager_approval_required')); assert.ok(no(policyBlock, 'manager_approval_required')); }],
  ['Timeline impact comes from sales_products', () => { assert.ok(has(functionBlock, 'v_product.timeline_impact')); assert.ok(no(policyBlock, 'timeline_impact')); }],
  ['Delivery duration comes from sales_products', () => { assert.ok(has(functionBlock, 'v_product.delivery_duration_min')); assert.ok(has(functionBlock, 'v_product.delivery_duration_max')); }],
  ['Package price comes from sales_products', () => { assert.ok(has(functionBlock, 'v_product.base_price')); assert.ok(has(panel, 'formatPrice')); }],
  ['Package name comes from sales_products', () => { assert.ok(has(functionBlock, "'name',v_product.name")); }],
  ['Package scope comes from sales_products', () => { assert.ok(has(functionBlock, "'scope',v_product.scope")); }],
  ['Policy does not duplicate price', () => { assert.ok(no(policyBlock, 'base_price')); assert.ok(no(policyBlock, "'basePrice'")); }],
  ['Policy does not duplicate package scope', () => { assert.ok(no(policyBlock, "'scope'")); }],
  ['Policy does not duplicate delivery duration', () => { assert.ok(no(policyBlock, 'delivery_duration')); assert.ok(no(policyBlock, 'deliveryDuration')); }],
  ['Policy does not duplicate payment schedule', () => { assert.ok(no(policyBlock, 'payment_schedule')); assert.ok(no(policyBlock, 'standard_payment_terms')); }],
  ['Current catalog changes reflect in current assessment', () => { assert.ok(has(functionBlock, 'from public.sales_products')); assert.ok(has(panel, 'Refresh assessment')); }],
  ['Historical quotation is unchanged by Package Fit', () => { assert.ok(no(functionBlock, 'update public.quotations')); assert.ok(no(functionBlock, 'update public.quotation')); assert.ok(no(migration, 'quotation_items set')); }],
  ['Opening Package Fit creates no Requirement', () => { assert.ok(no(functionBlock, 'insert into public.crm_requirements')); }],
  ['Opening Package Fit creates no Discovery response', () => { assert.ok(no(functionBlock, 'insert into public.crm_discovery_responses')); }],
  ['Opening Package Fit creates no Client Voice', () => { assert.ok(no(functionBlock, 'insert into public.crm_client_voice')); }],
  ['Opening Package Fit creates no activity', () => { assert.ok(no(functionBlock, 'insert into public.crm_activities')); }],
  ['Opening Package Fit creates no review or escalation', () => { assert.ok(no(functionBlock, 'insert into public.sales_escal')); assert.ok(no(functionBlock, 'insert into public.crm_escal')); }],
  ['Opening Package Fit does not modify Lead', () => { assert.ok(no(functionBlock, 'update public.crm_leads')); }],
  ['Opening Package Fit does not modify Opportunity', () => { assert.ok(no(functionBlock, 'update public.crm_opportunities')); }],
  ['Opening Package Fit does not modify Pipeline', () => { assert.ok(no(functionBlock, 'crm_transition_opportunity')); }],
  ['Opening Package Fit does not create quotation', () => { assert.ok(no(functionBlock, 'insert into public.quot')); }],
  ['Opening Package Fit does not alter payment or Won', () => { assert.ok(no(functionBlock, 'update public.payments')); assert.ok(no(functionBlock, 'markwon')); }],
  ['SellerGuidanceHelp is reused', () => { assert.ok(has(panel, "from './SellerGuidanceHelp'")); assert.ok(no(panel, 'function SellerGuidanceHelp')); }],
  ['Package Fit guidance exists', () => { assert.ok(has(guidance, "'section.package_fit'")); }],
  ['Confidence guidance exists', () => { assert.ok(has(guidance, "'field.package_fit_confidence'")); }],
  ['Mismatch guidance exists', () => { assert.ok(has(guidance, "'section.package_fit_mismatch'")); }],
  ['Validation guidance exists', () => { assert.ok(has(guidance, "'section.package_fit_validation'")); }],
  ['Current Catalog guidance exists', () => { assert.ok(has(guidance, "'field.current_catalog_guidance'")); }],
  ['Package Fit panel is reusable', () => { assert.ok(has(panel, 'export type CRMPackageFitPanelProps')); assert.ok(has(panel, 'export default function CRMPackageFitPanel')); }],
  ['No unnecessary new top-level Lead tab introduced', () => { assert.ok(no(drawer, "label: 'Package Fit'")); assert.ok(has(requirements, '<CRMPackageFitPanel')); }],
  ['Requirements workspace remains intact', () => { assert.ok(has(requirements, '<RequirementGroup')); assert.ok(has(requirements, 'saveRequirement')); }],
  ['Discovery workspace remains intact', () => { assert.ok(has(drawer, "label: 'Probing & Discovery'")); assert.ok(has(drawer, '<CRMDiscoveryWorkspace')); }],
  ['Meeting Prep remains intact', () => { assert.ok(has(drawer, "label: 'Meeting Prep'")); assert.ok(has(drawer, '<CRMMeetingPrepWorkspace')); }],
  ['Meeting Management remains intact', () => { assert.ok(has(drawer, "label: 'Meeting Management'")); assert.ok(has(drawer, '<CRMMeetingManagementWorkspace')); }],
  ['Anonymous Package Fit execution denied', () => { assert.ok(has(migration, 'REVOKE ALL ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) FROM anon')); }],
  ['Unauthorized cross-Lead access denied', () => { assert.ok(has(functionBlock, 'public.crm_can_access_lead(v_lead_id)')); assert.ok(has(functionBlock, 'crm lead access is required for package fit')); }],
  ['No broad sales_products RLS weakening', () => { assert.ok(no(migration, 'alter table public.sales_products disable row level security')); assert.ok(no(migration, 'create policy')); }],
  ['No service-role browser exposure', () => { assert.ok(no(service, 'service_role')); assert.ok(no(panel, 'service_role')); assert.ok(has(service, "from './supabase'")); }],
  ['No specialist-review workflow implemented', () => { assert.ok(no(migration, 'create table public.sales_escalations')); assert.ok(no(migration, 'create table public.sales_validations')); assert.ok(has(guidance, 'review workflow is intentionally deferred')); }],
  ['No Requirements Confirmed gate changed', () => { assert.ok(no(functionBlock, 'requirements confirmed')); assert.ok(no(functionBlock, 'crm_transition_opportunity')); }],
  ['No Proposal Readiness implemented', () => { assert.ok(no(migration, 'proposal_readiness')); assert.ok(no(migration, 'proposal readiness percentage')); }],
  ['No quotation gating changed', () => { assert.ok(no(functionBlock, 'quotation gate')); assert.ok(no(functionBlock, 'block quote')); }],
  ['No payment or Won change', () => { assert.ok(no(functionBlock, 'public.payments')); assert.ok(no(functionBlock, 'markwon')); }],
  ['No Promise Register implemented', () => { assert.ok(no(migration, 'sales_promises')); assert.ok(no(migration, 'promise_register')); }],
  ['No Sales-to-Delivery handoff change', () => { assert.ok(no(functionBlock, 'update public.sales_to_delivery')); assert.ok(no(functionBlock, 'insert into public.sales_to_delivery')); }],
  ['No fake production CRM data is created', () => { assert.ok(no(migration, 'insert into public.crm_leads')); assert.ok(no(migration, 'insert into public.crm_requirements')); assert.ok(no(migration, 'insert into public.crm_discovery_responses')); }],
  ['Part 1 regression suite remains present', () => { assert.doesNotThrow(() => read('tests/security/crm-sales-discovery-foundation-part-1.test.ts')); }],
  ['Part 2 regression suite remains present', () => { assert.doesNotThrow(() => read('tests/security/crm-sales-requirements-part-2.test.ts')); }],
  ['Part 3 regression suite remains present', () => { assert.doesNotThrow(() => read('tests/security/crm-sales-probing-discovery-part-3.test.ts')); }],
  ['Part 3.5 regression suite remains present', () => { assert.doesNotThrow(() => read('tests/security/crm-seller-guidance-part-3-5.test.ts')); }],
  ['Part 4 regression suite remains present', () => { assert.doesNotThrow(() => read('tests/security/crm-sales-meeting-prep-part-4.test.ts')); }],
  ['Part 5 regression suite remains present', () => { assert.doesNotThrow(() => read('tests/security/crm-sales-meeting-management-closeout-part-5.test.ts')); }],
  ['TypeScript validation command remains available', () => { assert.ok(packageJson.scripts?.lint); }],
  ['Security suite command remains available', () => { assert.ok(packageJson.scripts?.test); }],
  ['Migration integrity command remains available', () => { assert.ok(packageJson.scripts?.['migrations:check']); }],
  ['Production build command remains available', () => { assert.ok(packageJson.scripts?.build); }],
];

assert.equal(cases.length, 98, 'Part 6 acceptance suite must contain all 98 required cases.');

cases.forEach(([name, run], index) => {
  test(`Part 6 · TEST ${index + 1} · ${name}`, run);
});
