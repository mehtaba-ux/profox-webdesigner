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
      meaning: 'Part 10A compares current canonical Sales truth with customer-visible quotation fields and committed quotation items. It does not rewrite either source automatically.',
      whyItMatters: 'A proposal can be commercially approved yet still omit a material assumption, exclusion, dependency, responsibility, or commitment. Reconciliation makes that gap visible without creating a parallel quotation system.',
      sellerAction: 'Review each current source against a meaningful customer-visible target, resolve stale or conflicting coverage, and keep source validation constraints visible.',
      avoid: 'Do not use internal notes or generic customer notes as a shortcut, and do not mark coverage just to clear a status. The selected target must genuinely represent the source.',
      sopReference: 'Part 10A · Quotation reconciliation',
    },
  ),
  'field.coverage_status': make(
    'field.coverage_status',
    'Coverage status',
    'Covered means the selected customer-visible quotation target materially represents the source. Partial and Conflict require an explanation and remain future send blockers.',
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
      sopReference: 'Part 7 + Part 9 → Part 10A',
    },
  ),
  'status.package_alignment': make(
    'status.package_alignment',
    'Quoted package alignment',
    'Compare the actual committed primary quotation product with the current deterministic Package Fit result. Part 10A never replaces a product automatically.',
    {
      sellerAction: 'If the quoted package differs from the current recommendation, review the current scope and update the quotation through the normal product workflow when appropriate.',
      avoid: 'Do not auto-upgrade, downgrade, add, or remove a product from reconciliation.',
      sopReference: 'Part 6 → Part 10A',
    },
  ),
  'status.snapshot_preview': make(
    'status.snapshot_preview',
    'Snapshot readiness preview',
    'READY TO SNAPSHOT means the deterministic Part 10A builder can produce a complete preview. It does not mean an immutable Sales snapshot has been persisted.',
    {
      meaning: 'Part 10A builds the future snapshot payload read-only with persisted=false. Freezing/persisting it belongs to the later activation phase.',
      avoid: 'Do not describe READY_TO_SNAPSHOT as frozen, saved, delivered, or send-approved.',
      sopReference: 'Part 10A → Part 10B boundary',
    },
  ),
  'status.final_send_gate': make(
    'status.final_send_gate',
    'Final send gate — not active',
    'Part 10A is a non-blocking readiness preview. Existing quotation approval and Send behavior remain unchanged.',
    {
      whyItMatters: 'The reconciliation evaluator can show future send blockers without changing production delivery behavior before the UI is deployed and smoke-tested.',
      sellerAction: 'Resolve the preview issues as preparation, but rely on the existing quotation approval/readiness controls for current send behavior.',
      sopReference: 'Part 10A non-blocking release boundary',
    },
  ),
  'status.legacy_coverage': make(
    'status.legacy_coverage',
    'Legacy coverage not captured',
    'A historical quotation can predate Part 10A. Missing reconciliation history is shown as legacy/not captured rather than invented as Covered.',
    {
      avoid: 'Do not backfill historical coverage unless there is genuine contemporaneous evidence and an approved migration policy.',
      sopReference: 'Part 10A · Historical compatibility',
    },
  ),
};

export function getQuotationSalesReconciliationGuidance(key: string): SellerGuidanceEntry | undefined {
  return guidance[key];
}

export const QUOTATION_SALES_RECONCILIATION_GUIDANCE_KEYS = Object.freeze(Object.keys(guidance));
