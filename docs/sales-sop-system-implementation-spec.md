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

Part 10A intentionally keeps:

`finalQuotationSendGateActive = false`

It does not modify `send_quotation_professional`, `update_quotation_atomic` Sent behavior, `protect_quotation_transition`, or `get_quotation_cpq_summary.readiness.readyToSend` to enforce Sales reconciliation. Final send enforcement and the minimal immutable persisted Sales-scope snapshot belong to Part 10B after authenticated production acceptance.

### Migration lineage and verification record

Production Part 10A was applied through Supabase's native migration ledger using:

- `20260910124932_crm_sales_quotation_reconciliation_part10a`
- `20260910125143_crm_sales_quotation_reconciliation_assessment_part10a`

The applied native SQL is preserved under `supabase/migrations/native-history/`. The dedicated Part 10A acceptance/security suite contains exactly 169 checks and is wired into both `npm test` and the normal production build path.

Detailed implementation, production verification, release SHAs, security findings, deployment evidence, and the explicit Part 10B prerequisite are maintained in `docs/crm-sales-quotation-reconciliation-part-10a.md`.

---

## 38. Implemented Part 10B — Immutable Send-Time Sales Snapshot + Universal Quotation Send Gate

Part 10B implementation is complete as a **production-compatible staged gate**. The existing `quotations` / `quotation_items` system remains canonical, Part 10A remains the authoritative Sales reconciliation engine, and no duplicate quotation, approval, product, Promise, Scope Condition, validation, readiness or handoff system was introduced.

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

Production migration verification on 2026-09-16 showed:

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

### Activation boundary

The implementation is intentionally staged in production with `finalQuotationSendGateActive=false`. The Part 10B source instruction requires the compatible frontend to be successfully deployed and the blocker-resolution path to be verified in an authenticated production browser before activation. During the implementation run, GitHub Actions repeatedly failed before executing any repository step (`steps=null`), and the connected Cloudflare build check also failed without usable application build output. Authenticated production browser verification therefore was not proven.

Required current activation status:

**PART 10B ACTIVATION BLOCKED — PRODUCTION RESOLUTION UI NOT VERIFIED.**

Do not flip `finalQuotationSendGateActive=true` until compatible deployment and authenticated production resolution UI verification succeed. Detailed implementation, security, production verification and rollout evidence are maintained in `docs/crm-sales-final-quotation-send-gate-part-10b.md`.
