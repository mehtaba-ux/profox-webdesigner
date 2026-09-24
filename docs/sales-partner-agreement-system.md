# ProFox Sales Partner Agreement System

## Source of truth
- Legal/operational language: versioned `sales_agreement_templates` managed by Admin.
- Product names/prices: active `sales_products`.
- Commission rates/custom ranges: active `commission_rules`.
- Self-generated/performance bonuses and payout cadence: `commission_settings`.
- Company identity/contact values: `company_settings` plus notification sender fallback.
- Required onboarding count/modules: active required `training_modules`.

## Version rule
Admin edits affect future agreements. When an agreement is issued, the complete dynamic data and published template are snapshotted and hashed. Later Admin edits must never mutate an issued or verified agreement.

## Execution flow
Selected -> Agreement Pending -> issue frozen agreement + email secure token -> viewed -> partner acknowledges and draws signature -> Admin reviews/countersigns -> Verified -> applicant `agreement_status=signed` -> training account can be linked -> Sales Academy & Onboarding -> Final Approval -> Activated.

## Security
Raw signing tokens are never stored; only SHA-256 hashes are persisted. Anonymous signing is routed through a dedicated Edge Function using the service role. Browser roles cannot call the internal signing functions. Verified agreement snapshots/signatures/hashes are immutable. Direct applicant agreement-status edits are blocked by a database trigger.

## UX
Seller-facing agreement uses a simple white document, Navy headings, restrained Red accents, plain-language sections, a dedicated dynamic commercial schedule, required acknowledgements, typed-name confirmation and a pointer-based signature pad supporting mouse, touchscreen and stylus.
