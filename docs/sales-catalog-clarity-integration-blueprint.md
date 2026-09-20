# Sales Catalog Clarity & Integration Blueprint

> **Historical planning baseline:** Part 10B was still disabled when this blueprint was prepared on 2026-09-11. Part 10B is now active and complete. Instructions below not to activate Part 10B *as a side effect of Catalog work* remain valid safety boundaries, while statements that the gate “remains disabled” describe only this dated baseline.

**Status:** Planning / handoff document only — implementation is **not started**  
**Repository:** `mehtaba-ux/profox-webdesigner`  
**Pre-document code baseline:** `c14cbfbbe9b58008f119c5d0ae67d592f0041c3b` (`fix(crm): complete Part 10A reconciliation hardening (#108)`)  
**Database:** Supabase project `calabtayklhltyiriiwo`  
**Prepared:** 2026-09-11  
**Purpose:** Provide one implementation blueprint that a future developer can safely resume while other CRM/Sales development continues in parallel.

---

## 1. Executive goal

Build a Sales Catalog that is extremely easy to understand without weakening scope control.

The desired customer and seller experience is:

> **Seller understands it → seller explains it correctly → customer understands it → customer selects confidently → quotation matches it exactly → delivery team receives the same scope.**

The work must improve conversion through clarity, not through ambiguous promises.

### Non-negotiable UX principles

1. **Simple first view.** Do not make sellers or customers read a specification sheet before they understand the offer.
2. **Progressive disclosure.** Show the most important information first; reveal full scope through an explicit `View full scope`, drawer, accordion, or detail panel.
3. **Plain language.** Every technical inclusion must have a simple explanation.
4. **Critical terms remain visible.** Price assumptions, scope limits, exclusions, dependencies, quantities, delivery conditions, and material customer responsibilities must not exist only inside a tooltip.
5. **Tooltips are for short help only.** Use them for terms such as SEO, CRO, responsive design, revision round, API, etc. Long or contractual information belongs in the full scope view.
6. **Seller and customer see the same commercial truth.** The wording may be different in complexity, but the actual entitlement must not conflict.
7. **Seller-only coaching stays private.** Qualification questions, sales guidance, `Do not promise`, margin/complexity warnings, and internal notes must never leak into public pricing or public quotation payloads.
8. **No dark patterns.** Recommendations should explain why an add-on is useful and, when helpful, when it is probably not needed.
9. **Mobile and keyboard accessibility matter.** Customer help must work without hover and must remain understandable on small screens.
10. **No historical rewrite.** Later catalog changes must never change what an already issued/accepted quotation meant.

---

## 2. Current verified baseline

The following was re-checked against the live database and current `main` before writing this document.

### 2.1 Live product inventory

`public.sales_products` is the current commercial product source of truth.

Active inventory:

| Product type | Count |
|---|---:|
| Packages | 4 |
| Discovery | 1 |
| Care plans | 3 |
| Add-ons | 37 |
| **Total** | **45** |

There are currently **no duplicate product codes**.

### 2.2 Add-on completeness gap

All 37 active add-ons currently have the same major definition gaps:

| Check | Current state |
|---|---:|
| Add-ons | 37 |
| Empty `scope` | 37 |
| Blank `short_description` | 37 |
| Blank `full_description` | 37 |
| Empty `public_details` | 37 |
| Publicly visible | 0 |
| Numeric duration configured | 0 |
| `assessment_required` timeline | 37 |

This is the largest catalog-quality gap. Do not make the add-ons public until each one has a reviewed canonical scope and customer-facing explanation.

### 2.3 Current `sales_products` contract

The existing table already holds core commercial and delivery data:

- immutable identity: `id`, `code`
- `name`, `category`, `product_type`
- `price_mode`, `base_price`, `currency`, `billing_period`
- `short_description`, `full_description`
- `scope`
- `technology`
- `manager_approval_required`
- `active`, `sort_order`
- `standard_payment_terms`, `payment_schedule`
- `public_visible`, `public_details`
- `client_expectations`
- delivery duration min/max/unit/note
- `timeline_impact`
- `onboarding_requirements`
- `service_family`, `onboarding_template_key`

**Do not create `sales_products_v2`.** The redesign must enrich this authority, not replace it with a competing catalog.

---

## 3. Current architecture that must be reused

### 3.1 Seller catalog

Current seller/admin editing surface:

- `src/components/admin/SalesCatalog.tsx`

Important current behavior:

- reads `sales_products` directly;
- displays product cards with price, timeline, inclusion count, client-expectation count, payment state, and public visibility;
- edits through a large admin modal;
- maintains canonical scope as a line-based `scope` array;
- saves through `admin_upsert_sales_product`;
- validates public package/care-plan minimum metadata;
- safely deactivates products already referenced by quotations rather than deleting them.

The existing screen already calls itself the **Commercial source of truth**. Preserve that rule.

### 3.2 Public pricing pipeline

Current customer pricing path:

`Sales Catalog / sales_products`
→ `get_public_sales_catalog()` RPC
→ `src/lib/publicSalesCatalogService.ts`
→ `src/pages/PricingCatalogPage.tsx`
→ `src/pages/PricingDetailView.tsx`

The public RPC explicitly returns customer-safe catalog fields from active, `public_visible=true` products. It currently includes `publicDetails` and `scope` but does not expose seller coaching.

**Rule:** enrich this pipeline; do not build a second pricing catalog or query private seller data from the public page.

### 3.3 Public pricing admin

Current health screen:

- `src/components/admin/PublicPricingAdmin.tsx`

It is intentionally **read-only** and tells Admin to edit package data in Sales Catalog.

Preserve this separation:

> Sales Catalog = write authority. Public Pricing Admin = health/verification view.

### 3.4 Seller help / tooltip architecture

Existing reusable CRM seller guidance:

- `src/components/admin/crm/SellerGuidanceHelp.tsx`
- `src/lib/crmSellerGuidance.ts`
- `src/lib/crmSellerGuidanceData.ts`
- design record: `docs/crm-seller-guidance-tooltips-part-3-5.md`

It already supports short tooltip help plus richer click/tap detail with keyboard/mobile behavior.

**Rule:** reuse this architecture where practical for seller help. Do not create another incompatible seller-tooltip framework.

Customer-facing explanations must remain separate from private seller guidance.

### 3.5 Package Fit recommendation logic

Existing package-fit work is documented in:

- `docs/crm-sales-package-fit-part-6.md`

It uses `sales_products` as commercial authority and immutable product codes for add-on mapping. Examples include:

- `PF-ADD-CRM`
- `PF-ADD-BOOKING`
- `PF-ADD-API`
- `PF-ADD-SUBSCRIPTION`
- `PF-ADD-BPA`
- `PF-ADD-SEOMIGRATION`
- `PF-ADD-COMMERCE25`
- `PF-ADD-PAYMENT`

Possible add-ons are guidance only, not automatic quotation approval.

**Rule:** catalog improvements may make these recommendations easier to understand, but must not change recommendation into automatic scope, price, or approval.

### 3.6 Quotation/CPQ

Current seller quotation components include:

- `src/components/admin/QuotationWorkspaceBase.tsx`
- `src/lib/quotationCpqService.ts`

Current `quotation_items` already snapshot important product information, including:

- product ID reference;
- product code snapshot;
- product name snapshot;
- description snapshot;
- price/quantity;
- item type;
- client-expectation snapshot;
- delivery-duration snapshots;
- timeline-impact snapshot;
- configuration snapshot.

This means quotation snapshotting is **partly implemented already**.

However, there is currently **no dedicated canonical full-scope snapshot field** in `quotation_items`.

**Rule:** when catalog scope is later integrated into quotation presentation, extend the current snapshot model carefully. Do not create a second quotation engine.

### 3.7 Customer quotation presentation

Current path:

`quotation_items + quotations`
→ `quotation_presentation_payload()`
→ `open_public_quotation()`
→ `src/pages/PublicQuotationReview.tsx`
→ `src/components/quotation/QuotationProposal.tsx`

The public quotation payload is already curated and strips internal timeline bookkeeping from configuration before returning it.

**Rule:** public quotation must continue to render frozen quotation data, not silently re-read the latest live catalog after the quote is issued.

### 3.8 Sales reconciliation / promises / scope conditions

Relevant existing authorities:

- `crm_sales_scope_conditions`
- `crm_sales_promises`
- `crm_sales_validations`
- `quotation_sales_coverage`
- Part 10A quotation reconciliation

These are **deal-specific Sales controls**, not generic catalog-definition storage.

Do not put generic product benefits/inclusions into deal-specific scope-condition or promise tables.

At this blueprint's 2026-09-11 baseline, Part 10A had been hardened and **Part 10B final quotation-send enforcement remained disabled**. Part 10B was activated later through its separate reviewed release; Catalog work must still never change that gate accidentally.

---

## 4. Integration Impact Map

Risk meanings:

- **HIGH** = a mistake can change commercial truth, quotation behavior, public pricing, or downstream references.
- **MEDIUM** = shared surface or presentation layer; change must be coordinated.
- **LOW** = isolated/read-only integration.

| Area | Current authority / file | Planned use | Risk | Safety rule |
|---|---|---|---|---|
| Product identity | `sales_products.id`, `sales_products.code` | Keep identity for all enriched definitions | HIGH | Never recreate, reseed, rename codes casually, or change IDs |
| Commercial catalog | `public.sales_products` | Remain canonical parent record | HIGH | Extend/additive only; no competing catalog |
| Seller catalog | `SalesCatalog.tsx` | Simplify scan/detail/edit experience | HIGH | Preserve current write authority and RPC validation |
| Sales product service/type | `src/lib/salesService.ts` + shared types | Map any new safe metadata | HIGH | Extend backward-compatibly; no field meaning changes |
| Catalog admin RPC | `admin_upsert_sales_product` | Save approved metadata | HIGH | Inspect latest function before every schema phase |
| Public catalog RPC | `get_public_sales_catalog()` | Whitelist new customer-safe fields | HIGH | Never expose seller-private guidance |
| Public catalog service | `publicSalesCatalogService.ts` | Normalize new public metadata | MED/HIGH | Typed validation/defaults; fail safely |
| Pricing source page | `PricingCatalogPage.tsx` | Supply simple pricing view | HIGH | Continue canonical dynamic catalog flow |
| Pricing presentation | `PricingDetailView.tsx` | Progressive disclosure/full scope | HIGH | Keep first view simple; mobile/accessibility testing |
| Public Pricing Admin | `PublicPricingAdmin.tsx` | Expand health checks only | MEDIUM | Read-only; edits remain in Sales Catalog |
| Seller guidance | `SellerGuidanceHelp` + guidance libs | Reuse for internal explanations | MEDIUM | No duplicate tooltip architecture |
| Package Fit | package-fit RPC/policy/panel | Contextual recommendations | HIGH | Codes immutable; never auto-quote possible add-ons |
| Product validations | `crm_sales_validations.product_id` | Continue specialist/deal validation | MEDIUM | Do not repurpose for catalog definitions |
| Scope Conditions | `crm_sales_scope_conditions` | Reconciliation only | HIGH | Deal-specific; do not store generic package scope |
| Promise Register | `crm_sales_promises` | Promise integrity | HIGH | Do not derive risky promises from marketing copy |
| Quotations | `quotations` | Client-visible top-level scope/terms | HIGH | Preserve canonical CPQ write flow |
| Quote lines | `quotation_items` | Add immutable scope/catalog snapshots if approved | HIGH | Additive snapshot design; never read current catalog for historical meaning |
| CPQ UI | `QuotationWorkspaceBase.tsx` | Explain selected product/add-ons and warnings | HIGH | Extend existing editor; no parallel quotation editor |
| CPQ service/RPCs | `quotationCpqService.ts`, canonical quote RPCs | Persist approved snapshots | HIGH | Inspect all write RPCs before schema changes |
| Reconciliation | `quotation_sales_coverage` + Part 10A | Continue mapping deal commitments to client-visible quote | HIGH | Do not bypass human review or Part 10A authority |
| Public quote | `quotation_presentation_payload` / `QuotationProposal` | Show frozen customer scope clearly | HIGH | No seller-only data; preserve accepted history |
| Revenue distribution | `revenue_distribution_product_profiles.sales_product_id` | Existing downstream use | MED/HIGH | Product IDs unchanged |
| Worker compensation | `worker_compensation_rate_cards.sales_product_id` | Existing downstream use | MED/HIGH | Product IDs unchanged |
| Career progression | `sales_career_progression_thresholds.product_code` | Existing downstream use | MED/HIGH | Product codes unchanged |
| Onboarding | `onboarding_requirements`, templates | Feed required inputs | MEDIUM | Do not silently change existing onboarding semantics |
| Delivery handoff | project/onboarding downstream | Consume accepted frozen scope | MED/HIGH | Handoff from quote snapshot, not mutable live catalog |

### External Salesforce note

No source-code reference to an external Salesforce integration was found during this audit. The active overlapping work is ProFox's internal CRM/Sales/quotation stack. If an external Salesforce integration is introduced later, stop and repeat this impact audit before implementing catalog synchronization.

---

## 5. Canonical data flow

```text
                 ADMIN / COMMERCIAL AUTHORITY
                         sales_products
                              │
                ┌─────────────┴─────────────┐
                │                           │
        Seller Catalog                 Public whitelist
        + Seller Playbook          get_public_sales_catalog
                │                           │
                │                    Pricing Catalog
                │                    + Full Scope UX
                │                           │
                └─────────────┬─────────────┘
                              │
                      Quote selection / CPQ
                              │
                 Frozen quotation snapshots
                              │
          ┌───────────────────┴──────────────────┐
          │                                      │
 Sales reconciliation                    Customer quotation
 scope/promises/coverage                 presentation payload
          │                                      │
          └───────────────────┬──────────────────┘
                              │
                     Accepted commercial truth
                              │
                    Onboarding / delivery handoff
```

A second independent definition must not be maintained at any stage.

---

## 6. Proposed canonical product anatomy

Every sellable product should eventually have the following definition. Not every property has to become a new database column; Phase 1 decides the safest persistence structure.

### 6.1 Existing commercial identity

- Product ID
- Product code
- Name
- Category
- Product type
- Active/public status
- Price mode
- Base/starting price
- Currency/billing period
- Payment schedule

### 6.2 Customer outcome

- `customerOutcome` — one simple sentence describing what the customer gets or can achieve.
- `bestFor` — ideal use case.
- `benefits[]` — practical business/user benefits, not unsupported performance promises.

### 6.3 Canonical deliverables

Each inclusion should evolve from a raw string into a structured concept with, where relevant:

- stable inclusion key;
- display title;
- simple explanation;
- benefit;
- exact included work;
- quantity/limit;
- completion/acceptance criterion;
- customer-visible status;
- tooltip/term reference where needed.

Example conceptually:

```text
Responsive design
Simple explanation: The website adapts to common desktop, tablet and mobile screen sizes.
Benefit: Visitors can comfortably browse and contact you on different devices.
Included work: Responsive implementation/testing for the agreed pages.
Limit: Applies to pages included in the purchased scope.
Complete when: Agreed pages pass the defined responsive QA checks.
```

### 6.4 Boundaries and conditions

- `scopeLimits[]`
- `exclusions[]`
- `clientRequirements[]`
- `dependencies[]`
- `acceptanceCriteria[]`
- revision policy/reference;
- support period/rules where relevant;
- third-party-cost note where relevant;
- change-request rule.

### 6.5 Pricing definition

For fixed or starting-at pricing:

- price mode;
- baseline assumption;
- included quantity/complexity;
- escalation triggers;
- third-party costs if applicable;
- manager/technical assessment requirement.

`Starting at` must never be an unexplained floor price.

### 6.6 Timeline definition

Keep two separate concepts:

1. **Typical service delivery duration** — elapsed business days from Project Ready Date.
2. **Project schedule impact** — whether the item is base-path, additive, parallel, or requires assessment under the existing scheduling model.

Do not mechanically sum all add-on durations. Parallel work should be handled by the existing quotation timeline logic/critical-path semantics.

### 6.7 Seller-only playbook

For each package/add-on:

- `How to explain it`
- `Why customers buy it`
- `Ask the customer`
- `Recommend when`
- `Do not recommend when`
- `Do not promise`
- `Complexity / price warning`
- `Required before quoting`
- compatible products/dependencies
- escalation path when uncertain.

This layer must be protected from public APIs.

---

## 7. Persistence decision gate — do not choose prematurely

Phase 1 must deliberately choose where richer catalog metadata lives after re-checking the then-current code and migrations.

### Customer-safe metadata

`public_details` can continue to hold customer-facing presentation data where the shape remains manageable, because `get_public_sales_catalog()` already explicitly whitelists it.

However:

- keep a typed schema/normalizer;
- do not put seller-private content inside a blob returned by the public RPC;
- do not let the same fact exist independently in multiple locations.

### Seller-private metadata

Seller guidance needs a protected persistence path. Options to evaluate in Phase 1:

1. additive protected JSONB on `sales_products` that is **never** exposed through public RPCs; or
2. a normalized one-to-one/child table keyed by `sales_product_id` when structure/querying/versioning justifies it.

Do not create the table merely because a table sounds cleaner. Choose based on current query patterns, permissions, versioning requirements, and simplicity.

### Structured inclusions

Evaluate whether the current `scope` string array can remain the lightweight canonical marketing list while richer detail is stored in structured metadata, or whether inclusions require a normalized child model.

Decision criteria:

- stable ordering;
- reusable Scope Dictionary terms;
- per-inclusion quantity/limit/exclusion;
- inheritance/override requirements;
- quotation snapshot needs;
- public/seller visibility;
- editing simplicity;
- RLS/security;
- avoiding duplicate truth.

Whatever model is chosen, **one canonical value must generate all presentations**.

---

## 8. Seller UX — simple by default

The seller should not need to interpret raw JSON or scan a giant edit form just to explain an offer.

### 8.1 Catalog list/card

Keep the current searchable/filterable Sales Catalog, but make the first view answer only:

- What is this?
- Who is it for?
- What does it cost?
- How long does it normally take?
- How complete/healthy is the scope?
- Is it public/active?

Suggested card/list fields:

```text
ProFox Growth             Package · Public
For established businesses that need a conversion-focused growth website.
Starting at $X            Typical delivery: 25–35 business days
15 inclusions             Scope health: Complete
[View / Explain]          [Edit — Admin]
```

Avoid putting every inclusion directly on the catalog card.

### 8.2 Seller detail panel

Use a right-side drawer or similarly lightweight detail view rather than forcing the seller into an editing experience to learn a product.

Recommended sections:

1. **Overview** — customer outcome, best for, price, timeline.
2. **Benefits** — why it matters.
3. **Included** — canonical deliverables with short explanations.
4. **Limits & Not Included** — visible boundaries.
5. **What We Need From Customer** — dependencies/inputs.
6. **Timeline & Pricing Assumptions** — Project Ready Date, price assumptions, assessment triggers.
7. **How to Explain / Seller Guide** — private guidance.
8. **Compatible / Recommended Add-ons** — contextual, not an unfiltered list of 37.

### 8.3 Seller helper behavior

Use existing `SellerGuidanceHelp` for short internal definitions when suitable.

Example:

`SEO Foundation ⓘ`

Quick help:
> Basic technical/on-page setup that helps search engines understand the site. It does not guarantee rankings.

Detailed seller guidance can explain what to promise and what not to promise.

### 8.4 Admin edit mode

Admin editing can remain richer, but separate **view/explain mode** from **edit mode**.

The current large Sales Catalog editor should eventually be grouped into clear sections and quality indicators rather than one long field-heavy modal.

---

## 9. Customer Pricing UX — understand before comparing

### 9.1 Pricing card

Each package card should show:

- package name/badge;
- one-sentence outcome;
- best-for cue;
- starting/fixed/custom price;
- typical delivery range;
- 5–7 highest-value inclusions;
- CTA;
- `View full scope`.

Do not show dozens of raw inclusions on the first card.

### 9.2 Full scope view

For each inclusion or grouped inclusion:

- **What it means**
- **Why it helps**
- **Included**
- **Limit**, where material

At package level also show:

- Not included / optional items
- What we need from the customer
- Revision rules
- Support
- Delivery assumptions
- Definition of completion where useful

### 9.3 Tooltip rule

Use public tooltip/help only for short terminology explanations.

Good tooltip:
> “Responsive design means the included pages adapt to common desktop, tablet and mobile screen sizes.”

Bad tooltip:
> eight paragraphs containing exclusions, dependency clauses, pricing conditions, and contractual scope.

Critical scope belongs in the full-scope view and ultimately the quotation.

### 9.4 Package comparison

Default comparison should emphasize the differences customers actually use to choose:

- best for;
- pages/scope level;
- design level;
- strategy/research;
- conversion/copy level;
- integrations;
- ecommerce availability/status;
- revisions;
- post-launch support;
- timeline.

Then allow `View all features` for the complete matrix.

### 9.5 Customer-readable status model

Use explicit labels rather than ambiguous checkmarks:

- **Included**
- **Optional Add-on**
- **Custom Quote**
- **Not Included**

Never use `Available` when it could be read as `included`.

---

## 10. Add-on discovery and selection

Do **not** put all 37 add-ons in front of every customer by default.

### 10.1 Contextual recommendations

Examples:

- commerce project → commerce/payment/tracking add-ons;
- CRM requirement → CRM/integration add-ons;
- subscription business → subscription functionality;
- website migration → migration/redirect items;
- appointment-based business → booking integration.

Use the existing Package Fit rules as input where appropriate. Possible recommendations remain suggestions until selected and quoted.

### 10.2 Add-on customer view

Each add-on should eventually answer:

```text
Name
Simple outcome
Starting/fixed price
Typical delivery
Recommended when
You may not need this if
What's included
Limits
Dependencies
Not included
What we need from you
```

### 10.3 Compatibility / dependency rules

Examples to encode only after technical review:

- Subscription functionality requires compatible commerce/payment capability.
- Advanced product filters require an applicable product catalog/ecommerce implementation.
- Payment-gateway work requires the provider/account/API path to be supported and available.
- CRM lead routing requires a supported CRM/account and credentials.
- SEO migration/redirect planning is relevant when URLs/site structure are moving.
- Content migration requires accessible source content.

The quotation builder should warn about missing dependencies rather than silently produce an incomplete quote.

---

## 11. Shared ProFox Scope Dictionary

Create one canonical dictionary for repeated commercial terms. The UI can link or tooltip these definitions rather than rewriting them per product.

Initial required terms:

- Business Day
- Project Ready Date
- Revision Round
- Standard Page
- Custom-Designed Page
- Content Refinement
- Copywriting
- Responsive Design
- SEO Foundation
- Advanced SEO
- Search & AI Discovery Structure
- Conversion Optimization / CRO
- Standard Integration
- Advanced Integration
- Custom API Integration
- Small Website Change
- Priority Support
- Standard QA / Comprehensive QA / 50+ point QA, if retained
- Standard vs custom payment integration

Example revision definition to finalize:

> **Revision Round:** one consolidated set of requested changes submitted after review of an agreed deliverable. A revision modifies that agreed deliverable; it does not automatically add new pages, functionality, integrations, redesign directions, or previously unrequested scope.

Exact commercial wording requires business approval before publishing.

---

## 12. Pricing safeguards

### 12.1 Starting-at assumptions

Every `starting_at` item needs:

- what the starting price assumes;
- included quantity/complexity;
- what causes reassessment/custom pricing.

Example concept for Custom API Integration:

> Starting price assumes one agreed source/destination, a documented standard API, supported authentication, agreed endpoints/data mapping, and standard testing. Additional systems, undocumented APIs, custom middleware, complex transformations, or unusual business logic require assessment.

Do not publish that exact example as contractual wording until the product definition is approved.

### 12.2 Third-party costs

Where relevant, state clearly that provider/platform/license/transaction fees are not included unless the quotation specifically says otherwise.

### 12.3 No unsupported outcome promises

For SEO/search work, distinguish **delivery of the SEO work** from **search-engine outcomes**. Never promise rankings/indexing by the service delivery date.

---

## 13. Timeline safeguards

### 13.1 Project Ready Date

Recommended commercial concept:

> Delivery timing starts from the Project Ready Date — when the required payment, onboarding information, content/assets, technical access, and other stated prerequisites have been received.

If required client inputs or third-party approvals are delayed, affected milestones can move accordingly.

### 13.2 Keep current timeline semantics compatible

Current persisted values include:

- `base`
- `additive`
- `parallel`
- `assessment_required`

Do not rename these persistence values during a UI redesign without first auditing all quotation calculations and constraints.

The customer/seller UI may use friendlier language, but persistence compatibility must be preserved unless a separately reviewed migration changes it safely.

### 13.3 Do not sum blindly

Example:

- Growth base: 25–35 business days
- CRM integration: 3–5
- Tracking: 3–5
- Local SEO: 4–7

This does **not** automatically mean 35 + 5 + 5 + 7. Some work can run in parallel. The quotation must use the existing timeline calculation/critical-path rules and assessment flags.

---

## 14. Quotation integration design

### 14.1 Preserve current CPQ authority

Do not create a new quotation builder.

Use existing:

- quotation workspace;
- canonical create/update/revision RPCs;
- `quotation_items`;
- presentation payload;
- customer decision workflow;
- Sales reconciliation.

### 14.2 Snapshot the sold meaning

At quote creation/update, the line should eventually freeze the client-visible scope required to understand what was sold.

Current snapshot fields already cover identity, description, price, expectations and timeline. Phase 7 must decide the smallest additive way to snapshot structured product scope.

Options may include:

- a dedicated structured snapshot field; or
- a versioned, intentionally named section inside `configuration_snapshot` if that remains clear, immutable and safe.

Do not choose this before re-auditing all RPCs and payloads in Phase 7.

### 14.3 Flatten package inheritance in the quote

Marketing/catalog may say `Everything in Growth` for scanning convenience.

The customer quotation should **not** rely on unresolved inheritance. It should present the final resolved scope that applies to that customer, including overrides such as revision count or support period.

### 14.4 Historical stability

Once a quotation is sent/accepted, later catalog edits must not rewrite its meaning.

Catalog = living commercial definition.  
Quotation snapshot = historical customer agreement.

### 14.5 Reconciliation compatibility

Part 10A maps Sales scope/promises to client-visible quotation targets and remains human-reviewed.

Catalog work must not:

- auto-cover a Promise;
- auto-edit quote wording from a Promise;
- auto-enable Part 10B;
- create a second reconciliation system.

---

## 15. Catalog versioning

Add catalog version/effective-date semantics only after Phase 1 design review.

Desired behavior:

- new quotes can use the current approved version;
- existing sent/accepted quotes retain their snapshot;
- Admin can identify which catalog definition generated a quote;
- migration or copy changes are auditable.

Potential fields/concepts:

- `catalog_version`
- `effective_from`
- approved/published state if needed
- quotation-side source version snapshot.

Do not add these blindly if a parallel branch has already introduced equivalent versioning.

---

## 16. Scope quality gate

A package/add-on should not become public or `sales-ready` until required definition fields pass validation.

Suggested quality checks:

| Requirement | Public package | Seller-only add-on |
|---|---:|---:|
| Name/code/type/price mode | Required | Required |
| Simple outcome | Required | Required |
| Customer explanation | Required | Required |
| Benefits | Required | Required |
| Canonical inclusions | Required | Required |
| Material quantity/limits | Required | Required where applicable |
| Exclusions | Required where material | Required where material |
| Client requirements | Required where applicable | Required where applicable |
| Dependencies | Required where applicable | Required where applicable |
| Acceptance/definition of done | Required | Required |
| Starting-price assumption | Required for `starting_at` | Required for `starting_at` |
| Delivery range / assessment reason | Required | Required |
| Timeline impact | Required | Required |
| Revision/support rule | Required where applicable | Required where applicable |
| Seller explanation | Recommended/private | Required/private |
| Compatibility rules | As applicable | As applicable |

The current `PublicPricingAdmin` health view is a natural place to surface customer/public completeness checks without making it an editing surface.

---

## 17. Contradiction detection

Where one canonical value can generate presentation, generate it. Avoid duplicated manually typed facts.

Where duplication cannot be avoided, introduce integrity checks for conflicts such as:

- canonical support period = 20 days while comparison says 14;
- `Copywriting Included` while scope only says `Content refinement`;
- a package marked ecommerce `Available` when it is actually an optional add-on;
- technology summary conflicting with the approved package technology list;
- public timeline text conflicting with numeric duration.

Treat contradictions as a publishing/quality warning, not something the seller has to notice manually.

---

## 18. Known product decisions that remain unresolved

Do not silently choose these during implementation.

### ProFox Launch

1. Support conflict: canonical scope currently says 20 days; public comparison says 14 days.
2. `Copywriting Included` vs `Content refinement` requires one approved entitlement.

### ProFox Growth

3. Technology references are inconsistent across top-level technology, comparison, and public technology logos.

### ProFox Scale

4. Ecommerce currently says `Available`; business must confirm whether this means optional add-on / separately scoped.

### Custom Digital Experience & Web Application

5. Current capability list can be read as though every module is included. It should clarify that applicable modules are selected in the approved custom scope.

### Discovery Sprint

6. Define concrete documented outputs and definition of done.

### Care plans

7. Define support response expectations/SLA if applicable.
8. Define whether included hours roll over.
9. Define `small website changes`.
10. Define emergency/new-feature boundaries.
11. Define support channel and reporting expectations.

### Add-ons

12. Define objective integration complexity tiers.
13. Define Standard Page vs Custom-Designed Page.
14. Define branding quantities/concepts/revision rounds.
15. Define lead-form complexity limits.
16. Decide which add-ons become public vs seller/quotation-only.
17. Confirm exact quantity/complexity assumptions for every starting-at add-on.

### Timeline/policy

18. Approve Project Ready Date wording.
19. Approve customer-delay/milestone wording.
20. Decide whether UI needs friendlier schedule-impact labels while persistence keeps current values.

---

## 19. Planning delivery baselines

These are **planning recommendations, not contractual promises or externally guaranteed industry standards**. Calibrate them against actual ProFox delivery capacity/history before publishing.

### Core offers

| Offer | Planning baseline |
|---|---|
| ProFox Launch | 15–20 business days |
| ProFox Growth | 25–35 business days |
| ProFox Scale | 40–60 business days |
| Custom Digital Experience / Web App | typically 40–90+ business days after discovery; quote-specific |
| Discovery Sprint | 5–8 business days |
| ProFox Care | 2–3 business days onboarding, then ongoing monthly |
| Growth Care | 3–5 business days onboarding, then ongoing monthly |
| Priority Care | 3–5 business days onboarding, then ongoing monthly |

### Branding

| Add-on | Planning baseline |
|---|---|
| Logo Refresh | 5–8 days |
| Mini Brand Identity | 7–12 days |
| Custom Icon Set | 4–7 days |
| Advanced Animation Pack | 5–10 days |
| Custom Illustration | 3–7 days |
| Interactive / 3D Experience | 10–20 days |

### Ecommerce

| Add-on | Planning baseline |
|---|---|
| Commerce Starter — up to 25 products | 10–15 days |
| Additional 25 Product Setup | 2–4 days |
| Advanced Product Filters | 3–6 days |
| Subscription Functionality | 4–7 days |
| Additional Payment Gateway | 2–4 days |
| Custom Checkout Experience | 7–12 days |

### Integrations / automation

| Add-on | Planning baseline |
|---|---|
| Simple Third-Party Integration | 2–4 days |
| Advanced Integration | 4–7 days |
| Custom API Integration | 7–15 days |
| Email Automation Starter | 4–7 days |
| CRM Lead Routing | 4–7 days |
| Payment Integration | 2–4 days |
| Business Process Automation | 7–15 days |

### Lead generation

| Add-on | Planning baseline |
|---|---|
| Advanced Lead Form | 2–4 days |
| Booking / Calendar Integration | 1–3 days |
| WhatsApp / Live Chat Integration | 1–2 days |
| Review Platform Integration | 1–2 days |
| Standard CRM Integration | 3–5 days |
| Advanced Conversion Tracking | 3–5 days |
| CRO Launch Audit | 4–7 days |

### Pages / content

| Add-on | Planning baseline |
|---|---|
| Additional Standard Page | 1–2 days per page |
| Additional Custom-Designed Page | 2–4 days per page |
| Conversion Landing Page | 3–5 days |
| Additional Copywriting Page | 1–3 days per page |
| Blog Setup | 2–4 days |
| Content Migration — up to 20 pages | 3–7 days |

### Search

| Add-on | Planning baseline |
|---|---|
| Local Search Foundation | 4–7 days |
| Advanced SEO Launch Pack | 7–12 days |
| AI/GEO Discovery Foundation | 4–7 days |
| Technical SEO Audit | 4–7 days |
| SEO Migration / Redirect Plan | 4–8 days |

---

## 20. Safe implementation phases

Each phase starts with a **fresh collision audit** because parallel development is active.

### Phase 0 — Preflight / collision audit

Before any feature code or migration:

1. Fetch latest `main` SHA.
2. Review open PRs touching Sales, catalog, pricing, quotation, onboarding, or public pages.
3. Review migrations added since the baseline recorded in this document.
4. Re-query current schema/functions for all areas in the Integration Impact Map.
5. Compare changes against this blueprint.
6. Update this document if assumptions changed.
7. Do not proceed if an equivalent table/component/model has already been introduced.

**Gate:** implementation plan still maps to current code with no duplicate authority.

### Phase 1 — Canonical metadata model + integrity framework

Goal: establish the smallest additive model for rich scope, public explanations, seller guidance, dependencies, and catalog versioning.

Tasks:

- decide JSONB vs normalized child data based on current architecture;
- preserve all existing IDs/codes;
- define typed schemas;
- define public/private boundaries;
- add quality/contradiction validation;
- keep existing pages functional during transition;
- add migration/tests if schema changes are necessary;
- run Supabase security/performance advisors if DB structure/RLS changes.

**Gate:** current seller/pricing/quotation flows continue working with new metadata absent or partially populated.

### Phase 2 — Four primary packages

Fully define:

- Launch
- Growth
- Scale
- Custom

Resolve the known business contradictions before publication.

For each package complete:

- outcome;
- best for;
- benefits;
- structured inclusions;
- limits;
- exclusions;
- requirements/dependencies;
- acceptance criteria;
- price assumptions;
- revisions/support;
- timeline;
- seller playbook;
- public explanation;
- comparison facts.

**Gate:** package scope quality = complete; no contradictory public/canonical facts.

### Phase 3 — Discovery + Care plans

Complete the Discovery definition of done and Care plan boundaries/SLA/hour rules.

**Gate:** seller can answer exactly what is/is not covered without interpreting vague terms.

### Phase 4 — 37 add-ons

Complete every add-on systematically by category.

Do not make all 37 public simply because they are complete. Public visibility is a separate commercial decision.

**Gate:** all 37 have reviewed definition, timeline/assessment rule, price assumption where relevant, seller explanation, boundaries, dependencies, and acceptance criteria.

### Phase 5 — Seller experience

Enhance existing Sales Catalog, not replace it.

Implement:

- scan-friendly cards/list;
- read/explain detail drawer;
- benefits and structured inclusion display;
- seller-only guidance;
- qualification/dependency warnings;
- scope health indicator;
- clear edit mode for Admin;
- contextual recommended add-ons.

Reuse existing seller guidance components.

**Gate:** a seller unfamiliar with the SKU can understand and explain it without opening raw admin fields.

### Phase 6 — Public pricing experience

Extend the current public catalog RPC/service/page path.

Implement:

- simple package cards;
- key inclusions first;
- accessible `View full scope`;
- plain-language explanations;
- difference-focused comparison;
- explicit Included / Optional Add-on / Custom Quote / Not Included statuses;
- contextual add-ons only;
- mobile/keyboard behavior.

**Gate:** customer can distinguish packages and understand material scope without contacting Sales just to decode terminology.

### Phase 7 — Quotation snapshot/reconciliation/delivery handoff

Re-audit quotation schema/RPCs immediately before this phase.

Implement only the minimal approved additions needed to:

- freeze final sold scope and catalog version;
- flatten inherited inclusions;
- show customer-readable line scope;
- preserve exclusions/requirements/timeline;
- keep Part 10A reconciliation intact;
- pass accepted scope cleanly to onboarding/delivery.

**Do not activate Part 10B unless a separate approved task explicitly does so.**

**Gate:** old accepted quotation remains unchanged after catalog edits; new quote renders the same scope seller selected.

### Phase 8 — Full QA / release

- verify all 45 records and unique codes;
- ensure IDs/codes unchanged;
- run TypeScript/build/test suite;
- run targeted catalog/pricing/quotation tests;
- run RLS/security/performance checks when applicable;
- verify public RPC contains no seller-private metadata;
- responsive/accessibility check;
- verify Package Fit mapping;
- verify quotation create/update/revision/public-open flows;
- verify Part 10A behavior;
- verify Part 10B remains in its intended state;
- smoke-test delivery/onboarding handoff;
- update this document's progress ledger.

---

## 21. Parallel-development protocol

This section is mandatory for every future implementation session.

### Before writing

1. Fetch latest `main`.
2. Inspect open PRs/branches relevant to the impact area.
3. Check latest Supabase migrations/functions/schema.
4. Compare exact files/tables to the impact map.
5. If another developer already introduced an equivalent concept, **reuse/adapt it** — do not duplicate it.

### While writing

- use additive changes first;
- keep commits small and focused;
- do not refactor unrelated CRM code;
- do not rename product IDs/codes;
- do not create duplicate help systems;
- do not create a second quote editor;
- do not change Package Fit authority;
- do not mix catalog rollout with unrelated Sales changes;
- use unique migration timestamps;
- keep backward-compatible defaults until all consumers are upgraded.

### Before merge/release

1. Re-fetch latest `main` again.
2. Compare new parallel changes.
3. Resolve conflicts deliberately; never overwrite blindly.
4. Re-run affected tests/build.
5. Re-query live DB after migrations.
6. Run Supabase advisors if schema/RLS changed.
7. Verify current public pricing and quotation paths.
8. Update this blueprint/progress ledger.

---

## 22. Validation and acceptance checklist

### Data integrity

- [ ] Exactly intended product inventory exists.
- [ ] No duplicate codes.
- [ ] Existing product IDs unchanged.
- [ ] Existing codes unchanged.
- [ ] Package Fit mappings still resolve.
- [ ] Downstream FK references remain valid.

### Seller privacy

- [ ] Seller guidance is inaccessible to anonymous/public catalog consumers.
- [ ] `get_public_sales_catalog()` explicitly whitelists only customer-safe fields.
- [ ] Public quotation payload contains no seller-only coaching/internal warnings.

### Seller UX

- [ ] Seller can understand product outcome from first view.
- [ ] Seller can open benefits/inclusions without entering edit mode.
- [ ] Seller sees limits/exclusions before promising scope.
- [ ] Seller sees qualification/dependency warnings.
- [ ] Admin can still edit through the canonical Sales Catalog authority.

### Customer pricing UX

- [ ] Package choice is understandable at card level.
- [ ] Full scope is discoverable without clutter.
- [ ] Tooltips are short and non-critical.
- [ ] Material limits/exclusions are not tooltip-only.
- [ ] Mobile/touch works without hover.
- [ ] Keyboard/focus behavior works.
- [ ] Public comparison highlights real differences.

### Quotation

- [ ] New quote snapshots the sold definition.
- [ ] Existing sent/accepted quote does not change when catalog changes.
- [ ] Inherited package scope is flattened/resolved.
- [ ] Optional add-ons remain clearly optional until selected.
- [ ] Timeline snapshots match the quoted calculation.
- [ ] Part 10A reconciliation continues to work.
- [ ] Part 10B is not accidentally enabled.

### Delivery handoff

- [ ] Accepted scope is available to onboarding/delivery.
- [ ] Client requirements/dependencies are visible.
- [ ] Definition of done/acceptance expectations are available.
- [ ] No delivery team member has to reverse-engineer marketing wording.

---

## 23. Things this implementation must NOT do

1. Do not create `sales_products_v2`.
2. Do not regenerate product IDs.
3. Do not casually rename existing product codes.
4. Do not create a second Sales Catalog editing authority.
5. Do not create a second public pricing data source.
6. Do not create a second Seller Guidance tooltip system.
7. Do not create a second Package Fit system.
8. Do not create a second quotation editor or snapshot engine.
9. Do not store generic catalog definitions in deal-specific Scope Conditions/Promises.
10. Do not expose seller-only notes through `public_details`/public RPCs.
11. Do not put critical exclusions/price/timeline terms only inside tooltips.
12. Do not make all 37 add-ons public automatically.
13. Do not auto-quote Package Fit `Possible` add-ons.
14. Do not promise SEO rankings/indexing outcomes by delivery date.
15. Do not add all add-on durations together blindly.
16. Do not rewrite accepted quotation meaning after catalog edits.
17. Do not silently resolve unresolved business-policy conflicts.
18. Do not enable Part 10B final send enforcement as a side effect.
19. Do not perform unrelated cleanup/refactoring during catalog work.
20. Do not rely on this document's baseline without re-checking current `main`/DB first.

---

## 24. Current progress ledger

| Work item | State |
|---|---|
| Catalog research / conversion + scope architecture | ✅ Complete |
| Live integration impact audit | ✅ Complete as of this document baseline |
| Current seller/public/quote architecture mapped | ✅ Complete as of this document baseline |
| Parallel-development collision rules documented | ✅ Complete |
| Handoff/resume blueprint | ✅ Complete |
| Canonical metadata schema implementation | ⬜ Not started |
| Package content corrections / normalization | ⬜ Not started |
| Discovery/Care completion | ⬜ Not started |
| 37 add-on definitions | ⬜ Not started |
| Seller catalog UX enhancement | ⬜ Not started |
| Public pricing UX enhancement | ⬜ Not started |
| Quotation scope/version snapshot enhancement | ⬜ Not started |
| Delivery handoff enhancement | ⬜ Not started |
| Final rollout QA | ⬜ Not started |

---

## 25. Resume-from-here instructions

If development stops and another developer/agent continues later, follow this exact order:

1. **Read this entire document.**
2. Read:
   - `docs/crm-seller-guidance-tooltips-part-3-5.md`
   - `docs/crm-sales-package-fit-part-6.md`
   - `docs/crm-sales-validation-escalation-part-7.md`
   - `docs/crm-sales-requirements-confirmed-proposal-readiness-part-8.md`
   - `docs/crm-sales-scope-conditions-promise-register-part-9.md`
   - `docs/crm-sales-quotation-reconciliation-part-10a.md`
   - `docs/crm-sales-quotation-reconciliation-part-10a-hardening.md`
3. Fetch current `main` SHA and compare it with this document's pre-document baseline.
4. Review every commit/migration touching areas in the Integration Impact Map since the baseline.
5. Review relevant open PRs.
6. Re-query live `sales_products`, quotation schema, and public/catalog/quotation RPC definitions.
7. Confirm no one already created the metadata/inclusion/versioning structures proposed here.
8. Resolve the outstanding business decisions in Section 18 before changing contradictory customer-facing facts.
9. Start **Phase 1 only**.
10. Keep changes additive and backward compatible.
11. Verify Phase 1 completely before populating all 45 products.
12. Update this document's progress ledger and add a dated changelog entry after every completed phase.

Do not skip directly to making the public Pricing page prettier. The data model and canonical scope must be correct first, otherwise presentation work will duplicate ambiguity.

---

## 26. Future implementation output expected at the end of each phase

Every implementation phase should end with a factual completion report containing:

- files changed;
- migrations/RPCs changed;
- tables/columns affected;
- products affected;
- tests/checks run;
- live verification performed;
- known remaining items;
- confirmation that no duplicate authority was created;
- confirmation that parallel-development state was rechecked;
- updated progress ledger.

Only mark an item `✅ Complete` after direct verification.

---

## 27. Changelog

### 2026-09-11 — Blueprint created

- Re-audited current `main` at pre-document SHA `c14cbfbbe9b58008f119c5d0ae67d592f0041c3b`.
- Re-audited live Supabase catalog/quotation relationships.
- Confirmed 45 active products and no duplicate product codes.
- Confirmed all 37 add-ons remain definition-incomplete and non-public.
- Confirmed Sales Catalog is the sole Admin editing surface for current catalog values.
- Confirmed Public Pricing Admin is read-only health/verification.
- Confirmed public Pricing uses `get_public_sales_catalog()` → public service → pricing pages.
- Confirmed quotation snapshotting already exists for identity/description/client expectations/timeline/configuration, but there is no dedicated full scope snapshot today.
- Confirmed `quotation_presentation_payload()` returns frozen quotation data rather than current live catalog records.
- Confirmed current product IDs/codes are referenced by quotation and multiple downstream systems and therefore must remain stable.
- Confirmed existing Seller Guidance and Package Fit architectures should be reused rather than duplicated.
- Confirmed at the 2026-09-11 blueprint baseline that Part 10A was current and Part 10B final quotation-send enforcement remained disabled; Part 10B was activated later through its separate reviewed release.
- No catalog data, database schema, RPC behavior, pricing UI, seller UI, quotation behavior, or public customer behavior was changed as part of creating this planning document.
