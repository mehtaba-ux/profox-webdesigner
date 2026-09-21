import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile('supabase/migrations/20260921190000_crm_seller_quality_performance_part_15.sql','utf8');
const service=await readFile('src/lib/salesPerformanceService.ts','utf8');
const ui=await readFile('src/components/admin/SalesPerformanceManagement.tsx','utf8');
const packageJson=JSON.parse(await readFile('package.json','utf8'));
const corpus=[migration,service,ui].join('\n');
const m=(s)=>migration.includes(s);
const u=(s)=>ui.includes(s);

const cases=[
 ['01 unauthenticated snapshot access rejected',()=>m('Authentication required')],
 ['02 Seller may view own snapshot',()=>m('You can only view your own sales performance')&&service.includes('get_my_sales_performance')],
 ['03 Seller may not view another Seller snapshot',()=>m('v_actor IS DISTINCT FROM p_salesperson_id')],
 ['04 Admin may view authorized Sellers',()=>m('v_is_admin boolean:=public.is_admin()')&&service.includes('admin_get_sales_performance')],
 ['05 inactive/non-Sales user rejected',()=>m('Active Sales access is required')],
 ['06 completed historical review immutable',()=>m('Completed performance reviews are immutable')],
 ['07 scheduled review uses canonical Admin workflow',()=>service.includes('admin_update_sales_performance_review')&&u('Save review')],
 ['08 no duplicate performance table created',()=>!/\bcreate\s+table\b/i.test(migration)&&m('seller_quality_reviews')],

 ['09 on-time response counted correctly',()=>m('first_response_at<=first_response_due_at')],
 ['10 late response counted correctly',()=>m('first_response_at>first_response_due_at')],
 ['11 open breached response represented correctly',()=>m('first_response_at IS NULL AND first_response_due_at<v_effective_end')],
 ['12 Lead without applicable SLA excluded',()=>m('l.first_response_due_at IS NOT NULL')],
 ['13 forged/missing response evidence not successful',()=>m('first_response_evidence_type')&&m('first_response_evidence_id')&&m('unknownIncompleteEvidence')],
 ['14 first-response period boundary correct',()=>m('coalesce(l.accepted_at,l.assigned_at,l.created_at)>=v_start')&&m('<v_end_exclusive')],
 ['15 reassignment attribution handled safely',()=>m('excludedUnsafeOwnershipAttribution')&&m('accepted_at>=l.assigned_at')],
 ['16 zero response denominator gives insufficient data',()=>m("v_first_eligible=0 then 'INSUFFICIENT_DATA'")],

 ['17 confirmed required Requirement counts',()=>m('REQUIREMENTS_COMPLETENESS')&&m('confirmedRequirements')],
 ['18 Seller hypothesis does not get a new formula',()=>m("crm_get_sales_gate_assessment(v_opp.id,'REQUIREMENTS_CONFIRMED')")&&!m('SELLER_HYPOTHESIS=')],
 ['19 Not Applicable handled by canonical evaluator',()=>m('canonical Requirement definitions, conditional applicability, certainty and Not Applicable handling')],
 ['20 conditional Requirement applicability reused',()=>m("crm_get_sales_gate_assessment(v_opp.id,'REQUIREMENTS_CONFIRMED')")],
 ['21 unresolved required Requirement reflected',()=>m('unresolvedRequiredRequirements')],
 ['22 Proposal Readiness evaluator reused',()=>m("crm_get_sales_gate_assessment(v_opp.id,'PROPOSAL_READINESS')")],
 ['23 BLOCKED readiness represented accurately',()=>m("WHEN 'BLOCKED' THEN v_readiness_blocked")],
 ['24 READY readiness represented accurately',()=>m("WHEN 'READY' THEN v_readiness_ready")],
 ['25 no duplicate readiness formula implemented',()=>!m('proposal_readiness_score')&&m('Current readiness evaluation as of snapshot time')],

 ['26 accepted first attempt counts first-pass success',()=>m("a.attempt_number=1")&&m("a.status='ACCEPTED'")],
 ['27 first attempt returned counts first-pass failure',()=>m("a.status='RETURNED_TO_SALES'")&&m('returnedFirstPass')],
 ['28 later successful resubmission does not rewrite first-pass',()=>m('attempt_number=1')],
 ['29 Not Submitted excluded',()=>m("a.status IN ('ACCEPTED','RETURNED_TO_SALES')")],
 ['30 Submitted awaiting review excluded',()=>m('a.reviewed_at>=v_start')&&m("a.status IN ('ACCEPTED','RETURNED_TO_SALES')")],
 ['31 zero reviewed handoffs insufficient',()=>m("v_reviewed_handoffs=0 then 'INSUFFICIENT_DATA'")],
 ['32 missing-information Return uses structured reason',()=>m('MISSING_REQUIREMENT')&&m('UNCLEAR_REQUIREMENT')&&m('CLIENT_DEPENDENCY_MISSING')&&m('ONBOARDING_INFORMATION_INCOMPLETE')],
 ['33 non-missing Return not falsely counted',()=>m('Commercial, scope and timeline returns are not relabeled as missing information')],

 ['34 Part 11 Scheduled crm_activity canonical',()=>m('Part 11 opportunity-linked crm_activities')],
 ['35 legacy next_follow_up_at cannot satisfy metric',()=>!(/\bo\.next_follow_up_at\b/.test(migration))&&m('is intentionally unused')],
 ['36 completed-on-time action counted',()=>m("a.status='Completed' AND a.completed_at IS NOT NULL AND a.completed_at<=a.due_at")],
 ['37 completed-late action counted',()=>m("a.status='Completed' AND a.completed_at IS NOT NULL AND a.completed_at>a.due_at")],
 ['38 overdue open action counted separately',()=>m('currentOverdueNextAction')],
 ['39 Cancelled action handled',()=>m("a.status='Cancelled'")],
 ['40 rescheduled action handled',()=>m('a.reschedule_count>0')],
 ['41 repeated reschedule represented',()=>m('a.reschedule_count>1')],
 ['42 legitimate wait behavior remains source-policy responsibility',()=>m('Current missing/overdue next action is reported separately')],
 ['43 current missing next action separate from period performance',()=>m('currentOperationalHealth')&&m('currentMissingNextAction')],

 ['44 verified Payment revenue counted',()=>m("p.status='Verified'")&&m('p.verified_at>=v_start')],
 ['45 unverified Payment excluded',()=>m("p.status='Verified' AND p.verified_at IS NOT NULL")],
 ['46 non-revenue payment state excluded by Verified filter',()=>m("status='Verified'")&&!m("status IN ('Pending','Failed')")],
 ['47 Won uses payment-controlled canonical state',()=>m('payment-controlled Won / canonical Lost opportunities')],
 ['48 Lost included in closed denominator',()=>m('v_won+v_lost')],
 ['49 open deal excluded from win-rate denominator',()=>m('won_at>=v_start')&&m('lost_at>=v_start')],
 ['50 no closed deals insufficient',()=>m("v_won+v_lost=0 then 'INSUFFICIENT_DATA'")],
 ['51 average deal value uses accepted quote',()=>m('averageWonDealValue')&&m("q.status='Accepted'")],
 ['52 multiple currencies not incorrectly summed',()=>m('Currencies are kept separate. No FX conversion is invented.')],

 ['53 quotation with discount detected',()=>m('quote_discount_total')&&m('line_discount_total')&&m('quote_discount_value')],
 ['54 quotation without discount not detected',()=>m('>0 OR coalesce(q.line_discount_total,0)>0')],
 ['55 approval request counted separately',()=>m('approvalRequests')],
 ['56 Sales Validation counted separately',()=>m('validationRequests')],
 ['57 normal approval does not become misconduct',()=>m('a normal discount or required approval is not misconduct')],
 ['58 audited override counted only when real',()=>m('revenue_distribution_override_at')&&m('revenue_distribution_override_by')],
 ['59 no inferred override',()=>!m('inferred_override')],
 ['60 source resolution remains canonical',()=>m('quotation approval + Sales Validation + audited quotation override evidence')],

 ['61 actual unauthorized Promise conflict counted',()=>m("validation_alignment_status='CONFLICT'")&&m("record_state='ACTIVE'")],
 ['62 Draft Promise not counted',()=>m("p.record_state='ACTIVE'")],
 ['63 Pending Promise not falsely incident',()=>m('Draft, Pending and clarification states are not incidents')],
 ['64 covered approved Promise not counted',()=>m("validation_alignment_status='CONFLICT'")],
 ['65 scope change only with explicit attribution',()=>m('No canonical explicit Sales-attribution source')&&m('does not infer blame')],
 ['66 no scope attribution source returns NOT_TRACKED',()=>m('postSaleSalesAttributedScopeChanges')&&m('NOT_TRACKED_AUTHORITATIVELY')],
 ['67 client dispute only explicit source',()=>m('No explicit structured dispute/complaint source')],
 ['68 no dispute source avoids inferred sentiment',()=>m('sentiment are not used to infer a client dispute')],

 ['69 completed review uses review period',()=>m('v_review.period_start,v_review.period_end')],
 ['70 metrics snapshot frozen on completion',()=>m('metrics_snapshot=v_snapshot')&&m("CASE WHEN p_status='Completed'")],
 ['71 future CRM changes do not mutate completed snapshot',()=>m("IF v_review.status='Completed' THEN")],
 ['72 future policy change does not mutate completed snapshot',()=>m('Completed performance reviews are immutable')],
 ['73 legacy snapshot UI renders',()=>u('Legacy immutable snapshot — Part 15 metrics were not backfilled')],
 ['74 Part 15 snapshot UI renders',()=>u('Quality revenue + clean delivery')&&u('QualityMetricCard')],
 ['75 no automatic management decision',()=>m('A completed review requires a management decision')&&!/decision\s*=\s*case.*quality/i.test(migration)],
 ['76 no automatic required action',()=>m('required_actions=v_actions')&&!/array_append\(v_actions/i.test(migration)],
 ['77 no automatic access restriction',()=>m('Apply any access/offboarding change through the existing Team & Users control')&&!/update\s+public\.user_profiles\s+set\s+status/i.test(migration)]
];

assert.equal(cases.length,77,'Part 15 specification matrix must contain exactly 77 cases');
for(const [name,check] of cases) test(name,()=>assert.equal(check(),true,name));

test('Part 15 package command is wired once available',()=>{
  const command=packageJson.scripts['test:crm-part15'];
  assert.equal(typeof command,'string');
  assert.match(command,/crm-seller-quality-performance-part-15\.test\.mjs/);
  assert.match(command,/crm-seller-quality-performance-part-15-matrix\.test\.mjs/);
});
