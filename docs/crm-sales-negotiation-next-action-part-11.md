# Part 11 — Negotiation / Decision Pending + Next-Action Discipline

## Status

Implementation branch: `part11-negotiation-next-action-discipline`

Starting main SHA: `f99cce75b59fc4e1fd4cca0d9e236dfcad8c2890`

Part 10B production precheck:
- final quotation Send gate: ACTIVE
- policyVersion: 2
- snapshotSchemaVersion: 2
- custom migration ledger: 689 rows
- activation migration: `20260919142410_activate_part10b_final_quotation_send_gate`
- production opportunities: 2
- production activities: 13
- production Negotiation-stage opportunities: 0

## Discovery audit

Part 11 extends the existing CRM architecture. No parallel negotiation, follow-up, communication, quotation, approval, payment, onboarding, or handoff system is introduced.

### Canonical source-of-truth map

| Domain fact | Canonical source |
| --- | --- |
| Opportunity/current lifecycle state | `crm_opportunities` |
| Current next action | `crm_activities` |
| Next-action owner | `crm_activities.assigned_to` |
| Next-action due date | `crm_activities.due_at` |
| Activity status | `crm_activities.status` |
| Activity outcome | existing `crm_activities.outcome` / `outcome_recorded_at` |
| Activity rescheduling | existing `original_due_at`, `reschedule_count`, `last_rescheduled_*` |
| Activity cancellation | existing `cancellation_reason` |
| CRM audit history | `crm_lead_events` through `crm_write_lead_event(...)` |
| Last meaningful customer interaction | derived from canonical CRM/customer interaction events; not manually stored |
| Customer communication | existing unified communication architecture |
| Quotation | existing `quotations` / `quotation_items` |
| Quote-specific approval | existing quotation approval workflow |
| Specialist/commercial validation | existing `crm_sales_validations` |
| Customer acceptance | existing canonical quotation/customer-decision workflow |
| Payment | existing `payments` |
| Won authority | existing payment/Admin-controlled lifecycle |
| Pipeline transition authority | existing `crm_transition_opportunity(...)` |
| Pipeline operational view | existing `crm_get_pipeline_command_center()` |

## Existing activity capability reused

Production `crm_activities` already includes:
- `opportunity_id`
- `assigned_to`
- `subject`
- `due_at`
- `status`
- `outcome`
- `outcome_recorded_at`
- `started_at`
- `original_due_at`
- `reschedule_count`
- `last_rescheduled_at`
- `last_rescheduled_by`
- `last_reschedule_reason`
- `last_reschedule_kind`
- `cancellation_reason`
- `next_activity_id`

Existing trusted RPCs already provide authoritative activity completion, rescheduling and cancellation. Part 11 reuses those functions rather than adding duplicate lifecycle fields or a second task system.

The existing activity configuration already contains `Quotation Follow-Up` with outcomes including Considering, Questions Raised, Revision Requested, Accepted and Declined, so Part 11 does not add a cosmetic activity type.

## Existing opportunity capability reused

`crm_opportunities` remains the current-state owner for opportunity identity, salesperson ownership, stage/status, probability, meeting information, requirements summary, `next_follow_up_at`, notes, stage entry timing and Won/Lost state.

The existing table does **not** contain structured, queryable negotiation decision facts.

## Genuinely missing Part 11 domain facts

The only durable current-state facts that require minimal opportunity extension are:

- `decision_status`
- `primary_objection_category` (nullable; never inferred from silence)
- `waiting_on` (nullable)
- `decision_expected_at` (nullable)
- server-derived decision audit actor/time

No last-interaction timestamp is added because it can be derived from canonical interaction evidence.

No next-action/owner/due fields are added to the opportunity because `crm_activities` is authoritative.

## Security and authority boundaries

- Sellers remain scoped to their assigned opportunities/activities.
- Admin authority reuses existing helpers.
- Actor identity and audit timestamps are server-derived.
- Negotiation entry remains enforced inside the existing `crm_transition_opportunity(...)`.
- Customer acceptance remains canonical quotation truth.
- Awaiting Advance Payment and Won/payment authority are not changed.
- Part 10A and Part 10B are not duplicated or weakened.
- No AI authority is introduced.

## Implementation boundary

Part 11 will:
1. minimally extend `crm_opportunities` with structured negotiation state;
2. add narrow trusted RPC(s) only for missing decision-state / opportunity-next-action mutations;
3. extend `crm_transition_opportunity` with the Negotiation entry gate;
4. extend `crm_get_pipeline_command_center` with derived meaningful-interaction, next-action and negotiation health context;
5. expose the existing activity lifecycle fields in TypeScript where required;
6. add contextual Decision & Next Action UX to the existing pipeline/opportunity drawer;
7. add focused regression/security tests;
8. update the master implementation spec.

It will not implement Part 12+.


## Repository implementation

Part 11 is implemented on this branch by extending the canonical systems only.

### Migration

- version: `20260920123000`
- name: `crm_sales_negotiation_next_action_part_11`
- SHA-256: `e9b7496ef2561641d9e873534a465cc9fc6a487bcf38908348ab30ee9e9971ab`

The migration is nullable/backward-compatible and does not backfill decision state, objections, waiting state or next actions for historical production rows.

### Server authority

- `crm_record_negotiation_decision_state(...)` owns structured decision-state mutation.
- `crm_schedule_opportunity_next_action(...)` schedules an opportunity-linked action in canonical `crm_activities`.
- `crm_transition_opportunity(...)` remains the only Pipeline transition authority and now enforces the Negotiation entry gate.
- `crm_get_pipeline_command_center()` remains the canonical operational Pipeline read model.
- `crm_get_last_meaningful_customer_interaction(...)` derives recent customer-facing interaction from existing evidence and excludes internal notes, automated email/reminders and failed-contact outcomes.
- `crm_guard_activity_opportunity_link()` rejects cross-Lead/cross-opportunity activity linkage and preserves Seller ownership scope.
- protected Part 11 fields cannot be directly rewritten outside the trusted decision RPC.

### UI/service integration

The existing Pipeline opportunity card/drawer now surfaces **Decision & Next Action** context for Quotation Sent and Negotiation stages. The UI records controlled decision state through the trusted RPC and schedules the next action into `crm_activities`. Existing Activity Center RPCs remain authoritative for completion, outcome recording, rescheduling and cancellation.

No new top-level Negotiation application, task system, communication system, approval table or quotation workflow was created.

### Focused tests

- file: `tests/security/crm-sales-negotiation-next-action-part-11.test.mjs`
- command: `npm run test:crm-part11`
- included in repository-wide `npm test`

The focused suite covers source reuse, historical compatibility, decision semantics, no silence inference, same-opportunity next-action selection, server-derived actor/time, transition authority, quotation acceptance/payment boundaries, Part 10B preservation, meaningful-interaction derivation, Pipeline/UI integration, security grants and absence of duplicate systems.

The executable source-spec matrix contains exactly 60 named Part 11 cases covering the SOP's Negotiation entry, activity lifecycle, decision/commercial, UI and accessibility requirements.

Production verification is wired through `production:verify-part11`, which runs in the canonical production deployment after `migrations:apply` and again during final production verification.

## Final release evidence

### Repository / merge lineage

- Part 11 implementation PR: `#120`
- Part 11 implementation merge SHA: `18464bfe3691fbf53632f2284f5b736a00cd048a`
- migration quoting hotfix PR: `#121`
- quoting hotfix merge SHA: `82c0bd705aed9c692c47bb78053bcfe6dd2adfab`
- Part 10B transition-successor verifier hotfix PR: `#122`
- verifier hotfix merge SHA: `ec25bd007896e7b3d11657a9ecaec4fd7594fdc3`
- authenticated production UI QA PR: `#123`
- authenticated QA merge SHA / deployed main SHA: `e54d022678a1eea473d61dd22990557389eb1d7d`

Trusted merged-main CI:

- workflow: `ProFox CRM CI`
- run: `#884 / 35494715173`
- exact head: `e54d022678a1eea473d61dd22990557389eb1d7d`
- TypeScript: PASS
- migration integrity: PASS
- full regression suite: PASS
- Part 10A: PASS through `npm test`
- Part 10B: PASS through `npm test`
- Part 11 focused + exact 60-case matrix + authenticated-QA security contract: PASS
- browser launch-readiness: PASS
- verifier syntax: PASS
- production dependency audit: PASS
- production build: PASS

### Production migration

Canonical Part 11 migration:

- version: `20260920123000`
- name: `crm_sales_negotiation_next_action_part_11`
- SHA-256: `e9b7496ef2561641d9e873534a465cc9fc6a487bcf38908348ab30ee9e9971ab`
- production ledger: exactly one row, `baseline=false`

The first production deploy correctly rolled back the unapplied migration when malformed single-dollar PostgreSQL delimiters were discovered. PR #121 repaired only those delimiters and added a regression preventing recurrence.

The next deploy successfully applied Part 11 but exposed a stale Part 10B.6 transition fingerprint in the release verifier. PR #122 evolved that postcondition fail-closed: only the original reviewed Part 10B transition or the exact reviewed Part 11 successor is accepted, while `crm_get_sales_gate_assessment`, `REQUIREMENTS_CONFIRMED` and the blocker path remain mandatory.

### Final production deploy

- workflow: `Deploy ProFox Production`
- run: `#360 / 35494800711`
- deployed SHA: `e54d022678a1eea473d61dd22990557389eb1d7d`
- Cloudflare Worker version: `cc3681a8-e92b-4600-9671-43b7ed9abccc`
- checksum-verified migration application: PASS
- production database/integration readiness: PASS
- Part 10B release readiness: `0 failure(s), 0 warning(s)`
- Part 11 release readiness: `0 failure(s)`
- migration lineage: `PENDING_NEW 0`, `BLOCKED_UNRESOLVED 0`
- Cloudflare Worker deploy: PASS
- public Worker health: PASS
- deployed frontend/public-content verification: PASS
- unauthenticated production browser smoke: PASS
- final production readiness: PASS

### Authenticated Seller/Admin production UI QA

Part 11's remaining authenticated QA requirement is now executed by `scripts/verify-part11-authenticated-production-ui.mjs` inside the canonical production deploy.

Security properties:

- the trusted runner retrieves the project server API key through the Supabase Management API;
- the server key never enters the browser context;
- short-lived one-time user sessions are generated server-side;
- Seller uses the already-approved synthetic Sales identity;
- Admin uses an existing confirmed active Admin identity;
- the test performs no CRM insert/update/upsert/delete;
- CRM business counts are captured before and after and must remain identical.

Deploy #360 produced:

- Seller Pipeline desktop/mobile: PASS
- Seller `individual` scope: PASS
- Seller Activities & Follow-Up: PASS
- Seller keyboard focus check: PASS
- Seller Admin-only controls absent: PASS
- Admin `team` Pipeline scope: PASS
- Admin Pipeline settings: PASS
- Admin Activities / Activity settings: PASS
- Admin canonical Quotation Approvals: PASS
- business-data immutability: PASS

Before/after business truth remained:

- opportunities: `2`
- activities: `13`
- Negotiation opportunities: `0`
- Part 11 decision-state rows: `0`
- Part 11-created activities: `0`

No real deal was moved into Negotiation merely for testing. Because production currently has no legitimate Quotation Sent / Negotiation opportunity, the contextual **Decision & Next Action** panel is covered by the exact 60-case Part 11 contract rather than fabricated production data.

### Final production truth

Independent read-only verification after authenticated QA confirms:

- custom migration ledger total: `690`
- custom max migration: `20260920123000`
- exact Part 11 checksum: present
- Part 10B final Send gate: `true`
- `policyVersion=2`
- `snapshotSchemaVersion=2`
- Part 11 production business counts remain unchanged as listed above

## Release status

**PART 11 — Negotiation / Decision Pending + Next-Action Discipline: COMPLETE.**

Repository implementation, trusted CI, canonical production migration, merged-main deployment, Part 10B preservation, Part 11 release verification, authenticated Seller/Admin production UI QA, mobile/keyboard Seller validation, canonical Admin quotation-approval validation and business-data immutability are all complete.

No fake CRM customer/deal data was created for release testing.

**Part 12+ has not started.**
