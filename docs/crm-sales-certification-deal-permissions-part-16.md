# Part 16 — Sales Academy / Certification + Deal-Complexity Permissions

## Release status

**PART 16 IMPLEMENTATION FOUNDATION COMPLETE — POLICY ACTIVATION REQUIRES EXPLICIT PRODUCT DECISION.**

The Part 16 implementation is deployed and production-verified. The exact Launch / Growth / Scale / Custom package-policy mapping, add-on mapping, and protected pipeline commitment-stage policy remain intentionally unapproved in production. Therefore:

- `criteriaApproved=false`
- `grantingActive=false`
- `enforcementActive=false`
- `productRules={}`
- `addonRules={}`
- `protectedCommitmentStages=[]`
- granular certification grants = `0`

This is the required fail-closed state from the Part 16 SOP. No current Seller authority was fabricated or reduced to make the release pass.

## Architecture decision

Part 16 reuses the existing ProFox Sales Academy, training progress, training reviews, Final Certification, applicant progression, Sales Catalog, Package Fit, Sales Validation, quotation approval, Pipeline, Part 10B final Send gate, and Parts 11–15.

Production architecture verified after release:

- active Sales-related training tracks: 2
  - `sales` — ProFox Sales Academy — 20 track modules
  - `sales_assessment_prep` — ProFox Sales Assessment Preparation Center — 10 track modules
- Sales Academy modules: 47 active / 47 total
- Sales Academy lessons: 447
- canonical `get_product_package_training` function: exactly 1
- active Final Certification module: exactly 1
- Final Certification state rows: 1
- Final Certification session rows: 1
- active linked Sales applicant rows: 1
- `workforce_capability_profiles` rows: 8; not used as Part 16 package-certification truth
- pre-existing package-level certification truth before Part 16: none
- Part 16 persistence decision: one small evidence/history table, `sales_certification_package_grants`, because no canonical granular package-certification grant authority previously existed
- duplicate Academy created: no
- duplicate Final Certification created: no
- duplicate product catalog created: no
- duplicate quotation system created: no

## Policy model

Canonical policy key:

`crm_sales_certification_deal_permission_policy_v1`

Current schema version: `2`  
Current policy version: `1`

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

The policy validator requires explicit rules for every active package and add-on before activation. It also hard-requires Custom to remain `CUSTOM_QUALIFICATION_CERTIFIED + QUALIFY_ONLY + Sales Validation`, and Scale policy to preserve explicit escalation. Because no approved exact mapping exists, production activation remains off.

## Canonical evaluator and enforcement boundaries

Canonical evaluator:

`crm_get_sales_certification_deal_permission(uuid,text,uuid,uuid)`

The evaluator is deterministic, server-authoritative and read-only. It derives from:

- existing Sales Academy readiness
- explicit Part 16 grant evidence
- current `sales_products`
- versioned Part 16 policy
- existing `crm_sales_validations`
- existing quotation approval evidence

Part 16 adds progressive server hooks at:

- quotation package/add-on item insert/update
- quotation pre-Send transition
- configured protected CRM pipeline stages
- policy update validation

These hooks remain inert while `enforcementActive=false`.

Part 16 does not replace:

- Package Fit recommendation
- Sales Validation
- quotation approval
- Part 10B final quotation Send readiness
- Payment verification
- Won authority
- Sales-to-Delivery handoff
- Part 15 human performance management

## Supervision and Custom / Scale boundaries

`SUPERVISED` reuses the existing quotation approval evidence. It does not create a second supervisor approval subsystem.

Custom is structurally constrained to qualification-only behavior under any future approved policy. It cannot become an independent technical commitment path and requires existing Sales Validation.

Scale policy cannot activate without explicit escalation.

Higher certification never bypasses existing Validation, quotation approval, Payment, Part 10B, or handoff rules.

## Admin and Seller surfaces

Admin route:

`/admin/sales-certification-permissions`

Admin can:

- view Seller general certification + granular package authority
- view immutable grant history
- manage versioned policy through the validated Admin-only RPC
- grant only when policy criteria are explicitly approved and grant issuance is active
- revoke a grant while preserving original grant evidence

Seller Command Center shows:

- general certification state
- current package certification status
- required certification
- configured permission mode
- staged rollout status
- remediation path to training / re-certification

Seller cannot:

- self-grant certification
- update policy
- invoke Admin certification view
- read another user’s private certification snapshot
- access grant evidence/private evaluator data

## Security

The Part 16 grant table has RLS enabled. Browser roles receive SELECT only; writes are RPC-only.

Part 16 RPCs use fixed `search_path`, deny anonymous execution where appropriate, and perform server-side Admin/self authorization.

The final Supabase advisor pass showed no Part 16-specific anonymous SECURITY DEFINER warning and no Part 16 missing-RLS-policy warning.

Current advisor notices relevant to Part 16 are:

- authenticated SECURITY DEFINER warnings for intentionally authenticated RPC surfaces. These RPCs are intentionally executable by `authenticated` because each function performs internal Admin/self authorization.
- unused-index INFO notices for the `granted_by` and `revoked_by` FK indexes. This is expected in the current zero-grant staged rollout.

Broader pre-existing project advisor findings remain outside Part 16 scope and were not changed solely to make this release pass.

## Migrations

Production ledger after release: `700`  
Max migration after release: `20260922171000`

Part 16 migration identities:

1. `20260922150000_crm_sales_certification_deal_permissions_part_16.sql`
   - SHA-256: `b6ea5ddba97c5b6018ecf77b0d788203c07ce0093f05ad2ac67b15aa6d2adbd7`
2. `20260922151000_crm_sales_certification_deal_permissions_part_16_performance_hardening.sql`
   - SHA-256: `9acada8a8ed1da6a97afbc949faef7ab40d1695dc7349cd43447eeab1585ee93`
3. `20260922170000_crm_sales_certification_deal_permissions_part_16_policy_completion.sql`
   - SHA-256: `0eb8d030c8925ecd2ae30cb7ddccc444a263731ae7721aee4695ca6fb35c5666`
4. `20260922171000_crm_sales_certification_deal_permissions_part_16_evaluator_completion.sql`
   - SHA-256: `7d69adcccc4156dde2170d2b38ca0967db6150df0f72613322dbcc7af8092747`

Current repository lineage after release:

- `PENDING_NEW=0`
- `BLOCKED_UNRESOLVED=0`

## Verification

Part 16 exact matrix: **90 / 90 PASS**

Part 16 focused suite on final runtime source: **117 / 117 PASS**

Trusted merged-main CI:

- CI #960
- run `35699050245`
- exact runtime main SHA `2897f98553d5e5792e581d740c1d6f7f72e44b5f`
- TypeScript: PASS
- migration integrity: PASS
- full regression / `npm test`: PASS
- browser launch readiness: PASS
- verifier syntax: PASS
- dependency audit: PASS
- production build: PASS

Final production deployment:

- Deploy #386
- run `35699204714`
- exact runtime source `2897f98553d5e5792e581d740c1d6f7f72e44b5f`
- result: SUCCESS
- Worker version: `1f266f7d-c7b1-4640-8081-fe11755e988e`
- Part 16 release verifier: `0 failure(s)`
- authenticated Admin Part 16 QA: PASS
- authenticated Seller Part 16 QA: PASS
- mobile/keyboard QA: PASS
- Part 10B preservation: PASS at policy/schema `2/2`
- Parts 11–15 verification chain: PASS

Historical fail-closed release corrections are retained rather than hidden:

- Deploy #384 applied migrations and then stopped on a false-positive verifier scope. PR #150 corrected only verifier source selection; no SQL/runtime policy changed.
- Deploy #385 passed the release verifier and deployed the Worker, then stopped on a QA snapshot query that ordered `final_certification_state` by a nonexistent `id`. PR #151 changed the QA ordering to canonical `progress_id`; no business/runtime policy changed.
- Deploy #386 passed the complete chain.

## Production immutability

Authenticated Part 16 QA captured the same before/after state:

- granular Part 16 grants: 0 → 0
- Sales Academy progress rows: 54 → 54
- training review rows: 8 → 8
- Final Certification state rows: 1 → 1
- Final Certification session rows: 1 → 1
- linked Sales applicant rows: 1 → 1
- applicant stage: `Activated` → `Activated`
- active Sales users: 1 → 1
- Sales performance reviews: 16 → 16
- Leads: 6 → 6
- Opportunities: 2 → 2
- Activities: 13 → 13
- Quotations: 6 → 6
- Payments: 5 → 5
- Clients: 2 → 2
- Projects: 1 → 1
- handoff attempts: 0 → 0

No real Seller certification, Academy progress, Final Certification, applicant stage, performance review, opportunity, quotation, Payment, Project or handoff record was changed solely for Part 16 QA. No fake production business data was created.

## Part 10B and Parts 11–15 preservation

Part 10B after Part 16:

- `finalQuotationSendGateActive=true`
- `policyVersion=2`
- `snapshotSchemaVersion=2`

Parts 11–15 remain intact and passed the final production verification chain.

## PR chronology

- PR #147 — `feat(crm): add Part 16 Sales Certification deal permissions`
  - final head `89172ac2db487e76b18cfa6ee6e3982c211b1872`
  - merge `ff784efe430593cae44aa29d4ebcc9809edb7d77`
- PR #148 — `perf(crm): harden Part 16 grant access`
  - final head `79f1582ee336e179b1ad3150ddf3d080839d8cd3`
  - merge `0c536b4a3457d859ed930e266689188b204a5c9c`
- PR #149 — `feat(crm): complete Part 16 staged certification foundation`
  - final head `b587f696adb09cbb0d5db8c899351424e649c567`
  - merge `1063b51acbb56e6b6163c44cb6acda92bbdfe770`
- PR #150 — `fix(crm): scope Part 16 release verifier correctly`
  - final head `6da7781e798d6f648cdf0e1a239d1fe828c0450f`
  - merge `41efc68bc40ab5c33ca25c80881d3a0fd2f1fc1b`
- PR #151 — `fix(crm): align Part 16 authenticated QA with Final Certification schema`
  - final head `0bace398c20b59388eab43952eb8ef936ed1400a`
  - merge / final runtime main `2897f98553d5e5792e581d740c1d6f7f72e44b5f`

## Required 95-item developer report

01. Starting main SHA — `084aef48eff6ca3b5d0051b90e3eec9366075697`.
02. Actual implementation base SHA — `084aef48eff6ca3b5d0051b90e3eec9366075697`.
03. Migration ledger before — `696`.
04. Max migration before — `20260921190000`.
05. Part 10B gate before — ACTIVE.
06. Part 10B policyVersion — `2`.
07. Part 10B snapshotSchemaVersion — `2`.
08. Part 11 state — COMPLETE / preserved.
09. Part 12 state — COMPLETE / preserved.
10. Part 13 state — COMPLETE / preserved.
11. Part 14 state — COMPLETE / preserved.
12. Part 15 state — COMPLETE / preserved.
13. Existing Sales Academy architecture audit — reused; no replacement Academy.
14. Sales track module count — core `sales` track 20; `sales_assessment_prep` 10; 30 across the two active Sales-related tracks.
15. Product training reuse — canonical `get_product_package_training` retained exactly once; no duplicate product-training system.
16. Final Certification reuse — existing Sales `final-certification` module + `final_certification_state` + `final_certification_sessions` reused.
17. Applicant progression reuse — existing `applicants` linkage/stage reused; linked active Sales applicant remained `Activated`.
18. `workforce_capability_profiles` decision — audited but not used as package-certification truth; package authority requires explicit certification grant evidence.
19. Existing package-certification truth found? — NO.
20. Persistence decision — add one minimal evidence/history model for explicit granular package grants.
21. New certification-grant table? — YES: `sales_certification_package_grants`; justified because no canonical granular package-certification grant truth existed.
22. Duplicate Academy created? — NO.
23. Duplicate Final Certification created? — NO.
24. Certification policy key — `crm_sales_certification_deal_permission_policy_v1`.
25. Policy version — `1`; schema version `2`.
26. Enforcement activation state — OFF; `criteriaApproved=false`, `grantingActive=false`, `enforcementActive=false`.
27. Certification keys — `LAUNCH_CERTIFIED`, `GROWTH_CERTIFIED`, `SCALE_CERTIFIED`, `CUSTOM_QUALIFICATION_CERTIFIED`.
28. Hierarchy/inheritance behavior — explicit policy only; no implicit hierarchy. Add-ons may inherit only via configured `INHERIT_BASE_PACKAGE`.
29. Launch permission policy — infrastructure supported; exact production mapping not approved, therefore no active Launch rule.
30. Growth permission policy — infrastructure supported; exact production mapping not approved, therefore no active Growth rule.
31. Scale permission policy — infrastructure supported; any approved Scale rule must preserve explicit escalation; no active Scale mapping yet.
32. Custom Qualification policy — structurally constrained to `CUSTOM_QUALIFICATION_CERTIFIED + QUALIFY_ONLY + Sales Validation`; no active mapping yet.
33. Add-on complexity policy — configurable explicit behaviors; production `addonRules={}` until approved.
34. Canonical evaluator — `crm_get_sales_certification_deal_permission(uuid,text,uuid,uuid)`.
35. Permission modes — `INDEPENDENT`, `SUPERVISED`, `QUALIFY_ONLY`, `BLOCKED`.
36. Package Fit integration — recommendation remains independent commercial truth; Part 16 adds authority/remediation context only.
37. Pipeline integration — configurable protected commitment-stage server trigger; inactive while enforcement is off.
38. Quotation qualification integration — package/add-on quotation-item server trigger checks Part 16 authority when enforcement activates.
39. Part 10B Send integration — additive pre-Send Part 16 assertion; Part 10B remains final Send authority.
40. Supervision model — reuses existing quotation approval evidence; no second supervision subsystem.
41. Admin policy controls — versioned validated Admin-only RPC + existing `system_configuration` audit trigger.
42. Seller self-view — canonical read-only self-scope panel/RPC implemented.
43. Seller self-grant result — DENIED before mutation.
44. Anonymous result — private Part 16 RPC/table access denied; no Part 16-specific anonymous SECURITY DEFINER advisor finding.
45. Test-bypass isolation result — production evaluator/grant authority does not read Academy test bypasses.
46. Custom technical-commitment protection — qualify-only + Sales Validation required by policy validator.
47. Part 15 recertification boundary — Part 15 does not automatically grant/revoke Part 16 certification; human/admin policy remains separate.
48. Existing active Seller compatibility decision — preserve current authority with staged non-enforcement; do not fake backfill.
49. Granular certification backfill performed? — NO.
50. Fake certification created? — NO.
51. Migration version — Part 16 series `20260922150000`, `20260922151000`, `20260922170000`, `20260922171000`.
52. Migration filename — four files listed in the Migrations section above.
53. Migration checksum — four exact SHA-256 values listed above and verified in production.
54. `migrations:check` — PASS on trusted final CI.
55. Part 10A — unchanged by Part 16; no Part 16 replacement or bypass introduced.
56. Part 10B — PASS / ACTIVE / preserved at policy-schema 2/2.
57. Part 11 — PASS / intact.
58. Part 12 — PASS / intact.
59. Part 13 — PASS / intact.
60. Part 14 — PASS / intact.
61. Part 15 — PASS / intact.
62. Exact Part 16 matrix count — 90 / 90 PASS.
63. Part 16 focused suite — 117 / 117 PASS.
64. Full `npm test` — PASS in final trusted merged-main CI.
65. Security suite — PASS; RLS/RPC/self/Admin/test-bypass contracts covered. Advisor findings reviewed.
66. Lint / TypeScript — PASS.
67. Build — PASS.
68. PR number — implementation/release sequence #147, #148, #149, #150, #151.
69. PR final head — `0bace398c20b59388eab43952eb8ef936ed1400a` on PR #151.
70. Trusted CI — #960 / run `35699050245`: SUCCESS.
71. Merge result — all five Part 16 implementation/release PRs merged.
72. Final runtime main SHA — `2897f98553d5e5792e581d740c1d6f7f72e44b5f`.
73. Production migration result — SUCCESS; ledger 700; max `20260922171000`; four Part 16 migrations exact.
74. Production deploy — #386 / run `35699204714`: SUCCESS; Worker `1f266f7d-c7b1-4640-8081-fe11755e988e`.
75. Part 16 verifier — 0 failures, executed twice in final deploy.
76. Authenticated Seller QA — PASS, including self-scope, staged authority, remediation, denial paths, mobile/keyboard.
77. Authenticated Admin QA — PASS, including Academy/Final evidence, policy controls, zero-grant truth, mobile/keyboard; no mutation executed.
78. Academy data before/after QA — progress 54→54; reviews 8→8.
79. Final Certification data before/after QA — state 1→1; sessions 1→1.
80. Applicant stage before/after QA — `Activated`→`Activated`; linked applicant count 1→1.
81. Sales performance data before/after QA — reviews 16→16.
82. CRM business inventory before/after QA — Leads 6→6; Opportunities 2→2; Activities 13→13; Quotations 6→6; Payments 5→5; Clients 2→2; Projects 1→1; handoff attempts 0→0.
83. Real Seller certification changed solely for QA? — NO.
84. Real opportunity mutated solely for QA? — NO.
85. Real quotation sent solely for QA? — NO.
86. Fake production business data? — NO.
87. `PENDING_NEW` after — 0.
88. `BLOCKED_UNRESOLVED` after — 0.
89. Part 10B gate after — ACTIVE; policyVersion 2; snapshotSchemaVersion 2.
90. Parts 11–15 intact — YES; final production verification chain PASS.
91. Documentation updated — YES: this focused document plus `docs/sales-sop-system-implementation-spec.md`.
92. Future phase started? — NO.
93. Remaining policy ambiguity — exact approved production package mapping, add-on mapping, inheritance, supervision/validation requirements by product, and protected commitment stages.
94. Remaining Part 16 blocker — production policy activation only; implementation foundation has no remaining runtime/release blocker.
95. Final Part 16 status — **PART 16 IMPLEMENTATION FOUNDATION COMPLETE — POLICY ACTIVATION REQUIRES EXPLICIT PRODUCT DECISION.**

## Stop condition

No Part 17 / AI seller assistance / AI package selection / AI certification / AI Sales Validation / AI performance judgment / automatic employment decision / automatic commission change / unrelated Academy redesign has been started.

**PART 16 POLICY ACTIVATION BLOCKED — CONFIGURABLE CERTIFICATION INFRASTRUCTURE IS READY, BUT EXACT PRODUCTION DEAL-PERMISSION POLICY REQUIRES EXPLICIT PRODUCT APPROVAL.**
