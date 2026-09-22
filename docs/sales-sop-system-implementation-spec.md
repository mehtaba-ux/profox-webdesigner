# Sales SOP System Implementation Specification

**Document:** PF-SOP-01 System Implementation Specification  
**Status:** Required implementation standard  
**Applies to:** CRM, Seller Command Center, Lead Workspace, Pipeline, Meetings, Sales Catalog, Quotations, Payments, Client Onboarding, Sales-to-Delivery Handoff, Sales Academy, Seller Performance  
**Primary audience:** Developers, coding agents, QA, product owners, Sales Operations, Delivery Operations  

---

## 1. Purpose

This document defines how the ProFox Sales SOP must be implemented inside the product so that a salesperson follows the process by using the normal sales system.

The goal is **not** to add a static SOP page that sellers must remember to read. The goal is to convert the SOP into system behavior:

- guided work,
- structured discovery,
- required evidence,
- stage gates,
- package-fit checks,
- technical/commercial escalation,
- proposal-readiness checks,
- manager approvals,
- immutable quotation snapshots,
- post-sale handoff acceptance,
- quality measurement.

A seller must not be able to accidentally skip a critical step simply because they forgot the SOP.

### Core principle

> The SOP is policy. The application is the execution mechanism.

The system must tell the seller what is required, what is missing, what is uncertain, what requires review, and what the next valid action is.

---

## 2. Existing architecture must be extended, not replaced

Do **not** create a second CRM, second package catalog, second quotation source, second payment truth, or second handoff model.

Reuse the existing authoritative systems described in `docs/seller-command-center-source-of-truth.md`.

Existing primary components include:

- `crm_leads`
- `crm_opportunities`
- `crm_activities`
- `sales_meetings`
- `sales_products`
- `quotations` and quotation item snapshots
- `payments`
- client onboarding records
- Sales-to-Delivery handoff records
- Seller Command Center
- Lead Drawer / Lead Workspace
- CRM Pipeline
- Meeting Prep / Meeting Management
- Sales Catalog
- Quotation workflows
- Professional communication tools
- Sales Academy / certification
- Seller performance reporting

### Existing pipeline behavior to preserve

The current opportunity pipeline uses server-authoritative transitions through `crm_transition_opportunity` and a configurable pipeline definition. It already supports:

- `requiredFields`
- `allowedPrevious`
- `allowedNext`
- `allowSkip`
- `allowBackward`
- `approvalRequired`
- default probability
- stage SLA
- stage classification

The current pipeline stages are:

1. Qualified
2. Meeting Scheduled
3. Requirements Confirmed
4. Quotation Sent
5. Negotiation / Decision Pending
6. Awaiting Advance Payment
7. Won

Do not weaken this server-side authority. Frontend controls are guidance only; the server remains authoritative.

---

## 3. Non-negotiable implementation rules

Every developer working on this feature must follow these rules.

### 3.1 Server authority

Critical rules must be enforced server-side through RPC/database logic or another trusted backend layer. A disabled frontend button alone is not enforcement.

### 3.2 No duplicated commercial truth

Current package name, approved scope, current price, payment schedule, delivery guidance, client expectations, and package availability come from `sales_products`.

Do not hard-code package pricing or scope into SOP components.

### 3.3 Historical commercial accuracy

When a quotation is issued, the quotation must retain a snapshot of the commercial facts used for that customer. Later Sales Catalog changes must not rewrite historical agreements.

### 3.4 Unknown is not failure

The system must never encourage a seller to invent data just to satisfy a required field.

For important discovery facts, support explicit states such as:

- Confirmed by client
- Seller observation
- Seller hypothesis
- Awaiting client
- Requires specialist validation
- Not applicable

A valid `Awaiting client` or `Requires specialist validation` state may satisfy data-entry completeness while still creating a gate or escalation where appropriate.

### 3.5 Progressive disclosure

Do not show the complete SOP questionnaire to every lead. Show only what is relevant to the current lifecycle stage, package complexity, and known information.

### 3.6 Do not ask twice

If ProFox already has reliable information from the lead, CRM, prior meeting, quotation, catalog, or onboarding source, prefill or display it rather than asking the seller/client again.

### 3.7 Sensitive information

Sales records may identify that access will be required later, but the Sales workflow must not casually collect passwords, API secrets, recovery codes, private keys, or similar credentials.

### 3.8 No automatic AI confirmation

AI may summarize or suggest. AI must not silently convert an inferred statement into `Confirmed by client`, approve technical feasibility, approve commercial exceptions, or bypass a gate.

### 3.9 Every open deal requires a next action

An active opportunity should not be left without a meaningful next action, owner, and due date unless it is closed/disqualified or explicitly waiting on an external event represented by the system.

### 3.10 Overrides must be auditable

Any manager/admin override of an SOP rule must record:

- rule/gate overridden,
- actor,
- timestamp,
- reason,
- previous status,
- resulting status.

---

## 4. Target operating model

The Seller Command Center remains the primary lifecycle surface. The SOP must appear contextually inside the existing sales flow.

For each opportunity, the seller should be able to see:

- current stage,
- sales-readiness/completeness status,
- next required action,
- blocking items,
- warnings,
- pending specialist reviews,
- package-fit status,
- next activity,
- quotation/payment status where relevant.

Example summary:

```text
Acme Roofing
Current stage: Requirements Confirmed
Sales readiness: 82%

Blocking Quotation:
- Economic buyer not confirmed
- HubSpot integration requires technical validation

Next recommended action:
Request technical review
```

The system should explain **why** progression is blocked and what action resolves it.

---

## 5. Lifecycle and gate model

Keep the visible pipeline reasonably simple. Add deeper sub-gates underneath the existing stages.

### 5.1 Lead received / assigned

Required outcomes:

- lead exists,
- valid owner/assignment,
- first-response SLA active when applicable,
- source and attribution retained,
- next action visible.

System responsibilities:

- calculate/retain first-response SLA,
- show ownership,
- show lead quality/score,
- log meaningful events,
- expose communication and follow-up without forcing navigation away from the deal context.

### 5.2 Qualified

A lead may become an opportunity only when qualification is credible.

Minimum qualification dimensions:

- identifiable customer/contact,
- real business need/problem,
- service relevance / ProFox capability fit,
- reasonable project intent,
- owner,
- next action.

Do not treat a generic note such as `needs a website` as complete qualification when deeper information is required by the chosen service.

### 5.3 Meeting Scheduled

Existing hard rule to preserve:

- an appropriate `sales_meetings` record must exist in Scheduled/Rescheduled state.

Before the meeting, require a Meeting Prep state that covers:

- known customer/business facts reviewed,
- known information not to ask again,
- missing discovery information identified,
- meeting objective defined,
- intended advance/commitment defined,
- major hypotheses clearly labeled as hypotheses.

The meeting may still occur if some research is unavailable, but the system should display the prep quality and any missing preparation.

### 5.4 Requirements Confirmed

This stage must become significantly stricter than a single `requirements_summary` field.

Required dimensions should include, as applicable:

- business/context,
- primary problem,
- business impact/implication,
- desired outcome,
- target audience/users,
- service/package need,
- functional scope,
- content state,
- brand/asset state,
- integrations,
- technical constraints,
- timeline and reason,
- budget/commercial range where applicable,
- decision authority/process,
- package-fit assessment,
- open assumptions,
- exclusions/dependencies,
- outstanding validations,
- next step.

A dimension can be explicitly `Not applicable`, `Awaiting client`, or `Requires specialist validation`, but the gate evaluator must understand the consequence of that state.

### 5.5 Quotation Sent

Existing hard rule to preserve:

- an approved/sent quotation must exist before the opportunity enters Quotation Sent.

Add a **Proposal Readiness** gate before a final quotation is sent.

Proposal Readiness evaluates:

- discovery completeness,
- scope completeness,
- package fit,
- technical validation,
- commercial validation,
- decision process,
- required approvals,
- promises vs quotation scope,
- assumptions/exclusions,
- timeline feasibility.

A quotation may be drafted while readiness is incomplete, but a production/client-facing final send must be blocked by unresolved hard blockers.

### 5.6 Negotiation / Decision Pending

Require:

- last meaningful customer interaction,
- objection/decision status when known,
- next step,
- owner,
- due date,
- any revised commercial exception routed for approval.

### 5.7 Awaiting Advance Payment

Existing hard rule to preserve:

- customer acceptance of the quotation is required before entering this stage.

The accepted quotation is the authoritative commercial commitment for the deal.

### 5.8 Won

Existing hard rule to preserve:

- only Admin-controlled payment verification may create Won,
- verified Advance or Full Payment is required.

Do not expose any client-side method that can directly mark an opportunity Won.

### 5.9 Post-sale handoff

Won does not mean Sales data is automatically adequate for Delivery.

The final Sales-to-Delivery handoff must aggregate authoritative information from:

- confirmed Sales discovery/requirements,
- accepted quotation snapshot,
- verified payment,
- client onboarding,
- technical validations,
- promises,
- assumptions,
- exclusions,
- dependencies.

Delivery must be able to:

- Accept handoff
- Return to Sales with explicit missing information

Sales retains responsibility for the returned handoff until acceptance.

---

## 6. Discovery information model

Do not rely only on long free-text notes.

Free-text context is useful, but business-critical facts should be queryable and traceable.

### 6.1 Recommended structure

Implementation may evolve the exact table names, but the data model must support these concepts:

#### Playbook definition

A configurable definition of questions/requirements by lifecycle stage, service/product type, complexity, and condition.

Possible table/model:

- `sales_playbook_definitions`
- `sales_playbook_versions`

Important properties:

- version,
- active state,
- section,
- field/question key,
- lifecycle applicability,
- package/product applicability,
- conditional visibility,
- completion policy,
- blocking severity,
- escalation rule,
- evidence requirements.

#### Discovery responses

Structured answers associated with the lead/opportunity/meeting.

Possible table/model:

- `sales_discovery_responses`

Fields/concepts:

- opportunity/lead/meeting reference,
- question/requirement key,
- value,
- state (`confirmed`, `observation`, `hypothesis`, `awaiting_client`, `requires_validation`, `not_applicable`),
- source,
- source meeting/event,
- captured by,
- captured at,
- confirmed at/by where appropriate,
- last changed at.

#### Requirement/scope records

Complex scope should use structured objects, not only prose.

Possible model:

- `sales_requirements`
- `sales_scope_items`

Requirement categories may include:

- page/content,
- form,
- CMS,
- e-commerce,
- booking,
- authentication,
- user role,
- dashboard,
- payment,
- integration,
- automation,
- migration,
- language,
- analytics/tracking,
- SEO,
- accessibility,
- custom backend,
- training/handover.

Each requirement should support:

- description,
- business purpose,
- priority,
- confirmed state,
- standard vs custom classification,
- package/include status,
- technical validation state,
- quotation inclusion state,
- source/evidence.

#### Escalations / validations

Possible model:

- `sales_escalations`
- `sales_validations`

Support:

- type (`technical`, `commercial`, `timeline`, `compliance`, `scope`, other),
- requested by,
- assigned reviewer/team,
- question/context,
- status,
- decision,
- approved constraints,
- rejection/rework reason,
- timestamps,
- related requirement/quotation/opportunity.

#### Promises

Possible model:

- `sales_promises`

Each material promise should support:

- promise text,
- source/evidence,
- seller,
- date,
- delivery validation state,
- quotation inclusion state,
- approved by where needed,
- blocker status.

#### Assumptions, exclusions, dependencies

Possible model:

- `sales_scope_conditions`

Types:

- assumption,
- exclusion,
- dependency.

Each should be traceable into proposal/handoff when material.

#### Gate evaluations

Possible model:

- `sales_gate_evaluations`

Store enough history to audit:

- gate,
- evaluated entity,
- result (`pass`, `warning`, `blocked`),
- reasons,
- evaluated at,
- evaluator/version,
- override metadata when applicable.

### 6.2 Avoid one giant JSON-only record

Existing flexible JSON such as `qualification_data` may be used for transitional/auxiliary information, but critical approvals, promises, validations, requirements, and gate outcomes should be durable, queryable, and auditable.

---

## 7. Discovery state model

For important facts, use an explicit certainty/source model.

Recommended statuses:

| State | Meaning | Can count as completed? | May still block progression? |
| --- | --- | ---: | ---: |
| Confirmed by client | Client explicitly confirmed it | Yes | Usually no |
| Seller observation | Seller observed it | Yes for observational fields | Sometimes |
| Seller hypothesis | Unverified idea | No for client-fact requirements | Yes |
| Awaiting client | Asked, answer pending | Data-entry yes | Yes when required for decision |
| Requires specialist validation | Seller cannot safely confirm | Data-entry yes | Yes until review completes |
| Not applicable | Legitimately irrelevant | Yes | No |

Never convert hypothesis into confirmed fact automatically.

---

## 8. SPIN-aligned discovery behavior

Meeting Prep and Meeting Management should support consultative discovery without turning the conversation into a rigid questionnaire.

Use the following structure where relevant:

- Situation: understand only the context not already known.
- Problem: identify the real problem/friction.
- Implication: understand the consequence/business impact.
- Need-payoff / desired outcome: understand the value of solving it.
- Advance: end the meeting with a concrete next commitment/action.

UI guidance must favor natural sections and contextual prompts over forcing the seller to read a script word-for-word.

Before the meeting, prefill known facts and show `Do not ask again` information where appropriate.

---

## 9. Complex-deal qualification

Do not force enterprise qualification on every small project.

For large Growth, Scale, Custom, or other sufficiently complex opportunities, activate deeper qualification such as:

- measurable business value / metrics,
- economic buyer,
- decision criteria,
- decision process,
- paper/procurement/legal process,
- business pain,
- internal champion,
- competition/alternatives/status quo.

The activation rule should be configurable based on product type, expected value, scope complexity, or explicit admin policy.

---

## 10. Package-fit engine

Package recommendation must evaluate requirements, not only page count or price.

### 10.1 Authoritative package data

Use `sales_products` as the current commercial source of truth for:

- product/package name,
- active state,
- product type,
- price mode/base price,
- approved scope,
- technology guidance,
- manager approval requirement,
- standard payment terms,
- payment schedule,
- client expectations,
- delivery duration/assessment rule,
- public/package metadata.

### 10.2 Package mismatch behavior

Example:

A customer requests five pages, which might initially resemble a Launch project, but also requires:

- authenticated customer login,
- dashboard,
- recurring subscription payments,
- custom API integration.

The system must not recommend a basic package based only on page count. It should produce a mismatch/complexity warning and require appropriate validation or a more suitable product path.

### 10.3 Suggested evaluation output

```text
Recommended package: Growth
Confidence: Medium

Mismatch / escalation triggers:
- Custom API requirement
- Authenticated portal requirement

Required before proposal:
- Technical validation
```

Package-fit output is guidance until the relevant SOP gates/approvals validate it.

---

## 11. Sales discovery vs onboarding collection

Every information requirement should be classified by when it is actually needed.

Recommended phases:

- Sales discovery required
- Quote required
- Post-sale onboarding required
- Delivery-stage required

Examples:

Sales discovery:

- Does the client own the domain?

Onboarding:

- Authorized DNS access.

Sales discovery:

- Is HubSpot integration required?

Onboarding/Delivery:

- Secure HubSpot authorization/access.

Sales discovery:

- Are brand guidelines available?

Onboarding:

- Upload the actual approved brand files.

Do not force sellers to collect operational credentials or all delivery assets during Sales.

---

## 12. Escalation engine

The system must detect and route uncertainty instead of relying on seller memory.

Examples of escalation triggers:

### Technical

- custom API,
- custom authentication,
- complex user roles/permissions,
- portal/dashboard,
- data migration,
- payment/subscription complexity,
- unusual infrastructure,
- high-risk integration,
- unknown feasibility.

### Compliance / risk

- explicit regulatory/compliance requirement,
- contractual security requirement,
- accessibility commitment outside approved standard,
- sensitive-data architecture uncertainty.

### Timeline

- requested date conflicts with current catalog delivery guidance,
- accelerated delivery promise,
- material dependency not under ProFox control.

### Commercial

- nonstandard discount,
- nonstandard payment schedule,
- nonstandard scope inclusion,
- unusual guarantee/commitment,
- custom pricing exception.

### Escalation behavior

When triggered, the system should:

1. create the review/escalation record,
2. identify why review is required,
3. route to the correct reviewer,
4. show status in the opportunity,
5. block only the appropriate downstream gate,
6. preserve reviewer decision and constraints,
7. surface approved constraints in quotation/handoff.

---

## 13. Enforcement severity

Use three enforcement levels.

### Green — guidance

Helpful but non-blocking.

Example: competitor information not yet captured.

### Amber — incomplete/warning

Seller may continue working, but a later gate may remain unavailable.

Example: economic buyer unknown while early discovery continues.

### Red — hard block

Server must reject the protected transition/action.

Examples:

- no meeting exists before Meeting Scheduled,
- required discovery not adequate before Requirements Confirmed,
- unresolved custom technical requirement before final quotation,
- quotation not accepted before Awaiting Advance Payment,
- verified payment absent before Won,
- mandatory handoff information incomplete.

---

## 14. Proposal Readiness engine

Create a deterministic readiness evaluator before a client-facing final quotation is sent.

Suggested dimensions:

- Business/context
- Problem
- Business impact
- Desired outcome
- Audience/users
- Scope
- Package fit
- Technical validation
- Commercial validation
- Timeline
- Decision process
- Assumptions/exclusions
- Promise coverage
- Next step

Example UI:

```text
Proposal Readiness: 91%
Status: BLOCKED

Business: 100%
Problem: 100%
Outcome: 100%
Scope: 92%
Package fit: 100%
Technical validation: BLOCKED
Decision process: 80%

Blocker:
HubSpot custom API requirement has not been classified or approved.

Action:
Request Technical Review
```

### Readiness calculation rule

A numerical percentage is informative only. A 95% score must still be `BLOCKED` if any hard-block rule is unresolved.

---

## 15. Quotation generation and snapshot rules

Quotation creation should consume confirmed/approved Sales facts where possible:

1. confirmed client need,
2. confirmed requirements,
3. package/product,
4. add-ons,
5. scope,
6. assumptions,
7. exclusions,
8. dependencies,
9. timeline guidance/approved exception,
10. payment schedule,
11. client responsibilities,
12. approvals.

The seller should not manually retype standard package inclusions from memory.

### Immutable historical snapshot

At quotation send/acceptance, retain the relevant historical commercial snapshot, including where applicable:

- product code,
- product name,
- package version/reference,
- quoted price,
- item descriptions,
- scope/inclusions,
- add-ons,
- exclusions,
- assumptions,
- timeline assumption,
- payment schedule,
- client responsibilities,
- required approvals.

Current catalog changes affect future guidance, not old agreements.

---

## 16. Promise Register

A material promise made during Sales must not disappear into chat or meeting notes.

Examples:

- migration quantity included,
- fixed launch date,
- special integration,
- special support period,
- custom deliverable.

Each promise should record:

- promise,
- opportunity,
- source/evidence,
- seller,
- timestamp,
- delivery/technical validation where applicable,
- quotation coverage,
- approval state,
- blocker state.

If a material promise is not represented in the accepted scope or explicitly approved, it must create a warning/blocker before handoff.

---

## 17. Assumptions, exclusions, and dependencies

These must be explicit where material.

Examples:

**Assumption:** Client provides final photography.  
**Exclusion:** Photography production is not included.  
**Dependency:** Client provides authorized API access before integration work begins.

Material items should flow into quotation/handoff automatically or be selectable for inclusion based on approved business rules.

---

## 18. Meeting completion requirements

A sales meeting should not be considered operationally complete until the seller records the outcome.

At minimum, capture:

- meeting outcome,
- what changed/new information,
- problems/needs discovered,
- important requirements,
- open questions,
- decision-maker information where relevant,
- commercial/timeline notes where relevant,
- next step,
- next-step owner,
- follow-up date/timing where applicable.

Reuse existing `sales_meetings` fields such as requirements summary, problems identified, decision makers, commercial notes, timeline notes, next step, follow-up time, customer summary, and customer next-step fields where they are appropriate. Extend rather than duplicate.

---

## 19. Next-action discipline

Every active opportunity must expose one meaningful next action.

The health engine should continue to identify conditions such as:

- no next activity,
- follow-up overdue,
- stalled deal,
- SLA risk,
- high-value inactivity.

After a meaningful meeting, either:

- create/confirm a next action, or
- explicitly close/disqualify the deal, or
- represent a legitimate waiting state with a planned review date.

Do not allow `we will follow up sometime` as a completed process state.

---

## 20. AI assistance rules

AI may assist with:

- summarizing history,
- suggesting discovery areas,
- drafting a meeting recap,
- drafting a follow-up message,
- highlighting missing information,
- explaining package mismatches,
- preparing a handoff summary.

AI must not:

- fabricate client facts,
- fabricate budget/authority/timeline,
- mark client confirmation without human confirmation/evidence,
- approve technical feasibility,
- approve commercial exceptions,
- bypass server gates,
- create guarantees outside approved catalog/quotation terms.

Every AI-generated operational value that affects a gate must require appropriate human confirmation or trusted deterministic evidence.

---

## 21. Sales-to-Delivery handoff contract

The handoff should contain a consolidated view of:

- client/business,
- why the client bought,
- original pain/problem,
- desired outcome,
- target audience/users,
- confirmed requirements,
- accepted package/products,
- add-ons,
- accepted commercial terms,
- explicit exclusions,
- assumptions,
- dependencies,
- material promises,
- approved technical constraints,
- timeline commitments/assumptions,
- client responsibilities,
- onboarding status,
- verified payment status,
- outstanding delivery dependencies.

Delivery actions:

- **Accept Handoff**
- **Return to Sales** with structured reason/missing data

A returned handoff must remain visible to Sales and management until resolved.

---

## 22. Manager exception workspace

Managers should manage exceptions, not manually inspect every normal deal.

Provide/extend an exception view for conditions such as:

- proposal-readiness blockers,
- technical reviews pending,
- timeline exceptions,
- discount/commercial approvals,
- discovery meetings missing close-out,
- opportunities missing decision authority,
- deals with no next action,
- handoffs returned by Delivery,
- material promises not represented in quote,
- repeated SOP overrides.

---

## 23. Seller quality and performance

Do not evaluate sellers only on revenue/win rate.

Where data is sufficient, measure quality indicators such as:

- first-response SLA,
- discovery completeness,
- proposal-readiness quality,
- first-pass handoff acceptance,
- missing-information rate,
- post-sale scope-change rate attributable to Sales,
- unauthorized promise incidents,
- discount/exception frequency,
- next-action discipline,
- client expectation disputes,
- revenue/win rate/deal value.

The goal is quality revenue and clean delivery, not merely closed deals.

---

## 24. Certification and permissions

The Sales Academy/certification system may be connected to permitted deal complexity.

Example policy model:

- New Seller: supervised/simple opportunities
- Launch Certified: independent Launch handling
- Growth Certified: Growth handling
- Scale Certified: Scale qualification with escalation rules
- Custom Qualification Certified: may qualify Custom but cannot make unapproved technical commitments

Exact certification rules must remain configurable/admin-controlled and must not create hidden privilege escalation.

---

## 25. UI requirements

### 25.1 Keep the seller in context

Lead/opportunity work should remain drawer/panel/workspace based where possible. Avoid unnecessary full-page navigation that causes the seller to lose deal context.

### 25.2 Opportunity SOP summary

Provide a compact summary showing:

- stage,
- completeness/readiness,
- blockers,
- warnings,
- pending reviews,
- next action.

### 25.3 Section-based discovery

Use sections such as:

- Business
- Current situation
- Problem
- Impact
- Desired outcome
- Audience
- Requirements
- Commercial
- Decision process
- Technical review

Do not present one massive form.

### 25.4 Explain blockers

Never display only `Incomplete`.

Preferred behavior:

```text
Cannot move to Requirements Confirmed.

Missing or unresolved:
- Primary business problem
- Final decision maker
- Target launch reason
- HubSpot integration validation

Next recommended action:
Request HubSpot technical review
```

### 25.5 Preserve existing design policies

All UI work must follow `AGENTS.md` and `docs/UI_ICON_POLICY.md`, including the system-wide prohibited sparkle/glint icon rule.

---

## 26. Security and RLS requirements

New tables/RPCs must follow the repository's existing Supabase security posture.

Requirements:

- RLS enabled on new business tables,
- least-privilege policies,
- seller access scoped to permitted leads/opportunities,
- manager/admin visibility according to existing role helpers,
- specialist reviewers only see what their role requires,
- client users do not receive internal notes/assumptions/reviews unless explicitly intended,
- privileged writes use trusted backend/RPC patterns,
- no service-role secret in browser code,
- SECURITY DEFINER functions must use safe `search_path` and explicit authorization checks,
- sensitive internal evaluation metadata must not leak through public/customer RPCs.

Do not solve access problems by broadly opening table policies.

---

## 27. Audit requirements

Important lifecycle actions should be auditable, including:

- stage change,
- discovery confirmation/change,
- package-fit decision,
- escalation request/decision,
- manager override,
- quotation readiness result,
- promise creation/change,
- quotation send/acceptance,
- payment verification,
- handoff send/accept/return.

Use existing CRM event/timeline infrastructure where appropriate rather than inventing a disconnected activity log.

---

## 28. Configuration and versioning

Do not hard-code the entire SOP into React components.

At minimum, configurable/versioned server-side data should control:

- playbook requirements,
- gate rules/severity,
- package applicability,
- escalation triggers,
- manager approval requirements,
- complexity thresholds,
- active policy version.

A developer should be able to update a rule without rewriting many screens.

When a material SOP configuration changes, historical decisions should remain interpretable. Gate evaluations and quotation snapshots should retain enough version/reference data to explain which rule/catalog state applied at the time.

---

## 29. Suggested implementation sequence

Implement in controlled phases. Do not attempt to replace every Sales screen simultaneously.

### Phase 1 — SOP data foundation

- define playbook/gate model,
- create migrations,
- add RLS/security,
- implement discovery state model,
- implement structured requirements,
- implement gate evaluator,
- add audit events.

### Phase 2 — Lead / Meeting Prep

- surface SOP status in Lead/Opportunity drawers,
- meeting prep summary,
- known vs missing information,
- intended meeting advance.

### Phase 3 — Guided Discovery

- section-based Meeting Management,
- structured responses,
- meeting close-out,
- next-action enforcement.

### Phase 4 — Package Fit + Escalation

- consume live `sales_products`,
- detect package mismatches,
- create technical/commercial/timeline review workflow,
- manager/specialist review queue.

### Phase 5 — Proposal Readiness + Quotation

- deterministic readiness evaluator,
- block final send on hard blockers,
- generate/use confirmed scope,
- preserve immutable quotation snapshot.

### Phase 6 — Promise / Scope Conditions

- promise register,
- assumptions,
- exclusions,
- dependencies,
- quotation/handoff coverage checks.

### Phase 7 — Handoff + Quality

- consolidate Sales package,
- Delivery accept/return,
- exception dashboard,
- Seller quality metrics.

### Phase 8 — Academy/certification integration

- package/complexity certification rules,
- permission checks where approved by product policy.

---

## 30. Required automated tests

Implementation is incomplete without tests.

### 30.1 Database / RPC tests

Test at minimum:

- seller cannot move another seller's opportunity,
- invalid pipeline transition rejected,
- required meeting enforced,
- discovery hard blocker rejected,
- unresolved required validation blocks protected action,
- accepted quotation required before Awaiting Advance Payment,
- verified payment required before Won,
- non-admin seller cannot force Won,
- manager override requires authorization and reason,
- RLS prevents cross-scope access,
- client/public roles cannot access internal Sales records.

### 30.2 Package/catalog tests

- package recommendation reads live catalog,
- inactive product not recommended,
- custom/high-complexity requirements create mismatch/escalation,
- historical quotation snapshot does not change after catalog edits.

### 30.3 UI tests

- seller sees blocker reasons,
- seller sees next recommended action,
- progressive disclosure works,
- discovery states can be represented without fake values,
- meeting cannot be operationally completed without required close-out fields,
- pending specialist review is visible,
- package mismatch is visible,
- proposal readiness displays hard blocker independent of numeric score.

### 30.4 End-to-end scenarios

At minimum test:

1. simple Launch-type deal through payment and handoff,
2. Growth-type deal with normal integrations,
3. Scale/Custom deal requiring technical review,
4. commercial exception requiring approval,
5. accelerated timeline requiring approval,
6. rejected quotation/lost deal,
7. handoff returned by Delivery,
8. catalog changed after an old quotation was sent.

Use existing repository security, typecheck, unit, Playwright, readiness, and production validation commands as applicable.

---

## 31. Definition of Done

A feature is **not** complete merely because the new UI renders.

For each implemented SOP module, Definition of Done requires:

- authoritative data source identified,
- no unnecessary duplicate source of truth,
- migration checked into `supabase/migrations`,
- RLS/policies reviewed,
- backend/RPC authorization enforced,
- frontend UX implemented,
- blocker reasons understandable,
- audit trail implemented,
- tests added,
- typecheck/lint/relevant test suites pass,
- historical behavior considered,
- mobile/responsive behavior checked,
- role behavior checked,
- no hard-coded commercial values that belong in `sales_products`,
- documentation updated when behavior differs from this specification.

---

## 32. Developer implementation checklist

Before opening a PR that touches the SOP workflow, verify every applicable item:

- [ ] Read this document completely.
- [ ] Read `docs/seller-command-center-source-of-truth.md`.
- [ ] Read `docs/UI_ICON_POLICY.md` for UI work.
- [ ] Reused existing CRM/Sales records where an authoritative record already exists.
- [ ] Did not hard-code package price/scope/timeline that belongs to Sales Catalog.
- [ ] Added/updated server-side gate enforcement where the rule is critical.
- [ ] Added a clear blocker reason and next action in the UI.
- [ ] Supported unknown/awaiting/validation states without encouraging fabricated values.
- [ ] Preserved seller ownership and role boundaries.
- [ ] Added RLS/policy protections for new tables.
- [ ] Added audit/event history for material decisions.
- [ ] Connected package logic to `sales_products`.
- [ ] Preserved quotation historical snapshots.
- [ ] Added required escalation/approval path.
- [ ] Added or preserved next-action discipline.
- [ ] Considered promises, assumptions, exclusions, and dependencies.
- [ ] Considered Sales-to-Delivery handoff impact.
- [ ] Added unit/database/security/E2E tests as appropriate.
- [ ] Ran applicable repository checks before completion.

---

## 33. Prohibited shortcuts

Do not:

- add only a static SOP page and call the implementation complete,
- make the SOP one giant mandatory form,
- rely on frontend-only stage blocking,
- allow sellers to bypass payment-controlled Won,
- automatically mark AI inference as client-confirmed,
- duplicate Sales Catalog pricing/scope in components,
- overwrite old quotation facts when catalog values change,
- use page count alone as package fit,
- force fake values into required fields,
- collect passwords/secrets as normal Sales discovery data,
- allow material technical uncertainty to reach final quotation without required review,
- allow material promises to disappear outside the accepted scope/handoff,
- create a parallel handoff truth that ignores quotation/payment/onboarding records,
- broad-open RLS policies to make a feature work,
- silently add an admin override without audit evidence.

---

## 34. Source-of-truth hierarchy

When information conflicts, use this hierarchy:

### Process policy

`PF-SOP-01` / this implementation specification controls the sales process and implementation behavior.

### Current commercial product truth

`sales_products` controls current approved product/package information for future/current selling.

### Individual client commercial agreement

The accepted quotation snapshot controls what the specific client purchased.

### Payment truth

Verified `payments` controls payment state and Won eligibility.

### Delivery handoff

The consolidated handoff may summarize the above sources but must not rewrite them.

---

## 35. Final implementation standard

A successful implementation should make the following statement true:

> A trained ProFox salesperson can work normally inside the CRM and follow the complete approved Sales SOP without having to remember hidden steps. The application progressively guides the seller, preserves uncertainty honestly, detects missing information, prevents unsafe progression, routes specialist/manager review, uses the live Sales Catalog, preserves historical agreements, requires verified payment for Won, and gives Delivery a complete auditable handoff.

If a developer's implementation makes the process easier to bypass, creates a competing source of truth, or hides unresolved risk, it does not satisfy this specification.

---

## 36. Implemented Part 9 — Scope Conditions + Promise Register

Part 9 is implemented as a pre-quotation integrity layer inside the existing Requirements → Proposal Readiness experience. It extends Parts 1–8 without creating a second Requirements, Package Fit, Sales Validation, Proposal Readiness, quotation, payment, or handoff authority.

### Canonical sources and new business records

Discovery and Requirements truth remains `crm_requirements`. Current package/commercial truth remains `sales_products`. Specialist review authority remains `crm_sales_validations`. Proposal Readiness remains `crm_get_sales_gate_assessment`. Client-specific quotation truth remains the existing `quotations` and `quotation_items` snapshot architecture.

Part 9 introduces exactly two canonical Sales business tables:

- `crm_sales_scope_conditions`
- `crm_sales_promises`

No separate assumption, exclusion, dependency, client-responsibility, technical-promise, timeline-promise, or commercial-promise table is introduced.

### Scope Conditions

`crm_sales_scope_conditions` supports `ASSUMPTION`, `EXCLUSION`, `DEPENDENCY`, `CLIENT_RESPONSIBILITY`, and `SCOPE_BOUNDARY` with lifecycle states `DRAFT`, `ACTIVE`, `STALE`, `RESOLVED`, `SUPERSEDED`, and `WITHDRAWN`.

A Draft may be edited in place. Material wording changes to an Active or Stale condition use a history-safe revision. Requirement-source changes mark linked Active conditions Stale and clear proposal reconciliation so outdated wording cannot silently remain current. Scope Conditions reconcile material discovery into proposal boundaries; they do not replace the source Requirement.

### Promise Register

`crm_sales_promises` supports `SCOPE`, `TECHNICAL`, `TIMELINE`, `COMMERCIAL`, `SUPPORT`, `COMPLIANCE`, `PERFORMANCE_RESULT`, and `OTHER`, with business lifecycle states `DRAFT`, `ACTIVE`, `SUPERSEDED`, and `WITHDRAWN`.

A Draft is internal preparation only. Active means ProFox actually communicated the material commitment to the client. A client request, Seller hypothesis, Package Fit recommendation, internal goal, or unspoken assumption does not automatically become a Promise. A real but unapproved Promise may be recorded truthfully and remains visible as an integrity blocker/review requirement rather than being hidden.

Active Promise attribution and audit chronology are server-controlled. `promised_by`, `promised_at`, `recorded_by`, and `recorded_at` are not trusted from browser input. Active wording is not silently rewritten; changed commitments use superseding revisions and withdrawals preserve historical wording and reason.

### Validation and quotation boundaries

Part 7 `crm_sales_validations` remains the specialist-review authority. No Promise-specific approval table exists. Part 9 surfaces current validation status, approved constraints, stale/rejected/superseded decisions, and explicit alignment conflicts without changing Requirement certainty.

Quotation-specific pricing, discount, payment-term, and other commercial approvals remain in the existing quotation-approval workflow. Part 9 does not create quotations and does not write quotation scope fields or quotation item snapshots.

### Readiness integration

The existing Part 8 `crm_get_sales_gate_assessment` remains the canonical evaluator. Proposal Readiness adds the current dimensions:

- `SCOPE_CONDITIONS_REGISTER`
- `PROMISE_REGISTER_INTEGRITY`

The quotation-dependent dimensions remain deferred and must not be falsely passed:

- `PROMISE_COVERAGE` → `NOT_YET_EVALUATED`
- `FINAL_SCOPE_RECONCILIATION` → `NOT_YET_EVALUATED`
- `QUOTATION_SNAPSHOT_COVERAGE` → `NOT_YET_EVALUATED`

`finalQuotationSendGateActive` remains `false`. Final quotation reconciliation/snapshot coverage and final send enforcement belong to Part 10.

### Trusted APIs and security

The Seller UI reads the bounded domain through `crm_get_sales_scope_commitment_workspace` and uses trusted Part 9 RPCs for Scope Condition and Promise draft/revision/lifecycle mutations and Requirement reconciliation. Both Part 9 business tables have RLS enabled. Direct authenticated table access is read-only and constrained by `crm_can_access_lead`; anonymous access is denied. Cross-Lead Opportunity, Requirement, Validation, and Meeting references are rejected server-side. Hard deletion is blocked in favor of lifecycle-preserving history. Material changes reuse `crm_write_lead_event` rather than introducing a second audit system.

### UI placement and guidance

The reusable `CRMScopeConditionsPanel` and `CRMPromiseRegisterPanel` are mounted through `CRMScopeCommitmentsWorkspace` inside the existing `CRMSalesReadinessPanel`. No new Lead Drawer tab is added. Consequential activation, revision, resolve, and withdrawal actions are explicit; Promise activation asks, “Did ProFox actually communicate this commitment to the client?” and the interface displays the safety warning: “Record what ProFox actually committed. Do not turn a client's request, your assumption, or a proposed idea into a Promise.”

Part 9 reuses `SellerGuidanceHelp` with canonical guidance for Scope Condition types/states/sources/actions, Promise types/states/sources/actions, promised-by/promised-at, unapproved/validation-required commitments, stale conditions, and future quote coverage.

### Migration lineage

Production Part 9 was applied through Supabase's native migration ledger using:

- `20260910042939_crm_sales_scope_conditions_promise_register_part_9`
- `20260910043137_crm_sales_scope_commitment_mutations_part_9`
- `20260910043416_crm_sales_scope_commitment_workspace_part_9`
- `20260910043453_crm_sales_scope_commitment_readiness_part_9`

The applied native SQL is preserved under `supabase/migrations/native-history/`. This subfolder is intentionally non-executed by the repository's legacy flat-file `scripts/migrate-production.mjs` runner so those already-applied native migrations are reviewable in source control without being re-applied.

Detailed Part 9 implementation and verification notes are maintained in `docs/crm-sales-scope-conditions-promise-register-part-9.md`.

---

## 37. Implemented Part 10A — Quotation Sales Reconciliation Foundation

Part 10A is implemented as the **non-blocking quotation-context reconciliation layer** between the current Parts 1–9 Sales truth and the existing quotation system. It does not create a second quotation editor, a duplicate proposal record, a duplicate validation authority, or a replacement CPQ approval path.

### Canonical quotation reuse

The existing `quotations` and `quotation_items` records remain the client-specific quotation authority. `sales_products` remains current commercial/catalog truth. Existing CPQ approval and quotation transition functions remain authoritative for commercial approval, send state, customer decision history, payment progression, and downstream lifecycle behavior.

Part 10A maps active Scope Conditions and active Promises to existing customer-visible quotation destinations such as `scope_summary`, `exclusions`, `client_responsibilities`, `delivery_assumptions`, `handover_support`, `terms_and_conditions`, `payment_terms`, `duration_snapshot_text`, and eligible customer-visible quotation-item content. Internal/customer note fields are not generic coverage substitutes.

### Coverage relation and review history

Part 10A introduces exactly one normalized relationship table for this missing domain relation:

- `quotation_sales_coverage`

Each current mapping belongs to one quotation and exactly one current Scope Condition or Promise version. The server derives and stores the target fingerprint, reviewer identity, and review time. Re-review creates history through `supersedes_coverage_id` rather than silently rewriting prior evidence. Read-only reconciliation does not create coverage rows.

### Deterministic reconciliation and staleness

`crm_get_quotation_sales_reconciliation` combines the existing Proposal Readiness, Package Fit, Part 9 Scope Condition/Promise integrity, validation constraints, current quotation content, and reviewed coverage mappings. It reports explicit blockers/warnings and the quotation-dependent dimensions:

- `PROMISE_COVERAGE`
- `FINAL_SCOPE_RECONCILIATION`
- `QUOTATION_SNAPSHOT_COVERAGE`

A stored `COVERED` mapping is not trusted forever. If the mapped quotation field/item changes, is removed, or no longer contains the reviewed customer-visible content, the server-derived fingerprint no longer matches and coverage becomes `STALE`. Historical delivered quotations are not fabricated/backfilled; missing old Part 10 coverage is represented as legacy/not captured.

### Snapshot preview foundation

`crm_build_quotation_sales_scope_snapshot` builds a deterministic read-only preview containing the quotation revision, Proposal Readiness, Package Fit, quoted products, exact active Scope Condition wording, exact active Promise wording, reviewed coverage mappings, approved constraints, reconciliation status, and quotation-dimension state.

The Part 10A snapshot is deliberately returned with `persisted = false`. Part 10A does not choose or activate the final immutable send-time persistence point.

### Security and authority

`quotation_sales_coverage` has RLS enabled and does not grant direct anonymous or authenticated table mutation/read authority. Trusted Part 10A RPCs use fixed safe `search_path`, derive the actor from `auth.uid()`, enforce quotation ownership/admin authority and quotation → opportunity → Lead lineage, and reject cross-Lead/cross-quotation evidence. The internal target-evidence helper is not exposed as a browser RPC.

Coverage means the current Sales truth is represented in an eligible customer-visible quotation destination. It does **not** grant technical approval, commercial approval, client acceptance, or AI authority. Part 7 validations and existing quotation/CPQ approvals remain canonical.

### UI placement

The reusable **Sales Reconciliation** panel is mounted in the existing `QuotationWorkspace` around the canonical `QuotationWorkspaceBase`; it does not add a Lead Drawer tab or create a competing quotation editor. The panel surfaces Proposal Readiness, quoted-package alignment, Scope Condition coverage, Promise coverage, approved constraints, exact blockers/warnings, eligible targets, stale coverage, and snapshot readiness.

### Non-blocking send boundary

At the Part 10A release checkpoint, Part 10A intentionally kept:

`finalQuotationSendGateActive = false`

Part 10A itself does not modify `send_quotation_professional`, `update_quotation_atomic` Sent behavior, `protect_quotation_transition`, or `get_quotation_cpq_summary.readiness.readyToSend` to enforce Sales reconciliation. Final send enforcement and the minimal immutable persisted Sales-scope snapshot were deliberately deferred to Part 10B and were subsequently activated after authenticated production acceptance.

### Migration lineage and verification record

Production Part 10A was applied through Supabase's native migration ledger using:

- `20260910124932_crm_sales_quotation_reconciliation_part10a`
- `20260910125143_crm_sales_quotation_reconciliation_assessment_part10a`

The applied native SQL is preserved under `supabase/migrations/native-history/`. The dedicated Part 10A acceptance/security suite contains exactly 169 checks and is wired into both `npm test` and the normal production build path.

Detailed implementation, production verification, release SHAs, security findings, deployment evidence, and the explicit Part 10B prerequisite are maintained in `docs/crm-sales-quotation-reconciliation-part-10a.md`.

---

## 38. Implemented Part 10B — Immutable Send-Time Sales Snapshot + Universal Quotation Send Gate

Part 10B is **implemented, production-activated and verified complete**. The existing `quotations` / `quotation_items` system remains canonical, Part 10A remains the authoritative Sales reconciliation engine, and no duplicate quotation, approval, product, Promise, Scope Condition, validation, readiness or handoff system was introduced.

### Universal Send invariant

The shared server assertion is `crm_assert_quotation_send_ready(uuid)`. It consumes existing CPQ readiness and the canonical Part 10A reconciliation result rather than re-coding those rules. The protected `Sent` transition in `protect_quotation_transition()` evaluates the Part 10B invariant before the historical Admin and `profox.quotation_atomic_rpc` early-return paths, so those paths cannot silently bypass the final Sales rule when the gate is active. Direct INSERT already marked Sent remains rejected by the existing direct-Sent insert protection.

`send_quotation_professional(...)` remains the canonical customer-send workflow. `update_quotation_atomic(...)` keeps its established role but its Approved → Sent path is covered by the central transition protection. `resend_quotation_professional(...)` operates only on an already-Sent quotation and does not rebuild the historical snapshot.

### Minimal immutable quotation snapshot

No new Part 10B business table was created. The existing `quotations` record received only:

- `sales_scope_snapshot jsonb`
- `sales_scope_snapshot_at timestamptz`
- `sales_scope_snapshot_schema_version integer`

The snapshot is server-built and, once captured, normal runtime callers cannot set, clear or rewrite the snapshot fields. The correction path remains `create_quotation_revision(...)`. Historical Sent quotations are not backfilled from present-day CRM state.

The snapshot schema version is `2`. It contains quotation/revision identity, Lead/opportunity reference, policy/evaluator references, Proposal Readiness, Package Fit, quoted item/catalog snapshot references, current Active Scope Conditions and Promises, coverage mappings/fingerprints, relevant specialist validation/approved-constraint references, final reconciliation dimensions, warnings and send-time evidence. Seller-private `sales_products.seller_guidance` is not copied into the client-specific Sales-scope snapshot; the newer quotation-item `catalog_snapshot` / `catalog_version_snapshot` fields remain the canonical Catalog evidence.

### Atomicity and immutability

When the final gate is active, successful `OLD.status <> 'Sent' AND NEW.status='Sent'` handling rejects caller-authored snapshot mutation and same-statement material quotation changes, asserts current send readiness, builds the snapshot, writes snapshot/time/schema onto `NEW`, and only then permits the transaction to continue. Assertion or snapshot failure aborts the Sent transition, so existing customer-send side effects do not survive a blocked transaction.

### CPQ and UI integration

`get_quotation_cpq_summary(...)` was evolved additively. When the policy is staged, legacy CPQ `readyToSend` behavior is preserved. When active, `readyToSend` requires both existing CPQ readiness and current Sales reconciliation readiness, and exact Sales blockers are appended to the established readiness response.

The existing `QuotationSalesReconciliationPanel` was evolved in place. It shows ACTIVE versus STAGED gate status, exact blockers and remediation, Proposal Readiness, Scope Reconciliation, Promise Coverage, Package alignment, Ready-to-freeze state, and immutable snapshot metadata for delivered quotations. It does not expose raw snapshot JSON or create a second quotation editor. Existing coverage review and Open/Edit target actions remain the resolution path. `SellerGuidanceHelp` is reused for Part 10B explanations/actions.

### Security and production data safety

The assertion/capture primitives are internal server primitives: direct execution is revoked from `public`, `anon` and `authenticated` and retained for `service_role`. Snapshot fields are server-controlled even for Admin/atomic callers. No service-role secret is introduced into browser code.

Historical pre-activation verification on 2026-09-16 showed:

- policy key: `crm_quotation_sales_reconciliation_policy_v1`
- policy version: `2`
- snapshot schema version: `2`
- `finalQuotationSendGateActive=false`
- Scope Conditions: `0`
- Promises: `0`
- quotation Sales coverage rows: `0`
- captured Part 10B snapshots: `0`
- two pre-existing Sent quotations remain legacy/no-Part10B-snapshot
- authenticated execution of assertion/capture: `false`
- service-role execution of assertion/capture: `true`

No fake production client data or historical snapshot backfill was introduced.

### Production migrations

The Part 10B production changes were applied additively through:

- `crm_sales_final_quotation_send_gate_part10b_foundation`
- `crm_sales_final_send_snapshot_forge_hardening`
- `crm_sales_final_send_assertion_privilege_hardening`

Repository migration files are maintained under `supabase/migrations/` and the dedicated Part 10B contract/security suite is wired into both `npm test` and `npm run build`.

### Final production activation and closure

The earlier staged `finalQuotationSendGateActive=false` state and its CI/deployment blockers are preserved as dated rollout history in the Part 10B release records. Those prerequisites were subsequently satisfied: PR #117 and PR #118 merged, authenticated Seller/Admin production remediation QA passed, trusted final-main CI run `35450540745` passed on a real runner, and production deployment run `35450651806` passed for final main `d2b6e2a54c7e0edbad11c55127d5e4dd42311041`.

Activation migration `20260919142410_activate_part10b_final_quotation_send_gate` was applied through the canonical migration runner with checksum `77712b2f7c2918684e39971c37311f7228c5377b817e9d0df23084edd1bc236c`. Current production is:

- `finalQuotationSendGateActive=true`;
- `policyVersion=2`;
- `snapshotSchemaVersion=2`;
- one shared server-side Sales Send assertion remains authoritative;
- the universal Sent-transition invariant executes before Admin and atomic-RPC early returns;
- immutable snapshot capture remains server-built and occurs only on a successful Send transition;
- existing quotation approval remains the separate quote-specific commercial authority;
- Part 10A reconciliation remains authoritative;
- historical Sent quotations were not backfilled;
- `create_quotation_revision(...)` remains the correction path;
- no fake production data was created and no real customer quotation was sent for QA.

**PART 10B: COMPLETE. PRODUCTION SEND GATE: ACTIVE. PART 11: NOT STARTED.**

Detailed implementation, security, production verification, historical rollout evidence and final activation evidence are maintained in `docs/crm-sales-final-quotation-send-gate-part-10b.md` and `docs/crm-sales-final-quotation-send-gate-part-10b-release.md`.


---

## 39. Part 11 — Negotiation / Decision Pending + Next-Action Discipline

Part 11 extends the existing ProFox CRM, Pipeline, activity execution, communication, quotation and approval architecture. It does not create a second negotiation application, follow-up/task system, customer timeline, quotation workflow or commercial approval authority.

### Canonical current-state model

- Current opportunity/lifecycle state remains `crm_opportunities`.
- Current next action remains the earliest valid `Scheduled` `crm_activities` row explicitly linked to the opportunity.
- Next-action owner remains `crm_activities.assigned_to`.
- Next-action due date remains `crm_activities.due_at`.
- Outcomes, completion, rescheduling and cancellation reuse the existing CRM Activity lifecycle fields and trusted activity RPCs.
- Audit history remains `crm_lead_events` through `crm_write_lead_event(...)`.
- Last meaningful customer interaction is derived from existing customer-facing communication/activity/meeting evidence; it is not stored as manually editable duplicate truth.
- Customer communication remains the existing unified communication architecture.
- Customer acceptance remains the canonical quotation/customer-decision workflow.
- Payment and Won authority are unchanged.

### Minimal Negotiation state

The existing opportunity record is extended only with the structured current-state facts that were genuinely missing:

- `decision_status`
- `primary_objection_category`
- `waiting_on`
- `decision_expected_at`
- server-derived decision audit actor/time

Existing rows are not backfilled with guessed decision state, objections, waiting state or next actions. Historical null Part 11 state remains truthful.

Controlled decision semantics distinguish states such as awaiting client response, client reviewing, questions/objections, revision requested, commercial review required, internal client approval, confirmed decision date and client pause. Silence is not automatically treated as a price/budget objection.

### Server-authoritative Negotiation gate

The existing `crm_transition_opportunity(...)` remains the only Pipeline transition authority. Entry into `Negotiation / Decision Pending` additionally requires:

1. a canonical sent quotation context;
2. structured decision state;
3. objection category only where the selected status requires it;
4. an opportunity-linked `Scheduled` CRM Activity;
5. an authorized assigned owner;
6. a meaningful action subject;
7. a future due date.

Forward/backward transition permissions continue to come from canonical Pipeline configuration. Completed, Cancelled, unrelated Lead or cross-opportunity activities cannot satisfy the Negotiation gate. Precise blocker messages tell the Seller what must be resolved.

### Activity discipline and interaction truth

Part 11 adds no new activity type because the existing configuration already includes `Quotation Follow-Up` and the activity lifecycle already supports outcomes, original due date, reschedule count/reason/actor, cancellation reason and next-activity lineage.

A narrow opportunity-next-action scheduler creates the action in `crm_activities` with the opportunity owner and canonical activity configuration. Completion/reschedule/cancel remain with the existing Activity Center and trusted RPCs.

The most recent meaningful customer interaction is derived from canonical events and completed customer-facing work. Internal notes, automated internal/customer reminders, page views, stage-only changes and failed contact outcomes such as No Answer/No Response/Bounced/Voicemail are not treated as meaningful customer interaction.

### Pipeline and workspace integration

The existing `crm_get_pipeline_command_center()` is extended rather than replaced. It exposes:

- derived last meaningful customer interaction;
- deterministic current next action;
- next-action owner;
- due/overdue state;
- latest completed activity outcome;
- current decision status;
- objection/waiting state;
- Negotiation attention reason.

The existing Pipeline opportunity drawer/card receives a contextual **Decision & Next Action** section for Quotation Sent and Negotiation. It surfaces truthful decision state, last meaningful interaction, current next action, owner/due/overdue state and routes activity completion/rescheduling/cancellation back to the canonical Activity Center.

Seller guidance reuses `SellerGuidanceHelp` and reinforces that Negotiation is not a parking stage, silence is not an invented objection, external waiting still needs a re-check, commercial exceptions require existing approval, customer acceptance remains quotation truth and Won remains payment controlled.

### Commercial and lifecycle boundaries

Part 11 does not approve discounts, payment terms, scope changes, guarantees or delivery exceptions. Specialist/commercial feasibility continues through `crm_sales_validations`; quote-specific commercial approval continues through the existing quotation approval/revision workflow. Revised quotations still flow through Part 10A reconciliation and the active Part 10B universal Send gate.

Part 12 payment/Won expansion, onboarding, Sales-to-Delivery handoff, Manager Exception, Academy and AI authority are explicitly outside Part 11.

### Security

Negotiation decision mutations are trusted server RPCs. Actor identity and decision timestamps come from authentication/server time. A protection trigger prevents direct rewriting of protected Part 11 fields outside the canonical RPC path. Opportunity-linked activity writes reject cross-Lead and cross-opportunity references and preserve Seller ownership scope. Security-definer functions use fixed `public, pg_temp` search paths and narrow execution grants.

### Migration and verification

Repository migration:

- `20260920123000_crm_sales_negotiation_next_action_part_11.sql`
- SHA-256: `e9b7496ef2561641d9e873534a465cc9fc6a487bcf38908348ab30ee9e9971ab`

The migration is backward compatible, nullable for historical rows, creates no fake business data, does not backfill Negotiation state, and asserts before/after that the Part 10B Send gate remains active under policy version 2 and snapshot schema version 2.

Focused regression/security coverage is maintained in:

- `tests/security/crm-sales-negotiation-next-action-part-11.test.mjs`
- `tests/security/crm-sales-negotiation-next-action-part-11-matrix.test.mjs` — exactly 60 named SOP matrix cases
- `npm run test:crm-part11`
- `npm run production:verify-part11` — read-only production release verifier wired into canonical `production:verify`

Detailed architecture, source-of-truth and release evidence is maintained in `docs/crm-sales-negotiation-next-action-part-11.md`.

### Part 11 production closure

Part 11 is **COMPLETE** in production.

Final evidence:

- merged-main SHA: `e54d022678a1eea473d61dd22990557389eb1d7d`
- trusted merged-main CI: ProFox CRM CI `#884 / 35494715173` — PASS
- final production deploy: Deploy ProFox Production `#360 / 35494800711` — PASS
- Cloudflare Worker version: `cc3681a8-e92b-4600-9671-43b7ed9abccc`
- Part 10B release verifier: `0 failure(s), 0 warning(s)`
- Part 11 release verifier: `0 failure(s)`
- migration lineage: `PENDING_NEW 0`, `BLOCKED_UNRESOLVED 0`
- authenticated Seller production UI: PASS
- authenticated Admin production UI: PASS
- Seller mobile + keyboard validation: PASS
- canonical Admin Quotation Approvals: PASS
- CRM business-data before/after equality: PASS
- final production truth after QA: opportunities `2`, activities `13`, Negotiation `0`, Part 11 decision-state rows `0`, Part 11-created activities `0`

No fake CRM customer/deal records were created to manufacture release evidence.

Part 12 is implemented and closed below. Part 13+ remains out of scope and has not started.


---

## 40. Part 12 — Awaiting Advance Payment + Verified Payment → Won + Sale Activation Integrity

Part 12 extends the existing Payment, Quotation, CRM Opportunity, Activity, Client, Commission, Project and Client Onboarding architecture. It does not create a second commercial activation system.

### Canonical authority

- Customer acceptance remains canonical quotation truth: `status='Accepted'` plus non-null `accepted_at`.
- Payment truth remains `payments`.
- Payment verification remains Admin/trusted-gateway controlled through `verify_payment_atomic(...)`.
- Won is produced only inside qualifying verified-payment processing.
- Payment Follow-Up remains canonical `crm_activities`.
- Client remains `clients`.
- Commission remains `commission_entries`.
- Delivery activation remains `projects`.
- Client onboarding remains `client_onboardings`.

### Integrity hardening

Part 12 protects direct Payment INSERT/UPDATE settlement evidence, prevents direct/manual Won, requires canonical acceptance before Awaiting Advance Payment, rejects cross-opportunity/cross-client activation conflicts, and preserves existing Project/Onboarding/Commission idempotency.

Partial payment remains `Partially Paid` and cannot create Won.

Historical Won remains historical truth; no Un-Won model is introduced.

### Derived activation model

No business table is added. The bounded staff RPCs `crm_get_sale_activation_state(uuid)` and `crm_get_sale_activation_queue()` derive accepted quotation, payment, outstanding amount, due/overdue state, external customer wait, Payment Follow-Up, exact next action, blockers, Client, Project, Onboarding and Commission state.

Seller access reuses canonical Sales CRM readiness and salesperson ownership. Team/Admin visibility reuses existing authority helpers.

### UI

Existing CRM Pipeline, opportunity drawer, Seller Command Center and Payments Manager surface the derived activation truth.

Seller has no Verify Payment control and no enabled manual Won action.

Admin verification remains in the canonical Payments workspace.

### Migration

- `20260920150000_crm_sales_payment_won_activation_part_12.sql`
- SHA-256: `ee75cd5c55250a278e2187a945cfa64f732343da08b6ecc674fb945c63375fcb`

### Tests / release gates

- focused Part 12 security tests
- exact 87-case SOP matrix
- authenticated production-QA safety contract
- `npm run test:crm-part12`
- `npm run production:verify-part12`
- `npm run production:verify-part12-ui`
- Part 12 authenticated QA is chained into the canonical production authenticated-QA deploy gate

### Part 12 production closure

The original Part 12 release completed in production, but a subsequent independent rollback-only security audit found that an authenticated Seller could directly change `payments.provider_payment_id` and `payments.paid_at` on an owned pending Payment. The probe was rolled back and changed no production business data.

Follow-up Part 12 hardening uses `20260920164600_crm_sales_payment_settlement_evidence_part_12_hardening.sql` to extend the existing `protect_payment_verification_fields()` trigger function so provider settlement identity and paid-at evidence are server-controlled outside canonical verification / trusted gateway contexts. No new business table or backfill is introduced. The follow-up passed trusted PR/main CI, canonical production migration/deploy, rollback-safe Seller verification, authenticated Seller/Admin QA, and post-deploy integrity checks.

Final evidence from the original release:
- implementation PR: `#125`
- exact PR head: `9dde884078882dc51d97b0d62e3b9c0d9a7fca08`
- trusted PR CI: ProFox CRM CI `#890 / 35499841152` — PASS
- merged-main SHA: `a15c4e87e9630d68e9f9a8d3183dc82051260214`
- trusted merged-main CI: ProFox CRM CI `#891 / 35499950557` — PASS
- production deploy: Deploy ProFox Production `#362 / 35500046940` — PASS
- Cloudflare Worker version: `0df9a0a2-6f07-447f-a18f-9d7316c3db76`
- Part 10B verifier: `0 failure(s), 0 warning(s)`
- Part 11 verifier: `0 failure(s)`
- Part 12 verifier: `0 failure(s)`
- migration lineage: `PENDING_NEW 0`, `BLOCKED_UNRESOLVED 0`
- authenticated Seller Part 12 QA: PASS
- authenticated Admin Part 12 QA: PASS
- mobile/keyboard Seller QA: PASS
- business-data immutability: PASS
- production activation integrity: PASS
- final production counts: payments `5`, verified `1`, Awaiting Advance `1`, Won `1`, clients `2`, projects `1`, onboardings `1`, commissions `1`, activities `13`

No fake production customer/deal/payment/project/onboarding records were created for Part 12 release evidence, and no real payment was verified merely for QA.

Detailed release evidence is maintained in `docs/crm-sales-payment-won-activation-part-12.md`.

Follow-up settlement-evidence closure:
- PR `#128`; exact head `c7ab82d4762d448f491ff54bb95e66ea326265de`
- trusted PR CI `#895 / 35508012546`: PASS
- merged-main SHA `8963d4ff36f2ac4ecd5fd4da3736bf87a9f12faa`
- trusted merged-main CI `#896 / 35508149468`: PASS
- production deploy `#364 / 35508215901`: PASS
- Worker version `dd6ec35a-5d4f-47cb-9acc-3071089705ee`
- hardening migration checksum `48c3d60025168ab0843fda3b9a485a4f09a62591facddefb3085a3276c5e31a7`
- production ledger `692`; latest `20260920164600`; pending `0`; blocked `0`
- Part 12 focused suite `113/113`: PASS
- full `npm test`, `npm run lint`, `npm run build`: PASS
- rollback-safe Seller direct-write probe for `provider_payment_id` / `paid_at`: BLOCKED as required
- authenticated Seller/Admin QA and business-data immutability: PASS
- Part 12 production verifier: `0 failure(s)`
- business inventory unchanged: payments `5`, verified `1`, Awaiting `1`, Won `1`, clients `2`, projects `1`, onboardings `1`, commissions `1`, activities `13`

**Part 12 is COMPLETE. Part 13 is COMPLETE. Part 14 is COMPLETE. Part 15 has not started.**


---

## 41. Part 13 — Sales-to-Delivery Handoff Acceptance / Return / Resubmission

Part 13 extends the existing Sales Handover Project stage, canonical Sales evidence, existing handoff tasks, Project Manager workspace and Seller lifecycle queue. It does not create a second commercial or delivery system.

Canonical Delivery handoff truth continues to come from structured CRM Requirements, accepted quotation snapshots, verified Payment, completed Client Onboarding, Sales Validations, active Sales Promises, active Scope Conditions, the existing Project and the existing project_tasks workflow.

A single additive lifecycle/history table, project_sales_handover_attempts, records only submit/review/version evidence. It does not copy editable Requirement, quotation, Payment, Onboarding, Promise, Validation or Scope truth.

Server-authoritative lifecycle states are NOT_SUBMITTED, SUBMITTED, RETURNED_TO_SALES, RESUBMITTED and ACCEPTED. Only the source Seller can submit/resubmit. The assigned Project Manager or Administrator can Accept/Return. Return requires structured reasons, actionable missing items and reviewer notes. Reviewed attempts are immutable.

project_get_sales_handoff_readiness(uuid) derives READY / WARNING / BLOCKED from canonical prerequisites. Hard blockers cannot be overridden by a score or frontend control. PM assignment is allowed to remain pending at Seller submission but is required for Delivery acceptance and Content activation.

The existing Sales Handover → Content stage gate now additionally requires the latest handoff attempt to be ACCEPTED and its material canonical source digest to remain current. Direct generic task completion cannot bypass submit/review authority.

The existing /admin/project-handover/:id route is expanded instead of replaced. It renders customer/business context, structured Requirements, accepted commercial agreement, timeline, Validations, Promise Register, Scope Conditions, Payment, safe Onboarding facts, outstanding dependencies, Seller notes, readiness, review history, Return remediation, Submit/Resubmit, Accept and Return controls.

Part 13 migrations:
- 20260920181000_crm_sales_delivery_handoff_part_13.sql
- 20260920181100_crm_sales_delivery_handoff_lifecycle_visibility_part_13.sql

Focused verification includes an exact 85-case specification matrix, release-readiness verifier and non-destructive authenticated production UI QA. The real production Sales Handover Project is never submitted, assigned a fake PM, accepted, returned or advanced merely for QA.

Detailed architecture and release evidence: docs/crm-sales-delivery-handoff-part-13.md

### Part 13 production closure

Part 13 completed the full trusted release chain:

- implementation PR #130; exact final head 69a00dc33f964d924d528e7853ab3113e69cb801
- trusted PR CI #907 / 35514434198: PASS
- implementation merge SHA 6e0c96304211e28c98d3f94277abff1dcb83ca47
- trusted merged-main CI #908 / 35514571045: PASS
- verifier-only production-QA heading correction PR #131; exact head 8eef062593d6d831d253126919bcb35cf748ef52
- trusted correction PR CI #909 / 35515013368: PASS
- final runtime/main SHA b3effbbbce97225bfa5145a1c60538a3037d1d82
- trusted final merged-main CI #910 / 35515772813: PASS
- final production deploy #367 / 35515862068: PASS
- Worker version ceaacc8a-c6b3-4152-a740-14b17f14046f
- core migration checksum fd9427c22e1318c479e45cbc30494004cabe4d7a014736f7ebb1c3672a2abe5e
- lifecycle visibility migration checksum 72f8edcdc0f29394f761caa4d1fdffc21723f0b2d4486e588c8cf028c95ebca0
- production ledger 694; latest 20260920181100; PENDING_NEW 0; BLOCKED_UNRESOLVED 0
- Part 10B gate remains ACTIVE at policy/schema 2/2
- exact 85-case Part 13 specification matrix retained; focused Part 13 suite 122/122 PASS
- Part 13 production release verifier: 0 failure(s)
- authenticated Seller/Admin production QA: PASS
- Seller mobile/keyboard validation: PASS
- real production Sales Handover Project remained Not Submitted/BLOCKED, PM unassigned, both handoff tasks To Do and lifecycle attempts 0
- no fake production business/handoff record and no real submit/accept/return/PM assignment/stage advance solely for QA
- final business inventory remains payments 5, verified 1, Awaiting Advance 1, Won 1, clients 2, projects 1, onboardings 1, commissions 1, activities 13

Detailed closure evidence is maintained in docs/crm-sales-delivery-handoff-part-13.md.

**PART 13 — SALES-TO-DELIVERY HANDOFF ACCEPTANCE / RETURN / RESUBMISSION: COMPLETE.**

**Part 14 is COMPLETE. Part 15 has not started.**

---

## 42. Part 14 — Manager Exception Workspace

Part 14 adds one Admin-only, read-oriented Sales manager triage workspace without introducing a second exception truth system.

### Architecture

No new exception business table is created. The existing generic Business Intelligence exception feed remains unchanged because it spans Sales, Finance, Delivery and Recruitment. Part 14 instead adds one bounded aggregate RPC:

- `crm_get_manager_exception_workspace(text,text,uuid,integer,integer)`

It is `STABLE`, `SECURITY DEFINER`, fixed-search-path, anonymous-denied and internally active-Admin authorized.

### Canonical exception sources

The aggregate derives only from existing source truth:

- Proposal Readiness → `crm_get_sales_gate_assessment(...,'PROPOSAL_READINESS')`
- Sales Validation → `crm_sales_validations` + existing reviewer eligibility
- Quotation Approval → existing approval state + reviewer authorization
- Meeting close-out → completed Sales `sales_meetings`
- Decision process → existing Proposal Readiness `DECISION_PROCESS` dimension
- Missing / overdue next action → Part 11 Pipeline Command Center / Sales Work Queue / `crm_activities`
- Stage SLA → Pipeline command-center stage age + SLA output
- Returned handoff → latest Part 13 `RETURNED_TO_SALES`
- Promise / quotation coverage → `crm_sales_promises` + `quotation_sales_coverage`
- Repeated SOP override → actual quotation override timestamps / audited CRM override events only

No exception can be manually resolved in Part 14. Deterministic source-derived keys are recomputed on every read; the exception disappears only when its authoritative source is corrected.

### Authorization / boundaries

The team workspace is Admin-only. Normal Sellers retain their existing Seller Command Center.

Part 14 does not grant quotation approval, Sales Validation, Payment verification, Won, handoff Accept/Return, Project stage transition or bypass authority. Existing source-specific authorization remains authoritative.

Part 15 Seller Quality & Performance Management is explicitly excluded.

### UI

The existing Founder Control shell gains `/admin/manager-exceptions` with:

- Total Exceptions / Blocking / Overdue / Pending Review
- type filters
- search
- Seller/owner filter
- deterministic pagination
- textual blocking/overdue states
- source status/system, owner and age
- read-only detail drawer
- safe metadata allowlist
- canonical `Open …` remediation routes

There is no generic Resolve, Ignore, Dismiss or bypass action.

### Migration / verification

Repository migration:

- `20260921110000_crm_manager_exception_workspace_part_14.sql`

Focused verification:

- `tests/security/crm-manager-exception-workspace-part-14.test.mjs`
- `tests/security/crm-manager-exception-workspace-part-14-matrix.test.mjs` — exact 84-case matrix
- `tests/security/part14-authenticated-production-ui.test.mjs`
- `npm run test:crm-part14`
- `npm run production:verify-part14`
- authenticated production QA is extended through the existing trusted Part 13 Admin/Seller session harness

A live-schema rollback probe created/exercised the RPC and Seller denial successfully, then rolled back with no production business change.

Detailed architecture and release evidence: `docs/crm-manager-exception-workspace-part-14.md`.

### Part 14 production closure

Part 14 completed the full trusted release chain:

- implementation PR #133; exact final head `477abd5cc667e9c5d77fb3fe49e2b82c677efdf4`
- trusted implementation PR CI #916 / 35594204999: PASS
- implementation merge SHA `27b9eecb10521cfd6b345c73bfe3dfce362820d7`
- trusted merged-main implementation CI #917 / 35595138177: PASS
- initial production deploy #369 / 35595342761 applied the migration and deployed the runtime successfully; its only failure was a lazy Seller-route QA timing assertion after Part 14 Admin QA had already passed
- route-readiness follow-up PR #134; exact head `e85dde752f4d2aec6a6e45b8ec016044549ed347`
- trusted follow-up PR CI #918 / 35596113750: PASS
- final runtime/main SHA `6bb2fa47f8ffd2b665cef67d53737c59b8dba4cb`
- trusted final merged-main CI #919 / 35596356718: PASS
- final production deploy #370 / 35596528183: PASS
- Worker version `957aaf4d-450e-4664-8e37-cadf61c8d21d`
- Part 14 migration checksum `625706ef2f12ebf0fd2ed3c606d4b8f6e016ca5b27a4dc8999645d15d6f5ae7f`
- production ledger 695; latest `20260921110000`; PENDING_NEW 0; BLOCKED_UNRESOLVED 0
- Part 10B gate remains ACTIVE at policy/schema 2/2
- exact 84-case Part 14 specification matrix retained
- focused Part 14 suite 122/122 PASS
- Part 14 production release verifier: 0 failure(s)
- authenticated Admin Part 14 QA: PASS with 2 real source-derived exceptions
- authenticated Seller negative-access QA: PASS
- desktop/tablet/mobile/keyboard validation: PASS
- team workspace remains Admin-only and direct Seller aggregate RPC access is rejected
- no duplicate exception business table exists
- production business immutability: PASS
- no fake Validation, quotation approval, activity, returned handoff, Promise conflict, SOP override, business record or exception record was created for QA
- final source-derived exceptions are one real `NEXT_ACTION_OVERDUE` and one real `STAGE_SLA_EXCEEDED` item
- final production inventory: leads 6, opportunities 2, activities 13, Sales meetings 5, Sales Validations 0, quotations 6, payments 5, clients 2, projects 1, Client Onboardings 1, handoff attempts 0, Sales Promises 0, Scope Conditions 0, quotation Sales coverage 0, CRM lead events 123
- general production readiness: 0 failures; 4 pre-existing broader-environment warnings outside Part 14 scope

Detailed closure evidence is maintained in `docs/crm-manager-exception-workspace-part-14.md`.

A redundant QA-only PR #135 was closed unmerged because PR #134 had already solved the route-readiness issue on `main`.

**PART 14 — MANAGER EXCEPTION WORKSPACE: COMPLETE.**

**PART 15 — SELLER QUALITY + PERFORMANCE: COMPLETE. Part 16 is ready only for separate implementation instruction and has not started.**

---

## 43. Part 15 — Seller Quality + Performance

Part 15 extends the existing post-activation Performance & Coaching architecture rather than creating a second scorecard or performance truth system.

Existing sales_performance_settings and sales_performance_reviews remain authoritative. The period-aware get_sales_performance_period_snapshot(uuid,date,date) derives quantitative evidence from existing Sales systems. get_sales_performance_snapshot(uuid) remains the current/activation compatibility wrapper.

When an Admin completes a review, exact period_start → period_end evidence is frozen into the existing immutable metrics_snapshot. Legacy completed snapshots are not backfilled. A review cannot be completed before its evidence period ends.

The exact 14-metric contract covers verified revenue, win rate, Won deal value, first-response SLA, Discovery completeness, Proposal Readiness, Part 11 next-action discipline, Part 13 first-pass handoff acceptance, Part 13 missing-information Return rate, post-sale Sales-attributed scope changes, active canonical Promise conflicts, discount frequency, approval/validation/audited-override frequency, and client expectation disputes.

Every metric reports AVAILABLE, INSUFFICIENT_DATA, or NOT_TRACKED_AUTHORITATIVELY with source/sample/period limitations where applicable. Post-sale Sales-attributed scope changes and client expectation disputes fail closed as NOT_TRACKED_AUTHORITATIVELY because no audited canonical source explicitly proves those facts. Part 11 `crm_activities` remains next-action authority; legacy opportunity `next_follow_up_at` is not performance truth. Part 13 remains handoff-quality authority. Verified Payment remains revenue authority, and payment-controlled Won remains win authority.

There is no overall Seller score or automatic management verdict. Continue / Extend Review / Restrict Scope / Close Engagement remain human decisions. Part 15 does not automatically change Team & Users access, employment, commissions, certification, Sales Academy permissions, or Part 16 permissions.

Migration: 20260921190000_crm_seller_quality_performance_part_15.sql
Checksum: b810ff80cd93e3dfd1f2d288db7060ec02974e583487c715c5c00f1a4457f41b

Verification includes an exact 77-case Part 15 matrix, production release-readiness verifier, authenticated non-destructive Admin/Seller production QA, and before/after performance review/settings immutability checks.

Production closure evidence:

- final runtime source: `add3066abb9da77e3bf5cf306a0a6106695db7dd`;
- trusted final runtime main CI #944 / run `35685557074`: SUCCESS;
- final runtime production deploy #380 / run `35685672695`: SUCCESS;
- deployed Cloudflare Worker version: `e048614f-b4d4-4c90-84c4-3918dd8782e1`;
- Part 15 release-readiness verifier: 0 failures;
- authenticated Admin Part 15 QA: PASS;
- authenticated Seller Part 15 QA: PASS;
- review/settings/business immutability: PASS;
- production database ledger 696; max migration `20260921190000`; Part 15 exact once/checksum exact;
- `PENDING_NEW=0`; `BLOCKED_UNRESOLVED=0`;
- Part 10B Send gate active with policy/schema `2/2`;
- period/current performance snapshot functions each exist exactly once; prohibited duplicate performance tables = 0;
- 16 reviews remain Scheduled, 0 Completed, one settings row remains unchanged, one active Sales user remains;
- no real review/settings/access/commission/certification state was mutated and no fake production business record was created.

Historical failed deployment/QA evidence and the complete correction chronology through PRs #137–#145 are preserved in `docs/crm-seller-quality-performance-part-15.md`; the release record does not erase verifier, selector, visibility, availability, runner-provisioning, or current-vs-period QA corrections.

There is no overall Seller quality score, automatic employment decision, automatic access restriction, commission mutation, or certification mutation. Human management review remains authoritative.

Detailed architecture and release evidence: docs/crm-seller-quality-performance-part-15.md.

**PART 15 — SELLER QUALITY + PERFORMANCE: COMPLETE.**

**PART 16 IMPLEMENTATION FOUNDATION COMPLETE — POLICY ACTIVATION REQUIRES EXPLICIT PRODUCT DECISION.**

---

## 44. Part 16 — Sales Academy / Certification + Deal-Complexity Permissions

Part 16 reuses the existing Sales Academy, training progress, Management review, Final Certification, applicant progression, Sales Catalog, Package Fit, Sales Validation, quotation approval, Pipeline, Part 10B final Send gate and Parts 11–15. No duplicate Academy, Final Certification, product catalog, quotation system or permission subsystem was created.

### Canonical policy and certification model

Policy key:

- `crm_sales_certification_deal_permission_policy_v1`

Current production policy:

- schemaVersion `2`
- policyVersion `1`
- `criteriaApproved=false`
- `grantingActive=false`
- `enforcementActive=false`
- `productRules={}`
- `addonRules={}`
- `protectedCommitmentStages=[]`

Canonical certification keys:

- `LAUNCH_CERTIFIED`
- `GROWTH_CERTIFIED`
- `SCALE_CERTIFIED`
- `CUSTOM_QUALIFICATION_CERTIFIED`

Canonical permission modes:

- `INDEPENDENT`
- `SUPERVISED`
- `QUALIFY_ONLY`
- `BLOCKED`

Canonical add-on behaviors:

- `INHERIT_BASE_PACKAGE`
- `REQUIRE_GROWTH`
- `REQUIRE_SCALE`
- `REQUIRE_SPECIALIST_VALIDATION`
- `CUSTOM_QUALIFICATION_ONLY`

Exact product/add-on mappings remain intentionally unapproved. The policy validator requires explicit rules for every active package/add-on before activation, forces Custom to remain qualification-only with Sales Validation, and requires Scale to preserve escalation.

### Persistence

No prior canonical granular package-certification grant truth existed, so Part 16 adds one bounded evidence/history model:

- `sales_certification_package_grants`

It records certification key, package, authority mode, lifecycle state, expiry, evidence, policy version, grant actor/time and revocation evidence. It does not replace Academy/Final Certification truth.

Production granular grants after release: `0`. No backfill was performed.

### Evaluator and integration

Canonical evaluator:

- `crm_get_sales_certification_deal_permission(uuid,text,uuid,uuid)`

The evaluator derives from existing Academy readiness, explicit grant evidence, current `sales_products`, versioned policy, existing Sales Validation and existing quotation approval.

Progressive server hooks cover:

- package/add-on quotation items
- pre-Send certification assertion
- configured protected Pipeline stages
- policy validation

The hooks remain inert while `enforcementActive=false`.

Package Fit remains the commercial recommendation authority. Certification controls who may handle a deal independently; it does not alter the customer’s real package need.

`SUPERVISED` reuses canonical quotation approval evidence. No second supervisor system was introduced.

Part 10B remains the final quotation Send authority at:

- `finalQuotationSendGateActive=true`
- policyVersion `2`
- snapshotSchemaVersion `2`

### Existing Academy reuse

Production architecture after release:

- core `sales` track: 20 track modules
- `sales_assessment_prep` track: 10 track modules
- Sales Academy modules: 47 active / 47 total
- Sales lessons: 447
- canonical `get_product_package_training`: exactly 1
- active Sales Final Certification module: exactly 1
- Final Certification state rows: 1
- Final Certification sessions: 1

`workforce_capability_profiles` was audited but is not used as package-certification truth.

### Admin and Seller UX

Admin route:

- `/admin/sales-certification-permissions`

Admin can inspect certification status/history and manage versioned policy through validated Admin-only RPCs. Grant issuance remains disabled until approved criteria activate it.

Seller Command Center shows general certification, package-level certification status, required certification, configured mode and remediation/training actions.

Seller self-grant, cross-user private certification access, Admin policy mutation and Admin workspace access are server-denied.

### Security

The grant table has RLS enabled. Authenticated browser access is SELECT-only; writes are RPC-only. Part 16 RPCs use fixed search paths and internal Admin/self authorization.

The final advisor review found no Part 16-specific anonymous SECURITY DEFINER warning and no Part 16 missing-RLS-policy warning. Authenticated SECURITY DEFINER notices for intended Part 16 RPC surfaces are expected because those RPCs must be callable by authenticated users and authorize internally. The new FK indexes currently appear as unused because the production staged state contains zero grants.

### Migration series

- `20260922150000_crm_sales_certification_deal_permissions_part_16.sql`
  - checksum `b6ea5ddba97c5b6018ecf77b0d788203c07ce0093f05ad2ac67b15aa6d2adbd7`
- `20260922151000_crm_sales_certification_deal_permissions_part_16_performance_hardening.sql`
  - checksum `9acada8a8ed1da6a97afbc949faef7ab40d1695dc7349cd43447eeab1585ee93`
- `20260922170000_crm_sales_certification_deal_permissions_part_16_policy_completion.sql`
  - checksum `0eb8d030c8925ecd2ae30cb7ddccc444a263731ae7721aee4695ca6fb35c5666`
- `20260922171000_crm_sales_certification_deal_permissions_part_16_evaluator_completion.sql`
  - checksum `7d69adcccc4156dde2170d2b38ca0967db6150df0f72613322dbcc7af8092747`

Final production ledger:

- 700 rows
- max migration `20260922171000`
- `PENDING_NEW=0`
- `BLOCKED_UNRESOLVED=0`

### Tests and production release evidence

Required matrix:

- Part 16 exact matrix: 90 / 90 PASS

Focused suite:

- 117 / 117 PASS

Final runtime release:

- runtime main SHA `2897f98553d5e5792e581d740c1d6f7f72e44b5f`
- trusted merged-main CI #960 / run `35699050245`: SUCCESS
- production deploy #386 / run `35699204714`: SUCCESS
- Cloudflare Worker version `1f266f7d-c7b1-4640-8081-fe11755e988e`
- Part 16 release verifier: 0 failures
- authenticated Admin Part 16 QA: PASS
- authenticated Seller Part 16 QA: PASS
- mobile/keyboard QA: PASS
- production immutability: PASS

Part 16 authenticated QA preserved:

- granular grants 0
- Academy progress 54
- training reviews 8
- Final Certification state 1
- Final Certification sessions 1
- linked Sales applicant 1, stage `Activated`
- active Sales 1
- performance reviews 16
- Leads 6
- Opportunities 2
- Activities 13
- Quotations 6
- Payments 5
- Clients 2
- Projects 1
- handoff attempts 0

No real certification, Academy progress, Final Certification, applicant stage, performance review, CRM commercial record or handoff record was changed solely for QA. No fake production business data was created.

Historical fail-closed corrections are retained:

- PR #147 initial Part 16 foundation
- PR #148 grant/RLS/index performance hardening
- PR #149 schema-v2 policy/evaluator/UI/matrix/QA completion
- PR #150 release-verifier scope correction after deploy #384 stopped on a verifier false positive
- PR #151 authenticated-QA Final Certification key correction after deploy #385 stopped on the QA snapshot schema mismatch
- deploy #386 passed the full production chain

Detailed architecture, chronology and the complete 95-item developer report are maintained in:

- `docs/crm-sales-certification-deal-permissions-part-16.md`

### Future-phase boundary

No AI Seller assistance, AI package selection authority, AI certification decision, AI Sales Validation, AI performance judgment, automatic employment decision, automatic commission change or unrelated Academy redesign was started.

**PART 16 IMPLEMENTATION FOUNDATION COMPLETE — POLICY ACTIVATION REQUIRES EXPLICIT PRODUCT DECISION.**

**PART 16 POLICY ACTIVATION BLOCKED — CONFIGURABLE CERTIFICATION INFRASTRUCTURE IS READY, BUT EXACT PRODUCTION DEAL-PERMISSION POLICY REQUIRES EXPLICIT PRODUCT APPROVAL.**
