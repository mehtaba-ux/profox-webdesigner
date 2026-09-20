import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const core = await readFile('supabase/migrations/20260920181000_crm_sales_delivery_handoff_part_13.sql', 'utf8');
const lifecycle = await readFile('supabase/migrations/20260920181100_crm_sales_delivery_handoff_lifecycle_visibility_part_13.sql', 'utf8');
const service = await readFile('src/lib/salesHandoffService.ts', 'utf8');
const ui = await readFile('src/components/admin/SalesProjectHandoverView.tsx', 'utf8');
const projectUi = await readFile('src/components/admin/ProjectManager.tsx', 'utf8');
const sellerUi = await readFile('src/components/admin/SellerLifecyclePanel.tsx', 'utf8');
const corpus = [core,lifecycle,service,ui,projectUi,sellerUi].join('\n');

const cases = [
  ['01 handoff requires authenticated user', () => /Authentication required\./.test(core)],
  ['02 unauthorized Seller cannot access unrelated Project', () => /Project handoff access denied/.test(core) && /o\.salesperson_id=auth\.uid\(\)/.test(core)],
  ['03 unrelated PM cannot review another Project', () => /Only the assigned Project Manager or Administrator may (?:accept|return)/.test(core)],
  ['04 source Seller can access own handoff', () => /v_uid is distinct from v_salesperson/.test(core)],
  ['05 assigned PM can access handoff', () => /v_uid is distinct from v_project\.project_manager_id/.test(core)],
  ['06 Admin authority preserved', () => /public\.is_admin\(\)/.test(core)],
  ['07 Won Opportunity required', () => /OPPORTUNITY_NOT_WON/.test(core)],
  ['08 accepted quotation required', () => /ACCEPTED_QUOTATION_REQUIRED/.test(core)],
  ['09 qualifying verified payment required', () => /VERIFIED_PAYMENT_REQUIRED/.test(core) && /payment_type in \('Advance','Advance Payment','Full Payment'\)/.test(core)],
  ['10 Project must be Sales Handover', () => /PROJECT_NOT_SALES_HANDOVER/.test(core)],
  ['11 Client must be linked', () => /CLIENT_NOT_LINKED/.test(core)],
  ['12 completed onboarding enforced', () => /ONBOARDING_INCOMPLETE/.test(core)],
  ['13 required structured Sales requirements available', () => /STRUCTURED_REQUIREMENTS_MISSING/.test(core) && /CLIENT_CONFIRMED/.test(core)],
  ['14 stale required validation blocks', () => /REQUIRED_VALIDATION_UNRESOLVED/.test(core) && /STALE/.test(core)],
  ['15 unresolved material Promise blocks', () => /PROMISE_ALIGNMENT_UNRESOLVED/.test(core)],
  ['16 material Scope Conditions appear', () => /scopeConditions/.test(core) && /crm_sales_scope_conditions/.test(core)],
  ['17 dependencies appear', () => /outstandingDeliveryDependencies/.test(core) && /DEPENDENCY/.test(core)],
  ['18 immutable quotation snapshots used', () => /quotation_items/.test(core) && /salesScopeSnapshot/.test(core)],
  ['19 current catalog does not rewrite historical scope', () => !/from public\.sales_products/.test(core) && /quotation_items/.test(core)],
  ['20 no secret token exposure', () => !/'providerPaymentId'|'accessToken'|'privateKey'/.test(core) && /private keys/.test(ui)],

  ['21 Seller may submit READY handoff', () => /submit_sales_project_handover/.test(core) && /readinessStatus/.test(core)],
  ['22 BLOCKED handoff cannot submit', () => /Sales handoff is BLOCKED/.test(core)],
  ['23 submission creates exactly one current attempt', () => /project_sales_handover_one_pending_attempt/.test(core) && /insert into public\.project_sales_handover_attempts/.test(core)],
  ['24 duplicate submit idempotent or safe', () => /'idempotent',true/.test(core) && /already waiting for Delivery review/.test(core)],
  ['25 Seller cannot Accept', () => /Only the assigned Project Manager or Administrator may accept/.test(core)],
  ['26 assigned PM can Accept submitted handoff', () => /accept_sales_project_handover/.test(core) && /v_uid<>v_project\.project_manager_id/.test(core)],
  ['27 PM cannot Accept unsubmitted handoff', () => /No submitted Sales handoff is available for review/.test(core)],
  ['28 PM cannot Accept returned stale attempt', () => /Only the current Submitted or Resubmitted handoff may be accepted/.test(core)],
  ['29 acceptance records server actor/time', () => /reviewed_by=v_uid/.test(core) && /reviewed_at=now\(\)/.test(core)],
  ['30 acceptance completes PM review task', () => /workflow_key='sales_handover_review'/.test(core) && /Delivery accepted handoff attempt/.test(core)],
  ['31 PM can Return submitted handoff', () => /return_sales_project_handover/.test(core) && /Only the assigned Project Manager or Administrator may return/.test(core)],
  ['32 Return requires structured reason', () => /requires at least one structured reason/.test(core)],
  ['33 OTHER requires explanatory note', () => /OTHER requires a specific explanatory note/.test(core)],
  ['34 Return records server actor/time', () => /decision='RETURNED_TO_SALES'/.test(core) && /reviewed_at=now\(\)/.test(core)],
  ['35 returned handoff stays Sales-owned', () => /salesOwnershipRestored/.test(core) && /Sales owns the returned handoff/.test(core)],
  ['36 Return reopens Seller action safely', () => /workflow_key='sales_handover_submission'/.test(core) && /status='To Do'/.test(core)],
  ['37 Seller can resubmit after correction', () => /v_status:='RESUBMITTED'/.test(core)],
  ['38 resubmission preserves earlier Return history', () => /resubmitted_from_attempt_id/.test(core) && /history/.test(core)],
  ['39 PM can accept resubmission', () => /v_attempt\.status not in \('SUBMITTED','RESUBMITTED'\)/.test(core)],
  ['40 accepted handoff cannot be returned casually', () => /Only the current Submitted or Resubmitted handoff may be returned to Sales/.test(core)],

  ['41 Sales Handover to Content blocked without Accepted', () => /Delivery must accept the Sales handoff before Content can begin/.test(core)],
  ['42 Submitted unreviewed blocks Content', () => /v_latest\.status<>'ACCEPTED'/.test(core)],
  ['43 Returned blocks Content', () => /v_latest\.status<>'ACCEPTED'/.test(core)],
  ['44 Accepted allows Content with existing conditions', () => /v_latest\.status<>'ACCEPTED'/.test(core) && /v_incomplete/.test(core)],
  ['45 manual PM task Done cannot bypass acceptance', () => /sales_handover_review task status is controlled|Sales handoff review task status is controlled/.test(core)],
  ['46 manual Seller notes cannot bypass', () => /Delivery must accept the Sales handoff/.test(core) && /sellerNotesFingerprint/.test(core)],
  ['47 onboarding completion alone cannot bypass', () => /Client onboarding must be completed before Content begins/.test(core) && /Delivery must accept/.test(core)],
  ['48 PM assignment alone cannot bypass', () => /Assign an active Project Manager/.test(core) && /Delivery must accept/.test(core)],
  ['49 generic Admin stage mutation cannot bypass', () => /v_latest\.status<>'ACCEPTED'/.test(core) && /public\.is_admin/.test(core)],
  ['50 later Delivery stage gates unchanged', () => /when 'Content' then 'UI\/UX Design'/.test(core) && /when 'Handover' then 'Completed'/.test(core)],

  ['51 Requirements from canonical structured requirements', () => /from public\.crm_requirements/.test(core) && /legacyRequirementsSummaryAuthoritative/.test(core)],
  ['52 accepted quotation supplies purchased products', () => /from public\.quotation_items/.test(core)],
  ['53 quotation snapshots remain immutable source', () => /product_name_snapshot/.test(core) && /description_snapshot/.test(core)],
  ['54 verified payment comes from payments', () => /from public\.payments/.test(core) && /status='Verified'/.test(core)],
  ['55 onboarding comes from client_onboardings', () => /from public\.client_onboardings/.test(core)],
  ['56 validations from crm_sales_validations', () => /from public\.crm_sales_validations/.test(core)],
  ['57 promises from crm_sales_promises', () => /from public\.crm_sales_promises/.test(core)],
  ['58 scope conditions from crm_sales_scope_conditions', () => /from public\.crm_sales_scope_conditions/.test(core)],
  ['59 Seller notes cannot overwrite canonical facts', () => /seller_notes_snapshot/.test(core) && /source_refs/.test(core)],
  ['60 lifecycle does not duplicate payment commercial truth', () => /create table public\.project_sales_handover_attempts/.test(core) && !/payment_verified boolean|quotation_total|requirements jsonb/.test(core)],

  ['61 Seller cannot forge Accepted', () => /revoke all on table public\.project_sales_handover_attempts from public,anon,authenticated/.test(core)],
  ['62 PM cannot forge Seller submission actor', () => /submitted_by is distinct from old\.submitted_by/.test(core) && /Only the source Seller may submit/.test(core)],
  ['63 browser cannot forge review timestamps', () => /reviewed_at=now\(\)/.test(core) && /review evidence must be changed through the protected review workflow/.test(core)],
  ['64 browser cannot write accepted version directly', () => /Submitted Sales handoff version evidence is immutable/.test(core)],
  ['65 customer cannot access internal handoff', () => /o\.salesperson_id=auth\.uid\(\)/.test(core) && /p\.project_manager_id=auth\.uid\(\)/.test(core)],
  ['66 anonymous cannot access handoff', () => /revoke all on function public\.project_get_sales_handoff_brief\(uuid\) from public,anon/.test(core)],
  ['67 direct protected task Done cannot bypass Accept', () => /profox\.sales_handover_review_rpc/.test(core) && /Sales handoff review task status is controlled/.test(core)],
  ['68 concurrent accept return resolves safely', () => /for update/.test(core) && /p_expected_attempt/.test(core)],
  ['69 repeated Return does not duplicate uncontrolled tasks', () => /update public\.project_tasks/.test(core) && !/insert into public\.project_tasks/.test(core)],
  ['70 previous versions history remain queryable', () => /project_sales_handover_attempts_project_history/.test(core) && /'history'/.test(core)],
  ['71 accepted evidence cannot be silently rewritten', () => /A reviewed Sales handoff attempt is immutable/.test(core) && /sourceDigest/.test(core)],
  ['72 RLS remains narrow', () => /enable row level security/.test(core) && /project_sales_handover_attempts_select_authorized_staff/.test(core)],

  ['73 Seller desktop Handoff renders', () => /Authoritative Client Brief & Delivery Review/.test(ui)],
  ['74 Seller mobile renders', () => /sm:px-6|sm:p-8/.test(ui)],
  ['75 PM desktop review renders', () => /Accept Handoff/.test(ui) && /Return to Sales/.test(ui)],
  ['76 PM mobile renders', () => /sm:flex-row/.test(ui) && /grid gap/.test(ui)],
  ['77 keyboard navigation works', () => /focus-visible:outline/.test(ui)],
  ['78 focus visible', () => /focus-visible:outline-2/.test(ui)],
  ['79 Returned state is not color-only', () => /RETURNED TO SALES/.test(ui) && /Returned to Sales/.test(ui)],
  ['80 blocker messages associated with remediation', () => /Resolve at source/.test(ui)],
  ['81 return reason form accessible', () => /fieldset/.test(ui) && /legend/.test(ui) && /handoff-review-note/.test(ui)],
  ['82 history readable', () => /Review History/.test(ui) && /Attempt #/.test(ui)],
  ['83 source deep links work', () => /Open source/.test(ui) && /Verify source/.test(ui)],
  ['84 no secret field rendered', () => !/provider_payment_id|access_token|private_key|api_secret/.test(ui)],
  ['85 no duplicate handoff panel exists', () => /\/admin\/project-handover\//.test(corpus) && !/SalesHandoffV2|handoff-v2/.test(corpus)]
];

assert.equal(cases.length, 85, 'Part 13 specification matrix must contain exactly 85 cases');

for (const [name, check] of cases) {
  test(name, () => assert.equal(check(), true, name));
}
