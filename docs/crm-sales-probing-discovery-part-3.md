# CRM Sales Probing & Discovery — Part 3

## Scope

Part 3 implements the Seller-facing **Probing & Discovery** experience only. It extends the Part 1 Discovery foundation and Part 2 Requirements workspace without introducing Meeting Prep UI, package recommendation, Package Fit, Proposal Readiness, specialist/commercial review workflows, pipeline-stage enforcement, quotation enforcement, payment/Won changes, Promise Register, handoff changes, or Seller KPI calculations.

## Reuse audit

Part 3 reuses the existing canonical architecture:

- `crm_discovery_questions` — one question/configuration table for global standard and Lead-scoped custom questions.
- `crm_discovery_responses` — one deal-specific response per canonical Lead + question.
- `crm_client_voice` — one Client Voice model with customer statement separated from Seller interpretation.
- `crm_requirements` — existing Requirements; Discovery only reads/link-displays them.
- `crm_get_sales_discovery_workspace(...)` — one workspace RPC resolving either Lead or Opportunity to the canonical Lead.
- `crmSalesDiscoveryService.ts` — one Sales Discovery data-access service using the existing Supabase client.
- Part 1 RLS, scope guards, actor stamping and `crm_write_lead_event(...)` audit hooks.
- Part 2 Requirement Definitions and Requirements UI.

No `crm_probing_questions`, `sales_discovery_answers`, `client_statements_v2`, `discovery_notes`, second Discovery service, second Requirements system, second Lead identity, or second Supabase client was created.

## Database migration and standard question catalog

Migration:

`supabase/migrations/20260908100000_crm_sales_probing_discovery_part_3.sql`

The migration is additive and seeds the canonical Part 3 playbook into the existing `crm_discovery_questions` table. It contains **99 stable standard question keys** across the supplied Situation, Problem, Impact, Desired Outcome, Audience, Project/Scope, Content, Brand, Commercial, Decision, Complex Deal, Integrations, E-commerce, Booking, SEO, Analytics, Technical, Custom Application, and Risks/Dependencies sections.

Each standard question stores its question text in the database and uses existing `applicability` JSONB for:

- `questionClass`: `CORE`, `RECOMMENDED`, `CONDITIONAL`, or `COMPLEX`.
- `relatedRequirementKeys`: zero or more canonical Requirement keys.
- `section`: the Discovery presentation section.

The migration uses stable `question_key` values and `WHERE NOT EXISTS` against the existing global-standard scope. Existing equivalent keys win; legitimate custom questions are untouched. The migration does **not** insert Lead-specific questions, responses, Client Voice, Requirements, meetings, customers, or Leads.

## Discovery framework

The standard playbook follows the requested consultative flow:

Situation → Problem → Impact → Desired Outcome → Scope → Commercial → Decision → Technical / Conditional.

The default view prioritizes active **CORE** questions. Recommended, Conditional and Complex questions are placed under a collapsed **Additional discovery** area so a simple Lead is not presented as a mandatory 99-question survey. The Seller can always expand the additional catalog.

Conditional relevance uses the question's existing applicability metadata together with current Requirements and existing responses. This is presentation assistance only; it never permanently hides the full catalog.

## Lead Drawer integration

`CRMLeadDrawerBase` has exactly one new Part 3 tab:

1. Overview
2. Requirements
3. Probing & Discovery
4. Complete log
5. Conversation
6. Follow-ups

No Meeting Prep tab is added.

Discovery follows the same lazy-mount pattern as Requirements. It does not call the workspace unless the Seller visits the tab. After first visit it remains mounted while switching drawer tabs, preserving unsaved drafts. Changing Lead or `refreshKey` clears the old Discovery state and reloads the canonical workspace so Lead A drafts cannot appear on Lead B.

`CRMDiscoveryWorkspace` supports both `leadId?: string` and `opportunityId?: string`, and reads through `crmSalesDiscoveryService.getWorkspace(...)` only.

## Discovery summary and coverage

The top summary is informational only and shows:

- Core answered/resolved.
- Needs follow-up.
- Awaiting client.
- Client Voice count.
- Needs specialist validation.

For active global standard `CORE` questions:

- `ANSWERED` counts only when meaningful text or an existing meaningful `structured_value` is present.
- `NOT_APPLICABLE` counts as resolved.
- `NEEDS_FOLLOW_UP`, `ASKED`, `NOT_ASKED`, and empty `ANSWERED` rows do not count as fully answered.

Coverage does not block Lead conversion, pipeline stages, quotation, payment, or Won.

## Response state and certainty behavior

Question states remain exactly:

- `NOT_ASKED`
- `ASKED`
- `ANSWERED`
- `NEEDS_FOLLOW_UP`
- `NOT_APPLICABLE`

Information certainty remains exactly:

- `CLIENT_CONFIRMED`
- `SELLER_OBSERVATION`
- `SELLER_HYPOTHESIS`
- `AWAITING_CLIENT`
- `NEEDS_SPECIALIST_VALIDATION`
- `NOT_APPLICABLE`

A standard question with no response stays `NOT_ASKED` in memory and no response row is created simply by opening Discovery. When the Seller explicitly starts a response, the safe certainty default is `AWAITING_CLIENT`; it never defaults to `CLIENT_CONFIRMED`.

The response editor uses explicit **Save** and **Cancel**. `ANSWERED` requires meaningful text or an already-recorded structured value. Existing `structured_value` is passed back on text-only edits so it is not silently erased. `NOT_APPLICABLE` synchronizes the state/certainty combination and may have an empty answer. `NEEDS_FOLLOW_UP` remains unresolved and is counted/surfaced. `NEEDS_SPECIALIST_VALIDATION` visibly says specialist validation is required but starts no review workflow.

Failed saves keep the draft in the UI and show a Seller-safe error rather than raw PostgreSQL/Supabase internals.

## Custom questions

Sellers can add Lead-scoped custom questions through the existing `saveQuestion(...)` service with:

- Question text.
- Category.
- Framework.
- Optional purpose.
- Optional immediate answer.

Custom keys use `custom_<uuid>` via `crypto.randomUUID()` and are checked against current keys. `is_custom = true` and `lead_id` is the canonical Lead. Custom questions may be edited and safely deactivated with `active = false`; they are never hard-deleted. Standard global question configuration is not editable from the Seller UI and existing RLS keeps global writes Admin-only.

## Client Voice

Client Voice is a section inside Probing & Discovery, not a new top-level tab. It reuses `crm_client_voice` and supports explicit add/edit of:

- **What the client said** — the client's words or a faithful paraphrase.
- **Seller interpretation** — explicitly labelled as interpretation, not automatically a confirmed fact.
- Optional active Requirement link from the same canonical Lead.
- Certainty, defaulting to `SELLER_OBSERVATION` for a new entry.

There is no hard-delete/archive behavior invented for Client Voice in Part 3.

## Requirements connection

Standard question applicability may reference `relatedRequirementKeys`. Discovery reuses Requirements already returned in the same workspace and displays each related Requirement's current state (`Not captured`, `Awaiting client`, `Client confirmed`, `Needs specialist validation`, etc.).

`View in Requirements` switches from Discovery to Requirements inside the existing Lead Drawer. Discovery never opens a second Requirements modal/page and never calls `saveRequirement(...)` while saving an answer. A Discovery answer therefore cannot silently overwrite or become a client-confirmed Requirement.

## Lead → Opportunity continuity

Discovery remains anchored to the canonical Lead. Part 1's workspace RPC resolves `opportunityId` through `crm_opportunities.lead_id`, then reads the same `crm_discovery_questions`, `crm_discovery_responses`, `crm_client_voice`, and `crm_requirements` rows for that Lead. Part 3 does not change Lead conversion and does not copy Discovery rows during conversion.

## Security, RLS and audit

Part 3 adds no broad grants or browser-only authorization. It reuses Part 1 policies and hardening:

- authenticated Sellers remain limited by `crm_can_access_lead(...)`.
- global standard questions are readable but global question writes remain Admin-controlled.
- custom questions/responses/Client Voice remain Lead-scoped.
- cross-Lead question/Requirement/meeting linkage remains rejected by server-side scope guards.
- anonymous access remains denied.
- Discovery audit hooks continue to use `crm_write_lead_event(...)` and avoid copying full sensitive answer/customer-statement bodies into audit metadata.

The UI also warns Sellers not to record passwords, API secrets, private keys, recovery codes, payment-card details, or authentication secrets.

## Responsive and accessibility behavior

The workspace uses the existing dense CRM visual language, Inter inheritance, navy `#000080` for primary structure/actions, and semantic status colors. It uses Lucide semantic icons only; no sparkle/wand/glint decoration is introduced.

Controls use touch-sized minimum heights, wrapped long content, horizontally scrollable filters/tabs, proper labels, `aria-pressed` on filters, `aria-expanded` on collapsible groups, text labels in addition to color, visible focus styles on primary navigation, and Seller-safe form errors.

## Verification

Focused automated coverage is in:

`tests/security/crm-sales-probing-discovery-part-3.test.ts`

The suite maps to the Part 3 TEST 1–44 acceptance list and covers catalog configuration, no fake data, progressive disclosure, response states/certainty, safe defaults, custom questions, Client Voice separation/linking, Requirements connection, no downstream/package changes, continuity, RLS/audit, types, accessibility/responsiveness, and production build expectations.

Normal repository verification commands remain:

```bash
npm run migrations:check
npm test
npm run lint
npm run build
```

## Deferred work

Part 3 intentionally does not implement Meeting Prep UI/agenda, package recommendation/Package Fit, Proposal Readiness, specialist/commercial approval workflows, Requirements Confirmed enforcement, quotation/payment/Won changes, Promise Register, Sales-to-Delivery handoff changes, or Seller KPI calculations. Those remain later Parts.

## Duplication audit

Part 3 maintains:

- ONE canonical Discovery question table.
- ONE canonical Discovery response table.
- ONE Client Voice table.
- ONE Sales Discovery service.
- ONE canonical Lead identity.
- ONE existing Lead→Opportunity relationship.
- ONE Requirements system.
- ONE database-backed standard question catalog.
- ONE existing Supabase client.

Commercial package truth remains in `sales_products`.
