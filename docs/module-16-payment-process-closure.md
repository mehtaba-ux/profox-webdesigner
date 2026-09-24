# Module 16 — Payment Process — Implementation & QA

Module 16 trains sellers to request payment from accepted commercial truth, use only approved ProFox channels, protect customer credentials, follow up professionally, distinguish customer evidence from verification, and allow only the protected Admin verification workflow to advance financial state.

## Learner design
- 30 sequential lessons across 6 mastery phases.
- Framework: ACCEPT → PREPARE → CHECK → REQUEST → FOLLOW UP → CONFIRM → VERIFY → ACTIVATE → HANDOFF.
- 25 scenario certification, pass 90/100, zero critical misses.
- 12 critical scenarios and 7 required acknowledgements.
- Answer distribution A/B/C/D = 7/6/6/6.
- Failed learners retain lesson completion and retry scenarios only.

## Payment control alignment
- Standard package payment schedules moved into Admin-managed `sales_products.payment_schedule`.
- Launch: 50 / 50.
- Growth: 50 / 30 / 20.
- Scale: 40 / 30 / 20 / 10.
- Discovery: 100% Full Payment.
- Custom: no standard Sales-authorized schedule.
- Payment schedule validation requires approved milestone types, labels, positive values, unique types and total 100%.
- Sales payment requests are derived server-side from accepted quotation + current package schedule.
- Duplicate active/settled requests for the same quotation/payment type are blocked.
- Sales cannot self-set verification or settlement fields.

## Production QA
Approved Supabase project: `calabtayklhltyiriiwo`.

Operational lifecycle verified:
- Growth Advance request submitted with deliberately wrong customer, amount, milestone metadata and currency; backend derived the accepted quote/customer, USD, milestone 1, `50% Advance Payment`, and $1,189.50.
- Duplicate Advance request blocked.
- Sales attempt to set Verified/confirmed amount/verifier blocked.
- Custom package Sales request blocked because no Sales-authorized standard schedule exists.
- Admin partial verification of $400 produced `Partially Paid`; opportunity stayed Open and no Client was created.
- Admin full verification of the qualifying $1,189.50 Advance produced `Verified`, moved the opportunity to Won, and created/linked one Client across opportunity, quotation and payment.
- Operational QA residue: 0.

Academy lifecycle verified:
- lesson skip blocked;
- assessment before all lessons blocked;
- learner config hides correct answer and critical metadata;
- 30 lessons completed sequentially;
- fake assessment history blocked;
- 96/100 with one critical miss => Retry Required;
- direct force-Passed blocked;
- clean retry => 100/100 Passed;
- post-pass resubmission blocked;
- Academy QA residue: 0.
