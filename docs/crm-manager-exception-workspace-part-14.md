# CRM Manager Exception Workspace — Part 14

## Status

Part 14 is **COMPLETE** in production. Trusted PR/main CI, checksum-verified migration deployment, production Worker release, authenticated Admin/Seller QA, source-derived integrity checks and final production-readiness verification all pass.

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

Part 14 is **COMPLETE** in production.

Final release evidence:

- implementation PR: #133
- exact implementation head: `477abd5cc667e9c5d77fb3fe49e2b82c677efdf4`
- trusted implementation PR CI: ProFox CRM CI `#916 / 35594204999` — PASS
- implementation merge SHA: `27b9eecb10521cfd6b345c73bfe3dfce362820d7`
- trusted merged-main implementation CI: ProFox CRM CI `#917 / 35595138177` — PASS
- initial production deploy: Deploy ProFox Production `#369 / 35595342761`
  - checksum migration, database readiness, Supabase function deploys, production build, Worker deploy/health, public frontend checks and real-browser smoke all passed
  - Part 14 Admin authenticated QA passed with 2 real source-derived exceptions
  - only the Seller negative-access route-readiness assertion failed because the lazy Seller Command Center had not yet rendered text at DOMContentLoaded
- route-readiness follow-up PR: #134
- exact follow-up head: `e85dde752f4d2aec6a6e45b8ec016044549ed347`
- trusted follow-up PR CI: ProFox CRM CI `#918 / 35596113750` — PASS
- final runtime/main SHA: `6bb2fa47f8ffd2b665cef67d53737c59b8dba4cb`
- trusted final merged-main CI: ProFox CRM CI `#919 / 35596356718` — PASS
- final canonical production deploy: Deploy ProFox Production `#370 / 35596528183` — PASS
- final Cloudflare Worker version: `957aaf4d-450e-4664-8e37-cadf61c8d21d`
- migration: `20260921110000_crm_manager_exception_workspace_part_14.sql`
- migration SHA-256: `625706ef2f12ebf0fd2ed3c606d4b8f6e016ca5b27a4dc8999645d15d6f5ae7f`
- production custom migration ledger: 695 rows; latest version `20260921110000`
- repository migration lineage: APPLIED_EXACT 129, SUPERSEDED_BY_FORWARD_RECONCILIATION 5, PENDING_NEW 0, BLOCKED_UNRESOLVED 0
- Part 10B final quotation Send gate remains ACTIVE at policy/schema 2/2
- Part 14 aggregate RPC exists exactly once
- anonymous RPC execution remains denied
- no prohibited duplicate exception truth table exists
- exact 84-case Part 14 specification matrix retained
- focused Part 14 suite: 122/122 PASS
- Part 14 production release verifier: 0 failure(s)
- authenticated Admin Part 14 QA: PASS
  - Manager Exceptions loaded 2 real source-derived items
  - filters, search, detail drawer, canonical source routing, desktop/tablet/mobile and keyboard checks passed
  - no mutation authority exposed
- authenticated Seller Part 14 negative-access QA: PASS
  - team workspace hidden/redirected
  - direct aggregate RPC rejected
  - canonical Seller Command Center retained
  - no team exception data exposed
- production business immutability: PASS
- no fake Validation, quotation approval, activity, returned handoff, Promise conflict, SOP override, business record or exception record was created for QA
- final source-derived workspace truth: 2 exceptions
  - `NEXT_ACTION_OVERDUE` for the real Northstar Roofing Demo opportunity
  - `STAGE_SLA_EXCEEDED` for the same real opportunity
- final production inventory after QA:
  - CRM leads 6
  - CRM opportunities 2
  - CRM activities 13
  - Sales meetings 5
  - Sales Validations 0
  - quotations 6
  - payments 5
  - clients 2
  - projects 1
  - Client Onboardings 1
  - handoff attempts 0
  - Sales Promises 0
  - Sales Scope Conditions 0
  - quotation Sales coverage rows 0
  - CRM lead events 123
- final production readiness: 0 failures; 4 pre-existing broader-environment warnings outside Part 14 scope

The follow-up route-readiness fix adds visible lazy-workspace loading text and regression coverage only. It does not alter Part 14 authorization, source semantics, database truth or business data.

A redundant later QA-only PR (#135) was closed unmerged after PR #134 had already solved the route-readiness issue on `main`.

**PART 14 — MANAGER EXCEPTION WORKSPACE: COMPLETE.**

**Part 15 has not started.**
