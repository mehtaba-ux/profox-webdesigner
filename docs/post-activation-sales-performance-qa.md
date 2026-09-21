# Post-Activation Sales Performance & Coaching — QA

## Architecture
- [x] Starts from current verified `main` after Seller Experience release.
- [x] No second CRM/activity/meeting/quotation/payment/commission/Career Progression system introduced.
- [x] Review cadence is Admin-configurable from one settings record.
- [x] Completed review evidence is historical and does not replace canonical live metrics.
- [x] Restrict Scope / Close Engagement do not silently create a second account-access workflow.

## Database
- [ ] Migration applies successfully to approved Supabase project.
- [ ] Anonymous cannot read settings/reviews or execute protected RPCs.
- [ ] Active seller can read only own post-activation performance payload.
- [ ] Seller cannot request another seller's snapshot.
- [ ] Admin can read team roll-up and update policy/reviews.
- [ ] Day 7, Day 30, Day 60, Day 90 reviews derive from canonical Activated date.
- [ ] Weekly coaching reviews derive from configured interval.
- [ ] First-interaction quality review appears only after configured interaction threshold.
- [ ] Completed review captures live metrics snapshot and requires a management decision.
- [ ] Policy edits refresh future Scheduled reviews but preserve completed evidence.
- [ ] No QA seller/review residue remains after rollback-only tests.

## Application
- [ ] TypeScript check passes on exact branch head.
- [ ] Production build passes on exact branch head.
- [ ] `/admin/sales-performance` is routed.
- [ ] Sales workspace shows Performance & Coaching for Admin and active Sales roles.
- [ ] Seller view shows phase, next checkpoint, live metrics, 90-day ramp and completed coaching history.
- [ ] Admin view shows settings, due-review queue, seller roll-up and protected review editor.
- [ ] Career Progression remains a separate verified-sales eligibility experience.

## Release
- [ ] Supabase security/performance advisors checked for release-specific findings.
- [ ] Exact-head CI green.
- [ ] PR mergeable.
- [ ] Merge exact tested head only after production migration and rollback-safe E2E pass.
- [ ] Re-fetch `main` after merge and verify route, service and migration are present.


## Part 15 release candidate

- [x] Existing Sales Performance tables/settings/review workflow reused.
- [x] No duplicate Seller scorecard/performance table created.
- [x] One period-aware calculation path created.
- [x] Current snapshot delegates to the period-aware path.
- [x] Completed review uses exact review period and remains immutable.
- [x] Early completion before period end is blocked.
- [x] Exact 77-case Part 15 specification matrix added.
- [x] First-response SLA uses canonical evidence and measured denominator.
- [x] Discovery and Proposal Readiness reuse the Part 8 evaluator.
- [x] Next-action discipline uses Part 11 opportunity-linked crm_activities.
- [x] Part 13 first-pass and Return-reason evidence reused.
- [x] Verified Payment remains revenue authority.
- [x] Currencies are not mixed or FX-normalized.
- [x] Unsupported scope-change attribution fails closed.
- [x] Unsupported client-dispute attribution fails closed.
- [x] Seller self-only and Admin team access enforced.
- [x] No automatic management/access/employment/commission/certification action introduced.
- [x] Existing Admin/Seller Performance & Coaching UI extended.
- [x] Rollback-only production-schema compile probe passed.
- [ ] Trusted PR CI passes exact final head.
- [ ] Merged-main CI passes exact merge head.
- [ ] Production migration/deploy passes.
- [ ] Part 15 production release verifier reports 0 failures.
- [ ] Authenticated Admin/Seller production QA passes without mutation.
- [ ] Production performance review/settings inventory remains unchanged by QA.
- [ ] Final documentation closure records exact release evidence.
