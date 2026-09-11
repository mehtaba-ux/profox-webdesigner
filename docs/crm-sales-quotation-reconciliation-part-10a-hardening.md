# ProfoxCRM Sales SOP — Part 10A Hardening Closure

## Purpose

This record closes the gaps found during the post-implementation Part 10A recheck. It is additive to `docs/crm-sales-quotation-reconciliation-part-10a.md` and does not activate Part 10B final quotation-send enforcement.

## Production migration

- `20260911033025_crm_sales_quotation_reconciliation_part10a_hardening`
- Adds covering indexes for the four Part 10A foreign keys reported by the Supabase performance advisor.
- Adds deterministic explicit-day parsing for Timeline Promises.
- Extends the canonical `crm_get_quotation_sales_reconciliation` evaluator with Draft Promise visibility, Promise attribution, Timeline Promise conflict checks, and Commercial Promise approval dependency context.
- Keeps `finalQuotationSendGateActive=false`, `writesQuotation=false`, and `writesCoverageOnRead=false`.

## UI closure

The existing Sales Reconciliation panel now:

- shows Draft Promises as **Internal draft / not client commitment** and does not require quotation coverage for them;
- shows **Promised by** and **Promised at** for Active Promises;
- shows deterministic Timeline Promise vs. authoritative quotation duration comparison when the Promise includes an explicit day count or range;
- shows the existing CPQ/quotation approval dependency for Commercial Promises without creating or bypassing approval;
- previews the currently selected customer-visible quotation target before coverage review is saved;
- provides **Open / Edit target**, which closes reconciliation and returns the Seller to the existing canonical quotation editor destination rather than creating a parallel editor.

## Safety boundaries

- No automatic quotation wording changes.
- No automatic Promise changes.
- No new approval workflow.
- No direct browser authority over reviewer identity, review timestamp, or target fingerprint.
- No historical quotation backfill.
- No Part 10B send-gate activation.
- No fake CRM or quotation records were created for verification.

## Verification

Production row counts immediately before the hardening migration were:

- `crm_sales_scope_conditions`: 0
- `crm_sales_promises`: 0
- `quotation_sales_coverage`: 0

The hardening acceptance suite is additive to the original 169 Part 10A checks and is included in `npm run test:crm-part10a` and therefore in the normal production build.
