import type { SellerGuidanceEntry } from './crmSellerGuidance';

const make = (
  key: string,
  title: string,
  shortHelp: string,
  details: Omit<SellerGuidanceEntry, 'key' | 'title' | 'shortHelp'> = {},
): SellerGuidanceEntry => ({ key, title, shortHelp, ...details });

const guidance: Record<string, SellerGuidanceEntry> = {
  'section.quotation_sales_reconciliation': make(
    'section.quotation_sales_reconciliation',
    'Sales Reconciliation',
    'Check that current Scope Conditions and real client Promises are represented in this exact quotation revision before it becomes customer-facing history.',
    {
      meaning: 'Part 10B keeps the Part 10A reconciliation engine authoritative and adds final Send enforcement plus an immutable send-time Sales snapshot. It does not rewrite either source automatically.',
      whyItMatters: 'A proposal can be commercially approved yet still omit a material assumption, exclusion, dependency, responsibility, specialist constraint, or client commitment. Reconciliation closes that gap without creating a parallel quotation system.',
      sellerAction: 'Review each current source against a meaningful customer-visible target, resolve stale or conflicting coverage, and keep source validation constraints visible.',
      avoid: 'Do not use internal notes or generic customer notes as a shortcut, and do not mark coverage just to clear a status. The selected target must genuinely represent the source.',
      sopReference: 'Part 10A reconciliation → Part 10B final send gate',
    },
  ),
  'field.coverage_status': make(
    'field.coverage_status',
    'Coverage status',
    'Covered means the selected customer-visible quotation target materially represents the source. Partial, Conflict and Stale remain send blockers when the final gate is active.',
    {
      sellerAction: 'Choose Covered only when the target wording actually carries the condition or promise. Use Partial when only part is represented and Conflict when the quotation contradicts or exceeds the source.',
      avoid: 'Do not treat a matching keyword as proof of coverage.',
      sopReference: 'Part 10A · Human-reviewed coverage',
    },
  ),
  'field.coverage_target': make(
    'field.coverage_target',
    'Customer-visible target',
    'Choose the existing quotation field or committed line item that actually carries this source into the client-facing proposal.',
    {
      sellerAction: 'Select only a target allowed by the server policy. If the right target is empty, edit the quotation in its normal tab, save it, then refresh reconciliation.',
      avoid: 'Optional client choices, internal notes, customer notes, and another quotation’s items cannot satisfy coverage.',
      sopReference: 'Part 10A · Coverage target policy',
    },
  ),
  'status.coverage_stale': make(
    'status.coverage_stale',
    'Stale coverage',
    'The quotation target changed after the last coverage review, so the old review cannot still prove current coverage.',
    {
      meaning: 'The server fingerprints the exact customer-visible target at review time. A later field or item change invalidates that evidence deterministically.',
      sellerAction: 'Read the current source and current quotation wording again, then record a fresh review if it still represents the source.',
      avoid: 'Do not assume a previous Covered decision survives material quotation edits.',
      sopReference: 'Part 10A · Deterministic staleness',
    },
  ),
  'status.promise_integrity': make(
    'status.promise_integrity',
    'Promise integrity',
    'Quotation coverage never repairs an unapproved, stale, rejected, superseded, or constraint-conflicting client commitment.',
    {
      sellerAction: 'Keep the real Promise visible and resolve the canonical Part 7 validation or Part 9 integrity issue. Then reconcile the quotation wording.',
      avoid: 'Do not hide, withdraw, or rewrite a real client commitment merely to make readiness pass.',
      sopReference: 'Part 7 + Part 9 → Part 10A/10B',
    },
  ),
  'status.package_alignment': make(
    'status.package_alignment',
    'Quoted package alignment',
    'Compare the actual committed primary quotation product with the current deterministic Package Fit result. Reconciliation never replaces a product automatically.',
    {
      sellerAction: 'If the quoted package differs from the current recommendation, review the current scope and update the quotation through the normal product workflow when appropriate.',
      avoid: 'Do not auto-upgrade, downgrade, add, or remove a product from reconciliation.',
      sopReference: 'Part 6 → Part 10A/10B',
    },
  ),
  'status.snapshot_preview': make(
    'status.snapshot_preview',
    'Snapshot readiness preview',
    'READY TO SNAPSHOT means the server can build the exact evidence that would be frozen on a successful Send. It is not yet historical until the quotation actually becomes Sent.',
    {
      meaning: 'Opening this panel and building a preview is read-only. The immutable snapshot is written only inside the successful server-side Sent transition.',
      avoid: 'Do not describe READY_TO_SNAPSHOT as already frozen, delivered, or historical.',
      sopReference: 'Part 10B · Pre-send snapshot state',
    },
  ),
  'status.final_send_gate': make(
    'status.final_send_gate',
    'Final send gate',
    'The final send gate verifies that this exact quotation reflects the current approved scope, active client commitments, required specialist constraints and existing quotation approvals before ProFox sends it to the customer.',
    {
      sellerAction: 'Resolve every hard blocker shown by the canonical systems. There is no score-based or Admin bypass.',
      sopReference: 'Part 10B · Universal quotation Send gate',
    },
  ),
  'status.final_send_gate_active': make(
    'status.final_send_gate_active',
    'Final send gate — active',
    'The final send gate verifies that this exact quotation reflects the current approved scope, active client commitments, required specialist constraints and existing quotation approvals before ProFox sends it to the customer.',
    {
      whyItMatters: 'The same server-side invariant protects professional Send, atomic RPC and permitted direct Sent transitions, including Admin paths.',
      sellerAction: 'Resolve the exact blockers shown here, then refresh readiness. Send remains unavailable until the server says the exact current quotation is ready.',
      avoid: 'Do not look for a bypass. Material quotation edits must be saved and reconciled before the final Sent transition.',
      sopReference: 'Part 10B · Final Send Gate',
    },
  ),
  'status.final_send_blocked': make(
    'status.final_send_blocked',
    'Final send blocked',
    'One or more current hard blockers prevent this quotation from becoming Sent.',
    {
      sellerAction: 'Use the blocker source and remediation shown in Sales Reconciliation, then refresh the quotation summary before trying again.',
      avoid: 'A high readiness percentage, Admin access or quotation approval cannot override a material Sales integrity blocker.',
      sopReference: 'Part 10B · Hard blockers override everything',
    },
  ),
  'status.ready_to_snapshot': make(
    'status.ready_to_snapshot',
    'Ready to freeze',
    'All current Sales reconciliation blockers are clear and the server can freeze the send-time evidence if this quotation successfully transitions to Sent.',
    {
      meaning: 'This is the correct pre-send state. The snapshot is not written by opening the page or reading readiness.',
      sopReference: 'Part 10B · READY_TO_SNAPSHOT',
    },
  ),
  'status.snapshot_captured': make(
    'status.snapshot_captured',
    'Final Sales snapshot captured',
    'When this quotation is sent, ProFox freezes the Sales scope, Promise, coverage and validation evidence used to authorize the send. Later CRM changes do not rewrite the historical quotation.',
    {
      meaning: 'The snapshot is internal audit/handoff evidence and is not the customer-facing quotation JSON.',
      sellerAction: 'For a correction, create a quotation revision. Do not attempt to rewrite the historical snapshot.',
      sopReference: 'Part 10B · Immutable send-time snapshot',
    },
  ),
  'field.final_send_blockers': make(
    'field.final_send_blockers',
    'Final send blockers',
    'These are the exact current reasons the server would refuse the transition to Sent when the final gate is active.',
    {
      sellerAction: 'Resolve the canonical source of each blocker rather than editing a status directly.',
      sopReference: 'Part 10B · Seller-facing blocker UX',
    },
  ),
  'field.sales_scope_snapshot': make(
    'field.sales_scope_snapshot',
    'Sales scope snapshot',
    'Internal server-built evidence of the exact Sales integrity state used to authorize Send.',
    {
      avoid: 'Do not expose the raw snapshot to customers or use it as a replacement for the curated quotation presentation.',
      sopReference: 'Part 10B · Snapshot content boundary',
    },
  ),
  'field.immutable_send_snapshot': make(
    'field.immutable_send_snapshot',
    'Immutable send snapshot',
    'A delivered quotation keeps the exact Sales evidence captured at Send even when Requirements, Promises, Scope Conditions, validations or catalog data later change.',
    {
      sellerAction: 'Use Create Revision for corrections. Each future sent revision receives its own snapshot.',
      sopReference: 'Part 10B · Historical integrity',
    },
  ),
  'action.resolve_send_blocker': make(
    'action.resolve_send_blocker',
    'Resolve send blocker',
    'Open the canonical source identified by the blocker, make the required correction or review there, then refresh Sales Reconciliation.',
    {
      avoid: 'Do not create duplicate notes, promises, coverage or quotation fields simply to clear the gate.',
      sopReference: 'Part 10B · Blocker remediation',
    },
  ),
  'action.send_quotation': make(
    'action.send_quotation',
    'Send quotation',
    'Send Quotation remains the canonical customer delivery action. The database re-checks final readiness and captures the immutable snapshot inside the same transaction.',
    {
      meaning: 'Frontend readiness is helpful UX only. The server remains the authority for every legitimate transition to Sent.',
      sopReference: 'Part 10B · Universal server enforcement',
    },
  ),
  'status.legacy_coverage': make(
    'status.legacy_coverage',
    'Legacy coverage not captured',
    'A historical quotation can predate Part 10B. Missing reconciliation or send-time snapshot history is shown as legacy/not captured rather than invented as PASS.',
    {
      avoid: 'Do not backfill a historical quotation with a snapshot built from today’s CRM state.',
      sopReference: 'Part 10B · Historical compatibility',
    },
  ),
};

export function getQuotationSalesReconciliationGuidance(key: string): SellerGuidanceEntry | undefined {
  return guidance[key];
}

export const QUOTATION_SALES_RECONCILIATION_GUIDANCE_KEYS = Object.freeze(Object.keys(guidance));
