# CRM Manager Exception Workspace — Part 14

## Status

Part 14 implementation is complete on PR #133 and is in trusted release verification. Production closure is not declared until PR/main CI, checksum-verified migration deployment, authenticated Admin/Seller QA and final production integrity verification pass.

Part 15 has not started.

## Purpose

Part 14 gives Administrators one Sales manager triage workspace for real exceptions without creating a second exception truth system.

The workspace is intentionally read-oriented. It does not own approvals, validations, payment verification, Won, handoff decisions, Project stage transitions or SOP overrides. Every visible item is derived from an existing canonical Sales source and disappears when that source is resolved.

## Architecture decision

No new exception business table is created.

The existing generic Business Intelligence exception feed is preserved unchanged because it spans Sales, Finance, Delivery and Recruitment and contains broader management semantics. Part 14 instead introduces one narrowly scoped read-only aggregate RPC:

- `crm_get_manager_exception_workspace(text,text,uuid,integer,integer)`

The RPC is `STABLE`, `SECURITY DEFINER`, uses fixed `public, pg_temp` search_path, denies anonymous access and enforces active Admin authorization internally.

## Canonical source map

| Exception family | Canonical source |
| --- | --- |
| Proposal Readiness | `crm_get_sales_gate_assessment(...,'PROPOSAL_READINESS')` |
| Sales Validation | `crm_sales_validations` + existing reviewer eligibility |
| Quotation Approval | existing quotation approval state + `quotation_approval_reviewer_authorized` |
| Meeting close-out | `sales_meetings` completed Sales records |
| Decision authority/process | existing Proposal Readiness `DECISION_PROCESS` dimension |
| Missing / overdue next action | Part 11 Pipeline Command Center + Sales Work Queue / `crm_activities` |
| Stage SLA | canonical Pipeline command-center stage age/SLA output |
| Returned handoff | latest Part 13 `project_sales_handover_attempts.status='RETURNED_TO_SALES'` |
| Promise / quote coverage | `crm_sales_promises` + `quotation_sales_coverage` |
| Repeated SOP override | real quotation override timestamps and audited CRM override events only |

## Resolution model

Part 14 stores no resolve/dismiss/ignore flag.

Each exception uses a deterministic source-derived key. The aggregate is recomputed from canonical truth. Once the source is corrected, the item stops matching the exception predicate and disappears automatically.

Distinct exception types on the same deal may coexist. Duplicate instances of the same deterministic key are collapsed before pagination.

## Authorization

The team Manager Exception workspace is Admin-only.

The aggregate does not grant new source authority. Quotation approvals still use the existing reviewer authorization, Sales Validations still use existing reviewer eligibility, Part 13 handoff Accept/Return remains unchanged, payment verification remains Part 12 controlled, and Project stage authority remains with the existing workflow guards.

Normal Sellers retain their existing Seller Command Center and cannot enumerate the team exception aggregate.

## UI

The workspace is integrated into the existing Founder Control / Admin shell at:

- `/admin/manager-exceptions`

It includes:

- Total Exceptions
- Blocking
- Overdue
- Pending Review
- type filters
- free-text search
- Seller/owner filter
- stable pagination
- textual Blocking / Overdue status
- source status and source system
- owner and exception age
- a read-only detail drawer
- safe operational metadata only
- canonical `Open …` remediation actions

It contains no `Resolve Exception`, `Ignore`, `Dismiss`, approval, payment-verification, handoff-decision or bypass control.

## Migration

- `20260921110000_crm_manager_exception_workspace_part_14.sql`

The migration is additive and creates only the aggregate RPC. It contains Part 10B policy/schema 2/2 pre/postconditions and explicit checks that prohibited duplicate exception truth tables do not exist.

A live-production rollback probe successfully created the migration function, exercised the Admin response contract, verified Seller denial, and rolled the transaction back with no production change before PR release.

## Tests

Focused coverage:

- `tests/security/crm-manager-exception-workspace-part-14.test.mjs`
- `tests/security/crm-manager-exception-workspace-part-14-matrix.test.mjs` — exact 84-case Part 14 matrix
- `tests/security/part14-authenticated-production-ui.test.mjs`
- `npm run test:crm-part14`
- `npm run production:verify-part14`
- `npm run production:verify-part14-ui`

Part 14 is included in full `npm test`, production build, migration verifier syntax checks and canonical `production:verify`.

## Production QA safety

Authenticated Part 14 UI QA extends the already-trusted Part 13 Admin/Seller session harness instead of adding a second credential path.

QA is non-destructive:

- Admin loads real source-derived exceptions, filters, search, detail and canonical source routing.
- Seller direct aggregate RPC access must fail.
- Seller must not receive the team Manager Exception workspace.
- desktop, tablet, mobile and keyboard focus are checked.
- forbidden sensitive field labels are checked.
- business-table counts are snapshotted before and after and must be identical.
- no fake Validation, approval, activity, returned handoff, Promise conflict, SOP override, business record or exception row is manufactured for QA.

## Part 15 boundary

Seller Quality & Performance Management is not implemented here. No quality score, first-pass handoff acceptance KPI, missing-information rate, post-sale scope-change rate or manager-performance ranking is introduced by Part 14.

## Release closure

Production closure evidence will be appended only after trusted CI, merge, checksum-verified migration application, deployment, authenticated production QA and final integrity verification all pass.

**PART 14 — MANAGER EXCEPTION WORKSPACE: RELEASE VERIFICATION IN PROGRESS.**

**Part 15 has not started.**
