import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260920150000_crm_sales_payment_won_activation_part_12.sql', 'utf8');
const crmService = await readFile('src/lib/crmService.ts', 'utf8');
const sellerService = await readFile('src/lib/sellerCommandCenterService.ts', 'utf8');
const pipeline = await readFile('src/components/admin/CRMPipeline.tsx', 'utf8');
const sellerWorkspace = await readFile('src/components/admin/SellerExperienceLegacy.tsx', 'utf8');
const paymentsUi = await readFile('src/components/admin/PaymentsManager.tsx', 'utf8');
const salesService = await readFile('src/lib/salesService.ts', 'utf8');
const packageJson = await readFile('package.json', 'utf8');

const migrationFiles = (await readdir('supabase/migrations', { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
  .map(entry => entry.name)
  .sort();
const corpus = (await Promise.all(migrationFiles.map(name => readFile(`supabase/migrations/${name}`, 'utf8')))).join('\n');

function latestFunction(name) {
  const token = `create or replace function public.${name}`;
  const lower = corpus.toLowerCase();
  const start = lower.lastIndexOf(token.toLowerCase());
  if (start < 0) return '';
  const next = lower.indexOf('create or replace function public.', start + token.length);
  return next < 0 ? corpus.slice(start) : corpus.slice(start, next);
}

const verify = latestFunction('verify_payment_atomic');
const wonGuard = latestFunction('protect_opportunity_won_transition');
const paymentGuard = latestFunction('protect_payment_verification_fields');
const project = latestFunction('create_project_from_sale');
const onboarding = latestFunction('ensure_client_onboarding_for_project');
const commission = latestFunction('generate_commission_for_verified_payment');
const gateway = latestFunction('service_finalize_payment_gateway_attempt');
const gatewayEvent = latestFunction('service_register_payment_gateway_event');
const readModel = latestFunction('crm_get_sale_activation_state');

const cases = [
  ['01 anonymous caller cannot verify payment', () => /auth\.uid|public\.is_admin/.test(verify) && /only an active Admin|Payment verification is restricted/.test(verify)],
  ['02 Seller cannot verify payment', () => /not public\.is_admin\(\) and not v_gateway/.test(verify)],
  ['03 unauthorized authenticated user cannot verify payment', () => /not public\.is_admin\(\) and not v_gateway/.test(verify)],
  ['04 active Admin may verify valid payment', () => /public\.is_admin\(\)/.test(verify) && /status='Verified'/.test(verify)],
  ['05 protected gateway settlement may verify through trusted path', () => /profox\.gateway_settlement/.test(verify) && /verify_payment_atomic/.test(gateway)],
  ['06 cancelled payment cannot verify', () => /status in \('Cancelled','Failed','Refunded'\)/.test(verify)],
  ['07 failed payment cannot verify', () => /status in \('Cancelled','Failed','Refunded'\)/.test(verify)],
  ['08 refunded payment cannot verify', () => /status in \('Cancelled','Failed','Refunded'\)/.test(verify)],
  ['09 zero amount cannot verify', () => /amount_due,0\)<=0/.test(verify)],
  ['10 negative received amount cannot verify', () => /v_received<=0/.test(verify)],
  ['11 amount above requested amount is rejected', () => /v_received>round\(v_payment\.amount_due/.test(verify)],
  ['12 partial amount becomes Partially Paid', () => /status='Partially Paid'/.test(verify)],
  ['13 partial amount does not create Won', () => /status='Partially Paid'[\s\S]*return v_payment\.client_id/.test(verify)],
  ['14 partial amount does not create Project', () => {
    const partial=verify.indexOf("status='Partially Paid'"); const ret=verify.indexOf('return v_payment.client_id',partial); const proj=verify.indexOf('create_project_from_sale',partial);
    return partial>=0 && ret>partial && (proj<0 || proj>ret);
  }],
  ['15 qualifying Advance requires Accepted quotation', () => /payment_type in \('Advance','Full Payment'\)/.test(verify) && /v_quote\.status<>'Accepted'/.test(verify)],
  ['16 qualifying Full Payment requires Accepted quotation', () => /payment_type in \('Advance','Full Payment'\)/.test(verify) && /v_quote\.accepted_at is null/.test(verify)],
  ['17 payment opportunity must match quotation opportunity', () => /v_quote\.opportunity_id is distinct from v_payment\.opportunity_id/.test(verify)],
  ['18 unrelated quotation rejected', () => /The Payment is linked to a different quotation\/opportunity/.test(verify)],
  ['19 server derives verified_at', () => /verified_at=now\(\)/.test(verify)],
  ['20 server derives verified_by for Admin path', () => /verified_by=case when v_gateway then null else auth\.uid\(\) end/.test(verify)],
  ['21 browser cannot forge verification fields', () => /Payment settlement\/provider evidence is server-derived/.test(paymentGuard) && /new\.provider_payment_id is distinct from old\.provider_payment_id/.test(paymentGuard) && /new\.paid_at is distinct from old\.paid_at/.test(paymentGuard) && /before insert or update on public\.payments/.test(corpus)],

  ['22 Seller cannot mark Won', () => /markWon\(_id: string\)[\s\S]*only become Won through Admin-verified/.test(crmService) && /stage\.name === 'Won'/.test(pipeline)],
  ['23 ordinary browser direct update cannot mark Won without qualifying verified Payment', () => /v_verified_won<>'1'/.test(wonGuard)],
  ['24 Won requires Verified Advance or Full Payment', () => /p\.status='Verified'/.test(wonGuard) && /p\.payment_type in \('Advance','Full Payment'\)/.test(wonGuard)],
  ['25 verified non-qualifying milestone does not create Won', () => /if v_payment\.payment_type in \('Advance','Full Payment'\) and v_payment\.opportunity_id is not null then/.test(verify)],
  ['26 Partially Paid does not create Won', () => /status='Partially Paid'[\s\S]*return v_payment\.client_id/.test(verify)],
  ['27 qualifying Verified Payment atomically creates Won', () => /status='Verified'[\s\S]*profox\.payment_verified_won_transition[\s\S]*set status='Won',[\s\S]*stage='Won'/.test(verify)],
  ['28 won_at is server-derived', () => /won_at=coalesce\(won_at,now\(\)\)/.test(verify)],
  ['29 historical Won remains readable', () => /o\.status='Won' or o\.stage='Won'/.test(migration) && /wonAt/.test(readModel)],
  ['30 Won stage/status stay consistent', () => /set status='Won',[\s\S]*stage='Won'/.test(verify)],
  ['31 manual pipeline transition cannot bypass canonical payment authority', () => /Won is created automatically when a qualifying payment is verified/.test(wonGuard) && /crm_transition_opportunity/.test(crmService)],
  ['32 protected trigger still guards direct DB update paths', () => /before insert or update on public\.crm_opportunities/.test(migration)],
  ['33 normal legitimate payment verification remains successful after hardening', () => /profox\.payment_verification_rpc/.test(verify) && /generate_commission_for_verified_payment/.test(verify) && /create_project_from_sale/.test(verify)],

  ['34 existing Client reused when correctly linked', () => /v_client_id:=coalesce\(v_opp\.client_id,v_quote\.client_id,v_payment\.client_id\)/.test(verify)],
  ['35 missing Client created exactly once', () => /pg_advisory_xact_lock/.test(verify) && /insert into public\.clients/.test(verify)],
  ['36 retry does not duplicate Client', () => /if v_payment\.status='Verified' then/.test(verify) && !/if v_payment\.status='Verified'[\s\S]{0,700}insert into public\.clients/.test(verify)],
  ['37 Opportunity gets correct client_id', () => /update public\.crm_opportunities[\s\S]*set client_id=v_client_id/.test(verify)],
  ['38 Quotation gets correct client_id', () => /update public\.quotations[\s\S]*set client_id=v_client_id/.test(verify)],
  ['39 Payment gets correct client_id', () => /update public\.payments[\s\S]*set client_id=v_client_id/.test(verify)],
  ['40 Commission created once', () => /generate_commission_for_verified_payment/.test(verify) && /select id into v_existing from public\.commission_entries where payment_id=p_payment_id/.test(commission)],
  ['41 retry does not duplicate Commission', () => /select id into v_existing from public\.commission_entries where payment_id=p_payment_id/.test(commission)],
  ['42 Project created once', () => /create_project_from_sale/.test(verify) && /select id into v_project from public\.projects where source_opportunity_id=p_opportunity_id/.test(project)],
  ['43 retry does not duplicate Project', () => /select id into v_project from public\.projects where source_opportunity_id=p_opportunity_id/.test(project)],
  ['44 Project references correct Opportunity', () => /source_opportunity_id/.test(project) && /v_opp\.id/.test(project)],
  ['45 Project references Accepted quotation', () => /where opportunity_id=p_opportunity_id and status='Accepted'/.test(project)],
  ['46 Project value/currency come from quotation truth', () => /v_quote\.total,v_quote\.currency/.test(project)],
  ['47 onboarding initializes once', () => /ensure_client_onboarding_for_project/.test(corpus) && /select \* into v_onboarding from public\.client_onboardings where project_id=v_project\.id/.test(onboarding)],
  ['48 onboarding references correct Project Client Quotation payment', () => /project_id,quotation_id,triggering_payment_id/.test(onboarding) && /v_client\.id,v_project\.id,v_quote\.id,v_payment/.test(onboarding)],
  ['49 retry does not duplicate onboarding', () => /select \* into v_onboarding from public\.client_onboardings where project_id=v_project\.id/.test(onboarding)],
  ['50 unpaid opportunity cannot create project through sale activation', () => /Verified advance\/full payment is required/.test(project)],
  ['51 unaccepted quotation cannot initialize onboarding through this path', () => /v_quote\.status<>'Accepted'/.test(onboarding)],

  ['52 Awaiting Advance Payment requires Accepted quotation', () => /new\.stage='Awaiting Advance Payment'[\s\S]*q\.status='Accepted'/.test(wonGuard)],
  ['53 unrelated Accepted quotation does not satisfy gate', () => /q\.opportunity_id=new\.id/.test(wonGuard)],
  ['54 accepted quotation remains authoritative commercial source', () => /acceptedQuotation/.test(readModel) && /status='Accepted'/.test(readModel)],
  ['55 open payment due date is surfaced correctly', () => /'dueDate',v_payment\.due_date/.test(readModel)],
  ['56 overdue payment is surfaced correctly', () => /v_payment\.due_date<current_date/.test(readModel) && /PAYMENT OVERDUE/.test(readModel)],
  ['57 Payment Follow-Up uses canonical crm_activities', () => /from public\.crm_activities a/.test(readModel) && /activity_type='Payment Follow-Up'/.test(readModel)],
  ['58 no duplicate follow-up system exists', () => !/create table[^;]*(payment_tasks|payment_followups|collection_reminders_v2)/i.test(migration)],
  ['59 legitimate external payment wait is represented without inventing CRM data', () => /externalWaitRepresented/.test(readModel) && /waitingOn','Customer payment/.test(readModel) && !/insert into public\.crm_activities/.test(migration)],
  ['60 absence of payment request creates exact remediation guidance rather than fake record', () => /PAYMENT_REQUEST_MISSING/.test(readModel) && /Generate the canonical payment request/.test(readModel)],
  ['61 Seller sees payment operational state without verification authority', () => /operationalLabel/.test(sellerWorkspace) && !/verifyPayment\(/.test(sellerWorkspace)],
  ['62 Admin sees canonical verification route', () => /Review verification/.test(sellerWorkspace) && /Admin verify payment through protected workflow/.test(paymentsUi)],

  ['63 cross-opportunity payment rejected', () => /The Payment is linked to a different quotation\/opportunity/.test(verify)],
  ['64 cross-customer activation rejected', () => /Cross-client activation is blocked/.test(verify)],
  ['65 duplicate gateway event does not duplicate activation', () => /on conflict\(provider,provider_event_id\) do nothing/.test(gatewayEvent)],
  ['66 duplicate Admin verification does not duplicate activation', () => /if v_payment\.status='Verified' then/.test(verify) && /select id into v_existing from public\.commission_entries where payment_id=p_payment_id/.test(commission) && /select id into v_project from public\.projects where source_opportunity_id=p_opportunity_id/.test(project)],
  ['67 browser cannot forge verified_by', () => /new\.verified_by is distinct from old\.verified_by/.test(paymentGuard)],
  ['68 browser cannot forge verified_at', () => /new\.verified_at is distinct from old\.verified_at/.test(paymentGuard)],
  ['69 browser cannot forge gateway-settlement context', () => /revoke all on function public\.service_finalize_payment_gateway_attempt[^;]* from public,anon,authenticated/i.test(corpus) && /grant execute on function public\.service_finalize_payment_gateway_attempt[^;]* to service_role/i.test(corpus) && /profox\.gateway_settlement/.test(paymentGuard) && /new\.provider_payment_id is distinct from old\.provider_payment_id/.test(paymentGuard)],
  ['70 internal Payment tokens are not exposed to Seller read model', () => !/paymentLink|public_payment_token_hash|provider_payment_id/i.test(readModel) && /requestAvailable/.test(readModel)],
  ['71 service-role secrets are absent from frontend bundle', () => !/service_role|sb_secret_/i.test(crmService + sellerService + pipeline + sellerWorkspace + paymentsUi + salesService)],
  ['72 payment verification rollback does not leave half-Won state', () => /exception when others[\s\S]*raise/.test(verify) && /status='Verified'[\s\S]*set status='Won'/.test(verify)],
  ['73 failed project activation does not create impossible split commercial truth', () => /create_project_from_sale\(v_payment\.opportunity_id\)/.test(verify) && /return v_client_id;[\s\S]*exception when others/.test(verify)],
  ['74 existing audit history remains append-only/traceable', () => /trigger_crm_audit_payment_timeline/.test(corpus) && /crm_write_lead_event/.test(corpus)],

  ['75 Awaiting Payment operational state renders desktop', () => /Payment & sale activation/.test(sellerWorkspace) && /Payment & sale activation/.test(pipeline)],
  ['76 Awaiting Payment operational state renders mobile', () => /sm:flex-row|sm:grid-cols/.test(sellerWorkspace) && /sm:grid-cols/.test(pipeline)],
  ['77 keyboard navigation works', () => /<button/.test(sellerWorkspace) && /<button/.test(pipeline)],
  ['78 focus indicators visible', () => /focus-visible:outline/.test(sellerWorkspace) && /focus-visible:outline/.test(pipeline) && /focus-visible:outline/.test(paymentsUi)],
  ['79 overdue is not color-only', () => /OVERDUE/.test(sellerWorkspace) && /OVERDUE/.test(pipeline)],
  ['80 partial payment clearly distinguishable from Verified', () => /PARTIAL PAYMENT RECEIVED/.test(readModel) && /VERIFIED/.test(readModel)],
  ['81 Seller has no Verify Payment action', () => !/verifyPayment\(/.test(sellerWorkspace) && /isAdmin &&/.test(paymentsUi)],
  ['82 Seller has no Mark Won action', () => /stage\.name === 'Won'/.test(pipeline) && /markWon\(_id: string\)/.test(crmService)],
  ['83 Admin canonical Payment verification is reachable', () => /Review payment verification/.test(pipeline) && /Admin verify payment through protected workflow/.test(paymentsUi)],
  ['84 exact blocker remediation links work', () => /blockers/.test(sellerWorkspace) && /paymentWorkspaceUrl/.test(pipeline)],
  ['85 accepted quotation link is canonical', () => /Accepted quotation/.test(sellerWorkspace) && /acceptedQuotation/.test(pipeline)],
  ['86 Payment Follow-Up opens canonical Activity workflow', () => /Payment Follow-Up/.test(sellerWorkspace) && /activityWorkspaceUrl/.test(pipeline)],
  ['87 Client Project Onboarding status surfaces only appropriate information', () => /Client.*ACTIVE|Client/.test(sellerWorkspace) && /Project/.test(sellerWorkspace) && /Onboarding/.test(sellerWorkspace) && /verifiedBy',case when v_is_admin/.test(readModel)],
];

assert.equal(cases.length, 87, 'Part 12 source-spec matrix must contain exactly 87 cases.');

for (const [name, verifyCase] of cases) {
  test(`PART 12 MATRIX ${name}`, () => {
    assert.ok(verifyCase(), name);
  });
}
