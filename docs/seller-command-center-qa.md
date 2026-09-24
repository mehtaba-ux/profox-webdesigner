# Seller Command Center QA

## Database
- [x] Anonymous raw `sales_products` SELECT revoked.
- [x] Anonymous `get_public_sales_catalog()` execution allowed.
- [x] Anonymous `get_seller_command_center(uuid)` execution denied.
- [x] Authenticated Seller Command Center execution allowed.
- [x] Seven public products resolve through the public catalog RPC.
- [x] Four core packages resolve with canonical prices, scopes, payment terms, and schedules.
- [x] Care plans resolve with canonical recurring prices and scopes.
- [x] Admin/team Seller Command Center RPC returns configured monthly target and payout schedule.
- [x] Attention queue is server-ordered and capped at 15.
- [x] Quotation follow-up attention respects configured `quotationFollowUpDays`.
- [x] `sales`, `sales_rep`, and `sales_team` role-family authorization is aligned for Seller/Calendar access.
- [x] Rollback-only `sales_rep` and `sales_team` production authorization smoke tests passed without leaving QA residue.

## Application
- [x] TypeScript CI passes on exact feature head `5da16ecfc6222ba58030c7e24293e971507d6c42` (CI #369).
- [x] Production build passes on the same exact feature head (CI #369).
- [x] `/pricing` resolves through `PricingCatalogPage`.
- [x] Homepage package cards read the public Sales Catalog when enabled; presentation fallbacks do not own live price/inclusion facts.
- [x] Active `sales`, `sales_rep`, and `sales_team` roles resolve `/admin/today` to Seller Command Center.
- [x] Other roles retain the existing Productivity Command Center.
- [x] `/admin/public-pricing` is routed and guarded for Admin access.
- [x] Public Pricing links back to the existing Sales Catalog and Payment Process Controls.
- [x] Seller Command Center, Sales Resources, Seller Profile, CRM, meetings, quotations, payments, commissions, Academy, and Career Progression remain connected to their existing owning systems instead of duplicate stores.

## Final
- [x] PR #43 mergeable and CI green on exact tested head.
- [x] PR #43 merged with expected head SHA protection.
- [x] `main` re-fetched after merge; Seller Command Center and production-synchronized migration are present at merge commit `13ef5656ef725e286fd14205d75bbeb12da6783c`.
- [ ] Verify the public deployment separately before claiming the release is live to end users.
