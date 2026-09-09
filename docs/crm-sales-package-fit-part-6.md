# CRM Sales SOP — Part 6: Package Fit & Complexity Classification

## Objective

Part 6 adds deterministic, explainable Package Fit guidance inside the existing CRM Requirements workflow. It evaluates current structured Requirements and relevant unresolved Discovery against the current ProFox Sales Catalog without creating parallel commercial or client business truth.

Package Fit is guidance only. It does not approve technical feasibility, commercial exceptions, timeline commitments, manager approval, proposals, quotations, Pipeline stages, payment, Won, or Sales-to-Delivery handoff.

## Reuse audit

Part 6 reuses:

- `sales_products` as the only current commercial package/add-on source of truth;
- `system_configuration` as the existing versioned configuration architecture;
- `crm_requirement_definitions_v1` as canonical Requirement Definitions;
- `crm_requirements` as current deal-specific structured Requirements;
- `crm_discovery_questions` and `crm_discovery_responses` as canonical Discovery truth;
- `crm_leads` and `crm_opportunities` for lifecycle identity and lineage;
- `crm_can_access_lead(...)` for Seller/Admin access;
- the existing Supabase browser client;
- the existing Requirements workspace;
- the existing `SellerGuidanceHelp` component.

No canonical Package Fit implementation or Package Fit configuration existed before Part 6.

## Production catalog audit

The production catalog was re-queried before implementation.

| Catalog group | Current count |
| --- | ---: |
| Total active `sales_products` | 45 |
| Active packages | 4 |
| Active add-ons | 37 |
| Active care plans | 3 |
| Active discovery products | 1 |

Current active package codes:

1. `PF-WEB-LAUNCH`
2. `PF-WEB-GROWTH`
3. `PF-WEB-SCALE`
4. `PF-CUSTOM`

Current package/add-on commercial values are read live from `sales_products`, including only fields needed by the UI such as `id`, `code`, `name`, `product_type`, `price_mode`, `base_price`, `currency`, `billing_period`, `scope`, `technology`, `manager_approval_required`, `timeline_impact`, delivery-duration fields, `service_family`, `active`, `sort_order`, and `updated_at`.

Package Fit policy does not duplicate package name, price, scope, payment terms, payment schedule, active state, technology, timeline, delivery duration, manager approval, or client-expectation values.

## Requirement and Discovery applicability audit

Canonical Requirement Definitions remain at:

`system_configuration.config_key = crm_requirement_definitions_v1`

Current definition version: **1**  
Current active Requirement Definitions: **105**

Existing Requirement applicability conditions found:

- `booking`
- `complex_decision`
- `custom_app`
- `ecommerce`
- `integration`

Current active Discovery questions: **99**.

Discovery already connects relevant questions to canonical Requirement keys through `applicability.relatedRequirementKeys`. Part 6 reuses those links only for Package Fit-relevant unresolved information and validation signals. Requirements remain the primary structured scope input.

## One canonical policy

Part 6 uses exactly one policy configuration:

- policy location: `system_configuration`
- policy key: `crm_package_fit_policy_v1`
- policy version: **1**

The repository contains an initial Part 6 migration plus a final hardening migration. The hardening migration updates the same policy key and replaces the same evaluator RPC; it does not create a second policy source.

The policy contains only deterministic fit concepts:

- stable package-code order;
- Package Fit-relevant core Requirement keys;
- base-package rules;
- stable Requirement-to-add-on mappings where mapping is defensible;
- review-required flags for ambiguous/validation-sensitive treatment;
- explainable reasons.

Commercial values continue to come from `sales_products`.

## Final base-package rules

The final policy deliberately separates **base-package classification** from **possible add-on guidance**.

### Launch

Launch remains the first plausible base package when the core Package Fit inputs are meaningfully captured and no client-confirmed higher-package rule is triggered.

Page count is not the primary classifier. `required_pages` is only one core completeness input.

### Growth minimum signals

Current client-confirmed structured signals that can raise the minimum base package to Growth:

- `copywriting_requirement`
- `seo_priority`
- `conversion_tracking`

These are supported by the current Growth catalog scope for conversion copywriting, SEO planning and conversion tracking.

### Scale minimum signals

Current client-confirmed structured signals that can raise the minimum base package to Scale:

- `accessibility_requirements`
- `performance_requirements`
- `security_requirements` as an advanced signal that also requires review/validation before treatment is considered reliable

These align with the current Scale catalog’s enhanced accessibility/performance and advanced implementation/QA scope.

### Custom minimum signals

Current client-confirmed structured signals that can raise the minimum base package to Custom include:

- authentication/login;
- role-based access/permissions;
- portal/dashboard;
- custom data/database behavior;
- custom business workflows;
- application user types;
- application permissions;
- application notifications;
- custom reporting;
- admin operations;
- application usage/scale;
- acceptance criteria;
- application-specific training/handover.

These align with the current Custom package scope for portals, dashboards, authentication, permissions, custom data/backend, application workflows, reporting, QA/UAT/documentation/training.

## Buying-process complexity correction

`economic_buyer`, `procurement_process`, `stakeholder_map`, and `internal_champion` remain important Discovery/Requirements context, but the final Part 6 policy does **not** automatically raise the delivery package merely because the buying process is complex.

This prevents decision complexity from being misrepresented as delivery-scope complexity.

## Add-on handling

The live catalog contains 37 active add-ons. Part 6 therefore audits whether a Requirement should raise the base package or could instead have a current catalog add-on.

Stable final mappings include:

| Requirement | Current catalog add-on | Treatment |
| --- | --- | --- |
| `crm_integration` | `PF-ADD-CRM` | possible add-on guidance |
| `booking_required` | `PF-ADD-BOOKING` | possible add-on guidance |
| `api_requirements` | `PF-ADD-API` | possible add-on + review required |
| `subscription_requirement` | `PF-ADD-SUBSCRIPTION` | possible add-on + review required |
| `automation_requirements` | `PF-ADD-BPA` | possible add-on + review required |
| `seo_redirect_migration` | `PF-ADD-SEOMIGRATION` | possible add-on + review required |
| `ecommerce_required` | `PF-ADD-COMMERCE25` | possible starter add-on + commerce review required |
| `payment_gateway` | `PF-ADD-PAYMENT` | possible add-on + validation required |

The evaluator validates every mapped code against the current active `sales_products` add-on catalog.

A generic `third_party_integrations` Requirement is intentionally **not** mapped automatically because the catalog contains multiple integration products and the canonical Requirement alone does not reliably distinguish simple versus advanced treatment. Part 6 defers rather than guesses.

Possible add-ons:

- are returned separately from the base package recommendation;
- never modify base-package rank by themselves;
- are shown only from stable policy mappings;
- use current live catalog records;
- never become quote items automatically;
- never imply approved scope or commercial approval.

## Certainty handling

### `CLIENT_CONFIRMED`

May drive normal deterministic base-package rules. A client-confirmed stable add-on mapping may surface a possible current catalog add-on.

### `SELLER_OBSERVATION`

May contribute provisional context and reduce confidence. It does not hard-classify the base package or confirm an add-on.

### `SELLER_HYPOTHESIS`

Creates clarification/missing-information behavior. It cannot force a package or confirm an add-on.

### `AWAITING_CLIENT`

Remains unresolved and is shown as missing information. No package/add-on answer is assumed.

### `NEEDS_SPECIALIST_VALIDATION`

Produces validation-needed/review-required behavior. Part 6 creates no review record.

### `NOT_APPLICABLE`

Does not increase complexity and does not trigger package or add-on guidance.

Archived Requirements do not drive current Package Fit.

## Custom Requirements

Meaningful active custom Requirements are never silently ignored and are never interpreted by AI as authoritative package rules.

An unmapped custom Requirement returns review-required behavior and lowers confidence. The actual specialist workflow remains deferred.

## Server evaluator

Canonical evaluator:

`crm_get_package_fit_assessment(p_lead_id uuid, p_opportunity_id uuid)`

The final evaluator is:

- deterministic;
- read-only for client business data;
- server-side;
- `SECURITY DEFINER`;
- pinned to an empty `search_path` with schema-qualified application objects;
- authentication-required;
- protected by `crm_can_access_lead(...)`;
- Lead/Opportunity-lineage aware;
- anonymous execution revoked;
- authenticated execution granted;
- independent of service-role browser exposure.

It validates policy keys, rule keys, Requirement keys, package codes, add-on codes, active states/types and current active package-set drift. Configuration/catalog problems fail closed into `REVIEW_REQUIRED` rather than returning a stale recommendation.

## Lead / Opportunity continuity

Calling by Lead ID uses that Lead’s current Requirements/Discovery and resolves the latest connected Opportunity when present.

Calling by Opportunity ID resolves the canonical `lead_id` and evaluates the same Lead truth.

If both IDs are supplied but do not belong to the same lifecycle, the request is rejected.

No Requirements are copied into the Opportunity and no Opportunity-owned Package Fit dataset is created.

## Status and confidence

Statuses:

- `FIT`
- `POSSIBLE_FIT`
- `MISMATCH`
- `REVIEW_REQUIRED`

Confidence:

- `HIGH`
- `MEDIUM`
- `LOW`

Confidence is deterministic and coarse, not fake numeric precision.

Review/configuration/validation conditions produce LOW confidence. Missing or provisional information can reduce confidence to MEDIUM/LOW. LOW confidence does not produce an aggressive package recommendation.

## Traceability and mismatch behavior

Important reasons/signals preserve traceability such as Requirement ID/key, Discovery question ID/key, certainty, source type, policy code and package/add-on code where relevant.

Candidates below a confirmed base-package minimum return `MISMATCH` and concrete source-backed reasons. Provisional observations/hypotheses do not become hard mismatch reasons.

## Current catalog sourcing

Recommended packages, candidates and possible add-ons are assembled from current `sales_products` at evaluation time.

The UI therefore reflects current catalog name, code, price mode/base price, scope, technology, manager-approval flag, timeline-impact flag and delivery guidance without redeploying commercial values.

Historical accepted/issued quotation snapshots are not modified.

## UI

Reusable component:

`src/components/admin/crm/CRMPackageFitPanel.tsx`

It is embedded inside the existing Requirements workspace. No new top-level Lead Drawer Package Fit tab was introduced.

The panel provides:

- status and confidence;
- policy/evaluation indicator;
- current likely fit when safe;
- current catalog guidance;
- manager/timeline indicators;
- explainable fit reasons;
- mismatch/complexity signals;
- missing-information items;
- validation-needed signals;
- current package candidates;
- possible current catalog add-ons;
- source-summary metrics;
- retry/refresh/error states;
- `SellerGuidanceHelp`.

Requirement updates refresh the assessment through the Requirements workspace fingerprint. Manual refresh always re-runs the server evaluator against current data.

## Seller Guidance

Part 6 reuses the existing `SellerGuidanceHelp` component and adds canonical Part 6 guidance for:

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

No second tooltip/help system was created.

## Read-only client behavior

Opening/refreshing Package Fit does not create/update/archive:

- Requirements;
- Discovery responses;
- Client Voice;
- activities;
- review/escalation records;
- selected package fields;
- quote or quote items;
- Lead/Opportunity/Pipeline state;
- payment/Won state;
- handoff state.

The only Part 6 writes are deployment-time policy configuration/migration changes.

## Security and RLS

- authentication is required;
- cross-Lead access is denied through canonical Lead access/lineage rules;
- anonymous RPC execution is revoked;
- `sales_products` RLS remains enabled;
- existing catalog RLS policies are not broadened;
- no service-role key is introduced into frontend code.

## Automated tests

Required Part 6 suite:

`tests/security/crm-sales-package-fit-part-6.test.ts`

Contains the **98 required Part 6 acceptance/security cases**.

Final hardening suite:

`tests/security/crm-sales-package-fit-part-6-hardening.test.ts`

Adds **25 focused regression cases** for:

- one canonical policy key;
- no Package Fit business table;
- buying-process/base-package separation;
- base-package/add-on separation;
- stable add-on mappings;
- no arbitrary third-party-integration guessing;
- add-on catalog validation;
- certainty-safe add-on behavior;
- review-sensitive add-on handling;
- hard-confirmed mismatch behavior;
- current catalog sourcing;
- no quote/Pipeline/payment/Won effects;
- auth-only evaluator execution.

Total Part 6 focused acceptance/hardening cases: **123**.

Repository CI/build/migration/browser results must be reported truthfully in the final implementation report. A GitHub Actions job that receives no runner and executes zero steps is infrastructure evidence, not a successful or failed code test execution.

## Migrations

Part 6 repository migrations:

1. `20260909160000_crm_sales_package_fit_part_6.sql` — initial one-policy/one-evaluator implementation.
2. `20260909162000_crm_sales_package_fit_part_6_policy_hardening.sql` — final correction of the same policy/evaluator, separating base-package classification from safe add-on guidance.

Final database architecture still contains:

- one Package Fit policy key;
- one canonical Package Fit evaluator RPC;
- **zero Package Fit client business tables**.

## Production verification safety

Production verification is read-only except for applying the approved Part 6 migrations/configuration. No fake Leads, Requirements, Discovery responses, package selections, quotations, review records, Pipeline transitions, payment changes or Won records should be created to prove Package Fit behavior.

## Deferred scope

Part 6 intentionally does not implement:

- Technical/Commercial/Timeline/Compliance escalation workflows;
- specialist review assignment;
- manager exception approval workflow;
- Requirements Confirmed server gate;
- Proposal Readiness;
- quotation-send gating;
- Promise Register;
- Assumptions/Exclusions/Dependencies engine;
- payment/Won changes;
- Sales-to-Delivery handoff changes.

Those remain later controlled phases.
