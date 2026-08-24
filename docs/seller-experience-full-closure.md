# Seller Experience Full Closure

This release closes the remaining Seller Dashboard / active-seller experience requirements against the existing ProFox systems of record.

## Source-of-truth contract

- CRM leads, opportunities and activities remain canonical CRM truth.
- ProFox Calendar / `sales_meetings` remains meeting truth.
- Sales Catalog remains product, scope, price and payment-schedule truth.
- Quotations and Payments remain commercial/payment truth.
- `commission_entries` remains the only commission ledger. Adjustments mutate the same protected entry and write immutable adjustment evidence; no second ledger is created.
- Sales Academy remains training/policy/handover reference truth.
- Published Portfolio/CMS remains case-study/proof truth.
- Existing notification engine remains seller-alert truth.
- Career Progression remains derived from verified payments/commission evidence.
- `projects`, `project_tasks`, and `project_team` remain the only project-delivery sources of truth.
- `project_client_approvals` remains the client design/UAT approval and change-request evidence source of truth.

## Closed seller requirements

1. Activated seller auto-lands on `/admin/today`.
2. Seller execution funnel maps canonical Lead + Opportunity stages to New → Contacted → Meeting → Quotation → Payment Pending → Won.
3. Tomorrow meetings requiring preparation appear in Needs Attention.
4. Attention rows deep-link to exact records.
5. Meeting cards support Prepare, Open CRM, Join, and Reschedule / Manage.
6. Quick Actions open the existing Add Lead, Log Call, Book Meeting, Create Quotation, Add Follow-Up, and Sales Resources workflows.
7. Next Commission Payment includes Pending Approval and Pending Customer Payment Verification amounts.
8. Commission adjustments use Admin-only RPC + immutable adjustment evidence and display as Adjusted to the seller while canonical state remains Under Review until re-approved.
9. Career package criteria include package-level progress bars.
10. Sales Resources exposes existing Academy handover/handoff material as a dedicated Handover view.
11. Case Studies & Proof is searchable/shareable from published Portfolio content.
12. Product resources show canonical payment milestone schedules.
13. Existing notification engine gains lead-no-next-activity, sales-policy, career-eligibility, quotation-opened, quotation-response, commission-adjustment, and project-handover coverage.
14. Seller navigation exposes Home / Dashboard, Notifications, Upcoming Payouts and Payment History without creating duplicate workspaces.
15. A verified sale creates a seller-owned Sales Handover submission task and direct handover action without granting Sales general project-edit permission.

## Public quotation behavior

A sent quotation gets an opaque customer review token; only its SHA-256 hash is stored. First view is recorded and the seller is notified. Public Accept/Decline updates the canonical quotation through a protected RPC. Acceptance never verifies a payment and never moves an opportunity to Won.

## Delivery workflow closure

The protected operational chain is:

`Verified Sale → Sales Handover → PM Review → Client Onboarding → Requirements → Content → UI/UX Design → Client Design Approval → Development → QA → Client Review/UAT → Final Revisions → Launch → Handover → Completed`

Release invariants include:

- Partial/unverified payment cannot create the client/project or mark the opportunity Won.
- Repeated payment verification remains idempotent for project and commission creation.
- PM review is required before Client Onboarding.
- Required stage tasks must be complete before protected stage progression.
- Content, UI/UX, Development and QA assignments use canonical `project_team` / `project_tasks` only.
- Client Design Approval and Client Review cannot be bypassed by PM/Admin stage edits.
- A client design change request creates or reopens required UI/UX revision work before the project can return for approval.
- Launch requires the protected verified Final/Full Payment gate.
- Completed requires Handover work to be complete.
- Internal project trigger/workflow helper functions are not exposed as normal anonymous/authenticated RPCs; intended seller/client RPCs retain their own authorization checks.

## Production QA evidence

Rollback-only production QA completed successfully across Recruitment → Agreement → Academy → Final Certification → Final Approval → Activation → seller CRM/commercial flow → verified sale → project delivery → client approvals → Launch → Handover → Completed.

The QA also proved seller self-scope, pre-activation Sales denial, assessment/interview gates, signed-agreement gating, payment idempotency, client design change reopening, final-payment Launch protection and completion protection. The transaction left zero QA opportunities, quotations, clients or projects, and temporary test-role changes were rolled back.

## Release status

Internal application workflow/release work represented by this PR is complete once its final exact head passes TypeScript + production build CI and that exact head is merged to `main`.

External provider gates are intentionally separate and are **not** claimed complete here:

- Cloudflare public production deployment/domain health verification requires real deployment credentials/environment configuration.
- Google Calendar/Meet real OAuth account end-to-end verification requires real Google OAuth credentials/account connection.
- Gemini remains optional and intentionally disabled unless explicitly enabled with a real server-side provider credential.
