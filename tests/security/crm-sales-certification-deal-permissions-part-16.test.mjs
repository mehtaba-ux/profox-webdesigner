import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260922150000_crm_sales_certification_deal_permissions_part_16.sql','utf8');
const part16Performance = await readFile('supabase/migrations/20260922151000_crm_sales_certification_deal_permissions_part_16_performance_hardening.sql','utf8');
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
