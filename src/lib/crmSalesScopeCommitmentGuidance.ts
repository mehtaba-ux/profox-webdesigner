import { SELLER_GUIDANCE, type SellerGuidanceEntry } from './crmSellerGuidance';

const entry = (
  key: string,
  title: string,
  shortHelp: string,
  details: Omit<SellerGuidanceEntry, 'key' | 'title' | 'shortHelp'> = {},
): SellerGuidanceEntry => ({ key, title, shortHelp, ...details });

/** Part 9 augments the existing Seller Guidance registry; SellerGuidanceHelp remains the renderer. */
export const SALES_SCOPE_COMMITMENT_GUIDANCE: Record<string, SellerGuidanceEntry> = {
  'section.scope_conditions': entry('section.scope_conditions','Scope Conditions','Reconcile material assumptions, exclusions, dependencies, client responsibilities and scope boundaries that Sales intends to carry into the proposal.',{
    meaning:'Requirements remain discovery/source information. A Scope Condition is the proposal-ready boundary Sales has explicitly reconciled from that information.',
    sellerAction:'Reconcile only material proposal boundaries. Create or link a Scope Condition, or explicitly mark a source Requirement Not Material for Proposal when appropriate.',
    avoid:'Do not duplicate every Requirement and do not use quotation fields as the upstream source of truth.',
    sopReference:'Part 9 Scope Conditions Register',
  }),
  'field.scope_condition_type': entry('field.scope_condition_type','Scope Condition type','Choose the boundary that accurately describes what Sales is relying on or limiting.',{
    listenFor:['ASSUMPTION — something ProFox is planning on being true','EXCLUSION — work intentionally outside scope','DEPENDENCY — something scope/timing depends on','CLIENT RESPONSIBILITY — material client action or input','SCOPE BOUNDARY — a precise boundary preventing ambiguity'],
    sopReference:'Part 9 Scope Condition Types',
  }),
  'field.scope_condition_state': entry('field.scope_condition_state','Scope Condition state','Draft is still being reconciled; Active governs proposal planning; Stale means its source changed; Resolved, Superseded and Withdrawn preserve history.',{
    avoid:'Do not silently edit an Active condition. Create a revision so historical wording remains auditable.',
    sopReference:'Part 9 Scope Condition Lifecycle',
  }),
  'field.scope_condition_source': entry('field.scope_condition_source','Scope Condition source','Link the Requirement, specialist validation, meeting, or manual source that supports this proposal boundary.',{
    sellerAction:'Use a canonical source when one exists and add a concise human-readable source summary when helpful.',
    avoid:'Do not invent source IDs or link records from another Lead.',
    securityNote:'Never store passwords, API secrets, private keys, recovery codes, card details, or authentication credentials in source/context text.',
    sopReference:'Part 9 Source Provenance',
  }),
  'action.create_scope_condition': entry('action.create_scope_condition','Create Scope Condition','Create a Draft proposal boundary from material source information. Nothing is activated automatically.',{
    sellerAction:'Write the condition precisely, link its source, save the Draft, then explicitly Activate only after reconciliation.',
    sopReference:'Part 9 Scope Condition Draft',
  }),
  'action.activate_scope_condition': entry('action.activate_scope_condition','Activate Scope Condition','Make this reconciled wording a current proposal boundary.',{
    sellerAction:'Confirm the wording and any approved specialist constraints first. Activation is consequential because Proposal Readiness treats it as current.',
    avoid:'Do not activate unresolved or contradictory wording.',
    sopReference:'Part 9 Scope Condition Activation',
  }),
  'action.revise_scope_condition': entry('action.revise_scope_condition','Revise Scope Condition','Create a history-safe Draft revision instead of overwriting an Active or Stale condition.',{
    sellerAction:'State the new proposal boundary accurately. The old wording remains visible until the revision is explicitly activated and supersedes it.',
    sopReference:'Part 9 Condition Versioning',
  }),
  'action.resolve_scope_condition': entry('action.resolve_scope_condition','Resolve Scope Condition','Mark a current condition resolved when it no longer needs to govern the proposal, while preserving its history.',{
    sellerAction:'Use a concise resolution note when it helps future readers understand why the condition no longer applies.',
    sopReference:'Part 9 Condition Resolution',
  }),
  'action.withdraw_scope_condition': entry('action.withdraw_scope_condition','Withdraw Scope Condition','Intentionally withdraw a Draft/Active/Stale condition with a meaningful reason. History is preserved.',{
    avoid:'Withdrawal is not deletion and must not erase what Sales previously relied on.',
    sopReference:'Part 9 Condition Withdrawal',
  }),
  'status.scope_condition_stale': entry('status.scope_condition_stale','Stale Scope Condition','The source Requirement materially changed after this condition became Active, so the old wording must not silently remain current.',{
    sellerAction:'Review the changed source and create a history-safe revision or resolve/withdraw the condition as appropriate.',
    sopReference:'Part 9 Stale-Source Protection',
  }),
  'field.assumption_condition': entry('field.assumption_condition','Assumption','Record a material assumption ProFox is relying on when defining scope or delivery. If the assumption turns out to be false, scope, cost or timing may need to change.',{
    sopReference:'Part 9 Assumption Guidance',
  }),
  'field.exclusion_condition': entry('field.exclusion_condition','Exclusion','State something the proposal will intentionally not include. Be specific enough that the client cannot reasonably interpret the excluded work as included.',{
    sopReference:'Part 9 Exclusion Guidance',
  }),
  'field.dependency_condition': entry('field.dependency_condition','Dependency','Record something the project depends upon, including who controls it. A dependency is not the same as a delivery commitment.',{
    sopReference:'Part 9 Dependency Guidance',
  }),
  'field.client_responsibility_condition': entry('field.client_responsibility_condition','Client Responsibility','Record material information, access, content, approvals or actions the client is responsible for providing so the project can proceed.',{
    securityNote:'Record the type of access needed, never the actual credential or secret.',
    sopReference:'Part 9 Client Responsibility Guidance',
  }),
  'section.promise_register': entry('section.promise_register','Promise Register','A Promise is a material commitment ProFox actually communicated to the client. A client request, Seller hypothesis, Package Fit recommendation or proposed idea is not a Promise.',{
    sellerAction:'Record the exact/faithful commitment, who made it, when it was communicated, and the evidence/source. Preserve real unapproved commitments instead of hiding them.',
    avoid:'Do not convert a request, internal goal, assumption or proposed wording into an Active Promise.',
    sopReference:'Part 9 Promise Register',
  }),
  'field.promise_type': entry('field.promise_type','Promise type','Classify the commitment as Scope, Technical, Timeline, Commercial, Support, Compliance, Performance/Result, or Other.',{
    escalation:'Technical, timeline, commercial, compliance and performance/result commitments may require current Part 7 validation before proposal preparation is safe.',
    sopReference:'Part 9 Promise Types',
  }),
  'field.promise_state': entry('field.promise_state','Promise state','Draft is internal preparation only. Active means ProFox actually made the commitment. Superseded and Withdrawn preserve historical wording.',{
    avoid:'Do not treat a Draft as proof of client communication and do not silently rewrite an Active Promise.',
    sopReference:'Part 9 Promise States',
  }),
  'field.promise_source': entry('field.promise_source','Promise source','Record where/when ProFox actually communicated the commitment: a completed meeting, documented client communication, or other traceable source context.',{
    avoid:'A Requirement or validation is context, not proof by itself that ProFox communicated the Promise. Describe the actual communication evidence.',
    securityNote:'Never store passwords, API secrets, private keys, recovery codes, card details, or authentication credentials.',
    sopReference:'Part 9 Promise Provenance',
  }),
  'field.promised_by': entry('field.promised_by','Promised by','The authenticated Seller who explicitly records an Active Promise is stamped server-side as the person who made/records the current commitment in the normal workflow.',{
    avoid:'The browser cannot silently impersonate another employee.',
    sopReference:'Part 9 Promised By',
  }),
  'field.promised_at': entry('field.promised_at','Promised at / recorded at','Activation stamps promised_at and the actor server-side; recorded_at remains the server-controlled audit time for the register row.',{
    avoid:'Do not rewrite audit chronology to make a commitment appear earlier or later.',
    sopReference:'Part 9 Promise Timestamps',
  }),
  'action.record_promise': entry('action.record_promise','Record Promise','Use this only when ProFox actually communicated the material commitment to the client.',{
    sellerAction:'Confirm “Did ProFox actually communicate this commitment to the client?” before activation. If no, keep the wording as a Draft.',
    avoid:'Do not activate from an internal draft or an unverified client request.',
    sopReference:'Part 9 Active Promise',
  }),
  'action.revise_promise': entry('action.revise_promise','Revise Promise','Create a Draft revision when the commitment wording changes; the old Active wording remains preserved until the revised commitment is explicitly activated.',{
    sopReference:'Part 9 Promise Versioning',
  }),
  'action.withdraw_promise': entry('action.withdraw_promise','Withdraw Promise','Preserve the real historical commitment and record why it was withdrawn.',{
    avoid:'Do not claim the contractual/client obligation disappeared unless the CRM actually has evidence the client accepted that change.',
    sopReference:'Part 9 Promise Withdrawal',
  }),
  'status.promise_unapproved': entry('status.promise_unapproved','Unapproved Commitment','ProFox has already communicated this commitment, but the required internal validation is not current. Preserve the commitment truthfully and resolve the review before proposal preparation.',{
    sellerAction:'Request/open the appropriate Part 7 review; do not delete or hide the Promise.',
    sopReference:'Part 9 Unapproved Promise',
  }),
  'status.promise_validation_required': entry('status.promise_validation_required','Promise validation required','This real commitment needs a current specialist review, or its linked review is pending/stale/rejected/otherwise not a current approval.',{
    sellerAction:'Use Part 7 Sales Validation. Quotation-specific commercial approval remains separate.',
    sopReference:'Part 9 Promise Validation',
  }),
  'field.future_quote_coverage': entry('field.future_quote_coverage','Future Quote Coverage','Part 10 will verify that every active material Scope Condition and Promise is represented correctly in the final quotation snapshot. Recording it here does not yet mean the quotation covers it.',{
    avoid:'Do not mark Promise Coverage, Final Scope Reconciliation or Quotation Snapshot Coverage complete before actual quotation comparison.',
    sopReference:'Part 9 Future Quote Coverage',
  }),
};

Object.assign(SELLER_GUIDANCE, SALES_SCOPE_COMMITMENT_GUIDANCE);
export const getSalesScopeCommitmentGuidance = (key: string) => SELLER_GUIDANCE[key];
