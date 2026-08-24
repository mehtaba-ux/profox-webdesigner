# ProFox CRM — Application Release Closure

**Closure date:** 2026-08-22  
**Closure baseline:** `main` at `445c53f55bfff049cdf56053d3ef8683c0b27b34`  
**Scope:** final integration and internal release closure for the approved application roadmap through Module 14.

This is the single release-closure record. It does not replace module-specific QA, migration, security, or implementation documentation.

## 1. Release boundary

The approved application roadmap is complete through **Module 14 — Optional AI Assistance**. There is no approved Module 15 in the application roadmap. Future product work requires an explicitly approved scope or resolution of an external activation gate listed below.

No new business system, shadow workflow, duplicate source of truth, or release-only database model is introduced by this closure.

## 2. Canonical source-of-truth boundaries preserved

- Recruitment, agreement, Academy certification, Final Approval, and Sales activation continue to use the existing applicant/training/profile workflow and protected RPC boundaries.
- `user_profiles` remains the operational identity/role/status source used for application access decisions.
- CRM leads, opportunities, activities, meetings, quotations, payments, commissions, projects, notifications, and performance reviews remain in their existing canonical modules.
- **ProFox Calendar remains primary.** Google Calendar/Meet is optional synchronization only.
- Seller dashboards aggregate existing operational records; they do not own duplicate CRM, KPI, commission, customer, training, quotation, payment, or career-progression state.
- Post-activation performance/coaching records management evidence without creating a second access-control or offboarding system.
- **ProFox executes. AI advises.** Optional AI cannot become the source of truth or perform protected business actions.

## 3. Internally verified release gates

### Recruitment → activation → Seller access

A rollback-only production regression test on 2026-08-22 verified the access boundary without leaving QA data:

- an onboarding Sales account was denied Seller Command Center access;
- after the protected active/completed Sales state was applied, the same account received operational Seller access;
- the Seller Command Center remained restricted to that seller's own scope even when another user id was supplied;
- the transaction was rolled back and left no synthetic Sales profile behind.

The Academy resume state remains convenience-only and cannot influence certification, Final Approval, or activation. Final Certification and activation continue to enforce the existing required-module, Management-review, critical-failure, and protected activation invariants.

### Repository ↔ production migration reconciliation

Critical recent production migrations were checked against `main` by exact production version/name. The repository contains, among the reconciled release records:

- `20260820205929_academy_resume_engine`
- `20260820205953_sales_activation_defense_in_depth`
- the production Module 13 Google Calendar integration/hardening history;
- the nine production Module 14 optional-AI migrations;
- `20260822065212_post_activation_sales_performance_management`
- `20260822065804_post_activation_performance_release_hardening`
- `20260822071816_post_activation_review_evidence_hardening`
- `20260822072222_academy_module_20_final_pass_invariants`
- `20260822080148_seller_command_center_approved_structure`
- `20260822085951_module13_google_role_family_alignment`

No migration is replayed or recreated by this release closure.

### Runtime automation and queues

Production runtime inspection on 2026-08-22 showed the expected cron jobs active:

| Job | Schedule | State |
| --- | --- | --- |
| `profox-notification-automation` | every 2 minutes | Active |
| `profox-mock-call-automation` | every 30 minutes | Active |
| `profox-mock-call-evaluator-pool-sync` | every 30 minutes | Active |
| `profox-google-calendar-sync` | every 2 minutes | Active |

At the closure check:

- notification outbox pending/processing/retry rows: **0**;
- notification outbox failed rows: **0**;
- Google sync pending/processing/retry rows: **0**;
- Google sync failed rows: **0**;
- AI run rows: **0**.

Brevo is the configured notification email provider and email delivery is enabled in the canonical notification settings. The existing notification scheduler remains the delivery mechanism; this closure does not create a second email system.

### Optional AI safety state

At the closure check, the canonical AI control plane remained intentionally safe-by-default:

- AI enabled: **false**;
- provider configured: **false**;
- all configured AI capabilities: **false**;
- human review required: **true**;
- core system independent: **true**;
- protected actions allowed: **false**;
- external web research enabled: **false**;
- AI runs: **0**.

Module 14 authorization/ACL verification was completed before merge. AI remains optional and the core application continues to function without a provider key.

## 4. External activation/verification gates still open

These are deliberately **not** marked complete because they require real external-provider or deployment evidence rather than an internal simulation.

### 4.1 Public production deployment/domain verification — OPEN

Deployment-readiness inspection on 2026-08-22 established the canonical repository target:

- `wrangler.toml` defines the existing Cloudflare Worker `profox-web-production`;
- the Worker serves the Vite `dist` assets with SPA fallback and binds the existing `profox-media` R2 bucket as `MEDIA_BUCKET`;
- `/api/health` reports the Cloudflare runtime when that Worker is actually serving a request;
- the pre-existing GitHub workflow was CI-only and did not deploy production;
- repository history did not provide a verifiable current Worker URL or custom-domain mapping;
- external checks did not provide evidence that `profoxwebdesigner.com` is currently serving this exact Worker/application build.

A single manual production deployment workflow now reuses that same `wrangler.toml`; it does not create another deployment platform. It requires the GitHub `production` environment to provide `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`. `PROFOX_PUBLIC_APP_URL` (or the manual workflow URL input) enables post-deploy `/api/health` verification. Until a real deployment succeeds and that public health endpoint is verified, this gate remains open.

### 4.2 Real Google OAuth + Calendar/Meet end-to-end validation — OPEN

Production inspection on 2026-08-22 confirmed the internal Google integration is present but not externally activated:

- `google-calendar-oauth` Edge Function is ACTIVE;
- `process-google-calendar-sync` Edge Function is ACTIVE;
- the Google Calendar scheduler is active;
- live connection status is `disconnected`;
- live Google connections: **0**;
- live Google event links: **0**;
- live Google busy blocks: **0**;
- working Google sync jobs: **0**;
- failed Google sync jobs: **0**;
- the Google scheduler token exists in the server-side secret store, while no Google Calendar OAuth client credential is present there under the approved credential names.

The gate requires a real authorized Google account and real server-side OAuth client credentials, then verification of OAuth, busy-time sync, event reconciliation, Meet creation, disconnect, and reconnect behavior. Do not simulate that evidence or make Google the primary calendar.

### 4.3 Real Gemini provider validation — OPEN / OPTIONAL

This gate is only applicable if AI is intentionally enabled later. Configure the provider securely and run a controlled advisory-only provider test. Until then, AI remains OFF and no provider validation is required for core application operation.

These gates do not justify bypassing the existing security model, adding duplicate integrations, or enabling optional services prematurely.

## 5. Release policy and stop point

Internal application release closure requires every release-readiness patch to pass exact-head TypeScript and production-build CI before merge. The merged `main` commit is the internal release baseline.

After internal closure, work should continue only by:

- resolving one of the explicit external gates above; or
- approving a new, non-duplicative product scope based on a demonstrated business requirement.

Do not invent a new module merely because the current roadmap is complete.
