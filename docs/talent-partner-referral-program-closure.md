# Talent Partner Referral Program — Production Closure

Status: **IMPLEMENTATION AND PRODUCTION BACKEND DEPLOYMENT COMPLETE**

Branch: `feat/talent-partner-referrals`
Pull request: #23
Production branch: `main`
Supabase project: `Profox Webdesiger App + Website` (`calabtayklhltyiriiwo`)

## Reuse / no-duplicate architecture

This implementation extends the existing ProFox application rather than introducing parallel business systems.

Canonical objects reused:

- `career_jobs` for available roles and job metadata.
- `applicants` and the existing protected public role-application RPCs for candidate creation.
- Existing recruitment stages, activation and linked-user flow.
- `user_profiles` and Supabase Auth for identity.
- `payments` and canonical `Verified` payment state for Sales qualification.
- `projects` and `project_team` for project completion and worker assignment.
- `sales_career_progression_reviews` for accepted Sales salary-transition events.
- Existing Admin workspace, routing, notification patterns and protected database-operation style.

Feature-owned tables are limited to Talent Partner-specific program configuration, attribution visits, referral ownership, reward plans, project qualification snapshots, salary-transition linkage, reward ledger, payouts, partner notifications and approved partner resources. They do not replace canonical recruitment, payment, project or seller-commission records.

## Completed capability

- Dedicated Talent Partner registration/login and approval-state portal.
- Automatic access to currently published career jobs.
- Unique per-partner/per-job referral links.
- First-valid-touch attribution with configurable window.
- UTM/referrer/device/timezone/locale visit tracking.
- Protected referral claim against the canonical applicant record.
- Self-referral, duplicate ownership and attribution-lock protections.
- Sales, Content Creator, UI/UX Designer and Web Developer application integration.
- Privacy-safe candidate/referral progress visibility.
- Admin approval, suspension and closure controls.
- Admin-configurable per-job reward plans; plans are disabled by default.
- First three distinct post-activation Sales rewards anchored to canonical Verified customer payments.
- First three distinct completed project rewards for project-based referred workers, with Admin-confirmed eligible worker payment.
- Six-month retention/salary-conversion final reward architecture measured from actual activation.
- Existing Sales Career Progression acceptance integration.
- Pending / Approved / Paid / Reversed reward lifecycle.
- Configurable payout hold/minimum controls and payout batches.
- Mandatory external transaction/reference ID before a payout can be marked Paid.
- Audited Admin attribution override; ownership cannot be changed after reward activity exists.
- Partner resources, profile/payout settings and notifications.
- Partner role isolated from internal staff workspace and professional mailbox eligibility.
- Talent Partner management integrated into the existing Recruitment/Admin workspace.
- Raw internal partner data protected; partner portal consumes sanitized SECURITY DEFINER dashboard data.
- Least-privilege RPC execution: public attribution RPCs are public, partner/Admin RPCs require authentication, and internal financial/trigger helpers are not client-callable.
- Privacy-safe recruitment stage mapper supports the current canonical pipeline and legacy aliases.
- Feature-specific RLS performance policies and covering foreign-key indexes are in place.

## Production database migrations

The production Supabase project contains the reconciled Talent Partner migration chain:

1. `20260829102907_talent_partner_schema_and_core_helpers.sql`
2. `20260829102940_talent_partner_identity_attribution_and_sync.sql`
3. `20260829103223_talent_partner_sales_reward_engine.sql`
4. `20260829103240_talent_partner_project_reward_engine.sql`
5. `20260829103300_talent_partner_retention_engine.sql`
6. `20260829103340_talent_partner_admin_financial_controls.sql`
7. `20260829103419_talent_partner_dashboard_rls_and_integrity.sql`
8. `20260829103638_talent_partner_search_path_hardening.sql`
9. `20260829110311_talent_partner_rpc_execute_and_stage_hardening.sql`
10. `20260829110521_talent_partner_performance_and_rls_hardening.sql`

The earlier draft/monolithic migration files were removed from the repository. The repository now carries the migration versions actually applied to production.

## Final safety state before main merge

- All Talent Partner reward plans remain **disabled** until an Admin explicitly configures and enables a plan.
- Production currently has **0 Talent Partner reward entries** and **0 Talent Partner payouts**.
- Therefore deployment itself created **no financial obligation**.
- First-three-event caps are enforced at both database-constraint and RPC/business-rule levels.
- Sales rewards only rank distinct quotations whose first Verified payment occurs at or after the referred worker's activation.
- Project rewards require a fully completed project, assignment of the referred worker, a distinct project, and an Admin-confirmed eligible worker payment.
- Retention rewards require the configured retention period, an active worker and an active/effective salary transition; elapsed calendar time alone is insufficient.
- RLS is enabled on all feature tables.
- Internal Talent Partner financial helper functions are not executable by `anon` or `authenticated` client roles.
- Supabase security advisor reports no Talent Partner-specific security defect; remaining Auth warnings are project-wide settings outside this feature.
- Supabase performance review identified and the feature closed its new FK-index and partner-readable RLS-policy warnings.

## Release gate

Merge into `main` is permitted only after the final GitHub CI run for the reconciled branch head succeeds. After merge, verify the final `main` head and PR merged status before marking the release complete.
