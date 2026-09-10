import type { SellerGuidanceEntry } from './crmSellerGuidance';

const make = (
  key: string,
  title: string,
  shortHelp: string,
  details: Omit<SellerGuidanceEntry, 'key' | 'title' | 'shortHelp'> = {},
): SellerGuidanceEntry => ({ key, title, shortHelp, ...details });

const canonical: Record<string, SellerGuidanceEntry> = {
  'section.scope_conditions': make(
    'section.scope_conditions',
    'Scope Conditions',
    'Reconcile material discovery into explicit proposal-ready assumptions, exclusions, dependencies, client responsibilities, and scope boundaries.',
    {
      meaning: 'A Requirement is discovery truth. A Scope Condition is the explicit pre-quotation boundary Sales intends to carry into the proposal.',
      whyItMatters: 'This keeps discovery evidence, proposal preparation, and future quotation snapshots distinct and auditable.',
      sellerAction: 'Reconcile each material source Requirement by creating or linking a Scope Condition, or record why it is Not Material for Proposal.',
      avoid: 'Do not duplicate every Requirement and do not use quotation fields as the upstream Scope Conditions register.',
      sopReference: 'Part 9 · Scope Conditions',
    },
  ),
  'field.scope_condition_type': make(
    'field.scope_condition_type',
    'Scope Condition type',
    'Choose the meaning that matches the proposal boundary: Assumption, Exclusion, Dependency, Client Responsibility, or Scope Boundary.',
    {
      meaning: 'ASSUMPTION is something ProFox relies on; EXCLUSION is intentionally outside scope; DEPENDENCY is something delivery depends on; CLIENT_RESPONSIBILITY is something the client must provide/do/approve; SCOPE_BOUNDARY prevents ambiguity.',
      sellerAction: 'Choose the narrowest accurate type and write wording another Seller could understand without hidden context.',
      avoid: 'Do not use the type to turn a client request into an approved inclusion or commitment.',
      sopReference: 'Part 9 · Scope Condition types',
    },
  ),
  'field.scope_condition_state': make(
    'field.scope_condition_state',
    'Scope Condition state',
    'Draft is editable preparation; Active governs current proposal preparation; Stale requires review; Resolved, Superseded, and Withdrawn preserve history.',
    {
      whyItMatters: 'Active wording is material proposal input and must not be silently rewritten.',
      sellerAction: 'Use a history-safe revision when Active or Stale wording materially changes.',
      sopReference: 'Part 9 · Scope Condition lifecycle',
    },
  ),
  'field.scope_condition_source': make(
    'field.scope_condition_source',
    'Scope Condition source',
    'Show where the boundary came from: Requirement, current specialist validation, completed meeting, or documented manual source.',
    {
      whyItMatters: 'Source provenance lets future Sellers distinguish client evidence, specialist constraints, and internal reconciliation.',
      sellerAction: 'Link the canonical source where available and summarize enough context to verify the origin.',
      securityNote: 'Never store passwords, API secrets, private keys, recovery codes, card details, or authentication credentials in source notes.',
      sopReference: 'Part 9 · Source provenance',
    },
  ),
  'action.create_scope_condition': make(
    'action.create_scope_condition',
    'Create Scope Condition',
    'Create a Draft only for a material proposal boundary; opening the workspace never creates one automatically.',
    {
      sellerAction: 'Start from the relevant Requirement or validation when possible, then review the wording before activation.',
      avoid: 'Do not create one record per Requirement just to satisfy a count.',
      sopReference: 'Part 9 · Requirement reconciliation',
    },
  ),
  'action.activate_scope_condition': make(
    'action.activate_scope_condition',
    'Activate Scope Condition',
    'Activation makes the Draft a current proposal boundary. Future material changes require revision so old wording remains historical truth.',
    {
      sellerAction: 'Confirm the wording, source, and validation alignment before activation.',
      avoid: 'Do not activate wording that exceeds approved specialist constraints.',
      sopReference: 'Part 9 · Active Scope Conditions',
    },
  ),
  'action.revise_scope_condition': make(
    'action.revise_scope_condition',
    'Revise Scope Condition',
    'A revision creates new wording linked to the previous Active or Stale version instead of overwriting history.',
    {
      sellerAction: 'Create the revision, review it, then activate the revision when it is ready.',
      whyItMatters: 'The prior version remains auditable as Superseded after the revision becomes current.',
      sopReference: 'Part 9 · Condition versioning',
    },
  ),
  'action.resolve_scope_condition': make(
    'action.resolve_scope_condition',
    'Resolve Scope Condition',
    'Resolve a current dependency or condition that no longer needs to remain active without deleting its historical row.',
    {
      sellerAction: 'Use Resolve only when the CRM can truthfully say the condition no longer needs to govern proposal preparation.',
      sopReference: 'Part 9 · Scope Condition lifecycle',
    },
  ),
  'action.withdraw_scope_condition': make(
    'action.withdraw_scope_condition',
    'Withdraw Scope Condition',
    'Withdrawal intentionally removes a current/draft condition from use while preserving the row, actor, time, and reason.',
    {
      sellerAction: 'Provide a meaningful reason; do not hard-delete history.',
      sopReference: 'Part 9 · Scope Condition withdrawal',
    },
  ),
  'section.promise_register': make(
    'section.promise_register',
    'Promise Register',
    'A Promise is a material commitment ProFox actually communicated to the client.',
    {
      meaning: 'A client request, Seller hypothesis, internal goal, Package Fit recommendation, or unspoken assumption is not automatically a Promise.',
      whyItMatters: 'The register preserves what was truly communicated even when the commitment was premature or still needs internal validation.',
      sellerAction: 'Keep preparation as Draft. Record Active only after confirming actual client communication and documenting the source.',
      avoid: "Record what ProFox actually committed. Do not turn a client's request, your assumption, or a proposed idea into a Promise.",
      sopReference: 'Part 9 · Promise Register',
    },
  ),
  'field.promise_type': make(
    'field.promise_type',
    'Promise type',
    'Classify the actual commitment as Scope, Technical, Timeline, Commercial, Support, Compliance, Performance/Result, or Other.',
    {
      sellerAction: 'Choose the type that best describes the communicated commitment; validation requirements are evaluated separately.',
      sopReference: 'Part 9 · Promise types',
    },
  ),
  'field.promise_state': make(
    'field.promise_state',
    'Promise state',
    'Draft is internal preparation; Active means the commitment was actually communicated; Superseded and Withdrawn preserve history.',
    {
      avoid: 'Do not use Stale as the Promise business state. Changed evidence creates an integrity/validation status while the actual commitment remains visible.',
      sopReference: 'Part 9 · Promise lifecycle',
    },
  ),
  'field.promise_source': make(
    'field.promise_source',
    'Promise source / evidence',
    'Every Active Promise needs understandable evidence of where and when the client commitment was communicated.',
    {
      sellerAction: 'Link a completed Sales meeting where applicable, or document the real client communication source clearly.',
      avoid: 'Do not invent source IDs or use an internal draft as proof of client communication.',
      securityNote: 'Never store passwords, API secrets, private keys, recovery codes, card details, or authentication credentials in Promise evidence.',
      sopReference: 'Part 9 · Promise provenance',
    },
  ),
  'field.promised_by': make(
    'field.promised_by',
    'Promised by',
    'The authenticated actor who records an Active Promise is stamped server-side; the browser cannot forge this identity.',
    {
      whyItMatters: 'Material commitments need reliable attribution without silent impersonation.',
      sopReference: 'Part 9 · Promised by',
    },
  ),
  'field.promised_at': make(
    'field.promised_at',
    'Promised / recorded time',
    'Active Promise time and audit recording time are server-controlled so CRM chronology cannot be rewritten by the browser.',
    {
      sellerAction: 'Use source context to explain an earlier communication when needed; do not rewrite recorded_at chronology.',
      sopReference: 'Part 9 · Promised at / recorded at',
    },
  ),
  'action.record_promise': make(
    'action.record_promise',
    'Record Active Promise',
    'Recording Active is an explicit truth statement that ProFox actually communicated this material commitment to the client.',
    {
      sellerAction: 'Answer “Did ProFox actually communicate this commitment to the client?” truthfully and document the evidence.',
      avoid: 'If the answer is no, keep the idea as Draft rather than creating an Active Promise.',
      sopReference: 'Part 9 · Active Promise',
    },
  ),
  'action.revise_promise': make(
    'action.revise_promise',
    'Revise Promise',
    'A changed Active commitment creates a Draft revision linked to the original; the old Promise is not silently rewritten.',
    {
      sellerAction: 'Record the changed wording and evidence, then explicitly activate the revision only if the changed commitment was actually communicated.',
      sopReference: 'Part 9 · Promise versioning',
    },
  ),
  'action.withdraw_promise': make(
    'action.withdraw_promise',
    'Withdraw Promise',
    'Withdrawal requires a reason and preserves the historical commitment, actor, and timestamp.',
    {
      avoid: 'Withdrawal does not prove the client accepted removal of the obligation; record only what the CRM actually knows.',
      sopReference: 'Part 9 · Promise withdrawal',
    },
  ),
  'status.promise_unapproved': make(
    'status.promise_unapproved',
    'Unapproved commitment',
    'ProFox already communicated this commitment, but required internal validation is not current.',
    {
      whyItMatters: 'History must reflect reality. An approval problem should block readiness, not erase a real commitment.',
      sellerAction: 'Preserve the Promise and resolve the required Part 7 review before proposal preparation.',
      sopReference: 'Part 9 · Unapproved Promise',
    },
  ),
  'status.promise_validation_required': make(
    'status.promise_validation_required',
    'Promise validation required',
    'The Promise is real, but the required current specialist decision is missing, pending, stale, rejected, superseded, or not reconciled to approved constraints.',
    {
      sellerAction: 'Open Sales Validation and resolve the appropriate Technical, Timeline, Commercial, Scope, or Compliance/Risk review.',
      sopReference: 'Part 9 · Part 7 validation integration',
    },
  ),
  'status.scope_condition_stale': make(
    'status.scope_condition_stale',
    'Stale Scope Condition',
    'A source Requirement or validation changed, so this previously Active proposal boundary can no longer be treated as current without review.',
    {
      sellerAction: 'Review the new source truth and create a history-safe revision when the boundary must change.',
      sopReference: 'Part 9 · Stale-source protection',
    },
  ),
  'field.future_quote_coverage': make(
    'field.future_quote_coverage',
    'Future quotation coverage',
    'Part 10 will verify that active material Scope Conditions and Promises are represented correctly in the final quotation snapshot.',
    {
      meaning: 'Recording a condition or Promise in Part 9 does not prove the final quotation covers it.',
      sellerAction: 'Use Scope & Commitments to prepare safe proposal context; leave Promise Coverage, Final Scope Reconciliation, and Quotation Snapshot Coverage as Not Yet Evaluated until actual quotation comparison exists.',
      sopReference: 'Part 9 → Part 10 boundary',
    },
  ),
  'condition.type.ASSUMPTION': make(
    'condition.type.ASSUMPTION',
    'Assumption',
    'Record a material assumption ProFox is relying on when defining scope or delivery. If it is false, scope, cost, or timing may need to change.',
  ),
  'condition.type.EXCLUSION': make(
    'condition.type.EXCLUSION',
    'Exclusion',
    'State something the proposal will intentionally not include. Be specific enough that the excluded work cannot reasonably be interpreted as included.',
  ),
  'condition.type.DEPENDENCY': make(
    'condition.type.DEPENDENCY',
    'Dependency',
    'Record something the project depends upon, including who controls it. A dependency is not the same as a delivery commitment.',
  ),
  'condition.type.CLIENT_RESPONSIBILITY': make(
    'condition.type.CLIENT_RESPONSIBILITY',
    'Client Responsibility',
    'Record material information, access, content, approvals, or actions the client is responsible for providing so the project can proceed.',
  ),
};

const aliases: Record<string, string> = {
  scope_conditions: 'section.scope_conditions',
  condition_source: 'field.scope_condition_source',
  condition_validation: 'status.scope_condition_stale',
  condition_activate: 'action.activate_scope_condition',
  condition_revision: 'action.revise_scope_condition',
  not_material: 'section.scope_conditions',
  promise_register: 'section.promise_register',
  promise_source: 'field.promise_source',
  promise_confirm: 'action.record_promise',
  unapproved_commitment: 'status.promise_unapproved',
  future_quote: 'field.future_quote_coverage',
};

export const getScopeCommitmentGuidance = (key: string): SellerGuidanceEntry | null => {
  const canonicalKey = aliases[key] || key;
  return canonical[canonicalKey] || null;
};

export const SCOPE_COMMITMENT_GUIDANCE_KEYS = Object.freeze(Object.keys(canonical));
