# ProFox production launch runbook

## Automated release gate

Every push to `main` must pass TypeScript, migration integrity, Talent Partner regression tests, browser launch tests, public-content verification, dependency audit, and the Vite production build. A successful CI run triggers the production deployment workflow.

The deployment workflow applies checksum-verified Supabase migrations before building or deploying the Cloudflare Worker. It then checks Worker health, security headers, protected media behavior, the embedded Supabase configuration, and public launch routes.

Required GitHub `production` environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `SUPABASE_DB_URL`
- `SUPABASE_ACCESS_TOKEN`

Required GitHub `production` environment variable:

- `SUPABASE_PUBLISHABLE_KEY`

Never commit service-role keys, database URLs, OAuth secrets, provider secrets, or personal access tokens.

## Release commands

```sh
npm ci
npm run lint
npm run migrations:check
npm test
npm run test:e2e
npm run build
npm audit --omit=dev
```

With authorized production database access:

```sh
npm run migrations:apply
npm run production:verify
```

## Mandatory account onboarding

- Employees and sellers require an approved, active ProFox profile.
- Sellers cannot enter working routes until the existing Sales account setup is complete.
- Each salesperson connects their own Google Calendar during onboarding. Google credentials and calendar tokens remain server-side.
- Talent Partners must complete payout setup before referral links and work access become active.
- Synthetic `.test` identities are inactive in production, and production test-login activation is disabled at both UI and database boundaries.

## Payment and commission control

Only a live provider with stored server credentials, configured webhook verification, and a successful server test within the last 30 days can appear at checkout. The expected controlled flow is:

1. Customer payment is verified by provider/webhook evidence.
2. Commission becomes Earned.
3. An Administrator explicitly approves it.
4. Approved commission enters an eligible payout batch.
5. Partner identity, payout setup, hold period, and eligibility are checked.
6. PayPal payment is executed outside browser trust boundaries.
7. The PayPal transaction ID is recorded in ProFox.
8. The commission becomes Paid with an audit trail.

Do not create fake sellers, payments, commissions, or payout evidence in production.

## Media and document controls

- Public website media and profile images use the Cloudflare R2 Worker route.
- `documents/` objects require an active staff bearer token and return private, no-store responses.
- Uploads require active Worker authentication and retain uploader metadata.
- Blog and portfolio graphics must resolve to local static assets or Cloudflare R2; do not publish broken external placeholders.

## Operational review

Run `npm run production:verify` before launch and after material database changes. Zero failures are required. Adoption warnings can require a human account action—for example, a new salesperson connecting Google Calendar—but must not bypass mandatory onboarding.
