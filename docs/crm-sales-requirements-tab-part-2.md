# CRM Sales Requirements Tab — Part 2

## Scope

This implementation adds the seller-facing **Requirements** workspace to the existing CRM Lead Drawer. It implements Sales SOP Part 2 only. Probing & Discovery, Meeting Prep UI, Package Fit, quotation gating, pipeline gating, payment/Won changes, and the future Promise Register remain intentionally deferred.

## Reuse audit and source of truth

| Capability | Existing source | Decision | Why |
| --- | --- | --- | --- |
| Deal-specific Requirement facts | `public.crm_requirements` | REUSE | Part 1 already provides lead-scoped facts, certainty, provenance, audit hooks, RLS, soft archive, and Lead→Opportunity continuity. |
| Requirement definition/catalog configuration | `public.system_configuration` | EXTEND | Existing versioned global configuration source; a second definitions table would duplicate configuration infrastructure. |
| Sales Discovery frontend service | `src/lib/crmSalesDiscoveryService.ts` | EXTEND | Existing connected workspace/service from Part 1. No second Requirements service or Supabase client is needed. |
| Lead identity | `public.crm_leads` | REUSE | Requirements continue to belong to the canonical Lead lifecycle. |
| Opportunity continuity | `public.crm_opportunities.lead_id` | REUSE | The existing workspace resolves an Opportunity back to the canonical Lead. No Requirement copying is performed. |
| Commercial/package truth | `public.sales_products` | REUSE ONLY | Requirements describe client needs. Prices, package inclusions, timelines, and recommendation logic do not belong in the Requirements catalog. |
| Audit/history | Part 1 Requirement triggers + canonical CRM lead event writer | REUSE | Requirement changes continue through the existing audit path. |

No parallel or duplicate Requirements system is introduced.

## Requirement Definition source

Migration `20260906123000_crm_sales_requirements_part_2.sql` adds one versioned system configuration key:

- `crm_requirement_definitions_v1`
- `version: 1`
- 105 active SOP definitions
- stable `requirementKey`
- `category`
- `title`
- seller-facing `helpText`
- `requirementClass`: `CORE`, `RECOMMENDED`, `CONDITIONAL`, or `COMPLEX`
- `sortOrder`
- `active`
- functional `applicability`

The catalog represents the complete A–Q SOP areas: Business, Problem, Desired Outcome, Audience / Customer, Project / Scope, Content, Brand, Integrations, E-commerce, Booking, SEO, Analytics, Technical, Commercial, Decision / Buying Process, Custom Application, and Risks / Dependencies.

The catalog contains **system SOP configuration only**. It does not insert fake Lead-specific `crm_requirements` records.

The existing `system_configuration` security model remains authoritative. Operational configuration is not exposed anonymously, and global modification remains Admin-controlled through the existing role/configuration conventions. No new role model is introduced.

## Workspace RPC and service contract

`public.crm_get_sales_discovery_workspace(lead_id, opportunity_id)` is extended additively with `requirementDefinitions` while preserving all Part 1 response keys:

- `leadId`
- `opportunityId`
- `requirements`
- `questions`
- `responses`
- `clientVoice`
- `meetingPreparations`

`src/lib/crmSalesDiscoveryService.ts` remains the single frontend service and continues to use the existing Supabase client and Part 1 `saveRequirement` / `archiveRequirement` paths.

Manual seller entries use `SELLER_MANUAL_ENTRY` provenance. Existing structured Requirement values are preserved on text/status-only edits unless a caller explicitly supplies a replacement structured value. The UI never allows a seller to forge `source_record_id`, `created_by`, or `updated_by`.

## Lead Drawer UI

`CRMLeadDrawerBase` gains one real tab: **Requirements**.

No empty Probing & Discovery or Meeting Prep tabs are added.

The Requirements workspace is lazy-mounted only after the seller opens it. Once visited, it remains mounted while the seller moves between drawer tabs so unsaved Requirement text is preserved during tab switching. Changing Lead resets the visit state and loads the next Lead independently.

`CRMRequirementsWorkspace` accepts either `leadId` or `opportunityId`, so it can later be mounted in the Opportunity lifecycle without creating a second Requirements component.

## Requirements experience

The UI provides:

- Requirements coverage summary
- Core captured count
- Client-confirmed count
- Awaiting-client count
- Needs-validation count
- Missing Core callout
- filters for All, Missing / not captured, Client confirmed, Awaiting client, Needs validation, and Custom
- progressive category disclosure
- Core discovery areas visible by default
- additional / conditional areas collapsed by default
- explicit Edit / Save / Cancel
- multiline Requirement details
- provenance and last-updated information
- safe loading, error, retry, and empty states
- long-text wrapping and responsive layouts

The coverage summary is informational only. It does **not** block Lead conversion, pipeline stages, quotation, payment, or Won.

## Coverage calculation

Coverage is calculated only over active `CORE` definitions.

A Core Requirement is **captured** when an active standard Requirement record exists and either it has meaningful text / structured value, or certainty is `NOT_APPLICABLE`.

**Confirmed** means `CLIENT_CONFIRMED` with meaningful captured content.

**Resolved N/A** means `NOT_APPLICABLE`.

**Needs attention** includes `AWAITING_CLIENT`, `SELLER_HYPOTHESIS`, and `NEEDS_SPECIALIST_VALIDATION`.

`SELLER_OBSERVATION` may be captured, but it is never counted as client-confirmed. Empty records are never counted as captured.

## Certainty handling

The UI uses exactly the six Part 1 states:

- `CLIENT_CONFIRMED` → Client confirmed
- `SELLER_OBSERVATION` → Seller observation
- `SELLER_HYPOTHESIS` → Seller hypothesis
- `AWAITING_CLIENT` → Awaiting client
- `NEEDS_SPECIALIST_VALIDATION` → Needs specialist validation
- `NOT_APPLICABLE` → Not applicable

New seller-created drafts default to `AWAITING_CLIENT`. Nothing is silently marked client-confirmed.

`NEEDS_SPECIALIST_VALIDATION` displays a visible warning but does not create the later technical-review workflow.

## Standard and Custom Requirements

Standard definitions are displayed without pre-creating empty deal rows. A `crm_requirements` row is created only when the seller explicitly saves a standard item.

Standard SOP items are not casually archived from the normal UI; `NOT_APPLICABLE` is the normal resolution when a standard definition does not apply.

Custom Requirements support seller-entered title, category, multiline detail, certainty, collision-resistant `custom_<uuid>` keys, editing, and soft archive after explicit confirmation. Archive preserves history; it does not hard-delete the discovery record.

## Security and data safety

Part 2 reuses Part 1 `crm_requirements` RLS through `crm_can_access_lead(lead_id)`. Anonymous access remains denied. Part 1 actor stamping and identity-protection triggers remain unchanged.

The migration:

- creates no second Requirements table
- creates no duplicate definition table
- inserts no fake Lead-specific business data
- rewrites no existing `crm_requirements`
- changes no Lead conversion function
- changes no pipeline transition function
- changes no quotation/payment/Won behavior
- hard-codes no package prices, inclusions, or package timelines

The sensitive `access_required_later` definition explicitly prohibits passwords, API secrets, private keys, recovery codes, card data, and authentication secrets.

## Lead → Opportunity continuity

Requirements remain Lead-owned. `crm_get_sales_discovery_workspace({ opportunityId })` resolves `crm_opportunities.lead_id` and reads the same `crm_requirements` rows.

**No Requirement copying, second set, or re-entry occurs during conversion.**

## Verification

Repository-supported verification commands:

```bash
npm run lint
npm run migrations:check
npm run test:security
npm test
npm run test:e2e
npm run build
```

The focused Part 2 regression file is `tests/security/crm-sales-requirements-part-2.test.ts`. It maps the required 31 acceptance tests to repository/static and pure-logic checks, while the existing Part 1 security tests continue to cover the underlying RLS/audit foundation.

## Responsive and accessibility QA

The Lead Drawer keeps horizontal tab scrolling for narrow widths. Requirements uses responsive `sm:` grid/layout changes, wrapped long text, accessible expanded/pressed state attributes, focus-visible treatments, explicit Save/Cancel actions, and non-destructive loading/error/empty states. Desktop, tablet, and mobile widths must be included in final release verification.

## Post-implementation duplication audit

The final repository/database audit must confirm:

- one deal Requirement table: `crm_requirements`
- one Requirement definition source: `system_configuration.crm_requirement_definitions_v1`
- one Sales Discovery service: `crmSalesDiscoveryService`
- one application Supabase client
- canonical Lead identity remains `crm_leads`
- canonical Opportunity link remains `crm_opportunities.lead_id`
- commercial truth remains `sales_products`
- audit remains the existing CRM/Part 1 audit path
- one Lead Drawer Requirements workspace component

## Intentionally deferred to later Parts

- Probing & Discovery tab/workflow
- Meeting Prep tab/workflow
- specialist review workflow
- Package Fit / package recommendation
- Sales Promise Register
- Requirements Confirmed gating
- quotation gating
- payment/Won gating or behavior changes
- Opportunity Drawer redesign
