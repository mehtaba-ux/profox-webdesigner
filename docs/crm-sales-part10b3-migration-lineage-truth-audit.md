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
