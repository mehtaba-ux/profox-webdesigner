# Seller Command Center and Pricing Source of Truth

This implementation deliberately aggregates existing systems instead of creating parallel business records.

| Business fact | Authoritative source | Consumer examples |
| --- | --- | --- |
| Package price, product name, active state, approved scope/inclusions | `sales_products` | Public Pricing, homepage packages, Seller Command Center, quotations |
| Standard payment terms and milestone schedule | `sales_products.standard_payment_terms` / `sales_products.payment_schedule` | Public Pricing, payment workflow, seller quick reference |
| Public product exposure | `sales_products.public_visible` | `get_public_sales_catalog()` |
| Pipeline and next actions | CRM leads/opportunities/activities | Seller Command Center |
| Quotation history | `quotations` + quotation item snapshots | Sales workspace, Seller Command Center |
| Customer payment truth | `payments`, verified server-side | Seller Command Center, commissions, client activation |
| Commission policy and payout state | Commission settings/rules/ledger/payout batches | Seller Command Center, Commissions workspace |
| Seller monthly target | Published sales job policy | Seller Command Center |
| Career progression | Existing career progression RPC/tables | Seller Command Center, Career Progression |
| Meetings | ProFox Calendar / `sales_meetings` | Seller Command Center |
| Notifications | In-app notification system | Existing Today data used by Seller Command Center |

## Security boundaries

- Anonymous users cannot select the raw `sales_products` table.
- Public pricing reads only the narrow `get_public_sales_catalog()` SECURITY DEFINER RPC.
- `get_seller_command_center(uuid)` is authenticated-only. A seller is forced to their own scope; Admin may request an individual seller or team roll-up.
- The dashboard is read-only. It links back to the existing CRM, Sales, Payments, Calendar, Academy, Commissions, and Career Progression workflows for mutation.
- Public Pricing fails closed if the four canonical core packages are not available, rather than rendering stale hardcoded commercial facts.

## Historical accuracy

Quotations continue to snapshot product code, name, description and price when created. Later Sales Catalog edits therefore update future/public commercial guidance without rewriting historical quotations.


## Part 15 performance evidence

| Performance fact | Authoritative source | Part 15 behavior |
| --- | --- | --- |
| Review cadence / management review | sales_performance_settings / sales_performance_reviews | Existing persistence retained |
| Review-period quantitative evidence | Existing CRM/Sales/Payment/Handoff truth via period snapshot RPC | Derived, not copied into a new business table |
| Completed-review evidence | sales_performance_reviews.metrics_snapshot | Frozen only when human review completes |
| Discovery / Proposal Readiness | Part 8 gate evaluator | Existing evaluator reused |
| Next-action discipline | Part 11 opportunity-linked crm_activities | Legacy opportunity next-follow-up field is not performance truth |
| Delivery first-pass / missing information | Part 13 project_sales_handover_attempts | Structured reviewed attempt/Return evidence only |
| Revenue | Verified payments | Currency-separated; no invented FX normalization |
| Sales-attributed post-sale scope changes | No explicit canonical Sales-attribution source | NOT_TRACKED_AUTHORITATIVELY |
| Client expectation disputes | No explicit structured dispute source | NOT_TRACKED_AUTHORITATIVELY |

Part 15 does not create an overall Seller score, ranking, automatic management decision, automatic access restriction, commission mutation, or certification mutation.
