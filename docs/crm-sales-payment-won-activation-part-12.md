# Part 12 — Awaiting Advance Payment + Verified Payment → Won + Sale Activation Integrity

## Status

Implementation branch: `part12-payment-won-sale-activation-integrity`

Starting main SHA: `d72d70c7ee1c3a4a5fec3095d36314bf7d496045`

Starting production truth:
- final quotation Send gate: ACTIVE
- policyVersion: 2
- snapshotSchemaVersion: 2
- custom migration ledger: 690 rows
- custom max migration: `20260920123000`
- payments: 5
- verified payments: 1
- Awaiting Advance Payment opportunities: 1
- Won opportunities: 1
- clients: 2
- projects: 1
- client onboardings: 1
- commissions: 1

## Architecture decision

Part 12 extends the existing commercial truth. It does **not** create a second payment, Won, Client, Project, Commission, onboarding, or follow-up system.

Canonical sources remain:
- Opportunity lifecycle: `crm_opportunities`
- Customer acceptance: `quotations.status='Accepted'` with `accepted_at IS NOT NULL`
- Payment request / settlement truth: `payments`
- Payment Follow-Up: `crm_activities`
- Client: `clients`
- Commission: `commission_entries`
- Delivery activation: `projects`
- Onboarding: `client_onboardings`
- CRM history: existing audit/event infrastructure

The existing activation chain is reused:
`verify_payment_atomic(...)` → Won → Client reuse/create → Commission → Project → Client Onboarding.

No business-state backfill is performed by the Part 12 migration.

## Gaps closed

### Payment verification authority

The existing protected verification path remains authoritative. Part 12 additionally prevents direct browser/table writes from forging:
- `Verified`
- `Partially Paid`
- `amount_paid`
- `verified_at`
- `verified_by`

The protection trigger now covers INSERT and UPDATE. Admin verification remains through the canonical RPC; trusted gateway settlement remains the existing service path.

Partial payment remains `Partially Paid` and returns before Won/Project activation.

### Won authority

Won is no longer available as a manual lifecycle result merely because an older qualifying verified payment exists.

A trusted transaction-local context is set only by `verify_payment_atomic(...)` while processing a qualifying Advance/Full Payment. The opportunity guard requires that context plus:
- same Opportunity,
- canonical Payment,
- `status='Verified'`,
- `payment_type IN ('Advance','Full Payment')`,
- same Accepted quotation,
- non-null `accepted_at`.

The protected path derives `stage='Won'`, `status='Won'`, and `won_at`.

Historical Won rows remain historical truth; Part 12 does not invent an Un-Won model.

### Awaiting Advance Payment authority

Entering Awaiting Advance Payment requires a canonical Accepted quotation for the same Opportunity and non-null `accepted_at`.

The automatic payment-plan path applies the same acceptance boundary before it creates/uses milestone requests or moves the opportunity to Awaiting Advance Payment.

### Lineage / cross-client protection

Qualifying verification fails closed if:
- Payment quotation/opportunity lineage conflicts;
- Opportunity, accepted Quotation and Payment contain conflicting non-null Client ids;
- the resolved Client id does not exist.

The same Client id is then linked back to the canonical Opportunity, accepted Quotation and Payment.

### Idempotent activation

Existing uniqueness remains authoritative:
- one Project per `source_opportunity_id`;
- one Client Onboarding per `project_id`;
- one Commission entry per `payment_id`.

Existing project/onboarding/commission functions are reused rather than replaced.

## Derived sale-activation read model

Part 12 adds no business table. It adds bounded staff read RPCs:
- `crm_get_sale_activation_state(uuid)`
- `crm_get_sale_activation_queue()`

They derive operational truth from canonical records and expose:
- accepted quotation context;
- qualifying payment type/status;
- amount due / amount paid / outstanding amount;
- due date and overdue state;
- whether the existing payment request represents an external wait;
- canonical Payment Follow-Up activity where one exists;
- exact next action / remediation;
- blockers;
- Won timestamp/state;
- Client link;
- Project activation;
- Client Onboarding activation;
- Commission creation.

The Seller read model does not expose payment URLs, provider settlement ids, provider tokens, or verification actor id. Admin may see the protected verification actor id.

Seller access reuses `sales_crm_access_ready()` and salesperson ownership. Admin/Project Manager team visibility reuses existing role helpers.

## External-wait rule

The current production Awaiting Advance Payment opportunity is already a legitimate represented external wait: an Accepted quotation has a canonical Advance payment request, due date and secure checkout route.

Part 12 does not fabricate a CRM Activity merely to satisfy an internal rule. If a real `Payment Follow-Up` exists, it is shown from `crm_activities`; otherwise the next action truthfully describes the customer-payment wait and due date. If the payment becomes overdue, the exact remediation is surfaced.

## UI integration

The existing surfaces are extended:
- CRM Pipeline cards
- Opportunity drawer
- Seller Command Center
- Payments Manager

They show canonical payment state, outstanding amount, due/overdue text, exact next action, accepted quotation navigation, and Won activation status.

Seller receives no Verify Payment authority and no manual Won action.

Admin verification remains in the canonical Payments workflow.

## Security

- SECURITY DEFINER functions use fixed search paths.
- read RPCs are revoked from `public` / `anon` and granted to `authenticated`.
- canonical table RLS remains enabled.
- server actor/time remains authoritative.
- direct Payment verification evidence is protected.
- direct Won writes are protected.
- direct Awaiting Advance Payment writes require canonical acceptance.
- cross-opportunity / cross-client activation conflicts fail closed.
- no browser service-role secret is introduced.

## Migration

Repository migration:
- version: `20260920150000`
- name: `crm_sales_payment_won_activation_part_12`
- file: `supabase/migrations/20260920150000_crm_sales_payment_won_activation_part_12.sql`

The exact production checksum is recorded in the final release evidence after canonical migration application.

## Test and release gates

Focused repository tests:
- `tests/security/crm-sales-payment-won-activation-part-12.test.mjs`
- `tests/security/crm-sales-payment-won-activation-part-12-matrix.test.mjs` — exactly 87 named SOP cases
- `tests/security/part12-authenticated-production-ui.test.mjs`
- `npm run test:crm-part12`

Regression:
- Part 10A
- Part 10B
- Part 11
- full `npm test`
- TypeScript `npm run lint`
- production build

Production:
- `npm run production:verify-part12`
- `npm run production:verify-part12-ui`

The existing authenticated production deploy gate chains Part 12 QA after Part 11 QA, so a Part 12 authenticated failure fails the normal production deployment.

## Authenticated production QA design

Production UI QA is deliberately non-destructive.

Seller:
- uses the approved synthetic `sales.demo@profoxwebdesigner.test` identity;
- verifies the real existing Awaiting Advance Payment record;
- verifies accepted quotation and Payment routes;
- verifies overdue text is explicit;
- verifies no Admin verification action;
- verifies Won is not manually enabled;
- validates desktop/mobile and keyboard focus.

Admin:
- uses an existing confirmed active Admin identity;
- verifies team Pipeline visibility;
- verifies the same activation state;
- verifies the protected Admin Payment verification action is reachable;
- does **not** execute verification.

Before/after snapshots compare canonical Payment and Opportunity state plus Client/Project/Onboarding/Commission/Activity counts. The QA fails if business truth changes.

No real Payment is verified for QA. No real Opportunity is marked Won for QA. No fake customer/deal/payment/project/onboarding record is created.

## Final release evidence

### Repository / merge lineage

- Part 12 implementation PR: `#125`
- exact PR head: `9dde884078882dc51d97b0d62e3b9c0d9a7fca08`
- trusted PR CI: ProFox CRM CI `#890 / 35499841152` — SUCCESS
- merge commit / production main: `a15c4e87e9630d68e9f9a8d3183dc82051260214`
- trusted merged-main CI: ProFox CRM CI `#891 / 35499950557` — SUCCESS

The merged-main pipeline passed:
- TypeScript
- migration integrity
- Talent Partner/full security regression suite
- exact 87-case Part 12 matrix
- Part 10A / Part 10B / Part 11 regressions
- browser launch-readiness
- verifier syntax checks
- production dependency audit
- production build

### Production migration

Canonical Part 12 migration:
- version: `20260920150000`
- name: `crm_sales_payment_won_activation_part_12`
- exact SHA-256: `ee75cd5c55250a278e2187a945cfa64f732343da08b6ecc674fb945c63375fcb`
- production ledger row: present exactly once
- baseline: `false`

Production custom migration ledger after application:
- total rows: `691`
- max version: `20260920150000`
- four approved Part 10B forward-reconciliation rows remain present
- five superseded historical Part 10B rows remain absent
- repository lineage: `PENDING_NEW 0`, `BLOCKED_UNRESOLVED 0`

### Production deploy

Final Part 12 implementation deploy:
- workflow: `Deploy ProFox Production`
- run: `#362 / 35500046940`
- deployed SHA: `a15c4e87e9630d68e9f9a8d3183dc82051260214`
- Cloudflare Worker version: `0df9a0a2-6f07-447f-a18f-9d7316c3db76`

The deployment passed:
- checksum-verified migration application
- production database/integration readiness
- authenticated payment administration functions
- checkout/payment webhooks
- production build
- Cloudflare Worker deploy
- public Worker health
- deployed frontend/public-content verification
- unauthenticated browser smoke
- authenticated Part 11 Seller/Admin QA
- authenticated Part 12 Seller/Admin QA
- final production readiness

### Production readiness

Final production release verification reported:
- Part 10B readiness: `0 failure(s), 0 warning(s)`
- Part 11 readiness: `0 failure(s)`
- Part 12 readiness: `0 failure(s)`
- duplicate-system audit: PASS
- protected direct-write triggers: PASS
- Part 12 read-model ACLs: PASS
- RLS boundary: PASS
- activation idempotency constraints: PASS
- activation integrity: PASS
- Part 10B Send gate remains ACTIVE
- `policyVersion=2`
- `snapshotSchemaVersion=2`

### Authenticated production UI QA

Authenticated Part 12 QA completed in deploy #362.

Seller:
- Awaiting Payment state visible: PASS
- overdue text visible: PASS
- accepted quotation route present: PASS
- Payments route present: PASS
- no Verify Payment authority: PASS
- no enabled manual Won action: PASS
- Activities route reachable: PASS
- mobile layout: PASS
- keyboard focus: PASS

Admin:
- team Pipeline state: PASS
- same sale-activation truth visible: PASS
- canonical protected payment-verification route visible: PASS
- no payment verification was executed during QA

Production business-data immutability passed.

Before/after truth remained:
- payments: `5`
- verified payments: `1`
- opportunities: `2`
- Awaiting Advance Payment: `1`
- Won: `1`
- clients: `2`
- projects: `1`
- onboardings: `1`
- commissions: `1`
- CRM activities: `13`

No real Payment was verified for QA.
No real Opportunity was marked Won for QA.
No fake production business record was created.

### Independent post-deploy production audit

Read-only verification after deployment confirms:
- Awaiting Advance Payment without canonical acceptance: `0`
- Won without qualifying verified Advance/Full Payment: `0`
- Project without Won: `0`
- Onboarding without qualifying verified payment: `0`
- duplicate Part 12 business tables: `0`
- anon/public RLS policies on protected Part 12 tables: `0`
- RLS enabled on Payments, Opportunities, Clients, Projects and Client Onboarding

## Release status

**PART 12 — Awaiting Advance Payment + Verified Payment → Won + Sale Activation Integrity: COMPLETE.**

Repository implementation, trusted CI, canonical migration, production deployment, authenticated Seller/Admin QA, Part 10B/11 preservation, direct-write protection, idempotency, production activation integrity and business-data immutability are all complete.

**Part 13 has not started.**
