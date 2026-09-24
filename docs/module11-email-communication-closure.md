# Application Roadmap Module 11 - Email & Communication Automation

## Brand standard
Customer-facing communication follows the ProFox Brand Messaging & Identity Bible v2.0. Email copy is clear, concise, human, specific and calm. Email subjects and bodies cannot contain emojis or em dashes. Generic hype, fake urgency and unverifiable claims are avoided.

## Human communication foundation
- Verified ProFox From address remains fixed for deliverability.
- A valid active ProFox owner can supply a human display name and same-domain Reply-To.
- External-domain or generic owners fall back to the company sender.
- Missing contact/company values receive natural fallbacks.
- Customer communication settings and timing are Admin-editable.
- Database and delivery-worker copy guards provide defense in depth.

## Customer lifecycle coverage
### Meetings
- confirmation
- reminder
- reschedule
- cancellation
- no-show rebooking

### Quotations
- quotation ready/sent
- validity reminder
- accepted acknowledgement
- rejected/closed acknowledgement

### Payments
- payment request
- due reminder
- overdue follow-up
- partial payment update
- verified payment confirmation
- refund update
- verification-pending suppression
- 12-hour grace window after material payment events

### Clients and projects
- client portal linked
- project start
- client design/project review required
- bounded review reminders
- approval recorded
- changes requested recorded
- launch stage
- handover
- completion
- pause/resume/cancellation

Recruitment, agreements, Academy and mock-call communication from earlier modules is preserved and passed the Module 11 brand audit.

## Reliability and authority
Business records remain canonical. Email is always an asynchronous consequence. Quotation acceptance, payment verification, project launch gates, client approvals and other protected state changes remain controlled by their existing secure database workflows.

## QA completed before CI
- quotation lifecycle and expiry dedupe
- payment lifecycle, verification-pending suppression, partial-balance reminders and dedupe
- client portal, project lifecycle, repeated review cycles, client approval and change-request paths
- native meeting confirmation/reminder/reschedule/cancel/no-show payloads
- human sender fallbacks and verified-domain Reply-To rules
- database copy guard for emoji and em dash
- no unresolved non-runtime customer placeholders in tested flows
- service-only helper privilege checks
- Admin communication settings access/domain validation
- production scheduler returns no currently due Module 11 customer communications
- zero QA customer-email residue

## Production runtime
- process-notification-outbox v2 ACTIVE
- Brevo remains the configured provider
- notification cron remains every 2 minutes
- customer communication scheduler is layered into the existing queue_due_sales_automations wrapper
