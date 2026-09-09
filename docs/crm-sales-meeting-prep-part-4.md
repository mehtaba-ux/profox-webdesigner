# CRM Sales Meeting Prep — Part 4

## Objective

Part 4 adds one Seller-facing **Meeting Prep** workspace inside the existing CRM Lead Drawer. It prepares the Seller for one existing `sales_meetings` record at a time by reusing the Part 1–3.5 Sales Discovery foundation. It does not create a second meeting/calendar system and it does not start Live Meeting Management or later Sales SOP phases.

The workspace answers the practical pre-meeting questions: what this meeting must accomplish, what reasonable advance is desired, what the CRM already knows, what remains unresolved, which existing Discovery questions deserve priority, what the Seller is hypothesizing, what private notes are useful, and whether the saved preparation has been reviewed.

## Reuse audit

Part 4 reuses the following canonical systems rather than duplicating them:

- `sales_meetings`
- `sales_meetings.prep_reviewed_at`
- `sales_meetings.prep_reviewed_by`
- `crm_meeting_preparations`
- `crm_meeting_discovery_questions`
- `crm_discovery_questions`
- `crm_discovery_responses`
- `crm_requirements`
- `crm_client_voice`
- `crm_get_sales_discovery_workspace(...)`
- `crm_set_meeting_discovery_questions(...)`
- `mark_sales_meeting_prepared(uuid)`
- `crmSalesDiscoveryService.getWorkspace(...)`
- `crmSalesDiscoveryService.saveMeetingPreparation(...)`
- `crmSalesDiscoveryService.setMeetingQuestions(...)`
- `crmSalesDiscoveryService.markMeetingPrepared(...)`
- `SellerGuidanceHelp`
- `crm_lead_events` / `crm_write_lead_event(...)`

No new Meeting, Meeting Prep, Discovery, Requirements, Lead identity, Opportunity identity, Supabase client, Seller-guidance system, audit table, or readiness column is introduced.

## Current Meeting Prep foundation

Part 1 already created the backend foundation:

- `crm_meeting_preparations.meeting_id` is a one-to-one preparation record keyed to `sales_meetings.id`.
- `crm_meeting_discovery_questions` is the normalized selected-question relationship keyed to `sales_meetings.id`.
- `sales_meetings.prep_reviewed_at` and `prep_reviewed_by` are the canonical READY evidence.
- Meeting access resolves through a direct Lead link or `sales_meetings.opportunity_id -> crm_opportunities.lead_id`.
- Existing RLS uses the canonical Sales Discovery meeting-access helper.
- Existing Part 1 audit triggers write through the CRM lead-event infrastructure.

The live schema audit before Part 4 found zero `crm_meeting_preparations` rows and zero READY meetings. There was therefore no legacy Meeting Prep content or stale READY production data to migrate.

## UI structure

`CRMMeetingPrepWorkspace` is mounted once in `CRMLeadDrawerBase` in this order:

1. Overview
2. Requirements
3. Probing & Discovery
4. Meeting Prep
5. Complete log
6. Conversation
7. Follow-ups

The workspace remains within the right-side Lead Drawer. It does not route the Seller to a separate Meeting Prep page.

The workspace is organized into progressive sections:

- Meeting header / selector / preparation state
- Preparation plan
  - Meeting Objective
  - Intended Advance
- Context
  - What We Know
  - What We Still Need
- Questions for this meeting
  - Recommended unresolved questions
  - Selected questions
  - Searchable existing question catalog
- Seller thinking
  - Seller Hypotheses
  - Private Seller Notes
- Readiness
  - Compact review checklist
  - Mark Prep Ready

The layout uses the existing CRM visual conventions, Lucide icons, wrapping content, vertical sections, responsive grids, and explicit empty/error/saving states.

## Meeting selection

The canonical meeting identity remains `sales_meetings.id`.

The UI derives eligible preparation meetings from the workspace response and includes only future meetings with status `Scheduled` or `Rescheduled`. Eligible meetings are sorted by `start_at` ascending, so the nearest relevant upcoming meeting is selected by default.

When more than one eligible meeting exists, a meeting selector is shown. Switching meetings hydrates the selected meeting's own:

- Objective
- Intended Advance
- hypotheses
- Seller Notes
- selected question IDs
- READY state

Unsaved changes require an explicit discard confirmation before switching or refreshing. When the Lead changes, Meeting Prep local state is reset and reloaded for the new Lead, preventing stale Lead A state from appearing for Lead B.

If no eligible meeting exists, Meeting Prep shows a clean empty state and calls the existing meeting-scheduling action. No scheduler is recreated.

## Meeting Objective

Meeting Objective persists to the existing `crm_meeting_preparations.meeting_objective` field.

It should describe what this specific meeting must accomplish and be concrete enough to evaluate afterward. The Part 4 readiness RPC treats a blank/whitespace-only Objective as invalid.

## Intended Advance

Intended Advance persists to the existing `crm_meeting_preparations.intended_advance` field.

It describes the reasonable next commitment or movement desired from the meeting. It is deliberately not synonymous with closing the sale. The Part 4 readiness RPC treats a blank/whitespace-only Intended Advance as invalid.

## What We Know derivation

What We Know is read-only derived context. No `what_we_know` table or copied Meeting Prep snapshot is created.

The derivation may display:

- Lead/company/contact/service context already on the Lead
- answered Discovery responses with meaningful content when certainty is `CLIENT_CONFIRMED` or `SELLER_OBSERVATION`
- active Requirements with meaningful content when certainty is `CLIENT_CONFIRMED` or `SELLER_OBSERVATION`
- Client Voice statements
- Seller interpretation as a separate labeled item

Every rendered item carries a source/certainty label. Client Voice and Seller interpretation are not merged.

## What We Still Need derivation

What We Still Need is also read-only derived context. No missing-information table is created.

The derivation surfaces relevant unresolved information including:

- missing active Core Requirement definitions
- `AWAITING_CLIENT` Requirements
- `NEEDS_SPECIALIST_VALIDATION` Requirements
- Discovery questions that are Not Asked, Asked without a usable answer, `NEEDS_FOLLOW_UP`, explicitly follow-up-required, `AWAITING_CLIENT`, or `NEEDS_SPECIALIST_VALIDATION`

Discovery question priority comes from the existing question applicability classification: `CORE`, `RECOMMENDED`, `CONDITIONAL`, or `COMPLEX`.

Conditional/Complex questions are surfaced only when the existing relevance logic says the related deal context applies. Core unresolved items sort first. This prevents Meeting Prep from becoming a flat 99-question interrogation.

## Do-not-ask-again behavior

Recommended-question derivation suppresses a question when it is already `ANSWERED`, contains a meaningful answer, and does not carry follow-up, awaiting-client, or specialist-validation uncertainty.

The record is not deleted. A Seller can still search the existing catalog and intentionally select a question when clarification, conflict resolution, reconfirmation, or a changed situation justifies revisiting it.

## Question recommendation logic

Recommendations are derived only; displaying a recommendation never persists it.

Priority order is generally:

1. `NEEDS_FOLLOW_UP` / explicit follow-up required
2. `AWAITING_CLIENT`
3. `NEEDS_SPECIALIST_VALIDATION`
4. unresolved Core questions
5. other relevant Recommended questions
6. applicable Conditional questions
7. applicable Complex questions

The recommendation engine creates no client facts and makes no package/product/proposal decision.

## Question selection

Selected questions remain normalized through `crm_meeting_discovery_questions` and are written only through the existing `crm_set_meeting_discovery_questions(...)` RPC.

The Part 4 extension keeps existing cross-Lead and active-question validation, adds a `Scheduled`/`Rescheduled` meeting check, and compares the current normalized question set before performing delete/insert work. Saving an unchanged set therefore produces no unnecessary DML and does not falsely invalidate READY.

The UI supports:

- recommended unresolved questions
- explicit Add/Remove
- search/filter over the existing Discovery catalog
- priority/framework/current state
- current answer snippets where appropriate
- existing `SellerGuidanceHelp`

Actual answer editing remains in Probing & Discovery.

## Seller Hypotheses

Hypotheses use the existing `crm_meeting_preparations.hypotheses` JSONB field.

The Part 4 UI uses the smallest stable editable shape required: an array of Seller hypothesis strings. They are visibly labeled **SELLER HYPOTHESIS** and are never promoted to client facts, Client Voice, Requirements, technical approval, or commercial approval.

For backward compatibility, if an existing hypotheses array ever contains non-string structured values, those unknown values are preserved unchanged when the Seller saves rather than overwritten or coerced.

## Private Seller Notes

Private Seller Notes use the existing `crm_meeting_preparations.seller_notes` field.

They are explicitly internal Seller preparation notes, not customer-facing content, Client Voice, Requirements, or approved technical/commercial truth. UI guidance warns Sellers never to store passwords, API secrets, private keys, recovery codes, card information, or authentication credentials.

Seller Notes are deliberately treated as supplemental. A note-only edit does not invalidate READY. This avoids forcing re-review for incidental private annotations while material plan/question changes remain protected.

## Save behavior

Meeting Prep uses deliberate Save actions rather than aggressive keystroke autosave.

`crmSalesDiscoveryService.saveMeetingPreparation(...)` still upserts by the canonical `meeting_id`, but Part 4 changes its payload construction so optional fields that the caller omits are not sent as `null`. This prevents an unrelated partial save from silently clearing another preparation field.

The UI prevents accidental duplicate submission with busy states, keeps unsaved text/selection on errors, and makes unsaved preparation/question changes visible.

## Readiness

Readiness remains derived from the canonical `sales_meetings` fields:

- `prep_reviewed_at is null` and no prep/question data -> `NOT_STARTED`
- prep row and/or selected questions exist with no review timestamp -> `IN_PROGRESS`
- `prep_reviewed_at is not null` -> `READY`

No readiness boolean/column is added.

READY means only that the Seller reviewed the preparation for this meeting. It does **not** mean Discovery complete, Requirements Confirmed, technical validation complete, package selected, proposal ready, quotation approved, customer ready to buy, Pipeline changed, payment received, or Won.

## Server-side readiness enforcement

### Current rule before Part 4

The existing `mark_sales_meeting_prepared(uuid)` required:

- authenticated user
- existing meeting
- Admin or assigned salesperson
- meeting status `Scheduled`/`Rescheduled`

It then wrote `prep_reviewed_at` / `prep_reviewed_by` without validating a saved preparation plan.

### Part 4 required rule

The same RPC name and result shape are retained, but the server now also requires:

- an existing `crm_meeting_preparations` row
- meaningfully non-empty `meeting_objective`
- meaningfully non-empty `intended_advance`

Hypotheses and Seller Notes are not artificial blockers.

### Why

A frontend-disabled button is not an authoritative control. READY must mean a real saved meeting plan was reviewed even if the RPC is called directly.

### Backward-compatibility impact

Existing callers continue calling `mark_sales_meeting_prepared(uuid)`. The canonical readiness fields and response payload remain unchanged. A caller that did not save the minimum preparation now receives a clear validation error instead of creating a false READY state.

## Ready-state invalidation

Part 4 adds narrow server-side trigger enforcement for material edits after READY.

Material changes are:

- Meeting Objective
- Intended Advance
- Seller hypotheses
- selected meeting-question membership

When one of these materially changes after READY, the server clears:

- `sales_meetings.prep_reviewed_at`
- `sales_meetings.prep_reviewed_by`

The state therefore returns to `IN_PROGRESS`, and the Seller must review and mark Ready again.

The preparation trigger uses `IS NOT DISTINCT FROM` comparisons so no-op updates do not invalidate readiness. The question-selection RPC short-circuits when the normalized question set is unchanged, so saving the same selection also does not invalidate readiness.

Seller Notes are supplemental and do not trigger stale-READY invalidation.

## Guidance integration

Part 4 reuses the canonical `SELLER_GUIDANCE` registry and `SellerGuidanceHelp` component. No tooltip architecture is added.

New guidance keys cover:

- `section.meeting_prep`
- `field.meeting_objective`
- `field.intended_advance`
- `section.what_we_know`
- `section.what_we_still_need`
- `section.meeting_questions`
- `section.recommended_questions`
- `field.seller_hypotheses`
- `field.private_seller_notes`
- `field.preparation_state`
- `action.mark_prep_ready`

Guidance is read-only education. It does not write Discovery, Requirements, Client Voice, Meeting Prep, Pipeline, pricing, package, proposal, or client data.

## RLS and security

The existing RLS model is retained. Live audit confirmed RLS is enabled on:

- `sales_meetings`
- `crm_meeting_preparations`
- `crm_meeting_discovery_questions`
- `crm_discovery_questions`
- `crm_discovery_responses`
- `crm_requirements`
- `crm_client_voice`

Meeting Prep and meeting-question policies continue using `crm_can_access_sales_discovery_meeting(meeting_id)`. Part 4 does not broaden those policies.

The extended RPCs remain `SECURITY DEFINER` with pinned `search_path = public, pg_temp`. Public/anonymous execution is revoked and authenticated execution is granted only where the RPC is intended to be called. Trigger-only invalidation functions have execution revoked from public, anonymous, and authenticated roles.

Cross-Lead custom-question selection remains rejected and inactive questions cannot be selected.

## Audit

Part 4 reuses `crm_lead_events` and `crm_write_lead_event(...)` plus existing Part 1 audit triggers.

Meaningful preparation/question writes remain auditable through the existing infrastructure. New stale-READY invalidation writes a compact CRM lead event containing only meeting/entity/reason metadata, not the Seller's sensitive free-text content.

No second audit table is created.

## Tests

A focused `tests/security/crm-sales-meeting-prep-part-4.test.ts` suite covers the required Part 4 regression/security contract and additional utility behavior.

Coverage includes:

- reuse/no-duplicate guarantees
- Lead Drawer placement
- no-meeting behavior and scheduling reuse
- multiple-meeting/default-selection behavior
- per-meeting canonical persistence
- Objective/Advance
- derived known/gap context
- do-not-ask-again behavior
- recommendation prioritization/applicability
- normalized question selection
- READY server rules
- stale-READY invalidation
- Seller guidance reuse
- RLS/anonymous expectations
- Lead→Opportunity relationship continuity
- Lead/meeting state isolation
- explicit absence of fake client data and later-phase features
- preservation of Parts 1–3.5 regression suites and build/check scripts

The repository-level execution results are reported separately in the Part 4 final implementation report; documentation does not claim a command passed unless it actually executed.

## Database changes

Part 4 migration:

`supabase/migrations/20260909103000_crm_sales_meeting_prep_part_4.sql`

Expected schema effects:

- New business tables: **none**
- New readiness columns: **none**
- Existing function modified: `mark_sales_meeting_prepared(uuid)`
- Existing function modified: `crm_set_meeting_discovery_questions(uuid, uuid[])`
- Existing function modified: `crm_get_sales_discovery_workspace(uuid, uuid)`
- Trigger function added: `crm_invalidate_meeting_prep_ready_from_preparation()`
- Trigger added: `crm_meeting_preparations_invalidate_ready`
- Trigger function added: `crm_invalidate_meeting_prep_ready_from_questions()`
- Trigger added: `crm_meeting_discovery_questions_invalidate_ready`
- RLS changes: **none**
- Index changes: **none**

The workspace RPC is extended to expose existing meeting type/timezone and prepared-by display name alongside the already canonical preparation state/data.

## Deferred scope

Part 4 intentionally does not implement or change:

- Live Meeting Management
- meeting timer/transcript/outcome/close-out
- Requirements Confirmed enforcement
- Package Fit or product/package scoring
- Technical Review workflow
- Commercial Review workflow
- Proposal Readiness
- quotation gating
- Promise Register
- payment/Won behavior
- Sales-to-Delivery Handoff
- `sales_products`
- automatic Pipeline progression

Part 4 stops after Meeting Prep.
