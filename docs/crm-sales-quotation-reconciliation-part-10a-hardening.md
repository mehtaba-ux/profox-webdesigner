# ProfoxCRM Sales SOP — Part 10A Hardening Closure

## Purpose

This record closes the gaps found during the post-implementation Part 10A recheck. It is additive to `docs/crm-sales-quotation-reconciliation-part-10a.md` and does not activate Part 10B final quotation-send enforcement.

Implementation PR: **#108 — `fix(crm): complete Part 10A reconciliation hardening`**.

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

Production row counts immediately before and after the hardening migration remained:

- `crm_sales_scope_conditions`: 0
- `crm_sales_promises`: 0
- `quotation_sales_coverage`: 0

Production verification confirmed:

- all four Part 10A foreign-key indexes are present, and the corresponding Supabase unindexed-foreign-key findings were removed;
- `quotation_sales_coverage` has RLS enabled;
- `anon` has no direct coverage-table access;
- authenticated clients cannot directly insert, update, or delete coverage rows;
- the public reconciliation, review, and snapshot RPCs remain `SECURITY DEFINER`, use an empty `search_path`, and are not executable by `anon`;
- the Timeline Promise parser is not executable by `anon` or authenticated clients;
- the reconciliation evaluator contains the Timeline conflict and Commercial Promise approval-dependency paths while containing no `UPDATE public.quotations` write path;
- `finalQuotationSendGateActive=false` remains authoritative in policy and evaluator output.

The hardening acceptance suite is additive to the original 169 Part 10A checks and is included in `npm run test:crm-part10a` and therefore in the normal production build.

GitHub Actions verification was requested twice for PR #108. Both attempts ended before step 1 because GitHub did not assign a runner (`runner_id=0`, zero executed workflow steps). This is recorded as an infrastructure limitation, not a passing CI result. Production/database contracts and the committed source were therefore re-verified directly before merge rather than misreporting the runner failure as a code-test failure.
