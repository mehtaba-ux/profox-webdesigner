import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const base=await readFile('supabase/migrations/20260922150000_crm_sales_certification_deal_permissions_part_16.sql','utf8');
const perf=await readFile('supabase/migrations/20260922151000_crm_sales_certification_deal_permissions_part_16_performance_hardening.sql','utf8');
const policy=await readFile('supabase/migrations/20260922170000_crm_sales_certification_deal_permissions_part_16_policy_completion.sql','utf8');
const evaluator=await readFile('supabase/migrations/20260922171000_crm_sales_certification_deal_permissions_part_16_evaluator_completion.sql','utf8');
const service=await readFile('src/lib/salesCertificationService.ts','utf8');
const sellerUi=await readFile('src/components/admin/SalesCertificationPermissionsPanel.tsx','utf8');
const adminUi=await readFile('src/components/admin/SalesCertificationPermissionsAdmin.tsx','utf8');
const packageFitUi=await readFile('src/components/admin/crm/CRMPackageFitPanel.tsx','utf8');
const qa=await readFile('scripts/verify-part13-authenticated-production-ui.mjs','utf8');
const allSql=[base,perf,policy,evaluator].join('\n');

const match=(source,pattern)=>()=>assert.match(source,pattern);
const notMatch=(source,pattern)=>()=>assert.doesNotMatch(source,pattern);
const every=(...checks)=>()=>checks.forEach(check=>check());

const matrix=[
  ['001 unauthenticated assessment rejected',match(evaluator,/IF v_actor IS NULL THEN\s+RAISE EXCEPTION 'Authentication required\.'/)],
  ['002 Seller can view own permission',match(evaluator,/v_actor IS DISTINCT FROM v_salesperson_id/)],
  ['003 Seller cannot view another Seller private certification evidence',match(policy,/You can only view your own Sales certification permissions/)],
  ['004 Admin can view team certification status',match(evaluator,/public\.is_admin\(\)/)],
  ['005 inactive Sales user receives no active independent permission',match(evaluator,/Inactive or non-Sales users do not receive active deal authority/)],
  ['006 general Academy incomplete fails certification prerequisite',match(evaluator,/GENERAL_CERTIFICATION_NOT_READY/)],
  ['007 general Final Certification incomplete fails prerequisite',match(base,/sales_academy_training_ready\(p_salesperson_id\)/)],
  ['008 valid Final Certification is recognized through canonical readiness',match(evaluator,/sales_certification_general_ready\(v_salesperson_id\)/)],
  ['009 revoked certification does not authorize',match(policy,/WHEN p_revoked_at IS NOT NULL THEN 'REVOKED'/)],
  ['010 expired certification does not authorize',match(policy,/p_expires_at IS NOT NULL AND p_expires_at<=now\(\) THEN 'EXPIRED'/)],
  ['011 pending certification does not authorize',match(evaluator,/effective_status\(g\.grant_state,g\.expires_at,g\.revoked_at\)='ACTIVE'/)],
  ['012 active certification authorizes only configured scope',match(evaluator,/g\.certification_key=ANY\(v_accepted_keys\)/)],

  ['013 Launch rule evaluated from policy',match(policy,/LAUNCH_CERTIFIED/)],
  ['014 Growth rule evaluated from policy',match(policy,/GROWTH_CERTIFIED/)],
  ['015 Scale rule evaluated from policy',every(match(policy,/SCALE_CERTIFIED/),match(policy,/PF-WEB-SCALE/))],
  ['016 Custom rule evaluated from policy',every(match(policy,/CUSTOM_QUALIFICATION_CERTIFIED/),match(policy,/PF-CUSTOM/))],
  ['017 inactive product rejected',match(evaluator,/PRODUCT_NOT_ACTIVE/)],
  ['018 product code comes from sales_products',match(evaluator,/FROM public\.sales_products p\s+WHERE p\.code=v_code/)],
  ['019 policy cannot silently invent non-existent active product',match(policy,/must reference an active canonical package code/)],
  ['020 hierarchy inheritance follows configuration only',match(evaluator,/inheritedCertificationKeys/)],
  ['021 no implicit hierarchy when disabled',notMatch(policy,/LAUNCH_CERTIFIED.*GROWTH_CERTIFIED.*SCALE_CERTIFIED.*implicit/is)],
  ['022 add-on inherits base only when policy says so',match(evaluator,/v_behavior='INHERIT_BASE_PACKAGE'/)],
  ['023 high-complexity add-on escalation is configurable',match(policy,/REQUIRE_SPECIALIST_VALIDATION/)],
  ['024 certification does not alter Package Fit recommendation',match(packageFitUi,/assessment\.recommendedProduct/)],

  ['025 Custom Qualification may qualify according to policy',match(policy,/PF-CUSTOM.*QUALIFY_ONLY/is)],
  ['026 Custom qualification cannot approve technical feasibility',match(policy,/PF-CUSTOM may only use CUSTOM_QUALIFICATION_CERTIFIED with QUALIFY_ONLY and required Sales Validation/)],
  ['027 Custom qualification cannot bypass technical validation',match(evaluator,/crm_sales_validations/)],
  ['028 Custom qualification cannot bypass quotation approval',match(evaluator,/approval_decision/)],
  ['029 Custom qualification cannot bypass Part 10B',match(evaluator,/Part 10B final send readiness/)],
  ['030 Scale certification still respects escalation',match(policy,/PF-WEB-SCALE policy must preserve explicit escalation/)],
  ['031 Scale technical exception routes to existing Validation',match(evaluator,/SALES_VALIDATION_REQUIRED/)],
  ['032 timeline exception still requires existing authority',match(evaluator,/validationRequired.*managerReviewRequired/is)],

  ['033 uncertified Seller cannot independently create prohibited quotation',match(evaluator,/PACKAGE_CERTIFICATION_NOT_GRANTED/)],
  ['034 authorized certification permits allowed quotation creation',match(evaluator,/v_item_can_draft:=v_item_allowed AND v_mode IN \('INDEPENDENT','SUPERVISED'\)/)],
  ['035 supervised mode requires authoritative supervision approval',match(evaluator,/v_mode<>'SUPERVISED' OR v_supervision_satisfied/)],
  ['036 qualify-only mode blocks final independent commercial commitment',match(evaluator,/IF v_mode='QUALIFY_ONLY' THEN\s+v_item_can_draft:=false;\s+v_item_can_send:=false/)],
  ['037 Admin existing authority preserved',match(policy,/IF NOT public\.is_admin\(\) THEN\s+RAISE EXCEPTION 'Admin access required\.'/)],
  ['038 quotation ownership rules preserved',match(evaluator,/Salesperson does not match quotation ownership/)],
  ['039 Part 8 readiness remains separate',match(evaluator,/Certification authority does not replace Package Fit, specialist validation/)],
  ['040 Part 10B Send gate preserved',match(base,/crm_assert_quotation_send_ready/)],
  ['041 direct quotation-item write cannot bypass certification',match(base,/BEFORE INSERT OR UPDATE OF sales_product_id\s+ON public\.quotation_items/i)],
  ['042 frontend-only bypass cannot bypass server',match(evaluator,/trg_crm_enforce_sales_certification_package_item/)],

  ['043 early discovery is not unnecessarily blocked',match(evaluator,/protectedCommitmentStages/)],
  ['044 higher-complexity warning is surfaced in UI',match(packageFitUi,/Required supervision \/ escalation/)],
  ['045 protected commitment stage enforces configured policy',match(evaluator,/trg_crm_enforce_sales_certification_pipeline_stage/)],
  ['046 stage drag-drop cannot bypass trigger',match(evaluator,/BEFORE UPDATE OF stage\s+ON public\.crm_opportunities/i)],
  ['047 backward transition creates no privilege escalation',match(evaluator,/NOT \(coalesce\(v_policy->'protectedCommitmentStages'/)],
  ['048 unknown package state is handled truthfully',match(evaluator,/PACKAGE_NOT_RESOLVED/)],
  ['049 Seller receives escalation remediation',match(evaluator,/route to a qualified reviewer or Management/)],
  ['050 manager-authorized path remains audited in existing quotation approval',match(evaluator,/quotations\.approval_decision\/approved_by\/approved_at/)],

  ['051 only Admin may update certification policy',match(policy,/CREATE OR REPLACE FUNCTION public\.admin_update_sales_certification_policy/)],
  ['052 invalid certification key rejected',match(policy,/has an invalid requiredCertificationKey/)],
  ['053 invalid product code rejected',match(policy,/must reference an active canonical package code/)],
  ['054 duplicate/conflicting rule shape rejected',match(policy,/productRules\/addonRules\/protectedCommitmentStages have invalid shapes/)],
  ['055 policy version increments safely',match(policy,/v_version:=coalesce\(\(v_current->>'policyVersion'\)::integer,0\)\+1/)],
  ['056 policy changes use existing configuration audit path',match(policy,/UPDATE public\.system_configuration/)],
  ['057 Seller cannot change policy',match(policy,/Admin access required/)],
  ['058 anonymous cannot mutate/read private Admin policy controls',match(policy,/REVOKE ALL ON FUNCTION public\.admin_update_sales_certification_policy.*FROM PUBLIC,anon/)],
  ['059 current evaluator uses active policy version',match(evaluator,/'policyVersion',v_policy->'policyVersion'/)],
  ['060 historical commercial snapshots are not rewritten',notMatch(evaluator,/UPDATE\s+public\.(quotations|quotation_items)/i)],

  ['061 Seller cannot self-grant',match(base,/IF NOT public\.is_admin\(\) THEN\s+RAISE EXCEPTION 'Admin access required\.'/)],
  ['062 unauthorized actor cannot grant',match(policy,/CREATE OR REPLACE FUNCTION public\.admin_grant_sales_package_certification/)],
  ['063 Admin grant requires approved policy and evidence',match(policy,/Evidence type, evidence object and grant reason are required/)],
  ['064 grant actor is server-derived',match(policy,/v_actor uuid:=auth\.uid\(\)/)],
  ['065 grant timestamp is server-derived',match(base,/granted_at timestamptz NOT NULL DEFAULT now\(\)/)],
  ['066 revocation is audited in preserved history',match(base,/revoked_by uuid REFERENCES public\.user_profiles/)],
  ['067 revocation reason is required',match(base,/A revocation reason is required/)],
  ['068 expired grant fails permission',match(policy,/WHEN p_expires_at IS NOT NULL AND p_expires_at<=now\(\) THEN 'EXPIRED'/)],
  ['069 historical grant is preserved',match(base,/Sales certification grant history is immutable/)],
  ['070 repeated active grant is safely rejected',match(policy,/already has a non-revoked package certification grant/)],
  ['071 concurrent grant conflict resolves via unique active index',match(base,/sales_certification_package_grants_one_active_per_product/)],

  ['072 Academy test bypass does not create production certification',notMatch(evaluator,/sales_academy_test_bypasses/)],
  ['073 test bypass cannot grant package tier',notMatch(policy,/sales_academy_test_bypasses/)],
  ['074 expired test bypass is ignored by production permission',notMatch(evaluator,/test_bypass|bypass/i)],
  ['075 QA-only context cannot leak to normal browser authority',notMatch(service,/service_role|sb_secret_/i)],
  ['076 service-role or test harness secrets are not exposed in UI/service',notMatch(sellerUi+adminUi+packageFitUi,/service_role|sb_secret_|private_key|access_token/i)],

  ['077 Seller certification card renders',match(sellerUi,/data-testid="part16-certification-panel"/)],
  ['078 Admin certification view renders',match(adminUi,/data-testid="part16-certification-admin"/)],
  ['079 Deal Authority panel renders',match(packageFitUi,/part16-deal-permission-active/)],
  ['080 independent state is accessible',match(service,/INDEPENDENT/)],
  ['081 supervised state is accessible',match(service,/SUPERVISED/)],
  ['082 qualify-only state is accessible',match(service,/QUALIFY_ONLY/)],
  ['083 blocked state is accessible',match(service,/BLOCKED/)],
  ['084 certification status is not color-only',match(sellerUi,/NOT CERTIFIED|NOT_GRANTED|grantStatus/)],
  ['085 remediation action opens canonical training destination',match(sellerUi,/\/academy\/final-certification/)],
  ['086 mobile authenticated QA exists',match(qa,/Part 16 Seller certification panel did not expose keyboard focus on mobile/)],
  ['087 keyboard authenticated QA exists',match(qa,/page\.keyboard\.press\('Tab'\)/)],
  ['088 visible focus styles are present',match(adminUi,/focus:ring-4/)],
  ['089 Seller cannot see Admin grant control',match(qa,/Seller Part 16 panel exposed Admin grant\/policy controls/)],
  ['090 Seller cannot see another Seller private evaluator evidence',match(qa,/Seller unexpectedly viewed another user Part 16 certification snapshot/)],
];

if(matrix.length!==90) throw new Error(`Part 16 matrix must contain exactly 90 cases; found ${matrix.length}.`);
matrix.forEach(([name,check],index)=>{
  const expected=String(index+1).padStart(3,'0');
  if(!String(name).startsWith(expected)) throw new Error(`Part 16 matrix numbering drift at index ${index+1}: ${name}`);
  test(`PART 16 MATRIX ${name}`,check);
});
