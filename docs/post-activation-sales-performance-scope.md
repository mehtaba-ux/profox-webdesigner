# Post-Activation Sales Performance & Coaching — implementation scope

This workstream starts only after a Sales candidate has completed Recruitment → Agreement → Sales Academy → Final Approval → Activation.

## Operating goal
Move the seller from learning to supervised execution and then to independent performance without creating a second CRM, activity tracker, meeting system, quotation system, payment ledger, commission engine, or Career Progression system.

## 90-day ramp
- Days 1–30: supervised execution, live practice, CRM discipline and approved prospecting.
- Days 31–60: pipeline building, field application, discovery/meeting execution and first-interaction quality review.
- Days 61–90: independent execution, approved proposal/payment process, forecasting and follow-up discipline.

## Review checkpoints
- Day 7 check-in.
- Day 30 review.
- Day 60 review.
- Day 90 final review.
- Weekly Sales coaching checkpoints using an Admin-configurable interval (default 7 days).
- First customer-interaction quality review after an Admin-configurable threshold (default 20).

## Management outcomes
The documented management outcomes are preserved exactly:
- Continue
- Extend Review
- Restrict Scope
- Close Engagement

A review decision does not create a duplicate access/offboarding system. `Restrict Scope` and `Close Engagement` are recorded as management decisions and require the existing Team & Users access control for any account change.

## Single source of truth
Live metrics are composed from existing canonical records:
- Activation: linked `applicants` record in `Activated` stage with Final Approval.
- CRM discipline and interactions: `crm_activities`.
- Leads/pipeline/next actions: `crm_leads` and `crm_opportunities`.
- Meetings: `sales_meetings`.
- Quotations: `quotations`.
- Verified payments/sales: `payments`.
- Commission evidence: `commission_entries`.
- Career eligibility: existing Career Progression module remains separate.

The new `sales_performance_reviews.metrics_snapshot` is historical review evidence captured at completion; it is not an editable business-truth copy.

## Admin-configurable policy
One `sales_performance_settings` record controls:
- enabled/disabled state;
- Day 7 / 30 / 60 / 90 schedule;
- first-interaction quality-review threshold;
- coaching interval;
- CRM logging target;
- policy version.

Changing the policy refreshes future Scheduled reviews only. Completed evidence is never silently rewritten.

## Access model
- Active `sales`, `sales_rep`, `sales_team`: own performance view and own review history only.
- Admin: team roll-up, cadence settings, due-review queue and review completion.
- Anonymous access: none.
- Review/table mutations: protected RPC only.
