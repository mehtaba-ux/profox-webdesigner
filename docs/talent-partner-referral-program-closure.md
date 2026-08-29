# Talent Partner Referral Program — Feature Branch Closure

Status: **FEATURE BRANCH IMPLEMENTATION COMPLETE**

Production deployment status: **NOT MERGED / NOT DEPLOYED** by explicit instruction.

Branch: `feat/talent-partner-referrals`
Draft PR: #23
Production branch: `main`

## Reuse / no-duplicate architecture

This implementation extends the existing ProFox application rather than introducing parallel business systems.

Canonical objects reused:

- `career_jobs` for available roles and job metadata.
- `applicants` and each existing public role application RPC for candidate creation.
- Existing recruitment stages, activation and linked-user flow.
- `user_profiles` and Supabase Auth for identity.
- `payments` and the existing verified-payment state for sales qualification.
- `projects` and `project_team` for project completion and worker assignment.
- `sales_career_progression_reviews` for accepted Sales salary-transition events.
- Existing Admin workspace and route shell.

Feature-owned tables are limited to Talent Partner-specific program configuration, attribution visits, referral ownership, reward plans, project qualification snapshots, salary-transition linkage, reward ledger, payouts, partner notifications and approved partner resources. They do not replace the canonical recruitment, payment, project or commission records.

## Implemented surfaces

- Dedicated Talent Partner registration/login and approval-state portal.
- Per-job long and short referral links.
- First-valid-touch browser + server attribution.
- UTM/referrer/device/timezone/locale visit tracking.
- Referral claim against the canonical applicant record.
- Self-referral and ownership-lock protections.
- Sales, Content Creator, UI/UX Designer and Web Developer application integration.
- Sanitized referral status visibility for partners.
- Admin Partner approval/suspension/closure controls.
- Per-job reward-plan configuration with financial plans disabled by default.
- First three qualifying distinct sales rewards for referred Sales representatives.
- First three completed/assigned project rewards for project-based workers.
- Retention/salary-transition final reward architecture.
- Existing Sales Career Progression acceptance integration.
- Pending / Approved / Paid / Reversed reward lifecycle.
- Payout batches and payment-reference confirmation.
- Audited attribution override.
- Partner resources and payout/profile settings.
- Partner role isolation from internal staff workspace and professional mailbox eligibility.
- Talent Partner management surfaced inside the existing Recruitment workspace.

## Verification completed

- GitHub feature branch created from the current production `main`.
- Draft PR used only as a CI gate; it remains unmerged.
- TypeScript check passes.
- Production Vite build passes.
- Main-vs-feature comparison shows no removed files.
- Production `main` remains unchanged.
- Production schema collision check found no existing `talent_partner_*` tables.
- Migration version collision check found no existing migrations using the two Talent Partner migration versions.
- 30 required live database columns used by the migrations were checked and all 30 exist.
- Required existing backend routines used/extended by the feature were confirmed present.
- Current published Sales, Content Creator, UI/UX Designer and Web Developer jobs were checked against the integration logic.
- Reward-plan financial values remain disabled by default until Admin explicitly configures and enables them.
- RLS is enabled for every new Talent Partner table in the migration and public attribution is routed through scoped SECURITY DEFINER RPCs.

## Deliberately not performed

- No feature commit was merged into `main`.
- No Talent Partner migration was applied to the production Supabase project.
- No production reward plan was enabled and no financial obligation was created.

The implementation is therefore complete on the isolated feature branch, while production activation remains a separate controlled deployment step.
