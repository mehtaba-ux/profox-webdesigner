# Seller Command Center implementation references

## Required reading for Sales / CRM workflow changes

- Sales SOP system implementation specification: `docs/sales-sop-system-implementation-spec.md`
- Architecture / source of truth: `docs/seller-command-center-source-of-truth.md`
- UI icon policy: `docs/UI_ICON_POLICY.md`

The Sales SOP specification is the implementation standard for guided discovery, stage gates, package fit, escalation, proposal readiness, quotation snapshots, promises/assumptions/exclusions, next-action discipline, payment-controlled Won, and Sales-to-Delivery handoff behavior.

Developers must extend existing authoritative CRM/Sales systems rather than create parallel business records or hard-coded commercial truth.

## Existing implementation references

- QA: `docs/seller-command-center-qa.md`
- Canonical public catalog: `src/lib/publicSalesCatalogService.ts`
- Public pricing bridge: `src/pages/PricingCatalogPage.tsx`
- Seller dashboard data: `src/lib/sellerCommandCenterService.ts`
- Seller dashboard UI: `src/components/admin/SellerCommandCenter.tsx`
