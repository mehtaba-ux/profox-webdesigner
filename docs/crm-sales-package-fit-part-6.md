# CRM Sales SOP — Part 6: Package Fit & Complexity Classification

## Objective

Part 6 adds a deterministic, explainable Package Fit assessment to the existing CRM Sales workflow. It compares current structured Sales Requirements and relevant unresolved Discovery information with the current ProFox Sales Catalog without creating parallel business truth.

Package Fit is guidance. It does not approve technical feasibility, commercial exceptions, timeline commitments, manager approvals, proposals, quotations, Pipeline stages, payment, Won, or Sales-to-Delivery handoff.

## Reuse audit

Part 6 was implemented only after auditing current production and repository architecture.

Reused canonical systems:

- `sales_products` — current commercial/package source of truth.
- `system_configuration` — versioned policy/configuration architecture.
- `crm_requirement_definitions_v1` — canonical Requirement Definitions.
- `crm_requirements` — deal-specific structured Requirements.
- `crm_discovery_questions` — canonical Discovery question/applicability definitions.
- `crm_discovery_responses` — captured Discovery responses and certainty.
- `crm_leads` / `crm_opportunities` — canonical lifecycle and lineage.
- `crm_can_access_lead(...)` — canonical Seller/Admin Lead access decision.
- existing Supabase client in `src/lib/supabase.ts`.
- existing Requirements workspace.
- existing `SellerGuidanceHelp` component.

No existing Package Fit/recommendation implementation or Package Fit configuration key existed before Part 6.

## Live Sales Catalog audit

Production was re-queried before implementation.

Current counts at implementation time:

| Catalog group | Count |
| --- | ---: |
| Total `sales_products` | 45 |
| Active products | 45 |
| Active packages | 4 |
| Active add-ons | 37 |
| Active care plans | 3 |
| Active discovery products | 1 |

Current active package codes:

1. `PF-WEB-LAUNCH`
2. `PF-WEB-GROWTH`
3. `PF-WEB-SCALE`
4. `PF-CUSTOM`

Current commercial values are never duplicated into the Package Fit policy. The evaluator reads live `sales_products` fields, including current:

- `id`
- `code`
- `name`
- `product_type`
- `price_mode`
- `base_price`
- `currency`
- `billing_period`
- `scope`
- `technology`
- `manager_approval_required`
- `active`
- `sort_order`
- `timeline_impact`
- `delivery_duration_min`
- `delivery_duration_max`
- `delivery_duration_unit`
- `delivery_duration_note`
- `service_family`
- `updated_at`

Payment terms, payment schedule and other catalog fields remain in `sales_products` and are not copied into Package Fit policy.

## Requirement Definition audit

Canonical Requirement Definitions remain in:

`system_configuration.config_key = crm_requirement_definitions_v1`

Current version: **1**  
Current active definitions: **105**

Existing applicability conditions found and reused:

- `booking`
- `complex_decision`
- `custom_app`
- `ecommerce`
- `integration`

Part 6 does not create another Requirement Definition catalog.

## Discovery applicability audit

Current active Discovery questions: **99**.

Existing Discovery applicability already links questions to canonical Requirement keys through `applicability.relatedRequirementKeys` and classifies relevant sections including:

- PROJECT
- INTEGRATIONS
- ECOMMERCE
- BOOKING
- TECHNICAL
- CUSTOM_APP
- COMPLEX
- COMMERCIAL
- DECISION
- ANALYTICS
- SEO
- RISKS

Part 6 uses those existing links only for Package Fit-relevant unresolved Discovery signals. It does not recreate the full Discovery gap engine.

## Policy architecture

Part 6 adds exactly one policy configuration:

`system_configuration.config_key = crm_package_fit_policy_v1`

Policy key: `crm_package_fit_policy_v1`  
Policy version: **1**

This architecture was chosen because `system_configuration` is already the repository’s canonical home for versioned Sales SOP configuration such as Requirement Definitions. A new Package Fit policy table would duplicate configuration architecture without adding business value.

The policy stores only deterministic fit policy concepts:

- stable package-code order,
- Package Fit-relevant core Requirement keys,
- unique rule keys,
- rule type,
- rule severity,
- canonical Requirement key,
- minimum package code,
- explainable policy reason.

The policy intentionally does **not** store:

- package names,
- prices,
- payment terms,
- payment schedule,
- package scope,
- technology guidance,
- delivery duration,
- timeline guidance,
- manager approval values,
- client expectations,
- active state.

Those remain live catalog truth in `sales_products`.

## Policy rules and why they exist

The policy maps only canonical structured Requirement signals that are supported by current Requirement Definitions and current package scope.

Examples:

### Growth minimum signals

- conversion copywriting,
- SEO priority,
- conversion tracking,
- CRM integration,
- third-party integration.

These are supported by current Growth catalog scope such as conversion copywriting, SEO planning, tracking and standard integrations.

### Scale minimum signals

- explicit accessibility requirements,
- economic-buyer complexity,
- procurement process,
- stakeholder map,
- internal champion.

These align with the current Scale catalog’s deeper stakeholder discovery, advanced UX/QA and enterprise-complexity positioning.

### Custom minimum signals

- authentication/login,
- user roles/permissions,
- portal/dashboard,
- custom data/database behavior,
- API requirements,
- recurring subscriptions,
- customer accounts,
- custom business workflows,
- application user types/permissions/reporting/admin operations/scale,
- application acceptance criteria.

These align with current `PF-CUSTOM` scope for portals, dashboards, authentication, role-based permissions, custom databases/backends, subscriptions, complex APIs and application workflows.

Page count is deliberately not used as the primary classification rule. `required_pages` is used only as a core completeness input for confidence.

If future package semantics change, policy configuration can be changed independently from commercial catalog values. If product names/prices/scope/timelines change without changing fit semantics, Package Fit automatically reads the updated current catalog values without code changes.

## Policy validation / fail-closed behavior

The evaluator validates the policy and catalog before recommending a package.

It detects or rejects conditions such as:

- missing policy,
- unsupported policy version,
- malformed package order/rules,
- duplicate package codes,
- duplicate/missing rule keys,
- unsupported rule type,
- unsupported severity,
- unknown Requirement key,
- unknown minimum package reference,
- package code not resolving to exactly one catalog record,
- inactive/non-package catalog record,
- active package catalog drift not represented by policy.

Configuration/catalog problems produce `REVIEW_REQUIRED` / LOW-confidence behavior rather than a stale commercial recommendation.

## Server evaluator

Canonical evaluator:

`crm_get_package_fit_assessment(p_lead_id uuid, p_opportunity_id uuid)`

Properties:

- deterministic,
- read-only,
- server-side,
- `SECURITY DEFINER`,
- pinned empty `search_path`,
- requires `auth.uid()`,
- uses `crm_can_access_lead(...)`,
- validates Lead/Opportunity lineage,
- anonymous execution revoked,
- authenticated execution only,
- does not weaken `sales_products` RLS.

The function returns typed concepts including:

- canonical `leadId` / `opportunityId`,
- `policyKey` / `policyVersion`,
- evaluation/catalog timestamps,
- status,
- confidence,
- current recommended product when safe,
- current candidates,
- explainable reasons,
- complexity/mismatch signals,
- missing information,
- validation signals,
- manager-approval indicator,
- timeline-assessment indicator,
- source summary.

## Lead / Opportunity continuity

When called with an Opportunity, the evaluator resolves `crm_opportunities.lead_id` and uses that Lead’s existing Requirements and Discovery.

When called with a Lead, it uses the same Lead truth and reports the latest linked Opportunity where one exists.

If both IDs are provided and do not belong to the same lifecycle, the server rejects the request.

No Requirements or Package Fit records are copied to the Opportunity.

## Certainty handling

### CLIENT_CONFIRMED

May drive deterministic minimum-package rules because the client explicitly confirmed the Requirement.

### SELLER_OBSERVATION

May appear as a provisional complexity/missing-context signal and lowers confidence. It does **not** elevate the minimum package as though the client confirmed it.

### SELLER_HYPOTHESIS

Produces clarification/missing-information behavior. It cannot force a package recommendation.

### AWAITING_CLIENT

Remains unresolved and appears as missing information. The evaluator never assumes the answer.

### NEEDS_SPECIALIST_VALIDATION

Creates a validation-needed signal and causes review-required behavior. It does not approve feasibility.

### NOT_APPLICABLE

Does not increase complexity and does not drive a Package Fit rule.

Archived Requirement records do not drive current Package Fit.

## Custom Requirement handling

A meaningful active custom Requirement that is not mapped to a canonical policy rule is never silently ignored and is never interpreted by AI.

It produces a custom-Requirement review signal and lowers the result to review-required behavior until the scope can be safely mapped/validated in a later workflow.

Part 6 does not create that specialist workflow.

## Complexity classification

Confirmed canonical Requirements can elevate the minimum candidate package according to the versioned policy.

Examples:

- a simple project with no confirmed higher-complexity signals can remain Launch-like,
- confirmed Growth signals elevate the minimum candidate to Growth,
- confirmed Scale signals elevate the minimum candidate to Scale,
- confirmed custom-application signals elevate the minimum candidate to Custom.

A five-page project with authentication, a portal/dashboard, user roles or custom API requirements cannot remain a basic recommendation merely because page count is small.

## Package mismatch behavior

Candidates below the confirmed minimum package rank return `MISMATCH` when the assessment is otherwise determinable. They include source-traceable mismatch reasons.

When the result requires review, candidate cards retain mismatch reasons where known while clearly showing that final recommendation is unresolved.

Package Fit never says merely “not suitable” without explanation.

## Missing information

Part 6 surfaces only Package Fit-relevant missing information, including:

- missing core scope inputs (`project_type`, `required_functionality`, `required_pages`),
- Awaiting Client scope,
- Seller hypotheses,
- provisional Seller observations where confirmation matters,
- relevant unresolved Discovery responses whose canonical Requirement information is not already captured.

The evaluator does not reproduce all Discovery gaps.

## Validation signals

`NEEDS_SPECIALIST_VALIDATION` produces a validation signal with source traceability.

The UI explicitly says Package Fit does not perform the review and that the review workflow is deferred.

No technical/commercial/timeline/compliance review records are created by Part 6.

## Confidence

Confidence is deterministic and intentionally coarse:

- **HIGH** — reliable client-confirmed fit inputs with no Package Fit-relevant unresolved/review conditions.
- **MEDIUM** — a plausible fit exists but missing/provisional information remains.
- **LOW** — insufficient confirmed fit information or review/configuration/validation conditions prevent reliable recommendation.

There is no fake percentage or mathematical precision.

LOW confidence does not produce aggressive “sell this package” language.

## Current catalog sourcing

Recommended and candidate product objects are built from current `sales_products` at evaluation time.

The UI displays only current catalog information needed by the Seller, including:

- current name/code,
- price mode/current base price,
- current scope guidance,
- current technology guidance,
- manager-approval flag,
- timeline-impact flag,
- current delivery-duration fields.

No React constant stores these commercial values.

## Manager approval and timeline

`managerApprovalRequired` is sourced directly from `sales_products.manager_approval_required`.

`timelineAssessmentRequired` is derived directly from the recommended product’s current `sales_products.timeline_impact = assessment_required`.

Part 6 does not create either approval workflow.

## Historical quotation protection

Package Fit does not update quotations or quotation item snapshots.

Current catalog changes affect the current Package Fit assessment only. Historical accepted/issued quotation snapshots remain historical client commercial truth.

## UI

Reusable component:

`src/components/admin/crm/CRMPackageFitPanel.tsx`

Location:

embedded inside the existing Requirements workspace.

No additional top-level Lead Drawer tab was added.

The panel includes:

- Package Fit header,
- status,
- confidence,
- policy version/evaluation indicator,
- current likely fit when safe,
- current catalog guidance,
- manager/timeline indicators,
- why-this-fits reasons,
- mismatch/complexity signals,
- clarification items,
- validation-needed items,
- current candidate comparison,
- source summary,
- explicit guidance-vs-approval warning,
- manual refresh.

The panel is read-only. Refreshing only re-evaluates the server RPC.

Relevant Requirement changes refresh the assessment because the Requirements workspace feeds a Requirement update fingerprint as the panel refresh key.

## Seller Guidance

Part 6 reuses the existing `SellerGuidanceHelp` UI component.

Canonical Part 6 guidance keys:

- `section.package_fit`
- `field.package_fit_status`
- `field.package_fit_confidence`
- `section.package_fit_reasons`
- `section.package_fit_mismatch`
- `section.package_fit_missing_information`
- `section.package_fit_validation`
- `field.current_catalog_guidance`
- `field.manager_approval_required`
- `field.timeline_assessment_required`

No second help/tooltip component was created.

## Read-only / no-write guarantee

Opening or refreshing Package Fit does not:

- create/update/archive a Requirement,
- create a Discovery response,
- create Client Voice,
- create an activity,
- create an escalation/review,
- select a package,
- create a quotation,
- change a Lead,
- change an Opportunity,
- transition Pipeline,
- modify payment,
- mark Won,
- modify a handoff,
- emit audit spam.

The only Part 6 data write is deployment-time insertion of the versioned policy configuration.

## Security / RLS

- Package Fit RPC requires authentication.
- Lead access reuses `crm_can_access_lead`.
- Cross-Lead Lead/Opportunity mismatch is rejected.
- RPC uses an empty pinned `search_path` with schema-qualified application objects.
- Anonymous execute is revoked.
- `sales_products` remains RLS-enabled.
- Existing `sales_products` policies remain unchanged.
- No service-role secret is added to frontend code.

## Tests

Focused suite:

`tests/security/crm-sales-package-fit-part-6.test.ts`

It contains the **98 required Part 6 acceptance/security cases**, covering:

- source-of-truth reuse,
- policy uniqueness/versioning/validation,
- catalog code validation,
- Requirement/Discovery reuse,
- Lead/Opportunity lineage,
- all six certainty states,
- custom Requirement safety,
- page-count prohibition,
- Launch/Growth/Scale/Custom rule scenarios,
- candidate mismatch traceability,
- deterministic confidence,
- live catalog sourcing,
- historical quotation protection,
- no-write-on-view rules,
- Seller Guidance reuse,
- Lead Drawer/Requirements integration,
- anonymous/cross-Lead security,
- RLS/service-role protections,
- deferred-scope protections,
- Parts 1–5 regression-suite continuity,
- repository validation command presence.

Execution results must be reported truthfully. Where GitHub runner infrastructure does not execute a job, it must not be reported as a code failure or a pass.

## Production verification safety

Production verification for Part 6 is read-only except for applying the approved configuration/RPC migration.

Do not create fake Leads, Requirements, Discovery answers, Package selections, quotations, reviews, Pipeline transitions, payment changes or Won records to test Package Fit.

Verification should inspect:

- migration presence,
- policy presence/version,
- function definition/count/grants,
- current catalog counts/codes,
- RLS state/policies,
- absence of duplicate Package Fit business tables,
- before/after production CRM data counts/timestamps where practical.

## Deferred scope

Part 6 intentionally does not implement:

- Technical Escalation,
- Commercial Escalation,
- Timeline Escalation,
- Compliance/Risk Escalation,
- specialist review assignment,
- manager exception approval workflow,
- Requirements Confirmed server gate,
- Proposal Readiness,
- quotation send gating,
- Promise Register,
- Assumptions / Exclusions / Dependencies engine,
- payment/Won changes,
- Sales-to-Delivery Handoff changes.

Those belong to later controlled phases.
