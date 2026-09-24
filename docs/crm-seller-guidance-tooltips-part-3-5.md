# CRM Sales SOP — Part 3.5: Seller Guidance & Contextual Help

## Status

Part 3.5 adds contextual Seller guidance to the CRM surfaces already implemented in Parts 1–3. It is an instructional/read-only layer only. It does not introduce a new Discovery system, Requirements system, commercial engine, lifecycle gate, specialist-review workflow, Meeting Prep workflow, package recommender, quotation workflow, payment flow, or Won flow.

**Stop condition:** Part 4 Meeting Prep is intentionally not implemented here.

## Reuse audit

Part 3.5 reuses the existing production architecture:

- `crmSalesDiscoveryService` and the existing Part 1–3 workspace data remain authoritative.
- Discovery questions continue to resolve by stable `question_key`.
- Requirement guidance resolves by canonical `requirementKey` from the Part 2 Requirement Definition catalog.
- Lead status guidance resolves from the existing `LeadStatus` enum.
- Pipeline stage guidance resolves from the existing `OpportunityStage` enum.
- Discovery workflow guidance resolves from the existing Discovery state, certainty, priority, and framework enums.
- Commercial truth remains outside this help layer; `sales_products` remains the canonical package/product source.
- The help layer does not instantiate Supabase, call a save service, run a transition, or create records.

No Part 3.5 database migration is required. No help/training table was created. This avoids a second mutable source of truth, additional RLS surface, N+1 help lookups, and content/data drift.

## Canonical help architecture

The single reusable UI primitive is:

- `src/components/admin/crm/SellerGuidanceHelp.tsx`

The canonical typed/domain guidance sources are:

- `src/lib/crmSellerGuidance.ts`
- `src/lib/crmSellerGuidanceData.ts`

Two interaction levels are provided from the same entry:

1. **Quick help** — hover or keyboard focus shows a compact tooltip.
2. **Detailed help** — click/tap opens the accessible detail dialog / mobile sheet.

Detailed entries can explain meaning, why the information matters, what the Seller should do, how to ask, what to listen for, what to avoid, follow-up behavior, escalation, certainty, security, and the SOP reference when relevant.

The component uses a portal so help is not clipped by Lead Drawer overflow. It supports keyboard focus, Escape, focus containment/return, ARIA labeling, screen-reader semantics, responsive placement, and a mobile bottom sheet.

Opening guidance is side-effect free. It never saves an answer, changes certainty, creates Client Voice, creates/updates a Requirement, moves a Lead/Opportunity, creates a quotation, records payment, or marks Won.

## Stable identity rules

| Guidance subject | Stable key source |
| --- | --- |
| Standard Discovery question | `question_key` |
| Requirement Definition | canonical `requirementKey` |
| Discovery priority | `CRMRequirementClass` enum value |
| Discovery workflow state | `CRMDiscoveryQuestionState` enum value |
| Information certainty | `CRMInformationCertainty` enum value |
| Discovery framework | `CRMDiscoveryFramework` enum value |
| Lead status | `LeadStatus` enum value |
| Pipeline stage | `OpportunityStage` enum value |
| Generic field/action | stable application key such as `field.client_voice_statement` or `action.qualify_lead` |

No guidance is keyed by row index, render order, random ID, display position, or mutable customer data.

## Coverage summary

| Surface / vocabulary | Canonical current set | Guidance coverage | Status |
| --- | ---: | ---: | --- |
| Active standard Discovery questions | 99 | 99 / 99 | COMPLETE |
| Seller-facing Requirement Definitions | 105 | 105 / 105 | COMPLETE |
| Question priorities | 4 | 4 / 4 | COMPLETE |
| Discovery states | 5 | 5 / 5 | COMPLETE |
| Information certainty states | 6 | 6 / 6 | COMPLETE |
| Requirement record states | 2 | 2 / 2 | COMPLETE |
| Discovery frameworks | 9 | 9 / 9 | COMPLETE |
| Lead statuses | 7 | 7 / 7 | COMPLETE |
| Pipeline stages | 7 | 7 / 7 | COMPLETE |

### Discovery question coverage

All 99 active standard question keys from the Part 3 migration are represented in `DISCOVERY_GUIDANCE_KEYS` and resolve through `getDiscoveryQuestionGuidance(question)`. The resolver uses the canonical `question.question_key`; changing visual order does not change help identity.

Question guidance preserves these rules:

- client statements are not silently rewritten into facts;
- Seller research/observation/hypothesis stays distinct from client confirmation;
- incomplete answers stay visible instead of being guessed;
- technical/integration uncertainty can remain `NEEDS_SPECIALIST_VALIDATION`;
- budget is never invented;
- requested timing is not a delivery promise;
- SEO guidance never promises rankings, traffic, or lead volume;
- secret credentials are never requested/stored in Discovery fields.

### Requirement coverage

All 105 canonical Requirement Definition keys resolve through `getRequirementGuidance(definition)`. Help is category-aware while identity remains the canonical Requirement key.

Requirements guidance explicitly distinguishes a discovered/requested requirement from:

- approved commercial scope;
- package inclusion;
- approved price/discount;
- delivery commitment;
- guaranteed business outcome;
- technical feasibility that still needs validation.

Sensitive technical/access guidance tells Sellers to record the **type of access needed later**, never passwords, API secrets, private keys, recovery codes, payment-card data, or authentication secrets.

### Client Voice

Separate help exists for:

- `field.client_voice_statement` — what the client actually said;
- `field.client_voice_interpretation` — the Seller's separate interpretation;
- `field.client_voice_requirement` — optional linked Requirement context.

Linking Client Voice to a Requirement adds context only. It does not automatically confirm or update Requirement certainty.

## Current status and terminology coverage

### Lead statuses

The current Lead status choices are explained through `LEAD_STATUS_GUIDANCE`:

`New`, `Researching`, `Contacted`, `Follow-Up`, `Interested`, `Qualified`, `Not Qualified`.

`CRMLeadStagePicker` uses the same canonical help component for the current Lead status choices and qualification checkpoint. Guidance does not change qualification logic.

### Pipeline stages

The current Opportunity stage vocabulary is explained through `OPPORTUNITY_STAGE_GUIDANCE`:

`Qualified`, `Meeting Scheduled`, `Requirements Confirmed`, `Quotation Sent`, `Negotiation / Decision Pending`, `Awaiting Advance Payment`, `Won`.

These explanations are documentation/instruction only. They do not alter `crmService.transitionOpportunity`, drag/drop behavior, stage restrictions, payment verification, or Won enforcement.

### Discovery frameworks

The canonical frameworks are covered 9/9:

`SITUATION`, `PROBLEM`, `IMPLICATION_IMPACT`, `NEED_DESIRED_OUTCOME`, `SCOPE`, `COMMERCIAL`, `DECISION`, `TECHNICAL`, `CUSTOM`.

Framework guidance teaches the purpose of the questioning style without turning it into a rigid script or introducing a second Discovery catalog.

## Action coverage audit

The audit deliberately adds help only where an action has non-obvious SOP meaning. Decorative or self-explanatory controls do not receive tooltips just to increase counts.

| Action | Visible where | Guidance needed? | Guidance key | Complete? |
| --- | --- | --- | --- | --- |
| Add custom Discovery question | Discovery | Yes — avoid duplicates/leading questions | `action.add_custom_question` | Yes |
| Save Discovery response | Discovery | Yes — explain state/certainty effect, no automatic Requirement confirmation | `action.save_response` | Yes |
| Edit Discovery response | Discovery | Yes | `action.edit_response` | Yes |
| Mark Discovery follow-up | Discovery | Yes — does not itself create CRM activity | `action.mark_follow_up` | Yes |
| Link Requirement context | Discovery / Client Voice | Yes — linking is not confirmation | `action.link_requirement` | Yes |
| Open Requirements | Lead Drawer / Discovery context | Yes — reuse same workspace, no copying | `action.open_requirements` | Yes |
| Open Discovery | Lead Drawer | Yes — reuse same workspace | `action.open_discovery` | Yes |
| Change Discovery state | Discovery | Yes | `action.change_discovery_state` | Yes |
| Add Client Voice | Discovery | Yes — real client evidence only | `action.add_client_voice` | Yes |
| Schedule sales meeting | current Sales meeting action | Yes — scheduling is not Meeting Prep readiness | `action.schedule_meeting` | Yes |
| Create Follow-Up | existing CRM activity flow | Yes — real action/date, no side effect from help | `action.create_follow_up` | Yes |
| Qualify Lead | Lead stage picker | Yes — lifecycle checkpoint | `action.qualify_lead` | Yes |
| Add custom Requirement | Requirements | Yes — use only for genuine gap | `action.add_custom_requirement` | Yes |
| Save Requirement | Requirements | Yes — does not approve commercial/technical truth | `action.save_requirement` | Yes |
| Archive custom Requirement | Requirements | Yes — soft archive/history retained | `action.archive_custom_requirement` | Yes |
| Close help | help dialog | No — self-explanatory | n/a | n/a |
| Filter/search/collapse | Discovery / Requirements / Pipeline | No — standard UI behavior | n/a | n/a |

Not every registry action requires a dedicated icon next to every repeated button. The canonical entry exists once and is mounted at the most useful contextual point where the SOP meaning is non-obvious.

## SOP coverage matrix

| SOP concept | Current UI | Guidance | Status |
| --- | --- | --- | --- |
| Part 1 Lead ↔ Opportunity continuity | Existing CRM lifecycle | Guidance preserves one linked lifecycle and never copies customer facts | CURRENT — COVERED |
| Part 2 Requirements | Requirements tab/workspace | 105/105 canonical Requirement guidance | CURRENT — COVERED |
| Part 3 Probing & Discovery | Discovery workspace | 99/99 question guidance | CURRENT — COVERED |
| Discovery priorities | Discovery rows/filters | 4/4 | CURRENT — COVERED |
| Discovery states | Discovery response workflow | 5/5 | CURRENT — COVERED |
| Information certainty | Discovery + Requirements | 6/6 | CURRENT — COVERED |
| Client Voice evidence vs Seller interpretation | Discovery workspace | Separate stable field keys | CURRENT — COVERED |
| Requirement source/provenance | Requirements | `field.requirement_source` | CURRENT — COVERED |
| Seller observation vs client-confirmed fact | Discovery + Requirements | certainty guidance | CURRENT — COVERED |
| Technical / integration uncertainty | Discovery + Requirements | specialist-validation and security guidance | CURRENT — COVERED |
| Lead statuses / qualification | Lead status picker | 7/7 statuses + qualification action help | CURRENT — COVERED |
| Pipeline terminology | Pipeline | 7/7 canonical stage explanations | CURRENT — COVERED |
| Existing sales meeting scheduling | Seller actions | `action.schedule_meeting` | CURRENT — COVERED |
| Meeting Prep workspace / readiness | Not implemented in Parts 1–3 | No workflow implemented | **FUTURE UI — NOT YET APPLICABLE** |
| Meeting Objective / Intended Advance | Not implemented | No fields/workflow implemented | **FUTURE UI — NOT YET APPLICABLE** |
| Specialist review workflow | Not implemented | Guidance may say validation is needed; no review workflow is created | **FUTURE UI — NOT YET APPLICABLE** |
| Package Fit / recommendation workflow | Not implemented | Help never recommends or selects packages | **FUTURE UI — NOT YET APPLICABLE** |
| Proposal/Sales Readiness | Not implemented | No readiness score/gate created | **FUTURE UI — NOT YET APPLICABLE** |
| New Pipeline gating from Discovery/Requirements | Not implemented | Help explicitly avoids implying such gates | **FUTURE UI — NOT YET APPLICABLE** |
| New quotation gating | Not implemented | No behavior added | **FUTURE UI — NOT YET APPLICABLE** |
| New payment/Won behavior | Not implemented | No behavior added | **FUTURE UI — NOT YET APPLICABLE** |
| Promise Register | Not implemented | No data model/UI added | **FUTURE UI — NOT YET APPLICABLE** |

## Security and data-safety guarantees

- Help component has no Supabase import.
- Help component has no `crmSalesDiscoveryService` import.
- Opening quick/detailed help does not call save/update/insert/upsert APIs.
- Training examples are rendered as instructional content only and never copied into response fields.
- No synthetic client statement, Requirement, answer, budget, commercial promise, or confirmation is seeded.
- No package price/name is hard-coded by the guidance layer.
- No Part 3.5 migration exists.
- Existing RLS/business rules remain untouched.

## Focused regression tests

`tests/security/crm-seller-guidance-part-3-5.test.ts` contains the required **TEST 1–53** coverage, including:

- canonical component/reuse checks;
- 99/99 Discovery coverage and stable keys;
- 105/105 Requirement coverage and stable keys;
- priority/state/certainty guidance;
- Client Voice separation;
- custom-question/follow-up guidance;
- technical/security/budget safeguards;
- keyboard, focus, touch/mobile, ARIA, portal and Escape behavior;
- read-only/no-write/no-fake-data checks;
- no package, Pipeline gate, quotation, payment/Won, or Part 4 behavior;
- Part 1–3 regression presence;
- TypeScript, security, migration-integrity and production-build command coverage.

The repository CI remains the execution authority for:

```bash
npm ci
npm run lint
npm run migrations:check
npm test
npm run test:security
npm run build
```

## Responsive / manual QA matrix

The implementation is designed and automatically asserted for desktop/tablet/mobile behaviors:

| Check | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Hover/focus quick help | Supported | Supported where pointer/focus exists | Focus fallback |
| Click/tap detailed help | Supported | Supported | Supported |
| Viewport/Drawer clipping protection | Portal + viewport positioning | Portal + viewport positioning | Full-width bottom sheet |
| Keyboard Escape | Supported | Supported | Supported with keyboard |
| Focus containment/return | Supported | Supported | Supported |
| Long help text | Scrollable detail dialog | Scrollable | `max-h-[92vh]` sheet |

An authenticated interactive browser session is required to truthfully perform a human visual pass against production CRM data. Where such browser tooling is unavailable in the execution environment, that human pass must be reported as unavailable rather than fabricated; automated component/security/CI checks remain the verification evidence.

## Duplication audit

Part 3.5 creates exactly one reusable help component and one canonical typed guidance domain split across the registry/data modules for maintainability. It creates:

- no second Discovery table/service/workspace;
- no second Requirements table/service/workspace;
- no help/training database;
- no second Supabase client;
- no duplicate Requirement Definition catalog;
- no fake Lead/Opportunity/Requirement/Discovery/Client Voice records;
- no new commercial source of truth;
- no Meeting Prep implementation.

The expected Part 3.5 branch diff is limited to Seller guidance data/domain, the reusable help UI, contextual integrations in existing Seller CRM surfaces, focused tests, and this documentation.