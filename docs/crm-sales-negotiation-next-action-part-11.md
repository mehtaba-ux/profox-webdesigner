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
