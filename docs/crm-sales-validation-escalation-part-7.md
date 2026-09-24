# CRM Sales SOP — Part 7: Sales Validation, Escalation & Specialist Review

## Objective

Part 7 adds one canonical internal specialist-review workflow for pre-proposal Sales uncertainty. It converts the review signals introduced by Parts 1–6 into explicit, auditable Technical, Commercial, Timeline, Compliance/Risk and Scope decisions without creating a second CRM truth source.

Part 7 does **not** add a Requirements Confirmed gate, Proposal Readiness, quotation-send gating, Promise Register, payment/Won changes, or Sales-to-Delivery handoff behavior.

Required starting revision: `c42661267ea1cf0dd8d6cd28b19c8edc6cf1fa42`.

## Reuse audit

| Capability | Existing canonical implementation | Part 7 decision |
| --- | --- | --- |
| Lead identity/access | `crm_leads`, `crm_can_access_lead(...)` | Reuse |
| Opportunity lineage | `crm_opportunities.lead_id` | Reuse |
| Requirements | `crm_requirements` | Reuse; never copy or auto-confirm |
| Meeting lineage | `sales_meetings`, `service_meeting_crm_lead_id(...)` | Reuse |
| Package Fit | Part 6 `crm_get_package_fit_assessment(...)` | Reuse unchanged as classifier |
| Commercial catalog | `sales_products` | Reuse live current values |
| Quotation-specific approval | Existing quotation approval workflow | Keep separate and authoritative |
| Audit history | `crm_lead_events`, `crm_write_lead_event(...)` | Reuse |
| Internal notifications | `in_app_notifications`, `enqueue_in_app_notification(...)` | Reuse |
| Roles/departments | `user_profiles.role`, `user_profiles.department`, `status` | Reuse |
| Seller help | `SellerGuidanceHelp` / `SellerGuidanceEntry` | Reuse |
| Review business model | None existed for Sales specialist validation | Add one table |

The audit found mature review/approval patterns in quotation, delivery, training, recruitment and manager workflows, but no canonical Sales specialist-validation business record. Those systems informed the control pattern only; their domain tables were not repurposed.

## One canonical business model

Part 7 adds exactly one business table:

`public.crm_sales_validations`

It can reference the canonical:

- Lead;
- Opportunity;
- Requirement;
- Sales Meeting;
- `sales_products` row;
- Part 6 Package Fit policy key/version.

It stores a deliberately small source snapshot/fingerprint for historical review context. It does not copy the complete Lead, Discovery, Client Voice, Requirements or Sales Catalog dataset.

Review history is immutable: normal hard delete is blocked. Cancellation and stale status preserve the historical record.

## Versioned routing and severity policy

Canonical configuration key:

`crm_sales_validation_policy_v1`

Policy version: **1**.

The policy contains routing/severity concepts only. It contains no reviewer-person UUIDs and no duplicated package prices, scope, payment schedules or commercial catalog truth.

### Current review types

- `TECHNICAL`
- `COMMERCIAL`
- `TIMELINE`
- `COMPLIANCE_RISK`
- `SCOPE`

### Current severity scale

- `GREEN` — low-risk/informational review
- `AMBER` — material uncertainty requiring specialist review
- `RED` — high-risk/critical unresolved uncertainty

Severity and reviewer team are derived server-side. Sellers cannot submit or downgrade severity.

### Current routing policy

| Type | Default severity | Team | Eligible role/dept policy |
| --- | --- | --- | --- |
| Technical | AMBER | `TECHNICAL_REVIEW` | active Developer/Admin in approved departments |
| Commercial | AMBER | `COMMERCIAL_REVIEW` | active Admin in approved department |
| Timeline | AMBER | `TIMELINE_REVIEW` | active Admin in approved department |
| Compliance/Risk | RED | `COMPLIANCE_RISK_REVIEW` | active Admin in approved department |
| Scope | AMBER | `SCOPE_REVIEW` | active Developer/Admin in approved departments |

When there is no deterministic per-person assignment, Part 7 uses the eligible team queue. Assignment occurs when an eligible reviewer starts a review.

## Status lifecycle

Canonical statuses:

- `PENDING`
- `IN_REVIEW`
- `NEEDS_INFORMATION`
- `APPROVED`
- `REJECTED`
- `CANCELLED`
- `STALE`

No duplicate persisted derived status is stored elsewhere.

## Seller request flow

Trusted RPC:

`crm_request_sales_validation(...)`

Server controls:

- authenticated requester identity (`auth.uid()`);
- Lead access;
- Opportunity→Lead lineage;
- Requirement→Lead lineage;
- Meeting→Sales lifecycle lineage;
- current active product reference;
- allowed source type;
- type policy;
- severity;
- reviewer team;
- source snapshot/fingerprint;
- active-review dedupe key;
- supersession link for a fresh review after a stale/rejected/cancelled decision;
- canonical Lead audit event;
- policy-eligible internal reviewer notifications.

Repeated requests for the same active review reuse the canonical record. A unique-index race is handled idempotently rather than creating a duplicate.

## Reviewer lifecycle

Trusted RPC:

`crm_transition_sales_validation(...)`

### Start Review

- requires an eligible active reviewer;
- requester self-review is rejected;
- another reviewer cannot take a review already assigned to someone else;
- stamps reviewer/start time server-side;
- acknowledges the current canonical source fingerprint.

### Needs Information

- allowed only from `IN_REVIEW`;
- requires a meaningful, precise clarification question;
- returns the same review to the Seller as `NEEDS_INFORMATION`;
- does not create a parallel Requirement/Discovery truth store.

The Seller updates canonical CRM information and then resubmits the **same** review.

### Resubmit

- keeps the same review ID;
- refreshes source snapshot/fingerprint from canonical CRM truth;
- clears the active information request;
- returns status to `PENDING`;
- preserves the audit trail.

### Approve

- allowed only from `IN_REVIEW`;
- requires a meaningful specialist decision summary;
- can record `approved_constraints`;
- stamps decision actor/time server-side;
- does not set Requirement certainty to `CLIENT_CONFIRMED`;
- does not change Package Fit classification, Pipeline, quotation, payment or Won.

### Reject

- allowed only from `IN_REVIEW`;
- requires a meaningful rejection/rework reason;
- preserves the Requirement and review history;
- does not automatically classify the package as a mismatch.

### Cancel

Cancellation is controlled and auditable. The requesting Seller may withdraw a non-started review; Admin can cancel an active review when operationally necessary. A reason is required.

## Material source changes and stale decisions

A Requirement-change trigger watches material changes to:

- content;
- structured value;
- information certainty;
- record state;
- title;
- category.

For a previously `APPROVED` or `REJECTED` review, a material change changes only the review status/source-change metadata to `STALE`. The old decision, constraints, reviewer and decision time remain historical.

For an active `PENDING`, `IN_REVIEW` or `NEEDS_INFORMATION` review, the source-change timestamp is recorded. An in-progress reviewer must refresh/start again to acknowledge the current canonical source before approving or rejecting.

A fresh review can reference the stale prior record through `supersedes_validation_id`.

## Requirements integration

`CRMRequirementsWorkspace` now embeds `CRMSalesValidationPanel` directly in the existing Requirements experience.

The Seller can see:

- Requirements that currently need specialist validation;
- whether no review has been requested;
- pending/in-review/needs-information/approved/rejected/cancelled/stale status;
- exact information requested;
- approved constraints;
- specialist decision/rework reason;
- Request Review, Resubmit, fresh-review and safe Cancel actions.

`NEEDS_SPECIALIST_VALIDATION` remains a Requirement certainty state. Specialist approval never converts it to client-confirmed truth. The old Part 6 text saying no review workflow exists was removed.

## Package Fit integration

`CRMPackageFitPanel` remains the Part 6 deterministic classifier and now embeds `CRMPackageFitValidationReviews` for real Part 7 review state.

Review records are created only by an explicit Seller action. Opening or refreshing Package Fit creates no review row.

Structured Part 6 signal codes/Requirement keys determine review type; free-text signal prose is not treated as business authority.

Part 7 also exposes explicit pre-proposal review actions for current catalog signals:

- `manager_approval_required` → Commercial validation option;
- `timeline_impact = assessment_required` → Timeline validation option.

These do not change the Part 6 package recommendation/status. Approval, rejection or stale status remains separate review evidence.

## Commercial boundary

Part 7 Commercial validation is a **pre-proposal** specialist check for commercial uncertainty.

It does not replace the existing Quotation Approval workflow. Quotation-specific:

- price/discount exceptions;
- payment schedules;
- quotation terms;
- quotation approval decisions

continue through the existing quotation architecture.

Part 7 creates no quotation approval replacement and performs no quotation mutation.

## Reviewer queue

Reusable queue:

`src/components/admin/crm/CRMSalesValidationQueue.tsx`

It is mounted as a focused sibling inside the existing **My Work** review surface. No new top-level Admin/Lead Drawer tab was introduced.

The server filters the queue using active role, department, team policy and current assignment. Queue ordering is RED → AMBER → GREEN, then request age.

Reviewer detail includes only review-relevant canonical context:

- Lead/company label;
- Opportunity/stage when relevant;
- current Requirement;
- current `sales_products` reference when relevant;
- request source/context;
- reviewer/team/status;
- previous decision/information request where applicable.

The decision UI requires explicit confirmation before consequential Needs Information, Approve or Reject actions. Failed writes preserve entered decision text.

## Notifications

Part 7 reuses `in_app_notifications` and existing dedupe behavior.

Reviewer/team notifications:

- are generated only for current policy-eligible internal reviewers;
- exclude the requester;
- route to `/admin?tab=myWork` where the queue is mounted.

Seller notifications route back to CRM Leads.

No customer notification or portal visibility path was added.

## Audit

Meaningful lifecycle events are written through `crm_write_lead_event(...)` into canonical `crm_lead_events`, including:

- requested;
- started;
- information requested;
- resubmitted;
- approved;
- rejected;
- cancelled;
- stale after material source change.

No per-keystroke audit/event spam is generated.

## Security

- RLS is enabled on `crm_sales_validations`.
- anonymous table access is revoked;
- authenticated users receive direct SELECT only, not direct mutation grants;
- writes are server-authoritative RPC transitions;
- anonymous RPC execution is revoked;
- seller request access uses canonical Lead authorization;
- reviewer queue/detail use policy eligibility and assignment;
- requester self-review is rejected server-side;
- reviewer/severity/decision actors are not browser-authoritative;
- the browser uses the existing Supabase client; no service-role secret is introduced;
- client service returns safe generic write errors rather than raw database exceptions.

## Seller Guidance

Part 7 reuses `SellerGuidanceHelp` and adds guidance for:

- Sales Validation;
- validation type;
- severity;
- status;
- Request Review;
- Start Review;
- Needs Information;
- Resubmit;
- Approve;
- Reject;
- Cancel;
- Pending/In Review/Needs Information/Approved/Rejected/Cancelled/Stale;
- approved constraints;
- decision summary;
- rejection/rework reason;
- Technical/Commercial/Timeline/Compliance-Risk/Scope review.

No second tooltip/help system was created.

## Automated tests

Focused Part 7 suite:

`tests/security/crm-sales-validation-escalation-part-7.test.ts`

It contains exactly **109 acceptance/security cases** and is automatically included by the existing `test:security` script (`tsx --test tests/security/*.test.ts`).

The suite checks model uniqueness, routing/severity policy, lineage, auth, server actor stamping, dedupe, reviewer controls, self-review prevention, Needs Information/resubmit, approval constraints, rejection/cancellation, stale decisions, audit, notifications, Package Fit non-mutation, Requirements state, quotation separation, reviewer queue/confirmation, safe errors, guidance and Parts 1–6 regression-suite presence.

## Migrations

Part 7 migrations:

1. `20260909193000_crm_sales_validation_escalation_part_7.sql` — canonical table, policy, security, trusted RPCs, audit/notification logic and stale-source trigger.
2. `20260909194500_crm_sales_validation_queue_routing_part_7.sql` — final routing hardening for the same notification/stale helper functions so reviewer notifications open the existing My Work queue.

The second migration creates no business table, policy or workflow. It only replaces the same helper functions from migration 1.

## Production verification safety

Production verification must remain read-only except for applying the approved Part 7 migrations. Do not create fake Leads, Requirements, meetings, validation reviews, decisions, quotations, notifications, Pipeline transitions, payment records or Won records to prove the workflow.

## Deferred scope

Part 7 intentionally does not implement:

- Requirements Confirmed server gate;
- Proposal Readiness;
- quotation-send gating;
- Promise Register;
- Assumptions/Exclusions/Dependencies engine;
- scope-condition enforcement;
- payment or Won changes;
- Sales-to-Delivery handoff changes.

## Release verification

Final PR/build/test/migration/production verification results are recorded in the final implementation report after the branch has passed repository checks and the production migrations have been applied and inspected. Authenticated browser QA must be reported truthfully if the environment cannot perform it.
