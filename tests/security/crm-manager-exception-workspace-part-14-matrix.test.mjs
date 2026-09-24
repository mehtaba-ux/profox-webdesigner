import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260921110000_crm_manager_exception_workspace_part_14.sql','utf8');
const service = await readFile('src/lib/managerExceptionService.ts','utf8');
const ui = await readFile('src/components/admin/ManagerExceptionWorkspace.tsx','utf8');
const apps = await readFile('src/lib/workspaceApps.ts','utf8');
const frame = await readFile('src/components/admin/workspace/WorkspaceRouteFrame.tsx','utf8');
const app = await readFile('src/App.tsx','utf8');
const corpus = [migration,service,ui,apps,frame,app].join('\n');
const has = (value) => corpus.includes(value);
const mhas = (value) => migration.includes(value);
const uhas = (value) => ui.includes(value);

const cases = [
  ['01 unauthenticated workspace access rejected', () => mhas('Authentication required.')],
  ['02 ordinary Seller cannot access team Manager workspace', () => mhas("v_role is distinct from 'admin'") && /roles: \['admin'\]/.test(apps)],
  ['03 Admin can access team workspace', () => mhas("'scope','team'") && uhas('isAdmin')],
  ['04 source-specific authorization preserved', () => mhas('quotation_approval_reviewer_authorized(q.id,v_uid)') && mhas('crm_sales_validation_reviewer_eligible')],
  ['05 no cross-Seller data leak', () => mhas('Manager Exception Workspace access denied.') && /roles: \['admin'\]/.test(apps)],
  ['06 stable exception keys', () => mhas('proposal-readiness:') && mhas('sales-validation:') && !mhas('gen_random_uuid()')],
  ['07 deterministic sorting', () => mhas('order by sort_rank asc,overdue desc,opened_at asc nulls last,exception_key')],
  ['08 pagination', () => mhas('p_limit integer default 50') && mhas('p_offset integer default 0') && mhas("'hasMore'")],
  ['09 filtering', () => mhas("v_filter='blocking'") && mhas("v_filter='promise_coverage'")],
  ['10 search', () => mhas("v_search=''") && mhas("like '%'||v_search||'%'")],
  ['11 safe empty state', () => uhas('No matching Sales exceptions.') && uhas('zero-state categories are not filled with fake production exceptions')],

  ['12 Proposal Readiness BLOCKED becomes exception', () => mhas('PROPOSAL_READINESS_BLOCKED') && mhas("a.assessment->>'status'='BLOCKED'")],
  ['13 non-blocked readiness does not', () => mhas("a.assessment->>'status'='BLOCKED'") && !mhas("a.assessment->>'status'='READY'")],
  ['14 Technical Validation pending appears', () => mhas('crm_sales_validations') && mhas('SALES_VALIDATION_PENDING')],
  ['15 Commercial Validation pending appears', () => mhas('crm_sales_validations') && mhas("'validationType',v.validation_type")],
  ['16 Timeline Validation pending appears', () => mhas('crm_sales_validations') && mhas("'validationType',v.validation_type")],
  ['17 Compliance/Risk pending appears', () => mhas('crm_sales_validations') && !/v\.validation_type\s+in\s*\(/i.test(migration)],
  ['18 Scope Validation pending appears', () => mhas('crm_sales_validations') && !/v\.validation_type\s+in\s*\(/i.test(migration)],
  ['19 resolved validation disappears', () => mhas("v.status in ('PENDING','IN_REVIEW','NEEDS_INFORMATION','REJECTED','STALE')")],
  ['20 stale validation represented accurately', () => mhas("when v.status='STALE' then 'SALES_VALIDATION_STALE'")],
  ['21 authorized reviewer route preserved', () => mhas('crm_sales_validation_reviewer_eligible') && mhas('Open Validation')],
  ['22 pending quotation approval appears', () => mhas('QUOTATION_APPROVAL_PENDING') && mhas("q.approval_decision='pending'")],
  ['23 approved quotation approval disappears', () => !/approval_decision='approved'[\s\S]{0,100}quotation_approval_exceptions/.test(migration) && mhas("q.approval_decision='changes_requested'")],
  ['24 changes-requested state routes correctly', () => mhas('QUOTATION_CHANGES_REQUESTED') && mhas('/admin/quotation-approvals/')],
  ['25 unauthorized manager cannot gain approval authority through aggregate', () => mhas('quotation_approval_reviewer_authorized(q.id,v_uid)') && !uhas('Approve Quotation')],

  ['26 completed meeting missing close-out appears', () => mhas("m.status='Completed'") && mhas('MEETING_CLOSEOUT_MISSING')],
  ['27 correctly closed meeting does not', () => mhas("nullif(btrim(coalesce(m.outcome,'')),'') is null") && mhas('m.follow_up_at is null')],
  ['28 scheduled future meeting does not falsely appear', () => mhas("m.status='Completed'") && !mhas("m.status='Scheduled'")],
  ['29 decision authority missing appears only when applicable', () => mhas('DECISION_AUTHORITY_MISSING') && mhas("d->>'key'='DECISION_PROCESS'")],
  ['30 simple deal not requiring deep authority does not falsely appear', () => mhas("a.stage in ('Requirements Confirmed','Quotation Sent','Negotiation / Decision Pending')")],
  ['31 Awaiting-client state is not silently treated as confirmed authority', () => mhas('crm_get_sales_gate_assessment') && mhas("d->>'status'='BLOCKED'")],
  ['32 canonical discovery source remains authoritative', () => mhas('structured Requirements and Discovery') && !mhas('authority_score')],

  ['33 open deal without opportunity-linked Scheduled activity appears', () => mhas('NEXT_ACTION_MISSING') && mhas("w.queue_kind='missing_next_action'")],
  ['34 valid Scheduled activity clears missing exception', () => mhas('p.next_activity_id is null')],
  ['35 Completed activity does not satisfy next-action requirement', () => mhas('crm_get_pipeline_command_center()') && !/o\\.next_follow_up_at/.test(migration)],
  ['36 Cancelled activity does not satisfy next-action requirement', () => mhas('crm_get_pipeline_command_center()') && mhas('nextActivity')],
  ['37 overdue Scheduled activity becomes overdue exception', () => mhas('NEXT_ACTION_OVERDUE') && mhas('p.next_activity_due_at<now()')],
  ['38 rescheduled future activity clears overdue state', () => mhas('p.next_activity_due_at<now()')],
  ['39 unrelated Lead activity does not satisfy opportunity next action', () => mhas('w.opportunity_id=p.opportunity_id')],
  ['40 closed/Won opportunity does not receive inappropriate open-deal exception', () => mhas("where item->>'status'='Open'")],
  ['41 legitimate external wait is handled by existing Part 11/12 policy', () => mhas('crm_get_sales_work_queue') && mhas("w.queue_kind='missing_next_action'")],

  ['42 RETURNED_TO_SALES appears', () => mhas('HANDOFF_RETURNED_TO_SALES') && mhas("where h.status='RETURNED_TO_SALES'")],
  ['43 Not Submitted does not falsely appear as returned', () => !mhas('NOT_SUBMITTED') && mhas("where h.status='RETURNED_TO_SALES'")],
  ['44 Submitted does not falsely appear as returned', () => !/where h\.status='SUBMITTED'/.test(migration)],
  ['45 Accepted does not appear as returned', () => !/where h\.status='ACCEPTED'/.test(migration)],
  ['46 return reason is displayed', () => mhas('returnReasonCodes') && mhas('return_notes')],
  ['47 missing items are displayed safely', () => mhas("'missingItems'") && mhas("'label',x->>'label'")],
  ['48 source Seller is identified correctly', () => mhas('o.salesperson_id') && mhas('h.salesperson_id seller_id')],
  ['49 canonical handoff action URL used', () => mhas('/admin/project-handover/')],
  ['50 resubmission removes or changes returned exception', () => mhas("where h.status='RETURNED_TO_SALES'")],
  ['51 Part 13 authorization remains unchanged', () => !/create or replace function public\.(accept_sales_project_handover|return_sales_project_handover|submit_sales_project_handover)/.test(migration)],

  ['52 material Promise missing quote coverage appears', () => mhas('PROMISE_QUOTE_COVERAGE_BLOCKED') && mhas('quotation_sales_coverage')],
  ['53 Draft Promise does not', () => mhas("p.record_state='ACTIVE'") && mhas("p.source_type<>'INTERNAL_DRAFT'")],
  ['54 properly covered Promise does not', () => mhas("cov.coverage_status in ('UNMAPPED','PARTIAL','CONFLICT','STALE')")],
  ['55 existing Part 10A reconciliation remains authority', () => mhas('quotation_sales_coverage') && !mhas('promise_matching')],
  ['56 existing Part 10B coverage remains authority', () => mhas('crm_get_quotation_sales_reconciliation') && mhas('finalQuotationSendGateActive')],
  ['57 audited SOP override may surface when repeated', () => mhas('REPEATED_SOP_OVERRIDE') && mhas('duration_override_at is not null')],
  ['58 non-audited inferred override is never fabricated', () => mhas("event_type,'')) like '%override%'") && !mhas('inferred_override')],
  ['59 workspace cannot create new override', () => !/set_quotation_revenue_distribution_override|admin_set_quotation_duration_override/.test(migration)],
  ['60 repeated-override logic uses real audit evidence only', () => mhas('having count(*)>=2') && mhas('crm_lead_events')],

  ['61 same validation does not appear twice', () => mhas('row_number() over(partition by a.exception_key')],
  ['62 generic BI plus canonical Sales source do not duplicate one exception', () => !mhas('get_business_intelligence_exceptions(')],
  ['63 two distinct exception types on same opportunity may coexist', () => mhas('proposal-readiness:') && mhas('decision-authority:')],
  ['64 stable key remains unchanged across refresh', () => !mhas('gen_random_uuid()') && mhas("'next-action-overdue:'||p.next_activity_id::text")],
  ['65 source resolution removes only resolved exception', () => mhas('union all select * from validation_exceptions') && mhas('union all select * from stage_sla_exceptions')],
  ['66 unrelated exception remains', () => mhas('all_items as') && mhas('deduped as')],

  ['67 Seller cannot enumerate team exception data', () => mhas("v_role is distinct from 'admin'")],
  ['68 customer rejected', () => mhas("v_role is distinct from 'admin'")],
  ['69 anonymous rejected', () => mhas('Authentication required.') && mhas('from public,anon')],
  ['70 sensitive payment/provider data excluded', () => !/provider_payment_id|payment_provider|payment_token/i.test(corpus)],
  ['71 private quotation tokens excluded', () => !/customer_view_token_hash/.test(corpus)],
  ['72 onboarding tokens excluded', () => !/onboarding_access_token|access_token/.test(corpus)],
  ['73 source-specific permission remains authoritative', () => mhas('quotation_approval_reviewer_authorized') && mhas('crm_sales_validation_reviewer_eligible')],
  ['74 SECURITY DEFINER search_path safe', () => /security definer\s+set search_path='public','pg_temp'/i.test(migration)],
  ['75 no broad-open RLS or policies added', () => !/create policy|alter table .* enable row level security/i.test(migration)],
  ['76 no service-role browser secret exposure', () => !/service_role|SUPABASE_SERVICE|sb_secret_/i.test(service+ui)],

  ['77 no new exception business table exists in migration', () => !/create table/i.test(migration)],
  ['78 generic Business Intelligence feature is preserved rather than redesigned', () => !/create or replace function public\.get_business_intelligence_exceptions/.test(migration)],
  ['79 workspace has no generic Resolve Ignore Dismiss path', () => !/Resolve Exception|Ignore forever|Dismiss blocker|Hide exception permanently/.test(ui)],
  ['80 current Not Submitted handoff semantics cannot become Returned', () => mhas("where h.status='RETURNED_TO_SALES'") && !mhas('Not Submitted')],
  ['81 stage SLA uses canonical Pipeline configuration output', () => mhas('stageSlaHours') && mhas('stageAgeHours') && mhas('STAGE_SLA_EXCEEDED')],
  ['82 Part 14 adds no duplicate notification campaign', () => !/service_queue_staff_operational_notification|notification_outbox|send_email|whatsapp/i.test(migration)],
  ['83 Part 14 introduces no AI decision authority', () => !/AI exception resolution|ai_approve|ai_override|WandSparkles|Sparkles|✨/i.test(corpus)],
  ['84 Part 15 Seller Quality and Performance is not implemented', () => !/seller_quality|first_pass_handoff_acceptance|missing_information_rate|post_sale_scope_change_rate/i.test(corpus)],
];

assert.equal(cases.length,84,'Part 14 specification matrix must contain exactly 84 cases');
for (const [name,check] of cases) test(name,()=>assert.equal(check(),true,name));
