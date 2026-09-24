# Sales Partner Agreement launch QA

- Published template exists and is Admin-editable/versioned.
- Dynamic snapshot matches canonical sales products, commission rules/settings, company settings and required Academy modules.
- Issuing from Selected/Agreement Pending freezes data and sends secure token email.
- Raw token is never stored.
- Public view only works for active token.
- Partner must accept every acknowledgement, match legal name and draw a signature.
- Leaving unsigned token expired/rotated blocks old token.
- Partner signature queues candidate confirmation + Admin review notification.
- Direct `applicants.agreement_status` mutation is rejected.
- Admin countersignature is required before `agreement_status=signed`.
- Verified snapshots/signatures/hashes are immutable.
- Account linking remains blocked before verified agreement.
- Recruitment stage emails and Sales Academy gates remain intact.
- Edge Function, TypeScript check, production build, rollback lifecycle QA and post-merge verification must pass before closure.
