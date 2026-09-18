# CRM Sales Part 10B.3 — Migration Lineage Truth Audit

Audit date: 2026-09-17

Status: **REPOSITORY AUDIT / FAIL-CLOSED HARDENING COMPLETE; PRODUCTION MIGRATION CONVERGENCE BLOCKED**

This record closes the safe, read-only Part 10B.3 audit work. It does **not** authorize `npm run migrations:apply`, custom-ledger reconciliation, SQL replay, final quotation-send gate activation, merge, or Part 11.

## Executive result

The authoritative production baseline is `20260831103000`. The current repository contains 689 migrations, of which 123 are post-baseline. Their lineage is fully classified for the Part 10B.3 safety decision:

- 110 `CUSTOM_LEDGER_EXACT`
- 8 evidence-backed native equivalents: 3 `NATIVE_EXACT` + 5 `NATIVE_CONTENT_EQUIVALENT`
- 0 `GENUINELY_PENDING_NEW`
- 5 `UNRESOLVED_PROVENANCE`

Because unresolved current provenance is non-zero, the migration runner must fail closed before any custom-ledger insert or SQL execution. Production apply, activation, and Part 11 remain blocked.

## Production facts reverified read-only

- Authoritative baseline: `20260831103000`
- Custom ledger rows: 676
- Custom ledger baseline rows: 566
- Custom ledger post-baseline rows: 110
- Custom ledger max version: `20260908100000`
- Native Supabase migration rows: 667 total
- Native Supabase post-baseline rows: 102
- Native Supabase max version: `20260916070455`
- `finalQuotationSendGateActive=false`
- policy version: 2
- snapshot schema version: 2
- required quotation snapshot columns: 3/3
- canonical RPC/function exact counts: assertion 1, capture 1, reconciliation 1, snapshot builder 1
- `anon`: assert/capture denied
- `authenticated`: assert/capture denied
- `service_role`: assert/capture allowed
- Scope Conditions: 0
- Promises: 0
- quotation sales coverage: 0
- captured historical sales snapshots: 0
- legacy Sent quotations without snapshot: 2

The 123 figure used elsewhere in this audit is the current repository **post-baseline migration-file count**, not the total native-ledger row count.

No production row, policy value, migration ledger row, schema object, fake CRM record, or quotation state was mutated by this audit.

## Current native-equivalent reconciliation mappings

The following eight mappings are executable reconciliation evidence only when all configured proof checks pass. They are not permission to bypass unresolved rows.

| Repository migration | Authoritative native migration | Proof |
| --- | --- | --- |
| `20260909103000_crm_sales_meeting_prep_part_4` | `20260909045346_crm_sales_meeting_prep_part_4` | `NATIVE_CONTENT_EQUIVALENT`, canonical SHA-256 `bb4678491d27b4e1f03a16f77de488d745c55cd84485715148be5747c9d4b897` |
| `20260909160000_crm_sales_package_fit_part_6` | `20260909084757_crm_sales_package_fit_part_6` | `NATIVE_CONTENT_EQUIVALENT`, canonical SHA-256 `2dad0ccd1bd1dfe04fae054e9c8217f424dcc511e15b800cd3e4ed4a56e31a17` |
| `20260909162000_crm_sales_package_fit_part_6_policy_hardening` | `20260909085018_crm_sales_package_fit_part_6_policy_hardening` | `NATIVE_CONTENT_EQUIVALENT`, canonical SHA-256 `fc7fe8f4f308b33cfe275f3888e220972d18109cc443167aa75ac1f44210df08` |
| `20260909194500_crm_sales_validation_queue_routing_part_7` | `20260909111815_crm_sales_validation_queue_routing_part_7` | `NATIVE_CONTENT_EQUIVALENT`, canonical SHA-256 `9ef9ce06da4f7168ba1f9d0ae2138ed64009b930182ef1833358177911022ee9` |
| `20260909195500_crm_sales_validation_advisor_hardening_part_7` | `20260909111835_crm_sales_validation_advisor_hardening_part_7` | `NATIVE_CONTENT_EQUIVALENT`, canonical SHA-256 `24830078bb4a72b200d7473907228dd2b1f23b1450c7fb3afdd60ee579384c86` |
| `20260916121000_crm_sales_final_quotation_send_gate_part10b_foundation` | `20260916063249_crm_sales_final_quotation_send_gate_part10b_foundation` | `NATIVE_EXACT` |
| `20260916123500_crm_sales_final_send_snapshot_forge_hardening` | `20260916070047_crm_sales_final_send_snapshot_forge_hardening` | `NATIVE_EXACT` |
| `20260916124500_crm_sales_final_send_assertion_privilege_hardening` | `20260916070455_crm_sales_final_send_assertion_privilege_hardening` | `NATIVE_EXACT` |

For each of the five content-proof rows, production `supabase_migrations.schema_migrations` has the expected version/name, exactly one stored SQL statement, and the canonical production SQL digest equals the configured digest above.

## Unresolved current migrations — hard blockers

These five current repository files have same-name candidate native rows, but exact deterministic provenance is not proven. Same-name/schema similarity is insufficient and must never authorize custom-ledger reconciliation or SQL replay.

1. `20260909110000_crm_sales_meeting_management_closeout_part_5` → candidate `20260909063552_crm_sales_meeting_management_closeout_part_5`
2. `20260909193000_crm_sales_validation_escalation_part_7` → candidate `20260909110302_crm_sales_validation_escalation_part_7`
3. `20260909200000_crm_sales_requirements_confirmed_proposal_readiness_part_8` → candidate `20260910024728_crm_sales_requirements_confirmed_proposal_readiness_part_8`
4. `20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening` → candidate `20260910024912_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening`
5. `20260915154800_sales_catalog_clarity_repository_reconciliation` → candidate `20260915102211_sales_catalog_clarity_repository_reconciliation`

Required action remains `BLOCK_UNRESOLVED` until authoritative source/checksum evidence exists.

## Historical alias cleanup

The pre-audit reconciliation configuration had 30 executable-looking aliases. The audit established that only three of those original entries corresponded to current executable exact mappings; the other 27 are stale/orphan historical mappings and are now passive history only. Five additional current migrations were admitted only after deterministic content proof; five other current candidates were explicitly recorded as unresolved blockers.

Therefore the hardened configuration tracks 40 provenance rows but they must not be described as “40 original aliases”:

- 8 active current mappings
- 27 historical/non-executable aliases
- 5 unresolved current blockers

Historical aliases cannot become executable merely because a matching logical name exists in native history.

## Fail-closed implementation completed

Part 10B.3 hardens the production migration path so that:

- the current repository manifest is classified after the authoritative baseline;
- existing custom-ledger exact rows are skipped as already recorded;
- active native mappings require configured authoritative identity and, where required, deterministic local/native content proof;
- known unresolved current migrations are blocked before ledger insertion or SQL execution;
- native version/name collisions, name drift, content drift, ambiguous native statements, missing native evidence, and duplicate config fail closed;
- historical aliases are non-executable evidence only;
- only genuinely new, unlisted future migrations can enter the normal transactional SQL-apply path;
- successful native reconciliation, when eventually safe to run, is transactional and records the current repository version/name/checksum without replaying native SQL;
- the Part 10B release-readiness verifier uses the same current-manifest lineage model.

No migration SQL file was renamed, deleted, rewritten, or manually replayed.

## Verification / deployment integrity

Starting `main`: `0be12a91cc096ecb7c67c1d5e9858bdac18967b4`

Audit branch: `part10b3-migration-lineage-truth-audit`

PR: #117

On closure head `9c63891963e9e85268e0c9d6c20e5391f9281b01`, GitHub Actions `verify` run 806 / run ID `35218111072` completed with `runner_id=0` and `steps=[]`. The correct conclusion is:

**GITHUB ACTIONS DID NOT EXECUTE REPOSITORY CODE.**

This is not evidence that repository tests failed. It is also not acceptable evidence that they passed.

Cloudflare Workers build/check for that closure head succeeded:

- build ID `933815b8-c909-48bd-a49e-a7c44110b2f8`
- version ID `efbf6b5f-5df7-46bb-afdb-76d13c516f01`
- branch preview generated successfully

Cloudflare preview success does not replace the trusted GitHub CI prerequisite and does not authorize production migration or activation.

Current `main` remained `0be12a91cc096ecb7c67c1d5e9858bdac18967b4` during the final audit pass. Production deployment integrity is therefore not promoted to “verified” by this audit.

## Required 46-field final report

1. **Starting main SHA:** `0be12a91cc096ecb7c67c1d5e9858bdac18967b4`.
2. **Audit branch name:** `part10b3-migration-lineage-truth-audit`.
3. **Fresh repository migration count:** 689 current migration files.
4. **Database baseline:** `20260831103000`.
5. **Repository post-baseline migration count:** 123.
6. **Current custom ledger row count:** 676.
7. **Current custom ledger max version:** `20260908100000`.
8. **Current native ledger row count:** 667 total; 102 post-baseline; max native version `20260916070455`.
9. **`CUSTOM_LEDGER_EXACT` count + list:** 110; exact list is in the appendix below.
10. **`NATIVE_LEDGER_EQUIVALENT` count + list:** 8 total — five `NATIVE_CONTENT_EQUIVALENT` plus three `NATIVE_EXACT`; exact list is above.
11. **`GENUINELY_PENDING` count + list:** 0; none.
12. **`UNRESOLVED_PROVENANCE` count + list:** 5; exact blocker list is above.
13. **Current exact alias count:** 3 original exact aliases; hardened active mapping count is 8 after five additional content-proven mappings.
14. **Stale/orphan alias count:** 27.
15. **Stale/orphan aliases removed/rejected:** all 27 removed from executable reconciliation and retained only as passive historical evidence.
16. **Active native-equivalent reconciliation mappings added:** 5 new deterministic content-proof mappings; together with 3 existing exact Part 10B mappings = 8 active mappings.
17. **Collisions/drift failures investigated:** yes; missing native identity, unexpected version/name, local name drift, local content drift, native content drift, ambiguous statement representation, duplicate config, and unresolved candidate cases all fail closed.
18. **Whether ledger quarantine/zero-trust-read path changed:** no production ledger/quarantine state changed; repository read/audit behavior was hardened only.
19. **Whether baseline changed:** no; authoritative production baseline remains `20260831103000`.
20. **Reconciliation script/transaction added:** yes; current-manifest audit plus transactional native-ledger reconciliation exists in repository code, but was not run against production due blockers.
21. **Mappings reconciled into custom ledger:** 0.
22. **Files actually applied:** 0.
23. **Applied count:** 0.
24. **Final custom ledger row/max:** 676 rows; max `20260908100000`.
25. **Final `migrations:status`:** production convergence blocked by 5 `UNRESOLVED_PROVENANCE` rows; trusted apply intentionally not run.
26. **Backend deploy result:** no Part 10B.3 production backend deployment authorized; production promotion remains blocked by CI/migration prerequisites.
27. **Migrations production result:** NOT RUN / BLOCKED by unresolved provenance.
28. **Frontend deploy result:** Cloudflare branch preview build succeeded; no Part 10B.3 production activation/promotion authorized.
29. **Frontend integrity result:** branch build evidence exists, but trusted release integrity is not satisfied because GitHub Actions executed no repository steps.
30. **Final policy version:** 2.
31. **Final snapshot schema version:** 2.
32. **Final send gate:** `finalQuotationSendGateActive=false`.
33. **Final canonical RPC exact counts/security:** assertion 1, capture 1, reconciliation 1, snapshot builder 1; anon/authenticated denied assert/capture; service_role allowed.
34. **Final notify/PDF fail-closed posture:** unchanged by Part 10B.3; no bypass or alternate quotation-send/PDF path was introduced and existing server authority remains in force.
35. **Scope Conditions count:** 0.
36. **Promises count:** 0.
37. **Quotations sales coverage count:** 0.
38. **Historical sales snapshots count:** 0.
39. **Legacy Sent quotations without snapshots:** 2.
40. **Files changed:** 6 — `scripts/migrate-production.mjs`, `scripts/native-migration-reconciliation.mjs`, `scripts/verify-part10b-release-readiness.mjs`, `tests/security/production-migration-native-reconciliation.test.mjs`, `docs/crm-sales-part10b3-migration-lineage-truth-audit.md`, and `docs/.crm-sales-part10b-implementation-complete`.
41. **Commits created:** 7 total on PR #117 after this factual native-ledger-count correction.
42. **PR number:** #117.
43. **PR status/review state:** open draft; no requested reviewers are present in current PR metadata; intentionally not merge-ready while blockers remain.
44. **Merge result/post-merge main SHA:** not merged; `main` remains `0be12a91cc096ecb7c67c1d5e9858bdac18967b4` at audit time.
45. **Whether Part 11 eligible:** no.
46. **Exact remaining blockers:** five unresolved current migration provenance rows; GitHub Actions zero-runner/zero-repository-step condition; therefore trusted `migrations:apply`, custom-ledger convergence, compatible production deployment/integrity proof, final activation, authenticated production QA, merge, and Part 11 remain blocked.

## Appendix A — 110 `CUSTOM_LEDGER_EXACT` post-baseline migrations

```text
20260831120000_payment_gateway_launch_readiness
20260831121000_production_test_access_and_rpc_acl_hardening
20260831122000_retire_all_synthetic_staff_profiles
20260831124232_razorpayx_employee_bulk_payouts
20260831143949_stabilize_public_forms_booking_providers
20260831154914_restrict_public_booking_to_sales_only
20260831173000_admin_team_dashboard_preview
20260831180000_isolated_test_staff_login_audit
20260831190000_restore_full_departmental_test_accounts
20260831191000_reset_test_seller_stale_calendar_connection
20260831192000_fix_public_booking_avatar_source
20260901043920_visitor_chat_relationship_continuity
20260901044808_visitor_chat_optional_feedback
20260901050502_preserve_google_oauth_connection_on_sync_errors
20260901051553_visitor_chat_recovery_indexes
20260901052140_visitor_chat_identity_integrity_hardening
20260901053838_package_self_generated_seller_rate
20260901055943_visitor_chat_production_closure
20260901071923_fix_zoho_mailbox_canary_candidate_ambiguity
20260901090000_security_project_scoped_internal_chat
20260901090100_harden_internal_chat_audit_append_only
20260901110000_complete_project_chat_authorization
20260901123000_optimize_secure_project_chat
20260901123100_prevent_project_chat_realtime_read_loop
20260901130000_restrict_professional_mailboxes_to_sales_and_management
20260901141500_professional_zoho_crm_email_send
20260901180000_seller_professional_email_inapp
20260901184500_decouple_sales_crm_from_professional_mail_setup
20260902065231_crm_pipeline_communication_timeline_continuity
20260902065714_crm_conversation_lead_identity_integrity
20260902074500_unified_customer_inbox_resolution
20260902084840_meeting_customer_access_and_followup_foundation
20260902085023_profox_meeting_email_template_library
20260902085305_universal_meeting_communication_automation
20260902085336_fix_meeting_communication_payload_refresh
20260902090000_fix_sales_setup_optional_email_credential_gate
20260902092007_meeting_communication_completion_and_customer_self_service
20260902093000_meeting_communication_final_hardening
20260902094500_brevo_delivery_feedback_and_suppression
20260902101549_sales_started_customer_chat_magic_link
20260902102202_sales_chat_launch_routing_and_failure_alerts
20260902102843_client_portal_unified_relationship_communication
20260902103000_customer_communication_access
20260902103222_sales_chat_suppression_and_start_fail_closed
20260902104500_whatsapp_business_channel
20260902105500_whatsapp_safety_and_templates
20260902110000_customer_communication_capability_alignment
20260902110500_whatsapp_empty_config_defaults
20260902111000_unified_channel_capabilities
20260902111500_whatsapp_identity_edge_cases
20260902112100_seller_professional_email_oauth_onboarding
20260902120000_whatsapp_unmatched_resolution_index
20260902145558_communication_attachments_client_portal_and_email_r2_bridge
20260902154500_sales_chat_read_receipts_and_unread_tracking
20260903052641_quotation_acceptance_staff_notifications
20260903063353_chat_first_seller_communication_policy
20260903082505_central_zoho_calendar_meeting_service_foundation
20260903082658_central_zoho_provider_routing_and_deduplication
20260903092250_central_zoho_runtime_flow_guards
20260903093841_central_zoho_staff_launch_and_visibility
20260903110000_harden_central_zoho_future_meeting_queue
20260903112519_quotation_payment_policy_and_customer_consent
20260903113217_separate_internal_and_client_visible_project_attachments
20260903113951_align_secure_communication_attachment_types
20260903121000_razorpay_test_checkout_and_customer_payment_actions
20260903121532_close_legacy_public_quotation_response_bypass
20260903174500_close_legacy_public_quotation_response_bypass
20260903180000_auto_custom_quotation_payment_milestones
20260903180935_fix_quotation_public_link_token_consistency
20260903220000_quotation_profitability_access_scope
20260903223000_custom_primary_quotation_payment_schedule_fallback
20260904095014_scope_aware_client_onboarding
20260904100016_scope_aware_onboarding_snapshot_backfill
20260904102059_future_safe_scope_aware_onboarding_catalog_defaults
20260904102646_scope_aware_onboarding_catalog_edit_reconciliation
20260904103000_enrich_public_payment_checkout_context
20260904105019_explicit_service_family_onboarding_templates
20260904105933_explicit_service_family_edit_reconciliation
20260904110323_deduplicate_onboarding_field_library
20260904111859_onboarding_core_discovery_mandatory
20260904112339_refresh_open_onboarding_field_schemas
20260904125851_seller_onboarding_followup_and_portal_verification
20260904130946_harden_seller_onboarding_handoff
20260904140000_payment_policy_refund_and_legal_layout
20260904170000_public_payment_secure_sales_chat_bridge
20260905033454_sales_to_production_lifecycle_clarity
20260905040655_fix_sales_handoff_brief_response_count
20260905042321_seller_professional_email_global_toggle
20260905050000_complete_seller_lifecycle_experience
20260905070000_seller_monthly_payment_verified_won_pipeline
20260905092459_content_writer_dynamic_application_form
20260905103500_make_client_portal_claim_idempotent
20260905120000_content_writer_career_page_growth_refresh
20260905133000_align_sales_requirements_onboarding_delivery_flow
20260905133500_add_missing_sales_requirements_remediation
20260905150000_uiux_application_form_v2
20260905162000_uiux_application_form_v2_backfill
20260905170000_content_writer_video_link
20260906031401_central_zoho_mail_instance_authorization
20260906031458_central_zoho_staff_service_status
20260906052500_central_zoho_error_recovery
20260906084500_content_recruitment_explicit_reviewer_permission
20260906090000_content_writer_recruitment_rubric_score_hardening
20260906091000_content_recruitment_private_asset_authorization
20260906091600_content_writer_portfolio_deadline_extension_email
20260906092500_content_writer_portfolio_naming_normalization
20260906113000_crm_sales_discovery_foundation_part_1
20260906113500_crm_sales_discovery_foundation_hardening
20260906123000_crm_sales_requirements_part_2
20260908100000_crm_sales_probing_discovery_part_3
```

## Closure decision

Part 10B.3 has completed the repository-side migration-lineage truth audit and fail-closed hardening. It has **not** completed production migration convergence.

Required state after this audit:

- `migrations:apply`: **BLOCKED**
- custom-ledger reconciliation: **0 rows written**
- migration SQL replay: **0 files**
- final quotation-send gate: **OFF**
- production activation: **BLOCKED**
- PR #117 merge: **BLOCKED / keep draft**
- Part 11: **NOT ELIGIBLE / MUST NOT BEGIN**

## Part 10B.4 — Final Provenance Resolution

Part 10B.4 investigation and fail-closed repository hardening are **COMPLETE**. Authoritative provenance resolution is **BLOCKED** for five migrations because no trusted PostgreSQL/PL/pgSQL token-aware parser/tokenizer is available to prove executable-token equivalence. This is the required safe outcome: unresolved evidence is not converted into an executable mapping.

No migration SQL file was changed, renamed, deleted, regenerated, or replayed. No production write occurred. `npm run migrations:apply` was not run. The final quotation Send gate remains off. PR #117 remains draft/unmerged and Part 11 remains blocked.

### Completion status

| Requirement | Status | Result |
| --- | --- | --- |
| Re-investigate all five blockers | **COMPLETE** | All five rechecked against exact repository bytes, live native ledger evidence, Git history, and original implementation PRs. |
| Repository raw SHA-256 evidence | **COMPLETE** | Exact SHA-256 values over GitHub repository file bytes recorded below. |
| Native raw SHA-256 evidence | **COMPLETE** | Exact SHA-256 values over each single stored native statement reverified read-only in production. |
| Native version/name + statement count | **COMPLETE** | All five candidates exist at the expected version/name and each has exactly one stored statement. |
| Repository statement count | **BLOCKED BY TOOLING** | Not reported as a guessed number. No trusted SQL/PLpgSQL parser is available to count executable statements safely across dollar-quoted bodies/dynamic SQL. |
| Significant-token equivalence proof | **BLOCKED BY TOOLING** | No trusted PostgreSQL/PLpgSQL tokenizer/parser available; no regex/fuzzy/home-grown proof is accepted. |
| Git creation commit/blob | **COMPLETE** | Exact commits/blobs recorded below. |
| Later file modification check | **COMPLETE** | Original implementation PR-head blob for each file is identical to the current blob. |
| PR history | **COMPLETE** | Original implementation PRs #100, #102, #103 and #109 identified and recorded. |
| Commit immediately before/after native application | **INVESTIGATION COMPLETE / NOT AUTHORITATIVELY ATTRIBUTABLE** | Native ledger records version/name/statements, not a Git commit SHA or authoritative application timestamp. Migration-version timestamps are not treated as proof of Git state. |
| Exact mismatch classification | **COMPLETE** | Raw mismatch proven; semantic/token mismatch intentionally remains unknown where parser-grade proof is unavailable. |
| Fail-closed runtime behavior | **COMPLETE IN SOURCE** | All five remain `UNRESOLVED_PROVENANCE` / `BLOCK_UNRESOLVED`; migration planning throws before reconciliation insert or SQL execution. |
| Requested token-safety regression matrix | **COMPLETE IN SOURCE** | Added fail-closed coverage for cases 1–16 plus explicit current-drift and unsupported-token-proof checks; existing tests cover version/name drift, unresolved no-execution, and proven reconciliation without replay. |
| Focused test execution | **BLOCKED BY TRUSTED CI** | Source coverage is present; final-head GitHub Actions must execute repository steps before a trusted pass can be claimed. |
| Production migrations / activation | **CORRECTLY NOT PERFORMED** | `migrations:apply` not run; gate remains false. |
| Merge / Part 11 | **CORRECTLY BLOCKED** | PR #117 stays draft/unmerged; Part 11 must not begin. |

### Token/parser method decision

The repository dependency set contains no PostgreSQL/PL/pgSQL parser or tokenizer suitable for this proof. No `pglast`, `libpg_query`/`pg_query`, trusted PostgreSQL-aware JavaScript parser, or equivalent safe arbitrary migration-source parser is available in the audited repository/runtime.

Part 10B.4 therefore does **not** add a regex comment stripper, fuzzy comparison, or home-grown lexer. No `NATIVE_SQL_TOKEN_EQUIVALENT` proof class is enabled. Configuration validation explicitly rejects that proof class until a trusted implementation exists.

### Authoritative evidence table

Repository raw SHA-256 values below are computed over the exact repository file bytes at the audited PR branch. Native SHA-256 values are computed over the exact single statement stored in `supabase_migrations.schema_migrations`.

| Repository migration | Repository raw SHA-256 | Repository Git blob SHA-1 | Native candidate | Native statements | Native raw SHA-256 | Creation / original PR | Current result |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `20260909110000_crm_sales_meeting_management_closeout_part_5` | `bc4944edf31ce435bc7bf1efc71d12e660fccdb3952bf578150e89f1fe2e13b4` | `cd99a43ff8030c9c1b439589e09a6bca0ec550c0` | `20260909063552_crm_sales_meeting_management_closeout_part_5` | 1 | `02f7fff7608cfea2c565c61265a9470357917e39325ac75f5f56a525f2419365` | merge/creation `7df2cd3fb749f4a3c8af758b07129e21bc2e3a51`; PR #100 head `9a405efd8e2531b827a5693447049d96c516b049` | `UNRESOLVED_PROVENANCE` |
| `20260909193000_crm_sales_validation_escalation_part_7` | `f153f00f85c8e7ec6974b220f7ba1072bb9432963f37081282cffeb7add40564` | `54b82d420193a17374a321d12438dded67b59012` | `20260909110302_crm_sales_validation_escalation_part_7` | 1 | `24e009abf749d7ea45bcc5526af6661305a0e12889e788670b3ba2ffeaf5f995` | creation `43953366044955ce1a11733d5169d8a24ca401fe`; PR #102 head `6a048d67916043d07b541067a25515ddd5916b44` | `UNRESOLVED_PROVENANCE` |
| `20260909200000_crm_sales_requirements_confirmed_proposal_readiness_part_8` | `d430a06cc0065af0bf2385ee90657a25820c404c66a8594c774455583220ea61` | `617301e6f51ab3743fee5bda6cfe50d3f52da88a` | `20260910024728_crm_sales_requirements_confirmed_proposal_readiness_part_8` | 1 | `81c117ba04074f026c6a04d47c77edc9cde165808233dcf311f64707dd433806` | merge/creation `4695a0cc7e2067bd69d8baac50cb411943214556`; PR #103 head `447bc047029f14e95dd0f0cee4c5d4d01973047d` | `UNRESOLVED_PROVENANCE` |
| `20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening` | `5917aa1bdefd2387bb654907344e9997bc1eb957bfbd2aff59ce1061741f9068` | `286289db5080ce33bbee6a8a04b123b96d6c41d5` | `20260910024912_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening` | 1 | `11854b9216d82c2d9fc7b010b90c36f6622c1d8efe96bbe5c7daea8c5055bb1d` | merge/creation `4695a0cc7e2067bd69d8baac50cb411943214556`; PR #103 head `447bc047029f14e95dd0f0cee4c5d4d01973047d` | `UNRESOLVED_PROVENANCE` |
| `20260915154800_sales_catalog_clarity_repository_reconciliation` | `fb1f50f908653298da2e0a77b56fa1580117739c7dac73a6b3e79e4093ff2c3e` | `3ba8a2d47d235e98ca9337be70966cc82037f64f` | `20260915102211_sales_catalog_clarity_repository_reconciliation` | 1 | `e267e75af14d13dd5c39a7402d999d2a521d4881d93adcd219f1d2ad6d756758` | creation/head `d62e78d57fd3351838786cb88c4172094e6f1806`; PR #109 | `UNRESOLVED_PROVENANCE` |

For every row, the raw repository SHA-256 differs from the native raw statement SHA-256.

### Git-history evidence

Original implementation PR history is now explicitly linked:

- Part 5: PR #100, merged as `7df2cd3fb749f4a3c8af758b07129e21bc2e3a51`; final PR head `9a405efd8e2531b827a5693447049d96c516b049`.
- Part 7: PR #102, merged as `24e2fa47fb5f9fdadde3a50fdbc1ad616a935eb6`; final PR head `6a048d67916043d07b541067a25515ddd5916b44`; migration-creation commit `43953366044955ce1a11733d5169d8a24ca401fe`.
- Part 8 foundation/hardening: PR #103, merged as `4695a0cc7e2067bd69d8baac50cb411943214556`; final PR head `447bc047029f14e95dd0f0cee4c5d4d01973047d`.
- Catalog reconciliation: PR #109, head/creation `d62e78d57fd3351838786cb88c4172094e6f1806`, merged as `16ef1d5047df2300035b76e21b9719029345be3d`.

For all five repository migration paths, the blob at the original implementation PR head is exactly the same blob as the current PR #117 branch. No later repository-file mutation is therefore evidenced between those PR heads and the current audit.

The authoritative native ledger does **not** record a Git SHA. Its migration version is an identifier and is not treated as proof of the exact repository commit present at application time. Therefore “commit immediately before native application” and “commit immediately after native application” cannot be authoritatively named from the available evidence. This limitation is recorded rather than guessed.

### Per-blocker exact result

For all five blockers:

- repository statement count: **NOT SAFELY ESTABLISHED** without a trusted SQL/PLpgSQL parser;
- native statement count: **1**;
- raw bytes equal: **NO**;
- comments-only: **NOT AUTHORITATIVELY PROVEN**;
- whitespace-only: **NO / NOT ESTABLISHED**;
- executable SQL token difference: **UNKNOWN — TOKEN PROOF UNAVAILABLE**;
- PL/pgSQL body difference: **NOT SAFELY CLASSIFIABLE where bodies are present**;
- dynamic SQL/string difference: **NOT PROVEN ABSENT**;
- final classification: `UNRESOLVED_PROVENANCE`;
- proof type: **NONE — no accepted equivalence proof**;
- safe action: `BLOCK_UNRESOLVED`;
- proof digest: **NONE — no equivalence digest is authorized**;
- evidence: repository raw SHA-256 + Git blob identity + original PR history + live native version/name/statement-count/raw-SHA-256 evidence.

Observed, non-authoritative text differences remain useful investigation context only:

1. Part 5 visibly includes additional explanatory comments inside a dollar-quoted PL/pgSQL body.
2. Part 7 visibly includes additional explanatory comments.
3. Part 8 foundation begins similarly but full semantic equivalence cannot be proven.
4. Part 8 hardening begins similarly but full semantic equivalence cannot be proven.
5. Catalog reconciliation visibly includes rollout/idempotency comments before executable SQL.

None of those observations is promoted into an equivalence proof.

### Regression matrix status

The reconciliation test source now explicitly covers the requested fail-closed token-safety scenarios when no trusted tokenizer exists:

1. comment-only difference — **COVERED / BLOCKED**
2. whitespace-only difference — **COVERED / BLOCKED**
3. comment-looking text inside string literal — **COVERED / BLOCKED**
4. `--` inside URL/text literal — **COVERED / BLOCKED**
5. `/* */` inside string literal — **COVERED / BLOCKED**
6. comments inside PL/pgSQL body — **COVERED / BLOCKED**
7. executable statement added — **COVERED / BLOCKED**
8. executable statement removed — **COVERED / BLOCKED**
9. changed WHERE predicate — **COVERED / BLOCKED**
10. changed GRANT/REVOKE — **COVERED / BLOCKED**
11. changed SECURITY DEFINER — **COVERED / BLOCKED**
12. changed search_path — **COVERED / BLOCKED**
13. changed function parameter/type — **COVERED / BLOCKED**
14. changed RAISE condition — **COVERED / BLOCKED**
15. changed JSON/string literal — **COVERED / BLOCKED**
16. changed dynamic SQL text — **COVERED / BLOCKED**
17. native version/name mismatch — **COVERED by existing fail-closed tests**
18. raw/current migration drift — **COVERED by explicit content-proof repository-drift test**
19. unresolved migration cannot reach SQL execution — **COVERED by existing explicit no-fallthrough test**
20. proven native equivalent reconciles without SQL replay — **COVERED by existing exact/content-equivalent reconciliation tests**

An additional regression rejects `NATIVE_SQL_TOKEN_EQUIVALENT` as an unsupported configuration proof class until a trusted tokenizer implementation exists.

Source presence is not a runtime pass. Trusted CI must execute repository steps before this matrix may be called CI-passed.

### Part 10B.4 final lineage counts

- `CUSTOM_LEDGER_EXACT`: **110**
- `NATIVE_EXACT`: **3**
- `NATIVE_CONTENT_EQUIVALENT`: **5**
- `NATIVE_SQL_TOKEN_EQUIVALENT`: **0**
- `UNRESOLVED_PROVENANCE`: **5**
- `GENUINELY_PENDING_NEW`: **0**
- total post-baseline: **123**
- active native reconciliation mappings: **8**

### Required 30-field Part 10B.4 final report

1. **Starting main SHA:** `0be12a91cc096ecb7c67c1d5e9858bdac18967b4`.
2. **Starting PR head:** `157bdc509a449810d13eb71f4636e19535b171da`.
3. **Final PR head:** see live PR #117 head; this file cannot self-record the SHA of the commit that contains itself without creating a subsequent head. PR metadata is authoritative.
4. **Files changed in this Part 10B.4 continuation:** `scripts/native-migration-reconciliation.mjs`, this audit document, and `tests/security/production-migration-native-reconciliation.test.mjs`; the implementation marker may also be updated as final documentation.
5. **Migration SQL files changed:** **NO**.
6. **Production writes:** **NO**.
7. **Each five migration results:** all five `UNRESOLVED_PROVENANCE` / `BLOCK_UNRESOLVED`; exact evidence table above.
8. **Token/parser method used:** **NONE**; no trusted PostgreSQL/PLpgSQL tokenizer/parser available, so fail closed.
9. **Git-history evidence:** original PRs/heads/merge or creation commits and stable blobs recorded above; native application cannot be tied to a Git SHA from authoritative native-ledger evidence.
10. **Proof digests:** **NONE for the five unresolved rows**; raw repository/native SHA-256 evidence recorded instead.
11. **Final `CUSTOM_LEDGER_EXACT` count:** **110**.
12. **Final `NATIVE_EXACT` count:** **3**.
13. **Final `NATIVE_CONTENT_EQUIVALENT` count:** **5**.
14. **Final `NATIVE_SQL_TOKEN_EQUIVALENT` count:** **0**.
15. **Final `UNRESOLVED_PROVENANCE` count:** **5**.
16. **Final `GENUINELY_PENDING_NEW` count:** **0**.
17. **Total post-baseline count:** **123**.
18. **Active mapping count:** **8**.
19. **Unresolved exact list:** the five rows in the authoritative evidence table above.
20. **Migration reconciliation tests:** requested fail-closed matrix is present in source; runtime pass is not claimed until trusted execution occurs.
21. **Syntax checks:** final trusted repository execution is pending; no passing claim is made from non-executed GitHub Actions.
22. **Local full-suite result:** **NOT CLAIMED** in this connector session.
23. **GitHub Actions run/result:** recheck required on final head; prior audited final-head attempt failed before repository steps.
24. **Whether repository steps actually executed:** **NO on the last audited run**; recheck final head separately.
25. **Cloudflare preview result:** recheck final head separately; preview success never substitutes for trusted CI.
26. **`finalQuotationSendGateActive`:** **false**.
27. **Custom ledger row/max state:** **676 rows; max `20260908100000`**; 110 post-baseline custom exact.
28. **Confirmation `migrations:apply` was NOT run:** **CONFIRMED**.
29. **Confirmation PR #117 remains draft/unmerged:** **REQUIRED and rechecked after final documentation**.
30. **Exact next release step:** obtain a trustworthy PostgreSQL/PLpgSQL token-aware equivalence method or other authoritative provenance evidence for the five blockers; then re-audit. Even if all five later resolve, trusted GitHub CI must execute successfully before merge, production `migrations:apply`, Part 10B activation, or Part 11.

**CURRENT MIGRATION PROVENANCE STILL CONTAINS UNRESOLVED BLOCKERS. PR #117 MUST REMAIN DRAFT. PRODUCTION migrations:apply, PART 10B ACTIVATION, AND PART 11 MUST NOT BEGIN.**

