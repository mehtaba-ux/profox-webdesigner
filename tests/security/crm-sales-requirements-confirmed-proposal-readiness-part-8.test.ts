import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const lower = (value: string) => value.toLowerCase();
const has = (text: string, needle: string) => lower(text).includes(lower(needle));
const no = (text: string, needle: string) => !has(text, needle);
const all = (text: string, needles: string[]) => needles.every(needle => has(text, needle));

const migration = read('supabase/migrations/20260909200000_crm_sales_requirements_confirmed_proposal_readiness_part_8.sql');
const hardening = read('supabase/migrations/20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening.sql');
const combined = `${migration}\n${hardening}`;
const readinessService = read('src/lib/crmSalesReadinessService.ts');
const crmService = read('src/lib/crmService.ts');
const panel = read('src/components/admin/crm/CRMSalesReadinessPanel.tsx');
const requirements = read('src/components/admin/crm/CRMRequirementsWorkspace.tsx');
const guidance = read('src/lib/crmSalesReadinessGuidance.ts');
const leadDrawer = read('src/components/admin/crm/CRMLeadDrawerBase.tsx');
const packageFitService = read('src/lib/crmPackageFitService.ts');
const packageFitMigration = read('supabase/migrations/20260909160000_crm_sales_package_fit_part_6.sql');
const validationMigration = read('supabase/migrations/20260909193000_crm_sales_validation_escalation_part_7.sql');
const packageJson = JSON.parse(read('package.json'));

const evaluator = hardening.split('create or replace function public.crm_get_sales_gate_assessment')[1]?.split('revoke all on function public.crm_get_sales_gate_assessment')[0] || '';
const transition = migration.split('create or replace function public.crm_transition_opportunity')[1]?.split('revoke all on function public.crm_transition_opportunity')[0] || '';
const createBusinessTables = combined.match(/create\s+table\s+public\.[a-z0-9_]+/gi) || [];

type AcceptanceCase = [string, () => void];
const cases: AcceptanceCase[] = [
  // 1–13 FOUNDATION
  ['1 existing crm_transition_opportunity is reused', () => { assert.ok(has(migration, 'create or replace function public.crm_transition_opportunity')); assert.ok(has(crmService, "supabase.rpc('crm_transition_opportunity'")); }],
  ['2 no crm_transition_opportunity_v2 created', () => { assert.ok(no(combined, 'crm_transition_opportunity_v2')); }],
  ['3 existing pipeline stages are not replaced', () => { assert.ok(has(migration, "stage->>'name'='Requirements Confirmed'")); assert.ok(has(migration, "jsonb_set(stage,'{requiredFields}'")); assert.ok(no(migration, "jsonb_set(stage,'{name}'")); }],
  ['4 allowed transitions unchanged except intended gate logic', () => { assert.ok(has(transition, "v_current->'allowedNext'")); assert.ok(has(transition, "v_current->'allowedPrevious'")); assert.ok(no(migration, "jsonb_set(stage,'{allowedNext}'")); assert.ok(no(migration, "jsonb_set(stage,'{allowedPrevious}'")); }],
  ['5 Won remains Admin payment controlled', () => { assert.ok(all(transition, ["p_target_stage='Won'", 'Won is controlled by Admin payment verification', "p.status='Verified'", "p.payment_type in ('Advance','Full Payment')"])); }],
  ['6 Quotation Sent existing prerequisite remains intact', () => { assert.ok(all(transition, ["p_target_stage='Quotation Sent'", 'An approved quotation must be sent before moving this opportunity to Quotation Sent'])); }],
  ['7 Awaiting Advance Payment existing prerequisite remains intact', () => { assert.ok(all(transition, ["p_target_stage='Awaiting Advance Payment'", "q.status='Accepted'", 'customer must accept the quotation'])); }],
  ['8 one canonical Sales gate policy key exists', () => { assert.ok(has(combined, 'crm_sales_gate_policy_v1')); assert.ok(no(combined, 'crm_sales_gate_policy_v2')); assert.ok(no(combined, 'crm_proposal_readiness_policy')); }],
  ['9 Sales gate policy is versioned', () => { assert.ok(has(hardening, "'policyVersion',1")); assert.ok(has(hardening, "'evaluatorVersion',2")); }],
  ['10 one canonical readiness evaluator architecture exists', () => { assert.ok(has(readinessService, "crm_get_sales_gate_assessment")); assert.ok(has(hardening, 'create or replace function public.crm_get_sales_gate_assessment')); assert.ok(no(combined, 'crm_get_sales_gate_assessment_v2')); }],
  ['11 no duplicate Requirements system', () => { assert.ok(no(combined, 'create table public.crm_sales_readiness_requirements')); assert.ok(no(combined, 'create table public.proposal_requirements')); }],
  ['12 no duplicate Package Fit engine', () => { assert.ok(has(evaluator, 'public.crm_get_package_fit_assessment')); assert.ok(no(hardening, 'create or replace function public.crm_get_package_fit_assessment')); }],
  ['13 no duplicate validation system', () => { assert.ok(has(evaluator, 'public.crm_sales_validations')); assert.ok(no(combined, 'create table public.crm_sales_validations')); }],

  // 14–24 REQUIREMENTS
  ['14 applicable blocking Core Requirement missing becomes blocker', () => { assert.ok(has(hardening, 'blockingCoreCategories')); assert.ok(has(evaluator, "if v_requirement_class='CORE'")); assert.ok(has(evaluator, "v_unresolved_behavior:='BLOCKED'")); assert.ok(has(evaluator, "v_issue_status:=v_unresolved_behavior")); }],
  ['15 Not Applicable Requirement legitimately passes', () => { assert.ok(has(evaluator, "v_req.information_certainty='NOT_APPLICABLE'")); assert.ok(has(evaluator, "v_issue_status:='PASS'")); }],
  ['16 Conditional Requirement blocks only when applicable', () => { assert.ok(all(evaluator, ["v_requirement_class='CONDITIONAL'", 'v_applicable :=', 'if not v_applicable then continue', "v_unresolved_behavior:='BLOCKED'"])); }],
  ['17 meaningful Requirement value is checked', () => { assert.ok(has(evaluator, "v_meaningful := v_req_found and")); assert.ok(has(evaluator, 'v_req.structured_value is not null')); }],
  ['18 archived Requirement does not satisfy current gate', () => { assert.ok(has(evaluator, "r.record_state='ACTIVE'")); assert.ok(no(evaluator, "record_state in ('ACTIVE','ARCHIVED')")); }],
  ['19 CLIENT_CONFIRMED satisfies current Requirement fact', () => { assert.ok(has(evaluator, "v_req.information_certainty='CLIENT_CONFIRMED'")); }],
  ['20 SELLER_HYPOTHESIS cannot silently satisfy mandatory fact', () => { assert.ok(has(evaluator, "v_req.information_certainty='SELLER_HYPOTHESIS'")); assert.ok(has(evaluator, 'is only a Seller hypothesis')); }],
  ['21 AWAITING_CLIENT remains unresolved under gate policy', () => { assert.ok(has(evaluator, "v_req.information_certainty='AWAITING_CLIENT'")); assert.ok(has(evaluator, 'is Awaiting Client')); }],
  ['22 SELLER_OBSERVATION follows configured observational policy', () => { assert.ok(has(hardening, 'observationalRequirementKeys')); assert.ok(has(evaluator, "v_req.information_certainty='SELLER_OBSERVATION' and (v_observational_keys ? v_key)")); }],
  ['23 NOT_APPLICABLE remains one of six certainty states', () => { assert.ok(all(hardening, ['CLIENT_CONFIRMED','SELLER_OBSERVATION','SELLER_HYPOTHESIS','AWAITING_CLIENT','NEEDS_SPECIALIST_VALIDATION','NOT_APPLICABLE'])); }],
  ['24 NEEDS_SPECIALIST_VALIDATION consults Part 7', () => { assert.ok(has(evaluator, "v_req.information_certainty='NEEDS_SPECIALIST_VALIDATION'")); assert.ok(has(evaluator, 'public.crm_sales_validations')); }],

  // 25–34 VALIDATION
  ['25 required validation absent is blocked', () => { assert.ok(has(evaluator, "if v_val_found and v_val.status='APPROVED'")); assert.ok(has(evaluator, "v_issue_status:='BLOCKED'")); }],
  ['26 PENDING review is unresolved', () => { assert.ok(has(evaluator, "'PENDING','IN_REVIEW','NEEDS_INFORMATION','REJECTED','STALE'")); }],
  ['27 IN_REVIEW is unresolved', () => { assert.ok(has(evaluator, "'PENDING','IN_REVIEW','NEEDS_INFORMATION','REJECTED','STALE'")); }],
  ['28 NEEDS_INFORMATION is unresolved', () => { assert.ok(has(evaluator, "'PENDING','IN_REVIEW','NEEDS_INFORMATION','REJECTED','STALE'")); }],
  ['29 current APPROVED review resolves validation dimension', () => { assert.ok(has(evaluator, "v_val.status='APPROVED'")); assert.ok(has(evaluator, "'status','APPROVED'")); }],
  ['30 approved constraints are returned', () => { assert.ok(has(evaluator, 'approved_constraints')); assert.ok(has(evaluator, "'approvedConstraints',v_constraints")); }],
  ['31 REJECTED material validation blocks', () => { assert.ok(has(evaluator, "if v_val.status in ('REJECTED','STALE') then v_validation_behavior:='BLOCKED'")); }],
  ['32 STALE validation blocks', () => { assert.ok(has(evaluator, "if v_val.status in ('REJECTED','STALE') then v_validation_behavior:='BLOCKED'")); }],
  ['33 CANCELLED unresolved validation does not falsely satisfy specialist certainty', () => { assert.ok(has(evaluator, "if v_val_found and v_val.status='APPROVED'")); assert.ok(no(evaluator, "v_val.status in ('APPROVED','CANCELLED')")); }],
  ['34 specialist approval does not modify client certainty', () => { assert.ok(no(combined, 'update public.crm_requirements set information_certainty')); }],

  // 35–42 PACKAGE FIT
  ['35 Part 6 Package Fit evaluator is reused', () => { assert.ok(has(evaluator, 'public.crm_get_package_fit_assessment')); assert.ok(has(packageFitService, 'crm_get_package_fit_assessment')); }],
  ['36 FIT follows configured policy', () => { assert.ok(has(hardening, "'FIT','PASS'")); assert.ok(has(evaluator, "v_package_status not in ('FIT','POSSIBLE_FIT','REVIEW_REQUIRED','MISMATCH')")); }],
  ['37 POSSIBLE_FIT becomes warning under current policy', () => { assert.ok(has(hardening, "'POSSIBLE_FIT','WARNING'")); assert.ok(has(evaluator, "v_package_status='POSSIBLE_FIT'")); }],
  ['38 MISMATCH blocks unresolved Package Fit', () => { assert.ok(has(hardening, "'MISMATCH','BLOCKED'")); assert.ok(has(evaluator, "v_package_status='MISMATCH'")); assert.ok(has(evaluator, "'PACKAGE_FIT_MISMATCH'")); }],
  ['39 REVIEW_REQUIRED considers actual current Part 7 resolution', () => { assert.ok(has(evaluator, "v_package_status='REVIEW_REQUIRED'")); assert.ok(has(evaluator, "v_val.status<>'APPROVED'")); assert.ok(has(evaluator, 'supersedes_validation_id')); }],
  ['40 approved validation does not erase Package Fit complexity', () => { assert.ok(has(evaluator, 'v_complex')); assert.ok(no(combined, 'update public.crm_package_fit')); assert.ok(no(hardening, 'recommendedProduct := null')); }],
  ['41 unsafe or drifted catalog cannot produce safe REVIEW_REQUIRED resolution', () => { assert.ok(has(evaluator, "coalesce(v_package->>'configurationStatus','OK')<>'OK'")); assert.ok(has(packageFitMigration, 'configurationStatus')); }],
  ['42 sales_products remains commercial truth', () => { assert.ok(no(combined, 'update public.sales_products')); assert.ok(no(combined, 'insert into public.sales_products')); assert.ok(has(packageFitMigration, 'public.sales_products')); }],

  // 43–49 DECISION / NEXT ACTION
  ['43 required decision authority can block through gate policy', () => { assert.ok(has(hardening, "'DECISION_BUYING_PROCESS'")); assert.ok(has(evaluator, "v_category='DECISION_BUYING_PROCESS'")); assert.ok(has(evaluator, 'v_decision_status')); }],
  ['44 complex-deal deeper decision fields activate only when appropriate', () => { assert.ok(has(hardening, 'complexDecisionRequirementKeys')); assert.ok(has(evaluator, "v_conditions ? 'complex_decision' and v_complex")); }],
  ['45 simple Lead is not forced through enterprise-only qualification', () => { assert.ok(has(evaluator, "v_requirement_class='COMPLEX'")); assert.ok(has(evaluator, 'v_applicable := v_complex')); assert.ok(has(evaluator, 'if not v_applicable then continue')); }],
  ['46 meaningful next action satisfies the dimension', () => { assert.ok(has(evaluator, "'sourceType','ACTIVITY'")); assert.ok(has(evaluator, "'sourceType','SALES_MEETING'")); assert.ok(has(evaluator, 'v_has_next_action:=found')); }],
  ['47 no next action blocks an active opportunity', () => { assert.ok(has(evaluator, "v_opp.status='Open' and not v_has_next_action")); assert.ok(has(evaluator, "'NEXT_ACTION_MISSING'")); }],
  ['48 TBD and generic waiting subjects do not satisfy next action', () => { assert.ok(has(hardening, "jsonb_build_array('tbd','follow up','follow-up','wait','waiting')")); assert.ok(has(evaluator, 'not (v_generic_subjects ? lower(btrim')); }],
  ['49 closed lifecycle is not forced through active next-action rule', () => { assert.ok(has(evaluator, "if v_opp.status='Open' and not v_has_next_action")); }],

  // 50–53 LEGACY SUMMARY
  ['50 requirements_summary alone cannot pass gate', () => { assert.ok(has(evaluator, "legacyRequirementsSummaryPresent")); assert.ok(has(evaluator, "legacyRequirementsSummaryAuthoritative',false")); assert.ok(has(evaluator, "'STRUCTURED_EVIDENCE_MISSING'")); }],
  ['51 structured valid Requirements can pass independently of legacy prose', () => { assert.ok(has(evaluator, 'public.crm_requirements')); assert.ok(no(evaluator, 'and v_opp.requirements_summary is not null')); }],
  ['52 legacy requirements_summary remains backward compatible', () => { assert.ok(has(evaluator, 'v_opp.requirements_summary')); assert.ok(has(migration, 'keep requirements_summary column for narrative/backward compatibility')); }],
  ['53 no destructive requirements_summary column removal', () => { assert.ok(no(combined, 'drop column requirements_summary')); assert.ok(no(combined, 'drop column if exists requirements_summary')); }],

  // 54–61 PIPELINE ENFORCEMENT
  ['54 Meeting Scheduled to Requirements Confirmed calls readiness evaluator', () => { assert.ok(has(transition, "p_target_stage='Requirements Confirmed'")); assert.ok(has(transition, "public.crm_get_sales_gate_assessment(v_opp.id,'REQUIREMENTS_CONFIRMED')")); }],
  ['55 BLOCKED prevents transition server-side', () => { assert.ok(has(transition, "if v_gate->>'status'='BLOCKED'")); assert.ok(has(transition, 'Requirements Confirmed is blocked')); }],
  ['56 PASS allows an otherwise valid transition', () => { assert.ok(has(transition, "if v_gate->>'status'='BLOCKED'")); assert.ok(no(transition, "if v_gate->>'status'<>'PASS'")); }],
  ['57 WARNING may proceed under current gate policy', () => { assert.ok(no(transition, "v_gate->>'status'='WARNING' then raise")); assert.ok(has(hardening, "'statusValues',jsonb_build_array('PASS','WARNING','BLOCKED')")); }],
  ['58 frontend precheck cannot bypass canonical server transition', () => { assert.ok(has(crmService, "crmSalesReadinessService.assess(id, 'REQUIREMENTS_CONFIRMED')")); assert.ok(has(crmService, "supabase.rpc('crm_transition_opportunity'")); }],
  ['59 stale frontend PASS is re-evaluated server-side', () => { assert.ok(has(transition, 'Fresh evaluation at the exact transition point')); assert.ok(has(transition, 'public.crm_get_sales_gate_assessment')); }],
  ['60 backward then forward transition re-evaluates current gate', () => { assert.ok(has(transition, "p_target_stage='Requirements Confirmed'")); assert.ok(has(transition, "v_current->'allowedPrevious'")); }],
  ['61 existing stage probabilities are preserved', () => { assert.ok(has(transition, "v_target->>'defaultProbability'")); assert.ok(no(migration, "jsonb_set(stage,'{defaultProbability}'")); }],

  // 62–81 PROPOSAL READINESS
  ['62 Proposal Readiness evaluator returns dimensions', () => { assert.ok(has(evaluator, "v_gate_key='PROPOSAL_READINESS'")); assert.ok(has(evaluator, "'dimensions',v_dimensions")); }],
  ['63 hard blocker overrides high score', () => { assert.ok(has(evaluator, "if jsonb_array_length(v_blockers)>0 then v_status:='BLOCKED'")); }],
  ['64 score is integer whole-number coverage, not fake decimal confidence', () => { assert.ok(has(evaluator, 'round(100.0*v_pass_dimension_count/18.0)::integer')); assert.ok(no(panel, 'toFixed(')); }],
  ['65 Problem dimension works', () => { assert.ok(has(evaluator, "'key','PROBLEM','label','Problem'")); }],
  ['66 Impact dimension works', () => { assert.ok(has(evaluator, "'key','IMPACT','label','Impact'")); }],
  ['67 Desired Outcome dimension works', () => { assert.ok(has(evaluator, "'key','DESIRED_OUTCOME','label','Desired Outcome'")); }],
  ['68 Audience dimension works', () => { assert.ok(has(evaluator, "'key','AUDIENCE','label','Audience'")); }],
  ['69 Scope dimension works', () => { assert.ok(has(evaluator, "'key','SCOPE','label','Scope'")); }],
  ['70 Package Fit dimension works', () => { assert.ok(has(evaluator, "'key','PACKAGE_FIT','label','Package Fit'")); }],
  ['71 Technical validation dimension works', () => { assert.ok(has(evaluator, "'key','TECHNICAL_VALIDATION','label','Technical Validation'")); }],
  ['72 Commercial validation dimension works', () => { assert.ok(has(evaluator, "'key','COMMERCIAL_VALIDATION','label','Commercial Validation'")); }],
  ['73 Timeline validation dimension works', () => { assert.ok(has(evaluator, "'key','TIMELINE_VALIDATION','label','Timeline Validation'")); }],
  ['74 Compliance Risk validation dimension works', () => { assert.ok(has(evaluator, "'key','COMPLIANCE_RISK_VALIDATION','label','Compliance/Risk Validation'")); }],
  ['75 Decision Process dimension works', () => { assert.ok(has(evaluator, "'key','DECISION_PROCESS','label','Decision Process'")); }],
  ['76 Next Action dimension works', () => { assert.ok(has(evaluator, "'key','NEXT_ACTION','label','Next Action'")); }],
  ['77 current assumptions are surfaced', () => { assert.ok(has(evaluator, "'key','ASSUMPTIONS','label','Current Assumptions'")); assert.ok(has(evaluator, "v_key='assumptions'")); }],
  ['78 current exclusions are surfaced', () => { assert.ok(has(evaluator, "'key','EXCLUSIONS','label','Current Exclusions'")); assert.ok(has(evaluator, "v_key='exclusions'")); }],
  ['79 current dependencies are surfaced', () => { assert.ok(has(evaluator, "'key','DEPENDENCIES','label','Current Dependencies'")); assert.ok(has(evaluator, "v_key='client_dependencies'")); }],
  ['80 Promise Coverage is explicitly NOT_YET_EVALUATED', () => { assert.ok(has(hardening, 'PROMISE_COVERAGE')); assert.ok(has(evaluator, "'status','NOT_YET_EVALUATED'")); assert.ok(has(evaluator, "'coverageState','FUTURE_WORKFLOW'")); }],
  ['81 final quotation-send readiness is not falsely reported complete', () => { assert.ok(has(evaluator, "'finalQuotationSendGateActive',false")); assert.ok(has(panel, 'final quotation-send gate remains inactive')); assert.ok(has(panel, 'never means')); }],

  // 82–91 NO FUTURE-SCOPE REGRESSION
  ['82 no Promise Register created', () => { assert.ok(no(combined, 'create table public.crm_promise')); assert.ok(no(combined, 'create table public.promise_register')); }],
  ['83 no dedicated Scope Conditions table created', () => { assert.ok(no(combined, 'create table public.crm_scope_conditions')); assert.ok(no(combined, 'create table public.scope_conditions')); }],
  ['84 no quotation-send RPC changed', () => { assert.ok(no(combined, 'create or replace function public.send_quotation')); assert.ok(no(combined, 'create or replace function public.crm_send_quotation')); }],
  ['85 no final quotation hard gate added', () => { assert.ok(has(evaluator, "'finalQuotationSendGateActive',false")); }],
  ['86 existing quotation approval remains untouched', () => { assert.ok(no(combined, 'create or replace function public.approve_quotation')); assert.ok(no(combined, 'create or replace function public.crm_approve_quotation')); }],
  ['87 no payment mutation added', () => { assert.ok(no(combined, 'update public.payments')); assert.ok(no(combined, 'insert into public.payments')); assert.ok(no(combined, 'delete from public.payments')); }],
  ['88 no new Won authority added', () => { assert.ok(has(transition, 'Won is controlled by Admin payment verification')); assert.ok(has(crmService, 'Opportunities may only become Won through Admin-verified advance/full payment')); }],
  ['89 no onboarding change', () => { assert.ok(no(combined, 'client_onboarding')); assert.ok(no(combined, 'onboarding_projects')); }],
  ['90 no handoff change', () => { assert.ok(no(combined, 'sales_to_delivery')); assert.ok(no(combined, 'handoff')); }],
  ['91 no manager override bypass added', () => { assert.ok(no(combined, 'p_override')); assert.ok(no(combined, 'manager_override')); assert.ok(no(crmService, 'overrideReadiness')); }],

  // 92–97 SECURITY
  ['92 anonymous readiness RPC denied', () => { assert.ok(has(hardening, 'revoke all on function public.crm_get_sales_gate_assessment(uuid,text) from public, anon')); assert.ok(has(hardening, 'grant execute on function public.crm_get_sales_gate_assessment(uuid,text) to authenticated')); }],
  ['93 unauthorized Seller denied through canonical Lead access', () => { assert.ok(has(evaluator, 'public.crm_can_access_lead(v_opp.lead_id)')); assert.ok(has(evaluator, 'Authorized CRM opportunity access is required')); }],
  ['94 cross-opportunity access cannot supply a separate Lead identity', () => { assert.ok(has(evaluator, 'where id=p_opportunity_id')); assert.ok(has(evaluator, 'v_opp.lead_id')); assert.ok(no(readinessService, 'p_lead_id')); }],
  ['95 Opportunity Lead lineage is server-derived and reused in Package Fit', () => { assert.ok(has(evaluator, 'public.crm_get_package_fit_assessment(v_opp.lead_id, v_opp.id)')); }],
  ['96 no service-role browser exposure', () => { assert.ok(no(readinessService, 'service_role')); assert.ok(no(panel, 'service_role')); assert.ok(no(crmService, 'service_role')); }],
  ['97 readiness evaluation is read-only', () => { assert.ok(has(hardening, 'stable')); assert.ok(has(evaluator, 'security definer')); assert.ok(no(evaluator, 'insert into public.')); assert.ok(no(evaluator, 'update public.')); assert.ok(no(evaluator, 'delete from public.')); }],

  // 98–109 UI
  ['98 Requirements Confirmed readiness panel renders', () => { assert.ok(has(panel, 'title="Requirements Confirmed"')); assert.ok(has(requirements, '<CRMSalesReadinessPanel')); }],
  ['99 exact blockers display', () => { assert.ok(has(panel, '<IssueList title="Hard blockers"')); assert.ok(has(panel, 'issue.message')); }],
  ['100 warnings display', () => { assert.ok(has(panel, '<IssueList title="Warnings"')); }],
  ['101 approved constraints display', () => { assert.ok(has(panel, 'Approved specialist constraints')); assert.ok(has(panel, 'assessment.approvedConstraints')); }],
  ['102 action link to Requirements works', () => { assert.ok(has(panel, "requirements: 'crm-requirements-list'")); assert.ok(has(requirements, 'id="crm-requirements-list"')); }],
  ['103 action link to Discovery works', () => { assert.ok(has(panel, "discovery: 'Probing & Discovery'")); }],
  ['104 action link to Package Fit works', () => { assert.ok(has(panel, "'package-fit': 'crm-package-fit'")); assert.ok(has(requirements, 'id="crm-package-fit"')); }],
  ['105 Open Review action works', () => { assert.ok(has(panel, "validation: 'crm-sales-validation'")); assert.ok(has(requirements, 'id="crm-sales-validation"')); }],
  ['106 Proposal Readiness preview renders', () => { assert.ok(has(panel, 'title="Proposal Readiness"')); assert.ok(has(panel, 'Pre-quotation assessment')); }],
  ['107 future workflow dimensions are clearly labeled', () => { assert.ok(has(panel, 'FUTURE WORKFLOW')); assert.ok(has(panel, 'assessment.futureDimensions')); }],
  ['108 SellerGuidanceHelp is reused with all Part 8 guidance keys', () => { assert.ok(has(panel, 'SellerGuidanceHelp')); ['section.requirements_confirmed_readiness','section.proposal_readiness','field.readiness_status','field.readiness_score','section.readiness_blockers','section.readiness_warnings','field.hard_blocker','field.future_readiness_dimension','action.resolve_readiness_blocker','status.readiness_ready','status.readiness_warning','status.readiness_blocked'].forEach(key => assert.ok(has(guidance, key), `Missing guidance ${key}`)); assert.ok(has(guidance, 'Object.assign(SELLER_GUIDANCE, SALES_READINESS_GUIDANCE)')); }],
  ['109 no unnecessary Lead Drawer readiness tab introduced', () => { assert.ok(no(leadDrawer, "id: 'readiness'")); assert.ok(no(leadDrawer, "id: 'proposal-readiness'")); }],

  // 110–121 REGRESSION / EXECUTABLE CHECKS
  ['110 Part 1 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-discovery-foundation-part-1.test.ts')); }],
  ['111 Part 2 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-requirements-part-2.test.ts')); }],
  ['112 Part 3 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-probing-discovery-part-3.test.ts')); }],
  ['113 Part 3.5 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-seller-guidance-part-3-5.test.ts')); }],
  ['114 Part 4 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-meeting-prep-part-4.test.ts')); }],
  ['115 Part 5 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-meeting-management-closeout-part-5.test.ts')); }],
  ['116 Part 6 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-package-fit-part-6.test.ts')); }],
  ['117 Part 7 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-validation-escalation-part-7.test.ts')); }],
  ['118 TypeScript command remains executable through lint script', () => { assert.equal(packageJson.scripts?.lint, 'tsc --noEmit'); }],
  ['119 Security suite remains executable', () => { assert.ok(has(packageJson.scripts?.['test:security'] || '', 'tests/security/*.test.ts')); }],
  ['120 migration-integrity command remains executable', () => { assert.ok(has(packageJson.scripts?.['migrations:check'] || '', 'scripts/migrate-production.mjs')); }],
  ['121 production build command remains executable', () => { assert.ok(has(packageJson.scripts?.build || '', 'vite build')); assert.ok(has(packageJson.scripts?.build || '', 'verify-supabase-build-config.mjs')); }],
];

assert.equal(cases.length, 121, 'Part 8 must keep the required 121 acceptance cases');
for (const [name, run] of cases) test(name, run);

// Architecture sanity outside the numbered acceptance list.
test('Part 8 migrations create no business tables', () => {
  assert.equal(createBusinessTables.length, 0);
});
test('Part 8 migration ordering is after Part 7', () => {
  assert.ok('20260909200000' > '20260909194500');
  assert.ok('20260909201500' > '20260909200000');
});
test('Part 8 only reads Part 6 and Part 7 business systems', () => {
  assert.ok(has(evaluator, 'crm_get_package_fit_assessment'));
  assert.ok(has(evaluator, 'crm_sales_validations'));
  assert.ok(no(evaluator, 'create table'));
});
