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
