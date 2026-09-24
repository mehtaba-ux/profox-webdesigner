# Activated Seller Experience — final implementation scope

This release implements the approved Activated Seller Experience as a connected aggregation layer over existing ProFox systems rather than a second sales system.

## Seller Command Center
- Today counts and server-prioritized attention queue.
- Monthly verified paid sales, verified revenue, target progress, pipeline value and completed meetings.
- Product sales breakdown.
- Quotation and customer-payment status.
- Earned, Under Review, Approved and Paid commission totals.
- Next approved payout batch and current payout schedule.
- Existing detailed commission ledger / payout history deep link.
- Verified-sale feed.
- Career Progression with management-review disclaimer.
- Upcoming meetings with Prepare / Join / Manage actions.
- Existing notifications surfaced without copying notification state.
- Quick actions into CRM, Meetings, Quotations, Payments, Sales Resources, Commissions and Academy.

## Sales Resource Center
The existing active-seller Training Library is reused and repositioned as the Sales Resource Center.

- Sales Academy remains learning/certification.
- Sales Resources remains execution/reference.
- Live Sales Catalog supplies products, prices, scope, payment terms and approval flags.
- Existing Academy modules supply approved operating/reference material.
- Existing Niche Academy supplies niche playbooks.
- Existing Outreach Templates supply messaging/playbooks.
- Live Portfolio and public Pricing supply approved proof and prospect-facing package presentation.
- Commission ledger / Career Progression remain the owning systems for those policies.

No parallel resource/content database is introduced.

## Seller profile & security
A protected self-service profile reads canonical state from:
- `user_profiles`
- linked `applicants`
- latest `sales_partner_agreements`
- Final Certification in `user_training_progress`
- `commission_settings`

Editable contact data continues through the existing `profileService.updateMyProfile()` safe field list. Password changes go directly to Supabase Auth. Role, status, final approval, agreement verification and certification evidence remain read-only/protected.

## Sales role-family alignment
The user-facing and protected Calendar/Meeting surfaces align the current Sales role family:
- `sales`
- `sales_rep`
- `sales_team`

RLS remains own-record scoped. External calendar provider state remains protected.

## Canonical source rule
Dashboard/resource/profile screens own presentation only. CRM, Sales Catalog, quotations, verified payments, commissions, payout batches, meetings, notifications, Recruitment, Agreement, Academy and Career Progression remain authoritative for business state.
