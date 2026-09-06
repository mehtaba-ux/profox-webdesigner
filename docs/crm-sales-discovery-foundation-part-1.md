# CRM Sales Discovery Foundation — Part 1

## Scope

This note records the implementation-only architecture for Part 1 of the Seller-led CRM discovery work. It deliberately does **not** add the Requirements, Probing & Discovery, Client Voice, or Meeting Prep UI to the Lead Drawer and does not change quotation, package-fit, proposal-readiness, pipeline, Won, payment, onboarding, or delivery gates.

## Reuse map

| Capability | Existing implementation | Part 1 decision |
| --- | --- | --- |
| Lead identity and Seller ownership | `crm_leads` + `crm_can_access_lead(uuid)` | Reuse unchanged |
| Opportunity lifecycle | `crm_opportunities.lead_id` + existing conversion flow | Reuse unchanged; resolve discovery through canonical `lead_id` instead of copying records on conversion |
| Sales meetings | `sales_meetings` | Reuse unchanged as the canonical meeting entity |
| CRM audit trail | `crm_lead_events` | Reuse; discovery triggers write meaningful record changes into the existing lead event stream |
| Supabase browser client | `src/lib/supabase.ts` | Reuse unchanged |
| Requirements | No queryable Seller discovery structure existed | Create the smallest connected structured table: `crm_requirements` |
| Standard/custom discovery questions | Training-only question systems existed, but no operational Seller CRM question catalog | Create `crm_discovery_questions`; standard questions are global catalog rows, custom questions are scoped to one canonical Lead |
| Deal-specific question state and answers | No operational structured model existed | Create `crm_discovery_responses` linked to Lead, canonical question, and optional `sales_meetings` source |
| Client Voice | Conversation/transcript/meeting data existed but did not safely preserve customer statement separately from Seller interpretation with requirement linkage | Create `crm_client_voice` |
| Meeting Prep | `sales_meetings` has meeting/preparation metadata, but its customer/token read policies make Seller hypotheses inappropriate to add directly | Create a protected one-to-one child `crm_meeting_preparations` keyed by `sales_meetings.id`; this is not a second meeting entity |
| Meeting question selection | No normalized association existed | Create `crm_meeting_discovery_questions` as the meeting↔question relation |

## New database objects and why they are necessary

### `crm_requirements`

Stores queryable standard/custom Seller requirements without turning `crm_leads.qualification_data`, `requirements_summary`, or one uncontrolled JSON object into a second source of truth. Every row belongs to the canonical Lead. Opportunity continuity is resolved through `crm_opportunities.lead_id`.

### `crm_discovery_questions`

Provides a maintainable/queryable operational question catalog. It supports standard SOP questions and Seller-created custom questions without repurposing Academy/training question tables.

### `crm_discovery_responses`

Stores per-Lead question lifecycle and answer state (`NOT_ASKED`, `ASKED`, `ANSWERED`, `NEEDS_FOLLOW_UP`, `NOT_APPLICABLE`) with certainty, provenance, optional meeting source, and follow-up state.

### `crm_client_voice`

Preserves the customer's statement separately from Seller interpretation and can link the observation to the requirement it informed. Existing chat/transcript records remain canonical communication records; this table stores the deliberately selected sales-discovery observation.

### `crm_meeting_preparations`

A one-to-one protected child of the existing `sales_meetings` row. It stores Seller-only objective, intended advance, hypotheses, preparation state, Seller notes, and server-attributed prepared-by/prepared-at values. It is separate because `sales_meetings` already has customer/token read paths and Seller hypotheses must remain internal.

### `crm_meeting_discovery_questions`

Normalized association between an existing `sales_meetings` row and canonical discovery questions. Cross-Lead custom-question selection is rejected.

## Certainty and provenance

The structured foundation uses the six required certainty states:

- `CLIENT_CONFIRMED`
- `SELLER_OBSERVATION`
- `SELLER_HYPOTHESIS`
- `AWAITING_CLIENT`
- `NEEDS_SPECIALIST_VALIDATION`
- `NOT_APPLICABLE`

AI or service defaults never silently assign `CLIENT_CONFIRMED`. Requirements and answers default to `AWAITING_CLIENT`; Client Voice defaults to `SELLER_OBSERVATION` because it represents the Seller's captured observation unless explicitly confirmed later.

Where applicable, records carry `source_type`, `source_record_id`, and `source_recorded_at`. Creator/updater attribution is stamped server-side.

## Lead → Opportunity continuity

Discovery data is anchored to the original `crm_leads.id`. The existing `convert_lead_to_opportunity(...)` flow already creates `crm_opportunities.lead_id`; Part 1 does not copy or migrate discovery rows during conversion. The workspace read RPC accepts either a Lead ID or Opportunity ID and resolves the same canonical Lead. This prevents manual re-entry and avoids two mutable copies of the same discovery information.

## Security / RLS

All new operational tables have RLS enabled. Seller/Admin/management access reuses `crm_can_access_lead(uuid)` and existing CRM authorization helpers. Standard catalog rows are readable only to authenticated CRM-capable users; standard catalog writes are Admin-only. Custom question and all deal-specific writes remain Lead-scoped.

Anonymous table access is explicitly revoked. Seller-only Meeting Prep is not added to `sales_meetings`, avoiding accidental exposure through the meeting table's existing customer/token read policies.

Server-side linkage triggers reject:

- custom questions attached to another Lead,
- answers linked to a meeting for another Lead,
- Client Voice linked to another Lead's meeting/Requirement,
- Meeting Prep for a meeting without a canonical Lead,
- meeting selection of inactive or cross-Lead custom questions.

Identity fields and creator attribution are server-protected. Meeting `prepared_by` / `prepared_at` are stamped by the database when preparation becomes `READY`.

## Audit

No new audit table was created. Meaningful discovery mutations reuse `crm_lead_events` through `crm_sales_discovery_audit_event()`. The event payload records entity/action identifiers and state changes without copying full customer statements or answers into the audit payload.

## Server/service layer

New RPCs:

- `crm_get_sales_discovery_workspace(uuid, uuid)` — one coherent Lead/Opportunity read model with authorization enforced before returning Requirements, questions, responses, Client Voice, and connected Meeting Prep.
- `crm_set_meeting_discovery_questions(uuid, uuid[])` — atomically replaces a meeting's selected question set after canonical Lead authorization/linkage checks.

New frontend foundation:

- `src/lib/crmSalesDiscoveryService.ts`
- strong TypeScript contracts for certainty, question lifecycle, Requirements, responses, Client Voice, Meeting Prep, and workspace payloads.
- reuses the canonical `supabase` client; no second client or parallel CRM service stack.

## Migrations

- `20260906113000_crm_sales_discovery_foundation_part_1.sql`
- `20260906113500_crm_sales_discovery_foundation_hardening.sql`

Both migrations are additive. No production rows are seeded and no existing column/table is dropped, renamed, or rewritten.

## Tests

`tests/security/crm-sales-discovery-foundation-part-1.test.ts` verifies the connected schema, certainty states, question lifecycle, separate Client Voice fields, Meeting Prep linkage, RLS/anonymous denial, audit reuse, service reuse, Lead→Opportunity resolution, no downstream gate replacement, and no Lead Drawer tabs.

The normal repository CI remains authoritative for TypeScript, migration integrity, security regression tests, dependency audit, and production build.

## Intentionally deferred after Part 1

- Visible Lead Drawer tabs for Requirements, Probing & Discovery, Client Voice, or Meeting Prep.
- Standard SOP question/requirement business-content seeding. Part 1 establishes support without inserting fake or hard-coded commercial data.
- Changes to `Requirements Confirmed`, package fit, proposal readiness, quotation rules, discounts, payment, Won, onboarding, delivery handoff, KPIs, or Academy permissions.
- Part 2 UI/workflow behavior.

## Required safety confirmations

**NO PARALLEL OR DUPLICATE SALES SYSTEM WAS CREATED.**

**NO FAKE BUSINESS DATA WAS ADDED TO PRODUCTION.**

**ALL NEW SALES DISCOVERY DATA REMAINS CONNECTED TO THE EXISTING PROFOX SALES LIFECYCLE.**
