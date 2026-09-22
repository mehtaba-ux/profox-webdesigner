import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260922150000_crm_sales_certification_deal_permissions_part_16.sql','utf8');
const part16Performance = await readFile('supabase/migrations/20260922151000_crm_sales_certification_deal_permissions_part_16_performance_hardening.sql','utf8');
const policyCompletion = await readFile('supabase/migrations/20260922170000_crm_sales_certification_deal_permissions_part_16_policy_completion.sql','utf8');
const evaluatorCompletion = await readFile('supabase/migrations/20260922171000_crm_sales_certification_deal_permissions_part_16_evaluator_completion.sql','utf8');
const activation = await readFile('supabase/migrations/20260922180000_crm_sales_certification_deal_permission_policy_activation_part_16.sql','utf8');
const releaseVerifier = await readFile('scripts/verify-part16-release-readiness.mjs','utf8');
const service = await readFile('src/lib/salesCertificationService.ts','utf8');
const sellerUi = await readFile('src/components/admin/SalesCertificationPermissionsPanel.tsx','utf8');
const adminUi = await readFile('src/components/admin/SalesCertificationPermissionsAdmin.tsx','utf8');
const packageFitUi = await readFile('src/components/admin/crm/CRMPackageFitPanel.tsx','utf8');
const finalAdmin = await readFile('src/components/admin/FinalCertificationAdmin.tsx','utf8');
const app = await readFile('src/App.tsx','utf8');

test('Part 16 starts staged and refuses fabricated package policy',()=>{
  assert.match(migration,/'grantingActive',false/);
  assert.match(migration,/'enforcementActive',false/);
  assert.match(migration,/'criteriaApproved',false/);
  assert.match(migration,/'packageCriteria','\{\}'::jsonb/);
  assert.match(migration,/must not backfill or fabricate package certification grants/);
  assert.match(migration,/SELECT count\(\*\)::integer INTO v_grant_count\s+FROM public\.sales_certification_package_grants/);
  assert.match(migration,/IF v_grant_count<>0 THEN\s+RAISE EXCEPTION 'Part 16 must not backfill or fabricate package certification grants\.'/);
});

test('one granular grant model preserves evidence and revocation history',()=>{
  assert.match(migration,/CREATE TABLE public\.sales_certification_package_grants/);
  assert.match(migration,/authority_mode text NOT NULL CHECK \(authority_mode IN \('INDEPENDENT','SUPERVISED'\)\)/);
  assert.match(migration,/sales_certification_package_grants_one_active_per_product/);
  assert.match(migration,/Grant updates are limited to a complete revocation record/);
  assert.match(migration,/Revoked Sales certification grants are immutable/);
  assert.doesNotMatch(migration,/CREATE TABLE public\.(sales_package_permissions|seller_certifications|deal_permissions)/i);
});

test('general Academy readiness is required but never inferred as package authority',()=>{
  assert.match(migration,/sales_academy_training_ready\(p_salesperson_id\)/);
  assert.match(migration,/General Sales Academy and Final Certification must be genuinely passed before a package grant can be issued/);
  assert.match(migration,/No active package-level Sales certification grant exists/);
  assert.match(sellerUi,/A package is only certified when an explicit evidence-backed grant exists/);
});

test('policy activation requires explicit Management-approved criteria for every active package',()=>{
  assert.match(migration,/activation requires explicit criteria for active package/);
  assert.match(migration,/requires a certificationPath and at least one evidence requirement/);
  assert.match(migration,/enforcement cannot activate while grant issuance is disabled/);
  assert.match(adminUi,/no package criteria were invented/i);
});

test('deal evaluator keeps certification separate from existing approval systems',()=>{
  assert.match(migration,/crm_get_sales_certification_deal_permission/);
  assert.match(migration,/STAGED_NOT_ENFORCED/);
  assert.match(migration,/SUPERVISION_APPROVAL_REQUIRED/);
  assert.match(migration,/EXISTING_QUOTATION_APPROVAL/);
  assert.match(migration,/Certification authority does not replace Package Fit, specialist validation, quotation approval, Part 10B final send readiness, payment verification, or delivery handoff gates/);
});

test('server enforcement hooks protect package draft and quotation send boundaries',()=>{
  assert.match(migration,/trg_crm_enforce_sales_certification_package_item/);
  assert.match(migration,/BEFORE INSERT OR UPDATE OF sales_product_id\s+ON public\.quotation_items/i);
  assert.match(migration,/trg_crm_enforce_sales_certification_before_send/);
  assert.match(migration,/BEFORE UPDATE OF status,sent_at\s+ON public\.quotations/i);
  assert.match(migration,/crm_assert_sales_certification_deal_permission\(new\.id\)/);
});

test('Part 16 preserves the Part 10B final send gate',()=>{
  assert.match(migration,/finalQuotationSendGateActive/);
  assert.match(migration,/policyVersion.*2/);
  assert.match(migration,/snapshotSchemaVersion.*2/);
  assert.match(migration,/additive to, not a replacement for, the Part 10B final quotation send gate/);
});

test('Seller, Admin and Package Fit surfaces use the canonical Part 16 RPCs',()=>{
  assert.match(service,/get_my_sales_certification_permissions/);
  assert.match(service,/admin_get_sales_certification_permissions/);
  assert.match(service,/crm_get_sales_certification_deal_permission/);
  assert.match(sellerUi,/Sales Certification \+ Deal Permissions/);
  assert.match(adminUi,/Grant history/);
  assert.match(packageFitUi,/part16-package-fit-authority/);
  assert.match(packageFitUi,/Sales certification permission:/);
  assert.match(finalAdmin,/\/admin\/sales-certification-permissions/);
  assert.match(app,/SalesCertificationPermissionsAdmin/);
});

test('security uses fixed search paths and browser writes are RPC-only',()=>{
  assert.match(migration,/SECURITY DEFINER\s+SET search_path='public','pg_temp'/i);
  assert.match(migration,/REVOKE ALL ON TABLE public\.sales_certification_package_grants FROM PUBLIC,anon,authenticated/);
  assert.match(migration,/GRANT SELECT ON TABLE public\.sales_certification_package_grants TO authenticated/);
  assert.match(migration,/Admin access required/);
  assert.match(migration,/You can only view your own Sales certification permissions/);
});

test('staged UI says current deal authority is unchanged',()=>{
  assert.match(sellerUi,/Current deal authority is unchanged/);
  assert.match(packageFitUi,/current deal authority is unchanged/i);
  assert.match(adminUi,/Staged safely/);
});


test('Part 16 forward hardening covers actor foreign keys without changing staged behavior',()=>{
  assert.match(part16Performance,/sales_certification_package_grants_granted_by_idx/);
  assert.match(part16Performance,/ON public\.sales_certification_package_grants\(granted_by\)/);
  assert.match(part16Performance,/sales_certification_package_grants_revoked_by_idx/);
  assert.match(part16Performance,/ON public\.sales_certification_package_grants\(revoked_by\)/);
  assert.match(part16Performance,/salesperson_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(part16Performance,/OR \(SELECT public\.is_admin\(\)\)/);
  assert.match(part16Performance,/performance hardening must not create or mutate certification grants/);
  assert.match(part16Performance,/Part 16 staged rollout state changed unexpectedly during performance hardening/);
  assert.match(part16Performance,/Part 16 performance hardening must preserve Part 10B at policy\/schema 2\/2/);
  assert.doesNotMatch(part16Performance,/\bINSERT\s+INTO\s+public\.sales_certification_package_grants/i);
  assert.doesNotMatch(part16Performance,/\bUPDATE\s+public\.sales_certification_package_grants/i);
});


test('Part 16 completion schema supports explicit four-mode policy without activating it',()=>{
  assert.match(policyCompletion,/schemaVersion',2/);
  for(const mode of ['INDEPENDENT','SUPERVISED','QUALIFY_ONLY','BLOCKED']) assert.match(policyCompletion,new RegExp(mode));
  for(const key of ['LAUNCH_CERTIFIED','GROWTH_CERTIFIED','SCALE_CERTIFIED','CUSTOM_QUALIFICATION_CERTIFIED']) assert.match(policyCompletion,new RegExp(key));
  assert.match(policyCompletion,/productRules','\{\}'::jsonb/);
  assert.match(policyCompletion,/addonRules','\{\}'::jsonb/);
  assert.match(policyCompletion,/completion policy migration must remain staged with zero business-policy mappings/);
});

test('Custom and Scale safety constraints are validated before activation',()=>{
  assert.match(policyCompletion,/PF-CUSTOM may only use CUSTOM_QUALIFICATION_CERTIFIED with QUALIFY_ONLY and required Sales Validation/);
  assert.match(policyCompletion,/PF-WEB-SCALE policy must preserve explicit escalation/);
  assert.match(policyCompletion,/approval requires an explicit rule for every active package/);
  assert.match(policyCompletion,/approval requires an explicit complexity rule for every active add-on/);
});

test('Part 16 Admin policy updates are validated, versioned and Admin-only',()=>{
  assert.match(policyCompletion,/admin_update_sales_certification_policy/);
  assert.match(policyCompletion,/IF NOT public\.is_admin\(\)/);
  assert.match(policyCompletion,/v_version:=coalesce\(\(v_current->>'policyVersion'\)::integer,0\)\+1/);
  assert.match(policyCompletion,/UPDATE public\.system_configuration/);
  assert.match(service,/admin_update_sales_certification_policy/);
  assert.match(adminUi,/Validate & save policy/);
});

test('effective grant lifecycle distinguishes pending active suspended expired and revoked',()=>{
  for(const state of ['PENDING','ACTIVE','SUSPENDED','EXPIRED','REVOKED']) assert.match(policyCompletion,new RegExp(state));
  assert.match(policyCompletion,/expires_at/);
  assert.match(policyCompletion,/Sales certification grant evidence is immutable after issuance/);
});

test('canonical evaluator supports add-ons, progressive pipeline protection and exact remediation',()=>{
  assert.match(evaluatorCompletion,/itemPermissions/);
  assert.match(evaluatorCompletion,/INHERIT_BASE_PACKAGE/);
  assert.match(evaluatorCompletion,/REQUIRE_SPECIALIST_VALIDATION/);
  assert.match(evaluatorCompletion,/CUSTOM_QUALIFICATION_ONLY/);
  assert.match(evaluatorCompletion,/trg_crm_enforce_sales_certification_pipeline_stage/);
  assert.match(evaluatorCompletion,/protectedCommitmentStages/);
  assert.match(evaluatorCompletion,/recommendedAction/);
  assert.match(evaluatorCompletion,/crm_sales_validations/);
});

test('staged evaluator preserves current authority and never reads Academy test bypass',()=>{
  assert.match(evaluatorCompletion,/STAGED_NOT_ENFORCED/);
  assert.match(evaluatorCompletion,/Current deal authority is unchanged/);
  assert.doesNotMatch(evaluatorCompletion,/sales_academy_test_bypasses/);
  assert.doesNotMatch(policyCompletion,/sales_academy_test_bypasses/);
});

test('Seller and Package Fit surfaces expose required certification and remediation without policy distortion',()=>{
  assert.match(sellerUi,/Required:/);
  assert.match(sellerUi,/Open training \/ re-certification/);
  assert.match(packageFitUi,/Required certification:/);
  assert.match(packageFitUi,/Required supervision \/ escalation:/);
  assert.match(packageFitUi,/assessment\.recommendedProduct/);
});

test('Part 16 completion remains free of automatic employment commission or performance consequences',()=>{
  assert.doesNotMatch(policyCompletion+evaluatorCompletion,/UPDATE\s+public\.(user_profiles|applicants)/i);
  assert.doesNotMatch(policyCompletion+evaluatorCompletion,/(insert|update|delete)\s+(into\s+|from\s+)?public\.[a-z_]*commission/i);
  assert.doesNotMatch(policyCompletion+evaluatorCompletion,/sales_performance_reviews\s+SET/i);
});


test('Part 16 release verifier scopes evaluator mutation checks to evaluator definition only',()=>{
  assert.match(releaseVerifier,/label\.startsWith\('No evaluator'\)\s*\? evaluatorDef/);
  assert.match(releaseVerifier,/\['No evaluator grant mutation'/);
  assert.match(releaseVerifier,/\['No evaluator quotation mutation'/);
});


test('approved Part 16 production policy is encoded in a forward-only activation migration',()=>{
  assert.match(activation,/policyVersion',2/);
  assert.match(activation,/'criteriaApproved',true/);
  assert.match(activation,/'criteriaVersion',1/);
  assert.match(activation,/'grantingActive',true/);
  assert.match(activation,/'enforcementActive',false/);
  assert.match(activation,/'rolloutState','GRANTING_ONLY'/);
  assert.match(activation,/Quotation Sent/);
  assert.match(activation,/Negotiation \/ Decision Pending/);
  assert.match(activation,/Awaiting Advance Payment/);
  assert.match(activation,/Part 16 policy activation must not create or backfill granular certification grants/);
  assert.doesNotMatch(activation,/PERFORM\s+public\.admin_grant_sales_package_certification/i);
});

test('bounded discovery compatibility preserves PF-DISCOVERY as discovery + Growth + supervised',()=>{
  assert.match(activation,/PF-DISCOVERY/);
  assert.match(activation,/product_type,''\)\)='discovery'/);
  assert.match(activation,/PF-DISCOVERY.*GROWTH_CERTIFIED/is);
  assert.match(activation,/PF-DISCOVERY.*SUPERVISED/is);
  assert.match(activation,/IN \('package','addon','discovery'\)/);
  assert.doesNotMatch(activation,/UPDATE\s+public\.sales_products/i);
});

test('approved package hierarchy is explicit and Custom remains separate',()=>{
  assert.match(activation,/PF-WEB-LAUNCH/);
  assert.match(activation,/LAUNCH_CERTIFIED/);
  assert.match(activation,/GROWTH_CERTIFIED/);
  assert.match(activation,/SCALE_CERTIFIED/);
  assert.match(activation,/CUSTOM_QUALIFICATION_CERTIFIED/);
  assert.match(activation,/PF-CUSTOM/);
  assert.match(activation,/QUALIFY_ONLY/);
  assert.match(activation,/PF-WEB-SCALE/);
  assert.match(activation,/SUPERVISED/);
});

test('all 37 approved active add-ons are explicitly classified',()=>{
  const codes=[
    'PF-ADD-PAGE','PF-ADD-CUSTOM-PAGE','PF-ADD-LANDING','PF-ADD-COPY','PF-ADD-BLOG','PF-ADD-MIGRATION20',
    'PF-ADD-LEADFORM','PF-ADD-BOOKING','PF-ADD-CHAT','PF-ADD-REVIEWS','PF-ADD-TRACKING','PF-ADD-CRO',
    'PF-ADD-LOCALSEO','PF-ADD-SEOAUDIT','PF-ADD-LOGOREFRESH','PF-ADD-MINIBRAND','PF-ADD-ICONS','PF-ADD-ANIMATION','PF-ADD-ILLUSTRATION',
    'PF-ADD-CRM','PF-ADD-ADVSEO','PF-ADD-AIDISCOVERY','PF-ADD-SEOMIGRATION','PF-ADD-COMMERCE25','PF-ADD-COMMERCEADD25',
    'PF-ADD-FILTERS','PF-ADD-INT-SIMPLE','PF-ADD-EMAIL','PF-ADD-LEADROUTE','PF-ADD-3D',
    'PF-ADD-SUBSCRIPTION','PF-ADD-PAYGATEWAY','PF-ADD-CHECKOUT','PF-ADD-INT-ADV','PF-ADD-API','PF-ADD-PAYMENT','PF-ADD-BPA'
  ];
  assert.equal(codes.length,37);
  for(const code of codes) assert.match(activation,new RegExp(code));
  for(const behavior of ['INHERIT_BASE_PACKAGE','REQUIRE_GROWTH','REQUIRE_SCALE','REQUIRE_SPECIALIST_VALIDATION']) {
    assert.match(activation,new RegExp(behavior));
  }
});

test('production grant evidence rejects synthetic/test-tagged certification truth',()=>{
  assert.match(activation,/sales_certification_authoritative_evidence/);
  assert.match(activation,/syntheticEvidenceDetected/);
  assert.match(activation,/Synthetic|synthetic/);
  assert.match(activation,/PROFOX_TEST/);
  assert.match(activation,/application_reference/);
  assert.match(activation,/Authoritative production certification evidence is required; synthetic\/test-tagged evidence cannot create commercial authority/);
  assert.doesNotMatch(activation,/sales_academy_test_bypasses/);
});

test('grant criteria require canonical evidence IDs and explicit higher-tier prerequisites',()=>{
  assert.match(activation,/productTrainingProgressId/);
  assert.match(activation,/finalCertificationProgressId/);
  assert.match(activation,/finalCertificationSessionId/);
  assert.match(activation,/GROWTH_CERTIFIED.*LAUNCH_CERTIFIED/is);
  assert.match(activation,/SCALE_CERTIFIED.*GROWTH_CERTIFIED/is);
  assert.match(activation,/qualificationBoundaryConfirmed/);
  assert.match(activation,/inheritance never auto-issues certification/);
});

test('activation does not widen care-plan certification scope or alter catalog product types',()=>{
  assert.doesNotMatch(activation,/PF-CARE-GROWTH.*productRules/is);
  assert.doesNotMatch(activation,/PF-CARE-PRIORITY.*productRules/is);
  assert.doesNotMatch(activation,/ALTER TABLE public\.sales_products/i);
  assert.doesNotMatch(activation,/UPDATE public\.sales_products/i);
});


test('Scale escalation stays supervised without inventing unconditional Sales Validation',()=>{
  assert.match(activation,/ELSIF v_escalation_required AND EXISTS\(/);
  assert.match(activation,/'validationRequired',v_validation_required/);
  assert.match(activation,/'escalationRequired',v_escalation_required/);
  assert.doesNotMatch(activation,/'validationRequired',\(v_validation_required OR v_escalation_required\)/);
});
